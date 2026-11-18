# PYTHOS — PHASE XXI SECURITY & RESOURCE ISOLATION REPORT

**Branch:** `staging/specialist-engines-integration`  
**Tested Commit:** `f380aa7`  
**Suite:** [test/test-verifier-security.js](file:///C:/Projects/lanzar/pythos/test/test-verifier-security.js) (`3/3 PASSED`)

---

## 1. Critical Vulnerability Discovered & Remediated (`5bd0387`)

During Phase XXI security probing of Python 3.14 + SymPy 1.14.0, direct calls to `sp.sympify()` were found to evaluate arbitrary Python expressions:
- `sp.sympify("__import__(chr(111)+chr(115))")` **returned `<module 'os' (frozen)>`**
- `sp.sympify("(1).__class__")` **returned `<class 'sympy.core.numbers.One'>`**
- `sp.sympify("lambda x: x")` **returned `Lambda(_x, _x)`**

### Remediation: `server/verifier/safe_sympify.py`
Implemented [safe_sympify.py](file:///C:/Projects/lanzar/pythos/server/verifier/safe_sympify.py) and replaced all direct `sp.sympify(...)` calls across all 8 Python verifier modules (`algebra_verifier.py`, `arithmetic_verifier.py`, `calculus_verifier.py`, `calculus_improper_verifier.py`, `calculus_singularity_verifier.py`, `dynamical_systems_verifier.py`, `logic_verifier.py`, `physics_mechanics_verifier.py`) and [calculus_worker.py](file:///C:/Projects/lanzar/pythos/server/engines/calculus_worker.py), plus entrypoint payload validation in [verifier.py](file:///C:/Projects/lanzar/pythos/server/verifier/verifier.py):
- **Length & Line Caps:** `MAX_EXPR_LENGTH = 4096` chars; `MAX_DAEMON_LINE_BYTES = 262144` bytes in `verifier.py --daemon`.
- **Token & Construct Denylist:** Rejects `__`, `import`, `exec(`, `eval(`, `compile(`, `open(`, `getattr`, `setattr`, `delattr`, `globals`, `locals`, `lambda`, quotes, and attribute traversal.
- **AST Allowlist (`ast.parse`):** Permits only mathematical operators, numeric constants, identifiers, and allowlisted math/logic functions (`ALLOWED_CALL_NAMES`); rejects `ast.Attribute`, `ast.Lambda`, comprehensions, and string constants.
- **Resource DoS Guard:** Rejects nested power towers (`9**9**9**9`) and literal exponents `> 10000`.

---

## 2. Security Verification Results

- [test/test-verifier-security.js](file:///C:/Projects/lanzar/pythos/test/test-verifier-security.js) (`3/3 PASSED`): Verified `__import__('os').system(...)`, `chr()`-obfuscated `__import__`, `(1).__class__.__base__.__subclasses__()`, `lambda x: x`, `[x for x in range(10)]`, `open('/etc/passwd').read()`, `9**9**9**9`, `x**999999`, and `>4096`-char payloads all fail closed on both `VerifierWorker` and `CalculusWorker`, with both pools remaining healthy afterward.
- **Cross-Request Isolation:** Strict 1-task-per-worker model + `_id` mismatch guard (`CAS_DESYNC_ERROR`) prevents cross-request leakage.

---

## 3. Firestore Namespace Isolation Audit (`afa5b27`)

Centralized in [server/firestoreNamespace.js](file:///C:/Projects/lanzar/pythos/server/firestoreNamespace.js) (`resolveFirestoreNamespaces()`, failing closed on invalid `PYTHOS_ENV`):

| Source File | Function / Operation | Firestore Path | Student-Associated | Respects `PYTHOS_ENV` | Isolation Enforcement |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `server/firestoreService.js` | `anchorRef()`, `ensurePythosNamespace()`, `saveBugReport()`, `getBugReport()`, `listBugReports()`, `updateBugReportReview()`, `deleteBugReport()`, `saveConfig()`, `getConfig()` | `pythos/{app \| app_staging}/...` | Partial (reporter UID) | **Yes** | Resolved dynamically via `getAnchorDocName()`. |
| `server/firestoreService.js` | `saveLanzarAccount()`, `getLanzarAccountByEmail()`, `getLanzarAccountByUid()`, `deleteLanzarAccount()` | `pythos/{app \| app_staging}/lanzar_id_accounts/...` | **Yes** | **Yes** | Resolved dynamically via `getAnchorDocName()`. |
| `server/firestoreService.js` | `saveMailingListConsent()`, `getMailingListConsentByEmail()`, `deleteMailingListConsent()` | `pythos/{app \| app_staging}/mailing_list_consents/...` | **Yes** | **Yes** | Resolved dynamically via `getAnchorDocName()`. |
| `server/firestoreService.js` | `deleteUserChats(uid)` | `users/{uid}/{pythos_chats \| pythos_chats_staging}` | **Yes** | **Yes** | Uses `getChatsCollectionName()`; skips deleting root `users/{uid}` doc when `isStagingEnvironment()` is true. |
| `server/memoryService.js` | `memoryRootRef(uid)` (reads, writes, `items`, `extraction_queue`, `deleteAllStudentMemories`) | `users/{uid}/{pythos_memory \| pythos_memory_staging}/...` | **Yes** | **Yes** | Resolved dynamically via `getMemoryCollectionName()`. |
| `server/learningStore.js` | `learningColRef(uid)` (concept mastery, learning records) | `users/{uid}/{pythos_learning \| pythos_learning_staging}/...` | **Yes** | **Yes** | Resolved dynamically via `getLearningCollectionName()`. |
| `server/toolController.js` | `search_conversations` tool query | `users/{uid}/{pythos_chats \| pythos_chats_staging}` | **Yes** | **Yes** | Uses `getChatsCollectionName()`. |
| `server/firebaseAdmin.js` | `isFirestoreAdmin(uid)` | `admins/{uid}` (read-only) | No (admin ACL) | N/A | Read-only ACL aligned with Security Rules. |
| `server/lanzarIdService.js` | `syncLanzarAccountToFirebaseAuth()`, `resolveCanonicalIdentity()`, `getIdentityDocRef()` | `{users \| users_staging}/{uid}` | **Yes** | **Yes** | Isolated via `getIdentityCollectionName()` (`0237ffa`). Production `users/{uid}` is never read, written, merged, or deleted under `PYTHOS_ENV=staging`. |

- **Automated Namespace & Identity Isolation Verification:**
  - [test/test-firestore-namespace-isolation.js](file:///C:/Projects/lanzar/pythos/test/test-firestore-namespace-isolation.js) (**4/4 PASSED**): verified staging reads/writes/updates/deletes resolve exclusively to `app_staging` and `*_staging` collections, production preserves `app` / `pythos_*`, and invalid `PYTHOS_ENV` fails closed.
  - [test/test-lanzar-id-namespace-isolation.js](file:///C:/Projects/lanzar/pythos/test/test-lanzar-id-namespace-isolation.js) (**5/5 PASSED**) & [test/test-lanzar-secret-lifecycle.js](file:///C:/Projects/lanzar/pythos/test/test-lanzar-secret-lifecycle.js) (**8/8 PASSED**): verified `users_staging/{uid}` isolation, zero cross-environment leakage, and cryptographic token lifecycle.
- **Shared Firebase Project Assessment (`lanzar-95ae3`):** Logical collection namespacing (`app_staging`, `*_staging`) is sufficient for controlled staging validation with isolated `p21_staging_*` test UIDs, **but does not provide the cryptographic/IAM boundary of a separate Firebase project and service account**. Dedicated Firebase project migration is recommended before opening staging to untrusted testers.
