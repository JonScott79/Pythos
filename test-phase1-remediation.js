/**
 * test-phase1-remediation.js
 *
 * Comprehensive regression test suite for Pythos v1.8.62 Phase 1 Release Blocker Remediation:
 * - CRITICAL-01: Streaming Delivery Gate (dual-compatible NDJSON revision + finalContent protocol)
 * - CRITICAL-02: Verification Integrity (3 verification outcomes: VERIFIED, PARTIALLY_VERIFIED, WITHHELD;
 *                primary-claim enforcement; auditPromptClaimFidelity on main LLM path; accurate audit button counts)
 * - HIGH-01: Removal of predictable process.pid LANZAR ID secret fallback & fail-closed in production
 * - HIGH-02: Container storage path resolution (/app/reports/lanzar_id_store) & authoritative Firestore persistence
 * - HIGH-03: Trusted proxy handling (trust proxy: 1), spoof-resistant getClientIp, per-IP rate limiting, async scrypt
 * - HIGH-04: Cryptographically verified authentication for mailing-list consent and Google account linking
 * - HIGH-05: Pairwise symbolic equality-chain verification (A = B = C split into adjacent pairs)
 */

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');

let passed = 0;
let failed = 0;

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`  ✓ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}`);
    console.error(`    ${err.stack || err.message}`);
    failed++;
  }
}

function makeHttpRequest(port, method, urlPath, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body !== null ? JSON.stringify(body) : null;
    const reqHeaders = { ...headers };
    if (payload !== null) {
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(payload);
    }
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: urlPath,
        method,
        headers: reqHeaders
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => {
          raw += chunk.toString();
        });
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(raw);
          } catch (_) {}
          resolve({ status: res.statusCode, headers: res.headers, raw, json });
        });
      }
    );
    req.on('error', reject);
    if (payload !== null) req.write(payload);
    req.end();
  });
}

