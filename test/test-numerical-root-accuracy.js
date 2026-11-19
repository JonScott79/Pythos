/**
 * test/test-numerical-root-accuracy.js
 *
 * PYTHOS PRODUCTION INVESTIGATION: Numerical Root Accuracy & Verification Regression Corpus
 */

const assert = require('assert');
const { spawnSync } = require('child_process');
const path = require('path');
const rootSolver = require('../server/engines/rootSolver');
const specialistAssist = require('../server/specialistAssist');
const verificationBridge = require('../server/verificationBridge');

function runPyAlgebraVerify(claim) {
  const pythonBin = process.env.PYTHON_BIN || (
    process.platform === 'win32'
      ? 'C:\\Users\\jonny\\AppData\\Local\\Python\\pythoncore-3.14-64\\python.exe'
      : 'python3'
  );
  const script = `
import json, sys
sys.path.insert(0, 'server/verifier')
from algebra_verifier import verify_algebra
claim = json.loads(sys.stdin.read())
print(json.dumps(verify_algebra(claim)))
`;
  const res = spawnSync(pythonBin, ['-c', script], {
    cwd: path.resolve(__dirname, '..'),
    input: JSON.stringify(claim),
    encoding: 'utf8'
  });
  if (res.status !== 0) {
    throw new Error(`Python exited ${res.status}: ${res.stderr}`);
  }
  return JSON.parse(res.stdout.trim());
}

