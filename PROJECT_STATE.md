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

- **Last updated:** 2026-10-26 23:49 IST
- **Branch:** `main`
- **HEAD commit:** `294cb8b` (Phase 4 commit pending)
- **Git status:** Clean staging in progress for Phase 4 upload and preview files.
- **Frontend entry point:** `frontend/src/main.jsx` (Vite + React, production build verified)
- **Backend entry point:** `backend/app/main.py` (FastAPI app with `/health`, CORS, upload, preview, and dataset management endpoints)
- **Database configuration:** SQLite connection URL configured via `DATABASE_URL` (default: `sqlite:///./storage/datalens.db`) with `PRAGMA foreign_keys = ON` enforced.
- **Upload/storage directory:** `./storage` (git-ignored, versioned dataset storage, managed via `StorageService`)
- **Frontend run command:** `cd frontend && npm run dev`
- **Backend run command:** `.venv/bin/uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload`
- **Test commands:** `.venv/bin/pytest -v`
- **Environment variable names:** `DATALENS_ENV`, `DATALENS_HOST`, `DATALENS_PORT`, `DATABASE_URL`, `STORAGE_DIR`, `MAX_UPLOAD_SIZE_BYTES`, `CORS_ORIGINS`, `VITE_API_BASE_URL`
- **Deployment URL/status:** Unverified / Local persistence, upload, and preview verified.
- **Important architecture notes:** Arch Linux host requires Python installations in `.venv/`. Core audit logic remains deterministic without external LLM dependencies.

## 3. Feature Status Matrix

Use only these statuses: `VERIFIED`, `IMPLEMENTED_UNVERIFIED`, `PARTIAL`, `NOT_STARTED`, `BLOCKED`.

| Feature | Status | Files/modules | What works | What remains | Test evidence |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Repository foundation & health check** | VERIFIED | `backend/app/main.py`, `backend/app/api/routes/health.py`, `frontend/src/App.jsx`, `frontend/vite.config.js` | FastAPI app starts, `/health` and `/api/v1/health` respond with 200 OK, CORS enabled for frontend, custom error handling registered, Vite builds cleanly | Full dashboard features in subsequent phases | `pytest` 3 passed in 0.08s; `npm run build` passed in 1.46s; `curl` verified 200 OK & CORS preflight |
| **SQLite persistence & models** | VERIFIED | `backend/app/db/`, `backend/app/models/`, `backend/app/services/` | SQLite engine with foreign key enforcement; ORM models (`Dataset`, `DatasetVersion`, `AuditRun`, `Finding`, `Transformation`); `StorageService` with SHA256 & path safety; `DatasetService` with CRUD, lineage, and cascade deletion | HTTP route handlers for audits and transforms (Phases 5-10) | `backend/tests/test_persistence.py` 8 passed (creation, lineage, audit link, transformations, 404s, cascade delete, foreign keys, process restart survival) |
| **CSV upload & validation** | VERIFIED | `backend/app/services/csv_validator.py`, `backend/app/api/routes/datasets.py`, `frontend/src/components/UploadSection.jsx` | Server-side size check (10MB limit), encoding detection, empty check, malformed CSV rejection, duplicate header sanitization, leading zeros preservation, drag-and-drop & file picker UI | None | `backend/tests/test_upload_and_preview.py` 10 passed (valid CSV, empty, malformed, oversized 413, duplicate headers, leading zeros, orphan prevention) |
| **Dataset preview & profile** | PARTIAL | `backend/app/api/routes/datasets.py`, `frontend/src/components/PreviewModal.jsx` | Bounded preview endpoint (`GET /api/v1/datasets/{id}/preview?limit=20`), interactive tabular preview modal with row limiter | Profiling statistics engine (numeric, categorical, nulls, types) in Phase 5 | `backend/tests/test_upload_and_preview.py` 10 passed (preview limit and missing 404 tests) |
| **Audit rules & findings** | NOT_STARTED | `backend/app/audit/` | Finding ORM model ready | Deterministic rules: missing values, duplicates, constant cols, IQR outliers, type mismatch, class imbalance | None yet |
| **Quality score & dashboard** | NOT_STARTED | `backend/app/audit/quality_score.py`, `frontend/src/pages/Dashboard.jsx` | Score and method version stored in `AuditRun` model | Weighted penalty score calculation (0–100), severity breakdown UI | None yet |
| **Cleaning preview** | NOT_STARTED | `backend/app/services/cleaner.py` | None | Non-mutating preview API & UI for median/mode imputation, duplicate drop, col drop | None yet |
| **Apply transformations & create versions** | NOT_STARTED | `backend/app/services/cleaner.py` | `create_version` and `record_transformation` in `DatasetService` | Transformation engine calling preview/apply functions | Covered in persistence tests |
| **Re-audit & comparison** | NOT_STARTED | `backend/app/services/comparison.py`, `frontend/src/pages/ComparePage.jsx` | Multi-version audit linkage modeled in `AuditRun` | Multi-version audit re-run, side-by-side metric comparison | None yet |
| **CSV and report export** | NOT_STARTED | `backend/app/services/export.py` | CSV storage retrieval ready | CSV version download endpoint, HTML/JSON audit report generator | None yet |
| **Dataset deletion & reliability** | PARTIAL | `backend/app/api/routes/datasets.py`, `frontend/src/components/DatasetTable.jsx` | DELETE `/api/v1/datasets/{id}` endpoint and UI delete button with confirmation dialog; DB records cascade and files purged | Reliability edge cases pass (Phase 11) | `test_cascade_delete_dataset_and_files` PASSED |
| **Automated tests** | PARTIAL | `backend/tests/` | 21 automated unit, persistence, upload, and preview tests passing | Profiling, audit rules, and transformation tests | 21 passed in 1.14s |
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
  - `GET /api/v1/datasets/{id}/versions`: List dataset versions.
  - `DELETE /api/v1/datasets/{id}`: Delete dataset, cascading to versions, audits, and physical files.
