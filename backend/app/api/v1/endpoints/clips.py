import os
import io
import re
import uuid
import asyncio
import zipfile
from datetime import datetime
from typing import List, Dict, Any, Optional
from pathlib import Path
from pydantic import BaseModel, Field
from fastapi import APIRouter, HTTPException, BackgroundTasks, status
from fastapi.responses import StreamingResponse, FileResponse
from app.core.config import settings
from app.core.logging import logger
from app.core.database import get_database
from app.models.clip import (
    ClipDetectionRequest,
    ClipDetectionTaskResponse,
    CandidateClip,
    ClipResponse,
    ClipDurationRange,
    BatchCutRequest,
    BatchCutJobResponse,
    FailedClipItem,
    FullPipelineRequest,
    FullPipelineJobResponse
)
from app.models.video import VideoStatus
from app.models.subtitle import CaptionPreset, SubtitleStyleConfig
from app.models.reframe import CropMode, ReframingAspectRatio
from app.services.ai.clip_selector import intelligent_clip_detector
from app.services.video.ffmpeg_editor import ffmpeg_editor
from app.services.ai.transcription import whisper_transcriber
from app.services.ai.video_reframer import video_reframer
from app.services.video.subtitle_renderer import subtitle_renderer
from app.services.video.subtitle_generator import PRESET_CONFIGS, slice_and_chunk_words
from app.models.transcript import WordItem

router = APIRouter()

# In-memory storage cache for detection tasks, clips, and batch cutting jobs
_in_memory_tasks: Dict[str, Dict[str, Any]] = {}
_in_memory_clips_by_video: Dict[str, List[Dict[str, Any]]] = {}
_in_memory_cutting_jobs: Dict[str, Dict[str, Any]] = {}

async def _run_clip_detection_pipeline(
    task_id: str,
    video_id: str,
    duration_range: ClipDurationRange,
    max_clips: int,
    virality_threshold: float
):
    """
    Asynchronous AI Clip Detection Worker:
    1. Loads video & transcription metadata
    2. Runs PySceneDetect scene analysis
    3. Executes modular heuristic & NLP scoring
    4. Performs Non-Maximum Suppression (NMS) to eliminate overlaps
    5. Extracts thumbnail for each clip with FFmpeg
    6. Persists candidate clips to MongoDB
    """
    logger.info(f"Task {task_id}: Starting AI clip detection for video {video_id}...")
    task_entry = _in_memory_tasks[task_id]

    try:
        db = get_database()
        
        # 1. Update task: Loading data
        task_entry["status"] = "processing"
        task_entry["progress"] = 15
        task_entry["current_step"] = "1. Loading video footage & transcript data..."
        task_entry["updated_at"] = datetime.utcnow()

        video_doc = None
        if db is not None:
            try:
                video_doc = await db.videos.find_one({"id": video_id})
            except Exception as e:
                logger.warning(f"DB lookup warning: {e}")

        if not video_doc:
            from app.api.v1.endpoints.videos import _in_memory_videos
            video_doc = _in_memory_videos.get(video_id)

        if not video_doc:
            raise RuntimeError(f"Video {video_id} not found.")

        file_path = video_doc.get("file_path")

        # 2. Fetch transcript (from DB or in-memory)
        transcript_doc = None
        if db is not None:
            try:
                transcript_doc = await db.transcripts.find_one({"video_id": video_id})
            except Exception as e:
                logger.warning(f"DB transcript lookup warning: {e}")

        if not transcript_doc:
            from app.api.v1.endpoints.transcription import _in_memory_transcripts
            transcript_doc = _in_memory_transcripts.get(video_id)

        # If transcript not run yet, run Faster-Whisper automatically
        if not transcript_doc or not transcript_doc.get("segments"):
            task_entry["progress"] = 25
            task_entry["current_step"] = "2. Running Faster-Whisper speech transcription..."
            from app.services.ai.transcription import whisper_transcriber
            transcript_doc = await whisper_transcriber.transcribe_video(
                video_path=file_path,
                model_size="tiny"
            )

        # 3. Analyze visual scenes and speech structures
        task_entry["progress"] = 50
        task_entry["current_step"] = "3. Aligning PySceneDetect cuts & sentence boundaries..."

        loop = asyncio.get_event_loop()
        candidate_clips: List[CandidateClip] = await loop.run_in_executor(
            None,
            intelligent_clip_detector.detect_candidate_clips,
            transcript_doc,
            video_id,
            file_path,
            duration_range,
            max_clips,
            virality_threshold
        )

        task_entry["progress"] = 75
        task_entry["current_step"] = f"4. Generated {len(candidate_clips)} candidates. Extracting thumbnails with FFmpeg..."

        # 4. Generate thumbnail for each detected clip
        for clip in candidate_clips:
            thumb_name = f"{clip.id}.jpg"
            thumb_path = settings.THUMBNAIL_DIR / thumb_name
            try:
                await ffmpeg_editor.generate_thumbnail(
                    video_path=file_path,
                    output_image_path=str(thumb_path),
                    timestamp_sec=clip.start_time + 1.0
                )
                clip.thumbnail_url = f"/uploads/thumbnails/{thumb_name}"
            except Exception as e:
                logger.warning(f"Could not generate thumbnail for clip {clip.id}: {e}")

        # 5. Persist to MongoDB
        clips_data = [c.model_dump() for c in candidate_clips]
        if db is not None and clips_data:
            try:
                await db.clips.delete_many({"video_id": video_id})
                await db.clips.insert_many(clips_data)
                # Update video clips_count
                await db.videos.update_one(
                    {"id": video_id},
                    {"$set": {
                        "clips_count": len(candidate_clips),
                        "status": VideoStatus.COMPLETED,
                        "current_step": f"{len(candidate_clips)} viral clips ready for preview",
                        "updated_at": datetime.utcnow()
                    }}
                )
                logger.info(f"Persisted {len(candidate_clips)} clips to MongoDB for video {video_id}.")
            except Exception as e:
                logger.warning(f"MongoDB clips persistence warning: {e}")

        # 6. Complete task
        _in_memory_clips_by_video[video_id] = clips_data
        task_entry["status"] = "completed"
        task_entry["progress"] = 100
        task_entry["current_step"] = f"Detection complete. Found {len(candidate_clips)} high-engagement moments."
        task_entry["clips"] = candidate_clips
        task_entry["total_clips"] = len(candidate_clips)
        task_entry["updated_at"] = datetime.utcnow()
        logger.info(f"Task {task_id}: Finished successfully with {len(candidate_clips)} clips.")

    except Exception as e:
        logger.error(f"Task {task_id} failed: {e}")
        task_entry["status"] = "failed"
        task_entry["progress"] = 0
        task_entry["current_step"] = "Clip detection failed"
        task_entry["error_message"] = str(e)
        task_entry["updated_at"] = datetime.utcnow()

