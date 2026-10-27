import {
  saveRouteState,
  syncBrowserUrl,
  clearCachedDataset,
} from '../../utils/navigation.js';

/**
 * Redux middleware that intercepts navigation and dataset actions to:
 * 1. Keep the browser URL synchronized using HTML5 History API (pushState/replaceState).
 * 2. Save strictly sanitized route parameters & minimal dataset cache to ephemeral sessionStorage.
 * 3. Ensure zero persistent footprint on user disk.
 */
export const securePersistenceMiddleware = (store) => (next) => (action) => {
  const result = next(action);

  // If a dataset is deleted, clear its cached entry from sessionStorage immediately
  if (action.type === 'datasets/datasetDeleted') {
    clearCachedDataset(action.payload);
  }

  // Check if this action affects navigation or dataset selection
  if (
    action.type.startsWith('navigation/') ||
    action.type === 'datasets/setSelectedDataset' ||
    action.type === 'datasets/fetchDatasetById/fulfilled' ||
    action.type === 'datasets/datasetUpdated'
  ) {
    const state = store.getState();
    const { view, datasetId, versionId, col, previewId, replaceState } = state.navigation;
    const selectedDataset = state.datasets.selectedDataset;

    const routeState = {
      view,
      datasetId: datasetId || selectedDataset?.id || null,
      versionId: versionId || selectedDataset?.current_version_id || null,
      col,
      previewId,
    };

    // Synchronize browser address bar
    syncBrowserUrl(routeState, replaceState);

    // Save to ephemeral sessionStorage
    saveRouteState({
      ...routeState,
      datasetMeta: selectedDataset,
    });
  }

  return result;
};

export default securePersistenceMiddleware;
