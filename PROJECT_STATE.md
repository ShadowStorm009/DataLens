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

- **Last updated:** 2026-10-26 23:38 IST
- **Branch:** `main`
- **HEAD commit:** `3cdd643`
- **Git status:** Clean on `main`.
- **Frontend entry point:** `frontend/src/main.jsx` (Vite + React, production build verified)
- **Backend entry point:** `backend/app/main.py` (FastAPI app with `/health`, CORS, and automatic DB initialization via lifespan)
- **Database configuration:** SQLite connection URL configured via `DATABASE_URL` (default: `sqlite:///./storage/datalens.db`) with `PRAGMA foreign_keys = ON` enforced.
- **Upload/storage directory:** `./storage` (git-ignored, versioned dataset storage, managed via `StorageService`)
- **Frontend run command:** `cd frontend && npm run dev`
- **Backend run command:** `.venv/bin/uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload`
- **Test commands:** `.venv/bin/pytest -v`
- **Environment variable names:** `DATALENS_ENV`, `DATALENS_HOST`, `DATALENS_PORT`, `DATABASE_URL`, `STORAGE_DIR`, `MAX_UPLOAD_SIZE_BYTES`, `CORS_ORIGINS`, `VITE_API_BASE_URL`
- **Deployment URL/status:** Unverified / Local persistence and foundation verified.
- **Important architecture notes:** Arch Linux host requires Python installations in `.venv/`. Core audit logic remains deterministic without external LLM dependencies.

## 3. Feature Status Matrix

Use only these statuses: `VERIFIED`, `IMPLEMENTED_UNVERIFIED`, `PARTIAL`, `NOT_STARTED`, `BLOCKED`.

| Feature | Status | Files/modules | What works | What remains | Test evidence |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Repository foundation & health check** | VERIFIED | `backend/app/main.py`, `backend/app/api/routes/health.py`, `frontend/src/App.jsx`, `frontend/vite.config.js` | FastAPI app starts, `/health` and `/api/v1/health` respond with 200 OK, CORS enabled for frontend, custom error handling registered, Vite builds cleanly | Full dashboard features in subsequent phases | `pytest` 3 passed in 0.08s; `npm run build` passed in 1.46s; `curl` verified 200 OK & CORS preflight |
| **SQLite persistence & models** | VERIFIED | `backend/app/db/`, `backend/app/models/`, `backend/app/services/` | SQLite engine with foreign key enforcement; ORM models (`Dataset`, `DatasetVersion`, `AuditRun`, `Finding`, `Transformation`); `StorageService` with SHA256 & path safety; `DatasetService` with CRUD, lineage, and cascade deletion | HTTP route handlers for uploads and transforms (Phases 4-10) | `backend/tests/test_persistence.py` 8 passed (creation, lineage, audit link, transformations, 404s, cascade delete, foreign keys, process restart survival) |
| **CSV upload & validation** | NOT_STARTED | `backend/app/services/storage.py`, `backend/app/api/routes/datasets.py` | Storage service ready for byte & dataframe persistence | Upload HTTP route, size limit middleware, MIME/header validation | None yet |
| **Dataset preview & profile** | NOT_STARTED | `backend/app/audit/profiling.py`, `frontend/src/pages/ProfilePage.jsx` | None | Profiling statistics (numeric, categorical, nulls, types), limited-row preview | None yet |
| **Audit rules & findings** | NOT_STARTED | `backend/app/audit/` | Finding ORM model ready | Deterministic rules: missing values, duplicates, constant cols, IQR outliers, type mismatch, class imbalance | None yet |
| **Quality score & dashboard** | NOT_STARTED | `backend/app/audit/quality_score.py`, `frontend/src/pages/Dashboard.jsx` | Score and method version stored in `AuditRun` model | Weighted penalty score calculation (0–100), severity breakdown UI | None yet |
| **Cleaning preview** | NOT_STARTED | `backend/app/services/cleaner.py` | None | Non-mutating preview API & UI for median/mode imputation, duplicate drop, col drop | None yet |
| **Apply transformations & create versions** | NOT_STARTED | `backend/app/services/cleaner.py` | `create_version` and `record_transformation` in `DatasetService` | Transformation engine calling preview/apply functions | Covered in persistence tests |
| **Re-audit & comparison** | NOT_STARTED | `backend/app/services/comparison.py`, `frontend/src/pages/ComparePage.jsx` | Multi-version audit linkage modeled in `AuditRun` | Multi-version audit re-run, side-by-side metric comparison | None yet |
| **CSV and report export** | NOT_STARTED | `backend/app/services/export.py` | CSV storage retrieval ready | CSV version download endpoint, HTML/JSON audit report generator | None yet |
| **Dataset deletion & reliability** | PARTIAL | `backend/app/services/dataset_service.py` | `delete_dataset` cascades in SQLite and purges physical files | DELETE endpoint and frontend confirmation dialog | `test_cascade_delete_dataset_and_files` PASSED |
| **Automated tests** | PARTIAL | `backend/tests/` | 11 automated unit and persistence tests passing | Profiling, audit rules, and transformation tests | 11 passed in 0.64s |
| **README & deployment** | PARTIAL | `README.md`, `docs/DECISIONS.md`, `.env.example` | Setup instructions, architecture, invariants documented | Verified production deployment | Docs and setup verified locally |
| **Demo and final submission checklist** | NOT_STARTED | `docs/` | PRD criteria documented | Reproducible test CSV with known quality defects, demo verification | None yet |

