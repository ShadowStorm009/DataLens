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

- **Last updated:** 2026-10-26 22:33 IST
- **Branch:** `main`
- **HEAD commit:** `058879b` (Phase 2 commit pending)
- **Git status:** Clean staging in progress for Phase 2 foundation files.
- **Frontend entry point:** `frontend/src/main.jsx` (Vite + React, production build verified)
- **Backend entry point:** `backend/app/main.py` (FastAPI app with `/health` and CORS verified)
- **Database configuration:** SQLite connection URL configured via `DATABASE_URL` (default: `sqlite:///./storage/datalens.db`)
- **Upload/storage directory:** `./storage` (git-ignored, versioned dataset storage, auto-created)
- **Frontend run command:** `cd frontend && npm run dev`
- **Backend run command:** `.venv/bin/uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload`
- **Test commands:** `.venv/bin/pytest -v`
- **Environment variable names:** `DATALENS_ENV`, `DATALENS_HOST`, `DATALENS_PORT`, `DATABASE_URL`, `STORAGE_DIR`, `MAX_UPLOAD_SIZE_BYTES`, `CORS_ORIGINS`, `VITE_API_BASE_URL`
- **Deployment URL/status:** Unverified / Local foundation verified.
- **Important architecture notes:** Arch Linux host requires Python installations in `.venv/`. Core audit logic remains deterministic without external LLM dependencies.

## 3. Feature Status Matrix

Use only these statuses: `VERIFIED`, `IMPLEMENTED_UNVERIFIED`, `PARTIAL`, `NOT_STARTED`, `BLOCKED`.

| Feature | Status | Files/modules | What works | What remains | Test evidence |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Repository foundation & health check** | VERIFIED | `backend/app/main.py`, `backend/app/api/routes/health.py`, `frontend/src/App.jsx`, `frontend/vite.config.js` | FastAPI app starts, `/health` and `/api/v1/health` respond with 200 OK, CORS enabled for frontend, custom error handling registered, Vite builds cleanly | Full dashboard features in subsequent phases | `pytest` 3 passed in 0.08s; `npm run build` passed in 1.46s; `curl` verified 200 OK & CORS preflight |
| **SQLite persistence & models** | NOT_STARTED | `backend/app/db/`, `backend/app/models/` | DB schema designed in PRD | SQLAlchemy models for Dataset, DatasetVersion, AuditRun, Finding, Transformation | None yet |
| **CSV upload & validation** | NOT_STARTED | `backend/app/services/storage.py`, `backend/app/api/routes/datasets.py` | None | Upload handler, size limit, MIME/content validation, safe filenames | None yet |
| **Dataset preview & profile** | NOT_STARTED | `backend/app/audit/profiling.py`, `frontend/src/pages/ProfilePage.jsx` | None | Profiling statistics (numeric, categorical, nulls, types), limited-row preview | None yet |
| **Audit rules & findings** | NOT_STARTED | `backend/app/audit/` | None | Deterministic rules: missing values, duplicates, constant cols, IQR outliers, type mismatch, class imbalance | None yet |
| **Quality score & dashboard** | NOT_STARTED | `backend/app/audit/quality_score.py`, `frontend/src/pages/Dashboard.jsx` | None | Weighted penalty score calculation (0–100), severity breakdown UI | None yet |
| **Cleaning preview** | NOT_STARTED | `backend/app/services/cleaner.py` | None | Non-mutating preview API & UI for median/mode imputation, duplicate drop, col drop | None yet |
| **Apply transformations & create versions** | NOT_STARTED | `backend/app/services/cleaner.py` | None | Version creation, parent lineage tracking, storage of transformed CSV | None yet |
| **Re-audit & comparison** | NOT_STARTED | `backend/app/services/comparison.py`, `frontend/src/pages/ComparePage.jsx` | None | Multi-version audit re-run, side-by-side metric comparison | None yet |
| **CSV and report export** | NOT_STARTED | `backend/app/services/export.py` | None | CSV version download, HTML/JSON audit report generator | None yet |
| **Dataset deletion & reliability** | NOT_STARTED | `backend/app/api/routes/datasets.py` | None | Cascade deletion of records and physical storage files with confirmation | None yet |
| **Automated tests** | PARTIAL | `backend/tests/test_health.py`, `pytest.ini` | TestClient harness, root & v1 health check tests, 404 test | Persistence, profiling, audit rules, and transformation tests | `pytest` 3 passed in 0.08s |
| **README & deployment** | PARTIAL | `README.md`, `docs/DECISIONS.md`, `.env.example` | Setup instructions, architecture, invariants documented | Verified production deployment | Docs and setup verified locally |
| **Demo and final submission checklist** | NOT_STARTED | `docs/` | PRD criteria documented | Reproducible test CSV with known quality defects, demo verification | None yet |

## 4. Current Implementation Details

- **API endpoints implemented:**
  - `GET /health`: System health status and configuration info.
  - `GET /api/v1/health`: API v1 health endpoint.
- **Backend Error Handling:** `DataLensError`, `ResourceNotFoundError` (404), `FileValidationError` (422), `FileSizeLimitError` (413), `TransformationError` (400) registered via `register_error_handlers`.
- **Database tables/models:** Planned in Phase 3 (`datasets`, `dataset_versions`, `audit_runs`, `findings`, `transformations`).
- **Audit algorithms and thresholds:** Documented and planned for Phase 6.
- **Quality score formula and version:** Documented and planned for Phase 7.
- **Cleaning operations supported:** Documented and planned for Phase 8.
- **Versioning behavior:** Immutable raw upload (v1), version lineage on transformation.
- **UI routes/components:** `frontend/src/App.jsx` establishes layout, branding, and interactive health verification; `frontend/src/api/client.js` provides centralized fetch wrapper with error decoding.
- **External services/integrations:** None (strictly local, offline-capable).
- **Important decisions and reasons:** Recorded in `docs/DECISIONS.md` (ADR-001 through ADR-004).

