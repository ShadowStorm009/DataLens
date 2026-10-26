from typing import Optional, Dict, Any, List
from sqlalchemy.orm import Session

from backend.app.models.dataset import Dataset
from backend.app.models.version import DatasetVersion
from backend.app.models.audit import AuditRun, Finding
from backend.app.models.transformation import Transformation
from backend.app.services.dataset_service import DatasetService
from backend.app.services.storage import StorageService
from backend.app.audit.engine import AuditEngine
from backend.app.audit.rules.base import get_missing_mask
from backend.app.core.errors import ResourceNotFoundError, ValidationError
from backend.app.schemas.comparison import (
    VersionComparisonResponse,
    ScoreComparisonResponse,
    MetricDeltaItem,
    FindingDiffItem,
    FindingsDiff,
    ColumnChanges,
)
from backend.app.schemas.dataset import DatasetVersionResponse
from backend.app.schemas.transformation import TransformationResponse

class ComparisonService:
    def __init__(
        self,
        dataset_service: Optional[DatasetService] = None,
        audit_engine: Optional[AuditEngine] = None,
    ):
        self.dataset_service = dataset_service or DatasetService()
        self.audit_engine = audit_engine or AuditEngine()

    def compare_versions(
        self,
        db: Session,
        dataset_id: str,
        v1_id: str,
        v2_id: str,
    ) -> VersionComparisonResponse:
        """
        Compare two dataset versions (baseline v1 vs target v2).
        Derives metric deltas, score changes, resolved/new findings, and column differences.
        """
        dataset = self.dataset_service.get_dataset(db, dataset_id)

        v1 = db.query(DatasetVersion).filter(
            DatasetVersion.id == v1_id,
            DatasetVersion.dataset_id == dataset_id,
        ).first()
        if not v1:
            raise ResourceNotFoundError(f"Baseline version '{v1_id}' not found for dataset '{dataset_id}'")

        v2 = db.query(DatasetVersion).filter(
            DatasetVersion.id == v2_id,
            DatasetVersion.dataset_id == dataset_id,
        ).first()
        if not v2:
            raise ResourceNotFoundError(f"Comparison version '{v2_id}' not found for dataset '{dataset_id}'")

        # Retrieve or run audit for v1
        audit1 = self._get_or_run_audit(db, dataset, v1)

        # Retrieve or run audit for v2
        audit2 = self._get_or_run_audit(db, dataset, v2)

        # Read column lists from storage to check column changes
        storage = self.dataset_service.storage
        df1 = storage.read_dataframe(v1.storage_reference)
        df2 = storage.read_dataframe(v2.storage_reference)

        cols1 = list(df1.columns)
        cols2 = list(df2.columns)
        added_cols = [c for c in cols2 if c not in cols1]
        removed_cols = [c for c in cols1 if c not in cols2]
        common_cols = [c for c in cols1 if c in cols2]

        column_changes = ColumnChanges(
            added=added_cols,
            removed=removed_cols,
            common=common_cols,
        )

        # Score comparison
        score1 = audit1.score
        score2 = audit2.score
        score_delta = round(score2 - score1, 2) if (score1 is not None and score2 is not None) else None

        v1_method = audit1.score_method_version or "1.0"
        v2_method = audit2.score_method_version or "1.0"
        is_compatible = (v1_method == v2_method)
        method_note = (
            "Scoring methodology versions match (v1.0)."
            if is_compatible
            else f"Notice: Scoring methods differ (baseline: {v1_method}, comparison: {v2_method}). Score delta should be interpreted with caution."
        )

        penalties_v1 = (audit1.summary or {}).get("penalties", {})
        penalties_v2 = (audit2.summary or {}).get("penalties", {})

        score_comp = ScoreComparisonResponse(
            v1_score=score1,
            v2_score=score2,
            delta=score_delta,
            v1_method=v1_method,
            v2_method=v2_method,
            is_compatible=is_compatible,
            method_note=method_note,
            penalties_v1=penalties_v1,
            penalties_v2=penalties_v2,
        )

        # Metrics summary
        v1_missing = (audit1.summary or {}).get("total_missing_cells")
        if v1_missing is None:
            v1_missing = sum(int(get_missing_mask(df1[c]).sum()) for c in df1.columns)
        v2_missing = (audit2.summary or {}).get("total_missing_cells")
        if v2_missing is None:
            v2_missing = sum(int(get_missing_mask(df2[c]).sum()) for c in df2.columns)
        missing_delta = v2_missing - v1_missing

        v1_dups = (audit1.summary or {}).get("duplicate_rows_count")
        if v1_dups is None:
            v1_dups = int(df1.duplicated(keep="first").sum()) if len(df1) > 1 else 0
        v2_dups = (audit2.summary or {}).get("duplicate_rows_count")
        if v2_dups is None:
            v2_dups = int(df2.duplicated(keep="first").sum()) if len(df2) > 1 else 0
        dups_delta = v2_dups - v1_dups

        v1_high = sum(1 for f in audit1.findings if f.severity == "high")
        v2_high = sum(1 for f in audit2.findings if f.severity == "high")
        high_delta = v2_high - v1_high

        v1_med = sum(1 for f in audit1.findings if f.severity == "medium")
        v2_med = sum(1 for f in audit2.findings if f.severity == "medium")
        med_delta = v2_med - v1_med

        v1_low = sum(1 for f in audit1.findings if f.severity == "low")
        v2_low = sum(1 for f in audit2.findings if f.severity == "low")
        low_delta = v2_low - v1_low

        v1_total_f = len(audit1.findings)
        v2_total_f = len(audit2.findings)
        total_f_delta = v2_total_f - v1_total_f

        metrics = {
            "row_count": MetricDeltaItem(
                v1_value=v1.row_count,
                v2_value=v2.row_count,
                delta=v2.row_count - v1.row_count,
                improved=None,
            ),
            "column_count": MetricDeltaItem(
                v1_value=v1.column_count,
                v2_value=v2.column_count,
                delta=v2.column_count - v1.column_count,
                improved=None,
            ),
            "missing_cells": MetricDeltaItem(
                v1_value=v1_missing,
                v2_value=v2_missing,
                delta=missing_delta,
                improved=(missing_delta < 0),
            ),
            "duplicate_rows": MetricDeltaItem(
                v1_value=v1_dups,
                v2_value=v2_dups,
                delta=dups_delta,
                improved=(dups_delta < 0),
            ),
            "high_severity_findings": MetricDeltaItem(
                v1_value=v1_high,
                v2_value=v2_high,
                delta=high_delta,
                improved=(high_delta < 0),
            ),
            "medium_severity_findings": MetricDeltaItem(
                v1_value=v1_med,
                v2_value=v2_med,
                delta=med_delta,
                improved=(med_delta < 0),
            ),
            "low_severity_findings": MetricDeltaItem(
                v1_value=v1_low,
                v2_value=v2_low,
                delta=low_delta,
                improved=(low_delta < 0),
            ),
            "total_findings": MetricDeltaItem(
                v1_value=v1_total_f,
                v2_value=v2_total_f,
                delta=total_f_delta,
                improved=(total_f_delta < 0),
            ),
        }

        # Findings transition diff
        v1_signatures: Dict[tuple, Finding] = {
            (f.rule_id, f.column_name or "", f.finding_type or ""): f
            for f in audit1.findings
        }
        v2_signatures: Dict[tuple, Finding] = {
            (f.rule_id, f.column_name or "", f.finding_type or ""): f
            for f in audit2.findings
        }

        resolved: List[FindingDiffItem] = []
        for sig, finding in v1_signatures.items():
            if sig not in v2_signatures:
                resolved.append(self._to_diff_item(finding))

        new_findings: List[FindingDiffItem] = []
        for sig, finding in v2_signatures.items():
            if sig not in v1_signatures:
                new_findings.append(self._to_diff_item(finding))

        unresolved: List[FindingDiffItem] = []
        for sig, finding in v2_signatures.items():
            if sig in v1_signatures:
                unresolved.append(self._to_diff_item(finding))

        findings_diff = FindingsDiff(
            resolved=resolved,
            new=new_findings,
            unresolved=unresolved,
            resolved_count=len(resolved),
            new_count=len(new_findings),
            unresolved_count=len(unresolved),
        )

        # Retrieve relevant transformations
        transformations = db.query(Transformation).filter(
            Transformation.dataset_id == dataset_id,
        ).order_by(Transformation.created_at.asc()).all()

        return VersionComparisonResponse(
            dataset_id=dataset_id,
            v1=DatasetVersionResponse.model_validate(v1),
            v2=DatasetVersionResponse.model_validate(v2),
            score_comparison=score_comp,
            metrics=metrics,
            findings_diff=findings_diff,
            column_changes=column_changes,
            transformations=[TransformationResponse.model_validate(t) for t in transformations],
        )

    def _get_or_run_audit(
        self,
        db: Session,
        dataset: Dataset,
        version: DatasetVersion,
    ) -> AuditRun:
        """Find the latest completed audit for a version or run one deterministically."""
        audit = db.query(AuditRun).filter(
            AuditRun.version_id == version.id,
            AuditRun.status == "completed",
        ).order_by(AuditRun.created_at.desc()).first()

        if audit:
            return audit

        # If not audited yet, run deterministic audit now
        df = self.dataset_service.storage.read_dataframe(version.storage_reference)
        score, method_ver, summary, findings = self.audit_engine.run_audit(df)

        findings_dicts = [f.to_dict() for f in findings]
        return self.dataset_service.create_audit_run(
            db=db,
            dataset_id=dataset.id,
            version_id=version.id,
            score=score,
            score_method_version=method_ver,
            summary=summary,
            findings=findings_dicts,
        )

    @staticmethod
    def _to_diff_item(finding: Finding) -> FindingDiffItem:
        return FindingDiffItem(
            id=finding.id,
            rule_id=finding.rule_id,
            title=finding.title,
            severity=finding.severity,
            column_name=finding.column_name,
            description=finding.description,
            recommendation=finding.recommendation,
        )
