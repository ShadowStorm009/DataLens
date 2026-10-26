import { useState, useEffect } from 'react';
import { getDatasetProfile } from '../api/client';

export default function ProfileView({ dataset, onBack }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [typeFilter, setTypeFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    let isMounted = true;
    async function fetchProfile() {
      if (!dataset) return;
      setLoading(true);
      setError(null);
      try {
        const data = await getDatasetProfile(dataset.id);
        if (isMounted) setProfile(data);
      } catch (err) {
        if (isMounted) setError(err.message || 'Failed to generate profile');
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    fetchProfile();
    return () => { isMounted = false; };
  }, [dataset]);

  if (loading) {
    return (
      <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
        <h3 style={{ marginBottom: '0.5rem' }}>Analyzing & Profiling Dataset...</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Computing distributions, detecting types, null counts, and summary statistics.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card" style={{ padding: '2rem', background: 'var(--danger-bg)', border: '1px solid #fecaca' }}>
        <h3 style={{ color: 'var(--danger)', marginBottom: '0.5rem' }}>Profiling Failed</h3>
        <p style={{ color: 'var(--danger)', marginBottom: '1.25rem' }}>{error}</p>
        <button className="btn btn-outline" onClick={onBack}>
          Back to Datasets
        </button>
      </div>
    );
  }

  if (!profile) return null;

  const filteredColumns = profile.columns.filter((col) => {
    const matchesType = typeFilter === 'all' || col.inferred_type === typeFilter;
    const matchesSearch = col.name.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesType && matchesSearch;
  });

  const getTypeBadgeClass = (type) => {
    switch (type) {
      case 'numeric': return 'badge-primary';
      case 'categorical': return 'badge-purple';
      case 'datetime': return 'badge-success';
      case 'boolean': return 'badge-warning';
      default: return 'badge-neutral';
    }
  };

  return (
    <div>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <button
            onClick={onBack}
            className="btn btn-outline"
            style={{ marginBottom: '0.5rem', padding: '0.3rem 0.75rem', fontSize: '0.85rem' }}
          >
            &larr; Back to Datasets
          </button>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>
            {dataset.name} <span style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--text-muted)' }}>— Statistical Profile</span>
          </h2>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            File: <code>{dataset.original_filename}</code> &bull; Version {profile.version_number} &bull; Generated from real data
          </div>
        </div>
      </div>

      {/* Dataset-level KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="card" style={{ margin: 0, padding: '1.25rem' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Dimensions</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0.25rem 0' }}>
            {profile.row_count.toLocaleString()} &times; {profile.column_count}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {profile.total_cells.toLocaleString()} total cells
          </div>
        </div>

        <div className="card" style={{ margin: 0, padding: '1.25rem' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Missing Cells</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0.25rem 0', color: profile.missing_cells > 0 ? 'var(--warning)' : 'var(--success)' }}>
            {profile.missing_cells.toLocaleString()}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {profile.missing_percentage}% of total cells
          </div>
        </div>

        <div className="card" style={{ margin: 0, padding: '1.25rem' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Duplicate Rows</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0.25rem 0', color: profile.duplicate_rows > 0 ? 'var(--danger)' : 'var(--success)' }}>
            {profile.duplicate_rows.toLocaleString()}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {profile.duplicate_percentage}% exact duplicate rows
          </div>
        </div>

        <div className="card" style={{ margin: 0, padding: '1.25rem' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Inferred Types</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.5rem' }}>
            {Object.entries(profile.type_counts).map(([type, count]) => count > 0 && (
              <span key={type} className="badge badge-outline" style={{ fontSize: '0.75rem' }}>
                {type}: {count}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Column Search & Filter Controls */}
      <div className="card" style={{ padding: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Filter Type:</span>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              style={{ padding: '0.35rem 0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', fontSize: '0.85rem' }}
            >
              <option value="all">All Types ({profile.columns.length})</option>
              <option value="numeric">Numeric ({profile.type_counts.numeric || 0})</option>
              <option value="categorical">Categorical ({profile.type_counts.categorical || 0})</option>
              <option value="datetime">Datetime ({profile.type_counts.datetime || 0})</option>
              <option value="boolean">Boolean ({profile.type_counts.boolean || 0})</option>
              <option value="text">Text ({profile.type_counts.text || 0})</option>
            </select>
          </div>
          <div>
            <input
              type="text"
              placeholder="Search column by name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ padding: '0.35rem 0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', fontSize: '0.85rem', width: '240px' }}
            />
          </div>
        </div>
      </div>

      {/* Column Profiles Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)', background: 'var(--bg-main)' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Column Profiles ({filteredColumns.length} of {profile.columns.length})</h3>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'var(--bg-main)', borderBottom: '2px solid var(--border)' }}>
                <th style={{ padding: '0.75rem 1rem', width: '22%' }}>Column Name</th>
                <th style={{ padding: '0.75rem 1rem', width: '12%' }}>Type</th>
                <th style={{ padding: '0.75rem 1rem', width: '14%' }}>Nulls</th>
                <th style={{ padding: '0.75rem 1rem', width: '12%' }}>Distinct</th>
                <th style={{ padding: '0.75rem 1rem', width: '40%' }}>Summary Distribution / Details</th>
              </tr>
            </thead>
            <tbody>
              {filteredColumns.map((col, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid var(--border)', verticalAlign: 'top' }}>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-main)' }}>
                    {col.name}
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <span className="badge badge-outline" style={{ textTransform: 'capitalize' }}>
                      {col.inferred_type}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    {col.null_count > 0 ? (
                      <span style={{ color: 'var(--warning)', fontWeight: 600 }}>
                        {col.null_count} ({col.null_percentage}%)
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>0 (0%)</span>
                    )}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', color: 'var(--text-main)' }}>
                    {col.distinct_count.toLocaleString()}
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    {/* Numeric Stats */}
                    {col.inferred_type === 'numeric' && col.numeric_stats && (
                      <div style={{ fontSize: '0.8rem', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.25rem 0.75rem', background: '#f8fafc', padding: '0.5rem', borderRadius: '4px' }}>
                        <div><strong>Min:</strong> {col.numeric_stats.min}</div>
                        <div><strong>Median:</strong> {col.numeric_stats.median}</div>
                        <div><strong>Max:</strong> {col.numeric_stats.max}</div>
                        <div><strong>Mean:</strong> {col.numeric_stats.mean}</div>
                        <div><strong>Std:</strong> {col.numeric_stats.std}</div>
                        <div><strong>IQR:</strong> [Q1: {col.numeric_stats.q25}, Q3: {col.numeric_stats.q75}]</div>
                      </div>
                    )}

                    {/* Categorical / Boolean Stats */}
                    {(col.inferred_type === 'categorical' || col.inferred_type === 'boolean' || col.inferred_type === 'text') && col.categorical_stats && (
                      <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                          Top values ({col.categorical_stats.top_values.length}):
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                          {col.categorical_stats.top_values.map((item, tIdx) => (
                            <div key={tIdx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem' }}>
                              <span style={{ width: '90px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>
                                {item.value || '(empty)'}
                              </span>
                              <div style={{ flex: 1, background: '#e2e8f0', height: '6px', borderRadius: '3px', overflow: 'hidden' }}>
                                <div style={{ width: `${item.percentage}%`, background: 'var(--primary)', height: '100%' }} />
                              </div>
                              <span style={{ width: '65px', textAlign: 'right', color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                                {item.count} ({item.percentage}%)
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Datetime Stats */}
                    {col.inferred_type === 'datetime' && col.datetime_stats && (
                      <div style={{ fontSize: '0.8rem', background: '#f8fafc', padding: '0.5rem', borderRadius: '4px' }}>
                        <div><strong>Range:</strong> {col.datetime_stats.min_date} &rarr; {col.datetime_stats.max_date}</div>
                        {col.datetime_stats.invalid_date_count > 0 && (
                          <div style={{ color: 'var(--warning)', marginTop: '0.2rem' }}>
                            Invalid date strings: {col.datetime_stats.invalid_date_count}
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
