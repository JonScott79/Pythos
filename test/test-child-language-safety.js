/**
 * test-child-language-safety.js
 *
 * Validates Pythos Child-Safe Language & Zero-Profanity Mandate:
 * 1. Prompts explicitly forbid bad words, profanity, and vulgarities.
 * 2. Inbound student frustration/vulgarity is handled gracefully and correctly classified.
 * 3. Legitimate scientific and mathematical terminology is preserved without false positives.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { classifyStudentIntent, INTENTS } = require('../server/studentIntentClassifier');

function runChildLanguageSafetyTests() {
  console.log('================================================================');
  console.log('🛡️ PYTHOS CHILD-SAFE LANGUAGE & ZERO-PROFANITY SUITE');
  console.log('================================================================\n');

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
      console.error(`    ${err.message}`);
    }
  }

  // 1. System Prompt Mandates
  test('PYTHOS_SYSTEM_PROMPT includes explicit zero-profanity mandate', () => {
    const serverCode = fs.readFileSync(path.join(__dirname, '../server/server.js'), 'utf8');
    assert(serverCode.includes('# CHILD-SAFE LANGUAGE & ZERO-PROFANITY MANDATE (ABSOLUTE RULE)'),
      'Missing CHILD-SAFE LANGUAGE section header');
    assert(serverCode.includes('Pythos NEVER uses bad words, profanity, curse words, vulgarities'),
      'Missing explicit zero-bad-words rule');
    assert(serverCode.includes('NEVER mirror, repeat, or quote'),
      'Missing non-mirroring rule for student profanity');
    assert(serverCode.includes('NEVER scold, preach, lecture, or act morally outraged'),
      'Missing calm guidance rule');
  });

  test('visionSystemPrompt includes explicit child-safe language directive', () => {
    const serverCode = fs.readFileSync(path.join(__dirname, '../server/server.js'), 'utf8');
    assert(serverCode.includes('Maintain clean, encouraging, child-safe language with zero bad words or profanity'),
      'Missing zero bad words directive in vision prompt');
  });

  // 2. Handling frustrated student inputs
  test('Frustrated student input is classified as CONFUSION or CONTINUATION gracefully', () => {
    const r1 = classifyStudentIntent('i do not get this crap', true);
    assert.strictEqual(r1.intent, INTENTS.CONFUSION);

    const r2 = classifyStudentIntent('what the hell do i do now?', true);
    assert(r2.intent === INTENTS.CONFUSION || r2.intent === INTENTS.CONTINUATION,
      `Expected CONFUSION or CONTINUATION, got ${r2.intent}`);

    const r3 = classifyStudentIntent('wtf does that mean', true);
    assert.strictEqual(r3.intent, INTENTS.CONFUSION);

    const r4 = classifyStudentIntent('wait what the heck', true);
    assert.strictEqual(r4.intent, INTENTS.CONFUSION);
  });

  // 3. Mathematical & scientific terminology preservation
  test('Scientific and mathematical terminology remains valid and uncensored', () => {
    const terms = [
      'find dy/dx for y = sin(x)',
      'calculate the asymptote of y = 1/(x-2)',
      'what is the penetration depth in electromagnetism?',
      'explain black body radiation and Planck distribution'
    ];
    for (const term of terms) {
      const res = classifyStudentIntent(term, false);
      assert.notStrictEqual(res.intent, 'REJECTED', `Term "${term}" should never be rejected`);
    }
  });

  console.log('\n================================================================');
  console.log(`TOTAL TESTS: ${total}`);
  console.log(`PASSED:      ${passed}`);
  console.log(`FAILED:      ${total - passed}`);
  console.log('================================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

if (require.main === module) {
  runChildLanguageSafetyTests();
}

module.exports = { runChildLanguageSafetyTests };
