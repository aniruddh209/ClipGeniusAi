import os
import glob
from pathlib import Path
from datetime import datetime
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, HTTPException, BackgroundTasks, status
from fastapi.responses import FileResponse

from app.core.config import settings
from app.core.logging import logger
from app.core.database import get_database
from app.models.subtitle import (
    CaptionPreset,
    SubtitleStyleConfig,
    SubtitleGenerateRequest,
    SubtitleGenerateResponse,
    SubtitleBurnRequest,
    SubtitleBurnResponse,
    SubtitleLineChunk
)
from app.models.transcript import WordItem
from app.services.video.subtitle_generator import (
    PRESET_CONFIGS,
    slice_and_chunk_words,
    generate_srt_content,
    generate_ass_content
)
from app.services.video.subtitle_renderer import subtitle_renderer
from app.services.video.ffmpeg_editor import ffmpeg_editor

router = APIRouter()

@router.get("/presets", response_model=Dict[str, SubtitleStyleConfig])
async def get_subtitle_presets():
    """Returns the 6 professional animated caption presets."""
    return {k.value: v for k, v in PRESET_CONFIGS.items()}

async def _get_transcript_words_for_video(video_id: str) -> List[WordItem]:
    """Retrieves all word timestamps for a given video from MongoDB or in-memory cache."""
    db = get_database()
    transcript_doc = None
    if db is not None:
        try:
            transcript_doc = await db.transcripts.find_one({"video_id": video_id})
        except Exception as e:
            logger.warning(f"MongoDB transcript lookup warning: {e}")

    if not transcript_doc:
        from app.api.v1.endpoints.transcription import _in_memory_transcripts
        transcript_doc = _in_memory_transcripts.get(video_id)

    if not transcript_doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Transcript not found for video {video_id}. Please transcribe the video first."
        )

    all_words: List[WordItem] = []
    for seg in transcript_doc.get("segments", []):
        for w in seg.get("words", []):
            if isinstance(w, dict):
                all_words.append(WordItem(**w))
            elif isinstance(w, WordItem):
                all_words.append(w)

    return all_words

async def _get_clip_details(video_id: str, clip_id: str) -> Optional[Dict[str, Any]]:
    """Fetches candidate clip info from DB or memory."""
    db = get_database()
    if db is not None:
        try:
            clip = await db.clips.find_one({"id": clip_id})
            if clip:
                return clip
        except Exception as e:
            logger.warning(f"MongoDB clip lookup warning: {e}")

    from app.api.v1.endpoints.clips import _in_memory_clips_by_video
    clips_list = _in_memory_clips_by_video.get(video_id, [])
    for c in clips_list:
        if c.get("id") == clip_id:
            return c
    return None

@router.post("/generate", response_model=SubtitleGenerateResponse)
async def generate_subtitles(request: SubtitleGenerateRequest):
    """
    Generates word chunks and synchronized subtitle previews for a video or clip segment.
    """
    video_id = request.video_id
    start_time = request.start_time
    end_time = request.end_time

    # If clip_id is given and times are not set or 0, query clip times
    if request.clip_id and (end_time <= start_time or end_time == 0.0):
        clip = await _get_clip_details(video_id, request.clip_id)
        if clip:
            start_time = float(clip.get("start_time", 0.0))
            end_time = float(clip.get("end_time", 0.0))

    duration = max(0.5, round(end_time - start_time, 3))
    style = request.style or PRESET_CONFIGS[CaptionPreset.BOLD_YELLOW]

    all_words = await _get_transcript_words_for_video(video_id)
    chunks = slice_and_chunk_words(
        words=all_words,
        clip_start=start_time,
        clip_end=end_time,
        max_words_per_line=style.max_words_per_line
    )

    total_words = sum(len(c.words) for c in chunks)
    srt_content = generate_srt_content(chunks)
    ass_content = generate_ass_content(chunks, style)

    return SubtitleGenerateResponse(
        video_id=video_id,
        clip_id=request.clip_id,
        chunks=chunks,
        total_words=total_words,
        duration=duration,
        style=style,
        srt_content=srt_content,
        ass_content=ass_content
    )

