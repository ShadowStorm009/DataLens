# DataLens Demo Datasets

This directory contains test datasets crafted with known, verifiable data-quality defects to demonstrate DataLens' end-to-end audit, profiling, preview, cleaning, comparison, and export workflow.

## `demo_dirty_dataset.csv`

A 20-row sample dataset representing employee records with deliberate quality anomalies across all 8 deterministic audit rules:

| Column | Defect / Anomaly Type | Evidence & Details | Expected Audit Rule |
| :--- | :--- | :--- | :--- |
| **Entire Dataset** | Exact Duplicate Row | Rows 1 and 11 (`CUST_001`, Alice Johnson) are identical | `rule_exact_duplicates` |
| **`country`** | Constant Column | Value is `"USA"` across all 20 rows (zero variance) | `rule_constant_columns` |
| **`age`** | Missing Values | Rows 3 and 17 have missing values (null cells) | `rule_missing_values` |
| **`age`** | Type Inconsistency | Row 13 contains string `"invalid_age"` in a numeric column | `rule_type_consistency` |
| **`salary`** | Missing Values | Rows 5 and 16 have empty salary cells | `rule_missing_values` |
| **`salary`** | Numeric Outlier | Row 15 has salary of `4,500,000` (exceeds Tukey upper fence) | `rule_numeric_outliers` |
| **`customer_id`** | High Cardinality | Unique alphanumeric identifiers (>90% uniqueness ratio) | `rule_high_cardinality` |
| **`churn`** | Class Imbalance | 19 `"No"` (95%) vs 1 `"Yes"` (5%) (severe minority imbalance) | `rule_class_imbalance` |
| **`notes`** | Spreadsheet Injection | Row 20 begins with `=1+1` (demonstrates formula sanitization) | Export Protection |

---

## `datalens_test_dataset.csv`

A 24-row, 7-column academic dataset used for automated regression tests and audit summary metric verification:
- **Total Rows & Columns**: 24 rows, 7 columns (`student_id`, `name`, `department`, `attendance_pct`, `marks`, `scholarship`, `batch`).
- **Missing Cells (3 total)**: 1 missing in `attendance_pct` (row 5 / `S005`), 1 in `marks` (row 3 / `S003`), 1 in `scholarship` (row 6 / `S006`).
- **Exact Duplicate Rows (1 total)**: Row 24 (`S001,Aarav...`) is an exact duplicate of Row 0.
- **Outlier**: Row 22 (`S022,Outlier...`) has marks `999.0`.
- **Type Inconsistency**: Row 23 (`S023,BadType...`) has attendance `"eighty"`.

---

## Recommended Step-by-Step Walkthrough

1. **Upload**: Drag and drop `demo_dirty_dataset.csv` into the DataLens upload panel.
2. **Audit Findings**:
   - Inspect Quality Score (initial score will be ~65-75 due to duplicate and missingness penalties).
   - Review findings in the dashboard and open the detail drawer on the duplicate finding.
3. **Clean Duplicates**:
   - Open **Clean & Transform**.
   - Select **Remove Exact Duplicate Rows**.
   - Review the non-mutating preview diff (shows 1 row to be removed).
   - Confirm and apply (creates Version 2).
4. **Impute Missing Values**:
   - Select **Impute Missing Numeric Values (Median)** on column `salary`.
   - Preview and apply (creates Version 3).
5. **Drop Constant Column**:
   - Select **Drop Constant Column** on column `country`.
   - Preview and confirm (creates Version 4).
6. **Compare Versions**:
   - Click **Compare Versions**.
   - Compare Baseline (Version 1) against Cleaned (Version 4).
   - Observe the score improvement (+15 to +20 points), reduced deductions, and resolved findings tab.
7. **Export**:
   - Click **Export ▾** -> **Download Cleaned CSV** (or **Spreadsheet-Safe CSV**).
   - Click **Export ▾** -> **Download Standalone HTML Report**.
