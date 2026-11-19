/**
 * test/test-math-independent-corpus.js
 *
 * PYTHOS PHASE XXI (Priority Two): Independent Adversarial Mathematical Validation Corpus
 * Minimum 250 distinct cases across 9 mathematical categories with independently
 * established ground-truth outcomes (correct, incorrect, conditional, ambiguous,
 * malformed, and impossible inputs).
 */

const assert = require('assert');
const verificationBridge = require('../server/verificationBridge');
const calculusEngine = require('../server/engines/calculusEngine');
const specialistAssist = require('../server/specialistAssist');
const studentWorkEvaluator = require('../server/studentWorkEvaluator');
const mathjsVerifier = require('../server/mathjsVerifier');

const CASES = [];
function add(category, id, description, run) {
  CASES.push({ category, id, description, run });
}

// ---------------------------------------------------------------------------
// 1. ALGEBRA (45 cases: equations, equivalence, factoring, singularities, invalid steps)
// ---------------------------------------------------------------------------
const algTruePairs = [
  ['x^2 - 1', '(x - 1)*(x + 1)'],
  ['x^2 - 9', '(x - 3)*(x + 3)'],
  ['x^2 + 5*x + 6', '(x + 2)*(x + 3)'],
  ['(x + 3)^2', 'x^2 + 6*x + 9'],
  ['(x - 4)^2', 'x^2 - 8*x + 16'],
  ['(2*x + 1)*(x - 3)', '2*x^2 - 5*x - 3'],
  ['x^3 - 8', '(x - 2)*(x^2 + 2*x + 4)'],
  ['x^3 + 27', '(x + 3)*(x^2 - 3*x + 9)'],
  ['2*(x + 5) - 3*(x - 1)', '-x + 13'],
  ['(a + b)^2 - (a - b)^2', '4*a*b'],
  ['(x + y)*(x^2 - x*y + y^2)', 'x^3 + y^3'],
  ['(3*x^2*y)^2', '9*x^4*y^2'],
  ['(x^2 - 1)/(x + 1)', 'x - 1, for x != -1'],
  ['(x^2 - 9)/(x - 3)', 'x + 3, for x != 3'],
  ['(x^2 - a^2)/(x - a)', 'x + a, for x != a']
];
algTruePairs.forEach(([e1, e2], idx) => {
  const [rhs, cond] = e2.includes(', for ') ? e2.split(', for ') : [e2, undefined];
  add('1_Algebra', `ALG-T-${idx + 1}`, `${e1} == ${e2}`, async () => {
    const res = await verificationBridge.runDeterministicVerification({
      domain: 'algebra',
      claim_type: 'symbolic_equivalence',
      data: { expr1: e1, expr2: rhs, condition: cond }
    });
    assert.strictEqual(res.verified, true, `Expected true for ${e1} == ${e2}, got ${JSON.stringify(res)}`);
  });
});

const algFalsePairs = [
  ['(x + 3)^2', 'x^2 + 9'],
  ['(x - 5)^2', 'x^2 - 25'],
  ['(a + b)^3', 'a^3 + b^3'],
  ['2*(x + 4)', '2*x + 4'],
  ['1/(x + y)', '1/x + 1/y'],
  ['(x + 2)/(x + 3)', '2/3'],
  ['(x^2 + 1)/x', 'x + 1'],
  ['(x^2 - 4)/(x - 2)', 'x + 2'],       // missing x != 2 restriction
  ['(x^2 - 25)/(x + 5)', 'x - 5'],      // missing x != -5 restriction
  ['(x^2 - a^2)/(x - a)', 'x + a'],     // missing x != a restriction
  ['(x^3 - 1)/(x - 1)', 'x^2 + x + 1'], // missing x != 1 restriction
  ['-(x - 3)', '-x - 3'],
  ['3*x + 2*x^2', '5*x^3'],
  ['(2*x)^3', '2*x^3'],
  ['x^2 * x^3', 'x^6']
];
algFalsePairs.forEach(([e1, e2], idx) => {
  add('1_Algebra', `ALG-F-${idx + 1}`, `${e1} != ${e2}`, async () => {
    const res = await verificationBridge.runDeterministicVerification({
      domain: 'algebra',
      claim_type: 'symbolic_equivalence',
      data: { expr1: e1, expr2: e2 }
    });
    assert.strictEqual(res.verified, false, `Expected false for ${e1} == ${e2}, got ${JSON.stringify(res)}`);
  });
});

