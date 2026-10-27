import pytest
from pathlib import Path
from fastapi.testclient import TestClient
DEMO_CSV_PATH = Path(__file__).resolve().parent.parent.parent / "sample_datasets" / "demo_dirty_dataset.csv"

def test_full_datalens_e2e_lifecycle(client: TestClient):
    """
    End-to-End Walkthrough:
    Upload CSV -> Profile -> Audit -> Inspect Findings -> Preview -> Apply (v2, v3, v4) -> Compare -> Export.
    """
    assert DEMO_CSV_PATH.exists(), f"Demo CSV file not found at {DEMO_CSV_PATH}"
    csv_bytes = DEMO_CSV_PATH.read_bytes()

    # 1. Upload CSV
    upload_res = client.post(
        "/api/v1/datasets",
        files={"file": ("demo_dirty_dataset.csv", csv_bytes, "text/csv")},
        data={"name": "E2E Demo Dataset"},
    )
    assert upload_res.status_code == 201
    dataset = upload_res.json()
    dataset_id = dataset["id"]
    v1_id = dataset["current_version_id"]
    assert dataset["row_count"] == 20
    assert dataset["column_count"] == 8

    # 2. Profile
    profile_res = client.get(f"/api/v1/datasets/{dataset_id}/profile")
    assert profile_res.status_code == 200
    profile = profile_res.json()
    assert profile["dataset_id"] == dataset_id
    assert profile["row_count"] == 20
    assert profile["column_count"] == 8
    assert profile["duplicate_rows"] == 1
    assert len(profile["columns"]) == 8

    # 3. Audit Quality
    audit_res = client.post(
        f"/api/v1/datasets/{dataset_id}/audits",
        json={"target_column": "churn"},
    )
    assert audit_res.status_code == 201
    audit = audit_res.json()
    v1_score = audit["score"]
    audit_id = audit["id"]
    assert v1_score < 90.0  # Should have penalties for duplicates, missing, etc.
    assert len(audit["findings"]) >= 5

    # 4. Non-mutating preview of duplicate removal
    prev_dup_res = client.post(
        f"/api/v1/datasets/{dataset_id}/transformations/preview",
        json={"operation_type": "remove_duplicates"},
    )
    assert prev_dup_res.status_code == 200
    prev_dup = prev_dup_res.json()
    assert prev_dup["rows_before"] == 20
    assert prev_dup["rows_after"] == 19
    assert prev_dup["rows_affected"] == 1

    # Verify non-mutating guarantee: v1 still has 20 rows
    ds_check = client.get(f"/api/v1/datasets/{dataset_id}").json()
    assert ds_check["row_count"] == 20

    # 5. Apply duplicate removal -> creates Version 2
    apply_dup_res = client.post(
        f"/api/v1/datasets/{dataset_id}/transformations/apply",
        json={"operation_type": "remove_duplicates"},
    )
    assert apply_dup_res.status_code == 201
    v2_id = apply_dup_res.json()["result_version"]["id"]
    assert v2_id != v1_id

    # 6. Apply median imputation on salary -> creates Version 3
    apply_median_res = client.post(
        f"/api/v1/datasets/{dataset_id}/transformations/apply",
        json={"operation_type": "impute_median", "column_name": "salary"},
    )
    assert apply_median_res.status_code == 201
    v3_id = apply_median_res.json()["result_version"]["id"]
    assert v3_id != v2_id

    # 7. Apply dropping constant column country -> creates Version 4
    apply_drop_res = client.post(
        f"/api/v1/datasets/{dataset_id}/transformations/apply",
        json={"operation_type": "drop_constant_column", "column_name": "country"},
    )
    assert apply_drop_res.status_code == 201
    v4_id = apply_drop_res.json()["result_version"]["id"]
    assert v4_id != v3_id

    # 8. Compare Version 1 (Baseline) vs Version 4 (Cleaned)
    compare_res = client.get(f"/api/v1/datasets/{dataset_id}/compare?v1={v1_id}&v2={v4_id}")
    assert compare_res.status_code == 200
    compare_data = compare_res.json()

    assert compare_data["score_comparison"]["v2_score"] > compare_data["score_comparison"]["v1_score"]
    assert compare_data["score_comparison"]["delta"] > 0
    assert compare_data["metrics"]["duplicate_rows"]["improved"] is True
    assert compare_data["metrics"]["missing_cells"]["improved"] is True
    assert compare_data["column_changes"]["removed"] == ["country"]
    assert compare_data["findings_diff"]["resolved_count"] >= 2
    assert len(compare_data["transformations"]) == 3

    # 9. Export Cleaned CSV (Standard & Spreadsheet-Safe)
    csv_standard = client.get(f"/api/v1/datasets/{dataset_id}/versions/{v4_id}/export?spreadsheet_safe=false")
    assert csv_standard.status_code == 200
    assert "text/csv" in csv_standard.headers["content-type"]
    assert "country" not in csv_standard.text.split("\n")[0]  # Column removed

    csv_safe = client.get(f"/api/v1/datasets/{dataset_id}/versions/{v4_id}/export?spreadsheet_safe=true")
    assert csv_safe.status_code == 200
    # '=1+1 formula test should be safely prefixed with single quote
    assert "'=1+1 formula test" in csv_safe.text

    # 10. Export HTML & JSON Reports
    html_report = client.get(f"/api/v1/datasets/{dataset_id}/report?format=html")
    assert html_report.status_code == 200
    assert "text/html" in html_report.headers["content-type"]
    assert "DataLens Quality Audit Report" in html_report.text

    json_report = client.get(f"/api/v1/datasets/{dataset_id}/report?format=json")
    assert json_report.status_code == 200
    assert json_report.json()["dataset"]["id"] == dataset_id
