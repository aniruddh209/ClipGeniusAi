import os
import math
import asyncio
import subprocess
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
import cv2
import numpy as np

from app.models.reframe import (
    CropMode,
    ReframingAspectRatio,
    FaceBox,
    CropKeyframe,
    ReframePreviewResponse
)
from app.core.config import settings
from app.core.logging import logger

class IntelligentVideoReframer:
    def __init__(self):
        self.ffmpeg_path = "/opt/homebrew/bin/ffmpeg"
        self.ffprobe_path = "/opt/homebrew/bin/ffprobe"
        self.yunet_model_path = str(settings.BASE_DIR / "weights" / "face_detection_yunet_2023mar.onnx")
        self._detector = None
        self._init_detector()

    def _init_detector(self):
        """Initializes OpenCV's YuNet ONNX face detection model."""
        if os.path.exists(self.yunet_model_path):
            try:
                self._detector = cv2.FaceDetectorYN.create(
                    model=self.yunet_model_path,
                    config="",
                    input_size=(320, 320),
                    score_threshold=0.55,
                    nms_threshold=0.3,
                    top_k=5000
                )
                logger.info("YuNet face detector initialized successfully.")
            except Exception as e:
                logger.warning(f"Could not load YuNet model: {e}")
                self._detector = None
        else:
            logger.warning(f"YuNet model not found at {self.yunet_model_path}")
            self._detector = None

    def calculate_crop_dimensions(
        self,
        source_w: int,
        source_h: int,
        aspect_ratio: ReframingAspectRatio
    ) -> Tuple[int, int, int, int]:
        """
        Calculates (crop_w, crop_h, target_w, target_h) for source dimensions.
        """
        if aspect_ratio == ReframingAspectRatio.VERTICAL_9_16:
            # 9:16 Vertical (Shorts, Reels, TikTok) - preserve source 4K/2K resolution
            if source_h >= 2160 or source_w >= 3840:
                target_w, target_h = 2160, 3840
            elif source_h >= 1440 or source_w >= 2560:
                target_w, target_h = 1440, 2560
            else:
                target_w, target_h = 1080, 1920
            crop_h = source_h
            crop_w = int(round(source_h * (9.0 / 16.0)))
            if crop_w > source_w:
                crop_w = source_w
                crop_h = int(round(source_w * (16.0 / 9.0)))
        elif aspect_ratio == ReframingAspectRatio.SQUARE_1_1:
            # 1:1 Square (Instagram, LinkedIn)
            target_w, target_h = 1080, 1080
            side = min(source_w, source_h)
            crop_w, crop_h = side, side
        else:
            # 16:9 Landscape (YouTube)
            target_w, target_h = 1920, 1080
            crop_w = source_w
            crop_h = int(round(source_w * (9.0 / 16.0)))
            if crop_h > source_h:
                crop_h = source_h
                crop_w = int(round(source_h * (16.0 / 9.0)))

        # Ensure even numbers for H.264
        crop_w = crop_w - (crop_w % 2)
        crop_h = crop_h - (crop_h % 2)
        return crop_w, crop_h, target_w, target_h

    async def analyze_reframing(
        self,
        video_path: str,
        start_time: float = 0.0,
        end_time: float = 0.0,
        aspect_ratio: ReframingAspectRatio = ReframingAspectRatio.VERTICAL_9_16,
        mode: CropMode = CropMode.SMART_AUTO,
        manual_offset: float = 0.5,
        sample_fps: float = 3.0
    ) -> Dict[str, Any]:
        """
        Analyzes video frames with OpenCV FaceDetectorYN, tracks active speaker,
        applies smooth camera damping, and produces crop keyframes.
        """
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None,
            self._process_analysis_pipeline,
            video_path,
            start_time,
            end_time,
            aspect_ratio,
            mode,
            manual_offset,
            sample_fps
        )

    def _process_analysis_pipeline(
        self,
        video_path: str,
        start_time: float,
        end_time: float,
        aspect_ratio: ReframingAspectRatio,
        mode: CropMode,
        manual_offset: float,
        sample_fps: float
    ) -> Dict[str, Any]:
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise RuntimeError(f"Cannot open video for reframing analysis: {video_path}")

        source_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        source_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        fps = float(cap.get(cv2.CAP_PROP_FPS))
        if fps <= 0 or np.isnan(fps):
            fps = 30.0

        total_duration = cap.get(cv2.CAP_PROP_FRAME_COUNT) / fps
        clip_start = max(0.0, start_time)
        clip_end = min(total_duration, end_time) if end_time > clip_start else total_duration
        clip_duration = max(0.5, clip_end - clip_start)

        crop_w, crop_h, target_w, target_h = self.calculate_crop_dimensions(source_w, source_h, aspect_ratio)
        max_crop_x = max(0, source_w - crop_w)
        max_crop_y = max(0, source_h - crop_h)
        center_crop_x = max_crop_x // 2
        center_crop_y = max_crop_y // 2

        # If Manual Crop mode:
        if mode == CropMode.MANUAL_CROP:
            manual_x = int(round(manual_offset * max_crop_x))
            manual_x = manual_x - (manual_x % 2)
            cap.release()
            return {
                "source_w": source_w,
                "source_h": source_h,
                "target_w": target_w,
                "target_h": target_h,
                "crop_w": crop_w,
                "crop_h": crop_h,
                "detection_status": "manual",
                "faces_detected": False,
                "speaker_detected": False,
                "total_faces_found": 0,
                "speaker_switches": 0,
                "fallback_reason": None,
                "keyframes": [
                    CropKeyframe(
                        timestamp=0.0,
                        crop_x=manual_x,
                        crop_y=center_crop_y,
                        crop_w=crop_w,
                        crop_h=crop_h,
                        speaker_x=manual_x + (crop_w // 2),
                        faces_count=0,
                        faces=[]
                    )
                ],
                "static_crop": {"x": manual_x, "y": center_crop_y, "w": crop_w, "h": crop_h}
            }

        # If Center Crop mode or Full Screen mode:
        if mode in (CropMode.CENTER_CROP, CropMode.FULL_SCREEN, "center_crop", "full_screen"):
            cap.release()
            return {
                "source_w": source_w,
                "source_h": source_h,
                "target_w": target_w,
                "target_h": target_h,
                "crop_w": crop_w,
                "crop_h": crop_h,
                "detection_status": "full_screen_direct",
                "faces_detected": False,
                "speaker_detected": False,
                "total_faces_found": 0,
                "speaker_switches": 0,
                "fallback_reason": "Full screen vertical action selected.",
                "keyframes": [
                    CropKeyframe(
                        timestamp=0.0,
                        crop_x=center_crop_x,
                        crop_y=center_crop_y,
                        crop_w=crop_w,
                        crop_h=crop_h,
                        speaker_x=source_w // 2,
                        faces_count=0,
                        faces=[]
                    )
                ],
                "static_crop": {"x": center_crop_x, "y": center_crop_y, "w": crop_w, "h": crop_h}
            }

        # If Streamer Split or Streamer PiP mode (Gaming/Streamer Reaction Format):
        if mode in (CropMode.STREAMER_SPLIT, CropMode.STREAMER_PIP):
            # Detect streamer's facecam box from a representative frame
            detected_cam_box = None
            cap.set(cv2.CAP_PROP_POS_MSEC, (clip_start + 1.0) * 1000)
            ret, frame = cap.read()
            if ret and frame is not None and self._detector:
                try:
                    self._detector.setInputSize((source_w, source_h))
                    _, faces = self._detector.detect(frame)
                    if faces is not None and len(faces) > 0:
                        best_face = None
                        best_conf = 0.0
                        for row in faces:
                            fx, fy, fw, fh = int(row[0]), int(row[1]), int(row[2]), int(row[3])
                            conf = float(row[-1])
                            # Prioritize streamer facecam (upper region or side corners)
                            if conf > best_conf and (fy < source_h * 0.6 or fx > source_w * 0.5):
                                best_face = (fx, fy, fw, fh)
                                best_conf = conf

                        if best_face:
                            fx, fy, fw, fh = best_face
                            cam_w = min(source_w, max(360, int(fw * 5.0)))
                            cam_h = min(source_h, max(300, int(fh * 4.5)))
                            cam_x = max(0, min(source_w - cam_w, fx + fw // 2 - cam_w // 2))
                            cam_y = max(0, min(source_h - cam_h, fy + fh // 2 - cam_h // 2))
                            cam_x -= cam_x % 2
                            cam_y -= cam_y % 2
                            cam_w -= cam_w % 2
                            cam_h -= cam_h % 2
                            detected_cam_box = {"x": cam_x, "y": cam_y, "w": cam_w, "h": cam_h}
                except Exception as e:
                    logger.debug(f"Streamer facecam detection exception: {e}")

            if not detected_cam_box:
                # Default top-right streamer quadrant
                cw = (source_w // 3) - ((source_w // 3) % 2)
                ch = (source_h // 2) - ((source_h // 2) % 2)
                cx = source_w - cw
                cy = 0
                detected_cam_box = {"x": cx, "y": cy, "w": cw, "h": ch}

            cap.release()
            return {
                "source_w": source_w,
                "source_h": source_h,
                "target_w": target_w,
                "target_h": target_h,
                "crop_w": crop_w,
                "crop_h": crop_h,
                "detection_status": mode.value,
                "faces_detected": True,
                "speaker_detected": True,
                "total_faces_found": 1,
                "speaker_switches": 0,
                "fallback_reason": None,
                "cam_box": detected_cam_box,
                "keyframes": [],
                "static_crop": {"x": center_crop_x, "y": center_crop_y, "w": crop_w, "h": crop_h}
            }

        # If Blur Fit mode (16:9 Fit with Blurred Background):
        if mode == CropMode.BLUR_FIT:
            cap.release()
            return {
                "source_w": source_w,
                "source_h": source_h,
                "target_w": target_w,
                "target_h": target_h,
                "crop_w": crop_w,
                "crop_h": crop_h,
                "detection_status": "blur_fit",
                "faces_detected": False,
                "speaker_detected": False,
                "total_faces_found": 0,
                "speaker_switches": 0,
                "fallback_reason": None,
                "keyframes": [],
                "static_crop": {"x": center_crop_x, "y": center_crop_y, "w": crop_w, "h": crop_h}
            }

        # --- SMART AUTO CROP MODE ---
        # Configure FaceDetectorYN with current frame resolution
        if self._detector:
            self._detector.setInputSize((source_w, source_h))

        start_frame = int(clip_start * fps)
        end_frame = int(clip_end * fps)
        total_clip_frames = max(1, end_frame - start_frame)
        # Cap sampling to at most 15 frames across the clip for instantaneous reframing
        max_samples = 15
        calculated_step = max(1, int(round(fps / sample_fps)))
        frame_step = max(calculated_step, total_clip_frames // max_samples) if total_clip_frames > max_samples else calculated_step

        raw_detections: List[Dict[str, Any]] = []
        total_faces_detected = 0
        frames_sampled = 0
        last_speaker_x = source_w // 2
        speaker_switches = 0

        for f_idx in range(start_frame, end_frame, frame_step):
            cap.set(cv2.CAP_PROP_POS_FRAMES, f_idx)
            ret, frame = cap.read()
            if not ret or frame is None:
                continue

            frames_sampled += 1
            rel_time = round((f_idx - start_frame) / fps, 3)
            detected_faces: List[FaceBox] = []

            if self._detector:
                try:
                    _, faces = self._detector.detect(frame)
                    if faces is not None and len(faces) > 0:
                        for row in faces:
                            fx, fy, fw, fh = int(row[0]), int(row[1]), int(row[2]), int(row[3])
                            conf = float(row[-1])
                            if conf >= 0.5:
                                detected_faces.append(
                                    FaceBox(x=fx, y=fy, w=fw, h=fh, confidence=round(conf, 2))
                                )
                except Exception as e:
                    logger.debug(f"Face detection exception at frame {f_idx}: {e}")

            total_faces_detected += len(detected_faces)

            # Determine speaker focus center
            if len(detected_faces) == 1:
                # Single speaker
                spk = detected_faces[0]
                spk.is_speaker = True
                target_center_x = spk.x + (spk.w // 2)
            elif len(detected_faces) > 1:
                # Multiple speakers:
                # 1. Check if both fit together inside crop_w
                min_x = min(f.x for f in detected_faces)
                max_x = max(f.x + f.w for f in detected_faces)
                if (max_x - min_x) <= (crop_w * 0.9):
                    # Group shot: center between both speakers
                    target_center_x = (min_x + max_x) // 2
                    for f in detected_faces:
                        f.is_speaker = True
                else:
                    # Score dominant active speaker by area and spatial continuity
                    best_face = None
                    best_score = -1.0
                    for f in detected_faces:
                        area = f.w * f.h
                        center = f.x + (f.w // 2)
                        dist_to_prev = abs(center - last_speaker_x)
                        # Area weight + proximity weight
                        score = (area / (source_w * source_h)) * 1000.0 + (1.0 - dist_to_prev / source_w) * 1.5
                        if score > best_score:
                            best_score = score
                            best_face = f

                    if best_face:
                        best_face.is_speaker = True
                        target_center_x = best_face.x + (best_face.w // 2)
                    else:
                        target_center_x = last_speaker_x
            else:
                # No face detected in this frame -> maintain current camera position
                target_center_x = last_speaker_x

            # Detect speaker switch (significant jump > 20% of video width)
            if abs(target_center_x - last_speaker_x) > (source_w * 0.20):
                speaker_switches += 1

            last_speaker_x = target_center_x

            raw_detections.append({
                "time": rel_time,
                "target_center_x": target_center_x,
                "faces": detected_faces
            })

        cap.release()

        # Telemetry: Check if face tracking was viable or if center fallback is required
        face_detection_ratio = (
            sum(1 for d in raw_detections if len(d["faces"]) > 0) / max(1, frames_sampled)
        )

        has_faces = (total_faces_detected > 0 and face_detection_ratio >= 0.15)
        detection_status = "active_tracking" if has_faces else "fallback_center"
        fallback_reason = (
            None if has_faces else "No sustained human faces detected in video. Center Crop applied as safe fallback."
        )

        # Apply Smooth Camera Motion Filter (Anti-Jitter Deadband + EMA Smoothing)
        keyframes: List[CropKeyframe] = []
        deadband_px = int(source_w * 0.05)  # 5% deadband prevents head jitter from moving camera
        smooth_center_x = center_crop_x + (crop_w // 2)
        alpha = 0.22  # Exponential Moving Average smoothing factor

        for d in raw_detections:
            t = d["time"]
            target_cx = d["target_center_x"]

            if has_faces:
                # Deadband check: if within deadband, don't move camera
                diff = target_cx - smooth_center_x
                if abs(diff) > deadband_px:
                    # Move towards target with smooth damping
                    smooth_center_x += int(diff * alpha)
            else:
                # Center fallback
                smooth_center_x = source_w // 2

            # Clamp crop bounds to keep inside source video frame
            calculated_crop_x = int(smooth_center_x - (crop_w // 2))
            calculated_crop_x = max(0, min(max_crop_x, calculated_crop_x))
            calculated_crop_x = calculated_crop_x - (calculated_crop_x % 2)

            keyframes.append(
                CropKeyframe(
                    timestamp=t,
                    crop_x=calculated_crop_x,
                    crop_y=center_crop_y,
                    crop_w=crop_w,
                    crop_h=crop_h,
                    speaker_x=target_cx if has_faces else None,
                    faces_count=len(d["faces"]),
                    faces=d["faces"]
                )
            )

        # Static crop fallback representation
        static_box = (
            {"x": center_crop_x, "y": center_crop_y, "w": crop_w, "h": crop_h}
            if not has_faces
            else None
        )

        return {
            "source_w": source_w,
            "source_h": source_h,
            "target_w": target_w,
            "target_h": target_h,
            "crop_w": crop_w,
            "crop_h": crop_h,
            "detection_status": detection_status,
            "faces_detected": has_faces,
            "speaker_detected": has_faces,
            "total_faces_found": total_faces_detected,
            "speaker_switches": speaker_switches,
            "fallback_reason": fallback_reason,
            "keyframes": keyframes,
            "static_crop": static_box
        }

    def generate_crop_filter_expression(
        self,
        analysis_result: Dict[str, Any],
        target_w: int,
        target_h: int,
        mode: CropMode = CropMode.SMART_AUTO
    ) -> Tuple[str, bool]:
        """
        Builds a high-performance FFmpeg video filtergraph expression.
        Returns (filter_expression_string, is_complex_filter: bool).
        """
        sw = analysis_result["source_w"]
        sh = analysis_result["source_h"]

        # 1. GTA 6 FULL / DIRECT 9:16 ACTION CROP (No top split, pure centered vertical action)
        if mode in [CropMode.FULL_SCREEN, "full_screen", CropMode.CENTER_CROP, "center_crop"]:
            crop_w = int(sh * target_w / target_h)
            crop_w -= crop_w % 2
            crop_h = sh
            crop_x = (sw - crop_w) // 2
            crop_x -= crop_x % 2
            vf = f"crop={crop_w}:{crop_h}:{crop_x}:0,scale={target_w}:{target_h}:flags=fast_bilinear,setsar=1"
            return vf, False

        # 2. GTA 6 FIT / BLUR BACKGROUND (Original 16:9 centered with blurred duplicate background)
        if mode in [CropMode.BLUR_FIT, "blur_fit"]:
            scaled_h = int(round(target_w * (sh / sw)))
            scaled_h -= scaled_h % 2
            y_offset = (target_h - scaled_h) // 2
            filter_str = (
                f"[0:v]split=2[bg][fg]; "
                f"[bg]scale={target_w}:{target_h}:force_original_aspect_ratio=increase,crop={target_w}:{target_h},boxblur=25:5,setsar=1[bg_blur]; "
                f"[fg]scale={target_w}:{scaled_h}:flags=fast_bilinear,setsar=1[fg_scaled]; "
                f"[bg_blur][fg_scaled]overlay=0:{y_offset}[v]"
            )
            return filter_str, True

        # 3. GTA 6 TOP / STREAMER SPLIT (Streamer Cam Top 40% + Gameplay Bottom 60%)
        if mode in [CropMode.STREAMER_SPLIT, "streamer_split"]:
            top_h = int(round(target_h * 0.40))
            top_h -= top_h % 2
            bot_h = target_h - top_h

            # Calculate camera crop with aspect ratio matching target_w:top_h (1080:768)
            cam_aspect = target_w / top_h
            cam_w = min(sw, int(round(sh * cam_aspect * 0.55)))
            cam_w -= cam_w % 2
            cam_h = int(round(cam_w / cam_aspect))
            cam_h -= cam_h % 2

            # Use detected face if available, otherwise default to top right or center top
            keyframes = analysis_result.get("keyframes", [])
            valid_x = [kf.crop_x for kf in keyframes if kf.crop_x is not None and kf.crop_x >= 0]
            if valid_x:
                face_center_x = int(np.median(valid_x))
                cam_x = max(0, min(sw - cam_w, face_center_x - (cam_w // 2)))
            else:
                cam_x = max(0, sw - cam_w - int(sw * 0.05)) # Top-right standard streamer placement
            cam_x -= cam_x % 2
            cam_y = 0

            # Calculate gameplay crop with aspect ratio matching target_w:bot_h (1080:1152)
            game_aspect = target_w / bot_h
            game_w = min(sw, int(round(sh * game_aspect)))
            game_w -= game_w % 2
            game_h = min(sh, int(round(game_w / game_aspect)))
            game_h -= game_h % 2
            game_x = (sw - game_w) // 2
            game_x -= game_x % 2
            game_y = (sh - game_h) // 2
            game_y -= game_y % 2

            filter_str = (
                f"[0:v]split=2[in_cam][in_game]; "
                f"[in_cam]crop={cam_w}:{cam_h}:{cam_x}:{cam_y},scale={target_w}:{top_h}:flags=fast_bilinear,setsar=1[top]; "
                f"[in_game]crop={game_w}:{game_h}:{game_x}:{game_y},scale={target_w}:{bot_h}:flags=fast_bilinear,setsar=1[bottom]; "
                f"[top][bottom]vstack=inputs=2[v]"
            )
            return filter_str, True

        # 4. GTA 6 CAM / STREAMER BOTTOM (Gameplay Top 60% + Streamer Cam Bottom 40%)
        if mode in [CropMode.STREAMER_BOTTOM, "streamer_bottom"]:
            top_h = int(round(target_h * 0.60))
            top_h -= top_h % 2
            bot_h = target_h - top_h

            game_aspect = target_w / top_h
            game_w = min(sw, int(round(sh * game_aspect)))
            game_w -= game_w % 2
            game_h = min(sh, int(round(game_w / game_aspect)))
            game_h -= game_h % 2
            game_x = (sw - game_w) // 2
            game_x -= game_x % 2
            game_y = (sh - game_h) // 2
            game_y -= game_y % 2

            cam_aspect = target_w / bot_h
            cam_w = min(sw, int(round(sh * cam_aspect * 0.55)))
            cam_w -= cam_w % 2
            cam_h = int(round(cam_w / cam_aspect))
            cam_h -= cam_h % 2
            cam_x = max(0, sw - cam_w - int(sw * 0.05))
            cam_x -= cam_x % 2
            cam_y = 0

            filter_str = (
                f"[0:v]split=2[in_game][in_cam]; "
                f"[in_game]crop={game_w}:{game_h}:{game_x}:{game_y},scale={target_w}:{top_h}:flags=fast_bilinear,setsar=1[top]; "
                f"[in_cam]crop={cam_w}:{cam_h}:{cam_x}:{cam_y},scale={target_w}:{bot_h}:flags=fast_bilinear,setsar=1[bottom]; "
                f"[top][bottom]vstack=inputs=2[v]"
            )
            return filter_str, True

        # 5. STREAMER PIP / ADVENTURE PIP (Full 9:16 Action + Floating Webcam)
        if mode in [CropMode.STREAMER_PIP, "streamer_pip"]:
            crop_w = int(sh * target_w / target_h)
            crop_w -= crop_w % 2
            crop_x = (sw - crop_w) // 2
            crop_x -= crop_x % 2

            cam_w = int(sw * 0.35)
            cam_h = int(sh * 0.45)
            cam_x = max(0, sw - cam_w - 20)
            cam_y = 20

            filter_str = (
                f"[0:v]split=2[in_game][in_cam]; "
                f"[in_game]crop={crop_w}:{sh}:{crop_x}:0,scale={target_w}:{target_h}:flags=fast_bilinear,setsar=1[bg]; "
                f"[in_cam]crop={cam_w}:{cam_h}:{cam_x}:{cam_y},scale=380:285:flags=fast_bilinear,setsar=1[cam_box]; "
                f"[bg][cam_box]overlay=x=40:y=60[v]"
            )
            return filter_str, True

        # 6. SMART AUTO / SPEAKER TRACKING (OpenCV Median Anchor Framing)
        crop_w = analysis_result["crop_w"]
        crop_h = analysis_result["crop_h"]
        crop_y = (sh - crop_h) // 2
        keyframes: List[CropKeyframe] = analysis_result.get("keyframes", [])

        if keyframes:
            valid_x = [kf.crop_x for kf in keyframes if kf.crop_x is not None and kf.crop_x >= 0]
            stable_x = int(np.median(valid_x)) if valid_x else (sw - crop_w) // 2
        else:
            static_box = analysis_result.get("static_crop") or {}
            stable_x = static_box.get("x", (sw - crop_w) // 2)

        stable_x = max(0, min(sw - crop_w, stable_x))
        stable_x -= stable_x % 2
        crop_y -= crop_y % 2
        vf = f"crop={crop_w}:{crop_h}:{stable_x}:{crop_y},scale={target_w}:{target_h}:flags=fast_bilinear,setsar=1"
        return vf, False

    async def render_reframed_video(
        self,
        input_video_path: str,
        output_video_path: str,
        start_time: float,
        end_time: float,
        aspect_ratio: ReframingAspectRatio = ReframingAspectRatio.VERTICAL_9_16,
        mode: CropMode = CropMode.SMART_AUTO,
        manual_offset: float = 0.5
    ) -> Dict[str, Any]:
        """
        Executes FFmpeg with smooth intelligent reframing crop filter and exports the final video.
        """
        if not os.path.exists(input_video_path):
            raise FileNotFoundError(f"Input video not found: {input_video_path}")

        Path(output_video_path).parent.mkdir(parents=True, exist_ok=True)

        # 1. Run face analysis
        analysis = await self.analyze_reframing(
            video_path=input_video_path,
            start_time=start_time,
            end_time=end_time,
            aspect_ratio=aspect_ratio,
            mode=mode,
            manual_offset=manual_offset
        )

        target_w = analysis["target_w"]
        target_h = analysis["target_h"]
        duration = max(0.5, round(end_time - start_time, 3)) if end_time > start_time else None

        # 2. Build FFmpeg filtergraph (simple or complex)
        filter_expr, is_complex = self.generate_crop_filter_expression(analysis, target_w, target_h, mode=mode)

        cmd = [
            self.ffmpeg_path,
            "-y",
            "-ss", f"{start_time:.3f}",
            "-i", input_video_path,
        ]
        if duration:
            cmd.extend(["-t", f"{duration:.3f}"])

        if is_complex:
            cmd.extend([
                "-filter_complex", filter_expr,
                "-map", "[v]",
                "-map", "0:a:0?"
            ])
        else:
            cmd.extend([
                "-vf", filter_expr,
                "-map", "0:v:0",
                "-map", "0:a:0?"
            ])

        cmd.extend([
            "-c:v", "libx264",
            "-preset", "veryfast",
            "-crf", "18",
            "-tune", "fastdecode",
            "-threads", "0",
            "-pix_fmt", "yuv420p",
            "-avoid_negative_ts", "make_zero",
            "-c:a", "aac",
            "-b:a", "192k",
            "-ar", "48000",
            "-ac", "2",
            output_video_path
        ])

        loop = asyncio.get_event_loop()

        def _run_ffmpeg():
            logger.info(f"FFmpeg running intelligent reframing ({aspect_ratio.value}, mode={mode.value}): {cmd}")
            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            if res.returncode != 0:
                logger.error(f"FFmpeg reframing error: {res.stderr}")
                raise RuntimeError(f"FFmpeg reframing failed: {res.stderr[:200]}")
            return output_video_path

        await loop.run_in_executor(None, _run_ffmpeg)

        # Generate thumbnail for reframed vertical clip
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
        def _run_thumb():
            subprocess.run(thumb_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        await loop.run_in_executor(None, _run_thumb)

        return {
            "output_video_path": output_video_path,
            "thumbnail_path": str(thumb_path),
            "analysis": analysis
        }

video_reframer = IntelligentVideoReframer()
