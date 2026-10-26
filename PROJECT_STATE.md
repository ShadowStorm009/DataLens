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

- **Last updated:** 2026-10-26 22:18 IST
- **Branch:** `main`
- **HEAD commit:** None (initial commit pending reconnaissance approval)
- **Git status:** Clean initial staging in progress (`.gitignore`, `.env.example`, `README.md`, `docs/DECISIONS.md`, `PROJECT_STATE.md`).
- **Frontend entry point:** `frontend/src/main.jsx` (to be established in Phase 2)
- **Backend entry point:** `backend/app/main.py` (to be established in Phase 2)
- **Database configuration:** SQLite connection URL configured via `DATABASE_URL` (default: `sqlite:///./storage/datalens.db`)
- **Upload/storage directory:** `./storage` (git-ignored, versioned dataset storage)
- **Frontend run command:** `cd frontend && npm run dev`
- **Backend run command:** `.venv/bin/uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload`
- **Test commands:** `.venv/bin/pytest backend/tests -v`
- **Environment variable names:** `DATALENS_ENV`, `DATALENS_HOST`, `DATALENS_PORT`, `DATABASE_URL`, `STORAGE_DIR`, `MAX_UPLOAD_SIZE_BYTES`, `CORS_ORIGINS`, `VITE_API_BASE_URL`
- **Deployment URL/status:** Unverified / Not deployed yet.
- **Important architecture notes:** Arch Linux host requires Python installations in a virtual environment (`.venv/`). Core audit logic must remain deterministic without external LLM dependencies.

## 3. Feature Status Matrix

Use only these statuses: `VERIFIED`, `IMPLEMENTED_UNVERIFIED`, `PARTIAL`, `NOT_STARTED`, `BLOCKED`.

| Feature | Status | Files/modules | What works | What remains | Test evidence |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Repository foundation & health check** | NOT_STARTED | `backend/app/main.py`, `frontend/` | Git initialized, `.venv` created, `.gitignore` & docs prepared | FastAPI app, `/health` endpoint, Vite frontend scaffold | None yet |
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
| **Automated tests** | NOT_STARTED | `backend/tests/` | None | Pytest suite covering persistence, profiling, audit rules, transformations | None yet |
| **README & deployment** | PARTIAL | `README.md`, `docs/DECISIONS.md`, `.env.example` | Setup instructions, architecture, invariants documented | Verified local setup, production deployment instructions | Docs verified on disk |
| **Demo and final submission checklist** | NOT_STARTED | `docs/` | PRD criteria documented | Reproducible test CSV with known quality defects, demo verification | None yet |

## 4. Current Implementation Details

- **API endpoints implemented:** None yet.
- **Database tables/models:** Planned: `datasets`, `dataset_versions`, `audit_runs`, `findings`, `transformations`.
- **Audit algorithms and thresholds:** Planned:
  - Missing values: count, ratio, affected columns.
  - Duplicates: exact row matching across all columns.
  - Constant columns: columns with 1 unique non-null value.
  - IQR outliers: Q1, Q3, IQR = Q3 - Q1, bounds [Q1 - 1.5*IQR, Q3 + 1.5*IQR].
  - Type inconsistencies: columns with mixed numeric/string or unparseable values.
  - Class imbalance: minority class proportion below threshold (e.g., < 10%).
- **Quality score formula and version:** Planned formula: $Score = \max(0, 100 - \sum Penalties)$ (Version 1.0).
- **Cleaning operations supported:** Planned:
  - Median imputation (numerical columns)
  - Mode imputation (categorical columns)
  - Duplicate row removal
  - Constant column drop
- **Versioning behavior:** Version 1 is original upload (read-only). Every applied transformation produces a child version incrementing version number, retaining parent reference.
- **UI routes/components:** Planned: Dashboard (`/`), Upload (`/upload`), Dataset Details & Profile (`/datasets/:id`), Audit Findings (`/datasets/:id/audit`), Cleaning Workspace (`/datasets/:id/clean`), Version Comparison (`/datasets/:id/compare`).
- **External services/integrations:** None (strictly local, offline-capable).
- **Important decisions and reasons:** Recorded in `docs/DECISIONS.md` (ADR-001 through ADR-004).