const algEquations = [
  { eq: '2*x + 5 = 17', sols: ['6'], ok: true },
  { eq: 'x^2 - 7*x + 12 = 0', sols: ['3', '4'], ok: true },
  { eq: 'x^2 - 5*x = 0', sols: ['0', '5'], ok: true },
  { eq: 'x^2 - 5*x = 0', sols: ['5'], ok: false }, // lost root x=0
  { eq: 'x^2 - 9 = 0', sols: ['3'], ok: false },   // lost root x=-3
  { eq: 'sqrt(x + 3) = x - 3', sols: ['6'], ok: true },
  { eq: 'sqrt(x + 3) = x - 3', sols: ['1', '6'], ok: false }, // extraneous x=1
  { eq: '1/(x - 2) = 0', sols: ['2'], ok: false },
  { eq: '(x - 4)/(x - 4) = 1', sols: ['4'], ok: false }, // x=4 excluded
  { eq: '3*x - 7 = 8', sols: ['5'], ok: true },
  { eq: 'x^2 + 4*x + 4 = 0', sols: ['-2'], ok: true },
  { eq: '2*x^2 - 8 = 0', sols: ['-2', '2'], ok: true },
  { eq: 'x^2 + 1 = 0', sols: ['1'], ok: false },
  { eq: '4*x = 20', sols: ['6'], ok: false },
  { eq: '(x - 1)*(x + 2) = 0', sols: ['1', '-2'], ok: true }
];
algEquations.forEach((item, idx) => {
  add('1_Algebra', `ALG-EQ-${idx + 1}`, `${item.eq} -> [${item.sols.join(',')}] (${item.ok})`, async () => {
    const res = await verificationBridge.runDeterministicVerification({
      domain: 'algebra',
      claim_type: 'equation_solution',
      data: { equation: item.eq, variable: 'x', proposed_solutions: item.sols }
    });
    assert.strictEqual(Boolean(res.verified), item.ok, `Equation ${item.eq} failed: ${JSON.stringify(res)}`);
  });
});

// ---------------------------------------------------------------------------
// 2. GEOMETRY (30 cases: right triangles, impossible triangles, areas, circles)
// ---------------------------------------------------------------------------
const geomSpecialistCases = [
  { p: 'Right triangle with legs 3 and 4', status: 'VERIFIED', check: r => Math.abs(parseFloat(r.exactResult) - 5) < 1e-4 },
  { p: 'Right triangle with legs 5 and 12', status: 'VERIFIED', check: r => Math.abs(parseFloat(r.exactResult) - 13) < 1e-4 },
  { p: 'Right triangle with legs 8 and 15', status: 'VERIFIED', check: r => Math.abs(parseFloat(r.exactResult) - 17) < 1e-4 },
  { p: 'Right triangle with legs 7 and 24', status: 'VERIFIED', check: r => Math.abs(parseFloat(r.exactResult) - 25) < 1e-4 },
  { p: 'Right triangle with leg 6 and hypotenuse 10', status: 'VERIFIED', check: r => Math.abs(parseFloat(r.exactResult) - 8) < 1e-4 },
  { p: 'Right triangle with leg 10 and hypotenuse 6', status: 'FAILED', outcome: 'IMPOSSIBLE_DOMAIN_CONFIGURATION' },
  { p: 'Right triangle with leg 5 and hypotenuse 5', status: 'FAILED', outcome: 'IMPOSSIBLE_DOMAIN_CONFIGURATION' },
  { p: 'Right triangle with legs -3 and 4', status: 'FAILED', outcome: 'IMPOSSIBLE_DOMAIN_CONFIGURATION' },
  { p: 'Triangle with sides 3, 4, 5', status: 'VERIFIED', check: r => r.area !== undefined },
  { p: 'Triangle with sides 1, 2, 10', status: 'FAILED', outcome: 'IMPOSSIBLE_DOMAIN_CONFIGURATION' },
  { p: 'Triangle with sides 2, 3, 5', status: 'FAILED', outcome: 'DEGENERATE_GEOMETRY' },
  { p: 'Triangle with sides 0, 4, 5', status: 'FAILED', outcome: 'IMPOSSIBLE_DOMAIN_CONFIGURATION' },
  { p: 'Circle sector with radius 6 and angle 60 deg', status: 'VERIFIED' },
  { p: 'Circle sector with radius 10 and angle 90 deg', status: 'VERIFIED' },
  { p: 'Circle sector with radius -5 and angle 60 deg', status: 'FAILED', outcome: 'DEGENERATE_GEOMETRY' }
];
geomSpecialistCases.forEach((gc, idx) => {
  add('2_Geometry', `GEOM-SP-${idx + 1}`, gc.p, async () => {
    const res = await specialistAssist.evaluateSpecialistAssist(gc.p, [], { problemDomain: 'GEOMETRY' });
    assert.strictEqual(res.matched, true, `Expected specialist match for: ${gc.p}`);
    assert.strictEqual(res.result.status, gc.status, `Unexpected status for ${gc.p}: ${JSON.stringify(res.result)}`);
    if (gc.outcome) assert.strictEqual(res.outcome.outcomeCategory, gc.outcome);
    if (gc.check) assert(gc.check(res.result), `Check failed for ${gc.p}`);
  });
});

