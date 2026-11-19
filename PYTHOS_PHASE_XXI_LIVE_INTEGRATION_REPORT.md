# PYTHOS — PHASE XXI LIVE INTEGRATION REPORT

**Railway Project:** `pythos-staging` (`ab78d55a-6e25-421d-92a8-e298005f6b58`)  
**Environment:** `production` (`3f66d4e6-b187-4d70-95fc-0928d22bd7f7` inside `pythos-staging`)  
**Service:** `Pythos` (`f6c92158-3f0d-40db-b27c-ccdd4d40b198`)  
**Deployed Commit:** `47bda47` (`staging/specialist-engines-integration`)  
**Deployment ID:** `9ca4c655-ec86-482b-b8f2-223817ae9698` `[SUCCESS]`  
**Staging Domain:** `https://pythos-production-c45f.up.railway.app`

---

## 1. Live Health, Auth & API Validation (`9ca4c655-ec86-482b-b8f2-223817ae9698`)

| Check | Status | Latency / Details |
| :--- | :--- | :--- |
| `GET /health` | **PASS (Live)** | `200 OK` — `{"status":"ok","service":"pythos-api","version":"1.8.65"}` |
| `GET /health/ready` | **PASS (Live)** | `200 OK` — `llm: groq`, `cas: sympy` |
| `GET /api/memory` (no auth / invalid token) | **PASS (Live)** | `401` / `401` |
| `POST /api/auth/lanzar/session` (isolated `p21_staging_*` register) | **PASS (Live)** | `200 OK` — signed `lanzar.` token issued (`uid=lanzar_2f59a1365373ad18b7f7`) |
| `GET /api/auth/lanzar/verify` | **PASS (Live)** | `200 OK` — `status: "ok"` |
| `GET /api/memory` (authenticated) | **PASS (Live)** | `200 OK` |
| `DELETE /api/account` (cleanup) | **PASS (Live)** | `200 OK` — `account/mailingConsent/learningData/memories/chatHistory` erased (`errors: []`) |

---

## 2. Live Groq LLM & Deterministic Verification Probe

| Test ID | Prompt Category | Model / Engine | HTTP | Latency | Outcome |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `LIVE-ARITH` | Percentage (`72/120`) | `pythos-deterministic-router` | 200 | 132.6ms | Delivered `\frac{72}{120} = 60%` |
| `LIVE-ALG` | Linear Eq (`3x + 7 = 22`) | `openai/gpt-oss-120b` | 200 | 1116.0ms | Fail-closed / Socratic gate |
| `LIVE-GEOM-IMP` | Impossible Right Triangle (`leg 10, hyp 6`) | `openai/gpt-oss-120b` | 200 | 1124.8ms | Explained Euclidean hypotenuse constraint |
| `LIVE-DERIV` | Derivative at Point (`x^3+2x` at `x=2`) | `openai/gpt-oss-120b` + SymPy | 200 | 2416.5ms | Delivered `3*x**2 + 2` and `14` |
| `LIVE-INDEF` | Indefinite Integral (`2x dx`) | `openai/gpt-oss-120b` | 200 | 1384.8ms | Guided / verified response |
| `LIVE-DEF` | Definite Integral (`3t^2`, `0..2`) | `openai/gpt-oss-120b` + SymPy | 200 | 1212.5ms | Verified derivation |
| `LIVE-AMBIG` | Ambiguous Notation (`1/2x`) | `pythos-deterministic-router` | 200 | 119.3ms | Flagged ambiguous division binding |
| `LIVE-MAL` | Malformed Input (`x^2 + * / 3`) | `openai/gpt-oss-120b` | 200 | 1150.3ms | Rejected invalid step safely |
| `LIVE-CONF` | Student Confusion (`I am totally lost`) | `openai/gpt-oss-120b` | 200 | 1012.2ms | Adapted step-by-step scaffolding |
| `CONC-4` | 4 Concurrent SymPy Integrals (`/api/chat`) | `pythos-staging` worker pool | 200 (4/4) | 496.9ms total | `4/4` completed cleanly |