- **Database Architecture & ORM Models:**
  - `Dataset`: `id` (UUID), `name`, `original_filename`, `created_at`, `current_version_id`, `row_count`, `column_count`, `status`, `storage_reference`.
  - `DatasetVersion`: `id` (UUID), `dataset_id` (FK datasets.id cascade), `parent_version_id` (FK dataset_versions.id set null), `version_number` (int, 1-indexed), `row_count`, `column_count`, `storage_reference`, `content_hash` (SHA256).
  - `AuditRun`: `id` (UUID), `dataset_id` (FK datasets.id cascade), `version_id` (FK dataset_versions.id cascade), `created_at`, `status`, `score` (Float), `score_method_version`, `serialized_summary`.
  - `Finding`: `id` (UUID), `audit_id` (FK audit_runs.id cascade), `rule_id`, `column_name`, `severity` (high/medium/low), `title`, `description`, `structured_evidence` (JSON text), `recommendation`, `finding_type`.
  - `Transformation`: `id` (UUID), `dataset_id` (FK datasets.id cascade), `source_version_id` (FK dataset_versions.id cascade), `result_version_id` (FK dataset_versions.id cascade), `operation_type`, `column_name`, `parameters` (JSON text), `rows_affected`, `cells_affected`, `created_at`.
- **Foreign Key Enforcement:** SQLite `PRAGMA foreign_keys=ON;` hooked via SQLAlchemy `connect` listener.
- **Storage Management:** `StorageService` manages internal files in `./storage/`, prevents directory traversal, calculates SHA-256 checksums, and manages CSV file persistence.
- **CSV Validation:** `CSVValidator` enforces max file size (10 MB), decodes UTF-8/UTF-8-BOM/Latin-1, handles and disambiguates duplicate headers safely (`col`, `col_2`), and avoids destructive coercion of leading zeros.
- **Backend Error Handling:** `DataLensError`, `ResourceNotFoundError` (404), `FileValidationError` (422), `FileSizeLimitError` (413), `TransformationError` (400), `StorageError` (500).
- **UI Components:**
  - `UploadSection.jsx`: Drag-and-drop zone, file picker, file size preview, custom dataset name, error alert, success banner.
  - `DatasetTable.jsx`: Stored datasets table with metadata, preview button, delete button with confirmation, empty state.
  - `PreviewModal.jsx`: Modal displaying bounded rows with row limit selector (10, 20, 50 rows) and null indicator.
  - `App.jsx`: Full responsive application container with live backend connectivity status.
- **External services/integrations:** None (strictly local, offline-capable).

## 5. Work Completed in Most Recent Session

