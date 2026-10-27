import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  runAudit,
  listAudits,
  getAudit,
  getDatasetProfile,
  listVersions,
  getExportCsvUrl,
  getExportReportUrl,
  getColabNotebookUrl,
  downloadFileFromUrl,
} from '../api/client';
import FindingDetailDrawer from './FindingDetailDrawer';
import CleaningPanel from './CleaningPanel';

export default function AuditDashboard({
  dataset,
  onBack,
  onSwitchToProfile,
  onSwitchToPreview,
  onSwitchToCompare,
  onSwitchToExport,
}) {
  const [versions, setVersions] = useState([]);
  const [selectedVersionId, setSelectedVersionId] = useState(dataset.current_version_id);
  const [audit, setAudit] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [runningAudit, setRunningAudit] = useState(false);
  const [error, setError] = useState(null);
  const [selectedFinding, setSelectedFinding] = useState(null);

  // Cleaning Panel state with pre-filled operation & column support
  const [showCleaningPanel, setShowCleaningPanel] = useState(false);
  const [cleaningInitialOp, setCleaningInitialOp] = useState('impute_median');
  const [cleaningInitialCol, setCleaningInitialCol] = useState('');
  const [transformationSuccess, setTransformationSuccess] = useState(null);

  // Export menu state
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exportError, setExportError] = useState(null);
  const [exporting, setExporting] = useState(false);

  // Overview collapsible panels
  const [showPenalties, setShowPenalties] = useState(false);
  const [showAdvancedControls, setShowAdvancedControls] = useState(false);

  // Findings view controls
  const [activeTab, setActiveTab] = useState('findings'); // 'findings' | 'columns'
  const [categoryFilter, setCategoryFilter] = useState('all'); // 'all' | 'defects' | 'heuristics'
  const [severityFilter, setSeverityFilter] = useState('all');
  const [ruleFilter, setRuleFilter] = useState('all');
  const [columnFilter, setColumnFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [targetColumn, setTargetColumn] = useState('');

  const handleDownload = async (url, defaultFilename = null) => {
    if (exporting) return;
    setExporting(true);
    setExportError(null);
    setShowExportMenu(false);
    try {
      await downloadFileFromUrl(url, defaultFilename);
    } catch (err) {
      setExportError(err.message || 'Export failed. Please check the requested file and try again.');
    } finally {
      setExporting(false);
    }
  };

  // Fetch or trigger audit for a specific version
  const loadAuditData = useCallback(
    async (vId = null) => {
      setLoading(true);
      setError(null);
      try {
        const vers = await listVersions(dataset.id);
        setVersions(vers);

        const targetVer = vId || selectedVersionId || dataset.current_version_id;

        // Fetch profile and audits in parallel for exact target version
        const [prof, auditListRes] = await Promise.all([
          getDatasetProfile(dataset.id, targetVer),
          listAudits(dataset.id, targetVer),
        ]);
        setProfile(prof);

        if (auditListRes.audits && auditListRes.audits.length > 0) {
          const latestAuditId = auditListRes.audits[0].id;
          const fullAudit = await getAudit(dataset.id, latestAuditId);
          setAudit(fullAudit);
        } else {
          setRunningAudit(true);
          const newAudit = await runAudit(dataset.id, { versionId: targetVer });
          setAudit(newAudit);
        }
      } catch (err) {
        setError(err.message || 'Failed to load audit data');
      } finally {
        setLoading(false);
        setRunningAudit(false);
      }
    },
    // Intentionally omit selectedVersionId from deps so callback identity is stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dataset.id, dataset.current_version_id]
  );

  useEffect(() => {
    loadAuditData(selectedVersionId);
  }, [loadAuditData, selectedVersionId]);

  const handleVersionChange = (newVId) => {
    setSelectedVersionId(newVId);
  };

  const handleRunNewAudit = async () => {
    if (runningAudit) return;
    setRunningAudit(true);
    setError(null);
    try {
      const newAudit = await runAudit(dataset.id, {
        targetColumn: targetColumn || null,
        versionId: selectedVersionId,
      });
      setAudit(newAudit);
      try {
        const prof = await getDatasetProfile(dataset.id, selectedVersionId);
        setProfile(prof);
      } catch {
        // Non-critical profile refresh error
      }
    } catch (err) {
      setError(err.message || 'Failed to execute audit run');
    } finally {
      setRunningAudit(false);
    }
  };

  const findings = audit?.findings || [];
  const summary = audit?.summary || {};
  const penalties = summary?.penalties || {};
  const findingCounts = summary?.finding_counts || { high: 0, medium: 0, low: 0 };
  const score = audit?.score !== null && audit?.score !== undefined ? audit.score : null;

  // Correctness: Compute missing cells from findings evidence as a safety fallback
  const missingFromFindings = findings
    .filter((f) => f.rule_id === 'rule_missing_values')
    .reduce((acc, f) => acc + (f.structured_evidence?.null_count ?? f.evidence?.null_count ?? 0), 0);

  // Correctness: Compute duplicate rows from findings evidence as a safety fallback
  const dupFinding = findings.find((f) => f.rule_id === 'rule_exact_duplicates');
  const dupFromFindings = dupFinding
    ? (dupFinding.structured_evidence?.duplicate_count ?? dupFinding.evidence?.duplicate_count ?? 0)
    : 0;

  // Resolve missing cells count (priority: active audit summary -> profile top-level -> profile dataset_metrics -> findings evidence)
  const missingCells =
    summary.missing_cells ??
    summary.total_missing_cells ??
    profile?.missing_cells ??
    profile?.dataset_metrics?.missing_cells ??
    missingFromFindings;

  const totalCells =
    summary.total_cells ??
    profile?.total_cells ??
    profile?.dataset_metrics?.total_cells ??
    (profile?.row_count && profile?.column_count ? profile.row_count * profile.column_count : null);

  const missingPct =
    summary.missing_percentage ??
    profile?.missing_percentage ??
    profile?.dataset_metrics?.missing_percentage ??
    (totalCells && totalCells > 0 ? (missingCells / totalCells) * 100.0 : 0.0);

  // Resolve duplicate rows count (priority: active audit summary -> profile top-level -> profile dataset_metrics -> findings evidence)
  const duplicateRows =
    summary.duplicate_rows ??
    summary.duplicate_rows_count ??
    profile?.duplicate_rows ??
    profile?.dataset_metrics?.duplicate_rows ??
    dupFromFindings;

  const totalRows =
    summary.row_count ??
    profile?.row_count ??
    profile?.dataset_metrics?.row_count ??
    dataset.row_count ??
    null;

  const duplicatePct =
    summary.duplicate_percentage ??
    profile?.duplicate_percentage ??
    profile?.dataset_metrics?.duplicate_percentage ??
    (totalRows && totalRows > 0 ? (duplicateRows / totalRows) * 100.0 : 0.0);

  const activeVerId = selectedVersionId || dataset.current_version_id;
  const activeVerObj = versions.find((v) => v.id === activeVerId);
  const currentVerNum = activeVerObj?.version_number || 1;

  // Helper to distinguish confirmed defects from heuristic observations
  const isConfirmedDefect = (finding) => {
    return [
      'rule_missing_values',
      'rule_exact_duplicates',
      'rule_constant_columns',
      'rule_type_consistency',
    ].includes(finding.rule_id);
  };

  const defectFindingsCount = useMemo(
    () => findings.filter((f) => isConfirmedDefect(f)).length,
    [findings]
  );
  const heuristicFindingsCount = useMemo(
    () => findings.filter((f) => !isConfirmedDefect(f)).length,
    [findings]
  );

  // Filter findings based on active category, severity, rule, column, and search query
  const filteredFindings = useMemo(() => {
    return findings.filter((f) => {
      // Category tab filter
      if (categoryFilter === 'defects' && !isConfirmedDefect(f)) return false;
      if (categoryFilter === 'heuristics' && isConfirmedDefect(f)) return false;

      // Severity filter
      if (severityFilter !== 'all' && f.severity.toLowerCase() !== severityFilter.toLowerCase()) {
        return false;
      }
      // Rule filter
      if (ruleFilter !== 'all' && f.rule_id !== ruleFilter) {
        return false;
      }
      // Column filter
      if (columnFilter !== 'all' && f.column_name !== columnFilter) {
        return false;
      }
      // Keyword search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = f.title.toLowerCase().includes(q);
        const matchDesc = f.description.toLowerCase().includes(q);
        const matchCol = f.column_name && f.column_name.toLowerCase().includes(q);
        if (!matchTitle && !matchDesc && !matchCol) return false;
      }
      return true;
    });
  }, [findings, categoryFilter, severityFilter, ruleFilter, columnFilter, searchQuery]);

  const getScoreBadgeClass = (s) => {
    if (s === null) return '';
    if (s >= 85) return 'score-excellent';
    if (s >= 60) return 'score-good';
    return 'score-poor';
  };

  const handleTransformationApplied = async (res) => {
    if (res.result_version_id) {
      dataset.current_version_id = res.result_version_id;
      setSelectedVersionId(res.result_version_id);
    }
    if (res.result_version) {
      dataset.row_count = res.result_version.row_count;
      dataset.column_count = res.result_version.column_count;
    }
    setTransformationSuccess(
      res.summary || 'Transformation successfully applied and new version created!'
    );
    setShowCleaningPanel(false);
    await loadAuditData(res.result_version_id);
  };

  // Open the cleaning panel pre-populated for a specific finding fix
  const handleOpenFix = (opType, colName) => {
    setCleaningInitialOp(opType);
    setCleaningInitialCol(colName || '');
    setShowCleaningPanel(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Inspect column by switching to Profile Explorer or filtering table
  const handleInspectColumn = (colName) => {
    if (onSwitchToProfile) {
      onSwitchToProfile(colName);
    } else {
      setColumnFilter(colName);
      setActiveTab('columns');
    }
  };

  // Format evidence summary snippet for cards
  const formatEvidenceSnippet = (finding) => {
    const ev = finding.structured_evidence || finding.evidence;
    if (!ev || typeof ev !== 'object') return null;

    const parts = [];
    if (ev.null_count !== undefined) {
      parts.push(`Null Cells: ${ev.null_count} (${ev.null_percentage || 0}%)`);
    }
    if (ev.duplicate_count !== undefined) {
      parts.push(`Duplicate Rows: ${ev.duplicate_count} (${ev.duplicate_percentage || 0}%)`);
    }
    if (ev.constant_value !== undefined) {
      parts.push(`Constant Value: "${ev.constant_value}"`);
    }
    if (ev.outlier_count !== undefined) {
      parts.push(`Outliers: ${ev.outlier_count} values [IQR Fences: ${ev.lower_fence} .. ${ev.upper_fence}]`);
    }
    if (ev.non_numeric_count !== undefined) {
      parts.push(`Non-Numeric Values: ${ev.non_numeric_count}`);
    }
    if (ev.cardinality_ratio !== undefined) {
      parts.push(`Unique Ratio: ${(ev.cardinality_ratio * 100).toFixed(1)}% (${ev.distinct_count} distinct)`);
    }
    if (ev.minority_percentage !== undefined) {
      parts.push(`Minority Class: ${ev.minority_percentage}%`);
    }
    if (ev.correlation !== undefined) {
      parts.push(`Correlation: ${ev.correlation}`);
    }

    return parts.length > 0 ? parts.join(' • ') : null;
  };

  return (
    <div style={{ animation: 'fadeIn 0.2s ease-in' }}>
      {/* Top Header Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.25rem',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
            <button
              className="btn btn-outline"
              style={{ padding: '0.3rem 0.65rem', fontSize: '0.825rem' }}
              onClick={onBack}
            >
              &larr; Back to Datasets
            </button>
            <h1 style={{ fontSize: '1.45rem', fontWeight: 800, margin: 0, color: 'var(--text-main)' }}>
              Audit Report: {dataset.name}
            </h1>
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Original file: <code>{dataset.original_filename}</code> &bull; Version {currentVerNum} &bull;{' '}
            {totalRows?.toLocaleString()} rows &times; {profile?.column_count || dataset.column_count} columns
          </div>
          {versions.length > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
              <label htmlFor="inspect-version-select" style={{ fontSize: '0.825rem', fontWeight: 600, color: '#475569' }}>
                Inspecting Version:
              </label>
              <select
                id="inspect-version-select"
                className="select-field"
                value={selectedVersionId}
                onChange={(e) => handleVersionChange(e.target.value)}
                disabled={runningAudit || loading}
                style={{
                  padding: '0.3rem 0.6rem',
                  fontSize: '0.825rem',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-card)',
                }}
              >
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    Version {v.version_number} ({v.row_count} rows, {v.column_count} cols)
                    {v.version_number === 1 ? ' [Initial Upload]' : ''}
                    {v.id === dataset.current_version_id ? ' [Latest]' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Global Action Toolbar */}
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            className={`btn ${showCleaningPanel ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setShowCleaningPanel((prev) => !prev)}
            style={{ fontSize: '0.85rem', fontWeight: 600 }}
          >
            {showCleaningPanel ? 'Close Cleaning Wizard' : '🧹 Cleaning Wizard'}
          </button>
          {onSwitchToProfile && (
            <button className="btn btn-outline" onClick={onSwitchToProfile} style={{ fontSize: '0.85rem' }}>
              Profile Explorer
            </button>
          )}
          {onSwitchToPreview && (
            <button className="btn btn-outline" onClick={onSwitchToPreview} style={{ fontSize: '0.85rem' }}>
              Preview Rows
            </button>
          )}
          {onSwitchToCompare && (
            <button className="btn btn-outline" onClick={onSwitchToCompare} style={{ fontSize: '0.85rem' }}>
              Compare Versions
            </button>
          )}

          {/* Export Dropdown */}
          <div style={{ position: 'relative' }}>
            <button
              className="btn btn-outline"
              onClick={() => setShowExportMenu((prev) => !prev)}
              style={{ fontSize: '0.85rem' }}
            >
              Export ▾
            </button>
            {showExportMenu && (
              <div
                className="card"
                style={{
                  position: 'absolute',
                  right: 0,
                  top: '115%',
                  width: '270px',
                  padding: '0.75rem',
                  zIndex: 50,
                  boxShadow: '0 10px 20px -3px rgba(0, 0, 0, 0.15)',
                  background: '#ffffff',
                }}
              >
                <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#64748b', marginBottom: '0.4rem', textTransform: 'uppercase' }}>
                  Dataset Version CSV
                </div>
                <button
                  className="btn btn-outline"
                  style={{ width: '100%', textAlign: 'left', marginBottom: '0.4rem', fontSize: '0.8rem', padding: '0.4rem 0.6rem' }}
                  onClick={() => {
                    const safeName = dataset?.name ? dataset.name.replace(/[^a-zA-Z0-9_\-]/g, '_') : 'datalens';
                    handleDownload(getExportCsvUrl(dataset.id, activeVerId, false), `${safeName}_v${currentVerNum}.csv`);
                  }}
                  disabled={exporting}
                >
                  📄 Standard CSV (v{currentVerNum})
                </button>
                <button
                  className="btn btn-outline"
                  style={{ width: '100%', textAlign: 'left', marginBottom: '0.75rem', fontSize: '0.8rem', padding: '0.4rem 0.6rem' }}
                  onClick={() => {
                    const safeName = dataset?.name ? dataset.name.replace(/[^a-zA-Z0-9_\-]/g, '_') : 'datalens';
                    handleDownload(getExportCsvUrl(dataset.id, activeVerId, true), `${safeName}_v${currentVerNum}_spreadsheet_safe.csv`);
                  }}
                  disabled={exporting}
                >
                  🛡️ Spreadsheet-Safe CSV (v{currentVerNum})
                </button>

                <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#64748b', marginBottom: '0.4rem', textTransform: 'uppercase', borderTop: '1px solid #e2e8f0', paddingTop: '0.5rem' }}>
                  Audit Report
                </div>
                <button
                  className="btn btn-outline"
                  style={{ width: '100%', textAlign: 'left', marginBottom: '0.4rem', fontSize: '0.8rem', padding: '0.4rem 0.6rem' }}
                  onClick={() => {
                    const safeName = dataset?.name ? dataset.name.replace(/[^a-zA-Z0-9_\-]/g, '_') : 'datalens';
                    handleDownload(getExportReportUrl(dataset.id, audit?.id, 'html', activeVerId), `${safeName}_v${currentVerNum}_audit_report.html`);
                  }}
                  disabled={!audit || exporting}
                >
                  📊 Standalone HTML Report
                </button>
                <button
                  className="btn btn-outline"
                  style={{ width: '100%', textAlign: 'left', fontSize: '0.8rem', padding: '0.4rem 0.6rem', marginBottom: '0.4rem' }}
                  onClick={() => {
                    const safeName = dataset?.name ? dataset.name.replace(/[^a-zA-Z0-9_\-]/g, '_') : 'datalens';
                    handleDownload(getExportReportUrl(dataset.id, audit?.id, 'json', activeVerId), `${safeName}_v${currentVerNum}_audit_report.json`);
                  }}
                  disabled={!audit || exporting}
                >
                  ⚙️ Machine JSON Report
                </button>

                <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#64748b', marginBottom: '0.4rem', textTransform: 'uppercase', borderTop: '1px solid #e2e8f0', paddingTop: '0.5rem' }}>
                  Google Colab Handoff
                </div>
                <button
                  className="btn btn-outline"
                  style={{ width: '100%', textAlign: 'left', fontSize: '0.8rem', padding: '0.4rem 0.6rem', color: '#b45309', borderColor: '#fde68a', background: '#fffdf5' }}
                  onClick={() => {
                    const safeName = dataset?.name ? dataset.name.replace(/[^a-zA-Z0-9_\-]/g, '_') : 'datalens';
                    handleDownload(getColabNotebookUrl(dataset.id, activeVerId), `${safeName}_v${currentVerNum}_colab_starter.ipynb`);
                  }}
                  disabled={exporting}
                >
                  📓 Starter Notebook (.ipynb)
                </button>

                {onSwitchToExport && (
                  <button
                    className="btn btn-outline"
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      fontSize: '0.8rem',
                      padding: '0.45rem 0.6rem',
                      marginTop: '0.5rem',
                      borderTop: '1px solid #e2e8f0',
                      color: 'var(--primary)',
                      fontWeight: 600,
                      backgroundColor: 'var(--primary-light)',
                    }}
                    onClick={() => {
                      setShowExportMenu(false);
                      onSwitchToExport();
                    }}
                  >
                    📦 Open Dedicated Export Center &rarr;
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Notifications */}
      {exportError && (
        <div style={{ padding: '0.85rem 1.25rem', background: 'var(--danger-bg)', border: '1px solid #fecaca', borderRadius: 'var(--radius-sm)', color: 'var(--danger)', marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div><strong>Export Error:</strong> {exportError}</div>
          <button className="btn btn-outline" style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }} onClick={() => setExportError(null)}>
            Dismiss
          </button>
        </div>
      )}

      {transformationSuccess && (
        <div style={{ padding: '0.85rem 1.25rem', background: 'var(--success-bg)', border: '1px solid #bbf7d0', borderRadius: 'var(--radius-sm)', color: 'var(--success)', marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div><strong>Transformation Applied:</strong> {transformationSuccess}</div>
          <button className="btn btn-outline" style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }} onClick={() => setTransformationSuccess(null)}>
            Dismiss
          </button>
        </div>
      )}

      {/* Embedded Cleaning Panel */}
      {showCleaningPanel && (
        <CleaningPanel
          dataset={dataset}
          profile={profile}
          audit={audit}
          onTransformationApplied={handleTransformationApplied}
          onClose={() => setShowCleaningPanel(false)}
          initialOperation={cleaningInitialOp}
          initialColumn={cleaningInitialCol}
          onNavigateToCompare={onSwitchToCompare}
        />
      )}

      {error && (
        <div style={{ padding: '1rem', background: 'var(--danger-bg)', border: '1px solid #fecaca', borderRadius: 'var(--radius-sm)', color: 'var(--danger)', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div><strong>Audit Error:</strong> {error}</div>
          <button className="btn btn-outline" style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }} onClick={() => loadAuditData()}>
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <div className="card" style={{ textAlign: 'center', padding: '3.5rem' }}>
          <div style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.35rem' }}>
            Auditing Dataset Deterministically...
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Evaluating 8 deterministic audit rules and calculating verified quality score for Version {currentVerNum}
          </p>
        </div>
      ) : (
        <>
          {/* =========================================================================
              SECTION A: AUDIT OVERVIEW
             ========================================================================= */}
          <section aria-labelledby="section-audit-overview" style={{ marginBottom: '2.5rem' }}>
            <div style={{ marginBottom: '0.75rem' }}>
              <h2 id="section-audit-overview" style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>
                Audit Overview
              </h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0.2rem 0 0' }}>
                High-level health metrics, verified quality score, and defect summary for Version {currentVerNum}
              </p>
            </div>

            {/* Quality Score & KPI Summary Banner */}
            <div
              className="card"
              style={{
                padding: '1.5rem',
                marginBottom: '1rem',
                background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
                border: '1px solid var(--border)',
              }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                  gap: '1.5rem',
                  alignItems: 'center',
                }}
              >
                {/* Quality Score Presentation */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                  <div className={`score-badge ${getScoreBadgeClass(score)}`} style={{ width: '96px', height: '96px', flexShrink: 0 }}>
                    <span style={{ fontSize: '2rem', lineHeight: 1 }}>{score !== null ? Math.round(score) : '--'}</span>
                    <span style={{ fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', color: 'inherit' }}>/ 100</span>
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                      <span style={{ fontWeight: 800, fontSize: '1.15rem', color: 'var(--text-main)' }}>
                        {score >= 85 ? 'High Quality' : score >= 60 ? 'Moderate Quality Issues' : 'Severe Quality Defects'}
                      </span>
                      <span className="badge badge-info" style={{ fontSize: '0.72rem' }}>
                        Method v{audit?.score_method_version || '1.0'}
                      </span>
                    </div>

                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                      Version {currentVerNum} &bull; Total deductions: <strong>{summary?.total_penalty ? summary.total_penalty.toFixed(1) : '0.0'} pts</strong>
                    </div>

                    {/* Disclaimer Requirement: Score covers implemented checks only */}
                    <div style={{ fontSize: '0.78rem', color: '#64748b', fontStyle: 'italic', lineHeight: 1.4, maxWidth: '520px' }}>
                      {summary?.disclaimer ||
                        'The DataLens quality score reflects implemented deterministic checks only and is not a universal correctness guarantee.'}
                    </div>
                  </div>
                </div>

                {/* Score Penalty Expandable Toggle */}
                <div style={{ textAlign: 'right' }}>
                  <button
                    className="btn btn-outline"
                    onClick={() => setShowPenalties((prev) => !prev)}
                    style={{ fontSize: '0.825rem', fontWeight: 600 }}
                  >
                    {showPenalties ? 'Hide Penalty Breakdown ▲' : `View Penalty Breakdown (-${summary?.total_penalty ? summary.total_penalty.toFixed(1) : '0.0'} pts) ▼`}
                  </button>
                </div>
              </div>

              {/* Secondary Expandable Penalty Breakdown Panel */}
              {showPenalties && (
                <div
                  style={{
                    marginTop: '1.25rem',
                    paddingTop: '1.25rem',
                    borderTop: '1px solid var(--border)',
                    animation: 'fadeIn 0.2s ease-in',
                  }}
                >
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.75rem' }}>
                    Transparent Penalty Deductions (Max 100 Points)
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                      gap: '0.75rem',
                      fontSize: '0.825rem',
                    }}
                  >
                    <div style={{ background: '#ffffff', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Missingness Burden</div>
                      <div style={{ fontWeight: 700, color: penalties.missingness > 0 ? 'var(--danger)' : 'var(--text-muted)', fontSize: '1rem' }}>
                        -{penalties.missingness ? penalties.missingness.toFixed(1) : '0.0'} pts
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Max 30 pts</div>
                    </div>

                    <div style={{ background: '#ffffff', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Duplicate Rows</div>
                      <div style={{ fontWeight: 700, color: penalties.duplicates > 0 ? 'var(--danger)' : 'var(--text-muted)', fontSize: '1rem' }}>
                        -{penalties.duplicates ? penalties.duplicates.toFixed(1) : '0.0'} pts
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Max 25 pts</div>
                    </div>

                    <div style={{ background: '#ffffff', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Constant Columns</div>
                      <div style={{ fontWeight: 700, color: penalties.constant_columns > 0 ? 'var(--danger)' : 'var(--text-muted)', fontSize: '1rem' }}>
                        -{penalties.constant_columns ? penalties.constant_columns.toFixed(1) : '0.0'} pts
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Max 20 pts</div>
                    </div>

                    <div style={{ background: '#ffffff', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Type Inconsistencies</div>
                      <div style={{ fontWeight: 700, color: penalties.type_inconsistency > 0 ? 'var(--danger)' : 'var(--text-muted)', fontSize: '1rem' }}>
                        -{penalties.type_inconsistency ? penalties.type_inconsistency.toFixed(1) : '0.0'} pts
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Max 15 pts</div>
                    </div>

                    <div style={{ background: '#ffffff', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Anomalies &amp; Outliers</div>
                      <div style={{ fontWeight: 700, color: penalties.anomalies_and_heuristics > 0 ? 'var(--warning)' : 'var(--text-muted)', fontSize: '1rem' }}>
                        -{penalties.anomalies_and_heuristics ? penalties.anomalies_and_heuristics.toFixed(1) : '0.0'} pts
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Max 10 pts</div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Core Metrics Summary KPI Cards (Strictly agreeing with audit summary & findings) */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
                gap: '0.75rem',
                marginBottom: '1rem',
              }}
            >
              {/* Total Findings */}
              <div className="card" style={{ margin: 0, padding: '1rem' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                  Total Findings
                </div>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-main)', margin: '0.15rem 0' }}>
                  {findings.length}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Across 8 deterministic rules
                </div>
              </div>

              {/* Missing Cells */}
              <div
                className="card"
                style={{
                  margin: 0,
                  padding: '1rem',
                  borderLeft: missingCells > 0 ? '4px solid var(--warning)' : '4px solid var(--success)',
                }}
              >
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                  Missing Cells
                </div>
                <div
                  style={{
                    fontSize: '1.6rem',
                    fontWeight: 800,
                    margin: '0.15rem 0',
                    color: missingCells > 0 ? 'var(--warning)' : 'var(--success)',
                  }}
                >
                  {missingCells.toLocaleString()}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {missingPct.toFixed(1)}% of all cells
                </div>
              </div>

              {/* Duplicate Rows */}
              <div
                className="card"
                style={{
                  margin: 0,
                  padding: '1rem',
                  borderLeft: duplicateRows > 0 ? '4px solid var(--danger)' : '4px solid var(--success)',
                }}
              >
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                  Duplicate Rows
                </div>
                <div
                  style={{
                    fontSize: '1.6rem',
                    fontWeight: 800,
                    margin: '0.15rem 0',
                    color: duplicateRows > 0 ? 'var(--danger)' : 'var(--success)',
                  }}
                >
                  {duplicateRows.toLocaleString()}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {duplicatePct.toFixed(1)}% of rows
                </div>
              </div>

              {/* Severity Breakdown: High */}
              <div className="card" style={{ margin: 0, padding: '1rem', borderLeft: '4px solid var(--danger)' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--danger)', fontWeight: 700, textTransform: 'uppercase' }}>
                  High Severity
                </div>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--danger)', margin: '0.15rem 0' }}>
                  {findingCounts.high || 0}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Requires urgent remediation</div>
              </div>

              {/* Severity Breakdown: Medium */}
              <div className="card" style={{ margin: 0, padding: '1rem', borderLeft: '4px solid var(--warning)' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--warning)', fontWeight: 700, textTransform: 'uppercase' }}>
                  Medium Severity
                </div>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--warning)', margin: '0.15rem 0' }}>
                  {findingCounts.medium || 0}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Actionable data anomalies</div>
              </div>

              {/* Severity Breakdown: Low */}
              <div className="card" style={{ margin: 0, padding: '1rem', borderLeft: '4px solid var(--primary)' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--primary)', fontWeight: 700, textTransform: 'uppercase' }}>
                  Low Severity
                </div>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--primary)', margin: '0.15rem 0' }}>
                  {findingCounts.low || 0}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Heuristics &amp; minor notes</div>
              </div>
            </div>

            {/* Secondary Collapsible Area: Advanced Audit Configuration & Controls */}
            <div className="card" style={{ margin: 0, padding: '1rem 1.25rem', background: '#f8fafc', border: '1px solid var(--border)' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
                onClick={() => setShowAdvancedControls((prev) => !prev)}
              >
                <div>
                  <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-main)' }}>
                    ⚙️ Advanced Audit Execution Controls
                  </span>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>
                    Optional target column configuration &amp; re-auditing
                  </span>
                </div>
                <span style={{ fontSize: '0.8rem', color: 'var(--primary)', fontWeight: 600 }}>
                  {showAdvancedControls ? 'Hide Controls ▲' : 'Configure & Re-Audit ▼'}
                </span>
              </div>

              {showAdvancedControls && (
                <div
                  style={{
                    marginTop: '1rem',
                    paddingTop: '1rem',
                    borderTop: '1px solid var(--border)',
                    animation: 'fadeIn 0.2s ease-in',
                  }}
                >
                  <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)', marginBottom: '0.75rem', lineHeight: 1.5 }}>
                    Optionally designate a target column to evaluate class imbalance and statistical feature leakage heuristics against Version {currentVerNum}.
                  </p>

                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 240px' }}>
                      <label htmlFor="audit-target-col" style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.3rem' }}>
                        Target Column (Optional)
                      </label>
                      <select
                        id="audit-target-col"
                        value={targetColumn}
                        onChange={(e) => setTargetColumn(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.45rem 0.6rem',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--border)',
                          fontSize: '0.825rem',
                          background: '#ffffff',
                        }}
                      >
                        <option value="">-- None (General Profiling) --</option>
                        {profile?.columns?.map((c) => (
                          <option key={c.name} value={c.name}>
                            {c.name} ({c.inferred_type})
                          </option>
                        ))}
                      </select>
                    </div>

                    <button
                      className="btn btn-primary"
                      style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                      onClick={handleRunNewAudit}
                      disabled={runningAudit}
                    >
                      {runningAudit ? 'Auditing in Progress...' : `Re-Run Audit on Version ${currentVerNum}`}
                    </button>
                  </div>

                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.65rem' }}>
                    Last audit completed at: {audit?.created_at ? new Date(audit.created_at).toLocaleString() : 'N/A'}
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* =========================================================================
              SECTION B: ACTIONABLE FINDINGS
             ========================================================================= */}
          <section aria-labelledby="section-actionable-findings">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <h2 id="section-actionable-findings" style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>
                  Actionable Findings
                </h2>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0.2rem 0 0' }}>
                  Confirmed quality defects and heuristic observations with one-click preview actions
                </p>
              </div>

              {/* View Switcher Tabs */}
              <div style={{ display: 'flex', gap: '0.35rem' }}>
                <button
                  className={`btn ${activeTab === 'findings' ? 'btn-primary' : 'btn-outline'}`}
                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.825rem' }}
                  onClick={() => setActiveTab('findings')}
                >
                  Findings List ({findings.length})
                </button>
                <button
                  className={`btn ${activeTab === 'columns' ? 'btn-primary' : 'btn-outline'}`}
                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.825rem' }}
                  onClick={() => setActiveTab('columns')}
                >
                  Column Profile Table ({profile?.columns?.length || 0})
                </button>
              </div>
            </div>

            {activeTab === 'findings' && (
              <>
                {/* Category Segmentation Tabs & Filters */}
                <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
                  {/* Category Segmentation Tabs */}
                  <div
                    style={{
                      display: 'flex',
                      gap: '0.5rem',
                      marginBottom: '0.85rem',
                      paddingBottom: '0.85rem',
                      borderBottom: '1px solid var(--border)',
                      flexWrap: 'wrap',
                    }}
                  >
                    <button
                      className={`btn ${categoryFilter === 'all' ? 'btn-primary' : 'btn-outline'}`}
                      style={{ padding: '0.35rem 0.75rem', fontSize: '0.825rem' }}
                      onClick={() => setCategoryFilter('all')}
                    >
                      All Findings ({findings.length})
                    </button>
                    <button
                      className={`btn ${categoryFilter === 'defects' ? 'btn-primary' : 'btn-outline'}`}
                      style={{
                        padding: '0.35rem 0.75rem',
                        fontSize: '0.825rem',
                        borderColor: categoryFilter === 'defects' ? undefined : '#fecaca',
                        color: categoryFilter === 'defects' ? undefined : '#b91c1c',
                      }}
                      onClick={() => setCategoryFilter('defects')}
                    >
                      🚨 Confirmed Quality Defects ({defectFindingsCount})
                    </button>
                    <button
                      className={`btn ${categoryFilter === 'heuristics' ? 'btn-primary' : 'btn-outline'}`}
                      style={{
                        padding: '0.35rem 0.75rem',
                        fontSize: '0.825rem',
                        borderColor: categoryFilter === 'heuristics' ? undefined : '#bfdbfe',
                        color: categoryFilter === 'heuristics' ? undefined : '#1d4ed8',
                      }}
                      onClick={() => setCategoryFilter('heuristics')}
                    >
                      🔍 Heuristic Observations ({heuristicFindingsCount})
                    </button>
                  </div>

                  {/* Multi-Filter Bar: Severity, Rule, Column, Search */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.65rem', alignItems: 'center' }}>
                      {/* Severity */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem' }}>
                        <label htmlFor="findings-severity-select" style={{ fontWeight: 600, color: 'var(--text-muted)' }}>
                          Severity:
                        </label>
                        <select
                          id="findings-severity-select"
                          value={severityFilter}
                          onChange={(e) => setSeverityFilter(e.target.value)}
                          style={{
                            padding: '0.35rem 0.55rem',
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--border)',
                            fontSize: '0.825rem',
                            background: '#ffffff',
                          }}
                        >
                          <option value="all">All ({findings.length})</option>
                          <option value="high">High ({findingCounts.high || 0})</option>
                          <option value="medium">Medium ({findingCounts.medium || 0})</option>
                          <option value="low">Low ({findingCounts.low || 0})</option>
                        </select>
                      </div>

                      {/* Rule */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem' }}>
                        <label htmlFor="findings-rule-select" style={{ fontWeight: 600, color: 'var(--text-muted)' }}>
                          Rule:
                        </label>
                        <select
                          id="findings-rule-select"
                          value={ruleFilter}
                          onChange={(e) => setRuleFilter(e.target.value)}
                          style={{
                            padding: '0.35rem 0.55rem',
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--border)',
                            fontSize: '0.825rem',
                            background: '#ffffff',
                          }}
                        >
                          <option value="all">All Rules</option>
                          <option value="rule_missing_values">Missing Values</option>
                          <option value="rule_exact_duplicates">Exact Duplicates</option>
                          <option value="rule_constant_columns">Constant Columns</option>
                          <option value="rule_type_consistency">Type Consistency</option>
                          <option value="rule_numeric_outliers">Numeric Outliers</option>
                          <option value="rule_high_cardinality">High Cardinality</option>
                          <option value="rule_class_imbalance">Class Imbalance</option>
                          <option value="rule_potential_leakage">Potential Leakage</option>
                        </select>
                      </div>

                      {/* Column */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem' }}>
                        <label htmlFor="findings-col-select" style={{ fontWeight: 600, color: 'var(--text-muted)' }}>
                          Column:
                        </label>
                        <select
                          id="findings-col-select"
                          value={columnFilter}
                          onChange={(e) => setColumnFilter(e.target.value)}
                          style={{
                            padding: '0.35rem 0.55rem',
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--border)',
                            fontSize: '0.825rem',
                            background: '#ffffff',
                          }}
                        >
                          <option value="all">All Columns</option>
                          {profile?.columns?.map((c) => (
                            <option key={c.name} value={c.name}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Search Bar & Reset */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: '1 1 200px', maxWidth: '300px' }}>
                      <input
                        type="text"
                        placeholder="Search findings..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.35rem 0.65rem',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--border)',
                          fontSize: '0.825rem',
                        }}
                      />
                      {(severityFilter !== 'all' || ruleFilter !== 'all' || columnFilter !== 'all' || searchQuery || categoryFilter !== 'all') && (
                        <button
                          className="btn btn-outline"
                          style={{ padding: '0.35rem 0.55rem', fontSize: '0.75rem', whiteSpace: 'nowrap' }}
                          onClick={() => {
                            setCategoryFilter('all');
                            setSeverityFilter('all');
                            setRuleFilter('all');
                            setColumnFilter('all');
                            setSearchQuery('');
                          }}
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Findings List View */}
                <div>
                  {filteredFindings.length === 0 ? (
                    <div className="card" style={{ textAlign: 'center', padding: '3rem 2rem', color: 'var(--text-muted)' }}>
                      {findings.length === 0 ? (
                        <div>
                          <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--success)', marginBottom: '0.35rem' }}>
                            ✓ No Quality Issues Detected!
                          </div>
                          <p style={{ fontSize: '0.875rem' }}>
                            All 8 deterministic audit rules evaluated cleanly against Version {currentVerNum}.
                          </p>
                        </div>
                      ) : (
                        <div>
                          <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.35rem' }}>
                            No findings match your active filters
                          </div>
                          <p style={{ fontSize: '0.85rem', marginBottom: '1rem' }}>
                            Try adjusting your severity, rule, column, or category selection.
                          </p>
                          <button
                            className="btn btn-outline"
                            onClick={() => {
                              setCategoryFilter('all');
                              setSeverityFilter('all');
                              setRuleFilter('all');
                              setColumnFilter('all');
                              setSearchQuery('');
                            }}
                          >
                            Reset All Filters
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                      {filteredFindings.map((finding) => {
                        const isDefect = isConfirmedDefect(finding);
                        const evidenceSnippet = formatEvidenceSnippet(finding);

                        // Determine available fix action for this finding
                        let fixAction = null;
                        if (finding.rule_id === 'rule_missing_values') {
                          const colProf = profile?.columns?.find((c) => c.name === finding.column_name);
                          const isNum = colProf?.inferred_type === 'numeric';
                          fixAction = {
                            type: isNum ? 'impute_median' : 'impute_mode',
                            label: isNum ? 'Preview Fix (Impute Median)' : 'Preview Fix (Impute Mode)',
                            column: finding.column_name,
                          };
                        } else if (finding.rule_id === 'rule_exact_duplicates') {
                          fixAction = {
                            type: 'remove_duplicates',
                            label: 'Preview Fix (Remove Duplicates)',
                            column: null,
                          };
                        } else if (finding.rule_id === 'rule_constant_columns') {
                          fixAction = {
                            type: 'drop_constant_column',
                            label: 'Preview Fix (Drop Column)',
                            column: finding.column_name,
                          };
                        }

                        return (
                          <div
                            key={finding.id}
                            className={`finding-card severity-${finding.severity.toLowerCase()}`}
                            style={{
                              margin: 0,
                              background: '#ffffff',
                              border: '1px solid var(--border)',
                              borderLeft: `5px solid ${
                                finding.severity === 'high'
                                  ? 'var(--danger)'
                                  : finding.severity === 'medium'
                                  ? 'var(--warning)'
                                  : 'var(--primary)'
                              }`,
                            }}
                          >
                            {/* Card Header: Badges & Tags */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.4rem', flexWrap: 'wrap' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                {/* Severity */}
                                <span
                                  className={`badge ${
                                    finding.severity === 'high'
                                      ? 'badge-high'
                                      : finding.severity === 'medium'
                                      ? 'badge-medium'
                                      : 'badge-low'
                                  }`}
                                  style={{ fontSize: '0.75rem' }}
                                >
                                  {finding.severity.toUpperCase()}
                                </span>

                                {/* Classification: Confirmed Defect vs Heuristic */}
                                {isDefect ? (
                                  <span
                                    className="badge"
                                    style={{
                                      fontSize: '0.72rem',
                                      background: '#fee2e2',
                                      color: '#991b1b',
                                      border: '1px solid #fecaca',
                                      fontWeight: 600,
                                    }}
                                  >
                                    Confirmed Defect
                                  </span>
                                ) : (
                                  <span
                                    className="badge"
                                    style={{
                                      fontSize: '0.72rem',
                                      background: '#eff6ff',
                                      color: '#1d4ed8',
                                      border: '1px solid #bfdbfe',
                                      fontWeight: 600,
                                    }}
                                  >
                                    Heuristic Observation
                                  </span>
                                )}

                                {/* Affected Column */}
                                {finding.column_name && (
                                  <span style={{ fontSize: '0.78rem', background: 'var(--bg-main)', padding: '0.15rem 0.45rem', borderRadius: '4px', border: '1px solid var(--border)' }}>
                                    Column: <strong><code>{finding.column_name}</code></strong>
                                  </span>
                                )}

                                {/* Rule ID */}
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                  Rule: <code>{finding.rule_id}</code>
                                </span>
                              </div>
                            </div>

                            {/* Title */}
                            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.35rem' }}>
                              {finding.title}
                            </h3>

                            {/* Short Explanation */}
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-main)', lineHeight: 1.5, marginBottom: '0.65rem' }}>
                              {finding.description}
                            </p>

                            {/* Structured Evidence Highlight */}
                            {evidenceSnippet && (
                              <div
                                style={{
                                  fontSize: '0.78rem',
                                  color: '#334155',
                                  background: 'var(--bg-main)',
                                  padding: '0.4rem 0.65rem',
                                  borderRadius: 'var(--radius-sm)',
                                  border: '1px solid var(--border)',
                                  marginBottom: '0.65rem',
                                  fontFamily: 'var(--font-mono)',
                                }}
                              >
                                <strong>Evidence:</strong> {evidenceSnippet}
                              </div>
                            )}

                            {/* Actionable Recommendation */}
                            <div style={{ fontSize: '0.825rem', color: 'var(--primary)', fontWeight: 500, marginBottom: '0.85rem' }}>
                              &rarr; {finding.recommendation}
                            </div>

                            {/* Interactive Action Buttons */}
                            <div
                              style={{
                                display: 'flex',
                                gap: '0.5rem',
                                alignItems: 'center',
                                flexWrap: 'wrap',
                                paddingTop: '0.65rem',
                                borderTop: '1px solid var(--border)',
                              }}
                            >
                              {/* 1. Fix Action (if supported by cleaner) */}
                              {fixAction && (
                                <button
                                  className="btn btn-primary"
                                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', fontWeight: 600 }}
                                  onClick={() => handleOpenFix(fixAction.type, fixAction.column)}
                                >
                                  {fixAction.label}
                                </button>
                              )}

                              {/* 2. Inspect Column in Profile */}
                              {finding.column_name && (
                                <button
                                  className="btn btn-outline"
                                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                                  onClick={() => handleInspectColumn(finding.column_name)}
                                >
                                  Inspect Column
                                </button>
                              )}

                              {/* 3. View Affected Rows */}
                              {onSwitchToPreview && (
                                <button
                                  className="btn btn-outline"
                                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                                  onClick={onSwitchToPreview}
                                >
                                  View Rows
                                </button>
                              )}

                              {/* 4. Full Detail Drawer */}
                              <button
                                className="btn btn-outline"
                                style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', marginLeft: 'auto' }}
                                onClick={() => setSelectedFinding(finding)}
                              >
                                View Details &rarr;
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Column Profile Table View */}
            {activeTab === 'columns' && (
              <div className="card" style={{ padding: '1rem 1.25rem', marginTop: '1rem' }}>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '0.75rem' }}>
                  Column Profile Breakdown ({profile?.columns?.length || 0} columns)
                </h3>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--border)', background: 'var(--bg-main)' }}>
                        <th style={{ padding: '0.65rem 0.75rem', fontWeight: 600 }}>Column Name</th>
                        <th style={{ padding: '0.65rem 0.75rem', fontWeight: 600 }}>Inferred Type</th>
                        <th style={{ padding: '0.65rem 0.75rem', fontWeight: 600 }}>Missing Cells</th>
                        <th style={{ padding: '0.65rem 0.75rem', fontWeight: 600 }}>Distinct Values</th>
                        <th style={{ padding: '0.65rem 0.75rem', fontWeight: 600 }}>Associated Findings</th>
                        <th style={{ padding: '0.65rem 0.75rem', fontWeight: 600, textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {profile?.columns?.map((col) => {
                        const colFindings = findings.filter((f) => f.column_name === col.name);
                        const hasHigh = colFindings.some((f) => f.severity === 'high');
                        const hasMed = colFindings.some((f) => f.severity === 'medium');

                        return (
                          <tr key={col.name} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '0.65rem 0.75rem', fontWeight: 600 }}>
                              <code>{col.name}</code>
                            </td>
                            <td style={{ padding: '0.65rem 0.75rem' }}>
                              <span className="badge badge-info" style={{ fontSize: '0.75rem' }}>
                                {col.inferred_type}
                              </span>
                            </td>
                            <td style={{ padding: '0.65rem 0.75rem' }}>
                              {col.null_count > 0 ? (
                                <span style={{ color: col.null_percentage >= 20 ? 'var(--danger)' : 'var(--warning)', fontWeight: 600 }}>
                                  {col.null_count} ({col.null_percentage}%)
                                </span>
                              ) : (
                                <span style={{ color: 'var(--success)', fontWeight: 500 }}>0 (0%)</span>
                              )}
                            </td>
                            <td style={{ padding: '0.65rem 0.75rem' }}>
                              {col.distinct_count.toLocaleString()}
                            </td>
                            <td style={{ padding: '0.65rem 0.75rem' }}>
                              {colFindings.length > 0 ? (
                                <span className={`badge ${hasHigh ? 'badge-high' : hasMed ? 'badge-medium' : 'badge-low'}`}>
                                  {colFindings.length} {colFindings.length === 1 ? 'issue' : 'issues'}
                                </span>
                              ) : (
                                <span className="badge badge-success">Clean</span>
                              )}
                            </td>
                            <td style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>
                              {colFindings.length > 0 ? (
                                <button
                                  className="btn btn-outline"
                                  style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
                                  onClick={() => {
                                    setColumnFilter(col.name);
                                    setActiveTab('findings');
                                  }}
                                >
                                  View Issues &rarr;
                                </button>
                              ) : (
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No issues</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        </>
      )}

      {/* Slide-Out Finding Detail Drawer */}
      <FindingDetailDrawer
        finding={selectedFinding}
        onClose={() => setSelectedFinding(null)}
      />
    </div>
  );
}
