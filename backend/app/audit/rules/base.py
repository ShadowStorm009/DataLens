from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional, Dict, Any, List
import pandas as pd
import numpy as np

# Standardized missing tokens consistent across audit and profiling
MISSING_TOKENS = frozenset(["", "nan", "none", "null", "n/a", "na", "<na>", "undefined"])

def get_missing_mask(series: pd.Series) -> pd.Series:
    """Return a boolean mask where True indicates a missing, null, or empty value."""
    if series.empty:
        return pd.Series([], dtype=bool)
    
    # Check pandas null/isna
    isna_mask = series.isna()
    # Check string representation for whitespace or missing token representations
    str_vals = series.astype(str).str.strip().str.lower()
    token_mask = str_vals.isin(MISSING_TOKENS)
    return isna_mask | token_mask

@dataclass
class RuleFinding:
    rule_id: str
    title: str
    severity: str  # "high", "medium", "low"
    description: str
    recommendation: str
    finding_type: str
    column_name: Optional[str] = None
    structured_evidence: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "rule_id": self.rule_id,
            "title": self.title,
            "severity": self.severity,
            "description": self.description,
            "recommendation": self.recommendation,
            "finding_type": self.finding_type,
            "column_name": self.column_name,
            "structured_evidence": self.structured_evidence,
        }

class AuditRule(ABC):
    """Base class for all deterministic DataLens audit rules."""

    @property
    @abstractmethod
    def rule_id(self) -> str:
        """Unique identifier for this rule, e.g. 'rule_missing_values'."""
        pass

    @property
    @abstractmethod
    def name(self) -> str:
        """Human-readable name of the audit check."""
        pass

    @property
    @abstractmethod
    def description(self) -> str:
        """Description of what this rule checks and its rationale."""
        pass

    @abstractmethod
    def evaluate(self, df: pd.DataFrame, **kwargs) -> List[RuleFinding]:
        """
        Evaluate the DataFrame deterministically and return any findings.
        Should never mutate the input DataFrame.
        Should catch column-level exceptions gracefully so one strange column does not fail the rule.
        """
        pass
