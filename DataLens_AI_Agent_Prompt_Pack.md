# DataLens --- AI Agent Prompt Pack

**Purpose:** Implement DataLens incrementally with a coding agent while
preserving project context across models and sessions.

**Product:** Dataset Quality Auditor\
**Core workflow:** Upload → Profile → Audit → Investigate → Preview →
Transform → Re-audit → Compare → Export\
**Recommended stack:** React + Vite + JavaScript + normal CSS; FastAPI +
Python + Pandas + NumPy; SQLite + SQLAlchemy; pytest; Git.

------------------------------------------------------------------------

# How to Use This Pack

1.  Open your project repository in your coding agent.
2.  Paste **Prompt 0 --- Master Instructions** first.
3.  Then run the prompts in order. Do not paste all feature prompts at
    once unless your agent can reliably plan and execute staged work.
4.  After each prompt, review the changes, run the tests, and commit
    working code.
5.  Before switching models, run **Prompt H --- Save a Complete
    Handoff**.
6.  When you return with another model, give it **Prompt R --- Resume
    From Project Files**. The new model must inspect `PROJECT_STATE.md`,
    `README.md`, Git status/history, and the actual source code before
    changing anything.
7.  Keep `PROJECT_STATE.md` at the repository root and commit its
    updates. The file is a project log and handoff document, not a
    substitute for inspecting the code.

**Important:** Never let an agent mark a feature complete only because
it generated code. A feature is complete only when it is integrated,
tested, and verified against its acceptance criteria.

------------------------------------------------------------------------

# Prompt 0 --- Master Instructions (Run First)

You are the lead engineer implementing **DataLens**, a Dataset Quality
Auditor web application. Work inside the existing repository. Your goal
is a working, maintainable product---not a mockup, tutorial clone, or
dashboard full of hardcoded values.

## Product requirements

DataLens lets a user upload a CSV, profile it, detect data-quality
issues, inspect findings, preview and apply supported cleaning
operations, preserve original data, re-audit, compare versions, and
export the cleaned CSV and audit report.

Core workflow: 1. Upload and validate CSV. 2. Profile the real dataset.
3. Run deterministic data-quality checks. 4. Inspect findings and
evidence. 5. Preview a selected transformation without changing data. 6.
Apply the transformation to create a new dataset version. 7. Re-run the
audit and compare results. 8. Export the selected version and report.

## Required technology direction

-   Frontend: React, Vite, JavaScript, normal CSS.
-   Routing: React Router if multiple pages are needed.
-   Charts: Recharts only if useful.
-   API: FastAPI, Uvicorn, Pydantic.
-   Data processing: Pandas and NumPy.
-   Persistence: SQLite and SQLAlchemy.
-   Tests: pytest and FastAPI TestClient; frontend tests are optional if
    time is short.
-   Version control: Git. Do not introduce Tailwind, a second backend
    framework, cloud services, or extra infrastructure without a
    concrete need. Prefer the simplest implementation that meets the
    PRD.

## Engineering rules

1.  Before coding, inspect the repository, existing files, dependencies,
    Git status, and project documentation.
2.  Do not overwrite or delete existing work without explaining why and
    preserving anything valuable.
3.  Reuse existing conventions and working components. Do not rebuild
    the application from scratch if useful work already exists.
4.  Keep API routes, business logic, persistence, and UI components
    reasonably separated.
5.  The audit engine must be deterministic. Do not use an LLM to
    calculate statistics, assign findings without evidence, or perform
    the core cleaning logic.
6.  Never hardcode sample statistics into the production dashboard. Any
    demo dataset must be clearly labelled and processed through the real
    pipeline.
7.  Preserve the original uploaded file. Cleaning operations must create
    a new version.
8.  Preview must be non-mutating. Apply must use the same validated
    transformation logic as preview.
9.  Validate uploads and operation parameters on the server. Enforce
    file-size limits. Avoid path traversal and unsafe file paths.
10. Provide meaningful loading, empty, success, and error states.
11. Write tests for core algorithms and important API workflows. Do not
    claim tests passed unless you ran them and observed the result.
