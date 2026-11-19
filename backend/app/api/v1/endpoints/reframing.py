import os
import uuid
from pathlib import Path
from datetime import datetime
from typing import Dict, Any, Optional, Tuple
from fastapi import APIRouter, HTTPException, BackgroundTasks, status

from app.core.config import settings
from app.core.logging import logger
from app.core.database import get_database
from app.models.reframe import (
    CropMode,
    ReframingAspectRatio,
    ReframePreviewRequest,
    ReframePreviewResponse,
    ReframeRenderRequest,
    ReframeRenderResponse
)
from app.services.ai.video_reframer import video_reframer

router = APIRouter()

async def _resolve_video_source(video_id: str, clip_id: Optional[str] = None) -> Tuple[str, float, float, Optional[Dict[str, Any]]]:
    """Resolves local file path and timestamps for video or clip."""
    db = get_database()
    clip_doc = None
    start_time = 0.0
    end_time = 0.0

    if clip_id:
        if db is not None:
            try:
                clip_doc = await db.clips.find_one({"id": clip_id})
            except Exception:
                pass
        if not clip_doc:
            from app.api.v1.endpoints.clips import _in_memory_clips_by_video
            clips_list = _in_memory_clips_by_video.get(video_id, [])
            for c in clips_list:
                if c.get("id") == clip_id:
                    clip_doc = c
                    break

        if clip_doc:
            start_time = float(clip_doc.get("start_time", 0.0))
            end_time = float(clip_doc.get("end_time", 0.0))

    # Resolve video source file
    video_doc = None
    if db is not None:
        try:
            video_doc = await db.videos.find_one({"id": video_id})
        except Exception:
            pass

    if not video_doc:
        from app.api.v1.endpoints.videos import _in_memory_videos
        video_doc = _in_memory_videos.get(video_id)

    if not video_doc or not video_doc.get("file_path"):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Video footage for {video_id} not found on server."
        )

    file_path = video_doc["file_path"]
    if not os.path.exists(file_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Video file missing on disk: {file_path}"
        )

    if end_time == 0.0:
        end_time = float(video_doc.get("duration", 0.0))

    return file_path, start_time, end_time, clip_doc

@router.post("/preview", response_model=ReframePreviewResponse)
async def preview_reframing(request: ReframePreviewRequest):
    """
    Analyzes video face tracking and returns crop framing keyframes for live preview.
    Gracefully falls back to Center Crop if no faces are detected.
    """
    source_path, default_start, default_end, clip_doc = await _resolve_video_source(
        request.video_id, request.clip_id
    )

    start_time = request.start_time if request.start_time > 0 else default_start
    end_time = request.end_time if request.end_time > start_time else default_end

    try:
        analysis = await video_reframer.analyze_reframing(
            video_path=source_path,
            start_time=start_time,
            end_time=end_time,
            aspect_ratio=request.target_aspect_ratio,
            mode=request.mode,
            manual_offset=request.manual_crop_offset
        )
    except Exception as e:
        logger.error(f"Reframing preview analysis failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Reframing analysis failed: {str(e)}"
        )

    # Resolve web video URL for preview
    video_url = None
    if clip_doc and clip_doc.get("video_url"):
        video_url = clip_doc["video_url"]
    else:
        video_filename = Path(source_path).name
        video_url = f"/uploads/{video_filename}"

    return ReframePreviewResponse(
        video_id=request.video_id,
        clip_id=request.clip_id,
        source_width=analysis["source_w"],
        source_height=analysis["source_h"],
        target_width=analysis["target_w"],
        target_height=analysis["target_h"],
        target_aspect_ratio=request.target_aspect_ratio.value,
        mode=request.mode,
        detection_status=analysis["detection_status"],
        faces_detected=analysis["faces_detected"],
        speaker_detected=analysis["speaker_detected"],
        total_faces_found=analysis["total_faces_found"],
        speaker_switches=analysis["speaker_switches"],
        fallback_reason=analysis["fallback_reason"],
        keyframes=analysis["keyframes"],
        static_crop=analysis["static_crop"],
        video_url=video_url
    )

@router.post("/render", response_model=ReframeRenderResponse)
async def render_reframing(request: ReframeRenderRequest):
    """
    Renders reframed video with smooth cinematic face tracking or centered fallback via FFmpeg.
    """
    source_path, default_start, default_end, clip_doc = await _resolve_video_source(
        request.video_id, request.clip_id
    )

    start_time = request.start_time if request.start_time > 0 else default_start
    end_time = request.end_time if request.end_time > start_time else default_end
    duration = max(0.5, round(end_time - start_time, 3))

    settings.GENERATED_CLIPS_DIR.mkdir(parents=True, exist_ok=True)
    settings.THUMBNAIL_DIR.mkdir(parents=True, exist_ok=True)

    job_id = f"reframe_{uuid.uuid4().hex[:10]}"
    target_slug = request.target_aspect_ratio.value.replace(":", "x")
    clip_tag = request.clip_id or request.video_id
    output_filename = f"{clip_tag}_reframe_{target_slug}.mp4"
    output_path = str(settings.GENERATED_CLIPS_DIR / output_filename)

    try:
        render_result = await video_reframer.render_reframed_video(
            input_video_path=source_path,
            output_video_path=output_path,
            start_time=start_time,
            end_time=end_time,
            aspect_ratio=request.target_aspect_ratio,
            mode=request.mode,
            manual_offset=request.manual_crop_offset
        )
    except Exception as e:
        logger.error(f"FFmpeg reframing render failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Reframing render failed: {str(e)}"
        )

    output_video_url = f"/generated-clips/{output_filename}"
    thumb_filename = f"{clip_tag}_reframe_{target_slug}.jpg"
    thumb_path = settings.THUMBNAIL_DIR / thumb_filename

    # Move or copy generated thumbnail
    gen_thumb = render_result.get("thumbnail_path")
    if gen_thumb and os.path.exists(gen_thumb) and str(gen_thumb) != str(thumb_path):
        import shutil
        shutil.copy2(gen_thumb, str(thumb_path))

    thumbnail_url = f"/uploads/thumbnails/{thumb_filename}"
    analysis = render_result.get("analysis", {})

    # Update MongoDB clip document if clip_id is present
    db = get_database()
    if db is not None and request.clip_id:
        try:
            await db.clips.update_one(
                {"id": request.clip_id},
                {"$set": {
                    "video_url": output_video_url,
                    "download_url": output_video_url,
                    "thumbnail_url": thumbnail_url,
                    "aspect_ratio": request.target_aspect_ratio.value,
                    "reframing_mode": request.mode.value,
                    "detection_status": analysis.get("detection_status"),
                    "updated_at": datetime.utcnow()
                }}
            )
        except Exception as e:
            logger.warning(f"MongoDB update reframed clip warning: {e}")

    return ReframeRenderResponse(
        job_id=job_id,
        video_id=request.video_id,
        clip_id=request.clip_id,
        status="completed",
        output_video_url=output_video_url,
        thumbnail_url=thumbnail_url,
        target_aspect_ratio=request.target_aspect_ratio.value,
        mode_used=request.mode,
        detection_status=analysis.get("detection_status", "completed"),
        duration=duration
    )