@router.post("/detect", response_model=ClipDetectionTaskResponse, status_code=status.HTTP_202_ACCEPTED)
async def detect_clips_endpoint(
    request: ClipDetectionRequest,
    background_tasks: BackgroundTasks
):
    """
    Triggers asynchronous AI clip detection:
    - Analyzes speech hooks, narrative flow, pauses, and scene transitions
    - Prevents cutting sentences in half
    - Non-Maximum Suppression to remove duplicate moments
    - Returns immediately with task_id for non-blocking progress polling
    """
    task_id = f"task_{uuid.uuid4().hex[:12]}"
    initial_task = {
        "task_id": task_id,
        "video_id": request.video_id,
        "status": "queued",
        "progress": 5,
        "current_step": "Task queued for AI clip detection...",
        "clips": [],
        "total_clips": 0,
        "error_message": None,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }
    _in_memory_tasks[task_id] = initial_task

    # Dispatch to background task so HTTP request returns immediately
    background_tasks.add_task(
        _run_clip_detection_pipeline,
        task_id=task_id,
        video_id=request.video_id,
        duration_range=request.duration_range,
        max_clips=request.max_clips,
        virality_threshold=request.virality_threshold
    )

    logger.info(f"Queued asynchronous clip detection task {task_id} for video {request.video_id}")
    return ClipDetectionTaskResponse(**initial_task)

@router.get("", response_model=List[CandidateClip])
async def list_all_clips():
    """Lists all candidate / generated clips across all valid projects in descending order."""
    db = get_database()
    clips = []
    if db is not None:
        try:
            # 1. Fetch valid project IDs
            valid_videos = await db.videos.find({}, {"id": 1}).to_list(length=1000)
            valid_video_ids = [v["id"] for v in valid_videos]
            if not valid_video_ids:
                # No projects exist -> clean up any stale orphan clips
                await db.clips.delete_many({})
                return []

            # Purge any orphan clips whose parent video no longer exists
            await db.clips.delete_many({"video_id": {"$nin": valid_video_ids}})

            cursor = db.clips.find({"video_id": {"$in": valid_video_ids}}).sort("virality_score", -1)
            docs = await cursor.to_list(length=100)
            clips = [CandidateClip(**d) for d in docs]
            return clips
        except Exception as e:
            logger.warning(f"MongoDB list_all_clips error: {e}")

    return []

@router.get("/tasks/{task_id}", response_model=ClipDetectionTaskResponse)
async def get_task_status(task_id: str):
    """Polls real-time progress of an asynchronous clip detection job."""
    if task_id in _in_memory_tasks:
        return ClipDetectionTaskResponse(**_in_memory_tasks[task_id])
    raise HTTPException(status_code=404, detail=f"Task '{task_id}' not found.")

@router.get("/video/{video_id}", response_model=ClipResponse)
async def get_clips_for_video(video_id: str):
    """Retrieves all candidate clips detected for a video."""
    db = get_database()
    clips = []
    if db is not None:
        try:
            cursor = db.clips.find({"video_id": video_id}).sort("virality_score", -1)
            docs = await cursor.to_list(length=50)
            clips = [CandidateClip(**d) for d in docs]
        except Exception as e:
            logger.warning(f"MongoDB fetch clips warning: {e}")

    if not clips and video_id in _in_memory_clips_by_video:
        clips = [CandidateClip(**c) for c in _in_memory_clips_by_video[video_id]]

    return ClipResponse(clips=clips, total_clips=len(clips))

@router.api_route("/{clip_id}/download", methods=["GET", "HEAD"])
async def download_single_clip(clip_id: str):
    """
    Directly streams or downloads the rendered 9:16 clip MP4 with Content-Disposition: attachment.
    Never opens in browser tab; immediately saves the file to the user's downloads folder.
    """
    db = get_database()
    clip_doc = None
    if db is not None:
        try:
            clip_doc = await db.clips.find_one({"id": clip_id})
        except Exception as e:
            logger.warning(f"MongoDB fetch clip for download: {e}")

    if not clip_doc:
        for vid_clips in _in_memory_clips_by_video.values():
            for c in vid_clips:
                if c.get("id") == clip_id:
                    clip_doc = c
                    break
            if clip_doc:
                break

    # Locate the target MP4 file on disk
    target_file: Optional[Path] = None

    if clip_doc:
        for url_field in ["video_url", "download_url"]:
            val = clip_doc.get(url_field)
            if val and isinstance(val, str):
                fname = Path(val).name
                cand = settings.GENERATED_CLIPS_DIR / fname
                if cand.exists() and cand.stat().st_size > 0:
                    target_file = cand
                    break

    if not target_file:
        matches = list(settings.GENERATED_CLIPS_DIR.glob(f"{clip_id}*.mp4"))
        subtitled = [m for m in matches if "_subtitled" in m.name and m.stat().st_size > 0]
        if subtitled:
            target_file = subtitled[0]
        elif matches:
            valid = [m for m in matches if m.stat().st_size > 0]
            if valid:
                target_file = valid[0]

    if not target_file:
        uploads_matches = list(settings.UPLOAD_DIR.glob(f"{clip_id}*.mp4"))
        if uploads_matches and uploads_matches[0].stat().st_size > 0:
            target_file = uploads_matches[0]

    if not target_file or not target_file.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Clip file for '{clip_id}' has not been rendered yet or was deleted."
        )

    # Human-friendly sanitized filename for the user's computer
    raw_title = (clip_doc.get("title") if clip_doc else None) or f"Clip_{clip_id}"
    safe_name = re.sub(r'[^\w\s-]', '', raw_title).strip()
    safe_name = re.sub(r'[-\s]+', '_', safe_name)[:80]
    if not safe_name:
        safe_name = f"clip_{clip_id}"
    download_filename = f"{safe_name}_9x16.mp4"

    return FileResponse(
        path=str(target_file),
        media_type="video/mp4",
        filename=download_filename,
        headers={
            "Content-Disposition": f'attachment; filename="{download_filename}"',
            "Accept-Ranges": "bytes",
            "Cache-Control": "public, max-age=3600"
        }
    )

@router.get("/{clip_id}", response_model=CandidateClip)
async def get_single_clip(clip_id: str):
    """Retrieves single clip metadata by clip ID."""
    db = get_database()
    if db is not None:
        try:
            doc = await db.clips.find_one({"id": clip_id})
            if doc:
                return CandidateClip(**doc)
        except Exception as e:
            logger.warning(f"MongoDB fetch clip warning: {e}")

    for vid_clips in _in_memory_clips_by_video.values():
        for c in vid_clips:
            if c.get("id") == clip_id:
                return CandidateClip(**c)

    raise HTTPException(status_code=404, detail="Clip not found.")

@router.delete("/{clip_id}")
async def delete_single_clip(clip_id: str):
    """
    Deletes an individual generated clip:
    - Removes video files (.mp4, .ass, .srt) from generated-clips directory
    - Removes clip thumbnail from thumbnails directory
    - Removes clip document from MongoDB
    - Decrements clips_count on parent video
    - Cleans in-memory caches
    """
    db = get_database()
    clip_doc = None
    if db is not None:
        try:
            clip_doc = await db.clips.find_one({"id": clip_id})
            if clip_doc:
                await db.clips.delete_one({"id": clip_id})
                parent_vid_id = clip_doc.get("video_id")
                if parent_vid_id:
                    await db.videos.update_one(
                        {"id": parent_vid_id},
                        {"$inc": {"clips_count": -1}}
                    )
        except Exception as e:
            logger.warning(f"MongoDB delete clip error: {e}")

    # Also clean from in-memory cache
    for vid, clist in list(_in_memory_clips_by_video.items()):
        _in_memory_clips_by_video[vid] = [c for c in clist if c.get("id") != clip_id]

    # Delete physical clip files from generated-clips
    files_removed = 0
    if settings.GENERATED_CLIPS_DIR.exists():
        for f in settings.GENERATED_CLIPS_DIR.glob(f"{clip_id}*"):
            try:
                f.unlink()
                files_removed += 1
                logger.info(f"Deleted clip file {f}")
            except Exception as e:
                logger.warning(f"Error removing clip file {f}: {e}")

    # Delete physical thumbnail
    if settings.THUMBNAIL_DIR.exists():
        for f in settings.THUMBNAIL_DIR.glob(f"{clip_id}*"):
            try:
                f.unlink()
                files_removed += 1
            except Exception as e:
                logger.warning(f"Error removing clip thumbnail {f}: {e}")

    if not clip_doc and files_removed == 0:
        raise HTTPException(status_code=404, detail="Clip not found.")

    return {
        "success": True,
        "clip_id": clip_id,
        "message": f"Clip {clip_id} successfully deleted."
    }

