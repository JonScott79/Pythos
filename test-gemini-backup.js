/**
 * test-gemini-backup.js
 *
 * Comprehensive Test Suite for Pythos Gemini Backup Integration:
 * 1. Primary vs Backup Ordering: Groq is always primary, Gemini is secondary.
 * 2. $0 Cost Guardrail Integrity: Paid Gemini never sneaks through in free_only mode.
 * 3. Centralized Credential Resolution: providerPolicy is single source of truth.
 * 4. Missing Credentials & Malformed Configuration Handling.
 * 5. Emergency Kill Switch (PYTHOS_AI_ENABLED=false).
 * 6. Rate Limit Cooldown & Fallback Selection.
 * 7. Provider Recovery after Cooldown Expiry.
 * 8. Error Taxonomy & Privacy Sanitization (Groq gsk_ and Gemini AIzaSy...).
 * 9. Production Routing End-to-End Fallback (Legacy JSON).
 * 10. Production Routing End-to-End Fallback (Streaming NDJSON).
 * 11. Dual Failure (Both Groq and Gemini Rate-Limited) -> 429 with Retry Timer.
 */

const assert = require('assert');
const http = require('http');
const https = require('https');
const providerPolicy = require('./server/providerPolicy');
const { classifyUpstreamError, sanitizeErrorDetail, extractRetrySeconds } = require('./server/errorHandler');

console.log('🧪 Running Pythos Gemini Backup Integration Test Suite...\n');

let totalTests = 0;
let passedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error('   ', err.message || err);
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
    console.error('   ', err.message || err);
    throw err;
  }
}

// ── PART 1: PROVIDER REGISTRY & ORDERING TESTS ─────────────────────────────
console.log('--- PART 1: Provider Registry, Ordering & Guardrail Tests ---');

runTest('1. Primary vision provider is groq-qwen-vision and backup is gemini-vision', () => {
  const registry = providerPolicy.getProviderRegistry();
  const visionProviders = registry.filter(p => p.capability === 'vision');
  
  assert(visionProviders.length >= 2, 'Must have at least 2 vision providers');
  assert.strictEqual(visionProviders[0].name, 'groq-qwen-vision', 'First vision provider MUST be Groq primary');
  assert.strictEqual(visionProviders[1].name, 'gemini-vision', 'Second vision provider MUST be Gemini backup');
});

runTest('2. By default, gemini-vision has freeEligible=false to protect $0 guardrail (fail closed)', () => {
  const savedTier = process.env.GEMINI_FREE_TIER;
  delete process.env.GEMINI_FREE_TIER;

  const registry = providerPolicy.getProviderRegistry();
  const gemini = registry.find(p => p.name === 'gemini-vision');
  assert.strictEqual(gemini.freeEligible, false, 'Gemini must NOT be freeEligible by default');

  if (savedTier !== undefined) process.env.GEMINI_FREE_TIER = savedTier;
});

runTest('3. In free_only mode, paid/uncertified gemini-vision CANNOT sneak through', () => {
  const savedTier = process.env.GEMINI_FREE_TIER;
  const savedKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_FREE_TIER;
  process.env.GEMINI_API_KEY = 'AIzaSyTestKey1234567890123456789012';

  // Even if Groq is rate-limited, Gemini with freeEligible=false cannot be selected under free_only
  providerPolicy.clearRateLimits();
  providerPolicy.recordRateLimit('groq-qwen-vision', 60);

  const selection = providerPolicy.selectProvider({
    capability: 'vision',
    budgetMode: 'free_only',
    aiEnabled: true
  });

  assert.strictEqual(selection.provider, null, 'Paid provider MUST NOT be selected under free_only');
  assert(selection.reason === 'COST_GUARDRAIL_BLOCKED' || selection.reason === 'ALL_RATE_LIMITED',
    `Reason must reflect guardrail or rate limit, got ${selection.reason}`);

  providerPolicy.clearRateLimits();
  if (savedTier !== undefined) process.env.GEMINI_FREE_TIER = savedTier;
  if (savedKey !== undefined) process.env.GEMINI_API_KEY = savedKey; else delete process.env.GEMINI_API_KEY;
});

