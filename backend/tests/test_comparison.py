import pytest
import io
import pandas as pd
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.services.dataset_service import dataset_service
from backend.app.services.comparison import ComparisonService
from backend.app.services.cleaner import TransformationEngine
from backend.app.audit.engine import AuditEngine
from backend.app.core.errors import ResourceNotFoundError

client = TestClient(app)

def test_compare_versions_service(db_session, isolated_storage):
    """Test comparing v1 and transformed v2 at the service level."""
    comparison_service = ComparisonService(dataset_service=dataset_service)

    # Initial dirty CSV: 4 rows, 1 duplicate, 1 missing age
    csv_bytes = b"name,age,dept\nAlice,30,HR\nBob,,IT\nAlice,30,HR\nCharlie,25,IT\n"
    df_initial = pd.read_csv(io.BytesIO(csv_bytes))

    dataset = dataset_service.create_dataset(
        db=db_session,
        name="Comparison Test",
        original_filename="comparison.csv",
        content=csv_bytes,
        row_count=4,
        column_count=3,
    )
    v1 = dataset_service.get_version(db_session, dataset.current_version_id)

    # Clean duplicates to create v2
    transform_res = TransformationEngine.transform(df_initial, "remove_duplicates")
    v2 = dataset_service.create_version(
        db=db_session,
        dataset_id=dataset.id,
        parent_version_id=v1.id,
        data=transform_res.df,
        row_count=len(transform_res.df),
        column_count=len(transform_res.df.columns),
    )
    dataset_service.record_transformation(
        db=db_session,
        dataset_id=dataset.id,
        source_version_id=v1.id,
        result_version_id=v2.id,
        operation_type="remove_duplicates",
        column_name=None,
        parameters={},
        rows_affected=transform_res.rows_affected,
        cells_affected=transform_res.cells_affected,
    )

    # Compare v1 vs v2
    comp = comparison_service.compare_versions(
        db=db_session,
        dataset_id=dataset.id,
        v1_id=v1.id,
        v2_id=v2.id,
    )

    assert comp.dataset_id == dataset.id
    assert comp.v1.id == v1.id
    assert comp.v2.id == v2.id
    assert comp.score_comparison.v1_score is not None
    assert comp.score_comparison.v2_score is not None
    assert comp.score_comparison.v2_score > comp.score_comparison.v1_score
    assert comp.score_comparison.delta > 0
    assert comp.score_comparison.is_compatible is True

    # Check metrics
    assert comp.metrics["duplicate_rows"].v1_value > 0
    assert comp.metrics["duplicate_rows"].v2_value == 0
    assert comp.metrics["duplicate_rows"].improved is True

    # Check findings diff
    assert comp.findings_diff.resolved_count >= 1
    resolved_rules = [f.rule_id for f in comp.findings_diff.resolved]
    assert "rule_exact_duplicates" in resolved_rules

    # Transformation history included
    assert len(comp.transformations) == 1
    assert comp.transformations[0].operation_type == "remove_duplicates"

def test_compare_same_version(db_session, isolated_storage):
    """Test comparing a version against itself produces zero deltas."""
    comparison_service = ComparisonService(dataset_service=dataset_service)

    csv_bytes = b"id,val\n1,10\n2,20\n"
    dataset = dataset_service.create_dataset(
        db=db_session,
        name="Self Compare",
        original_filename="self.csv",
        content=csv_bytes,
        row_count=2,
        column_count=2,
    )
    v1 = dataset_service.get_version(db_session, dataset.current_version_id)

    comp = comparison_service.compare_versions(
        db=db_session,
        dataset_id=dataset.id,
        v1_id=v1.id,
        v2_id=v1.id,
    )

    assert comp.score_comparison.delta == 0.0
    assert comp.metrics["row_count"].delta == 0
    assert comp.findings_diff.resolved_count == 0
    assert comp.findings_diff.new_count == 0

def test_compare_with_dropped_column(db_session, isolated_storage):
    """Test column changes when dropping a constant column."""
    comparison_service = ComparisonService(dataset_service=dataset_service)

    csv_bytes = b"num,constant_col\n10,SAME\n20,SAME\n30,SAME\n"
    df1 = pd.read_csv(io.BytesIO(csv_bytes))

    dataset = dataset_service.create_dataset(
        db=db_session,
        name="Drop Col Test",
        original_filename="drop_col.csv",
        content=csv_bytes,
        row_count=3,
        column_count=2,
    )
    v1 = dataset_service.get_version(db_session, dataset.current_version_id)

    transform_res = TransformationEngine.transform(df1, "drop_constant_column", column_name="constant_col")
    v2 = dataset_service.create_version(
        db=db_session,
        dataset_id=dataset.id,
        parent_version_id=v1.id,
        data=transform_res.df,
        row_count=len(transform_res.df),
        column_count=len(transform_res.df.columns),
    )

    comp = comparison_service.compare_versions(
        db=db_session,
        dataset_id=dataset.id,
        v1_id=v1.id,
        v2_id=v2.id,
    )

    assert comp.column_changes.removed == ["constant_col"]
    assert comp.column_changes.common == ["num"]
    assert comp.metrics["column_count"].delta == -1

def test_compare_endpoint_via_client():
    """Test HTTP GET /api/v1/datasets/{id}/compare endpoint."""
    csv_content = b"a,b\n1,x\n1,x\n2,y\n"
    upload_res = client.post(
        "/api/v1/datasets",
        files={"file": ("compare_api.csv", io.BytesIO(csv_content), "text/csv")},
    )
    assert upload_res.status_code == 201
    dataset_id = upload_res.json()["id"]

    # Apply duplicate drop
    apply_res = client.post(
        f"/api/v1/datasets/{dataset_id}/transformations/apply",
        json={"operation_type": "remove_duplicates"},
    )
    assert apply_res.status_code == 201

    # Call compare endpoint
    compare_res = client.get(f"/api/v1/datasets/{dataset_id}/compare")
    assert compare_res.status_code == 200
    data = compare_res.json()

    assert data["dataset_id"] == dataset_id
    assert "score_comparison" in data
    assert "metrics" in data
    assert "findings_diff" in data
    assert "transformations" in data
    assert "disclaimer" in data
    assert data["metrics"]["duplicate_rows"]["improved"] is True

def test_version_history_endpoint():
    """Test HTTP GET /api/v1/datasets/{id}/history endpoint."""
    csv_content = b"x,y\n10,20\n30,40\n"
    upload_res = client.post(
        "/api/v1/datasets",
        files={"file": ("history_api.csv", io.BytesIO(csv_content), "text/csv")},
    )
    dataset_id = upload_res.json()["id"]

    history_res = client.get(f"/api/v1/datasets/{dataset_id}/history")
    assert history_res.status_code == 200
    data = history_res.json()

    assert data["dataset_id"] == dataset_id
    assert len(data["versions"]) >= 1
    v1_entry = data["versions"][0]
    assert v1_entry["version_number"] == 1
    assert v1_entry["row_count"] == 2
    assert v1_entry["column_count"] == 2

def test_compare_nonexistent_version_returns_404():
    """Test 404 response when querying invalid version IDs."""
    csv_content = b"m,n\n1,2\n"
    upload_res = client.post(
        "/api/v1/datasets",
        files={"file": ("invalid_v.csv", io.BytesIO(csv_content), "text/csv")},
    )
    dataset_id = upload_res.json()["id"]

    res = client.get(f"/api/v1/datasets/{dataset_id}/compare?v2=00000000-0000-0000-0000-000000000000")
    assert res.status_code == 404
