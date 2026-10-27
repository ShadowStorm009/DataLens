import { useState, useEffect } from 'react';
import { getLatestAuditsForDatasets } from '../api/client';
import { useAppDispatch, useAppSelector } from '../store/index.js';
import { selectAuditScores, setCachedAuditScores } from '../store/datasetsSlice.js';
import UploadSection from './UploadSection';

export default function LandingPage({
  datasets,
  loading,
  error,
  onRefresh,
  onUploadSuccess,
  onOpenDataset,
  onViewProfile,
  onPreviewDataset,
  onNavigateToAllDatasets,
}) {
  const dispatch = useAppDispatch();
  const auditScores = useAppSelector(selectAuditScores);
  const [loadingScores, setLoadingScores] = useState(false);
  const [recentUpload, setRecentUpload] = useState(null);

  // Take at most 5 recent datasets sorted by created_at descending
  const recentDatasets = [...datasets]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 5);

  // Fetch real latest audit scores for these recent datasets if not cached
  useEffect(() => {
    let isMounted = true;
    async function loadScores() {
      if (recentDatasets.length === 0) return;
      const idsToFetch = recentDatasets
        .map((d) => d.id)
        .filter((id) => !auditScores[id]);

      if (idsToFetch.length === 0) return;

      setLoadingScores(true);
      try {
        const scoreMap = await getLatestAuditsForDatasets(idsToFetch);
        if (isMounted && scoreMap) {
          dispatch(setCachedAuditScores(scoreMap));
        }
      } catch (_) {
        // Non-critical audit score fetch
      } finally {
        if (isMounted) setLoadingScores(false);
      }
    }

    loadScores();
    return () => {
      isMounted = false;
    };
  }, [recentDatasets, auditScores, dispatch]);

  const handleUploadComplete = (newDataset) => {
    setRecentUpload(newDataset);
    if (onUploadSuccess) {
      onUploadSuccess(newDataset);
    }
  };

  const getScoreBadge = (datasetId) => {
    const auditInfo = auditScores[datasetId];
    if (loadingScores && auditInfo === undefined) {
      return (
        <span className="badge badge-outline" style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>
          Loading score...
        </span>
      );
    }
    if (!auditInfo || auditInfo.score === null || auditInfo.score === undefined) {
      return (
        <span className="badge badge-outline" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          Not Audited Yet
        </span>
      );
    }

    const s = Math.round(auditInfo.score * 10) / 10;
    let badgeClass = 'badge-danger';
    let label = 'Needs Work';
    if (s >= 85) {
      badgeClass = 'badge-success';
      label = 'Excellent';
    } else if (s >= 60) {
      badgeClass = 'badge-warning';
      label = 'Moderate';
    }

    return (
      <span className={`badge ${badgeClass}`} style={{ fontSize: '0.78rem', fontWeight: 600 }}>
        {s} / 100 &bull; {label}
      </span>
    );
  };

  const formatTimestamp = (isoString) => {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="landing-page" style={{ animation: 'fadeIn 0.25s ease-out' }}>
      {/* SaaS Hero Section */}
      <section className="landing-hero card" style={{ marginBottom: '2rem', padding: '2.5rem 2rem' }}>
        <div style={{ maxWidth: '780px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <span className="badge badge-info" style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Deterministic Quality Auditor
            </span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              100% Rule-Based &bull; Zero External AI Hallucinations
            </span>
          </div>

          <h1 style={{ fontSize: '2.1rem', fontWeight: 800, color: 'var(--text-main)', lineHeight: 1.25, marginBottom: '0.75rem', letterSpacing: '-0.5px' }}>
            Inspect, Profile &amp; Audit Tabular Datasets with Complete Confidence
          </h1>

          <p style={{ fontSize: '1.05rem', color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: '1.5rem' }}>
            Detect missing values, exact duplicates, constant columns, outliers, and type inconsistencies. Simulate non-mutating cleaning previews and preserve verifiable version lineage.
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)' }}>
            <div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--primary)' }}>
                8 Deterministic Rules
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Transparent scoring &amp; evidence</div>
            </div>
            <div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--primary)' }}>
                Immutable Versions
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Side-by-side before/after comparison</div>
            </div>
            <div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--primary)' }}>
                {datasets.length} {datasets.length === 1 ? 'Dataset' : 'Datasets'} Stored
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>In persistent local storage</div>
            </div>
          </div>
        </div>
      </section>

      {/* Upload Notification Banner if user uploaded a file */}
      {recentUpload && (
        <div
          className="card"
          style={{
            padding: '1.25rem 1.5rem',
            background: 'var(--success-bg)',
            border: '1px solid #86efac',
            marginBottom: '2rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '1.5rem' }}>✓</span>
            <div>
              <div style={{ fontWeight: 700, color: '#166534', fontSize: '1rem' }}>
                Dataset "{recentUpload.name}" Successfully Uploaded!
              </div>
              <div style={{ fontSize: '0.85rem', color: '#15803d' }}>
                {recentUpload.row_count.toLocaleString()} rows &times; {recentUpload.column_count} columns &bull; Ready for automated quality audit
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              className="btn btn-primary"
              style={{ fontSize: '0.85rem' }}
              onClick={() => onOpenDataset && onOpenDataset(recentUpload)}
            >
              Audit Dataset Now &rarr;
            </button>
            <button
              className="btn btn-outline"
              style={{ fontSize: '0.85rem' }}
              onClick={() => setRecentUpload(null)}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Prominent Upload Area */}
      <section style={{ marginBottom: '2.5rem' }}>
        <UploadSection onUploadSuccess={handleUploadComplete} />
      </section>

      {/* Recent Datasets Section (Max 5) */}
      <section>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>
              Recent Datasets
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0.2rem 0 0' }}>
              Showing up to 5 recently uploaded datasets sorted by creation time
            </p>
          </div>
          {datasets.length > 0 && (
            <button
              className="btn btn-outline"
              onClick={onNavigateToAllDatasets}
              style={{ fontSize: '0.85rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
            >
              View All Datasets ({datasets.length}) &rarr;
            </button>
          )}
        </div>

        {/* Loading State */}
        {loading && (
          <div className="card" style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.25rem' }}>Loading recent datasets...</div>
            <div style={{ fontSize: '0.85rem' }}>Fetching metadata from storage</div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="card" style={{ padding: '1.5rem', background: 'var(--danger-bg)', border: '1px solid #fecaca', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <strong style={{ color: 'var(--danger)' }}>Failed to load datasets:</strong>
              <span style={{ marginLeft: '0.5rem', color: 'var(--text-main)', fontSize: '0.9rem' }}>{error}</span>
            </div>
            <button className="btn btn-outline" style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }} onClick={onRefresh}>
              Retry
            </button>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && recentDatasets.length === 0 && (
          <div className="card" style={{ padding: '3rem 2rem', textAlign: 'center', background: 'var(--bg-main)', border: '1px dashed var(--border)' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📁</div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.35rem' }}>
              No Datasets Uploaded Yet
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', maxWidth: '480px', margin: '0 auto 1.25rem', lineHeight: 1.5 }}>
              Drag and drop a CSV file into the upload zone above to calculate data profiles, detect audit findings, and track version history.
            </p>
          </div>
        )}

        {/* Recent Dataset Cards Grid (At most 5) */}
        {!loading && !error && recentDatasets.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            {recentDatasets.map((ds) => {
              const auditInfo = auditScores[ds.id];
              return (
                <div
                  key={ds.id}
                  className="card"
                  style={{
                    margin: 0,
                    padding: '1.25rem',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    transition: 'box-shadow 0.15s ease, transform 0.15s ease',
                  }}
                >
                  <div>
                    {/* Header: Name and Status */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      <div style={{ minWidth: 0 }}>
                        <h3
                          style={{
                            fontSize: '1.05rem',
                            fontWeight: 700,
                            color: 'var(--text-main)',
                            margin: 0,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={ds.name}
                        >
                          {ds.name}
                        </h3>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <code>{ds.original_filename}</code>
                        </div>
                      </div>
                      <span className="badge badge-success" style={{ fontSize: '0.7rem', textTransform: 'capitalize' }}>
                        {ds.status}
                      </span>
                    </div>

                    {/* Meta Info: Dimensions & Quality Score */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0.85rem 0', padding: '0.65rem 0.75rem', background: 'var(--bg-main)', borderRadius: 'var(--radius-sm)' }}>
                      <div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Dimensions</div>
                        <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-main)' }}>
                          {ds.row_count.toLocaleString()} &times; {ds.column_count}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Quality Score</div>
                        <div>{getScoreBadge(ds.id)}</div>
                      </div>
                    </div>

                    {/* Timestamps */}
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '0.2rem', marginBottom: '1rem' }}>
                      <div>
                        <strong>Uploaded:</strong> {formatTimestamp(ds.created_at)}
                      </div>
                      {auditInfo?.auditedAt && (
                        <div>
                          <strong>Audited:</strong> {formatTimestamp(auditInfo.auditedAt)}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '0.5rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)' }}>
                    <button
                      className="btn btn-primary"
                      style={{ flex: 1, padding: '0.45rem 0.75rem', fontSize: '0.85rem', fontWeight: 600 }}
                      onClick={() => onOpenDataset && onOpenDataset(ds)}
                    >
                      Open Dataset &rarr;
                    </button>
                    <button
                      className="btn btn-outline"
                      style={{ padding: '0.45rem 0.65rem', fontSize: '0.8rem' }}
                      onClick={() => onViewProfile && onViewProfile(ds)}
                      title="Statistical Profile"
                    >
                      Profile
                    </button>
                    <button
                      className="btn btn-outline"
                      style={{ padding: '0.45rem 0.65rem', fontSize: '0.8rem' }}
                      onClick={() => onPreviewDataset && onPreviewDataset(ds)}
                      title="Preview Rows"
                    >
                      Preview
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* View All Datasets CTA Footer */}
        {datasets.length > 5 && (
          <div style={{ textAlign: 'center', padding: '0.75rem 0' }}>
            <button
              className="btn btn-outline"
              onClick={onNavigateToAllDatasets}
              style={{ padding: '0.6rem 1.5rem', fontSize: '0.9rem', fontWeight: 600 }}
            >
              Browse Complete Collection ({datasets.length} Datasets) &rarr;
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