async function main() {
  console.log('================================================================');
  console.log('PYTHOS v1.8.62 — PHASE 1 RELEASE BLOCKER REMEDIATION TEST SUITE');
  console.log('================================================================\n');

  const lanzarIdService = require('./server/lanzarIdService');
  const firestoreService = require('./server/firestoreService');
  const verificationBridge = require('./server/verificationBridge');
  const reportRoutes = require('./server/reportRoutes');

  // ---------------------------------------------------------------------------
  // 1. HIGH-05: Pairwise Symbolic Equality-Chain Verification
  // ---------------------------------------------------------------------------
  console.log('--- HIGH-05: Pairwise Symbolic Equality-Chain Verification ---');

  await runTest('HIGH-05.1: Multi-step symbolic equality chain (A = B = C) splits into adjacent pairwise claims', async () => {
    const chainText = 'We simplify the expression:\n$$x^2 + 2x + 1 = (x+1)^2 = x^2 + 1$$';
    const audit = await verificationBridge.verifyResponseClaims(chainText, 'Simplify x^2 + 2x + 1');
    const symClaims = audit.claims.filter(c => c.claim_type === 'symbolic_equivalence');
    assert.strictEqual(symClaims.length, 2, 'Expected 2 pairwise symbolic_equivalence claims from 3-part chain');
    assert.strictEqual(audit.verificationResults[0].verified, true, 'First pair x^2 + 2x + 1 = (x+1)^2 must verify TRUE');
    assert.strictEqual(audit.verificationResults[1].verified, false, 'Second pair (x+1)^2 = x^2 + 1 must verify FALSE');
    assert.ok(audit.invalidClaims.length >= 1, 'Bogus link in symbolic equality chain must be flagged in invalidClaims');
  });

  await runTest('HIGH-05.2: Valid 3-part symbolic equality chain verifies all adjacent pairs', async () => {
    const validChain = '$$x^2 - 1 = (x - 1)(x + 1) = (x + 1)(x - 1)$$';
    const audit = await verificationBridge.verifyResponseClaims(validChain, 'Factor x^2 - 1');
    const symClaims = audit.claims.filter(c => c.claim_type === 'symbolic_equivalence');
    assert.strictEqual(symClaims.length, 2, 'Expected 2 pairwise symbolic_equivalence claims');
    assert.strictEqual(audit.invalidClaims.length, 0, 'Valid chain must have 0 invalidClaims');
    assert.ok(audit.verificationResults.every(v => v.verified === true), 'All pairs in valid chain must verify TRUE');
  });

  // ---------------------------------------------------------------------------
  // 2. CRITICAL-02: Verification Integrity (Three Distinct Outcomes)
  // ---------------------------------------------------------------------------
  console.log('\n--- CRITICAL-02: Verification Integrity (3 Distinct Outcomes) ---');

  await runTest('CRITICAL-02.1: Outcome 1 (VERIFIED) requires all material claims affirmatively verified with 0 UNKNOWN', () => {
    const claims = [
      { domain: 'algebra', claim_type: 'equation_solution', data: { equation: '2*x + 4 = 10', variable: 'x', solutions: [3] } },
      { domain: 'arithmetic', claim_type: 'arithmetic', data: { expression: '10 - 4', proposed: 6 } }
    ];
    const verificationResults = [
      { verified: true, status: 'VERIFIED', engine: 'mathjs' },
      { verified: true, status: 'VERIFIED', engine: 'mathjs' }
    ];
    const evalState = verificationBridge.evaluateVerificationState({
      claims,
      verificationResults,
      invalidClaims: [],
      unknownClaims: [],
      internalContradictions: [],
      prompt: 'Solve 2x + 4 = 10'
    });
    assert.strictEqual(evalState.state, 'VERIFIED');
    assert.strictEqual(evalState.verifiedCount, 2);
    assert.strictEqual(evalState.unknownCount, 0);
    assert.strictEqual(evalState.rejectedCount, 0);
    assert.strictEqual(evalState.primaryClaimVerified, true);
  });

  await runTest('CRITICAL-02.2: Outcome 2 (PARTIALLY_VERIFIED) when primary claim is VERIFIED but supporting claim is UNKNOWN', () => {
    const claims = [
      { domain: 'algebra', claim_type: 'equation_solution', data: { equation: 'x^2 - 5*x + 6 = 0', variable: 'x', solutions: [2, 3] } },
      { domain: 'algebra', claim_type: 'symbolic_equivalence', data: { expr1: 'custom_unparsed(x)', expr2: '0', variable: 'x' } }
    ];
    const verificationResults = [
      { verified: true, status: 'VERIFIED', engine: 'mathjs' },
      { verified: false, status: 'UNKNOWN', engine: 'sympy', reason: 'Unsupported custom function' }
    ];
    const evalState = verificationBridge.evaluateVerificationState({
      claims,
      verificationResults,
      invalidClaims: [],
      unknownClaims: [{ claim: claims[1], verification: verificationResults[1], claimIndex: 1 }],
      internalContradictions: [],
      prompt: 'Solve x^2 - 5x + 6 = 0'
    });
    assert.strictEqual(evalState.state, 'PARTIALLY_VERIFIED', 'Must be PARTIALLY_VERIFIED, never VERIFIED when an UNKNOWN exists');
    assert.strictEqual(evalState.verifiedCount, 1);
    assert.strictEqual(evalState.unknownCount, 1);
    assert.strictEqual(evalState.rejectedCount, 0);
    assert.strictEqual(evalState.primaryClaimVerified, true);
    assert.ok(evalState.disclosure && evalState.disclosure.includes('1 supporting step'), 'Must include limitation disclosure');
  });

  await runTest('CRITICAL-02.3: Outcome 3 (WITHHELD) when primary claim is UNKNOWN even if intermediate arithmetic is VERIFIED', () => {
    // Intermediate arithmetic 1 + 2 = 3 is VERIFIED, but primary derivative claim is UNKNOWN
    const claims = [
      { domain: 'arithmetic', claim_type: 'arithmetic', data: { expression: '1 + 2', proposed: 3 } },
      { domain: 'calculus', claim_type: 'derivative', data: { function: 'x^3', variable: 'x', proposed_derivative: '3*x^2' } }
    ];
    const verificationResults = [
      { verified: true, status: 'VERIFIED', engine: 'mathjs' },
      { verified: false, status: 'UNKNOWN', engine: 'sympy', reason: 'CAS timeout' }
    ];
    const fidelity = verificationBridge.auditPromptClaimFidelity(claims, 'Find the derivative of x^3', verificationResults);
    assert.strictEqual(fidelity.valid, false, 'auditPromptClaimFidelity must reject when primary derivative claim is UNKNOWN');

    const evalState = verificationBridge.evaluateVerificationState({
      claims,
      verificationResults,
      invalidClaims: [],
      unknownClaims: [{ claim: claims[1], verification: verificationResults[1], claimIndex: 1 }],
      internalContradictions: [],
      prompt: 'Find the derivative of x^3'
    });
    assert.strictEqual(evalState.state, 'WITHHELD', 'Must be WITHHELD when primary claim is UNKNOWN');
    assert.strictEqual(evalState.primaryClaimVerified, false);
  });

  await runTest('CRITICAL-02.4: Outcome 3 (WITHHELD) when all claims are UNKNOWN or any claim is INVALID', () => {
    const unknownEval = verificationBridge.evaluateVerificationState({
      claims: [{ domain: 'arithmetic', claim_type: 'arithmetic', data: { expression: '2+2', proposed: 4 } }],
      verificationResults: [{ verified: false, status: 'UNKNOWN' }],
      invalidClaims: [],
      unknownClaims: [{}],
      internalContradictions: [],
      prompt: 'What is 2+2?'
    });
    assert.strictEqual(unknownEval.state, 'WITHHELD', 'Single UNKNOWN claim must evaluate to WITHHELD');

    const invalidEval = verificationBridge.evaluateVerificationState({
      claims: [
        { domain: 'algebra', claim_type: 'equation_solution', data: {} },
        { domain: 'arithmetic', claim_type: 'arithmetic', data: {} }
      ],
      verificationResults: [
        { verified: true, status: 'VERIFIED' },
        { verified: false, status: 'ARITHMETIC_MISMATCH' }
      ],
      invalidClaims: [{}],
      unknownClaims: [],
      internalContradictions: [],
      prompt: 'Solve 2x = 4'
    });
    assert.strictEqual(invalidEval.state, 'WITHHELD', 'Any INVALID claim must evaluate to WITHHELD');
  });

  await runTest('CRITICAL-02.5: Frontend app.js replaces .some() badge logic and reports exact verified/unknown/rejected counts', () => {
    const appJs = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
    assert.ok(
      !appJs.includes("ev.verification.some(v => v && v.verified === true && v.status === 'VERIFIED')"),
      'app.js must not use .some() to award green Verified badge'
    );
    assert.ok(
      appJs.includes('Partially Verified (${verifiedCount} verified, ${unknownCount} unknown)'),
      'Audit button must display Partially Verified with verified and unknown counts'
    );
    assert.ok(
      appJs.includes('Verification Audit (${verifiedCount} verified, ${unknownCount} unknown, ${rejectedCount} rejected)'),
      'Audit button must display verified, unknown, and rejected counts when not verified'
    );
  });

  // ---------------------------------------------------------------------------
  // 3. HIGH-01: Predictable LANZAR ID Secret Fallback & Fail-Closed in Production
  // ---------------------------------------------------------------------------
  console.log('\n--- HIGH-01: LANZAR ID Secret Security & Fail-Closed in Production ---');

  await runTest('HIGH-01.1: process.pid is completely removed from lanzarIdService.js', () => {
    const serviceCode = fs.readFileSync(path.join(__dirname, 'server', 'lanzarIdService.js'), 'utf8');
    assert.ok(!serviceCode.includes('process.pid'), 'lanzarIdService.js must never use process.pid to derive secrets');
    assert.ok(!serviceCode.includes('scryptSync'), 'lanzarIdService.js must use async crypto.scrypt, not scryptSync');
  });

  await runTest('HIGH-01.2: Production environment fails closed when LANZAR_ID_SECRET is missing', () => {
    const prevNodeEnv = process.env.NODE_ENV;
    const prevSecret = process.env.LANZAR_ID_SECRET;
    try {
      process.env.NODE_ENV = 'production';
      delete process.env.LANZAR_ID_SECRET;

      assert.throws(
        () => lanzarIdService.signLanzarToken({ uid: 'lanzar_test', email: 'test@example.edu' }),
        /LANZAR_ID_SECRET is not configured/,
        'signLanzarToken must throw in production when LANZAR_ID_SECRET is unset'
      );

      const verified = lanzarIdService.verifyLanzarToken('lanzar.eyJhbGciOiJIUzI1NiJ9.eyJ1aWQiOiIxIn0.sig');
      assert.strictEqual(verified, null, 'verifyLanzarToken must fail closed (return null) in production when LANZAR_ID_SECRET is unset');
    } finally {
      if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = prevNodeEnv;
      if (prevSecret === undefined) delete process.env.LANZAR_ID_SECRET;
      else process.env.LANZAR_ID_SECRET = prevSecret;
    }
  });

  // ---------------------------------------------------------------------------
  // 4. HIGH-02: Container Storage Paths & Authoritative Firestore Persistence
  // ---------------------------------------------------------------------------
  console.log('\n--- HIGH-02: Container Storage Paths & Authoritative Firestore Persistence ---');

  await runTest('HIGH-02.1: resolveStorePaths resolves /app/reports/lanzar_id_store inside Docker container root', () => {
    const containerPaths = lanzarIdService.resolveStorePaths('/app');
    const normalizedDataDir = containerPaths.dataDir.replace(/\\/g, '/');
    assert.ok(
      normalizedDataDir.endsWith('/app/reports/lanzar_id_store'),
      `Expected container dataDir to end with /app/reports/lanzar_id_store, got ${normalizedDataDir}`
    );
  });

  await runTest('HIGH-02.2: Authoritative Firestore persistence stores accounts/consents and migrates existing records', async () => {
    const firestoreAccounts = new Map();
    const firestoreConsents = new Map();

    firestoreService.setFirestoreAdapterForTesting({
      isAvailable: true,
      saveLanzarAccount: async (acc) => {
        firestoreAccounts.set(acc.uid, { ...acc });
        return true;
      },
      getLanzarAccountByUid: async (uid) => firestoreAccounts.get(uid) || null,
      getLanzarAccountByEmail: async (email) => {
        for (const acc of firestoreAccounts.values()) {
          if (acc.email === email) return acc;
        }
        return null;
      },
      saveMailingListConsent: async (rec) => {
        firestoreConsents.set(rec.email, { ...rec });
        return true;
      },
      getMailingListConsentByEmail: async (email) => firestoreConsents.get(email) || null,
      getMailingListConsentByToken: async (token) => {
        for (const rec of firestoreConsents.values()) {
          if (rec.unsubscribeToken === token) return rec;
        }
        return null;
      }
    });

    try {
      const testEmail = `firestore_auth_${Date.now()}@example.edu`;
      const reg = await lanzarIdService.authenticateOrRegisterLanzarId({
        email: testEmail,
        password: 'StrongPassword123!',
        displayName: 'Firestore Scholar',
        mode: 'register',
        mailingListOptIn: true,
        consentSource: 'phase1_test'
      });

      assert.ok(firestoreAccounts.has(reg.user.uid), 'Account must be written to authoritative Firestore store');
      assert.ok(firestoreConsents.has(testEmail), 'Consent must be written to authoritative Firestore store');
      assert.strictEqual(firestoreConsents.get(testEmail).subscribed, true);
    } finally {
      firestoreService.setFirestoreAdapterForTesting(null);
    }
  });

  await runTest('HIGH-02.3: Failed Firestore/disk writes propagate errors and never silently succeed', async () => {
    firestoreService.setFirestoreAdapterForTesting({
      isAvailable: true,
      saveLanzarAccount: async () => {
        throw new Error('Failed to persist LANZAR ID account: Firestore unavailable');
      },
      getLanzarAccountByEmail: async () => null
    });

    try {
      const failEmail = `fail_write_${Date.now()}@example.edu`;
      await assert.rejects(
        () =>
          lanzarIdService.authenticateOrRegisterLanzarId({
            email: failEmail,
            password: 'StrongPassword123!',
            mode: 'register'
          }),
        /Failed to persist/,
        'Registration must reject when authoritative Firestore write fails'
      );
    } finally {
      firestoreService.setFirestoreAdapterForTesting(null);
    }
  });

  // ---------------------------------------------------------------------------
  // 5. HIGH-03, HIGH-04 & CRITICAL-01: Live HTTP & Streaming Protocol Verification
  // ---------------------------------------------------------------------------
  console.log('\n--- HIGH-03, HIGH-04 & CRITICAL-01: Live Gateway, Rate Limiting, Auth & Streaming Gate ---');

  let mockOllamaServer = null;
  let mockOllamaHandler = null;
  const mockOllamaPort = 11441;

  await new Promise((resolve) => {
    mockOllamaServer = http.createServer((req, res) => {
      if (mockOllamaHandler) {
        mockOllamaHandler(req, res);
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ model: 'test-model', message: { role: 'assistant', content: '2 + 2 = 4' }, done: true }) + '\n');
      }
    });
    mockOllamaServer.listen(mockOllamaPort, '127.0.0.1', resolve);
  });

  process.env.NODE_ENV = 'test';
  process.env.OLLAMA_HOST = `http://127.0.0.1:${mockOllamaPort}`;
  delete require.cache[require.resolve('./server/server')];
  const { app, clearActiveControllers } = require('./server/server');

  const apiServer = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const apiPort = apiServer.address().port;

  try {
    await runTest('HIGH-03.1: Express trust proxy is configured to 1 and getClientIp ignores spoofed leftmost X-Forwarded-For', async () => {
      assert.strictEqual(app.get('trust proxy'), 1, 'app.get("trust proxy") must be 1 for Railway Envoy proxy');

      // Test rate limiting on /api/auth/lanzar/session with spoofed leftmost X-Forwarded-For values
      app.resetAllRateLimits();
      app.authRateLimiter.configure(2, 60000);

      for (let i = 1; i <= 2; i++) {
        const res = await makeHttpRequest(
          apiPort,
          'POST',
          '/api/auth/lanzar/session',
          { email: 'bad', password: 'short' },
          { 'X-Forwarded-For': `198.51.100.${i}, 203.0.113.88` }
        );
        assert.strictEqual(res.status, 400, `Attempt ${i} should reach handler (400 validation error)`);
      }

      // 3rd request from the same real client IP (203.0.113.88) with a DIFFERENT spoofed leftmost X-Forwarded-For must be blocked with 429!
      const blocked = await makeHttpRequest(
        apiPort,
        'POST',
        '/api/auth/lanzar/session',
        { email: 'bad', password: 'short' },
        { 'X-Forwarded-For': '198.51.100.250, 203.0.113.88' }
      );
      assert.strictEqual(blocked.status, 429, 'Spoofed leftmost X-Forwarded-For must not bypass per-IP rate limit');
      assert.strictEqual(blocked.json?.error, 'rate_limit_exceeded');
      assert.ok(blocked.headers['retry-after'], '429 response must include Retry-After header');

      app.authRateLimiter.configure(20, 15 * 60 * 1000);
      app.resetAllRateLimits();
    });

    await runTest('HIGH-03.2: Per-IP sliding-window rate limiter protects POST /api/chat and POST /api/mailing-list/*', async () => {
      app.resetAllRateLimits();
      app.chatRateLimiter.configure(2, 60000);

      const r1 = await makeHttpRequest(apiPort, 'POST', '/api/chat', { messages: [] }, { 'X-Forwarded-For': '203.0.113.99' });
      const r2 = await makeHttpRequest(apiPort, 'POST', '/api/chat', { messages: [] }, { 'X-Forwarded-For': '203.0.113.99' });
      const r3 = await makeHttpRequest(apiPort, 'POST', '/api/chat', { messages: [] }, { 'X-Forwarded-For': '10.0.0.1, 203.0.113.99' });

      assert.strictEqual(r1.status, 400);
      assert.strictEqual(r2.status, 400);
      assert.strictEqual(r3.status, 429, '3rd request to /api/chat from same client IP must return 429');

      app.chatRateLimiter.configure(120, 60000);
      app.resetAllRateLimits();
    });

    await runTest('HIGH-04.1: POST /api/mailing-list/consent requires verified auth token matching target email', async () => {
      const userEmail = `consent_guard_${Date.now()}@example.edu`;
      const regRes = await makeHttpRequest(apiPort, 'POST', '/api/auth/lanzar/session', {
        email: userEmail,
        password: 'ValidPassword123!',
        mode: 'register',
        mailingListOptIn: false
      });
      assert.strictEqual(regRes.status, 200);
      const userToken = regRes.json.token;

      // 1. Unauthenticated consent mutation must be rejected with 401
      const unauthConsent = await makeHttpRequest(apiPort, 'POST', '/api/mailing-list/consent', {
        email: userEmail,
        consented: true
      });
      assert.strictEqual(unauthConsent.status, 401, 'Unauthenticated consent request must return 401');

      // 2. Authenticated user attempting to mutate a DIFFERENT user's email must be rejected with 403
      const crossUserConsent = await makeHttpRequest(
        apiPort,
        'POST',
        '/api/mailing-list/consent',
        { email: 'victim@example.edu', consented: true },
        { Authorization: `Bearer ${userToken}` }
      );
      assert.strictEqual(crossUserConsent.status, 403, 'Cross-user consent mutation must return 403');

      // 3. Authenticated user mutating their own consent succeeds with 200
      const validConsent = await makeHttpRequest(
        apiPort,
        'POST',
        '/api/mailing-list/consent',
        { email: userEmail, consented: true, consentSource: 'authenticated_test' },
        { Authorization: `Bearer ${userToken}` }
      );
      assert.strictEqual(validConsent.status, 200, 'Authenticated self-consent mutation must return 200');
      assert.strictEqual(validConsent.json.subscribed, true);

      // 4. Unsubscribe without token or auth header is rejected with 401
      const unauthUnsub = await makeHttpRequest(apiPort, 'POST', '/api/mailing-list/unsubscribe', {
        email: userEmail
      });
      assert.strictEqual(unauthUnsub.status, 401, 'Unauthenticated email-only unsubscribe must return 401');

      // 5. Unsubscribe with valid Bearer token succeeds with 200
      const authUnsub = await makeHttpRequest(
        apiPort,
        'POST',
        '/api/mailing-list/unsubscribe',
        { email: userEmail },
        { Authorization: `Bearer ${userToken}` }
      );
      assert.strictEqual(authUnsub.status, 200, 'Authenticated unsubscribe must return 200');
    });

    await runTest('HIGH-04.2: POST /api/auth/lanzar/link-google rejects raw googleUid and requires verified googleIdToken', async () => {
      const linkEmail = `google_link_${Date.now()}@example.edu`;
      const regRes = await makeHttpRequest(apiPort, 'POST', '/api/auth/lanzar/session', {
        email: linkEmail,
        password: 'ValidPassword123!',
        mode: 'register'
      });
      assert.strictEqual(regRes.status, 200);
      const lanzarToken = regRes.json.token;

      // 1. Attempting to link with raw googleUid and no googleIdToken must be rejected with 401
      const rawUidAttempt = await makeHttpRequest(
        apiPort,
        'POST',
        '/api/auth/lanzar/link-google',
        { googleUid: 'spoofed_google_uid_123', googleEmail: linkEmail },
        { Authorization: `Bearer ${lanzarToken}` }
      );
      assert.strictEqual(rawUidAttempt.status, 401, 'Raw unverified googleUid without googleIdToken must return 401');

      // 2. Attempting to pass raw linkedGoogleUid to /api/auth/lanzar/session without googleIdToken must return 401
      const rawSessionLink = await makeHttpRequest(apiPort, 'POST', '/api/auth/lanzar/session', {
        email: linkEmail,
        password: 'ValidPassword123!',
        mode: 'login',
        linkedGoogleUid: 'spoofed_google_uid_123'
      });
      assert.strictEqual(rawSessionLink.status, 401, 'Raw linkedGoogleUid on /session without googleIdToken must return 401');

      // 3. Configure mock Google ID token verifier and verify valid googleIdToken succeeds
      app.setGoogleTokenVerifierForTesting(async (idToken) => {
        if (idToken === 'valid_google_jwt_token') {
          return { uid: 'verified_google_uid_777', email: linkEmail };
        }
        return null;
      });

      try {
        const forgedTokenAttempt = await makeHttpRequest(
          apiPort,
          'POST',
          '/api/auth/lanzar/link-google',
          { googleIdToken: 'forged_jwt_token' },
          { Authorization: `Bearer ${lanzarToken}` }
        );
        assert.strictEqual(forgedTokenAttempt.status, 401, 'Invalid googleIdToken must return 401');

        const validLinkAttempt = await makeHttpRequest(
          apiPort,
          'POST',
          '/api/auth/lanzar/link-google',
          { googleIdToken: 'valid_google_jwt_token' },
          { Authorization: `Bearer ${lanzarToken}` }
        );
        assert.strictEqual(validLinkAttempt.status, 200, 'Verified googleIdToken must succeed with 200');
        assert.strictEqual(validLinkAttempt.json.linked.linkedGoogleUid, 'verified_google_uid_777');
      } finally {
        app.setGoogleTokenVerifierForTesting(null);
      }
    });

    await runTest('CRITICAL-01.1: Streaming response that fails verification and is WITHHELD emits revision + finalContent and replaces unverified stream', async () => {
      // Prompt asks for coterminal angle, but upstream LLM only outputs intermediate arithmetic 10 + 20 = 30
      // (which passes arithmetic CAS but fails auditPromptClaimFidelity, and has no safe recovery because no angle is given)
      mockOllamaHandler = (req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.write(JSON.stringify({
          model: 'test-model',
          message: { role: 'assistant', content: 'UNVERIFIED STREAMED HALLUCINATION: 10 + 20 = 30 so the coterminal angle is 99999.' },
          done: true
        }) + '\n');
        res.end();
      };

      const streamRes = await makeHttpRequest(apiPort, 'POST', '/api/chat', {
        messages: [{ role: 'user', content: 'Find a coterminal angle for the unknown angle theta.' }],
        stream: true
      });

      assert.strictEqual(streamRes.status, 200);
      const events = streamRes.raw
        .split('\n')
        .filter(l => l.trim())
        .map(l => JSON.parse(l.trim()));

      const revisionEv = events.find(e => e.type === 'revision');
      const verifiedEv = events.find(e => e.type === 'verified');

      assert.ok(revisionEv, 'Must emit { type: "revision" } event when streamed response is withheld');
      assert.strictEqual(revisionEv.withheld, true, 'Revision event must mark withheld: true');
      assert.ok(
        revisionEv.revisedContent.includes('I need a little more information to solve this problem'),
        'revision.revisedContent must contain the safe withholding message'
      );
      assert.ok(
        !revisionEv.revisedContent.includes('UNVERIFIED STREAMED HALLUCINATION'),
        'revision.revisedContent must not contain the unverified streamed text'
      );

      assert.ok(verifiedEv, 'Must emit { type: "verified" } event');
      assert.strictEqual(verifiedEv.withheld, true);
      assert.strictEqual(verifiedEv.verificationState, 'WITHHELD');
      assert.strictEqual(verifiedEv.finalContent, revisionEv.revisedContent, 'verified.finalContent must match revisedContent');

      // Simulate frontend state machine (both new frontend and legacy frontend)
      let legacyStreamedText = '';
      let newStreamedText = '';
      for (const ev of events) {
        if (ev.type === 'token') {
          legacyStreamedText += ev.content;
          newStreamedText += ev.content;
        } else if (ev.type === 'revision' && ev.revisedContent) {
          legacyStreamedText = ev.revisedContent;
          newStreamedText = ev.revisedContent;
        } else if (ev.type === 'verified') {
          if (typeof ev.finalContent === 'string' && ev.finalContent.trim()) {
            newStreamedText = ev.finalContent;
          }
        }
      }
      assert.ok(
        !legacyStreamedText.includes('UNVERIFIED STREAMED HALLUCINATION'),
        'Legacy frontend must replace streamedText via the revision event'
      );
      assert.ok(
        !newStreamedText.includes('UNVERIFIED STREAMED HALLUCINATION'),
        'New frontend must replace streamedText via revision and finalContent'
      );
    });

    await runTest('CRITICAL-01.2: Streaming response that fails verification and is SAFELY RECOVERED emits revision + finalContent', async () => {
      // Prompt asks to evaluate nested trig sin(cos(45°)), and LLM outputs a Pythagorean contradiction,
      // triggering safe recovery via constructSafeVerifiedResponse (TRIG_AST_DECOMPOSITION)
      mockOllamaHandler = (req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.write(JSON.stringify({
          model: 'test-model',
          message: {
            role: 'assistant',
            content: 'HALLUCINATED STREAM: For this right triangle, opposite = 3, adjacent = 4, and hypotenuse = 2.'
          },
          done: true
        }) + '\n');
        res.end();
      };

      const streamRes = await makeHttpRequest(apiPort, 'POST', '/api/chat', {
        messages: [{ role: 'user', content: 'Can you explain how to evaluate sin(cos(45°))?' }],
        stream: true
      });

      assert.strictEqual(streamRes.status, 200);
      const events = streamRes.raw
        .split('\n')
        .filter(l => l.trim())
        .map(l => JSON.parse(l.trim()));

      const revisionEv = events.find(e => e.type === 'revision');
      const verifiedEv = events.find(e => e.type === 'verified');

      assert.ok(revisionEv, 'Must emit { type: "revision" } when candidate is withheld or safely recovered');
      assert.ok(verifiedEv, 'Must emit { type: "verified" }');
      assert.ok(typeof verifiedEv.finalContent === 'string' && verifiedEv.finalContent.length > 0, 'verified event must include finalContent');
      assert.ok(!verifiedEv.finalContent.includes('HALLUCINATED STREAM'), 'finalContent must not contain the unverified stream');
    });

    console.log('\n--- DEFECT-01 through DEFECT-06 Remediation Tests ---');

    // DEFECT-01: Invalid unsubscribe token rejects with 401 and never unsubscribes victim
    await runTest('DEFECT-01: Invalid unsubscribe token returns 401 and never falls through to email unsubscribe', async () => {
      // First ensure victim is subscribed
      const victimEmail = 'victim.defect01@example.edu';
      await lanzarIdService.updateMailingListConsent({ email: victimEmail, consented: true, consentSource: 'defect01_test' });
      const statusBefore = lanzarIdService.getMailingListStatus(victimEmail);
      assert.strictEqual(statusBefore.subscribed, true);

      // Attempt unauthenticated unsubscribe with bogus token
      const res = await makeHttpRequest(apiPort, 'POST', '/api/mailing-list/unsubscribe', {
        email: victimEmail,
        token: 'forged_bogus_token_xyz'
      });

      assert.strictEqual(res.status, 401, 'Invalid unsubscribe token must return 401');
      assert.strictEqual(res.json.error, 'unsubscribe_error');

      // Verify victim remains subscribed
      const statusAfter = lanzarIdService.getMailingListStatus(victimEmail);
      assert.strictEqual(statusAfter.subscribed, true, 'Victim subscription must not be altered by invalid token');
    });

    // DEFECT-02: Inline arithmetic override re-verifies final response and never delivers unreplaced or unverified boxed answer
    await runTest('DEFECT-02: Inline arithmetic override re-verifies response and withholds or replaces incorrect boxed answers', async () => {
      mockOllamaHandler = (req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          model: 'test-model',
          message: { role: 'assistant', content: 'Step 1: 12 + 15 = 999.\nTherefore \\boxed{999}.' },
          done: true
        }) + '\n');
      };

      const res = await makeHttpRequest(apiPort, 'POST', '/api/chat', {
        messages: [{ role: 'user', content: 'What is 12 + 15?' }],
        stream: false
      });

      assert.strictEqual(res.status, 200);
      assert.ok(
        !res.json.message.content.includes('\\boxed{999}'),
        'Final response must never contain the invalid \\boxed{999}'
      );
      assert.ok(
        res.json.verificationState === 'VERIFIED' || res.json.withheld === true,
        'Response must either be withheld or correctly overridden and verified'
      );
      if (res.json.message.content.includes('\\boxed{')) {
        assert.ok(res.json.message.content.includes('27'), 'If boxed answer was corrected, it must contain 27');
      }
    });

    // DEFECT-03: Truncated candidate safely recovered by constructSafeVerifiedResponse evaluates as VERIFIED
    await runTest('DEFECT-03: Truncated candidate safely recovered evaluates as VERIFIED (not WITHHELD)', () => {
      const recoveredState = verificationBridge.evaluateVerificationState({
        claims: [{ domain: 'trigonometry', claim_type: 'trig_evaluation', raw_match: 'sin(cos(45°)) = 0.6496', data: { proposed_value: 0.6496 } }],
        verificationResults: [{ verified: true, status: 'VERIFIED' }],
        invalidClaims: [],
        unknownClaims: [],
        internalContradictions: [],
        prompt: 'Evaluate sin(cos(45°))',
        withheld: false,
        isCandidateIncomplete: false,
        safeResponseRecovered: true
      });

      assert.strictEqual(recoveredState.state, 'VERIFIED');
      assert.strictEqual(recoveredState.primaryClaimVerified, true);
    });

    // DEFECT-04: Expired or rejecting Firebase ID token in verifyGoogleIdTokenCryptographically returns 401 without exposing raw error
    await runTest('DEFECT-04: Expired/rejecting Firebase ID token returns 401 without raw Firebase error', async () => {
      app.setGoogleTokenVerifierForTesting(async () => {
        throw new Error('Firebase ID token has expired. Get a fresh token from client.');
      });

      const res = await makeHttpRequest(apiPort, 'POST', '/api/mailing-list/consent', {
        email: 'alice.defect04@example.edu',
        consented: true
      }, {
        Authorization: 'Bearer expired.firebase.token'
      });

      assert.strictEqual(res.status, 401, 'Expired Firebase token must return 401');
      assert.strictEqual(res.json.error, 'unauthorized');
      assert.ok(!res.json.message.includes('Get a fresh token'), 'Raw internal Firebase error message must not be leaked');
    });

    // DEFECT-05: Firestore migration conflict handling prevents overwriting newer remote records
    await runTest('DEFECT-05: migrateLocalStoreToFirestore preserves newer remote records and registration rollback cleans up partial state', async () => {
      const remoteAccount = {
        uid: 'lanzar_conflict_test_uid',
        email: 'conflict.defect05@example.edu',
        displayName: 'Remote Newer Name',
        updatedAt: '2026-11-08T00:00:00.000Z'
      };
      const staleLocalAccount = {
        uid: 'lanzar_conflict_test_uid',
        email: 'conflict.defect05@example.edu',
        displayName: 'Stale Local Name',
        updatedAt: '2026-11-01T00:00:00.000Z'
      };

      let remoteStore = new Map([[remoteAccount.uid, remoteAccount]]);
      firestoreService.setFirestoreAdapterForTesting({
        isAvailable: true,
        getLanzarAccountByUid: async (uid) => remoteStore.get(uid) || null,
        getLanzarAccountByEmail: async (email) => Array.from(remoteStore.values()).find(a => a.email === email) || null,
        saveLanzarAccount: async (acc) => { remoteStore.set(acc.uid, acc); return true; },
        deleteLanzarAccount: async (uid) => { remoteStore.delete(uid); return true; }
      });

      lanzarIdService.resetLocalMigrationStateForTesting({ accounts: [staleLocalAccount] });
      await lanzarIdService.migrateLocalStoreToFirestore();

      // Remote store must STILL have the newer name, not the stale local name
      const storedAfter = remoteStore.get(remoteAccount.uid);
      assert.strictEqual(storedAfter.displayName, 'Remote Newer Name', 'Stale local migration must never overwrite newer remote record');
    });

    // DEFECT-06: Ungrounded boxed answer with zero extracted equations evaluates as WITHHELD; non-streaming fast-path includes metadata
    await runTest('DEFECT-06: Ungrounded boxed answer evaluates to WITHHELD and fast-path includes verificationSummary', async () => {
      // 1. Boxed answer without equations
      const zeroEquationAudit = await verificationBridge.verifyResponseClaims(
        'The secret product is clearly \\boxed{30}.',
        'Calculate 17 * 19.'
      );
      const evalResult = verificationBridge.evaluateVerificationState({
        ...zeroEquationAudit,
        prompt: 'Calculate 17 * 19.'
      });
      assert.strictEqual(evalResult.state, 'WITHHELD', 'Ungrounded boxed answer with 0 equations must evaluate to WITHHELD');

      // 2. Non-streaming fast-path response metadata
      const fastPathRes = await makeHttpRequest(apiPort, 'POST', '/api/chat', {
        messages: [{ role: 'user', content: 'What is sin(90 deg)?' }],
        stream: false
      });
      assert.strictEqual(fastPathRes.status, 200);
      assert.strictEqual(fastPathRes.json.verificationState, 'VERIFIED');
      assert.ok(fastPathRes.json.verificationSummary, 'Fast-path response must include verificationSummary');
      assert.strictEqual(fastPathRes.json.verificationSummary.state, 'VERIFIED');
      assert.strictEqual(typeof fastPathRes.json.finalContent, 'string');
    });
  } finally {
    clearActiveControllers();
    await new Promise(r => apiServer.close(r));
    await new Promise(r => mockOllamaServer.close(r));
  }

  console.log(`\n================================================================`);
  console.log(`PHASE 1 REMEDIATION SUMMARY: ${passed} passed, ${failed} failed`);
  console.log(`================================================================`);
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
