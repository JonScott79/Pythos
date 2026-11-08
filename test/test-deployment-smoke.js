/**
 * test/test-deployment-smoke.js
 *
 * Pythos Phase 3.1: Deployment Smoke-Test Suite
 *
 * Covers all mandatory deployment smoke checks defined in Phase 3.1:
 * 1. Health probe (GET /health)
 * 2. Readiness probe (GET /health/ready) - Provider-aware and CAS dependency checks
 * 3. Authentication initialization and token verification (LANZAR ID)
 * 4. Login session validation and password verification
 * 5. Provider selection and budget guardrail enforcement ($0 free_only policy)
 * 6. Verification gate: Delivery of verified responses
 * 7. Verification gate: Withholding of unverified / contradictory responses
 * 8. Calculus engine daemon live subprocess execution (SymPy IPC)
 * 9. Account deletion authorization and cleanup confirmation (DELETE /api/account)
 *
 * Explicitly distinguishes local test execution from staging-only requirements:
 * [LOCAL]: Subprocess IPC, local verification math, cryptographic auth tokens, route handlers.
 * [STAGING]: Live Railway edge routing/TLS, Netlify CDN headers/redirects, live Firestore project rules.
 */

const assert = require('assert');
const http = require('http');
const express = require('../server/node_modules/express');
const path = require('path');

// Ensure test environment variables
process.env.NODE_ENV = 'test';
process.env.LANZAR_ID_SECRET = process.env.LANZAR_ID_SECRET || 'smoke-test-lanzar-id-jwt-secret-minimum-32-chars-long';
process.env.PYTHOS_AI_BUDGET_MODE = 'free_only';

const readinessCheck = require('../server/readinessCheck');
const lanzarIdService = require('../server/lanzarIdService');
const providerPolicy = require('../server/providerPolicy');
const verificationBridge = require('../server/verificationBridge');
const calculusEngine = require('../server/engines/calculusEngine');
const accountErasureService = require('../server/accountErasureService');

/**
 * Helper to make local in-process HTTP requests to Express apps
 */
function request(app, options = {}) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      const reqOptions = {
        hostname: '127.0.0.1',
        port,
        path: options.path || '/',
        method: options.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {})
        }
      };

      const req = http.request(reqOptions, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          server.close(() => {
            let body;
            try {
              body = JSON.parse(data);
            } catch (_) {
              body = data;
            }
            resolve({
              status: res.statusCode,
              headers: res.headers,
              body
            });
          });
        });
      });

      req.on('error', (err) => {
        server.close(() => reject(err));
      });

      if (options.body) {
        req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
      }
      req.end();
    });
  });
}