12. Do not claim deployment, external integration, or functionality that
    has not actually been verified.
13. Keep the code compatible with the actual installed versions; inspect
    dependency files before changing packages.
14. Use environment variables for deployment-specific configuration.
    Never commit secrets.
15. Do not add authentication unless explicitly required; the MVP is
    single-user.
16. Keep the scope small enough to finish the complete workflow.

## Context preservation --- mandatory

Maintain these files at repository root: - `PROJECT_STATE.md`:
canonical, current handoff and progress record. - `README.md`:
user-facing project documentation and setup. - `docs/DECISIONS.md`:
important technical decisions and reasons, if there are enough decisions
to warrant a separate file. - `.env.example`: names and descriptions of
environment variables only, never real secrets.

After every feature phase: - Update `PROJECT_STATE.md`. - Record
implemented behavior, files created/changed, commands run, test
outcomes, known bugs, unimplemented requirements, and the next exact
action. - Distinguish **verified**, **implemented but unverified**,
**partially implemented**, and **not started**. - Record exact error
output or a concise error summary when tests fail. - Record important
assumptions and decisions. - Do not erase older history; append a
concise dated progress entry while keeping the current status section up
to date.

If `PROJECT_STATE.md` does not exist, create it from the provided
`PROJECT_STATE_TEMPLATE.md` or a similar structure.

## Required response after each phase

At the end of each phase, report: 1. What changed. 2. Files
created/modified. 3. Commands executed. 4. Tests run and actual results.
5. Known issues and risks. 6. Whether the phase acceptance criteria
passed. 7. What is still not implemented. 8. The next recommended
prompt/step. 9. Confirm that `PROJECT_STATE.md` was updated.

Do not move to the next phase automatically unless asked. Finish the
requested phase cleanly.

------------------------------------------------------------------------

# Prompt 1 --- Repository Reconnaissance and Implementation Plan

Inspect the current repository before changing code. Do not implement
major features yet.

Tasks: 1. List the repository structure, frontend/backend setup,
dependency files, entry points, routes, database setup, tests, and
current Git status. 2. Read the PRD if it exists in the repository. If
it does not, use this prompt pack as the product brief and note that the
original PRD file is not present. 3. Run existing tests or build checks
where feasible. Record baseline failures separately from newly
introduced failures. 4. Identify what already works and what is missing.
5. Map the current implementation to the DataLens core workflow. 6.
Propose a phased implementation plan that preserves working code and
fits the existing architecture. 7. Identify risks such as local-file
persistence, upload limits, CORS, or mismatched API contracts. 8. Create
or update `PROJECT_STATE.md` with the current repository state and next
steps.

Do not: - Replace the project structure without justification. - Install
a large collection of dependencies before checking what is already
installed. - mark features complete based on filenames alone.

Acceptance criteria: - A factual repository assessment exists. -
Existing functionality and failures are documented. - `PROJECT_STATE.md`
is present and useful. - The next implementation step is specific and
small.

------------------------------------------------------------------------

# Prompt 2 --- Establish or Repair the Application Foundation

Implement only the missing foundation after reviewing the repository.

Tasks: 1. Ensure the React/Vite frontend can start and build. 2. Ensure
the FastAPI backend starts and exposes a health endpoint such as
`GET /health`. 3. Configure frontend API base URL through an environment
variable or an appropriate Vite environment setting. 4. Configure CORS
for local development without opening it unnecessarily in production. 5.
Add consistent API error response handling. 6. Establish clean module
boundaries for routes, schemas, services, audit logic, and persistence.
7. Add `.gitignore` entries for virtual environments, `node_modules`,
`.env`, SQLite files as appropriate, uploaded datasets, generated
exports, and build artifacts. Do not ignore source files or required
sample fixtures. 8. Add `.env.example` without secrets. 9. Document
local setup commands in README. 10. Add or update `PROJECT_STATE.md`.

Acceptance criteria: - Frontend starts and production build works. -
Backend starts and `/health` responds. - Frontend can make a test
request to backend. - No secret values are committed. - Setup
instructions work from a clean environment as far as can be verified.

