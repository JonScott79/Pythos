/**
 * campaign_v1873_50k/run_campaign.js
 *
 * Pythos v1.8.73 Full 50,000-Problem Validation & Recovery Stress Campaign
 *
 * Evaluates current v1.8.73 production modules across 10 STEM & Regression Domains
 * (5,000 problems per domain = 50,000 total problems) using fresh unseen PRNG seed
 * 1414213562 (floor(sqrt(2) * 10^9)), zero cloud token cost, and mandatory gate verification.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = __dirname;

const { constructSafeVerifiedResponse } = require(path.join(ROOT, 'server/safeResponseConstructor'));
const verificationBridge = require(path.join(ROOT, 'server/verificationBridge'));
const deterministicRouter = require(path.join(ROOT, 'server/deterministicRouter'));
const toolController = require(path.join(ROOT, 'server/toolController'));
const contextManager = require(path.join(ROOT, 'server/contextManager'));
const { buildToolHandoffContract } = require(path.join(ROOT, 'server/toolHandoffBuilder'));
const calculusEngine = require(path.join(ROOT, 'server/engines/calculusEngine'));
const { parseTrigExpression } = require(path.join(ROOT, 'server/trigExpressionParser'));
const { enforceVisualFidelity, hasAsciiTriangle } = require(path.join(ROOT, 'server/vizEngine/visualFidelity'));
const { detectFormattingAnomaly } = require(path.join(ROOT, 'server/mathFormatDetector'));
const { resolveWithholdingDecision } = require(path.join(ROOT, 'server/withholdingTaxonomy'));

const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const VERSION = PKG.version || '1.8.73';
let COMMIT_SHA = 'unknown';
try {
  COMMIT_SHA = execSync('git rev-parse --short HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
} catch (_) {}

const SEED = 1414213562; // floor(sqrt(2) * 10^9)
const IS_SAMPLE = process.argv.includes('--sample');
const PER_DOMAIN = IS_SAMPLE ? 5 : 5000;

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(SEED);
const randInt = (min, max) => Math.floor(rng() * (max - min + 1)) + min;
const randChoice = (arr) => arr[Math.floor(rng() * arr.length)];

function gcd(a, b) {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

// =============================================================================
// 10 DOMAIN GENERATORS (5,000 PROBLEMS PER DOMAIN = 50,000 TOTAL)
// =============================================================================

function genArithmetic(idx) {
  const op = randChoice(['+', '-', '*']);
  let a, b, ans;
  if (op === '+') {
    a = randInt(-999, 999);
    b = randInt(1, 999);
    ans = a + b;
  } else if (op === '-') {
    a = randInt(1, 999);
    b = randInt(1, 999);
    ans = a - b;
  } else {
    a = randInt(-45, 45);
    b = randInt(2, 45);
    ans = a * b;
  }
  return {
    id: `ARITH_${idx}`,
    domain: 'ARITHMETIC',
    mode: 'SOLVER',
    prompt: `Compute ${a} ${op} ${b}`,
    groundTruth: String(ans)
  };
}

function genFractions(idx) {
  const mode = idx % 2;
  if (mode === 0) {
    const pct = randChoice([10, 20, 25, 40, 50, 75, 80]);
    const base = randInt(2, 50) * 4;
    const ans = (pct / 100) * base;
    return {
      id: `FRAC_${idx}`,
      domain: 'FRACTIONS_DECIMALS',
      mode: 'SOLVER',
      prompt: `What is ${pct}% of ${base}?`,
      groundTruth: String(ans)
    };
  }
  const d = randChoice([2, 4, 5, 8, 10]);
  const a = randInt(1, d - 1);
  const b = randInt(1, d - 1);
  const num = a + b;
  const g = gcd(num, d);
  const sim = (num / g === d / g) ? '1' : `${num / g}/${d / g}`;
  return {
    id: `FRAC_${idx}`,
    domain: 'FRACTIONS_DECIMALS',
    mode: 'SOLVER',
    prompt: `Compute ${a}/${d} + ${b}/${d}`,
    groundTruth: sim
  };
}

function genLinear(idx) {
  const a = randInt(2, 14);
  const x = randInt(-20, 25);
  const b = randInt(-30, 30);
  const c = a * x + b;
  const bStr = b >= 0 ? `+ ${b}` : `- ${Math.abs(b)}`;
  return {
    id: `LIN_${idx}`,
    domain: 'LINEAR_EQUATIONS',
    mode: 'SOLVER',
    prompt: `Solve for x: ${a}x ${bStr} = ${c}`,
    groundTruth: String(x)
  };
}

function genSystems(idx) {
  const x = randInt(-10, 10);
  const y = randInt(-10, 10);
  const a1 = randInt(1, 5);
  const b1 = randInt(1, 5);
  const c1 = a1 * x + b1 * y;
  let a2 = randInt(1, 5);
  let b2 = -randInt(1, 5);
  if (a1 * b2 - a2 * b1 === 0) b2 -= 1;
  const c2 = a2 * x + b2 * y;
  return {
    id: `SYS_${idx}`,
    domain: 'SYSTEMS_OF_EQUATIONS',
    mode: 'SOLVER',
    prompt: `Solve the system of equations:\n${a1}x + ${b1}y = ${c1}\n${a2}x ${b2 >= 0 ? '+ ' + b2 : '- ' + Math.abs(b2)}y = ${c2}`,
    groundTruth: `x=${x},y=${y}`
  };
}

function genQuadratics(idx) {
  const r1 = randInt(-8, 8);
  const r2 = randInt(-8, 8);
  const b = -(r1 + r2);
  const c = r1 * r2;
  const bStr = b >= 0 ? `+ ${b}x` : `- ${Math.abs(b)}x`;
  const cStr = c >= 0 ? `+ ${c}` : `- ${Math.abs(c)}`;
  const eq = `x^2 ${bStr} ${cStr} = 0`;
  const sorted = [r1, r2].sort((p, q) => p - q);
  const uniqueRoots = r1 === r2 ? [r1] : sorted;
  return {
    id: `QUAD_${idx}`,
    domain: 'QUADRATICS_POLYNOMIALS',
    mode: 'CLAIM_VERIFY',
    prompt: `Solve ${eq}`,
    candidateText: `Factoring gives roots ${uniqueRoots.map(r => `x = ${r}`).join(' and ')}. Final answer: \\boxed{${uniqueRoots.join(', ')}}`,
    groundTruth: uniqueRoots.join(', ')
  };
}

function genGraphingAndTrig(idx) {
  const variant = idx % 4;
  if (variant === 0) {
    const k = randInt(2, 9);
    const expr = `${k}*sin(x) + ${randInt(1, 5)}`;
    return {
      id: `GRAPH_${idx}`,
      domain: 'GRAPHING_AND_TRIG',
      mode: 'GRAPH_DIRECT',
      prompt: `Graph f(x) = ${expr}`,
      groundTruth: expr
    };
  }
  if (variant === 1) {
    const c = randInt(2, 12);
    const p = `${randInt(2, 5)}sin^2(x) + csc(x) - ${c} = 0`;
    return {
      id: `GRAPH_${idx}`,
      domain: 'GRAPHING_AND_TRIG',
      mode: 'HANDOFF_TRIG',
      prompt: p,
      expectedToken: '(sin(x))^(2)',
      expectedRestriction: 'sin(x) != 0'
    };
  }
  if (variant === 2) {
    const k = randInt(1, 9);
    const eq = `(x+${k})(x-1) = 0`;
    return {
      id: `GRAPH_${idx}`,
      domain: 'GRAPHING_AND_TRIG',
      mode: 'GRAPH_REFERENTIAL',
      prompt: 'graph it for me please',
      messages: [
        { role: 'user', content: `Solve ${eq}` },
        { role: 'assistant', content: `Consider the factored form $${eq}$.` },
        { role: 'user', content: 'graph it for me please' }
      ],
      activeProblemState: { active: { activeExpression: eq, initialUserPrompt: eq } },
      expectedSubstr: `(x+${k})*(x-1)`
    };
  }
  return {
    id: `GRAPH_${idx}`,
    domain: 'GRAPHING_AND_TRIG',
    mode: 'GRAPH_CLARIFICATION',
    prompt: 'graph it for me please'
  };
}

function genGeometry(idx) {
  const triples = [
    [3, 4, 5], [5, 12, 13], [8, 15, 17],
    [7, 24, 25], [6, 8, 10], [9, 12, 15], [12, 16, 20]
  ];
  const [a, b, c] = randChoice(triples);
  const sub = idx % 4;
  if (sub === 0) {
    return {
      id: `GEOM_${idx}`,
      domain: 'GEOMETRY_TRIG',
      mode: 'SOLVER_VISUAL',
      prompt: `show me this visually: right triangle with legs ${a} and ${b}`,
      groundTruth: String(c)
    };
  }
  if (sub === 1) {
    return {
      id: `GEOM_${idx}`,
      domain: 'GEOMETRY_TRIG',
      mode: 'SOLVER',
      prompt: `A right triangle has legs of length ${a} and ${b}. Find the length of the hypotenuse.`,
      groundTruth: String(c)
    };
  }
  if (sub === 2) {
    return {
      id: `GEOM_${idx}`,
      domain: 'GEOMETRY_TRIG',
      mode: 'SOLVER',
      prompt: `A right triangle has legs ${a} and ${b} and hypotenuse ${c}. What is its perimeter?`,
      groundTruth: String(a + b + c)
    };
  }
  return {
    id: `GEOM_${idx}`,
    domain: 'GEOMETRY_TRIG',
    mode: 'SOLVER',
    prompt: `Find the area of a right triangle with base ${a} and height ${b}.`,
    groundTruth: String(0.5 * a * b)
  };
}

function genCalculus(idx) {
  const coeff = randInt(2, 9);
  const power = randInt(2, 5);
  const c = randInt(1, 20);
  const expectedCoeff = coeff * power;
  const newPow = power - 1;
  const expected = newPow === 1 ? `${expectedCoeff}*x` : `${expectedCoeff}*x^${newPow}`;
  return {
    id: `CALC_${idx}`,
    domain: 'CALCULUS',
    mode: 'CALCULUS_TOOL',
    expr: `${coeff}*x^${power} + ${c}`,
    prompt: `Find the derivative d/dx of ${coeff}x^${power} + ${c}`,
    groundTruth: expected
  };
}

function genUnitsAndHandoffs(idx) {
  if (idx % 3 === 0) {
    const val = randInt(5, 200);
    return {
      id: `UNIT_${idx}`,
      domain: 'UNITS_MATRICES_HANDOFFS',
      mode: 'HANDOFF_UNITS',
      prompt: `Convert ${val} km to m`,
      expectedUnit: 'm'
    };
  }
  if (idx % 3 === 1) {
    const a = randInt(1, 5), b = randInt(1, 5), c = randInt(1, 5), d = randInt(1, 5);
    return {
      id: `MAT_${idx}`,
      domain: 'UNITS_MATRICES_HANDOFFS',
      mode: 'HANDOFF_MATRIX',
      prompt: `Find determinant of [[${a},${b}],[${c},${d}]]`,
      expectedMatrix: `[[${a},${b}],[${c},${d}]]`
    };
  }
  const activeEq = `${randInt(2, 5)}sin^2(x) + csc(x) - ${randInt(4, 12)} = 0`;
  return {
    id: `STEP_${idx}`,
    domain: 'UNITS_MATRICES_HANDOFFS',
    mode: 'HANDOFF_WRONG_STEP',
    prompt: '2x^2+x-5=0?',
    activeEq,
    expectedToken: '(sin(x))^(2)'
  };
}

function genPhysicsAndSafety(idx) {
  if (idx % 2 === 0) {
    // 2,500 Kinematics/KE + forced flawed candidate recovery
    const m = randInt(2, 20);
    const v = randInt(2, 16);
    const ke = 0.5 * m * v * v;
    return {
      id: `PHYS_${idx}`,
      domain: 'PHYSICS_AND_SAFETY_GATE',
      mode: 'RECOVERY_STRESS',
      prompt: `Calculate the kinetic energy in Joules of a ${m} kg object moving at ${v} m/s.`,
      groundTruth: String(ke)
    };
  }
  // 2,500 Adversarial, inconsistent, or malformed problems -> MUST withhold cleanly
  const traps = [
    'Compute 15 / 0.',
    'Solve 0 * x = 7.',
    'What is the real square root of -49?',
    'Find the hypotenuse of a right triangle with legs 0 and 5.',
    'Solve x + 5 = x + 9.',
    "A car drives at 60 mph for 1 hour. What is the color of the driver's hat?",
    '2sin²⁽ˣ⁾⁺csc(x)-9=0'
  ];
  return {
    id: `ADV_${idx}`,
    domain: 'PHYSICS_AND_SAFETY_GATE',
    mode: 'ADVERSARIAL_WITHHOLD',
    prompt: traps[idx % traps.length],
    groundTruth: 'WITHHOLD'
  };
}

const DOMAINS_CONFIG = [
  { name: 'ARITHMETIC', label: 'Arithmetic', gen: genArithmetic },
  { name: 'FRACTIONS_DECIMALS', label: 'Fractions / Decimals / Percentages', gen: genFractions },
  { name: 'LINEAR_EQUATIONS', label: 'Linear Equations', gen: genLinear },
  { name: 'SYSTEMS_OF_EQUATIONS', label: 'Systems of Equations', gen: genSystems },
  { name: 'QUADRATICS_POLYNOMIALS', label: 'Quadratics & Polynomials', gen: genQuadratics },
  { name: 'GRAPHING_AND_TRIG', label: 'Functions, Graphing & Trig Handoffs', gen: genGraphingAndTrig },
  { name: 'GEOMETRY_TRIG', label: 'Geometry & Trigonometry', gen: genGeometry },
  { name: 'CALCULUS', label: 'Calculus (Derivatives & Integrals)', gen: genCalculus },
  { name: 'UNITS_MATRICES_HANDOFFS', label: 'Units, Matrices & Contextual Handoffs', gen: genUnitsAndHandoffs },
  { name: 'PHYSICS_AND_SAFETY_GATE', label: 'Physics & Safety / Recovery Gate', gen: genPhysicsAndSafety }
];

function matchAnswer(delivered, expected) {
  if (!delivered) return false;
  let d = String(delivered).trim().toLowerCase();
  const boxed = d.match(/\\boxed\{([^{}]+)\}/);
  if (boxed) d = boxed[1].trim();
  if (!d.includes(',')) {
    d = d.replace(/^(?:ans|c|v|x|area|perimeter)\s*=\s*/, '').trim();
  }
  d = d.replace(/\s*(?:j|joules|n|newtons|m\/s|m|s|seconds)\b/g, '').trim();
  const g = String(expected).trim().toLowerCase();

  if (d.replace(/\s+/g, '') === g.replace(/\s+/g, '')) return true;

  const parseVars = (str) => {
    const out = {};
    for (const m of str.matchAll(/([a-zA-Z])\s*=\s*([-\d.]+)/g)) {
      out[m[1].toLowerCase()] = parseFloat(m[2]);
    }
    return out;
  };
  const gV = parseVars(g);
  const dV = parseVars(d);
  if (Object.keys(gV).length > 0 && Object.keys(gV).length === Object.keys(dV).length) {
    if (Object.keys(gV).every(k => dV[k] !== undefined && Math.abs(gV[k] - dV[k]) < 1e-4)) return true;
  }

  const toNum = (s) => {
    if (s.includes('/')) {
      const [num, den] = s.split('/');
      const n = parseFloat(num), dVal = parseFloat(den);
      if (Number.isFinite(n) && Number.isFinite(dVal) && dVal !== 0) return n / dVal;
    }
    return parseFloat(s);
  };
  const nD = toNum(d);
  const nG = toNum(g);
  if (Number.isFinite(nD) && Number.isFinite(nG) && Math.abs(nD - nG) < 1e-4) return true;
  if (d.includes(`=${g}`) || d.includes(`= ${g}`)) return true;
  return false;
}

