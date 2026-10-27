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

def test_compare_endpoint_via_client(client: TestClient):
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

def test_version_history_endpoint(client: TestClient):
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

def test_compare_nonexistent_version_returns_404(client: TestClient):
    """Test 404 response when querying invalid version IDs."""
    csv_content = b"m,n\n1,2\n"
    upload_res = client.post(
        "/api/v1/datasets",
        files={"file": ("invalid_v.csv", io.BytesIO(csv_content), "text/csv")},
    )
    dataset_id = upload_res.json()["id"]

    res = client.get(f"/api/v1/datasets/{dataset_id}/compare?v2=00000000-0000-0000-0000-000000000000")
    assert res.status_code == 404

def test_version_ancestry_tracking(db_session, isolated_storage):
    """
    Test version ancestry and lineage tracking across multi-step cleaning pipeline:
    v1 (raw) -> v2 (deduplicated) -> v3 (imputed).
    Confirms distinct versions, parent_version_id chaining, and chronological transformation history.
    """
    csv_bytes = b"id,val,notes\n1,10,alpha\n2,,beta\n1,10,alpha\n"
    df_raw = pd.read_csv(io.BytesIO(csv_bytes))

    # 1. Create initial dataset v1
    dataset = dataset_service.create_dataset(
        db=db_session,
        name="Ancestry Test Dataset",
        original_filename="ancestry.csv",
        content=csv_bytes,
        row_count=3,
        column_count=3,
    )
    v1 = dataset_service.get_version(db_session, dataset.current_version_id)
    assert v1.version_number == 1
    assert v1.parent_version_id is None

    # 2. Apply remove_duplicates -> creates v2
    t1_res = TransformationEngine.transform(df_raw, "remove_duplicates")
    v2 = dataset_service.create_version(
        db=db_session,
        dataset_id=dataset.id,
        parent_version_id=v1.id,
        data=t1_res.df,
        row_count=len(t1_res.df),
        column_count=len(t1_res.df.columns),
    )
    dataset_service.record_transformation(
        db=db_session,
        dataset_id=dataset.id,
        source_version_id=v1.id,
        result_version_id=v2.id,
        operation_type="remove_duplicates",
        column_name=None,
        parameters={},
        rows_affected=t1_res.rows_affected,
        cells_affected=t1_res.cells_affected,
    )
    assert v2.version_number == 2
    assert v2.parent_version_id == v1.id
    assert v2.storage_reference != v1.storage_reference

    # 3. Apply impute_median on 'val' -> creates v3
    t2_res = TransformationEngine.transform(t1_res.df, "impute_median", column_name="val")
    v3 = dataset_service.create_version(
        db=db_session,
        dataset_id=dataset.id,
        parent_version_id=v2.id,
        data=t2_res.df,
        row_count=len(t2_res.df),
        column_count=len(t2_res.df.columns),
    )
    dataset_service.record_transformation(
        db=db_session,
        dataset_id=dataset.id,
        source_version_id=v2.id,
        result_version_id=v3.id,
        operation_type="impute_median",
        column_name="val",
        parameters={},
        rows_affected=t2_res.rows_affected,
        cells_affected=t2_res.cells_affected,
    )
    assert v3.version_number == 3
    assert v3.parent_version_id == v2.id
    assert v3.storage_reference != v2.storage_reference

    # 4. Compare v1 vs v3: lineage should include both steps in chronological order
    comparison_service = ComparisonService(dataset_service=dataset_service)
    comp_v1_v3 = comparison_service.compare_versions(
        db=db_session,
        dataset_id=dataset.id,
        v1_id=v1.id,
        v2_id=v3.id,
    )
    assert len(comp_v1_v3.transformations) == 2
    assert comp_v1_v3.transformations[0].operation_type == "remove_duplicates"
    assert comp_v1_v3.transformations[1].operation_type == "impute_median"

    # Compare v2 vs v3: lineage should only include step 2
    comp_v2_v3 = comparison_service.compare_versions(
        db=db_session,
        dataset_id=dataset.id,
        v1_id=v2.id,
        v2_id=v3.id,
    )
    assert len(comp_v2_v3.transformations) == 1
    assert comp_v2_v3.transformations[0].operation_type == "impute_median"

