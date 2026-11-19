import os
from datetime import datetime
from typing import List, Optional
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, BackgroundTasks, status
from app.core.config import settings
from app.core.logging import logger
from app.core.database import get_database
from app.models.video import (
    VideoResponse, 
    VideoStatus, 
    VideoSourceType, 
    VideoCreateFromUrl,
    VideoDeleteResponse,
    VideoMetadata
)
from app.services.video.downloader import video_downloader
from app.services.video.ffmpeg_editor import ffmpeg_editor

router = APIRouter()

# In-memory storage cache if MongoDB is offline or for rapid retrieval
_in_memory_videos = {}

@router.post("/upload", response_model=VideoResponse, status_code=status.HTTP_201_CREATED)
async def upload_video(
    file: UploadFile = File(...)
):
    """
    Complete Video Upload Endpoint:
    - Validates file format (MP4, MOV, WebM)
    - Validates file size (max 500MB)
    - Saves to dedicated uploads directory
    - Generates unique ID
    - Extracts real metadata via FFprobe (duration, dimensions, fps, codecs, bitrate)
    - Generates video thumbnail frame via FFmpeg
    - Stores metadata in MongoDB
    - Returns video metadata and playback URLs
    """
    logger.info(f"Incoming video upload: filename={file.filename}, content_type={file.content_type}")
    
    file_info = await video_downloader.save_uploaded_file(file)
    video_id = file_info["id"]

    video_doc = {
        "id": video_id,
        "title": file_info["title"],
        "original_filename": file_info["original_filename"],
        "stored_filename": file_info["stored_filename"],
        "source_type": VideoSourceType.FILE_UPLOAD,
        "source_url": None,
        "file_path": file_info["file_path"],
        "file_size_mb": file_info["file_size_mb"],
        "duration": file_info["duration"],
        "video_url": file_info["video_url"],
        "thumbnail_url": file_info["thumbnail_url"],
        "metadata": file_info["metadata"],
        "status": VideoStatus.READY,
        "progress_percentage": 100,
        "current_step": "Video ready for AI clipping",
        "error_message": None,
        "transcript_available": False,
        "clips_count": 0,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }

    # Persist to MongoDB
    db = get_database()
    if db is not None:
        try:
            await db.videos.insert_one(dict(video_doc))
            logger.info(f"Video {video_id} persisted to MongoDB.")
        except Exception as e:
            logger.warning(f"Could not save video to MongoDB: {e}")

    _in_memory_videos[video_id] = video_doc
    logger.info(f"Video upload successful: {video_id} ({file_info['duration']}s, {file_info['file_size_mb']}MB)")

    return VideoResponse(**video_doc)

@router.post("/url", response_model=VideoResponse, status_code=status.HTTP_201_CREATED)
async def import_video_from_url(payload: VideoCreateFromUrl):
    """
    Import & Download Video from URL (YouTube, Vimeo, Twitch, or Direct Link):
    - Uses yt-dlp to download and convert to web-compatible MP4
    - Generates thumbnail and extracts FFprobe metadata
    - Stores project record in MongoDB
    - Returns full VideoResponse
    """
    logger.info(f"Incoming URL import request: {payload.url}")
    file_info = await video_downloader.download_from_url(payload.url)
    video_id = file_info["id"]

    video_doc = {
        "id": video_id,
        "title": file_info["title"],
        "original_filename": file_info["original_filename"],
        "stored_filename": file_info["stored_filename"],
        "source_type": VideoSourceType.YOUTUBE_URL,
        "source_url": payload.url,
        "file_path": file_info["file_path"],
        "file_size_mb": file_info["file_size_mb"],
        "duration": file_info["duration"],
        "video_url": file_info["video_url"],
        "thumbnail_url": file_info["thumbnail_url"],
        "metadata": file_info["metadata"],
        "status": VideoStatus.READY,
        "progress_percentage": 100,
        "current_step": "Video ready for AI clipping",
        "error_message": None,
        "transcript_available": False,
        "clips_count": 0,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }

    db = get_database()
    if db is not None:
        try:
            await db.videos.insert_one(dict(video_doc))
            logger.info(f"URL video {video_id} persisted to MongoDB.")
        except Exception as e:
            logger.warning(f"Could not save video to MongoDB: {e}")

    _in_memory_videos[video_id] = video_doc
    logger.info(f"Video URL import successful: {video_id} ({file_info['duration']}s, {file_info['file_size_mb']}MB)")

    return VideoResponse(**video_doc)

