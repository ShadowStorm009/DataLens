// DataLens API Client

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api/v1';
const HEALTH_URL = (import.meta.env.VITE_API_BASE_URL
  ? import.meta.env.VITE_API_BASE_URL.replace(/\/api\/v1\/?$/, '')
  : 'http://127.0.0.1:8000') + '/health';

/**
 * Perform a GET request to the backend health endpoint.
 */
export async function checkHealth() {
  const response = await fetch(HEALTH_URL);
  if (!response.ok) {
    throw new Error(`Health check failed with status: ${response.status}`);
  }
  return response.json();
}

/**
 * Standard fetch wrapper for DataLens API endpoints
 */
export async function apiClient(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
  
  const headers = {
    'Accept': 'application/json',
    ...options.headers,
  };

  // Do not set Content-Type if sending FormData (browser sets boundary automatically)
  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  const contentType = response.headers.get('content-type');
  const isJson = contentType && contentType.includes('application/json');

  if (!response.ok) {
    let errorDetail = 'API request failed';
    if (isJson) {
      try {
        const errData = await response.json();
        errorDetail = errData.message || errData.detail || JSON.stringify(errData);
      } catch (_) {
        // Fallback to status text
      }
    } else {
      errorDetail = await response.text();
    }
    const error = new Error(errorDetail);
    error.status = response.status;
    throw error;
  }

  if (isJson) {
    return response.json();
  }
  return response;
}

/**
 * Upload a CSV dataset file
 */
export async function uploadDataset(file, name = '') {
  const formData = new FormData();
  formData.append('file', file);
  if (name && name.trim()) {
    formData.append('name', name.trim());
  }

  return apiClient('/datasets', {
    method: 'POST',
    body: formData,
  });
}

/**
 * List stored datasets
 */
export async function listDatasets(skip = 0, limit = 50) {
  return apiClient(`/datasets?skip=${skip}&limit=${limit}`);
}

/**
 * Get dataset details
 */
export async function getDataset(datasetId) {
  return apiClient(`/datasets/${datasetId}`);
}

/**
 * Get a preview of rows for a dataset version (strictly bounded)
 */
export async function getDatasetPreview(datasetId, versionId = null, limit = 20) {
  let url = `/datasets/${datasetId}/preview?limit=${limit}`;
  if (versionId) {
    url += `&version_id=${encodeURIComponent(versionId)}`;
  }
  return apiClient(url);
}

/**
 * Get statistical profile for a dataset version
 */
export async function getDatasetProfile(datasetId, versionId = null) {
  let url = `/datasets/${datasetId}/profile`;
  if (versionId) {
    url += `?version_id=${encodeURIComponent(versionId)}`;
  }
  return apiClient(url);
}

/**
 * Delete a dataset and its versions
 */
export async function deleteDataset(datasetId) {
  return apiClient(`/datasets/${datasetId}`, {
    method: 'DELETE',
  });
}

/**
 * Trigger an audit run for a dataset version
 */
export async function runAudit(datasetId, targetColumn = null, versionId = null) {
  const body = {};
  if (targetColumn) body.target_column = targetColumn;
  if (versionId) body.version_id = versionId;

  return apiClient(`/datasets/${datasetId}/audits`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * List all audit runs for a dataset
 */
export async function listAudits(datasetId, versionId = null) {
  let url = `/datasets/${datasetId}/audits`;
  if (versionId) {
    url += `?version_id=${encodeURIComponent(versionId)}`;
  }
  return apiClient(url);
}

/**
 * Get detailed audit run by ID
 */
export async function getAudit(datasetId, auditId) {
  return apiClient(`/datasets/${datasetId}/audits/${auditId}`);
}

/**
 * Retrieve filtered findings for an audit run
 */
export async function listFindings(datasetId, auditId, { severity, ruleId, columnName } = {}) {
  const params = new URLSearchParams();
  if (severity) params.append('severity', severity);
  if (ruleId) params.append('rule_id', ruleId);
  if (columnName) params.append('column_name', columnName);

  const qs = params.toString();
  return apiClient(`/datasets/${datasetId}/audits/${auditId}/findings${qs ? `?${qs}` : ''}`);
}

export { API_BASE_URL, HEALTH_URL };
