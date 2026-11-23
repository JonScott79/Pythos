/**
 * test/test-equivalence-authority-audit.js
 *
 * Pythos — Mathematical Equivalence & Verification Authority Test Suite
 *
 * Tests all 5 semantic verification categories across:
 * 1. Algebra (polynomials, repeated roots, closely spaced roots, factoring, squaring, variable multipliers)
 * 2. Rational equations (denominator restrictions, removable discontinuities, extraneous roots, fractional poles)
 * 3. Radicals (squaring radical equations, negative radical/abs, extraneous roots, nested/split radicals)
 * 4. Logarithms (domain violations, identities with positive base vs arbitrary base, exp(log(x)) domain mismatch)
 * 5. Trigonometry (identities, restricted domains, periodic singularities)
 * 6. Numerical sampling adversarial cases (expressions agreeing at sample points must NEVER be promoted to SYMBOLICALLY_VERIFIED / VERIFIED)
 * 7. Performance benchmarking
 */

const assert = require('assert');
const { execFileSync } = require('child_process');
const { performance } = require('perf_hooks');
const path = require('path');

const {
  VERIFICATION_CATEGORIES,
  evaluateEquationCandidate,
  evaluateStudentWork,
  formatStudentWorkContext
} = require('../server/studentWorkEvaluator');
const { classifyStudentIntent } = require('../server/studentIntentClassifier');
const { extractActiveProblemState } = require('../server/contextManager');
const { evaluateTransformationSequence, SHORTCUT_STATUS } = require('../server/teachingIntelligence');
const mathjsVerifier = require('../server/mathjsVerifier');

let total = 0;
let passed = 0;
let failed = 0;

function runPythonEquivalence(expr1, expr2, variable = 'x', extra = {}) {
  const payload = JSON.stringify({
    domain: 'algebra',
    claim_type: 'symbolic_equivalence',
    data: { expr1, expr2, variable, ...extra }
  });
  const pyCode = [
    'import sys, json',
    'sys.path.insert(0, "server/verifier")',
    'from algebra_verifier import verify_symbolic_equivalence',
    'req = json.loads(sys.stdin.read())',
    'print(json.dumps(verify_symbolic_equivalence(req["data"])))'
  ].join('\n');
  const pythonBin = process.platform === 'win32'
    ? 'C:\\Users\\jonny\\AppData\\Local\\Python\\pythoncore-3.14-64\\python.exe'
    : 'python3';
  const out = execFileSync(pythonBin, ['-c', pyCode], {
    cwd: path.resolve(__dirname, '..'),
    input: payload,
    encoding: 'utf8',
    timeout: 15000
  });
  return JSON.parse(out.trim());
}

function check(group, name, fn) {
  total++;
  try {
    fn();
    passed++;
  } catch (err) {
    failed++;
    console.error(`  ✗ [FAIL] [${group}] ${name}: ${err.message}`);
    process.exitCode = 1;
  }
}

