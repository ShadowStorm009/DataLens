from typing import List
import pandas as pd
import numpy as np
from backend.app.audit.rules.base import AuditRule, RuleFinding, get_missing_mask

class TypeConsistencyRule(AuditRule):
    """
    Detects mixed-type columns where values cannot be converted to an inferred dominant type
    without silent coercion or data corruption.
    """

    @property
    def rule_id(self) -> str:
        return "rule_type_consistency"

    @property
    def name(self) -> str:
        return "Type Consistency Detector"

    @property
    def description(self) -> str:
        return "Detects mixed types or unparseable values in predominantly numeric or date columns."

    def evaluate(self, df: pd.DataFrame, **kwargs) -> List[RuleFinding]:
        findings: List[RuleFinding] = []
        total_rows = len(df)
        if total_rows == 0:
            return findings

        for col in df.columns:
            try:
                col_series = df[col]
                missing_mask = get_missing_mask(col_series)
                non_null_series = col_series[~missing_mask]
                non_null_count = len(non_null_series)

                if non_null_count < 4:
                    continue

                # Check 1: Predominantly numeric (50% to 99.9% numeric)
                numeric_parsed = pd.to_numeric(non_null_series, errors="coerce")
                numeric_valid_mask = numeric_parsed.notna() & np.isfinite(numeric_parsed)
                valid_num_count = int(numeric_valid_mask.sum())
                num_ratio = valid_num_count / non_null_count

                if 0.50 <= num_ratio < 1.0:
                    inconsistent_mask = ~numeric_valid_mask
                    inconsistent_count = int(inconsistent_mask.sum())
                    inconsistent_pct = round((inconsistent_count / non_null_count) * 100.0, 2)
                    sample_invalids = non_null_series[inconsistent_mask].astype(str).unique()[:5].tolist()

                    severity = "high" if inconsistent_pct >= 10.0 else "medium"

                    findings.append(
                        RuleFinding(
                            rule_id=self.rule_id,
                            title=f"Mixed types in numeric column '{col}' ({inconsistent_count} non-numeric)",
                            severity=severity,
                            column_name=str(col),
                            description=(
                                f"Column '{col}' is predominantly numeric ({round(num_ratio * 100, 1)}% numeric), "
                                f"but contains {inconsistent_count} values ({inconsistent_pct}%) that cannot be "
                                "converted to numbers without data loss."
                            ),
                            structured_evidence={
                                "dominant_type": "numeric",
                                "valid_dominant_count": valid_num_count,
                                "inconsistent_count": inconsistent_count,
                                "inconsistent_percentage": inconsistent_pct,
                                "sample_inconsistent_values": sample_invalids,
                            },
                            recommendation=(
                                f"Clean or standardize non-numeric entries in '{col}' (samples: {sample_invalids}) "
                                "or convert unparseable values to explicit nulls before casting to numeric."
                            ),
                            finding_type="type_inconsistency",
                        )
                    )
                    continue

                # Check 2: Predominantly datetime (50% to 99.9% parseable dates)
                # Only check if not already predominantly numeric
                if num_ratio < 0.20:
                    date_parsed = pd.to_datetime(non_null_series, errors="coerce", format="mixed")
                    date_valid_mask = date_parsed.notna()
                    valid_date_count = int(date_valid_mask.sum())
                    date_ratio = valid_date_count / non_null_count

                    if 0.60 <= date_ratio < 1.0:
                        inconsistent_mask = ~date_valid_mask
                        inconsistent_count = int(inconsistent_mask.sum())
                        inconsistent_pct = round((inconsistent_count / non_null_count) * 100.0, 2)
                        sample_invalids = non_null_series[inconsistent_mask].astype(str).unique()[:5].tolist()

                        severity = "high" if inconsistent_pct >= 10.0 else "medium"

                        findings.append(
                            RuleFinding(
                                rule_id=self.rule_id,
                                title=f"Mixed types in date column '{col}' ({inconsistent_count} unparseable)",
                                severity=severity,
                                column_name=str(col),
                                description=(
                                    f"Column '{col}' is predominantly date-formatted ({round(date_ratio * 100, 1)}%), "
                                    f"but contains {inconsistent_count} values ({inconsistent_pct}%) that do not "
                                    "conform to standard datetime formats."
                                ),
                                structured_evidence={
                                    "dominant_type": "datetime",
                                    "valid_dominant_count": valid_date_count,
                                    "inconsistent_count": inconsistent_count,
                                    "inconsistent_percentage": inconsistent_pct,
                                    "sample_inconsistent_values": sample_invalids,
                                },
                                recommendation=(
                                    f"Standardize date formats in '{col}' or map irregular entries "
                                    f"(samples: {sample_invalids}) to explicit missing values."
                                ),
                                finding_type="type_inconsistency",
                            )
                        )
            except Exception:
                continue

        return findings
