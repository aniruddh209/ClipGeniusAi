import os
import shutil
import asyncio
import subprocess
import json
from pathlib import Path
from typing import Dict, Any, List, Optional
from datetime import datetime

from app.core.config import settings
from app.core.logging import logger
from app.services.video.ffmpeg_editor import ffmpeg_editor

class MacOSVideoExporter:
    """
    macOS-Compatible Video File Management, Export, and Format Conversion Engine.
    Engineered for MacBook / macOS users with Apple Silicon & QuickTime optimization.
    """

    SUPPORTED_FORMATS = {
        "mp4_h264": {
            "name": "MP4 (H.264)",
            "extension": ".mp4",
            "vcodec": "libx264",
            "acodec": "aac",
            "description": "Universal Apple & Web compatibility. Playable in QuickTime, iOS, Safari.",
            "apple_compatible": True,
        },
        "mp4_hevc": {
            "name": "MP4 (H.265 / HEVC)",
            "extension": ".mp4",
            "vcodec": "libx265",
            "acodec": "aac",
            "description": "High efficiency HEVC tagged with 'hvc1' for native macOS QuickTime playback.",
            "apple_compatible": True,
        },
        "mov": {
            "name": "MOV (QuickTime Native)",
            "extension": ".mov",
            "vcodec": "libx264",
            "acodec": "aac",
            "description": "macOS QuickTime container for Final Cut Pro and native Apple playback.",
            "apple_compatible": True,
        },
        "webm": {
            "name": "WebM (VP9 / Opus)",
            "extension": ".webm",
            "vcodec": "libvpx-vp9",
            "acodec": "libopus",
            "description": "Modern open web format with VP9 video and Opus high-fidelity audio.",
            "apple_compatible": False,  # QuickTime requires third-party components for WebM
        },
        "original": {
            "name": "Original Source Format",
            "extension": "",  # inferred from source
            "vcodec": "copy",
            "acodec": "copy",
            "description": "Bit-for-bit lossless source container without re-encoding.",
            "apple_compatible": True,
        }
    }

    QUALITY_PRESETS = {
        "original": {"label": "Original Source Quality", "max_dim": 0},
        "4k": {"label": "4K Ultra HD (2160p)", "max_dim": 3840, "min_dim": 2160},
        "2k": {"label": "2K Quad HD (1440p)", "max_dim": 2560, "min_dim": 1440},
        "1080p": {"label": "1080p Full HD", "max_dim": 1920, "min_dim": 1080},
        "720p": {"label": "720p HD", "max_dim": 1280, "min_dim": 720},
        "480p": {"label": "480p SD", "max_dim": 854, "min_dim": 480},
    }

    def __init__(self):
        self.ffmpeg_path = shutil.which("ffmpeg") or ("/opt/homebrew/bin/ffmpeg" if os.path.exists("/opt/homebrew/bin/ffmpeg") else "ffmpeg")
        self.ffprobe_path = shutil.which("ffprobe") or ("/opt/homebrew/bin/ffprobe" if os.path.exists("/opt/homebrew/bin/ffprobe") else "ffprobe")

    def get_supported_formats(self) -> List[Dict[str, Any]]:
        return [
            {
                "id": k,
                **v
            }
            for k, v in self.SUPPORTED_FORMATS.items()
        ]

    def get_available_qualities(self, source_path: str) -> List[Dict[str, Any]]:
        """
        Determines genuine available export qualities based on the source video resolution.
        Enforces rule: Never upscale and claim genuine 4K / 2K quality.
        """
        if not Path(source_path).exists():
            raise FileNotFoundError(f"Source file not found at {source_path}")

        meta = ffmpeg_editor.get_video_metadata(source_path)
        src_w = meta.get("width", 1920)
        src_h = meta.get("height", 1080)
        src_max = max(src_w, src_h)
        src_min = min(src_w, src_h)

        qualities = []
        for q_id, q_info in self.QUALITY_PRESETS.items():
            if q_id == "original":
                qualities.append({
                    "id": "original",
                    "label": f"Original ({src_w}x{src_h})",
                    "available": True,
                    "resolution": f"{src_w}x{src_h}",
                    "reason": "Preserves native source resolution"
                })
            elif q_id == "4k":
                # Only genuinely available if source is 4K
                is_available = src_max >= 3840 or src_min >= 2160
                qualities.append({
                    "id": "4k",
                    "label": "4K Ultra HD (2160p)",
                    "available": is_available,
                    "resolution": "3840x2160" if src_w >= src_h else "2160x3840",
                    "reason": "Source has genuine 4K resolution" if is_available else f"Unavailable: source is {src_w}x{src_h} (no fake upscaling)"
                })
            elif q_id == "2k":
                is_available = src_max >= 2560 or src_min >= 1440
                qualities.append({
                    "id": "2k",
                    "label": "2K Quad HD (1440p)",
                    "available": is_available,
                    "resolution": "2560x1440" if src_w >= src_h else "1440x2560",
                    "reason": "Source has genuine 2K resolution" if is_available else f"Unavailable: source is {src_w}x{src_h}"
                })
            elif q_id == "1080p":
                is_available = src_max >= 1280
                qualities.append({
                    "id": "1080p",
                    "label": "1080p Full HD",
                    "available": is_available,
                    "resolution": "1920x1080" if src_w >= src_h else "1080x1920",
                    "reason": "Standard high-definition export"
                })
            elif q_id == "720p":
                qualities.append({
                    "id": "720p",
                    "label": "720p HD",
                    "available": True,
                    "resolution": "1280x720" if src_w >= src_h else "720x1280",
                    "reason": "Optimized for mobile sharing and smaller file size"
                })
            elif q_id == "480p":
                qualities.append({
                    "id": "480p",
                    "label": "480p SD",
                    "available": True,
                    "resolution": "854x480" if src_w >= src_h else "480x854",
                    "reason": "Lightweight preview format"
                })

        return qualities

    def get_standard_macos_directories(self) -> List[Dict[str, Any]]:
        """
        Returns accessible standard macOS user folders for video export and storage.
        """
        home = Path.home()
        candidates = [
            {"id": "downloads", "name": "Downloads", "path": str(home / "Downloads"), "icon": "download"},
            {"id": "movies", "name": "Movies", "path": str(home / "Movies"), "icon": "film"},
            {"id": "desktop", "name": "Desktop", "path": str(home / "Desktop"), "icon": "monitor"},
            {"id": "app_downloads", "name": "ClipGenius Storage", "path": str(settings.DOWNLOADS_DIR), "icon": "hard-drive"},
        ]

        results = []
        for c in candidates:
            p = Path(c["path"])
            exists = p.exists()
            writable = os.access(p, os.W_OK) if exists else False
            free_gb = 0.0
            if exists:
                try:
                    usage = shutil.disk_usage(p)
                    free_gb = round(usage.free / (1024 ** 3), 1)
                except Exception:
                    pass
            results.append({
                **c,
                "exists": exists,
                "writable": writable,
                "free_space_gb": free_gb
            })
        return results

    async def export_video(
        self,
        source_path: str,
        target_format: str = "mp4_h264",
        target_quality: str = "original",
        destination_dir: Optional[str] = None,
        custom_filename: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Executes actual FFmpeg format conversion and macOS optimization:
        - Never simply renames files.
        - Employs Apple HEVC `hvc1` tags for QuickTime playback.
        - Employs stream copy `-c copy` when container change permits lossless execution.
        - Preserves audio synchronization (-avoid_negative_ts make_zero -async 1).
        - Validates that source resolution genuinely supports the requested target quality.
        """
        src = Path(source_path)
        if not src.exists():
            raise FileNotFoundError(f"Source video file not found at {source_path}")

        meta = ffmpeg_editor.get_video_metadata(str(src))
        src_w = meta.get("width", 1920)
        src_h = meta.get("height", 1080)
        src_codec = meta.get("video_codec", "h264")
        src_acodec = meta.get("audio_codec", "aac")
        src_fps = meta.get("fps", 30.0)

        # Validate genuine quality availability
        if target_quality == "4k" and max(src_w, src_h) < 3840 and min(src_w, src_h) < 2160:
            raise ValueError(
                f"Source resolution is {src_w}x{src_h}. Genuine 4K export requires a native 4K source. "
                "ClipGenius AI never upscales lower resolutions to claim genuine 4K quality."
            )
        if target_quality == "2k" and max(src_w, src_h) < 2560 and min(src_w, src_h) < 1440:
            raise ValueError(
                f"Source resolution is {src_w}x{src_h}. Genuine 2K export requires a native 2K source."
            )

        format_info = self.SUPPORTED_FORMATS.get(target_format, self.SUPPORTED_FORMATS["mp4_h264"])
        ext = format_info["extension"] if format_info["extension"] else src.suffix

        # Determine destination folder
        if destination_dir:
            dest_dir = Path(destination_dir)
        else:
            dest_dir = settings.DOWNLOADS_DIR
        dest_dir.mkdir(parents=True, exist_ok=True)

        # Build clean filename
        base_name = custom_filename or src.stem
        # Clean any invalid filename characters
        clean_base = "".join(c for c in base_name if c.isalnum() or c in (" ", "_", "-", ".")).strip()
        if not clean_base:
            clean_base = "export_video"

        # Tag filename with format & quality if not original
        tag_str = ""
        if target_quality != "original":
            tag_str += f"_{target_quality}"
        if target_format == "mp4_hevc":
            tag_str += "_hevc"

        final_filename = f"{clean_base}{tag_str}{ext}"
        out_path = dest_dir / final_filename

        # If file already exists with same name, add numeric increment
        counter = 1
        while out_path.exists() and out_path != src:
            final_filename = f"{clean_base}{tag_str}_{counter}{ext}"
            out_path = dest_dir / final_filename
            counter += 1

        # Check for fast stream copy opportunity (lossless 0-reencoding container change)
        can_stream_copy = False
        if target_quality == "original":
            if target_format == "original":
                can_stream_copy = True
            elif target_format == "mov" and src_codec in ("h264", "hevc") and src_acodec in ("aac", "pcm_s16le"):
                can_stream_copy = True
            elif target_format == "mp4_h264" and src_codec == "h264" and src_acodec in ("aac", "mp3"):
                can_stream_copy = True
            elif target_format == "mp4_hevc" and src_codec == "hevc" and src_acodec in ("aac", "mp3"):
                # HEVC still needs tag hvc1 in mp4
                can_stream_copy = True

        cmd = [
            self.ffmpeg_path,
            "-y",
            "-i", str(src)
        ]

        # Resolution scaling filter
        filter_args = []
        if target_quality != "original":
            is_vertical = src_h > src_w
            if target_quality == "1080p":
                target_w, target_h = (1080, 1920) if is_vertical else (1920, 1080)
            elif target_quality == "720p":
                target_w, target_h = (720, 1280) if is_vertical else (1280, 720)
            elif target_quality == "480p":
                target_w, target_h = (480, 854) if is_vertical else (854, 480)
            elif target_quality == "2k":
                target_w, target_h = (1440, 2560) if is_vertical else (2560, 1440)
            elif target_quality == "4k":
                target_w, target_h = (2160, 3840) if is_vertical else (3840, 2160)
            else:
                target_w, target_h = src_w, src_h

            # Scale maintaining aspect ratio without distortion
            filter_args = ["-vf", f"scale='min({target_w},iw)':-2:flags=bicubic"]

        if can_stream_copy and not filter_args:
            logger.info(f"Lossless stream copy enabled for {src.name} -> {final_filename}")
            cmd.extend(["-c", "copy"])
            if target_format in ("mp4_hevc", "mp4_h264", "mov"):
                cmd.extend(["-movflags", "+faststart"])
            if target_format == "mp4_hevc":
                cmd.extend(["-tag:v", "hvc1"])
        else:
            # Codec-specific macOS configuration
            if target_format == "mp4_h264":
                cmd.extend([
                    "-c:v", "libx264",
                    "-preset", "medium",
                    "-crf", "18",
                    "-pix_fmt", "yuv420p",
                    "-movflags", "+faststart",
                    "-c:a", "aac",
                    "-b:a", "192k",
                    "-ar", "48000"
                ])
            elif target_format == "mp4_hevc":
                # CRITICAL for macOS QuickTime: -tag:v hvc1 makes HEVC native to macOS
                cmd.extend([
                    "-c:v", "libx265",
                    "-preset", "medium",
                    "-crf", "22",
                    "-tag:v", "hvc1",
                    "-pix_fmt", "yuv420p",
                    "-movflags", "+faststart",
                    "-c:a", "aac",
                    "-b:a", "192k",
                    "-ar", "48000"
                ])
            elif target_format == "mov":
                cmd.extend([
                    "-c:v", "libx264",
                    "-preset", "medium",
                    "-crf", "18",
                    "-pix_fmt", "yuv420p",
                    "-movflags", "+faststart",
                    "-c:a", "aac",
                    "-b:a", "192k",
                    "-ar", "48000"
                ])
            elif target_format == "webm":
                cmd.extend([
                    "-c:v", "libvpx-vp9",
                    "-b:v", "0",
                    "-crf", "28",
                    "-c:a", "libopus",
                    "-b:a", "128k"
                ])
            else:
                cmd.extend([
                    "-c:v", "libx264",
                    "-pix_fmt", "yuv420p",
                    "-c:a", "aac",
                    "-b:a", "192k"
                ])

            if filter_args:
                cmd.extend(filter_args)

            # Audio synchronization guarantee
            cmd.extend([
                "-avoid_negative_ts", "make_zero",
                "-async", "1"
            ])

        cmd.append(str(out_path))

        loop = asyncio.get_event_loop()
        def _run_convert():
            logger.info(f"Executing macOS video export: {' '.join(cmd)}")
            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=300)
            if res.returncode != 0:
                clean_err = res.stderr.strip()
                tail_err = clean_err[-300:] if len(clean_err) > 300 else clean_err
                raise RuntimeError(f"FFmpeg conversion failed: {tail_err}")
            return str(out_path)

        exported_path = await loop.run_in_executor(None, _run_convert)

        # Inspect exported result metadata
        out_meta = ffmpeg_editor.get_video_metadata(exported_path)
        out_stat = Path(exported_path).stat()

        return {
            "success": True,
            "filename": final_filename,
            "filepath": exported_path,
            "directory": str(dest_dir),
            "size_bytes": out_stat.st_size,
            "size_mb": round(out_stat.st_size / (1024 * 1024), 2),
            "format": target_format,
            "format_name": format_info["name"],
            "extension": ext,
            "apple_compatible": format_info["apple_compatible"],
            "quality": target_quality,
            "resolution": f"{out_meta.get('width')}x{out_meta.get('height')}",
            "fps": out_meta.get("fps", src_fps),
            "video_codec": out_meta.get("video_codec"),
            "audio_codec": out_meta.get("audio_codec"),
            "duration": out_meta.get("duration"),
            "created_at": datetime.utcnow().isoformat(),
        }

    def open_file_in_macos_player(self, file_path: str) -> Dict[str, Any]:
        """
        Launches the video file in the native macOS default player (QuickTime Player / IINA / VLC).
        """
        p = Path(file_path).resolve()
        if not p.exists():
            raise FileNotFoundError(f"File not found on disk at {file_path}")

        try:
            # macOS native open command
            subprocess.run(["open", str(p)], check=True)
            logger.info(f"Launched file in macOS default media player: {p}")
            return {
                "success": True,
                "message": f"Opened '{p.name}' in macOS default media player.",
                "path": str(p)
            }
        except subprocess.CalledProcessError as e:
            logger.error(f"Failed to open file in macOS: {e}")
            raise RuntimeError(f"Could not open file in macOS player: {e}")

    def reveal_in_finder(self, file_path: str) -> Dict[str, Any]:
        """
        Reveals and highlights the file inside native macOS Finder.
        """
        p = Path(file_path).resolve()
        if not p.exists():
            raise FileNotFoundError(f"File not found on disk at {file_path}")

        try:
            # macOS native reveal: open -R <path>
            subprocess.run(["open", "-R", str(p)], check=True)
            logger.info(f"Revealed file in macOS Finder: {p}")
            return {
                "success": True,
                "message": f"Revealed '{p.name}' in macOS Finder.",
                "path": str(p)
            }
        except subprocess.CalledProcessError as e:
            logger.error(f"Failed to reveal file in Finder: {e}")
            raise RuntimeError(f"Could not reveal file in macOS Finder: {e}")

    def delete_file(self, file_path: str) -> Dict[str, Any]:
        """
        Permanently deletes file from disk.
        """
        p = Path(file_path).resolve()
        if not p.exists():
            raise FileNotFoundError(f"File not found: {file_path}")

        # Delete matching thumbnail if any
        thumb_jpg = p.with_suffix(".jpg")
        if thumb_jpg.exists():
            try:
                thumb_jpg.unlink()
            except Exception:
                pass

        p.unlink()
        logger.info(f"Permanently deleted file from disk: {p}")
        return {
            "success": True,
            "filename": p.name,
            "path": str(p),
            "message": f"File '{p.name}' permanently deleted."
        }

macos_exporter = MacOSVideoExporter()
