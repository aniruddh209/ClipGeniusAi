import cv2
import numpy as np
from typing import List, Dict, Any, Optional
from scenedetect import detect, ContentDetector, AdaptiveDetector
from app.core.logging import logger

class SceneAnalyzer:
    """
    Analyzes visual scenes using PySceneDetect and OpenCV.
    - Scene boundary detection to prevent cutting mid-scene
    - Face & speaker centering for smart 9:16 vertical crop
    """

    def detect_scene_cuts(self, video_path: str, threshold: float = 28.0, max_duration: float = 120.0) -> List[float]:
        """Finds timestamps of visual cuts in the video, capped to 120s max for ultra-fast response."""
        try:
            # Analyze at most the first 120 seconds to guarantee fast, sub-second execution
            scene_list = detect(video_path, ContentDetector(threshold=threshold), start_time=0.0, end_time=max_duration)
            cut_timestamps = []
            for scene in scene_list:
                # scene is a tuple (start_time, end_time)
                cut_timestamps.append(scene[0].get_seconds())
            logger.info(f"PySceneDetect found {len(cut_timestamps)} scene transitions in {max_duration}s window.")
            return cut_timestamps
        except Exception as e:
            logger.warning(f"Scene detection failed: {e}. Falling back to speech sentence boundaries.")
            return []

    def get_optimal_crop_center(self, video_path: str, timestamp_sec: float) -> int:
        """
        Samples a frame at timestamp_sec and uses OpenCV to detect faces.
        Returns the optimal X center pixel coordinate for 9:16 vertical framing.
        """
        cap = cv2.VideoCapture(video_path)
        cap.set(cv2.CAP_PROP_POS_MSEC, timestamp_sec * 1000)
        ret, frame = cap.read()
        cap.release()

        if not ret or frame is None:
            return 960  # Default center for 1920 width

        height, width = frame.shape[:2]
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

        # Open-source Haar Cascade classifier built into OpenCV
        face_cascade = cv2.CascadeClassifier(
            cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        )
        faces = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(60, 60))

        if len(faces) > 0:
            # Pick the largest face detected (likely main speaker)
            faces = sorted(faces, key=lambda f: f[2] * f[3], reverse=True)
            x, y, w, h = faces[0]
            center_x = x + w // 2
            logger.info(f"Detected speaker face at x={center_x} for 9:16 vertical framing.")
            return center_x

        # Fallback to visual center
        return width // 2

scene_analyzer = SceneAnalyzer()