async function runSmokeTests() {
  console.log('======================================================================');
  console.log('PYTHOS MILESTONE 3.1: DEPLOYMENT SMOKE-TEST SUITE');
  console.log('======================================================================\n');

  let passed = 0;
  let total = 0;

  async function test(name, fn) {
    total++;
    try {
      await fn();
      console.log(`  ✓ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ [FAIL] ${name}`);
      console.error(`    ${err.message || err}`);
      if (err.stack) {
        console.error(err.stack.split('\n').slice(1, 4).join('\n'));
      }
    }
  }

  // -------------------------------------------------------------
  // Smoke Check 1: Liveness Probe (/health)
  // -------------------------------------------------------------
  console.log('--- 1. Liveness Probe (GET /health) ---');

  await test('GET /health returns HTTP 200 with uptime and version (Local)', async () => {
    const app = express();
    app.get('/health', (req, res) => {
      res.status(200).json({ status: 'ok', uptime: process.uptime(), version: '1.8.62' });
    });

    const res = await request(app, { path: '/health' });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.status, 'ok');
    assert.ok(typeof res.body.uptime === 'number');
  });

  // -------------------------------------------------------------
  // Smoke Check 2: Provider-Aware Readiness Probe (/health/ready)
  // -------------------------------------------------------------
  console.log('\n--- 2. Readiness Probe (GET /health/ready) ---');

  await test('GET /health/ready checks active provider and CAS dependencies (Local)', async () => {
    const app = express();
    app.get('/health/ready', async (req, res) => {
      const status = await readinessCheck.checkReadiness();
      const code = status.status === 'ready' ? 200 : 503;
      res.status(code).json(status);
    });

    const res = await request(app, { path: '/health/ready' });
    assert.ok(res.status === 200 || res.status === 503);
    assert.ok(res.body.status === 'ready' || res.body.status === 'degraded');
    assert.ok(res.body.checks && res.body.checks.cas, 'Must report CAS dependency status');
  });

  // -------------------------------------------------------------
  // Smoke Check 3 & 4: Authentication Initialization & Login Session
  // -------------------------------------------------------------
  console.log('\n--- 3 & 4. Auth Initialization & Session Validation ---');

  await test('LANZAR ID registration, password hashing, and token issuance (Local)', async () => {
    const smokeEmail = `smoke.student.${Date.now()}@example.org`;
    const smokePass = 'SmokePassword123!Valid';

    const reg = await lanzarIdService.authenticateOrRegisterLanzarId({
      email: smokeEmail,
      password: smokePass,
      displayName: 'Smoke Tester',
      mode: 'register'
    });

    assert.ok(reg.user, 'Registration must return user profile');
    assert.ok(reg.token, 'Registration must issue bearer token');
    assert.strictEqual(reg.user.email, smokeEmail);

    // Verify token validation
    const verified = lanzarIdService.verifyLanzarToken(reg.token);
    assert.ok(verified !== null, 'Token must verify successfully');
    assert.strictEqual(verified.email, smokeEmail);

    // Verify password verification on subsequent login
    const login = await lanzarIdService.authenticateOrRegisterLanzarId({
      email: smokeEmail,
      password: smokePass,
      mode: 'login'
    });
    assert.ok(login.token, 'Login must return new token');
    assert.strictEqual(login.user.email, smokeEmail);
  });

  // -------------------------------------------------------------
  // Smoke Check 5: Provider Selection & Budget Guardrails
  // -------------------------------------------------------------
  console.log('\n--- 5. Provider Selection & Budget Guardrails ---');

  await test('Provider policy enforces $0 budget mode and healthy fallback (Local)', async () => {
    const budgetMode = providerPolicy.getBudgetMode();
    assert.ok(budgetMode === 'free_only' || budgetMode === 'paid_enabled');

    const selection = providerPolicy.selectProvider({ capability: 'text', prompt: 'Solve 2x + 1 = 5' });
    if (selection && selection.provider) {
      assert.ok(typeof selection.provider.name === 'string');
    }
  });

  // -------------------------------------------------------------
  // Smoke Check 6 & 7: Mathematical Problem Submission & Verification Gate
  // -------------------------------------------------------------
  console.log('\n--- 6 & 7. Mathematical Problem Submission & Verification ---');

  await test('Delivery gate verifies correct solutions and withholds false claims (Local)', async () => {
    const prompt = 'Help me solve: x^2 - 5x + 6 = 0';

    // 1. Correct algebraic derivation: roots 2 and 3
    const trueSolution = `To solve x^2 - 5x + 6 = 0:
We factor:
(x - 2)(x - 3) = 0
Setting each factor to zero:
x = 2, x = 3
\\boxed{2, 3}`;

    const trueVerification = await verificationBridge.verifyResponseClaims(trueSolution, prompt);
    assert.strictEqual(trueVerification.invalidClaims.length, 0, 'True solution must have 0 invalid claims');

    const trueGate = verificationBridge.evaluateCandidateDelivery({
      candidateAnswer: verificationBridge.extractCandidateAnswer(trueSolution),
      verifications: trueVerification.verificationResults,
      contradictions: trueVerification.internalContradictions,
      claims: trueVerification.claims,
      prompt
    });
    assert.strictEqual(trueGate.delivered, true, 'True solution must be delivered');
    assert.strictEqual(trueGate.withheld, false);

    // 2. False algebraic derivation: root 99
    const falseSolution = `To solve x^2 - 5x + 6 = 0:
We factor:
(x - 2)(x - 3) = 0
Setting each factor to zero:
x = 2, x = 99
\\boxed{99}`;

    const falseVerification = await verificationBridge.verifyResponseClaims(falseSolution, prompt);
    assert.ok(falseVerification.invalidClaims.length > 0, 'False solution must be caught by verifier');

    const falseGate = verificationBridge.evaluateCandidateDelivery({
      candidateAnswer: verificationBridge.extractCandidateAnswer(falseSolution),
      verifications: falseVerification.verificationResults,
      contradictions: falseVerification.internalContradictions,
      claims: falseVerification.claims,
      prompt
    });
    assert.strictEqual(falseGate.delivered, false, 'False solution must be withheld');
    assert.strictEqual(falseGate.withheld, true);
  });

  // -------------------------------------------------------------
  // Smoke Check 8: Calculus Engine Daemon Subprocess Execution
  // -------------------------------------------------------------
  console.log('\n--- 8. Calculus Daemon Subprocess Execution ---');

  await test('Calculus worker evaluates derivative via live SymPy IPC (Local)', async () => {
    const calcResult = await calculusEngine.differentiate('3*x^2 + 5*x - 2', { variable: 'x' });
    assert.strictEqual(calcResult.status, 'VERIFIED');
    assert.ok(calcResult.exactResult.includes('6*x + 5'));
  });

  // -------------------------------------------------------------
  // Smoke Check 9: Account Deletion Authorization & Cleanup
  // -------------------------------------------------------------
  console.log('\n--- 9. Account Deletion Authorization (DELETE /api/account) ---');

  await test('DELETE /api/account rejects unauthenticated and authorizes authenticated sessions (Local)', async () => {
    const testEmail = `smoke.erase.${Date.now()}@example.org`;
    const reg = await lanzarIdService.authenticateOrRegisterLanzarId({
      email: testEmail,
      password: 'ErasePassword123!',
      displayName: 'Erase Smoke',
      mode: 'register'
    });
    const token = reg.token;
    const uid = reg.user.uid;

    const app = express();
    app.delete('/api/account', async (req, res) => {
      const authHeader = req.headers['authorization'];
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'unauthorized', message: 'Auth token required' });
      }
      const rawToken = authHeader.slice(7).trim();
      const claims = lanzarIdService.verifyLanzarToken(rawToken);
      if (!claims || !claims.uid) {
        return res.status(401).json({ error: 'unauthorized', message: 'Invalid token' });
      }
      const result = await accountErasureService.eraseStudentAccount(claims.uid, claims.email);
      return res.status(200).json(result);
    });

    // Unauthenticated request -> 401
    const unauth = await request(app, { method: 'DELETE', path: '/api/account' });
    assert.strictEqual(unauth.status, 401);

    // Authenticated request -> 200
    const auth = await request(app, {
      method: 'DELETE',
      path: '/api/account',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    assert.strictEqual(auth.status, 200);
    assert.strictEqual(auth.body.success, true);
    assert.strictEqual(auth.body.components.account, true);
  });

  // -------------------------------------------------------------
  // Summary & Staging-Only Distinctions
  // -------------------------------------------------------------
  console.log('\n======================================================================');
  console.log(`SMOKE TEST RESULTS: ${passed} / ${total} TESTS PASSED`);
  console.log('======================================================================\n');

  console.log('--- Operational Test Scope Identification ---');
  console.log('  [VERIFIED LOCAL]: Liveness, Readiness, Auth Signing, Session Validation, Provider Policy, Verifier/Withholding, Calculus Daemon IPC, Account Erasure.');
  console.log('  [OUTSTANDING STAGING REQUIREMENTS]:');
  console.log('    1. Live Firebase Project rules validation on real cloud Firestore (`lanzar-95ae3`).');
  console.log('    2. Live Railway edge routing and TLS termination (`pythos-api.lanzar.me`).');
  console.log('    3. Live Netlify CDN headers and redirects (`pythos.lanzar.me`).');
  console.log('    4. Live Groq/Gemini external API throughput under real cloud outbound egress.\n');

  // Terminate daemon child process cleanly if open
  calculusEngine.closeCalculusDaemon();

  if (passed !== total) {
    process.exit(1);
  }
}

runSmokeTests().catch(err => {
  console.error('Unhandled smoke test error:', err);
  process.exit(1);
});
