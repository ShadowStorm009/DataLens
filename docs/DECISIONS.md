# Architectural Decisions Record (ADR) - DataLens

This document logs significant technical and architectural decisions for the DataLens Dataset Quality Auditor application.

---

## ADR-001: Core Technology Stack

- **Date:** 2026-10-26
- **Status:** Accepted
- **Context:**
  DataLens requires a lightweight, maintainable, responsive tabular data auditing tool without unnecessary infrastructure or cloud service dependencies.
- **Decision:**
  - **Frontend:** React with Vite, JavaScript, normal CSS (scoped modular styles, no Tailwind as per PRD constraints).
  - **Backend:** Python with FastAPI, Uvicorn, and Pydantic for schema validation and typed endpoints.
  - **Data Processing:** Pandas and NumPy for vectorised tabular profiling, metric computations, and transformation logic.
  - **Persistence:** SQLite with SQLAlchemy for metadata, version tracking, audit records, findings, and transformation logs. Raw tabular data stored as versioned CSV files.
  - **Testing:** pytest with FastAPI TestClient for backend unit and integration tests.
- **Consequences:**
  - Simple local setup without external database daemon requirements.
  - High determinism and testability.

---

## ADR-002: Deterministic Rule-Based Quality Audit Engine

- **Date:** 2026-10-26
- **Status:** Accepted
- **Context:**
  Users need reproducible, evidence-based quality scores and issue findings. LLM calculations can hallucinate statistics, introduce non-determinism, or fail to handle large datasets.
- **Decision:**
  - All audit metrics, IQR outlier bounds, missing value ratios, duplicate counts, and quality scores are computed deterministically via standard statistical rules in Python.
  - Findings must supply structured numerical evidence (e.g., specific row indices, null counts, lower/upper fence bounds).
- **Consequences:**
  - Audits are fast, reproducible, and verifiable.
  - Zero external API costs or external privacy leaks.

---

## ADR-003: Immutable Versioning and Non-Mutating Previews

- **Date:** 2026-10-26
- **Status:** Accepted
- **Context:**
  Users must be able to audit raw data safely and preview proposed transformations without accidentally corrupting or overwriting original uploads.
- **Decision:**
  - Uploaded files are immutable and assigned an initial `DatasetVersion` (v1).
  - Cleaning transformations (median imputation, mode imputation, duplicate removal, column dropping) generate a new child `DatasetVersion` (e.g., v2).
  - Transformation previews operate strictly in-memory or on ephemeral copies; preview and apply share the identical core transformation function to guarantee consistency.
  - All audit runs and findings are linked to the specific `version_id` analyzed.
- **Consequences:**
  - Audit history and dataset provenance are completely traceable.
  - Original data is preserved under all conditions.

---

## ADR-004: Python Virtual Environment Strategy on Arch Linux

- **Date:** 2026-10-26
- **Status:** Accepted
- **Context:**
  Arch Linux enforces PEP 668 ("externally managed environment"), preventing global `pip install`.
- **Decision:**
  - All Python packages and tooling are maintained within a dedicated virtual environment at `.venv/`.
  - Backend execution and pytest commands use `.venv/bin/python`, `.venv/bin/uvicorn`, and `.venv/bin/pytest`.
- **Consequences:**
  - Clean separation from host packages and reproducibility across developer setups.
