/**
 * test-prompt-claim-fidelity-expansion.js
 * 
 * Comprehensive Test Suite for PROMPT-TO-CLAIM FIDELITY EXPANSION
 * 
 * Verifies that Pythos:
 * 1. Rejects answers that are mathematically correct for a MUTATED or WRONG problem.
 * 2. Catches variable substitution (asking for y, answering for x).
 * 3. Catches equation mutation and sign/operator drift.
 * 4. Catches condition/domain loss (asking for positive root, answering negative root or both).
 * 5. Catches multiple-answer violations (returning extraneous unconditioned roots).
 * 6. Catches entity substitution (asking for total cost, answering tax; asking for perimeter, answering hypotenuse).
 * 7. Catches geometric substitution (asking for diameter, answering radius).
 * 8. Catches function & calculus mutations (mutated function arguments or differentiated expressions).
 * 9. Catches physics entity confusion (asking for velocity, answering distance).
 * 10. Catches natural language ordering constraints (asking for smaller vs larger integer).
 * 11. Preserves 100% acceptance on legitimate, faithful solutions (ZERO false positives).
 */

const assert = require('assert');
const path = require('path');

const SERVER_DIR = 'C:/Projects/lanzar/pythos/server';
const {
  extractClaims,
  extractCandidateAnswer,
  runDeterministicVerification,
  evaluateCandidateDelivery
} = require(path.join(SERVER_DIR, 'verificationBridge'));

// Helper: runs verification and gate evaluation on a prompt + candidate pair
async function evaluatePromptCandidate(prompt, candidateText) {
  const claims = extractClaims(candidateText, prompt);
  const verifications = [];
  const candidateAnswer = extractCandidateAnswer(candidateText);

  for (const c of claims) {
    const res = await runDeterministicVerification(c, prompt);
    verifications.push(res);
  }

  const delivery = evaluateCandidateDelivery({
    candidateAnswer,
    verifications,
    claims,
    prompt
  });

  return {
    candidateAnswer,
    claims,
    verifications,
    delivered: delivery.delivered,
    status: delivery.status,
    reason: delivery.reason
  };
}

