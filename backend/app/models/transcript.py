from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime

class WordItem(BaseModel):
    word: str
    start: float
    end: float
    probability: float = 1.0

class TranscriptSegment(BaseModel):
    id: int
    start: float
    end: float
    text: str
    speaker: str = "Speaker 1"
    words: List[WordItem] = []

class TranscriptionRequest(BaseModel):
    video_id: str
    model_size: Optional[str] = None  # tiny, base, small, medium (None = use server default)
    language: Optional[str] = None    # None = auto-detect

class TranscriptionResponse(BaseModel):
    video_id: str
    status: str  # pending, processing, completed, failed
    progress: int = 0
    current_step: Optional[str] = None
    has_speech: bool = True
    language: Optional[str] = "en"
    language_probability: Optional[float] = 1.0
    duration: float = 0.0
    model_used: str = "base"
    full_text: str = ""
    segments: List[TranscriptSegment] = []
    total_words: int = 0
    error_message: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        from_attributes = True
