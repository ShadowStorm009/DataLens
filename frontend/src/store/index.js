import { configureStore } from '@reduxjs/toolkit';
import { useDispatch, useSelector } from 'react-redux';
import navigationReducer from './navigationSlice.js';
import datasetsReducer from './datasetsSlice.js';
import securePersistenceMiddleware from './middleware/securePersistenceMiddleware.js';

export const store = configureStore({
  reducer: {
    navigation: navigationReducer,
    datasets: datasetsReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // Ignore Date objects in dataset records if any
        ignoredActionPaths: ['payload.created_at'],
        ignoredPaths: ['datasets.datasets', 'datasets.selectedDataset'],
      },
    }).concat(securePersistenceMiddleware),
  devTools: process.env.NODE_ENV !== 'production',
});

// Typed/standardized hook wrappers for components
export const useAppDispatch = () => useDispatch();
export const useAppSelector = useSelector;

export default store;