async function runTests() {
  console.log('======================================================================');
  console.log('PYTHOS NUMERICAL ROOT ACCURACY & VERIFICATION REGRESSION CORPUS');
  console.log('======================================================================\n');

  let passed = 0;
  let total = 0;

  async function test(name, fn) {
    total++;
    try {
      await fn();
      console.log(`  ✓ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ [FAIL] ${name}`);
      console.error(`    ${err.stack || err.message}`);
      process.exitCode = 1;
    }
  }

  // 1. Original failing problem end-to-end
  await test('Original Problem: specialistAssist injects exact roots for 2*sin^2(x) + csc(x) - 9 = 0', async () => {
    const res = await specialistAssist.evaluateSpecialistAssist('Solve 2\\sin^2 x + \\csc x - 9 = 0');
    assert.strictEqual(res.matched, true);
    assert.strictEqual(res.task.operation, 'ROOT_SOLVING');
    assert.strictEqual(res.result.status, 'VERIFIED');
    assert.strictEqual(res.result.operation, 'TRIG_POLYNOMIAL_ROOTS');
    assert.deepStrictEqual(res.result.admissible_t_roots, [0.11141848]);
    assert(res.contextString.includes('0.11165030 + 2*k*pi'));
    assert(res.contextString.includes('3.02994235 + 2*k*pi'));
  });

  await test('Original Problem: verificationBridge rejects v1.8.65 inaccurate roots (0.1129, -2.018, 1.905, 0.1132)', async () => {
    const q = 'Solve 2\\sin^2 x + \\csc x - 9 = 0';
    const bad = 'Using t = \\sin x, we get \\boxed{2t^3 - 9t + 1 = 0}. The roots are t_1 = 0.1129, t_2 = -2.018, t_3 = 1.905. Thus x \\approx 0.1132 + 2k\\pi, 3.0284 + 2k\\pi.';
    const audit = await verificationBridge.verifyResponseClaims(bad, q);
    assert.strictEqual(audit.claims.length, 2);
    assert.strictEqual(audit.invalidClaims.length, 2);
    assert(audit.verificationResults.every(r => r.verified === false && r.status === 'EXTRANEOUS_ROOT'));
  });

  await test('Original Problem: verificationBridge verifies accurate roots (0.11141848, 0.11165030, 3.02994235)', async () => {
    const q = 'Solve 2\\sin^2 x + \\csc x - 9 = 0';
    const good = 'Using t = \\sin x, we get \\boxed{2t^3 - 9t + 1 = 0}. The roots are t_1 = 0.11141848, t_2 = -2.17483393, t_3 = 2.06341545. Thus x \\approx 0.11165030 + 2k\\pi, 3.02994235 + 2k\\pi.';
    const audit = await verificationBridge.verifyResponseClaims(good, q);
    assert.strictEqual(audit.claims.length, 2);
    assert.strictEqual(audit.invalidClaims.length, 0);
    assert(audit.verificationResults.every(r => r.verified === true && r.status === 'VERIFIED'));
  });

  // 2. Polynomial root corpus
  const polyCases = [
    { name: 'Linear: 2*x - 6 = 0', eq: '2*x - 6 = 0', v: 'x', expected: [3] },
    { name: 'Quadratic: x^2 - 5*x + 6 = 0', eq: 'x^2 - 5*x + 6 = 0', v: 'x', expected: [2, 3] },
    { name: 'Casus irreducibilis cubic: 2*t^3 - 9*t + 1 = 0', eq: '2*t^3 - 9*t + 1 = 0', v: 't', expected: [-2.17483393, 0.11141848, 2.06341545] },
    { name: '1-root cubic: x^3 - 2*x - 5 = 0', eq: 'x^3 - 2*x - 5 = 0', v: 'x', expected: [2.09455148] },
    { name: 'Repeated root: (x - 3)^2 * (x + 1) = 0', eq: '(x - 3)^2 * (x + 1) = 0', v: 'x', expected: [-1, 3] },
    { name: 'Irrational roots: x^2 - 2 = 0', eq: 'x^2 - 2 = 0', v: 'x', expected: [-1.41421356, 1.41421356] },
    { name: 'Near-zero roots: x^3 - 0.001*x = 0', eq: 'x^3 - 0.001*x = 0', v: 'x', expected: [-0.03162278, 0, 0.03162278] },
    { name: 'Widely differing magnitudes: x^2 - 10000.0001*x + 1 = 0', eq: 'x^2 - 10000.0001*x + 1 = 0', v: 'x', expected: [0.0001, 10000] },
    { name: 'Poorly conditioned: 0.000001*(x - 1) = 0', eq: '0.000001*(x - 1) = 0', v: 'x', expected: [1] }
  ];

  for (const tc of polyCases) {
    await test(`Polynomial Solver: ${tc.name}`, async () => {
      const res = await rootSolver.solveEquationRoots(tc.eq, { variable: tc.v });
      assert.strictEqual(res.status, 'VERIFIED');
      assert.strictEqual(res.roots.length, tc.expected.length);
      for (let i = 0; i < tc.expected.length; i++) {
        assert(Math.abs(res.roots[i] - tc.expected[i]) < 1e-6, `Expected ${tc.expected[i]}, got ${res.roots[i]}`);
      }
    });
  }

  // 3. Trig-polynomial corpus
  await test('Trig-Poly Solver: cos + sec (2*cos(x)^2 + sec(x) - 5 = 0)', async () => {
    const res = await rootSolver.solveEquationRoots('2*cos(x)^2 + sec(x) - 5 = 0', { variable: 'x' });
    assert.strictEqual(res.status, 'VERIFIED');
    assert.strictEqual(res.operation, 'TRIG_POLYNOMIAL_ROOTS');
    assert(res.admissible_t_roots.length === 1);
    assert(Math.abs(res.admissible_t_roots[0] - 0.20336421) < 1e-6);
    assert.strictEqual(res.general_solutions.length, 2);
  });

  await test('Trig-Poly Solver: tan + cot (tan(x)^2 - 3*cot(x) + 1 = 0)', async () => {
    const res = await rootSolver.solveEquationRoots('tan(x)^2 - 3*cot(x) + 1 = 0', { variable: 'x' });
    assert.strictEqual(res.status, 'VERIFIED');
    assert.strictEqual(res.operation, 'TRIG_POLYNOMIAL_ROOTS');
    assert(res.admissible_t_roots.length >= 1);
    assert(res.general_solutions.every(g => g.trig_residual < 1e-7));
  });

  await test('Trig-Poly Solver: no real solution (sin(x)^2 + 2 = 0)', async () => {
    const res = await rootSolver.solveEquationRoots('sin(x)^2 + 2 = 0', { variable: 'x' });
    assert.strictEqual(res.status, 'VERIFIED');
    assert.strictEqual(res.admissible_t_roots.length, 0);
    assert.strictEqual(res.exactResult, 'NO_REAL_SOLUTION');
  });

  await test('Trig-Poly Solver: boundary root (sin(x) - 1 = 0)', async () => {
    const res = await rootSolver.solveEquationRoots('sin(x) - 1 = 0', { variable: 'x' });
    assert.strictEqual(res.status, 'VERIFIED');
    assert.deepStrictEqual(res.admissible_t_roots, [1]);
    assert(res.general_solutions.some(g => Math.abs(g.principal_rad - Math.PI / 2) < 1e-6));
  });

  // 4. Numerical verification corpus (scale-aware, stated-precision, domain, lost-root)
  await test('Verifier: accepts accurately rounded 4-decimal roots (0.1114, -2.1748, 2.0634)', () => {
    const v = runPyAlgebraVerify({
      equation: '2*t^3 - 9*t + 1 = 0',
      variable: 't',
      proposed_solutions: ['0.1114', '-2.1748', '2.0634']
    });
    assert.strictEqual(v.status, 'VERIFIED');
  });

  await test('Verifier: rejects inaccurately rounded root (0.1129 vs 0.11141848)', () => {
    const v = runPyAlgebraVerify({
      equation: '2*t^3 - 9*t + 1 = 0',
      variable: 't',
      proposed_solutions: ['0.1129', '-2.1748', '2.0634']
    });
    assert.strictEqual(v.status, 'EXTRANEOUS_ROOT');
  });

  await test('Verifier: rejects rounding-concealed wrong root on poorly conditioned 0.000001*(x - 1) = 0', () => {
    const v = runPyAlgebraVerify({
      equation: '0.000001*(x - 1) = 0',
      variable: 'x',
      proposed_solutions: ['50']
    });
    assert.strictEqual(v.status, 'EXTRANEOUS_ROOT');
  });

  await test('Verifier: rejects NaN and Infinity', () => {
    const v1 = runPyAlgebraVerify({ equation: 'x - 1 = 0', variable: 'x', proposed_solutions: ['nan'] });
    const v2 = runPyAlgebraVerify({ equation: 'x - 1 = 0', variable: 'x', proposed_solutions: ['inf'] });
    assert.strictEqual(v1.status, 'EXTRANEOUS_ROOT');
    assert.strictEqual(v2.status, 'EXTRANEOUS_ROOT');
  });

  await test('Verifier: rejects real value on complex-only equation (x^2 + 1 = 0)', () => {
    const v = runPyAlgebraVerify({ equation: 'x^2 + 1 = 0', variable: 'x', proposed_solutions: ['1'] });
    assert.strictEqual(v.status, 'EXTRANEOUS_ROOT');
  });

  await test('Verifier: rejects domain violation (x = 0 on 2*sin(x)^2 + csc(x) - 9 = 0)', () => {
    const v = runPyAlgebraVerify({
      equation: '2*sin(x)^2 + csc(x) - 9 = 0',
      variable: 'x',
      proposed_solutions: ['0']
    });
    assert.strictEqual(v.status, 'EXTRANEOUS_ROOT');
  });

  await test('Verifier: detects lost root (x^2 - 5*x + 6 = 0, proposing only 2)', () => {
    const v = runPyAlgebraVerify({
      equation: 'x^2 - 5*x + 6 = 0',
      variable: 'x',
      proposed_solutions: ['2']
    });
    assert.strictEqual(v.status, 'LOST_ROOT');
  });

  console.log(`\n======================================================================`);
  console.log(`RESULTS: ${passed}/${total} PASSED`);
  console.log('======================================================================');
}

runTests().then(() => process.exit(process.exitCode || 0));