def test_audit_version_association(db_session, isolated_storage):
    """
    Test that every audit is strictly linked to the exact version it inspected,
    and differences in audit configurations (e.g. target_column) are reported.
    """
    comparison_service = ComparisonService(dataset_service=dataset_service)
    audit_engine = AuditEngine()

    csv_bytes = b"feature,label\n10,yes\n20,no\n30,yes\n"
    df = pd.read_csv(io.BytesIO(csv_bytes))

    dataset = dataset_service.create_dataset(
        db=db_session,
        name="Audit Association Test",
        original_filename="audit_assoc.csv",
        content=csv_bytes,
        row_count=3,
        column_count=2,
    )
    v1 = dataset_service.get_version(db_session, dataset.current_version_id)

    # Run audit on v1 with target_column="label"
    score1, ver1, summary1, findings1 = audit_engine.run_audit(df, target_column="label")
    audit_v1 = dataset_service.create_audit_run(
        db=db_session,
        dataset_id=dataset.id,
        version_id=v1.id,
        score=score1,
        score_method_version=ver1,
        summary=summary1,
        findings=[f.to_dict() for f in findings1],
    )
    assert audit_v1.version_id == v1.id

    # Create child version v2 (clean copy)
    v2 = dataset_service.create_version(
        db=db_session,
        dataset_id=dataset.id,
        parent_version_id=v1.id,
        data=df,
        row_count=3,
        column_count=2,
    )

    # Run audit on v2 with target_column=None (different audit configuration)
    score2, ver2, summary2, findings2 = audit_engine.run_audit(df, target_column=None)
    audit_v2 = dataset_service.create_audit_run(
        db=db_session,
        dataset_id=dataset.id,
        version_id=v2.id,
        score=score2,
        score_method_version=ver2,
        summary=summary2,
        findings=[f.to_dict() for f in findings2],
    )
    assert audit_v2.version_id == v2.id
    assert audit_v1.id != audit_v2.id

    # Compare v1 and v2: configuration difference should be flagged
    comp = comparison_service.compare_versions(
        db=db_session,
        dataset_id=dataset.id,
        v1_id=v1.id,
        v2_id=v2.id,
    )
    assert comp.score_comparison.audit_config_compatible is False
    assert "Target column configurations differ" in comp.score_comparison.audit_config_note

def test_comparison_calculations_percentages_and_column_stats(db_session, isolated_storage):
    """
    Test calculation of missing/duplicate percentages, column statistics,
    and preservation of unresolved findings in comparison response.
    """
    comparison_service = ComparisonService(dataset_service=dataset_service)

    # Initial CSV: 4 rows, 2 columns (total 8 cells)
    # Row 1 and Row 2 duplicate. Row 3 has missing 'val'.
    csv_bytes = b"category,val\nA,10\nA,10\nB,\nC,30\n"
    df1 = pd.read_csv(io.BytesIO(csv_bytes))

    dataset = dataset_service.create_dataset(
        db=db_session,
        name="Calc Test",
        original_filename="calc.csv",
        content=csv_bytes,
        row_count=4,
        column_count=2,
    )
    v1 = dataset_service.get_version(db_session, dataset.current_version_id)

    # Clean duplicates: 4 rows -> 3 rows (val still missing in Row 2)
    t_res = TransformationEngine.transform(df1, "remove_duplicates")
    v2 = dataset_service.create_version(
        db=db_session,
        dataset_id=dataset.id,
        parent_version_id=v1.id,
        data=t_res.df,
        row_count=len(t_res.df),
        column_count=len(t_res.df.columns),
    )
    dataset_service.record_transformation(
        db=db_session,
        dataset_id=dataset.id,
        source_version_id=v1.id,
        result_version_id=v2.id,
        operation_type="remove_duplicates",
        column_name=None,
        parameters={},
        rows_affected=t_res.rows_affected,
        cells_affected=t_res.cells_affected,
    )

    comp = comparison_service.compare_versions(
        db=db_session,
        dataset_id=dataset.id,
        v1_id=v1.id,
        v2_id=v2.id,
    )

    # 1. Missing percentage calculations
    # V1: 1 missing out of 8 cells = 12.5%
    # V2: 1 missing out of 6 cells = 16.67%
    assert comp.metrics["missing_cells"].v1_value == 1
    assert comp.metrics["missing_cells"].v2_value == 1
    assert comp.metrics["missing_percentage"].v1_value == 12.5
    assert comp.metrics["missing_percentage"].v2_value == 16.67
    assert comp.metrics["missing_percentage"].delta == 4.17

    # 2. Duplicate percentage calculations
    # V1: 1 dup out of 4 rows = 25.0%
    # V2: 0 dups out of 3 rows = 0.0%
    assert comp.metrics["duplicate_rows"].v1_value == 1
    assert comp.metrics["duplicate_rows"].v2_value == 0
    assert comp.metrics["duplicate_rows"].improved is True
    assert comp.metrics["duplicate_percentage"].v1_value == 25.0
    assert comp.metrics["duplicate_percentage"].v2_value == 0.0
    assert comp.metrics["duplicate_percentage"].improved is True

    # 3. Column statistics
    val_stat = next(c for c in comp.column_stats if c.column_name == "val")
    assert val_stat.status == "common"
    assert val_stat.v1_null_count == 1
    assert val_stat.v2_null_count == 1
    assert val_stat.v1_mean is not None
    assert val_stat.v2_mean is not None

    # 4. Unresolved findings remain visible (missing value was NOT resolved)
    unresolved_rules = [f.rule_id for f in comp.findings_diff.unresolved]
    assert "rule_missing_values" in unresolved_rules
    assert comp.findings_diff.unresolved_count >= 1