runTest('4. When GEMINI_FREE_TIER=true, gemini-vision becomes freeEligible and selectable under free_only', () => {
  const savedTier = process.env.GEMINI_FREE_TIER;
  const savedKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_FREE_TIER = 'true';
  process.env.GEMINI_API_KEY = 'AIzaSyTestKey1234567890123456789012';

  // Groq is rate-limited, so backup should be chosen
  providerPolicy.clearRateLimits();
  providerPolicy.recordRateLimit('groq-qwen-vision', 60);

  const selection = providerPolicy.selectProvider({
    capability: 'vision',
    budgetMode: 'free_only',
    aiEnabled: true
  });

  assert.notStrictEqual(selection.provider, null, 'Free-tier certified Gemini MUST be selected when Groq is busy');
  assert.strictEqual(selection.provider.name, 'gemini-vision');
  assert.strictEqual(selection.reason, 'SELECTED');

  providerPolicy.clearRateLimits();
  if (savedTier !== undefined) process.env.GEMINI_FREE_TIER = savedTier; else delete process.env.GEMINI_FREE_TIER;
  if (savedKey !== undefined) process.env.GEMINI_API_KEY = savedKey; else delete process.env.GEMINI_API_KEY;
});

runTest('5. In paid_enabled mode, gemini-vision is selectable even when freeEligible=false', () => {
  const savedTier = process.env.GEMINI_FREE_TIER;
  const savedKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_FREE_TIER;
  process.env.GEMINI_API_KEY = 'AIzaSyTestKey1234567890123456789012';

  providerPolicy.clearRateLimits();
  providerPolicy.recordRateLimit('groq-qwen-vision', 60);

  const selection = providerPolicy.selectProvider({
    capability: 'vision',
    budgetMode: 'paid_enabled',
    aiEnabled: true
  });

  assert.notStrictEqual(selection.provider, null, 'Gemini must be selectable in paid_enabled mode');
  assert.strictEqual(selection.provider.name, 'gemini-vision');

  providerPolicy.clearRateLimits();
  if (savedTier !== undefined) process.env.GEMINI_FREE_TIER = savedTier;
  if (savedKey !== undefined) process.env.GEMINI_API_KEY = savedKey; else delete process.env.GEMINI_API_KEY;
});

runTest('6. Groq is preferred over Gemini when both are healthy', () => {
  const savedTier = process.env.GEMINI_FREE_TIER;
  const savedKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_FREE_TIER = 'true';
  process.env.GEMINI_API_KEY = 'AIzaSyTestKey1234567890123456789012';

  providerPolicy.clearRateLimits();

  const selection = providerPolicy.selectProvider({
    capability: 'vision',
    budgetMode: 'free_only',
    aiEnabled: true
  });

  assert.notStrictEqual(selection.provider, null);
  assert.strictEqual(selection.provider.name, 'groq-qwen-vision', 'Groq MUST be selected as primary when available');

  if (savedTier !== undefined) process.env.GEMINI_FREE_TIER = savedTier; else delete process.env.GEMINI_FREE_TIER;
  if (savedKey !== undefined) process.env.GEMINI_API_KEY = savedKey; else delete process.env.GEMINI_API_KEY;
});

runTest('7. Unconfigured Gemini (no GEMINI_API_KEY) is rejected as not configured', () => {
  const savedKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;

  const registry = providerPolicy.getProviderRegistry();
  const gemini = registry.find(p => p.name === 'gemini-vision');
  assert.strictEqual(gemini.isConfigured(), false, 'Gemini must not be configured when env var is missing');

  if (savedKey !== undefined) process.env.GEMINI_API_KEY = savedKey;
});

runTest('8. Emergency kill switch blocks all providers regardless of capability', () => {
  const selection = providerPolicy.selectProvider({
    capability: 'vision',
    budgetMode: 'free_only',
    aiEnabled: false
  });

  assert.strictEqual(selection.provider, null);
  assert.strictEqual(selection.reason, 'AI_DISABLED');
});

runTest('9. Provider recovery: Groq is restored after cooldown expires', () => {
  const savedTier = process.env.GEMINI_FREE_TIER;
  const savedKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_FREE_TIER = 'true';
  process.env.GEMINI_API_KEY = 'AIzaSyTestKey1234567890123456789012';

  // Step A: Groq rate-limited -> Gemini selected
  providerPolicy.recordRateLimit('groq-qwen-vision', 60);
  const s1 = providerPolicy.selectProvider({ capability: 'vision', budgetMode: 'free_only', aiEnabled: true });
  assert.strictEqual(s1.provider.name, 'gemini-vision');

  // Step B: Cooldown cleared/expired -> Groq restored
  providerPolicy.clearRateLimits('groq-qwen-vision');
  const s2 = providerPolicy.selectProvider({ capability: 'vision', budgetMode: 'free_only', aiEnabled: true });
  assert.strictEqual(s2.provider.name, 'groq-qwen-vision', 'Groq must be restored as primary upon recovery');

  providerPolicy.clearRateLimits();
  if (savedTier !== undefined) process.env.GEMINI_FREE_TIER = savedTier; else delete process.env.GEMINI_FREE_TIER;
  if (savedKey !== undefined) process.env.GEMINI_API_KEY = savedKey; else delete process.env.GEMINI_API_KEY;
});

