import json
import uuid
import pandas as pd
from typing import List, Optional, Dict, Any, Union
from sqlalchemy.orm import Session
from sqlalchemy import select, desc
from backend.app.models.dataset import Dataset
from backend.app.models.version import DatasetVersion
from backend.app.models.audit import AuditRun, Finding
from backend.app.models.transformation import Transformation
from backend.app.services.storage import storage_service
from backend.app.core.errors import ResourceNotFoundError

class DatasetService:
    """Service layer managing persistence and file lifecycles for datasets."""

    def __init__(self, storage=None):
        self._storage = storage

    @property
    def storage(self):
        return self._storage or storage_service

    def create_dataset(
        self,
        db: Session,
        name: str,
        original_filename: str,
        content: bytes,
        row_count: int,
        column_count: int,
    ) -> Dataset:
        """Create a new dataset with its initial version (v1) and persist its raw CSV file."""
        storage_ref, content_hash, _ = self.storage.save_bytes(content)

        dataset_id = str(uuid.uuid4())
        version_id = str(uuid.uuid4())

        initial_version = DatasetVersion(
            id=version_id,
            dataset_id=dataset_id,
            parent_version_id=None,
            version_number=1,
            row_count=row_count,
            column_count=column_count,
            storage_reference=storage_ref,
            content_hash=content_hash,
        )

        dataset = Dataset(
            id=dataset_id,
            name=name,
            original_filename=original_filename,
            current_version_id=version_id,
            row_count=row_count,
            column_count=column_count,
            status="ready",
            storage_reference=storage_ref,
        )

        db.add(dataset)
        db.add(initial_version)
        db.commit()
        db.refresh(dataset)
        return dataset

    def get_dataset(self, db: Session, dataset_id: str) -> Dataset:
        """Retrieve dataset by ID or raise ResourceNotFoundError."""
        dataset = db.execute(select(Dataset).where(Dataset.id == dataset_id)).scalar_one_or_none()
        if not dataset:
            raise ResourceNotFoundError(f"Dataset with ID '{dataset_id}' not found")
        return dataset

    def list_datasets(self, db: Session, skip: int = 0, limit: int = 50) -> List[Dataset]:
        """List all datasets ordered by creation time descending."""
        stmt = select(Dataset).order_by(desc(Dataset.created_at)).offset(skip).limit(limit)
        return list(db.execute(stmt).scalars().all())

    def create_version(
        self,
        db: Session,
        dataset_id: str,
        parent_version_id: str,
        data: Union[pd.DataFrame, bytes],
        row_count: int,
        column_count: int,
    ) -> DatasetVersion:
        """Create a new dataset version from a transformation, updating current version pointer."""
        dataset = self.get_dataset(db, dataset_id)
        parent_version = self.get_version(db, parent_version_id)

        if isinstance(data, pd.DataFrame):
            storage_ref, content_hash, _ = self.storage.save_dataframe(data)
        else:
            storage_ref, content_hash, _ = self.storage.save_bytes(data)

        new_version_number = parent_version.version_number + 1
        new_version_id = str(uuid.uuid4())

        new_version = DatasetVersion(
            id=new_version_id,
            dataset_id=dataset.id,
            parent_version_id=parent_version.id,
            version_number=new_version_number,
            row_count=row_count,
            column_count=column_count,
            storage_reference=storage_ref,
            content_hash=content_hash,
        )

        dataset.current_version_id = new_version_id
        dataset.row_count = row_count
        dataset.column_count = column_count

        db.add(new_version)
        db.commit()
        db.refresh(new_version)
        return new_version

    def get_version(self, db: Session, version_id: str) -> DatasetVersion:
        """Retrieve a dataset version by ID or raise ResourceNotFoundError."""
        version = db.execute(select(DatasetVersion).where(DatasetVersion.id == version_id)).scalar_one_or_none()
        if not version:
            raise ResourceNotFoundError(f"Dataset version with ID '{version_id}' not found")
        return version

    def list_versions(self, db: Session, dataset_id: str) -> List[DatasetVersion]:
        """List all versions of a dataset ordered by version number ascending."""
        self.get_dataset(db, dataset_id)  # Validate dataset exists
        stmt = (
            select(DatasetVersion)
            .where(DatasetVersion.dataset_id == dataset_id)
            .order_by(DatasetVersion.version_number.asc())
        )
        return list(db.execute(stmt).scalars().all())

    def create_audit_run(
        self,
        db: Session,
        dataset_id: str,
        version_id: str,
        score: Optional[float],
        score_method_version: str = "1.0",
        summary: Optional[Dict[str, Any]] = None,
        findings: Optional[List[Dict[str, Any]]] = None,
    ) -> AuditRun:
        """Create an audit run linked to the exact dataset version audited."""
        self.get_dataset(db, dataset_id)
        self.get_version(db, version_id)

        audit_id = str(uuid.uuid4())
        serialized_summary = json.dumps(summary) if summary is not None else None

        audit_run = AuditRun(
            id=audit_id,
            dataset_id=dataset_id,
            version_id=version_id,
            status="completed",
            score=score,
            score_method_version=score_method_version,
            serialized_summary=serialized_summary,
        )
        db.add(audit_run)

        if findings:
            for item in findings:
                evidence = item.get("structured_evidence")
                serialized_evidence = json.dumps(evidence) if isinstance(evidence, (dict, list)) else evidence
                finding = Finding(
                    id=str(uuid.uuid4()),
                    audit_id=audit_id,
                    rule_id=item["rule_id"],
                    column_name=item.get("column_name"),
                    severity=item["severity"],
                    title=item["title"],
                    description=item["description"],
                    structured_evidence=serialized_evidence,
                    recommendation=item["recommendation"],
                    finding_type=item.get("finding_type", "quality_issue"),
                )
                db.add(finding)

        db.commit()
        db.refresh(audit_run)
        return audit_run

    def get_audit_run(self, db: Session, audit_id: str) -> AuditRun:
        """Retrieve an audit run by ID or raise ResourceNotFoundError."""
        audit = db.execute(select(AuditRun).where(AuditRun.id == audit_id)).scalar_one_or_none()
        if not audit:
            raise ResourceNotFoundError(f"Audit run with ID '{audit_id}' not found")
        return audit

    def list_audit_runs(self, db: Session, dataset_id: str, version_id: Optional[str] = None) -> List[AuditRun]:
        """List audit runs for a dataset, optionally filtered by version ID."""
        self.get_dataset(db, dataset_id)
        stmt = select(AuditRun).where(AuditRun.dataset_id == dataset_id)
        if version_id:
            stmt = stmt.where(AuditRun.version_id == version_id)
        stmt = stmt.order_by(desc(AuditRun.created_at))
        return list(db.execute(stmt).scalars().all())

    def record_transformation(
        self,
        db: Session,
        dataset_id: str,
        source_version_id: str,
        result_version_id: str,
        operation_type: str,
        column_name: Optional[str] = None,
        parameters: Optional[Dict[str, Any]] = None,
        rows_affected: int = 0,
        cells_affected: int = 0,
    ) -> Transformation:
        """Record a cleaning transformation linking source and result versions."""
        self.get_dataset(db, dataset_id)
        self.get_version(db, source_version_id)
        self.get_version(db, result_version_id)

        serialized_params = json.dumps(parameters) if parameters else None

        transformation = Transformation(
            id=str(uuid.uuid4()),
            dataset_id=dataset_id,
            source_version_id=source_version_id,
            result_version_id=result_version_id,
            operation_type=operation_type,
            column_name=column_name,
            parameters=serialized_params,
            rows_affected=rows_affected,
            cells_affected=cells_affected,
        )
        db.add(transformation)
        db.commit()
        db.refresh(transformation)
        return transformation

    def list_transformations(self, db: Session, dataset_id: str) -> List[Transformation]:
        """List all transformations applied to a dataset in chronological order."""
        self.get_dataset(db, dataset_id)
        stmt = (
            select(Transformation)
            .where(Transformation.dataset_id == dataset_id)
            .order_by(Transformation.created_at.asc())
        )
        return list(db.execute(stmt).scalars().all())

    def delete_dataset(self, db: Session, dataset_id: str) -> bool:
        """
        Delete a dataset and all associated versions, audits, findings, and transformations.
        Also cleans up all physical CSV files from disk.
        """
        dataset = self.get_dataset(db, dataset_id)

        # Collect all file references (CSVs and profile caches) before deleting DB records
        storage_refs = [v.storage_reference for v in dataset.versions if v.storage_reference]
        for v in dataset.versions:
            storage_refs.append(f"{v.id}.profile.json")
        if dataset.storage_reference and dataset.storage_reference not in storage_refs:
            storage_refs.append(dataset.storage_reference)

        # Delete from database (cascade deletes versions, audits, findings, transformations)
        db.delete(dataset)
        db.commit()

        # Clean up physical files
        for ref in storage_refs:
            self.storage.delete_file(ref)

        return True

dataset_service = DatasetService()
