import os
import uuid
import hashlib
import pandas as pd
from pathlib import Path
from typing import Tuple, Union
from backend.app.core.config import settings
from backend.app.core.errors import StorageError, FileValidationError

class StorageService:
    """Manages secure, internal storage of dataset files preventing path traversal."""

    def __init__(self, base_dir: Path = None):
        self.base_dir = (base_dir or settings.STORAGE_DIR).resolve()
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def _resolve_safe_path(self, storage_reference: str) -> Path:
        """Resolve a storage reference ensuring it stays inside the base directory."""
        # Sanitize against path traversal
        clean_name = os.path.basename(storage_reference.strip())
        if not clean_name or clean_name != storage_reference:
            # If storage_reference contained directory separators
            target = (self.base_dir / storage_reference).resolve()
        else:
            target = (self.base_dir / clean_name).resolve()

        if not str(target).startswith(str(self.base_dir)):
            raise FileValidationError("Unsafe file path detected: directory traversal attempt blocked")
        return target

    def save_bytes(self, content: bytes, suffix: str = ".csv") -> Tuple[str, str, int]:
        """
        Save raw bytes to an internal UUID-named file.
        Returns: (storage_reference, content_hash, size_in_bytes)
        """
        file_id = str(uuid.uuid4())
        filename = f"{file_id}{suffix}"
        target_path = self.base_dir / filename

        content_hash = hashlib.sha256(content).hexdigest()
        try:
            with open(target_path, "wb") as f:
                f.write(content)
        except Exception as e:
            raise StorageError(f"Failed to persist dataset file: {str(e)}")

        return filename, content_hash, len(content)

    def save_dataframe(self, df: pd.DataFrame, suffix: str = ".csv") -> Tuple[str, str, int]:
        """
        Save a Pandas DataFrame to CSV in storage.
        Returns: (storage_reference, content_hash, size_in_bytes)
        """
        file_id = str(uuid.uuid4())
        filename = f"{file_id}{suffix}"
        target_path = self.base_dir / filename

        try:
            df.to_csv(target_path, index=False)
            with open(target_path, "rb") as f:
                content = f.read()
            content_hash = hashlib.sha256(content).hexdigest()
            return filename, content_hash, len(content)
        except Exception as e:
            if target_path.exists():
                target_path.unlink()
            raise StorageError(f"Failed to persist transformed DataFrame: {str(e)}")

    def read_dataframe(self, storage_reference: str) -> pd.DataFrame:
        """Read a stored CSV file into a Pandas DataFrame."""
        file_path = self._resolve_safe_path(storage_reference)
        if not file_path.exists():
            raise StorageError("Referenced dataset file does not exist on disk")
        try:
            return pd.read_csv(file_path)
        except Exception as e:
            raise StorageError(f"Failed to read CSV dataset file: {str(e)}")

    def get_absolute_path(self, storage_reference: str) -> Path:
        """Get absolute path for a valid storage reference."""
        file_path = self._resolve_safe_path(storage_reference)
        if not file_path.exists():
            raise StorageError("Referenced dataset file does not exist on disk")
        return file_path

    def delete_file(self, storage_reference: str) -> bool:
        """Delete a physical file if it exists."""
        try:
            file_path = self._resolve_safe_path(storage_reference)
            if file_path.exists():
                file_path.unlink()
                return True
            return False
        except Exception:
            return False

# Global singleton storage service instance
storage_service = StorageService()
