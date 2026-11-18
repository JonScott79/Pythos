/**
 * test-forensic-diagnostic-campaign.js
 *
 * PYTHOS — PHASE IX & PHASE XVI COMPREHENSIVE FORENSIC DIAGNOSTIC CAMPAIGN
 *
 * Evaluates Pythos across 10 mandatory mathematical, physical, parser, routing,
 * verification, multi-turn, pedagogical, and adversarial categories.
 *
 * Separately instruments and measures accuracy across:
 *   1. Interpretation & Classification Accuracy
 *   2. Normalization & Parser Fidelity
 *   3. Routing & Context Orchestration Accuracy
 *   4. Engine Calculation Accuracy
 *   5. Symbolic & Numerical Verification Gate Accuracy
 *   6. End-to-End Pipeline Accuracy & Latency
 */

const assert = require('assert');
const path = require('path');

const deterministicRouter = require('./server/deterministicRouter');
const verificationBridge = require('./server/verificationBridge');
const mathjsVerifier = require('./server/mathjsVerifier');
const specialistAssist = require('./server/specialistAssist');
const calculusEngine = require('./server/engines/calculusEngine');
const geometryEngine = require('./server/engines/geometryEngine');
const problemClassifier = require('./server/problemClassifier');
const studentIntentClassifier = require('./server/studentIntentClassifier');
const studentWorkEvaluator = require('./server/studentWorkEvaluator');
const contextManager = require('./server/contextManager');
const inputAmbiguityDetector = require('./server/inputAmbiguityDetector');
const ocrMathNormalizer = require('./server/ocrMathNormalizer');
const trigExpressionParser = require('./server/trigExpressionParser');
const visualFidelity = require('./server/vizEngine/visualFidelity');
const toolController = require('./server/toolController');
const mathInputEngine = require('./js/mathInputEngine');

const STAGE_STATS = {
  interpretation: { total: 0, passed: 0 },
  parsing_normalization: { total: 0, passed: 0 },
  routing_context: { total: 0, passed: 0 },
  calculation: { total: 0, passed: 0 },
  verification: { total: 0, passed: 0 }
};

const CATEGORY_STATS = {};
const RESULTS = [];

async function runCase(category, stage, id, description, fn) {
  if (!CATEGORY_STATS[category]) {
    CATEGORY_STATS[category] = { total: 0, passed: 0, failed: 0, latencies: [] };
  }
  CATEGORY_STATS[category].total++;
  if (STAGE_STATS[stage]) {
    STAGE_STATS[stage].total++;
  }

  const t0 = performance.now();
  let passed = false;
  let errorMsg = null;
  let detail = null;
  try {
    detail = await fn();
    passed = true;
    CATEGORY_STATS[category].passed++;
    if (STAGE_STATS[stage]) {
      STAGE_STATS[stage].passed++;
    }
  } catch (err) {
    passed = false;
    CATEGORY_STATS[category].failed++;
    errorMsg = err.message || String(err);
  }
  const latencyMs = Number((performance.now() - t0).toFixed(2));
  CATEGORY_STATS[category].latencies.push(latencyMs);

  RESULTS.push({
    id,
    category,
    stage,
    description,
    passed,
    latencyMs,
    detail: detail || null,
    error: errorMsg
  });

  const badge = passed ? '✅ [PASS]' : '❌ [FAIL]';
  console.log(`${badge} [${id}] (${category} | ${stage} | ${latencyMs}ms) ${description}${errorMsg ? `\n   ↳ Error: ${errorMsg}` : ''}`);
}

