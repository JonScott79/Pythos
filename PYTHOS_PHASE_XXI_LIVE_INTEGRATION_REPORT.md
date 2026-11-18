# PYTHOS — PHASE XXI LIVE INTEGRATION REPORT

**Railway Project:** `pythos-staging` (`ab78d55a-6e25-421d-92a8-e298005f6b58`)  
**Environment:** `production` (`3f66d4e6-b187-4d70-95fc-0928d22bd7f7` inside `pythos-staging`)  
**Service:** `Pythos` (`f6c92158-3f0d-40db-b27c-ccdd4d40b198`)  
**Staging Domain:** `https://pythos-production-c45f.up.railway.app`

---

## 1. Investigation & Resolution of Railway Staging Blocker

1. **Root Cause of Original `connect-service-source` Denial:**
   - Calling `railway_mcp:connect-service-source` without `staged: true` and `environmentId` attempts an immediate, unstaged mutation across all environments and was blocked by the pre-tool security hook.
2. **Isolation Gap Discovered in `pythos-staging`:**
   - Although `pythos-staging` (`ab78d55a-6e25-421d-92a8-e298005f6b58`) is a separate Railway project from production `Pythos` (`1f379db1-fd37-4125-b512-045d14dc056d`), deploy logs (`f8e3175d-ef95-4c1a-bace-eb6b301a8f9e`) showed `[FIRESTORE] Pythos namespace initialized → pythos/app` (sharing the `lanzar-95ae3` Firebase project with production), and `PYTHOS_ENV` was unset.
3. **Remediations Applied:**
   - **Firestore & LANZAR ID Staging Namespace Isolation (`c826280`, `afa5b27`, `0237ffa`, `98090e3`):** Centralized in [server/firestoreNamespace.js](file:///C:/Projects/lanzar/pythos/server/firestoreNamespace.js) and wired across `firestoreService.js`, `memoryService.js`, `learningStore.js`, `toolController.js`, and `lanzarIdService.js` (`app_staging`, `pythos_memory_staging`, `pythos_learning_staging`, `pythos_chats_staging`, `users_staging` when `PYTHOS_ENV=staging`; fail-closed on invalid `PYTHOS_ENV`). Verified `4/4` in [test/test-firestore-namespace-isolation.js](file:///C:/Projects/lanzar/pythos/test/test-firestore-namespace-isolation.js) and `5/5` in [test/test-lanzar-id-namespace-isolation.js](file:///C:/Projects/lanzar/pythos/test/test-lanzar-id-namespace-isolation.js).
   - **Set `PYTHOS_ENV=staging`** on `pythos-staging` via `railway_mcp:set-variables` (`skipDeploys: true`).
   - **Staged Source Connection:** Staged `JonScott79/Pythos@staging/specialist-engines-integration` (`commitSha: 98090e3`) via `railway_mcp:connect-service-source` with `staged: true` and `environmentId: "3f66d4e6-b187-4d70-95fc-0928d22bd7f7"` (patch `61cb66cc-a70e-4604-8aca-e4ca34d3677e`, `4` pending staged changes).

---

## 2. Current Live Staging Status (Blocked on Interactive `accept-deploy` Confirmation)

| Check | Status | Details |
| :--- | :--- | :--- |
| **Pre-Deploy `/health/ready`** | **Tested Live** (`200 OK`) | Returned `{"status":"ready","service":"pythos-api","checks":{"llm":{"status":"ready","provider":"groq"},"cas":{"status":"ready","engine":"sympy"}}}` on prior deployment `f8e3175d-ef95-4c1a-bace-eb6b301a8f9e` (`d482f16`). |
| **Commit of Staged Deploy (`accept-deploy`)** | **Blocked on Interactive UI Confirmation** | `railway_mcp:accept-deploy` returned `Cancelled — the user did not approve this action`. Requires clicking Approve on `accept-deploy` or Deploy in the Railway `pythos-staging` dashboard for patch `61cb66cc-a70e-4604-8aca-e4ca34d3677e` (`98090e3`). |
| **Post-Deploy Live `/api/chat`, Groq LLM, & Firestore Persistence** | **Not Yet Tested (Blocked on `accept-deploy`)** | Ready to execute immediately once patch `61cb66cc-a70e-4604-8aca-e4ca34d3677e` (`98090e3`) is deployed. |
