/**
 * test_diagram_fidelity_ambiguity.js
 * 
 * Comprehensive Regression & Adversarial Test Suite for:
 * INPUT/DIAGRAM FIDELITY & AMBIGUITY DETECTION
 * 
 * Verifies that Pythos:
 * 1. Distinguishes clearly stated problems from ambiguous/conflicting notation.
 * 2. Detects material notation divergences (e.g., hypotenuse labeled x^2 vs x).
 * 3. Rejects silent normalization (e.g. dropping x^2 -> x to solve 6^2 + 8^2 = x^2).
 * 4. Preserves 0 false positives on normal, standard algebraic/geometric/physics notation.
 * 5. Prevents fast-path deterministic bypass on ambiguous geometric inputs.
 */

const assert = require('assert');
const path = require('path');

const SERVER_DIR = 'C:/Projects/lanzar/pythos/server';
const { analyzeDeterministicIntent } = require(path.join(SERVER_DIR, 'deterministicRouter'));
const verificationBridge = require(path.join(SERVER_DIR, 'verificationBridge'));

// Placeholder or imported ambiguity detector module
let inputAmbiguityDetector;
try {
  inputAmbiguityDetector = require(path.join(SERVER_DIR, 'inputAmbiguityDetector'));
} catch (e) {
  // Baseline run before implementation
  inputAmbiguityDetector = null;
}

