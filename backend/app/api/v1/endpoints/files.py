import os
import shutil
from pathlib import Path
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.core.config import settings
from app.core.logging import logger
from app.services.video.macos_exporter import macos_exporter
from app.services.downloader.engine import download_engine
from app.services.video.downloader_manager import downloader_manager
from app.core.database import get_database

router = APIRouter()

class QualitiesRequest(BaseModel):
    source_path: Optional[str] = None
    task_id: Optional[str] = None
    clip_id: Optional[str] = None
    video_id: Optional[str] = None

class ExportRequest(BaseModel):
    source_path: Optional[str] = None
    task_id: Optional[str] = None
    clip_id: Optional[str] = None
    video_id: Optional[str] = None
    target_format: str = "mp4_h264"  # "mp4_h264", "mp4_hevc", "mov", "webm", "original"
    target_quality: str = "original"  # "original", "4k", "2k", "1080p", "720p", "480p"
    destination_dir: Optional[str] = None
    custom_filename: Optional[str] = None

class FileActionRequest(BaseModel):
    file_path: Optional[str] = None
    task_id: Optional[str] = None
    clip_id: Optional[str] = None
    video_id: Optional[str] = None

class BatchDeleteRequest(BaseModel):
    file_paths: List[str] = Field(default_factory=list)
    task_ids: List[str] = Field(default_factory=list)
    clip_ids: List[str] = Field(default_factory=list)

async def _resolve_file_path(
    file_path: Optional[str] = None,
    task_id: Optional[str] = None,
    clip_id: Optional[str] = None,
    video_id: Optional[str] = None
) -> str:
    """Helper to resolve a physical file path from various entity IDs."""
    if file_path and Path(file_path).exists():
        return str(Path(file_path).resolve())

    # Check task_id (from downloader)
    if task_id:
        if task_id.startswith("job_"):
            j = download_engine.get_job(task_id)
            if j and j.get("final_filepath") and Path(j["final_filepath"]).exists():
                return str(Path(j["final_filepath"]).resolve())
        else:
            t = downloader_manager.get_task(task_id)
            if t and t.get("output_path") and Path(t["output_path"]).exists():
                return str(Path(t["output_path"]).resolve())

    # Check clip_id
    if clip_id:
        # Check generated-clips folder
        for f in settings.GENERATED_CLIPS_DIR.glob(f"{clip_id}*"):
            if f.is_file() and f.suffix in (".mp4", ".mov", ".webm"):
                return str(f.resolve())

    # Check video_id
    if video_id:
        db = get_database()
        if db is not None:
            v = await db.videos.find_one({"id": video_id})
            if v and v.get("file_path") and Path(v["file_path"]).exists():
                return str(Path(v["file_path"]).resolve())

    if file_path:
        # Check relative to downloads or uploads
        for base in [settings.DOWNLOADS_DIR, settings.UPLOAD_DIR, settings.GENERATED_CLIPS_DIR]:
            candidate = base / Path(file_path).name
            if candidate.exists():
                return str(candidate.resolve())

    raise HTTPException(status_code=404, detail="File could not be found on server disk.")

@router.get("/formats")
async def get_supported_formats():
    """Returns macOS-compatible video export formats (H.264, HEVC QuickTime, MOV, WebM, Original)."""
    return macos_exporter.get_supported_formats()

@router.get("/directories")
async def get_macos_directories():
    """Returns standard macOS user directories (Downloads, Movies, Desktop, ClipGenius)."""
    return macos_exporter.get_standard_macos_directories()

@router.post("/qualities")
async def get_available_qualities(payload: QualitiesRequest):
    """
    Returns genuine available quality presets for a specific media file.
    Enforces honest quality without fake upscaling to 4K.
    """
    resolved_path = await _resolve_file_path(
        file_path=payload.source_path,
        task_id=payload.task_id,
        clip_id=payload.clip_id,
        video_id=payload.video_id
    )
    try:
        qualities = macos_exporter.get_available_qualities(resolved_path)
        return {
            "source_path": resolved_path,
            "filename": Path(resolved_path).name,
            "qualities": qualities
        }
    except Exception as e:
        logger.error(f"Error querying available qualities: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/export")
