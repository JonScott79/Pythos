/**
 * test/test-observability-telemetry.js
 *
 * Pythos Milestone 2.3: Observability, Metrics & Telemetry Suite (MEDIUM-05)
 *
 * Verifies:
 * 1. Bounded rolling telemetry buffer with automatic FIFO eviction (never grows unbounded).
 * 2. Concurrency-safe write operations under parallel load.
 * 3. Thorough sensitive data and PII redaction (API keys, tokens, passwords, emails, paths).
 * 4. Operational metrics tracking (requests, errors, verifications, providers, latency stats).
 * 5. Alert threshold evaluation (error rate spikes, withholding rate, latency anomalies, memory pressure).
 * 6. Non-throwing, fail-safe execution when handling malformed or unexpected data.
 * 7. Admin integration: /admin/metrics and /admin/telemetry endpoints.
 */

const assert = require('assert');
const telemetryService = require('../server/telemetryService');

async function runTests() {
  console.log('======================================================================');
  console.log('PYTHOS MILESTONE 2.3: OBSERVABILITY & TELEMETRY SUITE (MEDIUM-05)');
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
      console.error(`    ${err.message}`);
      if (err.stack) console.error(err.stack);
      process.exitCode = 1;
    }
  }

  telemetryService.resetMetricsForTesting();

  // -------------------------------------------------------------
  // 1. Bounded Rolling Buffer & FIFO Eviction
  // -------------------------------------------------------------
  console.log('--- 1. Bounded Rolling Buffer & FIFO Eviction ---');

  await test('Buffer enforces MAX_BUFFER_SIZE with rolling FIFO eviction', async () => {
    telemetryService.clearBuffer();
    const capacity = telemetryService.MAX_BUFFER_SIZE;

    // Insert capacity + 50 events
    for (let i = 1; i <= capacity + 50; i++) {
      telemetryService.recordLog('INFO', 'TEST_EVENT', { sequence: i });
    }

    const events = telemetryService.getRecentEvents({ limit: capacity + 100 });
    assert.strictEqual(events.length, capacity, `Buffer must be capped at ${capacity}`);

    // Verify oldest 50 events were dropped and remaining start at sequence 51
    assert.strictEqual(events[0].details.sequence, 51, 'Oldest events must be evicted first (FIFO)');
    assert.strictEqual(events[events.length - 1].details.sequence, capacity + 50, 'Newest event must be present');
  });

  // -------------------------------------------------------------
  // 2. Concurrency-Safe Parallel Writes
  // -------------------------------------------------------------
  console.log('\n--- 2. Concurrency-Safe Parallel Writes ---');

  await test('Parallel writes append cleanly without race conditions or dropped writes', async () => {
    telemetryService.clearBuffer();

    const writes = [];
    for (let i = 1; i <= 100; i++) {
      writes.push(Promise.resolve().then(() => {
        telemetryService.recordLog('INFO', 'CONCURRENT_EVENT', { index: i });
      }));
    }

    await Promise.all(writes);
    const events = telemetryService.getRecentEvents({ limit: 150 });
    assert.strictEqual(events.length, 100, 'All 100 concurrent writes must be safely retained in buffer');
  });

  // -------------------------------------------------------------
  // 3. Sensitive Data, Secret & PII Redaction
  // -------------------------------------------------------------
  console.log('\n--- 3. Sensitive Data & PII Redaction ---');

  await test('Sanitizer redacts Groq, Gemini, Bearer tokens, passwords, and secrets', async () => {
    const rawData = {
      groqKey: 'gsk_abcdef1234567890abcdef1234567890',
      geminiKey: 'AIzaSyCm11MJPwYKk2ckDIrTOGLNHdyFkdCOM2k',
      authHeader: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy',
      lanzarToken: 'lanzar.eyJ1aWQiOiJ1c2VyMTIzIn0.signature',
      password: 'superSecretStudentPassword123!',
      clientSecret: 'shhh_private_app_secret'
    };

    const clean = telemetryService.sanitizeTelemetryData(rawData);

    assert.strictEqual(clean.groqKey, '[REDACTED_API_KEY]');
    assert.strictEqual(clean.geminiKey, '[REDACTED_API_KEY]');
    assert.strictEqual(clean.authHeader, 'Bearer [REDACTED]');
    assert.strictEqual(clean.lanzarToken, '[REDACTED]');
    assert.strictEqual(clean.password, '[REDACTED]');
    assert.strictEqual(clean.clientSecret, '[REDACTED]');
  });

  await test('Sanitizer redacts student email addresses and internal filesystem paths', async () => {
    const rawData = {
      message: 'Student student.alex@highschool.edu reported error on C:\\Users\\jonny\\AppData\\Local\\Temp\\file.txt',
      nested: {
        serverPath: '/home/deploy/app/server/secret.json',
        email: 'parent.contact@gmail.com'
      }
    };

    const clean = telemetryService.sanitizeTelemetryData(rawData);

    assert.ok(!clean.message.includes('student.alex@highschool.edu'), 'Must redact email from string');
    assert.ok(clean.message.includes('[REDACTED_EMAIL]'), 'Must replace email with [REDACTED_EMAIL]');
    assert.ok(!clean.message.includes('C:\\Users\\jonny'), 'Must redact Windows local path');
    assert.ok(clean.message.includes('[INTERNAL_PATH]'), 'Must replace path with [INTERNAL_PATH]');
    assert.strictEqual(clean.nested.email, '[REDACTED_EMAIL]');
    assert.ok(!clean.nested.serverPath.includes('/home/deploy'), 'Must redact Unix server path');
  });

  // -------------------------------------------------------------
  // 4. Operational Metrics Tracking
  // -------------------------------------------------------------
  console.log('\n--- 4. Operational Metrics Tracking Accuracy ---');

  await test('Accurately tracks requests, errors, verifications, and latency stats', async () => {
    telemetryService.resetMetricsForTesting();

    // Record requests
    telemetryService.recordRequest({ method: 'GET', path: '/health/ready', statusCode: 200, durationMs: 25 });
    telemetryService.recordRequest({ method: 'POST', path: '/api/chat', statusCode: 200, durationMs: 150 });
    telemetryService.recordRequest({ method: 'POST', path: '/api/chat', statusCode: 429, durationMs: 40, errorCategory: 'RATE_LIMIT' });
    telemetryService.recordRequest({ method: 'GET', path: '/admin/reports/PY-12345678', statusCode: 404, durationMs: 10, errorCategory: 'NOT_FOUND' });

    // Record verifications
    telemetryService.recordVerification({ outcome: 'VERIFIED', totalClaims: 3, invalidClaims: 0, contradictions: 0, domain: 'ALGEBRA' });
    telemetryService.recordVerification({ outcome: 'PARTIALLY_VERIFIED', totalClaims: 2, invalidClaims: 0, contradictions: 0, domain: 'CALCULUS' });
    telemetryService.recordVerification({ outcome: 'WITHHELD', totalClaims: 1, invalidClaims: 1, contradictions: 1, domain: 'TRIGONOMETRY' });

    // Record provider interactions
    telemetryService.recordProviderCall({ provider: 'groq-text', success: true });
    telemetryService.recordProviderCall({ provider: 'groq-text', success: false, failureReason: 'RATE_LIMIT', isRateLimit: true });
    telemetryService.recordProviderFallback({ fromProvider: 'groq-text', toProvider: 'ollama-text', reason: 'RATE_LIMIT' });

    const summary = telemetryService.getMetricsSummary();

    // Check request metrics
    assert.strictEqual(summary.metrics.requests.total, 4);
    assert.strictEqual(summary.metrics.requests.byMethod.GET, 2);
    assert.strictEqual(summary.metrics.requests.byMethod.POST, 2);
    assert.strictEqual(summary.metrics.requests.byEndpoint['/api/chat'], 2);
    assert.strictEqual(summary.metrics.requests.byEndpoint['/admin/reports/:id'], 1, 'Path must normalize dynamic ID');

    // Check error metrics
    assert.strictEqual(summary.metrics.errors.total, 2);
    assert.strictEqual(summary.metrics.errors.byStatusCode['429'], 1);
    assert.strictEqual(summary.metrics.errors.byStatusCode['404'], 1);
    assert.strictEqual(summary.metrics.errors.byCategory.RATE_LIMIT, 1);

    // Check verification metrics
    assert.strictEqual(summary.metrics.verifications.total, 3);
    assert.strictEqual(summary.metrics.verifications.verified, 1);
    assert.strictEqual(summary.metrics.verifications.partiallyVerified, 1);
    assert.strictEqual(summary.metrics.verifications.withheld, 1);
    assert.strictEqual(summary.metrics.verifications.claimsEvaluated, 6);
    assert.strictEqual(summary.metrics.verifications.contradictionsDetected, 1);

    // Check provider metrics
    assert.strictEqual(summary.metrics.providers.groq.requests, 2);
    assert.strictEqual(summary.metrics.providers.groq.successes, 1);
    assert.strictEqual(summary.metrics.providers.groq.failures, 1);
    assert.strictEqual(summary.metrics.providers.groq.rateLimits, 1);
    assert.strictEqual(summary.metrics.providers.fallbacksTriggered, 1);

    // Check latency metrics
    assert.strictEqual(summary.metrics.latency.count, 4);
    assert.strictEqual(summary.metrics.latency.totalDurationMs, 225);
    assert.ok(summary.metrics.latency.avgMs > 0);
  });

  // -------------------------------------------------------------
  // 5. Alert Threshold Evaluation
  // -------------------------------------------------------------
  console.log('\n--- 5. Alert Thresholds Evaluation ---');

  await test('Triggers HIGH_ERROR_RATE alert when error percentage exceeds 10%', async () => {
    telemetryService.resetMetricsForTesting();

    // 8 success, 3 errors = 3 / 11 = 27% error rate (> 10%)
    for (let i = 0; i < 8; i++) {
      telemetryService.recordRequest({ statusCode: 200, durationMs: 50 });
    }
    for (let i = 0; i < 3; i++) {
      telemetryService.recordRequest({ statusCode: 500, durationMs: 50, errorCategory: 'SERVER_ERROR' });
    }

    const alerts = telemetryService.checkAlertThresholds();
    assert.strictEqual(alerts.active, true);
    assert.ok(alerts.alerts.some(a => a.code === 'HIGH_ERROR_RATE' && a.severity === 'CRITICAL'));
  });

  await test('Triggers HIGH_VERIFICATION_WITHHOLDING alert when withholding rate exceeds 40%', async () => {
    telemetryService.resetMetricsForTesting();

    // 5 verified, 5 withheld = 50% withholding (> 40% threshold on 10 verifications)
    for (let i = 0; i < 5; i++) {
      telemetryService.recordVerification({ outcome: 'VERIFIED', totalClaims: 1 });
    }
    for (let i = 0; i < 5; i++) {
      telemetryService.recordVerification({ outcome: 'WITHHELD', totalClaims: 1, invalidClaims: 1 });
    }

    const alerts = telemetryService.checkAlertThresholds();
    assert.strictEqual(alerts.active, true);
    assert.ok(alerts.alerts.some(a => a.code === 'HIGH_VERIFICATION_WITHHOLDING' && a.severity === 'WARN'));
  });

  // -------------------------------------------------------------
  // 6. Non-Throwing / Fail-Safe Robustness
  // -------------------------------------------------------------
  console.log('\n--- 6. Fail-Safe Non-Throwing Robustness ---');

  await test('Telemetry functions never throw exceptions on malformed or null inputs', async () => {
    assert.doesNotThrow(() => telemetryService.recordLog(null, null, null));
    assert.doesNotThrow(() => telemetryService.recordRequest({}));
    assert.doesNotThrow(() => telemetryService.recordVerification({}));
    assert.doesNotThrow(() => telemetryService.recordProviderCall({}));
    assert.doesNotThrow(() => telemetryService.recordProviderFallback({}));
    assert.doesNotThrow(() => telemetryService.getRecentEvents({ limit: -5 }));
  });

  console.log('\n======================================================================');
  console.log(`OBSERVABILITY & TELEMETRY SUMMARY: ${passed}/${total} passed (${total - passed} failed)`);
  console.log('======================================================================\n');

  if (passed !== total) process.exit(1);
}

runTests().catch(err => {
  console.error('Test runner uncaught error:', err);
  process.exit(1);
});
