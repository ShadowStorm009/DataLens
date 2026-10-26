from typing import List
import pandas as pd
from backend.app.audit.rules.base import AuditRule, RuleFinding, get_missing_mask

class HighCardinalityRule(AuditRule):
    """
    Heuristic check for columns with high cardinality or identifier-like characteristics.
    Explicitly explains uncertainty: high cardinality is not automatically an error.

    Configurable thresholds:
      - cardinality_ratio_threshold: distinct count / non-null count ratio to trigger heuristic (default: 0.90)
      - min_distinct_count: minimum distinct values required before heuristic triggers (default: 15)
    """

    def __init__(self, cardinality_ratio_threshold: float = 0.90, min_distinct_count: int = 15):
        self.cardinality_ratio_threshold = cardinality_ratio_threshold
        self.min_distinct_count = min_distinct_count

    @property
    def rule_id(self) -> str:
        return "rule_high_cardinality"

    @property
    def name(self) -> str:
        return "High-Cardinality / Identifier Heuristic"

    @property
    def description(self) -> str:
        return (
            "Detects identifier-like columns or high-cardinality features using heuristic thresholds. "
            "Labels findings with explicit domain uncertainty."
        )

    def evaluate(self, df: pd.DataFrame, **kwargs) -> List[RuleFinding]:
        findings: List[RuleFinding] = []
        total_rows = len(df)
        if total_rows < 10:
            # Need sufficient sample size to reliably distinguish identifiers from small samples
            return findings

        for col in df.columns:
            try:
                col_series = df[col]
                missing_mask = get_missing_mask(col_series)
                non_null_series = col_series[~missing_mask]
                non_null_count = len(non_null_series)

                if non_null_count < 10:
                    continue

                distinct_count = non_null_series.nunique()
                cardinality_ratio = round(distinct_count / non_null_count, 4)

                # Heuristic: > threshold unique values and at least min_distinct_count values
                if cardinality_ratio >= self.cardinality_ratio_threshold and distinct_count >= self.min_distinct_count:
                    is_exact_unique = (distinct_count == non_null_count)
                    severity = "medium" if is_exact_unique else "low"

                    title = (
                        f"Potential identifier in '{col}' (100% unique)"
                        if is_exact_unique
                        else f"High cardinality in '{col}' ({round(cardinality_ratio * 100, 1)}% distinct)"
                    )

                    desc = (
                        f"Column '{col}' has {distinct_count} distinct values across {non_null_count} "
                        f"non-null rows ({round(cardinality_ratio * 100, 1)}% unique ratio). "
                        "Heuristic evaluation indicates this may be a surrogate key, UUID, record identifier, "
                        "or high-cardinality text feature. Note: High cardinality is not necessarily an error; "
                        "domain verification is required."
                    )

                    rec = (
                        f"If '{col}' is a row identifier or database key, exclude it from predictive feature sets "
                        "to avoid memorization and data leakage. If it is high-cardinality categorical data, "
                        "consider frequency encoding, binning rare values, or text embedding."
                    )

                    findings.append(
                        RuleFinding(
                            rule_id=self.rule_id,
                            title=title,
                            severity=severity,
                            column_name=str(col),
                            description=desc,
                            structured_evidence={
                                "distinct_count": distinct_count,
                                "non_null_count": non_null_count,
                                "total_rows": total_rows,
                                "cardinality_ratio": cardinality_ratio,
                                "is_exact_unique": is_exact_unique,
                                "uncertainty_note": "Heuristic indicator only. Identifiers are valid metadata but dangerous model features.",
                            },
                            recommendation=rec,
                            finding_type="high_cardinality",
                        )
                    )
            except Exception:
                continue

        return findings
