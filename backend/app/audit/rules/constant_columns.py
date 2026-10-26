from typing import List
import pandas as pd
from backend.app.audit.rules.base import AuditRule, RuleFinding, get_missing_mask

class ConstantColumnsRule(AuditRule):
    """
    Checks for columns with zero variance: exactly one distinct non-null value (or entirely null).
    Identifies redundant features that provide no informational entropy.
    """

    @property
    def rule_id(self) -> str:
        return "rule_constant_columns"

    @property
    def name(self) -> str:
        return "Constant Columns Detector"

    @property
    def description(self) -> str:
        return "Identifies columns containing only a single distinct non-null value or all nulls."

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
                non_null_series = col_series[~missing_mask]

                distinct_non_null = non_null_series.nunique()

                if distinct_non_null == 0:
                    # Entire column is null/empty
                    findings.append(
                        RuleFinding(
                            rule_id=self.rule_id,
                            title=f"Column '{col}' is entirely empty / all-null",
                            severity="high",
                            column_name=str(col),
                            description=(
                                f"Column '{col}' contains 0 non-null values across {total_rows} rows. "
                                "It provides zero information."
                            ),
                            structured_evidence={
                                "distinct_non_null_count": 0,
                                "constant_value": None,
                                "null_count": null_count,
                                "total_rows": total_rows,
                                "is_all_null": True,
                            },
                            recommendation="Drop this column as it contains no usable data.",
                            finding_type="constant_column",
                        )
                    )
                elif distinct_non_null == 1:
                    constant_val = str(non_null_series.iloc[0])
                    if len(constant_val) > 100:
                        constant_val = constant_val[:100] + "..."

                    if null_count == 0:
                        severity = "high"
                        desc = (
                            f"Column '{col}' has the exact same value ('{constant_val}') in all "
                            f"{total_rows} rows with zero variance."
                        )
                    else:
                        severity = "medium"
                        desc = (
                            f"Column '{col}' has only one distinct value ('{constant_val}') across "
                            f"{total_rows - null_count} populated rows, and {null_count} missing rows."
                        )

                    findings.append(
                        RuleFinding(
                            rule_id=self.rule_id,
                            title=f"Column '{col}' is constant ({constant_val})",
                            severity=severity,
                            column_name=str(col),
                            description=desc,
                            structured_evidence={
                                "distinct_non_null_count": 1,
                                "constant_value": constant_val,
                                "null_count": null_count,
                                "total_rows": total_rows,
                                "is_all_null": False,
                            },
                            recommendation=(
                                f"Drop column '{col}' because it provides zero informational variance "
                                "and will not aid downstream models or analytics."
                            ),
                            finding_type="constant_column",
                        )
                    )
            except Exception:
                continue

        return findings
