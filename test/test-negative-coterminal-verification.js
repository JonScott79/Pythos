const assert = require('assert');
const vb = require('../server/verificationBridge');

console.log('================================================================');
console.log('📐 PYTHOS REGRESSION TEST: NEGATIVE COTERMINAL ANGLE VERIFICATION');
console.log('================================================================');

async function runTests() {
  // Test 1: Full negative coterminal angle derivation
  const derivation = `Find a positive angle less than 360° that is coterminal with -1040°.
Step 1: -1040 + 360 = -680
Step 2: -680 + 360 = -320
Step 3: -320 + 360 = 40
Therefore, the coterminal angle is 40°.`;

  const claims1 = vb.extractClaims(derivation);
  assert.strictEqual(claims1.length, 3, 'Should extract all 3 negative addition steps');
  for (const c of claims1) {
    const v = await vb.runDeterministicVerification(c);
    assert.strictEqual(v.verified, true, `Step "${c.raw_match}" should be verified as true`);
    assert.strictEqual(v.status, 'VERIFIED');
  }
  console.log('✓ [PASS 1] Multi-step negative angle addition verified cleanly');

  // Test 2: Multiplication with negative angle: -1040 + 3 * 360 = 40
  const multDerivation = `We can add multiples of 360°:
-1040 + 3 * 360 = 40
The coterminal angle is 40°.`;

  const claims2 = vb.extractClaims(multDerivation);
  assert.strictEqual(claims2.length, 1, 'Should extract 1 arithmetic claim');
  assert.strictEqual(claims2[0].data.expression, '-1040 + 3 * 360');
  assert.strictEqual(claims2[0].data.proposed_value, 40);
  const v2 = await vb.runDeterministicVerification(claims2[0]);
  assert.strictEqual(v2.verified, true, '-1040 + 3 * 360 = 40 must verify as true');
  console.log('✓ [PASS 2] Leading negative operand with multiplication verified without truncation');

  // Test 3: LaTeX degree symbols and boxed notation
  const latexDerivation = `$$\\theta = -1040^\\circ + 3 \\times 360^\\circ = 40^\\circ$$
Also: -680^\\circ + 360^\\circ = \\boxed{-320^\\circ}`;

  const claims3 = vb.extractClaims(latexDerivation);
  assert.strictEqual(claims3.length, 2, 'Should extract 2 LaTeX claims');
  for (const c of claims3) {
    const v = await vb.runDeterministicVerification(c);
    assert.strictEqual(v.verified, true, `LaTeX claim "${c.raw_match}" must verify as true`);
  }
  console.log('✓ [PASS 3] LaTeX degree symbols and boxed notation normalized and verified');

  // Test 4: Erroneous student claim identification
  const incorrectCheck = `320 is incorrect because -1040 - 320 = -1360, which is not divisible by 360.`;
  const claims4 = vb.extractClaims(incorrectCheck);
  assert.strictEqual(claims4.length, 1, 'Should extract -1040 - 320 = -1360 from prose');
  const v4 = await vb.runDeterministicVerification(claims4[0]);
  assert.strictEqual(v4.verified, true, '-1040 - 320 = -1360 is mathematically correct');
  console.log('✓ [PASS 4] Negative subtraction inside explanatory prose extracted and verified');

  console.log('================================================================');
  console.log('🎉 ALL NEGATIVE COTERMINAL ANGLE VERIFICATION TESTS PASSED');
  console.log('================================================================');
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