for (let i = 0; i < 15; i++) {
  const b = 3 + i;
  const h = 4 + (i % 7);
  const isOk = i % 3 !== 0;
  const proposed = isOk ? (0.5 * b * h) : (b * h);
  add('2_Geometry', `GEOM-AR-${i + 1}`, `Triangle area b=${b}, h=${h} -> ${proposed} (${isOk})`, async () => {
    const res = mathjsVerifier.verify({
      domain: 'geometry',
      claim_type: 'geometry_area',
      data: { figure: 'triangle', base: b, height: h, proposed_value: proposed }
    });
    assert.strictEqual(Boolean(res.verified), isOk);
  });
}

// ---------------------------------------------------------------------------
// 3. TRIGONOMETRY (30 cases)
// ---------------------------------------------------------------------------
const trigIdentities = [
  ['sin(x)^2 + cos(x)^2', '1', true],
  ['1 + tan(x)^2', 'sec(x)^2', true],
  ['1 + cot(x)^2', 'csc(x)^2', true],
  ['sin(2*x)', '2*sin(x)*cos(x)', true],
  ['cos(2*x)', 'cos(x)^2 - sin(x)^2', true],
  ['cos(2*x)', '1 - 2*sin(x)^2', true],
  ['cos(2*x)', '2*cos(x)^2 - 1', true],
  ['sin(-x)', '-sin(x)', true],
  ['cos(-x)', 'cos(x)', true],
  ['tan(-x)', '-tan(x)', true],
  ['sin(x + y)', 'sin(x)*cos(y) + cos(x)*sin(y)', true],
  ['cos(x + y)', 'cos(x)*cos(y) - sin(x)*sin(y)', true],
  ['sin(x)^2 - cos(x)^2', '1', false],
  ['sin(2*x)', '2*sin(x)', false],
  ['cos(x + y)', 'cos(x) + cos(y)', false],
  ['sin(x + y)', 'sin(x) + sin(y)', false],
  ['tan(x)', 'cos(x)/sin(x)', false],
  ['sec(x)', '1/sin(x)', false],
  ['csc(x)', '1/cos(x)', false],
  ['sin(x)^2', '1 + cos(x)^2', false]
];
trigIdentities.forEach(([e1, e2, ok], idx) => {
  add('3_Trigonometry', `TRIG-ID-${idx + 1}`, `${e1} == ${e2} (${ok})`, async () => {
    const res = await verificationBridge.runDeterministicVerification({
      domain: 'algebra',
      claim_type: 'symbolic_equivalence',
      data: { expr1: e1, expr2: e2 }
    });
    assert.strictEqual(Boolean(res.verified), ok, `Trig identity ${e1} == ${e2}: ${JSON.stringify(res)}`);
  });
});

