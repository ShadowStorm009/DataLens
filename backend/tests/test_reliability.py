import pytest
import io
import pandas as pd
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.services.dataset_service import dataset_service
from backend.app.services.storage import StorageService
from backend.app.core.errors import FileValidationError, ResourceNotFoundError

client = TestClient(app)

def test_deletion_cleans_csvs_and_profile_caches(db_session, isolated_storage):
    """Verify that deleting a dataset cleans up physical CSV files and profile cache files."""
    csv_bytes = b"a,b\n1,2\n3,4\n"
    dataset = dataset_service.create_dataset(
        db=db_session,
        name="Cleanup Test",
        original_filename="cleanup.csv",
        content=csv_bytes,
        row_count=2,
        column_count=2,
    )
    v1_id = dataset.current_version_id
    v1 = dataset_service.get_version(db_session, v1_id)
    csv_path = isolated_storage.get_absolute_path(v1.storage_reference)
    assert csv_path.exists()

    # Create a profile cache file directly on disk
    cache_ref = f"{v1_id}.profile.json"
    cache_path = isolated_storage.base_dir / cache_ref
    cache_path.write_text('{"mock": "profile"}', encoding="utf-8")
    assert cache_path.exists()

    # Delete dataset
    dataset_service.delete_dataset(db_session, dataset.id)

    # Both CSV and profile cache file must be removed
    assert not csv_path.exists()
    assert not cache_path.exists()

def test_missing_resource_ids_return_404():
    """Verify consistent 404 responses across all resource endpoints."""
    bad_id = "00000000-0000-0000-0000-000000000000"

    endpoints_to_test = [
        f"/api/v1/datasets/{bad_id}",
        f"/api/v1/datasets/{bad_id}/preview",
        f"/api/v1/datasets/{bad_id}/profile",
        f"/api/v1/datasets/{bad_id}/audits",
        f"/api/v1/datasets/{bad_id}/versions",
        f"/api/v1/datasets/{bad_id}/compare",
        f"/api/v1/datasets/{bad_id}/export",
        f"/api/v1/datasets/{bad_id}/report",
    ]

    for ep in endpoints_to_test:
        res = client.get(ep)
        assert res.status_code == 404, f"Endpoint {ep} expected 404, got {res.status_code}"
        data = res.json()
        assert "error" in data or "message" in data or "detail" in data

def test_path_traversal_blocked(isolated_storage):
    """Verify that path traversal references are rejected by StorageService."""
    malicious_refs = [
        "../etc/passwd",
        "../../sensitive.db",
        "foo/../../bar",
        "/etc/shadow",
    ]

    for ref in malicious_refs:
        with pytest.raises(Exception):
            isolated_storage.get_absolute_path(ref)

def test_partial_transformation_failure_preserves_version():
    """Verify that an invalid transformation does not advance or corrupt dataset.current_version_id."""
    csv_content = b"col1,col2\n10,20\n30,40\n"
    upload_res = client.post(
        "/api/v1/datasets",
        files={"file": ("guard_api.csv", io.BytesIO(csv_content), "text/csv")},
    )
    assert upload_res.status_code == 201
    dataset_data = upload_res.json()
    dataset_id = dataset_data["id"]
    initial_version_id = dataset_data["current_version_id"]
    initial_row_count = dataset_data["row_count"]

    # Attempt to apply invalid transformation: drop a column that is not constant
    res = client.post(
        f"/api/v1/datasets/{dataset_id}/transformations/apply",
        json={"operation_type": "drop_constant_column", "column_name": "col1"},
    )
    assert res.status_code == 400

    # Dataset version and row count must remain unchanged
    get_res = client.get(f"/api/v1/datasets/{dataset_id}")
    assert get_res.status_code == 200
    reloaded = get_res.json()
    assert reloaded["current_version_id"] == initial_version_id
    assert reloaded["row_count"] == initial_row_count

def test_error_envelope_consistency():
    """Verify consistent error format for 400 and 422 errors."""
    # Invalid upload (empty bytes) returns 422
    res = client.post(
        "/api/v1/datasets",
        files={"file": ("empty.csv", io.BytesIO(b""), "text/csv")},
    )
    assert res.status_code == 422
    err_json = res.json()
    assert err_json["error"] == "FileValidationError"
    assert "message" in err_json
    assert "details" in err_json