## 4. Current Implementation Details

- **API endpoints implemented:**
  - `GET /health`: System health status and configuration info.
  - `GET /api/v1/health`: API v1 health endpoint.
- **Database Architecture & ORM Models:**
  - `Dataset`: `id` (UUID), `name`, `original_filename`, `created_at`, `current_version_id`, `row_count`, `column_count`, `status`, `storage_reference`.
  - `DatasetVersion`: `id` (UUID), `dataset_id` (FK datasets.id cascade), `parent_version_id` (FK dataset_versions.id set null), `version_number` (int, 1-indexed), `row_count`, `column_count`, `storage_reference`, `content_hash` (SHA256).
  - `AuditRun`: `id` (UUID), `dataset_id` (FK datasets.id cascade), `version_id` (FK dataset_versions.id cascade), `created_at`, `status`, `score` (Float), `score_method_version`, `serialized_summary`.
  - `Finding`: `id` (UUID), `audit_id` (FK audit_runs.id cascade), `rule_id`, `column_name`, `severity` (high/medium/low), `title`, `description`, `structured_evidence` (JSON text), `recommendation`, `finding_type`.
  - `Transformation`: `id` (UUID), `dataset_id` (FK datasets.id cascade), `source_version_id` (FK dataset_versions.id cascade), `result_version_id` (FK dataset_versions.id cascade), `operation_type`, `column_name`, `parameters` (JSON text), `rows_affected`, `cells_affected`, `created_at`.
- **Foreign Key Enforcement:** SQLite `PRAGMA foreign_keys=ON;` hooked via SQLAlchemy `connect` listener.
- **Storage Management:** `StorageService` manages internal files in `./storage/`, prevents directory traversal, calculates SHA-256 checksums, and manages CSV file persistence.
- **Backend Error Handling:** `DataLensError`, `ResourceNotFoundError` (404), `FileValidationError` (422), `FileSizeLimitError` (413), `TransformationError` (400), `StorageError` (500).
- **UI routes/components:** `frontend/src/App.jsx` establishes layout, branding, and interactive health verification; `frontend/src/api/client.js` provides centralized fetch wrapper with error decoding.
- **External services/integrations:** None (strictly local, offline-capable).

## 5. Work Completed in Most Recent Session