const trigNumeric = [
  ['sin(30 deg)', 0.5, true],
  ['cos(60 deg)', 0.5, true],
  ['tan(45 deg)', 1, true],
  ['sin(90 deg)', 1, true],
  ['cos(0 deg)', 1, true],
  ['sin(pi/6)', 0.5, true],
  ['cos(pi/3)', 0.5, true],
  ['sin(30 deg)', 0.866, false],
  ['cos(60 deg)', 0.866, false],
  ['tan(45 deg)', 0.5, false]
];
trigNumeric.forEach(([expr, val, ok], idx) => {
  add('3_Trigonometry', `TRIG-NUM-${idx + 1}`, `${expr} = ${val} (${ok})`, async () => {
    const res = mathjsVerifier.verify({
      domain: 'arithmetic',
      claim_type: 'arithmetic',
      data: { expression: expr, proposed_value: val }
    });
    assert.strictEqual(Boolean(res.verified), ok);
  });
});

// ---------------------------------------------------------------------------
// 4. PRECALCULUS & LOGARITHMS (30 cases)
// ---------------------------------------------------------------------------
const logCases = [
  ['log(x*y)', 'log(x) + log(y)', false], // invalid over general reals without x > 0, y > 0!
  ['log(x^2)', '2*log(x)', false], // invalid over negative reals!
  ['exp(a + b)', 'exp(a)*exp(b)', true],
  ['exp(2*x)', '(exp(x))^2', true],
  ['(exp(x))^3', 'exp(3*x)', true],
  ['exp(0)', '1', true],
  ['log(1)', '0', true],
  ['log(e)', '1', true],
  ['log(x + y)', 'log(x) + log(y)', false],
  ['log(x + y)', 'log(x)*log(y)', false],
  ['exp(x + y)', 'exp(x) + exp(y)', false],
  ['exp(x^2)', '(exp(x))^2', false],
  ['2^(x + 1)', '2*2^x', true],
  ['3^(2*x)', '9^x', true],
  ['2^x * 3^x', '6^x', true],
  ['2^x + 3^x', '5^x', false],
  ['(a^2)^3', 'a^6', true],
  ['(a^2)^3', 'a^5', false],
  ['a^0', '1', true],
  ['(x + 1)^(-1)', '1/(x + 1)', true]
];
logCases.forEach(([e1, e2, ok], idx) => {
  add('4_Precalc_Logs', `PRE-SYM-${idx + 1}`, `${e1} == ${e2} (${ok})`, async () => {
    const res = await verificationBridge.runDeterministicVerification({
      domain: 'algebra',
      claim_type: 'symbolic_equivalence',
      data: { expr1: e1, expr2: e2 }
    });
    assert.strictEqual(Boolean(res.verified), ok, `Precalc ${e1} == ${e2}: ${JSON.stringify(res)}`);
  });
});

for (let i = 1; i <= 10; i++) {
  const xVal = i * 2;
  const isOk = i % 2 === 1;
  const proposed = isOk ? (xVal * xVal + 1) : (xVal * xVal + 2);
  add('4_Precalc_Logs', `PRE-FN-${i}`, `f(x)=x^2+1 at x=${xVal} -> ${proposed} (${isOk})`, async () => {
    const res = mathjsVerifier.verify({
      domain: 'algebra',
      claim_type: 'function_evaluation',
      data: { variable: 'x', expression: 'x^2 + 1', input: xVal, proposed_value: proposed }
    });
    assert.strictEqual(Boolean(res.verified), isOk);
  });
}

