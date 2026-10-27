import React, { useState, useEffect, useMemo } from 'react';
import { useStore } from 'react-redux';
import { getDatasetProfile, listAudits, getAudit } from '../api/client';
import { useAppDispatch } from '../store/index.js';
import {
  selectProfileByVersion,
  selectAuditByVersion,
  setCachedProfile,
  setCachedAudit,
} from '../store/datasetsSlice.js';

export default function ProfileView({
  dataset,
  initialColumnName = null,
  onColumnChange,
  onBack,
  onBackToAudit,
  onNavigateToCompare,
}) {
  const store = useStore();
  const dispatch = useAppDispatch();
  const activeVer = dataset?.current_version_id;

  const cachedProfile = selectProfileByVersion(store.getState(), activeVer);
  const cachedAudit = selectAuditByVersion(store.getState(), activeVer);

  const [profile, setProfile] = useState(cachedProfile || null);
  const [audit, setAudit] = useState(cachedAudit || null);
  const [loading, setLoading] = useState(!cachedProfile);
  const [error, setError] = useState(null);

  // Active view mode: 'detail' (master-detail single column EDA) or 'table' (all columns summary)
  const [viewMode, setViewMode] = useState('detail');

  // Column selection & filtering state
  const initialCol = useMemo(() => {
    if (initialColumnName) return initialColumnName;
    if (cachedProfile?.columns?.length > 0) return cachedProfile.columns[0].name;
    return '';
  }, [initialColumnName, cachedProfile]);

  const [selectedColName, setSelectedColName] = useState(initialCol);
  const [typeFilter, setTypeFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOption, setSortOption] = useState('index'); // 'index' | 'name' | 'nulls' | 'findings'

  const handleSelectColumn = (colName) => {
    setSelectedColName(colName);
    if (onColumnChange) {
      onColumnChange(colName);
    }
  };

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      if (!dataset) return;

      const state = store.getState();
      const existingProf = selectProfileByVersion(state, dataset.current_version_id);
      const existingAud = selectAuditByVersion(state, dataset.current_version_id);

      if (existingProf) {
        if (!profile) setProfile(existingProf);
        if (existingAud && !audit) setAudit(existingAud);
        setLoading(false);

        if (existingProf.columns && existingProf.columns.length > 0 && !selectedColName) {
          const match = initialColumnName
            ? existingProf.columns.find((c) => c.name === initialColumnName)
            : null;
          const chosenName = match ? match.name : existingProf.columns[0].name;
          setSelectedColName(chosenName);
          if (onColumnChange && chosenName !== initialColumnName) {
            onColumnChange(chosenName);
          }
        }
        return;
      }

      setLoading(true);
      setError(null);
      try {
        // Fetch profile
        const profileData = await getDatasetProfile(dataset.id, dataset.current_version_id);
        if (!isMounted) return;
        setProfile(profileData);
        dispatch(setCachedProfile({ versionId: dataset.current_version_id, profile: profileData }));

        // Auto-select first column if no initial column or not found
        if (profileData.columns && profileData.columns.length > 0) {
          const match = initialColumnName
            ? profileData.columns.find((c) => c.name === initialColumnName)
            : null;
          const chosenName = match ? match.name : profileData.columns[0].name;
          setSelectedColName(chosenName);
          if (onColumnChange && chosenName !== initialColumnName) {
            onColumnChange(chosenName);
          }
        }

        // Fetch latest audit findings in parallel for finding integration
        try {
          const audits = await listAudits(dataset.id, dataset.current_version_id);
          if (audits && audits.length > 0) {
            const auditDetail = await getAudit(dataset.id, audits[0].id);
            if (isMounted) {
              setAudit(auditDetail);
              dispatch(setCachedAudit({ versionId: dataset.current_version_id, audit: auditDetail }));
            }
          }
        } catch (_) {
          // Audit findings are optional enrichment
        }
      } catch (err) {
        if (isMounted) setError(err.message || 'Failed to load statistical profile');
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadData();
    return () => {
      isMounted = false;
    };
  }, [dataset?.id, dataset?.current_version_id, initialColumnName, dispatch, store]);

  // Map of column_name -> list of findings
  const columnFindingsMap = useMemo(() => {
    const map = {};
    if (audit?.findings) {
      audit.findings.forEach((finding) => {
        const col = finding.column_name;
        if (col) {
          if (!map[col]) map[col] = [];
          map[col].push(finding);
        }
      });
    }
    return map;
  }, [audit]);

  const columns = profile?.columns || [];

  // Filter and sort available columns
  const filteredColumns = useMemo(() => {
    return columns
      .filter((col) => {
        const matchesType = typeFilter === 'all' || col.inferred_type === typeFilter;
        const matchesSearch = col.name.toLowerCase().includes(searchTerm.toLowerCase().trim());
        return matchesType && matchesSearch;
      })
      .sort((a, b) => {
        if (sortOption === 'name') return a.name.localeCompare(b.name);
        if (sortOption === 'nulls') return (b.null_count || 0) - (a.null_count || 0);
        if (sortOption === 'findings') {
          const countA = (columnFindingsMap[a.name] || []).length;
          const countB = (columnFindingsMap[b.name] || []).length;
          return countB - countA;
        }
        return 0; // default index order
      });
  }, [columns, typeFilter, searchTerm, sortOption, columnFindingsMap]);

  // Current selected column object
  const selectedColumn = useMemo(() => {
    if (!selectedColName && columns.length > 0) return columns[0];
    return columns.find((c) => c.name === selectedColName) || columns[0] || null;
  }, [columns, selectedColName]);

  // Selected column index and navigation
  const currentIndex = columns.findIndex((c) => c.name === selectedColumn?.name);
  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < columns.length - 1;

  const handleSelectPrevious = () => {
    if (hasPrevious) handleSelectColumn(columns[currentIndex - 1].name);
  };

  const handleSelectNext = () => {
    if (hasNext) handleSelectColumn(columns[currentIndex + 1].name);
  };

  if (loading) {
    return (
      <div className="card" style={{ padding: '3.5rem 2rem', textAlign: 'center', animation: 'fadeIn 0.2s ease-in' }}>
        <div style={{ width: '40px', height: '40px', border: '3px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 1.25rem' }} />
        <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-main)' }}>
          Computing Statistical Profile &amp; Visual EDA...
        </h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', maxWidth: '500px', margin: '0 auto' }}>
          Generating distributions, quartiles, category frequencies, null counts, and cross-referencing audit findings.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card" style={{ padding: '2rem', background: 'var(--danger-bg)', border: '1px solid #fecaca', animation: 'fadeIn 0.2s ease-in' }}>
        <h3 style={{ color: 'var(--danger)', marginBottom: '0.5rem', fontWeight: 700 }}>Profile Generation Failed</h3>
        <p style={{ color: 'var(--danger)', marginBottom: '1.25rem', fontSize: '0.9rem' }}>{error}</p>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="btn btn-outline" onClick={() => window.location.reload()}>
            Retry
          </button>
          <button className="btn btn-outline" onClick={onBack}>
            Back to Datasets
          </button>
        </div>
      </div>
    );
  }

  if (!profile) return null;

  const totalRows = profile.row_count || 0;
  const selectedFindings = selectedColumn ? (columnFindingsMap[selectedColumn.name] || []) : [];

  // -------------------------------------------------------------
  // Visual Exploration: Numeric Histogram Chart
  // -------------------------------------------------------------
  const renderNumericHistogram = (numStats) => {
    const rawBins = numStats?.histogram || [];
    if (!rawBins || rawBins.length === 0) {
      return (
        <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--bg-main)', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem' }}>
          Insufficient data variance to render distribution histogram.
        </div>
      );
    }

    const maxCount = Math.max(...rawBins.map((b) => b.count), 1);
    const validCount = totalRows - (selectedColumn.null_count || 0);

    return (
      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '1.25rem', marginBottom: '1.5rem', boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <h4 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>
              Value Distribution Histogram
            </h4>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {rawBins.length} data-derived bins &bull; {validCount} valid observations
              {selectedColumn.null_count > 0 && ` (excludes ${selectedColumn.null_count} nulls)`}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            <span><strong style={{ color: 'var(--primary)' }}>Q1:</strong> {numStats.q25}</span>
            <span><strong style={{ color: 'var(--primary)' }}>Median:</strong> {numStats.median}</span>
            <span><strong style={{ color: 'var(--primary)' }}>Q3:</strong> {numStats.q75}</span>
            <span><strong style={{ color: '#d97706' }}>Mean:</strong> {numStats.mean}</span>
          </div>
        </div>

        {/* SVG Histogram Graphic */}
        <div style={{ width: '100%', overflowX: 'auto' }}>
          <svg
            viewBox="0 0 540 180"
            style={{ width: '100%', height: '180px', display: 'block', overflow: 'visible' }}
          >
            {/* Grid scale lines */}
            {[0, 0.5, 1].map((pct, i) => {
              const y = 140 - pct * 110;
              const label = Math.round(maxCount * pct);
              return (
                <g key={i}>
                  <line x1="45" y1={y} x2="520" y2={y} stroke="#e2e8f0" strokeDasharray="3 3" />
                  <text x="40" y={y + 3} textAnchor="end" fontSize="10" fill="#94a3b8">
                    {label}
                  </text>
                </g>
              );
            })}

            {/* X-axis baseline */}
            <line x1="45" y1="140" x2="520" y2="140" stroke="var(--border)" strokeWidth="1.5" />

            {/* Histogram Bars */}
            {rawBins.map((bin, i) => {
              const barWidth = Math.max(12, (475 / rawBins.length) - 6);
              const x = 50 + i * (475 / rawBins.length);
              const barHeight = (bin.count / maxCount) * 110;
              const y = 140 - barHeight;
              const pct = validCount > 0 ? ((bin.count / validCount) * 100).toFixed(1) : 0;

              return (
                <g key={i} className="hist-bar-group" style={{ cursor: 'pointer' }}>
                  <title>{`Range: [${bin.bin_start} - ${bin.bin_end})\nCount: ${bin.count} (${pct}%)`}</title>
                  {/* Bar */}
                  <rect
                    x={x}
                    y={y}
                    width={barWidth}
                    height={Math.max(barHeight, 2)}
                    fill={bin.count > 0 ? 'var(--primary)' : '#e2e8f0'}
                    rx="3"
                    style={{ transition: 'fill 0.15s ease' }}
                  />
                  {/* Count label above bar */}
                  {bin.count > 0 && (
                    <text
                      x={x + barWidth / 2}
                      y={y - 5}
                      textAnchor="middle"
                      fontSize="9"
                      fontWeight="600"
                      fill="var(--text-main)"
                    >
                      {bin.count}
                    </text>
                  )}
                  {/* X-axis bin start label */}
                  <text
                    x={x + barWidth / 2}
                    y="155"
                    textAnchor="middle"
                    fontSize="9"
                    fill="var(--text-muted)"
                    fontFamily="monospace"
                  >
                    {bin.bin_start}
                  </text>
                </g>
              );
            })}

            {/* End tick label */}
            <text
              x="520"
              y="155"
              textAnchor="middle"
              fontSize="9"
              fill="var(--text-muted)"
              fontFamily="monospace"
            >
              {rawBins[rawBins.length - 1].bin_end}
            </text>
          </svg>
        </div>

        {/* Five-Number Summary / Quartile Box Line */}
        <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.6rem', textTransform: 'uppercase' }}>
            Five-Number Summary Scale
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.5rem', textAlign: 'center' }}>
            <div style={{ background: 'var(--bg-main)', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>MINIMUM</div>
              <div style={{ fontSize: '0.95rem', fontWeight: 700 }}>{numStats.min}</div>
            </div>
            <div style={{ background: 'var(--primary-light)', padding: '0.5rem', borderRadius: '4px', border: '1px solid #bfdbfe' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--primary)', fontWeight: 600 }}>25% (Q1)</div>
              <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--primary)' }}>{numStats.q25}</div>
            </div>
            <div style={{ background: 'var(--primary-light)', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--primary)' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--primary)', fontWeight: 700 }}>MEDIAN (Q2)</div>
              <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--primary)' }}>{numStats.median}</div>
            </div>
            <div style={{ background: 'var(--primary-light)', padding: '0.5rem', borderRadius: '4px', border: '1px solid #bfdbfe' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--primary)', fontWeight: 600 }}>75% (Q3)</div>
              <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--primary)' }}>{numStats.q75}</div>
            </div>
            <div style={{ background: 'var(--bg-main)', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>MAXIMUM</div>
              <div style={{ fontSize: '0.95rem', fontWeight: 700 }}>{numStats.max}</div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // -------------------------------------------------------------
  // Visual Exploration: Categorical / Boolean Frequency Chart
  // -------------------------------------------------------------
  const renderCategoricalChart = (catStats) => {
    const topValues = catStats?.top_values || [];
    const validCount = totalRows - (selectedColumn.null_count || 0);
    const isIdentifier = catStats?.unique_ratio > 0.8 && catStats?.distinct_count > 15;

    if (isIdentifier) {
      return (
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '1.25rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--warning)', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '1.1rem' }}>⚠️</span>
            <strong style={{ fontSize: '0.95rem' }}>High Cardinality / Identifier Column</strong>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0 0 0.75rem 0' }}>
            This column exhibits a high distinctness ratio ({Math.round(catStats.unique_ratio * 100)}% unique values across {catStats.distinct_count} categories).
            Frequency distribution charts are suppressed for surrogate keys or unique IDs to prevent visual distortion.
          </p>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Top sample values: {topValues.map((v) => `"${v.value}"`).join(', ')}
          </div>
        </div>
      );
    }

    if (topValues.length === 0) {
      return (
        <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--bg-main)', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem' }}>
          No category frequency data available.
        </div>
      );
    }

    return (
      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '1.25rem', marginBottom: '1.5rem', boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <h4 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>
              Category Frequency Breakdown
            </h4>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Top {topValues.length} categories &bull; {catStats.distinct_count} total distinct values
            </span>
          </div>
          {selectedColumn.null_count > 0 && (
            <span className="badge badge-warning" style={{ fontSize: '0.75rem' }}>
              Includes {selectedColumn.null_count} null cells ({selectedColumn.null_percentage}%)
            </span>
          )}
        </div>

        {/* Horizontal Bars */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
          {topValues.map((item, idx) => {
            const pct = item.percentage;
            return (
              <div key={idx}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.82rem', marginBottom: '0.2rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', maxWidth: '70%', overflow: 'hidden' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', width: '20px' }}>#{idx + 1}</span>
                    <code style={{ fontWeight: 600, color: 'var(--text-main)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                      {item.value === '' ? '(empty string)' : item.value}
                    </code>
                  </div>
                  <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                    {item.count.toLocaleString()} <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '0.75rem' }}>({pct}%)</span>
                  </div>
                </div>
                <div style={{ background: 'var(--bg-main)', height: '10px', borderRadius: '5px', overflow: 'hidden', border: '1px solid var(--border)' }}>
                  <div
                    style={{
                      width: `${pct}%`,
                      background: idx === 0 ? 'var(--primary)' : '#60a5fa',
                      height: '100%',
                      borderRadius: '4px',
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>
              </div>
            );
          })}

          {/* Missing values bar if present */}
          {selectedColumn.null_count > 0 && (
            <div style={{ marginTop: '0.25rem', paddingTop: '0.5rem', borderTop: '1px dashed var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.82rem', marginBottom: '0.2rem' }}>
                <span style={{ fontWeight: 600, color: 'var(--danger)' }}>
                  &lt;Missing / Null&gt;
                </span>
                <span style={{ fontWeight: 600, color: 'var(--danger)' }}>
                  {selectedColumn.null_count} <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '0.75rem' }}>({selectedColumn.null_percentage}%)</span>
                </span>
              </div>
              <div style={{ background: 'var(--bg-main)', height: '10px', borderRadius: '5px', overflow: 'hidden', border: '1px solid #fecaca' }}>
                <div
                  style={{
                    width: `${selectedColumn.null_percentage}%`,
                    background: 'var(--danger)',
                    height: '100%',
                    borderRadius: '4px',
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // -------------------------------------------------------------
  // Visual Exploration: Datetime Timeline Chart
  // -------------------------------------------------------------
  const renderDatetimeTimeline = (dtStats) => {
    const timeline = dtStats?.timeline || [];

    return (
      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '1.25rem', marginBottom: '1.5rem', boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <h4 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>
              Chronological Distribution Timeline
            </h4>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Earliest: <strong>{dtStats.min_date || 'N/A'}</strong> &rarr; Latest: <strong>{dtStats.max_date || 'N/A'}</strong>
            </span>
          </div>
          {dtStats.invalid_date_count > 0 && (
            <span className="badge badge-warning" style={{ fontSize: '0.75rem' }}>
              {dtStats.invalid_date_count} invalid date string(s)
            </span>
          )}
        </div>

        {timeline.length > 0 ? (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${timeline.length}, 1fr)`, gap: '0.4rem', height: '120px', alignItems: 'flex-end', padding: '0.5rem 0', borderBottom: '1px solid var(--border)' }}>
              {timeline.map((pt, i) => {
                const max = Math.max(...timeline.map((t) => t.count), 1);
                const heightPct = Math.max((pt.count / max) * 100, 5);
                return (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                    <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.2rem' }}>
                      {pt.count}
                    </span>
                    <div
                      style={{
                        width: '80%',
                        height: `${heightPct}%`,
                        background: 'var(--primary)',
                        borderRadius: '3px 3px 0 0',
                      }}
                      title={`${pt.period}: ${pt.count}`}
                    />
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${timeline.length}, 1fr)`, gap: '0.4rem', marginTop: '0.35rem', textAlign: 'center' }}>
              {timeline.map((pt, i) => (
                <span key={i} style={{ fontSize: '0.7rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {pt.period}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Single point in time or insufficient date series data.
          </div>
        )}
      </div>
    );
  };

  // -------------------------------------------------------------
  // Render Selected Column Detail Pane
  // -------------------------------------------------------------
  const renderColumnDetailPane = () => {
    if (!selectedColumn) {
      return (
        <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          Please select a column from the list to view its statistical profile.
        </div>
      );
    }

    const col = selectedColumn;
    const isNumeric = col.inferred_type === 'numeric';
    const isCategorical = col.inferred_type === 'categorical' || col.inferred_type === 'boolean' || col.inferred_type === 'text';
    const isDatetime = col.inferred_type === 'datetime';
    const numStats = col.numeric_stats;
    const catStats = col.categorical_stats;
    const dtStats = col.datetime_stats;

    const validCount = Math.max(0, totalRows - (col.null_count || 0));
    const validPct = totalRows > 0 ? ((validCount / totalRows) * 100).toFixed(1) : '0.0';
    const distinctRatio = validCount > 0 ? ((col.distinct_count / validCount) * 100).toFixed(1) : '0.0';

    return (
      <div style={{ animation: 'fadeIn 0.2s ease-in' }}>
        {/* Selected Column Main Header Card */}
        <div
          style={{
            background: '#fff',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            padding: '1.25rem 1.5rem',
            marginBottom: '1.25rem',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <h3 style={{ fontSize: '1.35rem', fontWeight: 700, margin: 0, fontFamily: 'monospace', color: 'var(--text-main)' }}>
                {col.name}
              </h3>
              <span className="badge badge-info" style={{ textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: 700 }}>
                {col.inferred_type}
              </span>
              {col.distinct_count <= 1 && (
                <span className="badge badge-warning" style={{ fontSize: '0.72rem' }}>
                  Constant Column
                </span>
              )}
            </div>

            {/* Column Browsing Controls */}
            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
              <button
                className="btn btn-outline"
                onClick={handleSelectPrevious}
                disabled={!hasPrevious}
                style={{ fontSize: '0.8rem', padding: '0.25rem 0.6rem' }}
                title="Previous Column"
              >
                &larr; Prev
              </button>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {currentIndex + 1} of {columns.length}
              </span>
              <button
                className="btn btn-outline"
                onClick={handleSelectNext}
                disabled={!hasNext}
                style={{ fontSize: '0.8rem', padding: '0.25rem 0.6rem' }}
                title="Next Column"
              >
                Next &rarr;
              </button>
            </div>
          </div>

          {/* Completeness / Validity Bar */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.3rem', color: 'var(--text-muted)' }}>
              <span>
                <strong>{validCount.toLocaleString()}</strong> of <strong>{totalRows.toLocaleString()}</strong> values populated ({validPct}%)
              </span>
              <span>
                {col.null_count > 0 ? (
                  <strong style={{ color: 'var(--danger)' }}>{col.null_count} missing ({col.null_percentage}%)</strong>
                ) : (
                  <strong style={{ color: 'var(--success)' }}>100% Complete</strong>
                )}
              </span>
            </div>
            <div style={{ background: '#f1f5f9', height: '8px', borderRadius: '4px', overflow: 'hidden', display: 'flex' }}>
              <div style={{ width: `${validPct}%`, background: 'var(--success)', height: '100%' }} />
              {col.null_count > 0 && (
                <div style={{ width: `${col.null_percentage}%`, background: 'var(--danger)', height: '100%' }} />
              )}
            </div>
          </div>
        </div>

        {/* 4-KPI Grid for Core Column Dimensions */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <div className="card" style={{ margin: 0, padding: '1rem', textAlign: 'center' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Total Rows</div>
            <div style={{ fontSize: '1.35rem', fontWeight: 700, margin: '0.2rem 0' }}>{totalRows.toLocaleString()}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>in dataset</div>
          </div>

          <div className="card" style={{ margin: 0, padding: '1rem', textAlign: 'center' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Valid / Non-Null</div>
            <div style={{ fontSize: '1.35rem', fontWeight: 700, margin: '0.2rem 0', color: 'var(--success)' }}>{validCount.toLocaleString()}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{validPct}% populated</div>
          </div>

          <div className="card" style={{ margin: 0, padding: '1rem', textAlign: 'center' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Missing Cells</div>
            <div style={{ fontSize: '1.35rem', fontWeight: 700, margin: '0.2rem 0', color: col.null_count > 0 ? 'var(--danger)' : 'var(--success)' }}>
              {col.null_count.toLocaleString()}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{col.null_percentage}% null rate</div>
          </div>

          <div className="card" style={{ margin: 0, padding: '1rem', textAlign: 'center' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Distinct Values</div>
            <div style={{ fontSize: '1.35rem', fontWeight: 700, margin: '0.2rem 0', color: 'var(--primary)' }}>{col.distinct_count.toLocaleString()}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{distinctRatio}% distinct ratio</div>
          </div>
        </div>

        {/* Detailed Numeric Statistics Cards */}
        {isNumeric && numStats && (
          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '1.25rem', marginBottom: '1.25rem', boxShadow: 'var(--shadow-sm)' }}>
            <h4 style={{ fontSize: '0.95rem', fontWeight: 700, margin: '0 0 0.85rem 0', color: 'var(--text-main)' }}>
              Numeric Summary Statistics
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem' }}>
              <div style={{ background: 'var(--bg-main)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>MEAN</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 700 }}>{numStats.mean !== null ? numStats.mean : '-'}</div>
              </div>
              <div style={{ background: 'var(--bg-main)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>MEDIAN</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 700 }}>{numStats.median !== null ? numStats.median : '-'}</div>
              </div>
              <div style={{ background: 'var(--bg-main)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>STD DEV</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 700 }}>{numStats.std !== null ? numStats.std : '-'}</div>
              </div>
              <div style={{ background: 'var(--bg-main)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>MINIMUM</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 700 }}>{numStats.min !== null ? numStats.min : '-'}</div>
              </div>
              <div style={{ background: 'var(--bg-main)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>MAXIMUM</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 700 }}>{numStats.max !== null ? numStats.max : '-'}</div>
              </div>
              <div style={{ background: 'var(--bg-main)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>IQR (Q3 - Q1)</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 700 }}>
                  {numStats.q75 !== null && numStats.q25 !== null ? (numStats.q75 - numStats.q25).toFixed(2) : '-'}
                </div>
              </div>
              <div style={{ background: 'var(--bg-main)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>RANGE (MAX - MIN)</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 700 }}>
                  {numStats.max !== null && numStats.min !== null ? (numStats.max - numStats.min).toFixed(2) : '-'}
                </div>
              </div>
              <div style={{ background: 'var(--bg-main)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>VARIANCE</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 700 }}>
                  {numStats.std !== null ? (numStats.std ** 2).toFixed(2) : '-'}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Visual Charts */}
        {isNumeric && numStats && renderNumericHistogram(numStats)}
        {isCategorical && catStats && renderCategoricalChart(catStats)}
        {isDatetime && dtStats && renderDatetimeTimeline(dtStats)}

        {/* Audit Findings Integration Section */}
        <div
          style={{
            background: '#fff',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            padding: '1.25rem',
            marginBottom: '1.5rem',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h4 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>
              Related Audit Findings ({selectedFindings.length})
            </h4>
            {onBackToAudit && (
              <button
                className="btn btn-outline"
                style={{ fontSize: '0.78rem', padding: '0.2rem 0.5rem' }}
                onClick={onBackToAudit}
              >
                Inspect in Audit Dashboard &rarr;
              </button>
            )}
          </div>

          {selectedFindings.length === 0 ? (
            <div style={{ padding: '1rem', background: 'var(--success-bg)', border: '1px solid #bbf7d0', borderRadius: 'var(--radius-sm)', color: 'var(--success)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>✓</span>
              <span>
                <strong>No Quality Issues Detected:</strong> Column <code>{col.name}</code> passed all deterministic audit rules in the active audit.
              </span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {selectedFindings.map((finding) => {
                const isHigh = finding.severity === 'high';
                const isMedium = finding.severity === 'medium';
                const badgeClass = isHigh ? 'badge-danger' : isMedium ? 'badge-warning' : 'badge-info';

                return (
                  <div
                    key={finding.id}
                    style={{
                      borderLeft: `4px solid ${isHigh ? 'var(--danger)' : isMedium ? 'var(--warning)' : 'var(--primary)'}`,
                      background: 'var(--bg-main)',
                      padding: '0.75rem 1rem',
                      borderRadius: '0 var(--radius-sm) var(--radius-sm) 0',
                      border: '1px solid var(--border)',
                      borderLeftWidth: '4px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem', flexWrap: 'wrap', gap: '0.4rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span className={`badge ${badgeClass}`} style={{ fontSize: '0.7rem' }}>
                          {finding.severity.toUpperCase()}
                        </span>
                        <strong style={{ fontSize: '0.88rem' }}>{finding.title}</strong>
                      </div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Rule: <code>{finding.rule_id}</code>
                      </span>
                    </div>
                    <p style={{ fontSize: '0.82rem', color: 'var(--text-main)', margin: '0 0 0.4rem 0' }}>
                      {finding.description}
                    </p>
                    {finding.suggested_action && (
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                        Recommendation: {finding.suggested_action}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  // -------------------------------------------------------------
  // Render Table Overview (All Columns Grid)
  // -------------------------------------------------------------
  const renderTableOverview = () => (
    <div className="card" style={{ padding: 0, overflow: 'hidden', animation: 'fadeIn 0.2s ease-in' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: 'var(--bg-main)', borderBottom: '2px solid var(--border)' }}>
              <th style={{ padding: '0.65rem 0.85rem' }}>Column</th>
              <th style={{ padding: '0.65rem 0.85rem' }}>Type</th>
              <th style={{ padding: '0.65rem 0.85rem' }}>Missingness</th>
              <th style={{ padding: '0.65rem 0.85rem' }}>Distinct</th>
              <th style={{ padding: '0.65rem 0.85rem' }}>Findings</th>
              <th style={{ padding: '0.65rem 0.85rem' }}>Summary Distribution</th>
              <th style={{ padding: '0.65rem 0.85rem', textAlign: 'center' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredColumns.map((col) => {
              const fCount = (columnFindingsMap[col.name] || []).length;
              return (
                <tr key={col.name} style={{ borderBottom: '1px solid var(--border)', verticalAlign: 'middle' }}>
                  <td style={{ padding: '0.65rem 0.85rem', fontWeight: 600 }}>
                    <code>{col.name}</code>
                  </td>
                  <td style={{ padding: '0.65rem 0.85rem' }}>
                    <span className="badge badge-info" style={{ fontSize: '0.72rem' }}>
                      {col.inferred_type}
                    </span>
                  </td>
                  <td style={{ padding: '0.65rem 0.85rem' }}>
                    {col.null_count > 0 ? (
                      <span style={{ color: 'var(--danger)', fontWeight: 600 }}>
                        {col.null_count} ({col.null_percentage}%)
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-light)' }}>0 (0%)</span>
                    )}
                  </td>
                  <td style={{ padding: '0.65rem 0.85rem' }}>
                    {col.distinct_count}
                  </td>
                  <td style={{ padding: '0.65rem 0.85rem' }}>
                    {fCount > 0 ? (
                      <span className="badge badge-warning" style={{ fontSize: '0.72rem' }}>
                        {fCount} issue(s)
                      </span>
                    ) : (
                      <span style={{ color: 'var(--success)', fontSize: '0.8rem' }}>✓ Clean</span>
                    )}
                  </td>
                  <td style={{ padding: '0.65rem 0.85rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {col.inferred_type === 'numeric' && col.numeric_stats && (
                      <span>Mean: {col.numeric_stats.mean} &bull; Median: {col.numeric_stats.median} &bull; [{col.numeric_stats.min} .. {col.numeric_stats.max}]</span>
                    )}
                    {(col.inferred_type === 'categorical' || col.inferred_type === 'text') && col.categorical_stats && (
                      <span>Top: {col.categorical_stats.top_values.slice(0, 3).map((v) => `"${v.value}"`).join(', ')}</span>
                    )}
                    {col.inferred_type === 'datetime' && col.datetime_stats && (
                      <span>{col.datetime_stats.min_date} &rarr; {col.datetime_stats.max_date}</span>
                    )}
                  </td>
                  <td style={{ padding: '0.65rem 0.85rem', textAlign: 'center' }}>
                    <button
                      className="btn btn-outline"
                      style={{ fontSize: '0.75rem', padding: '0.2rem 0.55rem' }}
                      onClick={() => {
                        handleSelectColumn(col.name);
                        setViewMode('detail');
                      }}
                    >
                      Detail EDA &rarr;
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div>
      {/* Top Navigation Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.35rem' }}>
            {onBackToAudit ? (
              <button
                onClick={onBackToAudit}
                className="btn btn-outline"
                style={{ padding: '0.25rem 0.6rem', fontSize: '0.82rem' }}
              >
                &larr; Back to Audit Dashboard
              </button>
            ) : (
              <button
                onClick={onBack}
                className="btn btn-outline"
                style={{ padding: '0.25rem 0.6rem', fontSize: '0.82rem' }}
              >
                &larr; All Datasets
              </button>
            )}
            {onNavigateToCompare && (
              <button
                onClick={onNavigateToCompare}
                className="btn btn-outline"
                style={{ padding: '0.25rem 0.6rem', fontSize: '0.82rem' }}
              >
                ⚖️ Compare Versions
              </button>
            )}
          </div>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 700, margin: 0 }}>
            {dataset.name} <span style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--text-muted)' }}>— Column Profiling &amp; Exploratory Data Analysis</span>
          </h2>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
            Version {profile.version_number} &bull; {profile.row_count.toLocaleString()} rows &times; {profile.column_count} columns &bull; Real measured data
          </div>
        </div>

        {/* View Mode Switcher */}
        <div style={{ display: 'flex', gap: '0.35rem', background: 'var(--bg-main)', padding: '0.25rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
          <button
            className={`btn ${viewMode === 'detail' ? 'btn-primary' : 'btn-outline'}`}
            style={{ fontSize: '0.8rem', padding: '0.3rem 0.75rem' }}
            onClick={() => setViewMode('detail')}
          >
            📊 Detailed Column EDA
          </button>
          <button
            className={`btn ${viewMode === 'table' ? 'btn-primary' : 'btn-outline'}`}
            style={{ fontSize: '0.8rem', padding: '0.3rem 0.75rem' }}
            onClick={() => setViewMode('table')}
          >
            📋 All Columns Overview
          </button>
        </div>
      </div>

      {/* View Mode: Table Overview */}
      {viewMode === 'table' ? (
        renderTableOverview()
      ) : (
        /* View Mode: Master-Detail Layout */
        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '1.25rem', alignItems: 'flex-start' }}>
          {/* Master Column List Sidebar */}
          <div
            style={{
              background: '#fff',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              padding: '1rem',
              boxShadow: 'var(--shadow-sm)',
              position: 'sticky',
              top: '1rem',
              maxHeight: 'calc(100vh - 2rem)',
              overflowY: 'auto',
            }}
          >
            <div style={{ marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>Columns ({filteredColumns.length})</span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Select to inspect</span>
              </div>

              {/* Column Name Search */}
              <input
                type="text"
                placeholder="Filter by name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.35rem 0.6rem',
                  fontSize: '0.8rem',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                  marginBottom: '0.5rem',
                }}
              />

              {/* Type Filter Dropdown */}
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.3rem 0.5rem',
                  fontSize: '0.78rem',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                  marginBottom: '0.5rem',
                }}
              >
                <option value="all">All Types ({columns.length})</option>
                <option value="numeric">Numeric ({profile.type_counts.numeric || 0})</option>
                <option value="categorical">Categorical ({profile.type_counts.categorical || 0})</option>
                <option value="datetime">Datetime ({profile.type_counts.datetime || 0})</option>
                <option value="boolean">Boolean ({profile.type_counts.boolean || 0})</option>
                <option value="text">Text ({profile.type_counts.text || 0})</option>
              </select>

              {/* Sort Order Selector */}
              <select
                value={sortOption}
                onChange={(e) => setSortOption(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.3rem 0.5rem',
                  fontSize: '0.78rem',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                }}
              >
                <option value="index">Sort: Original Order</option>
                <option value="name">Sort: Name (A-Z)</option>
                <option value="nulls">Sort: Most Nulls</option>
                <option value="findings">Sort: Most Findings</option>
              </select>
            </div>

            {/* List of Selectable Columns */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', maxHeight: '480px', overflowY: 'auto' }}>
              {filteredColumns.map((col) => {
                const isSelected = selectedColName === col.name;
                const fCount = (columnFindingsMap[col.name] || []).length;

                return (
                  <button
                    key={col.name}
                    onClick={() => handleSelectColumn(col.name)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      padding: '0.5rem 0.65rem',
                      borderRadius: 'var(--radius-sm)',
                      background: isSelected ? 'var(--primary-light)' : '#fff',
                      border: `1px solid ${isSelected ? 'var(--primary)' : 'var(--border)'}`,
                      textAlign: 'left',
                      cursor: 'pointer',
                      transition: 'all 0.1s ease',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.15rem' }}>
                      <code
                        style={{
                          fontWeight: isSelected ? 700 : 600,
                          color: isSelected ? 'var(--primary)' : 'var(--text-main)',
                          fontSize: '0.82rem',
                          textOverflow: 'ellipsis',
                          overflow: 'hidden',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {col.name}
                      </code>
                      <span className="badge badge-outline" style={{ fontSize: '0.65rem', padding: '0.1rem 0.35rem' }}>
                        {col.inferred_type}
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      <span>
                        {col.null_count > 0 ? (
                          <span style={{ color: 'var(--danger)' }}>{col.null_count} nulls</span>
                        ) : (
                          <span>0 nulls</span>
                        )}
                      </span>
                      {fCount > 0 && (
                        <span style={{ color: 'var(--warning)', fontWeight: 600 }}>
                          ⚠️ {fCount} issue{fCount > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Main Detailed Profile Area */}
          <div>
            {renderColumnDetailPane()}
          </div>
        </div>
      )}
    </div>
  );
}
