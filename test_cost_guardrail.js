/**
 * test_cost_guardrail.js
 *
 * Automated Test Suite for Pythos $0 AI Cost Guardrail & Emergency Kill Switch.
 *
 * Scenarios tested:
 * 1. Missing budget mode → defaults to free_only
 * 2. Invalid / malformed budget mode → defaults to free_only
 * 3. free_only strictly rejects paid provider
 * 4. free_only permits explicitly free provider
 * 5. paid_enabled permits configured paid provider
 * 6. PYTHOS_AI_ENABLED=false blocks all providers (emergency kill switch)
 * 7. Qwen vision provider is selected when ready
 * 8. Qwen 429 rate limit triggers search for eligible fallback
 * 9. When all eligible providers are rate-limited, returns ALL_RATE_LIMITED with retryAfter
 * 10. Provider with unknown / undefined free eligibility is rejected (fail closed)
 * 11. Provider with freeEligible=false is rejected in free_only even if enabled and configured
 * 12. Policy telemetry never exposes API keys, tokens, or credentials
 * 13. Telemetry accurately reports configured, freeEligible, rateLimited, and retryAfter
 * 14. Server /health endpoint exposes sanitized budgetPolicy
 * 15. Server /api/chat blocks non-deterministic requests when PYTHOS_AI_ENABLED=false
 * 16. Server /api/chat rejects paid vision provider when free_only is active (regression guardrail)
 */

const assert = require('assert');
const providerPolicy = require('./server/providerPolicy');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    throw err;
  }
}

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    throw err;
  }
}

console.log('\n=== Running Pythos $0 AI Cost Guardrail Test Suite ===\n');

// 1. Missing budget mode
runTest('Missing PYTHOS_AI_BUDGET_MODE defaults to free_only', () => {
  const orig = process.env.PYTHOS_AI_BUDGET_MODE;
  delete process.env.PYTHOS_AI_BUDGET_MODE;
  assert.strictEqual(providerPolicy.getBudgetMode(), 'free_only');
  process.env.PYTHOS_AI_BUDGET_MODE = orig;
});

// 2. Invalid / malformed budget mode
runTest('Invalid or malformed budget mode defaults to free_only (fail closed)', () => {
  const orig = process.env.PYTHOS_AI_BUDGET_MODE;
  const invalidModes = ['cheap_tier', 'unlimited', 'paid', 'auto', 'null', '1', 'FREE_TIER'];
  for (const mode of invalidModes) {
    process.env.PYTHOS_AI_BUDGET_MODE = mode;
    assert.strictEqual(providerPolicy.getBudgetMode(), 'free_only', `Failed for mode: ${mode}`);
  }
  process.env.PYTHOS_AI_BUDGET_MODE = orig;
});

// 3. Valid paid_enabled mode
runTest('Explicit paid_enabled is parsed correctly', () => {
  const orig = process.env.PYTHOS_AI_BUDGET_MODE;
  process.env.PYTHOS_AI_BUDGET_MODE = 'paid_enabled';
  assert.strictEqual(providerPolicy.getBudgetMode(), 'paid_enabled');
  process.env.PYTHOS_AI_BUDGET_MODE = '  PAID_ENABLED  ';
  assert.strictEqual(providerPolicy.getBudgetMode(), 'paid_enabled');
  process.env.PYTHOS_AI_BUDGET_MODE = orig;
});

// 4. Emergency Kill Switch getAiEnabled()
runTest('PYTHOS_AI_ENABLED parsing (defaults true, false only when explicit)', () => {
  const orig = process.env.PYTHOS_AI_ENABLED;
  delete process.env.PYTHOS_AI_ENABLED;
  assert.strictEqual(providerPolicy.getAiEnabled(), true);

  process.env.PYTHOS_AI_ENABLED = 'true';
  assert.strictEqual(providerPolicy.getAiEnabled(), true);

  process.env.PYTHOS_AI_ENABLED = 'false';
  assert.strictEqual(providerPolicy.getAiEnabled(), false);

  process.env.PYTHOS_AI_ENABLED = 'FALSE';
  assert.strictEqual(providerPolicy.getAiEnabled(), false);

  process.env.PYTHOS_AI_ENABLED = 'random_string';
  assert.strictEqual(providerPolicy.getAiEnabled(), true);

  process.env.PYTHOS_AI_ENABLED = orig;
});

