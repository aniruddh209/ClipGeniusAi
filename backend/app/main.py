from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.core.config import settings
from app.core.logging import logger
from app.core.database import connect_to_mongo, close_mongo_connection
from app.services.video.downloader_manager import downloader_manager
from app.services.downloader.engine import download_engine
from app.api.v1.router import api_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info(f"Starting {settings.PROJECT_NAME} v{settings.VERSION}...")
    settings.DOWNLOADS_DIR.mkdir(parents=True, exist_ok=True)
    await connect_to_mongo()
    await downloader_manager.initialize()
    await download_engine.initialize()
    yield
    # Shutdown
    logger.info(f"Shutting down {settings.PROJECT_NAME}...")
    await close_mongo_connection()

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="ClipGenius AI - Intelligent long-form to short-form video clipping SaaS API",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ensure directories exist before mounting static files
settings.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
settings.OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
settings.GENERATED_CLIPS_DIR.mkdir(parents=True, exist_ok=True)
settings.DOWNLOADS_DIR.mkdir(parents=True, exist_ok=True)
settings.THUMBNAIL_DIR.mkdir(parents=True, exist_ok=True)

# Mount uploads and outputs for streaming uploaded videos, thumbnails & generated clips
app.mount("/uploads", StaticFiles(directory=str(settings.UPLOAD_DIR)), name="uploads")
app.mount("/outputs", StaticFiles(directory=str(settings.OUTPUT_DIR)), name="outputs")
app.mount("/generated-clips", StaticFiles(directory=str(settings.GENERATED_CLIPS_DIR)), name="generated-clips")
app.mount("/downloads", StaticFiles(directory=str(settings.DOWNLOADS_DIR)), name="downloads")

# Include API v1 Router
app.include_router(api_router, prefix=settings.API_V1_STR)

@app.get("/", tags=["Root"])
async def root():
    return {
        "app": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "status": "online",
        "docs": "/docs",
        "health": f"{settings.API_V1_STR}/health"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host=settings.HOST, port=settings.PORT, reload=settings.DEBUG)
