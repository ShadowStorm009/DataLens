from datetime import datetime
from typing import Optional, Dict, Any, List, Union
from pydantic import BaseModel, Field, field_validator
import json

class FindingResponse(BaseModel):
    id: str
    audit_id: str
    rule_id: str
    column_name: Optional[str] = None
    severity: str
    title: str
    description: str
    structured_evidence: Optional[Union[Dict[str, Any], List[Any], str]] = None
    recommendation: str
    finding_type: str

    @field_validator("structured_evidence", mode="before")
    @classmethod
    def parse_structured_evidence(cls, v: Any) -> Any:
        if isinstance(v, str):
            try:
                return json.loads(v)
            except Exception:
                return v
        return v

    model_config = {"from_attributes": True}

class AuditRunRequest(BaseModel):
    version_id: Optional[str] = Field(None, description="Optional version ID to audit; defaults to current version")
    target_column: Optional[str] = Field(None, description="Optional target column for class imbalance and leakage checks")

class AuditRunResponse(BaseModel):
    id: str
    dataset_id: str
    version_id: str
    created_at: datetime
    status: str
    score: Optional[float] = None
    score_method_version: str
    summary: Optional[Dict[str, Any]] = None
    findings: List[FindingResponse] = []

    @field_validator("summary", mode="before")
    @classmethod
    def parse_summary(cls, v: Any) -> Any:
        if isinstance(v, str):
            try:
                return json.loads(v)
            except Exception:
                return {}
        return v

    model_config = {"from_attributes": True}

class AuditListResponse(BaseModel):
    audits: List[AuditRunResponse]
    total: int