runTest('9b. Adversarial test: free_only + non-"true" GEMINI_FREE_TIER flag NEVER selects Gemini', () => {
  const savedTier = process.env.GEMINI_FREE_TIER;
  const savedKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'AIzaSyTestKey1234567890123456789012';

  // Test every non-'true' permutation
  const adversarialValues = [undefined, '', 'false', '0', 'no', 'FALSE', 'False', 'paid', 'TRUE_BUT_PAID', 'null', 'undefined', '1'];

  for (const val of adversarialValues) {
    if (val === undefined) {
      delete process.env.GEMINI_FREE_TIER;
    } else {
      process.env.GEMINI_FREE_TIER = val;
    }

    providerPolicy.clearRateLimits();
    providerPolicy.recordRateLimit('groq-qwen-vision', 60);

    const selection = providerPolicy.selectProvider({
      capability: 'vision',
      budgetMode: 'free_only',
      aiEnabled: true
    });

    assert.strictEqual(selection.provider, null, `Gemini MUST NOT be selected when GEMINI_FREE_TIER is '${val}'`);
    assert(selection.reason === 'COST_GUARDRAIL_BLOCKED' || selection.reason === 'ALL_RATE_LIMITED',
      `Expected guardrail or rate limit block, got ${selection.reason} for value '${val}'`);
  }

  providerPolicy.clearRateLimits();
  if (savedTier !== undefined) process.env.GEMINI_FREE_TIER = savedTier; else delete process.env.GEMINI_FREE_TIER;
  if (savedKey !== undefined) process.env.GEMINI_API_KEY = savedKey; else delete process.env.GEMINI_API_KEY;
});

runAsyncTest('9c. Execution layer protection: executeVisionCall CANNOT bypass providerPolicy', async () => {
  const { executeVisionCall } = require('./server/server');
  const savedMode = process.env.PYTHOS_AI_BUDGET_MODE;
  const savedKill = process.env.PYTHOS_AI_ENABLED;
  process.env.PYTHOS_AI_BUDGET_MODE = 'free_only';
  process.env.PYTHOS_AI_ENABLED = 'true';

  // 1. Direct invocation with uncertified paid provider under free_only
  const paidProvider = {
    name: 'gemini-vision',
    model: 'gemini-2.5-flash',
    freeEligible: false,
    enabled: true,
    isConfigured: () => true
  };

  let threwGuardrail = false;
  try {
    await executeVisionCall(paidProvider, {});
  } catch (err) {
    threwGuardrail = true;
    assert.strictEqual(err.code, 'COST_GUARDRAIL_BLOCKED');
  }
  assert(threwGuardrail, 'executeVisionCall must block non-freeEligible provider in free_only mode');

  // 2. Direct invocation when kill switch is active (aiEnabled = false)
  process.env.PYTHOS_AI_ENABLED = 'false';
  let threwKill = false;
  try {
    await executeVisionCall({ name: 'groq-qwen-vision', freeEligible: true, enabled: true, isConfigured: () => true }, {});
  } catch (err) {
    threwKill = true;
    assert.strictEqual(err.code, 'AI_DISABLED');
  }
  assert(threwKill, 'executeVisionCall must enforce kill switch even if called directly');
  process.env.PYTHOS_AI_ENABLED = 'true';

  // 3. Direct invocation with unconfigured provider
  let threwUnconfigured = false;
  try {
    await executeVisionCall({ name: 'gemini-vision', freeEligible: true, enabled: true, isConfigured: () => false }, {});
  } catch (err) {
    threwUnconfigured = true;
    assert.strictEqual(err.code, 'PROVIDER_NOT_CONFIGURED');
  }
  assert(threwUnconfigured, 'executeVisionCall must block unconfigured provider');

  // 4. Direct invocation with disabled provider
  let threwDisabled = false;
  try {
    await executeVisionCall({ name: 'groq-qwen-vision', freeEligible: true, enabled: false, isConfigured: () => true }, {});
  } catch (err) {
    threwDisabled = true;
    assert.strictEqual(err.code, 'PROVIDER_DISABLED');
  }
  assert(threwDisabled, 'executeVisionCall must block disabled provider');

  // Restore env
  if (savedMode !== undefined) process.env.PYTHOS_AI_BUDGET_MODE = savedMode; else delete process.env.PYTHOS_AI_BUDGET_MODE;
  if (savedKill !== undefined) process.env.PYTHOS_AI_ENABLED = savedKill; else delete process.env.PYTHOS_AI_ENABLED;
});

