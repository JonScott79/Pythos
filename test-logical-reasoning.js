/**
 * test-logical-reasoning.js
 *
 * Dedicated verification suite for Priority 10:
 * Logical / Analytical Reasoning Verification Layer & Tri-Aspect Breakdown.
 */

const { auditLogicalEntailment, verifyTriAspect } = require('./server/reasoningVerifier');
const { runDeterministicVerification } = require('./server/verificationBridge');

async function runLogicalReasoningTests() {
  console.log('==================================================');
  console.log('🧠 PYTHOS LOGICAL & ANALYTICAL REASONING SUITE (PRIORITY 10)');
  console.log('==================================================\n');

  let passed = 0;
  let total = 0;

  // TEST 1: Incomplete algebraic entailment generates concrete counterexample
  total++;
  console.log('▶ [TEST 1] Algebraic Entailment: x^2 = 9 => x = 3 (Fails with counterexample x = -3)');
  const res1 = await auditLogicalEntailment('x^2 = 9', 'x = 3', [], 'x');
  if (!res1.verified && res1.status === 'INVALID_INFERENCE' && res1.counterexample === -3) {
    console.log(`  Result: Status=${res1.status}, Counterexample=${res1.counterexample}`);
    console.log('  Status: ✅ PASSED\n');
    passed++;
  } else {
    console.error('  Result:', res1);
    console.error('  Status: ❌ FAILED\n');
  }

  // TEST 2: Algebraic entailment with explicit valid assumption passes
  total++;
  console.log('▶ [TEST 2] Algebraic Entailment with Assumption: x^2 = 9 ∧ x > 0 => x = 3 (Verified)');
  const res2 = await auditLogicalEntailment('x^2 = 9', 'x = 3', ['x > 0'], 'x');
  if (res2.verified && res2.status === 'VERIFIED') {
    console.log(`  Result: Status=${res2.status}`);
    console.log('  Status: ✅ PASSED\n');
    passed++;
  } else {
    console.error('  Result:', res2);
    console.error('  Status: ❌ FAILED\n');
  }

  // TEST 3: Unstated assumption detection: x^2 = 5x => x = 5 (Divides by x without x != 0)
  total++;
  console.log('▶ [TEST 3] Unstated Assumption Audit: x^2 = 5x => x = 5 (Detects missing x != 0)');
  const res3 = await auditLogicalEntailment('x^2 = 5*x', 'x = 5', [], 'x');
  if (!res3.verified && res3.status === 'UNESTABLISHED_ASSUMPTION' && res3.counterexample === 0) {
    console.log(`  Result: Status=${res3.status}, Missing Assumption=${res3.missing_assumption}, Counterexample=${res3.counterexample}`);
    console.log('  Status: ✅ PASSED\n');
    passed++;
  } else {
    console.error('  Result:', res3);
    console.error('  Status: ❌ FAILED\n');
  }

  // TEST 4: Propositional Deductive Entailment (Modus Ponens)
  total++;
  console.log('▶ [TEST 4] Propositional Logic: (P => Q) ∧ P => Q (Verified)');
  const res4 = await runDeterministicVerification({
    domain: 'logic',
    claim_type: 'logical_entailment',
    data: {
      premises: ['Implies(P, Q)', 'P'],
      conclusion: 'Q'
    }
  });
  if (res4.verified && res4.status === 'VERIFIED') {
    console.log(`  Result: Status=${res4.status}`);
    console.log('  Status: ✅ PASSED\n');
    passed++;
  } else {
    console.error('  Result:', res4);
    console.error('  Status: ❌ FAILED\n');
  }

  // TEST 5: Propositional Fallacy Detection (Affirming the Consequent)
  total++;
  console.log('▶ [TEST 5] Propositional Fallacy: (P => Q) ∧ Q => P (Affirming Consequent)');
  const res5 = await runDeterministicVerification({
    domain: 'logic',
    claim_type: 'logical_entailment',
    data: {
      premises: ['Implies(P, Q)', 'Q'],
      conclusion: 'P'
    }
  });
  if (!res5.verified && res5.status === 'INVALID_INFERENCE' && res5.counterexample && res5.counterexample.P === false) {
    console.log(`  Result: Status=${res5.status}, Counterexample=${JSON.stringify(res5.counterexample)}`);
    console.log('  Status: ✅ PASSED\n');
    passed++;
  } else {
    console.error('  Result:', res5);
    console.error('  Status: ❌ FAILED\n');
  }

  // TEST 6: Tri-Aspect Verification Breakdown (Correct Math, Flawed Logic)
  total++;
  console.log('▶ [TEST 6] Tri-Aspect Breakdown: Calculation 3^2 = 9 is correct, but Deduction x^2 = 9 => x = 3 fails');
  const res6 = await verifyTriAspect({
    mathematicsClaim: {
      domain: 'arithmetic',
      claim_type: 'arithmetic',
      data: { expression: '3^2', proposed_value: 9 }
    },
    logicClaim: {
      domain: 'logic',
      claim_type: 'logical_entailment',
      data: { premise: 'x^2 = 9', conclusion: 'x = 3', variable: 'x' }
    }
  });
  if (
    !res6.overall_verified &&
    res6.aspects.mathematics.verified === true &&
    res6.aspects.logic.verified === false &&
    res6.counterexample === -3
  ) {
    console.log(`  Aspects Breakdown: Math=${res6.aspects.mathematics.status}, Logic=${res6.aspects.logic.status}`);
    console.log(`  Details: ${res6.details.join(' | ')}`);
    console.log('  Status: ✅ PASSED\n');
    passed++;
  } else {
    console.error('  Result:', res6);
    console.error('  Status: ❌ FAILED\n');
  }

  console.log('==================================================');
  console.log(`📊 LOGICAL REASONING SUMMARY: ${passed}/${total} (${Math.round((passed/total)*100)}%)`);
  console.log('==================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runLogicalReasoningTests().catch(err => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