@router.get("", response_model=List[VideoResponse])
async def list_videos():
    """Lists all uploaded/processed videos in descending order of creation."""
    db = get_database()
    if db is not None:
        try:
            cursor = db.videos.find().sort("created_at", -1)
            docs = await cursor.to_list(length=100)
            valid_videos = []
            for d in docs:
                try:
                    valid_videos.append(VideoResponse(**d))
                except Exception as parse_err:
                    logger.debug(f"Skipping malformed video doc {d.get('id')}: {parse_err}")
            if valid_videos:
                return valid_videos
        except Exception as e:
            logger.warning(f"MongoDB fetch failed: {e}. Falling back to cache.")

    # Return in-memory cache sorted by created_at desc
    sorted_vids = sorted(
        _in_memory_videos.values(),
        key=lambda v: v["created_at"],
        reverse=True
    )
    return [VideoResponse(**v) for v in sorted_vids]

@router.get("/{video_id}", response_model=VideoResponse)
async def get_video(video_id: str):
    """Retrieves metadata and status of a single video."""
    db = get_database()
    if db is not None:
        try:
            doc = await db.videos.find_one({"id": video_id})
            if doc:
                return VideoResponse(**doc)
        except Exception as e:
            logger.warning(f"MongoDB fetch error for {video_id}: {e}")

    if video_id in _in_memory_videos:
        return VideoResponse(**_in_memory_videos[video_id])

    raise HTTPException(status_code=404, detail="Video not found")

@router.delete("/{video_id}", response_model=VideoDeleteResponse)
async def delete_video(video_id: str):
    """
    Deletes an uploaded video:
    - Removes video file from disk
    - Removes thumbnail from disk
    - Deletes document from MongoDB
    - Cleans up in-memory cache
    """
    logger.info(f"Requested deletion of video {video_id}")
    video_doc = None

    db = get_database()
    if db is not None:
        try:
            video_doc = await db.videos.find_one({"id": video_id})
            if video_doc:
                # Find and delete all physical clip files for this video
                try:
                    clips_cursor = db.clips.find({"video_id": video_id})
                    clips_list = await clips_cursor.to_list(length=1000)
                    for clip in clips_list:
                        cid = clip.get("id")
                        if cid:
                            if settings.GENERATED_CLIPS_DIR.exists():
                                for f in settings.GENERATED_CLIPS_DIR.glob(f"{cid}*"):
                                    try:
                                        f.unlink()
                                        logger.info(f"Deleted clip file {f}")
                                    except Exception as e:
                                        logger.warning(f"Error removing clip file {f}: {e}")
                            if settings.THUMBNAIL_DIR.exists():
                                for f in settings.THUMBNAIL_DIR.glob(f"{cid}*"):
                                    try:
                                        f.unlink()
                                    except Exception as e:
                                        logger.warning(f"Error removing clip thumb {f}: {e}")
                except Exception as e:
                    logger.warning(f"Error deleting clip files: {e}")

                # Delete from DB
                await db.videos.delete_one({"id": video_id})
                await db.clips.delete_many({"video_id": video_id})
                await db.transcripts.delete_many({"video_id": video_id})
        except Exception as e:
            logger.warning(f"MongoDB deletion warning: {e}")

    if not video_doc and video_id in _in_memory_videos:
        video_doc = _in_memory_videos.pop(video_id, None)

    if not video_doc:
        raise HTTPException(status_code=404, detail="Video not found")

    # Delete video file from uploads directory
    file_path = video_doc.get("file_path")
    if file_path and os.path.exists(file_path):
        try:
            os.remove(file_path)
            logger.info(f"Deleted video file {file_path}")
        except Exception as e:
            logger.error(f"Error removing file {file_path}: {e}")

    # Delete any temporary extracted WAV files matching video_id
    if settings.UPLOAD_DIR.exists():
        for wav_file in settings.UPLOAD_DIR.glob(f"{video_id}*.wav"):
            try:
                wav_file.unlink()
            except Exception:
                pass

    # Delete video thumbnail if present
    if settings.THUMBNAIL_DIR.exists():
        for thumb in settings.THUMBNAIL_DIR.glob(f"{video_id}*"):
            try:
                thumb.unlink()
                logger.info(f"Deleted thumbnail {thumb}")
            except Exception as e:
                logger.error(f"Error removing thumbnail {thumb}: {e}")

    return VideoDeleteResponse(
        id=video_id,
        success=True,
        message=f"Video '{video_doc.get('title', video_id)}' and its clips successfully deleted."
    )

