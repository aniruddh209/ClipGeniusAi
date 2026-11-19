from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum

class CropMode(str, Enum):
    SMART_AUTO = "smart_auto"
    CENTER_CROP = "center_crop"
    MANUAL_CROP = "manual_crop"
    STREAMER_SPLIT = "streamer_split"
    STREAMER_BOTTOM = "streamer_bottom"
    STREAMER_PIP = "streamer_pip"
    BLUR_FIT = "blur_fit"
    FULL_SCREEN = "full_screen"

class ReframingAspectRatio(str, Enum):
    VERTICAL_9_16 = "9:16"
    SQUARE_1_1 = "1:1"
    LANDSCAPE_16_9 = "16:9"

class FaceBox(BaseModel):
    x: int
    y: int
    w: int
    h: int
    confidence: float = 1.0
    is_speaker: bool = False

class CropKeyframe(BaseModel):
    timestamp: float          # seconds relative to clip start
    crop_x: int
    crop_y: int
    crop_w: int
    crop_h: int
    speaker_x: Optional[int] = None
    faces_count: int = 0
    faces: List[FaceBox] = Field(default_factory=list)

class ReframePreviewRequest(BaseModel):
    video_id: str
    clip_id: Optional[str] = None
    start_time: float = 0.0
    end_time: float = 0.0
    target_aspect_ratio: ReframingAspectRatio = ReframingAspectRatio.VERTICAL_9_16
    mode: CropMode = CropMode.SMART_AUTO
    manual_crop_offset: float = Field(default=0.5, ge=0.0, le=1.0) # 0.0 = left edge, 0.5 = center, 1.0 = right edge

class ReframePreviewResponse(BaseModel):
    video_id: str
    clip_id: Optional[str] = None
    source_width: int
    source_height: int
    target_width: int
    target_height: int
    target_aspect_ratio: str
    mode: CropMode
    detection_status: str     # "active_tracking", "fallback_center", "manual"
    faces_detected: bool
    speaker_detected: bool
    total_faces_found: int
    speaker_switches: int
    fallback_reason: Optional[str] = None
    keyframes: List[CropKeyframe] = Field(default_factory=list)
    static_crop: Optional[Dict[str, int]] = None
    video_url: Optional[str] = None

class ReframeRenderRequest(BaseModel):
    video_id: str
    clip_id: Optional[str] = None
    start_time: float = 0.0
    end_time: float = 0.0
    target_aspect_ratio: ReframingAspectRatio = ReframingAspectRatio.VERTICAL_9_16
    mode: CropMode = CropMode.SMART_AUTO
    manual_crop_offset: float = Field(default=0.5, ge=0.0, le=1.0)
    smooth_transitions: bool = True

class ReframeRenderResponse(BaseModel):
    job_id: str
    video_id: str
    clip_id: Optional[str] = None
    status: str               # "completed", "failed"
    output_video_url: str
    thumbnail_url: str
    target_aspect_ratio: str
    mode_used: CropMode
    detection_status: str
    duration: float
    error: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
