import React, { useState, useEffect } from 'react';
import {
  previewTransformation,
  applyTransformation,
  runAudit,
  getExportCsvUrl,
  getExportReportUrl,
  downloadFileFromUrl,
} from '../api/client';

export default function CleaningWizard({
  dataset,
  profile,
  audit,
  onTransformationApplied,
  onClose,
  initialOperation = null,
  initialColumn = '',
  onNavigateToCompare,
}) {
  // Wizard navigation step: 1 through 6
  const [currentStep, setCurrentStep] = useState(1);

  // -------------------------------------------------------------
  // Persistent Wizard State across Steps
  // -------------------------------------------------------------
  // Step 1: Remove unwanted rows & columns
  const [removeDuplicates, setRemoveDuplicates] = useState(false);
  const [selectedDropColumns, setSelectedDropColumns] = useState([]);

  // Step 2: Handle missing values
  // Map of column_name -> { strategy: 'median' | 'mode' | 'none', fillValue: any }
  const [missingStrategies, setMissingStrategies] = useState({});

  // Step 3: Inconsistent types review
  const [step3Skipped, setStep3Skipped] = useState(false);

  // Step 4: Outliers review
  const [retainOutliers, setRetainOutliers] = useState(true);
  const [step4Skipped, setStep4Skipped] = useState(false);

  // Step 5: Preview state
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [previewError, setPreviewError] = useState(null);
  const [selectedPreviewOpId, setSelectedPreviewOpId] = useState('');

  // Step 6: Execution state
  const [confirmApply, setConfirmApply] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [applyProgress, setApplyProgress] = useState({ current: 0, total: 0, message: '' });
  const [applyError, setApplyError] = useState(null);
  const [executionResult, setExecutionResult] = useState(null);
  const [newAuditResult, setNewAuditResult] = useState(null);
  const [isAuditing, setIsAuditing] = useState(false);

  // Initialize pre-population from audit finding action triggers
  useEffect(() => {
    if (initialOperation === 'remove_duplicates') {
      setRemoveDuplicates(true);
      setCurrentStep(1);
    } else if (initialOperation === 'drop_constant_column' && initialColumn) {
      setSelectedDropColumns([initialColumn]);
      setCurrentStep(1);
    } else if (initialOperation === 'impute_median' && initialColumn) {
      setMissingStrategies((prev) => ({
        ...prev,
        [initialColumn]: { strategy: 'median' },
      }));
      setCurrentStep(2);
    } else if (initialOperation === 'impute_mode' && initialColumn) {
      setMissingStrategies((prev) => ({
        ...prev,
        [initialColumn]: { strategy: 'mode' },
      }));
      setCurrentStep(2);
    }
  }, [initialOperation, initialColumn]);

  // Derived dataset facts
  const columns = profile?.columns || [];
  const currentRows = dataset?.row_count ?? profile?.row_count ?? 0;
  const currentCols = dataset?.column_count ?? profile?.column_count ?? columns.length;

  // Duplicate rows detected from profile/audit
  const duplicateRowsCount =
    audit?.summary?.duplicate_rows ??
    profile?.duplicate_rows ??
    audit?.findings?.find((f) => f.rule_id === 'exact_duplicates')?.structured_evidence?.duplicate_count ??
    0;

  const duplicateRowsPct = currentRows > 0 ? ((duplicateRowsCount / currentRows) * 100).toFixed(1) : '0.0';

  // Constant columns identification
  const constantColumns = columns.filter((c) => c.distinct_count <= 1);
  const constantColumnNames = new Set(constantColumns.map((c) => c.name));

  // Columns with missing values
  const missingColumns = columns.filter((c) => (c.null_count || 0) > 0);

  // Type inconsistency findings from audit
  const typeInconsistencyFindings = (audit?.findings || []).filter(
    (f) => f.rule_id === 'type_inconsistency'
  );

  // Outlier findings from audit
  const outlierFindings = (audit?.findings || []).filter(
    (f) => f.rule_id === 'outliers_iqr'
  );

  // -------------------------------------------------------------
  // Live Projections for Step 1
  // -------------------------------------------------------------
  const pendingRemovedRowsStep1 = removeDuplicates ? duplicateRowsCount : 0;
  const pendingDroppedColsStep1 = selectedDropColumns.length;
  const projectedRowsStep1 = Math.max(0, currentRows - pendingRemovedRowsStep1);
  const projectedColsStep1 = Math.max(0, currentCols - pendingDroppedColsStep1);

  // Toggle column for removal (Step 1)
  const handleToggleDropColumn = (colName) => {
    // Verify constant column safety
    if (!constantColumnNames.has(colName)) {
      return; // Disallow non-constant columns as per backend engine invariant
    }
    setSelectedDropColumns((prev) => {
      if (prev.includes(colName)) {
        return prev.filter((c) => c !== colName);
      } else {
        // Prevent dropping all columns (dataset must retain >= 1 col)
        if (currentCols - (prev.length + 1) < 1) {
          alert('Cannot drop all columns: a dataset must retain at least one column.');
          return prev;
        }
        return [...prev, colName];
      }
    });
  };

  // Compile list of all pending supported operations
  const getPendingOperations = () => {
    const ops = [];

    // 1. Remove duplicates
    if (removeDuplicates && duplicateRowsCount > 0) {
      ops.push({
        id: 'remove_duplicates',
        step: 1,
        operation_type: 'remove_duplicates',
        column_name: null,
        parameters: {},
        title: 'Remove Exact Duplicate Rows',
        description: `Remove ${duplicateRowsCount} duplicate row(s), keeping first occurrence.`,
      });
    }

    // 2. Drop constant columns
    selectedDropColumns.forEach((colName) => {
      ops.push({
        id: `drop_col_${colName}`,
        step: 1,
        operation_type: 'drop_constant_column',
        column_name: colName,
        parameters: {},
        title: `Drop Constant Column: ${colName}`,
        description: `Drop column '${colName}' across all rows.`,
      });
    });

    // 3. Impute missing values
    Object.entries(missingStrategies).forEach(([colName, config]) => {
      if (config?.strategy === 'median') {
        ops.push({
          id: `impute_median_${colName}`,
          step: 2,
          operation_type: 'impute_median',
          column_name: colName,
          parameters: {},
          title: `Impute Missing with Median: ${colName}`,
          description: `Fill null cells in '${colName}' with column median.`,
        });
      } else if (config?.strategy === 'mode') {
        ops.push({
          id: `impute_mode_${colName}`,
          step: 2,
          operation_type: 'impute_mode',
          column_name: colName,
          parameters: {},
          title: `Impute Missing with Mode: ${colName}`,
          description: `Fill null cells in '${colName}' with most frequent mode category.`,
        });
      }
    });

    return ops;
  };

  const pendingOps = getPendingOperations();

  // Auto-select initial preview op id if not set
  useEffect(() => {
    if (pendingOps.length > 0 && !selectedPreviewOpId) {
      setSelectedPreviewOpId(pendingOps[0].id);
    }
  }, [pendingOps.length, selectedPreviewOpId]);

  // Quick helper to configure recommended strategies for all missing columns
  const handleSelectRecommendedAllMissing = () => {
    const newStrategies = {};
    missingColumns.forEach((col) => {
      if (col.inferred_type === 'numeric') {
        newStrategies[col.name] = { strategy: 'median', fillValue: col.median };
      } else {
        const topVal = col.top_values && col.top_values[0]?.value ? col.top_values[0].value : '';
        newStrategies[col.name] = { strategy: 'mode', fillValue: topVal };
      }
    });
    setMissingStrategies(newStrategies);
  };

  // Wizard Steps metadata
  const stepsMeta = [
    { num: 1, title: 'Rows & Columns', subtitle: 'Remove unwanted rows and columns' },
    { num: 2, title: 'Missing Values', subtitle: 'Impute missing cells' },
    { num: 3, title: 'Inconsistent Types', subtitle: 'Review unparseable values' },
    { num: 4, title: 'Outliers', subtitle: 'Review statistical extremes' },
    { num: 5, title: 'Review All', subtitle: 'Inspect combined changes' },
    { num: 6, title: 'Apply & Export', subtitle: 'Create version, re-audit, and export' },
  ];

  // -------------------------------------------------------------
  // Render Step 1: Remove Unwanted Rows and Columns
  // -------------------------------------------------------------
  const renderStep1 = () => (
    <div style={{ animation: 'fadeIn 0.2s ease-in' }}>
      <div style={{ marginBottom: '1.25rem' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 0.35rem 0', color: 'var(--text-main)' }}>
          Step 1: Remove Unwanted Rows and Columns
        </h3>
        <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', margin: 0 }}>
          Review the structure of your dataset. Select constant columns for removal and configure exact duplicate row removal.
          Non-constant columns and arbitrary row deletion are guarded to prevent data corruption.
        </p>
      </div>

      {/* Row-Removal Operations Card */}
      <div
        style={{
          background: '#fff',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          padding: '1.25rem',
          marginBottom: '1.5rem',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
          <h4 style={{ fontSize: '0.95rem', fontWeight: 600, margin: 0 }}>
            Row-Removal Operations
          </h4>
          <span className="badge badge-info" style={{ fontSize: '0.75rem' }}>
            Determinism Enforced
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Operation 1: Remove Exact Duplicates (SUPPORTED) */}
          <label
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.75rem',
              padding: '0.75rem 1rem',
              background: removeDuplicates ? 'var(--primary-light)' : 'var(--bg-main)',
              border: `1px solid ${removeDuplicates ? 'var(--primary)' : 'var(--border)'}`,
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <input
              type="checkbox"
              checked={removeDuplicates}
              onChange={(e) => setRemoveDuplicates(e.target.checked)}
              style={{ marginTop: '0.2rem', width: '16px', height: '16px', cursor: 'pointer' }}
            />
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <strong style={{ fontSize: '0.9rem', color: 'var(--text-main)' }}>
                  Remove Exact Duplicate Rows
                </strong>
                <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>
                  Supported by Backend
                </span>
                {duplicateRowsCount > 0 ? (
                  <span className="badge badge-warning" style={{ fontSize: '0.7rem' }}>
                    {duplicateRowsCount} duplicate(s) detected ({duplicateRowsPct}%)
                  </span>
                ) : (
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    (0 duplicates detected in current version)
                  </span>
                )}
              </div>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '0.25rem 0 0 0' }}>
                Retains the first occurrence of identical rows and drops all subsequent exact duplicates.
              </p>
            </div>
          </label>

          {/* Operation 2: Remove rows with missing values (UNSUPPORTED) */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.75rem',
              padding: '0.75rem 1rem',
              background: '#f8fafc',
              border: '1px dashed var(--border)',
              borderRadius: 'var(--radius-sm)',
              opacity: 0.85,
            }}
          >
            <input
              type="checkbox"
              disabled
              checked={false}
              style={{ marginTop: '0.2rem', width: '16px', height: '16px', cursor: 'not-allowed' }}
            />
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <strong style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                  Drop Rows with Missing Values
                </strong>
                <span className="badge badge-outline" style={{ fontSize: '0.7rem', color: 'var(--danger)', borderColor: '#fca5a5', background: 'var(--danger-bg)' }}>
                  Unsupported by Backend Engine
                </span>
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0.25rem 0 0 0' }}>
                DataLens transformation engine does not support dropping rows by null condition. Arbitrary row deletion causes severe data loss.
                Use <strong>Step 2</strong> to safely impute missing values with median or mode instead.
              </p>
            </div>
          </div>

          {/* Operation 3: Select specific rows for removal (UNSUPPORTED) */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.75rem',
              padding: '0.75rem 1rem',
              background: '#f8fafc',
              border: '1px dashed var(--border)',
              borderRadius: 'var(--radius-sm)',
              opacity: 0.85,
            }}
          >
            <input
              type="checkbox"
              disabled
              checked={false}
              style={{ marginTop: '0.2rem', width: '16px', height: '16px', cursor: 'not-allowed' }}
            />
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <strong style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                  Delete Specific Rows by Index
                </strong>
                <span className="badge badge-outline" style={{ fontSize: '0.7rem', color: 'var(--danger)', borderColor: '#fca5a5', background: 'var(--danger-bg)' }}>
                  Unsupported by Backend Engine
                </span>
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0.25rem 0 0 0' }}>
                Arbitrary row-index deletion is not supported to ensure deterministic reproducibility and audit integrity.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Columns Table with Review & Removal Options */}
      <div
        style={{
          background: '#fff',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          padding: '1.25rem',
          marginBottom: '1.5rem',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <h4 style={{ fontSize: '0.95rem', fontWeight: 600, margin: 0 }}>
              Columns Available for Review and Removal
            </h4>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Constant columns ({constantColumns.length} found) are eligible for removal. Columns with varying data cannot be dropped.
            </span>
          </div>
          {selectedDropColumns.length > 0 && (
            <span className="badge badge-warning" style={{ fontSize: '0.78rem' }}>
              {selectedDropColumns.length} column(s) selected for drop
            </span>
          )}
        </div>

        <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'var(--bg-main)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '0.5rem 0.75rem', width: '40px', textAlign: 'center' }}>Drop?</th>
                <th style={{ padding: '0.5rem 0.75rem' }}>Column Name</th>
                <th style={{ padding: '0.5rem 0.75rem' }}>Inferred Type</th>
                <th style={{ padding: '0.5rem 0.75rem' }}>Missing Values</th>
                <th style={{ padding: '0.5rem 0.75rem' }}>Distinct Values</th>
                <th style={{ padding: '0.5rem 0.75rem' }}>Status / Recommendation</th>
              </tr>
            </thead>
            <tbody>
              {columns.map((col) => {
                const isConstant = constantColumnNames.has(col.name);
                const isSelected = selectedDropColumns.includes(col.name);
                const topVal = col.top_values && col.top_values[0]?.value;

                return (
                  <tr
                    key={col.name}
                    style={{
                      borderBottom: '1px solid var(--border)',
                      background: isSelected
                        ? '#fff1f2'
                        : isConstant
                        ? '#fffbeb'
                        : '#fff',
                    }}
                  >
                    <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={!isConstant}
                        onChange={() => handleToggleDropColumn(col.name)}
                        title={
                          !isConstant
                            ? 'Cannot drop: column contains varying data. Only constant columns can be dropped.'
                            : 'Select to drop this constant column'
                        }
                        style={{ cursor: isConstant ? 'pointer' : 'not-allowed' }}
                      />
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>
                      <code>{col.name}</code>
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>
                      <span className="badge badge-info" style={{ fontSize: '0.75rem' }}>
                        {col.inferred_type}
                      </span>
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>
                      {col.null_count > 0 ? (
                        <span style={{ color: 'var(--danger)', fontWeight: 600 }}>
                          {col.null_count} ({col.null_percentage || '0'}%)
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-light)' }}>0 (0.0%)</span>
                      )}
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>
                      <strong>{col.distinct_count ?? '-'}</strong>{' '}
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                        ({col.distinct_ratio !== undefined ? `${(col.distinct_ratio * 100).toFixed(0)}%` : '-'})
                      </span>
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>
                      {isConstant ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                          <span className="badge badge-warning" style={{ fontSize: '0.7rem' }}>
                            Constant ({topVal !== undefined ? `"${topVal}"` : 'Uniform'})
                          </span>
                          <span style={{ fontSize: '0.75rem', color: isSelected ? 'var(--danger)' : 'var(--text-muted)' }}>
                            {isSelected ? 'Marked for Drop' : 'Eligible for Drop'}
                          </span>
                        </div>
                      ) : (
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                          Varying data (Protected)
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Expected Impact Summary Card */}
      <div
        style={{
          background: 'var(--bg-main)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          padding: '1rem 1.25rem',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
          alignItems: 'center',
        }}
      >
        <div>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Current Dataset Dimensions
          </div>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-main)' }}>
            {currentRows} Rows &times; {currentCols} Columns
          </div>
        </div>

        <div>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Pending Step 1 Removals
          </div>
          <div style={{ fontSize: '1.1rem', fontWeight: 600, color: pendingRemovedRowsStep1 > 0 || pendingDroppedColsStep1 > 0 ? 'var(--primary)' : 'var(--text-muted)' }}>
            {pendingRemovedRowsStep1 > 0 ? `-${pendingRemovedRowsStep1} Rows` : '0 Rows removed'},{' '}
            {pendingDroppedColsStep1 > 0 ? `-${pendingDroppedColsStep1} Columns` : '0 Cols dropped'}
          </div>
        </div>

        <div>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Projected Dimensions after Step 1
          </div>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--success)' }}>
            {projectedRowsStep1} Rows &times; {projectedColsStep1} Columns
          </div>
        </div>
      </div>
    </div>
  );

  // -------------------------------------------------------------
  // Render Step 2: Handle Missing Values
  // -------------------------------------------------------------
  const renderStep2 = () => (
    <div style={{ animation: 'fadeIn 0.2s ease-in' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 0.35rem 0', color: 'var(--text-main)' }}>
            Step 2: Handle Missing Values
          </h3>
          <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', margin: 0 }}>
            Configure safe imputation strategies for columns containing missing values.
            DataLens uses deterministic median for numeric columns and mode for categorical columns.
          </p>
        </div>
        {missingColumns.length > 0 && (
          <button
            className="btn btn-outline"
            style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
            onClick={handleSelectRecommendedAllMissing}
          >
            ⚡ Select Recommended for All Columns
          </button>
        )}
      </div>

      {missingColumns.length === 0 ? (
        <div style={{ padding: '2rem', textAlign: 'center', background: 'var(--success-bg)', border: '1px solid #bbf7d0', borderRadius: 'var(--radius-md)', color: 'var(--success)' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>✓</div>
          <h4 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.25rem' }}>No Missing Values Detected</h4>
          <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', margin: 0 }}>
            Every column in this dataset is 100% complete. You can proceed directly to Step 3.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
          {missingColumns.map((col) => {
            const isNumeric = col.inferred_type === 'numeric';
            const currentStrategy = missingStrategies[col.name]?.strategy || 'none';
            const numericMedian = col.median !== undefined ? col.median : '(median)';
            const topMode = col.top_values && col.top_values[0]?.value ? col.top_values[0].value : '(mode)';

            return (
              <div
                key={col.name}
                style={{
                  background: '#fff',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  padding: '1.25rem',
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <code style={{ fontSize: '1rem', fontWeight: 700 }}>{col.name}</code>
                    <span className="badge badge-info" style={{ fontSize: '0.75rem' }}>
                      {col.inferred_type}
                    </span>
                  </div>
                  <span className="badge badge-danger" style={{ fontSize: '0.75rem' }}>
                    {col.null_count} missing cell(s) ({col.null_percentage || '0'}%)
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  {/* Strategy Option A: Supported (Median or Mode) */}
                  {isNumeric ? (
                    <label
                      style={{
                        padding: '0.75rem',
                        border: `1px solid ${currentStrategy === 'median' ? 'var(--primary)' : 'var(--border)'}`,
                        borderRadius: 'var(--radius-sm)',
                        background: currentStrategy === 'median' ? 'var(--primary-light)' : 'var(--bg-main)',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.25rem',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <input
                          type="radio"
                          name={`strategy_${col.name}`}
                          checked={currentStrategy === 'median'}
                          onChange={() =>
                            setMissingStrategies((prev) => ({
                              ...prev,
                              [col.name]: { strategy: 'median', fillValue: numericMedian },
                            }))
                          }
                        />
                        <strong style={{ fontSize: '0.85rem' }}>Impute with Median</strong>
                        <span className="badge badge-success" style={{ fontSize: '0.65rem' }}>Supported</span>
                      </div>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        Fills missing cells with median ({numericMedian}). Robust to outliers.
                      </span>
                    </label>
                  ) : (
                    <label
                      style={{
                        padding: '0.75rem',
                        border: `1px solid ${currentStrategy === 'mode' ? 'var(--primary)' : 'var(--border)'}`,
                        borderRadius: 'var(--radius-sm)',
                        background: currentStrategy === 'mode' ? 'var(--primary-light)' : 'var(--bg-main)',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.25rem',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <input
                          type="radio"
                          name={`strategy_${col.name}`}
                          checked={currentStrategy === 'mode'}
                          onChange={() =>
                            setMissingStrategies((prev) => ({
                              ...prev,
                              [col.name]: { strategy: 'mode', fillValue: topMode },
                            }))
                          }
                        />
                        <strong style={{ fontSize: '0.85rem' }}>Impute with Mode</strong>
                        <span className="badge badge-success" style={{ fontSize: '0.65rem' }}>Supported</span>
                      </div>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        Fills missing cells with mode category ("{topMode}").
                      </span>
                    </label>
                  )}

                  {/* Strategy Option B: Mean Imputation (UNSUPPORTED) */}
                  <div
                    style={{
                      padding: '0.75rem',
                      border: '1px dashed var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      background: '#f8fafc',
                      opacity: 0.75,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.25rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <input type="radio" disabled checked={false} />
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        {isNumeric ? 'Impute with Mean' : 'Custom Constant Value'}
                      </span>
                      <span className="badge badge-outline" style={{ fontSize: '0.65rem', color: 'var(--danger)', borderColor: '#fca5a5' }}>
                        Unsupported
                      </span>
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {isNumeric
                        ? 'Mean imputation is not currently supported in DataLens engine. Median is recommended.'
                        : 'Arbitrary constant replacement is not supported.'}
                    </span>
                  </div>

                  {/* Strategy Option C: Leave Unchanged */}
                  <label
                    style={{
                      padding: '0.75rem',
                      border: `1px solid ${currentStrategy === 'none' ? 'var(--primary)' : 'var(--border)'}`,
                      borderRadius: 'var(--radius-sm)',
                      background: currentStrategy === 'none' ? 'var(--primary-light)' : 'var(--bg-main)',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.25rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <input
                        type="radio"
                        name={`strategy_${col.name}`}
                        checked={currentStrategy === 'none'}
                        onChange={() =>
                          setMissingStrategies((prev) => ({
                            ...prev,
                            [col.name]: { strategy: 'none' },
                          }))
                        }
                      />
                      <strong style={{ fontSize: '0.85rem' }}>Leave Unchanged</strong>
                    </div>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      Preserve existing null cells in this column without modification.
                    </span>
                  </label>
                </div>

                {/* Expected Effect Summary */}
                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border)', paddingTop: '0.5rem' }}>
                  <strong>Expected effect: </strong>
                  {currentStrategy === 'median' && (
                    <span style={{ color: 'var(--success)' }}>
                      Will impute {col.null_count} null cell(s) in '{col.name}' with median value ({numericMedian}).
                    </span>
                  )}
                  {currentStrategy === 'mode' && (
                    <span style={{ color: 'var(--success)' }}>
                      Will impute {col.null_count} null cell(s) in '{col.name}' with mode category ("{topMode}").
                    </span>
                  )}
                  {currentStrategy === 'none' && (
                    <span>
                      {col.null_count} missing cell(s) will remain unhandled.
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  // -------------------------------------------------------------
  // Render Step 3: Fix Inconsistent Data Types and Values
  // -------------------------------------------------------------
  const renderStep3 = () => (
    <div style={{ animation: 'fadeIn 0.2s ease-in' }}>
      <div style={{ marginBottom: '1.25rem' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 0.35rem 0', color: 'var(--text-main)' }}>
          Step 3: Fix Inconsistent Data Types and Values
        </h3>
        <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', margin: 0 }}>
          Inspect values that cannot be parsed into their column's inferred data type.
          DataLens transformation engine does not perform arbitrary text-to-number coercions to prevent accidental misinterpretation.
        </p>
      </div>

      {typeInconsistencyFindings.length === 0 ? (
        <div style={{ padding: '2rem', textAlign: 'center', background: 'var(--success-bg)', border: '1px solid #bbf7d0', borderRadius: 'var(--radius-md)', color: 'var(--success)', marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>✓</div>
          <h4 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.25rem' }}>No Type Inconsistencies Detected</h4>
          <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', margin: 0 }}>
            All column values conform strictly to their inferred schemas. You can safely proceed to Step 4.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
          {typeInconsistencyFindings.map((finding, idx) => {
            const ev = finding.structured_evidence || {};
            const samples = ev.sample_non_numeric_values || [];

            return (
              <div
                key={idx}
                style={{
                  background: '#fff',
                  border: '1px solid #fecaca',
                  borderRadius: 'var(--radius-md)',
                  padding: '1.25rem',
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span className="badge badge-danger" style={{ fontSize: '0.75rem' }}>Type Inconsistency</span>
                    <code>{finding.column_name || ev.affected_column || 'Column'}</code>
                  </div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--danger)', fontWeight: 600 }}>
                    {ev.non_numeric_count || 1} unparseable value(s) ({ev.non_numeric_percentage || '0'}%)
                  </span>
                </div>

                <p style={{ fontSize: '0.85rem', color: 'var(--text-main)', margin: '0 0 0.75rem 0' }}>
                  {finding.description || 'Values in this column cannot be converted cleanly to numeric format.'}
                </p>

                {samples.length > 0 && (
                  <div style={{ background: '#fef2f2', padding: '0.75rem', borderRadius: 'var(--radius-sm)', marginBottom: '0.75rem', border: '1px solid #fee2e2' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--danger)', marginBottom: '0.35rem', textTransform: 'uppercase' }}>
                      Detected Inconsistent Values
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      {samples.map((val, sIdx) => (
                        <span key={sIdx} style={{ background: '#fff', border: '1px solid #fca5a5', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.85rem', fontFamily: 'monospace', color: 'var(--danger)', fontWeight: 600 }}>
                          "{val}"
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Honest Backend Explanation */}
                <div style={{ background: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '0.75rem', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
                    Backend Engine Notice:
                  </div>
                  DataLens provides deterministic imputation for null cells, exact duplicate removal, and constant column drops.
                  Automated natural language parsing (such as converting English word <code>"eighty"</code> to <code>80.0</code>) or ad-hoc cell overwrites
                  are <strong>not supported</strong> by the transformation engine to prevent corrupting raw record provenance.
                  <div style={{ marginTop: '0.35rem' }}>
                    <strong>Recommended action:</strong> Update the source file prior to upload, or skip this step to leave these values safely unchanged.
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  // -------------------------------------------------------------
  // Render Step 4: Review Outliers
  // -------------------------------------------------------------
  const renderStep4 = () => (
    <div style={{ animation: 'fadeIn 0.2s ease-in' }}>
      <div style={{ marginBottom: '1.25rem' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 0.35rem 0', color: 'var(--text-main)' }}>
          Step 4: Review Outliers
        </h3>
        <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', margin: 0 }}>
          Review statistical outliers detected via Tukey's IQR rule.
          Outliers are candidates for domain inspection, not automatically data errors.
        </p>
      </div>

      {/* Educational Banner */}
      <div style={{ background: 'var(--primary-light)', border: '1px solid var(--primary-border)', borderRadius: 'var(--radius-md)', padding: '1rem', marginBottom: '1.25rem', fontSize: '0.85rem', color: 'var(--text-main)' }}>
        <strong>Important Data Quality Principle:</strong> Statistical outliers (values beyond Tukey's fences: <code>Q1 - 1.5&times;IQR</code> or <code>Q3 + 1.5&times;IQR</code>) are candidates for inspection, NOT automatically defects.
        In DataLens, outlier handling remains <strong>inspection-only</strong> by design to prevent data distortion or accidental loss of genuine extreme measurements.
      </div>

      {outlierFindings.length === 0 ? (
        <div style={{ padding: '2rem', textAlign: 'center', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
          <h4 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.25rem' }}>No Statistical Outliers Flagged</h4>
          <p style={{ fontSize: '0.85rem', margin: 0 }}>
            No columns exhibited values beyond standard Tukey IQR fences.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
          {outlierFindings.map((finding, idx) => {
            const ev = finding.structured_evidence || {};
            const samples = ev.sample_outliers || [];

            return (
              <div
                key={idx}
                style={{
                  background: '#fff',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  padding: '1.25rem',
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span className="badge badge-warning" style={{ fontSize: '0.75rem' }}>IQR Outlier</span>
                    <code>{finding.column_name || ev.affected_column || 'Column'}</code>
                  </div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--warning)', fontWeight: 600 }}>
                    {ev.outlier_count || 1} outlier value(s) ({ev.outlier_percentage || '0'}%)
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.5rem', background: 'var(--bg-main)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', marginBottom: '0.75rem', fontSize: '0.8rem' }}>
                  <div><strong>Lower Fence (Q1 - 1.5&times;IQR):</strong> {ev.lower_fence !== undefined ? ev.lower_fence : '-'}</div>
                  <div><strong>Upper Fence (Q3 + 1.5&times;IQR):</strong> {ev.upper_fence !== undefined ? ev.upper_fence : '-'}</div>
                </div>

                {samples.length > 0 && (
                  <div style={{ marginBottom: '0.75rem' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.35rem', textTransform: 'uppercase' }}>
                      Sample Outlier Values
                    </div>
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      {samples.map((val, sIdx) => (
                        <span key={sIdx} style={{ background: '#fff', border: '1px solid var(--border)', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.82rem', fontFamily: 'monospace' }}>
                          {String(val)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Outlier Action Selector */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.5rem 0.75rem',
                      border: '1px solid var(--primary)',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--primary-light)',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                    }}
                  >
                    <input type="radio" checked={retainOutliers} onChange={() => setRetainOutliers(true)} />
                    <strong>Retain original values (Recommended &amp; Default)</strong>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>— Preserves true measurement variance</span>
                  </label>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.5rem 0.75rem',
                      border: '1px dashed var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      background: '#f8fafc',
                      opacity: 0.75,
                      fontSize: '0.82rem',
                    }}
                  >
                    <input type="radio" disabled checked={false} />
                    <span style={{ color: 'var(--text-muted)' }}>Clip or Remove Outliers</span>
                    <span className="badge badge-outline" style={{ fontSize: '0.65rem', color: 'var(--danger)', borderColor: '#fca5a5' }}>
                      Unsupported by Backend Engine
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  // -------------------------------------------------------------
  // Render Step 5: Review All Changes
  // -------------------------------------------------------------
  const handleGeneratePreview = async (opToPreview = null) => {
    if (previewLoading || pendingOps.length === 0) return;
    setPreviewLoading(true);
    setPreviewError(null);

    const op = opToPreview || pendingOps.find((o) => o.id === selectedPreviewOpId) || pendingOps[0];

    try {
      // Run non-mutating preview on the selected pending operation against source version
      const res = await previewTransformation(
        dataset.id,
        op.operation_type,
        op.column_name,
        op.parameters,
        dataset.current_version_id
      );
      setPreviewData({ ...res, opTitle: op.title });
    } catch (err) {
      setPreviewError(err.message || 'Failed to generate non-mutating preview');
    } finally {
      setPreviewLoading(false);
    }
  };

  const renderStep5 = () => {
    const finalProjectedRows = Math.max(0, currentRows - (removeDuplicates ? duplicateRowsCount : 0));
    const finalProjectedCols = Math.max(0, currentCols - selectedDropColumns.length);

    return (
      <div style={{ animation: 'fadeIn 0.2s ease-in' }}>
        <div style={{ marginBottom: '1.25rem' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 0.35rem 0', color: 'var(--text-main)' }}>
            Step 5: Review All Changes
          </h3>
          <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', margin: 0 }}>
            Inspect the complete transformation plan before applying.
            All operations will be executed sequentially on verified backend copies, creating a new immutable dataset version.
          </p>
        </div>

        {/* Transformation Plan Summary Table */}
        <div
          style={{
            background: '#fff',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            padding: '1.25rem',
            marginBottom: '1.5rem',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
            <h4 style={{ fontSize: '0.95rem', fontWeight: 600, margin: 0 }}>
              Ordered Transformation Execution Plan ({pendingOps.length} operation{pendingOps.length === 1 ? '' : 's'})
            </h4>
            <span className="badge badge-info" style={{ fontSize: '0.75rem' }}>
              Deterministic Order
            </span>
          </div>

          {pendingOps.length === 0 ? (
            <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--bg-main)', borderRadius: 'var(--radius-sm)' }}>
              No cleaning operations selected. You can navigate back to make selections or cancel the wizard.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-main)', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '0.4rem 0.6rem', width: '40px' }}>Seq</th>
                    <th style={{ padding: '0.4rem 0.6rem' }}>Operation</th>
                    <th style={{ padding: '0.4rem 0.6rem' }}>Target Column</th>
                    <th style={{ padding: '0.4rem 0.6rem' }}>Details</th>
                    <th style={{ padding: '0.4rem 0.6rem' }}>Backend Rule</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingOps.map((op, idx) => (
                    <tr key={op.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '0.5rem 0.6rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                        #{idx + 1}
                      </td>
                      <td style={{ padding: '0.5rem 0.6rem', fontWeight: 600 }}>
                        {op.title}
                      </td>
                      <td style={{ padding: '0.5rem 0.6rem' }}>
                        {op.column_name ? <code>{op.column_name}</code> : <span style={{ color: 'var(--text-light)' }}>Whole Dataset</span>}
                      </td>
                      <td style={{ padding: '0.5rem 0.6rem', color: 'var(--text-muted)' }}>
                        {op.description}
                      </td>
                      <td style={{ padding: '0.5rem 0.6rem' }}>
                        <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>
                          <code>{op.operation_type}</code>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Expected Final Dimensions Card */}
        <div
          style={{
            background: 'var(--bg-main)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            padding: '1.25rem',
            marginBottom: '1.5rem',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1rem',
          }}
        >
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Original Dimensions
            </div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-main)' }}>
              {currentRows} Rows &times; {currentCols} Columns
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Planned Removals
            </div>
            <div style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--primary)' }}>
              -{removeDuplicates ? duplicateRowsCount : 0} Rows, -{selectedDropColumns.length} Columns
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Expected Resulting Dimensions
            </div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--success)' }}>
              {finalProjectedRows} Rows &times; {finalProjectedCols} Columns
            </div>
          </div>
        </div>

        {/* Non-Mutating Preview Simulation Trigger */}
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <h4 style={{ fontSize: '0.95rem', fontWeight: 600, margin: 0 }}>
              Non-Mutating Data Simulation
            </h4>
            {pendingOps.length > 0 && (
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                {pendingOps.length > 1 && (
                  <select
                    value={selectedPreviewOpId}
                    onChange={(e) => setSelectedPreviewOpId(e.target.value)}
                    style={{ fontSize: '0.8rem', padding: '0.3rem 0.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}
                  >
                    {pendingOps.map((op, i) => (
                      <option key={op.id} value={op.id}>
                        Op #{i + 1}: {op.title}
                      </option>
                    ))}
                  </select>
                )}
                <button
                  className="btn btn-outline"
                  onClick={() => handleGeneratePreview()}
                  disabled={previewLoading || pendingOps.length === 0}
                  style={{ fontSize: '0.82rem', padding: '0.35rem 0.8rem' }}
                >
                  {previewLoading ? 'Simulating...' : '🔍 Generate Non-Mutating Preview'}
                </button>
              </div>
            )}
          </div>

          {previewError && (
            <div style={{ padding: '0.75rem', background: 'var(--danger-bg)', border: '1px solid #fecaca', borderRadius: 'var(--radius-sm)', color: 'var(--danger)', fontSize: '0.85rem', marginBottom: '1rem' }}>
              <strong>Preview Error:</strong> {previewError}
            </div>
          )}

          {previewData && (
            <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '1rem', animation: 'fadeIn 0.2s ease-in' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <span className="badge badge-info" style={{ fontSize: '0.75rem' }}>Simulation: {previewData.summary}</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {previewData.rows_before} &rarr; {previewData.rows_after} rows | {previewData.cells_affected} cells affected
                </span>
              </div>

              {previewData.sample_diff && previewData.sample_diff.length > 0 && (
                <div style={{ overflowX: 'auto', maxHeight: '180px', border: '1px solid var(--border)', borderRadius: '4px', marginBottom: '0.75rem' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-main)', borderBottom: '1px solid var(--border)' }}>
                        <th style={{ padding: '0.35rem 0.6rem' }}>Row</th>
                        <th style={{ padding: '0.35rem 0.6rem' }}>Column</th>
                        <th style={{ padding: '0.35rem 0.6rem' }}>Before (Original)</th>
                        <th style={{ padding: '0.35rem 0.6rem' }}>After (Cleaned)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewData.sample_diff.map((diff, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '0.35rem 0.6rem', color: 'var(--text-muted)' }}>#{diff.row_index ?? i}</td>
                          <td style={{ padding: '0.35rem 0.6rem', fontWeight: 600 }}><code>{diff.column || 'All'}</code></td>
                          <td style={{ padding: '0.35rem 0.6rem', color: 'var(--danger)' }}>{diff.before !== undefined ? (diff.before === '' ? '<empty>' : String(diff.before)) : JSON.stringify(diff.removed_row_data || diff.dropped_column)}</td>
                          <td style={{ padding: '0.35rem 0.6rem', color: 'var(--success)', fontWeight: 600 }}>{diff.after !== undefined ? String(diff.after) : '[Row Dropped]'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  // -------------------------------------------------------------
  // Render Step 6: Apply, Re-audit, and Export
  // -------------------------------------------------------------
  const handleApplyPlan = async () => {
    if (isApplying || pendingOps.length === 0) return;

    if (!confirmApply) {
      setConfirmApply(true);
      return;
    }

    setIsApplying(true);
    setApplyError(null);
    setApplyProgress({ current: 0, total: pendingOps.length, message: 'Initiating transformation plan...' });

    let currentVersionId = dataset.current_version_id;
    let lastTransformationResult = null;
    const appliedOps = [];

    try {
      for (let i = 0; i < pendingOps.length; i++) {
        const op = pendingOps[i];
        setApplyProgress({
          current: i + 1,
          total: pendingOps.length,
          message: `Applying step ${i + 1} of ${pendingOps.length}: ${op.title}...`,
        });

        // Apply transformation sequentially on current version
        const res = await applyTransformation(
          dataset.id,
          op.operation_type,
          op.column_name,
          op.parameters,
          currentVersionId
        );

        appliedOps.push({ ...op, result: res });
        lastTransformationResult = res;
        currentVersionId = res.result_version_id;
      }

      setExecutionResult({
        appliedOps,
        finalVersionId: currentVersionId,
        lastResult: lastTransformationResult,
      });

      // Automatically trigger audit on the final version
      setIsAuditing(true);
      setApplyProgress({
        current: pendingOps.length,
        total: pendingOps.length,
        message: 'Running post-cleaning quality audit on new version...',
      });

      const auditRes = await runAudit(dataset.id, { version_id: currentVersionId });
      setNewAuditResult(auditRes);
      setIsAuditing(false);
    } catch (err) {
      setApplyError(
        `Sequential execution failed at step ${appliedOps.length + 1}: ${err.message}. ` +
        (appliedOps.length > 0
          ? `${appliedOps.length} operation(s) succeeded and created intermediate version '${currentVersionId}'. Remaining operations were not applied.`
          : 'Original dataset was completely preserved.')
      );
    } finally {
      setIsApplying(false);
    }
  };

  // Clean exit that notifies parent dashboard of final created version
  const handleFinishAndClose = () => {
    if (onTransformationApplied && executionResult?.lastResult) {
      onTransformationApplied(executionResult.lastResult);
    }
    if (onClose) {
      onClose();
    }
  };

  const handleFinishAndCompare = () => {
    if (onTransformationApplied && executionResult?.lastResult) {
      onTransformationApplied(executionResult.lastResult);
    }
    if (onNavigateToCompare) {
      onNavigateToCompare();
    }
  };

  const renderStep6 = () => {
    // If successfully finished applying
    if (executionResult && newAuditResult) {
      const extractScore = (obj) => {
        if (!obj) return null;
        if (typeof obj.score === 'number') return obj.score;
        if (typeof obj.quality_score === 'number') return obj.quality_score;
        if (typeof obj.summary?.score === 'number') return obj.summary.score;
        return null;
      };

      const prevScoreRaw = extractScore(audit);
      const newScoreRaw = extractScore(newAuditResult);
      const prevScore = prevScoreRaw !== null ? prevScoreRaw : '—';
      const newScore = newScoreRaw !== null ? newScoreRaw : '—';
      const scoreDelta =
        prevScoreRaw !== null && newScoreRaw !== null
          ? Math.round((newScoreRaw - prevScoreRaw) * 10) / 10
          : 0;
      const finalVerId = executionResult.finalVersionId;

      return (
        <div style={{ animation: 'fadeIn 0.2s ease-in' }}>
          <div style={{ padding: '1.5rem', background: 'var(--success-bg)', border: '1px solid #bbf7d0', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem', textAlign: 'center' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🎉</div>
            <h3 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--success)', margin: '0 0 0.25rem 0' }}>
              Transformations Successfully Applied!
            </h3>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', margin: '0 0 1rem 0' }}>
              Created new immutable dataset version. Original version remains safely preserved in history.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', background: '#fff', padding: '1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', textAlign: 'center', marginBottom: '1.25rem' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>PREVIOUS QUALITY SCORE</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>
                  {prevScore !== '—' ? `${prevScore} / 100` : '—'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>NEW QUALITY SCORE</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: scoreDelta >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                  {newScore !== '—' ? `${newScore} / 100` : '—'}
                  {scoreDelta !== 0 && (
                    <span style={{ fontSize: '0.85rem', marginLeft: '0.35rem', color: scoreDelta > 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                      ({scoreDelta > 0 ? `+${scoreDelta}` : scoreDelta})
                    </span>
                  )}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>REMAINING FINDINGS</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--primary)' }}>
                  {newAuditResult.findings?.length || 0}
                </div>
              </div>
            </div>

            {/* Direct Export & Compare Actions */}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                className="btn btn-outline"
                onClick={() => {
                  const url = getExportCsvUrl(dataset.id, finalVerId);
                  downloadFileFromUrl(url, `${dataset.name}_cleaned.csv`);
                }}
              >
                📥 Export Cleaned CSV
              </button>
              <button
                className="btn btn-outline"
                onClick={() => {
                  const url = getExportReportUrl(dataset.id, newAuditResult.id, 'html', finalVerId);
                  downloadFileFromUrl(url, `${dataset.name}_audit_report.html`);
                }}
              >
                📄 Download Audit Report
              </button>
              {onNavigateToCompare && (
                <button
                  className="btn btn-primary"
                  onClick={handleFinishAndCompare}
                >
                  ⚖️ Compare with Original Version
                </button>
              )}
              <button
                className="btn btn-outline"
                onClick={handleFinishAndClose}
              >
                Return to Audit Dashboard &rarr;
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div style={{ animation: 'fadeIn 0.2s ease-in' }}>
        <div style={{ marginBottom: '1.25rem' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 0.35rem 0', color: 'var(--text-main)' }}>
            Step 6: Apply, Re-audit, and Export
          </h3>
          <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', margin: 0 }}>
            Confirm your transformation plan. Once applied, DataLens will create a new immutable dataset version
            and trigger an automatic re-audit.
          </p>
        </div>

        {applyError && (
          <div style={{ padding: '1rem', background: 'var(--danger-bg)', border: '1px solid #fecaca', borderRadius: 'var(--radius-sm)', color: 'var(--danger)', marginBottom: '1.25rem', fontSize: '0.88rem' }}>
            <strong>Execution Error:</strong> {applyError}
          </div>
        )}

        {/* Confirmation Card */}
        <div
          style={{
            background: '#fff',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            padding: '1.5rem',
            marginBottom: '1.5rem',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <h4 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>
            Ready to Apply {pendingOps.length} Cleaning Transformation{pendingOps.length === 1 ? '' : 's'}
          </h4>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
            DataLens preserves version immutability. The current version will remain completely intact, and a new cleaned version
            will be produced with an updated audit score.
          </p>

          {confirmApply && !isApplying && (
            <div style={{ background: 'var(--warning-bg)', border: '1px solid #fde68a', color: 'var(--warning)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem', marginBottom: '1rem' }}>
              <strong>Confirmation Required:</strong> Click "Confirm &amp; Apply Transformation Plan" below to begin sequential application.
            </div>
          )}

          {isApplying && (
            <div style={{ background: 'var(--primary-light)', border: '1px solid var(--primary-border)', borderRadius: 'var(--radius-sm)', padding: '1rem', marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--primary)', marginBottom: '0.35rem' }}>
                {applyProgress.message}
              </div>
              <div style={{ background: '#e2e8f0', borderRadius: '4px', height: '8px', overflow: 'hidden' }}>
                <div
                  style={{
                    background: 'var(--primary)',
                    height: '100%',
                    width: `${applyProgress.total > 0 ? (applyProgress.current / applyProgress.total) * 100 : 0}%`,
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
            </div>
          )}

          <button
            className="btn btn-primary"
            style={{
              padding: '0.75rem 1.5rem',
              fontSize: '0.95rem',
              fontWeight: 600,
              background: confirmApply ? 'var(--danger)' : 'var(--primary)',
            }}
            onClick={handleApplyPlan}
            disabled={isApplying || pendingOps.length === 0}
          >
            {isApplying
              ? isAuditing
                ? 'Re-auditing new version...'
                : 'Applying Transformations...'
              : confirmApply
              ? '⚠️ Confirm & Apply Transformation Plan'
              : 'Review & Apply Transformations'}
          </button>
        </div>
      </div>
    );
  };

  // -------------------------------------------------------------
  // Render Step Controller
  // -------------------------------------------------------------
  const renderCurrentStepContent = () => {
    switch (currentStep) {
      case 1:
        return renderStep1();
      case 2:
        return renderStep2();
      case 3:
        return renderStep3();
      case 4:
        return renderStep4();
      case 5:
        return renderStep5();
      case 6:
        return renderStep6();
      default:
        return null;
    }
  };

  // Next action validator & handler
  const handleNext = () => {
    if (currentStep < 6) {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleSkip = () => {
    if (currentStep === 1) {
      setRemoveDuplicates(false);
      setSelectedDropColumns([]);
    } else if (currentStep === 2) {
      setMissingStrategies({});
    } else if (currentStep === 3) {
      setStep3Skipped(true);
    } else if (currentStep === 4) {
      setStep4Skipped(true);
      setRetainOutliers(true);
    }
    handleNext();
  };

  return (
    <div
      className="card"
      style={{
        border: '2px solid var(--primary)',
        marginBottom: '1.5rem',
        animation: 'fadeIn 0.2s ease-in',
        boxShadow: 'var(--shadow-md)',
      }}
    >
      {/* Wizard Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem',
          borderBottom: '1px solid var(--border)',
          paddingBottom: '0.75rem',
          flexWrap: 'wrap',
          gap: '0.5rem',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>
              DataLens Cleaning &amp; Transformation Wizard
            </h2>
            <span className="badge badge-info" style={{ fontSize: '0.75rem' }}>
              Step {currentStep} of 6
            </span>
          </div>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Dataset: <strong>{dataset?.name}</strong> (v{dataset?.version_number || 1}) &bull; Non-mutating simulation until applied
          </span>
        </div>

        {onClose && (
          <button
            className="btn btn-outline"
            style={{ fontSize: '0.8rem', padding: '0.25rem 0.6rem' }}
            onClick={onClose}
          >
            &times; Cancel Wizard
          </button>
        )}
      </div>

      {/* Stepped Progress Bar */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(6, 1fr)',
          gap: '0.5rem',
          marginBottom: '1.5rem',
        }}
      >
        {stepsMeta.map((s) => {
          const isActive = s.num === currentStep;
          const isCompleted = s.num < currentStep;

          return (
            <button
              key={s.num}
              onClick={() => setCurrentStep(s.num)}
              style={{
                background: isActive
                  ? 'var(--primary)'
                  : isCompleted
                  ? 'var(--success-bg)'
                  : 'var(--bg-main)',
                border: `1px solid ${
                  isActive
                    ? 'var(--primary)'
                    : isCompleted
                    ? '#bbf7d0'
                    : 'var(--border)'
                }`,
                borderRadius: 'var(--radius-sm)',
                padding: '0.5rem 0.4rem',
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <div
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  color: isActive
                    ? '#fff'
                    : isCompleted
                    ? 'var(--success)'
                    : 'var(--text-muted)',
                }}
              >
                {isCompleted ? '✓ ' : ''}STEP {s.num}
              </div>
              <div
                style={{
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  color: isActive ? '#fff' : 'var(--text-main)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {s.title}
              </div>
            </button>
          );
        })}
      </div>

      {/* Step Content */}
      <div style={{ minHeight: '340px' }}>
        {renderCurrentStepContent()}
      </div>

      {/* Wizard Footer Controls */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: '1.5rem',
          borderTop: '1px solid var(--border)',
          paddingTop: '1rem',
          flexWrap: 'wrap',
          gap: '0.75rem',
        }}
      >
        <div>
          {onClose && (
            <button
              className="btn btn-outline"
              style={{ fontSize: '0.85rem' }}
              onClick={onClose}
            >
              Cancel Wizard
            </button>
          )}
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {/* Back button */}
          <button
            className="btn btn-outline"
            onClick={handleBack}
            disabled={currentStep === 1 || isApplying}
            style={{ fontSize: '0.85rem' }}
          >
            &larr; Back
          </button>

          {/* Skip Step button (available on Steps 1 - 4) */}
          {currentStep >= 1 && currentStep <= 4 && (
            <button
              className="btn btn-outline"
              onClick={handleSkip}
              disabled={isApplying}
              style={{ fontSize: '0.85rem' }}
            >
              Skip Step
            </button>
          )}

          {/* Next / Advance button */}
          {currentStep < 6 && (
            <button
              className="btn btn-primary"
              onClick={handleNext}
              disabled={isApplying}
              style={{ fontSize: '0.85rem' }}
            >
              Next: Step {currentStep + 1} &rarr;
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
