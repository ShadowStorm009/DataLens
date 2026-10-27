import { useState, useRef } from 'react';
import { uploadDataset } from '../api/client';

export default function UploadSection({ onUploadSuccess }) {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [customName, setCustomName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const inputRef = useRef(null);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    setError(null);
    setSuccessMessage(null);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      validateAndSetFile(file);
    }
  };

  const handleFileChange = (e) => {
    setError(null);
    setSuccessMessage(null);
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const validateAndSetFile = (file) => {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('Only CSV (.csv) files are supported for upload.');
      setSelectedFile(null);
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError(`File size (${(file.size / (1024 * 1024)).toFixed(2)} MB) exceeds the 10 MB limit.`);
      setSelectedFile(null);
      return;
    }
    setSelectedFile(file);
    if (!customName) {
      setCustomName(file.name.replace(/\.csv$/i, ''));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (uploading) return;
    if (!selectedFile) {
      setError('Please select a valid CSV file to upload.');
      return;
    }

    setUploading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const dataset = await uploadDataset(selectedFile, customName);
      setSuccessMessage(`Dataset "${dataset.name}" (${dataset.row_count} rows, ${dataset.column_count} columns) uploaded successfully!`);
      setSelectedFile(null);
      setCustomName('');
      if (inputRef.current) inputRef.current.value = '';
      if (onUploadSuccess) onUploadSuccess(dataset);
    } catch (err) {
      setError(err.message || 'Upload failed. Please check the file and try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="card" style={{ marginBottom: '2rem' }}>
      <h2 className="card-title">Upload Dataset for Quality Audit</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
        Upload a tabular CSV file to calculate summary statistics, detect data quality defects, preview transformations, and track dataset versions.
      </p>

      <form onSubmit={handleSubmit}>
        <div
          className={`dropzone ${dragActive ? 'dropzone-active' : ''}`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => inputRef.current && inputRef.current.click()}
          style={{
            border: `2px dashed ${dragActive ? 'var(--primary)' : 'var(--border)'}`,
            borderRadius: 'var(--radius-md)',
            padding: '2.5rem 1.5rem',
            textAlign: 'center',
            backgroundColor: dragActive ? 'var(--primary-light)' : 'var(--bg-main)',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            marginBottom: '1.25rem',
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="1.75">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <div style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text-main)' }}>
              {selectedFile ? selectedFile.name : 'Choose a CSV file or drag and drop here'}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {selectedFile
                ? `${(selectedFile.size / 1024).toFixed(1)} KB — Ready to upload`
                : 'Supported format: CSV (.csv) up to 10 MB'}
            </div>
          </div>
        </div>

        {selectedFile && (
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--text-main)' }}>
              Dataset Name (Optional)
            </label>
            <input
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="e.g. Q1 Customer Demographics"
              style={{
                width: '100%',
                padding: '0.6rem 0.8rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                fontSize: '0.9rem',
                fontFamily: 'inherit',
              }}
            />
          </div>
        )}

        {error && (
          <div style={{ padding: '0.75rem 1rem', background: 'var(--danger-bg)', border: '1px solid #fecaca', borderRadius: 'var(--radius-sm)', color: 'var(--danger)', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
            <strong>Upload Error:</strong> {error}
          </div>
        )}

        {successMessage && (
          <div style={{ padding: '0.75rem 1rem', background: 'var(--success-bg)', border: '1px solid #bbf7d0', borderRadius: 'var(--radius-sm)', color: 'var(--success)', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
            {successMessage}
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!selectedFile || uploading}
          >
            {uploading ? 'Validating & Uploading...' : 'Upload & Validate CSV'}
          </button>
          {selectedFile && (
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => {
                setSelectedFile(null);
                setCustomName('');
                setError(null);
                if (inputRef.current) inputRef.current.value = '';
              }}
              disabled={uploading}
            >
              Cancel
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
