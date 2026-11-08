/**
 * test/test-provider-aware-readiness.js
 *
 * Pythos Milestone 2.2: Provider-Aware Readiness & CAS Verification Suite (MEDIUM-03)
 *
 * Verifies:
 * 1. Readiness checks reflect the actually configured provider (Groq, Gemini, Ollama).
 * 2. When Groq or Gemini is configured, Ollama availability is NOT a prerequisite.
 * 3. Probes required CAS (SymPy) dependencies and fails degraded if SymPy is missing.
 * 4. Distinguishes liveness (/health -> 200 ok) from readiness (/health/ready -> 200/503).
 * 5. Returns structured status without exposing credentials, internal configs, or binary paths.
 * 6. Handles rate-limited providers, missing configurations, and network failures gracefully.
 */

const assert = require('assert');
const http = require('http');
const express = require('../server/node_modules/express');
const { checkReadiness, checkLlmReadiness, checkCasReadiness, toSafeProviderFamily } = require('../server/readinessCheck');
const providerPolicy = require('../server/providerPolicy');

async function runTests() {
  console.log('======================================================================');
  console.log('PYTHOS MILESTONE 2.2: PROVIDER-AWARE READINESS VERIFICATION (MEDIUM-03)');
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

  // Preserve initial environment
  const origEnv = { ...process.env };

  // Helper to reset policy rate limits and test env overrides
  function resetPolicy() {
    providerPolicy.clearRateLimits();
    delete process.env.PRIMARY_TEXT_PROVIDER;
    delete process.env.GROQ_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_FREE_TIER;
    delete process.env.OLLAMA_HOST;
    delete process.env.OLLAMA_ENABLED;
  }

  // -------------------------------------------------------------
  // 1. Safe Provider Family Normalization & Information Sanitization
  // -------------------------------------------------------------
  console.log('--- 1. Safe Normalization & Sanitization ---');

  test('toSafeProviderFamily sanitizes provider names to generic families', () => {
    assert.strictEqual(toSafeProviderFamily('groq-text'), 'groq');
    assert.strictEqual(toSafeProviderFamily('groq-qwen-vision'), 'groq');
    assert.strictEqual(toSafeProviderFamily('gemini-text'), 'gemini');
    assert.strictEqual(toSafeProviderFamily('gemini-2.5-flash'), 'gemini');
    assert.strictEqual(toSafeProviderFamily('ollama-text'), 'ollama');
    assert.strictEqual(toSafeProviderFamily(null), 'none');
    assert.strictEqual(toSafeProviderFamily(''), 'none');
  });

  // -------------------------------------------------------------
  // 2. Groq-Configured Readiness (Ollama Independence)
  // -------------------------------------------------------------
  console.log('\n--- 2. Groq-Configured Readiness (Ollama Independence) ---');

  await test('Groq configured + CAS available yields ready status without requiring Ollama', async () => {
    resetPolicy();
    process.env.PRIMARY_TEXT_PROVIDER = 'groq-text';
    process.env.GROQ_API_KEY = 'gsk_test_mock_groq_api_key_for_verification_testing';
    process.env.OLLAMA_HOST = 'http://127.0.0.1:9999'; // Intentionally dead port

    const mockCas = () => ({ available: true, sympyVersion: '1.14.0' });
    const result = await checkReadiness({
      skipNetworkProbe: true,
      getCasTelemetry: mockCas
    });

    assert.strictEqual(result.status, 'ready');
    assert.strictEqual(result.service, 'pythos-api');
    assert.strictEqual(result.checks.llm.status, 'ready');
    assert.strictEqual(result.checks.llm.provider, 'groq');
    assert.strictEqual(result.checks.cas.status, 'ready');
    assert.strictEqual(result.checks.cas.engine, 'sympy');
    assert.strictEqual(result.checks.llm.reason, undefined);
  });

  await test('Gemini configured + CAS available yields ready status without requiring Ollama', async () => {
    resetPolicy();
    process.env.PRIMARY_TEXT_PROVIDER = 'gemini-text';
    process.env.GEMINI_API_KEY = 'AIzaSy_test_mock_gemini_api_key';
    process.env.GEMINI_FREE_TIER = 'true';
    process.env.OLLAMA_HOST = 'http://127.0.0.1:9999'; // Intentionally dead port

    const mockCas = () => ({ available: true, sympyVersion: '1.14.0' });
    const result = await checkReadiness({
      skipNetworkProbe: true,
      getCasTelemetry: mockCas
    });

    assert.strictEqual(result.status, 'ready');
    assert.strictEqual(result.checks.llm.status, 'ready');
    assert.strictEqual(result.checks.llm.provider, 'gemini');
    assert.strictEqual(result.checks.cas.status, 'ready');
  });

  // -------------------------------------------------------------
  // 3. Ollama Provider Probing
  // -------------------------------------------------------------
  console.log('\n--- 3. Ollama Provider Probing ---');

  await test('Ollama configured and reachable yields ready status', async () => {
    resetPolicy();
    // Start temporary local mock HTTP server simulating healthy Ollama
    const mockOllama = http.createServer((req, res) => {
      if (req.url === '/api/tags') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ models: [{ name: 'pythos:latest' }] }));
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    await new Promise(resolve => mockOllama.listen(0, '127.0.0.1', resolve));
    const port = mockOllama.address().port;

    try {
      process.env.PRIMARY_TEXT_PROVIDER = 'ollama-text';
      process.env.OLLAMA_HOST = `http://127.0.0.1:${port}`;
      process.env.OLLAMA_ENABLED = 'true';

      const mockCas = () => ({ available: true, sympyVersion: '1.14.0' });
      const result = await checkReadiness({
        getCasTelemetry: mockCas
      });

      assert.strictEqual(result.status, 'ready');
      assert.strictEqual(result.checks.llm.status, 'ready');
      assert.strictEqual(result.checks.llm.provider, 'ollama');
    } finally {
      await new Promise(resolve => mockOllama.close(resolve));
    }
  });

  await test('Ollama configured but unreachable yields degraded status with reason', async () => {
    resetPolicy();
    process.env.PRIMARY_TEXT_PROVIDER = 'ollama-text';
    process.env.OLLAMA_HOST = 'http://127.0.0.1:9998'; // Dead port
    process.env.OLLAMA_ENABLED = 'true';

    const mockCas = () => ({ available: true, sympyVersion: '1.14.0' });
    const result = await checkReadiness({
      probeTimeoutMs: 500,
      getCasTelemetry: mockCas
    });

    assert.strictEqual(result.status, 'degraded');
    assert.strictEqual(result.checks.llm.status, 'degraded');
    assert.strictEqual(result.checks.llm.provider, 'ollama');
    assert.strictEqual(result.checks.llm.reason, 'OLLAMA_UNREACHABLE');
  });

  // -------------------------------------------------------------
  // 4. Rate-Limiting & Missing Configuration Degraded States
  // -------------------------------------------------------------
  console.log('\n--- 4. Rate Limiting & Missing Configuration States ---');

  await test('Provider in active rate-limit cooldown yields degraded status with RATE_LIMITED', async () => {
    resetPolicy();
    process.env.PRIMARY_TEXT_PROVIDER = 'groq-text';
    process.env.GROQ_API_KEY = 'gsk_test_key';
    process.env.OLLAMA_ENABLED = 'false';
    providerPolicy.recordRateLimit('groq-text', 60);

    const mockCas = () => ({ available: true, sympyVersion: '1.14.0' });
    const result = await checkReadiness({
      skipNetworkProbe: true,
      getCasTelemetry: mockCas
    });

    assert.strictEqual(result.status, 'degraded');
    assert.strictEqual(result.checks.llm.status, 'degraded');
    assert.strictEqual(result.checks.llm.reason, 'RATE_LIMITED');
  });

  await test('Missing provider configuration yields degraded status with NO_CONFIGURED_PROVIDER', async () => {
    resetPolicy();
    delete process.env.PRIMARY_TEXT_PROVIDER;
    delete process.env.GROQ_API_KEY;
    delete process.env.GEMINI_API_KEY;
    process.env.OLLAMA_ENABLED = 'false';

    // Mock policy that reports no configured provider
    const mockPolicy = {
      selectProvider: () => ({ provider: null, reason: 'NO_CONFIGURED_PROVIDER' }),
      isProviderRateLimited: () => false
    };

    const mockCas = () => ({ available: true, sympyVersion: '1.14.0' });
    const result = await checkReadiness({
      providerPolicy: mockPolicy,
      getCasTelemetry: mockCas
    });

    assert.strictEqual(result.status, 'degraded');
    assert.strictEqual(result.checks.llm.status, 'degraded');
    assert.strictEqual(result.checks.llm.provider, 'none');
    assert.strictEqual(result.checks.llm.reason, 'NO_CONFIGURED_PROVIDER');
  });

  // -------------------------------------------------------------
  // 5. CAS (SymPy) Dependency Probing & Failure Degradation
  // -------------------------------------------------------------
  console.log('\n--- 5. CAS (SymPy) Dependency Verification ---');

  await test('CAS unavailable yields degraded overall status even when LLM is ready', async () => {
    resetPolicy();
    process.env.PRIMARY_TEXT_PROVIDER = 'groq-text';
    process.env.GROQ_API_KEY = 'gsk_test_mock';

    const mockCas = () => ({ available: false, error: 'SymPy not found' });
    const result = await checkReadiness({
      skipNetworkProbe: true,
      getCasTelemetry: mockCas
    });

    assert.strictEqual(result.status, 'degraded');
    assert.strictEqual(result.checks.llm.status, 'ready');
    assert.strictEqual(result.checks.cas.status, 'degraded');
    assert.strictEqual(result.checks.cas.engine, 'sympy');
    assert.strictEqual(result.checks.cas.reason, 'SYMPY_UNAVAILABLE');
  });

  await test('Live system Python + SymPy CAS probe succeeds on current host environment', async () => {
    const casResult = checkCasReadiness();
    assert.strictEqual(casResult.status, 'ready');
    assert.strictEqual(casResult.engine, 'sympy');
  });

  // -------------------------------------------------------------
  // 6. Security & Credential Leakage Prevention
  // -------------------------------------------------------------
  console.log('\n--- 6. Credential & Path Leakage Prevention ---');

  await test('checkReadiness output never leaks API keys, tokens, or filesystem paths', async () => {
    resetPolicy();
    process.env.PRIMARY_TEXT_PROVIDER = 'groq-text';
    process.env.GROQ_API_KEY = 'gsk_super_secret_production_key_xyz123';

    const result = await checkReadiness({
      skipNetworkProbe: true
    });

    const serialized = JSON.stringify(result);
    assert.ok(!serialized.includes('gsk_super_secret'), 'Must never leak Groq API key in readiness output');
    assert.ok(!serialized.includes('python.exe'), 'Must never leak absolute binary path');
    assert.ok(!serialized.includes('/opt/venv'), 'Must never leak venv path');
    assert.ok(!serialized.includes('C:\\Users'), 'Must never leak user home path');
  });

  // -------------------------------------------------------------
  // 7. HTTP Endpoint Parity: /health (Liveness) vs /health/ready (Readiness)
  // -------------------------------------------------------------
  console.log('\n--- 7. Liveness (/health) vs Readiness (/health/ready) HTTP Parity ---');

  await test('GET /health returns 200 ok and GET /health/ready reflects provider-aware readiness', async () => {
    resetPolicy();
    process.env.PRIMARY_TEXT_PROVIDER = 'groq-text';
    process.env.GROQ_API_KEY = 'gsk_test_key';

    const app = express();
    const pkg = require('../server/package.json');

    // Mount liveness
    app.get('/health', (req, res) => {
      res.status(200).json({
        status: 'ok',
        service: 'pythos-api',
        version: pkg.version,
        timestamp: new Date().toISOString()
      });
    });

    // Mount readiness
    app.get('/health/ready', async (req, res) => {
      const report = await checkReadiness({ skipNetworkProbe: true });
      const httpStatus = report.status === 'ready' ? 200 : 503;
      res.status(httpStatus).json(report);
    });

    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;

    try {
      // 1. Check Liveness
      const livenessRes = await fetch(`http://127.0.0.1:${port}/health`);
      assert.strictEqual(livenessRes.status, 200);
      const livenessBody = await livenessRes.json();
      assert.strictEqual(livenessBody.status, 'ok');
      assert.strictEqual(livenessBody.service, 'pythos-api');
      assert.strictEqual(livenessBody.version, pkg.version);

      // 2. Check Readiness
      const readinessRes = await fetch(`http://127.0.0.1:${port}/health/ready`);
      assert.strictEqual(readinessRes.status, 200);
      const readinessBody = await readinessRes.json();
      assert.strictEqual(readinessBody.status, 'ready');
      assert.strictEqual(readinessBody.checks.llm.status, 'ready');
      assert.strictEqual(readinessBody.checks.llm.provider, 'groq');
      assert.strictEqual(readinessBody.checks.cas.status, 'ready');
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });

  // Restore environment
  for (const k of Object.keys(process.env)) {
    if (!(k in origEnv)) delete process.env[k];
  }
  Object.assign(process.env, origEnv);

  console.log('\n======================================================================');
  console.log(`PROVIDER-AWARE READINESS SUMMARY: ${passed}/${total} passed (${total - passed} failed)`);
  console.log('======================================================================\n');

  if (passed !== total) process.exit(1);
}

runTests().catch(err => {
  console.error('Test runner uncaught error:', err);
  process.exit(1);
});