async function runCampaign() {
  const problems = [];
  for (const d of DOMAINS_CONFIG) {
    for (let i = 1; i <= PER_DOMAIN; i++) {
      problems.push(d.gen(i));
    }
  }

  console.log('======================================================================');
  console.log(`🛡️  PYTHOS v${VERSION} — 50K VALIDATION & REGRESSION BENCHMARK (${COMMIT_SHA})`);
  console.log(`Seed: ${SEED} | Problems: ${problems.length.toLocaleString()} across ${DOMAINS_CONFIG.length} domains`);
  console.log('======================================================================\n');

  const start = Date.now();
  let tested = 0;
  let verifiedCorrect = 0;
  let safelyWithheld = 0;
  let incorrectDelivered = 0;
  let catches = 0;
  let escapes = 0;
  let peakHeapMb = 0;
  const domainStats = {};
  const checkpoints = [];
  const sampleErrors = [];

  for (const d of DOMAINS_CONFIG) {
    domainStats[d.name] = { label: d.label, tested: 0, passed: 0, withheld: 0, wrong: 0, catches: 0, escapes: 0 };
  }

  for (let i = 0; i < problems.length; i++) {
    const p = problems[i];
    const st = domainStats[p.domain];
    tested++;
    st.tested++;

    const heapMb = Math.round((process.memoryUsage().heapUsed / (1024 * 1024)) * 10) / 10;
    if (heapMb > peakHeapMb) peakHeapMb = heapMb;

    let ok = false;
    let isWithheldCase = false;
    let isEscape = false;
    let isCatch = false;

    try {
      if (p.mode === 'SOLVER' || p.mode === 'SOLVER_VISUAL') {
        const msgs = [{ role: 'user', content: p.prompt }];
        const det = deterministicRouter.analyzeDeterministicIntent(p.prompt, msgs);
        const resp = det ? deterministicRouter.buildDeterministicResponse(det) : null;
        if (resp) {
          const finalResp = p.mode === 'SOLVER_VISUAL'
            ? enforceVisualFidelity(resp, p.prompt, msgs, null)
            : resp;
          const ans = verificationBridge.extractCandidateAnswer(finalResp) ||
            (det.solution !== undefined ? String(det.solution) : (det.result !== undefined ? String(det.result) : null));
          const v = await verificationBridge.verifyResponseClaims(finalResp, p.prompt);
          const gate = verificationBridge.evaluateCandidateDelivery({
            candidateAnswer: ans,
            verifications: v.verificationResults,
            contradictions: v.internalContradictions,
            claims: v.claims,
            prompt: p.prompt
          });
          const delivered = gate.delivered && (!v.invalidClaims || v.invalidClaims.length === 0);
          const visualClean = p.mode !== 'SOLVER_VISUAL' || (finalResp.includes('[GEOMETRY:') && !hasAsciiTriangle(finalResp));
          if (delivered && matchAnswer(gate.answer || ans, p.groundTruth) && visualClean) {
            ok = true;
          } else {
            isEscape = true;
          }
        } else {
          isEscape = true;
        }
      } else if (p.mode === 'CLAIM_VERIFY') {
        const v = await verificationBridge.verifyResponseClaims(p.candidateText, p.prompt);
        const gate = verificationBridge.evaluateCandidateDelivery({
          candidateAnswer: p.groundTruth,
          verifications: v.verificationResults,
          contradictions: v.internalContradictions,
          claims: v.claims,
          prompt: p.prompt
        });
        if (gate.delivered && (!v.invalidClaims || v.invalidClaims.length === 0)) {
          ok = true;
        } else {
          isEscape = true;
        }
      } else if (p.mode === 'GRAPH_DIRECT') {
        const det = deterministicRouter.analyzeDeterministicIntent(p.prompt, [{ role: 'user', content: p.prompt }]);
        const contract = buildToolHandoffContract({
          userPrompt: p.prompt,
          classification: { problemDomain: 'FUNCTIONS', problemSubtype: 'FUNCTION_GRAPH' },
          preflightToolResult: det && det.type === 'GRAPH_PLOT'
            ? { tool: 'render_function_graph', parameters: { expression: det.expression } }
            : null,
          verificationState: 'VERIFIED'
        });
        if (det && det.type === 'GRAPH_PLOT' && contract && contract.graphExpression && contract.graphExpression.includes('sin(x)')) {
          ok = true;
        } else {
          isEscape = true;
        }
      } else if (p.mode === 'HANDOFF_TRIG') {
        const contract = buildToolHandoffContract({
          userPrompt: `Solve ${p.prompt}`,
          classification: { problemDomain: 'TRIGONOMETRY', problemSubtype: 'TRIG_EQUATION' },
          verificationState: 'VERIFIED'
        });
        if (
          contract &&
          contract.graphExpression &&
          contract.graphExpression.includes(p.expectedToken) &&
          contract.domainRestrictions.some(r => r.includes(p.expectedRestriction))
        ) {
          ok = true;
        } else {
          isEscape = true;
        }
      } else if (p.mode === 'GRAPH_REFERENTIAL') {
        const det = deterministicRouter.analyzeDeterministicIntent(p.prompt, p.messages);
        const contract = buildToolHandoffContract({
          userPrompt: p.prompt,
          classification: { problemDomain: 'ALGEBRA', problemSubtype: 'QUADRATIC_EQUATION' },
          preflightToolResult: det && det.type === 'GRAPH_PLOT'
            ? { tool: 'render_function_graph', parameters: { expression: det.expression } }
            : null,
          activeProblemState: p.activeProblemState,
          studentIntent: { intent: 'GRAPH_REQUEST' },
          verificationState: 'VERIFIED'
        });
        if (
          det && det.type === 'GRAPH_PLOT' &&
          contract && contract.graphExpression &&
          contract.graphExpression.includes(p.expectedSubstr) &&
          contract.graphExpression !== 'it'
        ) {
          ok = true;
        } else {
          isEscape = true;
        }
      } else if (p.mode === 'GRAPH_CLARIFICATION') {
        const det = deterministicRouter.analyzeDeterministicIntent(p.prompt, []);
        const text = det ? deterministicRouter.buildDeterministicResponse(det) : '';
        const visual = enforceVisualFidelity(text, p.prompt, [], null);
        const contract = buildToolHandoffContract({
          userPrompt: p.prompt,
          classification: { problemDomain: 'ALGEBRA', problemSubtype: 'GENERAL_REASONING' },
          studentIntent: { intent: 'GRAPH_REQUEST' },
          verificationState: 'VERIFIED'
        });
        if (
          det && det.type === 'GRAPH_CLARIFICATION' &&
          !visual.includes('[GRAPH:') &&
          (!contract || !contract.graphExpression)
        ) {
          ok = true;
        } else {
          isEscape = true;
        }
      } else if (p.mode === 'CALCULUS_TOOL') {
        const useToolWrapper = IS_SAMPLE || (i % 25 === 0);
        let execRes;
        if (useToolWrapper) {
          execRes = await toolController.executeTool(
            toolController.TOOL_ALLOWLIST.SOLVE_CALCULUS,
            { operation: 'DIFFERENTIATION', expression: p.expr, variable: 'x' },
            { messages: [{ role: 'user', content: p.prompt }] }
          );
        } else {
          const calcRes = await calculusEngine.differentiate(p.expr, { variable: 'x', timeoutMs: 5000 });
          execRes = calcRes && calcRes.status !== 'FAILED'
            ? {
                success: true,
                tool: toolController.TOOL_ALLOWLIST.SOLVE_CALCULUS,
                operation: 'DIFFERENTIATION',
                expression: p.expr,
                result: calcRes.exactResult,
                formattedResult: calcRes.formattedResult,
                derivationSteps: calcRes.derivationSteps || [],
                status: calcRes.status
              }
            : { success: false, tool: toolController.TOOL_ALLOWLIST.SOLVE_CALCULUS };
        }
        const recovered = constructSafeVerifiedResponse({
          userPrompt: p.prompt,
          preflightToolResult: execRes,
          messages: [{ role: 'user', content: p.prompt }]
        });
        const ans = recovered ? verificationBridge.extractCandidateAnswer(recovered.content) : null;
        const normAns = ans ? ans.replace(/\*\*/g, '^').replace(/\s+/g, '') : '';
        if (execRes && execRes.success && normAns === p.groundTruth.replace(/\s+/g, '')) {
          ok = true;
        } else {
          isEscape = true;
        }
      } else if (p.mode === 'HANDOFF_UNITS') {
        const contract = buildToolHandoffContract({
          userPrompt: p.prompt,
          classification: { problemDomain: 'PHYSICS', problemSubtype: 'UNIT_CONVERSION' },
          verificationState: 'VERIFIED'
        });
        if (contract && contract.tools.some(t => t.id === 'units' && t.params.targetUnit === p.expectedUnit)) {
          ok = true;
        } else {
          isEscape = true;
        }
      } else if (p.mode === 'HANDOFF_MATRIX') {
        const contract = buildToolHandoffContract({
          userPrompt: p.prompt,
          classification: { problemDomain: 'LINEAR_ALGEBRA', problemSubtype: 'MATRIX' },
          verificationState: 'VERIFIED'
        });
        if (contract && contract.tools.some(t => t.id === 'matrix' && t.params.matrixA === p.expectedMatrix)) {
          ok = true;
        } else {
          isEscape = true;
        }
      } else if (p.mode === 'HANDOFF_WRONG_STEP') {
        const contract = buildToolHandoffContract({
          userPrompt: p.prompt,
          classification: { problemDomain: 'TRIGONOMETRY', problemSubtype: 'TRIG_EQUATION' },
          activeProblemState: { active: { activeExpression: p.activeEq, initialUserPrompt: p.activeEq } },
          studentIntent: { intent: 'PROPOSED_STEP' },
          studentEvaluation: { status: 'STEP_VERIFIED_INCORRECT' },
          verificationState: 'PARTIALLY_VERIFIED'
        });
        if (
          contract &&
          contract.graphExpression &&
          contract.graphExpression.includes(p.expectedToken) &&
          !contract.graphExpression.includes('2x^2+x-5')
        ) {
          ok = true;
        } else {
          isEscape = true;
        }
      } else if (p.mode === 'RECOVERY_STRESS') {
        // Inject flawed candidate "1 + 1 = 999999" and ensure gate rejects + recovers verified truth
        const msgs = [{ role: 'user', content: p.prompt }];
        const flawed = `Step: 1 + 1 = 999999. \\boxed{999999}`;
        const vBad = await verificationBridge.verifyResponseClaims(flawed, p.prompt);
        const badGate = verificationBridge.evaluateCandidateDelivery({
          candidateAnswer: '999999',
          verifications: vBad.verificationResults,
          contradictions: vBad.internalContradictions,
          claims: vBad.claims,
          prompt: p.prompt
        });
        isCatch = !badGate.delivered;
        const toolSel = toolController.selectAppropriateTool(null, p.prompt, msgs, null);
        const toolRes = toolSel && toolSel.tool
          ? await toolController.executeTool(toolSel.tool, toolSel.arguments || {}, { messages: msgs })
          : null;
        const recovered = constructSafeVerifiedResponse({
          userPrompt: p.prompt,
          preflightToolResult: toolRes,
          messages: msgs,
          verificationResults: vBad.verificationResults
        });
        const recAns = recovered ? verificationBridge.extractCandidateAnswer(recovered.content) : null;
        if (!badGate.delivered && recAns && matchAnswer(recAns, p.groundTruth)) {
          ok = true;
        } else {
          isEscape = true;
        }
      } else if (p.mode === 'ADVERSARIAL_WITHHOLD') {
        const msgs = [{ role: 'user', content: p.prompt }];
        const mal = detectFormattingAnomaly(p.prompt);
        const det = deterministicRouter.analyzeDeterministicIntent(p.prompt, msgs);
        const resp = det ? deterministicRouter.buildDeterministicResponse(det) : null;
        let deliveredUnsafe = false;
        if (!mal.isWeird && resp) {
          const ans = verificationBridge.extractCandidateAnswer(resp);
          const v = await verificationBridge.verifyResponseClaims(resp, p.prompt);
          const gate = verificationBridge.evaluateCandidateDelivery({
            candidateAnswer: ans,
            verifications: v.verificationResults,
            contradictions: v.internalContradictions,
            claims: v.claims,
            prompt: p.prompt
          });
          if (gate.delivered && ans && !/impossib|undefined|withheld/i.test(String(ans))) {
            deliveredUnsafe = true;
          }
        }
        const withholdDecision = resolveWithholdingDecision({
          lastUserText: p.prompt,
          detectFormattingAnomaly
        });
        if (!deliveredUnsafe && withholdDecision && withholdDecision.reason) {
          ok = true;
          isWithheldCase = true;
          isCatch = true;
        } else {
          isEscape = true;
        }
      }
    } catch (err) {
      isEscape = true;
      if (sampleErrors.length < 10) {
        sampleErrors.push({ id: p.id, domain: p.domain, error: err.message });
      }
    }

    if (ok) {
      verifiedCorrect++;
      st.passed++;
      if (isWithheldCase) {
        safelyWithheld++;
        st.withheld++;
      }
      if (isCatch) {
        catches++;
        st.catches++;
      }
    } else if (isEscape) {
      incorrectDelivered++;
      escapes++;
      st.wrong++;
      st.escapes++;
      if (sampleErrors.length < 15) {
        sampleErrors.push({ id: p.id, domain: p.domain, mode: p.mode, prompt: p.prompt });
      }
    }

    if ((i + 1) % 5000 === 0 || (IS_SAMPLE && i === problems.length - 1)) {
      const elapsedSec = ((Date.now() - start) / 1000).toFixed(2);
      checkpoints.push({ completed: i + 1, verifiedCorrect, safelyWithheld, incorrectDelivered, catches, escapes, elapsedSec, peakHeapMb });
      console.log(`CHECKPOINT [${(i + 1).toLocaleString()} / ${problems.length.toLocaleString()}] Verified: ${verifiedCorrect} | Safely Withheld Traps: ${safelyWithheld} | Catches: ${catches} | Incorrect: ${incorrectDelivered} | Escapes: ${escapes} | ${elapsedSec}s`);
    }
  }

  const runtimeSeconds = Number(((Date.now() - start) / 1000).toFixed(2));
  const summary = {
    campaign: 'PYTHOS_v1873_50K',
    version: VERSION,
    commit: COMMIT_SHA,
    seed: SEED,
    date: new Date().toISOString().slice(0, 10),
    runtimeSeconds,
    peakHeapMb,
    totals: {
      tested,
      passedAllChecks: verifiedCorrect,
      safelyWithheldAdversarial: safelyWithheld,
      catches,
      incorrectDelivered,
      escapes,
      passRatePercent: Number(((verifiedCorrect / tested) * 100).toFixed(2)),
      deliveredErrorRatePercent: Number(((incorrectDelivered / tested) * 100).toFixed(4))
    },
    domains: domainStats,
    checkpoints,
    sampleErrors
  };

  if (!IS_SAMPLE) {
    fs.writeFileSync(path.join(OUTPUT_DIR, 'campaign_summary.json'), JSON.stringify(summary, null, 2));
    fs.writeFileSync(path.join(OUTPUT_DIR, 'checkpoints.jsonl'), checkpoints.map(c => JSON.stringify(c)).join('\n'));
    fs.writeFileSync(
      path.join(OUTPUT_DIR, 'campaign_config.json'),
      JSON.stringify({ campaign: summary.campaign, version: VERSION, commit: COMMIT_SHA, seed: SEED, totalProblems: tested, domains: DOMAINS_CONFIG.map(d => d.name) }, null, 2)
    );
  }

  console.log('\n======================================================================');
  console.log(`COMPLETED ${tested.toLocaleString()} PROBLEMS IN ${runtimeSeconds}s (Peak Heap: ${peakHeapMb} MB)`);
  console.log(`Verified Pass Rate: ${verifiedCorrect.toLocaleString()} / ${tested.toLocaleString()} (${summary.totals.passRatePercent}%)`);
  console.log(`Adversarial Safely Withheld: ${safelyWithheld.toLocaleString()} | Verification Catches: ${catches.toLocaleString()} | Incorrect / Escapes: ${incorrectDelivered} / ${escapes}`);
  for (const [k, s] of Object.entries(domainStats)) {
    console.log(`  - ${s.label.padEnd(38)} ${s.passed}/${s.tested} (withheld=${s.withheld}, catches=${s.catches}, escapes=${s.escapes})`);
  }
  if (sampleErrors.length > 0) {
    console.log('Sample failures:', JSON.stringify(sampleErrors.slice(0, 8), null, 2));
  }
  console.log('======================================================================');

  if (typeof verificationBridge.closeVerifierDaemon === 'function') {
    await verificationBridge.closeVerifierDaemon();
  }
  try {
    const { closeCalculusDaemon } = require(path.join(ROOT, 'server/engines/calculusEngine'));
    if (typeof closeCalculusDaemon === 'function') await closeCalculusDaemon();
  } catch (_) {}
  if (incorrectDelivered > 0 || escapes > 0) {
    process.exitCode = 1;
  }
}

runCampaign().catch(err => {
  console.error('Campaign error:', err);
  process.exit(1);
});
