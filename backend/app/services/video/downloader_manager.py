import os
import re
import time
import uuid
import shutil
import asyncio
import threading
from pathlib import Path
from typing import Dict, List, Any, Optional
from datetime import datetime, timezone
import yt_dlp

from app.core.config import settings
from app.core.logging import logger
from app.core.database import get_database
from app.services.video.downloader import sanitize_media_url

def format_bytes(b: Optional[int]) -> str:
    if not b or b <= 0:
        return "Unknown size"
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if b < 1024.0:
            return f"{b:.1f} {unit}"
        b /= 1024.0
    return f"{b:.1f} PB"

def format_speed(bps: Optional[float]) -> str:
    if not bps or bps <= 0:
        return "0.0 MB/s"
    mbps = bps / (1024 * 1024)
    if mbps < 0.1:
        kbps = bps / 1024
        return f"{kbps:.1f} KB/s"
    return f"{mbps:.1f} MB/s"

def format_eta(seconds: Optional[int]) -> str:
    if not seconds or seconds < 0:
        return "--:--"
    m, s = divmod(int(seconds), 60)
    h, m = divmod(m, 60)
    if h > 0:
        return f"{h:02d}:{m:02d}:{s:02d}"
    return f"{m:02d}:{s:02d}"

def format_duration(seconds: Optional[float]) -> str:
    if not seconds or seconds <= 0:
        return "00:00"
    total_sec = int(seconds)
    m, s = divmod(total_sec, 60)
    h, m = divmod(m, 60)
    if h > 0:
        return f"{h:02d}:{m:02d}:{s:02d}"
    return f"{m:02d}:{s:02d}"

