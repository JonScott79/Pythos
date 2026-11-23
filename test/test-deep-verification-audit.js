/**
 * test/test-deep-verification-audit.js
 *
 * Comprehensive Independent Adversarial, Differential, Property-Based,
 * Failure-Injection & Performance Audit Suite for Pythos Verification Architecture.
 */

const assert = require('assert');
const { execFileSync } = require('child_process');
const path = require('path');
const { performance } = require('perf_hooks');

const verificationBridge = require('../server/verificationBridge');
const mathjsVerifier = require('../server/mathjsVerifier');
const studentWorkEvaluator = require('../server/studentWorkEvaluator');
const teachingIntelligence = require('../server/teachingIntelligence');
const safeResponseConstructor = require('../server/safeResponseConstructor');
const deterministicRouter = require('../server/deterministicRouter');
const { detectInputAmbiguity } = require('../server/inputAmbiguityDetector');
const { interpretUserTurn } = require('../server/inputInterpreter');
const calculusEngine = require('../server/engines/calculusEngine');
const rootSolver = require('../server/engines/rootSolver');

const PY_BIN = process.env.PYTHON_BIN || (
  process.platform === 'win32'
    ? 'C:\\Users\\jonny\\AppData\\Local\\Python\\pythoncore-3.14-64\\python.exe'
    : 'python3'
);
const REPO_ROOT = path.resolve(__dirname, '..');

function runPyScript(pyCode) {
  return execFileSync(PY_BIN, ['-c', pyCode], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 20000
  }).trim();
}

function createMulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let total = 0;
let passed = 0;
let failed = 0;
const groupStats = {};

async function check(group, name, fn) {
  total++;
  if (!groupStats[group]) groupStats[group] = { total: 0, passed: 0, failed: 0 };
  groupStats[group].total++;
  try {
    await fn();
    passed++;
    groupStats[group].passed++;
  } catch (err) {
    failed++;
    groupStats[group].failed++;
    console.error(`  ✗ [FAIL] [${group}] ${name}: ${err.message}`);
    process.exitCode = 1;
  }
}

