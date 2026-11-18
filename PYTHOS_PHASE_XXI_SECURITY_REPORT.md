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
- **Firestore Staging Isolation (`c826280`):** `firestoreService.js` and `memoryService.js` isolate `PYTHOS_ENV=staging` writes to `pythos/app_staging` and `users/{uid}/pythos_memory_staging`.
