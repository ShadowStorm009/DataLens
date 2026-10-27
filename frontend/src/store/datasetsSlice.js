import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { listDatasets, getDataset } from '../api/client.js';
import {
  parseCurrentRoute,
  getCachedDataset,
  sanitizeDatasetMeta,
} from '../utils/navigation.js';

const initialRoute = parseCurrentRoute();
const initialCachedDataset = initialRoute.datasetId
  ? getCachedDataset(initialRoute.datasetId)
  : null;
const initialCachedPreview = initialRoute.previewId
  ? getCachedDataset(initialRoute.previewId)
  : null;

export const fetchDatasets = createAsyncThunk(
  'datasets/fetchDatasets',
  async (_, { rejectWithValue }) => {
    try {
      const response = await listDatasets();
      return response.datasets || [];
    } catch (err) {
      return rejectWithValue(err.message || 'Unable to connect to backend server');
    }
  }
);

export const fetchDatasetById = createAsyncThunk(
  'datasets/fetchDatasetById',
  async (datasetId, { rejectWithValue }) => {
    try {
      const dataset = await getDataset(datasetId);
      return dataset;
    } catch (err) {
      return rejectWithValue(err.message || 'Dataset not found');
    }
  }
);

export const fetchPreviewDataset = createAsyncThunk(
  'datasets/fetchPreviewDataset',
  async (previewId, { rejectWithValue }) => {
    try {
      const dataset = await getDataset(previewId);
      return dataset;
    } catch (err) {
      return rejectWithValue(err.message || 'Preview dataset not found');
    }
  }
);

const initialState = {
  datasets: [],
  loading: true,
  error: null,
  selectedDataset: initialCachedDataset,
  previewingDataset: initialCachedPreview,
  routeDatasetLoading: Boolean(initialRoute.datasetId && !initialCachedDataset),
  // In-memory Redux caches to prevent recalculation and redundant network fetches
  auditsByVersion: {},       // { [versionId]: auditObject }
  profilesByVersion: {},     // { [versionId]: profileObject }
  versionsByDataset: {},     // { [datasetId]: versionsArray }
  auditScoresByDataset: {},  // { [datasetId]: { score, auditedAt, auditId } }
};

export const datasetsSlice = createSlice({
  name: 'datasets',
  initialState,
  reducers: {
    setSelectedDataset: (state, action) => {
      state.selectedDataset = action.payload ? sanitizeDatasetMeta(action.payload) || action.payload : null;
    },
    setPreviewingDataset: (state, action) => {
      state.previewingDataset = action.payload ? sanitizeDatasetMeta(action.payload) || action.payload : null;
    },
    datasetAdded: (state, action) => {
      const newDataset = action.payload;
      if (!newDataset || !newDataset.id) return;
      state.datasets = [newDataset, ...state.datasets.filter((d) => d.id !== newDataset.id)];
    },
    datasetUpdated: (state, action) => {
      const updated = action.payload;
      if (!updated || !updated.id) return;
      state.datasets = state.datasets.map((d) =>
        d.id === updated.id ? { ...d, ...updated } : d
      );
      if (state.selectedDataset && state.selectedDataset.id === updated.id) {
        state.selectedDataset = { ...state.selectedDataset, ...updated };
      }
    },
    datasetDeleted: (state, action) => {
      const deletedId = action.payload;
      state.datasets = state.datasets.filter((d) => d.id !== deletedId);
      if (state.selectedDataset && state.selectedDataset.id === deletedId) {
        state.selectedDataset = null;
      }
      if (state.previewingDataset && state.previewingDataset.id === deletedId) {
        state.previewingDataset = null;
      }
      delete state.versionsByDataset[deletedId];
      delete state.auditScoresByDataset[deletedId];
    },
    setCachedAudit: (state, action) => {
      const { versionId, audit } = action.payload || {};
      if (versionId && audit) {
        state.auditsByVersion[versionId] = audit;
        if (audit.dataset_id) {
          state.auditScoresByDataset[audit.dataset_id] = {
            score: audit.score,
            auditedAt: audit.created_at,
            auditId: audit.id,
          };
        }
      }
    },
    setCachedProfile: (state, action) => {
      const { versionId, profile } = action.payload || {};
      if (versionId && profile) {
        state.profilesByVersion[versionId] = profile;
      }
    },
    setCachedVersions: (state, action) => {
      const { datasetId, versions } = action.payload || {};
      if (datasetId && Array.isArray(versions)) {
        state.versionsByDataset[datasetId] = versions;
      }
    },
    setCachedAuditScores: (state, action) => {
      const scoreMap = action.payload;
      if (scoreMap && typeof scoreMap === 'object') {
        state.auditScoresByDataset = { ...state.auditScoresByDataset, ...scoreMap };
      }
    },
  },
  extraReducers: (builder) => {
    builder
      // fetchDatasets
      .addCase(fetchDatasets.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchDatasets.fulfilled, (state, action) => {
        state.loading = false;
        state.datasets = action.payload;
        // Reconcile selectedDataset with fresh metadata if matching
        if (state.selectedDataset) {
          const match = action.payload.find((d) => d.id === state.selectedDataset.id);
          if (match) {
            state.selectedDataset = { ...state.selectedDataset, ...match };
          }
        }
      })
      .addCase(fetchDatasets.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // fetchDatasetById
      .addCase(fetchDatasetById.pending, (state) => {
        state.routeDatasetLoading = !state.selectedDataset;
      })
      .addCase(fetchDatasetById.fulfilled, (state, action) => {
        state.routeDatasetLoading = false;
        state.selectedDataset = action.payload;
      })
      .addCase(fetchDatasetById.rejected, (state) => {
        state.routeDatasetLoading = false;
        state.selectedDataset = null;
      })
      // fetchPreviewDataset
      .addCase(fetchPreviewDataset.fulfilled, (state, action) => {
        state.previewingDataset = action.payload;
      })
      .addCase(fetchPreviewDataset.rejected, (state) => {
        state.previewingDataset = null;
      });
  },
});

export const {
  setSelectedDataset,
  setPreviewingDataset,
  datasetAdded,
  datasetUpdated,
  datasetDeleted,
  setCachedAudit,
  setCachedProfile,
  setCachedVersions,
  setCachedAuditScores,
} = datasetsSlice.actions;

// Selectors
export const selectAllDatasets = (state) => state.datasets.datasets;
export const selectDatasetsLoading = (state) => state.datasets.loading;
export const selectDatasetsError = (state) => state.datasets.error;
export const selectSelectedDataset = (state) => state.datasets.selectedDataset;
export const selectPreviewingDataset = (state) => state.datasets.previewingDataset;
export const selectRouteDatasetLoading = (state) => state.datasets.routeDatasetLoading;

export const selectAuditByVersion = (state, versionId) =>
  versionId ? state.datasets.auditsByVersion[versionId] || null : null;

export const selectProfileByVersion = (state, versionId) =>
  versionId ? state.datasets.profilesByVersion[versionId] || null : null;

export const selectVersionsByDataset = (state, datasetId) =>
  datasetId ? state.datasets.versionsByDataset[datasetId] || null : null;

export const selectAuditScores = (state) => state.datasets.auditScoresByDataset;

export default datasetsSlice.reducer;
