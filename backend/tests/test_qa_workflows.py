import pytest
import io
from pathlib import Path
from fastapi.testclient import TestClient
import pandas as pd
from backend.app.main import app

client = TestClient(app)

FIXTURE_PATH = Path(__file__).resolve().parent.parent.parent / "sample_datasets" / "datalens_test_dataset.csv"

def test_qa_comprehensive_workflow():
    """
    Comprehensive QA verification test exercising all 31 workflow points:
    - Dataset Management: Upload, listing, pagination, metadata
    - Audit Overview: Summary metrics agreement, findings inspection, severity counts
    - Column Profiling & EDA: All columns, stats, distribution bins, category counts
    - Guided Cleaning: Non-mutating preview, apply, immutability of parent, re-audit, compare
    - Export Center: v1 CSV, transformed CSV, safe CSV, HTML report, JSON report, rejection of unsupported formats
    """
    assert FIXTURE_PATH.exists(), f"Fixture file missing at {FIXTURE_PATH}"
    csv_bytes = FIXTURE_PATH.read_bytes()

    # -------------------------------------------------------------
    # 1. Dataset Management
    # -------------------------------------------------------------
    # 1. Upload supported CSV
    upload_res = client.post(
        "/api/v1/datasets",
        files={"file": ("qa_test_dataset.csv", csv_bytes, "text/csv")},
        data={"name": "QA Verification Dataset"},
    )
    assert upload_res.status_code == 201
    dataset = upload_res.json()
    dataset_id = dataset["id"]
    v1_id = dataset["current_version_id"]
    assert dataset["row_count"] == 24
    assert dataset["column_count"] == 7
    assert dataset["original_filename"] == "qa_test_dataset.csv"

    # 2 & 3. Confirm dataset appears in dataset list, recent datasets bounded to 5
    list_res = client.get("/api/v1/datasets?limit=5")
    assert list_res.status_code == 200
    list_data = list_res.json()
    assert len(list_data["datasets"]) <= 5
    found = any(d["id"] == dataset_id for d in list_data["datasets"])
    assert found, "Uploaded dataset must appear in datasets list"

    # 4 & 5. Locate dataset in all datasets and verify metadata
    all_res = client.get(f"/api/v1/datasets/{dataset_id}")
    assert all_res.status_code == 200
    ds_detail = all_res.json()
    assert ds_detail["id"] == dataset_id
    assert ds_detail["row_count"] == 24
    assert ds_detail["column_count"] == 7

    # -------------------------------------------------------------
    # 2. Audit Overview
    # -------------------------------------------------------------
    # 6. Execute Audit
    audit_res = client.post(f"/api/v1/datasets/{dataset_id}/audits")
    assert audit_res.status_code == 201
    audit = audit_res.json()
    audit_id = audit["id"]
    summary = audit["summary"]
    findings = audit["findings"]

    # 7 & 8. Verify summary metrics against findings
    assert summary["missing_cells"] == 3
    assert summary["duplicate_rows"] == 1
    assert summary["row_count"] == 24
    assert summary["column_count"] == 7
    assert audit["score"] is not None
    assert 0 <= audit["score"] <= 100

    # 9. Inspect findings
    assert len(findings) == 9
    rule_ids = {f["rule_id"] for f in findings}
    assert "rule_missing_values" in rule_ids
    assert "rule_exact_duplicates" in rule_ids
    assert "rule_constant_columns" in rule_ids
    assert "rule_numeric_outliers" in rule_ids
    assert "rule_type_consistency" in rule_ids

    # 10. Filter findings by column
    col_findings_res = client.get(f"/api/v1/datasets/{dataset_id}/audits/{audit_id}/findings?column_name=marks")
    assert col_findings_res.status_code == 200
    marks_findings = col_findings_res.json()
    assert len(marks_findings) >= 2  # missing and outlier

    # -------------------------------------------------------------
    # 3. Column Profile and EDA
    # -------------------------------------------------------------
    # 20. Retrieve profile
    profile_res = client.get(f"/api/v1/datasets/{dataset_id}/profile")
    assert profile_res.status_code == 200
    profile = profile_res.json()
    assert len(profile["columns"]) == 7

    # 21 & 22. Inspect column statistics and distribution structures
    col_map = {c["name"]: c for c in profile["columns"]}
    
    # Numeric column: marks
    marks_col = col_map["marks"]
    assert marks_col["inferred_type"] == "numeric"
    assert marks_col["null_count"] == 1
    assert marks_col["numeric_stats"]["min"] == 58.0
    assert marks_col["numeric_stats"]["max"] == 999.0
    assert "histogram" in marks_col["numeric_stats"]
    assert len(marks_col["numeric_stats"]["histogram"]) > 0

    # Categorical column: department
    dept_col = col_map["department"]
    assert dept_col["inferred_type"] == "categorical"
    assert dept_col["distinct_count"] == 3  # CSE, ECE, ME
    assert "top_values" in dept_col["categorical_stats"]
    assert len(dept_col["categorical_stats"]["top_values"]) == 3

    # Constant column: batch
    batch_col = col_map["batch"]
    assert batch_col["distinct_count"] == 1
    assert batch_col["null_count"] == 0

    # -------------------------------------------------------------
    # 4. Guided Cleaning
    # -------------------------------------------------------------
    # 14. Non-mutating preview of duplicate removal
    prev_res = client.post(
        f"/api/v1/datasets/{dataset_id}/transformations/preview",
        json={"operation_type": "remove_duplicates", "version_id": v1_id},
    )
    assert prev_res.status_code == 200
    prev_data = prev_res.json()
    assert prev_data["rows_before"] == 24
    assert prev_data["rows_after"] == 23
    assert prev_data["rows_affected"] == 1

    # Confirm v1 not mutated
    v1_check = client.get(f"/api/v1/datasets/{dataset_id}").json()
    assert v1_check["row_count"] == 24

    # 16. Apply duplicate removal -> creates v2
    apply_dup_res = client.post(
        f"/api/v1/datasets/{dataset_id}/transformations/apply",
        json={"operation_type": "remove_duplicates", "version_id": v1_id},
    )
    assert apply_dup_res.status_code == 201
    v2_id = apply_dup_res.json()["result_version"]["id"]
    assert v2_id != v1_id

    # 17. Verify original dataset v1 remains unchanged
    v1_after_apply = client.get(f"/api/v1/datasets/{dataset_id}/versions/{v1_id}/export")
    assert v1_after_apply.status_code == 200
    assert v1_after_apply.text.count("S001,Aarav") == 2  # duplicate still present in v1

    # 18. Apply second transformation: Impute median on marks -> creates v3
    apply_imp_res = client.post(
        f"/api/v1/datasets/{dataset_id}/transformations/apply",
        json={"operation_type": "impute_median", "column_name": "marks", "version_id": v2_id},
    )
    assert apply_imp_res.status_code == 201
    v3_id = apply_imp_res.json()["result_version"]["id"]

    # Re-audit v3
    audit_v3_res = client.post(f"/api/v1/datasets/{dataset_id}/audits", json={"version_id": v3_id})
    assert audit_v3_res.status_code == 201
    audit_v3 = audit_v3_res.json()
    assert audit_v3["summary"]["duplicate_rows"] == 0  # Duplicate resolved!
    assert audit_v3["summary"]["penalties"]["duplicates"] == 0.0
    assert audit_v3["summary"]["missing_cells"] < audit["summary"]["missing_cells"]  # Missing reduced from 3 to 2

    # 19. Compare v1 and v3
    comp_res = client.get(f"/api/v1/datasets/{dataset_id}/compare?v1={v1_id}&v2={v3_id}")
    assert comp_res.status_code == 200
    comp_data = comp_res.json()
    assert comp_data["metrics"]["duplicate_rows"]["improved"] is True
    assert comp_data["metrics"]["missing_cells"]["improved"] is True
    assert comp_data["findings_diff"]["resolved_count"] == 2  # Duplicates and missing marks resolved
    resolved_titles = [r["title"] for r in comp_data["findings_diff"]["resolved"]]
    assert any("duplicate" in t.lower() for t in resolved_titles)
    assert any("marks" in t.lower() for t in resolved_titles)

    # -------------------------------------------------------------
    # 5. Export Center
    # -------------------------------------------------------------
    # 25. Export original version v1 CSV
    v1_csv_res = client.get(f"/api/v1/datasets/{dataset_id}/versions/{v1_id}/export")
    assert v1_csv_res.status_code == 200
    assert "QA_Verification_Dataset_v1.csv" in v1_csv_res.headers["content-disposition"]
    assert v1_csv_res.text.count("S001,Aarav") == 2  # Has duplicate

    # 26 & 27. Export cleaned version v3 CSV
    v3_csv_res = client.get(f"/api/v1/datasets/{dataset_id}/versions/{v3_id}/export")
    assert v3_csv_res.status_code == 200
    assert "QA_Verification_Dataset_v3.csv" in v3_csv_res.headers["content-disposition"]
    assert v3_csv_res.text.count("S001,Aarav") == 1  # Duplicate removed

    # Spreadsheet-safe export
    v3_safe_res = client.get(f"/api/v1/datasets/{dataset_id}/versions/{v3_id}/export?spreadsheet_safe=true")
    assert v3_safe_res.status_code == 200
    assert "spreadsheet_safe" in v3_safe_res.headers["content-disposition"]

    # 28 & 29. Export supported audit reports (HTML & JSON)
    html_rep_res = client.get(f"/api/v1/datasets/{dataset_id}/audits/{audit_id}/report?format=html")
    assert html_rep_res.status_code == 200
    assert "<!DOCTYPE html>" in html_rep_res.text
    assert "text/html" in html_rep_res.headers["content-type"]

    json_rep_res = client.get(f"/api/v1/datasets/{dataset_id}/audits/{audit_id}/report?format=json")
    assert json_rep_res.status_code == 200
    assert "application/json" in json_rep_res.headers["content-type"]
    rep_obj = json_rep_res.json()
    assert rep_obj["dataset"]["id"] == dataset_id
    assert rep_obj["audit"]["id"] == audit_id

    # 30. Rejection of unsupported formats
    unsupp_res = client.get(f"/api/v1/datasets/{dataset_id}/audits/{audit_id}/report?format=pdf")
    assert unsupp_res.status_code == 400
    assert unsupp_res.json()["error"] == "ValidationError"

    # 31. Clear error handling on invalid version or audit
    notfound_res = client.get(f"/api/v1/datasets/{dataset_id}/versions/00000000-0000-0000-0000-000000000000/export")
    assert notfound_res.status_code == 404
    assert notfound_res.json()["error"] == "ResourceNotFoundError"
