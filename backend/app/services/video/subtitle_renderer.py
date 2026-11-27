import os
import re
import shutil
import asyncio
import subprocess
import numpy as np
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
from PIL import Image, ImageDraw, ImageFont
import cv2

from app.models.subtitle import (
    SubtitleLineChunk,
    SubtitleStyleConfig,
    SubtitlePosition,
    CaptionPreset
)
from app.services.video.subtitle_generator import (
    generate_srt_content,
    generate_ass_content
)
from app.core.logging import logger

def parse_rgba_string(color_str: str) -> Tuple[int, int, int, int]:
    """Parses hex '#RRGGBB' or 'rgba(r, g, b, a)' into (R, G, B, A) 0-255."""
    color_str = color_str.strip()
    if color_str.startswith("#"):
        hex_clean = color_str.lstrip("#")
        if len(hex_clean) == 6:
            r = int(hex_clean[0:2], 16)
            g = int(hex_clean[2:4], 16)
            b = int(hex_clean[4:6], 16)
            return (r, g, b, 255)
        elif len(hex_clean) == 8:
            r = int(hex_clean[0:2], 16)
            g = int(hex_clean[2:4], 16)
            b = int(hex_clean[4:6], 16)
            a = int(hex_clean[6:8], 16)
            return (r, g, b, a)
    elif color_str.startswith("rgba"):
        m = re.findall(r"[\d\.]+", color_str)
        if len(m) >= 4:
            r, g, b = int(m[0]), int(m[1]), int(m[2])
            a = int(float(m[3]) * 255) if float(m[3]) <= 1.0 else int(float(m[3]))
            return (r, g, b, min(255, max(0, a)))
    elif color_str.startswith("rgb"):
        m = re.findall(r"\d+", color_str)
        if len(m) >= 3:
            return (int(m[0]), int(m[1]), int(m[2]), 255)
    return (255, 255, 255, 255)

