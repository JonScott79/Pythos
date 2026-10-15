const path = require('path');
const assert = require('assert');
const { extractClaims, runDeterministicVerification, checkPromptClaimFidelity } = require('./server/verificationBridge');

console.log('================================================================');
console.log('🧪 REGRESSION TEST: REPORT INCIDENT CLAIM EXTRACTION FIXES');
console.log('================================================================\n');

let passed = 0;
let total = 0;

async function runTest(name, fn) {
  total++;
  try {
    await fn();
    console.log(`  ✅ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(`     Error: ${err.message}`);
  }
}

async function main() {
  console.log('--- SUITE 1: Formatted Thousands & LaTeX Spacing in Arithmetic Claims ---');

  await runTest('PY-7bf99787: 144 * 376 = 54,144 correctly extracts 54144 instead of 54', async () => {
    const text = '$$144 \\times 376 = 54,144$$';
    const claims = extractClaims(text, '144 * 376');
    const arith = claims.find(c => c.claim_type === 'arithmetic');
    assert.ok(arith, 'Arithmetic claim should be extracted');
    assert.strictEqual(arith.data.proposed_value, 54144, `Expected 54144 but got ${arith.data.proposed_value}`);
    const res = await runDeterministicVerification(arith, '144 * 376');
    assert.strictEqual(res.verified, true);
  });

  await runTest('PY-83c7b3ce: -392 * (-448) = 175,616 correctly extracts 175616', async () => {
    const text = '392 \\times 448 = 175,616. Thus -392 \\times (-448) = \\boxed{175,616}';
    const claims = extractClaims(text, 'Calculate -392 * (-448). Give the final answer.');
    const arith = claims.find(c => c.claim_type === 'arithmetic');
    assert.ok(arith, 'Arithmetic claim should be extracted');
    assert.strictEqual(arith.data.proposed_value, 175616);
    const res = await runDeterministicVerification(arith, 'Calculate -392 * (-448). Give the final answer.');
    assert.strictEqual(res.verified, true);
  });

  await runTest('PY-bb0f39d5: 158 * (-299) = -47,242 correctly extracts -47242', async () => {
    const text = '$$158 \\times (-299) = -47,242$$';
    const claims = extractClaims(text, '158 * (-299)');
    const arith = claims.find(c => c.claim_type === 'arithmetic');
    assert.ok(arith, 'Arithmetic claim should be extracted');
    assert.strictEqual(arith.data.proposed_value, -47242);
    const res = await runDeterministicVerification(arith, '158 * (-299)');
    assert.strictEqual(res.verified, true);
  });

  await runTest('PY-4489e9d3: 104 * (-182) = -18,928 correctly extracts -18928', async () => {
    const text = '$$104 \\times (-182) = -18,928$$';
    const claims = extractClaims(text, '104 * (-182)');
    const arith = claims.find(c => c.claim_type === 'arithmetic');
    assert.ok(arith, 'Arithmetic claim should be extracted');
    assert.strictEqual(arith.data.proposed_value, -18928);
    const res = await runDeterministicVerification(arith, '104 * (-182)');
    assert.strictEqual(res.verified, true);
  });

  await runTest('LaTeX spacing macros: 43\\,200 + 10\\,080 + 864 = 54\\,144', async () => {
    const text = '43\\,200 + 10\\,080 + 864 = 54\\,144';
    const claims = extractClaims(text, 'Calculate 144 * 376. Give the final answer.');
    const arith = claims.find(c => c.claim_type === 'arithmetic');
    assert.ok(arith, 'Arithmetic claim should be extracted');
    assert.strictEqual(arith.data.proposed_value, 54144);
    const res = await runDeterministicVerification(arith, 'Calculate 144 * 376. Give the final answer.');
    assert.strictEqual(res.verified, true);
  });

  console.log('\n--- SUITE 2: Algebraic Identities in Boxed Expressions ---');

  await runTest('PY-1f95ec5d: Boxed polynomial identity (x+3)^2 = x^2 + 6x + 9 does not extract fake roots', async () => {
    const text = "❌ Let's check this step carefully.\n\\boxed{(x+3)^2 = x^2 + 6x + 9}";
    const prompt = 'Check my work: (x + 3)^2 = x^2 + 9';
    const claims = extractClaims(text, prompt);
    const rootClaim = claims.find(c => c.claim_type === 'equation_solution');
    assert.strictEqual(rootClaim, undefined, 'Should not extract algebraic identity as equation roots');
  });

  await runTest('Legitimate root sets in boxed expressions are still extracted', async () => {
    const text = 'The solutions are \\boxed{x = 2, 3}';
    const prompt = 'solve x^2 - 5x + 6 = 0';
    const claims = extractClaims(text, prompt);
    const rootClaim = claims.find(c => c.claim_type === 'equation_solution');
    assert.ok(rootClaim, 'Should extract root set');
    assert.deepStrictEqual(rootClaim.data.proposed_solutions, [2, 3]);
  });

  console.log('\n--- SUITE 3: Prompt-Claim Fidelity with Arithmetic Reductions ---');

  await runTest('PY-bb0f39d5: 7/6 - 3/7 = 31/42 verifies with fidelity pass', async () => {
    const text = '7/6 - 3/7 = 31/42';
    const prompt = 'Evaluate: 7/6 - 3/7';
    const claims = extractClaims(text, prompt);
    assert.ok(claims.length > 0);
    const res = await runDeterministicVerification(claims[0], prompt);
    assert.strictEqual(res.verified, true);
  });

  await runTest('PY-4489e9d3: 3 + 7/12 = 43/12 verifies with fidelity pass', async () => {
    const text = '3 + 7/12 = 43/12';
    const prompt = 'Evaluate: 3 + 7/12';
    const claims = extractClaims(text, prompt);
    assert.ok(claims.length > 0);
    const res = await runDeterministicVerification(claims[0], prompt);
    assert.strictEqual(res.verified, true);
  });

  console.log('\n================================================================');
  console.log(`TOTAL: ${total} | PASSED: ${passed} | FAILED: ${total - passed}`);
  console.log('================================================================');

  if (passed !== total) {
    process.exit(1);
  }
}

main();
