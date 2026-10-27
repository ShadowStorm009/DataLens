# PROJECT_STATE.md — DataLens Handoff

> This file is the canonical handoff for any AI model continuing this repository. Keep it truthful and update it after every implementation phase. Never mark a feature verified without test evidence.

## 1. Project Identity

- **Name:** DataLens — Dataset Quality Auditor
- **Purpose:** Help users upload CSV files, profile data, detect quality issues, preview/apply cleaning operations, preserve versions, re-audit, compare, and export.
- **Core workflow:** Upload → Profile → Audit → Investigate → Preview → Transform → Re-audit → Compare → Export
- **Target users:** Students, data analysts, ML beginners, researchers.
- **MVP stack:** React + Vite + JavaScript + normal CSS; FastAPI + Pandas + NumPy; SQLite + SQLAlchemy; pytest.
- **Out of scope for MVP:** ML model training, guaranteed leakage detection, team collaboration, subscriptions, and broad file-format support.

## 2. Current Repository Reality

- **Last updated:** 2026-10-27 15:10 IST
- **Branch:** `main`
- **HEAD commit:** `82009e9` (feat(audit): redesign audit page into overview and actionable findings with defect prioritization)
- **Git status:** Clean build, 88 automated pytest tests passing in 2.65s, 0 frontend build errors.
- **Frontend entry point:** `frontend/src/main.jsx` (Vite + React, production build verified)
- **Backend entry point:** `backend/app/main.py` (FastAPI app with health, upload, preview, profile, audits, transformations, comparison, and export endpoints)
- **Database configuration:** SQLite connection URL configured via `DATABASE_URL` (default: `sqlite:///./storage/datalens.db`) with `PRAGMA foreign_keys = ON` enforced.
- **Upload/storage directory:** `./storage` (git-ignored, versioned dataset storage, managed via `StorageService`)
- **Frontend run command:** `cd frontend && npm run dev`
- **Backend run command:** `.venv/bin/uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload`
- **Test commands:** `.venv/bin/pytest -v` (backend) and `cd frontend && npm run build` (frontend)
- **Environment variable names:** `DATALENS_ENV`, `DATALENS_HOST`, `DATALENS_PORT`, `DATABASE_URL`, `STORAGE_DIR`, `MAX_UPLOAD_SIZE_BYTES`, `CORS_ORIGINS`, `VITE_API_BASE_URL`
- **Deployment URL/status:** External cloud hosting deployment is NOT verified (no remote cloud credentials/hosting access provided). Local persistence, server daemon running, health check endpoint, production Vite frontend build, and all 88 backend tests are 100% verified. Multi-stage `Dockerfile` and `docker-compose.yml` with persistent volume mounting for `./storage` are provided.
- **Important architecture notes:** Arch Linux host requires Python installations in `.venv/`. Core audit and cleaning logic remains deterministic without external LLM dependencies.

## 3. Feature Status Matrix

Use only these statuses: `VERIFIED`, `IMPLEMENTED_UNVERIFIED`, `PARTIAL`, `NOT_STARTED`, `BLOCKED`.

