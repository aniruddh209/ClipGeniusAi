from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum

class ClipAspectRatio(str, Enum):
    VERTICAL_9_16 = "9:16"
    SQUARE_1_1 = "1:1"
    PORTRAIT_4_5 = "4:5"

class ClipDurationRange(str, Enum):
    RANGE_15_30 = "15-30"
    RANGE_30_45 = "30-45"
    RANGE_45_60 = "45-60"
    RANGE_30_60 = "30-60"
    RANGE_60_90 = "60-90"
    AUTO = "auto"

class SubtitleStyle(BaseModel):
    font_family: str = "Montserrat-Bold"
    font_size: int = 24
    primary_color: str = "#FFDD00"  # Vibrant yellow
    secondary_color: str = "#FFFFFF"
    stroke_color: str = "#000000"
    stroke_width: int = 3
    highlight_active_word: bool = True
    position: str = "center"  # bottom, center, top

class RankingCategory(str, Enum):
    BEST_OVERALL = "Best Overall"
    BEST_HOOK = "Best Hook"
    MOST_EDUCATIONAL = "Most Educational"
    MOST_ENTERTAINING = "Most Entertaining"
    TOP_CONTENDER = "Top Contender"

class ScoreCriterionDetail(BaseModel):
    criterion: str
    score: float
    max_score: float
    evidence: str

class DetailedScoringBreakdown(BaseModel):
    # 7 Objective Criteria (Sum = 100 points)
    hook_strength: float = Field(..., ge=0, le=20, description="Hook strength (max 20 pts)")
    interesting_content: float = Field(..., ge=0, le=20, description="Interesting content (max 20 pts)")
    emotional_engagement: float = Field(..., ge=0, le=15, description="Emotional engagement (max 15 pts)")
    information_value: float = Field(..., ge=0, le=15, description="Information value (max 15 pts)")
    story_completeness: float = Field(..., ge=0, le=15, description="Story completeness (max 15 pts)")
    ending_quality: float = Field(..., ge=0, le=10, description="Ending quality (max 10 pts)")
    audio_visual_quality: float = Field(..., ge=0, le=5, description="Visual and audio quality (max 5 pts)")
    overall_score: float = Field(..., ge=0, le=100, description="Overall composite score (0-100)")

    # Backward compatibility fields
    hook_score: Optional[float] = None
    pacing_score: Optional[float] = None
    coherence_score: Optional[float] = None
    keyword_score: Optional[float] = None
    boundary_score: Optional[float] = None
    composite_score: Optional[float] = None

# Alias for backward compatibility
ScoreBreakdown = DetailedScoringBreakdown

class CandidateClip(BaseModel):
    id: str
    video_id: str
    title: str
    short_description: str
    hook: str
    category: str
    reason_for_selection: str
    start_time: float
    end_time: float
    duration: float
    transcript: str
    words_count: int = 0
    speaking_rate_wps: float = 0.0
    scores: DetailedScoringBreakdown
    overall_score: float = Field(..., ge=0, le=100)
    virality_score: float = Field(..., ge=0, le=100)
    ranking_badge: Optional[str] = None
    score_reasons: List[str] = Field(default_factory=list)
    improvement_suggestions: List[str] = Field(default_factory=list)
    criteria_details: List[ScoreCriterionDetail] = Field(default_factory=list)
    aspect_ratio: str = "9:16"
    has_subtitles: bool = True
    thumbnail_url: Optional[str] = None
    preview_url: Optional[str] = None
    download_url: Optional[str] = None
    video_url: Optional[str] = None
    status: str = "detected"
    disclaimer: str = (
        "Scores are estimated content-quality indicators based on speech analysis and structure. "
        "They are not predictions or guarantees of actual social media performance."
    )
    created_at: datetime = Field(default_factory=datetime.utcnow)

class ClipDetectionRequest(BaseModel):
    video_id: str
    duration_range: ClipDurationRange = ClipDurationRange.RANGE_30_60
    max_clips: int = Field(default=6, ge=1, le=15)
    virality_threshold: float = Field(default=55.0, ge=30.0, le=95.0)

# Backwards compatibility alias
class ClipGenerationRequest(BaseModel):
    video_id: str
    target_aspect_ratio: ClipAspectRatio = ClipAspectRatio.VERTICAL_9_16
    min_duration: int = 15
    max_duration: int = 60
    max_clips: int = 5
    add_subtitles: bool = True
    subtitle_style: Optional[SubtitleStyle] = Field(default_factory=SubtitleStyle)

class ClipDetectionTaskResponse(BaseModel):
    task_id: str
    video_id: str
    status: str  # "queued", "processing", "completed", "failed"
    progress: int = 0
    current_step: Optional[str] = None
    clips: List[CandidateClip] = []
    total_clips: int = 0
    error_message: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        from_attributes = True

# Alias for legacy compatibility
ClipItem = CandidateClip

class ClipResponse(BaseModel):
    clips: List[CandidateClip]
    total_clips: int

class FailedClipItem(BaseModel):
    clip_id: str
    title: str
    error: str

class BatchCutRequest(BaseModel):
    video_id: str
    clip_ids: Optional[List[str]] = None
    aspect_ratio: str = "9:16"  # "9:16", "1:1", "16:9"

class BatchCutJobResponse(BaseModel):
    job_id: str
    video_id: str
    status: str  # "queued", "processing", "completed", "partially_failed", "failed"
    progress: int = 0
    current_step: Optional[str] = None
    current_clip_id: Optional[str] = None
    current_clip_title: Optional[str] = None
    aspect_ratio: str = "9:16"
    total_clips: int = 0
    completed_clips: List[CandidateClip] = []
    failed_clips: List[FailedClipItem] = []
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class FullPipelineRequest(BaseModel):
    video_id: str
    target_aspect_ratio: str = "9:16"
    duration_range: str = "30-60"
    max_clips: int = Field(default=5, ge=1, le=10)
    virality_threshold: float = Field(default=50.0, ge=30.0, le=95.0)
    reframing_mode: str = "smart_auto"
    content_type: str = "gaming" # gaming, podcast, education, general
    template_layout: str = "full_screen" # full_screen, streamer_split, streamer_bottom, blur_fit, streamer_pip, smart_auto
    subtitle_preset: str = "bold_yellow" # none, bold_yellow, minimal_clean, professional_podcast, creator_style
    burn_subtitles: bool = True
    smart_reframing: bool = True
    whisper_model: str = "tiny"
    export_quality: str = "1080p_high" # 1080p_high, 1080p_standard, 720p_fast

class FullPipelineJobResponse(BaseModel):
    job_id: str
    video_id: str
    status: str  # "queued", "processing", "completed", "failed"
    progress: int = 0
    current_step: Optional[str] = None
    current_clip_title: Optional[str] = None
    target_aspect_ratio: str = "9:16"
    total_moments_detected: int = 0
    completed_clips: List[CandidateClip] = []
    failed_clips: List[FailedClipItem] = []
    error_message: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
