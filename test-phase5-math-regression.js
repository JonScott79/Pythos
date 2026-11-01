/**
 * PHASE 5.2: Comprehensive Mathematical & Physics Regression Suite
 *
 * Tests all 14 mandatory verification & tool categories:
 *  1. Arithmetic & Order of Operations
 *  2. Fractions, Decimals & Percentages
 *  3. Linear Equations & Inequalities
 *  4. Systems of Equations
 *  5. Quadratics & Polynomials
 *  6. Exponents, Radicals & Logarithms
 *  7. Trigonometry & Right-Triangle Geometry
 *  8. Functions & Transformations
 *  9. Limits, Derivatives & Integrals
 * 10. Vectors & Matrices
 * 11. Classical Mechanics & Kinematics
 * 12. Unit Conversions & Dimensional Consistency
 * 13. Check Work Step Verification
 * 14. Grapher Expression Parsing
 * Plus malformed, ambiguous, and unsupported input fail-closed behavior.
 */
const verificationBridge = require('./server/verificationBridge');
const mathjsVerifier = require('./server/mathjsVerifier');

let passed = 0;
let failed = 0;

function assert(condition, description) {
  if (condition) {
    console.log(`  ✅ PASS: ${description}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${description}`);
    failed++;
  }
}

async function runSuite() {
  console.log('=== PHASE 5.2: MATHEMATICAL & PHYSICS REGRESSION SUITE ===\n');

  // 1. Arithmetic & Order of Operations
  console.log('--- 1. Arithmetic & Order of Operations ---');
  const arithRes = await verificationBridge.verifyResponseClaims(
    'Applying order of operations: $3 + 4 \\times 5 - 2 = 21$. Thus $\\boxed{21}$.',
    'Evaluate 3 + 4 * 5 - 2'
  );
  assert(arithRes.invalidClaims.length === 0 && arithRes.verificationResults.some(r => r.verified), 'Valid order of operations (3 + 4*5 - 2 = 21) verified');

  const arithBad = await verificationBridge.verifyResponseClaims(
    'Adding first gives $3 + 4 \\times 5 = 35$.',
    'Evaluate 3 + 4 * 5'
  );
  assert(arithBad.invalidClaims.length > 0, 'Order-of-operations error (3 + 4*5 = 35) deterministically caught');

  // 2. Fractions, Decimals & Percentages
  console.log('\n--- 2. Fractions, Decimals & Percentages ---');
  const fracRes = await verificationBridge.verifyResponseClaims(
    'Finding a common denominator: $\\frac{3}{4} + \\frac{2}{5} = \\frac{23}{20} = 1.15$. Final answer: $\\boxed{\\frac{23}{20}}$.',
    'Calculate 3/4 + 2/5'
  );
  assert(fracRes.invalidClaims.length === 0, 'Fraction addition (3/4 + 2/5 = 23/20) verified');

  // 3. Linear Equations & Inequalities
  console.log('\n--- 3. Linear Equations & Inequalities ---');
  const linRes = await verificationBridge.verifyResponseClaims(
    'Subtract 7 from both sides of $2x + 7 = 19$ to get $2x = 12$, so $x = 6$. Thus $\\boxed{x = 6}$.',
    'Solve 2x + 7 = 19'
  );
  assert(linRes.invalidClaims.length === 0 && linRes.claims.some(c => c.claim_type === 'equation_solution'), 'Linear equation solution (2x + 7 = 19 -> x = 6) verified');

  const linBad = await verificationBridge.verifyResponseClaims(
    'For $2x + 7 = 19$, we find $x = 8$. Thus $\\boxed{x = 8}$.',
    'Solve 2x + 7 = 19'
  );
  assert(linBad.invalidClaims.length > 0, 'Incorrect linear root (2x + 7 = 19 -> x = 8) deterministically rejected');

  // 4. Systems of Equations
  console.log('\n--- 4. Systems of Equations ---');
  const sysClaim = {
    domain: 'algebra',
    claim_type: 'system_solution',
    data: {
      equations: ['x + y = 10', 'x - y = 4'],
      solution: { x: 7, y: 3 }
    }
  };
  const sysVer = mathjsVerifier.verify(sysClaim);
  assert(sysVer.verified === true, 'System of linear equations (x+y=10, x-y=4 -> x=7, y=3) verified');

  // 5. Quadratics & Polynomials
  console.log('\n--- 5. Quadratics & Polynomials ---');
  const quadRes = await verificationBridge.verifyResponseClaims(
    'Factoring $x^2 - 5x + 6 = 0$ gives $(x - 2)(x - 3) = 0$, so $x = 2$ and $x = 3$. $\\boxed{x = 2, 3}$.',
    'Solve x^2 - 5x + 6 = 0'
  );
  assert(quadRes.invalidClaims.length === 0, 'Quadratic roots (x^2 - 5x + 6 = 0 -> x = 2, 3) verified');

  // 6. Exponents, Radicals & Logarithms
  console.log('\n--- 6. Exponents, Radicals & Logarithms ---');
  const logClaim = {
    domain: 'arithmetic',
    claim_type: 'arithmetic',
    data: { expression: 'log(100, 10) + sqrt(49) + 2^3', proposed_value: 17 }
  };
  const logVer = mathjsVerifier.verify(logClaim);
  assert(logVer.verified === true, 'Logarithm, radical, and exponent evaluation (log10(100) + sqrt(49) + 2^3 = 17) verified');

  // 7. Trigonometry & Right-Triangle Geometry
  console.log('\n--- 7. Trigonometry & Right-Triangle Geometry ---');
  const trigEquivClaim = {
    domain: 'algebra',
    claim_type: 'symbolic_equivalence',
    data: { expr1: 'sin(x)^2 + cos(x)^2', expr2: '1' }
  };
  const trigVer = await verificationBridge.runDeterministicVerification(trigEquivClaim);
  assert(trigVer.verified === true, 'Pythagorean trigonometric identity (sin^2(x) + cos^2(x) = 1) verified');

  // 8. Functions & Transformations
  console.log('\n--- 8. Functions & Transformations ---');
  const fnRes = await verificationBridge.verifyResponseClaims(
    'Given $f(x) = 3x^2 - 2x + 1$, evaluating at $x = 4$ gives $f(4) = 41$. Thus $\\boxed{41}$.',
    'If f(x) = 3x^2 - 2x + 1, find f(4)'
  );
  assert(fnRes.invalidClaims.length === 0, 'Function evaluation f(4) = 41 for f(x) = 3x^2 - 2x + 1 verified');

  // 9. Limits, Derivatives & Integrals (Batch SymPy Test)
  console.log('\n--- 9. Limits, Derivatives & Integrals (Batch SymPy Execution) ---');
  const batchStart = Date.now();
  const calcBatch = await verificationBridge.runPythonVerifierBatch([
    {
      domain: 'calculus',
      claim_type: 'derivative',
      data: { expression: 'x**3 + 4*x**2 - 7*x', variable: 'x', proposed_derivative: '3*x**2 + 8*x - 7' }
    },
    {
      domain: 'calculus',
      claim_type: 'antiderivative',
      data: { integrand: '3*x**2 + 2*x', variable: 'x', proposed_antiderivative: 'x**3 + x**2' }
    },
    {
      domain: 'calculus',
      claim_type: 'derivative',
      data: { expression: 'sin(x)*exp(x)', variable: 'x', proposed_derivative: 'exp(x)*(sin(x) + cos(x))' }
    }
  ]);
  const batchElapsedMs = Date.now() - batchStart;
  assert(
    Array.isArray(calcBatch) && calcBatch.length === 3 && calcBatch.every(r => r && r.verified === true),
    `Batch SymPy verification validated 3 calculus claims in a single Python process (${batchElapsedMs}ms total)`
  );

  // 10. Vectors & Matrices
  console.log('\n--- 10. Vectors & Matrices ---');
  const matDet = mathjsVerifier.verify({
    domain: 'arithmetic',
    claim_type: 'arithmetic',
    data: { expression: 'det([[1, 2], [3, 4]])', proposed_value: -2 }
  });
  assert(matDet.verified === true, '2x2 Matrix determinant det([[1,2],[3,4]]) = -2 verified');

  // 11. Classical Mechanics & Kinematics
  console.log('\n--- 11. Classical Mechanics & Kinematics ---');
  const kinClaim = {
    domain: 'physics',
    claim_type: 'free_fall',
    data: { height: 44.1, g: 9.8, proposed_time: 3.0 }
  };
  const kinVer = await verificationBridge.runDeterministicVerification(kinClaim);
  assert(kinVer.verified === true, 'Classical kinematics free-fall (h=44.1 m, g=9.8 -> t=3.0 s) verified');

  // 12. Unit Conversions & Dimensional Consistency
  console.log('\n--- 12. Unit Conversions & Dimensional Consistency ---');
  const dimClaim = {
    domain: 'physics',
    claim_type: 'dimensions',
    data: { lhs_dimension: 'force', rhs_dimension: 'tension' }
  };
  const dimVer = await verificationBridge.runDeterministicVerification(dimClaim);
  assert(dimVer.verified === true, 'Dimensional analysis consistency ([force] == [tension] = M*L/T^2) verified');

  // 13. Check Work Step Verification
  console.log('\n--- 13. Check Work Step Verification ---');
  const stepCheckValid = mathjsVerifier.verify({
    domain: 'algebra',
    claim_type: 'equation_solution',
    data: { equation: '4*x - 5 = 15', variable: 'x', proposed_solution: 5 }
  });
  const stepCheckInvalid = mathjsVerifier.verify({
    domain: 'algebra',
    claim_type: 'equation_solution',
    data: { equation: '4*x - 5 = 15', variable: 'x', proposed_solution: 3 }
  });
  assert(stepCheckValid.verified === true && stepCheckInvalid.verified === false, 'Check My Work step verifier accepts valid step (x=5) and rejects invalid step (x=3)');

  // 14. Grapher Expression Parsing
  console.log('\n--- 14. Grapher Expression Parsing ---');
  const graphEval = mathjsVerifier.verify({
    domain: 'algebra',
    claim_type: 'function_evaluation',
    data: { expression: 'x^3 - 3*x', variable: 'x', input: 2, proposed_value: 2 }
  });
  assert(graphEval.verified === true, 'Grapher function expression parser evaluates f(x) = x^3 - 3x accurately');

  // 15. Malformed, Ambiguous, and Unsupported Input Fail-Closed Behavior
  console.log('\n--- 15. Malformed, Ambiguous & Division-by-Zero Fail-Closed Guard ---');
  const divZeroGate = verificationBridge.evaluateCandidateDelivery({
    candidateAnswer: 'Infinity',
    verifications: [],
    contradictions: [],
    claims: [],
    prompt: 'What is 15 / 0?'
  });
  assert(
    divZeroGate.withheld === true && divZeroGate.delivered === false && divZeroGate.status === 'UNDEFINED_OPERATION',
    'Division-by-zero prompt fails closed with UNDEFINED_OPERATION and withholds delivery'
  );

  const nullCandidateGate = verificationBridge.evaluateCandidateDelivery({
    candidateAnswer: null,
    verifications: [],
    contradictions: [],
    claims: [],
    prompt: 'Solve x + 2 = 5'
  });
  assert(
    nullCandidateGate.withheld === true && nullCandidateGate.delivered === false,
    'Missing/unextractable candidate answer fails closed and never delivers'
  );

  console.log(`\n=== PHASE 5.2 SUMMARY: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}

runSuite().catch(err => {
  console.error(err);
  process.exit(1);
});