@router.post("/burn", response_model=SubtitleBurnResponse)
async def burn_subtitles(request: SubtitleBurnRequest):
    """
    Bakes speech-synchronized animated captions into a clip video using FFmpeg and Pillow.
    Saves the rendered video, along with downloadable .srt and .ass files.
    """
    video_id = request.video_id
    clip_id = request.clip_id
    style = request.style or PRESET_CONFIGS[CaptionPreset.BOLD_YELLOW]

    # 1. Fetch clip information
    clip_data = await _get_clip_details(video_id, clip_id)
    if not clip_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Clip {clip_id} not found."
        )

    start_time = float(clip_data.get("start_time", 0.0))
    end_time = float(clip_data.get("end_time", 0.0))
    duration = max(0.5, round(end_time - start_time, 3))

    # 2. Locate input clip video file
    settings.GENERATED_CLIPS_DIR.mkdir(parents=True, exist_ok=True)
    
    # Check if a cut clip already exists for this clip_id
    possible_files = list(settings.GENERATED_CLIPS_DIR.glob(f"{clip_id}*.mp4"))
    # Filter out already subtitled clips
    source_clip_candidates = [f for f in possible_files if not f.name.endswith("_subtitled.mp4")]

    if source_clip_candidates:
        input_clip_path = str(source_clip_candidates[0])
    else:
        # If not cut yet, cut from original source video
        db = get_database()
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
                detail=f"Source video file for {video_id} not found on server."
            )

        source_video_path = video_doc["file_path"]
        input_clip_path = str(settings.GENERATED_CLIPS_DIR / f"{clip_id}_9x16.mp4")
        logger.info(f"Cutting clip {clip_id} on the fly before burning subtitles...")
        await ffmpeg_editor.cut_clip(
            input_video_path=source_video_path,
            output_video_path=input_clip_path,
            start_time=start_time,
            end_time=end_time,
            aspect_ratio="9:16"
        )

    # 3. Retrieve transcript and chunk words
    all_words = await _get_transcript_words_for_video(video_id)
    chunks = slice_and_chunk_words(
        words=all_words,
        clip_start=start_time,
        clip_end=end_time,
        max_words_per_line=style.max_words_per_line
    )

    if not chunks:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No words found in this clip segment to generate subtitles."
        )

    # 4. Render subtitled video with Pillow & FFmpeg
    output_filename = f"{clip_id}_subtitled.mp4"
    output_video_path = str(settings.GENERATED_CLIPS_DIR / output_filename)

    try:
        await subtitle_renderer.render_subtitles_to_video(
            input_video_path=input_clip_path,
            output_video_path=output_video_path,
            chunks=chunks,
            style=style
        )
    except Exception as e:
        logger.error(f"Subtitle burn error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Subtitle rendering failed: {str(e)}"
        )

    subtitled_video_url = f"/generated-clips/{output_filename}"
    srt_filename = f"{clip_id}_subtitled.srt"
    ass_filename = f"{clip_id}_subtitled.ass"
    srt_url = f"/generated-clips/{srt_filename}"
    ass_url = f"/generated-clips/{ass_filename}"

    # 5. Update MongoDB clip document if present
    db = get_database()
    if db is not None:
        try:
            await db.clips.update_one(
                {"id": clip_id},
                {"$set": {
                    "has_subtitles": True,
                    "subtitled_video_url": subtitled_video_url,
                    "srt_url": srt_url,
                    "ass_url": ass_url,
                    "updated_at": datetime.utcnow()
                }}
            )
        except Exception as e:
            logger.warning(f"MongoDB update clip subtitle warning: {e}")

    return SubtitleBurnResponse(
        clip_id=clip_id,
        video_id=video_id,
        status="completed",
        subtitled_video_url=subtitled_video_url,
        srt_url=srt_url,
        ass_url=ass_url,
        duration=duration,
        style_used=style
    )

@router.get("/download/{clip_id}/{fmt}")
async def download_subtitles(clip_id: str, fmt: str):
    """Downloads exported .srt or .ass subtitle file."""
    fmt = fmt.lower().strip(".")
    if fmt not in ["srt", "ass"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Format must be either 'srt' or 'ass'."
        )

    target_file = settings.GENERATED_CLIPS_DIR / f"{clip_id}_subtitled.{fmt}"
    if not target_file.exists():
        # Check without _subtitled
        target_file = settings.GENERATED_CLIPS_DIR / f"{clip_id}.{fmt}"

    if not target_file.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Subtitle file {target_file.name} not found. Please render subtitles first."
        )

    media_type = "text/plain; charset=utf-8"
    return FileResponse(
        path=str(target_file),
        filename=f"clip_{clip_id}.{fmt}",
        media_type=media_type
    )
