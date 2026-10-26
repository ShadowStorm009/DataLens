from typing import List, Optional
import pandas as pd
import numpy as np
from backend.app.audit.rules.base import AuditRule, RuleFinding, get_missing_mask

class PotentialLeakageRule(AuditRule):
    """
    Detects potential data leakage or redundant proxy features using clearly described heuristics.
    Never claims definitive leakage; clearly states domain uncertainty.

    Configurable thresholds:
      - target_correlation_threshold: Pearson |r| with target column for leakage heuristic (default: 0.98)
      - collinearity_correlation_threshold: pairwise |r| between features for duplicate heuristic (default: 0.999)
    """

    def __init__(
        self,
        target_correlation_threshold: float = 0.98,
        collinearity_correlation_threshold: float = 0.999,
    ):
        self.target_correlation_threshold = target_correlation_threshold
        self.collinearity_correlation_threshold = collinearity_correlation_threshold

    @property
    def rule_id(self) -> str:
        return "rule_potential_leakage"

    @property
    def name(self) -> str:
        return "Potential Leakage / Redundant Feature Heuristic"

    @property
    def description(self) -> str:
        return (
            "Detects near-perfect correlations or duplicate columns that may indicate target leakage "
            "or redundant proxy variables, with explicit domain uncertainty."
        )

    def evaluate(self, df: pd.DataFrame, **kwargs) -> List[RuleFinding]:
        findings: List[RuleFinding] = []
        total_rows = len(df)
        if total_rows < 15 or len(df.columns) < 2:
            return findings

        target_column: Optional[str] = kwargs.get("target_column")

        # Heuristic 1: If a target column is specified, test features against the target
        if target_column and target_column in df.columns:
            target_series = df[target_column]
            target_numeric = pd.to_numeric(target_series, errors="coerce")

            for col in df.columns:
                if col == target_column:
                    continue

                try:
                    col_series = df[col]
                    col_numeric = pd.to_numeric(col_series, errors="coerce")

                    # If both have valid numeric values, calculate Pearson correlation
                    valid_mask = target_numeric.notna() & col_numeric.notna()
                    if valid_mask.sum() >= 10:
                        y = target_numeric[valid_mask]
                        x = col_numeric[valid_mask]

                        if x.std() > 0 and y.std() > 0:
                            corr = float(np.corrcoef(x, y)[0, 1])
                            abs_corr = abs(corr)

                            if abs_corr >= self.target_correlation_threshold:
                                findings.append(
                                    RuleFinding(
                                        rule_id=self.rule_id,
                                        title=f"Potential target leakage in '{col}' (|r| = {round(abs_corr, 3)})",
                                        severity="medium",
                                        column_name=str(col),
                                        description=(
                                            f"Column '{col}' has an extraordinarily high correlation (|r| = {round(abs_corr, 3)}) "
                                            f"with target column '{target_column}'. Heuristic evidence suggests '{col}' may be "
                                            "a proxy variable, an outcome-derived metric, or recorded post-event. "
                                            "Note: This is a statistical heuristic and does not guarantee causal leakage."
                                        ),
                                        structured_evidence={
                                            "feature_column": str(col),
                                            "target_column": str(target_column),
                                            "correlation": round(corr, 4),
                                            "abs_correlation": round(abs_corr, 4),
                                            "heuristic_basis": "Pearson linear correlation >= 0.98",
                                            "uncertainty_note": "Domain verification required; verify if feature is genuinely available at prediction time.",
                                        },
                                        recommendation=(
                                            f"Verify whether '{col}' is collected after the target '{target_column}' event occurs. "
                                            "If so, drop it from training features to avoid synthetic performance inflation."
                                        ),
                                        finding_type="potential_leakage",
                                    )
                                )
                except Exception:
                    continue

        # Heuristic 2: Check for pairwise identical or nearly identical feature columns (|r| >= 0.999)
        # Check numeric columns pairwise (limit to first 20 columns to avoid O(N^2) explosion)
        numeric_cols = []
        for col in df.columns[:25]:
            if col == target_column:
                continue
            s_num = pd.to_numeric(df[col], errors="coerce")
            if s_num.notna().sum() >= 15 and s_num.std() > 0:
                numeric_cols.append((col, s_num))

        for i in range(len(numeric_cols)):
            col1, s1 = numeric_cols[i]
            for j in range(i + 1, len(numeric_cols)):
                col2, s2 = numeric_cols[j]
                try:
                    mask = s1.notna() & s2.notna()
                    if mask.sum() >= 15:
                        corr = float(np.corrcoef(s1[mask], s2[mask])[0, 1])
                        if abs(corr) >= self.collinearity_correlation_threshold:
                            findings.append(
                                RuleFinding(
                                    rule_id=self.rule_id,
                                    title=f"Potential collinearity / duplicate feature between '{col1}' and '{col2}'",
                                    severity="low",
                                    column_name=str(col1),
                                    description=(
                                        f"Columns '{col1}' and '{col2}' are nearly identical (|r| = {round(abs(corr), 4)}). "
                                        "Heuristic evidence indicates redundant information or duplicate column definitions."
                                    ),
                                    structured_evidence={
                                        "feature_column_1": str(col1),
                                        "feature_column_2": str(col2),
                                        "correlation": round(corr, 5),
                                        "heuristic_basis": "Pairwise numeric correlation >= 0.999",
                                        "uncertainty_note": "May be a legitimate duplicated measurement or unit conversion.",
                                    },
                                    recommendation=(
                                        f"Consider dropping either '{col1}' or '{col2}' to avoid multicollinearity "
                                        "in linear models and reduce feature space redundancy."
                                    ),
                                    finding_type="potential_leakage",
                                )
                            )
                except Exception:
                    continue

        return findings
