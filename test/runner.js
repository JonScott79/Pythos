/*
    test/runner.js
    Universal Pythos Torture Suite & Reliability Benchmark Runner.
*/

const { generateArithmeticTests } = require('./property/property_tests');
const { runFuzzTests } = require('./fuzz/fuzz_tests');
const { AI_RELIABILITY_ATTACKS } = require('./ai-reliability/ai_reliability_tests');
const MathJSVerifier = require('../server/mathjsVerifier');
const { runDeterministicVerification } = require('../server/verificationBridge');

async function runTortureSuite() {
  console.log('======================================================================');
  console.log('🏛️  PYTHOS UNIVERSAL ADVERSARIAL TORTURE SUITE & RELIABILITY BENCHMARK');
  console.log('======================================================================\n');

  const report = {
    total: 0,
    passed: 0,
    failed: 0,
    unknown: 0,
    categories: {}
  };

  function record(cat, passed, isUnknown = false) {
    report.total++;
    if (!report.categories[cat]) report.categories[cat] = { total: 0, passed: 0, failed: 0, unknown: 0 };
    report.categories[cat].total++;

    if (isUnknown) {
      report.unknown++;
      report.categories[cat].unknown++;
      report.passed++;
      report.categories[cat].passed++;
    } else if (passed) {
      report.passed++;
      report.categories[cat].passed++;
    } else {
      report.failed++;
      report.categories[cat].failed++;
    }
  }

  // 1. Property-Based Arithmetic Tests (50 iterations)
  console.log('▶ [MODULE 1] Property-Based Arithmetic Random Generator (50 tests)...');
  const propResults = generateArithmeticTests(50);
  let propPassed = 0;
  for (const r of propResults) {
    if (r.passed) propPassed++;
    record('PROPERTY_ARITHMETIC', r.passed);
  }
  console.log(`  Result: ${propPassed}/50 passed.\n`);

  // 2. Fuzz Testing against Math.js & Symbolic Bridge
  console.log('▶ [MODULE 2] Fuzz Testing Parser & Bridge (28 pathological inputs)...');
  const fuzzResults = await runFuzzTests();
  let fuzzPassed = 0;
  for (const f of fuzzResults) {
    if (f.passed) fuzzPassed++;
    record('FUZZ_TESTING', f.passed);
  }
  console.log(`  Result: ${fuzzPassed}/${fuzzResults.length} passed without crash or false verification.\n`);

  // 3. Multi-Tier Verifier & Symbolic Hierarchy Tests (Calculus, Physics, Lost Roots, Step Verification)
  console.log('▶ [MODULE 3] Multi-Tier Verification Hierarchy Core Capabilities (15 tests)...');
  const coreTests = [
    // Level 1: Arithmetic & Precision
    { cat: 'ARITHMETIC', payload: { domain: 'arithmetic', data: { expression: '1/3 + 1/6', proposed_value: '1/2' } }, expect: true, status: 'VERIFIED' },
    { cat: 'ARITHMETIC', payload: { domain: 'arithmetic', data: { operation: 'sqrt', radicand: 15, proposed_value: 5 } }, expect: false, status: 'INCORRECT_RESULT' },
    { cat: 'DOMAIN', payload: { domain: 'arithmetic', data: { operation: 'sqrt', radicand: -4, domain: 'real' } }, expect: false, status: 'DOMAIN_ERROR' },

    // Level 2: Algebra & Roots
    { cat: 'ALGEBRA', payload: { domain: 'algebra', claim_type: 'algebra', data: { equation: 'x^2 - 5*x = 0', variable: 'x', proposed_solutions: [5] } }, expect: false, status: 'LOST_ROOT' },
    { cat: 'ALGEBRA', payload: { domain: 'algebra', claim_type: 'algebra', data: { equation: 'sqrt(x + 3) = x - 3', variable: 'x', proposed_solutions: [6, 1] } }, expect: false, status: 'EXTRANEOUS_ROOT' },

    // Level 6: Calculus & Change of Variables
    { cat: 'CALCULUS', payload: { domain: 'calculus', claim_type: 'derivative', data: { expression: 'ln(2*x)', variable: 'x', proposed_derivative: '1/x' } }, expect: true, status: 'VERIFIED' },
    { cat: 'CALCULUS', payload: { domain: 'calculus', claim_type: 'derivative', data: { expression: 'ln(2*x)', variable: 'x', proposed_derivative: '2/x' } }, expect: false, status: 'INCORRECT_DERIVATIVE' },
    { cat: 'CALCULUS', payload: { domain: 'calculus', claim_type: 'change_of_variables', data: { original_integrand: '1/(1+x^2)', substitution: 'tan(u)', old_variable: 'x', new_variable: 'u', proposed_transformed_integrand: '1' } }, expect: true, status: 'VERIFIED' },
    { cat: 'CALCULUS', payload: { domain: 'calculus', claim_type: 'change_of_variables', data: { original_integrand: '1/(1+x^2)', substitution: 'tan(u)', old_variable: 'x', new_variable: 'u', proposed_transformed_integrand: '1/(1+tan(u)^2)' } }, expect: false, status: 'INVALID_SUBSTITUTION' },

    // Step Reasoning (Wrong step -> Correct answer)
    { cat: 'STEP_REASONING', payload: { claim_type: 'step_reasoning', data: { original_expression: '(x^2-1)/(x-1)', transformed_expression: 'x-1', proposed_final_answer: 3, correct_final_answer: 3 } }, expect: false, status: 'INVALID_REASONING_STEP' },

    // Level 8: Probability
    { cat: 'PROBABILITY', payload: { domain: 'probability', claim_type: 'birthday_problem', data: { proposed_n: 23 } }, expect: true, status: 'VERIFIED' },

    // Level 10: Physics & Dimensions
    { cat: 'PHYSICS', payload: { domain: 'physics', claim_type: 'dimensions', data: { lhs_dimension: 'force', rhs_dimension: 'force' } }, expect: true, status: 'VERIFIED' },
    { cat: 'PHYSICS', payload: { domain: 'physics', claim_type: 'dimensions', data: { lhs_dimension: 'force', rhs_dimension: 'energy' } }, expect: false, status: 'DIMENSION_ERROR' },
    { cat: 'PHYSICS', payload: { domain: 'physics', claim_type: 'conservation_law', data: { law: 'conservation_of_energy', nonconservative_forces: true, claims_conserved: true } }, expect: false, status: 'INCONSISTENT_ASSUMPTION' },
    { cat: 'UNKNOWN_HANDLING', payload: { domain: 'advanced_quantum', claim_type: 'feynman_path_integral', data: {} }, expect: false, status: 'UNKNOWN' }
  ];

  for (const ct of coreTests) {
    const res = await runDeterministicVerification(ct.payload);
    const isUnknown = (ct.status === 'UNKNOWN' && res.status === 'UNKNOWN');
    const passed = (res.verified === ct.expect && res.status === ct.status);
    record(ct.cat, passed, isUnknown);
  }
  console.log(`  Result: ${coreTests.length} core capability tests executed.\n`);

  // Final Summary Report
  console.log('======================================================================');
  console.log(`📊 PYTHOS TORTURE & RELIABILITY BENCHMARK REPORT`);
  console.log('======================================================================');
  console.log(`Total Invocations: ${report.total}`);
  console.log(`Passed:            ${report.passed} (${Math.round(report.passed / (report.total - report.unknown) * 100)}%)`);
  console.log(`Failed:            ${report.failed}`);
  console.log(`Honest UNKNOWN:    ${report.unknown} (Properly handled non-manufactured confidence)\n`);

  console.log('--- Breakdown by Category ---');
  for (const [cat, data] of Object.entries(report.categories)) {
    console.log(`• ${cat.padEnd(22)}: ${data.passed}/${data.total} passed (UNKNOWN: ${data.unknown}, Failed: ${data.failed})`);
  }
  console.log('======================================================================\n');
}

runTortureSuite();
