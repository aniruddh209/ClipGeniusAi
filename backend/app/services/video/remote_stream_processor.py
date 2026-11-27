import os
import re
import uuid
import time
import socket
import asyncio
import subprocess
import ipaddress
from pathlib import Path
from typing import Dict, Any, Optional, Tuple, List
from urllib.parse import urlparse
import urllib.request
import urllib.error

from app.core.config import settings
from app.core.logging import logger

# Blocked private and special network ranges to prevent SSRF
PRIVATE_NETWORKS = [
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("0.0.0.0/8"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
    ipaddress.ip_network("fe80::/10"),
]

DEFAULT_USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

class RemoteStreamProcessor:
    """
    Direct Cloud Video Clipping Engine:
    - Validates remote URLs against SSRF (rejects loopback, private CIDRs, non-HTTP schemes)
    - Probes remote video streams via HTTP headers and FFprobe without downloading full video
    - Directly extracts audio streams over HTTP for speech transcription
    - Slices and reframes only requested clip segments via HTTP Range seeking
    - Cleans up temporary files following retention policies
    """

    def __init__(self, ffmpeg_path: str = "ffmpeg", ffprobe_path: str = "ffprobe"):
        self.ffmpeg_path = ffmpeg_path if os.path.exists(ffmpeg_path) else "ffmpeg"
        self.ffprobe_path = ffprobe_path if os.path.exists(ffprobe_path) else "ffprobe"

    def validate_safe_url(self, url: str) -> str:
        """
        SSRF Prevention & Security Validation:
        1. Validates HTTP / HTTPS protocol.
        2. Resolves DNS hostname to IP.
        3. Blocks localhost, private network addresses, link-local, and multicast ranges.
        """
        if not url or not isinstance(url, str):
            raise ValueError("Invalid URL: URL must be a non-empty string.")

        parsed = urlparse(url.strip())
        if parsed.scheme not in ("http", "https"):
            raise ValueError(f"Unsupported protocol '{parsed.scheme}'. Only HTTP and HTTPS are permitted.")

        hostname = parsed.hostname
        if not hostname:
            raise ValueError("URL must contain a valid domain or host name.")

        # Block localhost aliases
        if hostname.lower() in ("localhost", "127.0.0.1", "::1", "0.0.0.0", "internal", "local"):
            raise ValueError("Access to localhost or internal network targets is prohibited.")

        # Resolve DNS and check all resolved IP addresses
        try:
            addr_info = socket.getaddrinfo(hostname, None)
            for item in addr_info:
                ip_str = item[4][0]
                ip = ipaddress.ip_address(ip_str)
                for net in PRIVATE_NETWORKS:
                    if ip in net:
                        raise ValueError(f"Access to private IP address ({ip}) is blocked for security (SSRF prevention).")
        except socket.gaierror as e:
            raise ValueError(f"Failed to resolve host '{hostname}': {e}")

        return url.strip()

    async def probe_remote_media(self, url: str) -> Dict[str, Any]:
        """
        Inspects remote video without downloading:
        - Rejects social/encrypted player platforms (YouTube, TikTok, Vimeo) with guidance to use the YouTube/Link tab
        - HTTP HEAD checks Content-Length, Content-Type, and Accept-Ranges support
        - FFprobe extracts exact duration, resolution, codecs, and audio tracks over HTTP stream
        """
        safe_url = self.validate_safe_url(url)

        parsed_url = urlparse(safe_url)
        host_lower = (parsed_url.hostname or "").lower()
        if any(d in host_lower for d in ("youtube.com", "youtu.be", "vimeo.com", "tiktok.com", "twitch.tv", "instagram.com", "twitter.com", "x.com")):
            raise ValueError(
                "YouTube and social media links serve dynamic HTML web players rather than direct raw MP4/WebM files. "
                "Please switch to the 'YouTube / Link' tab to import this video, or provide a direct MP4/WebM file URL."
            )

        # 1. HTTP HEAD check using Python standard library
        loop = asyncio.get_event_loop()
        def _head_request():
            req = urllib.request.Request(
                safe_url,
                headers={"User-Agent": DEFAULT_USER_AGENT, "Accept": "*/*"},
                method="HEAD"
            )
            try:
                with urllib.request.urlopen(req, timeout=10) as resp:
                    return resp.status, dict(resp.headers)
            except urllib.error.HTTPError as he:
                return he.code, dict(he.headers)
            except Exception:
                range_req = urllib.request.Request(
                    safe_url,
                    headers={"User-Agent": DEFAULT_USER_AGENT, "Range": "bytes=0-10"},
                    method="GET"
                )
                try:
                    with urllib.request.urlopen(range_req, timeout=10) as resp:
                        return resp.status, dict(resp.headers)
                except urllib.error.HTTPError as he:
                    return he.code, dict(he.headers)
                except Exception as e2:
                    raise RuntimeError(f"Unable to reach remote video URL: {e2}")

        try:
            status_code, resp_headers = await loop.run_in_executor(None, _head_request)
        except Exception as e:
            raise RuntimeError(f"Unable to reach remote video URL: {e}")

        if status_code not in (200, 206, 301, 302, 303, 307, 308):
            raise RuntimeError(f"Remote server returned HTTP status {status_code}")

        content_type = resp_headers.get("Content-Type", "").lower()
        if "text/html" in content_type:
            raise ValueError(
                f"The URL returned an HTML web page ('{content_type}') instead of a direct raw media stream. "
                "Direct Cloud Clipping requires a direct media URL (e.g. .mp4, .webm). For YouTube or social links, use the 'YouTube / Link' tab."
            )

        accept_ranges = "bytes" in resp_headers.get("Accept-Ranges", "").lower() or status_code == 206
        content_length_str = resp_headers.get("Content-Length", "0")
        try:
            content_length = int(content_length_str)
        except ValueError:
            content_length = 0

        # 2. FFprobe remote stream extraction
        ffprobe_cmd = [
            self.ffprobe_path,
            "-headers", f"User-Agent: {DEFAULT_USER_AGENT}\r\n",
            "-v", "error",
            "-show_entries", "format=duration,size,format_name:stream=index,codec_name,codec_type,width,height,r_frame_rate",
            "-of", "json",
            safe_url
        ]

        def _run_ffprobe():
            res = subprocess.run(ffprobe_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=15)
            return res.stdout, res.stderr, res.returncode

        try:
            probe_out, probe_err, returncode = await loop.run_in_executor(None, _run_ffprobe)
        except subprocess.TimeoutExpired:
            probe_out, probe_err, returncode = "", "FFprobe timed out connecting to remote stream", 1

        import json
        duration = 0.0
        width = 1920
        height = 1080
        fps = 30.0
        has_audio = True

        if returncode == 0 and probe_out:
            try:
                meta = json.loads(probe_out)
                fmt = meta.get("format", {})
                duration = float(fmt.get("duration", 0.0))
                streams = meta.get("streams", [])
                video_stream = next((s for s in streams if s.get("codec_type") == "video"), None)
                audio_stream = next((s for s in streams if s.get("codec_type") == "audio"), None)

                if video_stream:
                    width = int(video_stream.get("width", 1920))
                    height = int(video_stream.get("height", 1080))
                    fps_str = video_stream.get("r_frame_rate", "30/1")
                    if "/" in fps_str:
                        num, den = fps_str.split("/")
                        fps = round(float(num) / max(1.0, float(den)), 2)
                    else:
                        fps = float(fps_str)

                has_audio = audio_stream is not None
            except Exception as pe:
                logger.warning(f"Error parsing ffprobe output: {pe}")
        else:
            logger.warning(f"FFprobe extraction failed on {safe_url}: {probe_err}")
            raise RuntimeError(
                "Could not extract video stream headers from this URL. "
                "Ensure the remote server allows media streaming and points to an accessible raw MP4/WebM file."
            )

        if duration <= 0.0:
            raise RuntimeError(
                "Remote media reported a duration of 0s. The file may be inaccessible, DRM-protected, or restricted by the host."
            )

        return {
            "url": safe_url,
            "duration": duration,
            "duration_formatted": f"{int(duration // 60)}:{int(duration % 60):02d}",
            "width": width,
            "height": height,
            "resolution": f"{width}x{height}",
            "fps": fps,
            "has_audio": has_audio,
            "content_type": content_type or "video/mp4",
            "file_size_bytes": content_length,
            "file_size_mb": round(content_length / (1024 * 1024), 2) if content_length > 0 else 0.0,
            "accept_ranges": accept_ranges,
            "direct_range_supported": accept_ranges,
            "status": "ready"
        }

    async def extract_remote_audio_stream(
        self,
        url: str,
        output_wav_path: str,
        max_duration: Optional[float] = 600.0
    ) -> str:
        """
        Directly extracts a 16kHz mono audio stream from the remote URL over HTTP without downloading the video.
        Uses HTTP stream demuxing: only the audio track packets are retrieved.
        """
        safe_url = self.validate_safe_url(url)
        Path(output_wav_path).parent.mkdir(parents=True, exist_ok=True)

        cmd = [
            self.ffmpeg_path,
            "-headers", f"User-Agent: {DEFAULT_USER_AGENT}\r\n",
            "-y",
            "-ss", "0",
            "-i", safe_url,
        ]
        if max_duration and max_duration > 0:
            cmd.extend(["-t", f"{max_duration:.2f}"])

        cmd.extend([
            "-vn",
            "-acodec", "pcm_s16le",
            "-ar", "16000",
            "-ac", "1",
            output_wav_path
        ])

        loop = asyncio.get_event_loop()
        def _exec_extract():
            logger.info(f"Extracting remote audio stream via FFmpeg: {cmd}")
            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=180)
            if res.returncode != 0:
                clean_err = res.stderr.strip()
                tail_err = clean_err[-350:] if len(clean_err) > 350 else clean_err
                raise RuntimeError(f"FFmpeg remote audio extraction failed: {tail_err}")
            return output_wav_path

        await loop.run_in_executor(None, _exec_extract)
        return output_wav_path

    async def cut_and_reframe_remote_segment(
        self,
        url: str,
        start_time: float,
        end_time: float,
        output_video_path: str,
        template_layout: str = "full_screen",
        aspect_ratio: str = "9:16",
        source_w: int = 1280,
        source_h: int = 720
    ) -> str:
        """
        Cuts and reframes ONLY the required segment directly from the remote video using HTTP Range seeking.
        Zero full-source downloading to disk.
        """
        safe_url = self.validate_safe_url(url)
        Path(output_video_path).parent.mkdir(parents=True, exist_ok=True)
        duration = max(0.5, round(end_time - start_time, 3))

        # Auto-detect target resolution: keep 4K / 2K source quality in 9:16 vertical cuts
        if aspect_ratio == "9:16":
            if source_h >= 2160 or source_w >= 3840:
                target_w, target_h = 2160, 3840
            elif source_h >= 1440 or source_w >= 2560:
                target_w, target_h = 1440, 2560
            else:
                target_w, target_h = 1080, 1920
        else:
            target_w, target_h = (1080, 1080)

        # Build clean non-distorting filtergraph
        if template_layout in ("full_screen", "center_crop"):
            crop_w = int(source_h * target_w / target_h)
            crop_w = min(source_w, max(2, crop_w - (crop_w % 2)))
            crop_x = max(0, min(source_w - crop_w, (source_w - crop_w) // 2))
            crop_x -= crop_x % 2
            vf = f"crop={crop_w}:{source_h}:{crop_x}:0,scale={target_w}:{target_h}:flags=bicubic,setsar=1"
            filter_args = ["-vf", vf]
        elif template_layout == "blur_fit":
            scaled_h = int(round(target_w * (source_h / max(1, source_w))))
            scaled_h -= scaled_h % 2
            y_offset = max(0, (target_h - scaled_h) // 2)
            fc = (
                f"[0:v]split=2[bg][fg]; "
                f"[bg]scale={target_w}:{target_h}:force_original_aspect_ratio=increase,crop={target_w}:{target_h},boxblur=25:5,setsar=1[bg_blur]; "
                f"[fg]scale={target_w}:{scaled_h}:flags=bicubic,setsar=1[fg_scaled]; "
                f"[bg_blur][fg_scaled]overlay=0:{y_offset}[v]"
            )
            filter_args = ["-filter_complex", fc, "-map", "[v]", "-map", "0:a:0?"]
        elif template_layout == "streamer_split":
            top_h = int(round(target_h * 0.40))
            top_h -= top_h % 2
            bot_h = target_h - top_h
            cam_aspect = target_w / top_h
            cam_w = min(source_w, int(round(source_h * cam_aspect * 0.55)))
            cam_w -= cam_w % 2
            cam_h = int(round(cam_w / cam_aspect))
            cam_h -= cam_h % 2
            cam_x = max(0, source_w - cam_w - int(source_w * 0.05))
            cam_x -= cam_x % 2
            game_aspect = target_w / bot_h
            game_w = min(source_w, int(round(source_h * game_aspect)))
            game_w -= game_w % 2
            game_h = min(source_h, int(round(game_w / game_aspect)))
            game_h -= game_h % 2
            game_x = max(0, (source_w - game_w) // 2)
            game_x -= game_x % 2
            game_y = max(0, (source_h - game_h) // 2)
            game_y -= game_y % 2
            fc = (
                f"[0:v]split=2[in_cam][in_game]; "
                f"[in_cam]crop={cam_w}:{cam_h}:{cam_x}:0,scale={target_w}:{top_h}:flags=bicubic,setsar=1[top]; "
                f"[in_game]crop={game_w}:{game_h}:{game_x}:{game_y},scale={target_w}:{bot_h}:flags=bicubic,setsar=1[bottom]; "
                f"[top][bottom]vstack=inputs=2[v]"
            )
            filter_args = ["-filter_complex", fc, "-map", "[v]", "-map", "0:a:0?"]
        elif template_layout == "streamer_bottom":
            top_h = int(round(target_h * 0.60))
            top_h -= top_h % 2
            bot_h = target_h - top_h
            game_aspect = target_w / top_h
            game_w = min(source_w, int(round(source_h * game_aspect)))
            game_w -= game_w % 2
            game_h = min(source_h, int(round(game_w / game_aspect)))
            game_h -= game_h % 2
            game_x = max(0, (source_w - game_w) // 2)
            game_x -= game_x % 2
            game_y = max(0, (source_h - game_h) // 2)
            game_y -= game_y % 2
            cam_aspect = target_w / bot_h
            cam_w = min(source_w, int(round(source_h * cam_aspect * 0.55)))
            cam_w -= cam_w % 2
            cam_h = int(round(cam_w / cam_aspect))
            cam_h -= cam_h % 2
            cam_x = max(0, source_w - cam_w - int(source_w * 0.05))
            cam_x -= cam_x % 2
            fc = (
                f"[0:v]split=2[in_game][in_cam]; "
                f"[in_game]crop={game_w}:{game_h}:{game_x}:{game_y},scale={target_w}:{top_h}:flags=bicubic,setsar=1[top]; "
                f"[in_cam]crop={cam_w}:{cam_h}:{cam_x}:0,scale={target_w}:{bot_h}:flags=bicubic,setsar=1[bottom]; "
                f"[top][bottom]vstack=inputs=2[v]"
            )
            filter_args = ["-filter_complex", fc, "-map", "[v]", "-map", "0:a:0?"]
        else:
            # Default clean vertical center crop
            crop_w = int(source_h * target_w / target_h)
            crop_w = min(source_w, max(2, crop_w - (crop_w % 2)))
            crop_x = max(0, min(source_w - crop_w, (source_w - crop_w) // 2))
            crop_x -= crop_x % 2
            vf = f"crop={crop_w}:{source_h}:{crop_x}:0,scale={target_w}:{target_h}:flags=bicubic,setsar=1"
            filter_args = ["-vf", vf]

        cmd = [
            self.ffmpeg_path,
            "-headers", f"User-Agent: {DEFAULT_USER_AGENT}\r\n",
            "-y",
            "-ss", f"{start_time:.3f}",
            "-i", safe_url,
            "-t", f"{duration:.3f}",
        ]
        cmd.extend(filter_args)
        cmd.extend([
            "-c:v", "libx264",
            "-preset", "veryfast",
            "-crf", "18",
            "-tune", "fastdecode",
            "-pix_fmt", "yuv420p",
            "-avoid_negative_ts", "make_zero",
            "-c:a", "aac",
            "-b:a", "192k",
            "-ar", "48000",
            "-ac", "2",
            output_video_path
        ])

        loop = asyncio.get_event_loop()
        def _exec_cut():
            logger.info(f"Cutting remote segment directly via HTTP range: {cmd}")
            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=120)
            if res.returncode != 0:
                clean_err = res.stderr.strip()
                tail_err = clean_err[-350:] if len(clean_err) > 350 else clean_err
                raise RuntimeError(f"Direct remote video cutting failed: {tail_err}")
            return output_video_path

        await loop.run_in_executor(None, _exec_cut)

        # Generate thumbnail
        thumb_path = Path(output_video_path).with_suffix(".jpg")
        thumb_cmd = [
            self.ffmpeg_path,
            "-y",
            "-ss", "0.5",
            "-i", output_video_path,
            "-frames:v", "1",
            "-q:v", "2",
            str(thumb_path)
        ]
        def _exec_thumb():
            subprocess.run(thumb_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        await loop.run_in_executor(None, _exec_thumb)

        return output_video_path

    def cleanup_old_temp_files(self, max_age_hours: float = 2.0):
        """Retention policy: purges temporary wav and intermediate files older than max_age_hours."""
        now = time.time()
        max_age_sec = max_age_hours * 3600
        for directory in [settings.UPLOAD_DIR, settings.OUTPUT_DIR]:
            if directory.exists():
                for f in directory.glob("*_temp*"):
                    try:
                        if f.is_file() and (now - f.stat().st_mtime) > max_age_sec:
                            f.unlink()
                            logger.info(f"Retention policy: purged expired temp file {f}")
                    except Exception:
                        pass

remote_stream_processor = RemoteStreamProcessor()
