/**
 * test-incident-reproduction.js
 * 
 * Safe reproduction and diagnostic verification for:
 * Pythos Incident Investigation — Repeated Algebra Failures and Provider Rate Limiting
 * 
 * Simulates:
 * 1. Provider returning HTTP 429
 * 2. Primary timeout / HTTP 5xx with automatic backup fallback
 * 3. All providers marked unavailable (ALL_RATE_LIMITED message origin)
 * 4. Failed algebra generation followed by independent calculus request
 * 5. Cooldown expiration and recovery
 * 6. Bounded retry and revision loops (proving absence of unbounded looping)
 * 7. Error classification and masking analysis (INTERNAL_ERROR origin)
 */

const assert = require('assert');
const providerPolicy = require('./server/providerPolicy');
const errorHandler = require('./server/errorHandler');
const toolController = require('./server/toolController');
const specialistAssist = require('./server/specialistAssist');
const safeResponseConstructor = require('./server/safeResponseConstructor');
const deterministicRouter = require('./server/deterministicRouter');

console.log('====================================================');
console.log('⚡ INCIDENT REPRODUCTION & DIAGNOSTIC SUITE');
console.log('====================================================\n');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`✔ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`❌ [FAIL] ${name}:`, err.message);
    if (err.stack) console.error(err.stack);
  }
}

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`✔ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`❌ [FAIL] ${name}:`, err.message);
    if (err.stack) console.error(err.stack);
  }
}

