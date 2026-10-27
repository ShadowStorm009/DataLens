// DataLens API Client

const API_BASE_URL = (() => {
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }
  if (typeof window !== 'undefined') {
    // In Vite dev mode (port 5173), default to local backend on 8000
    if (window.location.port === '5173') {
      return 'http://127.0.0.1:8000/api/v1';
    }
    // In production / Docker / same-origin deployment, use relative origin
    return `${window.location.origin}/api/v1`;
  }
  return 'http://127.0.0.1:8000/api/v1';
})();

const HEALTH_URL = (() => {
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL.replace(/\/api\/v1\/?$/, '') + '/health';
  }
  if (typeof window !== 'undefined') {
    if (window.location.port === '5173') {
      return 'http://127.0.0.1:8000/health';
    }
    return `${window.location.origin}/health`;
  }
  return 'http://127.0.0.1:8000/health';
})();

/**
 * Perform a GET request to the backend health endpoint.
 */
export async function checkHealth() {
  try {
    const response = await fetch(HEALTH_URL);
    if (!response.ok) {
      throw new Error(`Health check failed with status: ${response.status}`);
    }
    return await response.json();
  } catch (err) {
    throw new Error(`Backend unavailable: ${err.message}`);
  }
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

  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
    });
  } catch (netErr) {
    const error = new Error(
      `Network Error: Unable to connect to DataLens backend at ${url}. Please verify the FastAPI server is running.`
    );
    error.isNetworkError = true;
    error.status = 0;
    throw error;
  }

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
 * List all versions for a dataset
 */