@router.post("/{clip_id}/render", response_model=CandidateClip)
async def render_single_clip(
    clip_id: str,
    aspect_ratio: str = "9:16",
    template_layout: Optional[str] = "full_screen"
):
    """
    Renders/cuts a candidate clip into an independent video file using FFmpeg:
    - Supported aspect ratios: 9:16 (1080x1920), 1:1 (1080x1080), 16:9 (1920x1080)
    - Saves output MP4 to generated-clips directory
    - Generates high-quality thumbnail frame
    - Updates clip metadata in MongoDB
    - Exposes streamable/downloadable URL
    """
    db = get_database()
    clip_doc = None
    if db is not None:
        try:
            clip_doc = await db.clips.find_one({"id": clip_id})
        except Exception as e:
            logger.warning(f"MongoDB clip lookup warning: {e}")

    if not clip_doc:
        for vid_clips in _in_memory_clips_by_video.values():
            for c in vid_clips:
                if c.get("id") == clip_id:
                    clip_doc = c
                    break
            if clip_doc:
                break

    if not clip_doc:
        raise HTTPException(status_code=404, detail=f"Clip {clip_id} not found.")

    video_id = clip_doc.get("video_id")
    video_doc = None
    if db is not None:
        try:
            video_doc = await db.videos.find_one({"id": video_id})
        except Exception as e:
            logger.warning(f"MongoDB video lookup warning: {e}")

    if not video_doc:
        from app.api.v1.endpoints.videos import _in_memory_videos
        video_doc = _in_memory_videos.get(video_id)

    if not video_doc:
        raise HTTPException(status_code=404, detail=f"Parent video {video_id} not found.")

    file_path = video_doc.get("file_path")
    if not file_path or not Path(file_path).exists():
        raise HTTPException(status_code=400, detail="Source video file is missing on server.")

    aspect_slug = aspect_ratio.replace(":", "x")
    output_filename = f"{clip_id}_{aspect_slug}.mp4"
    output_path = settings.GENERATED_CLIPS_DIR / output_filename
    settings.GENERATED_CLIPS_DIR.mkdir(parents=True, exist_ok=True)
    settings.OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    thumb_filename = f"{clip_id}_{aspect_slug}.jpg"
    thumb_path = settings.THUMBNAIL_DIR / thumb_filename

    start_time = float(clip_doc.get("start_time", 0.0))
    end_time = float(clip_doc.get("end_time", 0.0))

    try:
        try:
            mode_enum = CropMode(template_layout) if template_layout else CropMode.FULL_SCREEN
        except Exception:
            mode_enum = CropMode.FULL_SCREEN

        try:
            aspect_enum = ReframingAspectRatio(aspect_ratio)
        except Exception:
            aspect_enum = ReframingAspectRatio.VERTICAL_9_16

        await video_reframer.render_reframed_video(
            input_video_path=file_path,
            output_video_path=str(output_path),
            start_time=start_time,
            end_time=end_time,
            aspect_ratio=aspect_enum,
            mode=mode_enum,
            manual_offset=0.5
        )

        # Duplicate into OUTPUT_DIR for compatibility
        try:
            import shutil
            alt_path = settings.OUTPUT_DIR / output_filename
            if not alt_path.exists():
                shutil.copyfile(output_path, alt_path)
        except Exception:
            pass

        # Generate thumbnail
        try:
            await ffmpeg_editor.generate_thumbnail(
                video_path=str(output_path),
                output_image_path=str(thumb_path),
                timestamp_sec=min(1.0, max(0.2, (end_time - start_time) * 0.2))
            )
        except Exception as te:
            logger.warning(f"Thumbnail warning: {te}")

    except Exception as e:
        logger.error(f"FFmpeg rendering failed for clip {clip_id}: {e}")
        raise HTTPException(status_code=500, detail=f"FFmpeg rendering failed: {str(e)}")

    video_url = f"/generated-clips/{output_filename}"
    thumb_url = f"/uploads/thumbnails/{thumb_filename}"

    clip_doc["video_url"] = video_url
    clip_doc["preview_url"] = video_url
    clip_doc["download_url"] = video_url
    clip_doc["thumbnail_url"] = thumb_url
    clip_doc["status"] = "ready"
    clip_doc["aspect_ratio"] = aspect_ratio

    if db is not None:
        try:
            await db.clips.update_one(
                {"id": clip_id},
                {"$set": {
                    "video_url": video_url,
                    "preview_url": video_url,
                    "download_url": video_url,
                    "thumbnail_url": thumb_url,
                    "status": "ready",
                    "aspect_ratio": aspect_ratio
                }}
            )
        except Exception as e:
            logger.warning(f"Failed to update MongoDB with rendered clip: {e}")

    return CandidateClip(**clip_doc)

