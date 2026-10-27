import { useState, useEffect, useCallback } from 'react';
import { checkHealth, listDatasets, deleteDataset } from './api/client';
import LandingPage from './components/LandingPage';
import AllDatasetsPage from './components/AllDatasetsPage';
import PreviewModal from './components/PreviewModal';
import ProfileView from './components/ProfileView';
import AuditDashboard from './components/AuditDashboard';
import CompareView from './components/CompareView';

export default function App() {
  const [health, setHealth] = useState(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [datasets, setDatasets] = useState([]);
  const [datasetsLoading, setDatasetsLoading] = useState(true);
  const [apiError, setApiError] = useState(null);

  // Active view state: 'landing' | 'all-datasets' | 'audit' | 'profile' | 'compare'
  const [activeView, setActiveView] = useState('landing');
  const [selectedDataset, setSelectedDataset] = useState(null);
  const [previewingDataset, setPreviewingDataset] = useState(null);
  const [selectedProfileColumn, setSelectedProfileColumn] = useState(null);

  const fetchHealth = async () => {
    setHealthLoading(true);
    try {
      const data = await checkHealth();
      setHealth(data);
    } catch (_) {
      setHealth(null);
    } finally {
      setHealthLoading(false);
    }
  };

  const fetchDatasets = useCallback(async () => {
    setDatasetsLoading(true);
    setApiError(null);
    try {
      const response = await listDatasets();
      setDatasets(response.datasets || []);
    } catch (err) {
      setApiError(err.message || 'Unable to connect to backend server');
    } finally {
      setDatasetsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    fetchDatasets();
  }, [fetchDatasets]);

  const handleUploadSuccess = (newDataset) => {
    setDatasets((prev) => [newDataset, ...prev.filter((d) => d.id !== newDataset.id)]);
  };

  const handleDelete = async (datasetId) => {
    try {
      await deleteDataset(datasetId);
      setDatasets((prev) => prev.filter((d) => d.id !== datasetId));
      if (selectedDataset && selectedDataset.id === datasetId) {
        setSelectedDataset(null);
        setActiveView('all-datasets');
      }
    } catch (err) {
      alert(`Failed to delete dataset: ${err.message}`);
    }
  };

  const handleViewAudit = (dataset) => {
    setSelectedDataset(dataset);
    setActiveView('audit');
  };

  const handleViewProfile = (dataset) => {
    setSelectedDataset(dataset);
    setActiveView('profile');
  };

  const handleViewCompare = (dataset) => {
    setSelectedDataset(dataset);
    setActiveView('compare');
  };

  const handleNavigateHome = () => {
    setSelectedDataset(null);
    setActiveView('landing');
  };

  const handleNavigateAllDatasets = () => {
    setSelectedDataset(null);
    setActiveView('all-datasets');
  };

  return (
    <div className="app-container">
      {/* Navigation Header */}
      <header className="navbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <div
            className="brand"
            style={{ cursor: 'pointer', userSelect: 'none' }}
            onClick={handleNavigateHome}
            title="Go to DataLens Home"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8"></circle>
              <path d="m21 21-4.3-4.3"></path>
            </svg>
            DataLens
            <span className="brand-badge">Dataset Quality Auditor</span>
          </div>

          {/* Navigation Links */}
          <nav style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              className={`nav-tab-btn ${activeView === 'landing' ? 'nav-tab-active' : ''}`}
              onClick={handleNavigateHome}
            >
              Home
            </button>
            <button
              className={`nav-tab-btn ${activeView === 'all-datasets' ? 'nav-tab-active' : ''}`}
              onClick={handleNavigateAllDatasets}
            >
              All Datasets
              {datasets.length > 0 && (
                <span className="nav-count-badge">
                  {datasets.length}
                </span>
              )}
            </button>
          </nav>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {/* Contextual Back Button when inside details */}
          {(activeView === 'audit' || activeView === 'profile' || activeView === 'compare') && (
            <button
              className="btn btn-outline"
              style={{ padding: '0.35rem 0.75rem', fontSize: '0.825rem' }}
              onClick={handleNavigateAllDatasets}
            >
              &larr; All Datasets
            </button>
          )}

          {/* Backend Connection Health Badge */}
          {healthLoading && <span className="badge badge-warning">Checking Backend...</span>}
          {!healthLoading && health && <span className="badge badge-success">Backend Connected</span>}
          {!healthLoading && !health && <span className="badge badge-danger">Backend Offline</span>}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="main-content">
        {apiError && (
          <div
            style={{
              padding: '1rem',
              background: 'var(--danger-bg)',
              border: '1px solid #fecaca',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--danger)',
              marginBottom: '1.5rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <strong>Connection Error:</strong> {apiError}
            </div>
            <button
              className="btn btn-outline"
              style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
              onClick={fetchDatasets}
            >
              Retry
            </button>
          </div>
        )}

        {/* View 1: Landing Page */}
        {activeView === 'landing' && (
          <LandingPage
            datasets={datasets}
            loading={datasetsLoading}
            error={apiError}
            onRefresh={fetchDatasets}
            onUploadSuccess={handleUploadSuccess}
            onOpenDataset={handleViewAudit}
            onViewProfile={handleViewProfile}
            onPreviewDataset={(ds) => setPreviewingDataset(ds)}
            onNavigateToAllDatasets={handleNavigateAllDatasets}
          />
        )}

        {/* View 2: All Datasets Page */}
        {activeView === 'all-datasets' && (
          <AllDatasetsPage
            datasets={datasets}
            loading={datasetsLoading}
            error={apiError}
            onRefresh={fetchDatasets}
            onOpenAudit={handleViewAudit}
            onViewProfile={handleViewProfile}
            onPreview={(ds) => setPreviewingDataset(ds)}
            onCompare={handleViewCompare}
            onDelete={handleDelete}
            onBackToHome={handleNavigateHome}
          />
        )}

        {/* View 3: Audit Quality Dashboard */}
        {activeView === 'audit' && selectedDataset && (
          <AuditDashboard
            dataset={selectedDataset}
            onBack={handleNavigateAllDatasets}
            onSwitchToProfile={(colName) => {
              setSelectedProfileColumn(colName || null);
              setActiveView('profile');
            }}
            onSwitchToPreview={() => setPreviewingDataset(selectedDataset)}
            onSwitchToCompare={() => setActiveView('compare')}
          />
        )}

        {/* View 4: Statistical Profile Explorer */}
        {activeView === 'profile' && selectedDataset && (
          <ProfileView
            dataset={selectedDataset}
            initialColumnName={selectedProfileColumn}
            onBack={handleNavigateAllDatasets}
            onBackToAudit={() => setActiveView('audit')}
            onNavigateToCompare={() => setActiveView('compare')}
          />
        )}

        {/* View 5: Multi-Version Comparison */}
        {activeView === 'compare' && selectedDataset && (
          <CompareView
            datasetId={selectedDataset.id}
            onBackToAudit={() => setActiveView('audit')}
            onBackToDatasets={handleNavigateAllDatasets}
          />
        )}

        {/* Bounded Dataset Preview Modal Overlay */}
        {previewingDataset && (
          <PreviewModal
            dataset={previewingDataset}
            onClose={() => setPreviewingDataset(null)}
          />
        )}
      </main>

      <footer className="footer">
        DataLens &bull; Deterministic Dataset Quality Auditor &bull; Rule-Based Anomaly Detection &amp; Versioned Auditing
      </footer>
    </div>
  );
}