Do not build the complete dashboard in this phase.

------------------------------------------------------------------------

# Prompt 3 --- Database, Dataset Metadata, and File Storage

Implement the minimum persistence layer required by DataLens.

Requirements: 1. Use SQLite and SQLAlchemy unless the repository already
has a suitable working persistence layer. 2. Create models/tables for: -
Dataset - DatasetVersion - AuditRun - Finding, if findings are stored as
rows - Transformation 3. Keep audit runs associated with the exact
dataset version they audited. 4. Store internal file references, not
user-supplied paths. 5. Use unique identifiers for datasets and
versions. 6. Create database initialization or migration logic suitable
for the project size. 7. Add service functions for dataset lookup,
version creation, audit persistence, and deletion. 8. Handle missing
records cleanly. 9. Make storage directory configurable. 10. Do not
persist the entire dataframe as a giant JSON blob unless there is a
documented reason. CSV files can be stored separately, with metadata in
SQLite. 11. Add tests for creating, reading, and deleting records. 12.
Update `PROJECT_STATE.md`.

Acceptance criteria: - Records survive application restarts in the
configured persistent environment. - Foreign-key relationships and
version references are consistent. - Missing dataset IDs produce a
controlled 404-style response. - Tests cover core persistence behavior.

------------------------------------------------------------------------

# Prompt 4 --- CSV Upload, Validation, and Dataset Preview

Implement the complete upload workflow.

Requirements: 1. Provide an upload UI with file picker or drag-and-drop,
dataset name, and clear file limits. 2. Backend accepts CSV uploads only
for the MVP. 3. Validate file size on the server and use a configurable
limit; start with a conservative limit such as 10 MB unless the
deployment requires a smaller limit. 4. Do not trust the extension or
browser MIME type alone. Attempt safe parsing and reject invalid
content. 5. Generate a server-side ID and safe internal filename. Never
concatenate the original filename into a filesystem path. 6. Handle
empty files, malformed CSV, encoding problems, duplicate headers, empty
headers, and files with no usable columns. 7. Be careful with leading
zeros and identifier-like columns; avoid destructive type coercion
during initial parsing. 8. Store the original upload immutably and
create the initial DatasetVersion. 9. Return dataset metadata and enough
information to navigate to the profile page. 10. Add a dataset list
endpoint and a limited-row preview endpoint. 11. Frontend must show
loading, success, validation error, network error, and empty states. 12.
Ensure failed uploads do not leave orphaned files or database records.
13. Test valid CSV, empty file, malformed CSV, oversized file, duplicate
headers, and missing dataset ID. 14. Update `PROJECT_STATE.md`.

Acceptance criteria: - Uploading a valid CSV creates a persistent
dataset and initial version. - The dashboard lists the uploaded dataset
after refresh. - Preview displays actual rows, with a strict row
limit. - Invalid uploads produce actionable errors. - Original file
remains unchanged.

------------------------------------------------------------------------

# Prompt 5 --- Dataset Profiling Engine

Implement reusable, testable profiling functions.

Dataset-level profile: - Row and column count. - Missing-cell count and
percentage. - Exact duplicate-row count. - Counts of inferred numeric,
categorical, date-like, boolean-like, and other columns where inference
is reliable.

Numeric column profile: - Min, max, mean, median, standard deviation,
quartiles, missing count, distinct count.

Categorical column profile: - Distinct count, most frequent values and
counts, missing count, unique-value ratio.

Date-like profile: - Min/max when parsing is reliable and invalid-value
count where relevant.

All columns: - Name, inferred type, null count, distinct count.

Implementation requirements: 1. Keep profiling functions separate from
HTTP route code. 2. Use Pandas/NumPy, but guard against empty columns,
all-null columns, one-row datasets, infinite values, and mixed-type
data. 3. Distinguish inferred types from declared schema types. 4. Avoid
displaying huge lists of unique values; return only a bounded top-N
summary. 5. Serialize NumPy/Pandas values into JSON-safe types. 6. Cache
profile results only if cache invalidation is tied to immutable dataset
versions. 7. Add unit tests using small fixtures with known statistics.
8. Add a profile endpoint and render a real profile page or section. 9.
Update `PROJECT_STATE.md`.

