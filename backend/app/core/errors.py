from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from typing import Any, Dict, Optional

class DataLensError(Exception):
    """Base exception for DataLens application errors."""
    def __init__(self, message: str, status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR, details: Optional[Dict[str, Any]] = None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.details = details or {}

class ResourceNotFoundError(DataLensError):
    """Resource not found (404)."""
    def __init__(self, message: str = "Requested resource not found", details: Optional[Dict[str, Any]] = None):
        super().__init__(message, status_code=status.HTTP_404_NOT_FOUND, details=details)

class FileValidationError(DataLensError):
    """Uploaded file or parameter failed validation (422)."""
    def __init__(self, message: str = "Invalid file or parameters", details: Optional[Dict[str, Any]] = None):
        super().__init__(message, status_code=422, details=details)

class FileSizeLimitError(DataLensError):
    """Uploaded file exceeds size limit (413)."""
    def __init__(self, message: str = "File size exceeds the allowed limit", details: Optional[Dict[str, Any]] = None):
        super().__init__(message, status_code=413, details=details)

class TransformationError(DataLensError):
    """Data cleaning transformation failed (400)."""
    def __init__(self, message: str = "Transformation failed", details: Optional[Dict[str, Any]] = None):
        super().__init__(message, status_code=status.HTTP_400_BAD_REQUEST, details=details)

class ValidationError(DataLensError):
    """Validation failure on user input or operation parameters (400)."""
    def __init__(self, message: str = "Validation error", details: Optional[Dict[str, Any]] = None):
        super().__init__(message, status_code=status.HTTP_400_BAD_REQUEST, details=details)

class StorageError(DataLensError):
    """File storage or I/O failure (500)."""
    def __init__(self, message: str = "Storage error occurred", details: Optional[Dict[str, Any]] = None):
        super().__init__(message, status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, details=details)

from starlette.exceptions import HTTPException as StarletteHTTPException
from fastapi.exceptions import RequestValidationError

def register_error_handlers(app: FastAPI) -> None:
    """Register custom exception handlers with the FastAPI application."""

    @app.exception_handler(DataLensError)
    async def datalens_exception_handler(request: Request, exc: DataLensError):
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": exc.__class__.__name__,
                "message": exc.message,
                "details": exc.details,
            },
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException):
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": "HTTPException",
                "message": exc.detail if isinstance(exc.detail, str) else str(exc.detail),
                "details": {},
            },
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        return JSONResponse(
            status_code=422,
            content={
                "error": "RequestValidationError",
                "message": "Invalid request payload or parameters",
                "details": {"errors": exc.errors()},
            },
        )
