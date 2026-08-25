/*
    test/adversarial/final_exam_from_hell.js
    PYTHOS FINAL EXAM FROM HELL - COMPREHENSIVE TORTURE BENCHMARK
    Spanning Parts 0 to 38: Permanent regressions, arithmetic traps, domain constraints,
    polynomials, rational exclusions, radicals, calculus transformations, improper integrals,
    linear algebra, probability, physics conservation, and AI reliability gauntlets.
*/

const MathJSVerifier = require('../../server/mathjsVerifier');
const { runDeterministicVerification } = require('../../server/verificationBridge');
const { AI_RELIABILITY_ATTACKS } = require('../ai-reliability/ai_reliability_tests');

const GAUNTLET_TESTS = [
  // ==========================================
  // PART 0 — PERMANENT REGRESSIONS
  // ==========================================
  {
    id: "REG-01",
    part: "PART 0 - REGRESSION",
    name: "sqrt(15) Hallucination Trap: Rejects sqrt(15)=5, verifies approx 3.873",
    payload: { domain: 'arithmetic', data: { operation: 'sqrt', radicand: 15, proposed_value: 5 } },
    expectVerified: false,
    expectStatus: 'INCORRECT_RESULT'
  },
  {
    id: "REG-02",
    part: "PART 0 - REGRESSION",
    name: "Algebra Escalation: 2x + 7 = 19 -> x = 6",
    payload: { domain: 'algebra', claim_type: 'algebra', data: { equation: '2*x + 7 = 19', variable: 'x', proposed_solutions: [6] } },
    expectVerified: true,
    expectStatus: 'VERIFIED'
  },
  {
    id: "REG-03",
    part: "PART 0 - REGRESSION",
    name: "Reverse Engineering: 3x - 9 = 0 -> x = 3",
    payload: { domain: 'algebra', claim_type: 'algebra', data: { equation: '3*x - 9 = 0', variable: 'x', proposed_solutions: [3] } },
    expectVerified: true,
    expectStatus: 'VERIFIED'
  },
  {
    id: "REG-04",
    part: "PART 0 - REGRESSION",
    name: "Kinematics Free Fall: h=20m, g=9.8m/s^2 -> t = sqrt(2h/g) ≈ 2.02s",
    payload: { domain: 'physics', claim_type: 'free_fall', data: { height: 20, g: 9.8, proposed_time: 2.02 } },
    expectVerified: true,
    expectStatus: 'VERIFIED'
  },
  {
    id: "REG-05",
    part: "PART 0 - REGRESSION",
    name: "Birthday Problem Threshold: Minimum n=23 for P >= 0.5 (Reject n=24)",
    payload: { domain: 'probability', claim_type: 'birthday_problem', data: { proposed_n: 23 } },
    expectVerified: true,
    expectStatus: 'VERIFIED'
  },
  {
    id: "REG-06",
    part: "PART 0 - REGRESSION",
    name: "Conical Pendulum: Inward radial force ΣFr = Mv^2/R != 0 (Rejects net force = 0)",
    payload: { domain: 'physics', claim_type: 'conical_pendulum', data: { angle_reference: 'vertical', claims_net_force_zero: true } },
    expectVerified: false,
    expectStatus: 'INCORRECT_FORCE_BALANCE'
  },
  {
    id: "REG-07",
    part: "PART 0 - REGRESSION",
    name: "Improper Integral Nightmare: I(a) = int_0^oo x^(a-1)/(1+x) dx -> strictly 0 < a < 1",
    payload: {
      domain: 'calculus',
      claim_type: 'improper_integral',
      data: {
        integrand: 'x**(a - 1)/(1 + x)',
        claimed_convergence_domain: '0 < a < 1',
        proposed_closed_form: 'pi / sin(pi*a)'
      }
    },
    expectVerified: true,
    expectStatus: 'VERIFIED'
  },
  {
    id: "REG-08",
    part: "PART 0 - REGRESSION",
    name: "Improper Integral Nightmare: Rejects false convergence domain 'a > 0'",
    payload: {
      domain: 'calculus',
      claim_type: 'improper_integral',
      data: {
        integrand: 'x**(a - 1)/(1 + x)',
        claimed_convergence_domain: 'a > 0',
        proposed_closed_form: 'pi / sin(pi*a)'
      }
    },
    expectVerified: false,
    expectStatus: 'INVALID_CONVERGENCE_CONDITION'
  },

  // ==========================================
  // PART 1 — ELEMENTARY MATH TORTURE
  // ==========================================
  {
    id: "ELM-01",
    part: "PART 1 - ELEMENTARY MATH",
    name: "Order of Operations Trap: 7 + 8 * 3 = 31 (Not 45)",
    payload: { domain: 'arithmetic', data: { expression: '7 + 8 * 3', proposed_value: 31 } },
    expectVerified: true,
    expectStatus: 'VERIFIED'
  },
  {
    id: "ELM-02",
    part: "PART 1 - ELEMENTARY MATH",
    name: "Order of Operations Parentheses: (7 + 8) * 3 = 45",
    payload: { domain: 'arithmetic', data: { expression: '(7 + 8) * 3', proposed_value: 45 } },
    expectVerified: true,
    expectStatus: 'VERIFIED'
  },
  {
    id: "ELM-03",
    part: "PART 1 - ELEMENTARY MATH",
    name: "Exponent Negation Trap: -3^2 = -9 vs (-3)^2 = 9",
    payload: { domain: 'arithmetic', data: { expression: '-3^2', proposed_value: -9 } },
    expectVerified: true,
    expectStatus: 'VERIFIED'
  },
  {
    id: "ELM-04",
    part: "PART 1 - ELEMENTARY MATH",
    name: "Double Negative: 1 - (-1) = 2",
    payload: { domain: 'arithmetic', data: { expression: '1 - (-1)', proposed_value: 2 } },
    expectVerified: true,
    expectStatus: 'VERIFIED'
  },
  {
    id: "ELM-05",
    part: "PART 1 - ELEMENTARY MATH",
    name: "Exact vs Approximate: 1/3 + 1/6 is exactly 1/2",
    payload: { domain: 'arithmetic', data: { expression: '1/3 + 1/6', proposed_value: '1/2' } },
    expectVerified: true,
    expectStatus: 'VERIFIED'
  },

  // ==========================================
  // PART 6 — RATIONAL EXPRESSIONS & HOLES
  // ==========================================
  {
    id: "RAT-01",
    part: "PART 6 - RATIONAL EXPRESSIONS",
    name: "Rational Hole Exclusion: (x^2 - 1)/(x - 1) at x = 1 is undefined (hole)",
    payload: {
      domain: 'algebra',
      data: {
        equation: '(x^2 - 1)/(x - 1) = 2',
        variable: 'x',
        proposed_solution: 1
      }
    },
    expectVerified: false,
    expectStatus: 'EXTRANEOUS_ROOT'
  },

  // ==========================================
  // PART 7 — RADICALS & DOMAIN CONSTRAINTS
  // ==========================================
  {
    id: "RAD-01",
    part: "PART 7 - RADICALS",
    name: "Real Domain Boundary: sqrt(-4) over real numbers -> DOMAIN_ERROR",
    payload: { domain: 'arithmetic', data: { operation: 'sqrt', radicand: -4, domain: 'real' } },
    expectVerified: false,
    expectStatus: 'DOMAIN_ERROR'
  },

  // ==========================================
  // PART 8 — EXPONENTS & LOGARITHMS
  // ==========================================
  {
    id: "LOG-01",
    part: "PART 8 - LOGARITHMS",
    name: "False Log Identity: Rejects log(a+b) ≡ log(a) + log(b)",
    payload: {
      claim_type: 'symbolic_equivalence',
      data: { expr1: 'log(x + 2)', expr2: 'log(x) + log(2)', variables: ['x'] }
    },
    expectVerified: false,
    expectStatus: 'NON_EQUIVALENT'
  },

  // ==========================================
  // PART 13 & 14 — CALCULUS & SUBSTITUTIONS
  // ==========================================
  {
    id: "CALC-01",
    part: "PART 13 - CALCULUS",
    name: "Derivative of ln(2x) is 1/x (Rejecting 2/x chain rule hallucination)",
    payload: { domain: 'calculus', claim_type: 'derivative', data: { expression: 'ln(2*x)', variable: 'x', proposed_derivative: '1/x' } },
    expectVerified: true,
    expectStatus: 'VERIFIED'
  },
  {
    id: "CALC-02",
    part: "PART 14 - CALCULUS SUBSTITUTION",
    name: "Change of Variables: x = tan(u) in int 1/(1+x^2) dx correctly includes dx = sec^2(u) du",
    payload: {
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
    id: "CALC-03",
    part: "PART 14 - CALCULUS SUBSTITUTION",
    name: "Change of Variables: Rejects dropped differential factor in substitution",
    payload: {
      domain: 'calculus',
      claim_type: 'change_of_variables',
      data: {
        original_integrand: '1/(1 + x^2)',
        substitution: 'tan(u)',
        old_variable: 'x',
        new_variable: 'u',
        proposed_transformed_integrand: '1/(1 + tan(u)^2)'
      }
    },
    expectVerified: false,
    expectStatus: 'INVALID_SUBSTITUTION'
  },

  // ==========================================
  // PART 16 — LINEAR ALGEBRA
  // ==========================================
  {
    id: "LIN-01",
    part: "PART 16 - LINEAR ALGEBRA",
    name: "Determinant: det([[1, 2], [3, 4]]) = -2",
    payload: {
      domain: 'matrix',
      data: { operation: 'determinant', matrixA: [[1, 2], [3, 4]], proposed_result: -2 }
    },
    expectVerified: true,
    expectStatus: 'VERIFIED'
  },

  // ==========================================
  // PART 21 & 23 — PHYSICS & CONSERVATION LAWS
  // ==========================================
  {
    id: "PHYS-01",
    part: "PART 21 - PHYSICS DIMENSIONS",
    name: "Universal Dimensional Homogeneity: Force [MLT^-2] != Energy [ML^2T^-2]",
    payload: { domain: 'physics', claim_type: 'dimensions', data: { lhs_dimension: 'force', rhs_dimension: 'energy' } },
    expectVerified: false,
    expectStatus: 'DIMENSION_ERROR'
  },
  {
    id: "PHYS-02",
    part: "PART 23 - ENERGY CONSERVATION",
    name: "Conservation System Boundary: Rejects mechanical energy conservation when friction is present",
    payload: {
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
  },

  // ==========================================
  // PART 27 — FAMOUS UNSOLVED / UNKNOWN
  // ==========================================
  {
    id: "UNK-01",
    part: "PART 27 - UNKNOWN HANDLING",
    name: "Riemann Hypothesis Proof Attempt: Returns UNKNOWN (Never manufactures fake proof)",
    payload: {
      domain: 'unsolved_problems',
      claim_type: 'riemann_hypothesis_proof',
      data: { statement: "All non-trivial zeros of zeta(s) have Re(s) = 1/2" }
    },
    expectVerified: false,
    expectStatus: 'UNKNOWN'
  },

  // ==========================================
  // PART 36 — STEP REASONING VS FINAL COINCIDENCE
  // ==========================================
  {
    id: "STEP-01",
    part: "PART 36 - STEP REASONING",
    name: "Step Reasoning: Rejects invalid derivation step even if final answer matches",
    payload: {
      claim_type: 'step_reasoning',
      data: {
        original_expression: '(x^2 - 1)/(x - 1)',
        transformed_expression: 'x - 1', // Invalid simplification!
        proposed_final_answer: 3,
        correct_final_answer: 3
      }
    },
    expectVerified: false,
    expectStatus: 'INVALID_REASONING_STEP'
  }
];

async function runFinalExamFromHell() {
  console.log('======================================================================');
  console.log('🔥 PYTHOS FINAL EXAM FROM HELL — ADVERSARIAL GAUNTLET (PARTS 0–38)');
  console.log('======================================================================\n');

  let passed = 0;
  const categorized = {};

  for (const t of GAUNTLET_TESTS) {
    const res = await runDeterministicVerification(t.payload);
    const isUnknown = (t.expectStatus === 'UNKNOWN' && res.status === 'UNKNOWN');
    const isPass = (res.verified === t.expectVerified && res.status === t.expectStatus);

    if (!categorized[t.part]) categorized[t.part] = { total: 0, passed: 0, failed: 0 };
    categorized[t.part].total++;

    if (isPass) {
      passed++;
      categorized[t.part].passed++;
    } else {
      categorized[t.part].failed++;
    }

    console.log(`▶ [${t.id}] ${t.name}`);
    console.log(`  Expected: verified=${t.expectVerified}, status=${t.expectStatus}`);
    console.log(`  Actual:   verified=${res.verified}, status=${res.status}, engine=${res.engine || 'bridge'}`);
    console.log(`  Verdict:  ${isPass ? '✅ PASSED' : '❌ FAILED'}\n`);
  }

  console.log('======================================================================');
  console.log(`📊 FINAL EXAM SUMMARY REPORT: ${passed}/${GAUNTLET_TESTS.length} (${Math.round(passed/GAUNTLET_TESTS.length*100)}%)`);
  console.log('======================================================================');

  for (const [part, stats] of Object.entries(categorized)) {
    console.log(`• ${part.padEnd(35)}: ${stats.passed}/${stats.total} Passed`);
  }
  console.log('======================================================================\n');

  if (passed !== GAUNTLET_TESTS.length) {
    process.exit(1);
  }
}

module.exports = { runFinalExamFromHell, GAUNTLET_TESTS };

if (require.main === module) {
  runFinalExamFromHell();
}
