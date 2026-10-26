import pytest
import pandas as pd
import numpy as np
from fastapi.testclient import TestClient

from backend.app.audit.rules.missing_values import MissingValuesRule
from backend.app.audit.rules.duplicates import DuplicateRowsRule
from backend.app.audit.rules.constant_columns import ConstantColumnsRule
from backend.app.audit.rules.high_cardinality import HighCardinalityRule
from backend.app.audit.rules.outliers import NumericOutliersRule
from backend.app.audit.rules.type_consistency import TypeConsistencyRule
from backend.app.audit.rules.class_imbalance import ClassImbalanceRule
from backend.app.audit.rules.potential_leakage import PotentialLeakageRule
from backend.app.audit.engine import AuditEngine
from backend.app.audit.rules.base import AuditRule, RuleFinding

# ==========================================
# Unit Tests for Individual Audit Rules
# ==========================================

def test_missing_values_rule_positive_and_negative():
    rule = MissingValuesRule()

    # Positive test: DataFrame with missing cells
    df_dirty = pd.DataFrame({
        "clean_col": ["a", "b", "c", "d", "e"],
        "mild_missing": ["a", "b", "", "d", "e"],        # 1/5 = 20% -> high severity
        "severe_missing": ["a", None, "nan", "null", "e"], # 3/5 = 60% -> high severity
    })
    findings = rule.evaluate(df_dirty)
    assert len(findings) == 2

    mild_finding = next(f for f in findings if f.column_name == "mild_missing")
    assert mild_finding.structured_evidence["null_count"] == 1
    assert mild_finding.structured_evidence["null_percentage"] == 20.0
    assert mild_finding.severity == "high"

    severe_finding = next(f for f in findings if f.column_name == "severe_missing")
    assert severe_finding.structured_evidence["null_count"] == 3
    assert severe_finding.structured_evidence["null_percentage"] == 60.0

    # Negative test: Clean DataFrame
    df_clean = pd.DataFrame({"a": [1, 2, 3], "b": ["x", "y", "z"]})
    assert len(rule.evaluate(df_clean)) == 0

def test_duplicate_rows_rule():
    rule = DuplicateRowsRule()

    # Positive test: exact duplicate rows
    df_dup = pd.DataFrame({
        "id": [1, 2, 1, 3, 2],
        "name": ["Alice", "Bob", "Alice", "Charlie", "Bob"],
    })
    findings = rule.evaluate(df_dup)
    assert len(findings) == 1
    f = findings[0]
    assert f.structured_evidence["duplicate_count"] == 2
    assert f.structured_evidence["total_rows"] == 5
    assert f.structured_evidence["duplicate_percentage"] == 40.0
    assert f.severity == "high"
    assert len(f.structured_evidence["sample_duplicate_indices"]) == 2

    # Negative test: all unique rows
    df_unique = pd.DataFrame({"a": [1, 2, 3], "b": ["x", "y", "z"]})
    assert len(rule.evaluate(df_unique)) == 0

    # Edge case: single row
    assert len(rule.evaluate(pd.DataFrame({"a": [1]}))) == 0

def test_constant_columns_rule():
    rule = ConstantColumnsRule()

    df = pd.DataFrame({
        "varying": [1, 2, 3, 4],
        "constant_val": ["ACTIVE", "ACTIVE", "ACTIVE", "ACTIVE"],
        "constant_with_null": ["X", "X", "", None],
        "all_null": [None, "", "nan", "null"],
    })
    findings = rule.evaluate(df)
    assert len(findings) == 3

    col_names = {f.column_name for f in findings}
    assert col_names == {"constant_val", "constant_with_null", "all_null"}

    all_null_f = next(f for f in findings if f.column_name == "all_null")
    assert all_null_f.severity == "high"
    assert all_null_f.structured_evidence["is_all_null"] is True

    const_f = next(f for f in findings if f.column_name == "constant_val")
    assert const_f.severity == "high"
    assert const_f.structured_evidence["constant_value"] == "ACTIVE"

    const_null_f = next(f for f in findings if f.column_name == "constant_with_null")
    assert const_null_f.severity == "medium"