async def export_video(payload: ExportRequest):
    """
    Converts and exports a video file to the requested format and quality.
    Ensures macOS QuickTime compatibility (-tag:v hvc1 for HEVC, -pix_fmt yuv420p for H.264/MOV).
    """
    resolved_path = await _resolve_file_path(
        file_path=payload.source_path,
        task_id=payload.task_id,
        clip_id=payload.clip_id,
        video_id=payload.video_id
    )

    try:
        result = await macos_exporter.export_video(
            source_path=resolved_path,
            target_format=payload.target_format,
            target_quality=payload.target_quality,
            destination_dir=payload.destination_dir,
            custom_filename=payload.custom_filename
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Export failed for {resolved_path}: {e}")
        raise HTTPException(status_code=500, detail=f"Export failed: {str(e)}")

@router.post("/open")
async def open_in_macos_player(payload: FileActionRequest):
    """
    Launches the file in macOS default video player (e.g. QuickTime Player / IINA).
    """
    resolved_path = await _resolve_file_path(
        file_path=payload.file_path,
        task_id=payload.task_id,
        clip_id=payload.clip_id,
        video_id=payload.video_id
    )
    try:
        return macos_exporter.open_file_in_macos_player(resolved_path)
    except Exception as e:
        logger.error(f"Could not open file in macOS player: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/reveal")
async def reveal_in_finder(payload: FileActionRequest):
    """
    Opens macOS Finder and highlights the specified video file.
    """
    resolved_path = await _resolve_file_path(
        file_path=payload.file_path,
        task_id=payload.task_id,
        clip_id=payload.clip_id,
        video_id=payload.video_id
    )
    try:
        return macos_exporter.reveal_in_finder(resolved_path)
    except Exception as e:
        logger.error(f"Could not reveal file in macOS Finder: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/info")
async def get_file_info(
    path: Optional[str] = Query(None),
    task_id: Optional[str] = Query(None),
    clip_id: Optional[str] = Query(None),
    video_id: Optional[str] = Query(None)
):
    """
    Returns comprehensive file specs: location, file size in bytes/MB/GB, duration, resolution, codecs.
    """
    resolved_path = await _resolve_file_path(
        file_path=path,
        task_id=task_id,
        clip_id=clip_id,
        video_id=video_id
    )
    p = Path(resolved_path)
    stat = p.stat()
    from app.services.video.ffmpeg_editor import ffmpeg_editor
    try:
        meta = ffmpeg_editor.get_video_metadata(str(p))
    except Exception:
        meta = {}

    size_bytes = stat.st_size
    size_mb = round(size_bytes / (1024 * 1024), 2)
    size_gb = round(size_bytes / (1024 ** 3), 3)

    return {
        "filename": p.name,
        "filepath": str(p),
        "directory": str(p.parent),
        "size_bytes": size_bytes,
        "size_mb": size_mb,
        "size_gb": size_gb,
        "extension": p.suffix,
        "video_codec": meta.get("video_codec"),
        "audio_codec": meta.get("audio_codec"),
        "resolution": f"{meta.get('width', 0)}x{meta.get('height', 0)}",
        "width": meta.get("width"),
        "height": meta.get("height"),
        "duration": meta.get("duration"),
        "fps": meta.get("fps"),
        "bitrate_kbps": meta.get("bitrate_kbps"),
        "last_modified": stat.st_mtime
    }

@router.post("/delete")
async def delete_single_file(payload: FileActionRequest):
    """
    Permanently deletes a video file from disk after confirmation.
    """
    resolved_path = await _resolve_file_path(
        file_path=payload.file_path,
        task_id=payload.task_id,
        clip_id=payload.clip_id,
        video_id=payload.video_id
    )

    try:
        res = macos_exporter.delete_file(resolved_path)
        # Also clean up from download tasks if applicable
        if payload.task_id:
            if payload.task_id.startswith("job_"):
                await download_engine.delete_job(payload.task_id)
            else:
                downloader_manager.delete_task(payload.task_id)
        return res
    except Exception as e:
        logger.error(f"File deletion error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/batch-delete")
async def batch_delete_files(payload: BatchDeleteRequest):
    """
    Permanently deletes multiple selected video files from disk.
    Requires explicit user confirmation on frontend.
    """
    deleted_files = []
    errors = []

    # 1. Delete by file_paths
    for fp in payload.file_paths:
        try:
            resolved = await _resolve_file_path(file_path=fp)
            res = macos_exporter.delete_file(resolved)
            deleted_files.append(res["filename"])
        except Exception as e:
            errors.append(f"Failed to delete {fp}: {str(e)}")

    # 2. Delete by task_ids
    for tid in payload.task_ids:
        try:
            resolved = await _resolve_file_path(task_id=tid)
            res = macos_exporter.delete_file(resolved)
            deleted_files.append(res["filename"])
            if tid.startswith("job_"):
                await download_engine.delete_job(tid)
            else:
                downloader_manager.delete_task(tid)
        except Exception as e:
            errors.append(f"Failed to delete task {tid}: {str(e)}")

    return {
        "success": True,
        "deleted_count": len(deleted_files),
        "deleted_files": deleted_files,
        "errors": errors
    }
