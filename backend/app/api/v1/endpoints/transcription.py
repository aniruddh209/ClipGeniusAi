import asyncio
from datetime import datetime
from typing import Dict, Any, Optional, List
from fastapi import APIRouter, HTTPException, BackgroundTasks, status
from app.core.config import settings
from app.core.logging import logger
from app.core.database import get_database
from app.models.transcript import (
    TranscriptionRequest, 
    TranscriptionResponse, 
    TranscriptSegment, 
    WordItem
)
from app.models.video import VideoStatus
from app.services.ai.transcription import whisper_transcriber

router = APIRouter()

# In-memory storage cache for transcription status and completed transcripts
_in_memory_transcripts: Dict[str, Dict[str, Any]] = {}

@router.get("/models")
async def list_available_models():
    """Returns the list of locally supported open-source Faster-Whisper models."""
    return [
        {
            "id": "tiny",
            "name": "Tiny (Fastest)",
            "parameters": "39M",
            "vram": "~500MB RAM",
            "speed": "Approx. 10x real-time on CPU",
            "recommended_for": "Quick previews & low-resource devices"
        },
        {
            "id": "base",
            "name": "Base (Default)",
            "parameters": "74M",
            "vram": "~1GB RAM",
            "speed": "Approx. 6x real-time on CPU",
            "recommended_for": "Standard podcasts and interviews"
        },
        {
            "id": "small",
            "name": "Small (High Accuracy)",
            "parameters": "244M",
            "vram": "~2GB RAM",
            "speed": "Approx. 3x real-time on CPU",
            "recommended_for": "Complex jargon, background music & accents"
        },
        {
            "id": "medium",
            "name": "Medium (Studio Quality)",
            "parameters": "769M",
            "vram": "~4GB RAM",
            "speed": "Approx. 1.5x real-time on CPU",
            "recommended_for": "Maximum accuracy with multi-speaker audio"
        }
    ]

@router.post("", response_model=TranscriptionResponse)
async def start_transcription(
    request: TranscriptionRequest,
    background_tasks: BackgroundTasks
):
    """
    Main AI Transcription Endpoint:
    1. Receives uploaded video ID
    2. Extracts 16kHz audio using FFmpeg
    3. Runs Faster-Whisper with word-level timestamps
    4. Auto-detects spoken language
    5. Saves transcript to MongoDB
    6. Returns structured transcription results
    """
    video_id = request.video_id
    logger.info(f"Received transcription request for video {video_id} (model={request.model_size or settings.WHISPER_MODEL})")

    # 1. Fetch video from DB or cache
    db = get_database()
    video_doc = None
    if db is not None:
        try:
            video_doc = await db.videos.find_one({"id": video_id})
        except Exception as e:
            logger.warning(f"DB lookup warning: {e}")

    if not video_doc and video_id in _in_memory_transcripts:
        video_doc = _in_memory_transcripts[video_id].get("video_doc")

    # If still not found, check videos endpoint cache
    if not video_doc:
        from app.api.v1.endpoints.videos import _in_memory_videos
        video_doc = _in_memory_videos.get(video_id)

    if not video_doc or not video_doc.get("file_path"):
        raise HTTPException(
            status_code=404,
            detail=f"Video with ID '{video_id}' not found. Please upload the video first."
        )

    file_path = video_doc["file_path"]

    # Initialize in-memory progress entry
    initial_status = {
        "video_id": video_id,
        "status": "processing",
        "progress": 10,
        "current_step": "Extracting audio with FFmpeg...",
        "has_speech": True,
        "language": "detecting...",
        "language_probability": 0.0,
        "duration": float(video_doc.get("duration", 0.0)),
        "model_used": request.model_size or settings.WHISPER_MODEL,
        "full_text": "",
        "segments": [],
        "total_words": 0,
        "error_message": None,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }
    _in_memory_transcripts[video_id] = initial_status

    # Progress tracking callback
    def on_progress(step: str, percentage: int):
        if video_id in _in_memory_transcripts:
            _in_memory_transcripts[video_id]["current_step"] = step
            _in_memory_transcripts[video_id]["progress"] = percentage
            _in_memory_transcripts[video_id]["updated_at"] = datetime.utcnow()

    try:
        # Run transcription pipeline
        res = await whisper_transcriber.transcribe_video(
            video_path=file_path,
            model_size=request.model_size or settings.WHISPER_MODEL,
            language=request.language,
            progress_callback=on_progress
        )

        completed_record = {
            "video_id": video_id,
            "status": "completed",
            "progress": 100,
            "current_step": f"Completed. Language detected: {res['language']} ({int(res['language_probability'] * 100)}%)",
            "has_speech": res["has_speech"],
            "language": res["language"],
            "language_probability": res["language_probability"],
            "duration": res["duration"],
            "model_used": res["model_used"],
            "full_text": res["full_text"],
            "segments": res["segments"],
            "total_words": res["total_words"],
            "error_message": None,
            "created_at": initial_status["created_at"],
            "updated_at": datetime.utcnow()
        }

        # Store transcript in MongoDB
        if db is not None:
            try:
                await db.transcripts.replace_one(
                    {"video_id": video_id},
                    dict(completed_record),
                    upsert=True
                )
                # Update video record to reflect transcript is ready
                await db.videos.update_one(
                    {"id": video_id},
                    {"$set": {
                        "transcript_available": True,
                        "status": VideoStatus.READY,
                        "current_step": "Transcript ready for viral clipping",
                        "updated_at": datetime.utcnow()
                    }}
                )
                logger.info(f"Transcription for {video_id} stored in MongoDB.")
            except Exception as e:
                logger.warning(f"MongoDB transcript store warning: {e}")

        _in_memory_transcripts[video_id] = completed_record
        return TranscriptionResponse(**completed_record)

    except Exception as e:
        logger.error(f"Transcription failed for {video_id}: {e}")
        failed_record = {
            "video_id": video_id,
            "status": "failed",
            "progress": 0,
            "current_step": "Transcription failed",
            "has_speech": False,
            "language": "unknown",
            "language_probability": 0.0,
            "duration": float(video_doc.get("duration", 0.0)),
            "model_used": request.model_size or settings.WHISPER_MODEL,
            "full_text": "",
            "segments": [],
            "total_words": 0,
            "error_message": str(e),
            "created_at": initial_status["created_at"],
            "updated_at": datetime.utcnow()
        }
        _in_memory_transcripts[video_id] = failed_record
        raise HTTPException(
            status_code=500,
            detail=f"Transcription pipeline failed: {str(e)}"
        )

@router.get("/{video_id}", response_model=TranscriptionResponse)
async def get_transcription(video_id: str):
    """Retrieves current transcription results or active progress for a video."""
    # Check MongoDB first
    db = get_database()
    if db is not None:
        try:
            doc = await db.transcripts.find_one({"video_id": video_id})
            if doc:
                return TranscriptionResponse(**doc)
        except Exception as e:
            logger.warning(f"MongoDB transcript fetch warning: {e}")

    # Check in-memory cache
    if video_id in _in_memory_transcripts:
        return TranscriptionResponse(**_in_memory_transcripts[video_id])

    raise HTTPException(
        status_code=404,
        detail=f"No transcription found for video '{video_id}'."
    )