// ---------------------------------------------------------------------------
// 5. CALCULUS — DERIVATIVES (35 cases)
// ---------------------------------------------------------------------------
const derivCases = [
  ['x^3/3', 'x', 'x^2', true],
  ['\\frac{x^{3}}{3}', 'x', '\\frac{x^{2}}{2}', false],
  ['sin(x)', 'x', 'cos(x)', true],
  ['cos(x)', 'x', '-sin(x)', true],
  ['cos(x)', 'x', 'sin(x)', false],
  ['tan(x)', 'x', 'sec(x)^2', true],
  ['exp(3*x)', 'x', '3*exp(3*x)', true],
  ['exp(3*x)', 'x', 'exp(3*x)', false],
  ['ln(x)', 'x', '1/x', true],
  ['ln(5*x)', 'x', '1/x', true],
  ['ln(5*x)', 'x', '5/x', false],
  ['x*exp(x)', 'x', '(x + 1)*exp(x)', true],
  ['x*sin(x)', 'x', 'sin(x) + x*cos(x)', true],
  ['sin(x)/x', 'x', '(x*cos(x) - sin(x))/x^2', true],
  ['sqrt(x)', 'x', '1/(2*sqrt(x))', true],
  ['sqrt(x^2 + 1)', 'x', 'x/sqrt(x^2 + 1)', true],
  ['3*t^4 - 2*t', 't', '12*t^3 - 2', true],
  ['3*t^4 - 2*t', 't', '12*t^3', false],
  ['atan(x)', 'x', '1/(1 + x^2)', true],
  ['asin(x)', 'x', '1/sqrt(1 - x^2)', true],
  ['1/x^2', 'x', '-2/x^3', true],
  ['1/x^2', 'x', '2/x^3', false],
  ['(2*x + 1)^5', 'x', '10*(2*x + 1)^4', true],
  ['(2*x + 1)^5', 'x', '5*(2*x + 1)^4', false],
  ['e^(2*x)', 'x', '2*e^(2*x)', true]
];
derivCases.forEach(([fn, v, prop, ok], idx) => {
  add('5_Calc_Derivatives', `DERIV-VER-${idx + 1}`, `d/d${v}[${fn}] = ${prop} (${ok})`, async () => {
    const res = await verificationBridge.runDeterministicVerification({
      domain: 'calculus',
      claim_type: 'derivative',
      data: { expression: fn, variable: v, proposed_derivative: prop }
    });
    assert.strictEqual(Boolean(res.verified), ok, `Derivative ${fn} -> ${prop}: ${JSON.stringify(res)}`);
  });
});

const derivWorkerCases = [
  ['x^3 + 2*x', 'x', 2, '14'],
  ['sin(x)', 'x', 0, '1'],
  ['exp(2*x)', 'x', 0, '2'],
  ['x^4', 'x', -1, '-4'],
  ['ln(x)', 'x', 1, '1'],
  ['\\frac{\\sqrt{x+1}}{x}', 'x', null, null],
  ['\\frac{e^{2x}}{3}', 'x', 0, '2/3'],
  ['t^3 - 3*t', 't', 2, '9'],
  ['cos(x)', 'x', 0, '0'],
  ['1/(x + 1)', 'x', 1, '-1/4']
];
derivWorkerCases.forEach(([fn, v, pt, expected], idx) => {
  add('5_Calc_Derivatives', `DERIV-WRK-${idx + 1}`, `worker d/d${v}[${fn}]${pt !== null ? ` at ${pt}` : ''}`, async () => {
    const res = await calculusEngine.differentiate(fn, { variable: v, point: pt });
    assert.strictEqual(res.status, 'VERIFIED', `Worker failed for ${fn}: ${JSON.stringify(res)}`);
    if (expected !== null) {
      assert.strictEqual(String(res.exactResult).trim(), expected);
    }
  });
});

// ---------------------------------------------------------------------------
// 6. CALCULUS — ANTIDERIVATIVES & INTEGRALS (35 cases)
// ---------------------------------------------------------------------------
const antiCases = [
  ['2*x', 'x', 'x^2 + C', true, true],
  ['2*x', 'x', 'x^2', true, false],        // valid antiderivative when +C not required
  ['2*x', 'x', 'x^2', false, true],       // incomplete indefinite integral when +C required
  ['3*x^2', 'x', 'x^3 + C', true, true],
  ['3*x^2', 'x', 'x^2 + C', false, true],
  ['cos(x)', 'x', 'sin(x) + C', true, true],
  ['sin(x)', 'x', '-cos(x) + C', true, true],
  ['sin(x)', 'x', 'cos(x) + C', false, true],
  ['exp(2*x)', 'x', 'exp(2*x)/2 + C', true, true],
  ['exp(2*x)', 'x', '2*exp(2*x) + C', false, true],
  ['1/x', 'x', 'ln(abs(x)) + C', true, true],
  ['1/(1 + x^2)', 'x', 'atan(x) + C', true, true],
  ['sec(x)^2', 'x', 'tan(x) + C', true, true],
  ['3*t^2 + 2*t', 't', 't^3 + t^2 + C', true, true],
  ['2*x*cos(x^2)', 'x', 'sin(x^2) + C', true, true],
  ['x*exp(x^2)', 'x', 'exp(x^2)/2 + C', true, true],
  ['1/sqrt(1 - x^2)', 'x', 'asin(x) + C', true, true],
  ['sin(x)*cos(x)', 'x', 'sin(x)^2/2 + C', true, true],
  ['sin(x)*cos(x)', 'x', '-cos(x)^2/2 + C', true, true], // differs by constant 1/2!
  ['4*x^3', 'x', 'x^4 + C', true, true]
];
antiCases.forEach(([ing, v, prop, ok, reqC], idx) => {
  add('6_Calc_Integrals', `INT-ANTI-${idx + 1}`, `int(${ing} d${v}) = ${prop} (reqC=${reqC}, ok=${ok})`, async () => {
    const res = await verificationBridge.runDeterministicVerification({
      domain: 'calculus',
      claim_type: 'antiderivative',
      data: { integrand: ing, variable: v, proposed_antiderivative: prop, require_constant: reqC }
    });
    assert.strictEqual(Boolean(res.verified), ok, `Antiderivative ${ing} -> ${prop}: ${JSON.stringify(res)}`);
  });
});

