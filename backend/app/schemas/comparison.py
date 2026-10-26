from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from backend.app.schemas.dataset import DatasetVersionResponse
from backend.app.schemas.transformation import TransformationResponse

class ScoreComparisonResponse(BaseModel):
    v1_score: Optional[float] = Field(None, description="Score for baseline version (v1)")
    v2_score: Optional[float] = Field(None, description="Score for target/cleaned version (v2)")
    delta: Optional[float] = Field(None, description="Score delta (v2 - v1)")
    v1_method: str = Field("1.0", description="Methodology version of baseline audit")
    v2_method: str = Field("1.0", description="Methodology version of comparison audit")
    is_compatible: bool = Field(True, description="Whether both scoring methods are compatible")
    method_note: str = Field("", description="Explanatory note regarding scoring comparison")
    penalties_v1: Optional[Dict[str, float]] = Field(default_factory=dict)
    penalties_v2: Optional[Dict[str, float]] = Field(default_factory=dict)

class MetricDeltaItem(BaseModel):
    v1_value: Any = Field(..., description="Value in baseline version")
    v2_value: Any = Field(..., description="Value in comparison version")
    delta: Optional[float] = Field(None, description="Numeric difference (v2 - v1) if applicable")
    improved: Optional[bool] = Field(None, description="Whether the metric improved (e.g. fewer missing cells/duplicates)")

class FindingDiffItem(BaseModel):
    id: str = Field(...)
    rule_id: str = Field(...)
    title: str = Field(...)
    severity: str = Field(...)
    column_name: Optional[str] = Field(None)
    description: str = Field(...)
    recommendation: str = Field(...)

class FindingsDiff(BaseModel):
    resolved: List[FindingDiffItem] = Field(default_factory=list, description="Findings in v1 fixed in v2")
    new: List[FindingDiffItem] = Field(default_factory=list, description="New findings introduced in v2")
    unresolved: List[FindingDiffItem] = Field(default_factory=list, description="Findings present in both versions")
    resolved_count: int = Field(0)
    new_count: int = Field(0)
    unresolved_count: int = Field(0)

class ColumnChanges(BaseModel):
    added: List[str] = Field(default_factory=list)
    removed: List[str] = Field(default_factory=list)
    common: List[str] = Field(default_factory=list)

class VersionComparisonResponse(BaseModel):
    dataset_id: str = Field(..., description="Unique dataset identifier")
    v1: DatasetVersionResponse = Field(..., description="Baseline version (v1)")
    v2: DatasetVersionResponse = Field(..., description="Comparison/cleaned version (v2)")
    score_comparison: ScoreComparisonResponse = Field(...)
    metrics: Dict[str, MetricDeltaItem] = Field(..., description="Summary metrics delta map")
    findings_diff: FindingsDiff = Field(...)
    column_changes: ColumnChanges = Field(...)
    transformations: List[TransformationResponse] = Field(default_factory=list, description="Transformations leading to v2")
    disclaimer: str = Field(
        "Notice: Changes are measured against implemented data quality heuristics. "
        "A higher quality score indicates fewer heuristic violations, but does not guarantee semantic accuracy or domain validity."
    )
