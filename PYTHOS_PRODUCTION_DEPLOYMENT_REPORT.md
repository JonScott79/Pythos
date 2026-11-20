# PYTHOS — PRODUCTION DEPLOYMENT REPORT (v1.8.65)

**Release Version:** `1.8.65`  
**Final Staging Commit Merged:** `ad090e3` (`staging/specialist-engines-integration`)  
**Production Branch (`master`) Commit:** `c3563ba`  
**Production Railway Project:** `Pythos` (`1f379db1-fd37-4125-b512-045d14dc056d`)  
**Production Service / Environment:** `0c0b7257-6de4-404d-a404-2f57c3328c80` / `production` (`3004439b-7de9-425f-bc2c-d86351feff65`)  
**Production Deployment ID:** `cae70c9d-8be3-436f-b520-752f44774981` **`[SUCCESS]`**  
**Production Domains:** `https://pythos-api.lanzar.me`, `https://pythos.lanzar.me`

---

## 1. Production Startup & Namespace Verification
- Container started cleanly on `pythos-backend@1.8.65`.
- `[FIREBASE ADMIN] Admin SDK initialized successfully.`
- `[FIRESTORE] Pythos namespace initialized → pythos/app` (production namespace preserved with `PYTHOS_ENV` unset).

---

## 2. Non-Destructive Production Smoke Tests (Observed Live)

| Check | Endpoint / Input | Observed Result |
| :--- | :--- | :--- |
| Frontend availability | `GET https://pythos.lanzar.me/` | **200 OK** |
| API health | `GET https://pythos-api.lanzar.me/health` | **200 OK** (`"version":"1.8.65"`) |
| API readiness | `GET https://pythos-api.lanzar.me/health/ready` | **200 OK** (`llm: groq`, `cas: sympy`) |
| Protected memory guard | `GET https://pythos-api.lanzar.me/api/memory` (no auth) | **401 Unauthorized** |
| Deterministic chat route | `POST /api/chat` (`What is 72/120 as a percentage?`) | **200 OK** (`pythos-deterministic-router`, `60%`) |
| Live Groq + SymPy chat route | `POST /api/chat` (`Find the derivative of x^3 + 2x at x = 2.`) | **200 OK** (`openai/gpt-oss-120b`, `3*x**2 + 2`, `Evaluated at x = 2: 14`) |

*(No real student records were created, modified, or deleted during production smoke testing.)*
