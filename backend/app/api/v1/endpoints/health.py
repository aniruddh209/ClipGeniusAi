from fastapi import APIRouter
from app.core.config import settings
from app.core.database import db_manager
from app.services.video.ffmpeg_editor import ffmpeg_editor
from app.models.task import SystemHealthResponse
import os

router = APIRouter()

@router.get("/health", response_model=SystemHealthResponse)
async def check_health():
    """
    Returns the real-time operational status of ClipGenius AI backend,
    including MongoDB connectivity and FFmpeg system availability.
    """
    db_status = "connected" if db_manager.is_connected else "disconnected (fallback mode)"
    ffmpeg_ok = ffmpeg_editor.is_available()
    storage_ok = os.access(settings.UPLOAD_DIR, os.W_OK) and os.access(settings.OUTPUT_DIR, os.W_OK)

    return SystemHealthResponse(
        status="healthy",
        version=settings.VERSION,
        database=db_status,
        ffmpeg_available=ffmpeg_ok,
        storage_writable=storage_ok,
        active_tasks=0,
        environment=settings.ENVIRONMENT
    )
