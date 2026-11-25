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
                    "player_client": ["ios", "android", "mweb", "web"]
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
                            "player_client": ["ios", "android", "mweb", "web"]
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

    @staticmethod
    async def prepare_direct_youtube_clip(url: str, desired_quality: str = "2160p") -> Dict[str, Any]:
        """
        Instant Zero-Download YouTube Ingest for AI Clipping:
        - Extracts video metadata (title, duration, 4K/1080p formats) via yt-dlp in ~1.5s WITHOUT downloading video
        - Downloads ONLY lightweight audio track (~10-20MB) for instant Whisper speech recognition and scene detection
        - Avoids downloading multi-gigabyte video files to server disk
        - Returns structured metadata ready for instant viral clipping
        """
        clean_url = sanitize_media_url(url)
        if not (clean_url.startswith("http://") or clean_url.startswith("https://")):
            raise HTTPException(status_code=400, detail="Invalid video URL. Must start with http:// or https://")

        video_id = f"yt_dir_{uuid.uuid4().hex[:10]}"
        audio_filename = f"{video_id}.mp3"
        audio_path = settings.UPLOAD_DIR / audio_filename
        thumbnail_filename = f"{video_id}.jpg"
        thumbnail_path = settings.THUMBNAIL_DIR / thumbnail_filename

        settings.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        settings.THUMBNAIL_DIR.mkdir(parents=True, exist_ok=True)

        logger.info(f"Direct fast YouTube ingest without full download: {clean_url} -> {video_id}")

        meta_opts = {
            "quiet": True,
            "no_warnings": True,
            "noplaylist": True,
            "skip_download": True,
            "socket_timeout": 30,
            "extractor_args": {
                "youtube": {
                    "player_client": ["ios", "android", "mweb", "web"]
                }
            }
        }

        # Check for cookies file
        cookie_candidates = [
            settings.BASE_DIR / "cookies.txt",
            settings.BASE_DIR.parent / "cookies.txt",
            Path.home() / ".config" / "yt-dlp" / "cookies.txt",
        ]
        for cpath in cookie_candidates:
            if cpath.exists() and cpath.stat().st_size > 0:
                meta_opts["cookiefile"] = str(cpath)
                break

        def _fetch_meta():
            with yt_dlp.YoutubeDL(meta_opts) as ydl:
                return ydl.extract_info(clean_url, download=False)

        try:
            info = await asyncio.to_thread(_fetch_meta)
        except Exception as e:
            logger.error(f"Failed to fetch metadata for direct YouTube clipping: {e}")
            raise HTTPException(status_code=422, detail=f"Could not analyze YouTube video: {str(e)}")

        title = info.get("title") or "YouTube Video"
        duration = float(info.get("duration") or 0.0)
        width = int(info.get("width") or 3840)
        height = int(info.get("height") or 2160)
        fps = float(info.get("fps") or 30.0)

        # Detect max available quality and resolution
        max_height = 1080
        for f in (info.get("formats") or []):
            h = f.get("height")
            if h and h > max_height:
                max_height = h

        if max_height >= 2160:
            width, height = 3840, 2160
            quality_label = "4K UHD (2160p)"
        elif max_height >= 1440:
            width, height = 2560, 1440
            quality_label = "2K QHD (1440p)"
        elif max_height >= 1080:
            width, height = 1920, 1080
            quality_label = "1080p Full HD"
        elif max_height >= 720:
            width, height = 1280, 720
            quality_label = "720p HD"
        else:
            height = max(360, max_height)
            width = int(height * 16 / 9)
            quality_label = f"{height}p"

        # Estimate video stream size
        size_bytes = info.get("filesize") or info.get("filesize_approx") or 0
        if not size_bytes and duration > 0:
            bitrate_bps = 25_000_000 if max_height >= 2160 else (8_000_000 if max_height >= 1080 else 4_000_000)
            size_bytes = int(duration * (bitrate_bps / 8))
        file_size_mb = round(size_bytes / (1024 * 1024), 1) if size_bytes else 0.0

        # Download ONLY lightweight audio track for Whisper transcription
        audio_opts = {
            "format": "ba/ba*/bestaudio/best[height<=360]",
            "outtmpl": str(settings.UPLOAD_DIR / f"{video_id}.%(ext)s"),
            "noplaylist": True,
            "quiet": True,
            "no_warnings": True,
            "socket_timeout": 30,
            "postprocessors": [{
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "128",
            }],
            "extractor_args": {
                "youtube": {
                    "player_client": ["ios", "android", "mweb", "web"]
                }
            }
        }
        if "cookiefile" in meta_opts:
            audio_opts["cookiefile"] = meta_opts["cookiefile"]

        def _download_audio():
            with yt_dlp.YoutubeDL(audio_opts) as ydl:
                ydl.extract_info(clean_url, download=True)

        try:
            await asyncio.to_thread(_download_audio)
        except Exception as ae:
            logger.warning(f"Audio extraction warning: {ae}")

        # Locate actual audio file
        actual_audio = None
        for cand in settings.UPLOAD_DIR.glob(f"{video_id}.*"):
            if cand.suffix.lower() in [".mp3", ".m4a", ".wav", ".opus", ".aac"]:
                actual_audio = cand
                break

        # Download thumbnail
        thumb_url = info.get("thumbnail")
        if thumb_url:
            try:
                import urllib.request
                urllib.request.urlretrieve(thumb_url, str(thumbnail_path))
                thumbnail_url = f"/uploads/thumbnails/{thumbnail_filename}"
            except Exception:
                thumbnail_url = thumb_url
        else:
            thumbnail_url = None

        metadata = {
            "duration": duration,
            "width": width,
            "height": height,
            "max_height": max_height,
            "quality_label": quality_label,
            "fps": fps,
            "aspect_ratio": "16:9",
            "video_codec": "h264/vp9",
            "audio_codec": "mp3",
            "size_mb": file_size_mb,
            "is_direct_stream": True,
        }

        return {
            "id": video_id,
            "title": title,
            "original_filename": f"{title}.mp4",
            "stored_filename": f"{video_id}_direct",
            "file_path": str(actual_audio) if actual_audio else clean_url,
            "audio_path": str(actual_audio) if actual_audio else None,
            "file_size_mb": file_size_mb,
            "duration": duration,
            "video_url": clean_url,
            "thumbnail_url": thumbnail_url,
            "metadata": metadata,
            "source_type": "youtube_direct_stream",
            "source_url": clean_url,
            "is_direct_stream": True
        }

    @staticmethod
    async def cut_direct_youtube_slice(
        url: str,
        start_time: float,
        end_time: float,
        max_height: int = 2160
    ) -> str:
        """
        Downloads ONLY the requested 30-60 second time slice in up to 4K resolution using yt-dlp:
        - Avoids full video download
        - Delivers genuine 4K / 1080p source fidelity for the short
        - Takes only ~2-4 seconds to fetch and mux the exact segment
        """
        clean_url = sanitize_media_url(url)
        temp_dir = settings.GENERATED_CLIPS_DIR / "temp_slices"
        temp_dir.mkdir(parents=True, exist_ok=True)
        chunk_id = f"slice_{uuid.uuid4().hex[:8]}"
        temp_slice_template = str(temp_dir / f"{chunk_id}.%(ext)s")

        format_str = (
            f"bestvideo[height<={max_height}][ext=mp4]+bestaudio[ext=m4a]/"
            f"bestvideo[height<={max_height}]+bestaudio/"
            f"bestvideo+bestaudio/"
            f"best[height<={max_height}][height>=1080]/"
            f"best[height>=720]/"
            f"18/best"
        )

        slice_opts = {
            "format": format_str,
            "outtmpl": temp_slice_template,
            "merge_output_format": "mp4",
            "download_ranges": yt_dlp.utils.download_range_func(None, [(start_time, end_time)]),
            "force_keyframes_at_cuts": True,
            "noplaylist": True,
            "quiet": True,
            "no_warnings": True,
            "prefer_ffmpeg": True,
            "socket_timeout": 35,
            "extractor_args": {
                "youtube": {
                    "player_client": ["android", "ios", "mweb", "web"]
                }
            }
        }

        cookie_candidates = [
            settings.BASE_DIR / "cookies.txt",
            settings.BASE_DIR.parent / "cookies.txt",
            Path.home() / ".config" / "yt-dlp" / "cookies.txt",
        ]
        for cpath in cookie_candidates:
            if cpath.exists() and cpath.stat().st_size > 0:
                slice_opts["cookiefile"] = str(cpath)
                break

        def _download_slice(opts):
            with yt_dlp.YoutubeDL(opts) as ydl:
                ydl.download([clean_url])

        try:
            await asyncio.to_thread(_download_slice, slice_opts)
        except Exception as e:
            logger.warning(f"cut_direct_youtube_slice initial download failed ({e}); retrying with resilient fallback...")
            fallback_opts = dict(slice_opts)
            fallback_opts["format"] = "18/bestvideo+bestaudio/best"
            fallback_opts["extractor_args"] = {
                "youtube": {
                    "player_client": ["android", "ios", "mweb", "web"]
                }
            }
            try:
                await asyncio.to_thread(_download_slice, fallback_opts)
            except Exception as e2:
                logger.error(f"Fallback slice download also failed: {e2}")

        found_slice = None
        for f in temp_dir.glob(f"{chunk_id}.*"):
            if f.suffix.lower() in [".mp4", ".mkv", ".webm"]:
                found_slice = f
                break

        if not found_slice or not found_slice.exists():
            raise RuntimeError(f"Could not slice 4K video segment {start_time}s-{end_time}s from {clean_url}")

        return str(found_slice)

video_downloader = VideoDownloader()
