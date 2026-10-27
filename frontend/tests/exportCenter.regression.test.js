import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { createServer } from 'vite';

// Initialize Vite in SSR mode to import JSX components
let viteServer;
let ExportCenterModule;
let isCleanedVersion;
let ExportCenter;

test.before(async () => {
  viteServer = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
    root: process.cwd(),
  });
  ExportCenterModule = await viteServer.ssrLoadModule('/src/components/ExportCenter.jsx');
  isCleanedVersion = ExportCenterModule.isCleanedVersion;
  ExportCenter = ExportCenterModule.default;
});

test.after(async () => {
  if (viteServer) {
    await viteServer.close();
  }
});

test('isCleanedVersion - accurately distinguishes between original and cleaned versions', () => {
  assert.strictEqual(typeof isCleanedVersion, 'function', 'isCleanedVersion should be an exported function');

  // Null / undefined / invalid inputs
  assert.strictEqual(isCleanedVersion(null), false);
  assert.strictEqual(isCleanedVersion(undefined), false);
  assert.strictEqual(isCleanedVersion('invalid'), false);
  assert.strictEqual(isCleanedVersion(123), false);
  assert.strictEqual(isCleanedVersion({}), false);

  // Original upload baseline: Version 1 without transformations
  assert.strictEqual(
    isCleanedVersion({
      version_id: 'v-1',
      version_number: 1,
      parent_version_id: null,
      transformation: null,
    }),
    false,
    'Version 1 without transformations must return false (Original Upload)'
  );

  // Cleaned version: Version 2
  assert.strictEqual(
    isCleanedVersion({
      version_id: 'v-2',
      version_number: 2,
      parent_version_id: 'v-1',
      transformation: {
        operation_type: 'remove_duplicates',
        summary: 'Removed 12 duplicate rows',
      },
    }),
    true,
    'Version 2 with transformation must return true (Cleaned / Transformed)'
  );

  // Cleaned version: Version 3 without transformation metadata object
  assert.strictEqual(
    isCleanedVersion({
      version_id: 'v-3',
      version_number: 3,
    }),
    true,
    'Any version number > 1 must return true'
  );

  // Cleaned version: Version with transformation object even if version_number is missing
  assert.strictEqual(
    isCleanedVersion({
      version_id: 'v-custom',
      transformation: { operation_type: 'drop_column', column_name: 'test' },
    }),
    true,
    'Version with attached transformation must return true'
  );

  // Cleaned version: Version with parent_version_id
  assert.strictEqual(
    isCleanedVersion({
      version_id: 'v-child',
      parent_version_id: 'v-parent',
    }),
    true,
    'Version with parent_version_id must return true'
  );
});

test('ExportCenter renders Version 1 (Original Upload) without ReferenceError', () => {
  const mockDataset = {
    id: 'dataset-original',
    name: 'Customer Churn Analysis',
    original_filename: 'churn_data_raw.csv',
    row_count: 500,
    column_count: 10,
    current_version_id: 'v-1',
  };

  const mockVersions = [
    {
      version_id: 'v-1',
      version_number: 1,
      row_count: 500,
      column_count: 10,
      created_at: '2026-10-26T12:00:00Z',
      is_current: true,
      parent_version_id: null,
      transformation: null,
    },
  ];

  let html;
  assert.doesNotThrow(() => {
    html = renderToString(
      React.createElement(ExportCenter, {
        datasets: [mockDataset],
        initialDatasetId: 'dataset-original',
        initialVersionId: 'v-1',
        initialVersions: mockVersions,
      })
    );
  }, 'ExportCenter must render Version 1 without throwing ReferenceError: isCleanedVersion is not defined');

  const cleanHtml = html.replace(/<!--.*?-->/g, '');
  assert.ok(cleanHtml.includes('Original Upload (v1)'), 'Must render Original Upload (v1) badge');
  assert.ok(cleanHtml.includes('1. Download Original CSV'), 'Must render Download Original CSV action label for v1');
  assert.ok(cleanHtml.includes('Customer_Churn_Analysis_v1_colab_starter.ipynb'), 'Must show colab starter notebook preview');
  assert.ok(cleanHtml.includes('Customer_Churn_Analysis_v1.csv'), 'Must show expected CSV filename preview');
});