const defIntCases = [
  ['3*t^2', 't', 0, 2, 'VERIFIED', '8'],
  ['2*x', 'x', 0, 3, 'VERIFIED', '9'],
  ['sin(x)', 'x', 0, 'pi', 'VERIFIED', '2'],
  ['exp(x)', 'x', 0, 1, 'VERIFIED', '-1 + E'],
  ['1/x^2', 'x', 0, 1, 'FAILED', 'DIVERGENT_INTEGRAL'],
  ['1/x', 'x', 0, 1, 'FAILED', 'DIVERGENT_INTEGRAL'],
  ['1/(x - 1)^2', 'x', 0, 2, 'FAILED', 'DIVERGENT_INTEGRAL'],
  ['x^2', 'x', -1, 1, 'VERIFIED', '2/3'],
  ['cos(x)', 'x', 0, 'pi/2', 'VERIFIED', '1'],
  ['4*x^3', 'x', 1, 2, 'VERIFIED', '15'],
  ['1/sqrt(x)', 'x', 0, 1, 'VERIFIED', '2'],
  ['x', 'x', 0, 4, 'VERIFIED', '8'],
  ['6*x^2', 'x', 0, 1, 'VERIFIED', '2'],
  ['e^(-x)', 'x', 0, 'oo', 'VERIFIED', '1'],
  ['1/x^2', 'x', 1, 'oo', 'VERIFIED', '1']
];
defIntCases.forEach(([ing, v, lo, hi, status, expected], idx) => {
  add('6_Calc_Integrals', `INT-DEF-${idx + 1}`, `int_${lo}^${hi} ${ing} d${v}`, async () => {
    const res = await calculusEngine.integrate(ing, {
      variable: v,
      isDefinite: true,
      lowerLimit: lo,
      upperLimit: hi
    });
    assert.strictEqual(res.status, status, `Definite integral ${ing}: ${JSON.stringify(res)}`);
    if (status === 'FAILED') assert.strictEqual(res.error, expected);
    else assert.strictEqual(String(res.exactResult).trim(), expected);
  });
});

// ---------------------------------------------------------------------------
// 7. CALCULUS — LIMITS & CONTINUITY (20 cases)
// ---------------------------------------------------------------------------
const limitCases = [
  ['sin(x)/x', 'x', '0', 'VERIFIED', '1'],
  ['(1 - cos(x))/x^2', 'x', '0', 'VERIFIED', '1/2'],
  ['(x^2 - 4)/(x - 2)', 'x', '2', 'VERIFIED', '4'],
  ['(x^3 - 1)/(x - 1)', 'x', '1', 'VERIFIED', '3'],
  ['(1 + 1/x)^x', 'x', 'oo', 'VERIFIED', 'E'],
  ['(3*x^2 + 1)/(x^2 - 5)', 'x', 'oo', 'VERIFIED', '3'],
  ['exp(-x)', 'x', 'oo', 'VERIFIED', '0'],
  ['(sqrt(x + 4) - 2)/x', 'x', '0', 'VERIFIED', '1/4'],
  ['1/x', 'x', '0', 'VERIFIED', 'DOES_NOT_EXIST'],
  ['abs(x)/x', 'x', '0', 'FAILED', 'TWO_SIDED_LIMIT_DOES_NOT_EXIST'],
  ['sin(3*x)/x', 'x', '0', 'VERIFIED', '3'],
  ['tan(x)/x', 'x', '0', 'VERIFIED', '1'],
  ['(e^x - 1)/x', 'x', '0', 'VERIFIED', '1'],
  ['ln(1 + x)/x', 'x', '0', 'VERIFIED', '1'],
  ['(x^2 - 9)/(x + 3)', 'x', '-3', 'VERIFIED', '-6'],
  ['1/x^2', 'x', '0', 'VERIFIED', 'oo'],
  ['x*sin(1/x)', 'x', '0', 'VERIFIED', '0'],
  ['(2*x + 5)/(4*x - 1)', 'x', 'oo', 'VERIFIED', '1/2'],
  ['cos(x)', 'x', '0', 'VERIFIED', '1'],
  ['(x - 5)/(x^2 - 25)', 'x', '5', 'VERIFIED', '1/10']
];
limitCases.forEach(([expr, v, target, status, expected], idx) => {
  add('7_Calc_Limits', `LIM-${idx + 1}`, `lim_{${v}->${target}} ${expr}`, async () => {
    const res = await calculusEngine.limit(expr, { variable: v, target });
    assert.strictEqual(res.status, status, `Limit ${expr}: ${JSON.stringify(res)}`);
    if (status === 'VERIFIED') assert.strictEqual(String(res.exactResult).trim(), expected);
  });
});