def test_http_exception_and_method_not_allowed_envelope():
    """Verify standard Starlette HTTPExceptions (e.g., 405 Method Not Allowed) return the uniform envelope."""
    # DELETE on /health is not allowed
    res = client.delete("/health")
    assert res.status_code == 405
    err_json = res.json()
    assert err_json["error"] == "HTTPException"
    assert "Method Not Allowed" in err_json["message"]
    assert isinstance(err_json["details"], dict)

def test_request_validation_error_envelope():
    """Verify FastAPI RequestValidationError (422) returns uniform envelope with error details."""
    # POST to transformations preview with empty/malformed json payload
    res = client.post(
        "/api/v1/datasets/00000000-0000-0000-0000-000000000000/transformations/preview",
        json={"unknown_field": 123},
    )
    assert res.status_code == 422
    err_json = res.json()
    assert err_json["error"] == "RequestValidationError"
    assert "Invalid request" in err_json["message"]
    assert "errors" in err_json["details"]

def test_rollback_on_failed_dataset_creation_cleans_file(db_session, isolated_storage, monkeypatch):
    """Verify that if database commit fails during create_dataset, the storage file is purged."""
    csv_bytes = b"col1,col2\n1,2\n3,4\n"
    before_csvs = set(isolated_storage.base_dir.glob("*.csv"))

    # Monkeypatch db_session.commit to simulate DB failure
    def mock_commit():
        raise RuntimeError("Simulated Database Commit Failure")

    monkeypatch.setattr(db_session, "commit", mock_commit)

    with pytest.raises(RuntimeError, match="Simulated Database Commit Failure"):
        dataset_service.create_dataset(
            db=db_session,
            name="Rollback Test",
            original_filename="rollback.csv",
            content=csv_bytes,
            row_count=2,
            column_count=2,
        )

    # Verify no new CSV files were left in isolated_storage directory
    after_csvs = set(isolated_storage.base_dir.glob("*.csv"))
    assert after_csvs == before_csvs

def test_rollback_on_failed_version_creation_cleans_file(db_session, isolated_storage, monkeypatch):
    """Verify that if database commit fails during create_version, the storage file is purged."""
    csv_bytes = b"col1,col2\n1,2\n3,4\n"
    before_csvs = set(isolated_storage.base_dir.glob("*.csv"))

    dataset = dataset_service.create_dataset(
        db=db_session,
        name="Version Rollback Test",
        original_filename="v_rollback.csv",
        content=csv_bytes,
        row_count=2,
        column_count=2,
    )
    initial_version_id = dataset.current_version_id
    created_csvs = set(isolated_storage.base_dir.glob("*.csv"))
    assert len(created_csvs - before_csvs) == 1

    # Monkeypatch db_session.commit to simulate DB failure during create_version
    def mock_commit():
        raise RuntimeError("Simulated Version Commit Failure")

    monkeypatch.setattr(db_session, "commit", mock_commit)

    df_new = pd.DataFrame({"col1": [1, 3], "col2": [2, 4]})
    with pytest.raises(RuntimeError, match="Simulated Version Commit Failure"):
        dataset_service.create_version(
            db=db_session,
            dataset_id=dataset.id,
            parent_version_id=initial_version_id,
            data=df_new,
            row_count=2,
            column_count=2,
        )

    # Verify no extra orphaned CSV file remained on disk
    after_csvs = set(isolated_storage.base_dir.glob("*.csv"))
    assert after_csvs == created_csvs

def test_delete_dataset_endpoint_full_lifecycle():
    """Verify DELETE /api/v1/datasets/{id} deletes DB records, cache, and files, and returns 200."""
    csv_bytes = b"x,y\n1,2\n3,4\n"
    upload_res = client.post(
        "/api/v1/datasets",
        files={"file": ("to_delete.csv", io.BytesIO(csv_bytes), "text/csv")},
    )
    assert upload_res.status_code == 201
    dataset_id = upload_res.json()["id"]

    # Delete dataset
    del_res = client.delete(f"/api/v1/datasets/{dataset_id}")
    assert del_res.status_code == 200
    assert del_res.json()["status"] == "deleted"
    assert del_res.json()["dataset_id"] == dataset_id

    # Confirm subsequent GET returns 404
    get_res = client.get(f"/api/v1/datasets/{dataset_id}")
    assert get_res.status_code == 404

