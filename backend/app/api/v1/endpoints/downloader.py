import asyncio
import os
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, BackgroundTasks, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app.core.config import settings
from app.core.logging import logger
from app.services.video.downloader_manager import downloader_manager
from app.services.video.ffmpeg_editor import ffmpeg_editor
from app.services.sources.registry import source_registry
from app.models.video import VideoSourceType, VideoStatus
from app.core.database import get_database

router = APIRouter()

class AnalyzeRequest(BaseModel):
    url: str = Field(..., description="Web or YouTube URL to analyze")

class StartDownloadRequest(BaseModel):
    url: str
    format_id: str
    ext: str = "mp4"
    resolution: str = "1080p FHD"
    save_destination: str = "downloads"  # "downloads" | "projects" | "custom"
    custom_path: Optional[str] = None
    title: Optional[str] = None
    thumbnail: Optional[str] = None
    estimated_size: Optional[int] = None

@router.post("/analyze")
async def analyze_video_url(payload: AnalyzeRequest):
    """
    Analyzes remote video URL using yt-dlp and returns metadata,
    duration, thumbnail, and selectable quality format options.
    """
    url = payload.url.strip()
    if not (url.startswith("http://") or url.startswith("https://")):
        raise HTTPException(status_code=400, detail="Invalid URL. Please enter a valid HTTP or HTTPS video URL.")

    try:
        analysis_result = await source_registry.analyze(url)
        data = analysis_result.model_dump()
        data["uploader"] = data.get("channel_name")
        data["formats"] = data.get("confirmed_qualities", [])
        return data
    except Exception as e:
        logger.error(f"Downloader analysis failed for {url}: {e}")
        raise HTTPException(
            status_code=422,
            detail=f"Could not analyze video stream: {str(e)}"
        )

@router.post("/start")
async def start_download(payload: StartDownloadRequest):
    """
    Creates a new download task and starts background streaming.
    """
    try:
        task = downloader_manager.create_task(
            url=payload.url,
            format_id=payload.format_id,
            ext=payload.ext,
            resolution=payload.resolution,
            save_destination=payload.save_destination,
            custom_path=payload.custom_path,
            title=payload.title,
            thumbnail=payload.thumbnail,
            estimated_size=payload.estimated_size
        )
        # Immediately start download
        downloader_manager.start_download(task["task_id"])
        return task
    except Exception as e:
        logger.error(f"Failed to start download: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/tasks")
async def get_all_tasks():
    """
    Returns real-time status of all download tasks
    """
    return downloader_manager.get_all_tasks()

@router.get("/tasks/{task_id}")
async def get_task_status(task_id: str):
    task = downloader_manager.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Download task not found")
    return task

@router.post("/tasks/{task_id}/pause")
async def pause_task(task_id: str):
    try:
        return downloader_manager.pause_download(task_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.post("/tasks/{task_id}/resume")
async def resume_task(task_id: str):
    try:
        return downloader_manager.resume_download(task_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.post("/tasks/{task_id}/cancel")
async def cancel_task(task_id: str):
    try:
        return downloader_manager.cancel_download(task_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.delete("/tasks/{task_id}")
async def delete_task(task_id: str):
    success = downloader_manager.delete_task(task_id)
    if not success:
        raise HTTPException(status_code=404, detail="Task not found")
    return {"success": True, "task_id": task_id}

@router.post("/batch/{action}")
async def batch_action(action: str):
    """
    Batch actions: download_all, pause_all, resume_all, clear_completed
    """
    act = action.lower()
    if act == "pause_all":
        return downloader_manager.pause_all()
    elif act in ["resume_all", "download_all"]:
        return downloader_manager.resume_all()
    elif act == "clear_completed":
        return downloader_manager.clear_completed()
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported batch action '{action}'")

@router.get("/history")
async def get_history():
    """
    Returns completed downloads
    """
    return downloader_manager.get_history()

@router.api_route("/file/{task_id}", methods=["GET", "HEAD"])
async def download_file(task_id: str):
    """
    Directly streams or downloads the saved file to the user's browser
    """
    task = downloader_manager.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Download task not found")

    output_path = task.get("output_path")
    if not output_path or not Path(output_path).exists():
        raise HTTPException(status_code=404, detail="Media file not found on server")

    filename = task.get("output_filename") or Path(output_path).name
    return FileResponse(
        path=output_path,
        filename=filename,
        media_type="application/octet-stream"
    )

@router.post("/tasks/{task_id}/clip")
async def clip_downloaded_video(task_id: str):
    """
    Imports the downloaded video directly into ClipGenius AI Clipper
    as a ready-to-clip project without re-downloading!
    """
    task = downloader_manager.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Download task not found")

    if task.get("status") != "completed":
        raise HTTPException(status_code=400, detail="Video is still downloading. Wait for completion to clip.")

    output_path = task.get("output_path")
    if not output_path or not Path(output_path).exists():
        raise HTTPException(status_code=404, detail="Downloaded media file not found on disk")

    src_file = Path(output_path)
    # If not already in UPLOAD_DIR, copy or move into UPLOAD_DIR
    video_id = f"vid_{uuid.uuid4().hex[:12]}"
    dest_path = settings.UPLOAD_DIR / f"{video_id}{src_file.suffix}"

    if src_file.parent != settings.UPLOAD_DIR:
        import shutil
        shutil.copy2(str(src_file), str(dest_path))
    else:
        dest_path = src_file
        video_id = src_file.stem

    # Extract metadata using ffmpeg_editor
    try:
        metadata = await asyncio.to_thread(ffmpeg_editor.get_video_metadata, str(dest_path))
    except Exception as e:
        metadata = {
            "duration": 60.0,
            "width": 1920,
            "height": 1080,
            "fps": 30.0,
            "aspect_ratio": "16:9",
            "size_mb": round(dest_path.stat().st_size / (1024 * 1024), 2)
        }

    # Generate thumbnail
    thumbnail_filename = f"{video_id}.jpg"
    thumbnail_path = settings.THUMBNAIL_DIR / thumbnail_filename
    try:
        await asyncio.to_thread(ffmpeg_editor.extract_thumbnail, str(dest_path), str(thumbnail_path), 2.0)
        thumbnail_url = f"/uploads/thumbnails/{thumbnail_filename}"
    except Exception:
        thumbnail_url = task.get("thumbnail")

    video_doc = {
        "id": video_id,
        "title": task.get("title") or "Downloaded Video",
        "original_filename": src_file.name,
        "stored_filename": dest_path.name,
        "source_type": "upload",
        "source_url": task.get("url"),
        "file_path": str(dest_path),
        "file_size_mb": round(dest_path.stat().st_size / (1024 * 1024), 2),
        "duration": metadata.get("duration", 60.0),
        "video_url": f"/uploads/{dest_path.name}",
        "thumbnail_url": thumbnail_url,
        "metadata": metadata,
        "status": "ready",
        "progress_percentage": 100,
        "current_step": "Ready for AI clipping",
        "transcript_available": False,
        "clips_count": 0,
        "created_at": datetime.now().isoformat(),
        "updated_at": datetime.now().isoformat()
    }

    db = get_database()
    if db is not None:
        await db.videos.insert_one(video_doc)
        video_doc["_id"] = str(video_doc.get("_id", ""))

    return {
        "success": True,
        "video_id": video_id,
        "message": "Video successfully imported into AI Clipper studio",
        "video": video_doc
    }
