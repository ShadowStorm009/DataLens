import pandas as pd
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
    ColumnStatComparisonItem,
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

        # Score comparison & audit configuration checks
        score1 = audit1.score
        score2 = audit2.score
        score_delta = round(score2 - score1, 2) if (score1 is not None and score2 is not None) else None

        v1_method = audit1.score_method_version or "1.0"
        v2_method = audit2.score_method_version or "1.0"
        is_method_compatible = (v1_method == v2_method)

        v1_target = (audit1.summary or {}).get("target_column")
        v2_target = (audit2.summary or {}).get("target_column")
        is_target_compatible = (v1_target == v2_target)

        is_compatible = is_method_compatible and is_target_compatible

        method_notes = []
        if is_method_compatible:
            method_notes.append(f"Scoring methodology versions match (v{v1_method}).")
        else:
            method_notes.append(
                f"Notice: Scoring methods differ (baseline: v{v1_method}, comparison: v{v2_method}). "
                "Score delta should be interpreted with caution."
            )

        audit_config_note = None
        if not is_target_compatible:
            audit_config_note = (
                f"Notice: Target column configurations differ (Baseline: '{v1_target or 'None'}', "
                f"Comparison: '{v2_target or 'None'}'). Target-dependent rules (Class Imbalance, "
                "Potential Leakage) evaluated different target features."
            )
            method_notes.append(audit_config_note)

        method_note = " ".join(method_notes)

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
            v1_target_column=v1_target,
            v2_target_column=v2_target,
            audit_config_compatible=is_target_compatible,
            audit_config_note=audit_config_note,
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

        v1_total_cells = len(df1) * len(df1.columns)
        v2_total_cells = len(df2) * len(df2.columns)
        v1_missing_pct = round((v1_missing / v1_total_cells * 100), 2) if v1_total_cells > 0 else 0.0
        v2_missing_pct = round((v2_missing / v2_total_cells * 100), 2) if v2_total_cells > 0 else 0.0
        missing_pct_delta = round(v2_missing_pct - v1_missing_pct, 2)

        v1_dups = (audit1.summary or {}).get("duplicate_rows_count")
        if v1_dups is None:
            v1_dups = int(df1.duplicated(keep="first").sum()) if len(df1) > 1 else 0
        v2_dups = (audit2.summary or {}).get("duplicate_rows_count")
        if v2_dups is None:
            v2_dups = int(df2.duplicated(keep="first").sum()) if len(df2) > 1 else 0
        dups_delta = v2_dups - v1_dups

        v1_dup_pct = round((v1_dups / len(df1) * 100), 2) if len(df1) > 0 else 0.0
        v2_dup_pct = round((v2_dups / len(df2) * 100), 2) if len(df2) > 0 else 0.0
        dup_pct_delta = round(v2_dup_pct - v1_dup_pct, 2)

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
            "missing_percentage": MetricDeltaItem(
                v1_value=v1_missing_pct,
                v2_value=v2_missing_pct,
                delta=missing_pct_delta,
                improved=(missing_pct_delta < 0),
            ),
            "duplicate_rows": MetricDeltaItem(
                v1_value=v1_dups,
                v2_value=v2_dups,
                delta=dups_delta,
                improved=(dups_delta < 0),
            ),
            "duplicate_percentage": MetricDeltaItem(
                v1_value=v1_dup_pct,
                v2_value=v2_dup_pct,
                delta=dup_pct_delta,
                improved=(dup_pct_delta < 0),
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

        # Column-by-column statistics
        all_cols = cols1 + [c for c in cols2 if c not in cols1]
        column_stats_list: List[ColumnStatComparisonItem] = []

        for col in all_cols:
            in_v1 = col in cols1
            in_v2 = col in cols2
            status = "common" if (in_v1 and in_v2) else ("removed" if in_v1 else "added")

            v1_type = str(df1[col].dtype) if in_v1 else None
            v2_type = str(df2[col].dtype) if in_v2 else None

            v1_nulls = int(get_missing_mask(df1[col]).sum()) if in_v1 else None
            v2_nulls = int(get_missing_mask(df2[col]).sum()) if in_v2 else None
            null_delta = (v2_nulls - v1_nulls) if (v1_nulls is not None and v2_nulls is not None) else None

            v1_null_pct = round((v1_nulls / len(df1) * 100), 2) if (in_v1 and len(df1) > 0) else None
            v2_null_pct = round((v2_nulls / len(df2) * 100), 2) if (in_v2 and len(df2) > 0) else None
            null_pct_delta = round(v2_null_pct - v1_null_pct, 2) if (v1_null_pct is not None and v2_null_pct is not None) else None

            v1_distinct = int(df1[col].nunique(dropna=True)) if in_v1 else None
            v2_distinct = int(df2[col].nunique(dropna=True)) if in_v2 else None
            distinct_delta = (v2_distinct - v1_distinct) if (v1_distinct is not None and v2_distinct is not None) else None

            v1_mean, v2_mean, mean_delta = None, None, None
            v1_median, v2_median, median_delta = None, None, None

            if in_v1 and pd.api.types.is_numeric_dtype(df1[col]):
                s1 = pd.to_numeric(df1[col], errors="coerce").dropna()
                if len(s1) > 0:
                    v1_mean = round(float(s1.mean()), 2)
                    v1_median = round(float(s1.median()), 2)

            if in_v2 and pd.api.types.is_numeric_dtype(df2[col]):
                s2 = pd.to_numeric(df2[col], errors="coerce").dropna()
                if len(s2) > 0:
                    v2_mean = round(float(s2.mean()), 2)
                    v2_median = round(float(s2.median()), 2)

            if v1_mean is not None and v2_mean is not None:
                mean_delta = round(v2_mean - v1_mean, 2)
            if v1_median is not None and v2_median is not None:
                median_delta = round(v2_median - v1_median, 2)

            column_stats_list.append(
                ColumnStatComparisonItem(
                    column_name=col,
                    status=status,
                    v1_type=v1_type,
                    v2_type=v2_type,
                    v1_null_count=v1_nulls,
                    v2_null_count=v2_nulls,
                    null_count_delta=null_delta,
                    v1_null_percentage=v1_null_pct,
                    v2_null_percentage=v2_null_pct,
                    null_percentage_delta=null_pct_delta,
                    v1_distinct_count=v1_distinct,
                    v2_distinct_count=v2_distinct,
                    distinct_count_delta=distinct_delta,
                    v1_mean=v1_mean,
                    v2_mean=v2_mean,
                    mean_delta=mean_delta,
                    v1_median=v1_median,
                    v2_median=v2_median,
                    median_delta=median_delta,
                )
            )

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

        # Retrieve relevant transformations between v1 and v2 in chronological order
        if v1.id == v2.id:
            relevant_transformations = []
        else:
            all_trans = db.query(Transformation).filter(
                Transformation.dataset_id == dataset_id,
            ).order_by(Transformation.created_at.asc()).all()

            if v1.version_number < v2.version_number:
                ver_map = {ver.id: ver.version_number for ver in dataset.versions}
                relevant_transformations = [
                    t for t in all_trans
                    if ver_map.get(t.result_version_id, 0) > v1.version_number
                    and ver_map.get(t.result_version_id, 0) <= v2.version_number
                ]
            else:
                relevant_transformations = all_trans

        return VersionComparisonResponse(
            dataset_id=dataset_id,
            v1=DatasetVersionResponse.model_validate(v1),
            v2=DatasetVersionResponse.model_validate(v2),
            score_comparison=score_comp,
            metrics=metrics,
            column_stats=column_stats_list,
            findings_diff=findings_diff,
            column_changes=column_changes,
            transformations=[TransformationResponse.model_validate(t) for t in relevant_transformations],
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