@router.get("/storage/summary")
async def get_storage_summary():
    """
    Storage Management Endpoint:
    Provides disk space breakdown for uploaded videos, generated clips, and thumbnails.
    """
    def _dir_stats(directory: Path):
        if not directory.exists():
            return 0, 0
        total_size = 0
        count = 0
        for f in directory.glob("*"):
            if f.is_file():
                total_size += f.stat().st_size
                count += 1
        return count, round(total_size / (1024 * 1024), 2)

    uploads_count, uploads_mb = _dir_stats(settings.UPLOAD_DIR)
    clips_count, clips_mb = _dir_stats(settings.GENERATED_CLIPS_DIR)
    thumbs_count, thumbs_mb = _dir_stats(settings.THUMBNAIL_DIR)

    db = get_database()
    total_videos_db = 0
    total_clips_db = 0
    if db is not None:
        try:
            total_videos_db = await db.videos.count_documents({})
            total_clips_db = await db.clips.count_documents({})
        except Exception:
            pass

    return {
        "status": "healthy",
        "total_storage_mb": round(uploads_mb + clips_mb + thumbs_mb, 2),
        "uploads": {"count": uploads_count, "size_mb": uploads_mb},
        "generated_clips": {"count": clips_count, "size_mb": clips_mb},
        "thumbnails": {"count": thumbs_count, "size_mb": thumbs_mb},
        "database": {
            "projects_count": total_videos_db,
            "clips_count": total_clips_db
        }
    }

@router.post("/storage/cleanup")
async def cleanup_storage():
    """
    Deep Storage & Cache Cleanup Endpoint:
    1. Removes all temporary audio .wav files
    2. Removes orphan clips whose parent video or clip record no longer exists in DB
    3. Removes orphan uploaded videos not present in DB
    4. Removes orphan thumbnails
    """
    cleaned_count = 0
    reclaimed_bytes = 0

    db = get_database()
    active_video_ids = set(_in_memory_videos.keys())
    active_clip_ids = set()
    active_file_paths = set()

    if db is not None:
        try:
            async for v in db.videos.find({}, {"id": 1, "file_path": 1}):
                if v.get("id"):
                    active_video_ids.add(v["id"])
                if v.get("file_path"):
                    active_file_paths.add(Path(v["file_path"]).name)

            async for c in db.clips.find({}, {"id": 1}):
                if c.get("id"):
                    active_clip_ids.add(c["id"])
        except Exception as e:
            logger.warning(f"Error querying active documents during cleanup: {e}")

    # 1. Clean temporary wav files in upload dir
    if settings.UPLOAD_DIR.exists():
        for wav_file in settings.UPLOAD_DIR.glob("*.wav"):
            try:
                size = wav_file.stat().st_size
                wav_file.unlink()
                cleaned_count += 1
                reclaimed_bytes += size
            except Exception as e:
                logger.warning(f"Failed to delete temp wav {wav_file}: {e}")

    # 2. Clean orphan upload video files if not in active DB
    if settings.UPLOAD_DIR.exists():
        for f in settings.UPLOAD_DIR.glob("*"):
            if f.is_file() and f.suffix.lower() in [".mp4", ".mkv", ".webm", ".mov", ".avi"]:
                is_active = (f.name in active_file_paths) or any(vid in f.name for vid in active_video_ids)
                if not is_active:
                    try:
                        size = f.stat().st_size
                        f.unlink()
                        cleaned_count += 1
                        reclaimed_bytes += size
                        logger.info(f"Cleaned orphan video file: {f.name}")
                    except Exception as e:
                        logger.warning(f"Failed to delete orphan video {f}: {e}")

    # 3. Clean orphan generated clips not matching any active clip ID or video ID
    if settings.GENERATED_CLIPS_DIR.exists():
        for f in settings.GENERATED_CLIPS_DIR.glob("*"):
            if f.is_file():
                is_active = any(cid in f.name for cid in active_clip_ids) or any(vid in f.name for vid in active_video_ids)
                if not is_active:
                    try:
                        size = f.stat().st_size
                        f.unlink()
                        cleaned_count += 1
                        reclaimed_bytes += size
                        logger.info(f"Cleaned orphan clip: {f.name}")
                    except Exception as e:
                        logger.warning(f"Failed to delete orphan clip {f}: {e}")

    # 4. Clean orphan thumbnails
    if settings.THUMBNAIL_DIR.exists():
        for f in settings.THUMBNAIL_DIR.glob("*"):
            if f.is_file():
                is_active = any(cid in f.name for cid in active_clip_ids) or any(vid in f.name for vid in active_video_ids)
                if not is_active:
                    try:
                        size = f.stat().st_size
                        f.unlink()
                        cleaned_count += 1
                        reclaimed_bytes += size
                    except Exception as e:
                        logger.warning(f"Failed to delete orphan thumb {f}: {e}")

    reclaimed_mb = round(reclaimed_bytes / (1024 * 1024), 2)
    logger.info(f"Deep storage cleanup: removed {cleaned_count} orphan files, reclaimed {reclaimed_mb}MB.")
    return {
        "success": True,
        "files_removed": cleaned_count,
        "space_reclaimed_mb": reclaimed_mb,
        "message": f"Successfully cleaned {cleaned_count} files and reclaimed {reclaimed_mb} MB."
    }
