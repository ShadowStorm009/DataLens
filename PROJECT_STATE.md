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

- **Last updated:** 2026-10-26 23:56 IST
- **Branch:** `main`
- **HEAD commit:** `9a12618` (Phase 5 commit pending)
- **Git status:** Clean staging in progress for Phase 5 profiling engine files.
- **Frontend entry point:** `frontend/src/main.jsx` (Vite + React, production build verified)
- **Backend entry point:** `backend/app/main.py` (FastAPI app with health, upload, preview, profile, and dataset management endpoints)
- **Database configuration:** SQLite connection URL configured via `DATABASE_URL` (default: `sqlite:///./storage/datalens.db`) with `PRAGMA foreign_keys = ON` enforced.
- **Upload/storage directory:** `./storage` (git-ignored, versioned dataset storage, managed via `StorageService`)
- **Frontend run command:** `cd frontend && npm run dev`
- **Backend run command:** `.venv/bin/uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload`
- **Test commands:** `.venv/bin/pytest -v`
- **Environment variable names:** `DATALENS_ENV`, `DATALENS_HOST`, `DATALENS_PORT`, `DATABASE_URL`, `STORAGE_DIR`, `MAX_UPLOAD_SIZE_BYTES`, `CORS_ORIGINS`, `VITE_API_BASE_URL`
- **Deployment URL/status:** Unverified / Local persistence, upload, preview, and profiling verified.
- **Important architecture notes:** Arch Linux host requires Python installations in `.venv/`. Core audit logic remains deterministic without external LLM dependencies.

## 3. Feature Status Matrix

Use only these statuses: `VERIFIED`, `IMPLEMENTED_UNVERIFIED`, `PARTIAL`, `NOT_STARTED`, `BLOCKED`.

| Feature | Status | Files/modules | What works | What remains | Test evidence |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Repository foundation & health check** | VERIFIED | `backend/app/main.py`, `backend/app/api/routes/health.py`, `frontend/src/App.jsx`, `frontend/vite.config.js` | FastAPI app starts, `/health` and `/api/v1/health` respond with 200 OK, CORS enabled for frontend, custom error handling registered, Vite builds cleanly | Full dashboard features in subsequent phases | `pytest` 3 passed in 0.08s; `npm run build` passed in 1.46s; `curl` verified 200 OK & CORS preflight |
| **SQLite persistence & models** | VERIFIED | `backend/app/db/`, `backend/app/models/`, `backend/app/services/` | SQLite engine with foreign key enforcement; ORM models (`Dataset`, `DatasetVersion`, `AuditRun`, `Finding`, `Transformation`); `StorageService` with SHA256 & path safety; `DatasetService` with CRUD, lineage, and cascade deletion | HTTP route handlers for audits and transforms (Phases 6-10) | `backend/tests/test_persistence.py` 8 passed (creation, lineage, audit link, transformations, 404s, cascade delete, foreign keys, process restart survival) |
| **CSV upload & validation** | VERIFIED | `backend/app/services/csv_validator.py`, `backend/app/api/routes/datasets.py`, `frontend/src/components/UploadSection.jsx` | Server-side size check (10MB limit), encoding detection, empty check, malformed CSV rejection, duplicate header sanitization, leading zeros preservation, drag-and-drop & file picker UI | None | `backend/tests/test_upload_and_preview.py` 10 passed (valid CSV, empty, malformed, oversized 413, duplicate headers, leading zeros, orphan prevention) |
| **Dataset preview & profile** | VERIFIED | `backend/app/audit/profiling.py`, `backend/app/api/routes/datasets.py`, `frontend/src/components/ProfileView.jsx`, `frontend/src/components/PreviewModal.jsx` | Reusable `ProfilingEngine` computing dataset and column statistics (numeric, categorical, datetime, boolean, text); type inference heuristics; bounded top-N values; caching tied to immutable versions; bounded preview modal; full responsive `ProfileView` | None | `backend/tests/test_profiling.py` 3 passed (hand-calculated values, edge cases resilience, caching & endpoint) |
| **Audit rules & findings** | NOT_STARTED | `backend/app/audit/` | Finding ORM model ready | Deterministic rules: missing values, duplicates, constant cols, IQR outliers, type mismatch, class imbalance | None yet |
| **Quality score & dashboard** | NOT_STARTED | `backend/app/audit/quality_score.py`, `frontend/src/pages/Dashboard.jsx` | Score and method version stored in `AuditRun` model | Weighted penalty score calculation (0–100), severity breakdown UI | None yet |
| **Cleaning preview** | NOT_STARTED | `backend/app/services/cleaner.py` | None | Non-mutating preview API & UI for median/mode imputation, duplicate drop, col drop | None yet |
| **Apply transformations & create versions** | NOT_STARTED | `backend/app/services/cleaner.py` | `create_version` and `record_transformation` in `DatasetService` | Transformation engine calling preview/apply functions | Covered in persistence tests |
| **Re-audit & comparison** | NOT_STARTED | `backend/app/services/comparison.py`, `frontend/src/pages/ComparePage.jsx` | Multi-version audit linkage modeled in `AuditRun` | Multi-version audit re-run, side-by-side metric comparison | None yet |
| **CSV and report export** | NOT_STARTED | `backend/app/services/export.py` | CSV storage retrieval ready | CSV version download endpoint, HTML/JSON audit report generator | None yet |
| **Dataset deletion & reliability** | PARTIAL | `backend/app/api/routes/datasets.py`, `frontend/src/components/DatasetTable.jsx` | DELETE `/api/v1/datasets/{id}` endpoint and UI delete button with confirmation dialog; DB records cascade and files purged | Reliability edge cases pass (Phase 11) | `test_cascade_delete_dataset_and_files` PASSED |
| **Automated tests** | PARTIAL | `backend/tests/` | 24 automated unit, persistence, profiling, upload, and preview tests passing | Audit rules and transformation tests | 24 passed in 1.21s |
| **README & deployment** | PARTIAL | `README.md`, `docs/DECISIONS.md`, `.env.example` | Setup instructions, architecture, invariants documented | Verified production deployment | Docs and setup verified locally |
| **Demo and final submission checklist** | NOT_STARTED | `docs/` | PRD criteria documented | Reproducible test CSV with known quality defects, demo verification | None yet |

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
  - `DELETE /api/v1/datasets/{id}`: Delete dataset, cascading to versions, audits, and physical files.