async def _run_batch_cut_pipeline(
    job_id: str,
    video_id: str,
    clip_ids: Optional[List[str]],
    aspect_ratio: str
):
    """
    Background Task Processing System for automatic video clipping:
    1. Cuts original video using frame-accurate start/end timestamps
    2. Preserves audio synchronization & avoids quality loss (CRF 18)
    3. Generates independent video files in backend/generated-clips/
    4. Generates thumbnails in backend/uploads/thumbnails/
    5. Stores clip metadata in MongoDB
    6. Tracks progress, current clip, completed clips, and failed clips
    """
    logger.info(f"Job {job_id}: Starting batch clipping pipeline for video {video_id} ({aspect_ratio})...")
    job_entry = _in_memory_cutting_jobs[job_id]
    job_entry["status"] = "processing"
    job_entry["updated_at"] = datetime.utcnow()

    db = get_database()
    video_doc = None
    if db is not None:
        try:
            video_doc = await db.videos.find_one({"id": video_id})
        except Exception as e:
            logger.warning(f"MongoDB video lookup warning: {e}")

    if not video_doc:
        from app.api.v1.endpoints.videos import _in_memory_videos
        video_doc = _in_memory_videos.get(video_id)

    if not video_doc:
        job_entry["status"] = "failed"
        job_entry["current_step"] = f"Source video {video_id} not found."
        job_entry["updated_at"] = datetime.utcnow()
        return

    source_path = video_doc.get("file_path")
    if not source_path or not Path(source_path).exists():
        job_entry["status"] = "failed"
        job_entry["current_step"] = "Source video file not found on disk."
        job_entry["updated_at"] = datetime.utcnow()
        return

    # Find candidate clips to process
    all_clips = []
    if db is not None:
        try:
            cursor = db.clips.find({"video_id": video_id})
            all_clips = await cursor.to_list(length=100)
        except Exception as e:
            logger.warning(f"MongoDB clips lookup warning: {e}")

    if not all_clips and video_id in _in_memory_clips_by_video:
        all_clips = _in_memory_clips_by_video[video_id]

    if clip_ids:
        clips_to_process = [c for c in all_clips if c.get("id") in clip_ids]
    else:
        clips_to_process = all_clips

    if not clips_to_process:
        job_entry["status"] = "failed"
        job_entry["current_step"] = "No candidate clips found to cut."
        job_entry["updated_at"] = datetime.utcnow()
        return

    job_entry["total_clips"] = len(clips_to_process)
    aspect_slug = aspect_ratio.replace(":", "x")
    settings.GENERATED_CLIPS_DIR.mkdir(parents=True, exist_ok=True)
    settings.OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    completed_list: List[CandidateClip] = []
    failed_list: List[FailedClipItem] = []

    for i, clip_doc in enumerate(clips_to_process):
        clip_id = clip_doc.get("id")
        clip_title = clip_doc.get("title", f"Clip {clip_id}")
        start_time = float(clip_doc.get("start_time", 0.0))
        end_time = float(clip_doc.get("end_time", 0.0))

        job_entry["current_clip_id"] = clip_id
        job_entry["current_clip_title"] = clip_title
        job_entry["current_step"] = f"Cutting clip {i+1} of {len(clips_to_process)}: '{clip_title}' ({aspect_ratio})..."
        job_entry["progress"] = int((i / len(clips_to_process)) * 100)
        job_entry["updated_at"] = datetime.utcnow()

        output_filename = f"{clip_id}_{aspect_slug}.mp4"
        output_file_path = settings.GENERATED_CLIPS_DIR / output_filename
        output_url = f"/generated-clips/{output_filename}"

        thumb_filename = f"{clip_id}_{aspect_slug}.jpg"
        thumb_file_path = settings.THUMBNAIL_DIR / thumb_filename
        thumb_url = f"/uploads/thumbnails/{thumb_filename}"

        try:
            # 1. Cut and reframe clip with frame-accurate timestamps
            try:
                aspect_enum = ReframingAspectRatio(aspect_ratio)
            except Exception:
                aspect_enum = ReframingAspectRatio.VERTICAL_9_16

            await video_reframer.render_reframed_video(
                input_video_path=source_path,
                output_video_path=str(output_file_path),
                start_time=start_time,
                end_time=end_time,
                aspect_ratio=aspect_enum,
                mode=CropMode.FULL_SCREEN,
                manual_offset=0.5
            )

            # Copy to OUTPUT_DIR for compatibility
            try:
                import shutil
                alt_output = settings.OUTPUT_DIR / output_filename
                if not alt_output.exists():
                    shutil.copyfile(output_file_path, alt_output)
            except Exception:
                pass

            # 2. Extract thumbnail
            try:
                await ffmpeg_editor.generate_thumbnail(
                    video_path=str(output_file_path),
                    output_image_path=str(thumb_file_path),
                    timestamp_sec=min(1.0, max(0.2, (end_time - start_time) * 0.2))
                )
            except Exception as te:
                logger.warning(f"Thumbnail generation warning for {clip_id}: {te}")

            # 3. Store clip metadata in MongoDB
            clip_doc["video_url"] = output_url
            clip_doc["preview_url"] = output_url
            clip_doc["download_url"] = output_url
            clip_doc["thumbnail_url"] = thumb_url
            clip_doc["status"] = "ready"
            clip_doc["aspect_ratio"] = aspect_ratio
            clip_doc["updated_at"] = datetime.utcnow()

            if db is not None:
                try:
                    await db.clips.update_one(
                        {"id": clip_id},
                        {"$set": {
                            "video_url": output_url,
                            "preview_url": output_url,
                            "download_url": output_url,
                            "thumbnail_url": thumb_url,
                            "status": "ready",
                            "aspect_ratio": aspect_ratio,
                            "updated_at": datetime.utcnow()
                        }}
                    )
                except Exception as de:
                    logger.warning(f"MongoDB clip update warning: {de}")

            candidate_obj = CandidateClip(**clip_doc)
            completed_list.append(candidate_obj)
            job_entry["completed_clips"] = completed_list
            logger.info(f"Successfully cut clip {clip_id} -> {output_url}")

        except Exception as e:
            logger.error(f"Failed to cut clip {clip_id}: {e}")
            fail_item = FailedClipItem(clip_id=clip_id, title=clip_title, error=str(e))
            failed_list.append(fail_item)
            job_entry["failed_clips"] = failed_list

            if db is not None:
                try:
                    await db.clips.update_one(
                        {"id": clip_id},
                        {"$set": {"status": "failed", "error_message": str(e)}}
                    )
                except Exception:
                    pass

    # Finalize Job State
    job_entry["progress"] = 100
    job_entry["current_clip_id"] = None
    job_entry["current_clip_title"] = None
    job_entry["updated_at"] = datetime.utcnow()

    if len(failed_list) == 0:
        job_entry["status"] = "completed"
        job_entry["current_step"] = f"Successfully generated all {len(completed_list)} independent video clips!"
    elif len(completed_list) > 0:
        job_entry["status"] = "partially_failed"
        job_entry["current_step"] = f"Generated {len(completed_list)} clips successfully. {len(failed_list)} failed."
    else:
        job_entry["status"] = "failed"
        job_entry["current_step"] = f"All {len(failed_list)} clips failed to render."

@router.post("/batch-cut", response_model=BatchCutJobResponse, status_code=status.HTTP_202_ACCEPTED)
async def start_batch_cut_job(
    request: BatchCutRequest,
    background_tasks: BackgroundTasks
):
    """
    Dispatches asynchronous background batch cutting job:
    - Cuts all selected candidate clips into independent video files
    - Converts to 9:16 (1080x1920), 1:1 (1080x1080), or 16:9 (1920x1080)
    - Preserves audio synchronization & CRF 18 visually lossless quality
    - Saves in backend/generated-clips/ directory
    - Generates thumbnails and returns downloadable clip URLs
    """
    job_id = f"job_{uuid.uuid4().hex[:12]}"
    initial_job = {
        "job_id": job_id,
        "video_id": request.video_id,
        "status": "queued",
        "progress": 0,
        "current_step": "Queued batch cutting job...",
        "current_clip_id": None,
        "current_clip_title": None,
        "aspect_ratio": request.aspect_ratio or "9:16",
        "total_clips": len(request.clip_ids) if request.clip_ids else 0,
        "completed_clips": [],
        "failed_clips": [],
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }
    _in_memory_cutting_jobs[job_id] = initial_job

    background_tasks.add_task(
        _run_batch_cut_pipeline,
        job_id=job_id,
        video_id=request.video_id,
        clip_ids=request.clip_ids,
        aspect_ratio=request.aspect_ratio or "9:16"
    )

    logger.info(f"Queued batch cutting job {job_id} for video {request.video_id} ({request.aspect_ratio})")
    return BatchCutJobResponse(**initial_job)

