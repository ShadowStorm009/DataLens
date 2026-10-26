import { useState, useEffect } from 'react';
import { checkHealth, API_BASE_URL, HEALTH_URL } from './api/client';

export default function App() {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastChecked, setLastChecked] = useState(null);

  const fetchHealth = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await checkHealth();
      setHealth(data);
      setLastChecked(new Date().toLocaleTimeString());
    } catch (err) {
      setError(err.message || 'Unable to connect to DataLens backend API');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  return (
    <div className="app-container">
      <header className="navbar">
        <div className="brand">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <path d="m21 21-4.3-4.3"></path>
          </svg>
          DataLens
          <span className="brand-badge">Auditor MVP</span>
        </div>
        <div>
          <button 
            className="btn btn-outline" 
            onClick={fetchHealth} 
            disabled={loading}
          >
            {loading ? 'Checking...' : 'Ping Backend'}
          </button>
        </div>
      </header>

      <main className="main-content">
        <div className="card">
          <h2 className="card-title">
            Application Foundation & Connectivity
          </h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
            Phase 2 establishes the end-to-end communication channel between the React/Vite frontend and the FastAPI backend.
          </p>

          <div style={{ padding: '1rem', background: 'var(--bg-main)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <strong>Backend Status:</strong>
              {loading && <span className="badge badge-warning">Checking...</span>}
              {!loading && health && <span className="badge badge-success">Connected ({health.status})</span>}
              {!loading && error && <span className="badge badge-danger">Connection Failed</span>}
            </div>

            <div style={{ fontSize: '0.875rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', color: 'var(--text-muted)' }}>
              <div><strong>Backend Health URL:</strong> <code>{HEALTH_URL}</code></div>
              <div><strong>API Base URL:</strong> <code>{API_BASE_URL}</code></div>
              {lastChecked && <div><strong>Last Checked:</strong> {lastChecked}</div>}
              {health && (
                <div>
                  <strong>Response Data:</strong>{' '}
                  <code style={{ background: '#e2e8f0', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>
                    {JSON.stringify(health)}
                  </code>
                </div>
              )}
              {error && (
                <div style={{ color: 'var(--danger)', marginTop: '0.5rem' }}>
                  <strong>Error:</strong> {error}
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1rem' }}>
            <button className="btn btn-primary" onClick={fetchHealth} disabled={loading}>
              {loading ? 'Verifying...' : 'Re-verify Connection'}
            </button>
          </div>
        </div>

        <div className="grid-2">
          <div className="card">
            <h3 className="card-title">Core Workflow Architecture</h3>
            <ol style={{ paddingLeft: '1.25rem', color: 'var(--text-muted)', lineHeight: '1.8' }}>
              <li><strong>Upload & Validation:</strong> Safe CSV parsing and size limits</li>
              <li><strong>Real Profiling:</strong> Statistical summaries (numeric, categorical)</li>
              <li><strong>Deterministic Audit:</strong> Non-LLM rule evaluation</li>
              <li><strong>Actionable Findings:</strong> Numerical evidence and recommendations</li>
              <li><strong>Non-Mutating Preview:</strong> Verify changes before applying</li>
              <li><strong>Version Creation:</strong> Immutable parent history</li>
              <li><strong>Re-Audit & Compare:</strong> Measure data quality improvements</li>
              <li><strong>Export:</strong> Download cleaned CSV and audit report</li>
            </ol>
          </div>

          <div className="card">
            <h3 className="card-title">Technical Foundations</h3>
            <ul style={{ listStyle: 'none', color: 'var(--text-muted)', lineHeight: '1.8' }}>
              <li><strong>Frontend:</strong> React 18, Vite, Vanilla CSS (No Tailwind)</li>
              <li><strong>Backend:</strong> FastAPI, Uvicorn, Pydantic v2</li>
              <li><strong>Data Engine:</strong> Pandas, NumPy</li>
              <li><strong>Persistence:</strong> SQLite, SQLAlchemy ORM</li>
              <li><strong>Testing:</strong> pytest, FastAPI TestClient</li>
              <li><strong>Environment:</strong> Arch Linux isolated Python venv</li>
            </ul>
          </div>
        </div>
      </main>

      <footer className="footer">
        DataLens — Dataset Quality Auditor &copy; 2026. Phase 2 Foundation Verified.
      </footer>
    </div>
  );
}
