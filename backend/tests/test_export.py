import pytest
import io
import pandas as pd
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.services.dataset_service import dataset_service
from backend.app.services.export import export_service
from backend.app.audit.engine import AuditEngine

client = TestClient(app)

def test_export_csv_standard(db_session, isolated_storage):
    """Test standard CSV export for a specific version."""
    csv_bytes = b"id,name,role\n1,Alice,Engineer\n2,Bob,Designer\n"
    dataset = dataset_service.create_dataset(
        db=db_session,
        name="Employees Dataset",
        original_filename="emp.csv",
        content=csv_bytes,
        row_count=2,
        column_count=3,
    )
    v1_id = dataset.current_version_id

    csv_text, filename = export_service.export_csv(
        db=db_session,
        dataset_id=dataset.id,
        version_id=v1_id,
        spreadsheet_safe=False,
    )

    assert "Employees_Dataset_v1.csv" in filename
    assert "Alice,Engineer" in csv_text
    assert "Bob,Designer" in csv_text

def test_export_csv_spreadsheet_safe(db_session, isolated_storage):
    """Test formula injection prevention (CSV injection) prepending single quote to formula-starting values."""
    csv_bytes = b"id,comment\n1,=SUM(A1:A10)\n2,+CMD|' /C calc'!A0\n3,@admin\n4,Normal Text\n"
    dataset = dataset_service.create_dataset(
        db=db_session,
        name="Formula Injection Test",
        original_filename="formulas.csv",
        content=csv_bytes,
        row_count=4,
        column_count=2,
    )
    v1_id = dataset.current_version_id

    csv_text, filename = export_service.export_csv(
        db=db_session,
        dataset_id=dataset.id,
        version_id=v1_id,
        spreadsheet_safe=True,
    )

    assert "_spreadsheet_safe.csv" in filename
    assert "'=SUM(A1:A10)" in csv_text
    assert "'+CMD|" in csv_text
    assert "'@admin" in csv_text
    # Normal text should NOT be prepended
    assert "Normal Text" in csv_text
    assert "'Normal Text" not in csv_text

def test_export_html_report(db_session, isolated_storage):
    """Test generating a standalone HTML audit report."""
    csv_bytes = b"col1,col2\n10,20\n10,20\n,40\n"
    df = pd.read_csv(io.BytesIO(csv_bytes))

    dataset = dataset_service.create_dataset(
        db=db_session,
        name="Report Test Dataset",
        original_filename="report_test.csv",
        content=csv_bytes,
        row_count=3,
        column_count=2,
    )
    v1_id = dataset.current_version_id

    score, ver, summary, findings = AuditEngine().run_audit(df)
    audit = dataset_service.create_audit_run(
        db=db_session,
        dataset_id=dataset.id,
        version_id=v1_id,
        score=score,
        score_method_version=ver,
        summary=summary,
        findings=[f.to_dict() for f in findings],
    )

    html_text, filename = export_service.generate_html_report(
        db=db_session,
        dataset_id=dataset.id,
        audit_id=audit.id,
    )

    assert filename.endswith(".html")
    assert "<!DOCTYPE html>" in html_text
    assert "Report Test Dataset" in html_text
    assert f"{score}" in html_text
    assert "Quality Findings &amp; Evidence" in html_text
    assert "Audit Disclaimer:" in html_text

def test_export_json_report(db_session, isolated_storage):
    """Test generating structured JSON audit report."""
    csv_bytes = b"a,b\n1,2\n"
    df = pd.read_csv(io.BytesIO(csv_bytes))

    dataset = dataset_service.create_dataset(
        db=db_session,
        name="JSON Report Test",
        original_filename="json_test.csv",
        content=csv_bytes,
        row_count=1,
        column_count=2,
    )
    v1_id = dataset.current_version_id

    score, ver, summary, findings = AuditEngine().run_audit(df)
    audit = dataset_service.create_audit_run(
        db=db_session,
        dataset_id=dataset.id,
        version_id=v1_id,
        score=score,
        score_method_version=ver,
        summary=summary,
        findings=[f.to_dict() for f in findings],
    )

    report_data = export_service.generate_json_report(
        db=db_session,
        dataset_id=dataset.id,
        audit_id=audit.id,
    )

    assert report_data["dataset"]["name"] == "JSON Report Test"
    assert report_data["audit"]["id"] == audit.id
    assert report_data["audit"]["score"] == score
    assert "findings" in report_data
    assert "disclaimer" in report_data