def test_high_cardinality_rule():
    rule = HighCardinalityRule()

    # Positive test: 25 unique IDs
    unique_ids = [f"USR_{i:04d}" for i in range(25)]
    repeated_status = ["ACTIVE", "PENDING"] * 12 + ["ACTIVE"]
    df = pd.DataFrame({
        "user_id": unique_ids,
        "status": repeated_status,
    })
    findings = rule.evaluate(df)
    assert len(findings) == 1
    f = findings[0]
    assert f.column_name == "user_id"
    assert f.structured_evidence["is_exact_unique"] is True
    assert "uncertainty_note" in f.structured_evidence

    # Negative test: small dataset < 10 rows
    assert len(rule.evaluate(df.iloc[:5])) == 0

def test_numeric_outliers_rule():
    rule = NumericOutliersRule()

    # Clustered normal values around 10, plus extreme outliers 1000 and -500
    vals = [10.0, 10.5, 9.8, 10.2, 10.1, 9.9, 10.3, 10.0, 10.4, 9.7, 1000.0, -500.0]
    df = pd.DataFrame({"measurements": vals})
    findings = rule.evaluate(df)

    assert len(findings) == 1
    f = findings[0]
    assert f.column_name == "measurements"
    assert f.structured_evidence["outlier_count"] == 2
    assert f.structured_evidence["lower_fence"] < 9.7
    assert f.structured_evidence["upper_fence"] > 10.5
    assert "uncertainty_note" in f.structured_evidence

    # Negative test: perfectly uniform values (no IQR spread)
    df_uniform = pd.DataFrame({"measurements": [10.0] * 10})
    assert len(rule.evaluate(df_uniform)) == 0

def test_type_consistency_rule():
    rule = TypeConsistencyRule()

    # Column that is mostly numbers, but has 2 string errors
    mostly_numeric = ["10.5", "20.1", "15.0", "18.3", "22.4", "ERROR", "UNKNOWN", "19.0", "25.0", "30.0"]
    purely_text = ["cat", "dog", "bird", "fish", "rabbit", "horse", "cow", "pig", "sheep", "goat"]
    df = pd.DataFrame({
        "price": mostly_numeric,
        "species": purely_text,
    })
    findings = rule.evaluate(df)
    assert len(findings) == 1
    f = findings[0]
    assert f.column_name == "price"
    assert f.structured_evidence["dominant_type"] == "numeric"
    assert f.structured_evidence["inconsistent_count"] == 2
    assert "ERROR" in f.structured_evidence["sample_inconsistent_values"]

def test_class_imbalance_rule():
    rule = ClassImbalanceRule()

    # 95 'No' and 5 'Yes' -> severe imbalance (19:1 ratio, 5% minority)
    labels = ["No"] * 95 + ["Yes"] * 5
    df = pd.DataFrame({"churn": labels, "feature": range(100)})

    findings = rule.evaluate(df, target_column="churn")
    assert len(findings) == 1
    f = findings[0]
    assert f.column_name == "churn"
    assert f.severity == "high"
    assert f.structured_evidence["minority_class"] == "Yes"
    assert f.structured_evidence["minority_percentage"] == 5.0
    assert f.structured_evidence["imbalance_ratio"] == 19.0

    # Negative test: balanced target
    balanced = pd.DataFrame({"target": ["A"] * 50 + ["B"] * 50})
    assert len(rule.evaluate(balanced, target_column="target")) == 0

def test_potential_leakage_rule():
    rule = PotentialLeakageRule()

    # Feature x and target y with correlation > 0.99
    x = np.linspace(1, 100, 30)
    y = 2.0 * x + np.random.normal(0, 0.01, 30)
    unrelated = np.random.uniform(0, 10, 30)

    df = pd.DataFrame({"feature_x": x, "target_y": y, "unrelated_z": unrelated})
    findings = rule.evaluate(df, target_column="target_y")

    assert len(findings) >= 1
    f = next(f for f in findings if f.column_name == "feature_x")
    assert f.finding_type == "potential_leakage"
    assert f.structured_evidence["abs_correlation"] >= 0.98
    assert "uncertainty_note" in f.structured_evidence

