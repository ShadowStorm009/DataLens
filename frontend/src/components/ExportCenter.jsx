import React, { useState, useEffect, useCallback } from 'react';
import {
  listDatasets,
  getDataset,
  getVersionHistory,
  listAudits,
  runAudit,
  getExportCsvUrl,
  getExportReportUrl,
  getColabNotebookUrl,
  downloadFileFromUrl,
} from '../api/client';

/**
 * Helper to determine if a dataset version represents a cleaned/transformed version
 * (as opposed to the raw/original upload baseline Version 1).
 */
export function isCleanedVersion(version) {
  if (!version || typeof version !== 'object') return false;
  return Boolean(
    (typeof version.version_number === 'number' && version.version_number > 1) ||
    version.transformation ||
    version.parent_version_id
  );
}

export default function ExportCenter({
  datasets: initialDatasets = [],
  initialDatasetId = null,
  initialVersionId = null,
  initialVersions = [],
  onDatasetChange,
  onVersionChange,
  onNavigateToAudit,
  onNavigateToDatasets,
}) {
  const [datasets, setDatasets] = useState(initialDatasets);
  const [loadingDatasets, setLoadingDatasets] = useState(false);
  const [selectedDatasetId, setSelectedDatasetId] = useState(initialDatasetId || '');
  
  // Dataset detail & version states
  const [datasetMeta, setDatasetMeta] = useState(null);
  const [versions, setVersions] = useState(initialVersions);
  const [selectedVersionId, setSelectedVersionId] = useState(initialVersionId || '');
  const [loadingVersions, setLoadingVersions] = useState(false);
  
  // CSV Export configuration
  const [spreadsheetSafe, setSpreadsheetSafe] = useState(false);
  const [isDownloadingCsv, setIsDownloadingCsv] = useState(false);
  const [csvError, setCsvError] = useState(null);
  const [csvSuccess, setCsvSuccess] = useState(null);

  // Colab Export configuration
  const [isDownloadingNotebook, setIsDownloadingNotebook] = useState(false);
  const [notebookError, setNotebookError] = useState(null);
  const [notebookSuccess, setNotebookSuccess] = useState(null);

  // Audit Report configuration
  const [audits, setAudits] = useState([]);
  const [selectedAuditId, setSelectedAuditId] = useState('');
  const [reportFormat, setReportFormat] = useState('html'); // 'html' | 'json'
  const [loadingAudits, setLoadingAudits] = useState(false);
  const [isDownloadingReport, setIsDownloadingReport] = useState(false);
  const [reportError, setReportError] = useState(null);
  const [reportSuccess, setReportSuccess] = useState(null);
  const [isRunningAudit, setIsRunningAudit] = useState(false);

  // Load datasets list if not provided
  useEffect(() => {
    if (!initialDatasets || initialDatasets.length === 0) {
      setLoadingDatasets(true);
      listDatasets()
        .then((res) => {
          const list = res.datasets || [];
          setDatasets(list);
          if (!selectedDatasetId && list.length > 0) {
            setSelectedDatasetId(list[0].id);
          }
        })
        .catch((err) => {
          setCsvError(`Failed to load datasets: ${err.message}`);
        })
        .finally(() => setLoadingDatasets(false));
    } else {
      setDatasets(initialDatasets);
      if (!selectedDatasetId && initialDatasets.length > 0) {
        setSelectedDatasetId(initialDatasets[0].id);
      }
    }
  }, [initialDatasets]);

  // When selectedDatasetId changes, load versions and audits
  const loadDatasetDetails = useCallback(async (datasetId) => {
    if (!datasetId) {
      setVersions([]);
      setAudits([]);
      setDatasetMeta(null);
      return;
    }

    setLoadingVersions(true);
    setLoadingAudits(true);
    setCsvError(null);
    setCsvSuccess(null);
    setNotebookError(null);
    setNotebookSuccess(null);
    setReportError(null);
    setReportSuccess(null);

    try {
      const [metaData, histData, auditsData] = await Promise.all([
        getDataset(datasetId),
        getVersionHistory(datasetId),
        listAudits(datasetId),
      ]);

      setDatasetMeta(metaData);
      
      const vList = histData.versions || [];
      setVersions(vList);
      
      // Select appropriate version
      if (initialVersionId && vList.some((v) => v.version_id === initialVersionId)) {
        setSelectedVersionId(initialVersionId);
      } else if (metaData.current_version_id && vList.some((v) => v.version_id === metaData.current_version_id)) {
        setSelectedVersionId(metaData.current_version_id);
      } else if (vList.length > 0) {
        setSelectedVersionId(vList[vList.length - 1].version_id);
      } else {
        setSelectedVersionId('');
      }

      // Audits
      const aList = auditsData.audits || [];
      // Only consider completed audits
      const completedAudits = aList.filter((a) => a.status === 'completed');
      setAudits(completedAudits);
      if (completedAudits.length > 0) {
        setSelectedAuditId(completedAudits[0].id);
      } else {
        setSelectedAuditId('');
      }
    } catch (err) {
      setCsvError(`Failed to fetch dataset details: ${err.message}`);
    } finally {
      setLoadingVersions(false);
      setLoadingAudits(false);
    }
  }, [initialVersionId]);

  useEffect(() => {
    if (selectedDatasetId) {
      loadDatasetDetails(selectedDatasetId);
    }
  }, [selectedDatasetId, loadDatasetDetails]);

  // Handle switching dataset
  const handleDatasetChange = (e) => {
    const newId = e.target.value;
    setSelectedDatasetId(newId);
    if (onDatasetChange) {
      onDatasetChange(newId);
    }
    setCsvError(null);
    setCsvSuccess(null);
    setReportError(null);
    setReportSuccess(null);
  };

  // Find currently selected objects
  const selectedVersion = versions.find((v) => v.version_id === selectedVersionId) || null;
  const selectedAudit = audits.find((a) => a.id === selectedAuditId) || null;

  // Format operations human-readable
  const formatOperationName = (op) => {
    if (!op) return 'Transformation';
    const dict = {
      remove_duplicates: 'Remove Duplicate Rows',
      drop_missing_rows: 'Drop Rows with Missing Values',
      drop_column: 'Drop Column',
      impute_mean: 'Impute Missing with Mean',
      impute_median: 'Impute Missing with Median',
      impute_mode: 'Impute Missing with Mode',
      impute_constant: 'Impute with Constant',
      standardize_text: 'Standardize Text Format',
      standardize_dates: 'Standardize Date Format',
      trim_whitespace: 'Trim Surrounding Whitespace',
      filter_outliers_iqr: 'Filter Outliers (IQR Method)',
      cap_outliers: 'Cap Outlier Values',
      round_values: 'Round Numeric Values',
    };
    return dict[op] || op.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  };

  // Format date helper
  const formatDate = (isoString) => {
    if (!isoString) return 'Unknown';
    try {
      return new Date(isoString).toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (_) {
      return isoString;
    }
  };

  // Filename preview helper
  const getCleanDatasetName = () => {
    const activeDs = datasets.find((d) => d.id === selectedDatasetId) || null;
    const raw = datasetMeta?.name || activeDs?.name || 'dataset';
    return raw.replace(/[^a-zA-Z0-9_-]/g, '_');
  };

  const getCsvFilenamePreview = () => {
    const name = getCleanDatasetName();
    const verNum = selectedVersion?.version_number || 1;
    const safeSuffix = spreadsheetSafe ? '_spreadsheet_safe' : '';
    return `${name}_v${verNum}${safeSuffix}.csv`;
  };

  const getReportFilenamePreview = () => {
    const name = getCleanDatasetName();
    const auditVer = versions.find((v) => v.version_id === selectedAudit?.version_id);
    const verNum = auditVer?.version_number || selectedVersion?.version_number || 1;
    const ext = reportFormat === 'json' ? 'json' : 'html';
    return `${name}_v${verNum}_audit_report.${ext}`;
  };

  const getColabNotebookFilenamePreview = () => {
    const name = getCleanDatasetName();
    const verNum = selectedVersion?.version_number || 1;
    return `${name}_v${verNum}_colab_starter.ipynb`;
  };

  // Section C Colab Download & Navigation Handlers
  const handleDownloadNotebook = async () => {
    if (!selectedDatasetId || !selectedVersionId) {
      setNotebookError('Please select a valid dataset and version to generate a notebook.');
      return;
    }

    setIsDownloadingNotebook(true);
    setNotebookError(null);
    setNotebookSuccess(null);

    try {
      const url = getColabNotebookUrl(selectedDatasetId, selectedVersionId);
      const expectedFilename = getColabNotebookFilenamePreview();
      await downloadFileFromUrl(url, expectedFilename);
      setNotebookSuccess(`Successfully downloaded Colab starter notebook "${expectedFilename}"`);
    } catch (err) {
      setNotebookError(err.message || 'Failed to download Google Colab notebook. Please try again.');
    } finally {
      setIsDownloadingNotebook(false);
    }
  };

  const handleOpenColab = () => {
    window.open('https://colab.research.google.com/', '_blank', 'noopener,noreferrer');
  };

  // Section A Download Handler
  const handleDownloadCsv = async () => {
    if (!selectedDatasetId || !selectedVersionId) {
      setCsvError('Please select a valid dataset and version.');
      return;
    }

    setIsDownloadingCsv(true);
    setCsvError(null);
    setCsvSuccess(null);

    try {
      const url = getExportCsvUrl(selectedDatasetId, selectedVersionId, spreadsheetSafe);
      const expectedFilename = getCsvFilenamePreview();
      await downloadFileFromUrl(url, expectedFilename);
      setCsvSuccess(`Successfully downloaded "${expectedFilename}"`);
    } catch (err) {
      setCsvError(err.message || 'Failed to download dataset CSV. Please try again.');
    } finally {
      setIsDownloadingCsv(false);
    }
  };

  // Section B Download Handler
  const handleDownloadReport = async () => {
    if (!selectedDatasetId || !selectedAuditId) {
      setReportError('Please select a completed audit run to export.');
      return;
    }

    setIsDownloadingReport(true);
    setReportError(null);
    setReportSuccess(null);

    try {
      const url = getExportReportUrl(selectedDatasetId, selectedAuditId, reportFormat, selectedVersionId);
      const expectedFilename = getReportFilenamePreview();
      await downloadFileFromUrl(url, expectedFilename);
      setReportSuccess(`Successfully downloaded audit report "${expectedFilename}"`);
    } catch (err) {
      setReportError(err.message || 'Failed to download audit report. Please try again.');
    } finally {
      setIsDownloadingReport(false);
    }
  };

  // Trigger audit if none exist
  const handleTriggerAudit = async () => {
    if (!selectedDatasetId) return;
    setIsRunningAudit(true);
    setReportError(null);
    try {
      await runAudit(selectedDatasetId, null, selectedVersionId || null);
      await loadDatasetDetails(selectedDatasetId);
      setReportSuccess('Audit completed! Report is now available for download.');
    } catch (err) {
      setReportError(`Failed to run audit: ${err.message}`);
    } finally {
      setIsRunningAudit(false);
    }
  };

  return (
    <div className="export-center-container" style={{ animation: 'fadeIn 0.2s ease-out' }}>
      {/* Top Header & Breadcrumb */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '1.5rem',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.35rem' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'var(--primary-light)',
                color: 'var(--primary)',
                fontWeight: 'bold',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
            </span>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0, color: 'var(--text-main)' }}>
              Export Center
            </h1>
          </div>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.95rem' }}>
            Download version-controlled dataset snapshots and comprehensive quality audit reports.
          </p>
        </div>

        {onNavigateToDatasets && (
          <button
            className="btn btn-outline"
            onClick={onNavigateToDatasets}
            style={{ fontSize: '0.85rem', padding: '0.45rem 0.9rem' }}
          >
            &larr; Back to All Datasets
          </button>
        )}
      </div>

      {/* Primary Dataset Selector Card */}
      <div className="card" style={{ marginBottom: '2rem', borderLeft: '4px solid var(--primary)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ flex: '1 1 350px' }}>
            <label
              htmlFor="export-dataset-select"
              style={{ display: 'block', fontSize: '0.825rem', fontWeight: 700, color: 'var(--secondary)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}
            >
              Target Dataset
            </label>
            {loadingDatasets ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Loading available datasets...</div>
            ) : datasets.length === 0 ? (
              <div style={{ color: 'var(--danger)', fontSize: '0.9rem' }}>
                No datasets stored in DataLens yet. Please upload a dataset first.
              </div>
            ) : (
              <select
                id="export-dataset-select"
                className="input-select"
                style={{
                  width: '100%',
                  padding: '0.65rem 0.85rem',
                  fontSize: '0.95rem',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                  backgroundColor: '#ffffff',
                  fontWeight: 600,
                  color: 'var(--text-main)',
                }}
                value={selectedDatasetId}
                onChange={handleDatasetChange}
              >
                {datasets.map((ds) => (
                  <option key={ds.id} value={ds.id}>
                    {ds.name} &bull; {ds.row_count?.toLocaleString()} rows &times; {ds.column_count} cols ({ds.original_filename})
                  </option>
                ))}
              </select>
            )}
          </div>

          {datasetMeta && (
            <div
              style={{
                display: 'flex',
                gap: '1.25rem',
                alignItems: 'center',
                padding: '0.65rem 1rem',
                background: 'var(--bg-main)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                fontSize: '0.85rem',
              }}
            >
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Original File: </span>
                <strong style={{ fontFamily: 'var(--font-mono)' }}>{datasetMeta.original_filename}</strong>
              </div>
              <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: '1rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Created: </span>
                <strong>{formatDate(datasetMeta.created_at)}</strong>
              </div>
              <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: '1rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Available Versions: </span>
                <span className="badge badge-info">{versions.length}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Two-Column Layout for Section A and Section B */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(480px, 1fr))', gap: '2rem' }}>
        
        {/* ========================================================================= */}
        {/* SECTION A: DATASET EXPORT */}
        {/* ========================================================================= */}
        <section
          className="card"
          style={{
            margin: 0,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            boxShadow: 'var(--shadow-sm)',
            borderTop: '4px solid #2563eb',
          }}
        >
          <div>
            {/* Section Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.85rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <span style={{ color: 'var(--primary)', display: 'inline-flex' }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="16" y1="13" x2="8" y2="13"></line>
                    <line x1="16" y1="17" x2="8" y2="17"></line>
                    <polyline points="10 9 9 9 8 9"></polyline>
                  </svg>
                </span>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>
                  Section A: Dataset Export
                </h2>
              </div>
              <span className="badge badge-info" style={{ fontWeight: 600 }}>CSV Format</span>
            </div>

            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1.25rem', lineHeight: '1.45' }}>
              Download version-controlled raw or transformed tabular data. All versions are immutable and preserve complete data integrity.
            </p>

            {/* Error Feedback */}
            {csvError && (
              <div
                style={{
                  padding: '0.75rem 1rem',
                  background: 'var(--danger-bg)',
                  border: '1px solid #fecaca',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--danger)',
                  fontSize: '0.85rem',
                  marginBottom: '1rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>⚠️ {csvError}</span>
                <button
                  onClick={() => setCsvError(null)}
                  style={{ color: 'var(--danger)', fontWeight: 'bold', fontSize: '1rem', cursor: 'pointer' }}
                >
                  &times;
                </button>
              </div>
            )}

            {/* Success Feedback */}
            {csvSuccess && (
              <div
                style={{
                  padding: '0.75rem 1rem',
                  background: 'var(--success-bg)',
                  border: '1px solid #bbf7d0',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--success)',
                  fontSize: '0.85rem',
                  marginBottom: '1rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>✓ {csvSuccess}</span>
                <button
                  onClick={() => setCsvSuccess(null)}
                  style={{ color: 'var(--success)', fontWeight: 'bold', fontSize: '1rem', cursor: 'pointer' }}
                >
                  &times;
                </button>
              </div>
            )}

            {/* Version Selection Control */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label
                htmlFor="export-version-select"
                style={{ display: 'block', fontSize: '0.825rem', fontWeight: 700, color: 'var(--secondary)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}
              >
                1. Select Dataset Version
              </label>

              {loadingVersions ? (
                <div style={{ padding: '0.5rem 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                  Loading version lineage...
                </div>
              ) : versions.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No versions available.</div>
              ) : (
                <select
                  id="export-version-select"
                  className="input-select"
                  style={{
                    width: '100%',
                    padding: '0.65rem 0.85rem',
                    fontSize: '0.9rem',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border)',
                    backgroundColor: '#ffffff',
                    color: 'var(--text-main)',
                  }}
                  value={selectedVersionId}
                  onChange={(e) => {
                    setSelectedVersionId(e.target.value);
                    if (onVersionChange) {
                      onVersionChange(e.target.value);
                    }
                    setCsvError(null);
                    setCsvSuccess(null);
                  }}
                >
                  {versions.map((ver) => {
                    const isOriginal = !isCleanedVersion(ver);
                    const typeLabel = isOriginal ? '[Original Upload]' : '[Cleaned / Transformed]';
                    const activeLabel = ver.is_current ? ' (Current Active)' : '';
                    const transformInfo = ver.transformation
                      ? ` - ${formatOperationName(ver.transformation.operation_type)}`
                      : '';
                    return (
                      <option key={ver.version_id} value={ver.version_id}>
                        Version {ver.version_number} {typeLabel}{transformInfo}{activeLabel} &bull; {ver.row_count} rows
                      </option>
                    );
                  })}
                </select>
              )}
            </div>

            {/* Selected Version Metadata Card */}
            {selectedVersion && (
              <div
                style={{
                  background: 'var(--bg-main)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '1rem',
                  marginBottom: '1.25rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <strong style={{ fontSize: '1rem', color: 'var(--text-main)' }}>
                      Version {selectedVersion.version_number}
                    </strong>
                    {!isCleanedVersion(selectedVersion) ? (
                      <span
                        className="badge"
                        style={{
                          background: '#f1f5f9',
                          color: '#475569',
                          border: '1px solid #cbd5e1',
                          fontWeight: 700,
                          fontSize: '0.75rem',
                        }}
                      >
                        Original Upload (v1)
                      </span>
                    ) : (
                      <span
                        className="badge badge-success"
                        style={{ fontWeight: 700, fontSize: '0.75rem' }}
                      >
                        Cleaned / Transformed
                      </span>
                    )}
                    {selectedVersion.is_current && (
                      <span className="badge badge-info" style={{ fontSize: '0.75rem' }}>
                        Active Version
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Created: {formatDate(selectedVersion.created_at)}
                  </span>
                </div>

                {/* Transformation Details if child version */}
                {isCleanedVersion(selectedVersion) && selectedVersion.transformation ? (
                  <div
                    style={{
                      background: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: 'var(--radius-sm)',
                      padding: '0.65rem 0.85rem',
                      marginBottom: '0.75rem',
                      fontSize: '0.825rem',
                    }}
                  >
                    <div style={{ fontWeight: 600, color: '#1e293b', marginBottom: '0.25rem' }}>
                      Applied Transformation:
                    </div>
                    <div style={{ color: 'var(--primary)', fontWeight: 600 }}>
                      &bull; {formatOperationName(selectedVersion.transformation.operation_type)}
                      {selectedVersion.transformation.column_name && (
                        <span> on column <code>{selectedVersion.transformation.column_name}</code></span>
                      )}
                    </div>
                    <div style={{ color: 'var(--text-muted)', marginTop: '0.2rem', fontSize: '0.775rem' }}>
                      Impact: {selectedVersion.transformation.rows_affected} rows affected &bull; {selectedVersion.transformation.cells_affected} cells modified
                      {selectedVersion.parent_version_id && ' &bull; Derived from parent baseline'}
                    </div>
                  </div>
                ) : !isCleanedVersion(selectedVersion) ? (
                  <div
                    style={{
                      background: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: 'var(--radius-sm)',
                      padding: '0.65rem 0.85rem',
                      marginBottom: '0.75rem',
                      fontSize: '0.825rem',
                      color: 'var(--text-muted)',
                    }}
                  >
                    This is the initial, unedited dataset uploaded directly from <strong>{datasetMeta?.original_filename || 'source CSV'}</strong>.
                  </div>
                ) : null}

                {/* Dimensions Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', textAlign: 'center', fontSize: '0.825rem' }}>
                  <div style={{ background: '#ffffff', padding: '0.5rem', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Rows</div>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-main)' }}>
                      {selectedVersion.row_count?.toLocaleString()}
                    </div>
                  </div>
                  <div style={{ background: '#ffffff', padding: '0.5rem', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Columns</div>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-main)' }}>
                      {selectedVersion.column_count}
                    </div>
                  </div>
                  <div style={{ background: '#ffffff', padding: '0.5rem', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Latest Audit Score</div>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', color: selectedVersion.latest_audit?.score >= 80 ? 'var(--success)' : selectedVersion.latest_audit?.score >= 60 ? 'var(--warning)' : 'var(--danger)' }}>
                      {selectedVersion.latest_audit?.score !== undefined ? `${selectedVersion.latest_audit.score}/100` : 'Not audited'}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Option: Spreadsheet-Safe Sanitization Checkbox */}
            <div
              style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                padding: '0.85rem 1rem',
                marginBottom: '1.5rem',
                background: spreadsheetSafe ? 'var(--primary-light)' : '#ffffff',
                borderColor: spreadsheetSafe ? '#bfdbfe' : 'var(--border)',
                transition: 'all 0.15s ease-in-out',
              }}
            >
              <label
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.75rem',
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
              >
                <input
                  type="checkbox"
                  id="spreadsheet-safe-checkbox"
                  checked={spreadsheetSafe}
                  onChange={(e) => setSpreadsheetSafe(e.target.checked)}
                  style={{ marginTop: '0.2rem', width: '16px', height: '16px', cursor: 'pointer' }}
                />
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span>🛡️ Enable Spreadsheet-Safe Mode (CSV Injection Sanitization)</span>
                  </div>
                  <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.775rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                    Prepends a single quote (<code>'</code>) to values beginning with <code>=</code>, <code>+</code>, <code>-</code>, <code>@</code>, <code>\t</code>, or <code>\r</code>. Prevents Microsoft Excel, LibreOffice, and Google Sheets from executing untrusted dynamic formulas or malicious macros.
                  </p>
                </div>
              </label>
            </div>

            {/* Filename Preview */}
            <div style={{ marginBottom: '1.25rem', fontSize: '0.825rem', color: 'var(--text-muted)' }}>
              Export Filename:{' '}
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text-main)',
                  background: 'var(--bg-main)',
                  padding: '0.2rem 0.5rem',
                  borderRadius: '4px',
                  border: '1px solid var(--border)',
                  fontWeight: 600,
                }}
              >
                {getCsvFilenamePreview()}
              </span>
            </div>
          </div>

          {/* Download Action Button */}
          <div>
            <button
              className="btn btn-primary"
              style={{
                width: '100%',
                padding: '0.85rem',
                fontSize: '0.95rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.6rem',
              }}
              onClick={handleDownloadCsv}
              disabled={isDownloadingCsv || !selectedVersionId}
            >
              {isDownloadingCsv ? (
                <>
                  <span className="spinner" style={{ display: 'inline-block', width: '14px', height: '14px', border: '2px solid #ffffff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
                  Preparing CSV Download...
                </>
              ) : (
                <>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                  </svg>
                  Download CSV ({selectedVersion ? `v${selectedVersion.version_number}` : 'Selected Version'})
                </>
              )}
            </button>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* SECTION B: AUDIT REPORT EXPORT */}
        {/* ========================================================================= */}
        <section
          className="card"
          style={{
            margin: 0,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            boxShadow: 'var(--shadow-sm)',
            borderTop: '4px solid #16a34a',
          }}
        >
          <div>
            {/* Section Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.85rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <span style={{ color: 'var(--success)', display: 'inline-flex' }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <path d="M16 13H8"></path>
                    <path d="M16 17H8"></path>
                    <path d="M10 9H8"></path>
                  </svg>
                </span>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>
                  Section B: Audit Report Export
                </h2>
              </div>
              <span className="badge badge-success" style={{ fontWeight: 600 }}>HTML &amp; JSON</span>
            </div>

            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1.25rem', lineHeight: '1.45' }}>
              Export formal audit run reports with complete rule evaluation metrics, severity distributions, penalty breakdowns, and methodology disclaimers.
            </p>

            {/* Error Feedback */}
            {reportError && (
              <div
                style={{
                  padding: '0.75rem 1rem',
                  background: 'var(--danger-bg)',
                  border: '1px solid #fecaca',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--danger)',
                  fontSize: '0.85rem',
                  marginBottom: '1rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>⚠️ {reportError}</span>
                <button
                  onClick={() => setReportError(null)}
                  style={{ color: 'var(--danger)', fontWeight: 'bold', fontSize: '1rem', cursor: 'pointer' }}
                >
                  &times;
                </button>
              </div>
            )}

            {/* Success Feedback */}
            {reportSuccess && (
              <div
                style={{
                  padding: '0.75rem 1rem',
                  background: 'var(--success-bg)',
                  border: '1px solid #bbf7d0',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--success)',
                  fontSize: '0.85rem',
                  marginBottom: '1rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>✓ {reportSuccess}</span>
                <button
                  onClick={() => setReportSuccess(null)}
                  style={{ color: 'var(--success)', fontWeight: 'bold', fontSize: '1rem', cursor: 'pointer' }}
                >
                  &times;
                </button>
              </div>
            )}

            {/* Audit Run Selector */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label
                htmlFor="export-audit-select"
                style={{ display: 'block', fontSize: '0.825rem', fontWeight: 700, color: 'var(--secondary)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}
              >
                1. Select Specific Audit Run
              </label>

              {loadingAudits ? (
                <div style={{ padding: '0.5rem 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                  Loading completed audit runs...
                </div>
              ) : audits.length === 0 ? (
                <div
                  style={{
                    padding: '1rem',
                    background: 'var(--bg-main)',
                    border: '1px dashed var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    textAlign: 'center',
                  }}
                >
                  <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                    No completed audit runs exist for this dataset yet.
                  </p>
                  <button
                    className="btn btn-outline"
                    style={{ fontSize: '0.85rem', padding: '0.4rem 0.85rem' }}
                    onClick={handleTriggerAudit}
                    disabled={isRunningAudit}
                  >
                    {isRunningAudit ? 'Executing Quality Audit...' : '⚡ Run Quality Audit Now'}
                  </button>
                </div>
              ) : (
                <select
                  id="export-audit-select"
                  className="input-select"
                  style={{
                    width: '100%',
                    padding: '0.65rem 0.85rem',
                    fontSize: '0.9rem',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border)',
                    backgroundColor: '#ffffff',
                    color: 'var(--text-main)',
                  }}
                  value={selectedAuditId}
                  onChange={(e) => {
                    setSelectedAuditId(e.target.value);
                    setReportError(null);
                    setReportSuccess(null);
                  }}
                >
                  {audits.map((a, idx) => {
                    const runNum = audits.length - idx;
                    const dateStr = formatDate(a.created_at);
                    const scoreStr = a.score !== null ? `Score: ${a.score}/100` : 'Score: N/A';
                    const findCount = a.findings?.length || 0;
                    // Find version number
                    const auditVer = versions.find((v) => v.version_id === a.version_id);
                    const verNumStr = auditVer ? `v${auditVer.version_number}` : 'version';
                    return (
                      <option key={a.id} value={a.id}>
                        Run #{runNum} &bull; {scoreStr} &bull; {findCount} findings ({verNumStr} on {dateStr})
                      </option>
                    );
                  })}
                </select>
              )}
            </div>

            {/* Selected Audit Metadata Card */}
            {selectedAudit && (
              <div
                style={{
                  background: 'var(--bg-main)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '1rem',
                  marginBottom: '1.25rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '0.2rem 0.6rem',
                        borderRadius: '4px',
                        fontWeight: 800,
                        fontSize: '1rem',
                        background: selectedAudit.score >= 80 ? 'var(--success-bg)' : selectedAudit.score >= 60 ? 'var(--warning-bg)' : 'var(--danger-bg)',
                        color: selectedAudit.score >= 80 ? 'var(--success)' : selectedAudit.score >= 60 ? 'var(--warning)' : 'var(--danger)',
                        border: `1px solid ${selectedAudit.score >= 80 ? '#bbf7d0' : selectedAudit.score >= 60 ? '#fde68a' : '#fecaca'}`,
                      }}
                    >
                      {selectedAudit.score !== null ? `${selectedAudit.score}/100` : 'N/A'}
                    </span>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)' }}>
                      Overall Quality Score
                    </span>
                  </div>
                  <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                    Method: {selectedAudit.score_method_version}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', textAlign: 'center', fontSize: '0.825rem', marginBottom: '0.5rem' }}>
                  <div style={{ background: '#ffffff', padding: '0.5rem', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Total Findings</div>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-main)' }}>
                      {selectedAudit.findings?.length || 0}
                    </div>
                  </div>
                  <div style={{ background: '#ffffff', padding: '0.5rem', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>High Severity</div>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--danger)' }}>
                      {selectedAudit.findings?.filter((f) => f.severity === 'high').length || 0}
                    </div>
                  </div>
                  <div style={{ background: '#ffffff', padding: '0.5rem', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Medium / Low</div>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-main)' }}>
                      {(selectedAudit.findings?.filter((f) => f.severity === 'medium').length || 0) +
                       (selectedAudit.findings?.filter((f) => f.severity === 'low').length || 0)}
                    </div>
                  </div>
                </div>

                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Audited: {formatDate(selectedAudit.created_at)}</span>
                  <span>Audit ID: <code style={{ fontSize: '0.72rem' }}>{selectedAudit.id.slice(0, 8)}...</code></span>
                </div>
              </div>
            )}

            {/* Format Selection (Strictly Implemented Formats) */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label
                style={{ display: 'block', fontSize: '0.825rem', fontWeight: 700, color: 'var(--secondary)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}
              >
                2. Select Export Format
              </label>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                {/* Format 1: HTML */}
                <div
                  onClick={() => setReportFormat('html')}
                  style={{
                    padding: '0.85rem',
                    border: '2px solid',
                    borderColor: reportFormat === 'html' ? 'var(--primary)' : 'var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    background: reportFormat === 'html' ? 'var(--primary-light)' : '#ffffff',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease-in-out',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                    <strong style={{ fontSize: '0.9rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <span>🌐 Interactive HTML</span>
                    </strong>
                    <input
                      type="radio"
                      name="reportFormat"
                      checked={reportFormat === 'html'}
                      onChange={() => setReportFormat('html')}
                    />
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: '1.35' }}>
                    Self-contained visual report with SVG score gauge, penalty breakdown table, structured evidence, and before/after comparisons.
                  </div>
                  <div style={{ marginTop: '0.4rem', fontSize: '0.7rem', fontWeight: 600, color: 'var(--primary)' }}>
                    Best for humans &amp; stakeholders
                  </div>
                </div>

                {/* Format 2: JSON */}
                <div
                  onClick={() => setReportFormat('json')}
                  style={{
                    padding: '0.85rem',
                    border: '2px solid',
                    borderColor: reportFormat === 'json' ? 'var(--primary)' : 'var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    background: reportFormat === 'json' ? 'var(--primary-light)' : '#ffffff',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease-in-out',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                    <strong style={{ fontSize: '0.9rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <span>⚙️ Structured JSON</span>
                    </strong>
                    <input
                      type="radio"
                      name="reportFormat"
                      checked={reportFormat === 'json'}
                      onChange={() => setReportFormat('json')}
                    />
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: '1.35' }}>
                    Complete machine-readable JSON schema containing raw scores, findings arrays, transformation lineage, and comparison deltas.
                  </div>
                  <div style={{ marginTop: '0.4rem', fontSize: '0.7rem', fontWeight: 600, color: 'var(--primary)' }}>
                    Best for CI/CD gates &amp; APIs
                  </div>
                </div>
              </div>

              {/* Explicit Unsupported Format Clarification Callout */}
              <div
                style={{
                  padding: '0.65rem 0.85rem',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.775rem',
                  color: '#64748b',
                  lineHeight: '1.4',
                }}
              >
                <strong>ℹ️ Format Availability Notice:</strong> DataLens natively generates <strong>HTML</strong> and <strong>JSON</strong> audit reports. PDF format is not currently supported on the backend. To generate a PDF, download the standalone HTML report and use your browser's Print to PDF (<code>Ctrl+P</code> / <code>Cmd+P</code>) function.
              </div>
            </div>

            {/* Filename Preview */}
            <div style={{ marginBottom: '1.25rem', fontSize: '0.825rem', color: 'var(--text-muted)' }}>
              Export Filename:{' '}
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text-main)',
                  background: 'var(--bg-main)',
                  padding: '0.2rem 0.5rem',
                  borderRadius: '4px',
                  border: '1px solid var(--border)',
                  fontWeight: 600,
                }}
              >
                {getReportFilenamePreview()}
              </span>
            </div>
          </div>

          {/* Download Action Button */}
          <div>
            <button
              className="btn btn-primary"
              style={{
                width: '100%',
                padding: '0.85rem',
                fontSize: '0.95rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.6rem',
                background: 'var(--success)',
                borderColor: 'var(--success)',
              }}
              onClick={handleDownloadReport}
              disabled={isDownloadingReport || !selectedAuditId}
            >
              {isDownloadingReport ? (
                <>
                  <span className="spinner" style={{ display: 'inline-block', width: '14px', height: '14px', border: '2px solid #ffffff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
                  Generating {reportFormat.toUpperCase()} Report...
                </>
              ) : (
                <>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                  </svg>
                  Download {reportFormat.toUpperCase()} Audit Report
                </>
              )}
            </button>
          </div>
        </section>

      </div>

      {/* ========================================================================= */}
      {/* SECTION C: CONTINUE IN GOOGLE COLAB (ML & MODELING HANDOFF) */}
      {/* ========================================================================= */}
      <section
        className="card"
        style={{
          marginTop: '2rem',
          boxShadow: 'var(--shadow-sm)',
          borderTop: '4px solid #f59e0b',
          padding: '1.75rem',
        }}
      >
        {/* Section Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.85rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <span style={{ color: '#d97706', display: 'inline-flex' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
              </svg>
            </span>
            <div>
              <h2 style={{ fontSize: '1.3rem', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>
                Section C: Continue in Google Colab
              </h2>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Feature Engineering, Train/Test Splitting, and Machine Learning Modeling Handoff
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <span className="badge badge-info" style={{ fontWeight: 600 }}>Jupyter Notebook (.ipynb)</span>
            <span className="badge badge-warning" style={{ fontWeight: 600, color: '#b45309' }}>Google Colab Ready</span>
          </div>
        </div>

        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1.25rem', lineHeight: '1.5' }}>
          Seamlessly continue your data science workflow. Export your validated dataset along with a tailored, pre-configured Jupyter notebook to train models, experiment with feature engineering, and evaluate performance in Google Colab.
        </p>

        {/* Active Dataset & Version Context Bar */}
        {selectedVersion && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.75rem',
              padding: '0.85rem 1rem',
              background: 'var(--bg-main)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              marginBottom: '1.5rem',
              fontSize: '0.85rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span style={{ color: 'var(--text-muted)' }}>Active Export Version:</span>
              <strong>Version {selectedVersion.version_number}</strong>
              {isCleanedVersion(selectedVersion) ? (
                <span className="badge badge-success" style={{ fontSize: '0.725rem' }}>Cleaned / Transformed</span>
              ) : (
                <span className="badge badge-info" style={{ fontSize: '0.725rem' }}>Original Upload (v1)</span>
              )}
              {isCleanedVersion(selectedVersion) && selectedVersion.transformation && (
                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                  ({selectedVersion.transformation.summary || selectedVersion.transformation.operation_type})
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              <span>{selectedVersion.row_count.toLocaleString()} rows × {selectedVersion.column_count} columns</span>
              <span>Expected CSV: <code style={{ color: 'var(--text-main)', fontWeight: 600 }}>{getCsvFilenamePreview()}</code></span>
            </div>
          </div>
        )}

        {/* Error and Success Feedback Alerts */}
        {notebookError && (
          <div
            style={{
              padding: '0.75rem 1rem',
              background: 'var(--danger-bg)',
              border: '1px solid #fecaca',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--danger)',
              fontSize: '0.85rem',
              marginBottom: '1.25rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>⚠️ {notebookError}</span>
            <button
              className="btn btn-outline"
              style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
              onClick={() => setNotebookError(null)}
            >
              Dismiss
            </button>
          </div>
        )}

        {notebookSuccess && (
          <div
            style={{
              padding: '0.75rem 1rem',
              background: 'var(--success-bg)',
              border: '1px solid #bbf7d0',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--success)',
              fontSize: '0.85rem',
              marginBottom: '1.25rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>✓ {notebookSuccess}</span>
            <button
              className="btn btn-outline"
              style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
              onClick={() => setNotebookSuccess(null)}
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Three Key Actions Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '1.25rem',
            marginBottom: '1.75rem',
          }}
        >
          {/* Action 1: Download CSV */}
          <div
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '1.25rem',
              background: '#ffffff',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '1.25rem' }}>📥</span>
                <strong style={{ fontSize: '0.95rem' }}>
                  1. Download {isCleanedVersion(selectedVersion) ? 'Cleaned CSV' : 'Original CSV'}
                </strong>
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: '1.4', marginBottom: '0.75rem' }}>
                Export the exact matching CSV data file for Version {selectedVersion?.version_number || 1}.
              </p>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '1rem', fontFamily: 'var(--font-mono)' }}>
                File: {getCsvFilenamePreview()}
              </div>
            </div>
            <button
              className="btn btn-outline"
              style={{ width: '100%', fontSize: '0.85rem', padding: '0.6rem' }}
              onClick={handleDownloadCsv}
              disabled={isDownloadingCsv || !selectedVersionId}
            >
              {isDownloadingCsv ? 'Downloading CSV...' : `Download ${getCsvFilenamePreview()}`}
            </button>
          </div>

          {/* Action 2: Download Colab Notebook */}
          <div
            style={{
              border: '1px solid #fde68a',
              borderRadius: 'var(--radius-sm)',
              padding: '1.25rem',
              background: '#fffdf5',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '1.25rem' }}>📓</span>
                <strong style={{ fontSize: '0.95rem', color: '#92400e' }}>2. Download Self-Contained Notebook</strong>
              </div>
              <p style={{ fontSize: '0.8rem', color: '#78350f', lineHeight: '1.4', marginBottom: '0.75rem' }}>
                Pre-configured Jupyter notebook with your selected dataset version embedded directly inside. Run all cells in Colab with zero setup—no separate CSV upload needed!
              </p>
              <div style={{ fontSize: '0.75rem', color: '#92400e', marginBottom: '1rem', fontFamily: 'var(--font-mono)' }}>
                File: {getColabNotebookFilenamePreview()}
              </div>
            </div>
            <button
              className="btn btn-primary"
              style={{
                width: '100%',
                fontSize: '0.85rem',
                padding: '0.6rem',
                background: '#d97706',
                borderColor: '#d97706',
              }}
              onClick={handleDownloadNotebook}
              disabled={isDownloadingNotebook || !selectedVersionId}
            >
              {isDownloadingNotebook ? (
                <>
                  <span className="spinner" style={{ display: 'inline-block', width: '12px', height: '12px', border: '2px solid #ffffff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite', marginRight: '0.4rem' }} />
                  Generating Notebook...
                </>
              ) : (
                `Download Notebook (.ipynb)`
              )}
            </button>
          </div>

          {/* Action 3: Open Google Colab */}
          <div
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '1.25rem',
              background: '#ffffff',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '1.25rem' }}>🚀</span>
                <strong style={{ fontSize: '0.95rem' }}>3. Open Google Colab</strong>
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: '1.4', marginBottom: '0.75rem' }}>
                Opens the official Google Colaboratory web research environment in a new browser tab.
              </p>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '1rem', fontFamily: 'var(--font-mono)' }}>
                URL: https://colab.research.google.com/
              </div>
            </div>
            <button
              className="btn btn-outline"
              style={{ width: '100%', fontSize: '0.85rem', padding: '0.6rem', color: 'var(--primary)', borderColor: 'var(--primary)' }}
              onClick={handleOpenColab}
            >
              Open Google Colab ↗
            </button>
          </div>
        </div>

        {/* Step-by-Step Instructions Walkthrough */}
        <div
          style={{
            padding: '1.25rem',
            background: '#f8fafc',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            marginBottom: '1.25rem',
          }}
        >
          <h4 style={{ margin: '0 0 0.85rem 0', fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-main)' }}>
            📖 How to Run Your Self-Contained Workflow in Google Colab:
          </h4>
          <ol style={{ paddingLeft: '1.25rem', margin: 0, fontSize: '0.85rem', color: 'var(--text-main)', lineHeight: '1.6' }}>
            <li style={{ marginBottom: '0.4rem' }}>
              <strong>Download Self-Contained Notebook:</strong> Click <strong>Action 2 (Download Notebook)</strong> above to save <code>{getColabNotebookFilenamePreview()}</code>. The exact selected dataset version is embedded directly inside as a base64 payload.
            </li>
            <li style={{ marginBottom: '0.4rem' }}>
              <strong>Launch Google Colab:</strong> Click <strong>Action 3 (Open Google Colab ↗)</strong> to open <a href="https://colab.research.google.com/" target="_blank" rel="noopener noreferrer">https://colab.research.google.com/</a> in a new tab.
            </li>
            <li style={{ marginBottom: '0.4rem' }}>
              <strong>Upload &amp; Open:</strong> In Colab's modal dialog, select the <strong>Upload</strong> tab (or navigate to <code>File &rarr; Upload notebook</code>) and select your downloaded <code>{getColabNotebookFilenamePreview()}</code> file.
            </li>
            <li style={{ marginBottom: '0.4rem' }}>
              <strong>Run &amp; Auto-Restore:</strong> Run the first code cell in the notebook. It automatically decodes the embedded dataset and creates an in-memory Pandas DataFrame (<code>df</code>) — <strong>no separate CSV upload or server connection needed!</strong>
            </li>
            <li>
              <strong>(Optional) Standalone CSV:</strong> Click <strong>Action 1</strong> if you also wish to download a separate copy of <code>{getCsvFilenamePreview()}</code> for spreadsheets or other external tools.
            </li>
          </ol>
        </div>

        {/* Privacy & Security Guarantee Callout */}
        <div
          style={{
            padding: '0.75rem 1rem',
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.775rem',
            color: '#64748b',
            lineHeight: '1.45',
          }}
        >
          <strong>🔒 Security &amp; Data Privacy Notice:</strong> DataLens runs entirely locally and does not transmit your dataset contents over the network to external Google servers during notebook export. Because the exported <code>.ipynb</code> notebook contains your selected dataset version embedded directly inside it, please treat the downloaded notebook file with the same privacy and confidentiality as your raw data.
        </div>
      </section>

    </div>
  );
}
