from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

class NumericStats(BaseModel):
    min: Optional[float] = None
    max: Optional[float] = None
    mean: Optional[float] = None
    median: Optional[float] = None
    std: Optional[float] = None
    q25: Optional[float] = None
    q50: Optional[float] = None
    q75: Optional[float] = None
    missing_count: int
    distinct_count: int

class CategoricalTopValue(BaseModel):
    value: str
    count: int
    percentage: float

class CategoricalStats(BaseModel):
    distinct_count: int
    missing_count: int
    unique_ratio: float
    top_values: List[CategoricalTopValue]

class DatetimeStats(BaseModel):
    min_date: Optional[str] = None
    max_date: Optional[str] = None
    invalid_date_count: int
    missing_count: int
    distinct_count: int

class ColumnProfile(BaseModel):
    name: str
    inferred_type: str  # numeric, categorical, datetime, boolean, text
    null_count: int
    null_percentage: float
    distinct_count: int
    numeric_stats: Optional[NumericStats] = None
    categorical_stats: Optional[CategoricalStats] = None
    datetime_stats: Optional[DatetimeStats] = None

class DatasetProfileResponse(BaseModel):
    dataset_id: str
    version_id: str
    version_number: int
    row_count: int
    column_count: int
    total_cells: int
    missing_cells: int
    missing_percentage: float
    duplicate_rows: int
    duplicate_percentage: float
    type_counts: Dict[str, int]
    columns: List[ColumnProfile]
    dataset_metrics: Optional[Dict[str, Any]] = None
