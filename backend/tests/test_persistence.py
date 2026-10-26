import pytest
import pandas as pd
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from backend.app.models.dataset import Dataset
from backend.app.models.version import DatasetVersion
from backend.app.models.audit import AuditRun, Finding
from backend.app.models.transformation import Transformation
from backend.app.db.session import init_db
from backend.app.services.dataset_service import dataset_service
from backend.app.core.errors import ResourceNotFoundError

SAMPLE_CSV = b"id,name,age\n1,Alice,25\n2,Bob,30\n3,Charlie,\n"

def test_create_and_retrieve_dataset(db_session, isolated_storage):
    """Test creating a dataset creates both the dataset and initial version 1."""
    dataset = dataset_service.create_dataset(
        db=db_session,
        name="Users Dataset",
        original_filename="users.csv",
        content=SAMPLE_CSV,
        row_count=3,
        column_count=3,
    )

    assert dataset.id is not None
    assert dataset.name == "Users Dataset"
    assert dataset.original_filename == "users.csv"
    assert dataset.row_count == 3
    assert dataset.column_count == 3
    assert dataset.current_version_id is not None

    # Retrieve dataset
    retrieved = dataset_service.get_dataset(db_session, dataset.id)
    assert retrieved.id == dataset.id
    assert len(retrieved.versions) == 1

    v1 = retrieved.versions[0]
    assert v1.version_number == 1
    assert v1.parent_version_id is None
    assert v1.content_hash is not None
    assert isolated_storage.get_absolute_path(v1.storage_reference).exists()

def test_version_lineage_and_immutability(db_session, isolated_storage):
    """Test applying transformations creates child versions while keeping parent intact."""
    dataset = dataset_service.create_dataset(
        db=db_session,
        name="Versioned Dataset",
        original_filename="data.csv",
        content=SAMPLE_CSV,
        row_count=3,
        column_count=3,
    )
    v1_id = dataset.current_version_id
    v1 = dataset_service.get_version(db_session, v1_id)

    # Simulate cleaned dataframe (dropping missing row)
    df_cleaned = pd.DataFrame({"id": [1, 2], "name": ["Alice", "Bob"], "age": [25, 30]})
    v2 = dataset_service.create_version(
        db=db_session,
        dataset_id=dataset.id,
        parent_version_id=v1_id,
        data=df_cleaned,
        row_count=2,
        column_count=3,
    )

    assert v2.id != v1_id
    assert v2.version_number == 2
    assert v2.parent_version_id == v1_id
    assert v2.row_count == 2

    # Check updated dataset pointers
    updated_dataset = dataset_service.get_dataset(db_session, dataset.id)
    assert updated_dataset.current_version_id == v2.id
    assert updated_dataset.row_count == 2

    # Both storage files must exist independently
    assert isolated_storage.get_absolute_path(v1.storage_reference).exists()
    assert isolated_storage.get_absolute_path(v2.storage_reference).exists()
    assert v1.storage_reference != v2.storage_reference

def test_audit_runs_associated_with_exact_version(db_session, isolated_storage):
    """Test that audit runs and findings are linked to the specific dataset version."""
    dataset = dataset_service.create_dataset(
        db=db_session,
        name="Audit Dataset",
        original_filename="audit.csv",
        content=SAMPLE_CSV,
        row_count=3,
        column_count=3,
    )
    v1_id = dataset.current_version_id

    findings_data = [
        {
            "rule_id": "missing_values",
            "column_name": "age",
            "severity": "medium",
            "title": "Missing values detected in age",
            "description": "Column age has 1 missing value (33.3%).",
            "structured_evidence": {"missing_count": 1, "missing_percentage": 33.33},
            "recommendation": "Impute missing numeric values using median or mean.",
            "finding_type": "missingness",
        }
    ]

    audit = dataset_service.create_audit_run(
        db=db_session,
        dataset_id=dataset.id,
        version_id=v1_id,
        score=85.0,
        score_method_version="1.0",
        summary={"total_findings": 1, "quality_score": 85.0},
        findings=findings_data,
    )

    assert audit.id is not None
    assert audit.version_id == v1_id
    assert audit.score == 85.0
    assert len(audit.findings) == 1

    finding = audit.findings[0]
    assert finding.rule_id == "missing_values"
    assert finding.severity == "medium"
    assert "missing_count" in finding.structured_evidence

def test_transformation_history_recording(db_session, isolated_storage):
    """Test recording transformations between versions."""
    dataset = dataset_service.create_dataset(
        db=db_session,
        name="Transform Dataset",
        original_filename="raw.csv",
        content=SAMPLE_CSV,
        row_count=3,
        column_count=3,
    )
    v1_id = dataset.current_version_id
    df_cleaned = pd.DataFrame({"id": [1, 2, 3], "name": ["Alice", "Bob", "Charlie"], "age": [25, 30, 27.5]})

    v2 = dataset_service.create_version(
        db=db_session,
        dataset_id=dataset.id,
        parent_version_id=v1_id,
        data=df_cleaned,
        row_count=3,
        column_count=3,
    )

    trans = dataset_service.record_transformation(
        db=db_session,
        dataset_id=dataset.id,
        source_version_id=v1_id,
        result_version_id=v2.id,
        operation_type="impute_median",
        column_name="age",
        parameters={"strategy": "median", "fill_value": 27.5},
        rows_affected=1,
        cells_affected=1,
    )

    assert trans.id is not None
    assert trans.operation_type == "impute_median"
    assert trans.rows_affected == 1

    history = dataset_service.list_transformations(db_session, dataset.id)
    assert len(history) == 1
    assert history[0].id == trans.id