class SubtitleRenderer:
    def __init__(self):
        self.ffmpeg_path = shutil.which("ffmpeg") or "/opt/homebrew/bin/ffmpeg"
        self._font_cache: Dict[Tuple[str, int], ImageFont.FreeTypeFont] = {}

    def get_font(self, font_family: str, size: int) -> ImageFont.FreeTypeFont:
        """Finds and loads the best matching TrueType font on macOS/Linux with caching."""
        cache_key = (font_family.lower(), size)
        if cache_key in self._font_cache:
            return self._font_cache[cache_key]

        font_paths = []
        name = font_family.lower()
        if "impact" in name:
            font_paths.extend([
                "/System/Library/Fonts/Supplemental/Impact.ttf",
                "/Library/Fonts/Impact.ttf",
                "/System/Library/Fonts/Supplemental/Arial Black.ttf"
            ])
        elif "black" in name:
            font_paths.extend([
                "/System/Library/Fonts/Supplemental/Arial Black.ttf",
                "/System/Library/Fonts/Supplemental/Impact.ttf"
            ])
        elif "helvetica" in name:
            font_paths.extend([
                "/System/Library/Fonts/Helvetica.ttc",
                "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
            ])
        else:
            font_paths.extend([
                "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
                "/System/Library/Fonts/Supplemental/Arial.ttf",
                "/System/Library/Fonts/Helvetica.ttc"
            ])

        for path in font_paths:
            if os.path.exists(path):
                try:
                    font = ImageFont.truetype(path, size)
                    self._font_cache[cache_key] = font
                    return font
                except Exception as e:
                    logger.debug(f"Failed to load font at {path}: {e}")

        # Fallback to default
        try:
            font = ImageFont.truetype("Arial", size)
            self._font_cache[cache_key] = font
            return font
        except Exception:
            return ImageFont.load_default()

    async def render_subtitles_to_video(
        self,
        input_video_path: str,
        output_video_path: str,
        chunks: List[SubtitleLineChunk],
        style: SubtitleStyleConfig
    ) -> str:
        """
        Bakes dynamic animated subtitles into the video with speech synchronization.
        Uses Pillow for pixel-perfect anti-aliased font rendering and FFmpeg for fast H.264 video compression.
        """
        if not os.path.exists(input_video_path):
            raise FileNotFoundError(f"Input video not found: {input_video_path}")

        Path(output_video_path).parent.mkdir(parents=True, exist_ok=True)

        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None,
            self._process_render_pipeline,
            input_video_path,
            output_video_path,
            chunks,
            style
        )

    def _process_render_pipeline(
        self,
        input_video_path: str,
        output_video_path: str,
        chunks: List[SubtitleLineChunk],
        style: SubtitleStyleConfig
    ) -> str:
        cap = cv2.VideoCapture(input_video_path)
        if not cap.isOpened():
            raise RuntimeError(f"Cannot open video with OpenCV: {input_video_path}")

        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        fps = float(cap.get(cv2.CAP_PROP_FPS))
        if fps <= 0 or np.isnan(fps):
            fps = 30.0
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

        # Scale font relative to 1080p height (1920)
        scale_factor = height / 1920.0
        font_size = max(18, int(style.font_size * scale_factor))
        outline_width = max(1, int(style.outline_width * scale_factor)) if style.outline_width > 0 else 0
        shadow_offset = max(1, int(style.shadow_offset * scale_factor)) if style.shadow_offset > 0 else 0
        safe_margin = int(style.safe_margin_y * scale_factor)

        font = self.get_font(style.font_family, font_size)
        active_font = self.get_font(style.font_family, int(font_size * 1.08)) if style.scale_active_word else font

        primary_rgba = parse_rgba_string(style.primary_color)
        highlight_rgba = parse_rgba_string(style.highlight_color)
        keyword_rgba = parse_rgba_string(style.keyword_color)
        outline_rgba = parse_rgba_string(style.outline_color)
        shadow_rgba = parse_rgba_string(style.shadow_color)
        bg_rgba = parse_rgba_string(style.background_color)

        # Launch FFmpeg encoding process
        # Read raw video from pipe, encode audio cleanly to AAC for guaranteed MP4 container compatibility
        ffmpeg_cmd = [
            self.ffmpeg_path,
            "-y",
            "-f", "rawvideo",
            "-vcodec", "rawvideo",
            "-s", f"{width}x{height}",
            "-pix_fmt", "bgr24",
            "-r", str(fps),
            "-i", "-",                       # Stream 0: Video from pipe
            "-i", input_video_path,          # Stream 1: Original video (audio source)
            "-map", "0:v:0",
            "-map", "1:a:0?",                # Map audio if present
            "-c:v", "libx264",
            "-preset", "veryfast",
            "-crf", "18",
            "-tune", "fastdecode",
            "-threads", "0",
            "-pix_fmt", "yuv420p",
            "-c:a", "aac",                   # Encode audio to AAC to ensure 100% MP4 compatibility
            "-b:a", "192k",
            "-shortest",
            output_video_path
        ]

        logger.info(f"Starting optimized FFmpeg subtitle burn for {input_video_path} -> {output_video_path}")
        proc = subprocess.Popen(
            ffmpeg_cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE
        )

        frame_idx = 0
        chunk_lookup_idx = 0

        # Subtitle overlay frame cache to skip 98% of redundant Pillow redraws
        cached_key = None
        cached_overlay_bgr = None
        cached_alpha = None
        cached_top_y = 0
        cached_bottom_y = 0

        try:
            while True:
                ret, frame = cap.read()
                if not ret or frame is None:
                    break

                current_time = frame_idx / fps

                # Find active chunk
                active_chunk = None
                active_chunk_idx = -1
                for idx in range(chunk_lookup_idx, len(chunks)):
                    ch = chunks[idx]
                    if current_time < ch.start:
                        break
                    if ch.start <= current_time <= ch.end:
                        active_chunk = ch
                        active_chunk_idx = idx
                        chunk_lookup_idx = max(0, idx - 1)
                        break

                if active_chunk and active_chunk.words:
                    # Find active word index
                    active_word_idx = -1
                    if style.karaoke_animation:
                        for w_i, w_item in enumerate(active_chunk.words):
                            if w_item.start <= current_time <= w_item.end:
                                active_word_idx = w_i
                                break

                    frame_key = (active_chunk_idx, active_word_idx)
                    if frame_key != cached_key:
                        cached_overlay_bgr, cached_alpha, cached_top_y, cached_bottom_y = self._build_subtitle_overlay(
                            chunk=active_chunk,
                            current_time=current_time,
                            width=width,
                            height=height,
                            font=font,
                            active_font=active_font,
                            style=style,
                            font_size=font_size,
                            outline_width=outline_width,
                            shadow_offset=shadow_offset,
                            safe_margin=safe_margin,
                            primary_rgba=primary_rgba,
                            highlight_rgba=highlight_rgba,
                            keyword_rgba=keyword_rgba,
                            outline_rgba=outline_rgba,
                            shadow_rgba=shadow_rgba,
                            bg_rgba=bg_rgba
                        )
                        cached_key = frame_key

                    if cached_overlay_bgr is not None and cached_top_y < cached_bottom_y:
                        roi = frame[cached_top_y:cached_bottom_y, 0:width]
                        blended = (roi * (1.0 - cached_alpha) + cached_overlay_bgr * cached_alpha).astype(np.uint8)
                        frame[cached_top_y:cached_bottom_y, 0:width] = blended
                else:
                    cached_key = None

                try:
                    proc.stdin.write(frame.tobytes())
                except (BrokenPipeError, OSError):
                    break
                frame_idx += 1

            cap.release()
            try:
                proc.stdin.close()
            except Exception:
                pass
            _, stderr_bytes = proc.communicate()

            if proc.returncode != 0:
                err_text = stderr_bytes.decode("utf-8", errors="ignore") if stderr_bytes else f"Code {proc.returncode}"
                logger.error(f"FFmpeg subtitle burn failed with return code {proc.returncode}: {err_text[:200]}")
                raise RuntimeError(f"FFmpeg subtitle burn failed: {err_text[:200]}")

            logger.info(f"Subtitled clip rendered successfully: {output_video_path} ({frame_idx} frames)")

            # Also generate and save companion .srt and .ass files
            srt_path = Path(output_video_path).with_suffix(".srt")
            ass_path = Path(output_video_path).with_suffix(".ass")
            with open(srt_path, "w", encoding="utf-8") as f:
                f.write(generate_srt_content(chunks))
            with open(ass_path, "w", encoding="utf-8") as f:
                f.write(generate_ass_content(chunks, style, play_res_x=width, play_res_y=height))

            return output_video_path

        except Exception as e:
            cap.release()
            if proc and proc.poll() is None:
                proc.kill()
            logger.error(f"Error during subtitle rendering: {e}")
            raise e

    def _build_subtitle_overlay(
        self,
        chunk: SubtitleLineChunk,
        current_time: float,
        width: int,
        height: int,
        font: ImageFont.FreeTypeFont,
        active_font: ImageFont.FreeTypeFont,
        style: SubtitleStyleConfig,
        font_size: int,
        outline_width: int,
        shadow_offset: int,
        safe_margin: int,
        primary_rgba: Tuple[int, int, int, int],
        highlight_rgba: Tuple[int, int, int, int],
        keyword_rgba: Tuple[int, int, int, int],
        outline_rgba: Tuple[int, int, int, int],
        shadow_rgba: Tuple[int, int, int, int],
        bg_rgba: Tuple[int, int, int, int]
    ) -> Tuple[Optional[np.ndarray], Optional[np.ndarray], int, int]:
        """Pre-renders speech-synchronized animated subtitle overlay card with fast vector strokes."""
        words_data = []
        space_width = font.getlength(" ") if hasattr(font, "getlength") else font_size * 0.3
        total_width = 0.0

        for item in chunk.words:
            display_word = item.word.upper() if style.uppercase else item.word
            is_active = (style.karaoke_animation and item.start <= current_time <= item.end)
            cur_font = active_font if is_active else font
            w_len = cur_font.getlength(display_word) if hasattr(cur_font, "getlength") else len(display_word) * font_size * 0.6
            words_data.append({
                "word": display_word,
                "is_active": is_active,
                "is_keyword": item.is_keyword,
                "font": cur_font,
                "width": w_len
            })
            total_width += w_len

        total_width += space_width * max(0, len(words_data) - 1)

        card_height = int(font_size * 2.2) + (shadow_offset * 2) + 20
        card_width = width

        if style.position == SubtitlePosition.TOP:
            top_y = safe_margin
        elif style.position == SubtitlePosition.CENTER:
            top_y = (height - card_height) // 2
        else:  # BOTTOM
            top_y = height - safe_margin - card_height

        bottom_y = min(height, top_y + card_height)
        top_y = max(0, top_y)
        roi_h = bottom_y - top_y

        if roi_h <= 0:
            return None, None, 0, 0

        overlay = Image.new("RGBA", (card_width, roi_h), (0, 0, 0, 0))
        draw = ImageDraw.Draw(overlay)

        center_x = card_width / 2.0
        start_x = center_x - (total_width / 2.0)
        center_y = roi_h / 2.0

        # Draw Background Box if enabled
        if style.background_box:
            pad_x = int(style.background_padding_x * (width / 1080.0))
            pad_y = int(style.background_padding_y * (height / 1920.0))
            rad = int(style.background_radius * (width / 1080.0))
            box_left = max(20, start_x - pad_x)
            box_right = min(card_width - 20, start_x + total_width + pad_x)
            box_top = max(4, center_y - (font_size / 2.0) - pad_y)
            box_bottom = min(roi_h - 4, center_y + (font_size / 2.0) + pad_y)
            draw.rounded_rectangle(
                [box_left, box_top, box_right, box_bottom],
                radius=rad,
                fill=bg_rgba
            )

        # Render words with native C-level stroke_width
        curr_x = start_x
        for w_info in words_data:
            w_text = w_info["word"]
            is_active = w_info["is_active"]
            is_kw = w_info["is_keyword"]
            w_font = w_info["font"]
            w_w = w_info["width"]

            if is_active:
                fill_color = highlight_rgba
            elif is_kw:
                fill_color = keyword_rgba
            else:
                fill_color = primary_rgba

            pos_x = curr_x + (w_w / 2.0)
            pos_y = center_y

            # Shadow
            if shadow_offset > 0:
                draw.text(
                    (pos_x + shadow_offset, pos_y + shadow_offset),
                    w_text,
                    font=w_font,
                    fill=shadow_rgba,
                    anchor="mm"
                )

            # Native hardware-accelerated outline & foreground
            draw.text(
                (pos_x, pos_y),
                w_text,
                font=w_font,
                fill=fill_color,
                stroke_width=outline_width if outline_width > 0 else 0,
                stroke_fill=outline_rgba if outline_width > 0 else None,
                anchor="mm"
            )

            curr_x += w_w + space_width

        overlay_np = np.array(overlay)
        overlay_rgb = overlay_np[:, :, :3]
        overlay_bgr = overlay_rgb[:, :, ::-1]  # RGB to BGR
        alpha = (overlay_np[:, :, 3] / 255.0)[:, :, None]

        return overlay_bgr, alpha, top_y, bottom_y

subtitle_renderer = SubtitleRenderer()
