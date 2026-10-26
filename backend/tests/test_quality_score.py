import pytest
import pandas as pd
from backend.app.audit.scoring import calculate_quality_score, SCORING_METHOD_VERSION, SCORING_DISCLAIMER
from backend.app.audit.rules.base import RuleFinding

def test_quality_score_clean_dataset():
    """Clean dataset with zero findings must receive a perfect score of 100.0."""
    df = pd.DataFrame({
        "a": [1, 2, 3, 4, 5],
        "b": ["apple", "banana", "cherry", "date", "elderberry"],
    })
    findings = []
    score, breakdown = calculate_quality_score(df, findings)

    assert score == 100.0
    assert breakdown["base_score"] == 100.0
    assert breakdown["final_score"] == 100.0
    assert breakdown["total_penalty"] == 0.0
    assert breakdown["scoring_method_version"] == SCORING_METHOD_VERSION
    assert breakdown["disclaimer"] == SCORING_DISCLAIMER
    assert breakdown["penalties"]["missingness"] == 0.0
    assert breakdown["penalties"]["duplicates"] == 0.0
    assert breakdown["penalties"]["constant_columns"] == 0.0
    assert breakdown["penalties"]["type_inconsistency"] == 0.0
    assert breakdown["penalties"]["anomalies_and_heuristics"] == 0.0

def test_quality_score_empty_dataset():
    """Empty dataframe receives a score of 0.0 with empty_dataset penalty."""
    df = pd.DataFrame()
    score, breakdown = calculate_quality_score(df, [])

    assert score == 0.0
    assert breakdown["final_score"] == 0.0
    assert breakdown["penalties"]["empty_dataset"] == 100.0

def test_quality_score_missingness_penalty():
    """Test transparent missingness penalty calculation."""
    # 10 rows, 2 columns = 20 cells. 4 missing cells = 20% missing ratio
    # Expected penalty: min(30.0, 0.20 * 100 * 0.75) = 15.0 pts
    df = pd.DataFrame({
        "col1": [1, 2, None, 4, 5, 6, None, 8, 9, 10],
        "col2": ["a", "b", "c", "", "e", "f", "null", "h", "i", "j"],
    })
    findings = [
        RuleFinding(
            rule_id="rule_missing_values",
            title="Missing in col1",
            severity="medium",
            description="2 missing",
            recommendation="impute",
            finding_type="missing_values",
            column_name="col1",
        ),
        RuleFinding(
            rule_id="rule_missing_values",
            title="Missing in col2",
            severity="medium",
            description="2 missing",
            recommendation="impute",
            finding_type="missing_values",
            column_name="col2",
        ),
    ]

    score, breakdown = calculate_quality_score(df, findings)
    assert breakdown["penalties"]["missingness"] == 15.0
    assert score == 85.0

def test_quality_score_duplicate_penalty():
    """Test duplicate penalty calculation."""
    # 10 rows, 4 duplicate rows = 40% duplicate ratio
    # Expected penalty: min(25.0, 0.40 * 100 * 0.5) = 20.0 pts
    df = pd.DataFrame({
        "a": [1, 1, 1, 2, 3, 3, 4, 5, 6, 7],
    })
    # Duplicates in df: index 1, 2 (duplicates of 1) and index 5 (duplicate of 3) = 3 duplicates (30%)
    # Let's create exact duplicates:
    df = pd.DataFrame({
        "a": [1, 2, 3, 4, 5, 1, 2, 3, 4, 5], # 5 duplicate rows out of 10 = 50%
    })
    # 50% * 0.5 = 25.0 pts deduction (max)
    findings = [
        RuleFinding(
            rule_id="rule_exact_duplicates",
            title="Duplicates found",
            severity="high",
            description="5 duplicate rows",
            recommendation="deduplicate",
            finding_type="duplicates",
        )
    ]

    score, breakdown = calculate_quality_score(df, findings)
    assert breakdown["penalties"]["duplicates"] == 25.0
    assert score == 75.0

def test_quality_score_constant_and_type_penalties():
    """Test penalties for constant columns and type inconsistencies."""
    df = pd.DataFrame({
        "const_col": ["A"] * 10,
        "mixed_col": [1, 2, 3, 4, 5, 6, 7, 8, "bad", "bad"],
        "clean_col1": list(range(10)),
        "clean_col2": [f"val_{i}" for i in range(10)],
    })
    # 4 columns total: 1 constant column (25.0 * 1/4 = 6.25 -> 6.2)
    # 1 type-inconsistent column (20.0 * 1/4 = 5.0)
    findings = [
        RuleFinding(
            rule_id="rule_constant_columns",
            title="Constant col",
            severity="high",
            description="Zero variance",
            recommendation="drop",
            finding_type="constant_column",
            column_name="const_col",
        ),
        RuleFinding(
            rule_id="rule_type_consistency",
            title="Mixed types",
            severity="medium",
            description="Non-numeric in numeric col",
            recommendation="clean",
            finding_type="type_inconsistency",
            column_name="mixed_col",
        ),
    ]

    score, breakdown = calculate_quality_score(df, findings)
    assert breakdown["penalties"]["constant_columns"] == 6.2
    assert breakdown["penalties"]["type_inconsistency"] == 5.0
    assert breakdown["total_penalty"] == 11.2
    assert score == 88.8

def test_quality_score_bounded_lower_limit_zero():
    """Even if penalties exceed 100, the quality score must never fall below 0.0."""
    # Highly degraded dataset
    df = pd.DataFrame({
        "all_null": [None] * 20,
        "all_dup": [1] * 20,
    })
    # Massive findings
    findings = [
        RuleFinding("rule_missing_values", "Nulls", "high", "all null", "drop", "missing_values", "all_null"),
        RuleFinding("rule_exact_duplicates", "Dups", "high", "all dups", "dedup", "duplicates"),
        RuleFinding("rule_constant_columns", "Const", "high", "const", "drop", "constant_column", "all_null"),
        RuleFinding("rule_constant_columns", "Const2", "high", "const", "drop", "constant_column", "all_dup"),
    ] + [
        RuleFinding(f"rule_anomaly_{i}", f"Anomaly {i}", "high", "desc", "rec", "anomaly")
        for i in range(10)
    ]

    score, breakdown = calculate_quality_score(df, findings)
    assert score >= 0.0
    assert score <= 100.0
    assert breakdown["final_score"] == score
