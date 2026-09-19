/**
 * test-targeted-fidelity.js
 * Comprehensive regression tests for prompt-to-claim fidelity verification.
 */
const assert = require('assert');
const {
  extractClaims,
  runDeterministicVerification,
  checkPromptClaimFidelity
} = require('./server/verificationBridge');

async function runTargetedFidelityTests() {
  console.log('================================================================');
  console.log('🔬 TARGETED PROMPT-TO-CLAIM FIDELITY REGRESSION SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let total = 0;

  function assertFidelity(name, ok, expectedOk, details) {
    total++;
    if (ok === expectedOk) {
      passed++;
      console.log(`  ✓ [PASS] ${name}`);
    } else {
      console.error(`  ✗ [FAIL] ${name} - Expected ${expectedOk}, got ${ok}. Details: ${details}`);
    }
  }

  // Test A: Leading sign mutation
  // Prompt: What is the result of -194 + 123?
  // Response: 194 + 123 = 317
  // Fidelity: MUST FAIL
  const promptA = 'What is the result of -194 + 123?';
  const responseA = '194 + 123 = 317';
  const claimsA = extractClaims(responseA, promptA);
  assert(claimsA.length > 0, 'Should extract arithmetic claim from response A');
  const resA = await runDeterministicVerification(claimsA[0], promptA);
  assertFidelity(
    'A: Leading sign mutation (-194 + 123 vs 194 + 123 = 317)',
    resA.verified,
    false,
    resA.status
  );
  assert.strictEqual(resA.status, 'FIDELITY_MISMATCH');

  // Test B: Fraction amputation
  // Prompt: Please calculate 5/14 - 1/6
  // Response: 14 - 1/6 = 83/6
  // Fidelity: MUST FAIL
  const promptB = 'Please calculate 5/14 - 1/6';
  const responseB = '14 - 1/6 = 83/6';
  const claimsB = extractClaims(responseB, promptB);
  assert(claimsB.length > 0, 'Should extract arithmetic claim from response B');
  const resB = await runDeterministicVerification(claimsB[0], promptB);
  assertFidelity(
    'B: Fraction amputation (5/14 - 1/6 vs 14 - 1/6 = 83/6)',
    resB.verified,
    false,
    resB.status
  );
  assert.strictEqual(resB.status, 'FIDELITY_MISMATCH');

  // Test C: Unrelated same-result expression
  // Prompt: -194 + 123
  // Response: 500 - 571 = -71
  // Fidelity: MUST FAIL
  const promptC = 'What is the result of -194 + 123?';
  const responseC = '500 - 571 = -71';
  const claimsC = extractClaims(responseC, promptC);
  assert(claimsC.length > 0, 'Should extract arithmetic claim from response C');
  const resC = await runDeterministicVerification(claimsC[0], promptC);
  assertFidelity(
    'C: Unrelated same-result expression (-194 + 123 vs 500 - 571 = -71)',
    resC.verified,
    false,
    resC.status
  );
  assert.strictEqual(resC.status, 'FIDELITY_MISMATCH');

  // Test D: Equivalent fraction
  // Prompt: 1/2
  // Response: 1/2 = 0.5
  // Fidelity: MUST PASS
  const promptD = 'What is 1/2?';
  const responseD = '1/2 = 0.5';
  const claimsD = extractClaims(responseD, promptD);
  assert(claimsD.length > 0, 'Should extract arithmetic claim from response D');
  const resD = await runDeterministicVerification(claimsD[0], promptD);
  assertFidelity(
    'D: Equivalent fraction (1/2 = 0.5)',
    resD.verified,
    true,
    resD.status
  );

  // Test E: Legitimate intermediate expression
  // Prompt: 2 * (3 + 4)
  // Response: 3 + 4 = 7
  // Fidelity: MUST PASS
  const promptE = 'Calculate 2 * (3 + 4)';
  const responseE = 'First evaluate inside the parentheses: 3 + 4 = 7';
  const claimsE = extractClaims(responseE, promptE);
  assert(claimsE.length > 0, 'Should extract intermediate claim from response E');
  const resE = await runDeterministicVerification(claimsE[0], promptE);
  assertFidelity(
    'E: Legitimate intermediate expression (3 + 4 = 7 in 2 * (3 + 4))',
    resE.verified,
    true,
    resE.status
  );

  // Test F: Exact requested expression
  // Prompt: -194 + 123
  // Response: -194 + 123 = -71
  // Fidelity: MUST PASS
  const promptF = 'What is the result of -194 + 123?';
  const responseF = 'The sum is: -194 + 123 = -71';
  const claimsF = extractClaims(responseF, promptF);
  assert(claimsF.length > 0, 'Should extract exact claim from response F');
  const resF = await runDeterministicVerification(claimsF[0], promptF);
  assertFidelity(
    'F: Exact requested expression (-194 + 123 = -71)',
    resF.verified,
    true,
    resF.status
  );

  console.log('\n----------------------------------------------------------------');
  console.log(`TOTAL TARGETED TESTS: ${total}`);
  console.log(`PASSED:               ${passed} (${((passed/total)*100).toFixed(1)}%)`);
  console.log('================================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

if (require.main === module) {
  runTargetedFidelityTests()
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { runTargetedFidelityTests };
