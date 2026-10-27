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
    v1_target_column: Optional[str] = Field(None, description="Target column configured for baseline audit")
    v2_target_column: Optional[str] = Field(None, description="Target column configured for comparison audit")
    audit_config_compatible: bool = Field(True, description="Whether audit configurations match")
    audit_config_note: Optional[str] = Field(None, description="Explanatory note on audit configuration differences")
    penalties_v1: Optional[Dict[str, float]] = Field(default_factory=dict)
    penalties_v2: Optional[Dict[str, float]] = Field(default_factory=dict)

class MetricDeltaItem(BaseModel):
    v1_value: Any = Field(..., description="Value in baseline version")
    v2_value: Any = Field(..., description="Value in comparison version")
    delta: Optional[float] = Field(None, description="Numeric difference (v2 - v1) if applicable")
    improved: Optional[bool] = Field(None, description="Whether the metric improved (e.g. fewer missing cells/duplicates)")

class ColumnStatComparisonItem(BaseModel):
    column_name: str = Field(..., description="Column name")
    status: str = Field("common", description="Column presence: 'common', 'removed', or 'added'")
    v1_type: Optional[str] = Field(None, description="Inferred dtype in baseline version")
    v2_type: Optional[str] = Field(None, description="Inferred dtype in comparison version")
    v1_null_count: Optional[int] = Field(None, description="Missing cell count in baseline")
    v2_null_count: Optional[int] = Field(None, description="Missing cell count in comparison")
    null_count_delta: Optional[int] = Field(None, description="Difference in missing cell count (v2 - v1)")
    v1_null_percentage: Optional[float] = Field(None, description="Missing cell percentage in baseline")
    v2_null_percentage: Optional[float] = Field(None, description="Missing cell percentage in comparison")
    null_percentage_delta: Optional[float] = Field(None, description="Difference in missing cell percentage (v2 - v1)")
    v1_distinct_count: Optional[int] = Field(None, description="Distinct non-null values in baseline")
    v2_distinct_count: Optional[int] = Field(None, description="Distinct non-null values in comparison")
    distinct_count_delta: Optional[int] = Field(None, description="Difference in distinct value count (v2 - v1)")
    v1_mean: Optional[float] = Field(None, description="Mean of numeric column in baseline")
    v2_mean: Optional[float] = Field(None, description="Mean of numeric column in comparison")
    mean_delta: Optional[float] = Field(None, description="Numeric mean difference (v2 - v1)")
    v1_median: Optional[float] = Field(None, description="Median of numeric column in baseline")
    v2_median: Optional[float] = Field(None, description="Median of numeric column in comparison")
    median_delta: Optional[float] = Field(None, description="Numeric median difference (v2 - v1)")

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
    column_stats: List[ColumnStatComparisonItem] = Field(default_factory=list, description="Column-by-column statistics comparison")
    findings_diff: FindingsDiff = Field(...)
    column_changes: ColumnChanges = Field(...)
    transformations: List[TransformationResponse] = Field(default_factory=list, description="Transformations leading to v2")
    disclaimer: str = Field(
        "Notice: Changes are measured against implemented data quality heuristics. "
        "A higher quality score indicates fewer heuristic violations, but does not guarantee semantic accuracy or domain validity."
    )
