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
    def __init__(
        self,
        ds_service: Optional[DatasetService] = None,
        comp_service: Optional[Any] = None,
    ):
        self.dataset_service = ds_service or dataset_service
        self._comparison_service = comp_service

    @property
    def comparison_service(self):
        if self._comparison_service is None:
            from backend.app.services.comparison import ComparisonService
            self._comparison_service = ComparisonService(dataset_service=self.dataset_service)
        return self._comparison_service

    def export_csv(
        self,
        db: Session,
        dataset_id: str,
        version_id: str,
        spreadsheet_safe: bool = False,
    ) -> Tuple[str, str]:
        """
        Export a specific dataset version as a CSV string.
        Optionally sanitizes cells against formula injection for spreadsheet software.
        Returns: (csv_text, filename)
        """
        dataset = self.dataset_service.get_dataset(db, dataset_id)
        version = self.dataset_service.get_version(db, version_id)

        if version.dataset_id != dataset_id:
            raise ResourceNotFoundError(f"Version '{version_id}' does not belong to dataset '{dataset_id}'")

        try:
            df = self.dataset_service.storage.read_dataframe(version.storage_reference)
        except Exception as e:
            raise ResourceNotFoundError(f"Underlying storage file for version '{version_id}' could not be read: {str(e)}")

        if df is None:
            df = pd.DataFrame()

        # Apply spreadsheet formula sanitization if requested
        if spreadsheet_safe and not df.empty and len(df.columns) > 0:
            df = self._sanitize_for_spreadsheet(df)

        csv_buffer = io.StringIO()
        df.to_csv(csv_buffer, index=False)
        csv_text = csv_buffer.getvalue()

        safe_name = self._sanitize_filename(dataset.name)
        safe_suffix = "_spreadsheet_safe" if spreadsheet_safe else ""
        filename = f"{safe_name}_v{version.version_number}{safe_suffix}.csv"

        return csv_text, filename

    def export_colab_notebook(
        self,
        db: Session,
        dataset_id: str,
        version_id: str,
    ) -> Tuple[str, str, str]:
        """
        Generate a ready-to-run Jupyter notebook (.ipynb) for Google Colab
        paired with a specific dataset version.
        Returns: (notebook_json_str, notebook_filename, expected_csv_filename)
        """
        from backend.app.services.colab_notebook import colab_notebook_generator
        return colab_notebook_generator.generate_notebook(db, dataset_id, version_id)

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

        # Before/after comparison if available
        before_after_comparison = None
        if version.parent_version_id:
            try:
                comp_result = self.comparison_service.compare_versions(
                    db=db,
                    dataset_id=dataset_id,
                    v1_id=version.parent_version_id,
                    v2_id=version.id,
                )
                before_after_comparison = comp_result.model_dump(mode="json")
            except Exception as e:
                before_after_comparison = {
                    "available": False,
                    "reason": f"Unable to generate comparison with parent version '{version.parent_version_id}': {str(e)}",
                }

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
                "parent_version_id": version.parent_version_id,
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
            "before_after_comparison": before_after_comparison,
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

        # Build Before/After comparison HTML
        comp_data = report_data.get("before_after_comparison")
        if comp_data and isinstance(comp_data, dict) and "score_comparison" in comp_data:
            s_comp = comp_data.get("score_comparison", {})
            m_comp = comp_data.get("metrics_comparison", {})
            f_diff = comp_data.get("findings_diff", {})
            v1_info = comp_data.get("v1", {})
            parent_v_num = v1_info.get("version_number", "Parent")

            s1 = s_comp.get("score_v1", 0.0)
            s2 = s_comp.get("score_v2", 0.0)
            delta = s_comp.get("delta", 0.0)
            delta_sign = "+" if delta > 0 else ""
            delta_color = "#16a34a" if delta > 0 else "#ef4444" if delta < 0 else "#64748b"

            missing_item = m_comp.get("missing_cells", {})
            m1 = missing_item.get("v1", 0)
            m2 = missing_item.get("v2", 0)
            m_delta = missing_item.get("delta", 0)
            m_sign = "+" if m_delta > 0 else ""
            m_color = "#16a34a" if missing_item.get("improved") else "#64748b" if m_delta == 0 else "#ef4444"

            dup_item = m_comp.get("duplicate_rows", {})
            d1 = dup_item.get("v1", 0)
            d2 = dup_item.get("v2", 0)
            d_delta = dup_item.get("delta", 0)
            d_sign = "+" if d_delta > 0 else ""
            d_color = "#16a34a" if dup_item.get("improved") else "#64748b" if d_delta == 0 else "#ef4444"

            resolved = f_diff.get("resolved", [])
            resolved_html = ""
            if resolved:
                for rf in resolved:
                    col_str = f" (Col: <code>{rf.get('column_name')}</code>)" if rf.get('column_name') else ""
                    resolved_html += f"""
                    <li style="margin-bottom: 0.35rem;">
                        <span class="badge" style="background-color: #10b981; color: #fff;">RESOLVED</span>
                        <strong>{rf.get('title')}</strong>{col_str}
                    </li>
                    """
            else:
                resolved_html = "<li style='color: #64748b; font-style: italic;'>No prior findings resolved in this version.</li>"

            new_findings = f_diff.get("new", [])
            new_html = ""
            if new_findings:
                for nf in new_findings:
                    col_str = f" (Col: <code>{nf.get('column_name')}</code>)" if nf.get('column_name') else ""
                    new_html += f"""
                    <li style="margin-bottom: 0.35rem;">
                        <span class="badge" style="background-color: #f59e0b; color: #fff;">NEW</span>
                        <strong>{nf.get('title')}</strong>{col_str}
                    </li>
                    """

            comparison_html = f"""
            <div class="section-title">Before / After Version Comparison (vs Baseline v{parent_v_num})</div>
            <div class="kpi-grid">
                <div class="kpi-card">
                    <div class="kpi-label">Baseline Score (v{parent_v_num})</div>
                    <div class="kpi-num">{s1}<span style="font-size: 0.85rem; color: #94a3b8;">/100</span></div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-label">Cleaned Score (v{version_num})</div>
                    <div class="kpi-num">{s2}<span style="font-size: 0.85rem; color: #94a3b8;">/100</span></div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-label">Score Improvement</div>
                    <div class="kpi-num" style="color: {delta_color};">{delta_sign}{delta:.1f} pts</div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-label">Resolved Issues</div>
                    <div class="kpi-num" style="color: #16a34a;">{len(resolved)}</div>
                </div>
            </div>

            <table class="table">
                <thead>
                    <tr>
                        <th>Metric</th>
                        <th>Baseline (v{parent_v_num})</th>
                        <th>Cleaned (v{version_num})</th>
                        <th>Change</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>Missing Cells</td>
                        <td>{m1:,}</td>
                        <td>{m2:,}</td>
                        <td><strong style="color: {m_color};">{m_sign}{m_delta:,}</strong></td>
                    </tr>
                    <tr>
                        <td>Duplicate Rows</td>
                        <td>{d1:,}</td>
                        <td>{d2:,}</td>
                        <td><strong style="color: {d_color};">{d_sign}{d_delta:,}</strong></td>
                    </tr>
                </tbody>
            </table>

            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 1rem; margin-bottom: 1.5rem;">
                <div style="font-weight: 700; margin-bottom: 0.5rem; font-size: 0.9rem; color: #1e293b;">Findings Status Changes:</div>
                <ul style="padding-left: 1.25rem; margin: 0; font-size: 0.85rem; list-style-type: none;">
                    {resolved_html}
                    {new_html}
                </ul>
            </div>
            """
        else:
            comparison_html = f"""
            <div class="section-title">Before / After Version Comparison</div>
            <p style="color: #64748b; font-style: italic; background: #f8fafc; padding: 1rem; border-radius: 6px; border: 1px dashed #cbd5e1;">
                No prior version comparison available for this version. This is the initial upload baseline (v{version_num}). Subsequent cleaned versions will display automated score deltas, metric improvements, and resolved rule violations here.
            </p>
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

        {comparison_html}

        <div class="section-title">Applied Cleaning Lineage</div>
        {transforms_html}

        <div class="disclaimer-box">
            <strong>Audit Disclaimer:</strong> {report_data["disclaimer"]}<br><br>
            <strong>Spreadsheet Export Safety:</strong> When exporting CSVs in spreadsheet-safe mode, cells starting with formula-execution characters (<code>=</code>, <code>+</code>, <code>-</code>, <code>@</code>, tab, carriage return) that are not valid numeric values have a leading single quote (<code>'</code>) prepended to prevent formula injection / DDE command execution in spreadsheet software like Microsoft Excel, LibreOffice Calc, and Google Sheets.
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
        If a text cell begins with '=', '+', '-', '@', tab, or CR, prepend with single quote
        unless the cell is a valid numeric string (e.g. negative number like '-42').
        """
        if df.empty or len(df.columns) == 0:
            return df.copy()

        df_copy = df.copy()

        def sanitize_val(val: Any) -> Any:
            if not isinstance(val, str):
                return val
            stripped = val.lstrip()
            if not stripped:
                return val
            if stripped.startswith(FORMULA_PREFIXES):
                if stripped.startswith(('+', '-')):
                    try:
                        float(stripped)
                        return val  # Safe numeric string
                    except ValueError:
                        pass
                return f"'{val}"
            return val

        for col in df_copy.columns:
            if df_copy[col].dtype == object or pd.api.types.is_string_dtype(df_copy[col]):
                df_copy[col] = df_copy[col].apply(sanitize_val)
        return df_copy

    @staticmethod
    def _sanitize_filename(name: str) -> str:
        """Generate safe filesystem and URL attachment filename."""
        clean = re.sub(r'[^a-zA-Z0-9_\-]', '_', name.strip())
        return clean[:50] or "datalens_export"

export_service = ExportService()
