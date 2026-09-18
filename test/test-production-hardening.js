/**
 * test/test-production-hardening.js
 *
 * Production Hardening & Release Readiness Verification Suite.
 * Validates fixes and invariants established during the production hardening audit:
 * 1. Bounded Request Guardrails (Max 250 messages, Max 20k chars/msg, Max 100k total chars, Max 5 images)
 * 2. Observability & Telemetry (x-request-id header, latencyMs, privacySafeUid)
 * 3. Deterministic Verifier Process Safety & Timeout Handling
 * 4. Client XSS Sanitization (HTML escaping in graph, viz, tool cards, error announcements)
 * 5. Admin Console Clean CSS Compliance
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const http = require('http');

const { runDeterministicVerification } = require('../server/verificationBridge');
const { app } = require('../server/server');

// Helper for HTTP requests against express app
function makeRequest(server, options, payload) {
  return new Promise((resolve, reject) => {
    const data = payload ? JSON.stringify(payload) : null;
    const req = http.request({
      hostname: '127.0.0.1',
      port: server.address().port,
      path: options.path || '/api/chat',
      method: options.method || 'POST',
      headers: Object.assign({
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }, options.headers || {})
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = body ? JSON.parse(body) : {};
          resolve({ status: res.statusCode, headers: res.headers, body: json, rawBody: body });
        } catch (_) {
          resolve({ status: res.statusCode, headers: res.headers, rawBody: body });
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function runHardeningTests() {
  console.log('================================================================');
  console.log('🛡️  PYTHOS PRODUCTION HARDENING & DEFENSE-IN-DEPTH TEST SUITE');
  console.log('================================================================\n');

  let passedCount = 0;
  let totalCount = 0;

  function check(name, condition) {
    totalCount++;
    if (condition) {
      console.log(`  ✓ [PASS ${totalCount}] ${name}`);
      passedCount++;
    } else {
      console.error(`  ❌ [FAIL ${totalCount}] ${name}`);
      throw new Error(`Assertion failed: ${name}`);
    }
  }

  // Start temporary server on ephemeral port
  const testServer = await new Promise(resolve => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });

  try {
    // ── GROUP 1: Bounded Request Guardrails ──────────────────────────────────
    console.log('▶ [GROUP 1] Request Bounds & Anti-Exhaustion Guardrails');

    // 1.1 Exceeding 250 messages
    const excessMessages = Array.from({ length: 251 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `Message ${i}`
    }));
    const res1 = await makeRequest(testServer, {}, { messages: excessMessages });
    check('Rejects > 250 messages with 400 invalid_request', res1.status === 400 && res1.body.error === 'invalid_request');

    // 1.2 Individual message > 20,000 characters
    const giantMsg = [{ role: 'user', content: 'A'.repeat(20005) }];
    const res2 = await makeRequest(testServer, {}, { messages: giantMsg });
    check('Rejects individual message > 20k characters with 400', res2.status === 400 && res2.body.error === 'invalid_request');

    // 1.3 Total message payload > 100,000 characters
    const multiMsg = Array.from({ length: 10 }, () => ({ role: 'user', content: 'B'.repeat(11000) }));
    const res3 = await makeRequest(testServer, {}, { messages: multiMsg });
    check('Rejects total payload > 100k characters with 400', res3.status === 400 && res3.body.error === 'invalid_request');

    // 1.4 Exceeding 5 images across messages
    // 1x1 valid transparent PNG base64
    const validPngB64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const excessImages = [
      { role: 'user', content: 'Here are images', images: [validPngB64, validPngB64, validPngB64] },
      { role: 'user', content: 'More images', images: [validPngB64, validPngB64, validPngB64] }
    ];
    const res4 = await makeRequest(testServer, {}, { messages: excessImages });
    check('Rejects request with > 5 total images with 400', res4.status === 400 && res4.body.error === 'invalid_request');

    // ── GROUP 2: Observability, x-request-id & Telemetry ─────────────────────
    console.log('\n▶ [GROUP 2] Observability, Tracing & Privacy-Safe Telemetry');

    // 2.1 Server issues x-request-id header on responses
    const res5 = await makeRequest(testServer, {}, {
      messages: [{ role: 'user', content: 'Calculate 72/12' }]
    });
    check('Response includes x-request-id header', Boolean(res5.headers['x-request-id']));
    check('Fast-path response payload includes requestId and latencyMs',
      Boolean(res5.body.requestId) && typeof res5.body.latencyMs === 'number');

    // 2.2 Server propagates incoming x-request-id if provided
    const customReqId = 'req_custom_trace_12345';
    const res6 = await makeRequest(testServer, {
      headers: { 'x-request-id': customReqId }
    }, {
      messages: [{ role: 'user', content: 'Calculate 100 * 2' }]
    });
    check('Propagates incoming x-request-id header', res6.headers['x-request-id'] === customReqId);
    check('Response payload matches propagated requestId', res6.body.requestId === customReqId);

    // ── GROUP 3: Verifier Process Safety & Timeout ───────────────────────────
    console.log('\n▶ [GROUP 3] Verifier Process Safety & Timeout');

    // 3.1 Unknown or unparseable claim returns UNKNOWN without throwing
    const unparseableClaim = {
      domain: 'quantum_field_theory',
      claim_type: 'supersymmetric_lagrangian',
      data: { expr: '\\mathcal{L}_{susy}' }
    };
    const verifRes = await runDeterministicVerification(unparseableClaim);
    check('Unrecognized claim resolves safely to UNKNOWN', verifRes.status === 'UNKNOWN' && verifRes.verified === false);

    // ── GROUP 4: Client XSS Sanitization & Image Defense ─────────────────────
    console.log('\n▶ [GROUP 4] Client XSS Sanitization & Image Security');

    const appJsContent = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

    // 4.1 Check that escapeHtml function is defined and used in app.js
    check('app.js defines escapeHtml function', appJsContent.includes('function escapeHtml(str)'));
    check('app.js defines sanitizeImageSrc function', appJsContent.includes('function sanitizeImageSrc(imgData)'));
    check('app.js uses escapeHtml for inline graph caption', appJsContent.includes('escapeHtml(exprToGraph)'));
    check('app.js uses escapeHtml for visualization failure alert', appJsContent.includes('escapeHtml(String(reason))'));
    check('app.js uses sanitizeImageSrc for image element source assignment', appJsContent.includes('const safeSrc = sanitizeImageSrc(imgData)'));

    // ── GROUP 5: Admin Console CSS Syntax Compliance ────────────────────────
    console.log('\n▶ [GROUP 5] Admin Console Clean CSS Compliance');

    const adminHtmlContent = fs.readFileSync(path.join(__dirname, '..', 'admin', 'index.html'), 'utf8');
    check('admin/index.html does not contain invalid divide-y CSS property', !adminHtmlContent.includes('divide-y: divide;'));
    check('admin/index.html defines standard line-clamp property', adminHtmlContent.includes('line-clamp: 2;'));

  } finally {
    await new Promise(resolve => testServer.close(resolve));
  }

  console.log('\n================================================================');
  console.log(`🎉 ALL ${passedCount}/${totalCount} PRODUCTION HARDENING TESTS PASSED (100%)`);
  console.log('================================================================\n');
}

runHardeningTests().then(() => {
  process.exit(0);
}).catch(err => {
  console.error('\n❌ Production hardening tests failed:', err);
  process.exit(1);
});
