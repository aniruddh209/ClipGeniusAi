from pydantic import BaseModel
from typing import Optional, Any, Dict
from datetime import datetime

class TaskStatusResponse(BaseModel):
    task_id: str
    status: str  # pending, processing, completed, failed
    progress: int = 0
    message: str = ""
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    updated_at: datetime = datetime.utcnow()

class SystemHealthResponse(BaseModel):
    status: str
    version: str
    database: str
    ffmpeg_available: bool
    storage_writable: bool
    active_tasks: int
    environment: str