function run() {
  console.log('======================================================================');
  console.log('PYTHOS: MATHEMATICAL EQUIVALENCE & VERIFICATION AUTHORITY AUDIT');
  console.log('======================================================================\n');

  // =========================================================================
  // 1. ALGEBRA: Polynomial Equivalence, Repeated Roots, Closely Spaced Roots
  // =========================================================================
  console.log('▶ [1] Algebra (Polynomials, Repeated & Closely Spaced Roots)');
  check('ALGEBRA', 'Pure polynomial step (3x^2 - 3 = 48 from (3x^2 - 3)/4 = 12) is SYMBOLICALLY_VERIFIED', () => {
    const res = evaluateEquationCandidate('3x^2 - 3 = 48', '(3x^2 - 3)/4 = 12');
    assert.strictEqual(res.status, 'STEP_VERIFIED_CORRECT');
    assert.strictEqual(res.verificationCategory, VERIFICATION_CATEGORIES.SYMBOLICALLY_VERIFIED);
    assert.strictEqual(res.isExactSymbolicProof, true);
  });

  check('ALGEBRA', 'Factored-to-expanded equivalence x^2 - 5x + 6 = 0 -> (x - 2)*(x - 3) = 0 is SYMBOLICALLY_VERIFIED', () => {
    const res = evaluateEquationCandidate('(x - 2)*(x - 3) = 0', 'x^2 - 5x + 6 = 0');
    assert.strictEqual(res.status, 'STEP_VERIFIED_CORRECT');
    assert.strictEqual(res.verificationCategory, VERIFICATION_CATEGORIES.SYMBOLICALLY_VERIFIED);
    assert.strictEqual(res.isExactSymbolicProof, true);
  });

  check('ALGEBRA', 'Repeated root transformation preserves exact multiplicity: (x - 1.5)^2 = 0 -> x^2 - 3x + 2.25 = 0', () => {
    const res = evaluateEquationCandidate('x^2 - 3x + 2.25 = 0', '(x - 1.5)^2 = 0');
    assert.strictEqual(res.status, 'STEP_VERIFIED_CORRECT');
    assert.strictEqual(res.verificationCategory, VERIFICATION_CATEGORIES.SYMBOLICALLY_VERIFIED);
    assert.strictEqual(res.isExactSymbolicProof, true);
  });

  check('ALGEBRA', 'Closely spaced roots (x - 1.001)*(x - 1.002) = 0 rejects dropping one root (x - 1.001)^2 = 0', () => {
    const res = evaluateEquationCandidate('(x - 1.001)^2 = 0', '(x - 1.001)*(x - 1.002) = 0');
    assert.strictEqual(res.status, 'STEP_VERIFIED_INCORRECT');
    assert.strictEqual(res.verificationCategory, VERIFICATION_CATEGORIES.INVALID_TRANSFORMATION);
    assert.strictEqual(res.isExactSymbolicProof, false);
  });

  check('ALGEBRA', 'Closely spaced roots inside sequence audit detect lost root x = 1.002', () => {
    const seq = evaluateTransformationSequence({
      originalExpr: '(x - 1.001)*(x - 1.002) = 0',
      shortcutExpr: 'x - 1.001 = 0',
      variable: 'x'
    });
    assert.strictEqual(seq.evaluated, true);
    assert.strictEqual(seq.status, SHORTCUT_STATUS.INVALID_SHORTCUT);
    assert(seq.lostRoots.some(r => r.includes('1.002')), `Expected lost root 1.002, got ${seq.lostRoots}`);
  });

  check('ALGEBRA', 'Multiplying by variable expression (x - 2 = 0 -> x^2 - 2x = 0) rejected as INVALID_TRANSFORMATION', () => {
    const res = evaluateEquationCandidate('x^2 - 2x = 0', 'x - 2 = 0');
    assert.strictEqual(res.status, 'STEP_VERIFIED_INCORRECT');
    assert.strictEqual(res.verificationCategory, VERIFICATION_CATEGORIES.INVALID_TRANSFORMATION);
    assert.strictEqual(res.isExactSymbolicProof, false);
  });

  check('ALGEBRA', 'Squaring linear equation (x - 1 = 3 -> (x - 1)^2 = 9) rejected as INVALID_TRANSFORMATION', () => {
    const res = evaluateEquationCandidate('(x - 1)^2 = 9', 'x - 1 = 3');
    assert.strictEqual(res.status, 'STEP_VERIFIED_INCORRECT');
    assert.strictEqual(res.verificationCategory, VERIFICATION_CATEGORIES.INVALID_TRANSFORMATION);
  });

  // =========================================================================
  // 2. RATIONAL EQUATIONS: Poles, Removable Discontinuities & Domains
  // =========================================================================
  console.log('▶ [2] Rational Equations (Poles & Removable Discontinuities)');
  check('RATIONAL', 'Fractional pole clearing without restriction (x - 2.5): x/(x - 2.5) = 2.5/(x - 2.5) -> x = 2.5', () => {
    const res = evaluateEquationCandidate('x - 2.5 = 0', 'x/(x - 2.5) = 2.5/(x - 2.5)');
    assert.strictEqual(res.status, 'STEP_VERIFIED_INCORRECT');
    assert.strictEqual(res.verificationCategory, VERIFICATION_CATEGORIES.DOMAIN_VIOLATION);
    assert.strictEqual(res.isExactSymbolicProof, false);
  });

  check('RATIONAL', 'Removable discontinuity in SymPy: (x^2 - 4)/(x - 2) vs x + 2 without x != 2 -> DOMAIN_RESTRICTION_MISMATCH', () => {
    const res = runPythonEquivalence('(x^2 - 4)/(x - 2)', 'x + 2');
    assert.strictEqual(res.verified, false);
    assert.strictEqual(res.error_type, 'DOMAIN_RESTRICTION_MISMATCH');
  });

  check('RATIONAL', 'Removable discontinuity in SymPy WITH explicit x != 2 -> CONDITIONALLY_EQUIVALENT', () => {
    const res = runPythonEquivalence('(x^2 - 4)/(x - 2) for x != 2', 'x + 2');
    assert.strictEqual(res.verified, true);
    assert.strictEqual(res.status, 'CONDITIONALLY_EQUIVALENT');
  });

  check('RATIONAL', 'Removable discontinuity in mathjsVerifier defers to SymPy instead of false VERIFIED', () => {
    const res = mathjsVerifier.verifySymbolicEquivalence({ expr1: '(x^2 - 4)/(x - 2)', expr2: 'x + 2', variables: ['x'] });
    assert.strictEqual(res.verified, false);
    assert.strictEqual(res.status, 'UNKNOWN');
  });

  check('RATIONAL', 'Sequence audit flags missing domain restriction on (x^2 - 4)/(x - 2) -> x + 2 as DOMAIN_VIOLATION', () => {
    const seq = evaluateTransformationSequence({
      originalExpr: '(x^2 - 4)/(x - 2)',
      shortcutExpr: 'x + 2',
      variable: 'x'
    });
    assert.strictEqual(seq.verificationCategory, VERIFICATION_CATEGORIES.DOMAIN_VIOLATION);
    assert.strictEqual(seq.status, SHORTCUT_STATUS.CONDITIONALLY_VALID);
  });

  // =========================================================================
  // 3. RADICALS: Squaring, Extraneous Solutions, sqrt(x^2), Nested Radicals
  // =========================================================================
  console.log('▶ [3] Radicals (Negative Domain, Extraneous Roots & Nested Radicals)');
  check('RADICALS', 'SymPy rejects sqrt(x^2) = x in real domain', () => {
    const res = runPythonEquivalence('sqrt(x^2)', 'x');
    assert.strictEqual(res.verified, false);
  });

  check('RADICALS', 'SymPy verifies sqrt(x^2) = |x| in real domain', () => {
    const res = runPythonEquivalence('sqrt(x^2)', '|x|');
    assert.strictEqual(res.verified, true);
  });

  check('RADICALS', 'SymPy detects domain mismatch on (sqrt(x))^2 = x without x >= 0', () => {
    const res = runPythonEquivalence('(sqrt(x))^2', 'x');
    assert.strictEqual(res.verified, false);
    assert.strictEqual(res.error_type, 'DOMAIN_RESTRICTION_MISMATCH');
  });

  check('RADICALS', 'SymPy accepts (sqrt(x))^2 = x for x >= 0 as CONDITIONALLY_EQUIVALENT', () => {
    const res = runPythonEquivalence('(sqrt(x))^2 for x >= 0', 'x');
    assert.strictEqual(res.verified, true);
    assert.strictEqual(res.status, 'CONDITIONALLY_EQUIVALENT');
  });

  check('RADICALS', 'SymPy rejects sqrt(x-1)*sqrt(x-2) = sqrt((x-1)*(x-2)) over real domain', () => {
    const res = runPythonEquivalence('sqrt(x - 1) * sqrt(x - 2)', 'sqrt((x - 1) * (x - 2))');
    assert.strictEqual(res.verified, false);
  });

  check('RADICALS', 'Evaluator flags step dropping sqrt domain: sqrt(x - 1) = 3 -> x - 1 = 9 at negative x? Wait: domain diff check at x = 0', () => {
    const res = evaluateEquationCandidate('sqrt(x)*sqrt(x) = 4', 'x = 4');
    assert.strictEqual(res.status, 'STEP_VERIFIED_INCORRECT');
    assert.strictEqual(res.verificationCategory, VERIFICATION_CATEGORIES.DOMAIN_VIOLATION);
  });

  // =========================================================================
  // 4. LOGARITHMS: Invalid Domains, Power Rules, exp(log(x))
  // =========================================================================
  console.log('▶ [4] Logarithms (Domain Restrictions & Identities)');
  check('LOGARITHMS', 'SymPy verifies positive-base log power rule ln(2^(3x-12)) = (3x-12)*ln(2)', () => {
    const res = runPythonEquivalence('ln(2^(3x - 12))', '(3x - 12) * ln(2)');
    assert.strictEqual(res.verified, true);
    assert.strictEqual(res.status, 'VERIFIED');
  });

  check('LOGARITHMS', 'SymPy rejects log(x^2) = 2*log(x) over real domain (fails for x < 0)', () => {
    const res = runPythonEquivalence('log(x^2)', '2*log(x)');
    assert.strictEqual(res.verified, false);
  });

  check('LOGARITHMS', 'SymPy rejects log_2(x^2) = 2*log_2(x) over real domain (guarded /log( force=True regression)', () => {
    const res = runPythonEquivalence('log(x^2)/log(2)', '2*log(x)/log(2)');
    assert.strictEqual(res.verified, false);
  });

  check('LOGARITHMS', 'SymPy rejects exp(log(x)) = x over real domain when x > 0 is omitted', () => {
    const res = runPythonEquivalence('exp(log(x))', 'x');
    assert.strictEqual(res.verified, false);
    assert.strictEqual(res.error_type, 'DOMAIN_RESTRICTION_MISMATCH');
  });

  check('LOGARITHMS', 'SymPy accepts exp(log(x)) = x when x > 0 is explicitly stated', () => {
    const res = runPythonEquivalence('exp(log(x)) for x > 0', 'x');
    assert.strictEqual(res.verified, true);
    assert.strictEqual(res.status, 'CONDITIONALLY_EQUIVALENT');
  });

  check('LOGARITHMS', 'Evaluator catches log domain violation when rewriting log(x^2) = 2 to 2*log(x) = 2', () => {
    const res = evaluateEquationCandidate('2*log(x) = 2', 'log(x^2) = 2');
    assert.strictEqual(res.status, 'STEP_VERIFIED_INCORRECT');
    assert.strictEqual(res.verificationCategory, VERIFICATION_CATEGORIES.DOMAIN_VIOLATION);
  });

  // =========================================================================
  // 5. TRIGONOMETRY: Identities, Restricted Domains & Singularities
  // =========================================================================
  console.log('▶ [5] Trigonometry (Identities & Singularities)');
  check('TRIG', 'SymPy proves tan(x) = sin(x)/cos(x) with identical periodic cos(x) != 0 domain', () => {
    const res = runPythonEquivalence('tan(x)', 'sin(x)/cos(x)');
    assert.strictEqual(res.verified, true);
    assert(res.domain_restrictions.some(r => String(r).includes('pi/2')));
  });

  check('TRIG', 'SymPy rejects tan(x)*cos(x) = sin(x) without cos(x) != 0 restriction', () => {
    const res = runPythonEquivalence('tan(x)*cos(x)', 'sin(x)');
    assert.strictEqual(res.verified, false);
    assert.strictEqual(res.error_type, 'DOMAIN_RESTRICTION_MISMATCH');
  });

  check('TRIG', 'Evaluator catches trig singularity drop: tan(x) = 1 -> sin(x) = cos(x) without cos(x) != 0', () => {
    const res = evaluateEquationCandidate('sin(x) = cos(x)', 'tan(x) = 1');
    assert.strictEqual(res.status, 'STEP_VERIFIED_INCORRECT');
    assert.strictEqual(res.verificationCategory, VERIFICATION_CATEGORIES.DOMAIN_VIOLATION);
  });

  // =========================================================================
  // 6. NUMERICAL SAMPLING ADVERSARIAL CASES (Critical Rigor Checks!)
  // =========================================================================
  console.log('▶ [6] Numerical Sampling Adversarial Cases');

  // Case 6a: Function agreeing at all old sample points [-2.5, -1.5, 0.5, 1.5, 2.5, 3.5]
  // Note: (x+2.5)*(x+1.5)*(x-0.5)*(x-1.5)*(x-2.5)*(x-3.5) is zero at all 6 old sample points!
  check('ADVERSARIAL_SAMPLING', '6-point conspiracy polynomial zeroed at [-2.5, -1.5, 0.5, 1.5, 2.5, 3.5] MUST NOT pass as STEP_VERIFIED_CORRECT', () => {
    const trapTarget = '(x - 1) + 0.001*(x+2.5)*(x+1.5)*(x-0.5)*(x-1.5)*(x-2.5)*(x-3.5) = 0';
    const res = evaluateEquationCandidate(trapTarget, 'x - 1 = 0');
    assert.strictEqual(res.status, 'STEP_VERIFIED_INCORRECT');
    assert.strictEqual(res.verificationCategory, VERIFICATION_CATEGORIES.INVALID_TRANSFORMATION);
    assert.strictEqual(res.isExactSymbolicProof, false);
  });

  // Case 6b: Non-polynomial transcendental step agreeing at sample points where Math.js cannot simplify to 0:
  // Suppose sin(2*pi*x) = 0 on integer grid? Our irrational points catch false periodicity, and for a TRUE non-poly identity like
  // e^x * e^(-x) * (x - 1) vs (x - 1), or a custom function where math.simplify cannot cancel it:
  // cos(x)^2 + sin(x)^2 + x = 2 vs 1 + x = 2 (Math.js math.simplify does NOT know sin(x)^2+cos(x)^2 = 1!)
  check('ADVERSARIAL_SAMPLING', 'Unproven trig identity cos(x)^2 + sin(x)^2 + x = 2 from x + 1 = 2 returns NUMERICALLY_SUPPORTED (NOT SYMBOLICALLY_VERIFIED!)', () => {
    const res = evaluateEquationCandidate('cos(x)^2 + sin(x)^2 + x = 2', 'x + 1 = 2');
    assert.strictEqual(res.status, 'STEP_NUMERICALLY_SUPPORTED');
    assert.strictEqual(res.verificationCategory, VERIFICATION_CATEGORIES.NUMERICALLY_SUPPORTED);
    assert.strictEqual(res.isExactSymbolicProof, false);
    assert(res.preferredResponse.includes('agree at the values checked') && res.preferredResponse.includes("haven't established exact symbolic equivalence"));
  });

  // Case 6c: Even MORE insidious adversarial non-polynomial conspiracy: zero at ALL sample points including irrationals?
  // E.g. Math.js evaluate agrees numerically at sample points on sequence audit (sin(x)^2 + cos(x)^2 vs 1)
  check('ADVERSARIAL_SAMPLING', 'Sequence audit on unproven trig expression sin(x)^2 + cos(x)^2 => 1 returns NUMERICALLY_SUPPORTED / UNVERIFIABLE (NOT VALID_SHORTCUT)', () => {
    const seq = evaluateTransformationSequence({
      originalExpr: 'sin(x)^2 + cos(x)^2',
      shortcutExpr: '1',
      variable: 'x'
    });
    assert.notStrictEqual(seq.status, SHORTCUT_STATUS.VALID_SHORTCUT);
    assert.strictEqual(seq.verificationCategory, VERIFICATION_CATEGORIES.NUMERICALLY_SUPPORTED);
    assert.strictEqual(seq.isExactSymbolicProof, false);
  });

  // Case 6d: mathjsVerifier.verifyCalculusDerivative NEVER promotes numerical sample agreement to VERIFIED when symbolic diff != 0!
  check('ADVERSARIAL_SAMPLING', 'mathjsVerifier.verifyCalculusDerivative with derivative conspiracy polynomial at [1,2,3,-1,-2,0.5,2.5] NEVER returns VERIFIED', () => {
    // True derivative of x^2 is 2*x. Perturbation vanishes at all 7 testPoints: [1, 2, 3, -1, -2, 0.5, 2.5]!
    const trapDeriv = '2*x + (x-1)*(x-2)*(x-3)*(x+1)*(x+2)*(x-0.5)*(x-2.5)';
    const res = mathjsVerifier.verifyCalculusDerivative({
      expression: 'x^2',
      variable: 'x',
      proposed_derivative: trapDeriv
    });
    assert.strictEqual(res.verified, false, 'Numerical derivative sample agreement MUST NOT return verified: true!');
    assert.strictEqual(res.status, 'UNKNOWN', 'Must defer to SymPy CAS!');
  });

  // Case 6e: High-degree non-polynomial or piecewise-like abs trap: |sin(x)| vs sqrt(sin(x)^2) or (abs(x) + 1) vs (x + 1)
  check('ADVERSARIAL_SAMPLING', 'Absolute value mismatch |x| = 2 vs x = 2 caught by negative sample points', () => {
    const res = evaluateEquationCandidate('x - 2 = 0', 'abs(x) - 2 = 0');
    assert.strictEqual(res.status, 'STEP_VERIFIED_INCORRECT');
    assert.strictEqual(res.verificationCategory, VERIFICATION_CATEGORIES.INVALID_TRANSFORMATION);
  });

  // Case 6f: Indeterminate category when expression cannot be evaluated safely
  check('ADVERSARIAL_SAMPLING', 'Completely indeterminate / un-evaluable step returns STEP_INDETERMINATE + INDETERMINATE', () => {
    const res = evaluateEquationCandidate('unknownFn(x) = 0', 'x^2 - 1 = 0');
    assert.strictEqual(res.status, 'STEP_INDETERMINATE');
    assert.strictEqual(res.verificationCategory, VERIFICATION_CATEGORIES.INDETERMINATE);
    assert.strictEqual(res.isExactSymbolicProof, false);
  });

  // =========================================================================
  // 7. TUTORING PROMPT HONESTY & EPISTEMIC FORMATTING
  // =========================================================================
  console.log('▶ [7] Tutoring Prompt Epistemic Honesty');
  check('TUTOR_EXPERIENCE', 'formatStudentWorkContext surfaces NUMERICALLY_SUPPORTED without claiming exact equivalence proof', () => {
    const h = [
      { role: 'user', content: 'Solve x + 1 = 2' },
      { role: 'assistant', content: 'We have $$x + 1 = 2$$.' }
    ];
    const state = extractActiveProblemState(h);
    const step = 'cos(x)^2 + sin(x)^2 + x = 2';
    const intent = classifyStudentIntent(step, h, state);
    const evalRes = evaluateStudentWork(step, intent, h, state);
    assert.strictEqual(evalRes.verificationCategory, VERIFICATION_CATEGORIES.NUMERICALLY_SUPPORTED);
    const promptCtx = formatStudentWorkContext(intent, evalRes, state);
    assert(promptCtx.includes('NUMERICALLY_SUPPORTED'));
    assert(promptCtx.includes('DO NOT claim that the transformation is proven'));
  });

  // =========================================================================
  // 8. FINAL AUDIT REGRESSION CHECKS (SAMPLE ROOT MISMATCH, POLE PROPAGATION, EQUATION SEQUENCES)
  // =========================================================================
  console.log('▶ [8] Final Audit Regression Checks');

  // Finding #1a: Piecewise / constant-ratio sample trap where activeDiff=0 at sample points while targetDiff!=0
  check('ADVERSARIAL_SAMPLING', 'Detects lost solution set across sample points despite constant ratio elsewhere', () => {
    const res = evaluateEquationCandidate('2*abs(x) = 0', 'abs(x) - x = 0');
    assert.strictEqual(res.status, 'STEP_VERIFIED_INCORRECT');
    assert.strictEqual(res.verificationCategory, VERIFICATION_CATEGORIES.INVALID_TRANSFORMATION);
    assert.strictEqual(res.isExactSymbolicProof, false);
  });

  // Finding #1b: Identity equation 0 = 0 reduced incorrectly to x - 1 = 0 must not return INDETERMINATE
  check('ADVERSARIAL_SAMPLING', 'Detects lost sample solutions when reducing 0 = 0 to x - 1 = 0', () => {
    const res = evaluateEquationCandidate('x - 1 = 0', '0 = 0');
    assert.strictEqual(res.status, 'STEP_VERIFIED_INCORRECT');
    assert.strictEqual(res.verificationCategory, VERIFICATION_CATEGORIES.INVALID_TRANSFORMATION);
    assert.strictEqual(res.isExactSymbolicProof, false);
  });

  // Finding #2: VALIDATION_REQUEST must propagate originalEq poles to evaluateEquationCandidate
  check('RATIONAL_DOMAINS', 'VALIDATION_REQUEST propagates originalEq poles to reject excluded solution x = 2', () => {
    const state = {
      active: {
        activeExpression: 'x/(x - 2) = 2/(x - 2)',
        currentStepEquation: 'x = 2'
      }
    };
    const msg = 'Is 2*x = 4 right?';
    const intent = classifyStudentIntent(msg, [], state);
    const evalRes = evaluateStudentWork(msg, intent, [], state);
    assert.strictEqual(evalRes.status, 'STEP_VERIFIED_INCORRECT');
    assert.strictEqual(evalRes.verificationCategory, VERIFICATION_CATEGORIES.DOMAIN_VIOLATION);
    assert.strictEqual(evalRes.isExactSymbolicProof, false);
  });

  // Finding #3a: Empty-root equation pair (x^2 + 1 = 0 => x^2 + 2 = 0) must never pass as SYMBOLICALLY_VERIFIED
  check('ALGEBRA_EQUIVALENCE', 'evaluateTransformationSequence rejects empty-root non-equivalent equation step x^2 + 1 = 0 => x^2 + 2 = 0', () => {
    const res = evaluateTransformationSequence({
      originalExpr: 'x^2 + 1 = 0',
      shortcutExpr: 'x^2 + 2 = 0'
    });
    assert.strictEqual(res.status, SHORTCUT_STATUS.INVALID_SHORTCUT);
    assert.strictEqual(res.verificationCategory, VERIFICATION_CATEGORIES.INVALID_TRANSFORMATION);
    assert.strictEqual(res.isExactSymbolicProof, false);
    assert.strictEqual(res.isValid, false);
  });

  // Finding #3b: Out-of-range cubic equation step ((x - 20)^3 = 0 => (x - 25)^3 = 0) rejected
  check('ALGEBRA_EQUIVALENCE', 'evaluateTransformationSequence rejects out-of-range cubic equation step (x - 20)^3 = 0 => (x - 25)^3 = 0', () => {
    const res = evaluateTransformationSequence({
      originalExpr: '(x - 20)^3 = 0',
      shortcutExpr: '(x - 25)^3 = 0'
    });
    assert.strictEqual(res.status, SHORTCUT_STATUS.INVALID_SHORTCUT);
    assert.strictEqual(res.verificationCategory, VERIFICATION_CATEGORIES.INVALID_TRANSFORMATION);
    assert.strictEqual(res.isExactSymbolicProof, false);
  });

  // Finding #3c: Closely spaced roots tolerance (1.001, 1.002 vs 1.0015) must not falsely match
  check('ALGEBRA_EQUIVALENCE', 'evaluateTransformationSequence catches closely spaced root loss at 1.001 and 1.002', () => {
    const res = evaluateTransformationSequence({
      originalExpr: '(x - 1.001)*(x - 1.002) = 0',
      shortcutExpr: 'x - 1.0015 = 0'
    });
    assert.strictEqual(res.status, SHORTCUT_STATUS.INVALID_SHORTCUT);
    assert.strictEqual(res.verificationCategory, VERIFICATION_CATEGORIES.INVALID_TRANSFORMATION);
    assert.strictEqual(res.isExactSymbolicProof, false);
  });

  // Finding #3d: Irrelevant stated exclusion (x != 99 when x = 2 is dropped) must not satisfy domain restriction check
  check('RATIONAL_DOMAINS', 'evaluateTransformationSequence requires matching excluded pole value rather than any arbitrary != number', () => {
    const res = evaluateTransformationSequence({
      userText: '(x^2 - 4)/((x - 2)*(x + 3)) => (x + 2)/(x + 3), x != 99'
    });
    assert.strictEqual(res.status, SHORTCUT_STATUS.CONDITIONALLY_VALID);
    assert.strictEqual(res.failureReason, 'MISSING_DOMAIN_RESTRICTION');
    assert.strictEqual(res.verificationCategory, VERIFICATION_CATEGORIES.DOMAIN_VIOLATION);
    assert.strictEqual(res.isExactSymbolicProof, false);
  });

  // Finding #3g: Inline matching domain restriction is cleanly stripped from parsed step expression and preserved
  check('RATIONAL_DOMAINS', 'evaluateTransformationSequence preserves inline domain restriction without corrupting step math', () => {
    const res = evaluateTransformationSequence({
      userText: '(x^2 - 4)/(x - 2) => x + 2, x != 2'
    });
    assert.deepStrictEqual(res.steps, ['(x^2 - 4)/(x - 2)', 'x + 2']);
    assert.notStrictEqual(res.failureReason, 'MISSING_DOMAIN_RESTRICTION');
    assert.notStrictEqual(res.verificationCategory, VERIFICATION_CATEGORIES.INVALID_TRANSFORMATION);
    assert(res.domainRestrictions.includes('x != 2'));
  });

  // Finding #3e: Logarithmic equation domain expansion (log(x) + log(x - 2) = 8 => log(x*(x - 2)) = 8) flagged as DOMAIN_VIOLATION
  check('LOG_DOMAINS', 'evaluateTransformationSequence flags logarithmic equation domain expansion as DOMAIN_VIOLATION', () => {
    const res = evaluateTransformationSequence({
      originalExpr: 'log(x) + log(x - 2) = 8',
      shortcutExpr: 'log(x*(x - 2)) = 8'
    });
    assert.strictEqual(res.verificationCategory, VERIFICATION_CATEGORIES.DOMAIN_VIOLATION);
    assert.strictEqual(res.isExactSymbolicProof, false);
    assert.strictEqual(res.isValid, false);
  });

  // Finding #3f: Unsimplified transcendental equation step returns NUMERICALLY_SUPPORTED rather than SYMBOLICALLY_VERIFIED
  check('TRIG_IDENTITIES', 'evaluateTransformationSequence classifies unproven trig equation step as NUMERICALLY_SUPPORTED', () => {
    const res = evaluateTransformationSequence({
      originalExpr: 'sin(x) + 2 = 3',
      shortcutExpr: 'sin(x) + sin(x)^2 + cos(x)^2 = 2'
    });
    assert.strictEqual(res.status, SHORTCUT_STATUS.UNVERIFIABLE);
    assert.strictEqual(res.verificationCategory, VERIFICATION_CATEGORIES.NUMERICALLY_SUPPORTED);
    assert.strictEqual(res.isExactSymbolicProof, false);
  });

  // Performance check across 500 mixed symbolic/domain/adversarial candidate evaluations
  const perfStart = performance.now();
  for (let i = 0; i < 500; i++) {
    evaluateEquationCandidate('3x^2 - 3 = 48', '(3x^2 - 3)/4 = 12');
    evaluateEquationCandidate('x - 2 = 0', '(x^2 - 4)/(x - 2) = 0');
  }
  const perfMs = performance.now() - perfStart;

  console.log('\n======================================================================');
  console.log(`PERFORMANCE: 1,000 equation evaluations (polynomial proof + domain audit) in ${perfMs.toFixed(2)}ms (${(perfMs / 1000).toFixed(4)}ms/eval)`);
  console.log(`RESULTS: ${passed}/${total} PASSED (${failed} FAILED)`);
  console.log('======================================================================');
}

run();
