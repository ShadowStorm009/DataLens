// Secure Navigation and Route Persistence Utilities for DataLens
// Designed with zero-leakage ephemeral session storage, strict input validation,
// and prototype pollution defense.

export const STORAGE_KEYS = {
  ACTIVE_VIEW: 'datalens_active_view',
  DATASET_ID: 'datalens_dataset_id',
  VERSION_ID: 'datalens_version_id',
  PROFILE_COL: 'datalens_profile_col',
  PREVIEW_ID: 'datalens_preview_id',
  CACHED_DATASET: 'datalens_cached_dataset',
};

export const VALID_VIEWS = ['landing', 'all-datasets', 'audit', 'profile', 'compare', 'export'];

// Strict ID pattern: alphanumeric, hyphen, underscore; maximum 64 characters (prevents injection / path manipulation)
const SAFE_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

/**
 * Validates and sanitizes a view identifier against an explicit allowlist.
 */
export function sanitizeView(view) {
  if (!view || typeof view !== 'string') return null;
  const trimmed = view.trim().toLowerCase();
  return VALID_VIEWS.includes(trimmed) ? trimmed : null;
}

/**
 * Validates dataset/version/preview IDs against strict alphanumeric constraints.
 */
export function sanitizeId(id) {
  if (!id || typeof id !== 'string') return null;
  const trimmed = id.trim();
  return SAFE_ID_PATTERN.test(trimmed) ? trimmed : null;
}

/**
 * Sanitizes column names by stripping HTML tags, script delimiters, and control characters.
 */