def test_missing_records_raise_404_error(db_session):
    """Test querying non-existent records raises controlled ResourceNotFoundError."""
    with pytest.raises(ResourceNotFoundError):
        dataset_service.get_dataset(db_session, "nonexistent-dataset-id")

    with pytest.raises(ResourceNotFoundError):
        dataset_service.get_version(db_session, "nonexistent-version-id")

    with pytest.raises(ResourceNotFoundError):
        dataset_service.get_audit_run(db_session, "nonexistent-audit-id")

def test_cascade_delete_dataset_and_files(db_session, isolated_storage):
    """Test deleting a dataset cascades in database and purges physical files."""
    dataset = dataset_service.create_dataset(
        db=db_session,
        name="To Delete",
        original_filename="delete_me.csv",
        content=SAMPLE_CSV,
        row_count=3,
        column_count=3,
    )
    v1_id = dataset.current_version_id
    v1 = dataset_service.get_version(db_session, v1_id)
    file_ref = v1.storage_reference

    # Add version 2
    df_v2 = pd.DataFrame({"a": [1, 2]})
    v2 = dataset_service.create_version(
        db=db_session,
        dataset_id=dataset.id,
        parent_version_id=v1_id,
        data=df_v2,
        row_count=2,
        column_count=1,
    )
    v2_file_ref = v2.storage_reference

    # Add audit run
    dataset_service.create_audit_run(
        db=db_session,
        dataset_id=dataset.id,
        version_id=v1_id,
        score=90.0,
        findings=[{"rule_id": "r1", "severity": "low", "title": "t", "description": "d", "recommendation": "rec"}],
    )

    # Ensure files exist prior to deletion
    assert isolated_storage.get_absolute_path(file_ref).exists()
    assert isolated_storage.get_absolute_path(v2_file_ref).exists()

    # Perform deletion
    result = dataset_service.delete_dataset(db_session, dataset.id)
    assert result is True

    # Database records must be purged
    assert db_session.execute(select(Dataset).where(Dataset.id == dataset.id)).scalar_one_or_none() is None
    assert db_session.execute(select(DatasetVersion).where(DatasetVersion.dataset_id == dataset.id)).scalars().all() == []
    assert db_session.execute(select(AuditRun).where(AuditRun.dataset_id == dataset.id)).scalars().all() == []
    assert db_session.execute(select(Finding)).scalars().all() == []

    # Physical files must be purged
    assert not (isolated_storage.base_dir / file_ref).exists()
    assert not (isolated_storage.base_dir / v2_file_ref).exists()

def test_foreign_key_enforcement(db_session):
    """Test that SQLite foreign key pragma rejects orphan child records."""
    orphan_version = DatasetVersion(
        id="orphan-version",
        dataset_id="non-existent-dataset",
        version_number=1,
        row_count=1,
        column_count=1,
        storage_reference="some.csv",
    )
    db_session.add(orphan_version)
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()

def test_records_survive_application_restart(test_temp_dir, isolated_storage):
    """Test that SQLite data survives across completely new engines and sessions (restart)."""
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    db_path = test_temp_dir / "persistent_restart.db"
    db_url = f"sqlite:///{db_path}"

    # Session 1: Create schema and persist data
    engine_1 = create_engine(db_url)
    init_db(engine_to_use=engine_1)
    Session_1 = sessionmaker(bind=engine_1)
    sess_1 = Session_1()

    ds = dataset_service.create_dataset(
        db=sess_1,
        name="Restart Resilient Dataset",
        original_filename="resilient.csv",
        content=SAMPLE_CSV,
        row_count=3,
        column_count=3,
    )
    dataset_id = ds.id
    v1_id = ds.current_version_id
    sess_1.close()
    engine_1.dispose()

    # Session 2: Re-open brand-new connection/session to simulate process restart
    engine_2 = create_engine(db_url)
    Session_2 = sessionmaker(bind=engine_2)
    sess_2 = Session_2()

    recovered_ds = dataset_service.get_dataset(sess_2, dataset_id)
    assert recovered_ds is not None
    assert recovered_ds.name == "Restart Resilient Dataset"
    assert recovered_ds.current_version_id == v1_id
    assert len(recovered_ds.versions) == 1
    assert recovered_ds.versions[0].version_number == 1
    assert isolated_storage.get_absolute_path(recovered_ds.versions[0].storage_reference).exists()

    sess_2.close()
    engine_2.dispose()
    if db_path.exists():
        db_path.unlink()
