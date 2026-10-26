import { useState, useEffect } from 'react';
import { getDatasetPreview } from '../api/client';

export default function PreviewModal({ dataset, onClose }) {
  const [previewData, setPreviewData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [rowLimit, setRowLimit] = useState(20);

  useEffect(() => {
    let isMounted = true;
    async function fetchPreview() {
      if (!dataset) return;
      setLoading(true);
      setError(null);
      try {
        const data = await getDatasetPreview(dataset.id, null, rowLimit);
        if (isMounted) setPreviewData(data);
      } catch (err) {
        if (isMounted) setError(err.message || 'Failed to load preview data');
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    fetchPreview();
    return () => { isMounted = false; };
  }, [dataset, rowLimit]);

  if (!dataset) return null;

  return (
    <div
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
      onClick={onClose}
    >
      <div
        className="card"
        style={{
          width: '95%',
          maxWidth: '1000px',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          margin: 0,
          padding: '1.5rem',
          backgroundColor: '#ffffff',
          boxShadow: 'var(--shadow-md)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
          <div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 600 }}>{dataset.name}</h3>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Original File: <code>{dataset.original_filename}</code> &bull; Version 1 &bull; Total Rows: {dataset.row_count} &bull; Columns: {dataset.column_count}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              fontSize: '1.25rem',
              color: 'var(--text-muted)',
              padding: '0.2rem 0.5rem',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            &times;
          </button>
        </div>

        {/* Row Limit Selector */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Showing top {previewData ? previewData.rows.length : 0} of {dataset.row_count} rows (bounded preview)
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
            <label htmlFor="limit-select">Preview limit:</label>
            <select
              id="limit-select"
              value={rowLimit}
              onChange={(e) => setRowLimit(Number(e.target.value))}
              style={{
                padding: '0.25rem 0.5rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                fontFamily: 'inherit',
              }}
            >
              <option value={10}>10 rows</option>
              <option value={20}>20 rows</option>
              <option value={50}>50 rows</option>
            </select>
          </div>
        </div>

        {/* Content Area */}
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
          {loading && (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              Loading preview rows...
            </div>
          )}

          {error && (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--danger)', background: 'var(--danger-bg)' }}>
              <strong>Error:</strong> {error}
            </div>
          )}

          {!loading && !error && previewData && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: 'var(--bg-main)', borderBottom: '2px solid var(--border)' }}>
                  <th style={{ padding: '0.6rem 0.8rem', width: '40px', color: 'var(--text-muted)', borderRight: '1px solid var(--border)' }}>#</th>
                  {previewData.columns.map((col, idx) => (
                    <th key={idx} style={{ padding: '0.6rem 0.8rem', fontWeight: 600, borderRight: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewData.rows.map((row, rIdx) => (
                  <tr key={rIdx} style={{ borderBottom: '1px solid var(--border)', backgroundColor: rIdx % 2 === 0 ? '#ffffff' : 'var(--bg-main)' }}>
                    <td style={{ padding: '0.5rem 0.8rem', color: 'var(--text-light)', borderRight: '1px solid var(--border)' }}>{rIdx + 1}</td>
                    {previewData.columns.map((col, cIdx) => {
                      const val = row[col];
                      return (
                        <td key={cIdx} style={{ padding: '0.5rem 0.8rem', borderRight: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                          {val === null || val === undefined ? (
                            <span style={{ color: 'var(--text-light)', fontStyle: 'italic', background: '#f1f5f9', padding: '0.1rem 0.3rem', borderRadius: '3px' }}>null</span>
                          ) : (
                            String(val)
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-outline" onClick={onClose}>
            Close Preview
          </button>
        </div>
      </div>
    </div>
  );
}
