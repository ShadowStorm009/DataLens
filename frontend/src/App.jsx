import { useState, useEffect, useCallback } from 'react';
import { checkHealth, deleteDataset } from './api/client';
import { parseCurrentRoute, syncBrowserUrl } from './utils/navigation';
import { useAppDispatch, useAppSelector } from './store';
import {
  navigate,
  setVersionId,
  setProfileColumn,
  openPreview,
  closePreview,
  restoreRoute,
  selectActiveView,
  selectNavDatasetId,
  selectNavVersionId,
  selectNavProfileColumn,
} from './store/navigationSlice';
import {
  fetchDatasets,
  fetchDatasetById,
  fetchPreviewDataset,
  setSelectedDataset,
  setPreviewingDataset,
  datasetAdded,
  datasetUpdated,
  datasetDeleted,
  selectAllDatasets,
  selectDatasetsLoading,
  selectDatasetsError,
  selectSelectedDataset,
  selectPreviewingDataset,
  selectRouteDatasetLoading,
} from './store/datasetsSlice';

import LandingPage from './components/LandingPage';
import AllDatasetsPage from './components/AllDatasetsPage';
import PreviewModal from './components/PreviewModal';
import ProfileView from './components/ProfileView';
import AuditDashboard from './components/AuditDashboard';
import CompareView from './components/CompareView';
import ExportCenter from './components/ExportCenter';