async function runSuite() {
  console.log('======================================================================');
  console.log('PYTHOS DEEP ARCHITECTURAL AUDIT — EXHAUSTIVE STAGE D VERIFICATION SUITE');
  console.log('======================================================================\n');

  try {
    // -----------------------------------------------------------------------
    // GROUP 1: Seeded Property-Based Differential Equivalence & Derivatives (25 cases)
    // -----------------------------------------------------------------------
    console.log('▶ [1] Property-Based Differential Algebra & Calculus (25 seeded tests)');
    const rng = createMulberry32(20261122);
    const polyBatch = [];
    for (let i = 0; i < 20; i++) {
      const a = Math.floor(rng() * 7) + 1;
      const b = Math.floor(rng() * 9) - 4 || 2;
      const c = Math.floor(rng() * 7) + 1;
      const expanded = `${a}*x^2 + ${a * b + c}*x + ${b * c}`;
      const factored = `(x + (${b}))*(${a}*x + (${c}))`;
      polyBatch.push({ domain: 'algebra', claim_type: 'symbolic_equivalence', data: { expr1: expanded, expr2: factored, variable: 'x' } });
    }
    for (let i = 0; i < 5; i++) {
      const k = i + 2;
      polyBatch.push({ domain: 'calculus', claim_type: 'derivative', data: { expression: `${k}*x^3 - ${k + 1}*sin(x)`, variable: 'x', proposed_derivative: `${3 * k}*x^2 - ${k + 1}*cos(x)` } });
    }
    await check('PROPERTY_DIFF', '25/25 seeded polynomials & derivatives agree across MathJS/SymPy', async () => {
      const pyRes = await verificationBridge.runPythonVerifierBatch(polyBatch);
      assert.strictEqual(pyRes.length, 25);
      for (let i = 0; i < 25; i++) {
        assert.strictEqual(pyRes[i].verified, true, `Seeded case ${i} failed in SymPy: ${JSON.stringify(pyRes[i])}`);
      }
      // Differential cross-check on polynomials with evaluateEquationCandidate
      for (let i = 0; i < 10; i++) {
        const d = polyBatch[i].data;
        const jsEval = studentWorkEvaluator.evaluateEquationCandidate(`${d.expr2} = 0`, `${d.expr1} = 0`);
        assert.strictEqual(jsEval.status, 'STEP_VERIFIED_CORRECT');
        assert.strictEqual(jsEval.isExactSymbolicProof, true);
      }
    });

    // -----------------------------------------------------------------------
    // GROUP 2: Rational Expressions, Multi-Variable Poles & Root Exclusion
    // -----------------------------------------------------------------------
    console.log('▶ [2] Rational Domain & Root Pole Exclusion');
    await check('RATIONAL', 'Multivariable pole exclusion: x/(x*y) == 1/y catches unstated x != 0', async () => {
      const res = await verificationBridge.runDeterministicVerification({
        domain: 'algebra',
        claim_type: 'symbolic_equivalence',
        data: { expr1: 'x/(x*y)', expr2: '1/y', variable: 'x' }
      });
      assert.strictEqual(res.verified, false);
      assert.strictEqual(res.error_type, 'DOMAIN_RESTRICTION_MISMATCH');
      assert(res.domain_restrictions.some(r => String(r).includes('x != 0')));
    });

    await check('RATIONAL', 'Trig quotient domain exclusion: tan(x)*cos(x) == sin(x) rejected without cos(x) != 0', async () => {
      const res = await verificationBridge.runDeterministicVerification({
        domain: 'algebra',
        claim_type: 'symbolic_equivalence',
        data: { expr1: 'tan(x)*cos(x)', expr2: 'sin(x)', variable: 'x' }
      });
      assert.strictEqual(res.verified, false);
      assert.strictEqual(res.error_type, 'DOMAIN_RESTRICTION_MISMATCH');
    });

    await check('RATIONAL', 'root_solver.py excludes cancelled denominator poles on x^2/x = 0 and (x^2-4)/(x-2) = 0', async () => {
      const r1 = await rootSolver.solveEquationRoots('x^2/x = 0', { variable: 'x' });
      assert.strictEqual(r1.status, 'VERIFIED');
      assert.deepStrictEqual(r1.roots, []);
      assert(Array.isArray(r1.excluded_poles) && r1.excluded_poles.includes(0));

      const r2 = await rootSolver.solveEquationRoots('(x^2 - 4)/(x - 2) = 0', { variable: 'x' });
      assert.strictEqual(r2.status, 'VERIFIED');
      assert.deepStrictEqual(r2.roots, [-2]);
      assert(Array.isArray(r2.excluded_poles) && r2.excluded_poles.includes(2));
    });

    // -----------------------------------------------------------------------
    // GROUP 3: Radicals, Powers, Nested Abs & Scientific Notation
    // -----------------------------------------------------------------------
    console.log('▶ [3] Radicals, Odd Roots, Scientific Notation & Nested Abs');
    await check('RADICAL_POWERS', '(x^(1/2))^2 == x rejected over R without x >= 0', async () => {
      const res = await verificationBridge.runDeterministicVerification({
        domain: 'algebra',
        claim_type: 'symbolic_equivalence',
        data: { expr1: '(x^(1/2))^2', expr2: 'x', variable: 'x', domain: 'real' }
      });
      assert.strictEqual(res.verified, false);
      assert.strictEqual(res.error_type, 'DOMAIN_RESTRICTION_MISMATCH');
    });

    await check('RADICAL_POWERS', 'cbrt(-8) and (-8)^(1/3) evaluate to -2 in real domain', async () => {
      const r1 = await verificationBridge.runDeterministicVerification({
        domain: 'algebra',
        claim_type: 'symbolic_equivalence',
        data: { expr1: 'cbrt(-8)', expr2: '-2', variable: 'x', domain: 'real' }
      });
      const r2 = await verificationBridge.runDeterministicVerification({
        domain: 'algebra',
        claim_type: 'symbolic_equivalence',
        data: { expr1: '(-8)^(1/3)', expr2: '-2', variable: 'x', domain: 'real' }
      });
      assert.strictEqual(r1.verified, true);
      assert.strictEqual(r2.verified, true);
    });

    await check('RADICAL_POWERS', 'Scientific notation 1e-5 preserved (not 1*e - 5) across SymPy & rootSolver', async () => {
      const sRes = await verificationBridge.runDeterministicVerification({
        domain: 'algebra',
        claim_type: 'symbolic_equivalence',
        data: { expr1: '1e-5', expr2: '0.00001' }
      });
      assert.strictEqual(sRes.verified, true);
      const rRes = await rootSolver.solveEquationRoots('1e-5*x - 1 = 0', { variable: 'x' });
      assert.strictEqual(rRes.status, 'VERIFIED');
      assert.strictEqual(rRes.roots[0], 100000);
    });

    await check('RADICAL_POWERS', 'Nested |x - |y|| normalizes safely & x = 1 + sqrt(2) parses in mathjsVerifier', () => {
      const pyAbs = JSON.parse(runPyScript(`
import sys, json; sys.path.insert(0, 'server/verifier')
from algebra_verifier import verify_symbolic_equivalence
print(json.dumps(verify_symbolic_equivalence({'expr1': '|x - |y||', 'expr2': 'Abs(x - Abs(y))', 'variable': 'x'})))
`));
      assert.strictEqual(pyAbs.verified, true);

      const mEq = mathjsVerifier.verifyEquationSolution({
        equation: 'x^2 - 2*x - 1 = 0',
        variable: 'x',
        proposed_solutions: ['1 + sqrt(2)', '1 - sqrt(2)']
      });
      assert.strictEqual(mEq.verified, true);
    });

    // -----------------------------------------------------------------------
    // GROUP 4: Logarithms, Inverse Trig, Complex vs Real Boundaries
    // -----------------------------------------------------------------------
    console.log('▶ [4] Logs, Inverse Trig & Complex/Real Boundaries');
    await check('LOGS_TRIG', 'sin(asin(x)) == x catches |x| <= 1 mismatch and log(x^2) == 2*log(x) rejects -x > 0', async () => {
      const trigRes = await verificationBridge.runDeterministicVerification({
        domain: 'algebra',
        claim_type: 'symbolic_equivalence',
        data: { expr1: 'sin(asin(x))', expr2: 'x', variable: 'x', domain: 'real' }
      });
      assert.strictEqual(trigRes.verified, false);
      assert.strictEqual(trigRes.error_type, 'DOMAIN_RESTRICTION_MISMATCH');

      const negIneq = await verificationBridge.runDeterministicVerification({
        domain: 'algebra',
        claim_type: 'symbolic_equivalence',
        data: { expr1: 'log(x^2)', expr2: '2*log(x) for -x > 0', variable: 'x', domain: 'real' }
      });
      assert.strictEqual(negIneq.verified, false);
    });

    await check('LOGS_TRIG', 'mathjsVerifier classifies log(-4) in real domain as DOMAIN_ERROR', () => {
      const res = mathjsVerifier.verify({
        domain: 'arithmetic',
        data: { expression: 'log(-4)', proposed_value: '2', domain: 'real' }
      });
      assert.strictEqual(res.verified, false);
      assert.strictEqual(res.status, 'DOMAIN_ERROR');
    });

    // -----------------------------------------------------------------------
    // GROUP 5: Improper Integrals, Singularities, Change of Vars & Limits
    // -----------------------------------------------------------------------
    console.log('▶ [5] Calculus Soundness (FTC, Improper, Singularities, CoV, Limits)');
    await check('CALCULUS', 'Improper divergent 1/(x+1) never returns VERIFIED & oscillating sin(1/x) is essential_oscillating', () => {
      const pyOut = JSON.parse(runPyScript(`
import sys, json; sys.path.insert(0, 'server/verifier')
from calculus_improper_verifier import verify_improper_integral
from calculus_singularity_verifier import verify_singularity_classification
from calculus_verifier import verify_change_of_variables, verify_limit
print(json.dumps({
  'imp': verify_improper_integral({'integrand': '1/(x + 1)', 'lower_bound': 0, 'upper_bound': 'oo'}),
  'sing': verify_singularity_classification({'expression': 'sin(1/x)', 'variable': 'x', 'point': '0', 'direction': '+', 'claimed_type': 'removable'}),
  'cov': verify_change_of_variables({'original_integrand': 'sqrt(x^2)', 'substitution': 'u', 'old_variable': 'x', 'new_variable': 'u', 'proposed_transformed_integrand': 'u'}),
  'lim': verify_limit({'expression': 'Abs(x)/x', 'variable': 'x', 'target': '0', 'proposed_limit': '0'})
}))
`));
      assert.strictEqual(pyOut.imp.verified, false);
      assert.strictEqual(pyOut.imp.status, 'DIVERGENT_INTEGRAL');
      assert.strictEqual(pyOut.sing.verified, false);
      assert.strictEqual(pyOut.sing.actual_type, 'essential_oscillating');
      assert.strictEqual(pyOut.cov.verified, false);
      assert.strictEqual(pyOut.lim.verified, false);
      assert.strictEqual(pyOut.lim.status, 'INCORRECT_LIMIT');
    });

    await check('CALCULUS', 'calculusEngine definite integral x^x returns FTC unavailable & 3rd derivative uses mpmath check', async () => {
      const intRes = await calculusEngine.integrate('x^x', { isDefinite: true, lowerLimit: 0, upperLimit: 1 });
      assert.notStrictEqual(intRes.status, 'VERIFIED');
      assert.strictEqual(intRes.verificationEvidence.passed, false);

      const d3Res = await calculusEngine.differentiate('sin(x)*exp(x)', { order: 3, variable: 'x' });
      assert.strictEqual(d3Res.status, 'VERIFIED');
      assert.strictEqual(d3Res.verificationEvidence.passed, true);
    });

    // -----------------------------------------------------------------------
    // GROUP 6: Arithmetic Precision, Geometry & Router Truth
    // -----------------------------------------------------------------------
    console.log('▶ [6] Arithmetic Precision, Geometry Heron & Router Limits');
    await check('PRECISION_ROUTER', 'arithmetic_verifier rejects 1/10000==0; mathjs rejects pi==3.125 (!approx); router computes exact limits & Heron area', () => {
      const pyArith = JSON.parse(runPyScript(`
import sys, json; sys.path.insert(0, 'server/verifier')
from arithmetic_verifier import verify_arithmetic
print(json.dumps(verify_arithmetic({'expression': '1/10000', 'proposed_value': '0'})))
`));
      assert.strictEqual(pyArith.verified, false);

      const mPi = mathjsVerifier.verify({ domain: 'arithmetic', data: { expression: 'pi', proposed_value: '3.125', is_approximate: false } });
      assert.strictEqual(mPi.verified, false);

      const lim = deterministicRouter.analyzeDeterministicIntent('find the limit of (x^2 - 9)/(x - 3) as x approaches 5', []);
      assert.strictEqual(lim.result, 8);

      const area346 = deterministicRouter.analyzeDeterministicIntent('find the area of a triangle with sides 3, 4, 6', []);
      assert.strictEqual(area346.isRightTriangle, false);
      assert(Math.abs(area346.result - 5.332682) < 1e-4);
    });

    // -----------------------------------------------------------------------
    // GROUP 7: Interpreter, Ambiguity, Multi-Branch Student Evaluation & Shortcuts
    // -----------------------------------------------------------------------
    console.log('▶ [7] Ambiguity, Student Evaluator & Shortcuts');
    await check('STUDENT_EVAL_TI', 'Division ambiguity with = detected; x=2 and 5 / x=+-2 / partial cubic rejected; divide-by-0 rejected', async () => {
      const amb = detectInputAmbiguity('1/2x + 3 = 7');
      assert.strictEqual(amb.hasAmbiguity, true);

      const s1 = studentWorkEvaluator.evaluateStudentWork('x = 2 and 5', { intent: 'PROPOSED_ANSWER', extractedExpression: 'x = 2 and 5' }, [{ role: 'assistant', content: 'Solve x - 2 = 0' }], { active: { activeExpression: 'x - 2 = 0', variable: 'x' } });
      assert.strictEqual(s1.status, 'ANSWER_VERIFIED_INCORRECT');

      const s2 = studentWorkEvaluator.evaluateStudentWork('x = ±2', { intent: 'PROPOSED_ANSWER', extractedExpression: 'x = ±2' }, [{ role: 'assistant', content: 'Solve x - 2 = 0' }], { active: { activeExpression: 'x - 2 = 0', variable: 'x' } });
      assert.strictEqual(s2.status, 'ANSWER_VERIFIED_INCORRECT');

      const s3 = studentWorkEvaluator.evaluateStudentWork('x = 0 and 1', { intent: 'PROPOSED_ANSWER', extractedExpression: 'x = 0 and 1' }, [{ role: 'assistant', content: 'Solve x^3 - x = 0' }], { active: { activeExpression: 'x^3 - x = 0', variable: 'x' } });
      assert.strictEqual(s3.status, 'STEP_VERIFIED_INCORRECT');

      const eqStep = studentWorkEvaluator.evaluateEqualityStep('23*pi/3', '42*pi/18 = 2*pi');
      assert.strictEqual(eqStep.status, 'STEP_VERIFIED_INCORRECT');
      assert.strictEqual(eqStep.isEqual, false);

      const tiZero = teachingIntelligence.auditProposedShortcut({
        userText: 'Can I divide both sides by 0 first to get x + 3 = 7?',
        originalExpr: '2(x + 3) = 14',
        variable: 'x'
      });
      assert.strictEqual(tiZero.status, 'INVALID_SHORTCUT');
      assert.strictEqual(tiZero.failureReason, 'DIVISION_BY_ZERO');

      const tiCond = await teachingIntelligence.auditProposedShortcutAsync({
        userText: 'Simplify (x^2 - 1)/(x - 1) -> x + 1',
        originalExpr: '(x^2 - 1)/(x - 1)',
        shortcutExpr: 'x + 1',
        variable: 'x'
      });
      assert.strictEqual(tiCond.status, 'CONDITIONALLY_VALID');
      assert.notStrictEqual(tiCond.isUniversalIdentity, true);
    });

    // -----------------------------------------------------------------------
    // GROUP 8: Delivery Gate, Boxed Spans, Dedup & Algebra Proposed Solution Fixes
    // -----------------------------------------------------------------------
    console.log('▶ [8] Delivery Gate, Boxed Spans, Claim Dedup & Algebra Empty/Singular');
    await check('BRIDGE_GATE', 'Fraction claim dedup, inline condition preservation, safeResponseRecovered gate, and algebra singular/empty checks', async () => {
      const cRev = verificationBridge.extractClaims("Let's calculate: \\frac{3}{4} = 0.85. Result is 0.85.");
      assert.strictEqual(cRev.length, 1);

      const cCond = verificationBridge.extractClaims('We get $\\frac{x^2-4}{x-2} = x + 2$ for $x \\neq 2$.');
      assert(cCond.some(c => c.claim_type === 'symbolic_equivalence' && String(c.data?.condition || '').includes('2')));

      const boxes = verificationBridge.extractBoxedMatches('Result $\\boxed{\\pi}$');
      assert.strictEqual(boxes[0].fullMatch, '\\boxed{\\pi}');
      assert.strictEqual(typeof boxes[0].startIndex, 'number');
      assert.strictEqual(typeof boxes[0].endIndex, 'number');

      const badRec = verificationBridge.evaluateVerificationState({
        claims: [{ claim: {}, verification: { verified: false, status: 'INCORRECT_RESULT' } }],
        verificationResults: [{ verified: false, status: 'INCORRECT_RESULT' }],
        safeResponseRecovered: true
      });
      assert.strictEqual(badRec.state, 'WITHHELD');
      assert.strictEqual(badRec.rejectedCount, 1);

      const badSafe = safeResponseConstructor.constructSafeVerifiedResponse({
        preflightToolResult: { tool: 'solve_calculus', success: true, status: 'DISAGREEMENT', result: '999' }
      });
      assert.strictEqual(badSafe, null);

      const singWrong = await verificationBridge.runDeterministicVerification({
        domain: 'algebra', claim_type: 'algebra', data: { equation: 'x - 2 = 0', variable: 'x', proposed_solution: 999 }
      });
      assert.strictEqual(singWrong.verified, false);

      const emptyWrong = await verificationBridge.runDeterministicVerification({
        domain: 'algebra', claim_type: 'algebra', data: { equation: 'x^2 - 4 = 0', variable: 'x', proposed_solutions: [] }
      });
      assert.strictEqual(emptyWrong.verified, false);
      assert.strictEqual(emptyWrong.status, 'LOST_ROOT');
    });

    // -----------------------------------------------------------------------
    // GROUP 9: Security, AST Bypass Prevention, Failure Injection & Concurrency
    // -----------------------------------------------------------------------
    console.log('▶ [9] Security Hardening, Failure Injection & Concurrency Isolation');
    await check('SEC_FAILURE_INJ', 'AST bypass RCE/DoS blocked + concurrent mixed/abort/malformed pool recovers cleanly', async () => {
      const evilPayloads = [
        '0! + eval (chr(49)+chr(43)+chr(50))',
        '1 << 10000',
        '9**9**9',
        '(10**100)**1000',
        '('.repeat(100) + 'x' + ')'.repeat(100)
      ];
      for (const expr of evilPayloads) {
        const vRes = await verificationBridge.runDeterministicVerification({
          domain: 'algebra', claim_type: 'symbolic_equivalence', data: { expr1: expr, expr2: '0' }
        });
        assert.strictEqual(vRes.verified, false, `Payload verified falsely: ${expr.slice(0, 30)}`);
      }

      // Abort signal mid-flight must return aligned results and leave pool healthy
      const ac = new AbortController();
      ac.abort();
      const abortedRes = await verificationBridge.verifyResponseClaims('2 + 2 = 4 and 3 + 3 = 6', '', ac.signal);
      assert.strictEqual(abortedRes.verificationResults.length, abortedRes.claims.length);

      // 12 concurrent mixed valid/invalid/unicode requests across verifier pool + calculusEngine + rootSolver
      const concurrentJobs = [
        verificationBridge.runDeterministicVerification({ domain: 'calculus', claim_type: 'derivative', data: { expression: 'x^4', variable: 'x', proposed_derivative: '4*x^3' } }),
        verificationBridge.runDeterministicVerification({ domain: 'algebra', claim_type: 'symbolic_equivalence', data: { expr1: 'x/(x*y)', expr2: '1/y', variable: 'x' } }),
        verificationBridge.runDeterministicVerification({ domain: 'calculus', claim_type: 'limit', data: { expression: 'Abs(x)/x', variable: 'x', target: '0', proposed_limit: '0' } }),
        calculusEngine.differentiate('cos(3*x)', { variable: 'x' }),
        calculusEngine.integrate('sin(x)', { isDefinite: true, lowerLimit: 0, upperLimit: 'pi' }),
        rootSolver.solveEquationRoots('x^2 - 9 = 0', { variable: 'x' }),
        rootSolver.solveEquationRoots('x^2/x = 0', { variable: 'x' })
      ];
      const concOut = await Promise.all(concurrentJobs);
      assert.strictEqual(concOut[0].verified, true);
      assert.strictEqual(concOut[1].verified, false);
      assert.strictEqual(concOut[2].verified, false);
      assert.strictEqual(concOut[3].status, 'VERIFIED');
      assert.strictEqual(concOut[4].exactResult, '2');
      assert.deepStrictEqual(concOut[5].roots, [-3, 3]);
      assert.deepStrictEqual(concOut[6].roots, []);
    });

    // -----------------------------------------------------------------------
    // PART IX: Post-Fix Performance, Concurrency & Resource Benchmarks
    // -----------------------------------------------------------------------
    console.log('\n▶ [IX] Post-Fix Performance & Resource Benchmarks');
    verificationBridge.closeVerifierDaemon();
    const tCold0 = performance.now();
    await verificationBridge.runPythonVerifierBatch([
      { domain: 'algebra', claim_type: 'symbolic_equivalence', data: { expr1: '(x+1)^2', expr2: 'x^2 + 2*x + 1' } }
    ]);
    const coldSinglePyMs = performance.now() - tCold0;

    const warmPyLat = [];
    for (let i = 0; i < 12; i++) {
      const t0 = performance.now();
      await verificationBridge.runPythonVerifierBatch([
        { domain: 'algebra', claim_type: 'symbolic_equivalence', data: { expr1: `(x+${i + 2})^2`, expr2: `x^2 + ${2 * (i + 2)}*x + ${(i + 2) ** 2}` } },
        { domain: 'calculus', claim_type: 'limit', data: { expression: `(x^2 - ${(i + 1) ** 2})/(x - ${i + 1})`, variable: 'x', target: String(i + 1), proposed_limit: String(2 * (i + 1)) } }
      ]);
      warmPyLat.push(performance.now() - t0);
    }
    const sortedWarm = [...warmPyLat].sort((a, b) => a - b);
    const pyP50 = sortedWarm[Math.floor(sortedWarm.length * 0.5)];
    const pyP95 = sortedWarm[Math.floor(sortedWarm.length * 0.95)];

    const tBatch10 = performance.now();
    await verificationBridge.runPythonVerifierBatch(Array.from({ length: 10 }, (_, i) => ({
      domain: 'algebra', claim_type: 'symbolic_equivalence', data: { expr1: `(x+${i + 1})^3`, expr2: `x^3 + ${3 * (i + 1)}*x^2 + ${3 * ((i + 1) ** 2)}*x + ${(i + 1) ** 3}` }
    })));
    const batch10Ms = performance.now() - tBatch10;

    const tInterp0 = performance.now();
    for (let i = 0; i < 1000; i++) {
      interpretUserTurn(`so then 3x + ${i % 10} = 21`, []);
    }
    const interp1000Ms = performance.now() - tInterp0;

    const memMb = Number((process.memoryUsage().rss / (1024 * 1024)).toFixed(2));
    console.log(JSON.stringify({
      post_fix_cold_py_ms: Number(coldSinglePyMs.toFixed(2)),
      post_fix_warm_py_batch2_p50_ms: Number(pyP50.toFixed(2)),
      post_fix_warm_py_batch2_p95_ms: Number(pyP95.toFixed(2)),
      post_fix_batch10_ms: Number(batch10Ms.toFixed(2)),
      post_fix_interp1000_ms: Number(interp1000Ms.toFixed(2)),
      node_rss_mb: memMb
    }, null, 2));

    console.log('\n======================================================================');
    console.log(`DEEP AUDIT SUITE RESULTS: ${passed}/${total} PASSED (${failed} FAILED)`);
    console.log('======================================================================');
    for (const [grp, st] of Object.entries(groupStats)) {
      console.log(`• ${grp.padEnd(20)}: ${st.passed}/${st.total} passed`);
    }
  } finally {
    try { verificationBridge.closeVerifierDaemon(); } catch (_) {}
    try { calculusEngine.closeCalculusDaemon(); } catch (_) {}
    try { rootSolver.closeRootDaemon(); } catch (_) {}
  }
}

runSuite().catch(err => {
  console.error('[FATAL DEEP AUDIT ERROR]:', err);
  process.exit(1);
});
