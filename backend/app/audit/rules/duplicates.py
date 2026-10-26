from typing import List
import pandas as pd
from backend.app.audit.rules.base import AuditRule, RuleFinding

class DuplicateRowsRule(AuditRule):
    """
    Checks for exact duplicate rows across all columns.
    Reports duplicate counts, percentages, and sample row indices without altering the dataset.

    Configurable thresholds:
      - high_threshold_pct: percentage of duplicates at or above which severity is 'high' (default: 10.0%)
    """

    def __init__(self, high_threshold_pct: float = 10.0):
        self.high_threshold_pct = high_threshold_pct

    @property
    def rule_id(self) -> str:
        return "rule_exact_duplicates"

    @property
    def name(self) -> str:
        return "Exact Duplicate Rows Detector"

    @property
    def description(self) -> str:
        return "Detects identical records across all columns without modifying data."

    def evaluate(self, df: pd.DataFrame, **kwargs) -> List[RuleFinding]:
        findings: List[RuleFinding] = []
        total_rows = len(df)
        if total_rows <= 1:
            return findings

        try:
            duplicate_mask = df.duplicated(keep="first")
            duplicate_count = int(duplicate_mask.sum())

            if duplicate_count > 0:
                dup_pct = round((duplicate_count / total_rows) * 100.0, 2)
                # Extract up to 10 sample duplicate row indices
                sample_indices = df[duplicate_mask].index[:10].tolist()

                severity = "high" if dup_pct >= self.high_threshold_pct else "medium"

                findings.append(
                    RuleFinding(
                        rule_id=self.rule_id,
                        title=f"{duplicate_count} exact duplicate rows found ({dup_pct}%)",
                        severity=severity,
                        column_name=None,
                        description=(
                            f"The dataset contains {duplicate_count} exact duplicate rows out of "
                            f"{total_rows} total rows ({dup_pct}%). Identical records artificially skew "
                            "distributions and inflate sample significance."
                        ),
                        structured_evidence={
                            "duplicate_count": duplicate_count,
                            "total_rows": total_rows,
                            "duplicate_percentage": dup_pct,
                            "sample_duplicate_indices": [int(idx) for idx in sample_indices],
                        },
                        recommendation=(
                            "Apply deduplication to remove redundant rows, preserving the first instance "
                            "unless exact repeated observations are expected in your experimental design."
                        ),
                        finding_type="duplicates",
                    )
                )
        except Exception:
            pass

        return findings