export default function App() {
  const dispatch = useAppDispatch();

  // Redux Selectors
  const activeView = useAppSelector(selectActiveView);
  const navDatasetId = useAppSelector(selectNavDatasetId);
  const navVersionId = useAppSelector(selectNavVersionId);
  const navProfileColumn = useAppSelector(selectNavProfileColumn);

  const datasets = useAppSelector(selectAllDatasets);
  const datasetsLoading = useAppSelector(selectDatasetsLoading);
  const apiError = useAppSelector(selectDatasetsError);
  const selectedDataset = useAppSelector(selectSelectedDataset);
  const previewingDataset = useAppSelector(selectPreviewingDataset);
  const routeDatasetLoading = useAppSelector(selectRouteDatasetLoading);

  // Local Health Check State
  const [health, setHealth] = useState(null);
  const [healthLoading, setHealthLoading] = useState(true);

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

  // Initial load and URL synchronization
  useEffect(() => {
    fetchHealth();
    dispatch(fetchDatasets());

    const initial = parseCurrentRoute();
    // Synchronize initial URL cleanly
    syncBrowserUrl(initial, true);

    // If initial route has a dataset ID, verify and fetch freshest metadata
    if (initial.datasetId) {
      dispatch(fetchDatasetById(initial.datasetId))
        .unwrap()
        .catch(() => {
          // If dataset was deleted or not found, fall back to all-datasets
          if (
            initial.view === 'audit' ||
            initial.view === 'profile' ||
            initial.view === 'compare'
          ) {
            dispatch(navigate({ view: 'all-datasets', datasetId: null, replace: true }));
          }
        });
    }

    // If initial route opened a preview modal
    if (initial.previewId) {
      dispatch(fetchPreviewDataset(initial.previewId));
    }
  }, [dispatch]);

  // Listen for browser Back/Forward (popstate) navigation events
  useEffect(() => {
    const handlePopState = () => {
      const route = parseCurrentRoute();
      dispatch(restoreRoute(route));

      if (route.datasetId) {
        if (!selectedDataset || selectedDataset.id !== route.datasetId) {
          dispatch(fetchDatasetById(route.datasetId));
        }
      } else {
        dispatch(setSelectedDataset(null));
      }

      if (route.previewId) {
        dispatch(fetchPreviewDataset(route.previewId));
      } else {
        dispatch(setPreviewingDataset(null));
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [dispatch, selectedDataset]);

  // Handlers for Redux Actions
  const handleUploadSuccess = useCallback(
    (newDataset) => {
      dispatch(datasetAdded(newDataset));
    },
    [dispatch]
  );

  const handleDelete = useCallback(
    async (datasetId) => {
      try {
        await deleteDataset(datasetId);
        dispatch(datasetDeleted(datasetId));
        if (selectedDataset && selectedDataset.id === datasetId) {
          dispatch(navigate({ view: 'all-datasets', datasetId: null, replace: true }));
        }
      } catch (err) {
        alert(`Failed to delete dataset: ${err.message}`);
      }
    },
    [dispatch, selectedDataset]
  );

  const handleViewAudit = useCallback(
    (dataset, versionId = null) => {
      dispatch(setSelectedDataset(dataset));
      dispatch(
        navigate({
          view: 'audit',
          datasetId: dataset.id,
          versionId: versionId || dataset.current_version_id || null,
          col: null,
          previewId: null,
        })
      );
    },
    [dispatch]
  );

  const handleViewProfile = useCallback(
    (dataset, colName = null) => {
      dispatch(setSelectedDataset(dataset));
      dispatch(
        navigate({
          view: 'profile',
          datasetId: dataset.id,
          col: colName || null,
          previewId: null,
        })
      );
    },
    [dispatch]
  );

  const handleViewCompare = useCallback(
    (dataset) => {
      dispatch(setSelectedDataset(dataset));
      dispatch(
        navigate({
          view: 'compare',
          datasetId: dataset.id,
          col: null,
          previewId: null,
        })
      );
    },
    [dispatch]
  );

  const handleNavigateHome = useCallback(() => {
    dispatch(setSelectedDataset(null));
    dispatch(
      navigate({
        view: 'landing',
        datasetId: null,
        versionId: null,
        col: null,
        previewId: null,
      })
    );
  }, [dispatch]);

  const handleNavigateAllDatasets = useCallback(() => {
    dispatch(setSelectedDataset(null));
    dispatch(
      navigate({
        view: 'all-datasets',
        datasetId: null,
        versionId: null,
        col: null,
        previewId: null,
      })
    );
  }, [dispatch]);

  const handleNavigateExport = useCallback(
    (dataset = null, versionId = null) => {
      const target = dataset || selectedDataset;
      if (target) {
        dispatch(setSelectedDataset(target));
      }
      dispatch(
        navigate({
          view: 'export',
          datasetId: target?.id || null,
          versionId: versionId || navVersionId || target?.current_version_id || null,
          col: null,
          previewId: null,
        })
      );
    },
    [dispatch, selectedDataset, navVersionId]
  );

  const handleVersionChange = useCallback(
    (newVersionId) => {
      dispatch(setVersionId(newVersionId));
    },
    [dispatch]
  );

  const handleProfileColumnChange = useCallback(
    (colName) => {
      dispatch(setProfileColumn(colName));
    },
    [dispatch]
  );

  const handleExportDatasetChange = useCallback(
    (newId) => {
      const match = datasets.find((d) => d.id === newId) || null;
      if (match) {
        dispatch(setSelectedDataset(match));
      }
      dispatch(
        navigate({
          view: 'export',
          datasetId: newId,
          versionId: match?.current_version_id || null,
          replace: true,
        })
      );
    },
    [dispatch, datasets]
  );

  const handleExportVersionChange = useCallback(
    (newVersionId) => {
      dispatch(setVersionId(newVersionId));
    },
    [dispatch]
  );

  const handleDatasetUpdate = useCallback(
    (updatedDataset) => {
      if (!updatedDataset || !updatedDataset.id) return;
      dispatch(datasetUpdated(updatedDataset));
    },
    [dispatch]
  );

  const handleOpenPreview = useCallback(
    (ds) => {
      dispatch(setPreviewingDataset(ds));
      dispatch(openPreview(ds.id));
    },
    [dispatch]
  );

  const handleClosePreview = useCallback(() => {
    dispatch(setPreviewingDataset(null));
    dispatch(closePreview());
  }, [dispatch]);

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
            <button
              className={`nav-tab-btn ${activeView === 'export' ? 'nav-tab-active' : ''}`}
              onClick={() => handleNavigateExport(selectedDataset)}
            >
              Export Center
            </button>
          </nav>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {/* Contextual Back Button when inside details */}
          {(activeView === 'audit' ||
            activeView === 'profile' ||
            activeView === 'compare' ||
            activeView === 'export') && (
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
              onClick={() => dispatch(fetchDatasets())}
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
            onRefresh={() => dispatch(fetchDatasets())}
            onUploadSuccess={handleUploadSuccess}
            onOpenDataset={handleViewAudit}
            onViewProfile={handleViewProfile}
            onPreviewDataset={handleOpenPreview}
            onNavigateToAllDatasets={handleNavigateAllDatasets}
          />
        )}

        {/* View 2: All Datasets Page */}
        {activeView === 'all-datasets' && (
          <AllDatasetsPage
            datasets={datasets}
            loading={datasetsLoading}
            error={apiError}
            onRefresh={() => dispatch(fetchDatasets())}
            onOpenAudit={handleViewAudit}
            onViewProfile={handleViewProfile}
            onPreview={handleOpenPreview}
            onCompare={handleViewCompare}
            onDelete={handleDelete}
            onBackToHome={handleNavigateHome}
          />
        )}

        {/* View 3: Audit Quality Dashboard */}
        {activeView === 'audit' && selectedDataset && (
          <AuditDashboard
            dataset={selectedDataset}
            initialVersionId={navVersionId}
            onVersionChange={handleVersionChange}
            onDatasetUpdate={handleDatasetUpdate}
            onBack={handleNavigateAllDatasets}
            onSwitchToProfile={(colName) => {
              handleViewProfile(selectedDataset, colName);
            }}
            onSwitchToPreview={() => handleOpenPreview(selectedDataset)}
            onSwitchToCompare={() => handleViewCompare(selectedDataset)}
            onSwitchToExport={() => handleNavigateExport(selectedDataset)}
          />
        )}

        {/* View 4: Statistical Profile Explorer */}
        {activeView === 'profile' && selectedDataset && (
          <ProfileView
            dataset={selectedDataset}
            initialColumnName={navProfileColumn}
            onColumnChange={handleProfileColumnChange}
            onBack={handleNavigateAllDatasets}
            onBackToAudit={() => handleViewAudit(selectedDataset)}
            onNavigateToCompare={() => handleViewCompare(selectedDataset)}
          />
        )}

        {/* View 5: Multi-Version Comparison */}
        {activeView === 'compare' && (selectedDataset || navDatasetId) && (
          <CompareView
            datasetId={selectedDataset?.id || navDatasetId}
            onBackToAudit={() => handleViewAudit(selectedDataset || { id: navDatasetId })}
            onBackToDatasets={handleNavigateAllDatasets}
          />
        )}

        {/* View 6: Dedicated Export Center */}
        {activeView === 'export' && (
          <ExportCenter
            datasets={datasets}
            initialDatasetId={selectedDataset?.id || navDatasetId || null}
            initialVersionId={navVersionId || selectedDataset?.current_version_id || null}
            onDatasetChange={handleExportDatasetChange}
            onVersionChange={handleExportVersionChange}
            onNavigateToAudit={handleViewAudit}
            onNavigateToDatasets={handleNavigateAllDatasets}
          />
        )}

        {/* Loading state for single dataset views when selectedDataset is resolving */}
        {(activeView === 'audit' || activeView === 'profile') && !selectedDataset && (
          <div
            className="card"
            style={{
              textAlign: 'center',
              padding: '3.5rem 2rem',
              margin: '3rem auto',
              maxWidth: '540px',
            }}
          >
            {routeDatasetLoading ? (
              <>
                <div
                  style={{
                    width: '40px',
                    height: '40px',
                    border: '3px solid #e2e8f0',
                    borderTopColor: 'var(--primary)',
                    borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite',
                    margin: '0 auto 1.25rem',
                  }}
                />
                <h3 style={{ marginBottom: '0.5rem', fontSize: '1.25rem', color: 'var(--text-main)' }}>
                  Loading Dataset...
                </h3>
                <p style={{ color: 'var(--text-light)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                  Retrieving dataset metadata and audit parameters.
                </p>
              </>
            ) : (
              <>
                <h3 style={{ marginBottom: '0.5rem', fontSize: '1.25rem', color: 'var(--danger)' }}>
                  Dataset Not Found
                </h3>
                <p style={{ color: 'var(--text-light)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                  The requested dataset could not be found or has been removed.
                </p>
                <button className="btn btn-primary" onClick={handleNavigateAllDatasets}>
                  &larr; View All Datasets
                </button>
              </>
            )}
          </div>
        )}

        {/* Bounded Dataset Preview Modal Overlay */}
        {previewingDataset && (
          <PreviewModal
            dataset={previewingDataset}
            onClose={handleClosePreview}
          />
        )}
      </main>

      <footer className="footer">
        DataLens &bull; Deterministic Dataset Quality Auditor &bull; Rule-Based Anomaly Detection &amp; Versioned Auditing
      </footer>
    </div>
  );
}
