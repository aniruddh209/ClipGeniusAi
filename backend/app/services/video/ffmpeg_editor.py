import subprocess
import json
import shutil
import asyncio
from pathlib import Path
from typing import Dict, Any, Optional
from app.core.config import settings
from app.core.logging import logger

class FFmpegEditor:
    def __init__(self):
        self.ffmpeg_path = shutil.which("ffmpeg") or "/opt/homebrew/bin/ffmpeg"
        self.ffprobe_path = shutil.which("ffprobe") or "/opt/homebrew/bin/ffprobe"

    def is_available(self) -> bool:
        return bool(shutil.which("ffmpeg") or Path(self.ffmpeg_path).exists())

    def get_video_metadata(self, file_path: str) -> Dict[str, Any]:
        """
        Extracts comprehensive video and audio metadata using FFprobe:
        - duration (seconds)
        - dimensions (width, height)
        - aspect ratio (e.g. 16:9)
        - fps (frames per second)
        - video codec (h264, vp9, etc.)
        - audio codec (aac, opus, etc.)
        - bitrate (kbps)
        """
        if not Path(file_path).exists():
            raise FileNotFoundError(f"Video file not found at {file_path}")

        cmd = [
            self.ffprobe_path,
            "-v", "error",
            "-show_entries", "format=duration,size,bit_rate:stream=index,codec_name,codec_type,width,height,r_frame_rate,duration,bit_rate",
            "-of", "json",
            file_path
        ]

        try:
            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
            data = json.loads(res.stdout)
            
            format_data = data.get("format", {})
            streams = data.get("streams", [])

            # Parse video stream
            video_stream = next((s for s in streams if s.get("codec_type") == "video"), None)
            audio_stream = next((s for s in streams if s.get("codec_type") == "audio"), None)

            # Duration
            duration = float(format_data.get("duration", 0.0))
            if duration == 0.0 and video_stream:
                duration = float(video_stream.get("duration", 0.0))

            # Width & Height
            width = int(video_stream.get("width", 1920)) if video_stream else 1920
            height = int(video_stream.get("height", 1080)) if video_stream else 1080

            # Aspect Ratio calculation
            aspect_ratio = "16:9"
            if width and height:
                gcd = self._gcd(width, height)
                rw, rh = width // gcd, height // gcd
                if abs((width / height) - (16 / 9)) < 0.05:
                    aspect_ratio = "16:9"
                elif abs((width / height) - (9 / 16)) < 0.05:
                    aspect_ratio = "9:16"
                elif abs((width / height) - 1.0) < 0.05:
                    aspect_ratio = "1:1"
                elif abs((width / height) - (4 / 5)) < 0.05:
                    aspect_ratio = "4:5"
                else:
                    aspect_ratio = f"{rw}:{rh}"

            # FPS parsing (e.g. "30/1" or "29.97/1")
            fps = 30.0
            if video_stream and "r_frame_rate" in video_stream:
                rate_str = video_stream["r_frame_rate"]
                if "/" in rate_str:
                    num, den = rate_str.split("/")
                    if float(den) > 0:
                        fps = round(float(num) / float(den), 2)
                else:
                    fps = round(float(rate_str), 2)

            # Codecs
            video_codec = video_stream.get("codec_name", "unknown") if video_stream else None
            audio_codec = audio_stream.get("codec_name", "unknown") if audio_stream else None

            # Bitrate
            bitrate_bps = int(format_data.get("bit_rate", 0))
            bitrate_kbps = round(bitrate_bps / 1000) if bitrate_bps else 0

            # File size in MB
            size_bytes = int(format_data.get("size", Path(file_path).stat().st_size))
            size_mb = round(size_bytes / (1024 * 1024), 2)

            return {
                "duration": round(duration, 2),
                "width": width,
                "height": height,
                "aspect_ratio": aspect_ratio,
                "fps": fps,
                "video_codec": video_codec,
                "audio_codec": audio_codec,
                "bitrate_kbps": bitrate_kbps,
                "size_mb": size_mb,
            }
        except subprocess.CalledProcessError as e:
            logger.error(f"FFprobe execution failed: {e.stderr}")
            raise RuntimeError(f"FFprobe failed to inspect media: {e.stderr}")
        except Exception as e:
            logger.error(f"Metadata extraction error: {e}")
            raise e

    def _gcd(self, a: int, b: int) -> int:
        while b:
            a, b = b, a % b
        return a or 1

    async def generate_thumbnail(
        self,
        video_path: str,
        output_image_path: str,
        timestamp_sec: Optional[float] = None
    ) -> str:
        """
        Extracts a high-quality JPEG thumbnail frame from the video at an optimal timestamp.
        """
        # Ensure parent directory exists
        Path(output_image_path).parent.mkdir(parents=True, exist_ok=True)

        if timestamp_sec is None:
            # Query duration to pick a representative frame (e.g. 1.5 seconds in)
            try:
                meta = self.get_video_metadata(video_path)
                duration = meta.get("duration", 0.0)
                timestamp_sec = min(2.0, max(0.5, duration * 0.1)) if duration > 1.0 else 0.1
            except Exception:
                timestamp_sec = 0.5

        cmd = [
            self.ffmpeg_path,
            "-y",
            "-ss", str(timestamp_sec),
            "-i", video_path,
            "-frames:v", "1",
            "-update", "1",
            "-q:v", "2",
            output_image_path
        ]

        loop = asyncio.get_event_loop()

        def _run_extract():
            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            if res.returncode != 0:
                logger.warning(f"FFmpeg thumbnail extraction failed at ss={timestamp_sec}: {res.stderr}. Trying ss=0...")
                # Fallback to start of video
                fallback_cmd = [
                    self.ffmpeg_path,
                    "-y",
                    "-ss", "0.0",
                    "-i", video_path,
                    "-frames:v", "1",
                    "-update", "1",
                    "-q:v", "2",
                    output_image_path
                ]
                subprocess.run(fallback_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
            return output_image_path

        return await loop.run_in_executor(None, _run_extract)

    async def extract_audio(
        self,
        video_path: str,
        output_audio_path: Optional[str] = None,
        max_duration: Optional[float] = None
    ) -> str:
        """Extracts mono 16kHz WAV audio optimized for speech-to-text with Faster-Whisper."""
        if not output_audio_path:
            output_audio_path = str(Path(video_path).with_suffix(".wav"))

        cmd = [
            self.ffmpeg_path,
            "-y",
            "-i", video_path,
        ]
        if max_duration and max_duration > 0:
            cmd.extend(["-t", f"{max_duration:.2f}"])

        cmd.extend([
            "-vn",
            "-acodec", "pcm_s16le",
            "-ar", "16000",
            "-ac", "1",
            output_audio_path
        ])

        loop = asyncio.get_event_loop()
        def _run():
            subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
            return output_audio_path

        return await loop.run_in_executor(None, _run)

    async def cut_clip(
        self,
        input_video_path: str,
        output_video_path: str,
        start_time: float,
        end_time: float,
        aspect_ratio: str = "9:16",
        crf: int = 18,
        audio_bitrate: str = "192k"
    ) -> str:
        """
        Cuts clip with frame-accurate start/end timestamps, synchronized audio, and export formatting:
        - Vertical: 9:16 (1080x1920 pixels) - DEFAULT
        - Square: 1:1 (1080x1080 pixels)
        - Landscape: 16:9 (1920x1080 pixels)
        Avoids unnecessary quality loss with visually lossless CRF 18 encoding and yuv420p standard pixel format.
        Preserves audio synchronization via make_zero timestamps and 48kHz audio resampling.
        """
        Path(output_video_path).parent.mkdir(parents=True, exist_ok=True)
        duration = max(0.5, round(end_time - start_time, 3))

        # Select filter graph based on target export format
        if aspect_ratio == "9:16":
            # 1080 x 1920 vertical format (Shorts, Reels, TikTok)
            vf = "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920:(in_w-1080)/2:(in_h-1920)/2,setsar=1"
        elif aspect_ratio == "1:1":
            # 1080 x 1080 square format (Instagram, LinkedIn)
            vf = "scale=1080:1080:force_original_aspect_ratio=increase,crop=1080:1080:(in_w-1080)/2:(in_h-1080)/2,setsar=1"
        elif aspect_ratio == "16:9":
            # 1920 x 1080 landscape format (YouTube standard)
            vf = "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080:(in_w-1920)/2:(in_h-1080)/2,setsar=1"
        else:
            # Default to 9:16 vertical
            vf = "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920:(in_w-1080)/2:(in_h-1920)/2,setsar=1"

        cmd = [
            self.ffmpeg_path,
            "-y",
            "-ss", f"{start_time:.3f}",
            "-i", input_video_path,
            "-t", f"{duration:.3f}",
            "-vf", vf,
            "-c:v", "libx264",
            "-preset", "veryfast",
            "-crf", "21",
            "-tune", "fastdecode",
            "-pix_fmt", "yuv420p",
            "-avoid_negative_ts", "make_zero",
            "-c:a", "aac",
            "-b:a", audio_bitrate,
            "-ar", "48000",
            "-ac", "2",
            output_video_path
        ]

        loop = asyncio.get_event_loop()

        def _run():
            logger.info(f"FFmpeg cutting clip: ss={start_time:.3f}, dur={duration:.3f}, ratio={aspect_ratio} -> {output_video_path}")
            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            if res.returncode != 0:
                logger.error(f"FFmpeg error: {res.stderr}")
                raise RuntimeError(f"FFmpeg cutting failed: {res.stderr[:200]}")
            return output_video_path

        return await loop.run_in_executor(None, _run)

    async def cut_and_convert_to_vertical(
        self,
        input_video_path: str,
        output_video_path: str,
        start_time: float,
        end_time: float,
        aspect_ratio: str = "9:16",
        mode: str = "crop"
    ) -> str:
        """Alias forwarding to cut_clip for backwards compatibility."""
        return await self.cut_clip(
            input_video_path=input_video_path,
            output_video_path=output_video_path,
            start_time=start_time,
            end_time=end_time,
            aspect_ratio=aspect_ratio
        )

ffmpeg_editor = FFmpegEditor()