Acceptance criteria: - Profile values match hand-calculated expected
values in tests. - Edge cases do not crash the API. - Frontend displays
actual profile data. - No profile statistics are hardcoded.

------------------------------------------------------------------------

# Prompt 6 --- Audit Engine and Findings Schema

Implement deterministic audit rules and a common findings format.

Each finding should include: - `id` - `rule_id` - `title` - `severity`
(`high`, `medium`, or `low`) - `column_name` where applicable -
`description` - `evidence` as structured values - `recommendation` -
`finding_type` or equivalent classification

Required checks: 1. Missing values: count and percentage by column. 2.
Exact duplicate rows: count duplicates without removing them. 3.
Constant columns: one distinct non-null value. 4.
High-cardinality/identifier-like columns: heuristic only; explain
uncertainty. 5. Potential numeric outliers using IQR fences; report
counts and fences. 6. Type inconsistencies: detect values that cannot be
converted to a proposed type without silently changing data. 7.
Target-class imbalance when the user selects a categorical target
column. 8. Potential leakage indicators only when evidence supports a
clearly described heuristic. Do not claim definitive leakage detection.

Requirements: - Each audit rule should be independently testable. -
Rules should not crash the entire audit when one column is unusual;
report partial failures where feasible. - Thresholds must be documented
and configurable where practical. - Avoid false certainty. Outliers,
unique identifiers, and correlations are not automatically errors or
leakage. - Persist an AuditRun tied to a dataset version. - Persist
findings or a versioned, structured result. - Provide API endpoints to
run and retrieve audits and filter findings. - Add tests for each rule
and important edge cases. - Update `PROJECT_STATE.md`.

Acceptance criteria: - Findings come from actual data and include
evidence. - Same input and configuration produce the same results. - No
destructive changes happen during an audit. - Tests verify both positive
and negative cases.

------------------------------------------------------------------------

# Prompt 7 --- Quality Score and Audit Dashboard

Implement the score and present audit findings in a usable interface.

Quality score: 1. Define transparent penalties for implemented
dimensions, such as missingness, duplicates, invalid-type burden, and
constant columns. 2. Keep the score within 0--100. 3. Avoid unexplained
or arbitrary values and unjustified double counting. 4. Store the
scoring-method version with each audit. 5. Explain that the score covers
only implemented checks and is not a universal correctness guarantee.

Dashboard: - Dataset summary. - Quality score and component breakdown. -
Finding counts by severity. - Missing-value summary. - Duplicate
count. - Column profile table. - Findings list. - Filters by severity,
rule, and column. - Finding detail panel or page. - Loading, empty, and
error states.

Requirements: - Use actual API responses. - Use charts only where they
clarify real data. - Ensure filters change displayed findings. - Do not
use hardcoded values in the production dashboard. - Use accessible
labels and readable tables. - Keep styling consistent and use normal
CSS. - Test the score calculation and main dashboard states. - Update
`PROJECT_STATE.md`.

Acceptance criteria: - Score is deterministic and explained. - Finding
filters work. - Selecting a finding displays its evidence and
recommendation. - The dashboard updates when a new audit is run.

------------------------------------------------------------------------

# Prompt 8 --- Cleaning Operations and Non-Mutating Preview

Implement cleaning previews and supported transformations.

Required operations: 1. Fill missing numeric values with the median. 2.
Fill missing categorical values with the mode, with a clear error if no
valid mode exists. 3. Remove exact duplicate rows after explicit user
confirmation. 4. Drop a selected constant column after explicit user
confirmation. 5. Outlier handling remains inspection-only unless a
separately tested operation is added.

Preview requirements: - User chooses a dataset version, operation,
column if needed, and valid parameters. - Backend validates the
request. - Preview uses a copy and never changes stored data. - Show a
bounded sample of before/after values and expected row/cell changes. -
Preview and apply must call the same transformation implementation to
prevent discrepancies. - Canceling the preview leaves data unchanged.