- **Statistical Profiling Engine (`ProfilingEngine`):**
  - Dataset metrics: `row_count`, `column_count`, `total_cells`, `missing_cells`, `missing_percentage`, `duplicate_rows`, `duplicate_percentage`, `type_counts`.
  - Type inference: `numeric`, `categorical`, `datetime`, `boolean`, `text` based on documented deterministic heuristics.
  - Numeric metrics: min, max, mean, median, sample std (ddof=1), quartiles (Q1, median, Q3), missing count, distinct count. Non-finite values (`inf`, `-inf`) filtered safely.
  - Categorical metrics: distinct count, missing count, unique ratio, top-5 frequent values with counts and proportions.
  - Datetime metrics: min/max ISO dates, invalid date string count, missing count.
  - JSON-safe serializer `to_json_safe`: normalizes NumPy scalars, pandas Timestamps, NaNs, and Infs.
  - Caching: Profile results cached per immutable version at `{version.id}.profile.json`.
- **Database Architecture & ORM Models:**
  - `Dataset`, `DatasetVersion`, `AuditRun`, `Finding`, `Transformation`.
  - SQLite foreign key enforcement via `PRAGMA foreign_keys = ON;`.
- **UI Components:**
  - `ProfileView.jsx`: Complete statistical profiling page with KPI cards (Dimensions, Missing Cells, Duplicates, Types breakdown), column search, type filter, and detailed column tables showing distributions and frequency bars.
  - `UploadSection.jsx`: Drag-and-drop file upload with validation feedback.
  - `DatasetTable.jsx`: Dataset table with "View Profile", "Preview Rows", and "Delete" actions.
  - `PreviewModal.jsx`: Interactive tabular preview with row-limit controls.
  - `App.jsx`: Responsive application shell with view routing between Dashboard, Upload, and Profile view.

## 5. Work Completed in Most Recent Session

- **Goal:** Phase 5: Dataset Profiling Engine.
- **Changes made:**
  - Implemented `backend/app/audit/profiling.py` featuring `ProfilingEngine` with dataset-level metrics, column-level summaries for numeric, categorical, boolean, and datetime columns, type inference heuristics, non-finite value protection, and recursive JSON-safe primitive serialization.
  - Created Pydantic models in `backend/app/schemas/profile.py` (`NumericStats`, `CategoricalStats`, `DatetimeStats`, `ColumnProfile`, `DatasetProfileResponse`).
  - Implemented `GET /api/v1/datasets/{dataset_id}/profile` with version-keyed immutable caching.
  - Created `frontend/src/components/ProfileView.jsx` rendering KPI cards, type filter, column search, numeric quartile summaries, categorical frequency bars, and datetime bounds.
  - Updated `DatasetTable.jsx` and `App.jsx` enabling navigation to the Profile View.
  - Created `backend/tests/test_profiling.py` with 3 test functions: hand-calculated statistical accuracy verification, edge cases resilience (all-null, constant, 1-row, infs, empty strings), and API endpoint caching.