// ---------------------------------------------------------------------------
// 8. DOMAIN RESTRICTIONS, REAL VS COMPLEX & ABS (20 cases)
// ---------------------------------------------------------------------------
const domainCases = [
  ['sqrt(x^2)', 'abs(x)', true],
  ['abs(x)', 'sqrt(x^2)', true],
  ['sqrt(x^2)', 'x', false],
  ['abs(x)', 'x', false],
  ['abs(-x)', 'abs(x)', true],
  ['abs(x - y)', 'abs(y - x)', true],
  ['abs(x*y)', 'abs(x)*abs(y)', true],
  ['abs(x + y)', 'abs(x) + abs(y)', false],
  ['||x - 1| - 2|', 'abs(abs(x - 1) - 2)', true],
  ['sqrt(x^2 + 9)', 'x + 3', false],
  ['sqrt(x^2 + 4)', 'x + 2', false],
  ['sqrt(4*x^2)', '2*abs(x)', true],
  ['sqrt(4*x^2)', '2*x', false],
  ['(x^2 - 16)/(x - 4)', 'x + 4', false],
  ['(x^2 - 16)/(x - 4)', 'x + 4, for x != 4', true],
  ['x/x', '1', false],
  ['x/x', '1, for x != 0', true],
  ['(x + 1)/(x + 1)', '1', false],
  ['(x + 1)/(x + 1)', '1, for x != -1', true],
  ['1/(x*(x - 1))', '1/x - 1/(x - 1)', false]
];
domainCases.forEach(([e1, e2, ok], idx) => {
  const [rhs, cond] = e2.includes(', for ') ? e2.split(', for ') : [e2, undefined];
  add('8_Domain_Abs', `DOM-${idx + 1}`, `${e1} == ${e2} (${ok})`, async () => {
    const res = await verificationBridge.runDeterministicVerification({
      domain: 'algebra',
      claim_type: 'symbolic_equivalence',
      data: { expr1: e1, expr2: rhs, condition: cond }
    });
    assert.strictEqual(Boolean(res.verified), ok, `Domain ${e1} == ${e2}: ${JSON.stringify(res)}`);
  });
});

// ---------------------------------------------------------------------------
// 9. AMBIGUOUS, MALFORMED & COMPOUND REASONING (20 cases)
// ---------------------------------------------------------------------------
const ambigInputs = ['1/2x', 'a/bc', 'x/2y', 'sin 30', 'cos 45'];
ambigInputs.forEach((inp, idx) => {
  add('9_Ambiguous_Malformed', `AMB-${idx + 1}`, `Ambiguity detected on "${inp}"`, async () => {
    const res = studentWorkEvaluator.checkAmbiguousNotation(inp);
    assert(res && res.ambiguous === true, `Expected ambiguous=true for "${inp}", got ${JSON.stringify(res)}`);
  });
});

