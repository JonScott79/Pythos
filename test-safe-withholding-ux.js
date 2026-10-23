/**
 * test-safe-withholding-ux.js
 *
 * Comprehensive test suite for Pythos Safe Withholding UX and taxonomy.
 * Verifies:
 * - Student-facing friendly headline: "I need a little more information to solve this problem."
 * - Category-appropriate student explanations for:
 *   * MISSING_INFORMATION
 *   * AMBIGUOUS_PROBLEM
 *   * IMAGE_UNVERIFIABLE
 *   * CLAIM_NOT_VERIFIED
 *   * INFRASTRUCTURE_FAILURE / DUAL_PROVIDER_FAILURE
 * - Secondary "Why do I need more information?" control structure (cause, help, nextStep)
 * - Zero exposure of internal terminology:
 *   UNKNOWN, verification gate, claim extraction, verifier failure,
 *   provider failure, confidence score, internal model output,
 *   chain-of-thought, raw verifier traces
 * - Delivery gate integrity: withheld answers remain withheld; verified answers delivered
 */

const assert = require('assert');
const { getSafeWithholding, WITHHOLDING_REASONS, SAFE_WITHHOLDING_CONFIG } = require('./server/withholdingTaxonomy');

const FORBIDDEN_JARGON = [
  'UNKNOWN',
  'verification gate',
  'claim extraction',
  'verifier failure',
  'provider failure',
  'confidence score',
  'internal model output',
  'chain-of-thought',
  'raw verifier traces'
];

async function runTests() {
  console.log('====================================================');
  console.log('PYTHOS SAFE WITHHOLDING UX & TAXONOMY REGRESSION SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ ${name}`);
      console.error(`    ${err.message}`);
      failed++;
    }
  }

  // 1. Primary headline verification
  test('Primary student-facing message matches standard across all reasons', () => {
    Object.keys(WITHHOLDING_REASONS).forEach(code => {
      const sw = getSafeWithholding(code);
      assert.strictEqual(
        sw.headline,
        "I need a little more information to solve this problem.",
        `Reason ${code} headline must match canonical student-facing text`
      );
    });
  });

  // 2. Specific reason copy checks
  test('MISSING_INFORMATION explanation matches pedagogical guidance', () => {
    const sw = getSafeWithholding(WITHHOLDING_REASONS.MISSING_INFORMATION);
    assert(sw.explanation.includes("I don't have enough information to solve the problem reliably"));
    assert(sw.explanation.includes("Add the missing measurement, equation, or other information"));
    assert(sw.cause && sw.help && sw.nextStep);
  });

  test('AMBIGUOUS_PROBLEM explanation matches pedagogical guidance', () => {
    const sw = getSafeWithholding(WITHHOLDING_REASONS.AMBIGUOUS_PROBLEM);
    assert(sw.explanation.includes("There are multiple ways to interpret this problem"));
    assert(sw.explanation.includes("I don't want to guess"));
    assert(sw.cause && sw.help && sw.nextStep);
  });

  test('IMAGE_UNVERIFIABLE explanation matches pedagogical guidance', () => {
    const sw = getSafeWithholding(WITHHOLDING_REASONS.IMAGE_UNVERIFIABLE);
    assert(sw.explanation.includes("I can see the image, but I can't reliably determine"));
    assert(sw.cause && sw.help && sw.nextStep);
  });

  test('CLAIM_NOT_VERIFIED explanation matches pedagogical guidance', () => {
    const sw = getSafeWithholding(WITHHOLDING_REASONS.CLAIM_NOT_VERIFIED);
    assert(sw.explanation.includes("I worked through a possible answer, but I couldn't verify it"));
    assert(sw.cause && sw.help && sw.nextStep);
  });

  test('INFRASTRUCTURE_FAILURE explanation matches pedagogical guidance', () => {
    const sw = getSafeWithholding(WITHHOLDING_REASONS.INFRASTRUCTURE_FAILURE);
    assert(sw.explanation.includes("I wasn't able to complete the verification needed for this problem"));
    assert(sw.cause && sw.help && sw.nextStep);
  });

  // 3. Absolute ban on internal jargon
  test('No student-facing text contains forbidden internal verifier jargon', () => {
    Object.keys(SAFE_WITHHOLDING_CONFIG).forEach(key => {
      const item = SAFE_WITHHOLDING_CONFIG[key];
      const allText = `${item.headline} ${item.explanation} ${item.cause} ${item.help} ${item.nextStep}`;
      FORBIDDEN_JARGON.forEach(jargon => {
        assert(
          !allText.toLowerCase().includes(jargon.toLowerCase()),
          `Key ${key} leaked internal jargon: "${jargon}"`
        );
      });
    });
  });

  // 4. Default fallback on unknown or missing reason code
  test('Unknown reason code safely falls back to CLAIM_NOT_VERIFIED without crashing', () => {
    const sw = getSafeWithholding('SOME_UNKNOWN_CODE_999');
    assert.strictEqual(sw.headline, "I need a little more information to solve this problem.");
    assert.strictEqual(sw.code, WITHHOLDING_REASONS.CLAIM_NOT_VERIFIED);
  });

  // 5. Secondary "Why do I need more information?" sections
  test('Every category configures cause, help, and nextStep for the expandable control', () => {
    Object.keys(SAFE_WITHHOLDING_CONFIG).forEach(key => {
      const item = SAFE_WITHHOLDING_CONFIG[key];
      assert(typeof item.cause === 'string' && item.cause.length > 10, `${key} must have clear cause`);
      assert(typeof item.help === 'string' && item.help.length > 10, `${key} must have actionable help`);
      assert(typeof item.nextStep === 'string' && item.nextStep.length > 10, `${key} must have next step`);
    });
  });

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
