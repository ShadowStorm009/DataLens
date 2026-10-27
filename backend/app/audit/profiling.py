import math
import numpy as np
import pandas as pd
from typing import Dict, Any, List, Optional, Tuple

def to_json_safe(val: Any) -> Any:
    """Recursively converts NumPy/Pandas types, NaNs, and Infs to JSON-safe Python primitives."""
    if val is None:
        return None
    if isinstance(val, (np.integer, int)):
        return int(val)
    if isinstance(val, (np.floating, float)):
        if math.isnan(val) or math.isinf(val):
            return None
        return round(float(val), 4)
    if isinstance(val, (np.bool_, bool)):
        return bool(val)
    if isinstance(val, (pd.Timestamp, np.datetime64)):
        return val.isoformat() if hasattr(val, "isoformat") else str(val)
    if isinstance(val, dict):
        return {k: to_json_safe(v) for k, v in val.items()}
    if isinstance(val, (list, tuple, np.ndarray)):
        return [to_json_safe(v) for v in val]
    if pd.isna(val):
        return None
    return str(val)

class ProfilingEngine:
    """Deterministic tabular profiling engine for CSV datasets."""

    BOOLEAN_TOKENS = {"true", "false", "t", "f", "1", "0", "yes", "no", "y", "n"}

    def profile_dataframe(self, df: pd.DataFrame) -> Dict[str, Any]:
        """
        Profiles a pandas DataFrame computing dataset-level and column-level metrics.
        Guards against empty, all-null, one-row, infinite, and mixed-type columns.
        """
        row_count, col_count = df.shape
        total_cells = row_count * col_count

        # Treat empty strings and standard null tokens as missing for profiling
        is_missing = pd.DataFrame(index=df.index)
        for col_name in df.columns:
            s = df[col_name]
            s_str = s.astype(str).str.strip().str.lower()
            is_missing[col_name] = s.isna() | s_str.isin(["", "nan", "none", "null", "n/a", "<na>"])

        total_missing_cells = int(is_missing.sum().sum())
        missing_percentage = (total_missing_cells / total_cells * 100.0) if total_cells > 0 else 0.0

        # Exact duplicate rows
        if row_count > 0:
            duplicate_rows_count = int(df.duplicated().sum())
            duplicate_percentage = (duplicate_rows_count / row_count * 100.0)
        else:
            duplicate_rows_count = 0
            duplicate_percentage = 0.0

        column_profiles = []
        type_counts = {"numeric": 0, "categorical": 0, "datetime": 0, "boolean": 0, "text": 0}

        for col_name in df.columns:
            series = df[col_name]
            col_missing = is_missing[col_name]
            null_count = int(col_missing.sum())
            null_pct = (null_count / row_count * 100.0) if row_count > 0 else 0.0

            # Valid non-null series for profiling
            valid_values = series[~col_missing]
            distinct_count = int(valid_values.nunique())

            col_profile = self._profile_column(
                col_name=col_name,
                series=series,
                valid_values=valid_values,
                row_count=row_count,
                null_count=null_count,
                null_pct=null_pct,
                distinct_count=distinct_count,
            )

            type_counts[col_profile["inferred_type"]] = type_counts.get(col_profile["inferred_type"], 0) + 1
            column_profiles.append(col_profile)

        dataset_metrics = {
            "row_count": row_count,
            "column_count": col_count,
            "total_cells": total_cells,
            "missing_cells": total_missing_cells,
            "missing_percentage": round(missing_percentage, 2),
            "duplicate_rows": duplicate_rows_count,
            "duplicate_percentage": round(duplicate_percentage, 2),
        }

        result = {
            "row_count": row_count,
            "column_count": col_count,
            "total_cells": total_cells,
            "missing_cells": total_missing_cells,
            "missing_percentage": round(missing_percentage, 2),
            "duplicate_rows": duplicate_rows_count,
            "duplicate_percentage": round(duplicate_percentage, 2),
            "type_counts": type_counts,
            "columns": column_profiles,
            "dataset_metrics": dataset_metrics,
        }

        return to_json_safe(result)

    def _profile_column(
        self,
        col_name: str,
        series: pd.Series,
        valid_values: pd.Series,
        row_count: int,
        null_count: int,
        null_pct: float,
        distinct_count: int,
    ) -> Dict[str, Any]:
        """Profiles an individual column and infers its statistical type."""
        base_profile = {
            "name": str(col_name),
            "inferred_type": "categorical",
            "null_count": null_count,
            "null_percentage": round(null_pct, 2),
            "distinct_count": distinct_count,
            "numeric_stats": None,
            "categorical_stats": None,
            "datetime_stats": None,
        }

        valid_count = len(valid_values)
        if valid_count == 0:
            # All null column
            base_profile["inferred_type"] = "text"
            base_profile["categorical_stats"] = {
                "distinct_count": 0,
                "missing_count": null_count,
                "unique_ratio": 0.0,
                "top_values": [],
            }
            return base_profile

        # 1. Check for Boolean column
        str_lowered = valid_values.astype(str).str.strip().str.lower()
        if distinct_count <= 2 and set(str_lowered.unique()).issubset(self.BOOLEAN_TOKENS):
            base_profile["inferred_type"] = "boolean"
            top_vals = self._get_top_values(valid_values, valid_count)
            base_profile["categorical_stats"] = {
                "distinct_count": distinct_count,
                "missing_count": null_count,
                "unique_ratio": round(distinct_count / valid_count, 4) if valid_count > 0 else 0.0,
                "top_values": top_vals,
            }
            return base_profile

        # 2. Check for Numeric column
        numeric_series = pd.to_numeric(valid_values, errors="coerce")
        valid_numeric_count = int(numeric_series.notna().sum())
        numeric_ratio = (valid_numeric_count / valid_count) if valid_count > 0 else 0.0

        if numeric_ratio >= 0.85:
            clean_num = numeric_series[np.isfinite(numeric_series)].dropna()
            if len(clean_num) > 0:
                base_profile["inferred_type"] = "numeric"
                q25, q50, q75 = clean_num.quantile([0.25, 0.50, 0.75]).tolist()
                std_val = float(clean_num.std()) if len(clean_num) > 1 else 0.0

                base_profile["numeric_stats"] = {
                    "min": float(clean_num.min()),
                    "max": float(clean_num.max()),
                    "mean": float(clean_num.mean()),
                    "median": float(clean_num.median()),
                    "std": std_val,
                    "q25": float(q25),
                    "q50": float(q50),
                    "q75": float(q75),
                    "missing_count": null_count,
                    "distinct_count": distinct_count,
                }
                return base_profile

        # 3. Check for Datetime column
        # Only test for datetime if values contain separators like - / : and reasonable length
        sample_str = str_lowered.iloc[0] if len(str_lowered) > 0 else ""
        has_date_separators = any(sep in sample_str for sep in ["-", "/", ":", "T", " "])
        if has_date_separators:
            try:
                date_series = pd.to_datetime(valid_values, errors="coerce", format="mixed")
                valid_date_count = int(date_series.notna().sum())
                date_ratio = (valid_date_count / valid_count) if valid_count > 0 else 0.0
                if date_ratio >= 0.80:
                    base_profile["inferred_type"] = "datetime"
                    clean_dates = date_series.dropna()
                    base_profile["datetime_stats"] = {
                        "min_date": clean_dates.min().isoformat() if not clean_dates.empty else None,
                        "max_date": clean_dates.max().isoformat() if not clean_dates.empty else None,
                        "invalid_date_count": valid_count - valid_date_count,
                        "missing_count": null_count,
                        "distinct_count": distinct_count,
                    }
                    return base_profile
            except Exception:
                pass

        # 4. Fallback to Categorical or Text
        unique_ratio = distinct_count / valid_count if valid_count > 0 else 0.0
        if distinct_count <= 50 or unique_ratio < 0.4:
            base_profile["inferred_type"] = "categorical"
        else:
            base_profile["inferred_type"] = "text"

        top_vals = self._get_top_values(valid_values, valid_count)
        base_profile["categorical_stats"] = {
            "distinct_count": distinct_count,
            "missing_count": null_count,
            "unique_ratio": round(unique_ratio, 4),
            "top_values": top_vals,
        }

        return base_profile

    def _get_top_values(self, valid_values: pd.Series, valid_count: int, limit: int = 5) -> List[Dict[str, Any]]:
        """Returns bounded top-N most frequent values with counts and proportions."""
        if valid_count == 0:
            return []
        counts = valid_values.value_counts(dropna=True).head(limit)
        results = []
        for val, count in counts.items():
            results.append({
                "value": str(val),
                "count": int(count),
                "percentage": round(int(count) / valid_count * 100.0, 2),
            })
        return results

profiling_engine = ProfilingEngine()
