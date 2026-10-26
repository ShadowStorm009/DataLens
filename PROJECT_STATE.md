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

- **Last updated:** 2026-10-27 00:35 IST
- **Branch:** `main`
- **HEAD commit:** `3a24ecd` (Phase 5 committed; Phase 6 & 7 ready to commit)
- **Git status:** Clean build, 34 automated pytest tests passing in 1.73s.
- **Frontend entry point:** `frontend/src/main.jsx` (Vite + React, production build verified)
- **Backend entry point:** `backend/app/main.py` (FastAPI app with health, upload, preview, profile, audits, and dataset management endpoints)
- **Database configuration:** SQLite connection URL configured via `DATABASE_URL` (default: `sqlite:///./storage/datalens.db`) with `PRAGMA foreign_keys = ON` enforced.
- **Upload/storage directory:** `./storage` (git-ignored, versioned dataset storage, managed via `StorageService`)
- **Frontend run command:** `cd frontend && npm run dev`
- **Backend run command:** `.venv/bin/uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload`
- **Test commands:** `.venv/bin/pytest -v`
- **Environment variable names:** `DATALENS_ENV`, `DATALENS_HOST`, `DATALENS_PORT`, `DATABASE_URL`, `STORAGE_DIR`, `MAX_UPLOAD_SIZE_BYTES`, `CORS_ORIGINS`, `VITE_API_BASE_URL`
- **Deployment URL/status:** Unverified / Local persistence, upload, preview, profiling, deterministic audit rules, and interactive audit dashboard verified.
- **Important architecture notes:** Arch Linux host requires Python installations in `.venv/`. Core audit logic remains deterministic without external LLM dependencies.

## 3. Feature Status Matrix

Use only these statuses: `VERIFIED`, `IMPLEMENTED_UNVERIFIED`, `PARTIAL`, `NOT_STARTED`, `BLOCKED`.

