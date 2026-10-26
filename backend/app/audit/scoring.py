from typing import List, Dict, Any, Tuple
import pandas as pd
from backend.app.audit.rules.base import RuleFinding, get_missing_mask

SCORING_METHOD_VERSION = "1.0"
SCORING_DISCLAIMER = (
    "The DataLens Quality Score (0-100) reflects data hygiene and structural readiness across "
    "deterministic audit checks (missingness, duplicates, constant columns, type consistency, and anomalies). "
    "It covers implemented checks only and is not a universal correctness guarantee."
)

def calculate_quality_score(
    df: pd.DataFrame,
    findings: List[RuleFinding],
) -> Tuple[float, Dict[str, Any]]:
    """
    Compute a transparent, bounded (0-100) quality score with component penalty breakdown.
    Avoids arbitrary double-counting by anchoring core penalties to dataset dimensions.
    """
    total_rows = len(df)
    total_cols = len(df.columns)

    if total_rows == 0 or total_cols == 0:
        return 0.0, {
            "base_score": 100.0,
            "final_score": 0.0,
            "scoring_method_version": SCORING_METHOD_VERSION,
            "disclaimer": SCORING_DISCLAIMER,
            "penalties": {"empty_dataset": 100.0},
        }

    # 1. Missingness penalty (max 30.0 pts)
    total_cells = total_rows * total_cols
    total_missing_cells = 0
    for col in df.columns:
        total_missing_cells += int(get_missing_mask(df[col]).sum())
    missing_ratio = total_missing_cells / total_cells
    missing_penalty = min(30.0, round(missing_ratio * 100.0 * 0.75, 1))

    # 2. Duplicate rows penalty (max 25.0 pts)
    duplicate_rows = int(df.duplicated(keep="first").sum()) if total_rows > 1 else 0
    dup_ratio = duplicate_rows / total_rows
    dup_penalty = min(25.0, round(dup_ratio * 100.0 * 0.5, 1))

    # 3. Constant columns penalty (max 20.0 pts)
    constant_col_findings = [f for f in findings if f.rule_id == "rule_constant_columns"]
    constant_col_count = len(constant_col_findings)
    constant_penalty = min(20.0, round((constant_col_count / max(total_cols, 1)) * 25.0, 1))

    # 4. Type inconsistency penalty (max 15.0 pts)
    type_findings = [f for f in findings if f.rule_id == "rule_type_consistency"]
    type_col_count = len(type_findings)
    type_penalty = min(15.0, round((type_col_count / max(total_cols, 1)) * 20.0, 1))

    # 5. Anomaly & heuristic penalties (max 10.0 pts)
    other_findings = [
        f for f in findings
        if f.rule_id not in {"rule_missing_values", "rule_exact_duplicates", "rule_constant_columns", "rule_type_consistency"}
    ]
    other_raw = 0.0
    for f in other_findings:
        if f.severity == "high":
            other_raw += 3.0
        elif f.severity == "medium":
            other_raw += 1.5
        else:
            other_raw += 0.5
    other_penalty = min(10.0, round(other_raw, 1))

    total_penalty = round(missing_penalty + dup_penalty + constant_penalty + type_penalty + other_penalty, 1)
    final_score = max(0.0, round(100.0 - total_penalty, 1))

    # Count findings by severity
    severity_counts = {"high": 0, "medium": 0, "low": 0}
    for f in findings:
        severity_counts[f.severity] = severity_counts.get(f.severity, 0) + 1

    summary_breakdown = {
        "base_score": 100.0,
        "final_score": final_score,
        "total_penalty": total_penalty,
        "scoring_method_version": SCORING_METHOD_VERSION,
        "disclaimer": SCORING_DISCLAIMER,
        "total_missing_cells": total_missing_cells,
        "duplicate_rows_count": duplicate_rows,
        "penalties": {
            "missingness": missing_penalty,
            "duplicates": dup_penalty,
            "constant_columns": constant_penalty,
            "type_inconsistency": type_penalty,
            "anomalies_and_heuristics": other_penalty,
        },
        "finding_counts": severity_counts,
        "total_findings": len(findings),
    }

    return final_score, summary_breakdown