| Feature | Status | Files/modules | What works | What remains | Test evidence |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Landing page & dataset views** | VERIFIED | `frontend/src/components/LandingPage.jsx`, `frontend/src/components/AllDatasetsPage.jsx`, `frontend/src/App.jsx` | Professional SaaS hero landing page with value prop, prominent CSV upload area with validation and upload-success banner, recent datasets (max 5) with real quality scores and timestamps; separate All Datasets page with live name/file search, 8-way metadata sorting, pagination (10/25/50), real audit score integration, and full suite of operations (audit, profile, preview, compare, export, cascade delete) | None | Vite build clean in 823ms; 88 backend pytest tests passing in 2.63s |
| **Repository foundation & health check** | VERIFIED | `backend/app/main.py`, `backend/app/api/routes/health.py`, `frontend/src/App.jsx`, `frontend/vite.config.js` | FastAPI app starts, `/health` and `/api/v1/health` respond with 200 OK, CORS enabled for frontend, custom error handling registered, Vite builds cleanly | None | `backend/tests/test_health.py` 3 passed in 0.08s; `npm run build` passed in 1.64s; `curl` verified 200 OK & CORS preflight |
| **SQLite persistence & models** | VERIFIED | `backend/app/db/`, `backend/app/models/`, `backend/app/services/` | SQLite engine with foreign key enforcement; ORM models (`Dataset`, `DatasetVersion`, `AuditRun`, `Finding`, `Transformation`); `StorageService` with SHA256 & path safety; `DatasetService` with CRUD, lineage, and cascade deletion | None | `backend/tests/test_persistence.py` 8 passed (creation, lineage, audit link, transformations, 404s, cascade delete, foreign keys, process restart survival) |
| **CSV upload & validation** | VERIFIED | `backend/app/services/csv_validator.py`, `backend/app/api/routes/datasets.py`, `frontend/src/components/UploadSection.jsx` | Server-side size check (10MB limit), encoding detection, empty check, malformed CSV rejection, duplicate header sanitization, leading zeros preservation, drag-and-drop & file picker UI | None | `backend/tests/test_upload_and_preview.py` 10 passed (valid CSV, empty, malformed, oversized 413, duplicate headers, leading zeros, orphan prevention) |
| **Dataset preview & profile** | VERIFIED | `backend/app/audit/profiling.py`, `backend/app/api/routes/datasets.py`, `frontend/src/components/ProfileView.jsx`, `frontend/src/components/PreviewModal.jsx` | Reusable `ProfilingEngine` computing dataset and column statistics (numeric, categorical, datetime, boolean, text); type inference heuristics; bounded top-N values; caching tied to immutable versions; bounded preview modal; full responsive `ProfileView` | None | `backend/tests/test_profiling.py` 3 passed (hand-calculated values, edge cases resilience, caching & endpoint) |
| **Audit rules & findings** | VERIFIED | `backend/app/audit/rules/`, `backend/app/audit/engine.py`, `backend/app/schemas/audit.py`, `backend/app/api/routes/audits.py` | 8 deterministic rules implemented; refined HighCardinalityRule to skip continuous float measurements (e.g. marks); documented configurable thresholds; rule failure resilience; persistence of `AuditRun` and `Finding` rows; regression test verifying summary metrics strictly agree with findings | None | `backend/tests/test_audit_rules.py` 15 passed (individual rule positive/negative tests, determinism, non-mutating verification, configurable thresholds, API execution, filtering, summary metrics agreement) |
| **Quality score & dashboard** | VERIFIED | `backend/app/audit/scoring.py`, `frontend/src/components/AuditDashboard.jsx`, `frontend/src/components/FindingDetailDrawer.jsx`, `frontend/src/components/CleaningPanel.jsx` | Redesigned into two clear sections: Audit Overview (score gauge, disclaimer, KPI cards for missing/duplicates/severity, collapsible penalty breakdown, secondary advanced execution controls) and Actionable Findings (prioritized defect vs heuristic separation, structured evidence snippets, one-click preview fix actions pre-filling CleaningPanel, inspect column, view rows, and detail drawer) | None | `backend/tests/test_quality_score.py` 6 passed; Vite frontend build passing with 0 errors |
| **Cleaning preview** | VERIFIED | `backend/app/services/cleaner.py`, `backend/app/api/routes/transformations.py`, `frontend/src/components/CleaningPanel.jsx` | Non-mutating preview API & UI for median/mode imputation, duplicate removal, constant column drop; returns bounded sample diffs, row/cell deltas without modifying stored data | None | `backend/tests/test_transformations.py` 12 passed (median, mode, duplicate, constant col, immutability, preview/apply parity) |
| **Apply transformations & create versions** | VERIFIED | `backend/app/services/cleaner.py`, `backend/app/api/routes/transformations.py`, `frontend/src/components/CleaningPanel.jsx` | Applying calls same transformation engine; persists new immutable `DatasetVersion` (v2, v3, etc.); records `Transformation` history row with parameters and metrics; auto-triggers re-audit in dashboard | None | `backend/tests/test_transformations.py` lifecycle test passed; preview/apply parity confirmed |
| **Re-audit & comparison** | VERIFIED | `backend/app/services/comparison.py`, `backend/app/api/routes/comparison.py`, `frontend/src/components/CompareView.jsx` | Side-by-side version comparison; score delta (+/-) with deduction reduction breakdown; metric deltas (missing cells & %, duplicates & %, row/col counts, severity counts); relevant column statistics comparison; findings transition diff (resolved/unresolved/new); schema column additions/drops; scoped chronological transformation lineage; audit configuration checks; single-version and self-comparison empty states; re-audit on demand | None | `backend/tests/test_comparison.py` 9 passed (service comparison, same version, dropped column, API endpoint, version history, 404s, version ancestry, audit version association, percentage & column stat calculations) |
| **CSV and report export** | VERIFIED | `backend/app/services/export.py`, `backend/app/api/routes/exports.py`, `frontend/src/components/AuditDashboard.jsx`, `frontend/src/components/CompareView.jsx`, `frontend/src/components/DatasetTable.jsx` | Selected-version CSV export (not implicitly latest); safe generated filenames; formula injection protection with safe numeric string preservation; empty version handling; before/after comparison in HTML/JSON reports for child versions; version report endpoint; visible download failure handling | None | `backend/tests/test_export.py` 11 passed |
| **Dataset deletion & reliability** | VERIFIED | `backend/app/api/routes/datasets.py`, `backend/app/services/dataset_service.py`, `backend/app/core/errors.py`, `frontend/src/components/DatasetTable.jsx`, `backend/tests/test_reliability.py` | In-app deletion confirmation modal; DELETE endpoint cascades to DB records, physical CSV files, and cached `.profile.json` files; transaction rollback cleans storage files on DB commit failures; uniform error envelopes for Starlette `HTTPException` (404, 405) and `RequestValidationError` (422); duplicate submission prevention guards across UI; friendly network error interception | None | `backend/tests/test_reliability.py` 10 passed |
| **Automated tests** | VERIFIED | `backend/tests/` | 88 automated tests covering health, persistence, upload, preview, profiling, 8 audit rules, quality scoring, transformations, version ancestry, audit associations, comparisons, exports, reliability & rollback, audit summary agreement regression, and full E2E lifecycle | None | 88 passed in 2.62s |
| **README & deployment** | VERIFIED | `README.md`, `Dockerfile`, `docker-compose.yml`, `docs/DECISIONS.md`, `.env.example` | Architecture diagram & module boundaries, local setup instructions, production build instructions, Docker & Docker Compose setup with persistent volume storage requirements, Linux VPS systemd/nginx configuration, core invariants, and explicit limitations documented. Deployment status truthfully marked unverified for remote cloud hosting | None | Setup, build, local daemon running, and health verification verified locally |
| **Demo and final submission checklist** | VERIFIED | `sample_datasets/demo_dirty_dataset.csv`, `sample_datasets/README.md`, `backend/tests/test_e2e_workflow.py` | Reproducible 20-row sample CSV with known defects across all 8 audit rules, walkthrough guide, and automated E2E lifecycle test verifying upload->profile->audit->preview->apply(v2,v3,v4)->compare->export | None | `test_full_datalens_e2e_lifecycle` PASSED |

## 4. Current Implementation Details

