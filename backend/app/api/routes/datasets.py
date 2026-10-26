import math
import pandas as pd
from pathlib import Path
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, UploadFile, File, Form, Query, status
from sqlalchemy.orm import Session

from backend.app.db.session import get_db
from backend.app.schemas.dataset import (
    DatasetResponse,
    DatasetListResponse,
    DatasetPreviewResponse,
    DatasetVersionResponse,
)
from backend.app.services.dataset_service import dataset_service
from backend.app.services.storage import storage_service
from backend.app.services.csv_validator import csv_validator
from backend.app.core.errors import FileValidationError

router = APIRouter(prefix="/datasets", tags=["Datasets"])

@router.post("", response_model=DatasetResponse, status_code=status.HTTP_201_CREATED)
async def upload_dataset(
    file: UploadFile = File(...),
    name: Optional[str] = Form(None),
    db: Session = Depends(get_db),
):
    """
    Upload and validate a CSV dataset.
    Validates CSV structure, sanitizes headers, preserves original data immutably,
    and initializes Version 1.
    """
    filename = file.filename or "dataset.csv"
    if not filename.lower().endswith(".csv"):
        raise FileValidationError("Only CSV files (.csv) are supported for upload")

    # Read uploaded file content
    try:
        content = await file.read()
    except Exception as e:
        raise FileValidationError(f"Failed to read uploaded file: {str(e)}")

    # Safe CSV parsing and validation
    df, normalized_bytes, row_count, col_count, _ = csv_validator.validate_and_parse(
        content=content,
        original_filename=filename,
    )

    # Determine user-friendly dataset name
    dataset_name = (name or "").strip()
    if not dataset_name:
        dataset_name = Path(filename).stem or "Uploaded Dataset"

    # Persist dataset and create initial Version 1
    dataset = dataset_service.create_dataset(
        db=db,
        name=dataset_name,
        original_filename=filename,
        content=normalized_bytes,
        row_count=row_count,
        column_count=col_count,
    )

    return dataset

@router.get("", response_model=DatasetListResponse)
def list_datasets(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """List all stored datasets ordered by upload date descending."""
    datasets = dataset_service.list_datasets(db=db, skip=skip, limit=limit)
    return DatasetListResponse(datasets=datasets, total=len(datasets))

@router.get("/{dataset_id}", response_model=DatasetResponse)
def get_dataset(
    dataset_id: str,
    db: Session = Depends(get_db),
):
    """Retrieve metadata for a specific dataset."""
    return dataset_service.get_dataset(db=db, dataset_id=dataset_id)

@router.get("/{dataset_id}/preview", response_model=DatasetPreviewResponse)
def preview_dataset(
    dataset_id: str,
    version_id: Optional[str] = Query(None, description="Optional version ID. Defaults to current version."),
    limit: int = Query(20, ge=1, le=100, description="Maximum number of preview rows."),
    db: Session = Depends(get_db),
):
    """
    Retrieve a bounded preview of rows for the specified dataset version.
    Strictly enforces preview limits to avoid sending oversized responses.
    """
    dataset = dataset_service.get_dataset(db=db, dataset_id=dataset_id)
    target_version_id = version_id or dataset.current_version_id
    if not target_version_id:
        raise FileValidationError("Dataset has no associated versions")

    version = dataset_service.get_version(db=db, version_id=target_version_id)
    df = dataset_service.storage.read_dataframe(
        version.storage_reference,
        dtype=str,
        keep_default_na=False,
    )

    # Slice strictly to limit
    preview_df = df.head(limit)
    columns = list(preview_df.columns)

    # Clean NaN / infinite / empty values into JSON-compatible values
    clean_records = []
    for record in preview_df.to_dict(orient="records"):
        cleaned_record = {}
        for k, v in record.items():
            if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
                cleaned_record[k] = None
            elif pd.isna(v) or v == "":
                cleaned_record[k] = None
            else:
                cleaned_record[k] = v
        clean_records.append(cleaned_record)

    return DatasetPreviewResponse(
        dataset_id=dataset.id,
        version_id=version.id,
        version_number=version.version_number,
        columns=columns,
        rows=clean_records,
        total_rows=version.row_count,
        preview_limit=limit,
    )

@router.get("/{dataset_id}/versions", response_model=List[DatasetVersionResponse])
def list_dataset_versions(
    dataset_id: str,
    db: Session = Depends(get_db),
):
    """List all versions of a dataset in chronological order."""
    return dataset_service.list_versions(db=db, dataset_id=dataset_id)

@router.delete("/{dataset_id}", status_code=status.HTTP_200_OK)
def delete_dataset(
    dataset_id: str,
    db: Session = Depends(get_db),
):
    """Delete a dataset and all associated versions, audits, and physical files."""
    dataset_service.delete_dataset(db=db, dataset_id=dataset_id)
    return {"status": "deleted", "dataset_id": dataset_id}
