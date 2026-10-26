import React, { useState, useEffect } from 'react';
import {
  compareVersions,
  getVersionHistory,
  listVersions,
  runAudit,
} from '../api/client';

export default function CompareView({ datasetId, onBackToAudit, onBackToDatasets }) {
  const [history, setHistory] = useState(null);
  const [versions, setVersions] = useState([]);
  const [v1Id, setV1Id] = useState('');
  const [v2Id, setV2Id] = useState('');
  const [comparison, setComparison] = useState(null);
  const [loading, setLoading] = useState(true);
  const [comparing, setComparing] = useState(false);
  const [reAuditing, setReAuditing] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('resolved'); // 'resolved', 'unresolved', 'new'

  useEffect(() => {
    loadHistoryAndVersions();
  }, [datasetId]);

  const loadHistoryAndVersions = async () => {
    setLoading(true);
    setError(null);
    try {
      const [histData, versData] = await Promise.all([
        getVersionHistory(datasetId),
        listVersions(datasetId),
      ]);
      setHistory(histData);
      setVersions(versData);

      if (versData.length > 0) {
        // Default baseline: v1 (first version)
        const baseline = versData[0].id;
        // Default comparison: latest version
        const latest = versData[versData.length - 1].id;
        setV1Id(baseline);
        setV2Id(latest);
        await performComparison(baseline, latest);
      }
    } catch (err) {
      setError(err.message || 'Failed to load version history');
    } finally {
      setLoading(false);
    }
  };

  const performComparison = async (baselineId, comparisonId) => {
    setComparing(true);
    setError(null);
    try {
      const data = await compareVersions(datasetId, baselineId, comparisonId);
      setComparison(data);
    } catch (err) {
      setError(err.message || 'Failed to compare versions');
    } finally {
      setComparing(false);
    }
  };

  const handleBaselineChange = (e) => {
    const newV1 = e.target.value;
    setV1Id(newV1);
    performComparison(newV1, v2Id);
  };

  const handleComparisonChange = (e) => {
    const newV2 = e.target.value;
    setV2Id(newV2);
    performComparison(v1Id, newV2);
  };

  const handleSwap = () => {
    const temp = v1Id;
    setV1Id(v2Id);
    setV2Id(temp);
    performComparison(v2Id, temp);
  };

  const handleReAudit = async (targetVersionId) => {
    setReAuditing(true);
    setError(null);
    try {
      await runAudit(datasetId, targetVersionId);
      await performComparison(v1Id, v2Id);
      const histData = await getVersionHistory(datasetId);
      setHistory(histData);
    } catch (err) {
      setError(err.message || 'Failed to re-run audit');
    } finally {
      setReAuditing(false);
    }
  };

  const formatDelta = (val, suffix = '', reverseBetter = false) => {
    if (val === null || val === undefined) return '—';
    const num = Number(val);
    if (num === 0) return `0${suffix}`;
    const sign = num > 0 ? '+' : '';
    const isPositiveChange = reverseBetter ? num < 0 : num > 0;
    const colorClass = isPositiveChange ? 'text-success' : 'text-danger';
    return (
      <span className={colorClass} style={{ fontWeight: '600' }}>
        {sign}{num}{suffix}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="card text-center" style={{ padding: '3rem' }}>
        <p>Loading version history and audit comparisons...</p>
      </div>
    );
  }

  const scoreComp = comparison?.score_comparison;
  const metrics = comparison?.metrics || {};
  const findingsDiff = comparison?.findings_diff;
  const colChanges = comparison?.column_changes;
  const transformations = comparison?.transformations || [];

  return (
    <div className="compare-view">
      {/* Top Navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <button className="btn btn-outline" onClick={onBackToAudit} style={{ marginRight: '0.75rem' }}>
            ← Back to Audit Dashboard
          </button>
          <button className="btn btn-outline" onClick={onBackToDatasets}>
            All Datasets
          </button>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.875rem', color: '#64748b' }}>Versions available: <strong>{versions.length}</strong></span>
          <button
            className="btn btn-outline"
            onClick={() => handleReAudit(v2Id)}
            disabled={reAuditing || comparing}
            style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem' }}
          >
            {reAuditing ? 'Auditing...' : '↻ Re-Audit Selected'}
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger" style={{ marginBottom: '1.5rem' }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Version Selector Bar */}
      <div className="card" style={{ marginBottom: '1.5rem', padding: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ flex: '1 1 240px' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', color: '#475569', marginBottom: '0.35rem' }}>
              Baseline Version (V1)
            </label>
            <select
              className="select-field"
              value={v1Id}
              onChange={handleBaselineChange}
              disabled={comparing}
              style={{ width: '100%' }}
            >
              {versions.map((v) => (
                <option key={`v1-${v.id}`} value={v.id}>
                  Version {v.version_number} ({v.row_count} rows, {v.column_count} cols)
                  {v.version_number === 1 ? ' [Initial Upload]' : ''}
                </option>
              ))}
            </select>
          </div>

          <button
            className="btn btn-outline"
            onClick={handleSwap}
            disabled={comparing || versions.length < 2}
            title="Swap baseline and comparison versions"
            style={{ alignSelf: 'flex-end', height: '38px', padding: '0 0.8rem' }}
          >
            ⇄ Swap
          </button>

          <div style={{ flex: '1 1 240px' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', color: '#475569', marginBottom: '0.35rem' }}>
              Comparison Version (V2)
            </label>
            <select
              className="select-field"
              value={v2Id}
              onChange={handleComparisonChange}
              disabled={comparing}
              style={{ width: '100%' }}
            >
              {versions.map((v) => (
                <option key={`v2-${v.id}`} value={v.id}>
                  Version {v.version_number} ({v.row_count} rows, {v.column_count} cols)
                  {v.id === history?.current_version_id ? ' [Latest / Cleaned]' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {comparing && (
        <div className="card text-center" style={{ padding: '2rem', marginBottom: '1.5rem' }}>
          <p>Computing deterministic version comparison and metric deltas...</p>
        </div>
      )}

      {comparison && !comparing && (
        <>
          {/* Quality Score Comparison Card */}
          <div className="card" style={{ marginBottom: '1.5rem', padding: '1.5rem' }}>
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.2rem', color: '#0f172a' }}>
              Quality Score Comparison
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', alignItems: 'center' }}>
              <div style={{ textAlign: 'center', padding: '1rem', background: '#f8fafc', borderRadius: '8px' }}>
                <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '0.25rem' }}>Baseline Score (V{comparison.v1.version_number})</div>
                <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#1e293b' }}>
                  {scoreComp?.v1_score !== null ? `${scoreComp.v1_score}` : 'N/A'}
                  <span style={{ fontSize: '1rem', color: '#94a3b8' }}>/100</span>
                </div>
              </div>

              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '0.25rem' }}>Score Delta</div>
                <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>
                  {formatDelta(scoreComp?.delta, ' pts')}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                  {scoreComp?.delta > 0 ? 'Quality Improved' : scoreComp?.delta < 0 ? 'Quality Regressed' : 'No Change'}
                </div>
              </div>

              <div style={{ textAlign: 'center', padding: '1rem', background: '#f8fafc', borderRadius: '8px' }}>
                <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '0.25rem' }}>Comparison Score (V{comparison.v2.version_number})</div>
                <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#0284c7' }}>
                  {scoreComp?.v2_score !== null ? `${scoreComp.v2_score}` : 'N/A'}
                  <span style={{ fontSize: '1rem', color: '#94a3b8' }}>/100</span>
                </div>
              </div>
            </div>

            {/* Penalties Breakdown Comparison */}
            {scoreComp?.penalties_v1 && scoreComp?.penalties_v2 && (
              <div style={{ marginTop: '1.5rem', overflowX: 'auto' }}>
                <table className="data-table" style={{ width: '100%', fontSize: '0.85rem' }}>
                  <thead>
                    <tr>
                      <th>Deduction Dimension</th>
                      <th style={{ textAlign: 'right' }}>V{comparison.v1.version_number} Penalty</th>
                      <th style={{ textAlign: 'right' }}>V{comparison.v2.version_number} Penalty</th>
                      <th style={{ textAlign: 'right' }}>Net Reduction</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.keys({ ...scoreComp.penalties_v1, ...scoreComp.penalties_v2 }).map((key) => {
                      const p1 = scoreComp.penalties_v1[key] || 0;
                      const p2 = scoreComp.penalties_v2[key] || 0;
                      const reduction = p1 - p2;
                      return (
                        <tr key={key}>
                          <td style={{ textTransform: 'capitalize' }}>{key.replace(/_/g, ' ')}</td>
                          <td style={{ textAlign: 'right' }}>-{p1.toFixed(1)} pts</td>
                          <td style={{ textAlign: 'right' }}>-{p2.toFixed(1)} pts</td>
                          <td style={{ textAlign: 'right' }}>
                            {reduction > 0 ? (
                              <span style={{ color: '#10b981', fontWeight: 'bold' }}>+{reduction.toFixed(1)} pts saved</span>
                            ) : reduction < 0 ? (
                              <span style={{ color: '#ef4444', fontWeight: 'bold' }}>{reduction.toFixed(1)} pts</span>
                            ) : (
                              '0.0 pts'
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: '#64748b' }}>
              {scoreComp?.method_note}
            </div>
          </div>

          {/* Key Metrics Grid */}
          <div className="card" style={{ marginBottom: '1.5rem', padding: '1.5rem' }}>
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', color: '#0f172a' }}>
              Summary Metric Deltas
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '1rem' }}>
              <div className="kpi-card">
                <div className="kpi-title">Row Count</div>
                <div className="kpi-value">{metrics.row_count?.v2_value}</div>
                <div className="kpi-subtitle">
                  from {metrics.row_count?.v1_value} ({formatDelta(metrics.row_count?.delta)})
                </div>
              </div>

              <div className="kpi-card">
                <div className="kpi-title">Column Count</div>
                <div className="kpi-value">{metrics.column_count?.v2_value}</div>
                <div className="kpi-subtitle">
                  from {metrics.column_count?.v1_value} ({formatDelta(metrics.column_count?.delta)})
                </div>
              </div>

              <div className="kpi-card">
                <div className="kpi-title">Missing Cells</div>
                <div className="kpi-value" style={{ color: metrics.missing_cells?.v2_value === 0 ? '#10b981' : '#f59e0b' }}>
                  {metrics.missing_cells?.v2_value}
                </div>
                <div className="kpi-subtitle">
                  from {metrics.missing_cells?.v1_value} ({formatDelta(metrics.missing_cells?.delta, '', true)})
                </div>
              </div>

              <div className="kpi-card">
                <div className="kpi-title">Duplicate Rows</div>
                <div className="kpi-value" style={{ color: metrics.duplicate_rows?.v2_value === 0 ? '#10b981' : '#f59e0b' }}>
                  {metrics.duplicate_rows?.v2_value}
                </div>
                <div className="kpi-subtitle">
                  from {metrics.duplicate_rows?.v1_value} ({formatDelta(metrics.duplicate_rows?.delta, '', true)})
                </div>
              </div>

              <div className="kpi-card">
                <div className="kpi-title">High Severity Issues</div>
                <div className="kpi-value" style={{ color: metrics.high_severity_findings?.v2_value === 0 ? '#10b981' : '#ef4444' }}>
                  {metrics.high_severity_findings?.v2_value}
                </div>
                <div className="kpi-subtitle">
                  from {metrics.high_severity_findings?.v1_value} ({formatDelta(metrics.high_severity_findings?.delta, '', true)})
                </div>
              </div>

              <div className="kpi-card">
                <div className="kpi-title">Total Findings</div>
                <div className="kpi-value">{metrics.total_findings?.v2_value}</div>
                <div className="kpi-subtitle">
                  from {metrics.total_findings?.v1_value} ({formatDelta(metrics.total_findings?.delta, '', true)})
                </div>
              </div>
            </div>
          </div>

          {/* Column Structure Changes */}
          {colChanges && (colChanges.added.length > 0 || colChanges.removed.length > 0) && (
            <div className="card" style={{ marginBottom: '1.5rem', padding: '1.25rem' }}>
              <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem', color: '#1e293b' }}>Schema & Column Modifications</h4>
              <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', fontSize: '0.85rem' }}>
                {colChanges.removed.length > 0 && (
                  <div>
                    <span style={{ fontWeight: 'bold', color: '#ef4444' }}>Dropped Columns ({colChanges.removed.length}): </span>
                    {colChanges.removed.map((c) => (
                      <span key={c} className="badge badge-danger" style={{ marginRight: '0.4rem' }}>{c}</span>
                    ))}
                  </div>
                )}
                {colChanges.added.length > 0 && (
                  <div>
                    <span style={{ fontWeight: 'bold', color: '#10b981' }}>Added Columns ({colChanges.added.length}): </span>
                    {colChanges.added.map((c) => (
                      <span key={c} className="badge badge-success" style={{ marginRight: '0.4rem' }}>{c}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Findings Diff Breakdown */}
          <div className="card" style={{ marginBottom: '1.5rem', padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a' }}>
                Findings Transition
              </h3>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  className={`btn ${activeTab === 'resolved' ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => setActiveTab('resolved')}
                  style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
                >
                  ✓ Resolved ({findingsDiff?.resolved_count || 0})
                </button>
                <button
                  className={`btn ${activeTab === 'unresolved' ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => setActiveTab('unresolved')}
                  style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
                >
                  ⚠ Unresolved ({findingsDiff?.unresolved_count || 0})
                </button>
                <button
                  className={`btn ${activeTab === 'new' ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => setActiveTab('new')}
                  style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
                >
                  + New ({findingsDiff?.new_count || 0})
                </button>
              </div>
            </div>

            {/* Tab Contents */}
            {activeTab === 'resolved' && (
              <div>
                {findingsDiff?.resolved.length === 0 ? (
                  <p style={{ color: '#64748b', fontStyle: 'italic', margin: '1rem 0' }}>
                    No findings were resolved between these two versions.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {findingsDiff.resolved.map((f) => (
                      <div key={f.id} style={{ padding: '0.85rem', border: '1px solid #bbf7d0', background: '#f0fdf4', borderRadius: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                          <span className="badge badge-success" style={{ fontSize: '0.75rem' }}>Resolved</span>
                          <span className={`badge badge-${f.severity}`} style={{ fontSize: '0.75rem' }}>{f.severity}</span>
                          {f.column_name && <span className="badge badge-outline" style={{ fontSize: '0.75rem' }}>Col: {f.column_name}</span>}
                          <strong style={{ fontSize: '0.9rem', color: '#166534' }}>{f.title}</strong>
                        </div>
                        <p style={{ margin: '0.25rem 0', fontSize: '0.85rem', color: '#374151' }}>{f.description}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'unresolved' && (
              <div>
                {findingsDiff?.unresolved.length === 0 ? (
                  <p style={{ color: '#10b981', fontStyle: 'italic', margin: '1rem 0' }}>
                    ✓ All baseline quality issues have been resolved!
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {findingsDiff.unresolved.map((f) => (
                      <div key={f.id} style={{ padding: '0.85rem', border: '1px solid #fed7aa', background: '#fffbeb', borderRadius: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                          <span className={`badge badge-${f.severity}`} style={{ fontSize: '0.75rem' }}>{f.severity}</span>
                          {f.column_name && <span className="badge badge-outline" style={{ fontSize: '0.75rem' }}>Col: {f.column_name}</span>}
                          <strong style={{ fontSize: '0.9rem', color: '#9a3412' }}>{f.title}</strong>
                        </div>
                        <p style={{ margin: '0.25rem 0', fontSize: '0.85rem', color: '#374151' }}>{f.description}</p>
                        <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '0.25rem' }}>
                          <strong>Recommendation:</strong> {f.recommendation}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'new' && (
              <div>
                {findingsDiff?.new.length === 0 ? (
                  <p style={{ color: '#64748b', fontStyle: 'italic', margin: '1rem 0' }}>
                    No new findings were introduced by the transformations.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {findingsDiff.new.map((f) => (
                      <div key={f.id} style={{ padding: '0.85rem', border: '1px solid #bfdbfe', background: '#eff6ff', borderRadius: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                          <span className="badge badge-info" style={{ fontSize: '0.75rem' }}>New Issue</span>
                          <span className={`badge badge-${f.severity}`} style={{ fontSize: '0.75rem' }}>{f.severity}</span>
                          {f.column_name && <span className="badge badge-outline" style={{ fontSize: '0.75rem' }}>Col: {f.column_name}</span>}
                          <strong style={{ fontSize: '0.9rem', color: '#1e40af' }}>{f.title}</strong>
                        </div>
                        <p style={{ margin: '0.25rem 0', fontSize: '0.85rem', color: '#374151' }}>{f.description}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Transformation Timeline */}
          {transformations.length > 0 && (
            <div className="card" style={{ marginBottom: '1.5rem', padding: '1.5rem' }}>
              <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', color: '#0f172a' }}>
                Applied Transformation Lineage
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {transformations.map((t, index) => (
                  <div
                    key={t.id || index}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.75rem 1rem',
                      background: '#f8fafc',
                      borderRadius: '6px',
                      borderLeft: '4px solid #0284c7',
                      fontSize: '0.85rem',
                      flexWrap: 'wrap',
                      gap: '0.5rem',
                    }}
                  >
                    <div>
                      <strong style={{ color: '#0f172a' }}>Step {index + 1}: {t.operation_type.replace(/_/g, ' ').toUpperCase()}</strong>
                      {t.column_name && <span> on column <code>{t.column_name}</code></span>}
                      <div style={{ color: '#64748b', fontSize: '0.75rem' }}>
                        Affected {t.rows_affected} row(s), {t.cells_affected} cell(s)
                      </div>
                    </div>
                    <div style={{ color: '#94a3b8', fontSize: '0.75rem' }}>
                      {new Date(t.created_at).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Disclaimer Banner */}
          <div className="alert alert-info" style={{ fontSize: '0.8rem', lineHeight: '1.4' }}>
            {comparison.disclaimer}
          </div>
        </>
      )}
    </div>
  );
}