export function sanitizeColumnName(col) {
  if (!col || typeof col !== 'string') return null;
  const cleaned = col.replace(/[<>"'`\\;\x00-\x1F\x7F]/g, '').trim();
  return cleaned.length > 0 && cleaned.length <= 128 ? cleaned : null;
}

/**
 * Secure JSON parser that neutralizes prototype pollution vectors (__proto__, constructor, prototype).
 */
export function safeJsonParse(raw) {
  if (!raw || typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const clean = Object.create(null);
      for (const [key, value] of Object.entries(parsed)) {
        if (key !== '__proto__' && key !== 'constructor' && key !== 'prototype') {
          clean[key] = value;
        }
      }
      return clean;
    }
  } catch (_) {}
  return null;
}

/**
 * Sanitizes dataset metadata to only permit a minimal, safe allowlist of primitive properties.
 * Never stores raw row data, server paths, or arbitrary nested structures.
 */
export function sanitizeDatasetMeta(meta) {
  if (!meta || typeof meta !== 'object') return null;
  const id = sanitizeId(meta.id);
  if (!id) return null;

  return {
    id,
    name: typeof meta.name === 'string' ? meta.name.slice(0, 128).replace(/[<>"'`]/g, '') : '',
    original_filename:
      typeof meta.original_filename === 'string'
        ? meta.original_filename.slice(0, 255).replace(/[<>"'`]/g, '')
        : '',
    row_count:
      typeof meta.row_count === 'number' && Number.isFinite(meta.row_count) ? meta.row_count : 0,
    column_count:
      typeof meta.column_count === 'number' && Number.isFinite(meta.column_count)
        ? meta.column_count
        : 0,
    current_version_id: sanitizeId(meta.current_version_id),
    status:
      typeof meta.status === 'string' ? meta.status.slice(0, 32).replace(/[<>"'`]/g, '') : 'ready',
  };
}

/**
 * Returns the secure storage backend.
 * Uses sessionStorage (tab-isolated, cleared when tab closes, survives page refresh)
 * to avoid leaving persistent traces on shared or work machines.
 */
function getStorage() {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch (_) {
    return null;
  }
}

/**
 * Proactively purges any legacy localStorage keys to ensure zero persistent footprint on disk.
 */
export function purgeLegacyStorage() {
  if (typeof window === 'undefined') return;
  try {
    if (window.localStorage) {
      Object.values(STORAGE_KEYS).forEach((key) => {
        try {
          window.localStorage.removeItem(key);
        } catch (_) {}
      });
    }
  } catch (_) {}
}

// Automatically invoke legacy cleanup once when the module loads
purgeLegacyStorage();

/**
 * Parses and strictly sanitizes current route state from URL search params, URL hash,
 * and falls back to ephemeral sessionStorage.
 */
export function parseCurrentRoute() {
  if (typeof window === 'undefined') {
    return {
      view: 'landing',
      datasetId: null,
      versionId: null,
      col: null,
      previewId: null,
    };
  }

  const searchParams = new URLSearchParams(window.location.search);
  let rawView = searchParams.get('view');
  let rawDatasetId = searchParams.get('datasetId') || searchParams.get('id');
  let rawVersionId = searchParams.get('versionId') || searchParams.get('vid');
  let rawCol = searchParams.get('col') || searchParams.get('column');
  let rawPreviewId = searchParams.get('previewId') || searchParams.get('preview');

  // Check URL hash fallback if not found in query params
  if (!rawView && window.location.hash) {
    const rawHash = window.location.hash.replace(/^#\/?/, '').trim();
    if (rawHash) {
      if (rawHash.includes('?')) {
        const [hashPath, hashQuery] = rawHash.split('?');
        const hashParams = new URLSearchParams(hashQuery);
        rawView = hashPath || hashParams.get('view');
        rawDatasetId = rawDatasetId || hashParams.get('datasetId') || hashParams.get('id');
        rawVersionId = rawVersionId || hashParams.get('versionId') || hashParams.get('vid');
        rawCol = rawCol || hashParams.get('col') || hashParams.get('column');
        rawPreviewId = rawPreviewId || hashParams.get('previewId') || hashParams.get('preview');
      } else if (rawHash === 'datasets' || rawHash === 'all-datasets') {
        rawView = 'all-datasets';
      } else if (rawHash === 'export') {
        rawView = 'export';
      } else if (rawHash === 'landing' || rawHash === 'home') {
        rawView = 'landing';
      } else if (VALID_VIEWS.includes(rawHash)) {
        rawView = rawHash;
      }
    }
  }

  // Fallback to ephemeral sessionStorage if neither query param nor hash was provided
  const storage = getStorage();
  if (!rawView && storage) {
    try {
      rawView = storage.getItem(STORAGE_KEYS.ACTIVE_VIEW);
      rawDatasetId = rawDatasetId || storage.getItem(STORAGE_KEYS.DATASET_ID) || null;
      rawVersionId = rawVersionId || storage.getItem(STORAGE_KEYS.VERSION_ID) || null;
      rawCol = rawCol || storage.getItem(STORAGE_KEYS.PROFILE_COL) || null;
      rawPreviewId = rawPreviewId || storage.getItem(STORAGE_KEYS.PREVIEW_ID) || null;
    } catch (_) {}
  }

  // Strictly sanitize all parameters before returning
  const view = sanitizeView(rawView) || 'landing';
  const datasetId = sanitizeId(rawDatasetId);
  const versionId = sanitizeId(rawVersionId);
  const col = sanitizeColumnName(rawCol);
  const previewId = sanitizeId(rawPreviewId);

  return {
    view,
    datasetId,
    versionId,
    col,
    previewId,
  };
}

/**
 * Builds a deterministic, RFC 3986-compliant sanitized URL reflecting current view state.
 */
export function buildRouteUrl({ view, datasetId, versionId, col, previewId }) {
  if (typeof window === 'undefined') return '/';

  const pathname = window.location.pathname || '/';

  const cleanView = sanitizeView(view) || 'landing';
  const cleanDatasetId = sanitizeId(datasetId);
  const cleanVersionId = sanitizeId(versionId);
  const cleanCol = sanitizeColumnName(col);
  const cleanPreviewId = sanitizeId(previewId);

  // Return base path if on landing page without active dataset or preview modal
  if (cleanView === 'landing' && !cleanDatasetId && !cleanPreviewId) {
    return pathname;
  }

  const params = new URLSearchParams();
  if (cleanView && cleanView !== 'landing') {
    params.set('view', cleanView);
  }
  if (cleanDatasetId) {
    params.set('datasetId', cleanDatasetId);
  }
  if (cleanVersionId) {
    params.set('versionId', cleanVersionId);
  }
  if (cleanCol) {
    params.set('col', cleanCol);
  }
  if (cleanPreviewId) {
    params.set('previewId', cleanPreviewId);
  }

  const queryString = params.toString();
  return queryString ? `${pathname}?${queryString}` : pathname;
}

/**
 * Safely updates the browser's address bar history state using pushState or replaceState.
 */
export function syncBrowserUrl(routeState, replace = false) {
  if (typeof window === 'undefined' || !window.history) return;

  const targetUrl = buildRouteUrl(routeState);
  const currentUrl = (window.location.pathname || '/') + (window.location.search || '');

  if (targetUrl !== currentUrl) {
    if (replace) {
      window.history.replaceState(routeState, '', targetUrl);
    } else {
      window.history.pushState(routeState, '', targetUrl);
    }
  }
}

/**
 * Saves sanitized route state and minimal dataset metadata to ephemeral sessionStorage.
 */
export function saveRouteState({ view, datasetId, versionId, col, previewId, datasetMeta }) {
  const storage = getStorage();
  if (!storage) return;

  try {
    const cleanView = sanitizeView(view);
    const cleanDatasetId = sanitizeId(datasetId);
    const cleanVersionId = sanitizeId(versionId);
    const cleanCol = sanitizeColumnName(col);
    const cleanPreviewId = sanitizeId(previewId);

    if (cleanView) {
      storage.setItem(STORAGE_KEYS.ACTIVE_VIEW, cleanView);
    }

    if (cleanDatasetId) {
      storage.setItem(STORAGE_KEYS.DATASET_ID, cleanDatasetId);
    } else {
      storage.removeItem(STORAGE_KEYS.DATASET_ID);
    }

    if (cleanVersionId) {
      storage.setItem(STORAGE_KEYS.VERSION_ID, cleanVersionId);
    } else {
      storage.removeItem(STORAGE_KEYS.VERSION_ID);
    }

    if (cleanCol) {
      storage.setItem(STORAGE_KEYS.PROFILE_COL, cleanCol);
    } else {
      storage.removeItem(STORAGE_KEYS.PROFILE_COL);
    }

    if (cleanPreviewId) {
      storage.setItem(STORAGE_KEYS.PREVIEW_ID, cleanPreviewId);
    } else {
      storage.removeItem(STORAGE_KEYS.PREVIEW_ID);
    }

    if (datasetMeta && cleanDatasetId) {
      cacheDataset(datasetMeta);
    }
  } catch (_) {}
}

/**
 * Caches strictly sanitized dataset metadata in sessionStorage.
 */
export function cacheDataset(datasetMeta) {
  const storage = getStorage();
  if (!storage) return;

  const sanitized = sanitizeDatasetMeta(datasetMeta);
  if (!sanitized) return;

  try {
    storage.setItem(STORAGE_KEYS.CACHED_DATASET, JSON.stringify(sanitized));
  } catch (_) {}
}

/**
 * Retrieves and validates cached dataset metadata from sessionStorage.
 */
export function getCachedDataset(datasetId = null) {
  const storage = getStorage();
  if (!storage) return null;

  try {
    const raw = storage.getItem(STORAGE_KEYS.CACHED_DATASET);
    if (!raw) return null;

    const parsed = safeJsonParse(raw);
    const sanitized = sanitizeDatasetMeta(parsed);

    if (sanitized) {
      const cleanTargetId = sanitizeId(datasetId);
      if (!cleanTargetId || sanitized.id === cleanTargetId) {
        return sanitized;
      }
    }
  } catch (_) {}
  return null;
}

/**
 * Clears cached dataset from sessionStorage.
 */
export function clearCachedDataset(datasetId = null) {
  const storage = getStorage();
  if (!storage) return;

  try {
    if (!datasetId) {
      storage.removeItem(STORAGE_KEYS.CACHED_DATASET);
    } else {
      const current = getCachedDataset();
      const cleanTargetId = sanitizeId(datasetId);
      if (current && cleanTargetId && current.id === cleanTargetId) {
        storage.removeItem(STORAGE_KEYS.CACHED_DATASET);
      }
    }
  } catch (_) {}
}