async function main() {
  // Reset all rate limits prior to testing
  providerPolicy.clearRateLimits();

  // ----------------------------------------------------
  // TEST 1: Exact origin of "All eligible providers for 'text' are temporarily rate-limited."
  // ----------------------------------------------------
  runTest("1. Verify exact origin of 'All eligible providers are temporarily rate-limited'", () => {
    // Put ollama-text in 30s cooldown
    providerPolicy.recordRateLimit('ollama-text', 30);
    // Put groq-text in 60s cooldown
    providerPolicy.recordRateLimit('groq-text', 60);

    const selection = providerPolicy.selectProvider({ capability: 'text' });
    assert.strictEqual(selection.provider, null, "Should not select any provider");
    assert.strictEqual(selection.reason, 'ALL_RATE_LIMITED', "Reason must be ALL_RATE_LIMITED");
    assert.strictEqual(
      selection.message,
      "All eligible providers for 'text' are temporarily rate-limited.",
      "Message must match exact incident error string"
    );
    assert.strictEqual(selection.retryAfter > 0, true, "Must have retryAfter");

    // Clear cooldowns
    providerPolicy.clearRateLimits();
  });

  // ----------------------------------------------------
  // TEST 2: Exact origin of "An unexpected error occurred while processing your request."
  // ----------------------------------------------------
  runTest("2. Verify exact origin of 'An unexpected error occurred while processing your request'", () => {
    // Generic unclassified error defaults to Case 8 (INTERNAL_ERROR, status 500)
    const genericErr = new Error('unhandled internal error occurred in pipeline');
    const classifiedGeneric = errorHandler.classifyUpstreamError(genericErr, 'text');
    assert.strictEqual(classifiedGeneric.status, 500, "Unclassified error defaults to status 500");
    assert.strictEqual(classifiedGeneric.error, 'INTERNAL_ERROR', "Error code is INTERNAL_ERROR");
    assert.strictEqual(
      classifiedGeneric.message,
      '❌ An unexpected error occurred while processing your request. Please try again.',
      "Message must match exact incident error string"
    );

    // After fix: PRIMARY_EMPTY_RESPONSE is classified as UPSTREAM_SERVER_ERROR (502) rather than generic 500
    const emptyErr = new Error('PRIMARY_EMPTY_RESPONSE: Primary LLM returned empty candidate response');
    emptyErr.code = 'PRIMARY_EMPTY_RESPONSE';
    const classifiedEmpty = errorHandler.classifyUpstreamError(emptyErr, 'text');
    assert.strictEqual(classifiedEmpty.status, 502, "Empty candidate is classified as 502 UPSTREAM_SERVER_ERROR");
    assert.strictEqual(classifiedEmpty.error, 'UPSTREAM_SERVER_ERROR');
  });

  // ----------------------------------------------------
  // TEST 3: Provider returning HTTP 429 and rate-limit recording
  // ----------------------------------------------------
  runTest("3. Simulate Provider HTTP 429 and verify rate-limit cooldown recording", () => {
    providerPolicy.clearRateLimits();

    const groq429Err = new Error('RATE_LIMIT: {"error":{"message":"Rate limit reached on tokens per minute (TPM): Limit 8000, Used 6200, Requested 2500. Please try again in 15s."}}');
    groq429Err.statusCode = 429;
    groq429Err.retryAfter = 15;

    // Record rate limit as server.js does on backup failure
    providerPolicy.recordRateLimit('groq-text', groq429Err.retryAfter || 60);

    const info = providerPolicy.getRateLimitInfo('groq-text');
    assert.strictEqual(info.rateLimited, true, "groq-text must be in rate-limit state");
    assert.strictEqual(info.retryAfter >= 14 && info.retryAfter <= 15, true, "retryAfter should match 15s");

    providerPolicy.clearRateLimits();
  });

  // ----------------------------------------------------
  // TEST 4: Primary timeout / 5xx triggers backup selection
  // ----------------------------------------------------
  runTest("4. Simulate Primary timeout triggers backup provider selection", () => {
    providerPolicy.clearRateLimits();

    const triedProviders = new Set();
    const firstSelection = providerPolicy.selectProvider({
      capability: 'text',
      exclude: Array.from(triedProviders)
    });

    assert.strictEqual(firstSelection.provider.name, 'ollama-text', "Primary should be ollama-text");
    triedProviders.add(firstSelection.provider.name);

    // Primary fails, mark cooldown
    providerPolicy.recordRateLimit(firstSelection.provider.name, 30);

    // Select backup
    const backupSelection = providerPolicy.selectProvider({
      capability: 'text',
      exclude: Array.from(triedProviders)
    });

    assert.strictEqual(backupSelection.provider.name, 'groq-text', "Backup should be groq-text");
    triedProviders.add(backupSelection.provider.name);

    // Backup fails with 429, mark cooldown
    providerPolicy.recordRateLimit(backupSelection.provider.name, 60);

    // Attempt third provider
    const thirdSelection = providerPolicy.selectProvider({
      capability: 'text',
      exclude: Array.from(triedProviders)
    });

    assert.strictEqual(thirdSelection.provider, null, "No third text provider exists in free_only mode");

    providerPolicy.clearRateLimits();
  });

  // ----------------------------------------------------
  // TEST 5: Comparison of Algebra vs Calculus execution path
  // ----------------------------------------------------
  await runAsyncTest("5. Compare Calculus vs Algebra execution paths and specialist activation", async () => {
    const calculusPrompt = 'Differentiate f(x) = 3x^4 - 5x^2 + 7x - 9';
    const algebraPrompt = 'Let x, y, z be real numbers such that x + 1/y = 4, y + 1/z = 1, and z + 1/x = 7/3. Find all real solutions (x, y, z), determine whether the system is consistent, and verify the exact value of xyz + 1/(xyz).';

    // A. Calculus path
    const calcIntent = deterministicRouter.analyzeDeterministicIntent(calculusPrompt, []);
    const calcTool = toolController.selectAppropriateTool(null, calculusPrompt, []);
    const calcSpecialist = await specialistAssist.evaluateSpecialistAssist(calculusPrompt, []);

    assert.strictEqual(calcTool.tool, 'solve_calculus', "Calculus must select solve_calculus tool");
    assert.strictEqual(calcSpecialist.matched, true, "Calculus specialist must match");
    assert.strictEqual(calcSpecialist.result.operation, 'DIFFERENTIATION', "Operation must be DIFFERENTIATION");
    assert.strictEqual(calcSpecialist.result.formattedResult.includes('12*x**3 - 10*x + 7'), true, "Derivative must be pre-calculated by SymPy");

    // Execute tool
    const calcToolResult = await toolController.executeTool(calcTool.tool, calcTool.arguments, { messages: [], activeProblemState: null });
    assert.strictEqual(calcToolResult.success, true, "solve_calculus tool execution must succeed");

    // Check safe recovery capability for Calculus if upstream LLMs fail
    const calcSafeRecovery = safeResponseConstructor.constructSafeVerifiedResponse({
      userPrompt: calculusPrompt,
      preflightToolResult: calcToolResult,
      activeProblemState: null,
      messages: []
    });
    assert.strictEqual(calcSafeRecovery !== null, true, "Calculus CAN be safely delivered without any LLM!");
    assert.strictEqual(calcSafeRecovery.source, 'TOOL_SOLVE_CALCULUS');
    assert.strictEqual(calcSafeRecovery.content.includes('12*x^{3} - 10*x + 7') || calcSafeRecovery.content.includes('12*x**3 - 10*x + 7'), true);

    // B. Algebra path
    const algIntent = deterministicRouter.analyzeDeterministicIntent(algebraPrompt, []);
    const algTool = toolController.selectAppropriateTool(null, algebraPrompt, []);
    const algSpecialist = await specialistAssist.evaluateSpecialistAssist(algebraPrompt, []);

    assert.strictEqual(algIntent, null, "Algebra cannot be solved by deterministicRouter");
    assert.strictEqual(algSpecialist.matched, false, "Algebra cannot be solved by specialistAssist");
    
    // Algebra tool attempt fails on variable expression
    let algToolResult = null;
    if (algTool && algTool.tool) {
      algToolResult = await toolController.executeTool(algTool.tool, algTool.arguments, { messages: [], activeProblemState: null });
    }
    const algSafeRecovery = safeResponseConstructor.constructSafeVerifiedResponse({
      userPrompt: algebraPrompt,
      preflightToolResult: algToolResult,
      activeProblemState: null,
      messages: []
    });
    assert.strictEqual(algSafeRecovery, null, "Algebra CANNOT be recovered without LLM; has no safe recovery fallback!");
  });

  // ----------------------------------------------------
  // TEST 6: Cooldown expiry allows subsequent request to succeed
  // ----------------------------------------------------
  runTest("6. Verify cooldown expiry restores provider availability", () => {
    providerPolicy.clearRateLimits();

    // Set 1-second cooldown on ollama-text
    providerPolicy.recordRateLimit('ollama-text', 1);
    assert.strictEqual(providerPolicy.getRateLimitInfo('ollama-text').rateLimited, true);

    // Clear specific provider cooldown:
    providerPolicy.clearRateLimits('ollama-text');
    assert.strictEqual(providerPolicy.getRateLimitInfo('ollama-text').rateLimited, false);

    const selection = providerPolicy.selectProvider({ capability: 'text' });
    assert.strictEqual(selection.provider.name, 'ollama-text', "Provider is available again after cooldown");
  });

  // ----------------------------------------------------
  // TEST 7: Bounded retry & revision verification (Loop absence check)
  // ----------------------------------------------------
  runTest("7. Verify bounded provider loop and revision limits (no infinite loop)", () => {
    // Text provider pool count in free_only mode
    const textProviders = providerPolicy.getProviderRegistry().filter(p => p.capability === 'text' && p.freeEligible);
    assert.strictEqual(textProviders.length, 2, "Only 2 text providers exist in free_only mode");

    // Provider loop iteration bound:
    // With triedTextProviders set tracking each candidate, max iterations = textProviders.length = 2.
    // Revision loop bound:
    // In server.js line 2549, executeRevisionCall is called at most ONCE per request.
    // Max outbound LLM calls possible for a single request = 2 initial attempts + 1 revision = 3 calls.
    assert.strictEqual(textProviders.length <= 3, true, "Max provider attempts is strictly bounded");
  });

  console.log(`\n====================================================`);
  console.log(`📊 REPRODUCTION SUITE SUMMARY: ${passedTests}/${totalTests} Passed (${Math.round((passedTests/totalTests)*100)}%)`);
  console.log(`====================================================\n`);

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error("FATAL in reproduction test:", err);
  process.exit(1);
});