Apply requirements: - Revalidate on the server. - Load source version
and operate on a copy. - Validate the resulting dataframe. - Save a new
version rather than overwriting the source. - Record operation,
parameters, timestamp, source/result versions, and affected
rows/cells. - Make the new version available in the UI. - Handle
storage/database failure without promoting a partial result to the
current version. - Add unit and integration tests. - Update
`PROJECT_STATE.md`.

Acceptance criteria: - Preview does not mutate data. - Applying an
operation creates a new version. - Original version remains accessible
and unchanged. - Transformation history accurately describes the
operation. - Invalid operation requests return controlled errors.

------------------------------------------------------------------------

# Prompt 9 --- Version History, Re-Audit, and Comparison

Implement version tracking and before/after comparisons.

Requirements: 1. Show original and cleaned dataset versions. 2. List
transformations in chronological order. 3. Link every audit to the exact
version it inspected. 4. Allow the user to run an audit against the
current selected version. 5. Compare: - Quality score and score
method. - Missing counts/percentages. - Duplicate-row counts. - Finding
counts by severity. - Relevant column statistics. 6. Ensure comparisons
use compatible audit configurations and scoring methodology. If methods
differ, explain the limitation. 7. Show improvements and regressions
based on measured values; do not claim a score increase proves the
dataset is correct. 8. Provide clear empty states if a comparison cannot
be made. 9. Add tests for version ancestry, audit/version association,
and comparison calculations. 10. Update `PROJECT_STATE.md`.

Acceptance criteria: - User can see how a cleaned version was
produced. - Original and cleaned versions remain distinct. - Comparison
values derive from stored audit/profile data. - Unresolved findings
remain visible.

------------------------------------------------------------------------

# Prompt 10 --- CSV Export and Audit Report

Implement export for real dataset versions and audit runs.

CSV export: - Export a selected version, not implicitly whichever file
happens to be latest. - Use safe generated filenames. - Preserve columns
and values as accurately as the supported CSV format permits. - Consider
spreadsheet formula injection; if a spreadsheet-safe mode is
implemented, document how it changes formula-leading values. - Handle
empty or missing versions and export failures.

Audit report: - Dataset ID/name. - Version ID. - Audit timestamp and
status. - Row/column counts. - Quality score and scoring-method
explanation. - Findings with severity and evidence. - Transformations
applied. - Before/after comparison if available.

JSON or HTML is enough for the MVP; PDF is optional.

Requirements: - Add API endpoints for downloads. - Ensure frontend
download buttons use the correct dataset/version/audit IDs. - Return
proper content types and filenames. - Test that exported files contain
expected data and report contents. - Update `PROJECT_STATE.md`.

Acceptance criteria: - Exported CSV matches the selected version. -
Report matches the selected audit. - Export errors are handled visibly.

------------------------------------------------------------------------

# Prompt 11 --- Dataset Deletion, Error States, and Reliability Pass

Perform a reliability pass without adding major new features.

Tasks: 1. Implement dataset deletion with confirmation. 2. Remove
associated database records and files safely where supported. 3. Ensure
missing resource IDs produce 404 responses. 4. Review all endpoints for
input validation and consistent errors. 5. Review frontend loading,
empty, success, and error states. 6. Prevent repeated submissions where
they could cause duplicate transformations. 7. Check that partial
failures do not corrupt the current version. 8. Review file size limits,
safe filenames, path traversal prevention, and CORS. 9. Review logging
to ensure secrets and private data are not leaked. 10. Test backend
unavailable/network error behavior. 11. Update README and
`PROJECT_STATE.md`.

Acceptance criteria: - Important errors are handled intentionally. -
Dataset deletion does not leave accessible orphaned records. - The main
workflow still works after the reliability changes. - Tests run and
results are recorded accurately.

------------------------------------------------------------------------

# Prompt 12 --- Testing, Documentation, Deployment, and Final QA

Do not add new features unless a critical requirement is missing. Focus
on making the product shippable.