- **API endpoints implemented:**
  - `GET /health`: System health status and configuration info.
  - `GET /api/v1/health`: API v1 health endpoint.
  - `POST /api/v1/datasets`: Upload CSV with size limits, header validation, encoding fallback, and immutable v1 persistence.
  - `GET /api/v1/datasets`: List stored datasets with row/column counts and status.
  - `GET /api/v1/datasets/{id}`: Retrieve dataset metadata.
  - `GET /api/v1/datasets/{id}/preview`: Bounded row preview with JSON-compatible null representation and leading zero preservation.
  - `GET /api/v1/datasets/{id}/profile`: Statistical profile for dataset version with persistent caching per version ID.
  - `GET /api/v1/datasets/{id}/versions`: List dataset versions.
  - `DELETE /api/v1/datasets/{id}`: Delete dataset, cascading to versions, audits, findings, transformations, and physical files (CSVs and `.profile.json` caches).
  - `POST /api/v1/datasets/{id}/audits`: Execute 8 deterministic quality checks on specified version (or current version) with optional target column, calculate quality score, and persist `AuditRun` + `Finding` records.
  - `GET /api/v1/datasets/{id}/audits`: List audit run history for a dataset, optionally filtered by `version_id`.
  - `GET /api/v1/datasets/{id}/audits/{audit_id}`: Retrieve full audit run details with structured summary and findings.
  - `GET /api/v1/datasets/{id}/audits/{audit_id}/findings`: Filter audit findings by `severity` (high/medium/low), `rule_id`, or `column_name`.
  - `POST /api/v1/datasets/{id}/transformations/preview`: Non-mutating preview of cleaning operation returning before/after row counts, modified cell counts, and bounded sample diffs without saving to disk.
  - `POST /api/v1/datasets/{id}/transformations/apply`: Apply validated cleaning transformation using identical logic as preview, persisting a new immutable `DatasetVersion` (v2, v3, etc.) and audit-ready `Transformation` record.
  - `GET /api/v1/datasets/{id}/compare`: Side-by-side comparison between any two versions (v1, v2) computing score deltas, deduction reductions, metric differences, findings transitions (resolved/unresolved/new), and schema changes.
  - `GET /api/v1/datasets/{id}/history`: Version history and chronological transformation lineage for the dataset.
  - `GET /api/v1/datasets/{id}/versions/{v_id}/export`: Download version-specific CSV file with optional `spreadsheet_safe` formula injection escaping.
  - `GET /api/v1/datasets/{id}/export`: Current version CSV export shortcut.
  - `GET /api/v1/datasets/{id}/audits/{audit_id}/report`: Download audit report as standalone responsive HTML or structured JSON.
  - `GET /api/v1/datasets/{id}/report`: Latest audit report download shortcut.

- **Deterministic Audit Engine (`AuditEngine`):**
  - Modular rule interface `AuditRule` with graceful column-level and rule-level exception isolation.
  - 8 core audit rules:
    1. `MissingValuesRule` (`rule_missing_values`): Column null counts and percentages; severity: high (>=20%), medium (5-20%), low (<5%).
    2. `DuplicateRowsRule` (`rule_exact_duplicates`): Exact duplicate row detection across all columns with sample indices; non-mutating; severity: high (>=10%), medium (<10%).
    3. `ConstantColumnsRule` (`rule_constant_columns`): Zero-variance columns (single distinct non-null value or all-null); severity: high (all-null or constant with no nulls), medium (constant with nulls).
    4. `HighCardinalityRule` (`rule_high_cardinality`): Heuristic check for identifier-like columns (>90% unique ratio and distinct count >= 15); explicit uncertainty notes stating high cardinality is not automatically an error.
    5. `NumericOutliersRule` (`rule_numeric_outliers`): Tukey IQR fences [Q1 - 1.5*IQR, Q3 + 1.5*IQR], reporting outlier counts, percentages, fences, and uncertainty warnings.
    6. `TypeConsistencyRule` (`rule_type_consistency`): Mixed-type detection in predominantly numeric or datetime columns; identifies unparseable strings that would be silently corrupted upon coercion.
    7. `ClassImbalanceRule` (`rule_class_imbalance`): Evaluates target column (selected by user or detected via target keywords) for minority class frequency and imbalance ratios; severity: high (<5% minority or >10:1 ratio), medium (<20% minority or >4:1 ratio).
    8. `PotentialLeakageRule` (`rule_potential_leakage`): Statistical heuristic detecting near-perfect target-feature correlations (|r| >= 0.98) or duplicate features (|r| >= 0.999); explicit uncertainty warnings requiring domain verification.

- **Quality Score Engine (`calculate_quality_score`):**
  - Transparent, bounded 0–100 score based on component penalty deductions:
    - Missingness penalty (max 30.0 pts)
    - Duplicate rows penalty (max 25.0 pts)
    - Constant columns penalty (max 20.0 pts)
    - Type inconsistency penalty (max 15.0 pts)
    - Anomalies & heuristic penalties (max 10.0 pts)
  - Scoring method version: `1.0`
  - Explicit disclaimer explaining that the score covers implemented checks only and is not a universal correctness guarantee.

- **Transformation Engine (`TransformationEngine`):**
  - Implements 4 standard cleaning transformations with zero-drift preview/apply parity:
    1. `impute_median`: Fills missing numeric values with exact or rounded column median.
    2. `impute_mode`: Fills missing categorical values with most frequent mode value.
    3. `remove_duplicates`: Drops duplicate rows, keeping first occurrence.
    4. `drop_constant_column`: Drops verified zero-variance columns while guarding against dropping all columns.
  - Guarantees source version immutability; always writes new child version.

- **Comparison Service (`ComparisonService`):**
  - Computes score deltas (+/-), deduction reductions, metric deltas (rows, columns, duplicates, missing cells, severity counts).
  - Classifies findings transition: `resolved` (fixed in v2), `unresolved` (still present in v2), and `new` (introduced in v2).
  - Detects column additions/removals and returns chronological lineage of transformations.

