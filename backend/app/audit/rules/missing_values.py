from typing import List
import pandas as pd
from backend.app.audit.rules.base import AuditRule, RuleFinding, get_missing_mask

class MissingValuesRule(AuditRule):
    """
    Checks for missing, null, or empty values in each column.
    Provides structured evidence on missing counts and percentages, and severity classification.
    """

    @property
    def rule_id(self) -> str:
        return "rule_missing_values"

    @property
    def name(self) -> str:
        return "Missing Values Detector"

    @property
    def description(self) -> str:
        return "Detects missing cells, empty strings, and null representations by column."

    def evaluate(self, df: pd.DataFrame, **kwargs) -> List[RuleFinding]:
        findings: List[RuleFinding] = []
        total_rows = len(df)
        if total_rows == 0:
            return findings

        for col in df.columns:
            try:
                col_series = df[col]
                missing_mask = get_missing_mask(col_series)
                null_count = int(missing_mask.sum())

                if null_count > 0:
                    null_pct = round((null_count / total_rows) * 100.0, 2)

                    if null_pct >= 20.0:
                        severity = "high"
                        recommendation = (
                            f"Column '{col}' has {null_pct}% missing values. "
                            "Evaluate whether this column is critical. If not, consider dropping it, "
                            "or impute with median/mode if domain context permits."
                        )
                    elif null_pct >= 5.0:
                        severity = "medium"
                        recommendation = (
                            f"Column '{col}' has {null_pct}% missing values. "
                            "Consider imputing with median (numeric) or mode (categorical) to preserve sample size."
                        )
                    else:
                        severity = "low"
                        recommendation = (
                            f"Column '{col}' has {null_pct}% missing values ({null_count} rows). "
                            "Consider dropping missing rows or filling with standard defaults."
                        )

                    findings.append(
                        RuleFinding(
                            rule_id=self.rule_id,
                            title=f"Missing values in '{col}' ({null_pct}%)",
                            severity=severity,
                            column_name=str(col),
                            description=(
                                f"Column '{col}' contains {null_count} missing or empty cells "
                                f"out of {total_rows} total rows ({null_pct}%)."
                            ),
                            structured_evidence={
                                "null_count": null_count,
                                "total_rows": total_rows,
                                "null_percentage": null_pct,
                            },
                            recommendation=recommendation,
                            finding_type="missing_values",
                        )
                    )
            except Exception as e:
                # Column-level resilience: log/continue without failing entire audit
                continue

        return findings