def test_export_api_endpoints_via_client():
    """Test HTTP GET endpoints for CSV and report downloads."""
    csv_content = b"x,y\n100,200\n300,400\n"
    upload_res = client.post(
        "/api/v1/datasets",
        files={"file": ("export_api.csv", io.BytesIO(csv_content), "text/csv")},
    )
    assert upload_res.status_code == 201
    dataset_id = upload_res.json()["id"]

    # 1. Download CSV via version endpoint
    version_id = upload_res.json()["current_version_id"]
    csv_res = client.get(f"/api/v1/datasets/{dataset_id}/versions/{version_id}/export")
    assert csv_res.status_code == 200
    assert "text/csv" in csv_res.headers["content-type"]
    assert "attachment" in csv_res.headers["content-disposition"]
    assert "100,200" in csv_res.text

    # 2. Download CSV via current version shortcut
    curr_csv_res = client.get(f"/api/v1/datasets/{dataset_id}/export")
    assert curr_csv_res.status_code == 200
    assert "100,200" in curr_csv_res.text

    # 3. Trigger audit and download HTML report
    audit_res = client.post(f"/api/v1/datasets/{dataset_id}/audits")
    assert audit_res.status_code == 201
    audit_id = audit_res.json()["id"]

    html_res = client.get(f"/api/v1/datasets/{dataset_id}/audits/{audit_id}/report?format=html")
    assert html_res.status_code == 200
    assert "text/html" in html_res.headers["content-type"]
    assert "<!DOCTYPE html>" in html_res.text

    # 4. Download JSON report
    json_res = client.get(f"/api/v1/datasets/{dataset_id}/audits/{audit_id}/report?format=json")
    assert json_res.status_code == 200
    assert "application/json" in json_res.headers["content-type"]
    report_json = json_res.json()
    assert report_json["dataset"]["id"] == dataset_id

    # 5. Download latest report shortcut
    latest_report_res = client.get(f"/api/v1/datasets/{dataset_id}/report?format=html")
    assert latest_report_res.status_code == 200

def test_export_invalid_version_returns_404():
    """Test 404 response when querying invalid version or audit IDs."""
    csv_content = b"a,b\n1,2\n"
    upload_res = client.post(
        "/api/v1/datasets",
        files={"file": ("export_404.csv", io.BytesIO(csv_content), "text/csv")},
    )
    dataset_id = upload_res.json()["id"]

    res = client.get(f"/api/v1/datasets/{dataset_id}/versions/00000000-0000-0000-0000-000000000000/export")
    assert res.status_code == 404
    assert res.json()["error"] == "ResourceNotFoundError"

def test_export_csv_empty_version(db_session, isolated_storage):
    """Test exporting an empty dataset version (headers only, 0 rows)."""
    csv_bytes = b"col_a,col_b,col_c\n"
    dataset = dataset_service.create_dataset(
        db=db_session,
        name="Empty Version Dataset",
        original_filename="empty.csv",
        content=csv_bytes,
        row_count=0,
        column_count=3,
    )
    v1_id = dataset.current_version_id

    csv_text, filename = export_service.export_csv(
        db=db_session,
        dataset_id=dataset.id,
        version_id=v1_id,
        spreadsheet_safe=False,
    )

    assert "col_a,col_b,col_c" in csv_text
    assert "Empty_Version_Dataset_v1.csv" in filename

def test_export_csv_selected_version_parity(db_session, isolated_storage):
    """Test that exporting v1 returns original data and v2 returns transformed data."""
    csv_bytes = b"id,val\n1,10\n1,10\n2,20\n"
    dataset = dataset_service.create_dataset(
        db=db_session,
        name="Version Parity Test",
        original_filename="parity.csv",
        content=csv_bytes,
        row_count=3,
        column_count=2,
    )
    v1_id = dataset.current_version_id

    # Apply transformation to create v2 (remove duplicates)
    from backend.app.services.cleaner import TransformationEngine
    v1_df = dataset_service.storage.read_dataframe(dataset_service.get_version(db_session, v1_id).storage_reference)
    res = TransformationEngine.transform(df=v1_df, operation_type="remove_duplicates")
    v2_version = dataset_service.create_version(
        db=db_session,
        dataset_id=dataset.id,
        parent_version_id=v1_id,
        data=res.df,
        row_count=len(res.df),
        column_count=len(res.df.columns),
    )
    v2_id = v2_version.id

    # Export v1
    v1_csv, v1_fn = export_service.export_csv(
        db=db_session,
        dataset_id=dataset.id,
        version_id=v1_id,
        spreadsheet_safe=False,
    )
    # Export v2
    v2_csv, v2_fn = export_service.export_csv(
        db=db_session,
        dataset_id=dataset.id,
        version_id=v2_id,
        spreadsheet_safe=False,
    )

    assert "Version_Parity_Test_v1.csv" in v1_fn
    assert "Version_Parity_Test_v2.csv" in v2_fn

    # Count occurrences of '1,10'
    assert v1_csv.count("1,10") == 2
    assert v2_csv.count("1,10") == 1

