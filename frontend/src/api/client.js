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
        errorDetail = errData.detail || errData.message || JSON.stringify(errData);
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

export { API_BASE_URL, HEALTH_URL };