- **Files created/modified/deleted:**
  - Created: `backend/app/audit/profiling.py`
  - Created: `backend/app/schemas/profile.py`
  - Created: `backend/tests/test_profiling.py`
  - Created: `frontend/src/components/ProfileView.jsx`
  - Modified: `backend/app/schemas/__init__.py`
  - Modified: `backend/app/api/routes/datasets.py`
  - Modified: `frontend/src/api/client.js`
  - Modified: `frontend/src/components/DatasetTable.jsx`
  - Modified: `frontend/src/App.jsx`
  - Updated: `PROJECT_STATE.md`
- **Commands run:**
  - `.venv/bin/pytest -v`
  - `cd frontend && npm run build`
- **Tests and actual results:**
  - `pytest`: 24 passed in 1.21s (`test_health.py` 3 tests, `test_persistence.py` 8 tests, `test_upload_and_preview.py` 10 tests, `test_profiling.py` 3 tests).
  - `npm run build`: Production bundle built in 1.49s (0 errors).
- **Build result:** Success for both frontend and backend.
- **Commit(s):** Pending Phase 5 commit.
- **Known limitations:** Quality audit engine and rules not yet implemented (Phase 6).

## 6. Known Bugs, Risks, and Blockers

1. **Risk — Arch Linux Python Environment:**
   - *Status:* Mitigated. Virtual environment `.venv` fully functional with installed packages.
2. **Risk — In-Memory File Size vs. Processing Time:**
   - *Status:* Mitigated. Profiling results cached per immutable version ID, avoiding re-calculation on repeated requests.
3. **Risk — Non-finite Numbers (inf, -inf) in Numeric Summary:**
   - *Status:* Mitigated. Filtered via `np.isfinite` before calculating mean, std, and quantiles.

## 7. Next Actions (Ordered)

1. **Next exact action:** Phase 6 — Audit Engine and Findings Schema:
   - Implement modular, deterministic audit rules in `backend/app/audit/`:
     - `missing_values.py`: column missing count, percentage, severity assignment.
     - `duplicates.py`: exact duplicate rows count, affected row indices, severity.
     - `constant_columns.py`: detect columns with 1 unique non-null value.
     - `high_cardinality.py`: detect identifier-like or ID candidate columns.
     - `outliers.py`: calculate IQR, Q1, Q3, lower/upper fences [Q1 - 1.5*IQR, Q3 + 1.5*IQR], and outlier counts.
     - `type_consistency.py`: detect inconsistent string values in numeric/date columns.
     - `class_imbalance.py`: detect imbalanced categorical distributions when target is specified or column is binary/low-cardinality.
   - Implement common `Finding` schema in `backend/app/schemas/audit.py`.
   - Implement audit runner service in `backend/app/audit/engine.py` orchestrating rules and persisting `AuditRun` + `Finding` records.
   - Add audit routes `POST /api/v1/datasets/{dataset_id}/audits` and `GET /api/v1/datasets/{dataset_id}/audits/{audit_id}`.
   - Write pytest unit tests for each rule with known defect fixtures.
2. Phase 7: Quality score calculation and audit results dashboard.
3. Phase 8: Cleaning operations, non-mutating previews, and versioned transformations.
4. Phase 9: Multi-version re-audit, lineage tracking, and before/after comparisons.
5. Phase 10: CSV version export and audit report generator (HTML/JSON).
6. Phase 11: Dataset deletion, edge cases, and reliability pass.
7. Phase 12: End-to-end testing, reproducible demo dataset, and final documentation polish.

## 8. Things That Must Not Be Regressed

- Original uploaded dataset must remain immutable.
- Preview operations must not modify persisted data.
- Applying a transformation creates a new version.
- Every audit must reference the exact dataset version audited.
- Audit results must be based on actual data, not hardcoded demo values.
- Core audit and cleaning logic must work without an external LLM.
- No Tailwind or unnecessary external infrastructure.

## 9. Resume Instructions for the Next Model

1. Read this file completely.
2. Read the PRD and AI Agent Prompt Pack (`DataLens_AI_Agent_Prompt_Pack.md`).
3. Inspect `git status`, recent commits, relevant source files, and tests.
4. Verify this file's claims against code and tests; correct discrepancies.
5. Continue from the first incomplete, unblocked action above (Phase 6).
6. Do not restart or rewrite working features.
7. Run relevant tests after changes.
8. Update this file and append a progress entry before ending.