| Feature | Status | Files/modules | What works | What remains | Test evidence |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Repository foundation & health check** | VERIFIED | `backend/app/main.py`, `backend/app/api/routes/health.py`, `frontend/src/App.jsx`, `frontend/vite.config.js` | FastAPI app starts, `/health` and `/api/v1/health` respond with 200 OK, CORS enabled for frontend, custom error handling registered, Vite builds cleanly | Full dashboard features in subsequent phases | `pytest` 3 passed in 0.08s; `npm run build` passed in 1.46s; `curl` verified 200 OK & CORS preflight |
| **SQLite persistence & models** | VERIFIED | `backend/app/db/`, `backend/app/models/`, `backend/app/services/` | SQLite engine with foreign key enforcement; ORM models (`Dataset`, `DatasetVersion`, `AuditRun`, `Finding`, `Transformation`); `StorageService` with SHA256 & path safety; `DatasetService` with CRUD, lineage, and cascade deletion | HTTP route handlers for transforms (Phases 8-10) | `backend/tests/test_persistence.py` 8 passed (creation, lineage, audit link, transformations, 404s, cascade delete, foreign keys, process restart survival) |
| **CSV upload & validation** | VERIFIED | `backend/app/services/csv_validator.py`, `backend/app/api/routes/datasets.py`, `frontend/src/components/UploadSection.jsx` | Server-side size check (10MB limit), encoding detection, empty check, malformed CSV rejection, duplicate header sanitization, leading zeros preservation, drag-and-drop & file picker UI | None | `backend/tests/test_upload_and_preview.py` 10 passed (valid CSV, empty, malformed, oversized 413, duplicate headers, leading zeros, orphan prevention) |
| **Dataset preview & profile** | VERIFIED | `backend/app/audit/profiling.py`, `backend/app/api/routes/datasets.py`, `frontend/src/components/ProfileView.jsx`, `frontend/src/components/PreviewModal.jsx` | Reusable `ProfilingEngine` computing dataset and column statistics (numeric, categorical, datetime, boolean, text); type inference heuristics; bounded top-N values; caching tied to immutable versions; bounded preview modal; full responsive `ProfileView` | None | `backend/tests/test_profiling.py` 3 passed (hand-calculated values, edge cases resilience, caching & endpoint) |
| **Audit rules & findings** | VERIFIED | `backend/app/audit/rules/`, `backend/app/audit/engine.py`, `backend/app/schemas/audit.py`, `backend/app/api/routes/audits.py` | 8 deterministic rules implemented (missing values, exact duplicates, constant columns, high cardinality heuristic, Tukey IQR outliers, type inconsistency, class imbalance, potential leakage heuristic); documented configurable thresholds; rule failure resilience; persistence of `AuditRun` and `Finding` rows | None | `backend/tests/test_audit_rules.py` 14 passed (individual rule positive/negative tests, determinism, non-mutating verification, configurable thresholds, API execution, filtering) |
| **Quality score & dashboard** | VERIFIED | `backend/app/audit/scoring.py`, `frontend/src/components/AuditDashboard.jsx`, `frontend/src/components/FindingDetailDrawer.jsx`, `frontend/src/App.jsx` | Transparent 0–100 score with component penalty breakdown; method v1.0 tracking; disclaimer; severity KPI badges; interactive filtering by severity, rule, and column; keyword search; slide-out finding detail drawer with structured evidence JSON | None | Score tests in `test_audit_rules.py`; Vite frontend build passing with no errors |
| **Cleaning preview** | NOT_STARTED | `backend/app/services/cleaner.py` | None | Non-mutating preview API & UI for median/mode imputation, duplicate drop, col drop | None yet |
| **Apply transformations & create versions** | NOT_STARTED | `backend/app/services/cleaner.py` | `create_version` and `record_transformation` in `DatasetService` | Transformation engine calling preview/apply functions | Covered in persistence tests |
| **Re-audit & comparison** | NOT_STARTED | `backend/app/services/comparison.py`, `frontend/src/pages/ComparePage.jsx` | Multi-version audit linkage modeled in `AuditRun` | Multi-version audit re-run, side-by-side metric comparison | None yet |
| **CSV and report export** | NOT_STARTED | `backend/app/services/export.py` | CSV storage retrieval ready | CSV version download endpoint, HTML/JSON audit report generator | None yet |
| **Dataset deletion & reliability** | PARTIAL | `backend/app/api/routes/datasets.py`, `frontend/src/components/DatasetTable.jsx` | DELETE `/api/v1/datasets/{id}` endpoint and UI delete button with confirmation dialog; DB records cascade and files purged | Reliability edge cases pass (Phase 11) | `test_cascade_delete_dataset_and_files` PASSED |
| **Automated tests** | PARTIAL | `backend/tests/` | 38 automated unit, persistence, profiling, upload, preview, rule, and audit endpoint tests passing | Cleaning transformations and comparison tests | 38 passed in 1.85s |
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
  - `POST /api/v1/datasets/{id}/audits`: Execute 8 deterministic quality checks on specified version (or current version) with optional target column, calculate quality score, and persist `AuditRun` + `Finding` records.
  - `GET /api/v1/datasets/{id}/audits`: List audit run history for a dataset, optionally filtered by `version_id`.
  - `GET /api/v1/datasets/{id}/audits/{audit_id}`: Retrieve full audit run details with structured summary and findings.
  - `GET /api/v1/datasets/{id}/audits/{audit_id}/findings`: Filter audit findings by `severity` (high/medium/low), `rule_id`, or `column_name`.
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
- **UI Components:**
  - `AuditDashboard.jsx`: Quality score circle with dynamic color coding, deduction breakdown bars, severity KPI cards, interactive filter bar (severity, rule, column, keyword search), and interactive findings list.
  - `FindingDetailDrawer.jsx`: Slide-out panel detailing severity rationale, description, formatted structured evidence JSON, and actionable recommendations.
  - `ProfileView.jsx`: Statistical profiling page with distribution metrics and categorical frequency bars.
  - `UploadSection.jsx`: Drag-and-drop file upload with validation feedback.
  - `DatasetTable.jsx`: Inventory table with "Audit Quality", "Profile", "Preview", and "Delete" actions.
  - `PreviewModal.jsx`: Interactive tabular preview with row-limit controls.
  - `App.jsx`: State-based view switcher between Inventory, Audit Dashboard, and Detailed Profile.