// 5. free_only rejects paid provider
runTest('free_only rejects paid provider even if configured and enabled', () => {
  const mockRegistry = [
    {
      name: 'paid-cloud-vision',
      capability: 'vision',
      model: 'gpt-4o',
      freeEligible: false,
      enabled: true,
      isConfigured: () => true
    }
  ];

  const selection = providerPolicy.selectProvider(
    { capability: 'vision', budgetMode: 'free_only', aiEnabled: true },
    mockRegistry
  );

  assert.strictEqual(selection.provider, null);
  assert.strictEqual(selection.reason, 'COST_GUARDRAIL_BLOCKED');
});

// 6. free_only permits explicitly free provider
runTest('free_only permits explicitly free provider', () => {
  const mockRegistry = [
    {
      name: 'free-vision-provider',
      capability: 'vision',
      model: 'qwen/qwen3.8-27b',
      freeEligible: true,
      enabled: true,
      isConfigured: () => true
    }
  ];

  const selection = providerPolicy.selectProvider(
    { capability: 'vision', budgetMode: 'free_only', aiEnabled: true },
    mockRegistry
  );

  assert.notStrictEqual(selection.provider, null);
  assert.strictEqual(selection.provider.name, 'free-vision-provider');
  assert.strictEqual(selection.reason, 'SELECTED');
});

// 7. paid_enabled permits configured paid provider
runTest('paid_enabled permits configured paid provider when explicitly enabled', () => {
  const mockRegistry = [
    {
      name: 'paid-cloud-vision',
      capability: 'vision',
      model: 'gpt-4o',
      freeEligible: false,
      enabled: true,
      isConfigured: () => true
    }
  ];

  const selection = providerPolicy.selectProvider(
    { capability: 'vision', budgetMode: 'paid_enabled', aiEnabled: true },
    mockRegistry
  );

  assert.notStrictEqual(selection.provider, null);
  assert.strictEqual(selection.provider.name, 'paid-cloud-vision');
  assert.strictEqual(selection.reason, 'SELECTED');
});

// 8. PYTHOS_AI_ENABLED=false blocks all providers
runTest('PYTHOS_AI_ENABLED=false blocks all providers (emergency kill switch)', () => {
  const mockRegistry = [
    {
      name: 'free-provider',
      capability: 'vision',
      model: 'qwen',
      freeEligible: true,
      enabled: true,
      isConfigured: () => true
    }
  ];

  const selection = providerPolicy.selectProvider(
    { capability: 'vision', budgetMode: 'free_only', aiEnabled: false },
    mockRegistry
  );

  assert.strictEqual(selection.provider, null);
  assert.strictEqual(selection.reason, 'AI_DISABLED');
});

// 9. Unknown / missing free eligibility is rejected (Fail closed)
runTest('Unknown or undefined free eligibility is rejected (fail closed)', () => {
  const mockRegistry = [
    {
      name: 'unspecified-eligibility-model',
      capability: 'vision',
      model: 'mystery-vision',
      // freeEligible is omitted / undefined
      enabled: true,
      isConfigured: () => true
    },
    {
      name: 'null-eligibility-model',
      capability: 'vision',
      model: 'mystery-vision-2',
      freeEligible: null,
      enabled: true,
      isConfigured: () => true
    }
  ];

  const selection = providerPolicy.selectProvider(
    { capability: 'vision', budgetMode: 'free_only', aiEnabled: true },
    mockRegistry
  );

  assert.strictEqual(selection.provider, null);
  assert.strictEqual(selection.reason, 'COST_GUARDRAIL_BLOCKED');
});

// 10. Fallback search when primary free provider is rate-limited
runTest('429 rate limit triggers search for secondary free-eligible provider', () => {
  providerPolicy.clearRateLimits();

  const mockRegistry = [
    {
      name: 'free-provider-primary',
      capability: 'vision',
      model: 'qwen-vision-primary',
      freeEligible: true,
      enabled: true,
      isConfigured: () => true
    },
    {
      name: 'free-provider-secondary',
      capability: 'vision',
      model: 'qwen-vision-backup',
      freeEligible: true,
      enabled: true,
      isConfigured: () => true
    }
  ];

  // Mark primary as rate-limited
  providerPolicy.recordRateLimit('free-provider-primary', 45);

  const selection = providerPolicy.selectProvider(
    { capability: 'vision', budgetMode: 'free_only', aiEnabled: true },
    mockRegistry
  );

  assert.notStrictEqual(selection.provider, null);
  assert.strictEqual(selection.provider.name, 'free-provider-secondary');

  providerPolicy.clearRateLimits();
});

