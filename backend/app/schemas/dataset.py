from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Any

class DatasetResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str = Field(..., examples=["b3f2c5d8-9a1b-4c3e-8f2a-1e2d3c4b5a6f"])
    name: str = Field(..., examples=["Sales Data 2026"])
    original_filename: str = Field(..., examples=["sales_q1.csv"])
    created_at: datetime
    current_version_id: Optional[str] = None
    row_count: int = Field(..., examples=[1500])
    column_count: int = Field(..., examples=[12])
    status: str = Field(..., examples=["ready"])

class DatasetListResponse(BaseModel):
    datasets: List[DatasetResponse]
    total: int

class DatasetVersionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    dataset_id: str
    parent_version_id: Optional[str] = None
    version_number: int
    created_at: datetime
    row_count: int
    column_count: int
    content_hash: Optional[str] = None

class DatasetPreviewResponse(BaseModel):
    dataset_id: str
    version_id: str
    version_number: int
    columns: List[str]
    rows: List[Dict[str, Any]]
    total_rows: int
    preview_limit: int
