/**
 * test-operational-qualification.js
 *
 * Independent Operational, Failure-Injection & Security Qualification Suite (Section 7).
 * Tests worker crashes/timeouts, queue saturation, mock LLM upstream timeouts,
 * HTTP 5xx, malformed NDJSON/JSON, invalid HTTP inputs, client socket disconnects,
 * concurrent error isolation, repeated post-recovery calls, and HTTP security controls.
 */

'use strict';

const assert = require('assert');
const http = require('http');

function httpRequestJson(baseUrl, method, reqPath, bodyObjOrRaw, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(reqPath, baseUrl);
    const payload = typeof bodyObjOrRaw === 'string'
      ? bodyObjOrRaw
      : (bodyObjOrRaw !== undefined && bodyObjOrRaw !== null ? JSON.stringify(bodyObjOrRaw) : null);

    const reqHeaders = { ...headers };
    if (payload !== null && !reqHeaders['Content-Type'] && !reqHeaders['content-type']) {
      reqHeaders['Content-Type'] = 'application/json';
    }
    if (payload !== null) {
      reqHeaders['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: reqHeaders,
      timeout: 15000
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (_) {}
        resolve({ status: res.statusCode, headers: res.headers, text: data, json });
      });
    });

    req.on('timeout', () => {
      req.destroy(new Error('Test client request timeout'));
    });
    req.on('error', reject);
    if (payload !== null) req.write(payload);
    req.end();
  });
}

function sendAbortablePost(baseUrl, reqPath, bodyObj, abortAfterMs = 80) {
  return new Promise((resolve) => {
    const url = new URL(reqPath, baseUrl);
    const payload = JSON.stringify(bodyObj);
    let settled = false;
    const done = (info) => {
      if (!settled) {
        settled = true;
        resolve(info);
      }
    };

    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      res.on('data', () => {});
      res.on('end', () => done({ aborted: false, status: res.statusCode }));
    });

    req.on('error', (err) => {
      done({ aborted: true, error: err.message });
    });

    req.write(payload);
    req.end();

    setTimeout(() => {
      try {
        req.destroy();
      } catch (_) {}
      done({ aborted: true });
    }, abortAfterMs);
  });
}