def test_export_csv_formula_injection_distinguishes_negative_numbers(db_session, isolated_storage):
    """Test spreadsheet sanitization preserves safe numeric strings while neutralizing malicious formulas."""
    csv_bytes = b"col1,col2,col3,col4\n-42,+3.14,=cmd|' /C calc'!A0,-2+3+cmd\n"
    dataset = dataset_service.create_dataset(
        db=db_session,
        name="Injection Safety Test",
        original_filename="inject.csv",
        content=csv_bytes,
        row_count=1,
        column_count=4,
    )
    v1_id = dataset.current_version_id

    csv_text, filename = export_service.export_csv(
        db=db_session,
        dataset_id=dataset.id,
        version_id=v1_id,
        spreadsheet_safe=True,
    )

    # Safe numeric values should NOT have single quote prepended
    assert "-42" in csv_text
    assert "'-42" not in csv_text

    # Malicious formulas MUST be escaped with a single quote
    assert "'=cmd|" in csv_text
    assert "'-2+3+cmd" in csv_text

def test_audit_report_with_before_after_comparison_child_version(db_session, isolated_storage):
    """Test that audit report on a child version includes Before/After comparison vs parent."""
    # Create dataset with missing values in v1
    csv_bytes = b"num,cat\n10,A\n,B\n30,A\n"
    dataset = dataset_service.create_dataset(
        db=db_session,
        name="Child Version Report Test",
        original_filename="child_report.csv",
        content=csv_bytes,
        row_count=3,
        column_count=2,
    )
    v1_id = dataset.current_version_id

    # Run audit on v1
    v1_df = pd.read_csv(io.BytesIO(csv_bytes))
    score1, ver1, sum1, find1 = AuditEngine().run_audit(v1_df)
    dataset_service.create_audit_run(
        db=db_session,
        dataset_id=dataset.id,
        version_id=v1_id,
        score=score1,
        score_method_version=ver1,
        summary=sum1,
        findings=[f.to_dict() for f in find1],
    )

    # Apply imputation to create v2
    from backend.app.services.cleaner import TransformationEngine
    res = TransformationEngine.transform(
        df=v1_df,
        operation_type="impute_median",
        column_name="num",
    )
    v2_version = dataset_service.create_version(
        db=db_session,
        dataset_id=dataset.id,
        parent_version_id=v1_id,
        data=res.df,
        row_count=len(res.df),
        column_count=len(res.df.columns),
    )
    v2_id = v2_version.id

    # Run audit on v2
    v2_df = dataset_service.storage.read_dataframe(dataset_service.get_version(db_session, v2_id).storage_reference)
    score2, ver2, sum2, find2 = AuditEngine().run_audit(v2_df)
    audit2 = dataset_service.create_audit_run(
        db=db_session,
        dataset_id=dataset.id,
        version_id=v2_id,
        score=score2,
        score_method_version=ver2,
        summary=sum2,
        findings=[f.to_dict() for f in find2],
    )

    # Generate JSON report for v2 audit
    json_report = export_service.generate_json_report(
        db=db_session,
        dataset_id=dataset.id,
        audit_id=audit2.id,
    )

    assert json_report["before_after_comparison"] is not None
    assert json_report["before_after_comparison"]["v1"]["version_number"] == 1
    assert json_report["before_after_comparison"]["v2"]["version_number"] == 2
    assert json_report["before_after_comparison"]["score_comparison"]["delta"] >= 0

    # Generate HTML report for v2 audit
    html_report, fn = export_service.generate_html_report(
        db=db_session,
        dataset_id=dataset.id,
        audit_id=audit2.id,
    )

    assert "Before / After Version Comparison (vs Baseline v1)" in html_report
    assert "RESOLVED" in html_report
    assert "Spreadsheet Export Safety:" in html_report

def test_export_version_report_endpoint():
    """Test GET /datasets/{id}/versions/{v_id}/report endpoint."""
    csv_content = b"k,v\n1,10\n2,20\n"
    upload_res = client.post(
        "/api/v1/datasets",
        files={"file": ("v_report.csv", io.BytesIO(csv_content), "text/csv")},
    )
    dataset_id = upload_res.json()["id"]
    version_id = upload_res.json()["current_version_id"]

    # Run audit on version
    audit_res = client.post(f"/api/v1/datasets/{dataset_id}/audits", json={"version_id": version_id})
    assert audit_res.status_code == 201

    # Request report via version endpoint
    rep_res = client.get(f"/api/v1/datasets/{dataset_id}/versions/{version_id}/report?format=html")
    assert rep_res.status_code == 200
    assert "text/html" in rep_res.headers["content-type"]
    assert "attachment" in rep_res.headers["content-disposition"]
    assert "<!DOCTYPE html>" in rep_res.text

