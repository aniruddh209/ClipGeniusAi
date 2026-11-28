import asyncio
import os
import shutil
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
from app.services.downloader.engine import download_engine
from app.services.sources.direct_media import direct_media_source_provider
from app.services.video.ffmpeg_editor import ffmpeg_editor
from app.services.sources.registry import source_registry
from app.models.video import VideoSourceType, VideoStatus
from app.core.database import get_database
from app.services.downloader.security import validate_download_url, validate_disk_space, sanitize_safe_filename

router = APIRouter()

class AnalyzeRequest(BaseModel):
    url: str = Field(..., description="Web or YouTube URL to analyze")

class ProbeRequest(BaseModel):
    url: str = Field(..., description="Direct video URL to probe for HTTP Range & media headers")

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
    use_engine: Optional[bool] = None
    max_connections: Optional[int] = 2
    expected_checksum: Optional[str] = None
    checksum_type: Optional[str] = "md5"

@router.post("/engine/probe")
async def probe_direct_url(payload: ProbeRequest):
    """
    Probes remote media server for HTTP Range request support,
    Content-Length, mime-type, and ETag
    """
    try:
        url = validate_download_url(payload.url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    try:
        data = await download_engine.probe_url(url)
        return data
    except Exception as e:
        logger.error(f"Probe failed for {url}: {e}")
        raise HTTPException(status_code=422, detail=f"Could not probe remote source server: {str(e)}")

@router.post("/analyze")
async def analyze_video_url(payload: AnalyzeRequest):
    """
    Analyzes remote video URL using yt-dlp and returns metadata,
    duration, thumbnail, and selectable quality format options.
    """
    try:
        url = validate_download_url(payload.url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

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
    Uses high-performance HTTPX async streaming engine for direct media URLs
    and yt-dlp worker for platform streams.
    """
    try:
        clean_url = validate_download_url(payload.url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    try:
        is_direct = (
            payload.use_engine is True
            or direct_media_source_provider.can_handle(clean_url)
            or payload.format_id in ["direct_engine", "best_direct"]
        )

        if is_direct:
            job = await download_engine.create_download_job(
                url=payload.url,
                title=payload.title,
                thumbnail=payload.thumbnail,
                save_destination=payload.save_destination,
                custom_path=payload.custom_path,
                max_connections=payload.max_connections or 2,
                expected_checksum=payload.expected_checksum,
                checksum_type=payload.checksum_type or "md5"
            )
            await download_engine.start_job(job["job_id"])
            item = job.copy()
            item["task_id"] = job["job_id"]
            item["format_id"] = payload.format_id
            item["resolution"] = payload.resolution
            return item

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
        downloader_manager.start_download(task["task_id"])
        return task
    except Exception as e:
        logger.error(f"Failed to start download: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/tasks")
async def get_all_tasks():
    """
    Returns real-time status of all download tasks from both download engines
    """
    dm_tasks = downloader_manager.get_all_tasks()
    engine_jobs = download_engine.get_all_jobs()
    unified = list(dm_tasks)
    for j in engine_jobs:
        item = j.copy()
        item["task_id"] = j["job_id"]
        item["output_path"] = j.get("final_filepath")
        item["output_filename"] = j.get("final_filename")
        unified.append(item)
    return sorted(unified, key=lambda x: x.get("created_at", ""), reverse=True)

@router.get("/tasks/{task_id}")
async def get_task_status(task_id: str):
    if task_id.startswith("job_"):
        j = download_engine.get_job(task_id)
        if not j:
            raise HTTPException(status_code=404, detail="Download job not found")
        item = j.copy()
        item["task_id"] = j["job_id"]
        item["output_path"] = j.get("final_filepath")
        item["output_filename"] = j.get("final_filename")
        return item

    task = downloader_manager.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Download task not found")
    return task

@router.post("/tasks/{task_id}/pause")
async def pause_task(task_id: str):
    try:
        if task_id.startswith("job_"):
            return await download_engine.pause_job(task_id)
        return downloader_manager.pause_download(task_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.post("/tasks/{task_id}/resume")
async def resume_task(task_id: str):
    try:
        if task_id.startswith("job_"):
            return await download_engine.resume_job(task_id)
        return downloader_manager.resume_download(task_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.post("/tasks/{task_id}/retry")
async def retry_task(task_id: str):
    try:
        if task_id.startswith("job_"):
            return await download_engine.retry_job(task_id)
        return downloader_manager.resume_download(task_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.post("/tasks/{task_id}/cancel")
async def cancel_task(task_id: str):
    try:
        if task_id.startswith("job_"):
            return await download_engine.cancel_job(task_id)
        return downloader_manager.cancel_download(task_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.delete("/tasks/{task_id}")
async def delete_task(task_id: str):
    if task_id.startswith("job_"):
        success = await download_engine.delete_job(task_id)
    else:
        success = downloader_manager.delete_task(task_id)

    if not success:
        raise HTTPException(status_code=404, detail="Task not found")
    return {"success": True, "task_id": task_id}

class BatchDeleteRequest(BaseModel):
    task_ids: List[str]

@router.post("/batch-delete")
async def batch_delete_tasks(payload: BatchDeleteRequest):
    """
    Batch permanently deletes selected tasks and removes partial/output media files
    """
    deleted_ids = []
    for tid in payload.task_ids:
        if tid.startswith("job_"):
            success = await download_engine.delete_job(tid)
        else:
            success = downloader_manager.delete_task(tid)
        if success:
            deleted_ids.append(tid)
    return {"success": True, "deleted_count": len(deleted_ids), "deleted_ids": deleted_ids}

@router.post("/batch/{action}")
async def batch_action(action: str):
    """
    Batch actions: download_all, pause_all, resume_all, retry_failed, cancel_all, clear_completed
    """
    act = action.lower()
    if act == "pause_all":
        # Pause both engines
        for j in download_engine.get_all_jobs():
            if j.get("status") in ["downloading", "connecting"]:
                await download_engine.pause_job(j["job_id"])
        downloader_manager.pause_all()
        return await get_all_tasks()
    elif act in ["resume_all", "download_all"]:
        for j in download_engine.get_all_jobs():
            if j.get("status") in ["paused", "interrupted", "queued"]:
                await download_engine.resume_job(j["job_id"])
        downloader_manager.resume_all()
        return await get_all_tasks()
    elif act == "retry_failed":
        await download_engine.retry_failed()
        downloader_manager.retry_failed()
        return await get_all_tasks()
    elif act == "cancel_all":
        await download_engine.cancel_all()
        downloader_manager.cancel_all()
        return await get_all_tasks()
    elif act == "clear_completed":
        for j in download_engine.get_all_jobs():
            if j.get("status") in ["completed", "failed", "cancelled"]:
                await download_engine.delete_job(j["job_id"])
        downloader_manager.clear_completed()
        return await get_all_tasks()
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported batch action '{action}'")

@router.get("/history")
async def get_history():
    """
    Returns completed downloads
    """
    all_tasks = await get_all_tasks()
    return [t for t in all_tasks if t.get("status") == "completed"]

@router.api_route("/file/{task_id}", methods=["GET", "HEAD"])
async def download_file(task_id: str):
    """
    Directly streams or downloads the saved media file to the user's browser
    with RFC 5987 content-disposition and resilient fallback discovery.
    """
    output_path = None
    filename = None

    # 1. Check in-memory task / job
    if task_id.startswith("job_"):
        j = download_engine.get_job(task_id)
        if j:
            output_path = j.get("final_filepath")
            filename = j.get("final_filename")
    else:
        t = downloader_manager.get_task(task_id)
        if t:
            output_path = t.get("output_path")
            filename = t.get("output_filename")

    # 2. Fallback to MongoDB if server restarted or task not in memory cache
    if not output_path or not Path(output_path).exists():
        db = get_database()
        if db is not None:
            doc = await db.download_tasks.find_one({"task_id": task_id})
            if not doc:
                doc = await db.download_jobs.find_one({"job_id": task_id})
            if doc:
                output_path = doc.get("output_path") or doc.get("final_filepath")
                filename = doc.get("output_filename") or doc.get("final_filename")

    # 3. Fallback disk search across downloads, uploads, and outputs directories
    if not output_path or not Path(output_path).exists():
        for base_dir in [settings.DOWNLOADS_DIR, settings.UPLOAD_DIR, settings.OUTPUT_DIR]:
            # Direct match by filename
            direct_cand = base_dir / task_id
            if direct_cand.is_file() and not direct_cand.name.endswith((".part", ".ytdl")):
                output_path = str(direct_cand.resolve())
                filename = direct_cand.name
                break
            # Search by task ID suffix (e.g. _3e58) or task ID prefix
            suffix = task_id[-4:] if len(task_id) >= 4 else task_id
            for cand in base_dir.glob(f"*{suffix}*"):
                if cand.is_file() and not cand.name.endswith((".part", ".ytdl")):
                    output_path = str(cand.resolve())
                    filename = cand.name
                    break
            if output_path and Path(output_path).exists():
                break

    if not output_path or not Path(output_path).exists():
        raise HTTPException(status_code=404, detail=f"Media file for task {task_id} not found on server disk")

    resolved = Path(output_path).resolve()
    final_filename = filename or resolved.name

    # Determine standard media MIME type
    ext = resolved.suffix.lower()
    media_type = "video/mp4"
    if ext == ".webm":
        media_type = "video/webm"
    elif ext == ".mov":
        media_type = "video/quicktime"
    elif ext == ".mp3":
        media_type = "audio/mpeg"
    elif ext == ".m4a":
        media_type = "audio/mp4"

    import urllib.parse
    import re
    # Clean and sanitize filename for HTTP headers
    safe_ascii = re.sub(r'[^\w\s\.-]', '', final_filename).strip()
    safe_ascii = re.sub(r'[-\s]+', '_', safe_ascii)
    if not safe_ascii or safe_ascii == ext:
        safe_ascii = f"video_{task_id}{ext}"
    encoded_filename = urllib.parse.quote(final_filename, encoding='utf-8')

    return FileResponse(
        path=str(resolved),
        filename=safe_ascii,
        media_type=media_type,
        headers={
            "Accept-Ranges": "bytes",
            "Content-Disposition": f'attachment; filename="{safe_ascii}"; filename*=UTF-8\'\'{encoded_filename}',
            "Access-Control-Expose-Headers": "Content-Disposition"
        }
    )

@router.post("/tasks/{task_id}/clip")
async def clip_downloaded_video(task_id: str):
    """
    Imports the downloaded video directly into ClipGenius AI Clipper
    as a ready-to-clip project without re-downloading!
    """
    output_path = None
    title = "Downloaded Video"
    url = None
    thumbnail_url = None

    if task_id.startswith("job_"):
        j = download_engine.get_job(task_id)
        if not j:
            raise HTTPException(status_code=404, detail="Download job not found")
        if j.get("status") != "completed":
            raise HTTPException(status_code=400, detail="Video is still downloading or verifying. Wait for completion to clip.")
        output_path = j.get("final_filepath")
        title = j.get("title") or title
        url = j.get("url")
        thumbnail_url = j.get("thumbnail")
    else:
        t = downloader_manager.get_task(task_id)
        if not t:
            raise HTTPException(status_code=404, detail="Download task not found")
        if t.get("status") != "completed":
            raise HTTPException(status_code=400, detail="Video is still downloading. Wait for completion to clip.")
        output_path = t.get("output_path")
        title = t.get("title") or title
        url = t.get("url")
        thumbnail_url = t.get("thumbnail")

    if not output_path or not Path(output_path).exists():
        raise HTTPException(status_code=404, detail="Downloaded media file not found on disk")

    src_file = Path(output_path)
    video_id = f"vid_{uuid.uuid4().hex[:12]}"
    dest_path = settings.UPLOAD_DIR / f"{video_id}{src_file.suffix}"

    if src_file.parent != settings.UPLOAD_DIR:
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
    thumbnail_dest = settings.THUMBNAIL_DIR / thumbnail_filename
    try:
        await asyncio.to_thread(ffmpeg_editor.extract_thumbnail, str(dest_path), str(thumbnail_dest), 2.0)
        final_thumb_url = f"/uploads/thumbnails/{thumbnail_filename}"
    except Exception:
        final_thumb_url = thumbnail_url

    video_doc = {
        "id": video_id,
        "title": title,
        "original_filename": src_file.name,
        "stored_filename": dest_path.name,
        "source_type": "upload",
        "source_url": url,
        "file_path": str(dest_path),
        "file_size_mb": round(dest_path.stat().st_size / (1024 * 1024), 2),
        "duration": metadata.get("duration", 60.0),
        "video_url": f"/uploads/{dest_path.name}",
        "thumbnail_url": final_thumb_url,
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

class CookiePayload(BaseModel):
    cookies_text: str

@router.get("/cookies/status")
async def get_cookie_status():
    """
    Returns the current YouTube cookie authorization status
    """
    from app.services.sources.youtube import resolve_youtube_cookies
    cpath = resolve_youtube_cookies()
    if cpath and os.path.exists(cpath):
        size = os.path.getsize(cpath)
        return {
            "configured": True,
            "path": cpath,
            "size_bytes": size,
            "message": "YouTube authentication cookies are active and verified. Cloud downloads are unlocked."
        }
    return {
        "configured": False,
        "path": None,
        "size_bytes": 0,
        "message": "No YouTube cookies configured. Cloud datacenter IPs may encounter YouTube bot checks."
    }

@router.post("/cookies/save")
async def save_cookies(payload: CookiePayload):
    """
    Saves YouTube Netscape cookies to disk and authorizes all cloud downloads
    """
    from app.services.sources.youtube import resolve_youtube_cookies
    txt = payload.cookies_text.strip()
    if not txt:
        raise HTTPException(status_code=400, detail="Cookie content cannot be empty.")

    # Check for basic Netscape format or token presence
    has_tab = "\t" in txt
    has_token = any(k in txt for k in ["LOGIN_INFO", "SID", "HSID", "SSID", "SAPISID", "APISID", "SOCS", "CONSENT"])
    if not has_tab and not has_token:
        raise HTTPException(
            status_code=400,
            detail="Invalid cookie format. Please paste exported Netscape cookies from YouTube."
        )

    # Ensure target files exist
    target_path = Path(settings.BASE_DIR) / "cookies.txt"
    try:
        target_path.write_text(txt, encoding="utf-8")
    except Exception as e:
        logger.error(f"Failed to write to {target_path}: {e}")

    try:
        Path("/tmp/youtube_cookies.txt").write_text(txt, encoding="utf-8")
    except Exception as e:
        logger.warning(f"Failed to write to /tmp/youtube_cookies.txt: {e}")

    return {
        "success": True,
        "message": "YouTube cookies successfully saved! Cloud downloads are now authorized.",
        "path": str(target_path)
    }

@router.delete("/cookies/clear")
async def clear_cookies():
    """
    Clears saved YouTube cookies
    """
    cleared = []
    for p in [Path(settings.BASE_DIR) / "cookies.txt", Path("/tmp/youtube_cookies.txt")]:
        if p.exists():
            try:
                p.unlink()
                cleared.append(str(p))
            except Exception:
                pass
    return {"success": True, "cleared": cleared}

@router.post("/debug-dl")
async def debug_download(payload: StartDownloadRequest):
    import traceback
    import yt_dlp
    from app.services.sources.youtube import resolve_youtube_cookies, get_yt_js_runtimes
    
    clean_url = payload.url
    runtimes = get_yt_js_runtimes()
    opts = {
        "format": payload.format_id,
        "outtmpl": "/tmp/debug_%(id)s.%(ext)s",
        "quiet": False,
        "verbose": True,
        "js_runtimes": runtimes,
        "extractor_args": {
            "youtube": {
                "player_client": ["web", "tv_samsung", "android"] if runtimes else ["tv_samsung", "android"]
            }
        },
        "download_ranges": yt_dlp.utils.download_range_func(None, [(0, 1)]),
    }
    cookie_path = resolve_youtube_cookies()
    if cookie_path:
        opts["cookiefile"] = cookie_path

    try:
        def _run():
            with yt_dlp.YoutubeDL(opts) as ydl:
                return ydl.download([clean_url])
        rc = await asyncio.to_thread(_run)
        return {"success": True, "returncode": rc}
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "traceback": traceback.format_exc()
        }

@router.post("/probe-clients")
async def probe_clients(payload: Dict[str, Any]):
    import yt_dlp
    url = payload.get("url", "https://www.youtube.com/watch?v=e4B2DwSqEZg")
    candidate_clients = [
        ["tv_samsung"],
        ["android"],
        ["mweb"],
        ["tv"],
        ["tv_simply"],
        ["tv_downgraded"],
        ["web_embedded"],
        ["android_vr"],
        ["ios"],
        ["web_creator"],
    ]
    results = {}
    for c in candidate_clients:
        name = "+".join(c)
        opts = {
            "quiet": True,
            "no_warnings": True,
            "extractor_args": {"youtube": {"player_client": c}},
        }
        try:
            def _extract(opts_arg=opts):
                with yt_dlp.YoutubeDL(opts_arg) as ydl:
                    return ydl.extract_info(url, download=False)
            info = await asyncio.to_thread(_extract)
            fmts = len(info.get("formats", []))
            heights = sorted(list(set(f.get("height") for f in info.get("formats", []) if f.get("height"))))
            results[name] = {"success": True, "formats_count": fmts, "heights": heights, "title": info.get("title", "")[:40]}
        except Exception as e:
            results[name] = {"success": False, "error": str(e).split("\n")[0][:120]}
    return results