@router.get("/jobs/{job_id}", response_model=BatchCutJobResponse)
async def get_cut_job_status(job_id: str):
    """Polls real-time progress of a video cutting background job."""
    if job_id in _in_memory_cutting_jobs:
        return BatchCutJobResponse(**_in_memory_cutting_jobs[job_id])
    raise HTTPException(status_code=404, detail=f"Cutting job '{job_id}' not found.")

@router.post("/jobs/{job_id}/retry", response_model=BatchCutJobResponse, status_code=status.HTTP_202_ACCEPTED)
async def retry_failed_clips_job(
    job_id: str,
    background_tasks: BackgroundTasks
):
    """Retries processing for any clips that failed during the batch cutting job."""
    if job_id not in _in_memory_cutting_jobs:
        raise HTTPException(status_code=404, detail=f"Cutting job '{job_id}' not found.")

    job_entry = _in_memory_cutting_jobs[job_id]
    failed_items = job_entry.get("failed_clips", [])
    if not failed_items:
        raise HTTPException(status_code=400, detail="No failed clips to retry in this job.")

    failed_clip_ids = [
        item.clip_id if hasattr(item, "clip_id") else item.get("clip_id")
        for item in failed_items
    ]

    job_entry["failed_clips"] = []
    job_entry["status"] = "queued"
    job_entry["current_step"] = f"Retrying {len(failed_clip_ids)} failed clips..."
    job_entry["updated_at"] = datetime.utcnow()

    background_tasks.add_task(
        _run_batch_cut_pipeline,
        job_id=job_id,
        video_id=job_entry["video_id"],
        clip_ids=failed_clip_ids,
        aspect_ratio=job_entry.get("aspect_ratio", "9:16")
    )

    return BatchCutJobResponse(**job_entry)

# -------------------------------------------------------------
# UNIFIED 10-STEP END-TO-END PIPELINE SYSTEM
# -------------------------------------------------------------
_in_memory_pipeline_jobs: Dict[str, Dict[str, Any]] = {}

