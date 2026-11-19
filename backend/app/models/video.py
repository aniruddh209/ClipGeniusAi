from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum

class VideoStatus(str, Enum):
    PENDING = "pending"
    READY = "ready"
    DOWNLOADING = "downloading"
    TRANSCRIBING = "transcribing"
    ANALYZING = "analyzing"
    CLIPPING = "clipping"
    COMPLETED = "completed"
    FAILED = "failed"

class VideoSourceType(str, Enum):
    FILE_UPLOAD = "upload"
    YOUTUBE_URL = "youtube_url"
    DIRECT_CLOUD_URL = "direct_cloud_url"

class ProbeUrlRequest(BaseModel):
    url: str

class ProbeUrlResponse(BaseModel):
    url: str
    is_valid: bool = True
    is_accessible: bool = True
    title: Optional[str] = "Cloud Remote Video"
    duration: float = 0.0
    duration_formatted: str = "0:00"
    resolution: str = "1920x1080"
    fps: float = 30.0
    has_audio: bool = True
    content_type: str = "video/mp4"
    file_size_mb: float = 0.0
    direct_range_supported: bool = True
    supports_range_requests: bool = True
    error: Optional[str] = None

class VideoCreateFromUrl(BaseModel):
    url: str
    target_aspect_ratio: str = "9:16"
    min_clip_duration: int = 15
    max_clip_duration: int = 60

class VideoMetadata(BaseModel):
    duration: float = 0.0
    width: int = 1920
    height: int = 1080
    fps: float = 30.0
    aspect_ratio: str = "16:9"
    video_codec: Optional[str] = "h264"
    audio_codec: Optional[str] = "aac"
    bitrate_kbps: Optional[int] = 0
    size_mb: float = 0.0

class VideoResponse(BaseModel):
    id: str
    title: str
    original_filename: Optional[str] = None
    stored_filename: Optional[str] = None
    source_type: VideoSourceType = VideoSourceType.FILE_UPLOAD
    source_url: Optional[str] = None
    file_path: Optional[str] = None
    file_size_mb: float = 0.0
    duration: float = 0.0
    video_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    metadata: Optional[VideoMetadata] = None
    status: VideoStatus
    progress_percentage: int = 100
    current_step: Optional[str] = "Video ready for AI clipping"
    error_message: Optional[str] = None
    transcript_available: bool = False
    clips_count: int = 0
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class VideoDeleteResponse(BaseModel):
    id: str
    success: bool
    message: str
