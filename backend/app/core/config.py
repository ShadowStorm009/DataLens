import os
from pathlib import Path
from typing import List

class Settings:
    """Application settings loaded from environment variables with sensible defaults."""
    
    APP_NAME: str = "DataLens API"
    APP_VERSION: str = "1.0.0"
    ENV: str = os.getenv("DATALENS_ENV", "development")
    
    HOST: str = os.getenv("DATALENS_HOST", "127.0.0.1")
    PORT: int = int(os.getenv("DATALENS_PORT", "8000"))
    
    # SQLite Database connection string
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./storage/datalens.db")
    
    # Storage directory for datasets and reports
    STORAGE_DIR: Path = Path(os.getenv("STORAGE_DIR", "./storage")).resolve()
    
    # Max upload limit in bytes (default 10 MB)
    MAX_UPLOAD_SIZE_BYTES: int = int(os.getenv("MAX_UPLOAD_SIZE_BYTES", str(10 * 1024 * 1024)))
    
    # CORS Configuration
    @property
    def CORS_ORIGINS(self) -> List[str]:
        raw = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
        return [origin.strip() for origin in raw.split(",") if origin.strip()]

settings = Settings()

# Ensure storage directory exists
settings.STORAGE_DIR.mkdir(parents=True, exist_ok=True)