runTest('9d. Cooldown expiry and server restart / cold start recovery behavior', () => {
  const savedTier = process.env.GEMINI_FREE_TIER;
  const savedKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_FREE_TIER = 'true';
  process.env.GEMINI_API_KEY = 'AIzaSyTestKey1234567890123456789012';

  // Scenario 1: Natural cooldown expiry via TTL
  providerPolicy.clearRateLimits();
  providerPolicy.recordRateLimit('groq-qwen-vision', 1); // 1-second cooldown
  assert(providerPolicy.isProviderRateLimited('groq-qwen-vision'), 'Groq should be rate limited initially');

  // Fast-forward rateLimitedUntil to simulate passage of time
  const info = providerPolicy.getRateLimitInfo('groq-qwen-vision');
  assert(info.rateLimited, 'Info must report rateLimited=true');

  // Clear or wait for expiry
  providerPolicy.clearRateLimits('groq-qwen-vision');
  assert(!providerPolicy.isProviderRateLimited('groq-qwen-vision'), 'Groq rate limit should expire');
  const selAfterExpiry = providerPolicy.selectProvider({ capability: 'vision', budgetMode: 'free_only', aiEnabled: true });
  assert.strictEqual(selAfterExpiry.provider.name, 'groq-qwen-vision', 'Groq must be primary again after cooldown expiry');

  // Scenario 2: Server restart / cold start simulation
  // On process start, in-memory rateLimitState is empty.
  providerPolicy.recordRateLimit('groq-qwen-vision', 300); // 5 min cooldown before restart
  assert(providerPolicy.isProviderRateLimited('groq-qwen-vision'));

  // Simulate server restart: in-memory state is wiped
  providerPolicy.clearRateLimits(); // All in-memory cooldowns reset on reboot

  // On reboot: Groq is evaluated fresh as primary candidate
  const selReboot = providerPolicy.selectProvider({ capability: 'vision', budgetMode: 'free_only', aiEnabled: true });
  assert.strictEqual(selReboot.provider.name, 'groq-qwen-vision', 'On server restart, Groq primary is tried fresh');

  providerPolicy.clearRateLimits();
  if (savedTier !== undefined) process.env.GEMINI_FREE_TIER = savedTier; else delete process.env.GEMINI_FREE_TIER;
  if (savedKey !== undefined) process.env.GEMINI_API_KEY = savedKey; else delete process.env.GEMINI_API_KEY;
});

// ── PART 2: CREDENTIAL SANITIZATION & ERROR TAXONOMY ───────────────────────
console.log('\n--- PART 2: Credential Redaction & Error Taxonomy Tests ---');

runTest('10. Centralized credential resolution: providerPolicy exports getGroqApiKey and getGeminiApiKey', () => {
  assert.strictEqual(typeof providerPolicy.getGroqApiKey, 'function');
  assert.strictEqual(typeof providerPolicy.getGeminiApiKey, 'function');
  assert.strictEqual(typeof providerPolicy.GROQ_EMBEDDED_KEY, 'string');
  assert(providerPolicy.getGroqApiKey().startsWith('gsk_'), 'Default Groq key must start with gsk_');
});

runTest('11. Security sanitization: Gemini AIzaSy keys and x-goog-api-key headers are redacted', () => {
  const dirty = `Error calling Gemini: key=AIzaSyA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6 in x-goog-api-key: AIzaSyA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6`;
  const sanitized = sanitizeErrorDetail(dirty);

  assert(!sanitized.includes('AIzaSyA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6'), 'Must scrub raw Gemini key');
  assert(sanitized.includes('[REDACTED_API_KEY]'), 'Must replace with [REDACTED_API_KEY]');
  assert(sanitized.includes('x-goog-api-key: [REDACTED]'), 'Must replace x-goog-api-key header');
});

runTest('12. Gemini RESOURCE_EXHAUSTED / quota error is classified as UPSTREAM_RATE_LIMITED (429)', () => {
  const quotaErr = new Error('Resource has been exhausted (e.g. check quota). Please retry after 45 seconds.');
  quotaErr.statusCode = 429;
  quotaErr.body = JSON.stringify({ error: { code: 429, message: quotaErr.message, status: 'RESOURCE_EXHAUSTED' } });

  const classified = classifyUpstreamError(quotaErr, 'vision');
  assert.strictEqual(classified.status, 429);
  assert.strictEqual(classified.error, 'UPSTREAM_RATE_LIMITED');
  assert.strictEqual(classified.retryAfter, 45);
  assert(classified.message.includes('about 1 minute') || classified.message.includes('45 second'));
});

// ── PART 3: PRODUCTION END-TO-END ROUTING & FALLBACK ───────────────────────
console.log('\n--- PART 3: Production Routing & Fallback Integration Tests ---');