test('ExportCenter renders Version 2+ (Cleaned / Transformed) without ReferenceError', () => {
  const mockDataset = {
    id: 'dataset-cleaned',
    name: 'Customer Churn Analysis',
    original_filename: 'churn_data_raw.csv',
    row_count: 488,
    column_count: 9,
    current_version_id: 'v-2',
  };

  const mockVersions = [
    {
      version_id: 'v-1',
      version_number: 1,
      row_count: 500,
      column_count: 10,
      created_at: '2026-10-26T12:00:00Z',
      is_current: false,
      parent_version_id: null,
      transformation: null,
    },
    {
      version_id: 'v-2',
      version_number: 2,
      row_count: 488,
      column_count: 9,
      created_at: '2026-10-26T14:30:00Z',
      is_current: true,
      parent_version_id: 'v-1',
      transformation: {
        operation_type: 'remove_duplicates',
        summary: 'Removed 12 duplicate rows and standardized columns',
        rows_affected: 12,
        cells_affected: 120,
      },
    },
  ];

  let html;
  assert.doesNotThrow(() => {
    html = renderToString(
      React.createElement(ExportCenter, {
        datasets: [mockDataset],
        initialDatasetId: 'dataset-cleaned',
        initialVersionId: 'v-2',
        initialVersions: mockVersions,
      })
    );
  }, 'ExportCenter must render Version 2 without throwing ReferenceError: isCleanedVersion is not defined');

  const cleanHtml = html.replace(/<!--.*?-->/g, '');
  assert.ok(cleanHtml.includes('Cleaned / Transformed'), 'Must render Cleaned / Transformed badge');
  assert.ok(cleanHtml.includes('1. Download Cleaned CSV'), 'Must render Download Cleaned CSV action label for v2');
  assert.ok(cleanHtml.includes('Removed 12 duplicate rows and standardized columns'), 'Must display transformation summary');
  assert.ok(cleanHtml.includes('Customer_Churn_Analysis_v2_colab_starter.ipynb'), 'Must show v2 colab notebook preview');
  assert.ok(cleanHtml.includes('Customer_Churn_Analysis_v2.csv'), 'Must show v2 expected CSV filename preview');
});

test('Export Center URL helpers generate correct endpoints for v1 and v2', async () => {
  const clientMod = await viteServer.ssrLoadModule('/src/api/client.js');
  const { getExportCsvUrl, getColabNotebookUrl, getExportReportUrl } = clientMod;

  // Test CSV export URL
  const v1CsvUrl = getExportCsvUrl('ds-123', 'v-1', false);
  assert.ok(v1CsvUrl.includes('/datasets/ds-123/versions/v-1/export'), 'Must target version 1 CSV export endpoint');

  const v2CsvSafeUrl = getExportCsvUrl('ds-123', 'v-2', true);
  assert.ok(v2CsvSafeUrl.includes('/datasets/ds-123/versions/v-2/export?spreadsheet_safe=true'), 'Must include spreadsheet_safe flag for v2');

  // Test Colab notebook export URL
  const v1NotebookUrl = getColabNotebookUrl('ds-123', 'v-1');
  assert.ok(v1NotebookUrl.includes('/datasets/ds-123/versions/v-1/colab-notebook'), 'Must target version 1 notebook endpoint');

  const v2NotebookUrl = getColabNotebookUrl('ds-123', 'v-2');
  assert.ok(v2NotebookUrl.includes('/datasets/ds-123/versions/v-2/colab-notebook'), 'Must target version 2 notebook endpoint');

  // Test Report export URL
  const reportUrl = getExportReportUrl('ds-123', 'audit-999', 'html', 'v-2');
  assert.ok(reportUrl.includes('/datasets/ds-123/audits/audit-999/report?format=html'), 'Must format report URL correctly');
});
