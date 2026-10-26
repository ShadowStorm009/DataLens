# PROJECT_STATE.md --- DataLens Handoff

> This file is the canonical handoff for any AI model continuing this
> repository. Keep it truthful and update it after every implementation
> phase. Never mark a feature verified without test evidence.

## 1. Project Identity

-   **Name:** DataLens --- Dataset Quality Auditor
-   **Purpose:** Help users upload CSV files, profile data, detect
    quality issues, preview/apply cleaning operations, preserve
    versions, re-audit, compare, and export.
-   **Core workflow:** Upload → Profile → Audit → Investigate → Preview
    → Transform → Re-audit → Compare → Export
-   **Target users:** Students, data analysts, ML beginners,
    researchers.
-   **MVP stack:** React + Vite + JavaScript + normal CSS; FastAPI +
    Pandas + NumPy; SQLite + SQLAlchemy; pytest.
-   **Out of scope for MVP:** ML model training, guaranteed leakage
    detection, team collaboration, subscriptions, and broad file-format
    support.

## 2. Current Repository Reality

-   **Last updated:** YYYY-MM-DD HH:MM timezone
-   **Branch:**
-   **HEAD commit:**
-   **Git status:**
-   **Frontend entry point:**
-   **Backend entry point:**
-   **Database configuration:**
-   **Upload/storage directory:**
-   **Frontend run command:**
-   **Backend run command:**
-   **Test commands:**
-   **Environment variable names:** (names only; never include secret
    values)
-   **Deployment URL/status:** (state verified/unverified)
-   **Important architecture notes:**

## 3. Feature Status Matrix

Use only these statuses: `VERIFIED`, `IMPLEMENTED_UNVERIFIED`,
`PARTIAL`, `NOT_STARTED`, `BLOCKED`.

  -----------------------------------------------------------------------------------
  Feature           Status        Files/modules   What works  What        Test
                                                              remains     evidence
  ----------------- ------------- --------------- ----------- ----------- -----------
  Repository        NOT_STARTED                                           
  foundation and                                                          
  health check                                                            

  SQLite            NOT_STARTED                                           
  persistence and                                                         
  models                                                                  

  CSV upload and    NOT_STARTED                                           
  validation                                                              

  Dataset preview   NOT_STARTED                                           
  and profile                                                             

  Audit rules and   NOT_STARTED                                           
  findings                                                                

  Quality score and NOT_STARTED                                           
  dashboard                                                               

  Cleaning preview  NOT_STARTED                                           

  Apply             NOT_STARTED                                           
  transformations                                                         
  and create                                                              
  versions                                                                

  Re-audit and      NOT_STARTED                                           
  comparison                                                              

  CSV and report    NOT_STARTED                                           
  export                                                                  

  Dataset deletion  NOT_STARTED                                           
  and reliability                                                         

  Automated tests   NOT_STARTED                                           

  README and        NOT_STARTED                                           
  deployment                                                              

  Demo and final    NOT_STARTED                                           
  submission                                                              
  checklist                                                               
  -----------------------------------------------------------------------------------

## 4. Current Implementation Details

-   **API endpoints implemented:**
-   **Database tables/models:**
-   **Audit algorithms and thresholds:**
-   **Quality score formula and version:**
-   **Cleaning operations supported:**
-   **Versioning behavior:**
-   **UI routes/components:**
-   **External services/integrations:**
-   **Important decisions and reasons:**

## 5. Work Completed in Most Recent Session

-   **Goal:**
-   **Changes made:**
-   **Files created/modified/deleted:**
-   **Commands run:**
-   **Tests and actual results:**
-   **Build result:**
-   **Commit(s):**
-   **Known limitations:**

## 6. Known Bugs, Risks, and Blockers

For each issue, include reproduction steps, impact, relevant file, and
status. - None recorded yet.

## 7. Next Actions (Ordered)

1.  **Next exact action:**
    -   Files to inspect/edit:
    -   Expected behavior:
    -   Acceptance test:
    -   Blockers/dependencies:
2.  
3.  

## 8. Things That Must Not Be Regressed

Record working behaviors, API contracts, data invariants, and known
constraints here. - Original uploaded dataset must remain immutable. -
Preview operations must not modify persisted data. - Applying a
transformation creates a new version. - Every audit must reference the
exact dataset version audited. - Audit results must be based on actual
data, not hardcoded demo values. - Core audit and cleaning logic must
work without an external LLM.

## 9. Resume Instructions for the Next Model

1.  Read this file completely.
2.  Read the PRD and AI Agent Prompt Pack if present.
3.  Inspect `git status`, recent commits, relevant source files, and
    tests.
4.  Verify this file's claims against code and tests; correct
    discrepancies.
5.  Continue from the first incomplete, unblocked action above.
6.  Do not restart or rewrite working features.
7.  Run relevant tests after changes.
8.  Update this file and append a progress entry before ending.

## 10. Append-Only Progress Log

### YYYY-MM-DD --- Session summary

-   **Goal:**
-   **Changes:**
-   **Tests/results:**
-   **Unfinished work:**
-   **Next action:**
