import io
import pytest
from fastapi.testclient import TestClient
from backend.app.models.dataset import Dataset
from backend.app.models.version import DatasetVersion
from sqlalchemy import select

def test_upload_valid_csv(client: TestClient, db_session, isolated_storage):
    """Test uploading a valid CSV creates a persistent dataset and version 1."""
    csv_data = b"id,name,role,department\n1,Alice,Engineer,Engineering\n2,Bob,Designer,Product\n"
    files = {"file": ("employees.csv", csv_data, "text/csv")}
    data = {"name": "Staff Directory"}

    response = client.post("/api/v1/datasets", files=files, data=data)
    assert response.status_code == 201
    res_data = response.json()

    assert res_data["name"] == "Staff Directory"
    assert res_data["original_filename"] == "employees.csv"
    assert res_data["row_count"] == 2
    assert res_data["column_count"] == 4
    assert res_data["id"] is not None
    assert res_data["current_version_id"] is not None

    # Verify persistent database records
    dataset_id = res_data["id"]
    ds = db_session.execute(select(Dataset).where(Dataset.id == dataset_id)).scalar_one()
    assert ds.name == "Staff Directory"
    assert len(ds.versions) == 1
    assert ds.versions[0].version_number == 1

def test_upload_leading_zeros_preserved(client: TestClient, db_session, isolated_storage):
    """Verify that leading zeros in numeric-like identifier strings are not truncated."""
    csv_data = b"zip_code,account_id,city\n00501,00123,Holtsville\n07001,00456,Avenel\n"
    files = {"file": ("postal.csv", csv_data, "text/csv")}

    response = client.post("/api/v1/datasets", files=files)
    assert response.status_code == 201
    dataset_id = response.json()["id"]

    # Check preview
    preview_res = client.get(f"/api/v1/datasets/{dataset_id}/preview")
    assert preview_res.status_code == 200
    rows = preview_res.json()["rows"]
    assert rows[0]["zip_code"] == "00501"
    assert rows[0]["account_id"] == "00123"
    assert rows[1]["zip_code"] == "07001"

def test_upload_duplicate_headers_handled_safely(client: TestClient, db_session, isolated_storage):
    """Test that duplicate column headers are detected and deduplicated safely."""
    csv_data = b"score,score,category\n85,90,Math\n70,75,Science\n"
    files = {"file": ("scores.csv", csv_data, "text/csv")}

    response = client.post("/api/v1/datasets", files=files)
    assert response.status_code == 201
    dataset_id = response.json()["id"]

    preview_res = client.get(f"/api/v1/datasets/{dataset_id}/preview")
    assert preview_res.status_code == 200
    cols = preview_res.json()["columns"]
    # The duplicate column must be made distinct
    assert cols[0] == "score"
    assert cols[1] == "score_2"
    assert cols[2] == "category"

def test_upload_empty_file_rejected(client: TestClient, db_session, isolated_storage):
    """Test that an empty CSV file upload returns 422 with an actionable error message."""
    files = {"file": ("empty.csv", b"", "text/csv")}
    response = client.post("/api/v1/datasets", files=files)
    assert response.status_code == 422
    data = response.json()
    assert "empty" in data["message"].lower()

def test_upload_malformed_csv_rejected(client: TestClient, db_session, isolated_storage):
    """Test that an unparseable malformed CSV file is rejected without crashing."""
    # A CSV with wildly inconsistent unquoted multiline quotes
    malformed_data = b'col1,col2\n"unclosed quote line 1\nline2 without quote\n'
    files = {"file": ("broken.csv", malformed_data, "text/csv")}
    response = client.post("/api/v1/datasets", files=files)
    assert response.status_code == 422
    assert "message" in response.json()

def test_upload_oversized_file_rejected(client: TestClient, monkeypatch, isolated_storage):
    """Test that file size validation strictly enforces configured limits (413)."""
    # Monkeypatch limit to 100 bytes for test
    from backend.app.services.csv_validator import csv_validator
    monkeypatch.setattr(csv_validator, "max_size_bytes", 100)

    large_csv = b"a,b,c\n" + (b"1,2,3\n" * 50)
    files = {"file": ("large.csv", large_csv, "text/csv")}

    response = client.post("/api/v1/datasets", files=files)
    assert response.status_code == 413
    assert "exceeds" in response.json()["message"].lower()

def test_upload_unsupported_file_extension(client: TestClient):
    """Test that non-CSV file extensions are rejected with 422."""
    files = {"file": ("document.pdf", b"%PDF-1.4...", "application/pdf")}
    response = client.post("/api/v1/datasets", files=files)
    assert response.status_code == 422
    assert "only csv" in response.json()["message"].lower()

def test_preview_enforces_strict_row_limit(client: TestClient, db_session, isolated_storage):
    """Test that preview limits rows and matches total row counts."""
    # Create 50 rows
    lines = ["id,value"] + [f"{i},val_{i}" for i in range(1, 51)]
    csv_bytes = "\n".join(lines).encode("utf-8")
    files = {"file": ("big.csv", csv_bytes, "text/csv")}

    create_res = client.post("/api/v1/datasets", files=files)
    assert create_res.status_code == 201
    dataset_id = create_res.json()["id"]

    # Request default preview (20 rows)
    preview_res = client.get(f"/api/v1/datasets/{dataset_id}/preview")
    assert preview_res.status_code == 200
    pdata = preview_res.json()
    assert pdata["total_rows"] == 50
    assert len(pdata["rows"]) == 20
    assert pdata["rows"][0]["id"] == "1"
    assert pdata["rows"][19]["id"] == "20"

    # Request custom limit (5 rows)
    preview_5 = client.get(f"/api/v1/datasets/{dataset_id}/preview?limit=5")
    assert preview_5.status_code == 200
    assert len(preview_5.json()["rows"]) == 5

def test_preview_missing_dataset_id_returns_404(client: TestClient):
    """Test requesting preview for non-existent dataset returns 404."""
    response = client.get("/api/v1/datasets/non-existent-id/preview")
    assert response.status_code == 404
    assert "not found" in response.json()["message"].lower()

def test_failed_upload_leaves_no_orphaned_records(client: TestClient, db_session, isolated_storage):
    """Test that if upload validation fails, no file in storage and no DB record is left."""
    initial_db_count = len(db_session.execute(select(Dataset)).scalars().all())
    initial_files = list(isolated_storage.base_dir.iterdir())

    files = {"file": ("empty.csv", b"", "text/csv")}
    response = client.post("/api/v1/datasets", files=files)
    assert response.status_code == 422

    final_db_count = len(db_session.execute(select(Dataset)).scalars().all())
    final_files = list(isolated_storage.base_dir.iterdir())

    assert final_db_count == initial_db_count
    assert len(final_files) == len(initial_files)
