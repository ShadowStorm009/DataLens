import re
import io
import json
from datetime import datetime, timezone
from typing import Tuple, Dict, Any, Optional
import pandas as pd
from sqlalchemy.orm import Session

from backend.app.models.dataset import Dataset
from backend.app.models.version import DatasetVersion
from backend.app.models.audit import AuditRun, Finding
from backend.app.models.transformation import Transformation
from backend.app.services.dataset_service import DatasetService, dataset_service
from backend.app.core.errors import ResourceNotFoundError

FORMULA_PREFIXES = ('=', '+', '-', '@', '\t', '\r')

class ExportService:
    def __init__(self, ds_service: Optional[DatasetService] = None):
        self.dataset_service = ds_service or dataset_service

    def export_csv(
        self,
        db: Session,
        dataset_id: str,
        version_id: str,
        spreadsheet_safe: bool = False,
    ) -> Tuple[str, str]:
        """
        Export a specific dataset version as a CSV string.
        Returns: (csv_text, filename)
        """
        dataset = self.dataset_service.get_dataset(db, dataset_id)
        version = self.dataset_service.get_version(db, version_id)

        if version.dataset_id != dataset_id:
            raise ResourceNotFoundError(f"Version '{version_id}' does not belong to dataset '{dataset_id}'")

        df = self.dataset_service.storage.read_dataframe(version.storage_reference)

        # Apply spreadsheet formula sanitization if requested
        if spreadsheet_safe:
            df = self._sanitize_for_spreadsheet(df)

        csv_buffer = io.StringIO()
        df.to_csv(csv_buffer, index=False)
        csv_text = csv_buffer.getvalue()

        safe_name = self._sanitize_filename(dataset.name)
        safe_suffix = "_spreadsheet_safe" if spreadsheet_safe else ""
        filename = f"{safe_name}_v{version.version_number}{safe_suffix}.csv"

        return csv_text, filename

    def generate_json_report(
        self,
        db: Session,
        dataset_id: str,
        audit_id: str,
    ) -> Dict[str, Any]:
        """Generate structured JSON audit report for a specific audit run."""
        dataset = self.dataset_service.get_dataset(db, dataset_id)
        audit = (
            db.query(AuditRun)
            .filter(AuditRun.id == audit_id, AuditRun.dataset_id == dataset_id)
            .first()
        )
        if not audit:
            raise ResourceNotFoundError(f"Audit run '{audit_id}' not found for dataset '{dataset_id}'")

        version = self.dataset_service.get_version(db, audit.version_id)

        # Findings
        findings_list = []
        for f in audit.findings:
            evidence_data = {}
            if f.structured_evidence:
                try:
                    evidence_data = json.loads(f.structured_evidence)
                except Exception:
                    evidence_data = {"raw": f.structured_evidence}

            findings_list.append({
                "id": f.id,
                "rule_id": f.rule_id,
                "title": f.title,
                "severity": f.severity,
                "column_name": f.column_name,
                "description": f.description,
                "recommendation": f.recommendation,
                "evidence": evidence_data,
            })

        # Transformations applied
        transformations = (
            db.query(Transformation)
            .filter(Transformation.dataset_id == dataset_id)
            .order_by(Transformation.created_at.asc())
            .all()
        )
        transforms_data = []
        for t in transformations:
            transforms_data.append({
                "id": t.id,
                "operation_type": t.operation_type,
                "column_name": t.column_name,
                "rows_affected": t.rows_affected,
                "cells_affected": t.cells_affected,
                "created_at": t.created_at.isoformat(),
            })

        return {
            "report_generated_at": datetime.now(timezone.utc).isoformat(),
            "dataset": {
                "id": dataset.id,
                "name": dataset.name,
                "original_filename": dataset.original_filename,
            },
            "version": {
                "id": version.id,
                "version_number": version.version_number,
                "row_count": version.row_count,
                "column_count": version.column_count,
                "created_at": version.created_at.isoformat(),
            },
            "audit": {
                "id": audit.id,
                "status": audit.status,
                "score": audit.score,
                "score_method_version": audit.score_method_version,
                "created_at": audit.created_at.isoformat(),
                "summary": audit.summary,
            },
            "findings_count": len(findings_list),
            "findings": findings_list,
            "transformations_applied": transforms_data,
            "disclaimer": (
                "The DataLens Quality Score and findings reflect deterministic heuristic checks only. "
                "Higher scores denote fewer rule violations, but do not imply ground-truth semantic accuracy."
            ),
        }

    def generate_html_report(
        self,
        db: Session,
        dataset_id: str,
        audit_id: str,
    ) -> Tuple[str, str]:
        """
        Generate standalone self-contained HTML audit report.
        Returns: (html_text, filename)
        """
        report_data = self.generate_json_report(db, dataset_id, audit_id)
        dataset_name = report_data["dataset"]["name"]
        version_num = report_data["version"]["version_number"]
        score = report_data["audit"]["score"]
        score_method = report_data["audit"]["score_method_version"]
        summary = report_data["audit"]["summary"] or {}
        penalties = summary.get("penalties", {})
        findings = report_data["findings"]
        transforms = report_data["transformations_applied"]

        # Build findings rows HTML
        findings_html = ""
        for f in findings:
            badge_color = "#ef4444" if f["severity"] == "high" else "#f59e0b" if f["severity"] == "medium" else "#3b82f6"
            evidence_str = json.dumps(f["evidence"], indent=2)
            findings_html += f"""
            <div class="finding-card">
                <div class="finding-header">
                    <span class="badge" style="background-color: {badge_color}; color: #fff;">{f["severity"].upper()}</span>
                    {f'<span class="col-badge">Col: {f["column_name"]}</span>' if f["column_name"] else ''}
                    <span class="finding-title">{f["title"]}</span>
                </div>
                <div class="finding-desc">{f["description"]}</div>
                <div class="recommendation"><strong>Recommendation:</strong> {f["recommendation"]}</div>
                <details style="margin-top: 0.5rem; font-size: 0.8rem;">
                    <summary style="cursor: pointer; color: #475569;">Structured Evidence</summary>
                    <pre style="background: #f1f5f9; padding: 0.5rem; border-radius: 4px; overflow-x: auto;">{evidence_str}</pre>
                </details>
            </div>
            """

        # Build transformations rows HTML
        transforms_html = ""
        if transforms:
            for idx, t in enumerate(transforms):
                col_text = f" on column <code>{t['column_name']}</code>" if t['column_name'] else ""
                transforms_html += f"""
                <div class="transform-item">
                    <strong>Step {idx + 1}: {t['operation_type'].replace('_', ' ').title()}</strong>{col_text}
                    <div style="font-size: 0.8rem; color: #64748b;">
                        Rows affected: {t['rows_affected']}, Cells affected: {t['cells_affected']} &bull; {t['created_at']}
                    </div>
                </div>
                """
        else:
            transforms_html = "<p style='color: #64748b; font-style: italic;'>No cleaning transformations applied to this version (Initial Upload).</p>"

        # Complete standalone HTML template
        html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DataLens Audit Report - {dataset_name} (v{version_num})</title>
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background-color: #f8fafc;
            color: #0f172a;
            margin: 0;
            padding: 2rem;
            line-height: 1.5;
        }}
        .container {{
            max-width: 900px;
            margin: 0 auto;
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 2.5rem;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
        }}
        .header {{
            border-bottom: 2px solid #e2e8f0;
            padding-bottom: 1.5rem;
            margin-bottom: 2rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 1rem;
        }}
        .header-title {{
            font-size: 1.8rem;
            font-weight: 700;
            color: #0f172a;
            margin: 0 0 0.5rem 0;
        }}
        .meta-text {{
            font-size: 0.85rem;
            color: #64748b;
        }}
        .score-box {{
            text-align: center;
            padding: 1rem 1.5rem;
            background: #f0fdf4;
            border: 2px solid #bbf7d0;
            border-radius: 8px;
        }}
        .score-val {{
            font-size: 2.5rem;
            font-weight: 800;
            color: #166534;
        }}
        .section-title {{
            font-size: 1.25rem;
            font-weight: 700;
            margin: 2rem 0 1rem 0;
            color: #1e293b;
            border-bottom: 1px solid #e2e8f0;
            padding-bottom: 0.5rem;
        }}
        .kpi-grid {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
            gap: 1rem;
            margin-bottom: 1.5rem;
        }}
        .kpi-card {{
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            padding: 1rem;
            text-align: center;
        }}
        .kpi-label {{
            font-size: 0.75rem;
            color: #64748b;
            text-transform: uppercase;
            font-weight: 600;
        }}
        .kpi-num {{
            font-size: 1.5rem;
            font-weight: 700;
            color: #0f172a;
            margin-top: 0.25rem;
        }}
        .table {{
            width: 100%;
            border-collapse: collapse;
            font-size: 0.875rem;
            margin-bottom: 1.5rem;
        }}
        .table th, .table td {{
            padding: 0.75rem 1rem;
            border-bottom: 1px solid #e2e8f0;
            text-align: left;
        }}
        .table th {{
            background: #f8fafc;
            font-weight: 600;
            color: #475569;
        }}
        .finding-card {{
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            padding: 1rem;
            margin-bottom: 1rem;
            background: #ffffff;
        }}
        .finding-header {{
            display: flex;
            align-items: center;
            gap: 0.5rem;
            margin-bottom: 0.5rem;
            flex-wrap: wrap;
        }}
        .badge {{
            padding: 0.2rem 0.5rem;
            border-radius: 4px;
            font-size: 0.75rem;
            font-weight: 700;
        }}
        .col-badge {{
            background: #f1f5f9;
            color: #475569;
            padding: 0.2rem 0.5rem;
            border-radius: 4px;
            font-size: 0.75rem;
            font-family: monospace;
        }}
        .finding-title {{
            font-weight: 600;
            color: #0f172a;
            font-size: 0.95rem;
        }}
        .finding-desc {{
            color: #334155;
            font-size: 0.875rem;
            margin-bottom: 0.5rem;
        }}
        .recommendation {{
            font-size: 0.85rem;
            color: #0369a1;
            background: #f0f9ff;
            padding: 0.5rem 0.75rem;
            border-radius: 4px;
        }}
        .transform-item {{
            border-left: 3px solid #0284c7;
            background: #f8fafc;
            padding: 0.75rem 1rem;
            margin-bottom: 0.75rem;
            border-radius: 0 4px 4px 0;
        }}
        .disclaimer-box {{
            background: #f8fafc;
            border: 1px solid #cbd5e1;
            border-radius: 6px;
            padding: 1rem;
            font-size: 0.8rem;
            color: #64748b;
            margin-top: 2rem;
            line-height: 1.4;
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div>
                <h1 class="header-title">DataLens Quality Audit Report</h1>
                <div class="meta-text">
                    Dataset: <strong>{dataset_name}</strong> &bull; Version: <strong>v{version_num}</strong><br>
                    Generated: {report_data["report_generated_at"]} &bull; Audit ID: <code>{audit_id}</code>
                </div>
            </div>
            <div class="score-box">
                <div style="font-size: 0.75rem; font-weight: 700; color: #166534; text-transform: uppercase;">Quality Score</div>
                <div class="score-val">{score}<span style="font-size: 1rem; color: #94a3b8;">/100</span></div>
                <div style="font-size: 0.75rem; color: #64748b;">Method v{score_method}</div>
            </div>
        </div>

        <div class="kpi-grid">
            <div class="kpi-card">
                <div class="kpi-label">Rows</div>
                <div class="kpi-num">{report_data["version"]["row_count"]:,}</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-label">Columns</div>
                <div class="kpi-num">{report_data["version"]["column_count"]}</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-label">Total Findings</div>
                <div class="kpi-num">{len(findings)}</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-label">Total Deductions</div>
                <div class="kpi-num" style="color: #ef4444;">-{summary.get('total_penalty', 0):.1f} pts</div>
            </div>
        </div>

        <div class="section-title">Penalty Deductions Breakdown</div>
        <table class="table">
            <thead>
                <tr>
                    <th>Quality Dimension</th>
                    <th>Penalty Deducted</th>
                    <th>Max Allowed</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>Missing Values</td>
                    <td>-{penalties.get('missingness', 0):.1f} pts</td>
                    <td>30.0 pts</td>
                </tr>
                <tr>
                    <td>Duplicate Rows</td>
                    <td>-{penalties.get('duplicates', 0):.1f} pts</td>
                    <td>25.0 pts</td>
                </tr>
                <tr>
                    <td>Constant Columns</td>
                    <td>-{penalties.get('constant_columns', 0):.1f} pts</td>
                    <td>20.0 pts</td>
                </tr>
                <tr>
                    <td>Type Inconsistencies</td>
                    <td>-{penalties.get('type_inconsistency', 0):.1f} pts</td>
                    <td>15.0 pts</td>
                </tr>
                <tr>
                    <td>Anomalies & Heuristics</td>
                    <td>-{penalties.get('anomalies_and_heuristics', 0):.1f} pts</td>
                    <td>10.0 pts</td>
                </tr>
            </tbody>
        </table>

        <div class="section-title">Quality Findings &amp; Evidence ({len(findings)})</div>
        {findings_html if findings_html else '<p style="color: #10b981; font-weight: 600;">No quality issues found! Dataset passed all deterministic checks.</p>'}

        <div class="section-title">Applied Cleaning Lineage</div>
        {transforms_html}

        <div class="disclaimer-box">
            <strong>Audit Disclaimer:</strong> {report_data["disclaimer"]}
        </div>
    </div>
</body>
</html>"""

        safe_name = self._sanitize_filename(dataset_name)
        filename = f"{safe_name}_v{version_num}_audit_report.html"
        return html_content, filename

    @staticmethod
    def _sanitize_for_spreadsheet(df: pd.DataFrame) -> pd.DataFrame:
        """
        Prevent spreadsheet formula injection (CSV Injection).
        If a text cell begins with '=', '+', '-', '@', tab, or CR, prepend with single quote.
        """
        df_copy = df.copy()
        for col in df_copy.columns:
            if df_copy[col].dtype == object or pd.api.types.is_string_dtype(df_copy[col]):
                df_copy[col] = df_copy[col].apply(
                    lambda val: f"'{val}" if isinstance(val, str) and val.startswith(FORMULA_PREFIXES) else val
                )
        return df_copy

    @staticmethod
    def _sanitize_filename(name: str) -> str:
        """Generate safe filesystem and URL attachment filename."""
        clean = re.sub(r'[^a-zA-Z0-9_\-]', '_', name.strip())
        return clean[:50] or "datalens_export"

export_service = ExportService()
