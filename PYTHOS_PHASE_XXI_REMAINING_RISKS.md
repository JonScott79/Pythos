# PYTHOS — PHASE XXI REMAINING RISKS & BLOCKERS

**Branch:** `staging/specialist-engines-integration`  
**Current Commit:** `afa5b27` (plus Phase XXI docs update)

---

| ID | Risk / Blocker | Status | Notes |
| :--- | :--- | :--- | :--- |
| `BLK-01` | **Railway Staged Deploy Approval (`accept-deploy`)** | **Blocked on Interactive UI Approval** | Patch `61cb66cc-a70e-4604-8aca-e4ca34d3677e` (`PYTHOS_ENV=staging` + `staging/specialist-engines-integration@afa5b27`) is staged on `pythos-staging` (`3f66d4e6-b187-4d70-95fc-0928d22bd7f7`). Live `/api/chat`, live Groq LLM, and live `app_staging` Firestore tests await deployment activation. |
| `RISK-01` | **30–60 Minute Container Soak Not Yet Run on Railway** | Open | Local 20s SymPy soak (`1,998` requests, `0` errors, `+0.4 MB` RSS) passed; 30–60 minute staging soak should run after `accept-deploy`. |
| `RISK-02` | **Pre-Existing Uncommitted Files** (`server/lanzarIdService.js`, `test/test-lanzar-secret-lifecycle.js`) | Preserved | Kept untouched in working tree per operational constraint. |
| `RISK-03` | **`pythos-staging` Environment Named `production` in Railway UI** | Mitigated | Railway's default environment inside `pythos-staging` (`ab78d55a-6e25-421d-92a8-e298005f6b58`) is named `production`; mitigated via explicit `projectId` + `PYTHOS_ENV=staging` Firestore namespace isolation (`app_staging`, `pythos_memory_staging`). |