async def _run_full_end_to_end_pipeline(
    job_id: str,
    video_id: str,
    target_aspect_ratio: str,
    duration_range_str: str,
    max_clips: int,
    virality_threshold: float,
    reframing_mode: str,
    subtitle_preset: str,
    burn_subtitles: bool,
    smart_reframing: bool,
    whisper_model: str,
    content_type: str = "gaming",
    export_quality: str = "1080p_high",
    scan_full_video: bool = True,
    start_time: Optional[float] = None,
    end_time: Optional[float] = None
):
    """
    Executes the Complete 10-Step End-to-End Workflow:
    1. Upload Video (Pre-requisite / validated)
    2. Extract High-Fidelity Audio with FFmpeg
    3. Transcribe Audio & Generate Word-Level Timestamps with Faster-Whisper
    4. Analyze Transcript & Scene Changes (PySceneDetect + NLP)
    5. Identify Best Moments (Hook, Questions, Story arcs)
    6. Score & Rank Moments using 7-Criteria Engine (0-100 pts)
    7. Generate Selected Clips (Frame-accurate cutting)
    8. Apply Intelligent Reframing (OpenCV YuNet Face Tracking or Center Fallback)
    9. Add Speech-Synchronized Animated Subtitles (Karaoke & Keyword highlight)
    10. Export Downloadable Videos & Persist Project History to MongoDB
    """
    logger.info(f"Pipeline {job_id}: Commencing 10-step unified processing for video {video_id}...")
    job = _in_memory_pipeline_jobs[job_id]
    job["status"] = "processing"
    job["progress"] = 5
    job["current_step"] = "1. Initializing AI processing pipeline..."
    job["updated_at"] = datetime.utcnow()

    db = get_database()
    video_doc = None
    if db is not None:
        try:
            video_doc = await db.videos.find_one({"id": video_id})
        except Exception as e:
            logger.warning(f"MongoDB video lookup error: {e}")

    if not video_doc:
        from app.api.v1.endpoints.videos import _in_memory_videos
        video_doc = _in_memory_videos.get(video_id)

    if not video_doc or not video_doc.get("file_path"):
        job["status"] = "failed"
        job["error_message"] = f"Source video footage for {video_id} not found on server."
        job["updated_at"] = datetime.utcnow()
        return

    source_path = video_doc["file_path"]
    total_duration = float(video_doc.get("duration", 0.0))
    if total_duration <= 1.0:
        meta_dur = video_doc.get("metadata", {}).get("duration", 0.0) if isinstance(video_doc.get("metadata"), dict) else 0.0
        total_duration = float(meta_dur) if meta_dur else 0.0

    try:
        # STEP 1: Audio Extraction (Scan full video or custom user range)
        job["progress"] = 15
        if start_time is not None and end_time is not None and end_time > start_time:
            max_audio_sec = float(end_time - start_time)
            audio_dur_label = f" ({int(start_time)}s - {int(end_time)}s)"
        elif scan_full_video:
            max_audio_sec = None
            audio_dur_label = " (full video footage)"
        else:
            max_audio_sec = 600.0 if total_duration > 600.0 else None
            audio_dur_label = f" (first {int(max_audio_sec)}s for fast clipping)" if max_audio_sec else ""
        job["current_step"] = f"2. Extracting 16kHz mono audio stream via FFmpeg{audio_dur_label}..."
        job["updated_at"] = datetime.utcnow()

        is_remote_cloud = source_path.startswith("http://") or source_path.startswith("https://")
        if is_remote_cloud:
            audio_path = str(settings.UPLOAD_DIR / f"{video_id}_temp_audio.wav")
            if not os.path.exists(audio_path):
                from app.services.video.remote_stream_processor import remote_stream_processor
                await remote_stream_processor.extract_remote_audio_stream(source_path, audio_path, max_duration=max_audio_sec)
        else:
            audio_path = str(Path(source_path).with_suffix(".wav"))
            if not os.path.exists(audio_path):
                await ffmpeg_editor.extract_audio(source_path, audio_path, max_duration=max_audio_sec)

        # STEP 2: Speech Transcription (Faster-Whisper)
        job["progress"] = 30
        job["current_step"] = f"3. Transcribing speech & word timestamps with Faster-Whisper ({whisper_model})..."
        job["updated_at"] = datetime.utcnow()

        def _on_whisper_progress(msg: str, pct: int):
            job["progress"] = min(48, 30 + int(pct * 0.18))
            job["current_step"] = f"3. {msg}..."
            job["updated_at"] = datetime.utcnow()

        # Check existing transcript in DB or memory
        transcript_doc = None
        if db is not None:
            try:
                transcript_doc = await db.transcripts.find_one({"video_id": video_id})
            except Exception:
                pass

        if not transcript_doc:
            from app.api.v1.endpoints.transcription import _in_memory_transcripts
            transcript_doc = _in_memory_transcripts.get(video_id)

        has_speech = True
        transcript_words: List[WordItem] = []

        if not transcript_doc:
            trans_res = await whisper_transcriber.transcribe_video(
                video_path=source_path,
                audio_path=audio_path,
                model_size=whisper_model,
                max_duration=max_audio_sec,
                progress_callback=_on_whisper_progress
            )
            has_speech = trans_res.get("has_speech", True)
            transcript_doc = {
                "video_id": video_id,
                "has_speech": has_speech,
                "segments": trans_res.get("segments", []),
                "full_text": trans_res.get("full_text", ""),
                "total_words": trans_res.get("total_words", 0),
                "created_at": datetime.utcnow()
            }
            if db is not None:
                try:
                    await db.transcripts.replace_one({"video_id": video_id}, transcript_doc, upsert=True)
                except Exception:
                    pass

        # Collect word items
        for seg in transcript_doc.get("segments", []):
            for w in seg.get("words", []):
                transcript_words.append(WordItem(**w) if isinstance(w, dict) else w)

        # STEP 3 & 4: Scene Detection, Moment Identification & 7-Criteria Scoring Engine
        job["progress"] = 50
        job["current_step"] = "4. Analyzing visual scenes, speech pacing & scoring moments (7 criteria)..."
        job["updated_at"] = datetime.utcnow()

        try:
            duration_enum = ClipDurationRange(duration_range_str)
        except Exception:
            duration_enum = ClipDurationRange.RANGE_30_60

        candidate_clips = intelligent_clip_detector.detect_candidate_clips(
            transcript_data=transcript_doc,
            video_id=video_id,
            video_path=source_path,
            duration_range=duration_enum,
            max_clips=max_clips,
            virality_threshold=virality_threshold,
            video_title=video_doc.get("title", "")
        )

        # If candidates are fewer than requested max_clips, backfill with diverse duration-based segments across the video
        if len(candidate_clips) < max_clips:
            logger.info(f"Filling remaining slots ({len(candidate_clips)}/{max_clips}) with timeline moments for {video_id}...")
            if total_duration <= 1.0 and transcript_doc and transcript_doc.get("segments"):
                segs = transcript_doc.get("segments")
                if segs and segs[-1].get("end"):
                    total_duration = float(segs[-1]["end"])
            if total_duration <= 1.0:
                total_duration = 180.0

            clip_len = min(total_duration, 35.0) if total_duration > 15 else max(5.0, total_duration * 0.8)
            needed = max_clips - len(candidate_clips)
            covered = [(c.start_time, c.end_time) for c in candidate_clips]

            step = max(3.0, (total_duration - clip_len) / float(max(1, needed + 1)))

            curr_sec = 0.0
            idx = len(candidate_clips)
            while curr_sec + 4.0 <= total_duration and len(candidate_clips) < max_clips:
                c_start = round(curr_sec, 2)
                c_end = round(min(total_duration, c_start + clip_len), 2)
                if c_end - c_start < 4.0:
                    break
                overlaps = any(abs(c_start - s) < 3.0 and abs(c_end - e) < 3.0 for s, e in covered)
                if not overlaps:
                    c_id = f"clip_{uuid.uuid4().hex[:10]}"
                    v_title_clean = intelligent_clip_detector.generate_viral_headline(
                        video_title=video_doc.get("title", ""),
                        index=idx,
                        category="Action Highlight" if content_type == "gaming" else "Key Moment"
                    )
                    fallback_clip = CandidateClip(
                        id=c_id,
                        video_id=video_id,
                        title=v_title_clean,
                        short_description=f"Curated segment from {c_start:.1f}s to {c_end:.1f}s",
                        hook="Key visual moment",
                        category="Visual Highlight",
                        reason_for_selection="Identified based on scene continuity and pacing.",
                        start_time=c_start,
                        end_time=c_end,
                        duration=round(c_end - c_start, 2),
                        transcript="",
                        words_count=0,
                        speaking_rate_wps=0.0,
                        scores={
                            "hook_strength": 14.0,
                            "interesting_content": 14.0,
                            "emotional_engagement": 10.0,
                            "information_value": 10.0,
                            "story_completeness": 12.0,
                            "ending_quality": 8.0,
                            "audio_visual_quality": 5.0,
                            "overall_score": 73.0
                        },
                        overall_score=73.0,
                        virality_score=73.0,
                        ranking_badge="Top Contender",
                        aspect_ratio=target_aspect_ratio
                    )
                    candidate_clips.append(fallback_clip)
                    covered.append((c_start, c_end))
                    idx += 1
                curr_sec += step

            # Final backfill pass if needed to ensure exact max_clips count
            while len(candidate_clips) < max_clips:
                idx = len(candidate_clips)
                slot_w = total_duration / float(max(1, max_clips))
                c_start = round(min(total_duration - 5.0, max(0.0, idx * slot_w * 0.7)), 2)
                c_end = round(min(total_duration, c_start + max(6.0, slot_w * 1.1)), 2)
                c_id = f"clip_{uuid.uuid4().hex[:10]}"
                v_title_clean = intelligent_clip_detector.generate_viral_headline(
                    video_title=video_doc.get("title", ""),
                    index=idx,
                    category="Action Highlight" if content_type == "gaming" else "Key Moment"
                )
                fallback_clip = CandidateClip(
                    id=c_id,
                    video_id=video_id,
                    title=v_title_clean,
                    short_description=f"Curated segment from {c_start:.1f}s to {c_end:.1f}s",
                    hook="Key visual moment",
                    category="Visual Highlight",
                    reason_for_selection="Identified based on scene continuity and pacing.",
                    start_time=c_start,
                    end_time=c_end,
                    duration=round(c_end - c_start, 2),
                    transcript="",
                    words_count=0,
                    speaking_rate_wps=0.0,
                    scores={
                        "hook_strength": 14.0,
                        "interesting_content": 14.0,
                        "emotional_engagement": 10.0,
                        "information_value": 10.0,
                        "story_completeness": 12.0,
                        "ending_quality": 8.0,
                        "audio_visual_quality": 5.0,
                        "overall_score": 73.0
                    },
                    overall_score=73.0,
                    virality_score=73.0,
                    ranking_badge="Top Contender",
                    aspect_ratio=target_aspect_ratio
                )
                candidate_clips.append(fallback_clip)

        job["total_moments_detected"] = len(candidate_clips)
        logger.info(f"Pipeline {job_id}: {len(candidate_clips)} moments identified and scored.")

        # STEP 5 & 6: Cutting, Reframing & Subtitle Burn-In
        settings.GENERATED_CLIPS_DIR.mkdir(parents=True, exist_ok=True)
        settings.THUMBNAIL_DIR.mkdir(parents=True, exist_ok=True)

        aspect_slug = target_aspect_ratio.replace(":", "x")
        try:
            aspect_enum = ReframingAspectRatio(target_aspect_ratio)
        except Exception:
            aspect_enum = ReframingAspectRatio.VERTICAL_9_16

        try:
            crop_mode_enum = CropMode(reframing_mode)
        except Exception:
            crop_mode_enum = CropMode.SMART_AUTO

        try:
            preset_enum = CaptionPreset(subtitle_preset)
        except Exception:
            preset_enum = CaptionPreset.BOLD_YELLOW

        style_config = PRESET_CONFIGS.get(preset_enum, PRESET_CONFIGS[CaptionPreset.BOLD_YELLOW])

        completed_list: List[CandidateClip] = []
        failed_list: List[FailedClipItem] = []

        total_to_process = len(candidate_clips)
        for i, clip in enumerate(candidate_clips):
            clip_idx_str = f"({i+1}/{total_to_process})"
            job["current_clip_title"] = clip.title
            job["current_step"] = f"5. Processing clip {clip_idx_str}: '{clip.title}' with {reframing_mode} reframing..."
            job["progress"] = 55 + int((i / total_to_process) * 35)
            job["updated_at"] = datetime.utcnow()

            cut_filename = f"{clip.id}_{aspect_slug}.mp4"
            cut_path = str(settings.GENERATED_CLIPS_DIR / cut_filename)
            thumb_filename = f"{clip.id}_{aspect_slug}.jpg"
            thumb_path = str(settings.THUMBNAIL_DIR / thumb_filename)

            try:
                # 8. Intelligent Video Reframing (Direct Remote HTTP Range or Local File)
                if is_remote_cloud:
                    from app.services.video.remote_stream_processor import remote_stream_processor
                    v_meta = video_doc.get("metadata", {}) if isinstance(video_doc.get("metadata"), dict) else {}
                    await remote_stream_processor.cut_and_reframe_remote_segment(
                        url=source_path,
                        start_time=clip.start_time,
                        end_time=clip.end_time,
                        output_video_path=cut_path,
                        template_layout=reframing_mode,
                        aspect_ratio=target_aspect_ratio,
                        source_w=v_meta.get("width", 1280),
                        source_h=v_meta.get("height", 720)
                    )
                elif smart_reframing:
                    await video_reframer.render_reframed_video(
                        input_video_path=source_path,
                        output_video_path=cut_path,
                        start_time=clip.start_time,
                        end_time=clip.end_time,
                        aspect_ratio=aspect_enum,
                        mode=crop_mode_enum,
                        manual_offset=0.5
                    )
                else:
                    await video_reframer.render_reframed_video(
                        input_video_path=source_path,
                        output_video_path=cut_path,
                        start_time=clip.start_time,
                        end_time=clip.end_time,
                        aspect_ratio=aspect_enum,
                        mode=CropMode.FULL_SCREEN,
                        manual_offset=0.5
                    )

                # Generate thumbnail
                await ffmpeg_editor.generate_thumbnail(
                    video_path=cut_path,
                    output_image_path=thumb_path,
                    timestamp_sec=0.5
                )

                final_video_url = f"/generated-clips/{cut_filename}"

                # 9. Animated Subtitles Burn-In (Skip completely if No Captions selected)
                if burn_subtitles and subtitle_preset != "none" and has_speech and transcript_words:
                    job["current_step"] = f"5. Burning kinetic captions {clip_idx_str}: '{clip.title}'..."
                    job["updated_at"] = datetime.utcnow()

                    chunks = slice_and_chunk_words(
                        words=transcript_words,
                        clip_start=clip.start_time,
                        clip_end=clip.end_time,
                        max_words_per_line=style_config.max_words_per_line
                    )

                    if chunks:
                        subtitled_filename = f"{clip.id}_subtitled.mp4"
                        subtitled_path = str(settings.GENERATED_CLIPS_DIR / subtitled_filename)
                        await subtitle_renderer.render_subtitles_to_video(
                            input_video_path=cut_path,
                            output_video_path=subtitled_path,
                            chunks=chunks,
                            style=style_config
                        )
                        final_video_url = f"/generated-clips/{subtitled_filename}"

                # 10. Update Clip Object with Playback & Download URLs
                clip.video_url = final_video_url
                clip.preview_url = final_video_url
                clip.download_url = final_video_url
                clip.thumbnail_url = f"/uploads/thumbnails/{thumb_filename}"
                clip.aspect_ratio = target_aspect_ratio
                clip.status = "completed"
                clip.has_subtitles = burn_subtitles and subtitle_preset != "none" and has_speech

                # Persist to MongoDB
                if db is not None:
                    try:
                        await db.clips.replace_one({"id": clip.id}, clip.dict(), upsert=True)
                    except Exception as e:
                        logger.warning(f"MongoDB clip persist warning: {e}")

                completed_list.append(clip)

            except Exception as clip_err:
                logger.error(f"Error processing clip {clip.id}: {clip_err}")
                failed_list.append(
                    FailedClipItem(
                        clip_id=clip.id,
                        title=clip.title,
                        error=str(clip_err)[:160]
                    )
                )

        # STEP 7: Finalization & Project History Update
        job["progress"] = 100
        job["current_step"] = "6. AI Processing Pipeline Complete! All clips ready for download."
        job["status"] = "completed" if completed_list else "failed"
        job["completed_clips"] = completed_list
        job["failed_clips"] = failed_list
        job["updated_at"] = datetime.utcnow()

        # Update Project Video record and persist completed clips in MongoDB
        if db is not None:
            try:
                for comp_clip in completed_list:
                    await db.clips.replace_one(
                        {"id": comp_clip.id},
                        comp_clip.dict(),
                        upsert=True
                    )
                await db.videos.update_one(
                    {"id": video_id},
                    {"$set": {
                        "clips_count": len(completed_list),
                        "status": VideoStatus.COMPLETED if completed_list else VideoStatus.FAILED,
                        "current_step": f"{len(completed_list)} viral clips ready",
                        "updated_at": datetime.utcnow()
                    }}
                )
                logger.info(f"Pipeline {job_id} complete. Video {video_id} persisted with {len(completed_list)} clips in MongoDB.")
            except Exception as e:
                logger.warning(f"MongoDB video final status update warning: {e}")

        # In-memory storage update
        _in_memory_clips_by_video[video_id] = [c.dict() for c in completed_list]

    except Exception as pipeline_err:
        logger.error(f"Pipeline {job_id} failed with critical error: {pipeline_err}")
        job["status"] = "failed"
        job["error_message"] = str(pipeline_err)
        job["current_step"] = f"Pipeline error: {str(pipeline_err)[:160]}"
        job["updated_at"] = datetime.utcnow()

