from fastapi import APIRouter, Depends, Query, Response
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import Session
from typing import Optional

from backend.app.db.session import get_db
from backend.app.services.export import export_service
from backend.app.services.dataset_service import dataset_service
from backend.app.models.audit import AuditRun
from backend.app.core.errors import ResourceNotFoundError

router = APIRouter(
    prefix="/datasets/{dataset_id}",
    tags=["export"],
)

@router.get(
    "/versions/{version_id}/export",
    summary="Export specific dataset version as CSV",
)
def export_version_csv(
    dataset_id: str,
    version_id: str,
    spreadsheet_safe: bool = Query(False, description="Sanitize formula prefixes (=, +, -, @) to prevent CSV injection"),
    db: Session = Depends(get_db),
):
    """
    Download the CSV file for a specific dataset version.
    Optionally applies spreadsheet formula injection protection.
    """
    csv_text, filename = export_service.export_csv(
        db=db,
        dataset_id=dataset_id,
        version_id=version_id,
        spreadsheet_safe=spreadsheet_safe,
    )

    return Response(
        content=csv_text,
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-Spreadsheet-Safe": str(spreadsheet_safe).lower(),
        },
    )

@router.get(
    "/export",
    summary="Export current dataset version as CSV",
)
def export_current_version_csv(
    dataset_id: str,
    spreadsheet_safe: bool = Query(False, description="Sanitize formula prefixes (=, +, -, @) to prevent CSV injection"),
    db: Session = Depends(get_db),
):
    """Export the current active version of a dataset."""
    dataset = dataset_service.get_dataset(db, dataset_id)
    if not dataset.current_version_id:
        raise ResourceNotFoundError(f"Dataset '{dataset_id}' has no current version")

    return export_version_csv(
        dataset_id=dataset_id,
        version_id=dataset.current_version_id,
        spreadsheet_safe=spreadsheet_safe,
        db=db,
    )

@router.get(
    "/audits/{audit_id}/report",
    summary="Export audit report in HTML or JSON format",
)
def export_audit_report(
    dataset_id: str,
    audit_id: str,
    format: str = Query("html", description="Report format: 'html' or 'json'"),
    db: Session = Depends(get_db),
):
    """
    Download a comprehensive audit report for a specific audit run.
    Supports standalone self-contained HTML (for humans) and structured JSON (for machines).
    """
    if format.lower() == "json":
        report_data = export_service.generate_json_report(db, dataset_id, audit_id)
        dataset_name = export_service._sanitize_filename(report_data["dataset"]["name"])
        v_num = report_data["version"]["version_number"]
        filename = f"{dataset_name}_v{v_num}_audit_report.json"
        return JSONResponse(
            content=jsonable_encoder(report_data),
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
            },
        )
    else:
        html_text, filename = export_service.generate_html_report(db, dataset_id, audit_id)
        return Response(
            content=html_text,
            media_type="text/html; charset=utf-8",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
            },
        )

@router.get(
    "/versions/{version_id}/report",
    summary="Export latest audit report for a specific dataset version",
)
def export_version_audit_report(
    dataset_id: str,
    version_id: str,
    format: str = Query("html", description="Report format: 'html' or 'json'"),
    db: Session = Depends(get_db),
):
    """Export the report for the latest completed audit on a specific version."""
    version = dataset_service.get_version(db, version_id)
    if version.dataset_id != dataset_id:
        raise ResourceNotFoundError(f"Version '{version_id}' does not belong to dataset '{dataset_id}'")

    latest_audit = (
        db.query(AuditRun)
        .filter(AuditRun.dataset_id == dataset_id, AuditRun.version_id == version_id, AuditRun.status == "completed")
        .order_by(AuditRun.created_at.desc())
        .first()
    )
    if not latest_audit:
        raise ResourceNotFoundError(f"No completed audit runs found for version '{version_id}'")

    return export_audit_report(
        dataset_id=dataset_id,
        audit_id=latest_audit.id,
        format=format,
        db=db,
    )

@router.get(
    "/report",
    summary="Export latest audit report for dataset",
)
def export_latest_audit_report(
    dataset_id: str,
    format: str = Query("html", description="Report format: 'html' or 'json'"),
    db: Session = Depends(get_db),
):
    """Export the report for the latest completed audit on the current version."""
    dataset = dataset_service.get_dataset(db, dataset_id)
    latest_audit = (
        db.query(AuditRun)
        .filter(AuditRun.dataset_id == dataset_id, AuditRun.status == "completed")
        .order_by(AuditRun.created_at.desc())
        .first()
    )
    if not latest_audit:
        raise ResourceNotFoundError(f"No completed audit runs found for dataset '{dataset_id}'")

    return export_audit_report(
        dataset_id=dataset_id,
        audit_id=latest_audit.id,
        format=format,
        db=db,
    )