export async function listVersions(datasetId) {
  return apiClient(`/datasets/${datasetId}/versions`);
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
export async function runAudit(datasetId, targetColumnOrOptions = null, versionId = null) {
  const body = {};
  if (typeof targetColumnOrOptions === 'object' && targetColumnOrOptions !== null) {
    if (targetColumnOrOptions.target_column || targetColumnOrOptions.targetColumn) {
      body.target_column = targetColumnOrOptions.target_column || targetColumnOrOptions.targetColumn;
    }
    if (targetColumnOrOptions.version_id || targetColumnOrOptions.versionId) {
      body.version_id = targetColumnOrOptions.version_id || targetColumnOrOptions.versionId;
    }
  } else if (typeof targetColumnOrOptions === 'string' && targetColumnOrOptions.length === 36 && targetColumnOrOptions.includes('-') && !versionId) {
    body.version_id = targetColumnOrOptions;
  } else {
    if (targetColumnOrOptions) body.target_column = targetColumnOrOptions;
    if (versionId) body.version_id = versionId;
  }

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

/**
 * Preview a cleaning transformation non-mutating
 */
export async function previewTransformation(datasetId, operationType, columnName = null, parameters = {}, versionId = null) {
  const body = {
    operation_type: operationType,
    column_name: columnName,
    parameters: parameters || {},
  };
  if (versionId) body.version_id = versionId;

  return apiClient(`/datasets/${datasetId}/transformations/preview`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * Apply a cleaning transformation and create a new version
 */
export async function applyTransformation(datasetId, operationType, columnName = null, parameters = {}, versionId = null) {
  const body = {
    operation_type: operationType,
    column_name: columnName,
    parameters: parameters || {},
  };
  if (versionId) body.version_id = versionId;

  return apiClient(`/datasets/${datasetId}/transformations/apply`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * List all transformations recorded for a dataset
 */
export async function listTransformations(datasetId) {
  return apiClient(`/datasets/${datasetId}/transformations`);
}

/**
 * Compare two dataset versions
 */
export async function compareVersions(datasetId, v1 = null, v2 = null) {
  let url = `/datasets/${datasetId}/compare`;
  const params = [];
  if (v1) params.push(`v1=${encodeURIComponent(v1)}`);
  if (v2) params.push(`v2=${encodeURIComponent(v2)}`);
  if (params.length > 0) {
    url += `?${params.join('&')}`;
  }
  return apiClient(url);
}

/**
 * Get comprehensive version history with audits and transformation lineage
 */
export async function getVersionHistory(datasetId) {
  return apiClient(`/datasets/${datasetId}/history`);
}

/**
 * Generate CSV export download URL
 */
export function getExportCsvUrl(datasetId, versionId = null, spreadsheetSafe = false) {
  let url = versionId
    ? `${API_BASE_URL}/datasets/${datasetId}/versions/${versionId}/export`
    : `${API_BASE_URL}/datasets/${datasetId}/export`;
  if (spreadsheetSafe) {
    url += '?spreadsheet_safe=true';
  }
  return url;
}

/**
 * Generate Audit Report download URL
 */
export function getExportReportUrl(datasetId, auditId = null, format = 'html', versionId = null) {
  if (auditId) {
    return `${API_BASE_URL}/datasets/${datasetId}/audits/${auditId}/report?format=${format}`;
  }
  if (versionId) {
    return `${API_BASE_URL}/datasets/${datasetId}/versions/${versionId}/report?format=${format}`;
  }
  return `${API_BASE_URL}/datasets/${datasetId}/report?format=${format}`;
}

/**
 * Generate Google Colab Starter Notebook (.ipynb) download URL
 */
export function getColabNotebookUrl(datasetId, versionId = null) {
  if (versionId) {
    return `${API_BASE_URL}/datasets/${datasetId}/versions/${versionId}/colab-notebook`;
  }
  return `${API_BASE_URL}/datasets/${datasetId}/colab-notebook`;
}

/**
 * Trigger browser file download from a given URL with error catching
 */
export async function downloadFileFromUrl(url, defaultFilename = 'datalens_notebook.ipynb') {
  let response;
  try {
    response = await fetch(url);
  } catch (netErr) {
    throw new Error(`Network Error: Unable to reach DataLens backend for download. Please verify the server is running.`);
  }

  if (!response.ok) {
    let errMsg = `Download failed with HTTP ${response.status}`;
    try {
      const errJson = await response.json();
      errMsg = errJson.message || errJson.detail || (typeof errJson.error === 'string' ? errJson.error : errJson.error?.message) || errMsg;
    } catch (e) {
      // Non-JSON response
    }
    throw new Error(errMsg);
  }

  // Attempt to parse filename from Content-Disposition header
  let filename = defaultFilename || 'datalens_notebook.ipynb';
  const disposition = response.headers.get('Content-Disposition') || response.headers.get('content-disposition');
  if (disposition) {
    // RFC 5987 / UTF-8 encoding support: filename*=UTF-8''...
    const utf8Match = disposition.match(/filename\*=UTF-8''([^;\n]*)/i);
    if (utf8Match && utf8Match[1]) {
      try {
        filename = decodeURIComponent(utf8Match[1]).trim();
      } catch (_) {
        filename = utf8Match[1].trim();
      }
    } else {
      const match = disposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/i);
      if (match && match[1]) {
        filename = match[1].replace(/['"]/g, '').trim();
      }
    }
  }

  // Fallback to URL path extraction if still no filename or generic default
  if (!filename || filename === 'datalens_download') {
    try {
      const parsedUrl = new URL(url, window.location.origin);
      const pathname = parsedUrl.pathname;
      const lastSegment = pathname.substring(pathname.lastIndexOf('/') + 1);
      if (lastSegment && lastSegment.includes('.')) {
        filename = lastSegment;
      }
    } catch (_) {}
  }

  // If there is no extension in filename, default to .ipynb as requested
  if (!filename.includes('.')) {
    filename = `${filename}.ipynb`;
  }

  // Explicitly ensure the Blob is typed with the correct MIME type
  let contentType = response.headers.get('Content-Type') || response.headers.get('content-type');
  if (!contentType || contentType.includes('text/plain') || contentType.includes('application/octet-stream')) {
    if (filename.endsWith('.ipynb')) {
      contentType = 'application/x-ipynb+json';
    } else if (filename.endsWith('.csv')) {
      contentType = 'text/csv; charset=utf-8';
    } else if (filename.endsWith('.html')) {
      contentType = 'text/html; charset=utf-8';
    } else if (filename.endsWith('.json')) {
      contentType = 'application/json';
    }
  }

  const rawBlob = await response.blob();
  const typedBlob = new Blob([rawBlob], { type: contentType });
  const objectUrl = window.URL.createObjectURL(typedBlob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => window.URL.revokeObjectURL(objectUrl), 1000);
}

/**
 * Retrieve the latest audit run for a list of dataset IDs in parallel.
 * Returns a map of datasetId -> { score, auditedAt, auditId } or null.
 */
export async function getLatestAuditsForDatasets(datasetIds) {
  if (!datasetIds || datasetIds.length === 0) return {};
  const auditMap = {};
  await Promise.all(
    datasetIds.map(async (id) => {
      try {
        const res = await listAudits(id);
        if (res.audits && res.audits.length > 0) {
          const latest = res.audits[0];
          auditMap[id] = {
            score: latest.score,
            auditedAt: latest.created_at,
            auditId: latest.id,
          };
        } else {
          auditMap[id] = null;
        }
      } catch (_) {
        auditMap[id] = null;
      }
    })
  );
  return auditMap;
}

export { API_BASE_URL, HEALTH_URL };


