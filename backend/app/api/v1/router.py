from fastapi import APIRouter
from app.api.v1.endpoints import health, videos, clips, tasks, transcription, subtitles, reframing, downloader

api_router = APIRouter()

api_router.include_router(health.router, tags=["Health"])
api_router.include_router(videos.router, prefix="/videos", tags=["Videos"])
api_router.include_router(downloader.router, prefix="/downloader", tags=["Video Downloader"])
api_router.include_router(transcription.router, prefix="/transcription", tags=["AI Transcription"])
api_router.include_router(clips.router, prefix="/clips", tags=["Clips"])
api_router.include_router(subtitles.router, prefix="/subtitles", tags=["AI Subtitles"])
api_router.include_router(reframing.router, prefix="/reframing", tags=["Intelligent Reframing"])
api_router.include_router(tasks.router, prefix="/tasks", tags=["Tasks"])
