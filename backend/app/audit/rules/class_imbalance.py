from typing import List, Optional, Dict, Any
import pandas as pd
from backend.app.audit.rules.base import AuditRule, RuleFinding, get_missing_mask

class ClassImbalanceRule(AuditRule):
    """
    Detects target-class imbalance in a selected categorical target column or candidate target columns.
    Reports class frequencies, imbalance ratio, and minority class share.

    Configurable thresholds:
      - high_ratio_threshold: majority:minority ratio for 'high' severity (default: 10.0)
      - medium_ratio_threshold: majority:minority ratio for 'medium' severity (default: 4.0)
      - high_minority_pct: minority percentage below which severity is 'high' (default: 5.0%)
      - medium_minority_pct: minority percentage below which severity is 'medium' (default: 20.0%)
    """

    def __init__(
        self,
        high_ratio_threshold: float = 10.0,
        medium_ratio_threshold: float = 4.0,
        high_minority_pct: float = 5.0,
        medium_minority_pct: float = 20.0,
    ):
        self.high_ratio_threshold = high_ratio_threshold
        self.medium_ratio_threshold = medium_ratio_threshold
        self.high_minority_pct = high_minority_pct
        self.medium_minority_pct = medium_minority_pct

    @property
    def rule_id(self) -> str:
        return "rule_class_imbalance"

    @property
    def name(self) -> str:
        return "Target-Class Imbalance Detector"

    @property
    def description(self) -> str:
        return "Detects severe class frequency skew in categorical target columns."

    def evaluate(self, df: pd.DataFrame, **kwargs) -> List[RuleFinding]:
        findings: List[RuleFinding] = []
        total_rows = len(df)
        if total_rows < 10:
            return findings

        target_column: Optional[str] = kwargs.get("target_column")
        columns_to_check: List[str] = []

        if target_column and target_column in df.columns:
            columns_to_check = [target_column]
        else:
            # Check candidate binary/small categorical columns commonly used as targets
            target_keywords = {"target", "label", "churn", "fraud", "default", "outcome", "class", "status"}
            for col in df.columns:
                col_lower = str(col).lower()
                if any(kw in col_lower for kw in target_keywords):
                    columns_to_check.append(col)

        for col in columns_to_check:
            try:
                col_series = df[col]
                missing_mask = get_missing_mask(col_series)
                valid_series = col_series[~missing_mask]
                valid_count = len(valid_series)

                if valid_count < 10:
                    continue

                value_counts = valid_series.value_counts()
                distinct_classes = len(value_counts)

                # Target columns typically have between 2 and 20 classes
                if distinct_classes < 2 or distinct_classes > 20:
                    continue

                majority_class = str(value_counts.index[0])
                majority_count = int(value_counts.iloc[0])
                minority_class = str(value_counts.index[-1])
                minority_count = int(value_counts.iloc[-1])

                minority_pct = round((minority_count / valid_count) * 100.0, 2)
                imbalance_ratio = round(majority_count / max(minority_count, 1), 2)

                # Check if imbalance threshold breached
                if minority_pct < self.medium_minority_pct or imbalance_ratio >= self.medium_ratio_threshold:
                    if minority_pct < self.high_minority_pct or imbalance_ratio >= self.high_ratio_threshold:
                        severity = "high"
                    else:
                        severity = "medium"

                    class_dist: Dict[str, Dict[str, Any]] = {}
                    for cls_val, count in value_counts.items():
                        class_dist[str(cls_val)] = {
                            "count": int(count),
                            "percentage": round((count / valid_count) * 100.0, 2),
                        }

                    is_explicit = (target_column == col)
                    label_type = "Selected target" if is_explicit else "Candidate target"

                    desc = (
                        f"{label_type} column '{col}' has severe class imbalance: minority class "
                        f"'{minority_class}' represents only {minority_pct}% of samples ({minority_count}/{valid_count}), "
                        f"with an imbalance ratio of {imbalance_ratio}:1 relative to '{majority_class}'."
                    )

                    rec = (
                        f"When training predictive models on '{col}', evaluate stratified splitting, "
                        "cost-sensitive loss re-weighting, or targeted over/undersampling. Rely on Precision-Recall AUC "
                        "rather than raw Accuracy to evaluate model performance."
                    )

                    findings.append(
                        RuleFinding(
                            rule_id=self.rule_id,
                            title=f"Class imbalance in '{col}' ({imbalance_ratio}:1 ratio, {minority_pct}% minority)",
                            severity=severity,
                            column_name=str(col),
                            description=desc,
                            structured_evidence={
                                "target_column": str(col),
                                "is_user_selected_target": is_explicit,
                                "distinct_classes_count": distinct_classes,
                                "majority_class": majority_class,
                                "majority_count": majority_count,
                                "minority_class": minority_class,
                                "minority_count": minority_count,
                                "minority_percentage": minority_pct,
                                "imbalance_ratio": imbalance_ratio,
                                "class_distribution": class_dist,
                            },
                            recommendation=rec,
                            finding_type="class_imbalance",
                        )
                    )
            except Exception:
                continue

        return findings