async function runFidelityExpansionSuite() {
  console.log('================================================================');
  console.log('🎯 PROMPT-TO-CLAIM FIDELITY EXPANSION TEST SUITE (26 TESTS)');
  console.log('================================================================\n');

  let total = 0;
  let passed = 0;
  const failures = [];

  async function checkCase(group, id, name, prompt, candidate, expectedDelivered) {
    total++;
    const res = await evaluatePromptCandidate(prompt, candidate);
    const ok = res.delivered === expectedDelivered;

    if (ok) {
      passed++;
      console.log(`  ✓ [PASS] [${group}] ${id}: ${name}`);
    } else {
      const err = `Expected delivered=${expectedDelivered}, got ${res.delivered} (Status: ${res.status}). Reason: ${res.reason || 'None'}`;
      failures.push({ group, id, name, error: err });
      console.log(`  ✗ [FAIL] [${group}] ${id}: ${name}`);
      console.log(`         ${err}`);
    }
  }

  // ==========================================================================
  // 1. VARIABLE / VALUE SUBSTITUTION (User asks for y, candidate answers x)
  // ==========================================================================
  console.log('--- 1. VARIABLE / VALUE SUBSTITUTION ---');

  // Adv 1: Prompt asks for y, candidate boxes x = 4
  await checkCase(
    'VAR_SUBST', 'ADV_1',
    'System of equations: prompt asks for y, candidate answers x = 4',
    'Solve the system: 2x + y = 10 and x - y = 2. What is the value of y?',
    'We solve the linear system: adding equations gives 3x = 12, so x = 4. Then y = 2. \\boxed{4}',
    false
  );

  // Pos Ctrl 1: Prompt asks for y, candidate correctly answers y = 2
  await checkCase(
    'VAR_SUBST', 'CTRL_1',
    '[Control] System of equations: prompt asks for y, candidate answers y = 2',
    'Solve the system: 2x + y = 10 and x - y = 2. What is the value of y?',
    'Solving the system yields x = 4 and y = 2. \\boxed{2}',
    true
  );

  // Adv 2: Prompt asks for a, candidate answers b = 2
  await checkCase(
    'VAR_SUBST', 'ADV_2',
    'System of equations: prompt asks for a, candidate answers b = 2',
    'Solve the system: 3a + b = 11 and a - b = 1. What is the value of a?',
    'Adding equations gives 4a = 12, so a = 3. Then b = 2. \\boxed{2}',
    false
  );

  // Pos Ctrl 2: Prompt asks for a, candidate answers a = 3
  await checkCase(
    'VAR_SUBST', 'CTRL_2',
    '[Control] System of equations: prompt asks for a, candidate answers a = 3',
    'Solve the system: 3a + b = 11 and a - b = 1. What is the value of a?',
    'Solving the system gives a = 3 and b = 2. \\boxed{3}',
    true
  );

  // ==========================================================================
  // 2. EQUATION MUTATION & OPERATOR CHANGES
  // ==========================================================================
  console.log('\n--- 2. EQUATION MUTATION & OPERATOR CHANGES ---');

  // Adv 3: Prompt has 2x + 5 = 15, candidate solves mutated 2x - 5 = 15
  await checkCase(
    'EQ_MUTATION', 'ADV_3',
    'Linear equation: prompt has 2x + 5 = 15, candidate solves 2x - 5 = 15 => 10',
    'Solve for x: 2x + 5 = 15',
    'Solving 2x - 5 = 15 gives 2x = 20, hence x = 10. \\boxed{10}',
    false
  );

  // Pos Ctrl 3: Linear equation faithful solution
  await checkCase(
    'EQ_MUTATION', 'CTRL_3',
    '[Control] Linear equation: prompt 2x + 5 = 15, candidate answers 5',
    'Solve for x: 2x + 5 = 15',
    'Subtracting 5 from both sides gives 2x = 10, so x = 5. \\boxed{5}',
    true
  );

  // Adv 4: Quadratic mutation: prompt x^2 - 4x - 5 = 0, candidate solves x^2 + 4x - 5 = 0
  await checkCase(
    'EQ_MUTATION', 'ADV_4',
    'Quadratic mutation: prompt x^2 - 4x - 5 = 0, candidate solves x^2 + 4x - 5 = 0',
    'Solve for x: x^2 - 4x - 5 = 0',
    'Factoring x^2 + 4x - 5 = 0 gives (x + 5)(x - 1) = 0, so x = 1 or x = -5. \\boxed{1}',
    false
  );

  // ==========================================================================
  // 3. SIGN CHANGES & ARITHMETIC OPERATOR FIDELITY
  // ==========================================================================
  console.log('\n--- 3. SIGN & ARITHMETIC OPERATOR FIDELITY ---');

  // Adv 5: Sign flip in arithmetic (-15 + 28 vs 15 + 28 = 43)
  await checkCase(
    'SIGN_OPERATOR', 'ADV_5',
    'Arithmetic: prompt has -15 + 28, candidate solves 15 + 28 = 43',
    'What is -15 + 28?',
    '15 + 28 = 43. \\boxed{43}',
    false
  );

  // Pos Ctrl 4: Arithmetic sign faithful
  await checkCase(
    'SIGN_OPERATOR', 'CTRL_4',
    '[Control] Arithmetic: prompt -15 + 28, candidate answers 13',
    'What is -15 + 28?',
    '-15 + 28 = 13. \\boxed{13}',
    true
  );

  // Adv 6: Operator change: 12 * 4 vs 12 + 4 = 16
  await checkCase(
    'SIGN_OPERATOR', 'ADV_6',
    'Arithmetic: prompt 12 * 4, candidate solves 12 + 4 = 16',
    'Calculate 12 * 4',
    '12 + 4 = 16. \\boxed{16}',
    false
  );

  // Pos Ctrl 5: Faithful multiplication
  await checkCase(
    'SIGN_OPERATOR', 'CTRL_5',
    '[Control] Arithmetic: prompt 12 * 4, candidate answers 48',
    'Calculate 12 * 4',
    '12 * 4 = 48. \\boxed{48}',
    true
  );

  // ==========================================================================
  // 4. DOMAIN / CONDITION LOSS & MULTIPLE-ANSWER REQUIREMENTS
  // ==========================================================================
  console.log('\n--- 4. DOMAIN & RESTRICTION CONDITIONS ---');

  // Adv 7: Asks for positive root, candidate boxes negative root -2
  await checkCase(
    'DOMAIN_COND', 'ADV_7',
    'Quadratic: asks for positive root, candidate boxes negative root -2',
    'Find the positive solution to x^2 - 2x - 8 = 0.',
    'Factoring gives roots x = 4 and x = -2. \\boxed{-2}',
    false
  );

  // Adv 8: Asks for positive root, candidate returns both roots [4, -2]
  await checkCase(
    'DOMAIN_COND', 'ADV_8',
    'Quadratic: asks for positive root, candidate returns both roots [4, -2]',
    'Find the positive solution to x^2 - 2x - 8 = 0.',
    'Factoring gives roots x = 4 and x = -2. \\boxed{4, -2}',
    false
  );

  // Pos Ctrl 6: Asks for positive root, candidate boxes positive root 4
  await checkCase(
    'DOMAIN_COND', 'CTRL_6',
    '[Control] Quadratic: asks for positive root, candidate boxes 4',
    'Find the positive solution to x^2 - 2x - 8 = 0.',
    'Factoring gives (x - 4)(x + 2) = 0. The positive solution is \\boxed{4}.',
    true
  );

  // Adv 9: Asks for non-zero solution, candidate boxes 0
  await checkCase(
    'DOMAIN_COND', 'ADV_9',
    'Quadratic: asks for non-zero solution, candidate boxes 0',
    'Solve for the non-zero value of x: x^2 - 5x = 0.',
    'Factoring gives x = 0 or x = 5. \\boxed{0}',
    false
  );

  // Pos Ctrl 7: Asks for non-zero solution, candidate boxes 5
  await checkCase(
    'DOMAIN_COND', 'CTRL_7',
    '[Control] Quadratic: asks for non-zero solution, candidate boxes 5',
    'Solve for the non-zero value of x: x^2 - 5x = 0.',
    'Factoring gives x(x - 5) = 0. The non-zero solution is \\boxed{5}.',
    true
  );

  // ==========================================================================
  // 5. WORD-PROBLEM ENTITY FIDELITY
  // ==========================================================================
  console.log('\n--- 5. WORD-PROBLEM ENTITY FIDELITY ---');

  // Adv 10: Financial: asks for total cost, candidate boxes tax alone (4)
  await checkCase(
    'ENTITY_FIDELITY', 'ADV_10',
    'Financial: asks for total cost, candidate boxes tax alone (4)',
    'A jacket costs $50 with an 8% sales tax. What is the total cost?',
    'The sales tax is 50 * 0.08 = 4. \\boxed{4}',
    false
  );

  // Pos Ctrl 8: Financial: total cost = 54
  await checkCase(
    'ENTITY_FIDELITY', 'CTRL_8',
    '[Control] Financial: total cost = 50 + 4 = 54',
    'A jacket costs $50 with an 8% sales tax. What is the total cost?',
    'The sales tax is 50 * 0.08 = 4. The total cost is 50 + 4 = 54. \\boxed{54}',
    true
  );

  // Adv 11: Triangle: asks for perimeter, candidate boxes hypotenuse (10)
  await checkCase(
    'ENTITY_FIDELITY', 'ADV_11',
    'Geometric: asks for perimeter of right triangle, candidate boxes hypotenuse (10)',
    'A right triangle has legs of length 6 and 8. What is the perimeter of the triangle?',
    'The hypotenuse is sqrt(6^2 + 8^2) = 10. \\boxed{10}',
    false
  );

  // Pos Ctrl 9: Triangle: perimeter = 24
  await checkCase(
    'ENTITY_FIDELITY', 'CTRL_9',
    '[Control] Geometric: perimeter = 6 + 8 + 10 = 24',
    'A right triangle has legs of length 6 and 8. What is the perimeter of the triangle?',
    'The hypotenuse is sqrt(6^2 + 8^2) = 10. The perimeter is 6 + 8 + 10 = 24. \\boxed{24}',
    true
  );

  // ==========================================================================
  // 6. GEOMETRIC FIDELITY (Diameter vs Radius)
  // ==========================================================================
  console.log('\n--- 6. GEOMETRIC FIDELITY ---');

  // Adv 12: Circle: asks for diameter, candidate boxes radius (7)
  await checkCase(
    'GEOM_FIDELITY', 'ADV_12',
    'Circle: asks for diameter, candidate boxes radius (7)',
    'A circle has an area of 49pi. What is the diameter of the circle?',
    'Area is pi * r^2 = 49pi, so r = 7. \\boxed{7}',
    false
  );

  // Pos Ctrl 10: Circle: diameter = 14
  await checkCase(
    'GEOM_FIDELITY', 'CTRL_10',
    '[Control] Circle: diameter = 2 * 7 = 14',
    'A circle has an area of 49pi. What is the diameter of the circle?',
    'Area is pi * r^2 = 49pi, so r = 7. The diameter is 2 * 7 = 14. \\boxed{14}',
    true
  );

  // ==========================================================================
  // 7. FUNCTION & CALCULUS FIDELITY
  // ==========================================================================
  console.log('\n--- 7. FUNCTION & CALCULUS FIDELITY ---');

  // Adv 13: Calculus: candidate mutates expression from 3x^2 to 3x^3
  await checkCase(
    'CALCULUS_FIDELITY', 'ADV_13',
    'Calculus: prompt asks for d/dx[3x^2], candidate differentiates mutated 3x^3 => 9x^2',
    'Find the derivative of 3x^2 with respect to x.',
    '\\frac{d}{dx}[3x^3] = 9x^2 \\quad \\boxed{9x^2}',
    false
  );

  // Adv 14: Calculus: prompt asks for derivative, candidate integrates
  await checkCase(
    'CALCULUS_FIDELITY', 'ADV_14',
    'Calculus: prompt asks for derivative of 3x^2, candidate integrates to x^3',
    'Find the derivative of 3x^2 with respect to x.',
    'Integrating 3x^2 gives x^3. \\boxed{x^3}',
    false
  );

  // Pos Ctrl 11: Calculus: faithful derivative d/dx[3x^2] = 6x
  await checkCase(
    'CALCULUS_FIDELITY', 'CTRL_11',
    '[Control] Calculus: faithful derivative d/dx[3x^2] = 6x',
    'Find the derivative of 3x^2 with respect to x.',
    '\\frac{d}{dx}[3x^2] = 6x \\quad \\boxed{6x}',
    true
  );

  // ==========================================================================
  // 8. PHYSICS & ORDERING CONSTRAINTS
  // ==========================================================================
  console.log('\n--- 8. PHYSICS & ORDERING CONSTRAINTS ---');

  // Adv 15: Kinematics: asks for velocity, candidate boxes distance
  await checkCase(
    'PHYSICS_FIDELITY', 'ADV_15',
    'Physics: asks for final velocity, candidate boxes distance (40)',
    'Calculate the final velocity for an object accelerating at 5 m/s^2 for 4 seconds from rest.',
    'The distance is d = 0.5 * a * t^2 = 0.5 * 5 * 16 = 40 meters. \\boxed{40}',
    false
  );

  // Pos Ctrl 12: Kinematics: final velocity = 20 m/s
  await checkCase(
    'PHYSICS_FIDELITY', 'CTRL_12',
    '[Control] Physics: final velocity v = at = 20 m/s',
    'Calculate the final velocity for an object accelerating at 5 m/s^2 for 4 seconds from rest.',
    'Using v = u + at, we have v = 0 + (5)(4) = 20 m/s. \\boxed{20}',
    true
  );

  // Adv 16: Consecutive integers: asks for smaller, candidate boxes larger (21)
  await checkCase(
    'ORDERING_CONSTRAINTS', 'ADV_16',
    'Ordering: asks for smaller integer, candidate boxes larger integer (21)',
    'The sum of two consecutive positive integers is 41. What is the smaller integer?',
    'Let n and n + 1 be the integers. 2n + 1 = 41 => n = 20, and n + 1 = 21. \\boxed{21}',
    false
  );

  // Pos Ctrl 13: Consecutive integers: smaller integer = 20
  await checkCase(
    'ORDERING_CONSTRAINTS', 'CTRL_13',
    '[Control] Ordering: smaller integer = 20',
    'The sum of two consecutive positive integers is 41. What is the smaller integer?',
    'Let n and n + 1 be the integers. 2n + 1 = 41 => n = 20. \\boxed{20}',
    true
  );

  // ==========================================================================
  // SUMMARY
  // ==========================================================================
  console.log('\n================================================================');
  console.log(`TOTAL FIDELITY EXPANSION TESTS: ${total}`);
  console.log(`PASSED:                        ${passed} (${((passed/total)*100).toFixed(1)}%)`);
  console.log(`FAILED:                        ${failures.length}`);
  console.log('================================================================\n');

  if (failures.length > 0) {
    console.log('Summary of Gaps / Failures:');
    failures.forEach((f, idx) => {
      console.log(`  ${idx + 1}. [${f.group}] ${f.id} (${f.name}) -> ${f.error}`);
    });
  }

  return { total, passed, failed: failures.length, failures };
}

if (require.main === module) {
  runFidelityExpansionSuite()
    .then(res => process.exit(res.failed > 0 ? 1 : 0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { runFidelityExpansionSuite, evaluatePromptCandidate };