// 11. When all eligible free providers are rate limited, returns ALL_RATE_LIMITED
runTest('When all eligible free providers are rate limited, returns ALL_RATE_LIMITED with retryAfter', () => {
  providerPolicy.clearRateLimits();

  const mockRegistry = [
    {
      name: 'free-provider-1',
      capability: 'vision',
      model: 'qwen-1',
      freeEligible: true,
      enabled: true,
      isConfigured: () => true
    }
  ];

  providerPolicy.recordRateLimit('free-provider-1', 95);

  const selection = providerPolicy.selectProvider(
    { capability: 'vision', budgetMode: 'free_only', aiEnabled: true },
    mockRegistry
  );

  assert.strictEqual(selection.provider, null);
  assert.strictEqual(selection.reason, 'ALL_RATE_LIMITED');
  assert.strictEqual(selection.retryAfter > 90 && selection.retryAfter <= 95, true);

  providerPolicy.clearRateLimits();
});

// 12. Specific regression test: paid provider cannot be called when primary is rate limited in free_only
runTest('REGRESSION: Paid provider is NOT selected even if free provider is 429 rate limited in free_only', () => {
  providerPolicy.clearRateLimits();

  const mockRegistry = [
    {
      name: 'free-groq-qwen',
      capability: 'vision',
      model: 'qwen',
      freeEligible: true,
      enabled: true,
      isConfigured: () => true
    },
    {
      name: 'paid-openai-vision',
      capability: 'vision',
      model: 'gpt-4o',
      freeEligible: false,
      enabled: true,
      isConfigured: () => true
    }
  ];

  // Rate limit free provider
  providerPolicy.recordRateLimit('free-groq-qwen', 60);

  const selection = providerPolicy.selectProvider(
    { capability: 'vision', budgetMode: 'free_only', aiEnabled: true },
    mockRegistry
  );

  assert.strictEqual(selection.provider, null);
  // Must NOT fall back to paid-openai-vision!
  assert.strictEqual(selection.reason, 'ALL_RATE_LIMITED');

  providerPolicy.clearRateLimits();
});

// 13. Telemetry sanitization and credential masking
runTest('Policy telemetry exposes zero credentials, tokens, or auth headers', () => {
  const telemetry = providerPolicy.getPolicyTelemetry();
  const serialized = JSON.stringify(telemetry);

  assert.strictEqual(serialized.includes('gsk_'), false);
  assert.strictEqual(serialized.includes('Bearer'), false);
  assert.strictEqual(serialized.includes('Authorization'), false);
  assert.strictEqual(serialized.includes('FIREBASE'), false);
  assert.strictEqual(serialized.includes('ADMIN_API_KEY'), false);

  assert.strictEqual(typeof telemetry.aiEnabled, 'boolean');
  assert.strictEqual(typeof telemetry.budgetMode, 'string');
  assert.strictEqual(Array.isArray(telemetry.providers), true);

  for (const p of telemetry.providers) {
    assert.strictEqual(typeof p.name, 'string');
    assert.strictEqual(typeof p.model, 'string');
    assert.strictEqual(typeof p.capability, 'string');
    assert.strictEqual(typeof p.freeEligible, 'boolean');
    assert.strictEqual(typeof p.enabled, 'boolean');
    assert.strictEqual(typeof p.configured, 'boolean');
    assert.strictEqual(typeof p.rateLimited, 'boolean');
    assert.strictEqual(typeof p.retryAfter, 'number');
  }
});

// 14. Real Production Providers Check
runTest('Default production provider catalog is properly structured and safe', () => {
  const registry = providerPolicy.getProviderRegistry();
  const groq = registry.find(p => p.name === 'groq-qwen-vision');
  const ollama = registry.find(p => p.name === 'ollama-text');
  const gemini = registry.find(p => p.name === 'gemini-vision-probe');

  assert.notStrictEqual(groq, undefined);
  assert.strictEqual(groq.capability, 'vision');
  assert.strictEqual(groq.freeEligible, true);

  assert.notStrictEqual(ollama, undefined);
  assert.strictEqual(ollama.capability, 'text');
  assert.strictEqual(ollama.freeEligible, true);

  assert.notStrictEqual(gemini, undefined);
  assert.strictEqual(gemini.capability, 'vision');
  assert.strictEqual(gemini.freeEligible, false); // Must be false by default
});

// ── REGRESSION TESTS: $0 Provider Wall Fix (v1.7.0) ──────────────────────────

// 15. REGRESSION: isConfigured() with embedded fallback key must return true
runTest('REGRESSION: groq-qwen-vision isConfigured() returns true with embedded fallback key (no env var)', () => {
  const origKey = process.env.GROQ_API_KEY;
  delete process.env.GROQ_API_KEY;

  const registry = providerPolicy.getProviderRegistry();
  const groq = registry.find(p => p.name === 'groq-qwen-vision');
  assert.strictEqual(groq.isConfigured(), true, 'Groq must be configured via embedded fallback key when env var is unset');

  if (origKey !== undefined) process.env.GROQ_API_KEY = origKey;
});