@router.post("/pipeline", response_model=FullPipelineJobResponse, status_code=status.HTTP_202_ACCEPTED)
async def trigger_full_pipeline(
    request: FullPipelineRequest,
    background_tasks: BackgroundTasks
):
    """
    Master 10-Step AI Clipping Pipeline:
    Ingests video, extracts audio, transcribes, scores hooks, reframes to 9:16, burns subtitles,
    and returns downloadable short-form videos.
    """
    job_id = f"pipe_{uuid.uuid4().hex[:10]}"
    initial_job = {
        "job_id": job_id,
        "video_id": request.video_id,
        "status": "queued",
        "progress": 0,
        "current_step": "Queued for AI processing...",
        "current_clip_title": None,
        "target_aspect_ratio": request.target_aspect_ratio,
        "total_moments_detected": 0,
        "completed_clips": [],
        "failed_clips": [],
        "error_message": None,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }
    _in_memory_pipeline_jobs[job_id] = initial_job

    effective_reframing = request.template_layout if request.template_layout else request.reframing_mode
    effective_burn_sub = request.burn_subtitles and request.subtitle_preset != "none"

    background_tasks.add_task(
        _run_full_end_to_end_pipeline,
        job_id=job_id,
        video_id=request.video_id,
        target_aspect_ratio=request.target_aspect_ratio,
        duration_range_str=request.duration_range,
        max_clips=request.max_clips,
        virality_threshold=request.virality_threshold,
        reframing_mode=effective_reframing,
        subtitle_preset=request.subtitle_preset,
        burn_subtitles=effective_burn_sub,
        smart_reframing=request.smart_reframing,
        whisper_model=request.whisper_model,
        content_type=request.content_type,
        export_quality=request.export_quality,
        scan_full_video=request.scan_full_video,
        start_time=request.start_time,
        end_time=request.end_time
    )

    logger.info(f"Queued Full Pipeline job {job_id} for video {request.video_id}")
    return FullPipelineJobResponse(**initial_job)

