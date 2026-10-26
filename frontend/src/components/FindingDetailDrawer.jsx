import React from 'react';

export default function FindingDetailDrawer({ finding, onClose }) {
  if (!finding) return null;

  const severityBadgeClass =
    finding.severity === 'high'
      ? 'badge-high'
      : finding.severity === 'medium'
      ? 'badge-medium'
      : 'badge-low';

  // Format structured evidence for clean presentation
  let evidenceObj = finding.structured_evidence;
  if (typeof evidenceObj === 'string') {
    try {
      evidenceObj = JSON.parse(evidenceObj);
    } catch (_) {}
  }

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer-content" onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
              <span className={`badge ${severityBadgeClass}`}>
                {finding.severity.toUpperCase()} SEVERITY
              </span>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Rule: <code>{finding.rule_id}</code>
              </span>
            </div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 600 }}>{finding.title}</h2>
          </div>
          <button
            className="btn btn-outline"
            style={{ padding: '0.35rem 0.6rem', fontSize: '0.85rem' }}
            onClick={onClose}
          >
            &times; Close
          </button>
        </div>

        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {finding.column_name && (
            <div>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                Affected Column
              </div>
              <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>
                <code>{finding.column_name}</code>
              </div>
            </div>
          )}

          <div>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
              Description
            </div>
            <p style={{ color: 'var(--text-main)', fontSize: '0.9rem', lineHeight: 1.6 }}>
              {finding.description}
            </p>
          </div>

          <div>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
              Actionable Recommendation
            </div>
            <div style={{ padding: '0.85rem 1rem', background: '#f8fafc', borderLeft: '4px solid var(--primary)', borderRadius: 'var(--radius-sm)', fontSize: '0.9rem', color: 'var(--text-main)', lineHeight: 1.5 }}>
              {finding.recommendation}
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
              Deterministic Evidence Data
            </div>
            {evidenceObj && typeof evidenceObj === 'object' ? (
              <div style={{ background: '#0f172a', color: '#f8fafc', padding: '1rem', borderRadius: 'var(--radius-sm)', overflowX: 'auto', fontSize: '0.85rem', fontFamily: 'var(--font-mono)' }}>
                <pre style={{ margin: 0 }}>
                  {JSON.stringify(evidenceObj, null, 2)}
                </pre>
              </div>
            ) : (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                No additional structured data recorded.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
