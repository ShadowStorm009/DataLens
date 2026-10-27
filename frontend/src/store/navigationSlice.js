import { createSlice } from '@reduxjs/toolkit';
import {
  parseCurrentRoute,
  sanitizeView,
  sanitizeId,
  sanitizeColumnName,
} from '../utils/navigation.js';

const initialRoute = parseCurrentRoute();

const initialState = {
  view: initialRoute.view || 'landing',
  datasetId: initialRoute.datasetId || null,
  versionId: initialRoute.versionId || null,
  col: initialRoute.col || null,
  previewId: initialRoute.previewId || null,
  // Flag indicating if the navigation change should use history.replaceState instead of pushState
  replaceState: false,
};

export const navigationSlice = createSlice({
  name: 'navigation',
  initialState,
  reducers: {
    navigate: (state, action) => {
      const payload = action.payload || {};
      const newView = sanitizeView(payload.view);
      if (newView) {
        state.view = newView;
      }

      if ('datasetId' in payload) {
        state.datasetId = sanitizeId(payload.datasetId);
      }
      if ('versionId' in payload) {
        state.versionId = sanitizeId(payload.versionId);
      }
      if ('col' in payload) {
        state.col = sanitizeColumnName(payload.col);
      }
      if ('previewId' in payload) {
        state.previewId = sanitizeId(payload.previewId);
      }
      state.replaceState = Boolean(payload.replace);
    },

    setVersionId: (state, action) => {
      state.versionId = sanitizeId(action.payload);
      state.replaceState = true;
    },

    setProfileColumn: (state, action) => {
      state.col = sanitizeColumnName(action.payload);
      state.replaceState = true;
    },

    openPreview: (state, action) => {
      state.previewId = sanitizeId(action.payload);
      state.replaceState = true;
    },

    closePreview: (state) => {
      state.previewId = null;
      state.replaceState = true;
    },

    restoreRoute: (state, action) => {
      const route = action.payload || {};
      state.view = sanitizeView(route.view) || 'landing';
      state.datasetId = sanitizeId(route.datasetId);
      state.versionId = sanitizeId(route.versionId);
      state.col = sanitizeColumnName(route.col);
      state.previewId = sanitizeId(route.previewId);
      state.replaceState = true;
    },
  },
});

export const {
  navigate,
  setVersionId,
  setProfileColumn,
  openPreview,
  closePreview,
  restoreRoute,
} = navigationSlice.actions;

// Selectors
export const selectActiveView = (state) => state.navigation.view;
export const selectNavDatasetId = (state) => state.navigation.datasetId;
export const selectNavVersionId = (state) => state.navigation.versionId;
export const selectNavProfileColumn = (state) => state.navigation.col;
export const selectNavPreviewId = (state) => state.navigation.previewId;
export const selectNavigationState = (state) => state.navigation;

export default navigationSlice.reducer;
