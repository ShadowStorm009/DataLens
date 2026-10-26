from pydantic import BaseModel, Field
from typing import Optional, Dict, Any

class HealthResponse(BaseModel):
    status: str = Field(..., examples=["ok"])
    app_name: str = Field(..., examples=["DataLens API"])
    version: str = Field(..., examples=["1.0.0"])
    environment: str = Field(..., examples=["development"])
    database: str = Field(..., examples=["configured"])
    timestamp: str = Field(..., examples=["2026-10-26T22:30:00Z"])

class ErrorResponse(BaseModel):
    error: str = Field(..., examples=["ResourceNotFoundError"])
    message: str = Field(..., examples=["Dataset not found"])
    details: Optional[Dict[str, Any]] = None
