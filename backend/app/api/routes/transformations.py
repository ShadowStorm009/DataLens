from typing import List, Optional
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
import pandas as pd
import numpy as np

from backend.app.db.session import get_db
from backend.app.services.dataset_service import dataset_service
from backend.app.services.cleaner import TransformationEngine
from backend.app.core.errors import ResourceNotFoundError, ValidationError
from backend.app.schemas.transformation import (
    TransformationPreviewRequest,
    TransformationPreviewResponse,
    TransformationApplyRequest,
    TransformationResponse,
    TransformationListResponse,
)
from backend.app.schemas.dataset import DatasetVersionResponse

router = APIRouter(prefix="/datasets/{dataset_id}/transformations", tags=["Transformations"])

def _to_json_preview(df: pd.DataFrame, limit: int = 20) -> List[dict]:
    """Serialize first N rows into clean JSON-serializable dictionaries."""
    subset = df.head(limit)
    records = []
    for _, row in subset.iterrows():
        clean_row = {}
        for col, val in row.items():
            if pd.isna(val) or val in ("nan", "NaN", "None", "null", "<NA>"):
                clean_row[str(col)] = None
            elif isinstance(val, (np.floating, float)):
                clean_row[str(col)] = None if not np.isfinite(val) else float(val)
            elif isinstance(val, (np.integer, int)):
                clean_row[str(col)] = int(val)
            else:
                clean_row[str(col)] = str(val)
        records.append(clean_row)
    return records

@router.post(
    "/preview",
    response_model=TransformationPreviewResponse,
    summary="Preview transformation without mutating data",
)
def preview_transformation(
    dataset_id: str,
    request: TransformationPreviewRequest,
    db: Session = Depends(get_db),
):
    """
    Simulate a cleaning operation on an in-memory copy of the dataset.
    Returns expected row/cell changes, diff samples, and transformed preview rows.
    Guarantees zero persistent mutations to storage or database.
    """
    dataset = dataset_service.get_dataset(db, dataset_id)
    target_version_id = request.version_id or dataset.current_version_id
    version = dataset_service.get_version(db, target_version_id)

    if version.dataset_id != dataset_id:
        raise ResourceNotFoundError(f"Version '{target_version_id}' does not belong to dataset '{dataset_id}'")

    # Read dataframe safely
    df = dataset_service.storage.read_dataframe(version.storage_reference)
    rows_before = len(df)
    cols_before = len(df.columns)

    # Execute transformation via unified engine
    result = TransformationEngine.transform(
        df=df,
        operation_type=request.operation_type,
        column_name=request.column_name,
        parameters=request.parameters,
    )

    preview_rows = _to_json_preview(result.df, limit=20)
    columns_list = [str(c) for c in result.df.columns]

    return TransformationPreviewResponse(
        operation_type=request.operation_type,
        column_name=request.column_name,
        source_version_id=version.id,
        rows_before=rows_before,
        columns_before=cols_before,
        rows_after=len(result.df),
        columns_after=len(result.df.columns),
        rows_affected=result.rows_affected,
        cells_affected=result.cells_affected,
        summary=result.summary,
        sample_diff=result.sample_diff,
        preview_rows=preview_rows,
        columns=columns_list,
    )

@router.post(
    "/apply",
    response_model=TransformationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Apply transformation and create a new dataset version",
)
def apply_transformation(
    dataset_id: str,
    request: TransformationApplyRequest,
    db: Session = Depends(get_db),
):
    """
    Execute a validated cleaning operation, save the resulting DataFrame to storage as a new
    immutable DatasetVersion, update the dataset's current version pointer, and log transformation history.
    """
    dataset = dataset_service.get_dataset(db, dataset_id)
    target_version_id = request.version_id or dataset.current_version_id
    source_version = dataset_service.get_version(db, target_version_id)

    if source_version.dataset_id != dataset_id:
        raise ResourceNotFoundError(f"Version '{target_version_id}' does not belong to dataset '{dataset_id}'")

    # Read source dataframe
    df = dataset_service.storage.read_dataframe(source_version.storage_reference)

    # Execute transformation via identical shared logic
    result = TransformationEngine.transform(
        df=df,
        operation_type=request.operation_type,
        column_name=request.column_name,
        parameters=request.parameters,
    )

    if len(result.df.columns) == 0:
        raise ValidationError("Transformation cannot produce a dataset with 0 columns.")

    # Create new immutable dataset version
    new_version = dataset_service.create_version(
        db=db,
        dataset_id=dataset.id,
        parent_version_id=source_version.id,
        data=result.df,
        row_count=len(result.df),
        column_count=len(result.df.columns),
    )

    # Record transformation history
    transformation = dataset_service.record_transformation(
        db=db,
        dataset_id=dataset.id,
        source_version_id=source_version.id,
        result_version_id=new_version.id,
        operation_type=request.operation_type,
        column_name=request.column_name,
        parameters=request.parameters,
        rows_affected=result.rows_affected,
        cells_affected=result.cells_affected,
    )

    response = TransformationResponse.model_validate(transformation)
    response.summary = result.summary
    response.result_version = DatasetVersionResponse.model_validate(new_version)
    return response

@router.get(
    "",
    response_model=TransformationListResponse,
    summary="List transformation history for a dataset",
)
def list_transformations(
    dataset_id: str,
    db: Session = Depends(get_db),
):
    """Retrieve full audit trail of transformations applied to a dataset."""
    dataset_service.get_dataset(db, dataset_id)
    transformations = dataset_service.list_transformations(db, dataset_id)
    return TransformationListResponse(
        transformations=[TransformationResponse.model_validate(t) for t in transformations],
        total=len(transformations),
    )