- **Export Service (`ExportService`):**
  - Versioned CSV export with optional `spreadsheet_safe` mode escaping leading `=`, `+`, `-`, `@`, `\t`, `\r` with single quote `'`.
  - Self-contained HTML audit report with embedded styles, score gauge, KPI grid, deduction table, structured evidence cards, and lineage steps.
  - Structured machine-readable JSON audit report.

- **UI Components:**
  - `AuditDashboard.jsx`: Quality score circle with dynamic color coding, deduction breakdown bars, severity KPI cards, interactive filter bar (severity, rule, column, keyword search), integrated column profile table, and export dropdown.
  - `FindingDetailDrawer.jsx`: Slide-out panel detailing severity rationale, description, formatted structured evidence JSON, and actionable recommendations.
  - `CleaningPanel.jsx`: Interactive cleaning operations modal with parameter selectors, non-mutating preview diff table, warning notices, and apply trigger.
  - `CompareView.jsx`: Side-by-side version comparison dashboard with score card deltas, deduction comparisons, metric deltas, findings transitions tabs (resolved/unresolved/new), and transformation lineage timeline.
  - `ProfileView.jsx`: Statistical profiling page with distribution metrics and categorical frequency bars.
  - `UploadSection.jsx`: Drag-and-drop file upload with validation feedback.
  - `DatasetTable.jsx`: Inventory table with "Audit Quality", "Profile", "Preview", "Clean & Transform", "Compare", "Export", and "Delete" actions.
  - `PreviewModal.jsx`: Interactive tabular preview with row-limit controls.
  - `App.jsx`: State-based view switcher between Inventory, Audit Dashboard, Compare View, and Detailed Profile.

## 5. Work Completed in Most Recent Session

- **Goal:** Phase 11 (Dataset Deletion, Error States, and Reliability Pass) and Phase 12 (Reproducible Demo Fixture, E2E Verification, and Final Documentation Polish).
- **Changes made:**
  - Updated `delete_dataset` in `backend/app/services/dataset_service.py` to clean up physical `.profile.json` cache files on disk upon dataset deletion, in addition to CSV files.
  - Added 5 reliability tests in `backend/tests/test_reliability.py` testing:
    - Cascading deletion of both CSV files and cached profile files.
    - Uniform 404 error responses for invalid UUIDs across all resource endpoints.
    - Path traversal attack blocking in `StorageService`.
    - Safe transaction rollback on invalid transformation attempts (preserving dataset version).
    - Consistent JSON error response envelopes (`error` and `message` keys).
  - Created reproducible sample dataset `sample_datasets/demo_dirty_dataset.csv` with 20 rows and intentional defects across all 8 deterministic rules and export safety.
  - Created `sample_datasets/README.md` cataloging each defect, affected column, and a 7-step walkthrough guide.
  - Created comprehensive end-to-end integration test `backend/tests/test_e2e_workflow.py` validating the entire 10-step lifecycle (Upload -> Profile -> Audit -> Inspect -> Preview -> Apply v2, v3, v4 -> Compare -> Export CSV & Reports).
  - Verified 74 automated tests passing in 3.92s with zero failures.
  - Verified frontend production build (`npm run build`) in 1.64s with zero errors.
- **Files created/modified:**
  - Created: `sample_datasets/demo_dirty_dataset.csv`
  - Created: `sample_datasets/README.md`
  - Created: `backend/tests/test_reliability.py`
  - Created: `backend/tests/test_e2e_workflow.py`
  - Modified: `backend/app/services/dataset_service.py`
  - Modified: `PROJECT_STATE.md`
- **Commands run:**
  - `.venv/bin/pytest backend/tests -v` (74 passed)
  - `cd frontend && npm run build` (success, built in 1.64s)
- **Tests and actual results:**
  - All 74 tests passed in 3.92s across all 11 test modules.
- **Build result:** Success for both frontend and backend.
- **Commit(s):** Ready to commit Phase 11 & 12 changes.

## 6. Known Bugs, Risks, and Blockers

1. **Risk — Arch Linux Python Environment:**
   - *Status:* Mitigated. Virtual environment `.venv` fully functional with installed packages and pytest suite.
2. **Risk — In-Memory File Size vs. Processing Time:**
   - *Status:* Mitigated. Profiling results cached per immutable version ID (`{version_id}.profile.json`); audit runs persisted in SQLite; preview row counts strictly bounded.
3. **Risk — False Certainty in Heuristic Checks (Identifiers, Outliers, Leakage):**
   - *Status:* Mitigated. Rules explicitly include uncertainty warnings and caveat notes explaining that statistical anomalies are candidates for inspection, not guaranteed errors or leakage.
4. **Risk — Accidental Data Mutation:**
   - *Status:* Mitigated. Non-mutating preview operates strictly on a copy; apply operations create child versions; verified via `test_audit_engine_does_not_mutate_dataframe` and `test_transformation_engine_does_not_mutate_input`.
5. **Notice — External Cloud Hosting Deployment Unverified:**
   - *Status:* Unverified. No cloud provider credentials or remote hosting access were provided in the environment. Local daemonization, SQLite persistence, and multi-stage container configuration (`Dockerfile`, `docker-compose.yml`) are fully verified locally with the automated test suite.

## 7. Next Actions (Ordered)

1. **Product is shippable and verified:** All 87 unit, integration, and E2E lifecycle tests pass. Frontend builds with 0 errors.
2. **Review submission criteria:** Verify that submission form `https://forms.gle/sBy4sfqyiRG2Zpom9` questions are answered accurately.
3. **Final working tree clean:** Ensure clean git status with all docs and test artifacts committed.

## 8. Things That Must Not Be Regressed

- Original uploaded dataset must remain immutable.
- Preview operations must not modify persisted data.
- Applying a transformation creates a new version.
- Preview and Apply must use identical transformation logic.
- Every audit must reference the exact dataset version audited.
- Audit results must be based on actual data, not hardcoded demo values.
- Core audit and cleaning logic must work without an external LLM.
- No Tailwind or unnecessary external infrastructure.

