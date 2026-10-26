from datetime import datetime
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field, field_validator
import json
from backend.app.schemas.dataset import DatasetVersionResponse

class TransformationPreviewRequest(BaseModel):
    version_id: Optional[str] = Field(None, description="Optional version to preview; defaults to current version")
    operation_type: str = Field(..., description="Operation: impute_median, impute_mode, remove_duplicates, drop_constant_column")
    column_name: Optional[str] = Field(None, description="Target column name (required for column-specific operations)")
    parameters: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Optional operation parameters")

class TransformationPreviewResponse(BaseModel):
    operation_type: str
    column_name: Optional[str] = None
    source_version_id: str
    rows_before: int
    columns_before: int
    rows_after: int
    columns_after: int
    rows_affected: int
    cells_affected: int
    summary: str
    sample_diff: List[Dict[str, Any]] = []
    preview_rows: List[Dict[str, Any]] = []
    columns: List[str] = []

class TransformationApplyRequest(BaseModel):
    version_id: Optional[str] = Field(None, description="Optional source version to transform; defaults to current version")
    operation_type: str = Field(..., description="Operation: impute_median, impute_mode, remove_duplicates, drop_constant_column")
    column_name: Optional[str] = Field(None, description="Target column name (required for column-specific operations)")
    parameters: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Optional operation parameters")

class TransformationResponse(BaseModel):
    id: str
    dataset_id: str
    source_version_id: str
    result_version_id: str
    operation_type: str
    column_name: Optional[str] = None
    parameters: Optional[Dict[str, Any]] = None
    rows_affected: int
    cells_affected: int
    created_at: datetime
    summary: Optional[str] = None
    result_version: Optional[DatasetVersionResponse] = None

    @field_validator("parameters", mode="before")
    @classmethod
    def parse_parameters(cls, v: Any) -> Any:
        if isinstance(v, str):
            try:
                return json.loads(v)
            except Exception:
                return {}
        return v

    model_config = {"from_attributes": True}

class TransformationListResponse(BaseModel):
    transformations: List[TransformationResponse]
    total: int