- **Goal:** Phase 4: CSV Upload, Validation, and Dataset Preview.
- **Changes made:**
  - Implemented `backend/app/services/csv_validator.py` with multi-encoding fallback, size limit validation (10MB), empty content checks, malformed CSV detection, duplicate header de-duplication, and non-destructive string parsing to protect leading zeros.
  - Created Pydantic schemas in `backend/app/schemas/dataset.py` (`DatasetResponse`, `DatasetListResponse`, `DatasetVersionResponse`, `DatasetPreviewResponse`).
  - Implemented RESTful dataset endpoints in `backend/app/api/routes/datasets.py` (`POST /api/v1/datasets`, `GET /api/v1/datasets`, `GET /api/v1/datasets/{id}`, `GET /api/v1/datasets/{id}/preview`, `GET /api/v1/datasets/{id}/versions`, `DELETE /api/v1/datasets/{id}`).
  - Wired datasets router into `backend/app/api/api_v1.py`.
  - Built frontend UI:
    - `frontend/src/components/UploadSection.jsx`: Drag-and-drop file upload with validation feedback.
    - `frontend/src/components/DatasetTable.jsx`: Dataset inventory table with empty, loading, preview, and delete states.
    - `frontend/src/components/PreviewModal.jsx`: Interactive tabular preview with row-limit controls (10/20/50 rows) and null badges.
    - Updated `frontend/src/api/client.js` with upload, list, preview, and delete client functions.
    - Integrated components into `frontend/src/App.jsx`.
  - Wrote 10 comprehensive integration tests in `backend/tests/test_upload_and_preview.py`.
- **Files created/modified/deleted:**
  - Created: `backend/app/services/csv_validator.py`
  - Created: `backend/app/schemas/dataset.py`
  - Created: `backend/app/api/routes/datasets.py`
  - Created: `backend/tests/test_upload_and_preview.py`
  - Created: `frontend/src/components/UploadSection.jsx`
  - Created: `frontend/src/components/DatasetTable.jsx`
  - Created: `frontend/src/components/PreviewModal.jsx`
  - Modified: `backend/app/services/storage.py`
  - Modified: `backend/app/services/__init__.py`
  - Modified: `backend/app/schemas/__init__.py`
  - Modified: `backend/app/api/api_v1.py`
  - Modified: `backend/app/core/errors.py`
  - Modified: `frontend/src/api/client.js`
  - Modified: `frontend/src/App.jsx`
  - Updated: `PROJECT_STATE.md`
- **Commands run:**
  - `.venv/bin/pytest -v`
  - `cd frontend && npm run build`
- **Tests and actual results:**
  - `pytest`: 21 passed in 1.14s (`test_health.py` 3 tests, `test_persistence.py` 8 tests, `test_upload_and_preview.py` 10 tests).
  - `npm run build`: Production bundle built in 1.38s (0 errors).
- **Build result:** Success for both frontend and backend.
- **Commit(s):** Pending Phase 4 commit.
- **Known limitations:** Statistical profiling algorithms not yet implemented (Phase 5).

## 6. Known Bugs, Risks, and Blockers

1. **Risk — Arch Linux Python Environment:**
   - *Status:* Mitigated. Virtual environment `.venv` fully functional with installed packages.
2. **Risk — In-Memory File Size vs. Processing Time:**
   - *Status:* Mitigated. Server-side upload size limit enforced at 10 MB (`FileSizeLimitError`), preview endpoint enforces strict `limit <= 100`.
3. **Risk — Preview NaN Serialization:**
   - *Status:* Mitigated. `preview_dataset` cleanly normalizes `NaN`, `inf`, and empty values to JSON `null`.

## 7. Next Actions (Ordered)

1. **Next exact action:** Phase 5 — Dataset Profiling Engine:
   - Implement `backend/app/audit/profiling.py` computing:
     - Dataset-level statistics: row count, column count, missing cell count and percentage, duplicate row count, inferred column type counts.
     - Numeric column profile: min, max, mean, median, std, quartiles (Q1, Q3), missing count, distinct count.
     - Categorical column profile: distinct count, top-N frequent values with frequencies, missing count, unique-value ratio.
     - Date-like column profile: min/max dates, invalid parse count where applicable.
     - Guard against all-null, infinite, single-value, and mixed-type columns.
   - Implement profiling schema in `backend/app/schemas/profile.py`.
   - Implement `GET /api/v1/datasets/{dataset_id}/profile` in `backend/app/api/routes/datasets.py`.
   - Implement Profile view / component in frontend.
   - Write pytest unit tests with small fixtures with known statistics.
2. Phase 6: Deterministic audit engine with modular rules and structured findings.
3. Phase 7: Quality score calculation and audit results dashboard.
4. Phase 8: Cleaning operations, non-mutating previews, and versioned transformations.
5. Phase 9: Multi-version re-audit, lineage tracking, and before/after comparisons.
6. Phase 10: CSV version export and audit report generator (HTML/JSON).
7. Phase 11: Dataset deletion, edge cases, and reliability pass.
8. Phase 12: End-to-end testing, reproducible demo dataset, and final documentation polish.

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
5. Continue from the first incomplete, unblocked action above (Phase 5).
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