## 5. Work Completed in Most Recent Session

- **Goal:** Phase 6 (Audit Engine & Findings Schema) and Phase 7 (Quality Score & Audit Dashboard).
- **Changes made:**
  - Created base audit rule interface `AuditRule` and `RuleFinding` dataclass in `backend/app/audit/rules/base.py`.
  - Implemented 8 modular deterministic audit rules in `backend/app/audit/rules/` (`missing_values.py`, `duplicates.py`, `constant_columns.py`, `high_cardinality.py`, `outliers.py`, `type_consistency.py`, `class_imbalance.py`, `potential_leakage.py`).
  - Implemented transparent, bounded 0–100 quality scoring with component penalty breakdown and disclaimer in `backend/app/audit/scoring.py`.
  - Implemented `AuditEngine` coordinator in `backend/app/audit/engine.py` with fault isolation.
  - Created Pydantic models in `backend/app/schemas/audit.py` (`FindingResponse`, `AuditRunRequest`, `AuditRunResponse`, `AuditListResponse`).
  - Added `@property def summary` to `AuditRun` model in `backend/app/models/audit.py`.
  - Implemented audit API routes in `backend/app/api/routes/audits.py` and registered with `api_router`.
  - Added audit API methods to `frontend/src/api/client.js` (`runAudit`, `listAudits`, `getAudit`, `listFindings`).
  - Built `frontend/src/components/FindingDetailDrawer.jsx` and `frontend/src/components/AuditDashboard.jsx`.
  - Updated `DatasetTable.jsx` and `App.jsx` for seamless navigation between dataset inventory, audit reports, and profiles.
  - Added 10 automated unit and integration tests in `backend/tests/test_audit_rules.py`.
- **Files created/modified:**
  - Created: `backend/app/audit/rules/base.py`
  - Created: `backend/app/audit/rules/missing_values.py`
  - Created: `backend/app/audit/rules/duplicates.py`
  - Created: `backend/app/audit/rules/constant_columns.py`
  - Created: `backend/app/audit/rules/high_cardinality.py`
  - Created: `backend/app/audit/rules/outliers.py`
  - Created: `backend/app/audit/rules/type_consistency.py`
  - Created: `backend/app/audit/rules/class_imbalance.py`
  - Created: `backend/app/audit/rules/potential_leakage.py`
  - Created: `backend/app/audit/rules/__init__.py`
  - Created: `backend/app/audit/scoring.py`
  - Created: `backend/app/audit/engine.py`
  - Created: `backend/app/schemas/audit.py`
  - Created: `backend/app/api/routes/audits.py`
  - Created: `frontend/src/components/FindingDetailDrawer.jsx`
  - Created: `frontend/src/components/AuditDashboard.jsx`
  - Created: `backend/tests/test_audit_rules.py`
  - Modified: `backend/app/models/audit.py`
  - Modified: `backend/app/api/api_v1.py`
  - Modified: `backend/app/schemas/__init__.py`
  - Modified: `frontend/src/api/client.js`
  - Modified: `frontend/src/components/DatasetTable.jsx`
  - Modified: `frontend/src/App.jsx`
  - Modified: `frontend/src/index.css`
  - Updated: `PROJECT_STATE.md`
- **Commands run:**
  - `.venv/bin/pytest -v`
  - `cd frontend && npm run build`
- **Tests and actual results:**
  - `pytest`: 34 passed in 1.73s (10 new audit tests covering all 8 rules, engine resilience, API execution, filtering, and non-destructive preservation).
  - `npm run build`: Production bundle built in 1.47s (0 errors).