const explicitInputs = ['1/(2x)', '(1/2)x', 'a/(bc)', 'sin(30 deg)', 'cos(pi/4)'];
explicitInputs.forEach((inp, idx) => {
  add('9_Ambiguous_Malformed', `EXP-${idx + 1}`, `Explicit notation NOT flagged ambiguous: "${inp}"`, async () => {
    const res = studentWorkEvaluator.checkAmbiguousNotation(inp);
    assert(!res || res.ambiguous === false, `Did not expect ambiguity for "${inp}", got ${JSON.stringify(res)}`);
  });
});

const malformedCalc = ['x^2 + * / 3', 'sin((x)', '1 / / 2', 'x^', '+++'];
malformedCalc.forEach((inp, idx) => {
  add('9_Ambiguous_Malformed', `MAL-${idx + 1}`, `Malformed calculus fails closed: "${inp}"`, async () => {
    const res = await calculusEngine.differentiate(inp, { variable: 'x' });
    assert.strictEqual(res.status, 'FAILED', `Expected FAILED for malformed "${inp}"`);
  });
});

const compoundChains = [
  { steps: [{ expr: 'x^2 - 1 = 0', vars: ['x'], sols: ['-1', '1'] }], ok: true },
  { text: '$$\\frac{d}{dx}\\left(\\frac{x^{3}}{3}\\right) = x^2$$', prompt: 'Differentiate x^3/3', invalidCount: 0 },
  { text: '$$\\frac{d}{dx}\\left(\\frac{x^{3}}{3}\\right) = \\frac{x^{2}}{2}$$', prompt: 'Differentiate x^3/3', invalidCount: 1 },
  { text: '$$\\int 2x\\,dx = x^2 + C$$', prompt: 'Integrate 2x', invalidCount: 0 },
  { text: '$$\\int 2x\\,dx = x^3 + C$$', prompt: 'Integrate 2x', invalidCount: 1 }
];
compoundChains.forEach((cc, idx) => {
  add('9_Ambiguous_Malformed', `COMP-${idx + 1}`, `Compound pipeline case #${idx + 1}`, async () => {
    if (cc.text) {
      const res = await verificationBridge.verifyResponseClaims(cc.text, cc.prompt);
      assert.strictEqual(res.invalidClaims.length, cc.invalidCount, `Compound failed: ${JSON.stringify(res)}`);
    } else {
      const res = await verificationBridge.runDeterministicVerification({
        domain: 'algebra',
        claim_type: 'equation_solution',
        data: { equation: cc.steps[0].expr, variable: 'x', proposed_solutions: cc.steps[0].sols }
      });
      assert.strictEqual(Boolean(res.verified), cc.ok);
    }
  });
});

async function runCorpus() {
  console.log('======================================================================');
  console.log(`PYTHOS PHASE XXI: INDEPENDENT ADVERSARIAL CORPUS (${CASES.length} CASES)`);
  console.log('======================================================================\n');

  const byCat = {};
  let passed = 0;
  let failed = 0;
  const failures = [];
  const tStart = performance.now();

  for (const c of CASES) {
    if (!byCat[c.category]) byCat[c.category] = { total: 0, passed: 0, failed: 0 };
    byCat[c.category].total++;
    try {
      await c.run();
      byCat[c.category].passed++;
      passed++;
    } catch (err) {
      byCat[c.category].failed++;
      failed++;
      failures.push({ id: c.id, category: c.category, description: c.description, error: err.message });
      console.error(`  ✗ [FAIL] [${c.id}] ${c.description} -> ${err.message}`);
    }
  }

  const elapsedMs = Number((performance.now() - tStart).toFixed(2));
  console.log('\nCATEGORY BREAKDOWN:');
  for (const [cat, st] of Object.entries(byCat)) {
    const pct = ((st.passed / st.total) * 100).toFixed(1);
    console.log(`  • ${cat.padEnd(24)}: ${st.passed}/${st.total} (${pct}%)`);
  }
  console.log(`\nTOTAL: ${passed}/${CASES.length} (${((passed / CASES.length) * 100).toFixed(1)}%) — ${failed} FAILED in ${elapsedMs}ms`);

  verificationBridge.closeVerifierDaemon();
  calculusEngine.closeCalculusDaemon();

  if (failed > 0) {
    process.exit(1);
  }
}

runCorpus().catch(err => {
  console.error('Fatal corpus error:', err);
  try { verificationBridge.closeVerifierDaemon(); } catch (_) {}
  try { calculusEngine.closeCalculusDaemon(); } catch (_) {}
  process.exit(1);
});
