from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum

class CaptionPreset(str, Enum):
    MODERN_WHITE = "modern_white"
    BOLD_YELLOW = "bold_yellow"
    MINIMAL_CLEAN = "minimal_clean"
    KARAOKE_HIGHLIGHT = "karaoke_highlight"
    CREATOR_STYLE = "creator_style"
    PROFESSIONAL_PODCAST = "professional_podcast"

class SubtitlePosition(str, Enum):
    BOTTOM = "bottom"
    CENTER = "center"
    TOP = "top"

class SubtitleWordItem(BaseModel):
    word: str
    start: float       # In seconds relative to clip start (0.00s)
    end: float         # In seconds relative to clip start
    is_keyword: bool = False

class SubtitleLineChunk(BaseModel):
    index: int
    start: float       # In seconds relative to clip start
    end: float         # In seconds relative to clip start
    text: str
    words: List[SubtitleWordItem] = Field(default_factory=list)

class SubtitleStyleConfig(BaseModel):
    preset: CaptionPreset = CaptionPreset.BOLD_YELLOW
    preset_name: str = "Bold Yellow"
    font_family: str = "Impact"  # Impact, Arial Black, Arial Bold, Helvetica, Montserrat
    font_size: int = 42          # Base font size scaled for 1080p
    primary_color: str = "#FFFFFF"       # Inactive / base text color
    highlight_color: str = "#FFDD00"     # Active karaoke word highlight
    keyword_color: str = "#00F0FF"       # Impact / keyword highlight color
    outline_color: str = "#000000"       # Text border / stroke
    outline_width: int = 4               # 0-8 pixels
    shadow_color: str = "#000000"
    shadow_offset: int = 4               # 0-10 pixels
    background_box: bool = False
    background_color: str = "rgba(0, 0, 0, 0.70)"
    background_padding_x: int = 24
    background_padding_y: int = 14
    background_radius: int = 16
    position: SubtitlePosition = SubtitlePosition.BOTTOM
    safe_margin_y: int = 280             # Distance in px from edge to clear TikTok/Reels UI
    max_words_per_line: int = 4          # 3 to 6 words
    uppercase: bool = True
    karaoke_animation: bool = True
    scale_active_word: bool = True       # Slight visual pop on active word

class SubtitleGenerateRequest(BaseModel):
    video_id: str
    clip_id: Optional[str] = None
    start_time: float
    end_time: float
    style: Optional[SubtitleStyleConfig] = None

class SubtitleGenerateResponse(BaseModel):
    video_id: str
    clip_id: Optional[str] = None
    chunks: List[SubtitleLineChunk]
    total_words: int
    duration: float
    style: SubtitleStyleConfig
    srt_content: str
    ass_content: str

class SubtitleBurnRequest(BaseModel):
    video_id: str
    clip_id: str
    style: Optional[SubtitleStyleConfig] = None

class SubtitleBurnResponse(BaseModel):
    clip_id: str
    video_id: str
    status: str  # "completed", "failed"
    subtitled_video_url: str
    srt_url: str
    ass_url: str
    duration: float
    style_used: SubtitleStyleConfig
    error: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
