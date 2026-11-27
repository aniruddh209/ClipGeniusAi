from pydantic_settings import BaseSettings
from typing import List, Optional
import os
from pathlib import Path

class Settings(BaseSettings):
    PROJECT_NAME: str = "ClipGenius AI"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    
    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8001
    
    # CORS
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
        "http://localhost:3002",
        "http://127.0.0.1:3002",
        "http://localhost:8001",
        "http://127.0.0.1:8001"
    ]
    
    # MongoDB
    MONGODB_URL: str = "mongodb://localhost:27017"
    DATABASE_NAME: str = "clipgenius"
    
    # Storage Paths (relative to backend root, or persistent disk if DATA_DIR is provided)
    BASE_DIR: Path = Path(__file__).resolve().parent.parent.parent
    DATA_DIR: Optional[str] = None

    @property
    def storage_root(self) -> Path:
        if self.DATA_DIR:
            return Path(self.DATA_DIR)
        return self.BASE_DIR

    @property
    def UPLOAD_DIR(self) -> Path:
        return self.storage_root / "uploads"

    @property
    def OUTPUT_DIR(self) -> Path:
        return self.storage_root / "outputs"

    @property
    def GENERATED_CLIPS_DIR(self) -> Path:
        return self.storage_root / "generated-clips"

    @property
    def DOWNLOADS_DIR(self) -> Path:
        return self.storage_root / "downloads"

    @property
    def THUMBNAIL_DIR(self) -> Path:
        return self.storage_root / "uploads" / "thumbnails"
    
    # Video & AI Processing
    MAX_UPLOAD_SIZE_MB: int = 500
    ALLOWED_EXTENSIONS: List[str] = [".mp4", ".mov", ".webm"]
    WHISPER_MODEL: str = "tiny"  # tiny, base, small, medium
    WHISPER_DEVICE: str = "cpu"  # cpu or cuda
    DEFAULT_CLIP_MIN_DURATION: int = 15  # seconds
    DEFAULT_CLIP_MAX_DURATION: int = 60  # seconds

    # Integrations
    YOUTUBE_API_KEY: Optional[str] = None

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True

settings = Settings()

# Ensure directories exist
settings.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
settings.OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
settings.GENERATED_CLIPS_DIR.mkdir(parents=True, exist_ok=True)
settings.THUMBNAIL_DIR.mkdir(parents=True, exist_ok=True)
