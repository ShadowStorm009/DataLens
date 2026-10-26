import { useState, useEffect, useCallback } from 'react';
import { checkHealth, listDatasets, deleteDataset } from './api/client';
import UploadSection from './components/UploadSection';
import DatasetTable from './components/DatasetTable';
import PreviewModal from './components/PreviewModal';
import ProfileView from './components/ProfileView';
import AuditDashboard from './components/AuditDashboard';

export default function App() {
  const [health, setHealth] = useState(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [datasets, setDatasets] = useState([]);
  const [datasetsLoading, setDatasetsLoading] = useState(true);
  const [apiError, setApiError] = useState(null);

  // Active view state
  const [activeView, setActiveView] = useState('inventory'); // 'inventory', 'audit', 'profile'
  const [selectedDataset, setSelectedDataset] = useState(null);
  const [previewingDataset, setPreviewingDataset] = useState(null);

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
    setDatasets((prev) => [newDataset, ...prev]);
    // Navigate straight to the Audit view of the newly uploaded dataset
    setSelectedDataset(newDataset);
    setActiveView('audit');
  };

  const handleDelete = async (datasetId) => {
    try {
      await deleteDataset(datasetId);
      setDatasets((prev) => prev.filter((d) => d.id !== datasetId));
      if (selectedDataset && selectedDataset.id === datasetId) {
        setSelectedDataset(null);
        setActiveView('inventory');
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

  const handleBackToInventory = () => {
    setSelectedDataset(null);
    setActiveView('inventory');
  };

  return (
    <div className="app-container">
      <header className="navbar">
        <div className="brand" style={{ cursor: 'pointer' }} onClick={handleBackToInventory}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <path d="m21 21-4.3-4.3"></path>
          </svg>
          DataLens
          <span className="brand-badge">Dataset Quality Auditor</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {activeView !== 'inventory' && (
            <button
              className="btn btn-outline"
              style={{ padding: '0.35rem 0.75rem', fontSize: '0.85rem' }}
              onClick={handleBackToInventory}
            >
              &larr; All Datasets
            </button>
          )}
          {healthLoading && <span className="badge badge-warning">Checking Backend...</span>}
          {!healthLoading && health && <span className="badge badge-success">Backend Connected</span>}
          {!healthLoading && !health && <span className="badge badge-danger">Backend Offline</span>}
        </div>
      </header>

      <main className="main-content">
        {apiError && (
          <div style={{ padding: '1rem', background: 'var(--danger-bg)', border: '1px solid #fecaca', borderRadius: 'var(--radius-sm)', color: 'var(--danger)', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <strong>Connection Error:</strong> {apiError}
            </div>
            <button className="btn btn-outline" style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }} onClick={fetchDatasets}>
              Retry
            </button>
          </div>
        )}

        {activeView === 'audit' && selectedDataset && (
          <AuditDashboard
            dataset={selectedDataset}
            onBack={handleBackToInventory}
            onSwitchToProfile={() => setActiveView('profile')}
            onSwitchToPreview={() => setPreviewingDataset(selectedDataset)}
          />
        )}

        {activeView === 'profile' && selectedDataset && (
          <ProfileView
            dataset={selectedDataset}
            onBack={handleBackToInventory}
          />
        )}

        {activeView === 'inventory' && (
          <>
            <UploadSection onUploadSuccess={handleUploadSuccess} />

            <DatasetTable
              datasets={datasets}
              loading={datasetsLoading}
              onPreview={(ds) => setPreviewingDataset(ds)}
              onViewProfile={handleViewProfile}
              onViewAudit={handleViewAudit}
              onDelete={handleDelete}
              onRefresh={fetchDatasets}
            />
          </>
        )}

        {previewingDataset && (
          <PreviewModal
            dataset={previewingDataset}
            onClose={() => setPreviewingDataset(null)}
          />
        )}
      </main>

      <footer className="footer">
        DataLens &bull; Deterministic Dataset Quality Auditor &bull; Phase 6 &amp; 7 Audit Engine &amp; Dashboard
      </footer>
    </div>
  );
}
