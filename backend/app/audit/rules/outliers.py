from typing import List
import pandas as pd
import numpy as np
from backend.app.audit.rules.base import AuditRule, RuleFinding, get_missing_mask

class NumericOutliersRule(AuditRule):
    """
    Detects potential numeric outliers using Tukey's Interquartile Range (IQR) fences.
    Reports Q1, Q3, IQR, lower/upper fences, and counts with explicit non-destructive uncertainty warnings.
    """

    @property
    def rule_id(self) -> str:
        return "rule_numeric_outliers"

    @property
    def name(self) -> str:
        return "Numeric Outliers Detector (Tukey IQR)"

    @property
    def description(self) -> str:
        return "Identifies potential numerical anomalies outside 1.5 * IQR fences without assuming error."

    def evaluate(self, df: pd.DataFrame, **kwargs) -> List[RuleFinding]:
        findings: List[RuleFinding] = []
        if len(df) < 5:
            return findings

        for col in df.columns:
            try:
                col_series = df[col]
                missing_mask = get_missing_mask(col_series)
                non_null_series = col_series[~missing_mask]

                # Attempt numeric coercion
                numeric_series = pd.to_numeric(non_null_series, errors="coerce")
                numeric_valid = numeric_series[np.isfinite(numeric_series)]

                # Must have at least 5 valid numbers and at least 70% of non-nulls should be numeric
                if len(numeric_valid) < 5 or (len(numeric_valid) / len(non_null_series)) < 0.70:
                    continue

                q1 = float(numeric_valid.quantile(0.25))
                q3 = float(numeric_valid.quantile(0.75))
                iqr = float(q3 - q1)

                if iqr <= 0:
                    # Constant or discrete step with zero spread in IQR
                    continue

                lower_fence = round(q1 - 1.5 * iqr, 4)
                upper_fence = round(q3 + 1.5 * iqr, 4)

                outlier_mask = (numeric_valid < lower_fence) | (numeric_valid > upper_fence)
                outliers = numeric_valid[outlier_mask]
                outlier_count = int(len(outliers))

                if outlier_count > 0:
                    total_numeric = len(numeric_valid)
                    outlier_pct = round((outlier_count / total_numeric) * 100.0, 2)
                    severity = "medium" if outlier_pct >= 5.0 else "low"

                    sample_outliers = [round(float(v), 4) for v in outliers.iloc[:5].tolist()]

                    desc = (
                        f"Column '{col}' has {outlier_count} potential outlier values ({outlier_pct}%) "
                        f"outside Tukey fences [{lower_fence}, {upper_fence}]. "
                        "Note: Outliers indicate extreme distribution values and are candidates for inspection, "
                        "not automatically data errors."
                    )

                    rec = (
                        f"Inspect extreme values in '{col}' to verify if they reflect physical recording artifacts "
                        "or valid rare real-world events. If detrimental to model training, consider robust scaling, "
                        "clipping at percentiles, or power transformation."
                    )

                    findings.append(
                        RuleFinding(
                            rule_id=self.rule_id,
                            title=f"Potential outliers in '{col}' ({outlier_count} values)",
                            severity=severity,
                            column_name=str(col),
                            description=desc,
                            structured_evidence={
                                "q1": round(q1, 4),
                                "q3": round(q3, 4),
                                "iqr": round(iqr, 4),
                                "lower_fence": lower_fence,
                                "upper_fence": upper_fence,
                                "outlier_count": outlier_count,
                                "total_numeric_values": total_numeric,
                                "outlier_percentage": outlier_pct,
                                "min_value": round(float(numeric_valid.min()), 4),
                                "max_value": round(float(numeric_valid.max()), 4),
                                "sample_outliers": sample_outliers,
                                "uncertainty_note": "Extreme values may be authentic observations rather than corruptions.",
                            },
                            recommendation=rec,
                            finding_type="outliers",
                        )
                    )
            except Exception:
                continue

        return findings
