from typing import Optional, List
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import select

from backend.app.db.session import get_db
from backend.app.services.dataset_service import dataset_service
from backend.app.audit.engine import audit_engine
from backend.app.models.audit import AuditRun, Finding
from backend.app.core.errors import ResourceNotFoundError
from backend.app.schemas.audit import (
    AuditRunRequest,
    AuditRunResponse,
    AuditListResponse,
    FindingResponse,
)

router = APIRouter(prefix="/datasets/{dataset_id}/audits", tags=["Audits"])

@router.post(
    "",
    response_model=AuditRunResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Run audit on dataset version",
)
def run_audit(
    dataset_id: str,
    request: Optional[AuditRunRequest] = None,
    db: Session = Depends(get_db),
):
    """
    Execute deterministic data quality rules against the specified (or current) version.
    Saves AuditRun and all detected findings to persistent storage.
    """
    dataset = dataset_service.get_dataset(db, dataset_id)

    target_version_id = request.version_id if (request and request.version_id) else dataset.current_version_id
    version = dataset_service.get_version(db, target_version_id)

    # Ensure version belongs to dataset
    if version.dataset_id != dataset_id:
        raise ResourceNotFoundError(f"Version '{target_version_id}' does not belong to dataset '{dataset_id}'")

    # Read dataframe safely
    df = dataset_service.storage.read_dataframe(version.storage_reference)

    # Execute deterministic audit engine
    target_column = request.target_column if request else None
    score, method_ver, summary, findings = audit_engine.run_audit(
        df,
        target_column=target_column,
    )

    # Persist findings and audit record
    findings_dicts = [f.to_dict() for f in findings]
    audit_run = dataset_service.create_audit_run(
        db=db,
        dataset_id=dataset.id,
        version_id=version.id,
        score=score,
        score_method_version=method_ver,
        summary=summary,
        findings=findings_dicts,
    )

    return audit_run

@router.get(
    "",
    response_model=AuditListResponse,
    summary="List all audit runs for a dataset",
)
def list_audits(
    dataset_id: str,
    version_id: Optional[str] = Query(None, description="Filter by specific version ID"),
    db: Session = Depends(get_db),
):
    """Retrieve audit history for a dataset, optionally filtered by version."""
    dataset_service.get_dataset(db, dataset_id)
    audits = dataset_service.list_audit_runs(db, dataset_id, version_id=version_id)
    return AuditListResponse(
        audits=[AuditRunResponse.model_validate(a) for a in audits],
        total=len(audits),
    )

@router.get(
    "/{audit_id}",
    response_model=AuditRunResponse,
    summary="Get details of a specific audit run",
)
def get_audit(
    dataset_id: str,
    audit_id: str,
    db: Session = Depends(get_db),
):
    """Retrieve complete audit run details including all associated findings."""
    dataset_service.get_dataset(db, dataset_id)
    audit_run = dataset_service.get_audit_run(db, audit_id)
    if audit_run.dataset_id != dataset_id:
        raise ResourceNotFoundError(f"Audit run '{audit_id}' does not belong to dataset '{dataset_id}'")
    return audit_run

@router.get(
    "/{audit_id}/findings",
    response_model=List[FindingResponse],
    summary="Filter findings for an audit run",
)
def list_findings(
    dataset_id: str,
    audit_id: str,
    severity: Optional[str] = Query(None, description="Filter by severity: high, medium, low"),
    rule_id: Optional[str] = Query(None, description="Filter by rule ID, e.g. rule_missing_values"),
    column_name: Optional[str] = Query(None, description="Filter by column name"),
    db: Session = Depends(get_db),
):
    """Retrieve filtered findings for a specific audit run."""
    dataset_service.get_dataset(db, dataset_id)
    audit_run = dataset_service.get_audit_run(db, audit_id)
    if audit_run.dataset_id != dataset_id:
        raise ResourceNotFoundError(f"Audit run '{audit_id}' does not belong to dataset '{dataset_id}'")

    stmt = select(Finding).where(Finding.audit_id == audit_id)
    if severity:
        stmt = stmt.where(Finding.severity == severity.lower())
    if rule_id:
        stmt = stmt.where(Finding.rule_id == rule_id)
    if column_name:
        stmt = stmt.where(Finding.column_name == column_name)

    findings = list(db.execute(stmt).scalars().all())
    return [FindingResponse.model_validate(f) for f in findings]