async function runCampaign() {
  console.log('================================================================================');
  console.log('🔬 PYTHOS COMPREHENSIVE FORENSIC DIAGNOSTIC CAMPAIGN (PHASES II–IX)');
  console.log('================================================================================\n');

  // ===========================================================================
  // CATEGORY 1: BASIC MATHEMATICS (Arithmetic, Fractions, Percentages, Precedence)
  // ===========================================================================
  await runCase('1_Basic_Math', 'calculation', 'BM-01', 'Exact fraction addition 1/3 + 1/6 = 1/2 (0.5)', () => {
    const intent = deterministicRouter.analyzeDeterministicIntent('Compute 1/3 + 1/6', []);
    assert(intent && intent.type === 'ARITHMETIC', 'Must route to ARITHMETIC');
    assert(intent.formatted.includes('1/2') || intent.formatted.includes('0.5'), `Unexpected formatted: ${intent.formatted}`);
  });

  await runCase('1_Basic_Math', 'routing_context', 'BM-02', 'Natural-language percentage query "What is 72/120 as a percentage?" routes deterministically to 60%', () => {
    const intent = deterministicRouter.analyzeDeterministicIntent('What is 72/120 as a percentage?', []);
    assert(intent && intent.type === 'ARITHMETIC', 'Expected deterministic ARITHMETIC intent for 72/120 as a percentage');
    assert.strictEqual(intent.formatted, '60%');
  });

  await runCase('1_Basic_Math', 'routing_context', 'BM-03', 'Comma-separated batch arithmetic "Calculate these: 3/7, 5/8, 11/20." routes to BATCH_ARITHMETIC', () => {
    const intent = deterministicRouter.analyzeDeterministicIntent('Calculate these: 3/7, 5/8, 11/20.', []);
    assert(intent && intent.type === 'BATCH_ARITHMETIC', `Expected BATCH_ARITHMETIC, got ${intent?.type}`);
    assert.strictEqual(intent.items.length, 3);
  });

  await runCase('1_Basic_Math', 'routing_context', 'BM-04', 'Conjunction batch percentage query "What are 17/20 and 13/25 as percentages?" routes to 85% and 52%', () => {
    const intent = deterministicRouter.analyzeDeterministicIntent('What are 17/20 and 13/25 as percentages?', []);
    assert(intent && intent.type === 'BATCH_ARITHMETIC', `Expected BATCH_ARITHMETIC, got ${intent?.type}`);
    assert.strictEqual(intent.items[0].percentage, '85%');
    assert.strictEqual(intent.items[1].percentage, '52%');
  });

  await runCase('1_Basic_Math', 'calculation', 'BM-05', 'Percentage of value "Calculate 20% of 320" resolves to 64', () => {
    const intent = deterministicRouter.analyzeDeterministicIntent('Calculate 20% of 320', []);
    assert(intent && intent.type === 'PERCENTAGE_OF', 'Must match PERCENTAGE_OF');
    assert.strictEqual(intent.result, 64);
  });

  // ===========================================================================
  // CATEGORY 2: INTERMEDIATE MATHEMATICS (Algebra, Rationals, Radicals, Systems)
  // ===========================================================================
  await runCase('2_Intermediate_Math', 'calculation', 'IM-01', 'Single-variable linear equation "Solve 3x + 7 = 22" -> x = 5', () => {
    const intent = deterministicRouter.analyzeDeterministicIntent('Solve 3x + 7 = 22', []);
    assert(intent && intent.type === 'ALGEBRA_LINEAR_SOLVE', 'Expected ALGEBRA_LINEAR_SOLVE');
    assert.strictEqual(Number(intent.solution), 5);
  });

  await runCase('2_Intermediate_Math', 'verification', 'IM-02', 'Extraneous root detection on radical equation sqrt(x + 3) = x - 3 (x=6 valid, x=1 extraneous)', async () => {
    const res = await verificationBridge.runPythonVerifierBatch([{
      domain: 'algebra',
      claim_type: 'equation_solution',
      data: { equation: 'sqrt(x + 3) = x - 3', variable: 'x', proposed_solutions: ['6', '1'] }
    }]);
    assert.strictEqual(res[0].verified, false);
    assert.strictEqual(res[0].status, 'EXTRANEOUS_ROOT');
  });

  await runCase('2_Intermediate_Math', 'verification', 'IM-03', 'Symbolic equivalence with caret exponent "x^2 - 16" == "(x - 4)*(x + 4)" verifies cleanly', async () => {
    const res = await verificationBridge.runPythonVerifierBatch([{
      domain: 'algebra',
      claim_type: 'symbolic_equivalence',
      data: { expr1: 'x^2 - 16', expr2: '(x - 4)*(x + 4)' }
    }]);
    assert.strictEqual(res[0].verified, true, `Expected verified=true for x^2 - 16 == (x-4)*(x+4), got status=${res[0].status}`);
    assert.strictEqual(res[0].status, 'VERIFIED');
  });

  await runCase('2_Intermediate_Math', 'verification', 'IM-04', 'Algebra equation verifier handles caret exponent "x^2 - 5*x + 6 = 0" with roots [2, 3]', async () => {
    const res = await verificationBridge.runPythonVerifierBatch([{
      domain: 'algebra',
      claim_type: 'equation_solution',
      data: { equation: 'x^2 - 5*x + 6 = 0', variable: 'x', proposed_solutions: ['2', '3'] }
    }]);
    assert.strictEqual(res[0].verified, true, `Expected verified=true for x^2 - 5*x + 6 = 0, got ${res[0].status}`);
  });

  await runCase('2_Intermediate_Math', 'verification', 'IM-05', 'System of equations verification (2x + y = 7, x - y = 2 -> x=3, y=1)', () => {
    const v = mathjsVerifier.verify({
      domain: 'algebra',
      claim_type: 'system_solution',
      data: {
        equations: ['2*x + y = 7', 'x - y = 2'],
        solution: { x: 3, y: 1 }
      }
    });
    assert.strictEqual(v.verified, true);
    assert.strictEqual(v.status, 'VERIFIED');
  });

  // ===========================================================================
  // CATEGORY 3: ADVANCED MATHEMATICS (Calculus Limits, Derivatives, Integrals, Optimization)
  // ===========================================================================
  await runCase('3_Advanced_Math', 'interpretation', 'AM-01', 'Specialist extractor strips "with respect to t" and sets variable="t" on "Differentiate 3t^2 + 4t with respect to t"', () => {
    const task = specialistAssist.extractSpecialistTask('Differentiate 3t^2 + 4t with respect to t');
    assert(task, 'Expected calculus specialist task');
    assert.strictEqual(task.operation, 'DIFFERENTIATION');
    assert.strictEqual(task.variable, 't');
    assert(!/with\s+respect\s+to/i.test(task.expression), `Expression still contains trailing prose: "${task.expression}"`);
  });

  await runCase('3_Advanced_Math', 'interpretation', 'AM-02', 'Specialist extractor does NOT false-positive on conceptual "Differentiate between speed and velocity"', () => {
    const task = specialistAssist.extractSpecialistTask('Differentiate between speed and velocity');
    assert.strictEqual(task, null, `Should return null for "Differentiate between...", got ${JSON.stringify(task)}`);
  });

  await runCase('3_Advanced_Math', 'calculation', 'AM-03', 'Calculus worker differentiates nested LaTeX fraction \\frac{\\sqrt{x+1}}{x}', async () => {
    const res = await calculusEngine.differentiate('\\frac{\\sqrt{x+1}}{x}', { variable: 'x' });
    assert.strictEqual(res.status, 'VERIFIED', `Expected VERIFIED, got ${res.status} (${res.error || ''})`);
  });

  await runCase('3_Advanced_Math', 'verification', 'AM-04', 'Calculus derivative verifier handles ln(x), e^(2x), and LaTeX \\frac{1}{x}', async () => {
    const res = await verificationBridge.runPythonVerifierBatch([
      {
        domain: 'calculus',
        claim_type: 'derivative',
        data: { function: 'ln(x)', variable: 'x', proposed_derivative: '\\frac{1}{x}' }
      },
      {
        domain: 'calculus',
        claim_type: 'derivative',
        data: { function: 'e^(2x)', variable: 'x', proposed_derivative: '2*e^(2x)' }
      }
    ]);
    assert.strictEqual(res[0].verified, true, `ln(x) derivative failed: ${JSON.stringify(res[0])}`);
    assert.strictEqual(res[1].verified, true, `e^(2x) derivative failed: ${JSON.stringify(res[1])}`);
  });

  await runCase('3_Advanced_Math', 'verification', 'AM-05', 'Calculus antiderivative verifier handles caret exponent "3x^2" -> "x^3 + C"', async () => {
    const res = await verificationBridge.runPythonVerifierBatch([{
      domain: 'calculus',
      claim_type: 'antiderivative',
      data: { integrand: '3x^2', variable: 'x', proposed_antiderivative: 'x^3 + C' }
    }]);
    assert.strictEqual(res[0].verified, true, `Expected antiderivative 3x^2 -> x^3 + C to verify, got ${JSON.stringify(res[0])}`);
  });

  await runCase('3_Advanced_Math', 'calculation', 'AM-06', 'Calculus limit evaluation lim_{x->0} sin(x)/x = 1', async () => {
    const res = await calculusEngine.limit('sin(x)/x', { variable: 'x', target: '0' });
    assert.strictEqual(res.status, 'VERIFIED');
    assert.strictEqual(res.exactResult, '1');
  });

  await runCase('3_Advanced_Math', 'calculation', 'AM-07', 'Calculus optimization of x^3 - 3x on [-2, 2] finds critical points x=-1, x=1', async () => {
    const res = await calculusEngine.optimize('x^3 - 3*x', { variable: 'x', domainStart: -2, domainEnd: 2 });
    assert.strictEqual(res.status, 'VERIFIED');
    assert.strictEqual(res.criticalPoints.length, 2);
  });

  // ===========================================================================
  // CATEGORY 4: MULTI-STEP WORD PROBLEMS (Bayes, Kinematics, Rates, Hybrid)
  // ===========================================================================
  await runCase('4_Word_Problems', 'routing_context', 'WP-01', 'Two-class Bayes word problem extracts exact posterior preflight facts', () => {
    const prompt = 'Machine A produces 70% of bulbs with a 2% defect rate. Machine B produces 30% of bulbs with a 6% defect rate. Given a bulb is defective, what is the probability it came from Machine B?';
    const facts = deterministicRouter.extractPreflightDeterministicFacts(prompt, []);
    assert(facts.length > 0 && facts[0].type === 'BAYES_TWO_CLASS', 'Expected BAYES_TWO_CLASS preflight fact');
    assert(Math.abs(facts[0].postB - (0.018 / 0.032)) < 1e-6);
  });

  await runCase('4_Word_Problems', 'routing_context', 'WP-02', 'Hybrid calculation + conceptual explanation routes to LLM with preflight facts', () => {
    const prompt = 'Calculate 93/100 and explain what the percentage means.';
    const intent = deterministicRouter.analyzeDeterministicIntent(prompt, []);
    assert.strictEqual(intent, null, 'Hybrid query must not short-circuit explanation');
    const facts = deterministicRouter.extractPreflightDeterministicFacts(prompt, []);
    assert(facts.length > 0, 'Must extract preflight fact 93/100 = 0.93');
  });

  await runCase('4_Word_Problems', 'verification', 'WP-03', 'Physics kinematics free-fall t = sqrt(2*20/9.8) ≈ 2.02s verifies accurately', async () => {
    const res = await verificationBridge.runPythonVerifierBatch([{
      domain: 'physics',
      claim_type: 'free_fall',
      data: { height: 20, g: 9.8, proposed_time: 2.02 }
    }]);
    assert.strictEqual(res[0].verified, true);
  });

  // ===========================================================================
  // CATEGORY 5: AMBIGUOUS EXPRESSIONS (1/2x, sin 30, Diagram Ambiguity)
  // ===========================================================================
  await runCase('5_Ambiguous_Expressions', 'interpretation', 'AE-01', 'Student work evaluator flags "1/2x" as AMBIGUOUS_NOTATION instead of guessing', () => {
    const amb = studentWorkEvaluator.checkAmbiguousNotation('1/2x');
    assert(amb && amb.ambiguous === true, '1/2x must be flagged as ambiguous');
  });

  await runCase('5_Ambiguous_Expressions', 'interpretation', 'AE-02', 'Student work evaluator flags unitless "sin 30" as AMBIGUOUS_NOTATION', () => {
    const amb = studentWorkEvaluator.checkAmbiguousNotation('sin 30');
    assert(amb && amb.ambiguous === true, 'sin 30 without units must be flagged as ambiguous');
  });

  await runCase('5_Ambiguous_Expressions', 'interpretation', 'AE-03', 'Input ambiguity detector catches "x2" exponent/subscript ambiguity in geometry diagram', () => {
    const res = inputAmbiguityDetector.detectInputAmbiguity('Right triangle with legs 6 and 8 and hypotenuse x2');
    assert.strictEqual(res.hasAmbiguity, true);
    assert.strictEqual(res.ambiguityType, inputAmbiguityDetector.AMBIGUITY_TYPES.NOTATION_CONFLATION_SUBSCRIPT_EXPONENT);
  });

  await runCase('5_Ambiguous_Expressions', 'parsing_normalization', 'AE-04', 'Frontend naturalMathToLatex does NOT silently rewrite ambiguous "1/2x" into \\frac{1}{2x}', () => {
    const latex = mathInputEngine.naturalMathToLatex('1/2x');
    assert.notStrictEqual(latex, '\\frac{1}{2x}', `Frontend preview must not silently group 2x into denominator of 1/2x (got ${latex})`);
  });

  // ===========================================================================
  // CATEGORY 6: MALFORMED EXPRESSIONS (Syntax Errors, Nonsense, Injection)
  // ===========================================================================
  await runCase('6_Malformed_Expressions', 'interpretation', 'ME-01', 'Keyboard mash / nonsense "banana pancake" classifies as UNKNOWN with low confidence', () => {
    const cls = studentIntentClassifier.classifyStudentIntent('banana pancake', []);
    assert.strictEqual(cls.intent, studentIntentClassifier.INTENTS.UNKNOWN);
    assert.strictEqual(cls.confidence, 'low');
  });

  await runCase('6_Malformed_Expressions', 'calculation', 'ME-02', 'Calculus worker fails closed on malformed syntax "x^2 + * / 3"', async () => {
    const res = await calculusEngine.differentiate('x^2 + * / 3');
    assert.strictEqual(res.status, 'FAILED');
  });

  await runCase('6_Malformed_Expressions', 'routing_context', 'ME-03', 'Tool controller blocks dangerous code execution keywords in calculate_deterministic', () => {
    const v = toolController.validateToolRequest({
      tool: 'calculate_deterministic',
      arguments: { expression: 'process.exit(1)' }
    });
    assert.strictEqual(v.valid, false);
  });

  // ===========================================================================
  // CATEGORY 7: ADVERSARIAL & SYNTACTICALLY SIMILAR EXPRESSIONS (Phase III)
  // ===========================================================================
  await runCase('7_Adversarial_Parser', 'parsing_normalization', 'AP-01', 'Unary negation precedence: -3^2 = -9 whereas (-3)^2 = 9', () => {
    const v1 = mathjsVerifier.verify({
      domain: 'arithmetic',
      claim_type: 'arithmetic',
      data: { expression: '-3^2', proposed_value: -9 }
    });
    const v2 = mathjsVerifier.verify({
      domain: 'arithmetic',
      claim_type: 'arithmetic',
      data: { expression: '(-3)^2', proposed_value: 9 }
    });
    assert.strictEqual(v1.verified, true, '-3^2 must equal -9');
    assert.strictEqual(v2.verified, true, '(-3)^2 must equal 9');
  });

  await runCase('7_Adversarial_Parser', 'parsing_normalization', 'AP-02', 'Distributive grouping: 2(x + 3) == 2x + 6 (and != 2x + 3)', async () => {
    const res = await verificationBridge.runPythonVerifierBatch([
      { domain: 'algebra', claim_type: 'symbolic_equivalence', data: { expr1: '2(x + 3)', expr2: '2x + 6' } },
      { domain: 'algebra', claim_type: 'symbolic_equivalence', data: { expr1: '2(x + 3)', expr2: '2x + 3' } }
    ]);
    assert.strictEqual(res[0].verified, true, '2(x+3) must equal 2x+6');
    assert.strictEqual(res[1].verified, false, '2(x+3) must NOT equal 2x+3');
  });

  await runCase('7_Adversarial_Parser', 'verification', 'AP-03', 'Principal square root domain: sqrt(x^2) != x over general real x (sqrt(x^2) = |x|)', async () => {
    const res = await verificationBridge.runPythonVerifierBatch([{
      domain: 'algebra',
      claim_type: 'symbolic_equivalence',
      data: { expr1: 'sqrt(x^2)', expr2: 'x' }
    }]);
    assert.strictEqual(res[0].verified, false, 'sqrt(x^2) == x must NOT be certified unconditionally over all reals');
  });

  await runCase('7_Adversarial_Parser', 'parsing_normalization', 'AP-04', 'Absolute value |x - 5| normalizes to abs(x - 5) and evaluates |3 - 8| = 5', () => {
    const norm = mathInputEngine.normalizeMathInputForParser('|x - 5|');
    assert.strictEqual(norm, 'abs(x - 5)');
    const v = mathjsVerifier.verify({
      domain: 'arithmetic',
      claim_type: 'arithmetic',
      data: { expression: 'abs(3 - 8)', proposed_value: 5 }
    });
    assert.strictEqual(v.verified, true);
  });

  await runCase('7_Adversarial_Parser', 'parsing_normalization', 'AP-05', 'OCR stacked fraction normalizer converts 3-line stacked fraction to \\frac{3}{4} + \\frac{2}{5}', () => {
    const raw = '  3       2\n ---  +  ---\n  4       5';
    const norm = ocrMathNormalizer.normalizeWorksheetMath(raw);
    assert(norm.includes('\\frac{3}{4}') && norm.includes('\\frac{2}{5}'), `Got: ${norm}`);
  });

  await runCase('7_Adversarial_Parser', 'parsing_normalization', 'AP-06', 'Nested trig parser & visual fidelity: csc(cot(-28.45°)) is NOT blocked when surrounding text contains "="', () => {
    const result = visualFidelity.enforceVisualFidelity(
      'In this problem, cot(-28.45°) = 28.45 and adjacent = 28.45.',
      'show me this visually: csc(cot(-28.45°))'
    );
    assert(result.includes('[GEOMETRY: triangle, a=1, b=1.8456, c=2.0991'), `Expected verified geometry token, got: ${result}`);
  });

  // ===========================================================================
  // CATEGORY 8: MULTI-TURN CONVERSATIONS (Context, Step Corrections, Archival)
  // ===========================================================================
  await runCase('8_Multi_Turn', 'routing_context', 'MT-01', 'Student step correction "Actually I meant 4x = 20" preserves active equation "4x + 9 = 29"', () => {
    const history = [
      { role: 'user', content: 'Solve 4x + 9 = 29' },
      { role: 'assistant', content: 'What is your first step?' },
      { role: 'user', content: '4x = 38' },
      { role: 'assistant', content: 'Watch the sign! Subtract 9 from both sides.' },
      { role: 'user', content: 'Actually I meant 4x = 20' }
    ];
    const state = contextManager.extractActiveProblemState(history);
    assert.strictEqual(state.active.activeExpression, '4x + 9 = 29');
  });

  await runCase('8_Multi_Turn', 'interpretation', 'MT-02', 'Hypothetical parameter change "what happens if I change the 4?" classifies as HYPOTHETICAL', () => {
    const history = [
      { role: 'user', content: 'Solve 4x - 5 = 15' },
      { role: 'assistant', content: 'We isolate x.' }
    ];
    const cls = studentIntentClassifier.classifyStudentIntent('what happens if I change the 4?', history);
    assert.strictEqual(cls.intent, studentIntentClassifier.INTENTS.HYPOTHETICAL);
  });

  await runCase('8_Multi_Turn', 'interpretation', 'MT-03', 'Contextual pronoun inquiry "Why is it negative?" classifies as EXPLANATION_REQUEST', () => {
    const history = [
      { role: 'user', content: 'Solve x^2 - 9 = 0' },
      { role: 'assistant', content: 'The solutions are x = 3 and x = -3.' },
      { role: 'user', content: 'What about the other one?' },
      { role: 'assistant', content: 'The other root is x = -3.' }
    ];
    const cls = studentIntentClassifier.classifyStudentIntent('Why is it negative?', history);
    assert.strictEqual(cls.intent, studentIntentClassifier.INTENTS.EXPLANATION_REQUEST);
  });

  // ===========================================================================
  // CATEGORY 9: EDUCATIONAL & ADAPTIVE TEACHING SCENARIOS
  // ===========================================================================
  await runCase('9_Adaptive_Teaching', 'interpretation', 'AT-01', 'Compound validation + visualization query "Is my work right? Can you visualize this?" detects VALIDATION_REQUEST', () => {
    const messages = [
      { role: 'user', content: 'Right triangle with opposite = 3, adjacent = 4. Find hypotenuse.' },
      { role: 'assistant', content: 'Use the Pythagorean theorem.' }
    ];
    const cls = studentIntentClassifier.classifyStudentIntent('Is my work right? Can you visualize this?', messages);
    assert.strictEqual(cls.intent, studentIntentClassifier.INTENTS.VALIDATION_REQUEST);
  });

  await runCase('9_Adaptive_Teaching', 'calculation', 'AT-02', 'Student work evaluator diagnoses sign error on "3x = 29" for active equation "3x + 7 = 22"', () => {
    const res = studentWorkEvaluator.evaluateLinearEquationStep('3x = 29', '3x + 7 = 22');
    assert.strictEqual(res.status, 'STEP_VERIFIED_INCORRECT');
    assert.strictEqual(res.isSignError, true);
  });

  // ===========================================================================
  // CATEGORY 10: EDGE CASES & DOMAIN RESTRICTIONS (Singularities, Impossible Geometry, Gate Fidelity)
  // ===========================================================================
  await runCase('10_Edge_Domain', 'verification', 'ED-01', 'Removable singularity: (x^2 - 4)/(x - 2) vs (x + 2) is NOT unconditionally equivalent at x = 2', async () => {
    const res = await verificationBridge.runPythonVerifierBatch([{
      domain: 'algebra',
      claim_type: 'symbolic_equivalence',
      data: { expr1: '(x^2 - 4)/(x - 2)', expr2: 'x + 2' }
    }]);
    assert.strictEqual(res[0].verified, false, `Removable singularity (x^2-4)/(x-2) vs x+2 must flag domain restriction mismatch at x=2, got ${JSON.stringify(res[0])}`);
  });

  await runCase('10_Edge_Domain', 'interpretation', 'ED-02', 'Impossible right triangle "leg 10 and hypotenuse 6" routes to geometry specialist and flags FAILED', async () => {
    const task = specialistAssist.extractSpecialistTask('Right triangle with leg 10 and hypotenuse 6');
    assert(task && task.operation === 'RIGHT_TRIANGLE', 'Must extract RIGHT_TRIANGLE task even when c <= a');
    const res = await specialistAssist.runTask(task);
    assert.strictEqual(res.status, 'FAILED');
  });

  await runCase('10_Edge_Domain', 'verification', 'ED-03', 'Delivery gate withholds bogus arithmetic candidate "3 + 14 = 17" when prompt asks "Compute the derivative d/dx of 8x^3 + 14"', () => {
    const prompt = 'Compute the derivative d/dx of 8x^3 + 14';
    const bogusCandidate = '✅ Here is the exact calculation:\n\n$$\n3 + 14 = 17\n$$';
    const candidateAnswer = verificationBridge.extractCandidateAnswer(bogusCandidate);
    const delivery = verificationBridge.evaluateCandidateDelivery({
      candidateAnswer,
      verifications: [{ claim: '3 + 14 = 17', verified: true, status: 'VERIFIED' }],
      contradictions: [],
      claims: ['3 + 14 = 17'],
      prompt
    });
    assert.strictEqual(delivery.delivered, false, 'Delivery gate must withhold arithmetic candidate on derivative prompt');
  });

  await runCase('10_Edge_Domain', 'calculation', 'ED-04', 'Divergent improper integral \\int_0^1 1/x^2 dx is caught as DIVERGENT_INTEGRAL', async () => {
    const res = await calculusEngine.integrate('1/x^2', {
      variable: 'x',
      isDefinite: true,
      lowerLimit: 0,
      upperLimit: 1
    });
    assert.strictEqual(res.status, 'FAILED');
    assert.strictEqual(res.error, 'DIVERGENT_INTEGRAL');
  });

  // Summary
  const totalCases = RESULTS.length;
  const passedCases = RESULTS.filter(r => r.passed).length;
  const failedCases = totalCases - passedCases;

  console.log('\n================================================================================');
  console.log('📊 STAGE-SEPARATED DIAGNOSTIC METRICS');
  console.log('================================================================================');
  for (const [stage, st] of Object.entries(STAGE_STATS)) {
    const pct = st.total > 0 ? ((st.passed / st.total) * 100).toFixed(1) : '100.0';
    console.log(`  • ${stage.padEnd(24)}: ${st.passed}/${st.total} (${pct}%)`);
  }

  console.log('\n================================================================================');
  console.log('📂 CATEGORY BREAKDOWN');
  console.log('================================================================================');
  for (const [cat, st] of Object.entries(CATEGORY_STATS)) {
    const pct = ((st.passed / st.total) * 100).toFixed(1);
    const avgMs = (st.latencies.reduce((a, b) => a + b, 0) / st.latencies.length).toFixed(2);
    console.log(`  • ${cat.padEnd(26)}: ${st.passed}/${st.total} (${pct}%) | avg latency: ${avgMs}ms`);
  }

  console.log('\n================================================================================');
  console.log(`🎯 END-TO-END DIAGNOSTIC ACCURACY: ${passedCases}/${totalCases} (${((passedCases / totalCases) * 100).toFixed(1)}%) — ${failedCases} FAILED`);
  console.log('================================================================================\n');

  try {
    calculusEngine.closeCalculusDaemon();
  } catch (_) {}

  if (failedCases > 0) {
    process.exit(1);
  }
}

runCampaign().catch(err => {
  console.error('Fatal diagnostic campaign error:', err);
  try { calculusEngine.closeCalculusDaemon(); } catch (_) {}
  process.exit(1);
});