def test_audit_engine_execution_and_resilience():
    # Test that a faulty rule doesn't crash the engine
    class FailingRule(AuditRule):
        @property
        def rule_id(self): return "rule_faulty"
        @property
        def name(self): return "Faulty Rule"
        @property
        def description(self): return "Always throws an exception"
        def evaluate(self, df, **kwargs):
            raise RuntimeError("Synthetic rule explosion")

    engine = AuditEngine(rules=[MissingValuesRule(), FailingRule()])
    df = pd.DataFrame({"a": [1, None, 3], "b": ["x", "y", "z"]})

    score, method_ver, summary, findings = engine.run_audit(df)

    assert 0.0 <= score <= 100.0
    assert method_ver == "1.0"
    assert len(findings) == 1
    assert summary["rule_execution_log"]["rule_faulty"]["status"] == "failed"
    assert summary["rule_execution_log"]["rule_missing_values"]["status"] == "success"

# ==========================================
# Integration Tests for Audit API Endpoints
# ==========================================

def test_run_audit_endpoint_and_retrieve_findings(client: TestClient):
    csv_content = (
        "id,user_id,status,score,target\n"
        "1,U1,ACTIVE,10.0,0\n"
        "2,U2,ACTIVE,10.2,0\n"
        "3,U3,ACTIVE,,0\n"
        "4,U4,ACTIVE,10.1,0\n"
        "5,U5,ACTIVE,9.9,0\n"
        "6,U6,ACTIVE,10.3,0\n"
        "7,U7,ACTIVE,1000.0,0\n"  # outlier
        "8,U8,ACTIVE,10.2,0\n"
        "9,U9,ACTIVE,10.1,0\n"
        "10,U10,ACTIVE,9.8,0\n"
        "11,U11,ACTIVE,10.0,1\n"  # minority class
        "12,U12,ACTIVE,10.2,0\n"
    )

    # 1. Upload dataset
    upload_res = client.post(
        "/api/v1/datasets",
        files={"file": ("audit_test.csv", csv_content.encode("utf-8"), "text/csv")},
        data={"name": "Audit Sample Dataset"},
    )
    assert upload_res.status_code == 201
    dataset_data = upload_res.json()
    dataset_id = dataset_data["id"]
    version_id = dataset_data["current_version_id"]

    # 2. Run Audit on dataset
    audit_res = client.post(
        f"/api/v1/datasets/{dataset_id}/audits",
        json={"target_column": "target"},
    )
    assert audit_res.status_code == 201
    audit_data = audit_res.json()
    audit_id = audit_data["id"]

    assert audit_data["dataset_id"] == dataset_id
    assert audit_data["version_id"] == version_id
    assert audit_data["status"] == "completed"
    assert 0.0 <= audit_data["score"] <= 100.0
    assert audit_data["score_method_version"] == "1.0"
    assert "penalties" in audit_data["summary"]
    assert len(audit_data["findings"]) > 0

    # 3. Retrieve audit runs list
    list_res = client.get(f"/api/v1/datasets/{dataset_id}/audits")
    assert list_res.status_code == 200
    list_data = list_res.json()
    assert list_data["total"] >= 1
    assert any(a["id"] == audit_id for a in list_data["audits"])

    # 4. Retrieve specific audit run
    detail_res = client.get(f"/api/v1/datasets/{dataset_id}/audits/{audit_id}")
    assert detail_res.status_code == 200
    assert detail_res.json()["id"] == audit_id

    # 5. Filter findings by severity
    findings_res = client.get(f"/api/v1/datasets/{dataset_id}/audits/{audit_id}/findings?severity=high")
    assert findings_res.status_code == 200
    high_findings = findings_res.json()
    for f in high_findings:
        assert f["severity"] == "high"

    # 6. Filter findings by column
    status_findings_res = client.get(f"/api/v1/datasets/{dataset_id}/audits/{audit_id}/findings?column_name=status")
    assert status_findings_res.status_code == 200
    status_findings = status_findings_res.json()
    assert len(status_findings) >= 1
    assert status_findings[0]["column_name"] == "status"

    # 7. Non-destructive verification: Preview still matches exactly
    preview_res = client.get(f"/api/v1/datasets/{dataset_id}/preview")
    assert preview_res.status_code == 200
    assert preview_res.json()["total_rows"] == 12

    # 8. Missing dataset / audit error cases
    err_res = client.get(f"/api/v1/datasets/nonexistent-id/audits")
    assert err_res.status_code == 404

    err_res2 = client.get(f"/api/v1/datasets/{dataset_id}/audits/nonexistent-audit-id")
    assert err_res2.status_code == 404
