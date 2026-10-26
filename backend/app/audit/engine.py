from typing import List, Optional, Dict, Any, Tuple
import pandas as pd
from backend.app.audit.rules.base import AuditRule, RuleFinding
from backend.app.audit.rules.missing_values import MissingValuesRule
from backend.app.audit.rules.duplicates import DuplicateRowsRule
from backend.app.audit.rules.constant_columns import ConstantColumnsRule
from backend.app.audit.rules.high_cardinality import HighCardinalityRule
from backend.app.audit.rules.outliers import NumericOutliersRule
from backend.app.audit.rules.type_consistency import TypeConsistencyRule
from backend.app.audit.rules.class_imbalance import ClassImbalanceRule
from backend.app.audit.rules.potential_leakage import PotentialLeakageRule
from backend.app.audit.scoring import calculate_quality_score, SCORING_METHOD_VERSION

class AuditEngine:
    """
    Deterministic audit coordinator executing all registered quality rules.
    Isolates rule executions to prevent unusual columns from halting the audit.
    """

    def __init__(self, rules: Optional[List[AuditRule]] = None):
        if rules is not None:
            self.rules = rules
        else:
            self.rules = [
                MissingValuesRule(),
                DuplicateRowsRule(),
                ConstantColumnsRule(),
                HighCardinalityRule(),
                NumericOutliersRule(),
                TypeConsistencyRule(),
                ClassImbalanceRule(),
                PotentialLeakageRule(),
            ]

    def run_audit(
        self,
        df: pd.DataFrame,
        target_column: Optional[str] = None,
        **kwargs,
    ) -> Tuple[float, str, Dict[str, Any], List[RuleFinding]]:
        """
        Execute deterministic quality checks on a DataFrame.
        Returns:
            - score (float)
            - score_method_version (str)
            - summary dictionary (Dict[str, Any])
            - findings list (List[RuleFinding])
        """
        all_findings: List[RuleFinding] = []
        rule_execution_log = {}

        for rule in self.rules:
            try:
                rule_findings = rule.evaluate(df, target_column=target_column, **kwargs)
                all_findings.extend(rule_findings)
                rule_execution_log[rule.rule_id] = {
                    "status": "success",
                    "findings_count": len(rule_findings),
                }
            except Exception as e:
                # Rule resilience: record partial failure without aborting entire audit
                rule_execution_log[rule.rule_id] = {
                    "status": "failed",
                    "error": str(e),
                    "findings_count": 0,
                }

        score, summary = calculate_quality_score(df, all_findings)
        summary["rule_execution_log"] = rule_execution_log
        summary["target_column"] = target_column

        return score, SCORING_METHOD_VERSION, summary, all_findings

# Global singleton engine
audit_engine = AuditEngine()
