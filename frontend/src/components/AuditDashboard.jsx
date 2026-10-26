import React, { useState, useEffect, useCallback } from 'react';
import { runAudit, listAudits, getAudit, getDatasetProfile } from '../api/client';
import FindingDetailDrawer from './FindingDetailDrawer';
import CleaningPanel from './CleaningPanel';

export default function AuditDashboard({ dataset, onBack, onSwitchToProfile, onSwitchToPreview }) {
  const [audit, setAudit] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [runningAudit, setRunningAudit] = useState(false);
  const [error, setError] = useState(null);
  const [selectedFinding, setSelectedFinding] = useState(null);
  const [showCleaningPanel, setShowCleaningPanel] = useState(false);
  const [transformationSuccess, setTransformationSuccess] = useState(null);

  // Tab: 'findings' or 'columns'
  const [activeTab, setActiveTab] = useState('findings');

  // Filters
  const [severityFilter, setSeverityFilter] = useState('all');
  const [ruleFilter, setRuleFilter] = useState('all');
  const [columnFilter, setColumnFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [targetColumn, setTargetColumn] = useState('');

  // Fetch or trigger initial audit
  const loadAuditData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch profile to get dataset dimensions and column profile metrics
      const prof = await getDatasetProfile(dataset.id, dataset.current_version_id);
      setProfile(prof);

      // 2. Fetch existing audits
      const auditListRes = await listAudits(dataset.id, dataset.current_version_id);
      if (auditListRes.audits && auditListRes.audits.length > 0) {
        // Retrieve full details of the most recent audit
        const latestAuditId = auditListRes.audits[0].id;
        const fullAudit = await getAudit(dataset.id, latestAuditId);
        setAudit(fullAudit);
      } else {
        // No audit exists yet; automatically run an initial audit!
        setRunningAudit(true);
        const newAudit = await runAudit(dataset.id);
        setAudit(newAudit);
      }
    } catch (err) {
      setError(err.message || 'Failed to load audit data');
    } finally {
      setLoading(false);
      setRunningAudit(false);
    }
  }, [dataset.id, dataset.current_version_id]);

  useEffect(() => {
    loadAuditData();
  }, [loadAuditData]);

  const handleRunNewAudit = async () => {
    setRunningAudit(true);
    setError(null);
    try {
      const newAudit = await runAudit(dataset.id, targetColumn ? targetColumn : null);
      setAudit(newAudit);
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

  const datasetMetrics = profile?.dataset_metrics || {};
  const missingCells = datasetMetrics.missing_cells ?? 0;
  const missingPct = datasetMetrics.missing_percentage ?? 0.0;
  const duplicateRows = datasetMetrics.duplicate_rows ?? 0;
  const duplicatePct = datasetMetrics.duplicate_percentage ?? 0.0;

  // Filter findings
  const filteredFindings = findings.filter((f) => {
    if (severityFilter !== 'all' && f.severity.toLowerCase() !== severityFilter.toLowerCase()) {
      return false;
    }
    if (ruleFilter !== 'all' && f.rule_id !== ruleFilter) {
      return false;
    }
    if (columnFilter !== 'all' && f.column_name !== columnFilter) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = f.title.toLowerCase().includes(q);
      const matchDesc = f.description.toLowerCase().includes(q);
      const matchCol = f.column_name && f.column_name.toLowerCase().includes(q);
      if (!matchTitle && !matchDesc && !matchCol) return false;
    }
    return true;
  });

  const getScoreBadgeClass = (s) => {
    if (s === null) return '';
    if (s >= 85) return 'score-excellent';
    if (s >= 60) return 'score-good';
    return 'score-poor';
  };

  const handleFilterByColumnFromTable = (colName) => {
    setColumnFilter(colName);
    setActiveTab('findings');
  };

  const handleTransformationApplied = async (res) => {
    if (res.result_version_id) {
      dataset.current_version_id = res.result_version_id;
    }
    if (res.result_version) {
      dataset.row_count = res.result_version.row_count;
      dataset.column_count = res.result_version.column_count;
    }
    setTransformationSuccess(
      res.summary || 'Transformation successfully applied and new version created!'
    );
    setShowCleaningPanel(false);
    // Automatically re-run audit on the newly created version!
    await loadAuditData();
  };

  return (
    <div style={{ animation: 'fadeIn 0.2s ease-in' }}>
      {/* Header bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
            <button className="btn btn-outline" style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }} onClick={onBack}>
              &larr; Back to Datasets
            </button>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 700 }}>Audit Report: {dataset.name}</h1>
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Original file: <code>{dataset.original_filename}</code> &bull; Rows: {dataset.row_count.toLocaleString()} &bull; Columns: {dataset.column_count}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button
            className={`btn ${showCleaningPanel ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setShowCleaningPanel((prev) => !prev)}
            style={{ fontSize: '0.85rem', fontWeight: 600 }}
          >
            {showCleaningPanel ? 'Close Cleaning Panel' : 'Clean & Transform'}
          </button>
          {onSwitchToProfile && (
            <button className="btn btn-outline" onClick={onSwitchToProfile} style={{ fontSize: '0.85rem' }}>
              Full Profile Explorer
            </button>
          )}
          {onSwitchToPreview && (
            <button className="btn btn-outline" onClick={onSwitchToPreview} style={{ fontSize: '0.85rem' }}>
              Preview Rows
            </button>
          )}
        </div>
      </div>

      {transformationSuccess && (
        <div style={{ padding: '0.85rem 1.25rem', background: 'var(--success-bg)', border: '1px solid #bbf7d0', borderRadius: 'var(--radius-sm)', color: 'var(--success)', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', animation: 'fadeIn 0.2s ease-in' }}>
          <div>
            <strong>Success:</strong> {transformationSuccess}
          </div>
          <button className="btn btn-outline" style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }} onClick={() => setTransformationSuccess(null)}>
            Dismiss
          </button>
        </div>
      )}

      {showCleaningPanel && (
        <CleaningPanel
          dataset={dataset}
          profile={profile}
          onTransformationApplied={handleTransformationApplied}
          onClose={() => setShowCleaningPanel(false)}
        />
      )}

      {error && (
        <div style={{ padding: '1rem', background: 'var(--danger-bg)', border: '1px solid #fecaca', borderRadius: 'var(--radius-sm)', color: 'var(--danger)', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div><strong>Audit Error:</strong> {error}</div>
          <button className="btn btn-outline" style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }} onClick={loadAuditData}>Retry</button>
        </div>
      )}

      {loading ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <div style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-muted)' }}>
            Auditing dataset deterministically...
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-light)', marginTop: '0.5rem' }}>
            Running 8 deterministic quality checks (missingness, duplicates, constant columns, IQR outliers, type consistency, and class imbalance).
          </p>
        </div>
      ) : (
        <>
          {/* Top Audit Action & Score Section */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
            {/* Score & Breakdown Card */}
            <div className="card" style={{ marginBottom: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <span style={{ fontWeight: 700, fontSize: '1.05rem' }}>Quality Score</span>
                <span className="badge badge-info" style={{ fontSize: '0.75rem' }}>
                  Method v{audit?.score_method_version || '1.0'}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '1rem' }}>
                <div className={`score-badge ${getScoreBadgeClass(score)}`}>
                  <span>{score !== null ? Math.round(score) : '--'}</span>
                  <span style={{ fontSize: '0.65rem', fontWeight: 500, textTransform: 'uppercase' }}>/ 100</span>
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text-main)' }}>
                    {score >= 85 ? 'High Quality' : score >= 60 ? 'Moderate Quality Issues' : 'Severe Quality Defects'}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                    Total deductions: {summary?.total_penalty ? summary.total_penalty.toFixed(1) : '0.0'} pts
                  </div>
                </div>
              </div>

              {/* Deductions breakdown */}
              <div style={{ background: '#f8fafc', padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', fontSize: '0.8rem' }}>
                <div style={{ fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem', textTransform: 'uppercase', fontSize: '0.7rem' }}>
                  Penalty Breakdown
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.15rem 0' }}>
                  <span>Missingness burden:</span>
                  <strong style={{ color: penalties.missingness > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>
                    -{penalties.missingness ? penalties.missingness.toFixed(1) : '0.0'} pts
                  </strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.15rem 0' }}>
                  <span>Duplicate rows:</span>
                  <strong style={{ color: penalties.duplicates > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>
                    -{penalties.duplicates ? penalties.duplicates.toFixed(1) : '0.0'} pts
                  </strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.15rem 0' }}>
                  <span>Constant / zero-variance columns:</span>
                  <strong style={{ color: penalties.constant_columns > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>
                    -{penalties.constant_columns ? penalties.constant_columns.toFixed(1) : '0.0'} pts
                  </strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.15rem 0' }}>
                  <span>Type inconsistency burden:</span>
                  <strong style={{ color: penalties.type_inconsistency > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>
                    -{penalties.type_inconsistency ? penalties.type_inconsistency.toFixed(1) : '0.0'} pts
                  </strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.15rem 0' }}>
                  <span>Outliers & heuristic anomalies:</span>
                  <strong style={{ color: penalties.anomalies_and_heuristics > 0 ? 'var(--warning)' : 'var(--text-muted)' }}>
                    -{penalties.anomalies_and_heuristics ? penalties.anomalies_and_heuristics.toFixed(1) : '0.0'} pts
                  </strong>
                </div>
              </div>

              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.75rem', fontStyle: 'italic', lineHeight: 1.4 }}>
                {summary?.disclaimer || 'DataLens Quality Score is deterministic and covers implemented checks only.'}
              </div>
            </div>

            {/* Re-audit and Target Selector Card */}
            <div className="card" style={{ marginBottom: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: '0.75rem' }}>
                  Audit Execution Controls
                </div>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                  Re-evaluate quality rules against current version. Optionally designate a target column to detect class imbalance and feature leakage.
                </p>

                <div style={{ marginBottom: '1rem' }}>
                  <label htmlFor="target-col-select" style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                    Target Column (Optional)
                  </label>
                  <select
                    id="target-col-select"
                    value={targetColumn}
                    onChange={(e) => setTargetColumn(e.target.value)}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', fontSize: '0.85rem' }}
                  >
                    <option value="">-- None (General Profiling) --</option>
                    {profile?.columns?.map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.name} ({c.inferred_type})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <button
                  className="btn btn-primary"
                  style={{ width: '100%', padding: '0.65rem' }}
                  onClick={handleRunNewAudit}
                  disabled={runningAudit}
                >
                  {runningAudit ? 'Auditing in Progress...' : 'Run Audit'}
                </button>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: '0.5rem' }}>
                  Audit ran at: {audit?.created_at ? new Date(audit.created_at).toLocaleTimeString() : 'N/A'}
                </div>
              </div>
            </div>
          </div>

          {/* Finding & Metric KPI Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            <div className="card" style={{ padding: '1rem', textAlign: 'center', marginBottom: 0 }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>TOTAL FINDINGS</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.2rem' }}>{findings.length}</div>
            </div>
            <div className="card" style={{ padding: '1rem', textAlign: 'center', marginBottom: 0, borderLeft: '4px solid var(--danger)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--danger)', fontWeight: 600 }}>HIGH SEVERITY</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.2rem', color: 'var(--danger)' }}>
                {findingCounts.high || 0}
              </div>
            </div>
            <div className="card" style={{ padding: '1rem', textAlign: 'center', marginBottom: 0, borderLeft: '4px solid var(--warning)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--warning)', fontWeight: 600 }}>MEDIUM SEVERITY</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.2rem', color: 'var(--warning)' }}>
                {findingCounts.medium || 0}
              </div>
            </div>
            <div className="card" style={{ padding: '1rem', textAlign: 'center', marginBottom: 0, borderLeft: '4px solid var(--primary)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--primary)', fontWeight: 600 }}>LOW SEVERITY</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.2rem', color: 'var(--primary)' }}>
                {findingCounts.low || 0}
              </div>
            </div>
            <div className="card" style={{ padding: '1rem', textAlign: 'center', marginBottom: 0 }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>MISSING CELLS</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.2rem' }}>
                {missingPct.toFixed(1)}%
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {missingCells.toLocaleString()} cells
              </div>
            </div>
            <div className="card" style={{ padding: '1rem', textAlign: 'center', marginBottom: 0 }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>DUPLICATE ROWS</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.2rem' }}>
                {duplicateRows.toLocaleString()}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {duplicatePct.toFixed(1)}% of rows
              </div>
            </div>
          </div>

          {/* Section Tabs */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
            <button
              className={`btn ${activeTab === 'findings' ? 'btn-primary' : 'btn-outline'}`}
              style={{ padding: '0.4rem 1rem', fontSize: '0.85rem' }}
              onClick={() => setActiveTab('findings')}
            >
              Audit Findings ({filteredFindings.length})
            </button>
            <button
              className={`btn ${activeTab === 'columns' ? 'btn-primary' : 'btn-outline'}`}
              style={{ padding: '0.4rem 1rem', fontSize: '0.85rem' }}
              onClick={() => setActiveTab('columns')}
            >
              Column Profile Table ({profile?.columns?.length || 0})
            </button>
          </div>

          {activeTab === 'findings' && (
            <>
              {/* Findings Filter Bar */}
              <div className="card" style={{ padding: '1rem 1.25rem', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
                    {/* Severity Filter */}
                    <div>
                      <label htmlFor="filter-severity" style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginRight: '0.4rem' }}>
                        Severity:
                      </label>
                      <select
                        id="filter-severity"
                        value={severityFilter}
                        onChange={(e) => setSeverityFilter(e.target.value)}
                        style={{ padding: '0.35rem 0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', fontSize: '0.85rem' }}
                      >
                        <option value="all">All Severities</option>
                        <option value="high">High ({findingCounts.high || 0})</option>
                        <option value="medium">Medium ({findingCounts.medium || 0})</option>
                        <option value="low">Low ({findingCounts.low || 0})</option>
                      </select>
                    </div>

                    {/* Rule Filter */}
                    <div>
                      <label htmlFor="filter-rule" style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginRight: '0.4rem' }}>
                        Rule:
                      </label>
                      <select
                        id="filter-rule"
                        value={ruleFilter}
                        onChange={(e) => setRuleFilter(e.target.value)}
                        style={{ padding: '0.35rem 0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', fontSize: '0.85rem' }}
                      >
                        <option value="all">All Rules</option>
                        <option value="rule_missing_values">Missing Values</option>
                        <option value="rule_exact_duplicates">Exact Duplicates</option>
                        <option value="rule_constant_columns">Constant Columns</option>
                        <option value="rule_high_cardinality">High Cardinality</option>
                        <option value="rule_numeric_outliers">Numeric Outliers</option>
                        <option value="rule_type_consistency">Type Consistency</option>
                        <option value="rule_class_imbalance">Class Imbalance</option>
                        <option value="rule_potential_leakage">Potential Leakage</option>
                      </select>
                    </div>

                    {/* Column Filter */}
                    <div>
                      <label htmlFor="filter-column" style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginRight: '0.4rem' }}>
                        Column:
                      </label>
                      <select
                        id="filter-column"
                        value={columnFilter}
                        onChange={(e) => setColumnFilter(e.target.value)}
                        style={{ padding: '0.35rem 0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', fontSize: '0.85rem' }}
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

                  {/* Search Query */}
                  <div style={{ flex: '1', minWidth: '200px', maxWidth: '320px' }}>
                    <input
                      type="text"
                      placeholder="Search findings..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      aria-label="Search findings by keyword"
                      style={{ width: '100%', padding: '0.4rem 0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', fontSize: '0.85rem' }}
                    />
                  </div>
                </div>
              </div>

              {/* Findings List */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>
                    Audited Findings ({filteredFindings.length} of {findings.length})
                  </h2>
                  {(severityFilter !== 'all' || ruleFilter !== 'all' || columnFilter !== 'all' || searchQuery) && (
                    <button
                      className="btn btn-outline"
                      style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                      onClick={() => {
                        setSeverityFilter('all');
                        setRuleFilter('all');
                        setColumnFilter('all');
                        setSearchQuery('');
                      }}
                    >
                      Clear Filters
                    </button>
                  )}
                </div>

                {filteredFindings.length === 0 ? (
                  <div className="card" style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                    {findings.length === 0 ? (
                      <div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--success)' }}>
                          No quality issues detected!
                        </div>
                        <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>
                          All deterministic audit rules evaluated cleanly against this dataset version.
                        </p>
                      </div>
                    ) : (
                      <div>
                        <div style={{ fontSize: '1rem', fontWeight: 600 }}>No findings match your filter criteria</div>
                        <p style={{ fontSize: '0.85rem', marginTop: '0.35rem' }}>
                          Try selecting &quot;All Severities&quot; or clearing your search term.
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    {filteredFindings.map((finding) => (
                      <div
                        key={finding.id}
                        className={`finding-card severity-${finding.severity.toLowerCase()}`}
                        onClick={() => setSelectedFinding(finding)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            setSelectedFinding(finding);
                          }
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem', flexWrap: 'wrap' }}>
                              <span
                                className={`badge ${
                                  finding.severity === 'high'
                                    ? 'badge-high'
                                    : finding.severity === 'medium'
                                    ? 'badge-medium'
                                    : 'badge-low'
                                }`}
                              >
                                {finding.severity.toUpperCase()}
                              </span>
                              {finding.column_name && (
                                <span style={{ fontSize: '0.8rem', fontWeight: 600, background: '#f1f5f9', padding: '0.15rem 0.5rem', borderRadius: '4px' }}>
                                  Column: <code>{finding.column_name}</code>
                                </span>
                              )}
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                Rule: {finding.rule_id}
                              </span>
                            </div>
                            <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
                              {finding.title}
                            </h3>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.4, marginBottom: '0.5rem' }}>
                              {finding.description}
                            </p>
                            <div style={{ fontSize: '0.8rem', color: 'var(--primary)', fontWeight: 500 }}>
                              &rarr; {finding.recommendation}
                            </div>
                          </div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--primary)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                            Inspect &rarr;
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {activeTab === 'columns' && (
            <div className="card" style={{ padding: '1rem 1.25rem' }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.75rem' }}>
                Column Profile Table ({profile?.columns?.length || 0} columns)
              </h2>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
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
                                onClick={() => handleFilterByColumnFromTable(col.name)}
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
        </>
      )}

      {/* Finding Detail Drawer */}
      <FindingDetailDrawer
        finding={selectedFinding}
        onClose={() => setSelectedFinding(null)}
      />
    </div>
  );
}
