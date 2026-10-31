/**
 * test-phase1-backend-protection.js
 *
 * Automated Verification Suite for Phase 1 — Backend Security and Resource Protection:
 * - 1.1 Request size limits (256kb default, 15mb on /api/chat, normal/boundary/oversized tests)
 * - 1.2 Concurrency and queue protection (maxQueueSize, 503 on overflow, AbortController cleanup on all exit paths)
 * - 1.3 Report endpoint protection (IP rate limit, field validation, async disk write, path traversal prevention)
 * - 1.4 Health endpoint sanitization (/health public minimal vs /admin/status protected diagnostics)
 * - 1.5 Dependency security (npm audit 0 vulnerabilities verification)
 */

process.env.NODE_ENV = 'test';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { app, activeControllers, clearActiveControllers } = require('./server/server');
const concurrencyLimiter = require('./server/concurrencyLimiter');
const reportService = require('./server/reportService');
const reportRoutes = require('./server/reportRoutes');

console.log('====================================================');
console.log('🛡️  PYTHOS PHASE 1 — BACKEND PROTECTION TEST SUITE');
console.log('====================================================\n');

let passed = 0;
let total = 0;

async function runTest(name, fn) {
  total++;
  try {
    await fn();
    passed++;
    console.log(`  ✅ PASS: ${name}`);
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error('    ', err.message || err);
    throw err;
  }
}