## 5. Work Completed in Most Recent Session

- **Goal:** Phase 2: Establish or Repair the Application Foundation.
- **Changes made:**
  - Created `backend/requirements.txt` with required dependencies.
  - Installed packages inside isolated `.venv` (`fastapi`, `uvicorn`, `pydantic`, `sqlalchemy`, `pandas`, `numpy`, `python-multipart`, `pytest`, `httpx`).
  - Created backend core configuration `backend/app/core/config.py` with environment variable loading.
  - Created structured error handlers in `backend/app/core/errors.py`.
  - Created Pydantic response schemas in `backend/app/schemas/common.py`.
  - Created `backend/app/api/routes/health.py` and API v1 router aggregator.
  - Created FastAPI app in `backend/app/main.py` with CORS middleware.
  - Created package `__init__.py` files across all backend architectural layers.
  - Scaffolded React/Vite frontend (`frontend/package.json`, `frontend/vite.config.js`, `frontend/index.html`, `frontend/src/main.jsx`, `frontend/src/App.jsx`, `frontend/src/index.css`, `frontend/src/api/client.js`).
  - Installed npm packages and verified esbuild.
  - Verified frontend production build with `npm run build`.
  - Created `pytest.ini` with `pythonpath = .` and wrote `backend/tests/test_health.py`.
  - Verified live backend with uvicorn daemon and curl.
- **Files created/modified/deleted:**
  - Created: `backend/requirements.txt`
  - Created: `backend/app/core/config.py`
  - Created: `backend/app/core/errors.py`
  - Created: `backend/app/schemas/common.py`
  - Created: `backend/app/api/routes/health.py`
  - Created: `backend/app/api/api_v1.py`
  - Created: `backend/app/main.py`
  - Created: `backend/tests/conftest.py`
  - Created: `backend/tests/test_health.py`
  - Created: `pytest.ini`
  - Created: `frontend/package.json`
  - Created: `frontend/vite.config.js`
  - Created: `frontend/index.html`
  - Created: `frontend/src/main.jsx`
  - Created: `frontend/src/App.jsx`
  - Created: `frontend/src/index.css`
  - Created: `frontend/src/api/client.js`
  - Updated: `PROJECT_STATE.md`
- **Commands run:**
  - `.venv/bin/pip install -r backend/requirements.txt`
  - `cd frontend && npm install && node node_modules/esbuild/install.js`
  - `cd frontend && npm run build`
  - `.venv/bin/pytest -v`
  - `curl -i http://127.0.0.1:8000/health`
  - `curl -i -H "Origin: http://localhost:5173" -H "Access-Control-Request-Method: GET" -X OPTIONS http://127.0.0.1:8000/health`
- **Tests and actual results:**
  - `pytest`: 3 passed in 0.08s (`test_root_health_check`, `test_api_v1_health_check`, `test_nonexistent_endpoint_returns_404`).
  - `npm run build`: Vite v5.4.21 built production bundle in 1.46s (0 errors).
  - Backend curl: HTTP 200 OK, `{"status":"ok","app_name":"DataLens API",...}`.
  - CORS preflight: HTTP 200 OK, `access-control-allow-origin: http://localhost:5173`.
- **Build result:** Success for both frontend and backend.
- **Commit(s):** Pending Phase 2 commit.
- **Known limitations:** Persistence layer and upload routes not yet wired (scheduled for Phase 3 & 4).

## 6. Known Bugs, Risks, and Blockers

1. **Risk — Arch Linux Python Environment:**
   - *Status:* Mitigated. Virtual environment `.venv` fully functional with installed packages.
2. **Risk — In-Memory File Size vs. Processing Time:**
   - *Status:* Configured `MAX_UPLOAD_SIZE_BYTES` (10MB) in `config.py`.
3. **Risk — Transformation Discrepancy:**
   - *Status:* Architectural decision ADR-003 adopted.

## 7. Next Actions (Ordered)

1. **Next exact action:** Phase 3 — Database, Dataset Metadata, and File Storage:
   - Create SQLAlchemy engine and session factory in `backend/app/db/session.py` and `backend/app/db/base.py`.
   - Create models for `Dataset`, `DatasetVersion`, `AuditRun`, `Finding`, and `Transformation` in `backend/app/models/`.
   - Create storage service helper in `backend/app/services/storage.py` managing unique internal files in `storage/`.
   - Add CRUD service functions for dataset lookup, version creation, audit persistence, and cascading deletion.
   - Write pytest tests covering SQLite persistence and cascade deletion behavior.
2. Phase 4: CSV upload, validation, safe file handling, and dataset preview.
3. Phase 5: Dataset profiling engine and profile view.
4. Phase 6: Deterministic audit engine with modular rules and structured findings.
5. Phase 7: Quality score calculation and audit results dashboard.
6. Phase 8: Cleaning operations, non-mutating previews, and versioned transformations.
7. Phase 9: Multi-version re-audit, lineage tracking, and before/after comparisons.
8. Phase 10: CSV version export and audit report generator (HTML/JSON).
9. Phase 11: Dataset deletion, edge cases, and reliability pass.
10. Phase 12: End-to-end testing, reproducible demo dataset, and final documentation polish.

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
5. Continue from the first incomplete, unblocked action above (Phase 3).
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