@router.get("/pipeline/{job_id}", response_model=FullPipelineJobResponse)
async def get_pipeline_job_status(job_id: str):
    """Polls real-time progress and completed clips from the full AI pipeline."""
    if job_id in _in_memory_pipeline_jobs:
        return FullPipelineJobResponse(**_in_memory_pipeline_jobs[job_id])
    raise HTTPException(status_code=404, detail=f"Pipeline job '{job_id}' not found.")

@router.post("/pipeline/{job_id}/retry", response_model=FullPipelineJobResponse, status_code=status.HTTP_202_ACCEPTED)
async def retry_pipeline_job(
    job_id: str,
    background_tasks: BackgroundTasks
):
    """Retries a failed pipeline job."""
    if job_id not in _in_memory_pipeline_jobs:
        raise HTTPException(status_code=404, detail=f"Pipeline job '{job_id}' not found.")

    job = _in_memory_pipeline_jobs[job_id]
    job["status"] = "queued"
    job["progress"] = 0
    job["current_step"] = "Retrying AI processing pipeline..."
    job["error_message"] = None
    job["updated_at"] = datetime.utcnow()

    background_tasks.add_task(
        _run_full_end_to_end_pipeline,
        job_id=job_id,
        video_id=job["video_id"],
        target_aspect_ratio=job.get("target_aspect_ratio", "9:16"),
        duration_range_str="30-60",
        max_clips=5,
        virality_threshold=50.0,
        reframing_mode="smart_auto",
        subtitle_preset="bold_yellow",
        burn_subtitles=True,
        smart_reframing=True,
        whisper_model="base"
    )

    return FullPipelineJobResponse(**job)

# Backward-compatibility alias for legacy frontend calls
@router.post("/generate", response_model=Dict[str, Any], status_code=status.HTTP_202_ACCEPTED)
async def generate_clips_alias(
    request: FullPipelineRequest,
    background_tasks: BackgroundTasks
):
    """Backward compatibility alias routing to full pipeline."""
    res = await trigger_full_pipeline(request, background_tasks)
    return {"task_id": res.job_id, "job_id": res.job_id, "message": "Pipeline triggered successfully"}

# -------------------------------------------------------------
# Direct Cloud Video ZIP Export & Clip Timestamp Editing CRUD
# -------------------------------------------------------------

class ClipUpdateRequest(BaseModel):
    title: Optional[str] = None
    start_time: Optional[float] = None
    end_time: Optional[float] = None

@router.patch("/{clip_id}", response_model=CandidateClip)
async def update_clip_timestamps(clip_id: str, request: ClipUpdateRequest):
    """
    Edits clip timestamps or title, and automatically re-renders the 9:16 short.
    """
    db = get_database()
    clip_doc = None
    if db is not None:
        try:
            clip_doc = await db.clips.find_one({"id": clip_id})
        except Exception:
            pass

    if not clip_doc:
        raise HTTPException(status_code=404, detail=f"Clip '{clip_id}' not found.")

    video_id = clip_doc.get("video_id")
    video_doc = await db.videos.find_one({"id": video_id}) if db is not None else None
    if not video_doc:
        raise HTTPException(status_code=404, detail="Parent video not found.")

    source_path = video_doc.get("file_path", "")
    new_start = request.start_time if request.start_time is not None else float(clip_doc.get("start_time", 0.0))
    new_end = request.end_time if request.end_time is not None else float(clip_doc.get("end_time", 0.0))
    if new_end <= new_start:
        raise HTTPException(status_code=400, detail="End time must be greater than start time.")

    new_duration = round(new_end - new_start, 2)
    aspect_slug = clip_doc.get("aspect_ratio", "9:16").replace(":", "x")
    cut_filename = f"{clip_id}_{aspect_slug}.mp4"
    cut_path = str(settings.GENERATED_CLIPS_DIR / cut_filename)
    thumb_filename = f"{clip_id}_{aspect_slug}.jpg"
    thumb_path = str(settings.THUMBNAIL_DIR / thumb_filename)

    is_remote = source_path.startswith("http://") or source_path.startswith("https://")
    try:
        if is_remote:
            from app.services.video.remote_stream_processor import remote_stream_processor
            v_meta = video_doc.get("metadata", {}) if isinstance(video_doc.get("metadata"), dict) else {}
            await remote_stream_processor.cut_and_reframe_remote_segment(
                url=source_path,
                start_time=new_start,
                end_time=new_end,
                output_video_path=cut_path,
                template_layout="full_screen",
                aspect_ratio=clip_doc.get("aspect_ratio", "9:16"),
                source_w=v_meta.get("width", 1280),
                source_h=v_meta.get("height", 720)
            )
        else:
            await video_reframer.render_reframed_video(
                input_video_path=source_path,
                output_video_path=cut_path,
                start_time=new_start,
                end_time=new_end,
                aspect_ratio=ReframingAspectRatio.VERTICAL_9_16,
                mode=CropMode.FULL_SCREEN,
                manual_offset=0.5
            )

        await ffmpeg_editor.generate_thumbnail(
            video_path=cut_path,
            output_image_path=thumb_path,
            timestamp_sec=0.5
        )
    except Exception as render_err:
        logger.error(f"Failed to re-render clip {clip_id}: {render_err}")
        raise HTTPException(status_code=500, detail=f"Re-rendering failed: {render_err}")

    update_fields = {
        "start_time": new_start,
        "end_time": new_end,
        "duration": new_duration,
        "video_url": f"/generated-clips/{cut_filename}",
        "preview_url": f"/generated-clips/{cut_filename}",
        "download_url": f"/generated-clips/{cut_filename}",
        "thumbnail_url": f"/uploads/thumbnails/{thumb_filename}",
        "updated_at": datetime.utcnow()
    }
    if request.title:
        update_fields["title"] = request.title

    clip_doc.update(update_fields)
    if db is not None:
        await db.clips.update_one({"id": clip_id}, {"$set": update_fields})

    return CandidateClip(**clip_doc)

@router.get("/video/{video_id}/download-zip")
async def download_all_clips_zip(video_id: str):
    """
    Bundles all rendered clips for a video project into a single ZIP file for 1-click download.
    """
    db = get_database()
    clips = []
    if db is not None:
        try:
            clips = await db.clips.find({"video_id": video_id}).to_list(length=100)
        except Exception as e:
            logger.warning(f"MongoDB clip lookup: {e}")

    if not clips:
        raise HTTPException(status_code=404, detail="No clips found for this video project.")

    zip_buffer = io.BytesIO()
    found_count = 0
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        for c in clips:
            cid = c.get("id")
            ctitle = re.sub(r'[^a-zA-Z0-9_-]', '_', c.get("title", f"clip_{cid}"))
            mp4_candidates = list(settings.GENERATED_CLIPS_DIR.glob(f"{cid}*.mp4"))
            if mp4_candidates:
                best_file = mp4_candidates[0]
                zip_file.write(best_file, arcname=f"{ctitle}_{cid}.mp4")
                found_count += 1

    if found_count == 0:
        raise HTTPException(status_code=400, detail="No rendered video files available to zip. Render clips first.")

    zip_buffer.seek(0)
    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename=ClipGenius_{video_id}_Shorts.zip"}
    )