Tasks: 1. Run all backend tests. 2. Run frontend build and available
frontend tests. 3. Test the complete flow: upload → profile → audit →
finding → preview → apply → re-audit → compare → export. 4. Test invalid
upload and at least one invalid transformation. 5. Fix regressions
caused by the implementation. 6. Verify local setup from README as far
as practical. 7. Ensure `.env.example` contains variable names but no
secrets. 8. Ensure `.gitignore` excludes secrets, local data, build
output, and virtual environments as appropriate. 9. Add architecture
summary and limitations to README. 10. Configure and verify deployment
if credentials and hosting access are available. If deployment cannot be
performed, give exact manual steps and clearly state that deployment is
not verified. 11. Verify persistent storage behavior in the selected
hosting environment. 12. Prepare a test CSV with known issues for a
reproducible demo. 13. Update `PROJECT_STATE.md` with final verified
status and any remaining blockers.

Acceptance criteria: - The main workflow passes end-to-end. -
Build/tests and their actual results are documented. - README gives
usable setup instructions. - No secrets are committed. - Deployment
status is stated truthfully. - Remaining limitations are explicit.

------------------------------------------------------------------------

# Prompt H --- Save a Complete Handoff Before Switching Models

You are about to stop work on DataLens, and another AI model may
continue later without access to this conversation. Create a **complete,
self-contained handoff** in the repository so the next model can
continue without asking the user to explain the project again.

First inspect the actual repository, source files, Git status/history,
test results available in the current environment, README, and existing
`PROJECT_STATE.md`. Do not infer completion from plans or previous
assistant messages.

Update `PROJECT_STATE.md` with the following sections. Keep it concise
enough to navigate but detailed enough to resume work accurately.

## A. Project identity and objective

-   Project name and one-paragraph purpose.
-   Target users.
-   Core workflow.
-   Product scope and explicitly excluded features.
-   Required stack and any justified deviations.

## B. Current repository reality

-   Current branch and Git status.
-   Current commit hash if available.
-   Actual project structure and important entry points.
-   How to run frontend, backend, and tests.
-   Relevant environment variables, with names only; never copy secrets.
-   Database and file storage locations/configuration.
-   Deployment details and what is or is not verified.

## C. Feature status matrix

For every PRD feature, use one status: - `VERIFIED`: implemented,
integrated, and tested successfully. - `IMPLEMENTED_UNVERIFIED`: code
exists but verification is incomplete. - `PARTIAL`: some requirements
work, others do not. - `NOT_STARTED`: no implementation. - `BLOCKED`:
cannot proceed until a named dependency/problem is resolved.

Include: - Feature name and status. - Files/modules involved. - What
works. - What remains. - Relevant test names and actual results. - Known
limitations.

Do not mark a feature `VERIFIED` without evidence.

## D. Work completed in this session

-   What was implemented.
-   Files created/modified/deleted.
-   Important implementation details.
-   API endpoints added/changed.
-   Database schema or migration changes.
-   Algorithms and thresholds used.
-   UI routes/components added.
-   Commands actually run and their results.
-   Tests that failed and exact or summarized errors.
-   Git commits created, if any.

## E. Current state and blockers

-   Exact current working state.
-   Known bugs and reproducible steps.
-   Unresolved integration issues.
-   Missing dependencies or configuration.
-   Any assumptions that may be wrong.
-   What should not be changed because it already works.

## F. Next actions in priority order

Give numbered steps with: - Exact file(s) to inspect/edit. - The
behavior to implement. - The acceptance test to run. - Any
dependency/blocker. The first item must be the single best next action,
not a broad instruction like "continue development."

## G. How the next model must resume

Explicitly instruct the next model to: 1. Read `PROJECT_STATE.md`
completely. 2. Read the PRD and prompt pack if they exist in the
repository. 3. Inspect `git status`, recent commits, and the actual
source files related to the next task. 4. Run or inspect tests before
modifying code. 5. Verify that the documented status matches the code.
6. Continue from the first incomplete priority; do not restart or
rewrite working features. 7. Ask the user a question only if a genuine
product decision or missing secret/permission blocks progress. 8. After
implementing the next feature, test it and update the handoff again.