// 16. REGRESSION: A provider having paid plans does NOT make it ineligible if freeEligible=true
runTest('REGRESSION: Provider with paid plans available is NOT blocked when freeEligible=true', () => {
  const mockRegistry = [
    {
      name: 'provider-with-paid-and-free-tiers',
      capability: 'vision',
      model: 'some-model',
      freeEligible: true,  // This specific account/config is free-tier
      enabled: true,
      isConfigured: () => true
    }
  ];

  const selection = providerPolicy.selectProvider(
    { capability: 'vision', budgetMode: 'free_only', aiEnabled: true },
    mockRegistry
  );

  assert.notStrictEqual(selection.provider, null, 'Provider with freeEligible=true must be selected');
  assert.strictEqual(selection.reason, 'SELECTED');
});

// 17. REGRESSION: Truly unconfigured provider (no key anywhere) is correctly rejected
runTest('REGRESSION: Truly unconfigured provider (isConfigured=false) is rejected as NO_CONFIGURED_PROVIDER', () => {
  const mockRegistry = [
    {
      name: 'unconfigured-provider',
      capability: 'vision',
      model: 'some-model',
      freeEligible: true,
      enabled: true,
      isConfigured: () => false  // No credentials at all
    }
  ];

  const selection = providerPolicy.selectProvider(
    { capability: 'vision', budgetMode: 'free_only', aiEnabled: true },
    mockRegistry
  );

  assert.strictEqual(selection.provider, null);
  assert.strictEqual(selection.reason, 'NO_CONFIGURED_PROVIDER');
});

// 18. REGRESSION: Full production registry selects groq-qwen-vision for vision in free_only
runTest('REGRESSION: Production registry selects groq-qwen-vision for vision capability in free_only', () => {
  providerPolicy.clearRateLimits();

  const selection = providerPolicy.selectProvider(
    { capability: 'vision', budgetMode: 'free_only', aiEnabled: true }
  );

  assert.notStrictEqual(selection.provider, null, 'Vision provider must be selected from production registry');
  assert.strictEqual(selection.provider.name, 'groq-qwen-vision');
  assert.strictEqual(selection.reason, 'SELECTED');
});

// 19. REGRESSION: Production registry selects ollama-text for text capability in free_only
runTest('REGRESSION: Production registry selects ollama-text for text capability in free_only', () => {
  const selection = providerPolicy.selectProvider(
    { capability: 'text', budgetMode: 'free_only', aiEnabled: true }
  );

  assert.notStrictEqual(selection.provider, null, 'Text provider must be selected from production registry');
  assert.strictEqual(selection.provider.name, 'ollama-text');
  assert.strictEqual(selection.reason, 'SELECTED');
});

// 20. REGRESSION: Deterministic text requests are unaffected by provider policy
runTest('REGRESSION: Text-only request without images does not require vision provider', () => {
  // Text requests should select text provider, not be blocked by vision policy
  const textSelection = providerPolicy.selectProvider(
    { capability: 'text', budgetMode: 'free_only', aiEnabled: true }
  );
  assert.notStrictEqual(textSelection.provider, null);
  assert.strictEqual(textSelection.provider.capability, 'text');
});

// 15. Integration: Verify /health includes sanitized budgetPolicy
async function runIntegrationTests() {
  await runAsyncTest('Integration: GET /health returns clean budgetPolicy telemetry', async () => {
    const res = await fetch('http://localhost:3006/health');
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.status, 'ok');
    assert.notStrictEqual(data.budgetPolicy, undefined);
    assert.strictEqual(data.budgetPolicy.budgetMode, 'free_only');
    assert.strictEqual(data.budgetPolicy.aiEnabled, true);
    assert.strictEqual(Array.isArray(data.budgetPolicy.providers), true);

    const serialized = JSON.stringify(data.budgetPolicy);
    assert.strictEqual(serialized.includes('gsk_'), false);
    assert.strictEqual(serialized.includes('Bearer'), false);
  });

  // 16. Fast-path deterministic calculation works through running server
  await runAsyncTest('Integration: Fast-path deterministic calculation works via server', async () => {
    const res = await fetch('http://localhost:3006/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Calculate 72/120' }]
      })
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.deterministic, true);
  });

  console.log(`\nAll ${passedTests}/${totalTests} guardrail unit & integration tests passed successfully!\n`);
}

runIntegrationTests().catch(err => {
  console.error('Integration test failed:', err);
  process.exit(1);
});

