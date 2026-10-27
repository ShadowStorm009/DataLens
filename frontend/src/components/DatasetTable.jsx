import { useState } from 'react';
import { getExportCsvUrl, downloadFileFromUrl } from '../api/client';

export default function DatasetTable({ datasets, loading, onPreview, onDelete, onRefresh, onViewProfile, onViewAudit, onCompare }) {
  const [datasetToDelete, setDatasetToDelete] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [exportError, setExportError] = useState(null);

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

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div>
          <h2 className="card-title" style={{ margin: 0 }}>Stored Datasets</h2>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            {datasets.length} {datasets.length === 1 ? 'dataset' : 'datasets'} available in persistent storage
          </span>
        </div>
        <button className="btn btn-outline" onClick={onRefresh} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {exportError && (
        <div style={{ padding: '0.75rem 1rem', background: 'var(--danger-bg)', border: '1px solid #fecaca', borderRadius: 'var(--radius-sm)', color: 'var(--danger)', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div><strong>Export Error:</strong> {exportError}</div>
          <button className="btn btn-outline" style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }} onClick={() => setExportError(null)}>Dismiss</button>
        </div>
      )}

      {loading && datasets.length === 0 && (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          Loading datasets from server...
        </div>
      )}

      {!loading && datasets.length === 0 && (
        <div style={{ padding: '3rem', textAlign: 'center', background: 'var(--bg-main)', borderRadius: 'var(--radius-sm)', border: '1px dashed var(--border)' }}>
          <div style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.5rem' }}>No datasets uploaded yet</div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            Upload a CSV file using the form above to begin dataset profiling and quality auditing.
          </p>
        </div>
      )}

      {datasets.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ background: 'var(--bg-main)', borderBottom: '2px solid var(--border)' }}>
                <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Dataset Name</th>
                <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Original Filename</th>
                <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Uploaded</th>
                <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Rows</th>
                <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Columns</th>
                <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Status</th>
                <th style={{ padding: '0.75rem 1rem', fontWeight: 600, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {datasets.map((ds) => (
                <tr key={ds.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-main)' }}>
                    {ds.name}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)' }}>
                    <code>{ds.original_filename}</code>
                  </td>
                  <td style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    {new Date(ds.created_at).toLocaleString()}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: 500 }}>
                    {ds.row_count.toLocaleString()}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: 500 }}>
                    {ds.column_count}
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <span className="badge badge-success">
                      {ds.status}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '0.5rem' }}>
                      <button
                        className="btn btn-primary"
                        style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                        onClick={() => onViewAudit && onViewAudit(ds)}
                      >
                        Audit Quality
                      </button>
                      <button
                        className="btn btn-outline"
                        style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                        onClick={() => onViewProfile && onViewProfile(ds)}
                      >
                        Profile
                      </button>
                      <button
                        className="btn btn-outline"
                        style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                        onClick={() => onPreview(ds)}
                      >
                        Preview
                      </button>
                      <button
                        className="btn btn-outline"
                        style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                        onClick={() => onCompare && onCompare(ds)}
                      >
                        Compare
                      </button>
                      <button
                        className="btn btn-outline"
                        style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                        onClick={async () => {
                          setExportError(null);
                          try {
                            await downloadFileFromUrl(getExportCsvUrl(ds.id, ds.current_version_id, false));
                          } catch (err) {
                            setExportError(err.message || 'Failed to download dataset CSV');
                          }
                        }}
                        title="Export current CSV version"
                      >
                        Export CSV
                      </button>
                      <button
                        className="btn btn-outline"
                        style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', color: 'var(--danger)', borderColor: '#fecaca' }}
                        onClick={() => setDatasetToDelete(ds)}
                        disabled={deletingId === ds.id}
                        title={`Delete dataset "${ds.name}"`}
                      >
                        {deletingId === ds.id ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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
