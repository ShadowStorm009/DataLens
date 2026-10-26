import React, { useState } from 'react';
import { previewTransformation, applyTransformation } from '../api/client';

export default function CleaningPanel({ dataset, profile, onTransformationApplied, onClose }) {
  const [operationType, setOperationType] = useState('impute_median');
  const [selectedColumn, setSelectedColumn] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [applyLoading, setApplyLoading] = useState(false);
  const [error, setError] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [confirmApply, setConfirmApply] = useState(false);

  const columns = profile?.columns || [];
  const numericColumns = columns.filter((c) => c.inferred_type === 'numeric');
  const constantColumns = columns.filter((c) => c.distinct_count <= 1);

  // Available column options depending on operation
  const availableColumns =
    operationType === 'impute_median'
      ? (numericColumns.length > 0 ? numericColumns : columns)
      : operationType === 'drop_constant_column'
      ? (constantColumns.length > 0 ? constantColumns : columns)
      : columns;

  const requiresColumn = operationType !== 'remove_duplicates';

  const handlePreview = async (e) => {
    e.preventDefault();
    if (requiresColumn && !selectedColumn) {
      setError('Please select a target column for this operation.');
      return;
    }

    setPreviewLoading(true);
    setError(null);
    try {
      const res = await previewTransformation(
        dataset.id,
        operationType,
        requiresColumn ? selectedColumn : null,
        {},
        dataset.current_version_id
      );
      setPreviewData(res);
      setConfirmApply(false);
    } catch (err) {
      setError(err.message || 'Transformation preview failed');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleApply = async () => {
    // If destructive operation (drop column or remove duplicates), require explicit confirmation
    if ((operationType === 'drop_constant_column' || operationType === 'remove_duplicates') && !confirmApply) {
      setConfirmApply(true);
      return;
    }

    setApplyLoading(true);
    setError(null);
    try {
      const res = await applyTransformation(
        dataset.id,
        operationType,
        requiresColumn ? selectedColumn : null,
        {},
        dataset.current_version_id
      );
      if (onTransformationApplied) {
        onTransformationApplied(res);
      }
      setPreviewData(null);
    } catch (err) {
      setError(err.message || 'Failed to apply transformation');
    } finally {
      setApplyLoading(false);
    }
  };

  return (
    <div className="card" style={{ border: '2px solid var(--primary)', marginBottom: '1.5rem', animation: 'fadeIn 0.2s ease-in' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
        <div>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>
            Dataset Cleaning &amp; Versioned Transformations
          </h2>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Simulate non-mutating preview &bull; Apply creates a new immutable version
          </span>
        </div>
        {onClose && (
          <button className="btn btn-outline" style={{ fontSize: '0.8rem', padding: '0.25rem 0.6rem' }} onClick={onClose}>
            &times; Close Panel
          </button>
        )}
      </div>

      {error && (
        <div style={{ padding: '0.75rem 1rem', background: 'var(--danger-bg)', border: '1px solid #fecaca', borderRadius: 'var(--radius-sm)', color: 'var(--danger)', marginBottom: '1rem', fontSize: '0.88rem' }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Operation Configuration Form */}
      <form onSubmit={handlePreview} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', alignItems: 'flex-end', marginBottom: '1rem' }}>
        <div>
          <label htmlFor="operation-select" style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
            Cleaning Operation
          </label>
          <select
            id="operation-select"
            value={operationType}
            onChange={(e) => {
              setOperationType(e.target.value);
              setSelectedColumn('');
              setPreviewData(null);
              setError(null);
            }}
            style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', fontSize: '0.85rem' }}
          >
            <option value="impute_median">1. Impute Missing Values with Median (Numeric)</option>
            <option value="impute_mode">2. Impute Missing Values with Mode (Categorical)</option>
            <option value="remove_duplicates">3. Remove Exact Duplicate Rows</option>
            <option value="drop_constant_column">4. Drop Selected Constant Column</option>
          </select>
        </div>

        {requiresColumn && (
          <div>
            <label htmlFor="target-col" style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
              Target Column
            </label>
            <select
              id="target-col"
              value={selectedColumn}
              onChange={(e) => {
                setSelectedColumn(e.target.value);
                setPreviewData(null);
                setError(null);
              }}
              style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', fontSize: '0.85rem' }}
            >
              <option value="">-- Choose Column --</option>
              {availableColumns.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name} ({c.inferred_type}) {c.null_count > 0 ? `[${c.null_count} nulls]` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', padding: '0.55rem 1rem' }}
            disabled={previewLoading || (requiresColumn && !selectedColumn)}
          >
            {previewLoading ? 'Generating Preview...' : 'Preview Transformation'}
          </button>
        </div>
      </form>

      {/* Non-Mutating Preview Modal / Section */}
      {previewData && (
        <div style={{ background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '1.25rem', marginTop: '1rem', animation: 'fadeIn 0.2s ease-in' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div>
              <span className="badge badge-info" style={{ marginRight: '0.5rem' }}>Non-Mutating Simulation</span>
              <strong style={{ fontSize: '0.95rem' }}>{previewData.summary}</strong>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                className="btn btn-outline"
                style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
                onClick={() => setPreviewData(null)}
              >
                Cancel Preview
              </button>
              <button
                className="btn btn-primary"
                style={{
                  fontSize: '0.8rem',
                  padding: '0.3rem 0.75rem',
                  background: confirmApply ? 'var(--danger)' : 'var(--success)',
                  color: '#fff',
                }}
                onClick={handleApply}
                disabled={applyLoading}
              >
                {applyLoading
                  ? 'Applying & Versioning...'
                  : confirmApply
                  ? 'Confirm & Apply Transformation'
                  : 'Apply (Create New Version)'}
              </button>
            </div>
          </div>

          {confirmApply && (
            <div style={{ background: 'var(--warning-bg)', border: '1px solid #fde68a', color: 'var(--warning)', padding: '0.6rem 0.85rem', borderRadius: 'var(--radius-sm)', fontSize: '0.82rem', marginBottom: '0.75rem' }}>
              <strong>Confirmation Required:</strong> You are about to permanently create a new dataset version with rows or columns removed. Original data remains safely preserved in version 1. Click the button again to confirm.
            </div>
          )}

          {/* Impact Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
            <div style={{ background: '#fff', padding: '0.6rem', borderRadius: '4px', border: '1px solid var(--border)', textAlign: 'center' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>ROWS BEFORE &rarr; AFTER</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>
                {previewData.rows_before} &rarr; {previewData.rows_after}
              </div>
            </div>
            <div style={{ background: '#fff', padding: '0.6rem', borderRadius: '4px', border: '1px solid var(--border)', textAlign: 'center' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>COLUMNS BEFORE &rarr; AFTER</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>
                {previewData.columns_before} &rarr; {previewData.columns_after}
              </div>
            </div>
            <div style={{ background: '#fff', padding: '0.6rem', borderRadius: '4px', border: '1px solid var(--border)', textAlign: 'center' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>ROWS AFFECTED</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--primary)' }}>
                {previewData.rows_affected}
              </div>
            </div>
            <div style={{ background: '#fff', padding: '0.6rem', borderRadius: '4px', border: '1px solid var(--border)', textAlign: 'center' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>CELLS MODIFIED</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--primary)' }}>
                {previewData.cells_affected}
              </div>
            </div>
          </div>

          {/* Sample Diff Changes Table */}
          {previewData.sample_diff && previewData.sample_diff.length > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem', textTransform: 'uppercase' }}>
                Sample Modified Values (First {previewData.sample_diff.length} changes)
              </div>
              <div style={{ overflowX: 'auto', background: '#fff', border: '1px solid var(--border)', borderRadius: '4px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-main)', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '0.4rem 0.6rem' }}>Row Index</th>
                      <th style={{ padding: '0.4rem 0.6rem' }}>Column</th>
                      <th style={{ padding: '0.4rem 0.6rem' }}>Before (Original)</th>
                      <th style={{ padding: '0.4rem 0.6rem' }}>After (Cleaned)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.sample_diff.map((diff, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '0.4rem 0.6rem', color: 'var(--text-muted)' }}>
                          #{diff.row_index ?? i}
                        </td>
                        <td style={{ padding: '0.4rem 0.6rem', fontWeight: 600 }}>
                          <code>{diff.column || previewData.column_name || 'All'}</code>
                        </td>
                        <td style={{ padding: '0.4rem 0.6rem', color: 'var(--danger)' }}>
                          {diff.before !== undefined ? (diff.before === '' ? '<empty/null>' : String(diff.before)) : JSON.stringify(diff.removed_row_data || diff.dropped_column)}
                        </td>
                        <td style={{ padding: '0.4rem 0.6rem', color: 'var(--success)', fontWeight: 600 }}>
                          {diff.after !== undefined ? String(diff.after) : '[Row Dropped]'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Transformed Preview Rows Table */}
          {previewData.preview_rows && previewData.preview_rows.length > 0 && (
            <div>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem', textTransform: 'uppercase' }}>
                Resulting Data Preview (First {previewData.preview_rows.length} rows)
              </div>
              <div style={{ overflowX: 'auto', background: '#fff', border: '1px solid var(--border)', borderRadius: '4px', maxHeight: '240px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-main)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0 }}>
                      {previewData.columns.map((col) => (
                        <th key={col} style={{ padding: '0.4rem 0.6rem', whiteSpace: 'nowrap' }}>
                          <code>{col}</code>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.preview_rows.map((row, rowIdx) => (
                      <tr key={rowIdx} style={{ borderBottom: '1px solid var(--border)' }}>
                        {previewData.columns.map((col) => (
                          <td key={col} style={{ padding: '0.4rem 0.6rem', whiteSpace: 'nowrap' }}>
                            {row[col] !== null ? String(row[col]) : <span style={{ color: 'var(--text-light)', fontStyle: 'italic' }}>null</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
