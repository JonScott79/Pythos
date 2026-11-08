/**
 * test/test-groq-credential-remediation.js
 *
 * Pythos Groq API Key Fallback Security Review & Remediation Suite
 *
 * Requirements:
 * 1. Groq works when a valid test configuration is supplied through the environment.
 * 2. Groq is unavailable when GROQ_API_KEY is missing.
 * 3. No embedded fallback is used when the environment variable is missing across all environments.
 * 4. Provider failover behaves correctly when Groq is unavailable.
 * 5. The $0 budget guardrail remains strictly enforced (fail-closed).
 * 6. Public frontend staging (dist/) contains zero Groq credentials or gsk_ tokens.
 * 7. Provider-aware readiness probe correctly reflects Groq availability and missing key status.
 * 8. Tests must NOT contain or expose a real API key.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

process.env.NODE_ENV = 'test';

const providerPolicy = require('../server/providerPolicy');
const readinessCheck = require('../server/readinessCheck');

async function runTests() {
  console.log('======================================================================');
  console.log('PYTHOS GROQ CREDENTIAL SECURITY & REMEDIATION SUITE');
  console.log('======================================================================\n');

  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      console.log(`  ✓ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ [FAIL] ${name}`);
      console.error(`    ${err.message || err}`);
    }
  }

  async function testAsync(name, fn) {
    total++;
    try {
      await fn();
      console.log(`  ✓ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ [FAIL] ${name}`);
      console.error(`    ${err.message || err}`);
    }
  }

  // -------------------------------------------------------------
  // 1. Embedded Fallback Elimination
  // -------------------------------------------------------------
  console.log('--- 1. Embedded Credential Fallback Elimination ---');

  test('GROQ_EMBEDDED_KEY is not exported and not present in providerPolicy', () => {
    assert.strictEqual(providerPolicy.GROQ_EMBEDDED_KEY, undefined, 'GROQ_EMBEDDED_KEY must not exist');
  });

  test('getGroqApiKey() returns null when GROQ_API_KEY is unset (all NODE_ENV states)', () => {
    const savedKey = process.env.GROQ_API_KEY;
    const savedNodeEnv = process.env.NODE_ENV;
    const savedRailway = process.env.RAILWAY_ENVIRONMENT;

    const envPermutations = [
      { NODE_ENV: 'production', RAILWAY_ENVIRONMENT: 'production' },
      { NODE_ENV: 'production', RAILWAY_ENVIRONMENT: undefined },
      { NODE_ENV: 'development', RAILWAY_ENVIRONMENT: undefined },
      { NODE_ENV: 'test', RAILWAY_ENVIRONMENT: undefined },
      { NODE_ENV: undefined, RAILWAY_ENVIRONMENT: undefined }
    ];

    try {
      delete process.env.GROQ_API_KEY;

      for (const env of envPermutations) {
        if (env.NODE_ENV === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = env.NODE_ENV;

        if (env.RAILWAY_ENVIRONMENT === undefined) delete process.env.RAILWAY_ENVIRONMENT;
        else process.env.RAILWAY_ENVIRONMENT = env.RAILWAY_ENVIRONMENT;

        const resolved = providerPolicy.getGroqApiKey();
        assert.strictEqual(
          resolved,
          null,
          `getGroqApiKey() must return null when GROQ_API_KEY is unset under NODE_ENV='${env.NODE_ENV}'`
        );
      }
    } finally {
      if (savedKey !== undefined) process.env.GROQ_API_KEY = savedKey; else delete process.env.GROQ_API_KEY;
      if (savedNodeEnv !== undefined) process.env.NODE_ENV = savedNodeEnv; else delete process.env.NODE_ENV;
      if (savedRailway !== undefined) process.env.RAILWAY_ENVIRONMENT = savedRailway; else delete process.env.RAILWAY_ENVIRONMENT;
    }
  });

  test('getGroqApiKey() returns null for empty or whitespace-only GROQ_API_KEY', () => {
    const savedKey = process.env.GROQ_API_KEY;
    try {
      process.env.GROQ_API_KEY = '';
      assert.strictEqual(providerPolicy.getGroqApiKey(), null, 'Empty string must return null');

      process.env.GROQ_API_KEY = '   ';
      assert.strictEqual(providerPolicy.getGroqApiKey(), null, 'Whitespace-only string must return null');
    } finally {
      if (savedKey !== undefined) process.env.GROQ_API_KEY = savedKey; else delete process.env.GROQ_API_KEY;
    }
  });

  // -------------------------------------------------------------
  // 2. Legitimate Environment Configuration Activation
  // -------------------------------------------------------------
  console.log('\n--- 2. Legitimate Environment Configuration Activation ---');

  test('getGroqApiKey() returns trimmed key when valid non-empty key is supplied in environment', () => {
    const savedKey = process.env.GROQ_API_KEY;
    try {
      process.env.GROQ_API_KEY = '  gsk_mock_test_key_for_env_activation_validation_test  ';
      const resolved = providerPolicy.getGroqApiKey();
      assert.strictEqual(resolved, 'gsk_mock_test_key_for_env_activation_validation_test');
    } finally {
      if (savedKey !== undefined) process.env.GROQ_API_KEY = savedKey; else delete process.env.GROQ_API_KEY;
    }
  });

  test('Groq providers report isConfigured() = true only when GROQ_API_KEY is configured', () => {
    const savedKey = process.env.GROQ_API_KEY;
    try {
      delete process.env.GROQ_API_KEY;
      let registry = providerPolicy.getProviderRegistry();
      let groqText = registry.find(p => p.name === 'groq-text');
      let groqVision = registry.find(p => p.name === 'groq-qwen-vision');
      assert.strictEqual(groqText.isConfigured(), false, 'groq-text isConfigured must be false when key is unset');
      assert.strictEqual(groqVision.isConfigured(), false, 'groq-qwen-vision isConfigured must be false when key is unset');

      process.env.GROQ_API_KEY = 'gsk_mock_test_key_for_env_activation';
      registry = providerPolicy.getProviderRegistry();
      groqText = registry.find(p => p.name === 'groq-text');
      groqVision = registry.find(p => p.name === 'groq-qwen-vision');
      assert.strictEqual(groqText.isConfigured(), true, 'groq-text isConfigured must be true when key is set');
      assert.strictEqual(groqVision.isConfigured(), true, 'groq-qwen-vision isConfigured must be true when key is set');
    } finally {
      if (savedKey !== undefined) process.env.GROQ_API_KEY = savedKey; else delete process.env.GROQ_API_KEY;
    }
  });

  // -------------------------------------------------------------
  // 3. Provider Selection & Failover Behavior
  // -------------------------------------------------------------
  console.log('\n--- 3. Provider Selection & Failover Behavior ---');

  test('Groq is selected as primary when configured via environment', () => {
    const savedKey = process.env.GROQ_API_KEY;
    const savedPrimary = process.env.PRIMARY_TEXT_PROVIDER;
    try {
      process.env.PRIMARY_TEXT_PROVIDER = 'groq-text';
      process.env.GROQ_API_KEY = 'gsk_mock_test_key_for_selection';

      providerPolicy.clearRateLimits();
      const selection = providerPolicy.selectProvider({ capability: 'text', budgetMode: 'free_only', aiEnabled: true });
      assert.notStrictEqual(selection.provider, null);
      assert.strictEqual(selection.provider.name, 'groq-text');
      assert.strictEqual(selection.reason, 'SELECTED');
    } finally {
      if (savedKey !== undefined) process.env.GROQ_API_KEY = savedKey; else delete process.env.GROQ_API_KEY;
      if (savedPrimary !== undefined) process.env.PRIMARY_TEXT_PROVIDER = savedPrimary; else delete process.env.PRIMARY_TEXT_PROVIDER;
    }
  });

  test('Failover to alternative healthy free provider occurs cleanly when GROQ_API_KEY is missing', () => {
    const savedGroqKey = process.env.GROQ_API_KEY;
    const savedPrimary = process.env.PRIMARY_TEXT_PROVIDER;
    const savedOllama = process.env.OLLAMA_ENABLED;
    const savedGeminiTier = process.env.GEMINI_FREE_TIER;
    const savedGeminiKey = process.env.GEMINI_API_KEY;

    try {
      delete process.env.GROQ_API_KEY;
      process.env.PRIMARY_TEXT_PROVIDER = 'groq-text';
      providerPolicy.clearRateLimits();

      // Case A: Ollama enabled -> falls back to ollama-text
      process.env.OLLAMA_ENABLED = 'true';
      const selA = providerPolicy.selectProvider({ capability: 'text', budgetMode: 'free_only', aiEnabled: true });
      assert.notStrictEqual(selA.provider, null, 'Must select healthy fallback');
      assert.strictEqual(selA.provider.name, 'ollama-text');

      // Case B: Ollama disabled, Gemini free-tier certified -> falls back to gemini-text
      process.env.OLLAMA_ENABLED = 'false';
      process.env.GEMINI_FREE_TIER = 'true';
      process.env.GEMINI_API_KEY = 'AIzaSyMockKeyForGeminiTest';
      const selB = providerPolicy.selectProvider({ capability: 'text', budgetMode: 'free_only', aiEnabled: true });
      assert.notStrictEqual(selB.provider, null);
      assert.strictEqual(selB.provider.name, 'gemini-text');

      // Case C: No configured provider available -> reports NO_CONFIGURED_PROVIDER
      delete process.env.GEMINI_API_KEY;
      const selC = providerPolicy.selectProvider({ capability: 'text', budgetMode: 'free_only', aiEnabled: true });
      assert.strictEqual(selC.provider, null);
      assert.strictEqual(selC.reason, 'NO_CONFIGURED_PROVIDER');
    } finally {
      if (savedGroqKey !== undefined) process.env.GROQ_API_KEY = savedGroqKey; else delete process.env.GROQ_API_KEY;
      if (savedPrimary !== undefined) process.env.PRIMARY_TEXT_PROVIDER = savedPrimary; else delete process.env.PRIMARY_TEXT_PROVIDER;
      if (savedOllama !== undefined) process.env.OLLAMA_ENABLED = savedOllama; else delete process.env.OLLAMA_ENABLED;
      if (savedGeminiTier !== undefined) process.env.GEMINI_FREE_TIER = savedGeminiTier; else delete process.env.GEMINI_FREE_TIER;
      if (savedGeminiKey !== undefined) process.env.GEMINI_API_KEY = savedGeminiKey; else delete process.env.GEMINI_API_KEY;
    }
  });

  // -------------------------------------------------------------
  // 4. $0 Budget Guardrail Preservation
  // -------------------------------------------------------------
  console.log('\n--- 4. $0 Budget Guardrail Preservation ---');

  test('Missing GROQ_API_KEY never triggers uncertified/paid provider usage under free_only', () => {
    const savedGroqKey = process.env.GROQ_API_KEY;
    const savedOllama = process.env.OLLAMA_ENABLED;
    const savedGeminiTier = process.env.GEMINI_FREE_TIER;
    const savedGeminiKey = process.env.GEMINI_API_KEY;

    try {
      delete process.env.GROQ_API_KEY;
      process.env.OLLAMA_ENABLED = 'false'; // Ollama offline

      // Gemini is configured with API key BUT freeEligible is false (unverified/paid billing account)
      delete process.env.GEMINI_FREE_TIER;
      process.env.GEMINI_API_KEY = 'AIzaSyMockPaidKey';

      providerPolicy.clearRateLimits();
      const selection = providerPolicy.selectProvider({ capability: 'text', budgetMode: 'free_only', aiEnabled: true });

      assert.strictEqual(selection.provider, null, 'Uncertified paid provider must never be selected in free_only');
      assert.strictEqual(selection.reason, 'COST_GUARDRAIL_BLOCKED');
    } finally {
      if (savedGroqKey !== undefined) process.env.GROQ_API_KEY = savedGroqKey; else delete process.env.GROQ_API_KEY;
      if (savedOllama !== undefined) process.env.OLLAMA_ENABLED = savedOllama; else delete process.env.OLLAMA_ENABLED;
      if (savedGeminiTier !== undefined) process.env.GEMINI_FREE_TIER = savedGeminiTier; else delete process.env.GEMINI_FREE_TIER;
      if (savedGeminiKey !== undefined) process.env.GEMINI_API_KEY = savedGeminiKey; else delete process.env.GEMINI_API_KEY;
    }
  });

  // -------------------------------------------------------------
  // 5. Provider-Aware Readiness Probe Integration
  // -------------------------------------------------------------
  console.log('\n--- 5. Provider-Aware Readiness Probe Integration ---');

  await testAsync('GET /health/ready reports degraded status when Groq is primary but key is missing', async () => {
    const savedGroqKey = process.env.GROQ_API_KEY;
    const savedPrimary = process.env.PRIMARY_TEXT_PROVIDER;
    const savedOllama = process.env.OLLAMA_ENABLED;

    try {
      delete process.env.GROQ_API_KEY;
      process.env.PRIMARY_TEXT_PROVIDER = 'groq-text';
      process.env.OLLAMA_ENABLED = 'false';

      const mockCas = () => ({ available: true, sympyVersion: '1.14.0' });
      const report = await readinessCheck.checkReadiness({
        skipNetworkProbe: true,
        getCasTelemetry: mockCas
      });

      assert.strictEqual(report.status, 'degraded');
      assert.strictEqual(report.checks.llm.status, 'degraded');
      assert.strictEqual(report.checks.llm.provider, 'none');
      assert.strictEqual(report.checks.llm.reason, 'NO_CONFIGURED_PROVIDER');
    } finally {
      if (savedGroqKey !== undefined) process.env.GROQ_API_KEY = savedGroqKey; else delete process.env.GROQ_API_KEY;
      if (savedPrimary !== undefined) process.env.PRIMARY_TEXT_PROVIDER = savedPrimary; else delete process.env.PRIMARY_TEXT_PROVIDER;
      if (savedOllama !== undefined) process.env.OLLAMA_ENABLED = savedOllama; else delete process.env.OLLAMA_ENABLED;
    }
  });

  await testAsync('GET /health/ready reports ready status when Groq is primary and valid key is supplied', async () => {
    const savedGroqKey = process.env.GROQ_API_KEY;
    const savedPrimary = process.env.PRIMARY_TEXT_PROVIDER;

    try {
      process.env.GROQ_API_KEY = 'gsk_mock_valid_test_key_for_readiness';
      process.env.PRIMARY_TEXT_PROVIDER = 'groq-text';

      const mockCas = () => ({ available: true, sympyVersion: '1.14.0' });
      const report = await readinessCheck.checkReadiness({
        skipNetworkProbe: true,
        getCasTelemetry: mockCas
      });

      assert.strictEqual(report.status, 'ready');
      assert.strictEqual(report.checks.llm.status, 'ready');
      assert.strictEqual(report.checks.llm.provider, 'groq');
      assert.strictEqual(report.checks.cas.status, 'ready');
    } finally {
      if (savedGroqKey !== undefined) process.env.GROQ_API_KEY = savedGroqKey; else delete process.env.GROQ_API_KEY;
      if (savedPrimary !== undefined) process.env.PRIMARY_TEXT_PROVIDER = savedPrimary; else delete process.env.PRIMARY_TEXT_PROVIDER;
    }
  });

  // -------------------------------------------------------------
  // 6. Public Build & Staging Credential Isolation
  // -------------------------------------------------------------
  console.log('\n--- 6. Public Build & Staging Credential Isolation ---');

  test('Public dist/ staging contains zero gsk_ credentials or Groq tokens', () => {
    const ROOT = path.resolve(__dirname, '..');
    const stageScript = path.join(ROOT, 'scripts', 'stage-public.js');
    execSync(`node "${stageScript}"`, { cwd: ROOT, stdio: 'pipe' });

    const distPath = path.join(ROOT, 'dist');
    assert.ok(fs.existsSync(distPath), 'dist/ directory must exist');

    const gskRegex = /gsk_[a-zA-Z0-9_-]{10,}/;

    function scanDirectory(dir) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanDirectory(fullPath);
        } else if (entry.isFile()) {
          const content = fs.readFileSync(fullPath, 'utf8');
          assert.ok(!gskRegex.test(content), `Found potential Groq key matching gsk_ in staged file: ${fullPath}`);
          assert.ok(!content.includes('GROQ_EMBEDDED_KEY'), `Found reference to GROQ_EMBEDDED_KEY in staged file: ${fullPath}`);
        }
      }
    }

    scanDirectory(distPath);
  });

  // -------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------
  console.log('\n======================================================================');
  console.log(`GROQ CREDENTIAL REMEDIATION SUMMARY: ${passed}/${total} passed (${total - passed} failed)`);
  console.log('======================================================================\n');

  if (passed !== total) process.exit(1);
}

runTests().catch(err => {
  console.error('Test runner uncaught error:', err);
  process.exit(1);
});
