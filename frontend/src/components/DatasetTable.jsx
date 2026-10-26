import { useState } from 'react';

export default function DatasetTable({ datasets, loading, onPreview, onDelete, onRefresh, onViewProfile }) {
  const [deletingId, setDeletingId] = useState(null);

  const handleDelete = async (dataset) => {
    if (window.confirm(`Are you sure you want to permanently delete dataset "${dataset.name}" and all its versions?`)) {
      setDeletingId(dataset.id);
      try {
        await onDelete(dataset.id);
      } finally {
        setDeletingId(null);
      }
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
                        onClick={() => onViewProfile && onViewProfile(ds)}
                      >
                        View Profile
                      </button>
                      <button
                        className="btn btn-outline"
                        style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                        onClick={() => onPreview(ds)}
                      >
                        Preview Rows
                      </button>
                      <button
                        className="btn btn-outline"
                        style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', color: 'var(--danger)', borderColor: '#fecaca' }}
                        onClick={() => handleDelete(ds)}
                        disabled={deletingId === ds.id}
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
    </div>
  );
}
