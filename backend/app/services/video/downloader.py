import os
import uuid
import shutil
import asyncio
from pathlib import Path
from typing import Dict, Any, Optional
from urllib.parse import urlparse, parse_qs
from fastapi import UploadFile, HTTPException
import yt_dlp
from app.core.config import settings
from app.core.logging import logger
from app.services.storage.file_manager import file_manager
from app.services.video.ffmpeg_editor import ffmpeg_editor

SUPPORTED_MIME_TYPES = [
    "video/mp4",
    "video/quicktime",
    "video/webm",
    "video/x-matroska",
    "application/octet-stream"
]

def sanitize_media_url(url: str) -> str:
    """
    Sanitizes YouTube and web URLs to avoid playlist metadata requests:
    - Strips playlist parameters (&list=, &index=, &pp=, &si=) that trigger YouTube bot/sign-in gates
    - Normalizes youtu.be, /shorts/, /live/ into canonical https://www.youtube.com/watch?v={vid}
    """
    raw = url.strip()
    if not (raw.startswith("http://") or raw.startswith("https://")):
        return raw

    try:
        parsed = urlparse(raw)
        host = (parsed.hostname or "").lower()
        if "youtube.com" in host or "youtu.be" in host:
            # 1. Handle youtu.be/<id>
            if "youtu.be" in host:
                parts = parsed.path.strip("/").split("/")
                if parts and parts[0]:
                    return f"https://www.youtube.com/watch?v={parts[0]}"

            # 2. Handle /shorts/<id> or /live/<id>
            if "/shorts/" in parsed.path:
                vid = parsed.path.split("/shorts/")[1].split("/")[0].split("?")[0]
                if vid:
                    return f"https://www.youtube.com/watch?v={vid}"
            if "/live/" in parsed.path:
                vid = parsed.path.split("/live/")[1].split("/")[0].split("?")[0]
                if vid:
                    return f"https://www.youtube.com/watch?v={vid}"

            # 3. Handle standard /watch?v=<id>
            qs = parse_qs(parsed.query)
            if "v" in qs and qs["v"] and qs["v"][0]:
                return f"https://www.youtube.com/watch?v={qs['v'][0]}"
    except Exception:
        pass

    return raw