async function runTestSuite() {
  console.log('================================================================');
  console.log('📐 INPUT/DIAGRAM FIDELITY & AMBIGUITY DETECTION TEST SUITE');
  console.log('================================================================\n');

  let totalTests = 0;
  let passedTests = 0;
  const failures = [];

  function testCase(category, name, fn) {
    totalTests++;
    try {
      fn();
      passedTests++;
      console.log(`  ✓ [PASS] [${category}] ${name}`);
    } catch (err) {
      failures.push({ category, name, error: err.message });
      console.log(`  ✗ [FAIL] [${category}] ${name}`);
      console.log(`         Error: ${err.message}`);
    }
  }

  // ==========================================================================
  // SECTION 1: CORE TARGET FAILURE (x vs x^2 / x2 Right Triangle Ambiguity)
  // ==========================================================================
  console.log('--- SECTION 1: CORE TARGET AMBIGUITY CASES (Must Detect Ambiguity) ---');

  const coreAmbiguityCases = [
    {
      id: 'T1.1',
      name: 'Hypotenuse labeled x^2 (caret exponent)',
      prompt: 'Right triangle with legs 6 and 8. The hypotenuse is labeled x^2. Find x.',
      expectedAmbiguity: true,
      expectedType: 'GEOMETRIC_LABEL_POWER_CONFLATION',
      expectedLiteralEq: 'x^4',
      expectedInferredEq: 'x^2'
    },
    {
      id: 'T1.2',
      name: 'Hypotenuse labeled x² (Unicode superscript)',
      prompt: 'Right triangle with legs 6 and 8. Hypotenuse is labeled x². What is x?',
      expectedAmbiguity: true,
      expectedType: 'GEOMETRIC_LABEL_POWER_CONFLATION',
      expectedLiteralEq: 'x^4',
      expectedInferredEq: 'x^2'
    },
    {
      id: 'T1.3',
      name: 'Hypotenuse labeled x2 (OCR/unformatted conflation)',
      prompt: 'Right triangle with legs 6 and 8. The hypotenuse is labeled x2. Solve for x.',
      expectedAmbiguity: true,
      expectedType: 'NOTATION_CONFLATION_SUBSCRIPT_EXPONENT',
      expectedOptions: ['x^2', '2x', 'x_2']
    },
    {
      id: 'T1.4',
      name: 'Leg labeled x^2 with numeric hypotenuse',
      prompt: 'A right triangle has one leg of length 6 and hypotenuse of length 10. The other leg is labeled x^2. Find x.',
      expectedAmbiguity: true,
      expectedType: 'GEOMETRIC_LABEL_POWER_CONFLATION',
      expectedLiteralEq: 'x^4',
      expectedInferredEq: 'x^2'
    },
    {
      id: 'T1.5',
      name: 'Diagram transcribed with hypotenuse: x^2',
      prompt: 'Diagram shows right triangle ABC with leg a=6, leg b=8, hypotenuse c=x^2. Find x.',
      expectedAmbiguity: true,
      expectedType: 'GEOMETRIC_LABEL_POWER_CONFLATION',
      expectedLiteralEq: 'x^4',
      expectedInferredEq: 'x^2'
    }
  ];

  for (const c of coreAmbiguityCases) {
    testCase('CORE_AMBIGUITY', `${c.id}: ${c.name}`, () => {
      if (!inputAmbiguityDetector) {
        throw new Error('inputAmbiguityDetector module not yet implemented (Baseline Failure)');
      }
      const res = inputAmbiguityDetector.detectInputAmbiguity(c.prompt);
      assert.strictEqual(res.hasAmbiguity, true, `Expected hasAmbiguity=true for prompt: "${c.prompt}"`);
      assert.ok(res.ambiguityType, 'Expected ambiguityType to be defined');
      assert.ok(res.clarificationMessage, 'Expected clarificationMessage to be provided');
      assert.ok(res.clarificationMessage.includes('ambiguity'), 'Clarification message must state ambiguity');
    });
  }

  // ==========================================================================
  // SECTION 2: ADVERSARIAL CASES (Other Geometric Powers & OCR Conflations)
  // ==========================================================================
  console.log('\n--- SECTION 2: ADVERSARIAL CASES (Subscripts, Exponents, Circle Area) ---');

  const adversarialCases = [
    {
      id: 'T2.1',
      name: 'Circle radius labeled r^2 in area problem',
      prompt: 'A circle has area 64pi. The radius in the diagram is labeled r^2. What is r?',
      expectedAmbiguity: true,
      expectedType: 'GEOMETRIC_LABEL_POWER_CONFLATION'
    },
    {
      id: 'T2.2',
      name: 'Circle radius labeled r2 (OCR/subscript/exponent conflation)',
      prompt: 'A circle has area 100pi. The radius is labeled r2. Find r.',
      expectedAmbiguity: true,
      expectedType: 'NOTATION_CONFLATION_SUBSCRIPT_EXPONENT'
    },
    {
      id: 'T2.3',
      name: 'Square side labeled s^2 with perimeter',
      prompt: 'A square has perimeter 36. One side in the diagram is labeled s^2. Find s.',
      expectedAmbiguity: true,
      expectedType: 'GEOMETRIC_LABEL_POWER_CONFLATION'
    }
  ];

  for (const c of adversarialCases) {
    testCase('ADVERSARIAL', `${c.id}: ${c.name}`, () => {
      if (!inputAmbiguityDetector) {
        throw new Error('inputAmbiguityDetector module not yet implemented (Baseline Failure)');
      }
      const res = inputAmbiguityDetector.detectInputAmbiguity(c.prompt);
      assert.strictEqual(res.hasAmbiguity, true, `Expected hasAmbiguity=true for prompt: "${c.prompt}"`);
    });
  }

  // ==========================================================================
  // SECTION 3: FALSE POSITIVE CONTROLS (Standard Math - MUST NOT FLAG AMBIGUITY)
  // ==========================================================================
  console.log('\n--- SECTION 3: FALSE POSITIVE CONTROLS (Must NOT Flag Ambiguity) ---');

  const falsePositiveControls = [
    {
      id: 'FP1',
      name: 'Standard right triangle with variable hypotenuse x',
      prompt: 'Right triangle with legs 6 and 8. Find the hypotenuse x.'
    },
    {
      id: 'FP2',
      name: 'Standard right triangle with numeric sides 5, 12, 13',
      prompt: 'In right triangle ABC, a = 5, b = 12. Find the hypotenuse c.'
    },
    {
      id: 'FP3',
      name: 'Explicit unambiguous algebraic side definition',
      prompt: 'In a right triangle with legs 6 and 8, the hypotenuse length is given by the algebraic expression x^2. Solve for positive x.'
    },
    {
      id: 'FP4',
      name: 'Unambiguous coefficient hypotenuse (2x)',
      prompt: 'Right triangle with legs 6 and 8. The hypotenuse is 2x. Find x.'
    },
    {
      id: 'FP5',
      name: 'Standard quadratic equation',
      prompt: 'Solve for x: x^2 - 5x + 6 = 0'
    },
    {
      id: 'FP6',
      name: 'Standard arithmetic with powers',
      prompt: 'Calculate 3^2 + 4^2'
    },
    {
      id: 'FP7',
      name: 'Physics with standard superscripts and subscripts',
      prompt: 'A car starts with v_0 = 10 m/s and acceleration a = 2 m/s^2. Find distance after t = 5 s.'
    },
    {
      id: 'FP8',
      name: 'Standard triangle area',
      prompt: 'Find the area of a triangle with base 10 and height 5.'
    },
    {
      id: 'FP9',
      name: 'Rational algebraic expression with exponents',
      prompt: 'Simplify: (x^2 - 4) / (x - 2)'
    },
    {
      id: 'FP10',
      name: 'Calculus derivative of polynomial',
      prompt: 'Find the derivative of f(x) = 3x^2 + 2x - 1'
    }
  ];

  for (const c of falsePositiveControls) {
    testCase('FALSE_POSITIVE_CONTROL', `${c.id}: ${c.name}`, () => {
      if (!inputAmbiguityDetector) {
        // Without detector, baseline trivially passes false positive check
        return;
      }
      const res = inputAmbiguityDetector.detectInputAmbiguity(c.prompt);
      assert.strictEqual(
        res.hasAmbiguity,
        false,
        `FALSE POSITIVE DETECTED on clean input: "${c.prompt}". Reason: ${res.reason}`
      );
    });
  }

  // ==========================================================================
  // SECTION 4: DETERMINISTIC ROUTER FAST-PATH GUARD
  // ==========================================================================
  console.log('\n--- SECTION 4: DETERMINISTIC ROUTER FAST-PATH GUARD ---');

  testCase('ROUTER_GUARD', 'G1: Router must NOT fast-path "legs 6 and 8, hypotenuse x^2" to c = 10', () => {
    const prompt = 'Right triangle with legs 6 and 8. The hypotenuse is labeled x^2. Find x.';
    const intent = analyzeDeterministicIntent(prompt);
    // If the router recognizes the triangle but ignores x^2, it incorrectly returns solution: 10
    if (intent && (intent.solution === 10 || intent.result === 10 || intent.formatted === 'c = 10')) {
      throw new Error(`Deterministic router silently resolved ambiguous hypotenuse x^2 to c = 10! Intent: ${JSON.stringify(intent)}`);
    }
  });

  testCase('ROUTER_GUARD', 'G2: Router must NOT fast-path "legs 6 and 8, hypotenuse x2" to c = 10', () => {
    const prompt = 'Right triangle with legs 6 and 8. The hypotenuse is labeled x2. Solve for x.';
    const intent = analyzeDeterministicIntent(prompt);
    if (intent && (intent.solution === 10 || intent.result === 10 || intent.formatted === 'c = 10')) {
      throw new Error(`Deterministic router silently resolved ambiguous hypotenuse x2 to c = 10! Intent: ${JSON.stringify(intent)}`);
    }
  });

  testCase('ROUTER_GUARD', 'G3: Router must STILL fast-path standard clean triangle "legs 3 and 4"', () => {
    const prompt = 'show a right triangle with legs 3 and 4';
    const intent = analyzeDeterministicIntent(prompt);
    assert.ok(intent, 'Expected router to match standard triangle visualization');
    assert.strictEqual(intent.c, 5, 'Standard triangle legs 3 and 4 must still resolve c = 5');
  });

  // ==========================================================================
  // SECTION 5: PROMPT-CLAIM FIDELITY & SILENT NORMALIZATION WITHHOLDING
  // ==========================================================================
  console.log('\n--- SECTION 5: PROMPT-CLAIM FIDELITY & SILENT NORMALIZATION WITHHOLDING ---');

  testCase('FIDELITY_GATE', 'F1: Gate must WITHHOLD candidate that silently solves 6^2 + 8^2 = x^2 => x = 10', async () => {
    const prompt = 'Right triangle with legs 6 and 8. The hypotenuse is labeled x^2. Find x.';
    const silentCandidate = 'By the Pythagorean theorem, 6^2 + 8^2 = x^2, so 36 + 64 = 100 = x^2, hence x = 10. \\boxed{10}';
    
    // Evaluate via verificationBridge evaluateCandidateDelivery or auditPromptClaimFidelity
    const claims = verificationBridge.extractClaims(silentCandidate, prompt);
    let verifiedClaimCount = 0;
    for (const claim of claims) {
      const verif = await verificationBridge.runDeterministicVerification(claim, prompt);
      if (verif.verified) verifiedClaimCount++;
    }

    // Even if intermediate arithmetic (36 + 64 = 100) is true, candidate delivery must be rejected
    const delivery = verificationBridge.evaluateCandidateDelivery({
      content: silentCandidate,
      prompt,
      verifiedClaims: claims.filter(c => c.verified),
      invalidClaims: claims.filter(c => !c.verified)
    });

    if (delivery && delivery.deliverable === true) {
      throw new Error('Gate delivered response that silently dropped x^2 to x without resolving ambiguity!');
    }
  });

  testCase('FIDELITY_GATE', 'F2: Gate must ACCEPT candidate that properly surfaces ambiguity with both branches', async () => {
    const prompt = 'Right triangle with legs 6 and 8. The hypotenuse is labeled x^2. Find x.';
    const validClarification = 'There is an ambiguity in the diagram. If the hypotenuse is labeled x^2, then the Pythagorean theorem gives (x^2)^2 = 6^2 + 8^2 => x^4 = 100 => x = 10^(1/2). If the intended label is x, then x^2 = 100 => x = 10. Please confirm which was intended.';
    
    // Check if the ambiguity detector / fidelity engine recognizes this as a valid clarification turn
    if (inputAmbiguityDetector && typeof inputAmbiguityDetector.isFaithfulClarificationResponse === 'function') {
      const isFaithful = inputAmbiguityDetector.isFaithfulClarificationResponse(prompt, validClarification);
      assert.strictEqual(isFaithful, true, 'Clarification response must be recognized as faithful');
    }
  });

  // ==========================================================================
  // SUMMARY
  // ==========================================================================
  console.log('\n================================================================');
  console.log(`TOTAL TESTS:  ${totalTests}`);
  console.log(`PASSED:       ${passedTests} (${((passedTests / totalTests) * 100).toFixed(1)}%)`);
  console.log(`FAILED:       ${failures.length}`);
  console.log('================================================================\n');

  if (failures.length > 0) {
    console.log('Summary of Failures:');
    failures.forEach((f, i) => {
      console.log(`  ${i + 1}. [${f.category}] ${f.name}: ${f.error}`);
    });
  }

  return { totalTests, passedTests, failedTests: failures.length, failures };
}

if (require.main === module) {
  runTestSuite()
    .then(res => {
      process.exit(res.failedTests > 0 ? 1 : 0);
    })
    .catch(err => {
      console.error('Fatal test error:', err);
      process.exit(1);
    });
}

module.exports = { runTestSuite };
