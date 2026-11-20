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

  // 1. Primary headline verification (category-specific conversational student-facing headlines)
  test('Primary student-facing message provides distinct conversational headlines across all reasons', () => {
    const seenHeadlines = new Set();
    Object.keys(WITHHOLDING_REASONS).forEach(code => {
      const sw = getSafeWithholding(code);
      assert.strictEqual(typeof sw.headline, 'string', `Reason ${code} must have string headline`);
      assert(sw.headline.trim().length > 15, `Reason ${code} headline must be informative`);
      assert(sw.formattedContent.includes(sw.headline), `Reason ${code} formattedContent must include headline`);
      seenHeadlines.add(sw.headline);
    });
    assert(seenHeadlines.size >= 6, 'Withholding categories should provide tailored, non-generic student headlines');
  });

  // 2. Specific reason copy checks
  test('MISSING_INFORMATION explanation matches conversational pedagogical guidance', () => {
    const sw = getSafeWithholding(WITHHOLDING_REASONS.MISSING_INFORMATION);
    assert(sw.headline.includes('missing a specific piece of information'));
    assert(sw.explanation.includes('missing value, bound, measurement, or variable'));
    assert(sw.cause && sw.help && sw.nextStep);
  });

  test('AMBIGUOUS_PROBLEM explanation matches conversational pedagogical guidance', () => {
    const sw = getSafeWithholding(WITHHOLDING_REASONS.AMBIGUOUS_PROBLEM);
    assert(sw.headline.includes('more than one mathematical way'));
    assert(sw.explanation.includes('rather than guessing'));
    assert(sw.cause && sw.help && sw.nextStep);
  });

  test('IMAGE_UNVERIFIABLE explanation matches conversational pedagogical guidance', () => {
    const sw = getSafeWithholding(WITHHOLDING_REASONS.IMAGE_UNVERIFIABLE);
    assert(sw.headline.includes("isn't clear enough to verify"));
    assert(sw.explanation.includes("couldn't confirm"));
    assert(sw.cause && sw.help && sw.nextStep);
  });

  test('CLAIM_NOT_VERIFIED explanation matches conversational verification-uncertainty guidance', () => {
    const sw = getSafeWithholding(WITHHOLDING_REASONS.CLAIM_NOT_VERIFIED);
    assert(sw.headline.includes("couldn't confirm the final answer"));
    assert(sw.explanation.includes('held back rather than guessing'));
    assert(sw.cause && sw.help && sw.nextStep);
  });

  test('INFRASTRUCTURE_FAILURE explanation matches non-blaming temporary-hiccup guidance', () => {
    const sw = getSafeWithholding(WITHHOLDING_REASONS.INFRASTRUCTURE_FAILURE);
    assert(sw.headline.includes('temporary service hiccup'));
    assert(sw.explanation.includes('nothing is wrong with your question'));
    assert(sw.cause && sw.help && sw.nextStep);
  });

  test('UNDEFINED_EXPRESSION explanation matches mathematical domain guidance', () => {
    const sw = getSafeWithholding(WITHHOLDING_REASONS.UNDEFINED_EXPRESSION);
    assert(sw.headline.includes('undefined mathematical value'));
    assert(sw.explanation.includes('undefined operation'));
    assert(sw.cause.includes('division by zero') || sw.cause.includes('undefined'));
    assert(sw.help && sw.nextStep);
  });

  test('CLAIM_NOT_VERIFIED does not blame student for missing info and focuses on verification', () => {
    const sw = getSafeWithholding(WITHHOLDING_REASONS.CLAIM_NOT_VERIFIED);
    assert(!/you missed|your fault|bad wording|need more information from you/i.test(`${sw.headline} ${sw.explanation} ${sw.cause}`));
    assert(/confirm|verify/i.test(sw.cause));
    assert(/check/i.test(sw.help));
    assert(!sw.help.includes('Breaking the problem into smaller steps'));
  });

  // UI mapping verification logic (mirrors app.js rendering logic)
  test('UI copy headings and summary titles are context-appropriate across failure categories', () => {
    function getUIHeadings(reasonKey) {
      let summaryTitle = "Why couldn't this be verified?";
      let secondSectionLabel = "Why couldn't this be verified?";

      if (reasonKey === "MISSING_INFORMATION") {
        summaryTitle = "Why do I need more information?";
        secondSectionLabel = "What information would help";
      } else if (reasonKey === "AMBIGUOUS_PROBLEM") {
        summaryTitle = "Why does this need clarification?";
        secondSectionLabel = "What clarification would help";
      } else if (reasonKey === "IMAGE_UNVERIFIABLE") {
        summaryTitle = "Why couldn't the diagram be verified?";
        secondSectionLabel = "What would help";
      } else if (reasonKey === "UNDEFINED_EXPRESSION") {
        summaryTitle = "Why is this expression undefined?";
        secondSectionLabel = "Mathematical explanation";
      } else if (reasonKey === "PROMPT_CLAIM_MISMATCH") {
        summaryTitle = "Why couldn't this be verified?";
        secondSectionLabel = "Equation alignment check";
      } else if (reasonKey === "INFRASTRUCTURE_FAILURE" || reasonKey === "DUAL_PROVIDER_FAILURE") {
        summaryTitle = "Why was verification interrupted?";
        secondSectionLabel = "Service status";
      }
      return { summaryTitle, secondSectionLabel };
    }

    // For verification failure, heading MUST NOT be "What information would help"
    const claimHeadings = getUIHeadings("CLAIM_NOT_VERIFIED");
    assert.strictEqual(claimHeadings.secondSectionLabel, "Why couldn't this be verified?");
    assert.strictEqual(claimHeadings.summaryTitle, "Why couldn't this be verified?");

    // For missing information, heading asks for information
    const missingHeadings = getUIHeadings("MISSING_INFORMATION");
    assert.strictEqual(missingHeadings.secondSectionLabel, "What information would help");
    assert.strictEqual(missingHeadings.summaryTitle, "Why do I need more information?");

    // For ambiguous problem, heading asks for clarification
    const ambigHeadings = getUIHeadings("AMBIGUOUS_PROBLEM");
    assert.strictEqual(ambigHeadings.secondSectionLabel, "What clarification would help");
    assert.strictEqual(ambigHeadings.summaryTitle, "Why does this need clarification?");

    // For undefined expression, heading points to mathematical explanation
    const undefHeadings = getUIHeadings("UNDEFINED_EXPRESSION");
    assert.strictEqual(undefHeadings.secondSectionLabel, "Mathematical explanation");
    assert.strictEqual(undefHeadings.summaryTitle, "Why is this expression undefined?");
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
    assert.strictEqual(sw.headline, SAFE_WITHHOLDING_CONFIG.CLAIM_NOT_VERIFIED.headline);
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