## 9. Resume Instructions for the Next Model

1. Read this file completely.
2. Read the PRD and AI Agent Prompt Pack (`DataLens_AI_Agent_Prompt_Pack.md`).
3. Inspect `git status`, recent commits, relevant source files, and tests.
4. Verify this file's claims against code and tests; correct discrepancies.
5. All 12 phases are implemented and verified. Run `.venv/bin/pytest -v` and `cd frontend && npm run build` to confirm green status.
6. Check `git status` to ensure a clean working tree before submitting.

## 10. Append-Only Progress Log

### 2026-10-26 — Phase 1: Repository Reconnaissance & Foundation Plan
- Initialized Git repo on `main`, created `.venv` on Arch Linux, added `.gitignore`, `.env.example`, `docs/DECISIONS.md`, `README.md`, and initialized `PROJECT_STATE.md`.

### 2026-10-26 — Phase 2: Establish Application Foundation
- Installed backend dependencies in `.venv`, built FastAPI app with `GET /health` and `/api/v1/health`, configured CORS and custom exception handlers, scaffolded React/Vite frontend with vanilla CSS, created `pytest.ini` and backend tests.

### 2026-10-26 — Phase 3: Database, Dataset Metadata, and File Storage
- Implemented models (`Dataset`, `DatasetVersion`, `AuditRun`, `Finding`, `Transformation`); enabled SQLite `PRAGMA foreign_keys = ON;`; implemented `StorageService` and `DatasetService`; wrote 8 comprehensive persistence tests.

### 2026-10-26 — Phase 4: CSV Upload, Validation, and Dataset Preview
- Implemented `CSVValidator` (10MB limit, encoding detection, leading zero preservation); implemented upload and preview API endpoints; built React upload and preview components; wrote 10 upload/preview integration tests.

### 2026-10-26 — Phase 5: Dataset Profiling Engine
- Implemented `ProfilingEngine` in `backend/app/audit/profiling.py` computing dataset-level metrics and column-level metrics; created Pydantic models in `backend/app/schemas/profile.py`; built `ProfileView.jsx`; wrote 3 profiling tests.

### 2026-10-27 — Phase 6 & 7: Audit Engine, Deterministic Rules, Quality Score & Audit Dashboard
- Implemented 8 deterministic audit rules (`MissingValuesRule`, `DuplicateRowsRule`, `ConstantColumnsRule`, `HighCardinalityRule`, `NumericOutliersRule`, `TypeConsistencyRule`, `ClassImbalanceRule`, `PotentialLeakageRule`), `AuditEngine`, bounded 0-100 quality scoring with transparent penalties, and interactive `AuditDashboard.jsx` and `FindingDetailDrawer.jsx`. 44 tests passed.

### 2026-10-27 — Phase 8: Cleaning Operations, Non-Mutating Preview, and Version Lineage Creation
- Implemented `TransformationEngine` supporting 4 operations (`impute_median`, `impute_mode`, `remove_duplicates`, `drop_constant_column`), preview and apply API routes, `CleaningPanel.jsx` with before/after diff table, child version creation, and 12 tests. 56 tests passed.

### 2026-10-27 — Phase 9: Version History, Re-Audit, and Multi-Version Comparison
- Implemented `ComparisonService`, lineage history API, findings diff transitions, `CompareView.jsx` side-by-side dashboard with delta metrics, and 6 tests. 62 tests passed.

### 2026-10-27 — Phase 10: CSV Export and HTML/JSON Audit Report Generator
- Implemented `ExportService` in `backend/app/services/export.py` supporting standard and spreadsheet-safe CSV exports, standalone HTML reports, and JSON reports. Built export UI controls and verified 6 export tests. 68 tests passed.

### 2026-10-27 — Phase 11: Dataset Deletion, Error States, and Reliability Pass
- **Goal:** Comprehensive audit of cascading deletion, error handling envelopes, path safety, and transaction recovery.
- **Changes:**
  - Updated `delete_dataset` in `backend/app/services/dataset_service.py` to delete version profile caches (`{v.id}.profile.json`) along with CSV storage files upon dataset deletion.
  - Created `backend/tests/test_reliability.py` with 5 automated reliability tests covering file cleanup, uniform 404 envelopes, path traversal prevention, transaction rollback, and error envelope consistency.
- **Tests/results:** 73 tests passed.

### 2026-10-27 — Phase 12: Reproducible Demo Fixture and End-to-End Lifecycle Verification
- **Goal:** Provide a reproducible test fixture with deliberate anomalies across all 8 audit rules and verify full end-to-end user workflow.
- **Changes:**
  - Crafted `sample_datasets/demo_dirty_dataset.csv` with 20 rows containing duplicates, missing values, constant columns, type inconsistencies, outliers, class imbalance, and formula injection test.
  - Documented dataset anomalies and step-by-step walkthrough in `sample_datasets/README.md`.
  - Built comprehensive integration test `backend/tests/test_e2e_workflow.py` executing the complete 10-step lifecycle: Upload -> Profile -> Audit -> Preview -> Apply (v2, v3, v4) -> Compare -> Export (CSV & HTML/JSON).
  - Verified 74/74 tests passing in 3.92s and clean production frontend build in 1.64s.
- **Tests/results:** All 74 automated tests passed; frontend build succeeded.
- **Commit:** `cc10651`

