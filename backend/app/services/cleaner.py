from dataclasses import dataclass, field
from typing import Dict, Any, List, Optional, Tuple
import pandas as pd
import numpy as np

from backend.app.core.errors import ValidationError
from backend.app.audit.rules.base import get_missing_mask

@dataclass
class TransformationResult:
    df: pd.DataFrame
    rows_affected: int
    cells_affected: int
    summary: str
    sample_diff: List[Dict[str, Any]] = field(default_factory=list)
    details: Dict[str, Any] = field(default_factory=dict)

class TransformationEngine:
    """
    Unified transformation engine providing deterministic data cleaning operations.
    Used identically for non-mutating preview and persistent application.
    """

    SUPPORTED_OPERATIONS = frozenset([
        "impute_median",
        "impute_mode",
        "remove_duplicates",
        "drop_constant_column",
    ])

    @classmethod
    def transform(
        cls,
        df: pd.DataFrame,
        operation_type: str,
        column_name: Optional[str] = None,
        parameters: Optional[Dict[str, Any]] = None,
    ) -> TransformationResult:
        """
        Execute cleaning operation on a copy of df and return TransformationResult.
        Guarantees non-mutation of input DataFrame.
        """
        if operation_type not in cls.SUPPORTED_OPERATIONS:
            raise ValidationError(
                f"Unsupported cleaning operation '{operation_type}'. "
                f"Supported operations: {sorted(list(cls.SUPPORTED_OPERATIONS))}"
            )

        # Work strictly on a deep copy to guarantee input immutability
        df_copy = df.copy(deep=True)
        params = parameters or {}

        if operation_type == "impute_median":
            return cls._impute_median(df_copy, column_name)
        elif operation_type == "impute_mode":
            return cls._impute_mode(df_copy, column_name)
        elif operation_type == "remove_duplicates":
            return cls._remove_duplicates(df_copy)
        elif operation_type == "drop_constant_column":
            return cls._drop_constant_column(df_copy, column_name)
        else:
            raise ValidationError(f"Unhandled operation type '{operation_type}'")

    @classmethod
    def _impute_median(cls, df: pd.DataFrame, column_name: Optional[str]) -> TransformationResult:
        if not column_name or column_name not in df.columns:
            raise ValidationError(f"Column '{column_name}' not found in dataset")

        series = df[column_name]
        missing_mask = get_missing_mask(series)
        non_missing = series[~missing_mask]

        if len(non_missing) == 0:
            raise ValidationError(f"Cannot impute median on '{column_name}': column is entirely missing/empty")

        # Coerce valid numbers
        numeric_series = pd.to_numeric(non_missing, errors="coerce")
        valid_numeric = numeric_series[np.isfinite(numeric_series)]

        if len(valid_numeric) == 0:
            raise ValidationError(f"Cannot impute median on '{column_name}': column contains no valid numeric values")

        median_val = float(valid_numeric.median())
        # Clean formatting: if median is integer-equivalent, display as integer
        formatted_median = str(int(median_val)) if median_val.is_integer() else str(round(median_val, 4))

        if pd.api.types.is_float_dtype(df[column_name].dtype):
            fill_val = float(median_val)
        elif pd.api.types.is_integer_dtype(df[column_name].dtype):
            fill_val = int(round(median_val))
        else:
            fill_val = formatted_median

        cells_to_impute = int(missing_mask.sum())
        sample_diff = []

        if cells_to_impute > 0:
            missing_indices = df[missing_mask].index[:10].tolist()
            for idx in missing_indices:
                sample_diff.append({
                    "row_index": int(idx),
                    "column": column_name,
                    "before": str(series.loc[idx]) if pd.notna(series.loc[idx]) else "",
                    "after": str(fill_val),
                })
            df.loc[missing_mask, column_name] = fill_val

        summary = (
            f"Imputed {cells_to_impute} missing value(s) in column '{column_name}' with median value ({formatted_median})."
            if cells_to_impute > 0
            else f"Column '{column_name}' contains no missing values; no changes applied."
        )

        return TransformationResult(
            df=df,
            rows_affected=cells_to_impute,
            cells_affected=cells_to_impute,
            summary=summary,
            sample_diff=sample_diff,
            details={"imputed_value": formatted_median, "cells_imputed": cells_to_impute},
        )

    @classmethod
    def _impute_mode(cls, df: pd.DataFrame, column_name: Optional[str]) -> TransformationResult:
        if not column_name or column_name not in df.columns:
            raise ValidationError(f"Column '{column_name}' not found in dataset")

        series = df[column_name]
        missing_mask = get_missing_mask(series)
        non_missing = series[~missing_mask]

        if len(non_missing) == 0:
            raise ValidationError(f"Cannot impute mode on '{column_name}': column is entirely missing/empty")

        mode_series = non_missing.mode()
        if mode_series.empty:
            raise ValidationError(f"Cannot impute mode on '{column_name}': no valid mode could be computed")

        mode_val_raw = mode_series.iloc[0]
        if pd.api.types.is_numeric_dtype(df[column_name].dtype):
            fill_val = mode_val_raw
        else:
            fill_val = str(mode_val_raw)

        cells_to_impute = int(missing_mask.sum())
        sample_diff = []

        if cells_to_impute > 0:
            missing_indices = df[missing_mask].index[:10].tolist()
            for idx in missing_indices:
                sample_diff.append({
                    "row_index": int(idx),
                    "column": column_name,
                    "before": str(series.loc[idx]) if pd.notna(series.loc[idx]) else "",
                    "after": str(fill_val),
                })
            df.loc[missing_mask, column_name] = fill_val

        summary = (
            f"Imputed {cells_to_impute} missing value(s) in column '{column_name}' with mode value ('{fill_val}')."
            if cells_to_impute > 0
            else f"Column '{column_name}' contains no missing values; no changes applied."
        )

        return TransformationResult(
            df=df,
            rows_affected=cells_to_impute,
            cells_affected=cells_to_impute,
            summary=summary,
            sample_diff=sample_diff,
            details={"imputed_value": fill_val, "cells_imputed": cells_to_impute},
        )

    @classmethod
    def _remove_duplicates(cls, df: pd.DataFrame) -> TransformationResult:
        duplicate_mask = df.duplicated(keep="first")
        duplicate_count = int(duplicate_mask.sum())
        sample_diff = []

        if duplicate_count > 0:
            sample_indices = df[duplicate_mask].index[:10].tolist()
            for idx in sample_indices:
                sample_diff.append({
                    "row_index": int(idx),
                    "removed_row_data": {str(k): str(v) for k, v in df.loc[idx].items()},
                })
            df_cleaned = df[~duplicate_mask].reset_index(drop=True)
        else:
            df_cleaned = df

        total_cols = len(df.columns)
        cells_affected = duplicate_count * total_cols
        summary = (
            f"Removed {duplicate_count} exact duplicate row(s), reducing dataset from {len(df)} to {len(df_cleaned)} rows."
            if duplicate_count > 0
            else "Dataset contains zero exact duplicate rows; no rows were removed."
        )

        return TransformationResult(
            df=df_cleaned,
            rows_affected=duplicate_count,
            cells_affected=cells_affected,
            summary=summary,
            sample_diff=sample_diff,
            details={"rows_removed": duplicate_count, "original_rows": len(df), "final_rows": len(df_cleaned)},
        )

    @classmethod
    def _drop_constant_column(cls, df: pd.DataFrame, column_name: Optional[str]) -> TransformationResult:
        if not column_name or column_name not in df.columns:
            raise ValidationError(f"Column '{column_name}' not found in dataset")

        if len(df.columns) <= 1:
            raise ValidationError(
                f"Cannot drop column '{column_name}': a dataset must retain at least one column."
            )

        series = df[column_name]
        missing_mask = get_missing_mask(series)
        non_missing = series[~missing_mask]
        distinct_count = non_missing.nunique()

        if distinct_count > 1:
            raise ValidationError(
                f"Cannot drop column '{column_name}' as constant: it contains {distinct_count} distinct non-null values."
            )

        constant_val = str(non_missing.iloc[0]) if distinct_count == 1 else "ALL_NULL"
        rows_count = len(df)
        df_cleaned = df.drop(columns=[column_name])

        sample_diff = [{
            "dropped_column": column_name,
            "constant_value": constant_val,
            "rows_affected": rows_count,
        }]

        summary = f"Dropped constant column '{column_name}' (constant value: '{constant_val}') across all {rows_count} rows."

        return TransformationResult(
            df=df_cleaned,
            rows_affected=rows_count,
            cells_affected=rows_count,
            summary=summary,
            sample_diff=sample_diff,
            details={"dropped_column": column_name, "constant_value": constant_val},
        )
