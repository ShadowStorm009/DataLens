from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import Optional, List, Dict, Any

from backend.app.db.session import get_db
from backend.app.schemas.comparison import VersionComparisonResponse
from backend.app.services.comparison import ComparisonService
from backend.app.services.dataset_service import dataset_service
from backend.app.models.dataset import Dataset
from backend.app.models.version import DatasetVersion
from backend.app.models.audit import AuditRun
from backend.app.models.transformation import Transformation
from backend.app.core.errors import ResourceNotFoundError, ValidationError

router = APIRouter(
    prefix="/datasets/{dataset_id}",
    tags=["comparison"],
)

comparison_service = ComparisonService(dataset_service=dataset_service)

@router.get(
    "/compare",
    response_model=VersionComparisonResponse,
    summary="Compare two dataset versions",
)
def compare_versions(
    dataset_id: str,
    v1: Optional[str] = Query(None, description="Baseline version ID (defaults to v1)"),
    v2: Optional[str] = Query(None, description="Comparison version ID (defaults to current version)"),
    db: Session = Depends(get_db),
):
    """
    Compare quality scores, summary metrics, and quality findings between two versions.
    If versions are omitted, defaults to comparing the initial upload (v1) with the current version.
    """
    dataset = dataset_service.get_dataset(db, dataset_id)

    # Resolve default versions if not supplied
    if not v1:
        initial_version = (
            db.query(DatasetVersion)
            .filter(DatasetVersion.dataset_id == dataset_id)
            .order_by(DatasetVersion.version_number.asc())
            .first()
        )
        if not initial_version:
            raise ResourceNotFoundError(f"No versions found for dataset '{dataset_id}'")
        v1 = initial_version.id

    if not v2:
        current_version_id = dataset.current_version_id
        if not current_version_id:
            latest_version = (
                db.query(DatasetVersion)
                .filter(DatasetVersion.dataset_id == dataset_id)
                .order_by(DatasetVersion.version_number.desc())
                .first()
            )
            v2 = latest_version.id if latest_version else v1
        else:
            v2 = current_version_id

    return comparison_service.compare_versions(
        db=db,
        dataset_id=dataset_id,
        v1_id=v1,
        v2_id=v2,
    )

@router.get(
    "/history",
    summary="Get complete version history with audits and lineage",
)
def get_version_history(
    dataset_id: str,
    db: Session = Depends(get_db),
):
    """
    Retrieve chronological version lineage, associated transformations, and audit score snapshots.
    """
    dataset = dataset_service.get_dataset(db, dataset_id)
    versions = (
        db.query(DatasetVersion)
        .filter(DatasetVersion.dataset_id == dataset_id)
        .order_by(DatasetVersion.version_number.asc())
        .all()
    )

    history_items = []
    for ver in versions:
        # Find transformation that created this version
        transform = (
            db.query(Transformation)
            .filter(Transformation.result_version_id == ver.id)
            .first()
        )

        # Find latest completed audit
        audit = (
            db.query(AuditRun)
            .filter(AuditRun.version_id == ver.id, AuditRun.status == "completed")
            .order_by(AuditRun.created_at.desc())
            .first()
        )

        audit_snapshot = None
        if audit:
            high_count = sum(1 for f in audit.findings if f.severity == "high")
            med_count = sum(1 for f in audit.findings if f.severity == "medium")
            low_count = sum(1 for f in audit.findings if f.severity == "low")
            audit_snapshot = {
                "audit_id": audit.id,
                "score": audit.score,
                "score_method_version": audit.score_method_version,
                "created_at": audit.created_at.isoformat(),
                "total_findings": len(audit.findings),
                "severity_counts": {
                    "high": high_count,
                    "medium": med_count,
                    "low": low_count,
                },
            }

        transform_snapshot = None
        if transform:
            transform_snapshot = {
                "id": transform.id,
                "operation_type": transform.operation_type,
                "column_name": transform.column_name,
                "rows_affected": transform.rows_affected,
                "cells_affected": transform.cells_affected,
                "created_at": transform.created_at.isoformat(),
            }

        history_items.append({
            "version_id": ver.id,
            "version_number": ver.version_number,
            "parent_version_id": ver.parent_version_id,
            "row_count": ver.row_count,
            "column_count": ver.column_count,
            "created_at": ver.created_at.isoformat(),
            "is_current": (ver.id == dataset.current_version_id),
            "transformation": transform_snapshot,
            "latest_audit": audit_snapshot,
        })

    return {
        "dataset_id": dataset.id,
        "dataset_name": dataset.name,
        "current_version_id": dataset.current_version_id,
        "versions": history_items,
    }