## 10. Append-Only Progress Log

### 2026-10-26 — Phase 1: Repository Reconnaissance & Foundation Plan
- **Goal:** Assess repository, establish environment isolation, plan phased implementation, and document baseline.
- **Changes:** Initialized Git repo on `main`, created `.venv` on Arch Linux, added `.gitignore`, `.env.example`, `docs/DECISIONS.md`, `README.md`, and initialized `PROJECT_STATE.md`.
- **Tests/results:** `.venv` Python 3.14.8 environment verified.
- **Unfinished work:** Application code foundation (Phase 2).
- **Next action:** Phase 2: Scaffold backend FastAPI (`/health`), install requirements in `.venv`, scaffold Vite React frontend, and verify builds and connectivity.

### 2026-10-26 — Phase 2: Establish Application Foundation
- **Goal:** Build the missing frontend and backend foundation, verify build and test execution, configure CORS, and establish module boundaries.
- **Changes:** Installed backend dependencies in `.venv`, built FastAPI app with `GET /health` and `/api/v1/health`, configured CORS and custom exception handlers, created modular directories, scaffolded React/Vite frontend with vanilla CSS and health check client, created `pytest.ini` and backend tests.
- **Tests/results:** Pytest passed 3/3 tests in 0.08s; Vite build succeeded in 1.46s; curl confirmed live 200 OK and CORS preflight.
- **Unfinished work:** SQLite persistence and data models (Phase 3).
- **Next action:** Phase 3: Implement database models, storage service, and persistence unit tests.

### 2026-10-26 — Phase 3: Database, Dataset Metadata, and File Storage
- **Goal:** Implement the minimum persistence layer required by DataLens with SQLite, SQLAlchemy ORM models, file storage service, and cascade deletion.
- **Changes:** Created models for `Dataset`, `DatasetVersion`, `AuditRun`, `Finding`, and `Transformation`; enabled SQLite `PRAGMA foreign_keys = ON;`; implemented `StorageService` with SHA-256 integrity and safe path resolution; implemented `DatasetService` with CRUD, lineage tracking, and cascading deletion; added lifespan DB initialization to `main.py`; wrote 8 comprehensive persistence tests covering restart survival, version lineage, audit linkage, and cascading deletes.
- **Tests/results:** Pytest passed 11/11 tests in 0.64s; Vite build succeeded in 1.43s.
- **Unfinished work:** CSV upload endpoints and dataset preview (Phase 4).
- **Next action:** Phase 4: Implement CSV upload, validation, and dataset preview endpoints and UI.

### 2026-10-26 — Phase 4: CSV Upload, Validation, and Dataset Preview
- **Goal:** Implement the complete upload workflow, validation, safe parsing, immutable version 1 creation, bounded row preview, and frontend UI.
- **Changes:** Implemented `CSVValidator` with multi-encoding support, 10MB limit enforcement, header sanitization, and non-destructive string parsing; created dataset Pydantic schemas; implemented `POST /datasets`, `GET /datasets`, `GET /datasets/{id}`, `GET /datasets/{id}/preview`, `GET /datasets/{id}/versions`, and `DELETE /datasets/{id}`; built React components `UploadSection`, `DatasetTable`, and `PreviewModal`; wrote 10 integration tests.
- **Tests/results:** Pytest passed 21/21 tests in 1.14s; Vite build succeeded in 1.38s.
- **Unfinished work:** Statistical profiling algorithms and profiling UI (Phase 5).
- **Next action:** Phase 5: Implement reusable, testable dataset profiling engine and Profile view.

### 2026-10-26 — Phase 5: Dataset Profiling Engine
- **Goal:** Implement reusable, testable dataset profiling engine and interactive profile view.
- **Changes:** Implemented `ProfilingEngine` in `backend/app/audit/profiling.py` computing dataset-level metrics (dimensions, missing percentage, exact duplicates) and column-level metrics (numeric min/max/mean/median/std/quartiles, categorical top-5 frequencies, datetime min/max/invalid counts, boolean detection); created Pydantic models in `backend/app/schemas/profile.py`; implemented cached `GET /api/v1/datasets/{dataset_id}/profile` endpoint; built `ProfileView.jsx` with KPI cards, search, type filters, distribution summaries, and categorical frequency bars; wrote 3 profiling tests covering exact hand-calculated statistics, edge case resilience, and caching.
- **Tests/results:** Pytest passed 24/24 tests in 1.21s; Vite build succeeded in 1.49s.
- **Unfinished work:** Deterministic quality audit engine and rules (Phase 6).
- **Next action:** Phase 6: Implement deterministic audit engine with modular rules and structured findings schema.