### 2026-10-27 — Version Tracking and Before/After Comparison Polish
- **Goal:** Comprehensive implementation and verification of version tracking, before/after comparisons, column statistics, configuration checks, empty states, and ancestry tests.
- **Changes:**
  - Added `ColumnStatComparisonItem` to `backend/app/schemas/comparison.py` and `column_stats` to `VersionComparisonResponse`.
  - Added `v1_target_column`, `v2_target_column`, `audit_config_compatible`, and `audit_config_note` to `ScoreComparisonResponse` to verify audit configuration compatibility across versions.
  - Added `missing_percentage` and `duplicate_percentage` deltas to comparison `metrics`.
  - Updated `backend/app/services/comparison.py` to compute column statistics (type, null count, null %, distinct count, numeric mean, numeric median), calculate percentage deltas, check audit configuration compatibility, and scope transformation lineage chronologically.
  - Updated `frontend/src/api/client.js` `runAudit` to flexibly handle options object and versionId.
  - Updated `frontend/src/components/CompareView.jsx`:
    - Added single-version dataset empty state guiding users to Clean & Transform.
    - Added self-comparison notice banner when comparing identical versions.
    - Added Relevant Column Statistics comparison table.
    - Added Missing Percentage and Duplicate Percentage KPI delta cards.
    - Added audit configuration difference notice alert.
    - Added separate "Re-Audit V1" and "Re-Audit V2" buttons.
    - Ensured unresolved findings remain clearly visible in findings transition tabs.
  - Updated `frontend/src/components/AuditDashboard.jsx`:
    - Added Version Selector dropdown in header bar.
    - Linked quality score card to exact audited version ID with timestamp.
    - Enabled re-auditing against currently selected version.
  - Added 3 new tests in `backend/tests/test_comparison.py`:
    - `test_version_ancestry_tracking`: multi-step cleaning pipeline, parent_version_id chaining, distinct storage files, chronological transformation lineage.
    - `test_audit_version_association`: linking audits to exact versions, detecting differing target_column configurations.
    - `test_comparison_calculations_percentages_and_column_stats`: missing/duplicate percentage deltas, column stats (nulls, distinct, mean), unresolved findings retention.
- **Tests/results:** 77/77 tests passed in 2.12s; production Vite build passed in 809ms (0 errors).
- **Next action:** Commit version tracking and comparison improvements.

### 2026-10-27 — Versioned CSV Export and Before/After Audit Report Generator Polish
- **Goal:** Ensure true version-targeted CSV exports, spreadsheet formula injection protection without corrupting negative numbers, comprehensive Before/After comparisons in HTML/JSON reports, version-specific report routing, and visible frontend error handling.
- **Changes:**
  - Enhanced `ExportService.export_csv`:
    - Reads storage for exact selected `version_id`.
    - Handles empty dataset versions safely (0 rows).
    - Preserves valid numeric strings (such as `"-42"` or `"+3.14"`) while escaping formula prefixes (`=`, `+`, `-`, `@`, `\t`, `\r`) with single quote `'` in `spreadsheet_safe` mode.
    - Generates safe filenames (`{safe_name}_v{num}.csv`).
  - Enhanced `ExportService.generate_json_report`:
    - Added `before_after_comparison` powered by `ComparisonService.compare_versions` when audit belongs to a child version (`version.parent_version_id`).
    - Uses `model_dump(mode='json')` and `jsonable_encoder` for strict JSON serializability.
  - Enhanced `ExportService.generate_html_report`:
    - Renders responsive Before/After comparison section with baseline vs cleaned score gauges, missing cell & duplicate row deltas, resolved findings checklist with green badges, and new findings warnings.
    - Added explicit notice when viewing the initial baseline version (v1).
    - Documented spreadsheet formula injection defense mechanism in the report disclaimer.
  - Added API endpoint `GET /api/v1/datasets/{id}/versions/{version_id}/report` to export reports by version ID.
  - Updated `frontend/src/api/client.js`:
    - Updated `downloadFileFromUrl` to fetch blobs, parse server error envelopes (`err.error.message`), extract filenames from `Content-Disposition`, and throw errors on HTTP failures.
    - Updated `getExportReportUrl` to support version-targeted reports.
  - Updated `frontend/src/components/AuditDashboard.jsx`:
    - Bound Export menu CSV downloads to `activeVerId` (the version currently inspected), displaying dynamic version numbers (`v{currentVerNum}`).
    - Added visible error banner (`exportError`) with dismiss button.
  - Updated `frontend/src/components/CompareView.jsx` and `DatasetTable.jsx` to catch export errors and display visible alerts.
  - Added 5 new tests in `backend/tests/test_export.py`:
    - `test_export_csv_empty_version`: exports 0-row header CSV properly.
    - `test_export_csv_selected_version_parity`: verifies v1 export preserves duplicates while v2 export has duplicates removed.
    - `test_export_csv_formula_injection_distinguishes_negative_numbers`: verifies `"-42"` is preserved while `"=cmd|"` and `"-2+3+cmd"` are escaped.
    - `test_audit_report_with_before_after_comparison_child_version`: verifies HTML and JSON reports on child versions contain before/after score deltas, metric improvements, and resolved findings.
    - `test_export_version_report_endpoint`: verifies `GET /versions/{v_id}/report` returns 200 OK with proper headers and contents.
- **Tests/results:** 82/82 tests passed in 2.39s; production Vite build passed in 762ms (0 errors).