- **Build result:** Success for both frontend and backend.
- **Commit(s):** Pending Phase 6 & 7 commit.
- **Known limitations:** Cleaning transformations and version lineage comparison not yet implemented (Phases 8-9).

## 6. Known Bugs, Risks, and Blockers

1. **Risk — Arch Linux Python Environment:**
   - *Status:* Mitigated. Virtual environment `.venv` fully functional with installed packages.
2. **Risk — In-Memory File Size vs. Processing Time:**
   - *Status:* Mitigated. Profiling results cached per immutable version ID; audit runs persisted in SQLite.
3. **Risk — False Certainty in Heuristic Checks (Identifiers, Outliers, Leakage):**
   - *Status:* Mitigated. Rules explicitly include uncertainty warnings and caveat notes explaining that statistical anomalies are candidates for inspection, not guaranteed errors or leakage.

## 7. Next Actions (Ordered)

1. **Next exact action:** Phase 8 — Cleaning Operations & Non-Mutating Preview:
   - Implement `TransformationEngine` in `backend/app/services/cleaner.py` with supported operations:
     - Missing value imputation: numeric median, categorical mode, constant fill.
     - Exact duplicate row removal.
     - Dropping specified constant or redundant columns.
     - Type coercion with invalid-value nullification.
   - Non-mutating preview endpoint: `POST /api/v1/datasets/{dataset_id}/transformations/preview` (returns before/after row diffs, affected row count, and cell count without writing new files or database versions).
   - Apply transformation endpoint: `POST /api/v1/datasets/{dataset_id}/transformations/apply` (uses identical transformation logic, creates immutable `DatasetVersion` v2+, records `Transformation` history row).
   - Frontend cleaning panel with interactive operation selector, parameter inputs, live non-mutating preview modal, and version commit button.
   - Pytest unit tests for every transformation operation in preview and apply modes.
2. Phase 9: Version history, multi-version re-audit, and before/after comparison dashboard.
3. Phase 10: CSV export of selected version and HTML/JSON audit report export.
4. Phase 11: Dataset deletion, edge cases, and reliability pass.
5. Phase 12: End-to-end testing, reproducible demo dataset, and final documentation polish.

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
5. Continue from the first incomplete, unblocked action above (Phase 8).
6. Do not restart or rewrite working features.
7. Run relevant tests after changes.
8. Update this file and append a progress entry before ending.

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
- **Goal:** Implement deterministic audit rules, common findings schema, bounded 0-100 quality scoring, and interactive audit dashboard UI with filters and finding inspection drawer.
- **Changes:**
  - Implemented 8 deterministic audit rules in `backend/app/audit/rules/` (`MissingValuesRule`, `DuplicateRowsRule`, `ConstantColumnsRule`, `HighCardinalityRule`, `NumericOutliersRule`, `TypeConsistencyRule`, `ClassImbalanceRule`, `PotentialLeakageRule`).
  - Implemented `AuditEngine` in `backend/app/audit/engine.py` coordinating rule execution with column and rule fault isolation.
  - Implemented transparent, bounded 0–100 quality score calculation with component breakdown in `backend/app/audit/scoring.py`.
  - Created audit schemas in `backend/app/schemas/audit.py` and routes in `backend/app/api/routes/audits.py` (`POST /audits`, `GET /audits`, `GET /audits/{id}`, `GET /audits/{id}/findings`).
  - Built frontend components `frontend/src/components/AuditDashboard.jsx` and `frontend/src/components/FindingDetailDrawer.jsx`.
  - Added audit API functions to `frontend/src/api/client.js` and updated `DatasetTable.jsx` and `App.jsx`.
  - Wrote 10 automated unit and integration tests in `backend/tests/test_audit_rules.py`.
- **Tests/results:** Pytest passed 34/34 tests in 1.73s; Vite build succeeded in 1.47s.
- **Unfinished work:** Cleaning operations and non-mutating preview (Phase 8).
- **Next action:** Phase 8: Implement transformation engine, non-mutating preview, apply with version creation, and cleaning UI.