async function main() {
  const server = await new Promise(resolve => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const createdReportIds = [];

  try {
    console.log('--- 1.1 Request Size Limits ---');

    await runTest('1.1 Normal payload (<256KB) to /api/report is accepted', async () => {
      reportRoutes.resetReportRateLimits();
      const res = await fetch(`${baseUrl}/api/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: 'Solve 2x + 5 = 13',
          response: 'x = 4',
          description: 'Normal test report',
          metadata: { testId: 'phase1_normal' }
        })
      });
      assert.strictEqual(res.status, 201);
      const data = await res.json();
      assert(data.reportId);
      createdReportIds.push(data.reportId);
    });

    await runTest('1.1 Boundary payload (~180KB JSON) to non-chat endpoint passes 256KB body parser', async () => {
      reportRoutes.resetReportRateLimits();
      const res = await fetch(`${baseUrl}/api/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: 'x'.repeat(15000),
          response: 'y'.repeat(45000),
          description: 'z'.repeat(4000),
          metadata: { testId: 'phase1_boundary', pad: 'a'.repeat(20000) }
        })
      });
      assert.strictEqual(res.status, 201);
      const data = await res.json();
      if (data.reportId) createdReportIds.push(data.reportId);
    });

    await runTest('1.1 Oversized payload (>256KB) to /api/report is rejected with HTTP 413', async () => {
      reportRoutes.resetReportRateLimits();
      const res = await fetch(`${baseUrl}/api/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: 'Solve x = 1',
          pad: 'X'.repeat(300 * 1024)
        })
      });
      assert.strictEqual(res.status, 413);
      const data = await res.json();
      assert.strictEqual(data.error, 'payload_too_large');
    });

    await runTest('1.1 Large legitimate payload (~500KB) to /api/chat is permitted by 15MB chat parser', async () => {
      // Valid 1x1 PNG padded in historical message or valid chat structure under 15MB
      // Even if rejected by chat character limits (400), it must NOT fail with 413 Payload Too Large!
      const res = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Calculate 2 + 2' }],
          extraPadding: 'P'.repeat(400 * 1024)
        })
      });
      assert.notStrictEqual(res.status, 413, 'Chat endpoint must permit payloads >256KB up to 15MB');
      assert.strictEqual(res.status, 200);
    });

    console.log('\n--- 1.2 Concurrency, Bounded Queue & AbortController Cleanup ---');

    await runTest('1.2 AbortController is cleaned up on deterministic fast-path early return (JSON & Streaming)', async () => {
      clearActiveControllers();
      assert.strictEqual(activeControllers.size, 0);

      // JSON deterministic fast-path
      const res1 = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'Calculate 72/120' }] })
      });
      assert.strictEqual(res1.status, 200);
      assert.strictEqual(activeControllers.size, 0, 'activeControllers must be 0 after deterministic JSON return');

      // Streaming deterministic fast-path
      const res2 = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' },
        body: JSON.stringify({ stream: true, messages: [{ role: 'user', content: 'Graph x^2 + y^2 = 25' }] })
      });
      assert.strictEqual(res2.status, 200);
      await res2.text();
      assert.strictEqual(activeControllers.size, 0, 'activeControllers must be 0 after deterministic streaming return');
    });

    await runTest('1.2 Bounded queue rejects excess requests with QUEUE_FULL (HTTP 503) and recovers cleanly', async () => {
      concurrencyLimiter.clearQueue();
      concurrencyLimiter.setLimit(1);
      concurrencyLimiter.setMaxQueueSize(2);

      // Acquire the 1 active slot
      await concurrencyLimiter.acquire(null, 5000);
      assert.strictEqual(concurrencyLimiter.getCurrentCount(), 1);

      // Fill the 2 queue slots
      const q1 = concurrencyLimiter.acquire(null, 5000);
      const q2 = concurrencyLimiter.acquire(null, 5000);
      assert.strictEqual(concurrencyLimiter.getQueueLength(), 2);

      // 3rd queued request must immediately reject with QUEUE_FULL (503)
      let rejectedErr = null;
      try {
        await concurrencyLimiter.acquire(null, 5000);
      } catch (err) {
        rejectedErr = err;
      }
      assert(rejectedErr, 'Excess request must be rejected when queue is full');
      assert.strictEqual(rejectedErr.code, 'QUEUE_FULL');
      assert.strictEqual(rejectedErr.status, 503);

      // Release slots and verify queue drains cleanly
      concurrencyLimiter.release();
      await q1;
      concurrencyLimiter.release();
      await q2;
      concurrencyLimiter.release();

      assert.strictEqual(concurrencyLimiter.getCurrentCount(), 0);
      assert.strictEqual(concurrencyLimiter.getQueueLength(), 0);

      // Restore defaults
      concurrencyLimiter.setLimit(5);
      concurrencyLimiter.setMaxQueueSize(50);
    });

    console.log('\n--- 1.3 Report Endpoint Protection (Rate Limit, Validation, Path Traversal) ---');

    await runTest('1.3 Per-IP rate limiting blocks repeated report flooding with HTTP 429', async () => {
      reportRoutes.resetReportRateLimits();
      reportRoutes.setReportRateLimit(3, 60000);

      try {
        for (let i = 0; i < 3; i++) {
          const r = await fetch(`${baseUrl}/api/report`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Forwarded-For': '203.0.113.77'
            },
            body: JSON.stringify({
              question: `Rate limit test ${i}`,
              description: 'Testing rate limiter',
              metadata: { testId: 'phase1_rl' }
            })
          });
          assert.strictEqual(r.status, 201);
          const d = await r.json();
          if (d.reportId) createdReportIds.push(d.reportId);
        }

        // 4th submission from same IP must return 429 Too Many Requests
        const blocked = await fetch(`${baseUrl}/api/report`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Forwarded-For': '203.0.113.77'
          },
          body: JSON.stringify({
            question: 'Rate limit test 4 (should block)',
            metadata: { testId: 'phase1_rl' }
          })
        });
        assert.strictEqual(blocked.status, 429);
        assert(blocked.headers.get('retry-after'), 'Must include Retry-After header');
        const blockedBody = await blocked.json();
        assert.strictEqual(blockedBody.error, 'rate_limit_exceeded');
      } finally {
        reportRoutes.setReportRateLimit(10, 15 * 60 * 1000);
        reportRoutes.resetReportRateLimits();
      }
    });

    await runTest('1.3 Malformed and invalid field types on /api/report are rejected with HTTP 400', async () => {
      const badPayloads = [
        { question: '', response: '', description: '   ' },
        { question: 12345 },
        { question: 'Valid', claims: 'not-an-array' },
        { question: 'Valid', description: 'D'.repeat(5500) }
      ];

      for (const payload of badPayloads) {
        const res = await fetch(`${baseUrl}/api/report`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        assert.strictEqual(res.status, 400, `Expected 400 for payload ${JSON.stringify(payload).slice(0, 60)}`);
      }
    });

    await runTest('1.3 Path traversal and unsafe report IDs are rejected in reportService', async () => {
      const traversalIds = [
        '../package',
        '../../etc/passwd',
        'PY-12345678/../../server',
        'PY-12345678\\..\\server',
        'PY-12345678\0.json',
        'not-a-valid-id'
      ];
      for (const badId of traversalIds) {
        assert.strictEqual(reportService.isValidReportId(badId), false, `Must reject ${badId}`);
        assert.strictEqual(reportService.findReportOnDisk(badId), null, `findReportOnDisk must return null for ${badId}`);
        const asyncFound = await reportService.findReportById(badId);
        assert.strictEqual(asyncFound, null, `findReportById must return null for ${badId}`);
      }
      assert.strictEqual(reportService.isValidReportId('PY-a1b2c3d4'), true);
    });

    console.log('\n--- 1.4 Health Endpoint Sanitization & Protected Admin Diagnostics ---');

    await runTest('1.4 Public GET /health exposes only basic availability and zero internal config', async () => {
      const res = await fetch(`${baseUrl}/health`);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.status, 'ok');
      assert.strictEqual(data.service, 'pythos-api');
      assert.strictEqual(typeof data.version, 'string');
      assert.strictEqual(typeof data.timestamp, 'string');

      // Ensure sensitive/internal fields are removed from public /health
      const forbiddenKeys = [
        'model', 'visionModel', 'hasAuth', 'budgetPolicy',
        'firebaseAdmin', 'casVerification', 'specialistAssist',
        'projectKnowledge', 'uptime'
      ];
      for (const key of forbiddenKeys) {
        assert.strictEqual(data[key], undefined, `Public /health must NOT expose "${key}"`);
      }
    });

    await runTest('1.4 Detailed diagnostics on GET /admin/status require admin auth in production', async () => {
      const savedEnv = process.env.NODE_ENV;
      const savedKey = process.env.ADMIN_API_KEY;
      try {
        process.env.NODE_ENV = 'production';
        process.env.ADMIN_API_KEY = 'test_secret_admin_key_phase1';

        const unauthRes = await fetch(`${baseUrl}/admin/status`);
        assert.strictEqual(unauthRes.status, 401, 'Unauthenticated GET /admin/status must be rejected in production');

        const authRes = await fetch(`${baseUrl}/admin/status`, {
          headers: { 'X-Admin-Key': 'test_secret_admin_key_phase1' }
        });
        assert.strictEqual(authRes.status, 200);
        const authData = await authRes.json();
        assert.strictEqual(authData.status, 'ok');
        assert(authData.budgetPolicy, 'Authenticated /admin/status must include budgetPolicy');
        assert(authData.casVerification, 'Authenticated /admin/status must include casVerification');
      } finally {
        process.env.NODE_ENV = savedEnv;
        if (savedKey !== undefined) process.env.ADMIN_API_KEY = savedKey;
        else delete process.env.ADMIN_API_KEY;
      }
    });

    console.log('\n--- 1.5 Dependency Security Verification ---');

    await runTest('1.5 npm audit in server/ reports 0 vulnerabilities', async () => {
      const auditJson = execSync('npm audit --json', {
        cwd: path.join(__dirname, 'server'),
        encoding: 'utf8'
      });
      const parsed = JSON.parse(auditJson);
      const totalVulns = parsed.metadata?.vulnerabilities?.total ?? -1;
      assert.strictEqual(totalVulns, 0, `Expected 0 vulnerabilities, got ${totalVulns}`);
    });

    console.log(`\n🎉 ALL ${passed}/${total} PHASE 1 BACKEND PROTECTION TESTS PASSED!\n`);
  } finally {
    for (const id of createdReportIds) {
      await reportService.deleteReport(id).catch(() => {});
    }
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(err => {
  console.error('\n❌ Phase 1 test suite failed:', err);
  process.exit(1);
});