## 5. Work Completed in Most Recent Session

- **Goal:** Phase 1: Repository Reconnaissance, Environment Isolation, and Implementation Planning.
- **Changes made:**
  - Inspected repository and PRD document (`DataLens_PRD.docx`).
  - Read AI Agent Prompt Pack specifications (`DataLens_AI_Agent_Prompt_Pack.md`).
  - Initialized Git repository and set default branch to `main`.
  - Configured Python virtual environment `.venv` using Python 3.14 on Arch Linux.
  - Created `.gitignore` protecting `.venv`, build artifacts, `node_modules`, and storage.
  - Created `.env.example` defining runtime configurations.
  - Created `docs/DECISIONS.md` establishing foundational architectural choices.
  - Created user-facing `README.md` with system overview, architecture, and instructions.
- **Files created/modified/deleted:**
  - Created: `.gitignore`
  - Created: `.env.example`
  - Created: `docs/DECISIONS.md`
  - Created: `README.md`
  - Created: `PROJECT_STATE.md`
- **Commands run:**
  - `git init`
  - `git branch -m main`
  - `python3 -m venv .venv`
  - `.venv/bin/python --version && .venv/bin/pip --version`
- **Tests and actual results:**
  - Environment verification: Python 3.14.8 and pip 26.2.1 verified inside `.venv`.
  - Git repository initialized and clean.
- **Build result:** N/A (scaffolding phase).
- **Commit(s):** Initial commit pending review.
- **Known limitations:** Application code (backend/frontend) not yet scaffolded.

## 6. Known Bugs, Risks, and Blockers

1. **Risk — Arch Linux Python Environment:**
   - *Detail:* Host system uses rolling Arch Linux with Python 3.14. Global pip installations are blocked by PEP 668.
   - *Mitigation:* Explicitly use `.venv/bin/pip` and `.venv/bin/python` for all package management and backend execution.
2. **Risk — In-Memory File Size vs. Processing Time:**
   - *Detail:* Large CSVs can exhaust memory during IQR or duplicate calculations.
   - *Mitigation:* Enforce strict server-side upload limit (`MAX_UPLOAD_SIZE_BYTES`, default 10MB) and paginate or bound preview rows.
3. **Risk — Transformation Discrepancy:**
   - *Detail:* Preview showing one result while Apply produces another.
   - *Mitigation:* Preview and Apply must invoke the exact same pure transformation function in `cleaner.py`.

## 7. Next Actions (Ordered)

1. **Next exact action:** Phase 2 — Establish Application Foundation:
   - Create `backend/requirements.txt` with FastAPI, Uvicorn, Pydantic, SQLAlchemy, Pandas, NumPy, pytest, httpx.
   - Install dependencies in `.venv`.
   - Scaffold `backend/app/main.py` with `GET /health` and CORS configuration.
   - Scaffold `frontend/` using Vite React template with normal CSS and API client.
   - Verify health check via automated test and verify frontend builds cleanly.
2. Phase 3: SQLite persistence, SQLAlchemy models (`Dataset`, `DatasetVersion`, `AuditRun`, `Finding`, `Transformation`), and storage service.
3. Phase 4: CSV upload endpoint, validation, safe file handling, and dataset preview.
4. Phase 5: Dataset profiling engine and profile view.
5. Phase 6: Deterministic audit engine with modular rules and structured findings.
6. Phase 7: Quality score calculation and audit results dashboard.
7. Phase 8: Cleaning operations, non-mutating previews, and versioned transformations.
8. Phase 9: Multi-version re-audit, lineage tracking, and before/after comparisons.
9. Phase 10: CSV version export and audit report generator (HTML/JSON).
10. Phase 11: Dataset deletion, edge cases, and reliability pass.
11. Phase 12: End-to-end testing, reproducible demo dataset, and final documentation polish.

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
5. Continue from the first incomplete, unblocked action above (Phase 2).
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