### 2026-10-27 — Reliability Pass, In-App Deletion Modal, and Error Uniformity
- **Goal:** Execute a comprehensive reliability pass without adding new features: accessible deletion modal with cascade confirmation, orphan prevention on DB commit rollback, uniform Starlette/FastAPI error envelopes, double submission prevention, network failure resilience, and comprehensive reliability test cases.
- **Changes:**
  - `frontend/src/components/DatasetTable.jsx`: Replaced browser `window.confirm` with an accessible, in-app modal confirmation dialog detailing permanent cascade impact (versions, audits, findings, transformations, and physical disk files) with "Cancel" and "Permanently Delete" buttons and active spinner state.
  - `backend/app/services/dataset_service.py`: Wrapped `create_dataset` and `create_version` database commits in `try...except` blocks with `db.rollback()` and `self.storage.delete_file(storage_ref)`, ensuring any DB commit failure immediately purges the newly written file from disk.
  - `backend/app/core/errors.py`: Registered handlers for `StarletteHTTPException` (404, 405, 500) and `RequestValidationError` (422) in addition to `DataLensError`, standardizing all API error responses to `{ "error": "...", "message": "...", "details": { ... } }`.
  - `frontend/src/api/client.js`: Enhanced `checkHealth`, `apiClient`, and `downloadFileFromUrl` with `try...catch` blocks catching network errors / connection refused (`Failed to fetch`) and surfacing actionable error messages (`Network Error: Unable to connect to DataLens backend at ...`).
  - `frontend/src/components/UploadSection.jsx`, `CleaningPanel.jsx`, and `AuditDashboard.jsx`: Added submission guards preventing concurrent / duplicated uploads, transformation applications, re-audits, and file exports.
  - `backend/tests/test_reliability.py`: Added 5 new automated tests:
    - `test_http_exception_and_method_not_allowed_envelope`: verifies 405 Method Not Allowed returns uniform envelope.
    - `test_request_validation_error_envelope`: verifies 422 RequestValidationError returns uniform envelope with error details.
    - `test_rollback_on_failed_dataset_creation_cleans_file`: verifies disk storage file is purged if DB commit fails during dataset creation.
    - `test_rollback_on_failed_version_creation_cleans_file`: verifies disk storage file is purged if DB commit fails during version creation.
    - `test_delete_dataset_endpoint_full_lifecycle`: verifies `DELETE /api/v1/datasets/{id}` deletes DB records, cache, and files, and returns 200.
- **Tests/results:** 87/87 tests passed in 2.46s; production Vite build passed in 774ms (0 errors).

### 2026-10-27 — Final Shippable Release Pass & Deployment Documentation
- **Goal:** Final hardening to make product shippable: verify all 87 tests, confirm frontend builds, verify full E2E lifecycle, test invalid uploads and invalid transformations, verify local setup and daemon running, inspect `.env.example` and `.gitignore` for zero secrets, add System Architecture summary with Mermaid diagram and module boundaries to `README.md`, add production deployment guides (Linux VPS systemd/nginx & multi-stage `Dockerfile`/`docker-compose.yml`), specify persistent storage volume requirements, and truthfully declare external cloud deployment unverified.
- **Changes:**
  - Created `Dockerfile`: Multi-stage production build (Node 20 Vite build + Python 3.11 runtime with volume `/app/storage`).
  - Created `docker-compose.yml`: Local production orchestration with named volume `datalens_data` mounted to `/app/storage`.
  - Updated `README.md`: Added System Architecture section with Mermaid diagram, detailed module boundaries, step-by-step Linux VPS (Systemd + Nginx) deployment guide, Docker guide, persistent storage behavior explanation, and updated limitations.
  - Verified zero secrets committed: Only `.env.example` tracked; `.env`, `*.db`, `storage/`, `node_modules/`, and `.venv/` strictly git-ignored.
  - Ran backend test suite: 87/87 tests passed in 2.42s.
  - Ran frontend build: Vite production build succeeded in 774ms (0 errors).
  - Verified daemon health endpoints: `GET /health` and `GET /api/v1/health` responded with 200 OK.
- **Tests/results:** All 87 automated tests passed; production Vite build passed. Product is verified and shippable.

### 2026-10-27 — Bug Fix: Audit Summary Cards Disagree with Audit Findings
- **Goal:** Resolve discrepancy where the findings list and quality score reflect defects (3 missing cells, 1 duplicate row) in `datalens_test_dataset.csv`, but summary cards displayed `0 cells, 0.0%` and `0, 0.0% of rows`.
- **Root Cause:**
  1. Frontend schema mismatch: `AuditDashboard.jsx` attempted to read `profile?.dataset_metrics.missing_cells`, but `DatasetProfileResponse` exposed metrics directly at the root of the JSON payload.
  2. Audit vs Profile decoupling: Summary cards were decoupled from the active `audit?.summary` and relied exclusively on `profile`, meaning re-running an audit did not refresh summary metrics.
  3. Missing summary fields: `calculate_quality_score` in `scoring.py` did not expose top-level standard metric keys (`missing_cells`, `duplicate_rows`, `row_count`, `column_count`, `total_cells`) in the `summary_breakdown` dictionary.
- **Changes:**
  - `backend/app/audit/scoring.py`: Added `missing_cells`, `missing_percentage`, `duplicate_rows`, `duplicate_percentage`, `row_count`, `column_count`, and `total_cells` to `summary_breakdown`.
  - `backend/app/audit/profiling.py`: Added nested `dataset_metrics` object to profiling result dictionary for backwards and forwards schema compatibility.
  - `backend/app/schemas/profile.py`: Added `dataset_metrics: Optional[Dict[str, Any]] = None` to `DatasetProfileResponse`.
  - `frontend/src/components/AuditDashboard.jsx`:
    - Refactored summary card metric derivation with robust multi-tiered fallback: `audit.summary` -> `profile` root -> `profile.dataset_metrics` -> aggregated findings evidence.
    - Updated `handleRunNewAudit` to refresh dataset profile concurrently when re-auditing a version.
  - `backend/tests/test_audit_rules.py`: Added regression test `test_audit_summary_metrics_agree_with_findings_for_test_dataset` verifying upload, audit findings (3 missing cells across `attendance_pct`, `marks`, `scholarship`, 1 duplicate row), profile agreement, and rerun consistency.
- **Tests/results:** 88/88 tests passed in 2.62s; production Vite build passed in 748ms (0 errors).