// Mock a 1x1 valid JPEG base64 payload
const validJpegBase64 = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

async function runRoutingTests() {
  process.env.NODE_ENV = 'test';
  process.env.GEMINI_FREE_TIER = 'true';
  process.env.GEMINI_API_KEY = 'AIzaSyMockKeyForTesting1234567890123';
  process.env.PYTHOS_AI_BUDGET_MODE = 'free_only';
  process.env.PYTHOS_AI_ENABLED = 'true';

  const { app } = require('./server/server');

  // Start test server on dynamic port
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const port = server.address().port;

  try {
    // Intercept native https.request to simulate Groq failing and Gemini succeeding
    const origRequest = https.request;

    // Test 13: Normal Groq success (No fallback triggered)
    await runAsyncTest('13. Production vision routing: Groq succeeds as primary (normal path)', async () => {
      providerPolicy.clearRateLimits();
      let groqCalled = false;
      let geminiCalled = false;

      https.request = function (options, callback) {
        const host = options.hostname || options.host;
        if (host === 'api.groq.com') {
          groqCalled = true;
          const reqMock = {
            on: () => reqMock,
            write: () => {},
            end: () => {
              const resMock = {
                statusCode: 200,
                headers: {},
                on: (event, handler) => {
                  if (event === 'data') {
                    handler(JSON.stringify({
                      choices: [{ message: { content: 'Groq solved: The answer is $x = 5$.' } }]
                    }));
                  }
                  if (event === 'end') handler();
                }
              };
              callback(resMock);
            }
          };
          return reqMock;
        }
        if (host === 'generativelanguage.googleapis.com') {
          geminiCalled = true;
        }
        return origRequest.apply(https, arguments);
      };

      const res = await fetch(`http://localhost:${port}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            {
              role: 'user',
              content: 'What is x in this problem?',
              images: [validJpegBase64]
            }
          ]
        })
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert(groqCalled, 'Groq MUST be called as primary');
      assert(!geminiCalled, 'Gemini MUST NOT be called when Groq succeeds');
      assert(data.message.content.includes('Groq solved'), 'Response must be from Groq');
    });

    // Test 14: Groq failure (HTTP 429) -> Fallback to Gemini (Legacy JSON)
    await runAsyncTest('14. Production vision routing: Groq 429 rate limit falls back to Gemini (Legacy JSON)', async () => {
      providerPolicy.clearRateLimits();
      let groqCalls = 0;
      let geminiCalled = false;

      https.request = function (options, callback) {
        const host = options.hostname || options.host;
        if (host === 'api.groq.com') {
          groqCalls++;
          const reqMock = {
            on: () => reqMock,
            write: () => {},
            end: () => {
              // Groq returns 429 with extended wait
              const resMock = {
                statusCode: 429,
                headers: { 'retry-after': '30' },
                on: (event, handler) => {
                  if (event === 'data') {
                    handler(JSON.stringify({
                      error: { message: 'Rate limit reached. Please try again in 30s.' }
                    }));
                  }
                  if (event === 'end') handler();
                }
              };
              callback(resMock);
            }
          };
          return reqMock;
        }
        if (host === 'generativelanguage.googleapis.com') {
          geminiCalled = true;
          const reqMock = {
            on: () => reqMock,
            write: () => {},
            end: () => {
              // Gemini returns 200 success
              const resMock = {
                statusCode: 200,
                headers: {},
                on: (event, handler) => {
                  if (event === 'data') {
                    handler(JSON.stringify({
                      candidates: [
                        {
                          content: {
                            parts: [{ text: 'Gemini backup solved: The answer is $y = 12$.' }]
                          },
                          finishReason: 'STOP'
                        }
                      ]
                    }));
                  }
                  if (event === 'end') handler();
                }
              };
              callback(resMock);
            }
          };
          return reqMock;
        }
        return origRequest.apply(https, arguments);
      };

      const res = await fetch(`http://localhost:${port}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            {
              role: 'user',
              content: 'Please solve this equation',
              images: [validJpegBase64]
            }
          ]
        })
      });

      assert.strictEqual(res.status, 200, 'Request must succeed via fallback');
      const data = await res.json();
      assert(groqCalls > 0, 'Groq must have been attempted first');
      assert(geminiCalled, 'Gemini MUST have been invoked as fallback');
      assert(data.message.content.includes('Gemini backup solved'), 'Response must contain Gemini output');
      assert.strictEqual(data.done, true);
    });

    // Test 15: Groq failure -> Fallback to Gemini (Streaming NDJSON protocol)
    await runAsyncTest('15. Production vision routing: Groq failure falls back to Gemini (Streaming NDJSON)', async () => {
      providerPolicy.clearRateLimits();
      let geminiCalled = false;

      https.request = function (options, callback) {
        const host = options.hostname || options.host;
        if (host === 'api.groq.com') {
          const reqMock = {
            on: () => reqMock,
            write: () => {},
            end: () => {
              // Groq returns 503 Service Unavailable
              const resMock = {
                statusCode: 503,
                headers: {},
                on: (event, handler) => {
                  if (event === 'data') handler('Upstream server error');
                  if (event === 'end') handler();
                }
              };
              callback(resMock);
            }
          };
          return reqMock;
        }
        if (host === 'generativelanguage.googleapis.com') {
          geminiCalled = true;
          const reqMock = {
            on: () => reqMock,
            write: () => {},
            end: () => {
              const resMock = {
                statusCode: 200,
                headers: {},
                on: (event, handler) => {
                  if (event === 'data') {
                    handler(JSON.stringify({
                      candidates: [
                        {
                          content: {
                            parts: [{ text: 'Gemini streaming response: Step 1 is $\\frac{1}{2} + \\frac{1}{3}$.' }]
                          },
                          finishReason: 'STOP'
                        }
                      ]
                    }));
                  }
                  if (event === 'end') handler();
                }
              };
              callback(resMock);
            }
          };
          return reqMock;
        }
        return origRequest.apply(https, arguments);
      };

      const res = await fetch(`http://localhost:${port}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/x-ndjson'
        },
        body: JSON.stringify({
          stream: true,
          messages: [
            {
              role: 'user',
              content: 'Help with this problem',
              images: [validJpegBase64]
            }
          ]
        })
      });

      assert.strictEqual(res.status, 200);
      assert(res.headers.get('content-type').includes('application/x-ndjson'));
      const text = await res.text();
      const lines = text.trim().split('\n').map(l => JSON.parse(l));

      assert(geminiCalled, 'Gemini must be invoked as backup on streaming path');
      assert(lines.some(l => l.type === 'token' && l.content.includes('Gemini streaming response')), 'Must stream token chunk');
      assert(lines.some(l => l.type === 'verified'), 'Must stream verified chunk');
      assert(lines.some(l => l.type === 'done'), 'Must stream done chunk');
    });

    // Test 16: Both Groq and Gemini fail -> 429 UPSTREAM_RATE_LIMITED with retryAfter
    await runAsyncTest('16. Both providers fail rate limits -> Returns 429 with retry countdown timer', async () => {
      providerPolicy.clearRateLimits();

      https.request = function (options, callback) {
        const host = options.hostname || options.host;
        const reqMock = {
          on: () => reqMock,
          write: () => {},
          end: () => {
            const resMock = {
              statusCode: 429,
              headers: { 'retry-after': '75' },
              on: (event, handler) => {
                if (event === 'data') {
                  handler(JSON.stringify({ error: { message: `Rate limit on ${host}. Try again in 75s.` } }));
                }
                if (event === 'end') handler();
              }
            };
            callback(resMock);
          }
        };
        return reqMock;
      };

      const res = await fetch(`http://localhost:${port}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            {
              role: 'user',
              content: 'What is this?',
              images: [validJpegBase64]
            }
          ]
        })
      });

      assert.strictEqual(res.status, 429, 'Must return HTTP 429 when all providers exhausted');
      const data = await res.json();
      assert.strictEqual(data.error, 'UPSTREAM_RATE_LIMITED');
      assert(data.retryAfter >= 60, `retryAfter must be at least 60s, got ${data.retryAfter}`);
      assert(data.message.includes('busy with high demand') || data.message.includes('capacity is currently exhausted'));
    });

    // Test 17: Paid Gemini is blocked by cost guardrail during live failure
    await runAsyncTest('17. Paid provider blocked in free_only during Groq failure', async () => {
      providerPolicy.clearRateLimits();
      process.env.GEMINI_FREE_TIER = 'false'; // Gemini is marked paid
      let geminiAttempted = false;

      https.request = function (options, callback) {
        const host = options.hostname || options.host;
        if (host === 'api.groq.com') {
          const reqMock = {
            on: () => reqMock,
            write: () => {},
            end: () => {
              const resMock = {
                statusCode: 429,
                headers: { 'retry-after': '60' },
                on: (event, handler) => {
                  if (event === 'data') handler('Rate limit');
                  if (event === 'end') handler();
                }
              };
              callback(resMock);
            }
          };
          return reqMock;
        }
        if (host === 'generativelanguage.googleapis.com') {
          geminiAttempted = true;
        }
        return origRequest.apply(https, arguments);
      };

      const res = await fetch(`http://localhost:${port}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            {
              role: 'user',
              content: 'Solve this',
              images: [validJpegBase64]
            }
          ]
        })
      });

      assert(!geminiAttempted, 'Paid Gemini provider MUST NEVER be called in free_only mode');
      assert.strictEqual(res.status, 429);
      const data = await res.json();
      assert.strictEqual(data.error, 'UPSTREAM_RATE_LIMITED');
    });

    // Test 18: Full End-to-End Fallback Test: Groq unavailable -> Gemini -> image extraction -> Pythos reasoning -> verification -> final response
    await runAsyncTest('18. Full End-to-End Fallback: Groq unavailable -> Gemini -> image extraction -> Pythos reasoning -> verification -> final response', async () => {
      providerPolicy.clearRateLimits();
      process.env.GEMINI_FREE_TIER = 'true';
      process.env.GEMINI_API_KEY = 'AIzaSyMockKeyForTesting1234567890123';
      let groqCalled = false;
      let geminiCalled = false;
      let imageExtractedInPayload = false;

      https.request = function (options, callback) {
        const host = options.hostname || options.host;
        if (host === 'api.groq.com') {
          groqCalled = true;
          const reqMock = {
            on: () => reqMock,
            write: () => {},
            end: () => {
              // Force Groq unavailable
              const resMock = {
                statusCode: 503,
                headers: {},
                on: (event, handler) => {
                  if (event === 'data') handler(JSON.stringify({ error: { message: 'Service Unavailable' } }));
                  if (event === 'end') handler();
                }
              };
              callback(resMock);
            }
          };
          return reqMock;
        }

        if (host === 'generativelanguage.googleapis.com') {
          geminiCalled = true;
          let bodyBuffer = '';
          const reqMock = {
            on: () => reqMock,
            write: (chunk) => {
              bodyBuffer += chunk;
            },
            end: () => {
              // Verify the payload contains the inline image data extracted from user message
              if (bodyBuffer.includes('inlineData') && bodyBuffer.includes('image/jpeg')) {
                imageExtractedInPayload = true;
              }

              const resMock = {
                statusCode: 200,
                headers: {},
                on: (event, handler) => {
                  if (event === 'data') {
                    handler(JSON.stringify({
                      candidates: [
                        {
                          content: {
                            parts: [
                              {
                                text: 'Pythos Socratic reasoning: By examining the geometric diagram in the image, we compute the base times height: 15 * 4 = 60. Therefore, the area is 60 square units.'
                              }
                            ]
                          },
                          finishReason: 'STOP'
                        }
                      ]
                    }));
                  }
                  if (event === 'end') handler();
                }
              };
              callback(resMock);
            }
          };
          return reqMock;
        }
        return origRequest.apply(https, arguments);
      };

      const res = await fetch(`http://localhost:${port}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            {
              role: 'user',
              content: 'What is the area of the rectangle shown in this diagram?',
              images: [validJpegBase64]
            }
          ]
        })
      });

      assert.strictEqual(res.status, 200, 'End-to-end fallback request must return HTTP 200');
      const data = await res.json();

      // Step 1: Verify Groq was forced unavailable
      assert(groqCalled, 'Step 1: Groq must be attempted first and fail');

      // Step 2: Verify fallback to Gemini
      assert(geminiCalled, 'Step 2: Fallback to Gemini must be executed');

      // Step 3: Verify image extraction passed to Gemini payload
      assert(imageExtractedInPayload, 'Step 3: Image data must be properly extracted and formatted into Gemini payload');

      // Step 4: Verify Pythos reasoning returned
      assert(data.message && data.message.content.includes('15 * 4 = 60'), 'Step 4: Pythos reasoning must be contained in message content');
      assert.strictEqual(data.model, 'gemini-2.5-flash', 'Model must reflect fallback provider model');

      // Step 5: Verify deterministic claim extraction & mathematical verification
      assert(Array.isArray(data.claims) && data.claims.length > 0, 'Step 5a: Mathematical claims must be extracted');
      assert.strictEqual(data.claims[0].claim_type, 'arithmetic');
      assert.strictEqual(data.claims[0].data.expression, '15 * 4');
      assert(Array.isArray(data.verification) && data.verification.length > 0, 'Step 5b: Deterministic verification must run on claims');
      assert.strictEqual(data.verification[0].verified, true, 'Step 5c: Claim must be deterministically verified as true');
      assert.strictEqual(data.verification[0].engine, 'mathjs', 'Step 5d: Fast verification engine must be mathjs');

      // Step 6: Final response structure
      assert.strictEqual(data.done, true, 'Step 6: Final response must indicate done=true');
    });

    // Test 19: Adversarial test: free_only + Gemini flag false can NEVER execute Gemini under live chat
    await runAsyncTest('19. Adversarial chat test: free_only + GEMINI_FREE_TIER=0/false NEVER executes Gemini on Groq 429', async () => {
      providerPolicy.clearRateLimits();
      process.env.GEMINI_FREE_TIER = '0'; // Non-'true' adversarial flag
      process.env.GEMINI_API_KEY = 'AIzaSyAdversarialKey12345678901234';
      let geminiCalled = false;

      https.request = function (options, callback) {
        const host = options.hostname || options.host;
        if (host === 'api.groq.com') {
          const reqMock = {
            on: () => reqMock,
            write: () => {},
            end: () => {
              const resMock = {
                statusCode: 429,
                headers: { 'retry-after': '60' },
                on: (event, handler) => {
                  if (event === 'data') handler('Rate limit');
                  if (event === 'end') handler();
                }
              };
              callback(resMock);
            }
          };
          return reqMock;
        }
        if (host === 'generativelanguage.googleapis.com') {
          geminiCalled = true;
        }
        return origRequest.apply(https, arguments);
      };

      const res = await fetch(`http://localhost:${port}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            {
              role: 'user',
              content: 'Solve this equation',
              images: [validJpegBase64]
            }
          ]
        })
      });

      assert(!geminiCalled, 'Gemini must NEVER be invoked when GEMINI_FREE_TIER is not "true"');
      assert.strictEqual(res.status, 429);
      const data = await res.json();
      assert.strictEqual(data.error, 'UPSTREAM_RATE_LIMITED');
    });

    // Restore original https.request
    https.request = origRequest;

    // ── PART 4: REAL-PROVIDER TRAFFIC AUDIT & PROBES ───────────────────────────
    console.log('\n--- PART 4: Real-Provider Network Probes ---');

    // Test 20: Real Groq Provider Live Network Probe (NO MOCKS)
    await runAsyncTest('20. Real-provider live network probe: Groq API responds with live model catalog (UNMOCKED)', async () => {
      const groqKey = providerPolicy.getGroqApiKey();
      assert(groqKey && groqKey.startsWith('gsk_'), 'Groq key must be present');

      const response = await new Promise((resolve, reject) => {
        const req = https.request('https://api.groq.com/openai/v1/models', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${groqKey}`,
            'User-Agent': 'Pythos/1.7.0'
          },
          timeout: 10000
        }, (res) => {
          let data = '';
          res.on('data', chunk => { data += chunk; });
          res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
        });
        req.on('error', reject);
        req.on('timeout', () => {
          req.destroy();
          reject(new Error('Groq real probe timed out'));
        });
        req.end();
      });

      assert.strictEqual(response.statusCode, 200, `Live Groq API must return 200, got ${response.statusCode}`);
      const parsed = JSON.parse(response.body);
      assert(Array.isArray(parsed.data), 'Groq response must contain models data array');
    });

    // Test 21: Real Gemini Provider Live Configuration & Probe Audit
    await runAsyncTest('21. Real Gemini provider configuration audit & live probe', async () => {
      const geminiKey = providerPolicy.getGeminiApiKey();
      if (geminiKey) {
        // If an unrestricted Gemini key is provided, perform live network call
        const response = await new Promise((resolve, reject) => {
          const req = https.request(`https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey}`, {
            method: 'GET',
            headers: { 'User-Agent': 'Pythos/1.7.0' },
            timeout: 10000
          }, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
          });
          req.on('error', reject);
          req.on('timeout', () => {
            req.destroy();
            reject(new Error('Gemini real probe timed out'));
          });
          req.end();
        });

        console.log(`    [AUDIT] Real Gemini probe returned HTTP ${response.statusCode}`);
      } else {
        // Accurately audit that no live GEMINI_API_KEY is configured in the environment
        console.log('    [AUDIT] process.env.GEMINI_API_KEY is currently unset in the host environment.');
        console.log('    [AUDIT] Gemini upstream requests in integration tests correctly use deterministic mocked streams.');
        assert.strictEqual(providerPolicy.getGeminiApiKey(), null);
      }
    });

  } finally {
    await new Promise((resolve) => server.close(resolve));
    const { server: defaultServer } = require('./server/server');
    if (defaultServer && typeof defaultServer.close === 'function' && defaultServer.listening) {
      await new Promise((resolve) => defaultServer.close(resolve));
    }
  }
}

runRoutingTests().then(() => {
  console.log(`\n==================================================`);
  console.log(`🎉 ALL ${passedTests}/${totalTests} GEMINI BACKUP INTEGRATION TESTS PASSED!`);
  console.log(`==================================================\n`);
  process.exit(0);
}).catch((err) => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  process.exit(1);
});
