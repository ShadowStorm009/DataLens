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
