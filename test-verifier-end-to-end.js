/**
 * test-verifier-end-to-end.js
 * End-to-End Verification Engine Test across all 10 Milestones
 */

const { runDeterministicVerification } = require('./server/verificationBridge');

async function runEndToEndTests() {
  console.log('==================================================');
  console.log('🔬 PYTHOS DETERMINISTIC VERIFIER END-TO-END SUITE');
  console.log('==================================================\n');

  const tests = [
    {
      name: 'TEST 1: sqrt(15) != 5, sqrt(15) ≈ 3.873',
      claim: { domain: 'arithmetic', claim_type: 'arithmetic', data: { operation: 'sqrt', radicand: 15, proposed_value: 5 } },
      expectVerified: false,
      expectStatus: 'INCORRECT_RESULT'
    },
    {
      name: 'TEST 2: 2x + 7 = 19 -> x = 6',
      claim: { domain: 'algebra', claim_type: 'algebra', data: { equation: '2*x + 7 = 19', variable: 'x', proposed_solutions: [6] } },
      expectVerified: true,
      expectStatus: 'VERIFIED'
    },
    {
      name: 'TEST 3: Birthday problem threshold n = 23 (P >= 0.5)',
      claim: { domain: 'probability', claim_type: 'birthday_problem', data: { proposed_n: 23 } },
      expectVerified: true,
      expectStatus: 'VERIFIED'
    },
    {
      name: 'TEST 4: Birthday problem incorrect formula rejection',
      claim: { domain: 'probability', claim_type: 'birthday_problem', data: { formula_type: 'incorrect_permutation' } },
      expectVerified: false,
      expectStatus: 'INVALID_FORMULA'
    },
    {
      name: 'TEST 5: Conical pendulum force decomposition (T cos θ = Mg, T sin θ = Mv²/R)',
      claim: { domain: 'physics', claim_type: 'conical_pendulum', data: { angle_reference: 'vertical', claims_net_force_zero: false } },
      expectVerified: true,
      expectStatus: 'VERIFIED'
    },
    {
      name: 'TEST 6: Conical pendulum net force zero rejection',
      claim: { domain: 'physics', claim_type: 'conical_pendulum', data: { angle_reference: 'vertical', claims_net_force_zero: true } },
      expectVerified: false,
      expectStatus: 'INCORRECT_FORCE_BALANCE'
    },
    {
      name: 'TEST 7: Lost-root algebra x^2 = 5x (Flags lost root if only x=5 is provided)',
      claim: { domain: 'algebra', claim_type: 'algebra', data: { equation: 'x^2 - 5*x = 0', variable: 'x', proposed_solutions: [5] } },
      expectVerified: false,
      expectStatus: 'LOST_ROOT'
    },
    {
      name: 'TEST 8: Extraneous-root detection: sqrt(x+3) = x-3 (x=1 is extraneous)',
      claim: { domain: 'algebra', claim_type: 'algebra', data: { equation: 'sqrt(x + 3) = x - 3', variable: 'x', proposed_solutions: [6, 1] } },
      expectVerified: false,
      expectStatus: 'EXTRANEOUS_ROOT'
    },
    {
      name: 'TEST 9: Kinematics numerical completion t = sqrt(2*20/9.8) ≈ 2.02 s',
      claim: { domain: 'physics', claim_type: 'free_fall', data: { height: 20, g: 9.8, proposed_time: 2.02 } },
      expectVerified: true,
      expectStatus: 'VERIFIED'
    },
    {
      name: 'TEST 10: Deliberate incorrect solution rejection (2x + 7 = 19 -> x = 10)',
      claim: { domain: 'algebra', claim_type: 'algebra', data: { equation: '2*x + 7 = 19', variable: 'x', proposed_solutions: [10] } },
      expectVerified: false,
      expectStatus: 'EXTRANEOUS_ROOT'
    },
    {
      name: 'TEST 11: Level 6 Calculus Derivative d/dx[ln(2x)] = 1/x',
      claim: { domain: 'calculus', claim_type: 'derivative', data: { expression: 'ln(2*x)', variable: 'x', proposed_derivative: '1/x' } },
      expectVerified: true,
      expectStatus: 'VERIFIED'
    },
    {
      name: 'TEST 12: Level 6 Calculus Change of Variables x = tan(u) in 1/(1+x^2) dx -> 1 du',
      claim: {
        domain: 'calculus',
        claim_type: 'change_of_variables',
        data: {
          original_integrand: '1/(1 + x^2)',
          substitution: 'tan(u)',
          old_variable: 'x',
          new_variable: 'u',
          proposed_transformed_integrand: '1'
        }
      },
      expectVerified: true,
      expectStatus: 'VERIFIED'
    },
    {
      name: 'TEST 13: Level 10 Physics Dimensional Homogeneity (Force vs Energy mismatch rejection)',
      claim: { domain: 'physics', claim_type: 'dimensions', data: { lhs_dimension: 'force', rhs_dimension: 'energy' } },
      expectVerified: false,
      expectStatus: 'DIMENSION_ERROR'
    },
    {
      name: 'TEST 14: Level 10 Physics Conservation of Energy System Audit (Friction invalidates ΔK+ΔU=0)',
      claim: {
        domain: 'physics',
        claim_type: 'conservation_law',
        data: {
          law: 'conservation_of_energy',
          nonconservative_forces: true,
          claims_conserved: true
        }
      },
      expectVerified: false,
      expectStatus: 'INCONSISTENT_ASSUMPTION'
    }
  ];

  let passed = 0;
  for (let i = 0; i < tests.length; i++) {
    const t = tests[i];
    console.log(`▶ [TEST ${i + 1}] ${t.name}...`);
    const res = await runDeterministicVerification(t.claim);
    const pass = res.verified === t.expectVerified && res.status === t.expectStatus;
    console.log(`Result:`, res);
    console.log(`Status: ${pass ? '✅ PASSED' : '❌ FAILED'}\n`);
    if (pass) passed++;
  }

  console.log('==================================================');
  console.log(`📊 END-TO-END VERIFICATION SUMMARY: ${passed}/${tests.length} (${Math.round(passed/tests.length*100)}%)`);
  console.log('==================================================\n');

  if (passed !== tests.length) {
    process.exit(1);
  }
}

runEndToEndTests();
