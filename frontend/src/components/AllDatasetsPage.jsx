import { useState, useEffect, useMemo } from 'react';
import { getExportCsvUrl, downloadFileFromUrl, getLatestAuditsForDatasets } from '../api/client';

export default function AllDatasetsPage({
  datasets,
  loading,
  error,
  onRefresh,
  onOpenAudit,
  onViewProfile,
  onPreview,
  onCompare,
  onDelete,
  onBackToHome,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('created_desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [auditScores, setAuditScores] = useState({});
  const [loadingScores, setLoadingScores] = useState(false);
  const [datasetToDelete, setDatasetToDelete] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [exportError, setExportError] = useState(null);
  const [exportingId, setExportingId] = useState(null);

  // Fetch real audit scores for visible datasets
  useEffect(() => {
    let isMounted = true;
    async function loadScores() {
      if (datasets.length === 0) return;
      const idsToFetch = datasets
        .map((d) => d.id)
        .filter((id) => auditScores[id] === undefined);

      if (idsToFetch.length === 0) return;

      setLoadingScores(true);
      try {
        const scoreMap = await getLatestAuditsForDatasets(idsToFetch);
        if (isMounted) {
          setAuditScores((prev) => ({ ...prev, ...scoreMap }));
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
  }, [datasets.map((d) => d.id).join(',')]);

  // Filter and sort datasets
  const filteredAndSortedDatasets = useMemo(() => {
    let list = [...datasets];

    // Search filter
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      list = list.filter(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          (d.original_filename && d.original_filename.toLowerCase().includes(q))
      );
    }

    // Sort
    list.sort((a, b) => {
      switch (sortBy) {
        case 'created_desc':
          return new Date(b.created_at) - new Date(a.created_at);
        case 'created_asc':
          return new Date(a.created_at) - new Date(b.created_at);
        case 'name_asc':
          return a.name.localeCompare(b.name);
        case 'name_desc':
          return b.name.localeCompare(a.name);
        case 'rows_desc':
          return b.row_count - a.row_count;
        case 'rows_asc':
          return a.row_count - b.row_count;
        case 'score_desc': {
          const scoreA = auditScores[a.id]?.score ?? -1;
          const scoreB = auditScores[b.id]?.score ?? -1;
          return scoreB - scoreA;
        }
        case 'score_asc': {
          const scoreA = auditScores[a.id]?.score ?? 999;
          const scoreB = auditScores[b.id]?.score ?? 999;
          return scoreA - scoreB;
        }
        default:
          return 0;
      }
    });

    return list;
  }, [datasets, searchTerm, sortBy, auditScores]);

  // Reset to page 1 if filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, sortBy, pageSize]);

  // Pagination calculation
  const totalItems = filteredAndSortedDatasets.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);
  const currentDatasets = filteredAndSortedDatasets.slice(startIndex, endIndex);

  const handleConfirmDelete = async (dataset) => {
    setDeletingId(dataset.id);
    setExportError(null);
    try {
      await onDelete(dataset.id);
      setDatasetToDelete(null);
    } catch (err) {
      setExportError(err.message || 'Failed to delete dataset');
    } finally {
      setDeletingId(null);
    }
  };

  const getScoreBadge = (datasetId) => {
    const auditInfo = auditScores[datasetId];
    if (loadingScores && auditInfo === undefined) {
      return (
        <span className="badge badge-outline" style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>
          Loading...
        </span>
      );
    }
    if (!auditInfo || auditInfo.score === null || auditInfo.score === undefined) {
      return (
        <span className="badge badge-outline" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          Not Audited
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
        {s} / 100 ({label})
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
    <div className="all-datasets-page" style={{ animation: 'fadeIn 0.25s ease-out' }}>
      {/* Top Header & Breadcrumbs */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <button
            className="btn btn-outline"
            style={{ marginBottom: '0.5rem', padding: '0.3rem 0.65rem', fontSize: '0.85rem' }}
            onClick={onBackToHome}
          >
            &larr; Back to Home &amp; Upload
          </button>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>
            All Datasets
          </h1>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            {datasets.length} {datasets.length === 1 ? 'dataset' : 'datasets'} available in persistent storage
          </span>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button className="btn btn-outline" onClick={onRefresh} disabled={loading} style={{ fontSize: '0.85rem' }}>
            {loading ? 'Refreshing...' : 'Refresh List'}
          </button>
          <button className="btn btn-primary" onClick={onBackToHome} style={{ fontSize: '0.85rem' }}>
            + Upload New Dataset
          </button>
        </div>
      </div>

      {/* Export or API error notification */}
      {exportError && (
        <div
          style={{
            padding: '0.75rem 1rem',
            background: 'var(--danger-bg)',
            border: '1px solid #fecaca',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--danger)',
            marginBottom: '1rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <strong>Error:</strong> {exportError}
          </div>
          <button
            className="btn btn-outline"
            style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
            onClick={() => setExportError(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Content Card with Toolbar */}
      <div className="card" style={{ padding: '1.25rem' }}>
        {/* Search & Sort Controls Toolbar */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
            marginBottom: '1.25rem',
            paddingBottom: '1rem',
            borderBottom: '1px solid var(--border)',
          }}
        >
          {/* Search Box */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: '1 1 280px', maxWidth: '420px' }}>
            <input
              type="text"
              placeholder="Search by dataset or file name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                fontSize: '0.875rem',
                fontFamily: 'inherit',
              }}
            />
            {searchTerm && (
              <button
                className="btn btn-outline"
                style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem' }}
                onClick={() => setSearchTerm('')}
                title="Clear search"
              >
                Clear
              </button>
            )}
          </div>

          {/* Sort & Page Size Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
              <label htmlFor="sort-select" style={{ fontWeight: 600, color: 'var(--text-muted)' }}>
                Sort:
              </label>
              <select
                id="sort-select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                style={{
                  padding: '0.45rem 0.6rem',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                  fontSize: '0.85rem',
                  fontFamily: 'inherit',
                  background: 'var(--bg-card)',
                }}
              >
                <option value="created_desc">Uploaded: Newest First</option>
                <option value="created_asc">Uploaded: Oldest First</option>
                <option value="name_asc">Name: A to Z</option>
                <option value="name_desc">Name: Z to A</option>
                <option value="rows_desc">Rows: High to Low</option>
                <option value="rows_asc">Rows: Low to High</option>
                <option value="score_desc">Quality Score: High to Low</option>
                <option value="score_asc">Quality Score: Low to High</option>
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
              <label htmlFor="page-size-select" style={{ fontWeight: 600, color: 'var(--text-muted)' }}>
                Per Page:
              </label>
              <select
                id="page-size-select"
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                style={{
                  padding: '0.45rem 0.5rem',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                  fontSize: '0.85rem',
                  fontFamily: 'inherit',
                  background: 'var(--bg-card)',
                }}
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </div>
          </div>
        </div>

        {/* Loading State */}
        {loading && datasets.length === 0 && (
          <div style={{ padding: '3.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.25rem' }}>Loading dataset collection...</div>
            <div style={{ fontSize: '0.85rem' }}>Retrieving persisted metadata from SQLite database</div>
          </div>
        )}

        {/* Empty Collection State */}
        {!loading && datasets.length === 0 && (
          <div style={{ padding: '3.5rem 2rem', textAlign: 'center', background: 'var(--bg-main)', borderRadius: 'var(--radius-sm)', border: '1px dashed var(--border)' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📁</div>
            <h3 style={{ fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.5rem' }}>No Datasets Uploaded Yet</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1.25rem', maxWidth: '420px', margin: '0 auto 1.25rem' }}>
              Upload your first CSV dataset to compute statistical profiles and run deterministic data quality audits.
            </p>
            <button className="btn btn-primary" onClick={onBackToHome}>
              Go to Upload
            </button>
          </div>
        )}

        {/* Empty Filter / Search Result State */}
        {!loading && datasets.length > 0 && filteredAndSortedDatasets.length === 0 && (
          <div style={{ padding: '3rem 2rem', textAlign: 'center', background: 'var(--bg-main)', borderRadius: 'var(--radius-sm)' }}>
            <h3 style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.35rem' }}>
              No Datasets Matching "{searchTerm}"
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
              Try searching with another name or clear the search filter.
            </p>
            <button className="btn btn-outline" onClick={() => setSearchTerm('')}>
              Clear Search
            </button>
          </div>
        )}

        {/* Datasets Table */}
        {!loading && currentDatasets.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ background: 'var(--bg-main)', borderBottom: '2px solid var(--border)' }}>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Dataset &amp; File</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Dimensions</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Quality Score</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Uploaded</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Audited</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Status</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {currentDatasets.map((ds) => {
                  const auditInfo = auditScores[ds.id];
                  return (
                    <tr key={ds.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      {/* Name & Filename */}
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '0.92rem' }}>
                          {ds.name}
                        </div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                          <code>{ds.original_filename}</code>
                        </div>
                      </td>

                      {/* Dimensions */}
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 500 }}>
                        <div>{ds.row_count.toLocaleString()} rows</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{ds.column_count} columns</div>
                      </td>

                      {/* Quality Score */}
                      <td style={{ padding: '0.75rem 1rem' }}>
                        {getScoreBadge(ds.id)}
                      </td>

                      {/* Uploaded Timestamp */}
                      <td style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)', fontSize: '0.825rem', whiteSpace: 'nowrap' }}>
                        {formatTimestamp(ds.created_at)}
                      </td>

                      {/* Audited Timestamp */}
                      <td style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)', fontSize: '0.825rem', whiteSpace: 'nowrap' }}>
                        {auditInfo?.auditedAt ? formatTimestamp(auditInfo.auditedAt) : '—'}
                      </td>

                      {/* Status */}
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span className="badge badge-success" style={{ textTransform: 'capitalize' }}>
                          {ds.status}
                        </span>
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '0.4rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          <button
                            className="btn btn-primary"
                            style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem' }}
                            onClick={() => onOpenAudit && onOpenAudit(ds)}
                            title="Open Audit Dashboard"
                          >
                            Audit
                          </button>
                          <button
                            className="btn btn-outline"
                            style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem' }}
                            onClick={() => onViewProfile && onViewProfile(ds)}
                            title="Statistical Profile"
                          >
                            Profile
                          </button>
                          <button
                            className="btn btn-outline"
                            style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem' }}
                            onClick={() => onPreview && onPreview(ds)}
                            title="Preview Rows"
                          >
                            Preview
                          </button>
                          <button
                            className="btn btn-outline"
                            style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem' }}
                            onClick={() => onCompare && onCompare(ds)}
                            title="Compare Versions"
                          >
                            Compare
                          </button>
                          <button
                            className="btn btn-outline"
                            style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem' }}
                            disabled={exportingId === ds.id}
                            onClick={async () => {
                              setExportingId(ds.id);
                              setExportError(null);
                              try {
                                await downloadFileFromUrl(
                                  getExportCsvUrl(ds.id, ds.current_version_id, false),
                                  `${(ds.name || 'dataset').replace(/\.[^/.]+$/, '')}.csv`
                                );
                              } catch (err) {
                                setExportError(err.message || 'Failed to download dataset CSV');
                              } finally {
                                setExportingId(null);
                              }
                            }}
                            title="Export current CSV version"
                          >
                            {exportingId === ds.id ? 'Exporting...' : 'Export'}
                          </button>
                          <button
                            className="btn btn-outline"
                            style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem', color: 'var(--danger)', borderColor: '#fecaca' }}
                            onClick={() => setDatasetToDelete(ds)}
                            disabled={deletingId === ds.id}
                            title={`Delete dataset "${ds.name}"`}
                          >
                            {deletingId === ds.id ? 'Deleting...' : 'Delete'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {!loading && filteredAndSortedDatasets.length > 0 && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '1rem',
              marginTop: '1.25rem',
              paddingTop: '1rem',
              borderTop: '1px solid var(--border)',
            }}
          >
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Showing {startIndex + 1}–{endIndex} of {totalItems} {totalItems === 1 ? 'dataset' : 'datasets'}
              {searchTerm && ` (filtered from ${datasets.length} total)`}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <button
                className="btn btn-outline"
                style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                &larr; Previous
              </button>

              <div style={{ display: 'flex', gap: '0.25rem' }}>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 2)
                  .map((p, idx, arr) => {
                    const prev = arr[idx - 1];
                    return (
                      <span key={p} style={{ display: 'inline-flex', alignItems: 'center' }}>
                        {prev && p - prev > 1 && (
                          <span style={{ padding: '0 0.35rem', color: 'var(--text-light)', fontSize: '0.8rem' }}>
                            ...
                          </span>
                        )}
                        <button
                          className={`btn ${currentPage === p ? 'btn-primary' : 'btn-outline'}`}
                          style={{ minWidth: '32px', height: '32px', padding: '0 0.4rem', fontSize: '0.8rem' }}
                          onClick={() => setCurrentPage(p)}
                        >
                          {p}
                        </button>
                      </span>
                    );
                  })}
              </div>

              <button
                className="btn btn-outline"
                style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                Next &rarr;
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Accessible Cascade Deletion Modal */}
      {datasetToDelete && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: '460px',
              width: '100%',
              padding: '1.75rem',
              borderRadius: 'var(--radius-md)',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.25)',
              background: '#ffffff',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  background: '#fee2e2',
                  color: '#dc2626',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: '1.1rem',
                  flexShrink: 0,
                }}
              >
                !
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)' }}>
                  Confirm Dataset Deletion
                </h3>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Permanent Cascade Action</span>
              </div>
            </div>

            <p style={{ fontSize: '0.9rem', color: 'var(--text-main)', marginBottom: '1rem', lineHeight: 1.5 }}>
              Are you sure you want to permanently delete dataset <strong>"{datasetToDelete.name}"</strong>?
            </p>

            <div
              style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: 'var(--radius-sm)',
                padding: '0.75rem',
                fontSize: '0.8rem',
                color: '#991b1b',
                marginBottom: '1.5rem',
                lineHeight: 1.4,
              }}
            >
              <strong>Cascade Warning:</strong> This will delete all immutable versions (v1..vN), audit runs, rule findings, transformation records, and physical CSV/cache storage files on disk. This cannot be undone.
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                className="btn btn-outline"
                style={{ fontSize: '0.85rem' }}
                onClick={() => setDatasetToDelete(null)}
                disabled={deletingId === datasetToDelete.id}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn"
                style={{
                  fontSize: '0.85rem',
                  backgroundColor: 'var(--danger)',
                  color: '#ffffff',
                  borderColor: 'var(--danger)',
                }}
                onClick={() => handleConfirmDelete(datasetToDelete)}
                disabled={deletingId === datasetToDelete.id}
              >
                {deletingId === datasetToDelete.id ? 'Deleting Records & Files...' : 'Permanently Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
