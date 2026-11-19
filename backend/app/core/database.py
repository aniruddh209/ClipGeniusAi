from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from typing import Optional
from app.core.config import settings
from app.core.logging import logger

class DatabaseManager:
    client: Optional[AsyncIOMotorClient] = None
    db: Optional[AsyncIOMotorDatabase] = None
    is_connected: bool = False

db_manager = DatabaseManager()

async def connect_to_mongo():
    logger.info(f"Connecting to MongoDB at {settings.MONGODB_URL}...")
    try:
        db_manager.client = AsyncIOMotorClient(
            settings.MONGODB_URL,
            serverSelectionTimeoutMS=3000
        )
        # Check connection
        await db_manager.client.admin.command('ping')
        db_manager.db = db_manager.client[settings.DATABASE_NAME]
        db_manager.is_connected = True
        logger.info(f"Successfully connected to MongoDB database: {settings.DATABASE_NAME}")
        
        # Create indexes
        await init_db_indexes(db_manager.db)
    except Exception as e:
        logger.warning(f"Could not connect to MongoDB: {e}. Running in degraded mode.")
        db_manager.is_connected = False

async def close_mongo_connection():
    if db_manager.client:
        logger.info("Closing MongoDB connection...")
        db_manager.client.close()
        logger.info("MongoDB connection closed.")

def get_database() -> Optional[AsyncIOMotorDatabase]:
    return db_manager.db

async def init_db_indexes(db: AsyncIOMotorDatabase):
    try:
        await db.videos.create_index("created_at")
        await db.videos.create_index("status")
        await db.clips.create_index("video_id")
        logger.info("MongoDB database indexes ensured.")
    except Exception as e:
        logger.warning(f"Index creation warning: {e}")
