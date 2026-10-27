import os
from pathlib import Path
from typing import List, Optional


def parse_cors_origins(raw: Optional[str], env: str = "development") -> List[str]:
    """
    Parse comma-separated CORS origins:
    - Trims whitespace from each origin
    - Strips trailing slashes to match standard browser Origin headers
    - Discards empty strings
    - In development: defaults to localhost dev servers if unset or empty
    - In production: defaults to empty list [] (never wildcard '*')
    """
    if raw is None or not raw.strip():
        if env == "production":
            return []
        return [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:8000",
            "http://127.0.0.1:8000",
        ]
    
    origins: List[str] = []
    for item in raw.split(","):
        cleaned = item.strip().rstrip("/")
        if cleaned:
            origins.append(cleaned)
    return origins


def resolve_server_port() -> int:
    """
    Resolve listening port in order of priority:
    1. Render/Cloud PORT environment variable
    2. DATALENS_PORT environment variable
    3. Fallback: 10000 in production (Render standard), 8000 in development
    """
    env_port = os.getenv("PORT") or os.getenv("DATALENS_PORT")
    if env_port and env_port.strip():
        try:
            return int(env_port.strip())
        except ValueError:
            pass
    if os.getenv("DATALENS_ENV") == "production":
        return 10000
    return 8000


def resolve_server_host() -> str:
    """
    Resolve listening host:
    - DATALENS_HOST or HOST if explicitly provided
    - 0.0.0.0 in production (binding to all interfaces for Docker/cloud)
    - 127.0.0.1 in local development
    """
    host = os.getenv("DATALENS_HOST") or os.getenv("HOST")
    if host and host.strip():
        return host.strip()
    if os.getenv("DATALENS_ENV") == "production":
        return "0.0.0.0"
    return "127.0.0.1"


def ensure_sqlite_parent_dir(database_url: str) -> None:
    """
    Ensure the parent directory for an SQLite database path exists.
    Handles relative paths (sqlite:///./storage/...) and absolute paths (sqlite:////app/storage/...).
    """
    if database_url.startswith("sqlite"):
        clean_path = database_url
        for prefix in ("sqlite:////", "sqlite:///", "sqlite://"):
            if clean_path.startswith(prefix):
                clean_path = clean_path[len(prefix):]
                if prefix == "sqlite:////" and not clean_path.startswith("/"):
                    clean_path = "/" + clean_path
                break
        clean_path = clean_path.split("?")[0]
        if clean_path and clean_path != ":memory:":
            Path(clean_path).resolve().parent.mkdir(parents=True, exist_ok=True)


class Settings:
    """Application settings loaded from environment variables with sensible defaults."""
    
    APP_NAME: str = "DataLens API"
    APP_VERSION: str = "1.0.0"

    def __init__(self):
        self._custom_port: Optional[int] = None
        self._custom_host: Optional[str] = None
        self._custom_env: Optional[str] = None
        self._custom_database_url: Optional[str] = None
        self._custom_storage_dir: Optional[Path] = None
        self._custom_max_upload_size: Optional[int] = None
    
    @property
    def ENV(self) -> str:
        if self._custom_env is not None:
            return self._custom_env
        return os.getenv("DATALENS_ENV", "development")
    
    @ENV.setter
    def ENV(self, val: str) -> None:
        self._custom_env = val
    
    @property
    def HOST(self) -> str:
        if self._custom_host is not None:
            return self._custom_host
        return resolve_server_host()
    
    @HOST.setter
    def HOST(self, val: str) -> None:
        self._custom_host = val
    
    @property
    def PORT(self) -> int:
        if self._custom_port is not None:
            return self._custom_port
        return resolve_server_port()
    
    @PORT.setter
    def PORT(self, val: int) -> None:
        self._custom_port = val
    
    @property
    def DATABASE_URL(self) -> str:
        if self._custom_database_url is not None:
            return self._custom_database_url
        return os.getenv("DATABASE_URL", "sqlite:///./storage/datalens.db")
    
    @DATABASE_URL.setter
    def DATABASE_URL(self, val: str) -> None:
        self._custom_database_url = val
    
    @property
    def STORAGE_DIR(self) -> Path:
        if self._custom_storage_dir is not None:
            return self._custom_storage_dir.resolve()
        return Path(os.getenv("STORAGE_DIR", "./storage")).resolve()
    
    @STORAGE_DIR.setter
    def STORAGE_DIR(self, val: Path) -> None:
        self._custom_storage_dir = Path(val).resolve()
    
    @property
    def MAX_UPLOAD_SIZE_BYTES(self) -> int:
        if self._custom_max_upload_size is not None:
            return self._custom_max_upload_size
        return int(os.getenv("MAX_UPLOAD_SIZE_BYTES", str(10 * 1024 * 1024)))
    
    @MAX_UPLOAD_SIZE_BYTES.setter
    def MAX_UPLOAD_SIZE_BYTES(self, val: int) -> None:
        self._custom_max_upload_size = val
    
    @property
    def CORS_ORIGINS(self) -> List[str]:
        raw = os.getenv("CORS_ORIGINS")
        return parse_cors_origins(raw, self.ENV)


settings = Settings()

# Ensure storage directory exists
settings.STORAGE_DIR.mkdir(parents=True, exist_ok=True)

# Ensure SQLite parent directory exists
ensure_sqlite_parent_dir(settings.DATABASE_URL)
