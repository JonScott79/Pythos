/**
 * test-revision-reverification.js
 *
 * P1 Test Suite: Verification of LLM Response Revisions.
 * Tests:
 * 1. Bad first response -> good revision: Final state becomes VERIFIED.
 * 2. Bad first response -> bad revision: Persisting error is detected, status is NOT verified.
 * 3. Bad first response -> revision introduces a different error: New error is caught.
 * 4. Correct first response -> no unnecessary revision loop.
 * 5. Metadata correspondence: Final verification claims match final response content.
 */

const assert = require('assert');
const { extractClaims, auditInternalConsistency, runDeterministicVerification } = require('../server/verificationBridge');

async function verifyContent(content, userQuery = '') {
  const claims = extractClaims(content, userQuery);
  const internalContradictions = auditInternalConsistency(claims);
  const verificationResults = [];
  const invalidClaims = [];

  for (let ci = 0; ci < claims.length; ci++) {
    const claim = claims[ci];
    const verification = await runDeterministicVerification(claim);
    if (verification) {
      verificationResults.push(verification);
    }
    if (verification && verification.verified === false && verification.status !== 'UNKNOWN') {
      invalidClaims.push({ claim, verification, claimIndex: ci });
    }
  }

  return {
    claims,
    internalContradictions,
    verificationResults,
    invalidClaims,
    isFullyVerified: invalidClaims.length === 0 && internalContradictions.length === 0 && verificationResults.every(v => v.verified === true)
  };
}

async function runRevisionTests() {
  console.log('=================================================================');
  console.log('🔄 PYTHOS P1: REVISED RESPONSE RE-VERIFICATION INTEGRITY SUITE');
  console.log('=================================================================\n');

  // -------------------------------------------------------------
  // TEST 1: Bad first response -> good revision
  // -------------------------------------------------------------
  console.log('▶ [TEST 1] Bad first response -> good revision');
  const badInitial = "Let's calculate the fraction: \\frac{3}{4} = 0.85. Therefore, the probability is 0.85.";
  const initialAudit = await verifyContent(badInitial);

  assert.strictEqual(initialAudit.invalidClaims.length, 1, 'Initial response must have 1 invalid claim');
  assert.strictEqual(initialAudit.isFullyVerified, false);
  console.log('  Initial response correctly rejected (3/4 != 0.85).');

  // Revised response arrives with correct math
  const goodRevision = "Let's recalculate the fraction: \\frac{3}{4} = 0.75. Therefore, the probability is 0.75.";
  const revisionAudit = await verifyContent(goodRevision);

  assert.strictEqual(revisionAudit.invalidClaims.length, 0, 'Revision must have 0 invalid claims');
  assert.strictEqual(revisionAudit.isFullyVerified, true);
  assert.strictEqual(revisionAudit.verificationResults[0].status, 'VERIFIED');
  console.log('  ✓ Revised response re-verified and verified as correct.');

  // -------------------------------------------------------------
  // TEST 2: Bad first response -> bad revision (persisting error)
  // -------------------------------------------------------------
  console.log('▶ [TEST 2] Bad first response -> bad revision');
  const stillBadRevision = "Upon review, \\frac{3}{4} = 0.80. So the answer is 0.80.";
  const stillBadAudit = await verifyContent(stillBadRevision);

  assert.strictEqual(stillBadAudit.invalidClaims.length, 1, 'Still bad revision must be caught');
  assert.strictEqual(stillBadAudit.isFullyVerified, false);
  assert.strictEqual(stillBadAudit.verificationResults[0].status, 'INCORRECT_RESULT');
  console.log('  ✓ Persisting invalid calculation in revision is caught.');

  // -------------------------------------------------------------
  // TEST 3: Bad first response -> revision introduces different error
  // -------------------------------------------------------------
  console.log('▶ [TEST 3] Revision introduces new different error');
  // First step 3/4 = 0.75 is fixed, but second step \\frac{1}{2} = 0.60 introduces new error
  const newErrorRevision = "Fixing the calculation: \\frac{3}{4} = 0.75, but for the next step \\frac{1}{2} = 0.60.";
  const newErrorAudit = await verifyContent(newErrorRevision);

  assert.strictEqual(newErrorAudit.claims.length, 2);
  assert.strictEqual(newErrorAudit.invalidClaims.length, 1);
  assert.ok(newErrorAudit.invalidClaims[0].claim.raw_match.includes('1}{2} = 0.60'));
  assert.strictEqual(newErrorAudit.isFullyVerified, false);
  console.log('  ✓ Newly introduced error in revised response is caught.');

  // -------------------------------------------------------------
  // TEST 4: Correct first response -> no revision needed
  // -------------------------------------------------------------
  console.log('▶ [TEST 4] Correct first response');
  const correctInitial = "Evaluating: \\frac{1}{4} = 0.25. The result is 0.25.";
  const correctAudit = await verifyContent(correctInitial);

  assert.strictEqual(correctAudit.invalidClaims.length, 0);
  assert.strictEqual(correctAudit.internalContradictions.length, 0);
  assert.strictEqual(correctAudit.isFullyVerified, true);
  console.log('  ✓ Correct first response verified cleanly without revision trigger.');

  // -------------------------------------------------------------
  // TEST 5: Metadata correspondence
  // -------------------------------------------------------------
  console.log('▶ [TEST 5] Verification metadata matches final revised content');
  const multiStepGood = "First: \\frac{1}{2} = 0.50. Second: \\frac{1}{4} = 0.25.";
  const multiStepAudit = await verifyContent(multiStepGood);

  assert.strictEqual(multiStepAudit.claims.length, 2);
  assert.strictEqual(multiStepAudit.claims[0].data.proposed_value, 0.5);
  assert.strictEqual(multiStepAudit.claims[1].data.proposed_value, 0.25);
  console.log('  ✓ Claims metadata strictly corresponds to final response text.');

  console.log('\n=================================================================');
  console.log('✅ ALL P1 REVISED RESPONSE RE-VERIFICATION TESTS PASSED');
  console.log('=================================================================');
}

runRevisionTests().catch(err => {
  console.error('\n❌ REVISION RE-VERIFICATION TEST FAILED:', err);
  process.exit(1);
});