## H. Append-only progress log

Add a dated entry for this work session containing: - Goal. - Changes
made. - Tests and outcomes. - Remaining work. - Next action.

Keep prior progress entries. Update the current-state summary so it
reflects the latest truth.

Finally: - Save all changes to `PROJECT_STATE.md`. - Ensure it is
readable without this chat. - Tell me the exact file path. - Show a
short summary of what the handoff records. - Do not claim the handoff is
complete until you have actually written and inspected the file.

------------------------------------------------------------------------

# Prompt R --- Resume From Project Files (Use When Switching to Another Model)

You are continuing an existing DataLens implementation. **Do not ask me
to explain the project again. The repository is the source of truth.**

Before editing any files: 1. Read `PROJECT_STATE.md` completely. 2. Read
`README.md`, the DataLens PRD, and `DataLens_AI_Agent_Prompt_Pack.md` if
present. 3. Inspect `git status` and recent commit history. 4. Inspect
the actual source files for the next task listed in `PROJECT_STATE.md`.
5. Run relevant tests or build checks where practical, or inspect
recorded results and rerun them if the environment allows. 6. Compare
the handoff's claims with the current code. If the file and code
disagree, trust the code and tests, then correct the handoff. 7.
Identify the first incomplete, unblocked priority item.

Then continue from that item. Do not rebuild the project, replace
working architecture, duplicate existing features, or mark work complete
without verification. Preserve the established stack and conventions
unless a specific technical problem justifies changing them.

Before finishing: - Run the most relevant tests. - Report files changed
and actual test results. - Update `PROJECT_STATE.md` with verified
status, blockers, and the next exact action. - Append a progress log
entry without deleting previous entries. - Keep README and decisions up
to date if the implementation changes their claims.

If the project state file is missing, reconstruct it from the
repository, Git history, README, tests, and source code. Clearly
distinguish verified facts from assumptions. Ask me only if a real
product decision or required access is missing.

Your first response should briefly summarize the repository's actual
state and the next action you intend to take; then proceed with the next
task unless blocked.

------------------------------------------------------------------------

# Prompt F --- Final Context and Feature Audit

Review the whole project against the PRD and `PROJECT_STATE.md`.

Tasks: 1. Map every functional requirement to the actual implementation
and tests. 2. Identify hardcoded/mock data, dead buttons, placeholder
screens, and API calls that do not work. 3. Check that the original
dataset is preserved and preview does not mutate stored data. 4. Verify
transformation history, version/audit relationships, comparisons, and
exports. 5. Review upload limits, error handling, CORS, safe file paths,
and secret handling. 6. Run tests/builds and report actual results. 7.
Correct the most important defects within scope; do not add unrelated
features. 8. Update README and `PROJECT_STATE.md` with truthful final
status. 9. Produce a concise final checklist of verified features,
partial features, missing features, deployment status, and known
limitations.

Do not label the product "complete" if a core workflow is broken or if
major claims are not verified.

------------------------------------------------------------------------

# Recommended Git Checkpoint Habit

After a phase passes tests, review `git diff`, stage only relevant
files, and commit with a meaningful message, for example:

-   `feat: add CSV upload and validation`
-   `feat: implement dataset profiling`
-   `feat: add deterministic audit rules`
-   `feat: add non-mutating cleaning preview`
-   `feat: preserve dataset versions and history`
-   `feat: add audit comparison and exports`
-   `test: cover core DataLens workflows`
-   `docs: document setup and deployment`

Do not commit `.env` files containing secrets or real private datasets.

# Definition of Done

A feature is done only when: - The behavior exists in the actual
application. - It is connected to the real API/data flow. - Input and
failure cases are handled. - Relevant tests were run and the results are
recorded. - Documentation reflects reality. - `PROJECT_STATE.md` is
updated with the next step.

A project is shippable only when the core upload-to-export workflow
works end-to-end and the deployment, README, Git history, demo, and
submission requirements are addressed.