class DownloaderManager:
    """
    Production-grade background Download Manager:
    - Real-time yt-dlp progress hooks (speed, ETA, bytes, percentage)
    - Supports Pause / Resume via range-resuming .part files
    - Start, Pause, Resume, Cancel, Delete tasks
    - Batch operations: Pause All, Resume All, Download All, Clear Completed
    - Persistence in MongoDB + in-memory fast caching
    - High-quality format analysis & selector (4K, 1440p, 1080p, 720p, 480p, 360p, MP3/M4A)
    """

    def __init__(self):
        self._tasks: Dict[str, Dict[str, Any]] = {}
        self._threads: Dict[str, threading.Thread] = {}
        self._stop_flags: Dict[str, threading.Event] = {}
        self._lock = threading.Lock()
        self._initialized = False
        self._main_loop: Optional[asyncio.AbstractEventLoop] = None

    async def initialize(self):
        """Loads existing tasks from database into cache on startup and restores queues safely"""
        try:
            self._main_loop = asyncio.get_running_loop()
        except Exception:
            pass

        if self._initialized:
            return
        db = get_database()
        if db is not None:
            try:
                cursor = db.download_tasks.find().sort("created_at", -1)
                async for doc in cursor:
                    doc["_id"] = str(doc.get("_id", ""))
                    target_dir = Path(doc.get("destination_dir") or settings.DOWNLOADS_DIR)
                    task_id = doc.get("task_id")

                    # Scan disk for partial files
                    found_part_size = 0
                    if target_dir.exists():
                        for p in target_dir.glob(f"{task_id}.*"):
                            if p.name.endswith(".part") or p.name.endswith(".ytdl"):
                                try:
                                    found_part_size = max(found_part_size, p.stat().st_size)
                                except Exception:
                                    pass

                    if found_part_size > 0:
                        doc["downloaded_bytes"] = found_part_size
                        if doc.get("total_bytes") and doc["total_bytes"] > 0:
                            doc["progress_percentage"] = min(99.0, round((found_part_size / doc["total_bytes"]) * 100.0, 1))

                    # If server restarted while downloading, set to interrupted (safe recovery state)
                    if doc.get("status") in ["downloading", "queued"]:
                        doc["status"] = "interrupted"
                        doc["speed_formatted"] = "Interrupted"
                        doc["eta_formatted"] = "Interrupted"
                        doc["error_message"] = f"Backend was restarted. Partial media preserved safely ({format_bytes(found_part_size)}). Ready to resume."
                        await db.download_tasks.update_one(
                            {"task_id": doc["task_id"]},
                            {"$set": {
                                "status": "interrupted",
                                "speed_formatted": "Interrupted",
                                "eta_formatted": "Interrupted",
                                "downloaded_bytes": doc["downloaded_bytes"],
                                "progress_percentage": doc["progress_percentage"],
                                "error_message": doc["error_message"]
                            }}
                        )
                    self._tasks[doc["task_id"]] = doc
            except Exception as e:
                logger.warning(f"Could not load download tasks from MongoDB: {e}")
        self._initialized = True

    def _sync_save_task(self, task: Dict[str, Any]):
        """Persists task state to MongoDB asynchronously without blocking"""
        db = get_database()
        if db is not None:
            try:
                if self._main_loop and self._main_loop.is_running():
                    asyncio.run_coroutine_threadsafe(
                        self._persist_task_mongo(task.copy()),
                        self._main_loop
                    )
                else:
                    loop = asyncio.get_event_loop()
                    if loop.is_running():
                        asyncio.create_task(self._persist_task_mongo(task.copy()))
            except Exception as e:
                logger.error(f"Error scheduling MongoDB task persistence: {e}")

    async def _persist_task_mongo(self, task_data: Dict[str, Any]):
        db = get_database()
        if db is not None:
            try:
                task_id = task_data.get("task_id")
                await db.download_tasks.update_one(
                    {"task_id": task_id},
                    {"$set": task_data},
                    upsert=True
                )
            except Exception as e:
                logger.error(f"Failed to persist download task {task_data.get('task_id')}: {e}")

    def analyze_url(self, raw_url: str) -> Dict[str, Any]:
        """
        Extracts rich metadata and selectable quality streams without downloading
        """
        clean_url = sanitize_media_url(raw_url)
        ydl_opts = {
            "extract_flat": False,
            "quiet": True,
            "no_warnings": True,
            "skip_download": True,
            "socket_timeout": 30,
        }

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(clean_url, download=False)
        except Exception:
            fallback_opts = {
                "extract_flat": False,
                "quiet": True,
                "no_warnings": True,
                "skip_download": True,
                "socket_timeout": 30,
                "extractor_args": {
                    "youtube": {
                        "player_client": ["web_embedded", "android"]
                    }
                }
            }
            with yt_dlp.YoutubeDL(fallback_opts) as ydl:
                info = ydl.extract_info(clean_url, download=False)

        video_id = info.get("id", "")
        title = info.get("title", "Unknown Title")
        duration = info.get("duration", 0)
        uploader = info.get("uploader") or info.get("channel") or info.get("creator") or "Unknown Creator"
        view_count = info.get("view_count", 0)
        thumbnail = info.get("thumbnail") or (info.get("thumbnails")[-1]["url"] if info.get("thumbnails") else None)
        description = (info.get("description") or "")[:200]

        # Extract available formats
        raw_formats = info.get("formats", [])
        available_formats: List[Dict[str, Any]] = []

        # Locate audio streams to compute accurate combined file size
        audio_streams = [f for f in raw_formats if f.get("vcodec") == "none" and f.get("acodec") != "none"]
        best_audio = sorted(audio_streams, key=lambda x: x.get("abr") or 0, reverse=True)[0] if audio_streams else None
        audio_bytes = (best_audio.get("filesize") or best_audio.get("filesize_approx")) if best_audio else None
        if not audio_bytes and duration > 0:
            audio_bytes = int((128 * 1000 / 8) * duration)
        elif not audio_bytes:
            audio_bytes = 0

        # Resolution targets with exact height and width ranges for accurate stream isolation
        target_res = [
            {"name": "4K Ultra HD", "height": 2160, "res_label": "2160p (4K)", "min_h": 1800, "min_w": 3200, "typical_kbps": 14000},
            {"name": "2K Quad HD", "height": 1440, "res_label": "1440p (2K)", "min_h": 1200, "min_w": 2200, "typical_kbps": 7000},
            {"name": "Full HD", "height": 1080, "res_label": "1080p FHD", "min_h": 850, "min_w": 1500, "typical_kbps": 2200},
            {"name": "HD Standard", "height": 720, "res_label": "720p HD", "min_h": 600, "min_w": 1000, "typical_kbps": 1100},
            {"name": "SD Medium", "height": 480, "res_label": "480p SD", "min_h": 400, "min_w": 650, "typical_kbps": 550},
            {"name": "Compact", "height": 360, "res_label": "360p", "min_h": 300, "min_w": 450, "typical_kbps": 320}
        ]

        found_heights = set()
        ydl_selector = yt_dlp.YoutubeDL({"quiet": True, "no_warnings": True, "skip_download": True})

        for target in target_res:
            fmt_id = f"bestvideo[height<={target['height']}]+bestaudio/best[height<={target['height']}]/best"
            try:
                selector_fn = ydl_selector.build_format_selector(fmt_id)
                chosen = list(selector_fn({"formats": raw_formats}))
                if chosen:
                    sel = chosen[0]
                    rf = sel.get("requested_formats")
                    v = rf[0] if rf else sel
                    a = rf[1] if (rf and len(rf) > 1) else None

                    v_h = v.get("height") or 0
                    v_w = v.get("width") or 0
                    if v_h < target["min_h"] and v_w < target["min_w"]:
                        continue

                    if target["height"] in found_heights:
                        continue
                    found_heights.add(target["height"])

                    fps = int(v.get("fps") or 30)
                    v_sz = v.get("filesize") or v.get("filesize_approx")
                    a_sz = (a.get("filesize") or a.get("filesize_approx")) if a else audio_bytes

                    if v_sz and v_sz > 0:
                        total_size = v_sz + (a_sz or 0)
                        size_str = format_bytes(total_size)
                    elif duration > 0:
                        kbps = v.get("vbr") or v.get("tbr") or target["typical_kbps"]
                        total_size = int((kbps * 1000 / 8) * duration) + (a_sz or 0)
                        size_str = f"~{format_bytes(total_size)}"
                    else:
                        total_size = None
                        size_str = "Adaptive Size"

                    is_recommended = target["height"] == 1080 or (target["height"] == 720 and 1080 not in found_heights)

                    available_formats.append({
                        "format_id": fmt_id,
                        "label": f"{target['name']} ({target['res_label']})",
                        "resolution": target["res_label"],
                        "height": target["height"],
                        "fps": fps,
                        "ext": "mp4",
                        "filesize_bytes": total_size,
                        "filesize_formatted": size_str,
                        "type": "video",
                        "recommended": is_recommended,
                        "badge": f"{fps}fps • MP4"
                    })
            except Exception as e:
                logger.warning(f"Error evaluating format for {target['res_label']}: {e}")

        # Fallback if no specific video heights parsed
        if not available_formats:
            available_formats.append({
                "format_id": "bestvideo+bestaudio/best",
                "label": "Best Available Quality",
                "resolution": "Original",
                "height": 1080,
                "fps": 30,
                "ext": "mp4",
                "filesize_bytes": 0,
                "filesize_formatted": "Auto",
                "type": "video",
                "recommended": True,
                "badge": "MP4"
            })

        # Add High Quality Audio options (MP3 & M4A)
        audio_size_approx = int((192 * 1000 / 8) * duration) if duration else 0
        available_formats.append({
            "format_id": "bestaudio/best",
            "label": "High Quality Audio (MP3 320k)",
            "resolution": "320 kbps",
            "height": 0,
            "fps": 0,
            "ext": "mp3",
            "filesize_bytes": audio_size_approx,
            "filesize_formatted": format_bytes(audio_size_approx) if audio_size_approx else "15-40 MB",
            "type": "audio",
            "recommended": False,
            "badge": "320k • MP3"
        })
        available_formats.append({
            "format_id": "bestaudio[ext=m4a]/bestaudio/best",
            "label": "Original Studio Audio (M4A AAC)",
            "resolution": "Lossless AAC",
            "height": 0,
            "fps": 0,
            "ext": "m4a",
            "filesize_bytes": audio_size_approx,
            "filesize_formatted": format_bytes(audio_size_approx) if audio_size_approx else "10-30 MB",
            "type": "audio",
            "recommended": False,
            "badge": "Lossless • M4A"
        })

        return {
            "url": clean_url,
            "video_id": video_id,
            "title": title,
            "uploader": uploader,
            "duration": duration,
            "duration_formatted": format_duration(duration),
            "view_count": view_count,
            "view_count_formatted": f"{view_count:,} views" if view_count else "N/A",
            "thumbnail": thumbnail,
            "description": description,
            "formats": available_formats
        }

    def create_task(
        self,
        url: str,
        format_id: str,
        ext: str,
        resolution: str,
        save_destination: str = "downloads",
        custom_path: Optional[str] = None,
        title: Optional[str] = None,
        thumbnail: Optional[str] = None,
        estimated_size: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Creates and registers a new download task with deduplication
        """
        clean_url = sanitize_media_url(url)

        # Deduplication check: avoid duplicate download tasks for the same media
        with self._lock:
            for existing in self._tasks.values():
                if existing.get("url") == clean_url and existing.get("format_id") == format_id:
                    st = existing.get("status")
                    if st in ["downloading", "queued", "paused", "interrupted"]:
                        logger.info(f"Duplicate download task requested for {clean_url}. Returning existing task {existing['task_id']} (status: {st})")
                        return existing
                    elif st == "completed":
                        out_p = existing.get("output_path")
                        if out_p and Path(out_p).exists():
                            logger.info(f"Completed task already exists on disk for {clean_url}. Returning existing task {existing['task_id']}")
                            return existing

        task_id = f"dl_{uuid.uuid4().hex[:10]}"
        now = datetime.now(timezone.utc).isoformat()

        # Determine target folder
        if save_destination == "projects":
            target_dir = settings.UPLOAD_DIR
        elif save_destination == "custom" and custom_path:
            target_dir = Path(custom_path).expanduser().resolve()
            target_dir.mkdir(parents=True, exist_ok=True)
        else:
            target_dir = settings.DOWNLOADS_DIR

        target_dir.mkdir(parents=True, exist_ok=True)

        task = {
            "task_id": task_id,
            "url": clean_url,
            "title": title or "Analyzing video stream...",
            "thumbnail": thumbnail,
            "format_id": format_id,
            "ext": ext.lower().replace(".", ""),
            "resolution": resolution,
            "save_destination": save_destination,
            "destination_dir": str(target_dir),
            "output_path": None,
            "output_filename": None,
            "download_url": None,
            "status": "queued",  # queued, downloading, paused, completed, cancelled, failed
            "downloaded_bytes": 0,
            "total_bytes": estimated_size or 0,
            "progress_percentage": 0.0,
            "speed_bytes_sec": 0.0,
            "speed_formatted": "0.0 MB/s",
            "eta_seconds": 0,
            "eta_formatted": "--:--",
            "error_message": None,
            "created_at": now,
            "updated_at": now,
            "completed_at": None
        }

        with self._lock:
            self._tasks[task_id] = task

        self._sync_save_task(task)
        return task

    def start_download(self, task_id: str) -> Dict[str, Any]:
        """Starts or resumes downloading task in a background worker thread"""
        with self._lock:
            if task_id not in self._tasks:
                raise ValueError(f"Task {task_id} not found")
            task = self._tasks[task_id]
            if task["status"] == "downloading":
                return task

            stop_event = threading.Event()
            self._stop_flags[task_id] = stop_event
            task["status"] = "downloading"
            task["updated_at"] = datetime.now(timezone.utc).isoformat()

        self._sync_save_task(task)

        t = threading.Thread(
            target=self._run_download_worker,
            args=(task_id, stop_event),
            daemon=True
        )
        self._threads[task_id] = t
        t.start()
        return task

    def _run_download_worker(self, task_id: str, stop_event: threading.Event):
        """Worker thread executing yt-dlp with range continuation and live progress reporting"""
        task = self._tasks.get(task_id)
        if not task:
            return

        clean_url = task["url"]
        target_dir = Path(task["destination_dir"])
        target_dir.mkdir(parents=True, exist_ok=True)
        ext = task["ext"]
        outtmpl = str(target_dir / f"{task_id}.%(ext)s")

        def progress_hook(d: Dict[str, Any]):
            if stop_event.is_set():
                raise KeyboardInterrupt("Download paused by user")

            status = d.get("status")
            if status == "downloading":
                downloaded = d.get("downloaded_bytes") or 0
                total = d.get("total_bytes") or d.get("total_bytes_estimate") or task.get("total_bytes") or 0
                speed = d.get("speed") or 0.0
                eta = d.get("eta") or 0

                percent = 0.0
                if total > 0:
                    percent = min(100.0, round((downloaded / total) * 100.0, 1))

                with self._lock:
                    if task_id in self._tasks:
                        t = self._tasks[task_id]
                        t["downloaded_bytes"] = downloaded
                        if total > 0:
                            t["total_bytes"] = total
                        t["progress_percentage"] = percent
                        t["speed_bytes_sec"] = speed
                        t["speed_formatted"] = format_speed(speed)
                        t["eta_seconds"] = eta
                        t["eta_formatted"] = format_eta(eta)
                        t["status"] = "downloading"
                        t["updated_at"] = datetime.now(timezone.utc).isoformat()

            elif status == "finished":
                with self._lock:
                    if task_id in self._tasks:
                        t = self._tasks[task_id]
                        t["progress_percentage"] = 99.0
                        t["status"] = "processing"
                        t["speed_formatted"] = "Finishing..."

        ydl_opts: Dict[str, Any] = {
            "format": task["format_id"],
            "outtmpl": outtmpl,
            "noplaylist": True,
            "quiet": True,
            "no_warnings": True,
            "progress_hooks": [progress_hook],
            "prefer_ffmpeg": True,
            "http_chunk_size": 10485760,  # 10MB chunks
            "socket_timeout": 60,
        }

        # If audio format chosen, configure audio extraction
        if ext in ["mp3", "m4a"]:
            ydl_opts["format"] = "bestaudio/best"
            ydl_opts["postprocessors"] = [{
                "key": "FFmpegExtractAudio",
                "preferredcodec": ext,
                "preferredquality": "320" if ext == "mp3" else "192",
            }]
        else:
            ydl_opts["merge_output_format"] = ext

        max_attempts = 4

        for attempt in range(max_attempts):
            if stop_event.is_set():
                with self._lock:
                    if task_id in self._tasks:
                        t = self._tasks[task_id]
                        t["status"] = "paused"
                        t["speed_formatted"] = "Paused"
                        t["eta_formatted"] = "Paused"
                        t["updated_at"] = datetime.now(timezone.utc).isoformat()
                self._sync_save_task(self._tasks[task_id])
                return

            try:
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    info = ydl.extract_info(clean_url, download=True)
                    title = info.get("title") or task["title"]
                    thumbnail = info.get("thumbnail") or task["thumbnail"]

                # Locate completed file
                found_file: Optional[Path] = None
                for p in target_dir.glob(f"{task_id}.*"):
                    if not p.name.endswith(".part") and not p.name.endswith(".ytdl"):
                        found_file = p
                        break

                if not found_file or not found_file.exists():
                    raise FileNotFoundError(f"Target download file was not created in {target_dir}")

                file_size = found_file.stat().st_size
                if file_size == 0:
                    raise ValueError("Downloaded file is 0 bytes.")

                safe_title = re.sub(r'[\\/*?:"<>|]', "", title).strip() or "video"
                final_name = f"{safe_title[:60]}_{task_id[-4:]}.{found_file.suffix.lstrip('.')}"
                final_path = target_dir / final_name

                # Rename to friendly user-facing name
                if found_file != final_path:
                    shutil.move(str(found_file), str(final_path))

                # Set download URL
                if task["save_destination"] == "projects":
                    download_url = f"/uploads/{final_path.name}"
                else:
                    download_url = f"/downloads/{final_path.name}"

                with self._lock:
                    if task_id in self._tasks:
                        t = self._tasks[task_id]
                        t["status"] = "completed"
                        t["title"] = title
                        t["thumbnail"] = thumbnail
                        t["output_path"] = str(final_path)
                        t["output_filename"] = final_path.name
                        t["download_url"] = download_url
                        t["downloaded_bytes"] = file_size
                        t["total_bytes"] = file_size
                        t["progress_percentage"] = 100.0
                        t["speed_formatted"] = "0.0 MB/s"
                        t["eta_formatted"] = "Completed"
                        t["error_message"] = None
                        now_str = datetime.now(timezone.utc).isoformat()
                        t["completed_at"] = now_str
                        t["updated_at"] = now_str

                self._sync_save_task(self._tasks[task_id])
                logger.info(f"Download task {task_id} completed successfully -> {final_path.name}")
                return

            except KeyboardInterrupt:
                # User paused the task
                with self._lock:
                    if task_id in self._tasks:
                        t = self._tasks[task_id]
                        t["status"] = "paused"
                        t["speed_formatted"] = "Paused"
                        t["eta_formatted"] = "Paused"
                        t["updated_at"] = datetime.now(timezone.utc).isoformat()
                self._sync_save_task(self._tasks[task_id])
                logger.info(f"Download task {task_id} paused by user")
                return

            except Exception as e:
                if stop_event.is_set():
                    with self._lock:
                        if task_id in self._tasks:
                            t = self._tasks[task_id]
                            t["status"] = "paused"
                            t["speed_formatted"] = "Paused"
                            t["eta_formatted"] = "Paused"
                            t["updated_at"] = datetime.now(timezone.utc).isoformat()
                    self._sync_save_task(self._tasks[task_id])
                    return

                err_msg = str(e)
                # Check if partial file exists on disk
                saved_bytes = 0
                for p in target_dir.glob(f"{task_id}.*"):
                    if p.name.endswith(".part") or p.name.endswith(".ytdl"):
                        try:
                            saved_bytes = max(saved_bytes, p.stat().st_size)
                        except Exception:
                            pass

                if attempt < max_attempts - 1:
                    backoff = min(20.0, 2.0 * (2 ** attempt))
                    logger.warning(f"Task {task_id} interrupted (attempt {attempt + 1}/{max_attempts}): {err_msg}. Auto-retrying in {int(backoff)}s...")
                    with self._lock:
                        if task_id in self._tasks:
                            t = self._tasks[task_id]
                            t["status"] = "connecting"
                            t["speed_formatted"] = f"Reconnecting in {int(backoff)}s..."
                            t["error_message"] = f"Network disconnected ({err_msg[:60]}). Auto-retrying with backoff (Attempt {attempt + 2}/{max_attempts}). Partial media preserved ({format_bytes(saved_bytes)})."
                            t["updated_at"] = datetime.now(timezone.utc).isoformat()
                    self._sync_save_task(self._tasks[task_id])

                    # Sleep with responsive stop check
                    for _ in range(int(backoff / 0.2)):
                        if stop_event.is_set():
                            return
                        time.sleep(0.2)
                else:
                    # All automatic retries exhausted (Mac asleep or prolonged network loss)
                    # Safely transition to INTERRUPTED (not failed!), keeping partial files intact on disk
                    logger.warning(f"Download task {task_id} set to INTERRUPTED state after {max_attempts} attempts. Preserved {saved_bytes} bytes.")
                    with self._lock:
                        if task_id in self._tasks:
                            t = self._tasks[task_id]
                            t["status"] = "interrupted"
                            t["speed_formatted"] = "Interrupted"
                            t["eta_formatted"] = "Interrupted"
                            t["error_message"] = f"Download interrupted ({err_msg[:80]}). Partial download saved safely ({format_bytes(saved_bytes)}). Ready to resume."
                            t["updated_at"] = datetime.now(timezone.utc).isoformat()
                    self._sync_save_task(self._tasks[task_id])
                    return

    def pause_download(self, task_id: str) -> Dict[str, Any]:
        """Pauses an active download, preserving downloaded bytes in .part file"""
        with self._lock:
            if task_id not in self._tasks:
                raise ValueError(f"Task {task_id} not found")
            task = self._tasks[task_id]
            if task["status"] != "downloading":
                return task

            if task_id in self._stop_flags:
                self._stop_flags[task_id].set()

            task["status"] = "paused"
            task["speed_formatted"] = "Paused"
            task["eta_formatted"] = "Paused"
            task["updated_at"] = datetime.now(timezone.utc).isoformat()

        self._sync_save_task(task)
        return task

    def resume_download(self, task_id: str) -> Dict[str, Any]:
        """Resumes a paused download using HTTP Range continuation"""
        with self._lock:
            if task_id not in self._tasks:
                raise ValueError(f"Task {task_id} not found")
            task = self._tasks[task_id]
            if task["status"] in ["completed", "downloading"]:
                return task

        return self.start_download(task_id)

    def cancel_download(self, task_id: str) -> Dict[str, Any]:
        """Cancels downloading task and cleans up any partial .part files"""
        with self._lock:
            if task_id not in self._tasks:
                raise ValueError(f"Task {task_id} not found")
            task = self._tasks[task_id]

            if task_id in self._stop_flags:
                self._stop_flags[task_id].set()

            task["status"] = "cancelled"
            task["progress_percentage"] = 0.0
            task["speed_formatted"] = "Cancelled"
            task["eta_formatted"] = "--:--"
            task["updated_at"] = datetime.now(timezone.utc).isoformat()

        # Delete any temporary .part or .ytdl files
        target_dir = Path(task["destination_dir"])
        for p in target_dir.glob(f"{task_id}.*"):
            try:
                p.unlink(missing_ok=True)
            except Exception:
                pass

        self._sync_save_task(task)
        return task

    def delete_task(self, task_id: str) -> bool:
        """Deletes task record and its files from disk and database"""
        task = None
        with self._lock:
            if task_id in self._tasks:
                task = self._tasks.pop(task_id)
            if task_id in self._stop_flags:
                self._stop_flags[task_id].set()
                self._stop_flags.pop(task_id, None)
            self._threads.pop(task_id, None)

        if not task:
            return False

        # Clean files
        try:
            if task.get("output_path") and Path(task["output_path"]).exists():
                Path(task["output_path"]).unlink(missing_ok=True)
            target_dir = Path(task["destination_dir"])
            for p in target_dir.glob(f"{task_id}.*"):
                p.unlink(missing_ok=True)
        except Exception as e:
            logger.warning(f"Error deleting files for task {task_id}: {e}")

        # Remove from MongoDB
        db = get_database()
        if db is not None:
            try:
                if self._main_loop and self._main_loop.is_running():
                    asyncio.run_coroutine_threadsafe(
                        db.download_tasks.delete_one({"task_id": task_id}),
                        self._main_loop
                    )
                else:
                    loop = asyncio.get_event_loop()
                    if loop.is_running():
                        asyncio.create_task(db.download_tasks.delete_one({"task_id": task_id}))
            except Exception:
                pass

        return True

    def get_all_tasks(self) -> List[Dict[str, Any]]:
        with self._lock:
            tasks_list = list(self._tasks.values())
        return sorted(tasks_list, key=lambda x: x.get("created_at", ""), reverse=True)

    def get_task(self, task_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            return self._tasks.get(task_id)

    def pause_all(self) -> List[Dict[str, Any]]:
        with self._lock:
            active_ids = [t["task_id"] for t in self._tasks.values() if t["status"] == "downloading"]
        for tid in active_ids:
            self.pause_download(tid)
        return self.get_all_tasks()

    def resume_all(self) -> List[Dict[str, Any]]:
        with self._lock:
            paused_ids = [t["task_id"] for t in self._tasks.values() if t["status"] in ["paused", "queued", "interrupted"]]
        for tid in paused_ids:
            self.resume_download(tid)
        return self.get_all_tasks()

    def retry_failed(self) -> List[Dict[str, Any]]:
        with self._lock:
            failed_ids = [t["task_id"] for t in self._tasks.values() if t["status"] in ["failed", "interrupted"]]
        for tid in failed_ids:
            self.resume_download(tid)
        return self.get_all_tasks()

    def cancel_all(self) -> List[Dict[str, Any]]:
        with self._lock:
            active_ids = [t["task_id"] for t in self._tasks.values() if t["status"] in ["downloading", "queued", "connecting", "paused", "interrupted"]]
        for tid in active_ids:
            self.cancel_download(tid)
        return self.get_all_tasks()

    def download_all(self) -> List[Dict[str, Any]]:
        return self.resume_all()

    def clear_completed(self) -> List[Dict[str, Any]]:
        with self._lock:
            completed_ids = [t["task_id"] for t in self._tasks.values() if t["status"] in ["completed", "cancelled", "failed"]]
        for tid in completed_ids:
            # We remove them from active list, preserving file on disk
            with self._lock:
                task = self._tasks.pop(tid, None)
            if task:
                db = get_database()
                if db is not None:
                    try:
                        loop = asyncio.get_event_loop()
                        if loop.is_running():
                            asyncio.create_task(db.download_tasks.delete_one({"task_id": tid}))
                    except Exception:
                        pass
        return self.get_all_tasks()

    def get_history(self) -> List[Dict[str, Any]]:
        tasks = self.get_all_tasks()
        return [t for t in tasks if t["status"] == "completed"]

downloader_manager = DownloaderManager()
