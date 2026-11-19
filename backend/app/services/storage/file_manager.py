import os
import shutil
import uuid
from pathlib import Path
from typing import Tuple
from app.core.config import settings
from app.core.logging import logger

class FileManager:
    @staticmethod
    def generate_unique_filename(original_filename: str) -> str:
        ext = Path(original_filename).suffix.lower()
        unique_id = str(uuid.uuid4())[:12]
        clean_name = Path(original_filename).stem.replace(" ", "_")[:30]
        return f"{clean_name}_{unique_id}{ext}"

    @staticmethod
    def get_upload_path(filename: str) -> Path:
        return settings.UPLOAD_DIR / filename

    @staticmethod
    def get_output_path(filename: str) -> Path:
        return settings.OUTPUT_DIR / filename

    @staticmethod
    def file_exists(path: str) -> bool:
        return os.path.isfile(path)

    @staticmethod
    def get_file_size_mb(path: str) -> float:
        try:
            return round(os.path.getsize(path) / (1024 * 1024), 2)
        except Exception:
            return 0.0

    @staticmethod
    def delete_file(path: str) -> bool:
        try:
            if os.path.exists(path):
                os.remove(path)
                return True
        except Exception as e:
            logger.error(f"Error deleting file {path}: {e}")
        return False

file_manager = FileManager()
