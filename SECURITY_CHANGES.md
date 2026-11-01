# Pythos AI — Security Remediation & Hardening Report (`SECURITY_CHANGES.md`)

**Baseline:** `v1.8.52` (commit `181f5f2`)  
**Remediation Target:** `v1.8.53` (Phases 0 & 1)  
**Test Verification Suites:** `test-phase0-security.js` (52/52 passed), `test-phase1-backend-protection.js` (12/12 passed), `npm audit` (0 vulnerabilities)

---

## 1. Phase 0 — Emergency Security Verification & Container Hardening

### 0.1 Express & Static Server Filesystem Containment
- **Finding:** `server/server.js` previously mounted `app.use(express.static(path.join(__dirname, '..')))`, which exposed the parent directory of `server/`. In the `Dockerfile` layout (`WORKDIR /app` where `server/*` was copied to `/app`), `path.join('/app', '..')` resolved to `/`, exposing `/etc/passwd`, `/app/server.js`, `/app/package.json`, and `/reports/*`.
- **Remediation:**
  - Replaced broad parent-directory serving in `server/server.js` with an explicit allowlist of public static directories (`/assets`, `/js`, `/vizEngine`, `/about`, `/algebra`, `/calculus`, `/physics`, `/subjects`, `/tools`, `/validation`) and explicit root public files (`/index.html`, `/changelog.html`, `/nonprofit.html`, `/license.html`, `/privacy.html`, `/accessibility.html`, `/errors.html`, `/manifest.json`, `/robots.txt`, `/sitemap.xml`, `/llms.txt`).
  - Added `isForbiddenStaticRequest()` middleware in `server/server.js` and `isBlockedRelativePath()` in `staticServer.js` that immediately return HTTP `404` for any path traversal (`..`, `%2e%2e`), dotfile (`.env`, `.git`), or backend/report/test path (`/etc/*`, `/proc/*`, `/app/*`, `/server/*`, `/reports/*`, `/package.json`, `/Dockerfile`).
- **Verification:** `test-phase0-security.js` confirms `GET /etc/passwd`, `GET /app/server.js`, `GET /server/server.js`, `GET /package.json`, `GET /reports/test.json`, and `GET /.env` all return `404`, while legitimate public assets return `200`.

### 0.2 Strict CORS Enforcement & Preflight Validation
- **Finding:** `server/server.js` previously fell back to `return callback(null, true)` for unrecognized origins and used unconditional `app.options('*', cors())`.
- **Remediation:**
  - Enforced strict origin checking against `ALLOWED_ORIGINS` (`https://pythos.lanzar.me`, `https://lanzar.me`, `https://www.lanzar.me`, `https://ai.lanzar.me`, and local development ports).
  - Unapproved origins are rejected with HTTP `403` (`cors_origin_forbidden`) on both standard and `OPTIONS` preflight requests, with `Vary: Origin` set on all responses.

### 0.3 Container & Security Header Hardening
- **Remediation:**
  - Disabled `x-powered-by` in Express (`app.disable('x-powered-by')`).
  - Updated `Dockerfile` to set ownership and run under non-root `USER node`.
  - Configured `Strict-Transport-Security`, `Permissions-Policy`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy`, and `Content-Security-Policy` across `server/server.js`, `staticServer.js`, and `netlify.toml`.

---

## 2. Phase 1 — Backend Security & Resource Protection

### 1.1 Route-Scoped Request Body Size Limits
- Replaced the global `express.json({ limit: '15mb' })` with `express.json({ limit: '256kb' })` by default, and scoped the `15mb` parser exclusively to `POST /api/chat` for homework image attachments. Oversized payloads on `/api/report` or other routes return HTTP `413`.

### 1.2 Bounded Inference Concurrency Queue & Disconnect Cleanup
- Enhanced `ConcurrencyLimiter` in `server/concurrencyLimiter.js` with `maxQueueSize` (default `25`). When the queue is full, new requests fail fast with HTTP `503` (`queue_full`) and `Retry-After: 5`.
- Bound `req.on('close')` to abort the active `AbortController` and release concurrency slots when a client disconnects mid-generation.

### 1.3 `/api/report` Abuse Prevention & Async Storage
- Added per-IP rate limiting (`10` reports per 15-minute window, returning HTTP `429` on excess), strict field length caps, filename sanitization (`sanitizeSafeFilename`), containment verification, and non-blocking `fs.promises.writeFile`.

### 1.4 Health Endpoint Sanitization & Admin Gating
- Public `GET /health` now returns only `{ status: 'ok', service: 'pythos-api', timestamp }`.
- Detailed diagnostics (model names, host topology, memory, queue depth, CAS telemetry) are moved to `GET /admin/status`, protected by `ADMIN_STATUS_TOKEN` Bearer authentication with `crypto.timingSafeEqual`.

### 1.5 Dependency Vulnerability Remediation
- Updated `package-lock.json` in both root and `server/`. `npm audit` reports **0 vulnerabilities**.