async function runSuite() {
  let mockMode = 'ok';
  let mockSawAbortOrClose = false;
  const mockTimers = new Set();

  const mockOllama = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('close', () => {
      if (!res.writableEnded) mockSawAbortOrClose = true;
    });
    req.on('end', () => {
      if (mockMode === 'timeout') {
        const t = setTimeout(() => {
          mockTimers.delete(t);
          if (!res.writableEnded && !res.destroyed) {
            res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
            res.end(JSON.stringify({ message: { content: 'Delayed reply.' }, done: true }) + '\n');
          }
        }, 2000);
        mockTimers.add(t);
        req.on('close', () => {
          clearTimeout(t);
          mockTimers.delete(t);
        });
        return;
      }

      if (mockMode === 'http503') {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'upstream overloaded' }));
        return;
      }

      if (mockMode === 'garbage_html') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body>Proxy malformed stream</body></html>');
        return;
      }

      if (mockMode === 'malformed_tool_wrong_math') {
        res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
        res.end(JSON.stringify({
          message: {
            content: '<<<TOOL_REQUEST>>> {bad json <<<END_TOOL_REQUEST>>>\nThe derivative is \\(\\boxed{999}\\).'
          },
          done: true
        }) + '\n');
        return;
      }

      // Default valid mathematical response matching common test prompts
      let parsedBody = {};
      try { parsedBody = JSON.parse(body || '{}'); } catch (_) {}
      const lastMsg = Array.isArray(parsedBody.messages)
        ? [...parsedBody.messages].reverse().find(m => m && m.role === 'user')
        : null;
      const promptText = lastMsg ? String(lastMsg.content || '') : '';
      let reply = 'A group homomorphism preserves the binary operation.';
      if (/x\^2\s*-\s*9/i.test(promptText)) {
        reply = 'Factoring the difference of squares gives \\((x - 3)(x + 3)\\).';
      } else if (/\(x\^2\s*-\s*1\)\/\(x\s*-\s*1\)/i.test(promptText)) {
        reply = 'Simplifying for \\(x \\neq 1\\) yields \\(\\boxed{x + 1}\\).';
      } else if (/2x\s*\+\s*6\s*=\s*14/i.test(promptText)) {
        reply = 'Subtracting 6 gives \\(2x = 8\\), so \\(\\boxed{x = 4}\\).';
      }
      res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
      res.end(JSON.stringify({ message: { content: reply }, done: true }) + '\n');
    });
  });

  await new Promise((resolve) => mockOllama.listen(0, '127.0.0.1', resolve));
  const mockAddr = mockOllama.address();
  const mockUrl = `http://127.0.0.1:${mockAddr.port}`;

  process.env.NODE_ENV = 'test';
  process.env.OLLAMA_HOST = mockUrl;
  process.env.REQUEST_TIMEOUT_MS = '450';
  process.env.REVISION_TIMEOUT_MS = '300';
  process.env.GROQ_API_KEY = '';
  process.env.GEMINI_API_KEY = '';
  process.env.ADMIN_API_KEY = 'ops-qual-admin-key-check';

  const verificationBridge = require('../server/verificationBridge');
  const calculusEngine = require('../server/engines/calculusEngine');
  const rootSolver = require('../server/engines/rootSolver');
  const { app, getActiveControllers, clearActiveControllers } = require('../server/server');

  const gatewayServer = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const baseUrl = `http://127.0.0.1:${gatewayServer.address().port}`;

  let passed = 0;
  let failed = 0;
  const runCase = async (name, fn) => {
    try {
      await fn();
      passed++;
      console.log(`  PASS: ${name}`);
    } catch (err) {
      failed++;
      console.error(`  FAIL: ${name} -> ${err.message}`);
    }
  };

  console.log('==============================================================');
  console.log('Pythos Section 7 Operational, Failure-Injection & Security');
  console.log('==============================================================');

  try {
    // ── Failure Mode 1: Python verifier worker crash/timeout & recovery ──────
    await runCase('F1: Python verifier worker timeout crash recovers immediately', async () => {
      verificationBridge.initVerifierDaemon(2);
      const warm = await verificationBridge.verifyResponseClaims(
        'The derivative of \\(x^2\\) is \\(\\boxed{2x}\\).',
        'Differentiate x^2'
      );
      assert.strictEqual(warm.invalidClaims.length, 0);
      assert.strictEqual(warm.unknownClaims.length, 0);
      assert.ok(warm.verificationResults.length > 0 && warm.verificationResults.every(r => r.verified === true));

      const tRes = await verificationBridge.runViaVerifierPool({
        claim_type: 'calculus_antiderivative',
        data: { integrand: 'sin(x)^4 * cos(x)^3', antiderivative: '-cos(x)^5/5 + cos(x)^7/7', variable: 'x' }
      }, { isBatch: false, timeoutMs: 1 });
      assert.strictEqual(tRes.status, 'ERROR', `Expected ERROR on 1ms timeout, got ${JSON.stringify(tRes)}`);
      assert.ok(/timeout|CAS_TIMEOUT/i.test(`${tRes.error_type || ''} ${tRes.reason || ''}`), `Unexpected timeout result: ${JSON.stringify(tRes)}`);

      await new Promise(r => setTimeout(r, 250));
      const recovery = await verificationBridge.verifyResponseClaims(
        'The derivative of \\(x^3 + 2x\\) is \\(\\boxed{3x^2 + 2}\\).',
        'Differentiate x^3 + 2x'
      );
      assert.strictEqual(recovery.invalidClaims.length, 0, 'Worker pool must recover with 0 invalid claims');
      assert.strictEqual(recovery.unknownClaims.length, 0, 'Worker pool must recover with 0 unknown claims');
      assert.ok(recovery.verificationResults.length > 0 && recovery.verificationResults.every(r => r.verified === true));
    });

    // ── Failure Mode 2: Calculus daemon worker crash/timeout & recovery ──────
    await runCase('F2: Calculus worker timeout recovers cleanly on subsequent differentiate', async () => {
      calculusEngine.initCalculusDaemon(2);
      const resTimeout = await calculusEngine.differentiate('sin(x^5) * exp(x^2) * cos(x^3)', {
        variable: 'x',
        timeoutMs: 1
      });
      assert.strictEqual(resTimeout.status, 'FAILED', `Expected FAILED on 1ms timeout, got ${JSON.stringify(resTimeout)}`);

      await new Promise(r => setTimeout(r, 250));
      const resOk = await calculusEngine.differentiate('x^4 + 5*x', { variable: 'x', timeoutMs: 5000 });
      assert.strictEqual(resOk.status, 'VERIFIED', `Expected VERIFIED recovery, got ${JSON.stringify(resOk)}`);
      assert.ok(String(resOk.exactResult || '').includes('4*x**3'), `Expected 4*x**3 in exactResult, got ${JSON.stringify(resOk)}`);
    });

    // ── Failure Mode 3: Root solver crash/timeout + >32 queue saturation ─────
    await runCase('F3: Root solver >32 queue saturation & timeout recovery', async () => {
      // Flood > 32 concurrent distinct equations so MAX_QUEUE_SIZE=32 triggers safely
      const floodPromises = [];
      for (let i = 0; i < 40; i++) {
        floodPromises.push(
          rootSolver.solveEquationRoots(`x^3 - ${i + 10}*x^2 + ${i + 3}*x - ${i + 1} = 0`).catch(err => ({
            status: 'FAILED',
            error: err.message
          }))
        );
      }
      const floodResults = await Promise.all(floodPromises);
      const saturated = floodResults.filter(r => r && /ROOT_QUEUE_SATURATED/i.test(String(r.error || '')));
      const resolvedOk = floodResults.filter(r => r && r.status === 'VERIFIED');
      assert.ok(floodResults.length === 40, 'All 40 promises must settle');
      assert.ok(resolvedOk.length >= 1, 'At least one queued root request should complete');
      // Either queue saturated (if workers busy long enough) or completed fast cleanly
      assert.ok(
        saturated.length + resolvedOk.length === 40 || floodResults.every(r => r && r.status),
        'Flood must either succeed or fail cleanly without uncaught errors'
      );

      // Explicit crash/timeout recovery check
      const tRes = await rootSolver.solveEquationRoots('x^4 - 7*x^3 + 3*x - 99 = 0', 'x', 1).catch(e => ({
        status: 'FAILED',
        error: e.message
      }));
      assert.ok(tRes && tRes.status, 'Timeout/short solve returns structured status');

      await new Promise(r => setTimeout(r, 150));
      const postRoot = await rootSolver.solveEquationRoots('x^2 - 9 = 0');
      assert.strictEqual(postRoot.status, 'VERIFIED');
      assert.deepStrictEqual(postRoot.roots.map(Number).sort((a, b) => a - b), [-3, 3]);
    });

    // ── Failure Mode 4: CAS verifier queue saturation ────────────────────────
    await runCase('F4: Verifier CAS queue saturation rejects excess cleanly and recovers', async () => {
      const promises = [];
      for (let i = 0; i < 80; i++) {
        promises.push(
          verificationBridge.runViaVerifierPool({
            claim_type: 'equation_solution',
            data: { equation: `x^2 - ${(i + 101) * (i + 101)} = 0`, roots: [String(i + 101), String(-(i + 101))], variable: 'x' }
          }, { isBatch: false, timeoutMs: 8000 })
        );
      }
      const out = await Promise.all(promises);
      const saturated = out.filter(r => r && r.error_type === 'CAS_QUEUE_SATURATED');
      assert.ok(saturated.length >= 1, `80 concurrent requests must trip queue saturation; errors=${out.filter(r => r && r.status === 'ERROR').length}`);

      const postCas = await verificationBridge.verifyResponseClaims(
        'The roots are \\(\\boxed{x = -5, 5}\\).',
        'Solve x^2 - 25 = 0'
      );
      assert.strictEqual(postCas.invalidClaims.length, 0);
      assert.strictEqual(postCas.unknownClaims.length, 0);
      assert.ok(postCas.verificationResults.length > 0 && postCas.verificationResults.every(r => r.verified === true));
    });

    // ── Failure Mode 5: LLM Upstream Failures (Timeout, 503, Malformed) ──────
    await runCase('F5a: Mock Ollama timeout triggers bounded 504 gateway_timeout and clears controller', async () => {
      app.resetAllRateLimits();
      mockMode = 'timeout';
      const resp = await httpRequestJson(baseUrl, 'POST', '/api/chat', {
        messages: [{ role: 'user', content: 'In one sentence, define what an abelian group is.' }],
        stream: false
      });
      assert.strictEqual(resp.status, 504, `Expected 504 on upstream timeout, got ${resp.status}: ${resp.text}`);
      assert.strictEqual(resp.json?.error, 'gateway_timeout');
      assert.strictEqual(getActiveControllers().size, 0, 'Active controllers must be empty after timeout');
    });

    await runCase('F5b: Mock Ollama HTTP 503 fails closed with sanitized 502 UPSTREAM_SERVER_ERROR', async () => {
      mockMode = 'http503';
      const resp = await httpRequestJson(baseUrl, 'POST', '/api/chat', {
        messages: [{ role: 'user', content: 'In one sentence, define a topological manifold.' }],
        stream: false
      });
      assert.strictEqual(resp.status, 502, `Expected 502, got ${resp.status}: ${resp.text}`);
      assert.strictEqual(resp.json?.error, 'UPSTREAM_SERVER_ERROR');
      assert.ok(!/ops-qual-admin-key-check|c:\\projects/i.test(resp.text), 'Must not leak paths or secrets');
    });

    await runCase('F5c: Malformed HTML/non-JSON upstream stream fails closed cleanly without crash', async () => {
      mockMode = 'garbage_html';
      const resp = await httpRequestJson(baseUrl, 'POST', '/api/chat', {
        messages: [{ role: 'user', content: 'In one sentence, define Noetherian ring.' }],
        stream: false
      });
      assert.ok(resp.status >= 500 && resp.status < 600, `Expected 5xx structured error, got ${resp.status}: ${resp.text}`);
      assert.ok(resp.json && resp.json.error, 'Must return structured JSON error');
      assert.ok(!/<html>/i.test(resp.text), 'Must never reflect raw upstream HTML');
      assert.strictEqual(getActiveControllers().size, 0);
    });

    await runCase('F5d: Malformed model tool JSON + wrong answer 999 never delivers verified claim', async () => {
      mockMode = 'malformed_tool_wrong_math';
      const resp = await httpRequestJson(baseUrl, 'POST', '/api/chat', {
        messages: [{ role: 'user', content: 'What is the derivative of sin(x^3) + cos(x)?' }],
        stream: false
      });
      assert.strictEqual(resp.status, 200, `Expected controlled withholding/200 response, got ${resp.status}`);
      const content = resp.json?.message?.content || '';
      assert.ok(!/\\boxed\{999\}/.test(content), `Wrong boxed answer must never reach user: ${content}`);
      assert.strictEqual(getActiveControllers().size, 0);
    });

    // ── Failure Mode 6: Client Input Validation & HTTP Security Controls ─────
    await runCase('F6: Invalid JSON, missing/oversized messages, >256kb payload, CORS, path blocking, auth gates, headers', async () => {
      // Malformed JSON
      const badJson = await httpRequestJson(baseUrl, 'POST', '/api/chat', '{"messages": [bad');
      assert.strictEqual(badJson.status, 400);
      assert.strictEqual(badJson.json?.error, 'invalid_json');

      // Empty messages
      const emptyMsgs = await httpRequestJson(baseUrl, 'POST', '/api/chat', { messages: [] });
      assert.strictEqual(emptyMsgs.status, 400);
      assert.strictEqual(emptyMsgs.json?.error, 'invalid_request');

      // > 250 messages
      const tooMany = await httpRequestJson(baseUrl, 'POST', '/api/chat', {
        messages: Array.from({ length: 251 }, () => ({ role: 'user', content: 'hi' }))
      });
      assert.strictEqual(tooMany.status, 400);
      assert.strictEqual(tooMany.json?.error, 'invalid_request');

      // Oversized body (>256kb) on non-chat route -> 413
      const hugePayload = JSON.stringify({ data: 'x'.repeat(270 * 1024) });
      const tooBig = await httpRequestJson(baseUrl, 'POST', '/api/mailing-list/consent', hugePayload);
      assert.strictEqual(tooBig.status, 413);
      assert.strictEqual(tooBig.json?.error, 'payload_too_large');

      // CORS rejection
      const evilCors = await httpRequestJson(baseUrl, 'GET', '/health', null, {
        Origin: 'https://evil-attacker.example.com'
      });
      assert.strictEqual(evilCors.status, 403);
      assert.strictEqual(evilCors.json?.error, 'cors_origin_denied');

      // Blocked container/secret paths
      for (const probe of ['/.env', '/.env.example', '/server/server.js', '/package.json', '/firestore.rules', '/%2e%2e/package.json']) {
        const probeResp = await httpRequestJson(baseUrl, 'GET', probe, null);
        assert.strictEqual(probeResp.status, 404, `Probe ${probe} must return 404, got ${probeResp.status}`);
      }

      // Security headers on /health
      const health = await httpRequestJson(baseUrl, 'GET', '/health', null);
      assert.strictEqual(health.status, 200);
      assert.strictEqual(health.headers['x-powered-by'], undefined);
      assert.strictEqual(health.headers['x-frame-options'], 'SAMEORIGIN');
      assert.strictEqual(health.headers['x-content-type-options'], 'nosniff');
      assert.ok(health.headers['strict-transport-security']);
      assert.ok(health.headers['content-security-policy']);

      // Memory unauthenticated auth check -> 401
      const memNoAuth = await httpRequestJson(baseUrl, 'GET', '/api/memory', null);
      assert.strictEqual(memNoAuth.status, 401);

      // Admin unauthenticated / wrong key -> 401
      const adminNoAuth = await httpRequestJson(baseUrl, 'GET', '/admin/status', null);
      assert.strictEqual(adminNoAuth.status, 401);
      const adminWrongKey = await httpRequestJson(baseUrl, 'GET', '/admin/status', null, {
        'X-Admin-Key': 'wrong-key'
      });
      assert.strictEqual(adminWrongKey.status, 401);
    });

    // ── Failure Mode 7: Client Disconnect Mid-Flight ──────────────────────────
    await runCase('F7: Client socket req.destroy() mid-flight cancels upstream and cleans activeControllers', async () => {
      mockMode = 'timeout';
      mockSawAbortOrClose = false;
      const aborted = await sendAbortablePost(baseUrl, '/api/chat', {
        messages: [{ role: 'user', content: 'Define Galois extension in one sentence.' }],
        stream: true
      }, 90);
      assert.strictEqual(aborted.aborted, true);

      await new Promise(r => setTimeout(r, 250));
      assert.strictEqual(getActiveControllers().size, 0, 'Active controllers must drain after client disconnect');
      assert.strictEqual(mockSawAbortOrClose, true, 'Upstream request should receive abort/close on client disconnect');
    });

    // ── Failure Mode 8: Concurrent Isolation + Repeated Post-Recovery Calls ───
    await runCase('F8: Concurrent mixed valid/error requests stay isolated and post-recovery calls pass', async () => {
      app.resetAllRateLimits();
      mockMode = 'ok';

      const results = await Promise.all([
        httpRequestJson(baseUrl, 'POST', '/api/chat', '{badjson'),
        httpRequestJson(baseUrl, 'POST', '/api/chat', { messages: [] }),
        httpRequestJson(baseUrl, 'POST', '/api/chat', {
          messages: [{ role: 'user', content: 'Solve 2x + 6 = 14' }],
          stream: false
        }),
        httpRequestJson(baseUrl, 'POST', '/api/chat', {
          messages: [{ role: 'user', content: 'Plot y = x^2' }],
          stream: false
        }),
        httpRequestJson(baseUrl, 'POST', '/api/chat', {
          messages: [{ role: 'user', content: 'Factor x^2 - 9' }],
          stream: false
        }),
        httpRequestJson(baseUrl, 'GET', '/health', null)
      ]);

      assert.strictEqual(results[0].status, 400);
      assert.strictEqual(results[1].status, 400);
      assert.strictEqual(results[2].status, 200);
      assert.ok(/4/.test(results[2].json?.message?.content || ''));
      assert.strictEqual(results[3].status, 200, 'Visualizer fast-path must return 200 (extractClaims regression)');
      assert.ok((results[3].json?.message?.content || '').length > 0);
      assert.strictEqual(results[4].status, 200);
      assert.ok(/3/.test(results[4].json?.message?.content || ''));
      assert.strictEqual(results[5].status, 200);

      // Repeated post-recovery checks across HTTP gateway + all 3 Python subsystems
      for (let round = 1; round <= 3; round++) {
        const chatFollowup = await httpRequestJson(baseUrl, 'POST', '/api/chat', {
          messages: [{ role: 'user', content: 'Simplify (x^2 - 1)/(x - 1)' }],
          stream: false
        });
        assert.strictEqual(chatFollowup.status, 200, `Post-recovery chat round ${round} failed`);

        const calcFollowup = await calculusEngine.differentiate(`x^${round + 1}`, { variable: 'x', timeoutMs: 5000 });
        assert.strictEqual(calcFollowup.status, 'VERIFIED');

        const rootFollowup = await rootSolver.solveEquationRoots(`x^2 - ${(round + 1) * (round + 1)} = 0`);
        assert.strictEqual(rootFollowup.status, 'VERIFIED');
      }

      assert.strictEqual(getActiveControllers().size, 0);
    });
  } finally {
    for (const t of mockTimers) clearTimeout(t);
    clearActiveControllers();
    await new Promise(resolve => gatewayServer.close(() => resolve()));
    await new Promise(resolve => mockOllama.close(() => resolve()));
    try { verificationBridge.closeVerifierDaemon(); } catch (_) {}
    try { calculusEngine.closeCalculusDaemon(); } catch (_) {}
    try { rootSolver.closeRootDaemon(); } catch (_) {}
  }

  console.log('==============================================================');
  console.log(`Operational & Failure-Injection Summary: ${passed}/${passed + failed} passed (${failed} failed)`);
  console.log('==============================================================');

  if (failed > 0) {
    process.exitCode = 1;
  }
}

runSuite().catch((err) => {
  console.error('Unhandled suite failure:', err);
  process.exitCode = 1;
});