### 2026-10-27 — Landing Page and Separate All Datasets Page Implementation
- **Goal:** Create a professional SaaS landing page with DataLens branding, value proposition, prominent CSV upload area, recent datasets (max 5) with real audit scores/timestamps, a clear "View All Datasets" action, and a dedicated All Datasets page with live search, sorting, pagination, and full operational actions.
- **Changes:**
  - `frontend/src/api/client.js`: Added `getLatestAuditsForDatasets` to fetch true latest audit runs in parallel without inventing scores or altering backend endpoints.
  - `frontend/src/components/LandingPage.jsx`:
    - SaaS Hero section with key value propositions and dataset counters.
    - Prominent CSV drag-and-drop upload zone with client & backend validation, upload progress spinner, and post-upload success banner with "Audit Dataset Now" action.
    - Recent Datasets grid displaying at most 5 datasets sorted by `created_at` descending.
    - Cards display dataset name, original filename, dimensions (rows × columns), real quality score badge with score level, uploaded and audited timestamps, and "Open Dataset", "Profile", and "Preview" buttons.
    - Empty, loading, and error states with retry.
    - "View All Datasets" CTA button in section header and footer.
  - `frontend/src/components/AllDatasetsPage.jsx`:
    - Full dataset collection view with live search by dataset/file name.
    - 8-way metadata sorting: Uploaded (newest/oldest), Name (A-Z/Z-A), Rows (high/low), and Quality Score (high/low).
    - Client-side pagination (10, 25, 50 per page) with page number buttons, previous/next buttons, and range indicator.
    - Real audit score badges and timestamps fetched dynamically from existing audit API.
    - Retains all supported dataset actions: Audit, Profile, Preview, Compare, CSV Export, and Cascade Delete with confirmation modal.
  - `frontend/src/App.jsx`:
    - Integrated `LandingPage` (default view) and `AllDatasetsPage` with unified navbar tabs ("Home", "All Datasets" with counter badge).
    - Preserved seamless transitions to `AuditDashboard`, `ProfileView`, and `CompareView`, with contextual "← All Datasets" and "← Home" back buttons.
  - `frontend/src/index.css`: Added navigation tab styling, active indicator, counter badge, hero card gradient, and responsive mobile/tablet media queries.
- **Backend Limitations Documented:**
  1. *Timestamp tracking*: Backend tracks `created_at` on datasets and versions, but does not persist an `updated_at` or `last_opened_at` field. Recent datasets are sorted by `created_at` descending as the most defensible activity timestamp.
  2. *Quality score in dataset list*: `GET /api/v1/datasets` does not embed audit scores. The frontend calls `GET /api/v1/datasets/{id}/audits` in parallel for visible datasets to retrieve real scores and audit timestamps rather than hardcoding or altering backend models.
  3. *List total count*: `GET /api/v1/datasets` sets `total = len(datasets)` (sliced length). Client-side pagination over retrieved records ensures accurate search and pagination counts.
- **Tests/results:** 88/88 backend pytest tests passed in 2.63s; production Vite build compiled cleanly in 823ms (0 errors).

### 2026-10-27 — Audit Page Redesign: Audit Overview & Actionable Findings
- **Goal:** Redesign the DataLens audit dashboard into two distinct, user-centered sections: Audit Overview and Actionable Findings, prioritizing genuine quality defects over statistical heuristics and connecting findings directly to cleaning actions.
- **Changes:**
  - `backend/app/audit/rules/high_cardinality.py`:
    - Refined `HighCardinalityRule` to prevent false positive identifier warnings on continuous numeric measurements (e.g., float columns such as exam `marks`, temperatures, rates) where high distinctness ratios (>90%) are normal and expected.
    - Continuous float series are skipped; integer columns are checked for ID-like column names or strictly 100% unique sequences; text/string columns (UUIDs, student IDs, keys) remain strictly audited.
  - `frontend/src/components/CleaningPanel.jsx`:
    - Added `initialOperation` and `initialColumn` props with a `useEffect` synchronization hook to enable seamless pre-population of the cleaning wizard directly from audit finding action buttons.
  - `frontend/src/components/AuditDashboard.jsx`:
    - **Section A (Audit Overview):**
      - Header: Dataset name, original filename, active version selector, row/column dimensions.
      - Quality Score Display: Score out of 100, status badge (Excellent / Good / Fair / Needs Review / Poor), explicit disclaimer that the score reflects implemented deterministic checks only and does not prove universal dataset correctness.
      - Collapsible Penalty Breakdown: Compact toggle button (`View Penalty Breakdown (-N pts) ▼`) revealing deduction items for missingness, duplicates, constant columns, type inconsistencies, and anomalies in a secondary panel without dominating screen space.
      - Metric Summary KPI Cards: Total Findings, Missing Cells (count and percentage), Exact Duplicate Rows (count and percentage), and High / Medium / Low severity cards.
      - Secondary Collapsible Controls: Moved advanced audit execution controls (including optional target-column selector and version target) into an expandable card (`⚙️ Advanced Audit Execution Controls`).
    - **Section B (Actionable Findings):**
      - Category Segmentation Tabs: *All Findings*, *Confirmed Quality Defects* (missing values, exact duplicates, constant columns, type errors), and *Heuristic Observations* (Tukey IQR outliers, high cardinality / identifiers, class imbalance, feature correlation).
      - Multi-Filter Toolbar: Severity dropdown, Rule dropdown, Column dropdown, live keyword search, and Clear Filters button.
      - Finding Cards: Left severity accent border, severity badge, classification badge (*Confirmed Defect* vs *Heuristic Observation*), affected column badge, rule ID tag, plain-language title, concise description, formatted evidence snippet (null count, duplicate count, constant value, IQR fences, unparseable strings), actionable recommendation arrow, and interactive action buttons:
        - *Preview Fix (Impute Median / Impute Mode / Remove Duplicates / Drop Column)*: opens `CleaningPanel` pre-configured to the operation and column.
        - *Inspect Column*: switches to ProfileView or column profile.
        - *View Rows*: opens `PreviewModal`.
        - *View Details*: opens `FindingDetailDrawer`.
- **Tests/results:** 88/88 backend pytest tests passing in 2.64s; production Vite build compiled cleanly in 816ms (0 errors).



