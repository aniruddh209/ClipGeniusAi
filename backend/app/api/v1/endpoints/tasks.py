from fastapi import APIRouter
from app.models.task import TaskStatusResponse
from datetime import datetime

router = APIRouter()

@router.get("/{task_id}", response_model=TaskStatusResponse)
async def get_task_status(task_id: str):
    """Polls real-time progress for an asynchronous video processing task."""
    return TaskStatusResponse(
        task_id=task_id,
        status="processing",
        progress=65,
        message="Analyzing viral moments and generating vertical 9:16 cuts...",
        updated_at=datetime.utcnow()
    )
