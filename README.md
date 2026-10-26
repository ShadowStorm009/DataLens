# DataLens — Dataset Quality Auditor

DataLens is a web application designed to help data analysts, students, researchers, and machine learning practitioners inspect, profile, audit, clean, and verify tabular datasets (CSV) through a transparent, reproducible workflow.

## Core Workflow

```
Upload CSV ──► Profile Dataset ──► Deterministic Quality Audit ──► Inspect Findings
                                                                          │
Export Cleaned CSV ◄── Compare Versions ◄── Re-audit ◄── Apply Transformation ◄── Preview Changes
& Audit Report
```

1. **Upload & Validate**: Upload tabular CSVs with file-size enforcement, encoding safeguards, and structure validation.
2. **Profile**: Compute descriptive summary statistics for numerical, categorical, and datetime columns.
3. **Audit**: Run deterministic quality checks (missing values, exact duplicates, constant columns, IQR outliers, type inconsistencies, target-class imbalance).
4. **Inspect Findings**: Review prioritized issues with concrete numerical evidence and action recommendations.
5. **Non-Mutating Preview**: Preview the exact impact of a cleaning operation before applying it.
6. **Versioned Transformation**: Apply cleaning operations (median imputation, mode imputation, duplicate removal, column dropping) to create new dataset versions while keeping original data immutable.
7. **Re-Audit & Compare**: Re-evaluate quality scores and statistics across versions to confirm data improvements.
8. **Export**: Download the cleaned CSV version and comprehensive audit reports (HTML/JSON).

---

## Technology Stack

- **Frontend**: React 18, Vite, JavaScript, vanilla CSS (clean responsive design, no Tailwind per PRD specifications).
- **Backend**: Python 3.14, FastAPI, Uvicorn, Pydantic v2.
- **Data Engine**: Pandas and NumPy.
- **Persistence**: SQLite with SQLAlchemy ORM for metadata, version tracking, audit records, and transformation logs.
- **Testing**: pytest and FastAPI TestClient.

---

## Local Development Setup

### Prerequisites
- Python 3.10+ (tested on Python 3.14 / Arch Linux)
- Node.js 18+ and npm
- Git

### 1. Backend Setup

```bash
# From repository root:
# 1. Activate or create virtual environment
python3 -m venv .venv
source .venv/bin/activate

# 2. Install backend dependencies
pip install -r backend/requirements.txt

# 3. Configure environment variables
cp .env.example .env

# 4. Run backend API server
uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
```

Backend will be available at `http://127.0.0.1:8000` (API documentation at `http://127.0.0.1:8000/docs`).

### 2. Frontend Setup

```bash
# Navigate to frontend:
cd frontend
npm install

# Start Vite dev server:
npm run dev
```

Frontend will be available at `http://localhost:5173`.

### 3. Running Tests

```bash
# Run backend pytest suite:
.venv/bin/pytest backend/tests -v
```

---

## Repository Structure

```
DataLens/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI application entry point
│   │   ├── api/routes/          # API route endpoints
│   │   ├── core/                # Config, logging, error handlers
│   │   ├── db/                  # SQLAlchemy engine & session
│   │   ├── models/              # SQLAlchemy data models
│   │   ├── schemas/             # Pydantic validation schemas
│   │   ├── services/            # File storage, dataset services
│   │   └── audit/               # Profiling, rules, scoring algorithms
│   ├── tests/                   # Backend unit and integration tests
│   └── requirements.txt         # Backend Python dependencies
├── frontend/
│   ├── src/
│   │   ├── api/                 # Axios/Fetch API client
│   │   ├── components/          # Reusable UI components
│   │   ├── pages/               # Page views (Dashboard, Audit, Cleaning, etc.)
│   │   ├── styles/              # Vanilla CSS stylesheets
│   │   ├── App.jsx              # App layout & routing
│   │   └── main.jsx             # React entry point
│   ├── package.json
│   └── vite.config.js
├── docs/
│   └── DECISIONS.md             # Architectural decision records
├── storage/                     # Local storage for datasets & reports (git-ignored)
├── .env.example                 # Template for configuration
├── .gitignore                   # Git ignore patterns
├── PROJECT_STATE.md             # Continuous project progress and handoff
└── README.md
```

---

## Core Invariants

1. **Deterministic Audit Engine**: Statistical checks and quality scores are derived directly from data without non-deterministic external LLMs.
2. **Immutable Uploads**: Original uploaded files are never altered or overwritten.
3. **Safe Previews**: Preview transformations operate on isolated memory copies and never mutate stored files.
4. **Lineage & Versioning**: Every transformation records its parent version, parameters, affected row count, and produces a new version identifier.
