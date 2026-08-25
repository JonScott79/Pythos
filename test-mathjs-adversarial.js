/*
    test-mathjs-adversarial.js

    15-Test Adversarial Verification Suite for the Local Math.js First-Line Engine:
    1. Correct arithmetic
    2. Incorrect arithmetic
    3. Exact fraction
    4. Approximate decimal
    5. Symbolic equivalence
    6. Non-equivalent expressions
    7. Correct equation solution
    8. Wrong equation solution
    9. Multiple solutions
    10. Domain violation
    11. Unit mismatch
    12. Matrix calculation
    13. Unsupported symbolic claim -> UNKNOWN
    14. Floating-point edge case
    15. Correct final answer with incorrect intermediate reasoning
*/

const MathJSVerifier = require('./server/mathjsVerifier');

const tests = [
  // 1. Correct arithmetic
  {
    id: 1,
    name: 'Correct arithmetic (2 + 2 = 4)',
    payload: {
      domain: 'arithmetic',
      data: { expression: '2 + 2', proposed_value: 4 }
    },
    expectVerified: true,
    expectStatus: 'VERIFIED'
  },

  // 2. Incorrect arithmetic
  {
    id: 2,
    name: 'Incorrect arithmetic (2 + 2 = 5)',
    payload: {
      domain: 'arithmetic',
      data: { expression: '2 + 2', proposed_value: 5 }
    },
    expectVerified: false,
    expectStatus: 'INCORRECT_RESULT'
  },

  // 3. Exact fraction
  {
    id: 3,
    name: 'Exact fraction (1/3 + 1/6 = 1/2)',
    payload: {
      domain: 'arithmetic',
      data: { expression: '1/3 + 1/6', proposed_value: '1/2' }
    },
    expectVerified: true,
    expectStatus: 'VERIFIED'
  },

  // 4. Approximate decimal
  {
    id: 4,
    name: 'Approximate decimal (sqrt(15) ≈ 3.873 within tolerance 0.001)',
    payload: {
      domain: 'arithmetic',
      data: {
        operation: 'sqrt',
        radicand: 15,
        proposed_value: 3.873,
        is_approximate: true,
        tolerance: 0.001
      }
    },
    expectVerified: true,
    expectStatus: 'VERIFIED'
  },

  // 5. Symbolic equivalence
  {
    id: 5,
    name: 'Symbolic equivalence (x + x ≡ 2x)',
    payload: {
      claim_type: 'symbolic_equivalence',
      data: { expr1: 'x + x', expr2: '2*x' }
    },
    expectVerified: true,
    expectStatus: 'VERIFIED'
  },

  // 6. Non-equivalent expressions
  {
    id: 6,
    name: 'Non-equivalent expressions (x^2 + 1 vs (x + 1)^2)',
    payload: {
      claim_type: 'symbolic_equivalence',
      data: { expr1: 'x^2 + 1', expr2: '(x + 1)^2' }
    },
    expectVerified: false,
    expectStatus: 'NON_EQUIVALENT'
  },

  // 7. Correct equation solution
  {
    id: 7,
    name: 'Correct equation solution (x + 2 = 5, proposed x = 3)',
    payload: {
      domain: 'algebra',
      data: { equation: 'x + 2 = 5', variable: 'x', proposed_solution: 3 }
    },
    expectVerified: true,
    expectStatus: 'VERIFIED'
  },

  // 8. Wrong equation solution
  {
    id: 8,
    name: 'Wrong equation solution (x + 2 = 5, proposed x = 4)',
    payload: {
      domain: 'algebra',
      data: { equation: 'x + 2 = 5', variable: 'x', proposed_solution: 4 }
    },
    expectVerified: false,
    expectStatus: 'EXTRANEOUS_ROOT'
  },

  // 9. Multiple solutions
  {
    id: 9,
    name: 'Multiple solutions (x^2 - 9 = 0, proposed solutions [-3, 3])',
    payload: {
      domain: 'algebra',
      data: { equation: 'x^2 - 9 = 0', variable: 'x', proposed_solutions: [-3, 3] }
    },
    expectVerified: true,
    expectStatus: 'VERIFIED'
  },

  // 10. Domain violation
  {
    id: 10,
    name: 'Domain violation (sqrt(-1) over real numbers)',
    payload: {
      domain: 'arithmetic',
      data: { operation: 'sqrt', radicand: -1, proposed_value: 1, domain: 'real' }
    },
    expectVerified: false,
    expectStatus: 'DOMAIN_ERROR'
  },

  // 11. Unit mismatch
  {
    id: 11,
    name: 'Unit mismatch (Cannot convert 5 meters to seconds)',
    payload: {
      domain: 'units',
      data: { value_with_units: '5 m', target_units: 's' }
    },
    expectVerified: false,
    expectStatus: 'UNIT_MISMATCH'
  },

  // 12. Matrix calculation
  {
    id: 12,
    name: 'Matrix calculation (det([[1, 2], [3, 4]]) = -2)',
    payload: {
      domain: 'matrix',
      data: {
        operation: 'determinant',
        matrixA: [[1, 2], [3, 4]],
        proposed_result: -2
      }
    },
    expectVerified: true,
    expectStatus: 'VERIFIED'
  },

  // 13. Unsupported symbolic claim -> UNKNOWN
  {
    id: 13,
    name: 'Unsupported symbolic claim -> UNKNOWN (e.g. Bessel function ODE or multivariable PDE)',
    payload: {
      domain: 'differential_equations',
      claim_type: 'bessel_ode',
      data: { equation: "x^2*y'' + x*y' + (x^2 - n^2)*y = 0" }
    },
    expectVerified: false,
    expectStatus: 'UNKNOWN'
  },

  // 14. Floating-point edge case
  {
    id: 14,
    name: 'Floating-point edge case (0.1 + 0.2 vs 0.3 exact vs approx)',
    payload: {
      domain: 'arithmetic',
      data: {
        expression: '0.1 + 0.2',
        proposed_value: 0.3,
        is_approximate: true,
        tolerance: 1e-9
      }
    },
    expectVerified: true,
    expectStatus: 'VERIFIED'
  },

  // 15. Correct final answer with incorrect intermediate reasoning
  {
    id: 15,
    name: 'Correct final answer with incorrect intermediate reasoning (Flawed cancellation)',
    payload: {
      claim_type: 'step_reasoning',
      data: {
        original_expression: '(x^2 - 1)/(x - 1)',
        transformed_expression: 'x - 1', // Flawed! Should be x + 1
        claimed_transformation_rule: 'cancellation',
        proposed_final_answer: 3, // Student plug in x=2 -> 2-1 = 1? But claims 3 by luck
        correct_final_answer: 3   // Correct answer for x=2 is 2+1=3
      }
    },
    expectVerified: false,
    expectStatus: 'INVALID_REASONING_STEP'
  }
];

function runMathJSAdversarialSuite() {
  console.log('==================================================');
  console.log('⚡ MATH.JS ADVERSARIAL VERIFICATION SUITE (15 TESTS)');
  console.log('==================================================\n');

  let passed = 0;

  for (const t of tests) {
    const res = MathJSVerifier.verify(t.payload);
    const pass = res.verified === t.expectVerified && res.status === t.expectStatus;

    console.log(`▶ [TEST ${t.id}] ${t.name}`);
    console.log(`  Result:`, { verified: res.verified, status: res.status, error_type: res.error_type, reason: res.reason, details: res.details });
    console.log(`  Status: ${pass ? '✅ PASSED' : '❌ FAILED'}\n`);

    if (pass) passed++;
  }

  console.log('==================================================');
  console.log(`📊 MATH.JS ADVERSARIAL SUMMARY: ${passed}/${tests.length} (${Math.round(passed/tests.length*100)}%)`);
  console.log('==================================================\n');

  if (passed !== tests.length) {
    process.exit(1);
  }
}

runMathJSAdversarialSuite();