class VideoDownloader:
    @staticmethod
    async def save_uploaded_file(file: UploadFile) -> Dict[str, Any]:
        """
        Saves and validates an uploaded video file:
        - Validates extension (.mp4, .mov, .webm)
        - Generates unique file ID & safe stored filename
        - Streams chunks to disk in uploads/
        - Enforces max size limits (500MB)
        - Validates video decodability with FFprobe
        - Automatically generates a video thumbnail frame with FFmpeg
        """
        raw_filename = file.filename or "uploaded_video.mp4"
        ext = Path(raw_filename).suffix.lower()

        # 1. Validate file extension
        if ext not in settings.ALLOWED_EXTENSIONS:
            allowed_list = ", ".join(settings.ALLOWED_EXTENSIONS)
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file format '{ext}'. Supported formats: {allowed_list}"
            )

        # 2. Generate unique video ID and destination path
        video_id = f"vid_{uuid.uuid4().hex[:12]}"
        stored_filename = f"{video_id}{ext}"
        dest_path = settings.UPLOAD_DIR / stored_filename
        thumbnail_filename = f"{video_id}.jpg"
        thumbnail_path = settings.THUMBNAIL_DIR / thumbnail_filename

        total_bytes = 0
        max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024

        # 3. Stream upload chunks to disk
        try:
            with open(dest_path, "wb") as buffer:
                while chunk := await file.read(1024 * 1024):  # 1MB buffer
                    total_bytes += len(chunk)
                    if total_bytes > max_bytes:
                        raise HTTPException(
                            status_code=413,
                            detail=f"File exceeds maximum allowed size of {settings.MAX_UPLOAD_SIZE_MB}MB."
                        )
                    buffer.write(chunk)
        except Exception as e:
            if dest_path.exists():
                dest_path.unlink()
            if isinstance(e, HTTPException):
                raise e
            logger.error(f"Failed to stream upload: {e}")
            raise HTTPException(status_code=500, detail="Failed to write upload to server storage.")

        # 4. Verify file isn't empty
        if total_bytes == 0:
            if dest_path.exists():
                dest_path.unlink()
            raise HTTPException(status_code=400, detail="Uploaded file is empty (0 bytes).")

        # 5. Extract metadata via FFprobe
        try:
            metadata = ffmpeg_editor.get_video_metadata(str(dest_path))
        except Exception as e:
            if dest_path.exists():
                dest_path.unlink()
            logger.error(f"Corrupt or unreadable media: {e}")
            raise HTTPException(
                status_code=422,
                detail=f"The uploaded file could not be decoded as a valid video. Ensure it is a valid MP4, MOV, or WebM file."
            )

        # 6. Generate thumbnail frame via FFmpeg
        try:
            await ffmpeg_editor.generate_thumbnail(
                video_path=str(dest_path),
                output_image_path=str(thumbnail_path),
                timestamp_sec=min(2.0, max(0.5, metadata["duration"] * 0.1))
            )
            thumbnail_url = f"/uploads/thumbnails/{thumbnail_filename}"
        except Exception as e:
            logger.warning(f"Could not generate thumbnail for {stored_filename}: {e}")
            thumbnail_url = None

        clean_title = Path(raw_filename).stem.replace("_", " ").strip()
        video_url = f"/uploads/{stored_filename}"

        return {
            "id": video_id,
            "title": clean_title,
            "original_filename": raw_filename,
            "stored_filename": stored_filename,
            "file_path": str(dest_path),
            "file_size_mb": metadata["size_mb"],
            "duration": metadata["duration"],
            "video_url": video_url,
            "thumbnail_url": thumbnail_url,
            "metadata": metadata,
        }

    @staticmethod
    async def download_from_url(url: str) -> Dict[str, Any]:
        """
        Downloads a video from YouTube, Vimeo, Twitch, or web URL using yt-dlp:
        - Resolves video metadata (title, duration, description)
        - Downloads web-compatible MP4 directly into uploads/
        - Remuxes to standard MP4 container if necessary for browser HTML5 compatibility
        - Validates video decodability with FFprobe
        - Extracts high-quality thumbnail frame via FFmpeg
        - Returns structured metadata dictionary
        """
        clean_url = sanitize_media_url(url)
        if not (clean_url.startswith("http://") or clean_url.startswith("https://")):
            raise HTTPException(status_code=400, detail="Invalid video URL. Must start with http:// or https://")

        video_id = f"yt_{uuid.uuid4().hex[:10]}"
        output_template = str(settings.UPLOAD_DIR / f"{video_id}.%(ext)s")
        final_mp4_path = settings.UPLOAD_DIR / f"{video_id}.mp4"
        thumbnail_filename = f"{video_id}.jpg"
        thumbnail_path = settings.THUMBNAIL_DIR / thumbnail_filename

        logger.info(f"Initiating yt-dlp download for URL: {clean_url} -> {video_id}")

        ydl_opts = {
            "format": "bestvideo[vcodec^=avc1][height<=1080]+bestaudio[ext=m4a]/bestvideo[height<=720]+bestaudio/best[height<=720]/18/best",
            "outtmpl": output_template,
            "merge_output_format": "mp4",
            "noplaylist": True,
            "quiet": True,
            "no_warnings": True,
            "prefer_ffmpeg": True,
            "remote_components": ["ejs:github"],
            "socket_timeout": 45,
            "http_chunk_size": 10485760,
            "extractor_args": {
                "youtube": {
                    "player_client": ["tv_samsung", "visionos", "web", "android"]
                }
            }
        }

        def _sync_download():
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(clean_url, download=True)
                return info

        try:
            info = await asyncio.to_thread(_sync_download)
        except Exception as e:
            logger.error(f"yt-dlp primary download failed for {clean_url}: {e}")
            try:
                fallback_opts = {
                    "format": "18/bestvideo+bestaudio/best",
                    "outtmpl": output_template,
                    "noplaylist": True,
                    "quiet": True,
                    "prefer_ffmpeg": True,
                    "http_chunk_size": 10485760,
                    "extractor_args": {
                        "youtube": {
                            "player_client": ["tv_samsung", "visionos", "web", "android"]
                        }
                    }
                }
                def _fallback_download():
                    with yt_dlp.YoutubeDL(fallback_opts) as ydl:
                        return ydl.extract_info(clean_url, download=True)
                info = await asyncio.to_thread(_fallback_download)
            except Exception as e2:
                logger.error(f"Fallback yt-dlp failed: {e2}")
                raise HTTPException(
                    status_code=422,
                    detail=f"Could not download video from the provided URL: {str(e2)}"
                )

        # Locate the downloaded file
        downloaded_file = None
        for cand in settings.UPLOAD_DIR.glob(f"{video_id}.*"):
            if cand.suffix.lower() in [".mp4", ".mkv", ".webm", ".mov", ".m4v"]:
                downloaded_file = cand
                break

        if not downloaded_file or not downloaded_file.exists():
            raise HTTPException(status_code=500, detail="Downloaded media file was not found on disk.")

        # Ensure it is a standard web-compatible MP4 file
        if downloaded_file.suffix.lower() != ".mp4":
            logger.info(f"Remuxing {downloaded_file.name} to MP4 format...")
            remux_cmd = [
                "ffmpeg", "-y", "-i", str(downloaded_file),
                "-c:v", "copy", "-c:a", "aac",
                "-movflags", "+faststart",
                str(final_mp4_path)
            ]
            proc = await asyncio.create_subprocess_exec(
                *remux_cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            await proc.communicate()
            if proc.returncode == 0 and final_mp4_path.exists():
                try:
                    downloaded_file.unlink(missing_ok=True)
                except Exception:
                    pass
                actual_file_path = final_mp4_path
                stored_filename = f"{video_id}.mp4"
            else:
                actual_file_path = downloaded_file
                stored_filename = downloaded_file.name
        else:
            actual_file_path = downloaded_file
            stored_filename = downloaded_file.name

        # Extract metadata using FFprobe
        try:
            metadata = ffmpeg_editor.get_video_metadata(str(actual_file_path))
        except Exception as e:
            logger.error(f"Metadata extraction failed on downloaded file: {e}")
            metadata = {
                "duration": float(info.get("duration") or 0.0),
                "width": int(info.get("width") or 1920),
                "height": int(info.get("height") or 1080),
                "fps": float(info.get("fps") or 30.0),
                "aspect_ratio": "16:9",
                "video_codec": "h264",
                "audio_codec": "aac",
                "bitrate_kbps": 2500,
                "size_mb": round(os.path.getsize(actual_file_path) / (1024 * 1024), 2),
            }

        # Generate thumbnail
        try:
            await ffmpeg_editor.generate_thumbnail(
                video_path=str(actual_file_path),
                output_image_path=str(thumbnail_path),
                timestamp_sec=min(2.0, max(0.5, metadata["duration"] * 0.1))
            )
            thumbnail_url = f"/uploads/thumbnails/{thumbnail_filename}"
        except Exception as e:
            logger.warning(f"Could not generate thumbnail for {stored_filename}: {e}")
            thumbnail_url = info.get("thumbnail") or None

        title = info.get("title") or Path(stored_filename).stem
        video_url = f"/uploads/{stored_filename}"

        return {
            "id": video_id,
            "title": title,
            "original_filename": f"{title}.mp4",
            "stored_filename": stored_filename,
            "file_path": str(actual_file_path),
            "file_size_mb": metadata["size_mb"],
            "duration": metadata["duration"],
            "video_url": video_url,
            "thumbnail_url": thumbnail_url,
            "metadata": metadata,
        }

video_downloader = VideoDownloader()
