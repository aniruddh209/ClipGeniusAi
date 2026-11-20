from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field

class ConfirmedQualityOption(BaseModel):
    format_id: str
    label: str  # e.g. "2160p (4K)", "1440p (2K)", "1080p Full HD", "720p HD", "480p", "360p", "Original quality"
    resolution: str  # "2160p (4K)", "1440p (2K)", "1080p", "720p", "480p", "360p", "Original quality"
    height: int
    fps: Optional[float] = 30.0
    ext: str = "mp4"
    filesize_bytes: Optional[int] = None
    filesize_formatted: Optional[str] = None
    codec: Optional[str] = None
    type: str = "video"  # "video" | "audio"
    recommended: bool = False
    badge: Optional[str] = None
    source_confirmed: bool = True  # strictly verified from source stream

class AuthorizedWorkflowInfo(BaseModel):
    is_owner_download_available: bool = True
    studio_url: Optional[str] = None
    studio_name: str = "YouTube Studio"
    official_guide_steps: List[str] = Field(default_factory=list)
    disclaimer: str = ""
    can_stream_download: bool = True
    copyright_license: str = "Standard YouTube License"
    requires_creator_auth: bool = False
    learn_more_url: Optional[str] = "https://support.google.com/youtube/answer/56100"

class SourceAnalysisResult(BaseModel):
    provider: str  # "youtube", "direct_media", "vimeo", etc.
    url: str
    video_id: str
    title: str
    thumbnail: Optional[str] = None
    thumbnails_all: Optional[Dict[str, str]] = None
    channel_name: str
    channel_id: Optional[str] = None
    channel_url: Optional[str] = None
    duration: float
    duration_formatted: str
    published_date: Optional[str] = None  # ISO 8601 string
    published_date_formatted: Optional[str] = None  # e.g. "Nov 18, 2024"
    view_count: Optional[int] = 0
    view_count_formatted: Optional[str] = "0 views"
    description: Optional[str] = None
    tags: Optional[List[str]] = None
    category: Optional[str] = None
    license: Optional[str] = "Standard YouTube License"
    is_creative_commons: bool = False
    is_live: bool = False
    workflow: AuthorizedWorkflowInfo
    confirmed_qualities: List[ConfirmedQualityOption]
    api_source: str = "youtube_data_api_v3"  # or "youtube_verified_stream"

class BaseSourceProvider(ABC):
    """
    Abstract base provider for modular video sources (YouTube, Vimeo, Twitch, Direct Cloud MP4)
    """

    @abstractmethod
    def can_handle(self, url: str) -> bool:
        """Determines if this provider handles the given URL"""
        pass

    @abstractmethod
    async def analyze(self, url: str) -> SourceAnalysisResult:
        """Analyzes media stream and extracts permitted public metadata and confirmed quality options"""
        pass