- **Goal:** Phase 3: Database, Dataset Metadata, and File Storage.
- **Changes made:**
  - Built SQLite session and engine configuration in `backend/app/db/session.py` with foreign key enforcement.
  - Implemented declarative ORM models in `backend/app/models/` (`Dataset`, `DatasetVersion`, `AuditRun`, `Finding`, `Transformation`).
  - Implemented `backend/app/services/storage.py` handling file persistence, SHA-256 hashing, directory traversal prevention, and physical file deletion.
  - Implemented `backend/app/services/dataset_service.py` with CRUD functions, parent-child version lineage, audit linkage, transformation logs, and cascade cleanup.
  - Registered `init_db()` into FastAPI lifespan context manager in `backend/app/main.py`.
  - Enhanced `backend/tests/conftest.py` with isolated database and storage fixtures.
  - Implemented comprehensive persistence test suite in `backend/tests/test_persistence.py` covering creation, version lineage, audit associations, transformation tracking, 404 error handling, cascade deletion, foreign key enforcement, and process restart survival.
- **Files created/modified/deleted:**
  - Created: `backend/app/db/base.py`
  - Created: `backend/app/db/session.py`
  - Created: `backend/app/models/dataset.py`
  - Created: `backend/app/models/version.py`
  - Created: `backend/app/models/audit.py`
  - Created: `backend/app/models/transformation.py`
  - Created: `backend/app/models/__init__.py`
  - Created: `backend/app/services/storage.py`
  - Created: `backend/app/services/dataset_service.py`
  - Created: `backend/tests/test_persistence.py`
  - Modified: `backend/app/core/errors.py` (added `StorageError`)
  - Modified: `backend/app/main.py` (added database init lifespan)
  - Modified: `backend/app/db/__init__.py`
  - Modified: `backend/app/services/__init__.py`
  - Modified: `backend/tests/conftest.py`
  - Updated: `PROJECT_STATE.md`
- **Commands run:**
  - `.venv/bin/pytest -v`
  - `cd frontend && npm run build`
- **Tests and actual results:**
  - `pytest`: 11 passed in 0.64s (`test_health.py` 3 tests, `test_persistence.py` 8 tests).
  - `npm run build`: Production bundle built in 1.43s (0 errors).
- **Build result:** Success for both frontend and backend.
- **Commit(s):** Pending Phase 3 commit.
- **Known limitations:** HTTP upload and preview endpoints not yet connected (Phase 4).

## 6. Known Bugs, Risks, and Blockers

1. **Risk — Arch Linux Python Environment:**
   - *Status:* Mitigated. Virtual environment `.venv` fully functional with installed packages.
2. **Risk — In-Memory File Size vs. Processing Time:**
   - *Status:* Configured `MAX_UPLOAD_SIZE_BYTES` (10MB) in `config.py` and validated on file read.
3. **Risk — Transformation Discrepancy:**
   - *Status:* Architectural decision ADR-003 adopted.

## 7. Next Actions (Ordered)

1. **Next exact action:** Phase 4 — CSV Upload, Validation, and Dataset Preview:
   - Implement upload schemas in `backend/app/schemas/dataset.py` (`DatasetCreateResponse`, `DatasetSummaryResponse`, `DatasetPreviewResponse`).
   - Implement upload endpoint `POST /api/v1/datasets` with size limit checking, MIME/content validation, and safe pandas parsing.
   - Implement `GET /api/v1/datasets` (list datasets) and `GET /api/v1/datasets/{id}` (retrieve metadata).
   - Implement `GET /api/v1/datasets/{id}/preview` (bounded row preview, default 20 rows).
   - Implement Upload UI component and dataset list/preview view in `frontend/`.
   - Write pytest integration tests for upload (valid CSV, empty CSV, malformed CSV, oversized CSV) and preview.
2. Phase 5: Dataset profiling engine and profile view.
3. Phase 6: Deterministic audit engine with modular rules and structured findings.
4. Phase 7: Quality score calculation and audit results dashboard.
5. Phase 8: Cleaning operations, non-mutating previews, and versioned transformations.
6. Phase 9: Multi-version re-audit, lineage tracking, and before/after comparisons.
7. Phase 10: CSV version export and audit report generator (HTML/JSON).
8. Phase 11: Dataset deletion, edge cases, and reliability pass.
9. Phase 12: End-to-end testing, reproducible demo dataset, and final documentation polish.

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
5. Continue from the first incomplete, unblocked action above (Phase 4).
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
