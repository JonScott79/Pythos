/**
 * test/test-input-interpreter-adversarial.js
 *
 * Pythos — Input Interpreter Adversarial Validation & Hardening Campaign (Phase 7)
 *
 * Covers 13 mandatory adversarial categories (215+ deterministic test cases):
 * 1. STEM typo correction (>= 25 cases)
 * 2. False-positive typo protection (>= 20 cases)
 * 3. Spoken radicals and powers (>= 20 cases)
 * 4. Ambiguous mathematical notation (>= 15 cases)
 * 5. Multiple-root interpretation (>= 10 cases)
 * 6. Elliptical tutoring responses (>= 20 cases)
 * 7. Context expiration and topic changes (>= 15 cases)
 * 8. Verbal operations (>= 15 cases)
 * 9. Valid jump-ahead transformations (>= 15 cases)
 * 10. Invalid transformations (>= 15 cases)
 * 11. Domain restriction and extraneous-root cases (>= 10 cases)
 * 12. Raw-input preservation (>= 10 cases)
 * 13. Verification-status integrity & 7-category taxonomy (>= 10 cases)
 */

const assert = require('assert');
const { performance } = require('perf_hooks');
const {
  canonicalizeStemTypos,
  transpileSpokenMath,
  detectMathNotationAmbiguities,
  parseMultiRootStudentProposal,
  analyzeDialoguePragmatics,
  interpretUserTurn
} = require('../server/inputInterpreter');
const { extractActiveProblemState } = require('../server/contextManager');
const { INTENTS, classifyStudentIntent } = require('../server/studentIntentClassifier');
const { evaluateStudentWork } = require('../server/studentWorkEvaluator');

const categoryCounts = {};
let totalCases = 0;
let passedCases = 0;
let failedCases = 0;

function checkCase(category, description, fn) {
  totalCases++;
  categoryCounts[category] = (categoryCounts[category] || 0) + 1;
  try {
    fn();
    passedCases++;
  } catch (err) {
    failedCases++;
    console.error(`  ✗ [FAIL] [${category}] ${description}`);
    console.error(`    ${err.message}`);
    process.exitCode = 1;
  }
}

function runCampaign() {
  console.log('======================================================================');
  console.log('PYTHOS: INPUT INTERPRETER ADVERSARIAL VALIDATION & HARDENING SUITE');
  console.log('======================================================================\n');

  // =========================================================================
  // CATEGORY 1: STEM Typo Correction (>= 25 cases)
  // =========================================================================
  console.log('▶ [1] STEM Typo Correction');
  const stemTypoCases = [
    ['derivitive', 'derivative', 'Isolated derivitive typo'],
    ['intagral', 'integral', 'Isolated intagral typo'],
    ['differenciate', 'differentiate', 'Isolated differenciate typo'],
    ['limmit', 'limit', 'Isolated limmit typo'],
    ['asymtote', 'asymptote', 'Isolated asymtote typo'],
    ['quadradic', 'quadratic', 'Isolated quadradic typo'],
    ['equasion', 'equation', 'Isolated equasion typo'],
    ['simpilfy', 'simplify', 'Isolated simpilfy typo'],
    ['polynomal', 'polynomial', 'Isolated polynomal typo'],
    ['logrithm', 'logarithm', 'Isolated logrithm typo'],
    ['exponet', 'exponent', 'Isolated exponet typo'],
    ['hypotanuse', 'hypotenuse', 'Isolated hypotanuse typo'],
    ['hypothenuse', 'hypotenuse', 'Isolated hypothenuse typo'],
    ['pythagorium', 'pythagorean', 'Isolated pythagorium typo'],
    ['triganometry', 'trigonometry', 'Isolated triganometry typo'],
    ['parabala', 'parabola', 'Isolated parabala typo'],
    ['accelaration', 'acceleration', 'Isolated accelaration typo'],
    ['velosity', 'velocity', 'Isolated velosity typo'],
    ['kinamatics', 'kinematics', 'Isolated kinamatics typo'],
    ['antiderivitive', 'antiderivative', 'Isolated antiderivitive typo'],
    ['denomintor', 'denominator', 'Isolated denomintor typo'],
    ['numarator', 'numerator', 'Isolated numarator typo'],
    ['discriminent', 'discriminant', 'Isolated discriminent typo'],
    ['Can you help me find the derivitive of x squared?', 'Can you help me find the derivative of x squared?', 'Sentence with derivitive'],
    ['I think I need to simp ilfy this quadradic.', 'I think I need to simplify this quadratic.', 'Sentence with split-word simp ilfy and quadradic'],
    ['Why is the hypothenuse longer than the other sides?', 'Why is the hypotenuse longer than the other sides?', 'Sentence with hypothenuse'],
    ['I dont understand the intagral.', 'I dont understand the integral.', 'Sentence with intagral'],
    ['How do I differenciate a logrithm with an exponet?', 'How do I differentiate a logarithm with an exponent?', 'Multi-typo sentence']
  ];
  for (const [input, expected, desc] of stemTypoCases) {
    checkCase('1_STEM_TYPO_CORRECTION', desc, () => {
      assert.strictEqual(canonicalizeStemTypos(input), expected);
    });
  }

  // =========================================================================
  // CATEGORY 2: False-Positive Typo Protection (>= 20 cases)
  // =========================================================================
  console.log('▶ [2] False-Positive Typo Protection');
  const falsePositiveCases = [
    ['different', 'Protect English word "different" from snapping to differentiate'],
    ['difference', 'Protect "difference"'],
    ['fraction', 'Protect "fraction"'],
    ['function', 'Protect "function"'],
    ['integer', 'Protect "integer" from snapping to integral'],
    ['integral', 'Protect valid "integral"'],
    ['derivative', 'Protect valid "derivative"'],
    ['sin', 'Protect trig "sin"'],
    ['cos', 'Protect trig "cos"'],
    ['tan', 'Protect trig "tan"'],
    ['sec', 'Protect trig "sec"'],
    ['csc', 'Protect trig "csc"'],
    ['cot', 'Protect trig "cot"'],
    ['log', 'Protect "log"'],
    ['ln', 'Protect "ln"'],
    ['x, y, z, a, b, c, t', 'Protect single-letter variable identifiers'],
    ['v_0 + a_1 * t_2 = v_f', 'Protect subscripted variables'],
    ['x^2 + y^3 - 10^-4', 'Protect superscripts'],
    ['α + β + θ + π = 2π', 'Protect Greek symbols'],
    ['6.022e23 * 1.38e-23', 'Protect scientific notation'],
    ['f(x) = g(t) + h_1(x)', 'Protect function names and labels'],
    ['problem_1, eq2, step3, varA', 'Protect user-defined labels'],
    ['Can you explain why sin x equals zero when x is pi?', 'Protect mixed-language math sentence']
  ];
  for (const [input, desc] of falsePositiveCases) {
    checkCase('2_FALSE_POSITIVE_PROTECTION', desc, () => {
      assert.strictEqual(canonicalizeStemTypos(input), input);
    });
  }

  // =========================================================================
  // CATEGORY 3: Spoken Radicals and Powers (>= 20 cases)
  // =========================================================================
  console.log('▶ [3] Spoken Radicals and Powers');
  const spokenMathCases = [
    ['root 17', 'sqrt(17)', 'Spoken root 17'],
    ['square root of 17', 'sqrt(17)', 'Spoken square root of 17'],
    ['sq root of 17', 'sqrt(17)', 'Spoken sq root of 17'],
    ['radical 17', 'sqrt(17)', 'Spoken radical 17'],
    ['sqrt(17)', 'sqrt(17)', 'Already canonical sqrt(17)'],
    ['Sqrt(17)', 'sqrt(17)', 'Capitalized Sqrt(17)'],
    ['√17', 'sqrt(17)', 'Unicode radical √17'],
    ['√(x + 3)', 'sqrt(x + 3)', 'Parenthesized Unicode radical'],
    ['square root of (x + 3)', 'sqrt(x + 3)', 'Parenthesized spoken radical'],
    ['square root of the quantity x plus 3', 'sqrt(x + 3)', 'Explicit "the quantity" radical boundary'],
    ['x squared', 'x^2', 'Spoken x squared'],
    ['x cubed', 'x^3', 'Spoken x cubed'],
    ['x to the fourth power', 'x^4', 'Spoken x to the fourth power'],
    ['x to the 4th power', 'x^4', 'Spoken x to the 4th power'],
    ['x to the fifth power', 'x^5', 'Spoken x to the fifth power'],
    ['3x squared minus 3 equals 48', '3x^2 - 3 = 48', 'Spoken equation 3x squared minus 3 equals 48'],
    ['x squared plus 2x minus 8', 'x^2 + 2x - 8', 'Spoken quadratic expression'],
    ['two x squared plus five x minus three', '2x^2 + 5x - 3', 'Spoken word coefficients in quadratic'],
    ['(x + 1) squared', '(x + 1)^2', 'Parenthesized base squared'],
    ['3x²-3=48', '3x^2-3=48', 'Unicode superscript equation'],
    ['plus or minus root 17', '±sqrt(17)', 'Spoken plus or minus root 17'],
    ['plus minus sqrt 17', '±sqrt(17)', 'Spoken plus minus sqrt 17']
  ];
  for (const [input, expected, desc] of spokenMathCases) {
    checkCase('3_SPOKEN_RADICALS_AND_POWERS', desc, () => {
      assert.strictEqual(transpileSpokenMath(input), expected);
    });
  }

  // =========================================================================
  // CATEGORY 4: Ambiguous Mathematical Notation (>= 15 cases)
  // =========================================================================
  console.log('▶ [4] Ambiguous Mathematical Notation');
  const ambiguousCases = [
    ['the square root of x plus 3', 'RADICAL_BOUNDARY_AMBIGUITY', 'sqrt(x) + 3', 'sqrt(x + 3)'],
    ['square root of x squared plus 4', 'RADICAL_BOUNDARY_AMBIGUITY', 'sqrt(x^2) + 4', 'sqrt(x^2 + 4)'],
    ['square root x plus 3', 'RADICAL_BOUNDARY_AMBIGUITY', 'sqrt(x) + 3', 'sqrt(x + 3)'],
    ['root x minus 5', 'RADICAL_BOUNDARY_AMBIGUITY', 'sqrt(x) - 5', 'sqrt(x - 5)'],
    ['radical y plus 1', 'RADICAL_BOUNDARY_AMBIGUITY', 'sqrt(y) + 1', 'sqrt(y + 1)'],
    ['1/2x + 3 = 7', 'DIVISION_BINDING_AMBIGUITY', '(1/2)*x + 3 = 7', '1/(2*x) + 3 = 7'],
    ['1/2x', 'DIVISION_BINDING_AMBIGUITY', '(1/2)*x', '1/(2*x)'],
    ['2x/3y', 'DIVISION_BINDING_AMBIGUITY', '(2x/3)*y', '2x/(3*y)'],
    ['3/4t = 12', 'DIVISION_BINDING_AMBIGUITY', '(3/4)*t = 12', '3/(4*t) = 12'],
    ['-x squared', 'UNARY_NEGATION_POWER_AMBIGUITY', '-(x^2)', '(-x)^2'],
    ['negative x squared', 'UNARY_NEGATION_POWER_AMBIGUITY', '-(x^2)', '(-x)^2'],
    ['minus x cubed', 'UNARY_NEGATION_POWER_AMBIGUITY', '-(x^3)', '(-x)^3'],
    ['1/x+2', 'DENOMINATOR_GROUPING_AMBIGUITY', '(1/x) + 2', '1/(x + 2)'],
    ['1/x-3', 'DENOMINATOR_GROUPING_AMBIGUITY', '(1/x) - 3', '1/(x - 3)'],
    ['sin x squared', 'TRIG_POWER_AMBIGUITY', 'sin(x^2)', '(sin(x))^2'],
    ['cos theta squared', 'TRIG_POWER_AMBIGUITY', 'cos(theta^2)', '(cos(theta))^2']
  ];
  for (const [input, expectedType, candA, candB] of ambiguousCases) {
    checkCase('4_AMBIGUOUS_NOTATION', `Ambiguity detected for "${input}" (${expectedType})`, () => {
      const turn = interpretUserTurn(input);
      assert.strictEqual(turn.interpretationStatus, 'AMBIGUOUS');
      assert(turn.normalizedMath.ambiguities.length > 0, `Expected ambiguity for ${input}`);
      assert.strictEqual(turn.normalizedMath.ambiguities[0].type, expectedType);
      assert.deepStrictEqual(turn.normalizedMath.candidates, [candA, candB]);
      assert.strictEqual(turn.normalizedMath.selected, null, 'Must not silently select an ambiguous candidate');

      const intent = classifyStudentIntent(input, []);
      const evalRes = evaluateStudentWork(input, intent, []);
      assert.strictEqual(evalRes.status, 'AMBIGUOUS_NOTATION');
      assert.strictEqual(evalRes.evaluationCategory, 'AMBIGUOUS_RESPONSE');
    });
  }

  // =========================================================================
  // CATEGORY 5: Multiple-Root Interpretation (>= 10 cases)
  // =========================================================================
  console.log('▶ [5] Multiple-Root Interpretation (Context-Sensitive)');
  const quadHistory = [
    { role: 'user', content: 'Solve x^2 - 5x + 6 = 0' },
    { role: 'assistant', content: 'Factor $$x^2 - 5x + 6 = 0$$ to find the roots.' }
  ];
  const quadState = extractActiveProblemState(quadHistory);

  checkCase('5_MULTI_ROOT', 'Explicit "plus or minus root 17" parsed as symmetric root pair', () => {
    const mr = parseMultiRootStudentProposal('plus or minus root 17');
    assert(mr && mr.hasBothSigns === true && mr.values.length === 2);
  });
  checkCase('5_MULTI_ROOT', 'Explicit "plus minus sqrt 17" parsed as symmetric root pair', () => {
    const mr = parseMultiRootStudentProposal('plus minus sqrt 17');
    assert(mr && mr.hasBothSigns === true && Math.abs(mr.values[0] - Math.sqrt(17)) < 1e-6);
  });
  checkCase('5_MULTI_ROOT', 'Explicit "x equals 4 or negative 4" parsed as symmetric root pair', () => {
    const mr = parseMultiRootStudentProposal('x equals 4 or negative 4');
    assert(mr && mr.variable === 'x' && mr.hasBothSigns === true && mr.values[0] === 4 && mr.values[1] === -4);
  });
  checkCase('5_MULTI_ROOT', 'Explicit "the roots are 2 and 3" parsed as distinct root pair', () => {
    const mr = parseMultiRootStudentProposal('the roots are 2 and 3');
    assert(mr && mr.hasBothSigns === false && mr.values[0] === 2 && mr.values[1] === 3);
  });
  checkCase('5_MULTI_ROOT', 'Explicit "x is either 2 or 3" parsed as distinct root pair', () => {
    const mr = parseMultiRootStudentProposal('x is either 2 or 3');
    assert(mr && mr.variable === 'x' && mr.values[0] === 2 && mr.values[1] === 3);
  });
  checkCase('5_MULTI_ROOT', 'Contextual "2 and 3" accepted when active problem is quadratic x^2 - 5x + 6 = 0', () => {
    const mr = parseMultiRootStudentProposal('2 and 3', quadState);
    assert(mr && mr.values[0] === 2 && mr.values[1] === 3);
  });
  checkCase('5_MULTI_ROOT', 'Bare "2 and 3" REJECTED when there is no active problem', () => {
    const mr = parseMultiRootStudentProposal('2 and 3', null);
    assert.strictEqual(mr, null);
  });
  checkCase('5_MULTI_ROOT', 'Bare "3 and 4" REJECTED when active problem is Geometry triangle side lengths', () => {
    const geomState = { active: { domain: 'GEOMETRY', subtype: 'RIGHT_TRIANGLE', activeExpression: 'a^2 + b^2 = c^2', isCompleted: false } };
    const mr = parseMultiRootStudentProposal('3 and 4', geomState);
    assert.strictEqual(mr, null);
  });
  checkCase('5_MULTI_ROOT', 'Bare "2 and 3" REJECTED when active problem is a linear equation 2x + 1 = 7', () => {
    const linState = { active: { domain: 'ALGEBRA', subtype: 'LINEAR_EQUATION', activeExpression: '2x + 1 = 7', isCompleted: false } };
    const mr = parseMultiRootStudentProposal('2 and 3', linState);
    assert.strictEqual(mr, null);
  });
  checkCase('5_MULTI_ROOT', 'Bare "2 and 3" REJECTED when active quadratic problem is already completed', () => {
    const doneState = { active: { domain: 'ALGEBRA', subtype: 'QUADRATIC_EQUATION', activeExpression: 'x^2 - 5x + 6 = 0', isCompleted: true } };
    const mr = parseMultiRootStudentProposal('2 and 3', doneState);
    assert.strictEqual(mr, null);
  });
  checkCase('5_MULTI_ROOT', 'Ordered pair "(2, 3)" REJECTED as a root set even in quadratic context', () => {
    const mr = parseMultiRootStudentProposal('(2, 3)', quadState);
    assert.strictEqual(mr, null);
  });

  // =========================================================================
  // CATEGORY 6: Elliptical Tutoring Responses (>= 20 cases)
  // =========================================================================
  console.log('▶ [6] Elliptical Tutoring Responses');
  const buildTutorHistory = (userEq, asstStepEq, asstQuestion) => ([
    { role: 'user', content: `Solve ${userEq}` },
    { role: 'assistant', content: `We have:\n$$${asstStepEq}$$\n${asstQuestion}` }
  ]);

  const ellipticalCases = [
    ['(3x^2 - 3)/4 = 12', '3x^2 - 3 = 48', 'Next step: Add 3 to both sides of the equation. What do you get?', '51', '3x^2 = 51', 'CORRECT_INTERMEDIATE_STEP'],
    ['(3x^2 - 3)/4 = 12', '3x^2 - 3 = 48', 'Next step: Add 3 to both sides of the equation. What do you get?', '17', 'x^2 = 17', 'VALID_JUMP_AHEAD'],
    ['(3x^2 - 3)/4 = 12', '3x^2 = 51', 'Next step: Divide both sides by 3. What do you obtain?', '17', 'x^2 = 17', 'CORRECT_INTERMEDIATE_STEP'],
    ['(3x^2 - 3)/4 = 12', '3x^2 = 51', 'Next step: Divide both sides by 3. What do you obtain?', 'x squared equals 17', 'x^2 = 17', 'CORRECT_INTERMEDIATE_STEP'],
    ['2x + 7 = 19', '2x + 7 = 19', 'Next step: Subtract 7 from both sides. What do you get?', '12', '2x = 12', 'CORRECT_INTERMEDIATE_STEP'],
    ['5x - 4 = 21', '5x - 4 = 21', 'Next step: Add 4 to both sides. What expression do you obtain?', '25', '5x = 25', 'CORRECT_INTERMEDIATE_STEP'],
    ['4x + 9 = 29', '4x + 9 = 29', 'Next step: Subtract 9 from both sides. What do you get?', '20', '4x = 20', 'CORRECT_INTERMEDIATE_STEP'],
    ['x/5 = 6', 'x/5 = 6', 'Next step: Multiply both sides by 5. What do you get?', '30', 'x = 30', 'CORRECT_FINAL_ANSWER'],
    ['(2x + 1)/3 = 5', '(2x + 1)/3 = 5', 'Next step: Multiply both sides by 3. What do you get?', '15', '2x + 1 = 15', 'CORRECT_INTERMEDIATE_STEP'],
    ['2x + 1 = 15', '2x + 1 = 15', 'Next step: Subtract 1 from both sides. What do you get?', '14', '2x = 14', 'CORRECT_INTERMEDIATE_STEP'],
    ['7x - 10 = 18', '7x - 10 = 18', 'Next step: Add 10 to both sides. What do you obtain?', '28', '7x = 28', 'CORRECT_INTERMEDIATE_STEP'],
    ['9x + 3 = 30', '9x + 3 = 30', 'Next step: Subtract 3 from both sides. What do you obtain?', '27', '9x = 27', 'CORRECT_INTERMEDIATE_STEP'],
    ['2x^2 - 8 = 10', '2x^2 - 8 = 10', 'Next step: Add 8 to both sides. What do you get?', '18', '2x^2 = 18', 'CORRECT_INTERMEDIATE_STEP'],
    ['2x^2 - 8 = 10', '2x^2 - 8 = 10', 'Next step: Add 8 to both sides. What do you get?', '9', 'x^2 = 9', 'VALID_JUMP_AHEAD'],
    ['2x^2 = 18', '2x^2 = 18', 'Next step: Divide both sides by 2. What do you get?', '9', 'x^2 = 9', 'CORRECT_INTERMEDIATE_STEP'],
    ['4x^2 - 5 = 11', '4x^2 - 5 = 11', 'Next step: Add 5 to both sides. What do you get?', '16', '4x^2 = 16', 'CORRECT_INTERMEDIATE_STEP'],
    ['4x^2 - 5 = 11', '4x^2 - 5 = 11', 'Next step: Add 5 to both sides. What do you get?', '4', 'x^2 = 4', 'VALID_JUMP_AHEAD'],
    ['3x - 12 = 0', '3x - 12 = 0', 'Next step: Add 12 to both sides. What do you get?', '12', '3x = 12', 'CORRECT_INTERMEDIATE_STEP'],
    ['6x + 5 = 23', '6x + 5 = 23', 'Next step: Subtract 5 from both sides. What do you get?', '18', '6x = 18', 'CORRECT_INTERMEDIATE_STEP'],
    ['10x - 7 = 43', '10x - 7 = 43', 'Next step: Add 7 to both sides. What do you get?', '50', '10x = 50', 'CORRECT_INTERMEDIATE_STEP']
  ];
  for (const [origEq, stepEq, question, reply, expectedStep, expectedCat] of ellipticalCases) {
    checkCase('6_ELLIPTICAL_TUTORING_RESPONSES', `Elliptical reply "${reply}" after "${question}" on ${stepEq}`, () => {
      const h = buildTutorHistory(origEq, stepEq, question);
      const state = extractActiveProblemState(h);
      state.active.currentStepEquation = stepEq;
      const intent = classifyStudentIntent(reply, h, state);
      assert.strictEqual(intent.intent, INTENTS.PROPOSED_STEP);
      assert.strictEqual(intent.extractedExpression, expectedStep);
      const evalRes = evaluateStudentWork(reply, intent, h, state);
      assert(evalRes.status === 'STEP_VERIFIED_CORRECT' || evalRes.status === 'ANSWER_VERIFIED_CORRECT');
      assert.strictEqual(evalRes.evaluationCategory, expectedCat);
    });
  }

  // =========================================================================
  // CATEGORY 7: Context Expiration and Topic Changes (>= 15 cases)
  // =========================================================================
  console.log('▶ [7] Context Expiration and Topic Changes');
  const activeTutorHist = buildTutorHistory(
    '(3x^2 - 3)/4 = 12',
    '3x^2 - 3 = 48',
    'Next step: Add 3 to both sides of the equation. What do you get?'
  );
  const activeTutorState = extractActiveProblemState(activeTutorHist);

  checkCase('7_CONTEXT_EXPIRATION', 'No active problem (empty history): "51" is NOT an elliptical step RHS', () => {
    const p = analyzeDialoguePragmatics('51', [], null);
    assert.strictEqual(p.isStaleContext, true);
    assert.strictEqual(p.isEllipticalStepRhs, false);
  });
  checkCase('7_CONTEXT_EXPIRATION', 'Active problem marked completed: "51" does not anchor to completed problem', () => {
    const completedState = { active: { ...activeTutorState.active, isCompleted: true } };
    const p = analyzeDialoguePragmatics('51', activeTutorHist, completedState);
    assert.strictEqual(p.isStaleContext, true);
    assert.strictEqual(p.isEllipticalStepRhs, false);
  });
  checkCase('7_CONTEXT_EXPIRATION', 'Active problem cleared (active: null): "51" is stale', () => {
    const clearedState = { active: null, archived: [] };
    const p = analyzeDialoguePragmatics('51', activeTutorHist, clearedState);
    assert.strictEqual(p.isStaleContext, true);
  });
  checkCase('7_CONTEXT_EXPIRATION', 'Assistant message contains \\boxed{...} final solution: step anchor expires', () => {
    const boxedHist = [
      { role: 'user', content: 'Solve 3x^2 - 3 = 48' },
      { role: 'assistant', content: 'Add 3 to both sides to get $3x^2 = 51$, so $$\\boxed{x = \\pm\\sqrt{17}}$$' }
    ];
    const p = analyzeDialoguePragmatics('51', boxedHist, activeTutorState);
    assert.strictEqual(p.isStaleContext, true);
  });
  checkCase('7_CONTEXT_EXPIRATION', 'Previous assistant message did not ask a question: "51" is not an elliptical step', () => {
    const statementHist = [
      { role: 'user', content: 'Solve 3x^2 - 3 = 48' },
      { role: 'assistant', content: 'We are looking at the equation $$3x^2 - 3 = 48$$.' }
    ];
    const p = analyzeDialoguePragmatics('51', statementHist, activeTutorState);
    assert.strictEqual(p.assistantPromptType, 'NONE');
    assert.strictEqual(p.isEllipticalStepRhs, false);
  });
  checkCase('7_CONTEXT_EXPIRATION', 'Previous assistant message asked a conceptual question: number is not step RHS', () => {
    const conceptHist = [
      { role: 'user', content: 'Solve 3x^2 - 3 = 48' },
      { role: 'assistant', content: '$$3x^2 - 3 = 48$$\nWhy do you think we undo subtraction before multiplication?' }
    ];
    const p = analyzeDialoguePragmatics('51', conceptHist, activeTutorState);
    assert.strictEqual(p.assistantPromptType, 'ASKED_CONCEPTUAL');
    assert.strictEqual(p.isEllipticalStepRhs, false);
  });
  checkCase('7_CONTEXT_EXPIRATION', 'Context conflict: "Actually, can you explain the quadratic formula instead?" preempts tutor step', () => {
    const msg = 'Actually, can you explain the quadratic formula instead?';
    const intent = classifyStudentIntent(msg, activeTutorHist, activeTutorState);
    assert.strictEqual(intent.intent, INTENTS.EXPLANATION_REQUEST);
    assert.strictEqual(intent.interpretedTurn.dialogueContext.contextConflict, true);
  });
  checkCase('7_CONTEXT_EXPIRATION', 'Context conflict: "What is a derivative?" preempts tutor step', () => {
    const msg = 'What is a derivative?';
    const intent = classifyStudentIntent(msg, activeTutorHist, activeTutorState);
    assert.strictEqual(intent.intent, INTENTS.EXPLANATION_REQUEST);
  });
  checkCase('7_CONTEXT_EXPIRATION', 'Context conflict: "Can you explain why we divide by 3?" classifies as EXPLANATION_REQUEST', () => {
    const msg = 'Can you explain why we divide by 3?';
    const intent = classifyStudentIntent(msg, activeTutorHist, activeTutorState);
    assert.strictEqual(intent.intent, INTENTS.EXPLANATION_REQUEST);
  });
  checkCase('7_CONTEXT_EXPIRATION', 'Context conflict: "Now solve 2x + 5 = 17" classifies as NEW_PROBLEM', () => {
    const msg = 'Now solve 2x + 5 = 17';
    const intent = classifyStudentIntent(msg, activeTutorHist, activeTutorState);
    assert.strictEqual(intent.intent, INTENTS.NEW_PROBLEM);
  });
  checkCase('7_CONTEXT_EXPIRATION', 'Context conflict: "Let\'s switch to physics" classifies as NEW_PROBLEM', () => {
    const msg = "Let's switch to physics";
    const intent = classifyStudentIntent(msg, activeTutorHist, activeTutorState);
    assert.strictEqual(intent.intent, INTENTS.NEW_PROBLEM);
  });
  checkCase('7_CONTEXT_EXPIRATION', 'Multiple assistant questions: older question is ignored in favor of latest assistant turn', () => {
    const multiQHist = [
      ...activeTutorHist,
      { role: 'user', content: '3x^2 = 51' },
      { role: 'assistant', content: 'Great! Now we have $$3x^2 = 51$$. Next step: Divide both sides by 3. What do you get?' }
    ];
    const multiState = extractActiveProblemState(multiQHist);
    // "51" was the answer to the OLD question; for the NEW question (divide by 3), 51 is NOT the expected RHS (17 is)!
    const p51 = analyzeDialoguePragmatics('51', multiQHist, multiState);
    assert.strictEqual(p51.isEllipticalStepRhs, false);
    const p17 = analyzeDialoguePragmatics('17', multiQHist, multiState);
    assert.strictEqual(p17.isEllipticalStepRhs, true);
    assert.strictEqual(p17.inferredFullStep, 'x^2 = 17');
  });
  checkCase('7_CONTEXT_EXPIRATION', 'New problem replaces old problem in extractActiveProblemState and archives old problem', () => {
    const replacedHist = [
      ...activeTutorHist,
      { role: 'user', content: 'Now solve 4x - 1 = 11' },
      { role: 'assistant', content: 'Let us solve $$4x - 1 = 11$$. Add 1 to both sides. What do you get?' }
    ];
    const replacedState = extractActiveProblemState(replacedHist);
    assert.strictEqual(replacedState.active.activeExpression, '4x - 1 = 11');
    const p12 = analyzeDialoguePragmatics('12', replacedHist, replacedState);
    assert.strictEqual(p12.isEllipticalStepRhs, true);
    assert.strictEqual(p12.inferredFullStep, '4x = 12');
  });
  checkCase('7_CONTEXT_EXPIRATION', 'Student asks for a practice problem mid-step: PRACTICE_REQUEST takes precedence', () => {
    const intent = classifyStudentIntent('Give me a practice problem', activeTutorHist, activeTutorState);
    assert.strictEqual(intent.intent, INTENTS.PRACTICE_REQUEST);
  });
  checkCase('7_CONTEXT_EXPIRATION', 'Student expresses confusion "I don\'t get it": CONFUSION takes precedence', () => {
    const intent = classifyStudentIntent("I don't get it", activeTutorHist, activeTutorState);
    assert.strictEqual(intent.intent, INTENTS.CONFUSION);
  });

  // =========================================================================
  // CATEGORY 8: Verbal Operations (>= 15 cases)
  // =========================================================================
  console.log('▶ [8] Verbal Operations (Distinguished from Executed Steps)');
  const verbalCases = [
    ['3x^2 - 3 = 48', 'What is our next step?', 'add 3', 'OPERATION_IDENTIFIED_CORRECT', 'CORRECT_OPERATION_UNEXECUTED'],
    ['3x^2 - 3 = 48', 'What is our next step?', 'add 3 to both sides', 'OPERATION_IDENTIFIED_CORRECT', 'CORRECT_OPERATION_UNEXECUTED'],
    ['3x^2 - 3 = 48', 'What is our next step?', 'move the 3 over', 'OPERATION_IDENTIFIED_CORRECT', 'CORRECT_OPERATION_UNEXECUTED'],
    ['3x^2 - 3 = 48', 'What is our next step?', 'divide by 3', 'OPERATION_IDENTIFIED_INCORRECT', 'INCORRECT_TRANSFORMATION'],
    ['3x^2 - 3 = 48', 'What is our next step?', 'take the square root', 'OPERATION_IDENTIFIED_INCORRECT', 'INCORRECT_TRANSFORMATION'],
    ['2x + 5 = 17', 'What is our next step?', 'subtract 5', 'OPERATION_IDENTIFIED_CORRECT', 'CORRECT_OPERATION_UNEXECUTED'],
    ['2x + 5 = 17', 'What is our next step?', 'move the 5 over', 'OPERATION_IDENTIFIED_CORRECT', 'CORRECT_OPERATION_UNEXECUTED'],
    ['2x + 5 = 17', 'What is our next step?', 'add 5', 'OPERATION_IDENTIFIED_INCORRECT', 'INCORRECT_TRANSFORMATION'],
    ['3x^2 = 51', 'What is our next step?', 'divide by 3', 'OPERATION_IDENTIFIED_CORRECT', 'CORRECT_OPERATION_UNEXECUTED'],
    ['3x^2 = 51', 'What is our next step?', 'divide both sides by 3', 'OPERATION_IDENTIFIED_CORRECT', 'CORRECT_OPERATION_UNEXECUTED'],
    ['3x^2 = 51', 'What is our next step?', 'subtract 3', 'OPERATION_IDENTIFIED_INCORRECT', 'INCORRECT_TRANSFORMATION'],
    ['x/2 = 9', 'Next step: Multiply both sides by 2. What do we do?', 'multiply both sides by 2', 'OPERATION_IDENTIFIED_CORRECT', 'CORRECT_OPERATION_UNEXECUTED'],
    ['x^2 = 17', 'What is our next step?', 'take the square root', 'OPERATION_IDENTIFIED_CORRECT', 'CORRECT_OPERATION_UNEXECUTED'],
    ['x^2 = 17', 'What is our next step?', 'square root both sides', 'OPERATION_IDENTIFIED_CORRECT', 'CORRECT_OPERATION_UNEXECUTED'],
    ['x^2 - 5x + 6 = 0', 'How can we start solving this?', 'factor it', 'OPERATION_IDENTIFIED', 'CORRECT_OPERATION_UNEXECUTED'],
    ['2x + 3x = 15', 'How can we start solving this?', 'combine like terms', 'OPERATION_IDENTIFIED', 'CORRECT_OPERATION_UNEXECUTED']
  ];
  for (const [eq, q, reply, expectedStatus, expectedCat] of verbalCases) {
    checkCase('8_VERBAL_OPERATIONS', `Verbal operation "${reply}" on ${eq} -> ${expectedStatus}`, () => {
      const h = buildTutorHistory(eq, eq, q);
      const state = extractActiveProblemState(h);
      state.active.currentStepEquation = eq;
      const intent = classifyStudentIntent(reply, h, state);
      assert.strictEqual(intent.intent, INTENTS.PROPOSED_STEP);
      assert.strictEqual(intent.isVerbalOperation, true);
      const evalRes = evaluateStudentWork(reply, intent, h, state);
      assert.strictEqual(evalRes.status, expectedStatus);
      assert.strictEqual(evalRes.evaluationCategory, expectedCat);
      assert.notStrictEqual(evalRes.status, 'STEP_VERIFIED_CORRECT', 'Verbal operation must NOT be collapsed into executed STEP_VERIFIED_CORRECT');
    });
  }

  // =========================================================================
  // CATEGORY 9: Valid Jump-Ahead Transformations (>= 15 cases)
  // =========================================================================
  console.log('▶ [9] Valid Jump-Ahead Transformations');
  const jumpAheadCases = [
    ['(3x^2 - 3)/4 = 12', '(3x^2 - 3)/4 = 12', '3x^2 = 51', 'STEP_VERIFIED_CORRECT', 'VALID_JUMP_AHEAD'],
    ['(3x^2 - 3)/4 = 12', '(3x^2 - 3)/4 = 12', 'x^2 = 17', 'STEP_VERIFIED_CORRECT', 'VALID_JUMP_AHEAD'],
    ['(3x^2 - 3)/4 = 12', '3x^2 - 3 = 48', 'x^2 = 17', 'STEP_VERIFIED_CORRECT', 'VALID_JUMP_AHEAD'],
    ['(3x^2 - 3)/4 = 12', '3x^2 - 3 = 48', 'x squared equals 17', 'STEP_VERIFIED_CORRECT', 'VALID_JUMP_AHEAD'],
    ['(3x^2 - 3)/4 = 12', '3x^2 - 3 = 48', 'Sqrt(17)', 'ANSWER_VERIFIED_CORRECT', 'VALID_JUMP_AHEAD'],
    ['(3x^2 - 3)/4 = 12', '3x^2 - 3 = 48', 'root 17', 'ANSWER_VERIFIED_CORRECT', 'VALID_JUMP_AHEAD'],
    ['(3x^2 - 3)/4 = 12', '3x^2 - 3 = 48', 'plus or minus root 17', 'ANSWER_VERIFIED_CORRECT', 'CORRECT_FINAL_ANSWER'],
    ['(3x^2 - 3)/4 = 12', '3x^2 - 3 = 48', '±sqrt(17)', 'ANSWER_VERIFIED_CORRECT', 'CORRECT_FINAL_ANSWER'],
    ['(2x^2 + 4)/3 = 12', '(2x^2 + 4)/3 = 12', '2x^2 = 32', 'STEP_VERIFIED_CORRECT', 'VALID_JUMP_AHEAD'],
    ['(2x^2 + 4)/3 = 12', '(2x^2 + 4)/3 = 12', 'x^2 = 16', 'STEP_VERIFIED_CORRECT', 'VALID_JUMP_AHEAD'],
    ['(2x^2 + 4)/3 = 12', '2x^2 + 4 = 36', 'x^2 = 16', 'STEP_VERIFIED_CORRECT', 'VALID_JUMP_AHEAD'],
    ['(2x^2 + 4)/3 = 12', '2x^2 + 4 = 36', '4', 'ANSWER_VERIFIED_CORRECT', 'VALID_JUMP_AHEAD'],
    ['(2x^2 + 4)/3 = 12', '2x^2 + 4 = 36', 'x equals 4 or negative 4', 'ANSWER_VERIFIED_CORRECT', 'CORRECT_FINAL_ANSWER'],
    ['5x^2 - 20 = 0', '5x^2 - 20 = 0', 'x^2 = 4', 'STEP_VERIFIED_CORRECT', 'VALID_JUMP_AHEAD'],
    ['5x^2 - 20 = 0', '5x^2 - 20 = 0', 'plus or minus 2', 'ANSWER_VERIFIED_CORRECT', 'CORRECT_FINAL_ANSWER']
  ];
  for (const [origEq, currEq, reply, expectedStatus, expectedCat] of jumpAheadCases) {
    checkCase('9_VALID_JUMP_AHEAD', `Jump-ahead "${reply}" from ${currEq} (orig: ${origEq})`, () => {
      const h = buildTutorHistory(origEq, currEq, 'Next step: isolate the variable term. What do you get?');
      const state = extractActiveProblemState(h);
      state.active.currentStepEquation = currEq;
      const intent = classifyStudentIntent(reply, h, state);
      const evalRes = evaluateStudentWork(reply, intent, h, state);
      assert.strictEqual(evalRes.status, expectedStatus);
      assert.strictEqual(evalRes.evaluationCategory, expectedCat);
      assert.strictEqual(evalRes.jumpedAhead, true);
    });
  }

  // =========================================================================
  // CATEGORY 10: Invalid Transformations (>= 15 cases)
  // =========================================================================
  console.log('▶ [10] Invalid Transformations');
  const invalidTransformCases = [
    ['3x^2 - 3 = 48', '3x squared equals 48', 'STEP_VERIFIED_INCORRECT', 'Omitted adding 3 to RHS'],
    ['3x^2 - 3 = 48', '3x^2 = 45', 'STEP_VERIFIED_INCORRECT', 'Subtracted 3 instead of adding 3'],
    ['3x^2 - 3 = 48', 'x^2 = 16', 'STEP_VERIFIED_INCORRECT', 'Divided 48 by 3 without adding 3 first'],
    ['(3x^2 - 3)/4 = 12', '3x^2 - 3 = 12', 'STEP_VERIFIED_INCORRECT', 'Cleared denominator without multiplying RHS by 4'],
    ['(3x^2 - 3)/4 = 12', '3x^2 - 12 = 48', 'STEP_VERIFIED_INCORRECT', 'Multiplied numerator by 4 instead of cancelling denominator'],
    ['3x + 7 = 22', '3x = 29', 'STEP_VERIFIED_INCORRECT', 'Added 7 instead of subtracting 7'],
    ['3x + 7 = 22', '3x = 16', 'STEP_VERIFIED_INCORRECT', 'Arithmetic subtraction error 22 - 7 != 16'],
    ['2x - 5 = 11', '2x = 6', 'STEP_VERIFIED_INCORRECT', 'Subtracted 5 instead of adding 5'],
    ['2x - 5 = 11', '2x = 11', 'STEP_VERIFIED_INCORRECT', 'Omitted adding 5 to RHS'],
    ['4x + 8 = 20', 'x = 5', 'ANSWER_VERIFIED_INCORRECT', 'Wrong root x = 5 for 4x + 8 = 20'],
    ['3x^2 - 3 = 48', 'Sqrt(15)', 'ANSWER_VERIFIED_INCORRECT', 'Wrong radical root Sqrt(15)'],
    ['3x^2 - 3 = 48', 'root 16', 'ANSWER_VERIFIED_INCORRECT', 'Wrong spoken radical root 16'],
    ['2x^2 + 4 = 36', '2x^2 = 40', 'STEP_VERIFIED_INCORRECT', 'Sign mistake adding 4 instead of subtracting'],
    ['5x^2 - 10 = 40', '5x^2 = 30', 'STEP_VERIFIED_INCORRECT', 'Sign mistake subtracting 10 instead of adding'],
    ['3x + 7 = 22', 'Actually I meant 3x = 16 so x = 5', 'STEP_VERIFIED_INCORRECT', 'Chained equation with invalid first step']
  ];
  for (const [eq, reply, expectedStatus, desc] of invalidTransformCases) {
    checkCase('10_INVALID_TRANSFORMATIONS', `${desc} ("${reply}" on ${eq})`, () => {
      const h = buildTutorHistory(eq, eq, 'What is the next step?');
      const state = extractActiveProblemState(h);
      state.active.currentStepEquation = eq;
      const intent = classifyStudentIntent(reply, h, state);
      const evalRes = evaluateStudentWork(reply, intent, h, state);
      assert.strictEqual(evalRes.status, expectedStatus);
      assert.strictEqual(evalRes.evaluationCategory, 'INCORRECT_TRANSFORMATION');
    });
  }

  // =========================================================================
  // CATEGORY 11: Domain Restriction and Extraneous-Root Cases (>= 10 cases)
  // =========================================================================
  console.log('▶ [11] Domain Restriction and Extraneous-Root Cases');
  const domainCases = [
    ['sqrt(x) = -2', 'x = 4', 'ANSWER_VERIFIED_INCORRECT', 'radical_extraneous_root', 'Squaring sqrt(x) = -2 introduces extraneous root x = 4'],
    ['sqrt(x + 3) = x - 3', 'x = 1', 'ANSWER_VERIFIED_INCORRECT', 'radical_extraneous_root', 'Extraneous root x = 1 from squaring sqrt(x+3) = x-3'],
    ['x - 1 = 3', '(x - 1)^2 = 9', 'STEP_VERIFIED_INCORRECT', 'squaring_introduces_extraneous_roots', 'Squaring both sides of linear equation introduces extraneous root x = -2'],
    ['x - 2 = 0', 'x^2 - 2x = 0', 'STEP_VERIFIED_INCORRECT', 'variable_multiplier_changes_roots', 'Multiplying both sides by x introduces extraneous root x = 0'],
    ['2x = 6', '2x^2 = 6x', 'STEP_VERIFIED_INCORRECT', 'variable_multiplier_changes_roots', 'Multiplying both sides by x alters solution set'],
    ['(x^2 - 4)/(x - 2) = 0', 'x^2 - 4 = 0', 'STEP_VERIFIED_INCORRECT', 'extraneous_pole_introduced', 'Clearing denominator (x - 2) without restriction admits pole x = 2'],
    ['(x^2 - 4)/(x - 2) = 0', 'x = 2', 'ANSWER_VERIFIED_INCORRECT', 'division_by_zero', 'Proposing pole x = 2 where denominator is zero'],
    ['x/(x - 3) = 3/(x - 3)', 'x = 3', 'ANSWER_VERIFIED_INCORRECT', 'division_by_zero', 'Proposing pole x = 3 in rational equation'],
    ['1/(x + 1) = 0', 'x = -1', 'ANSWER_VERIFIED_INCORRECT', 'division_by_zero', 'Proposing pole x = -1 in rational equation'],
    ['log(x) = 1', 'x = -10', 'ANSWER_VERIFIED_INCORRECT', 'logarithm_domain_violation', 'Negative argument x = -10 violates real logarithm domain'],
    ['sqrt(x - 5) = 2', 'x = 1', 'ANSWER_VERIFIED_INCORRECT', 'radical_domain_violation', 'x = 1 makes radicand negative in sqrt(x - 5)']
  ];
  for (const [eq, reply, expectedStatus, expectedViolation, desc] of domainCases) {
    checkCase('11_DOMAIN_AND_EXTRANEOUS', desc, () => {
      const h = buildTutorHistory(eq, eq, 'Solve the equation.');
      const state = extractActiveProblemState(h);
      state.active.activeExpression = eq;
      state.active.currentStepEquation = eq;
      const intent = classifyStudentIntent(reply, h, state);
      const evalRes = evaluateStudentWork(reply, intent, h, state);
      assert.strictEqual(evalRes.status, expectedStatus);
      assert.strictEqual(evalRes.evaluationCategory, 'INCORRECT_TRANSFORMATION');
      assert.strictEqual(evalRes.domainViolation, expectedViolation);
    });
  }

  // =========================================================================
  // CATEGORY 12: Raw-Input Preservation (>= 10 cases)
  // =========================================================================
  console.log('▶ [12] Raw-Input Preservation');
  const rawPreservationInputs = [
    'Can you help me find the derivitive of x squared?',
    'I think I need to simp ilfy this quadradic.',
    '3x²-3=48',
    'Sqrt(17)',
    'plus or minus root 17',
    '3x squared minus 3 equals 48',
    '51',
    'add 3',
    '1/2x + 3 = 7',
    'the square root of x plus 3',
    '  leading and trailing whitespace with derivitive  '
  ];
  for (const rawStr of rawPreservationInputs) {
    checkCase('12_RAW_INPUT_PRESERVATION', `Byte-for-byte preservation of "${rawStr}"`, () => {
      const copyBefore = String(rawStr);
      const interpreted = interpretUserTurn(rawStr, activeTutorHist, activeTutorState);
      assert.strictEqual(interpreted.rawText, copyBefore, 'interpretUserTurn must preserve rawText byte-for-byte');
      const intent = classifyStudentIntent(rawStr, activeTutorHist, activeTutorState, interpreted);
      assert.strictEqual(intent.rawText, copyBefore, 'classifyStudentIntent must preserve rawText byte-for-byte');
      const evalRes = evaluateStudentWork(rawStr, intent, activeTutorHist, activeTutorState);
      assert.strictEqual(evalRes.rawText, copyBefore, 'evaluateStudentWork must preserve rawText byte-for-byte');
    });
  }

  // =========================================================================
  // CATEGORY 13: Verification-Status Integrity & 7-Category Taxonomy (>= 10 cases)
  // =========================================================================
  console.log('▶ [13] Verification-Status Integrity & 7-Category Taxonomy');
  const forbiddenStatuses = new Set(['STEP_VERIFIED_CORRECT', 'ANSWER_VERIFIED_CORRECT', 'VERIFIED', 'PARTIALLY_VERIFIED']);

  for (const sample of ['3x²-3=48', 'Sqrt(17)', 'plus or minus root 17', '51', 'add 3', 'x = 4']) {
    checkCase('13_VERIFICATION_INTEGRITY', `interpretUserTurn never assigns verification status on "${sample}"`, () => {
      const turn = interpretUserTurn(sample, activeTutorHist, activeTutorState);
      assert(!forbiddenStatuses.has(turn.interpretationStatus), `Forbidden status ${turn.interpretationStatus}`);
      assert(!('verified' in turn), 'interpretUserTurn must not output verified boolean');
      assert(typeof turn.interpretationConfidence === 'number');
      assert(Array.isArray(turn.provenance));
    });
  }

  // Verify all 7 distinct evaluationCategories are produced accurately by evaluateStudentWork
  const taxonomyChecks = [
    ['1. CORRECT_FINAL_ANSWER', 'plus or minus root 17', activeTutorHist, activeTutorState, 'CORRECT_FINAL_ANSWER'],
    ['2. CORRECT_INTERMEDIATE_STEP', '51', activeTutorHist, activeTutorState, 'CORRECT_INTERMEDIATE_STEP'],
    ['3. VALID_JUMP_AHEAD', 'Sqrt(17)', activeTutorHist, activeTutorState, 'VALID_JUMP_AHEAD'],
    ['4. CORRECT_OPERATION_UNEXECUTED', 'add 3', activeTutorHist, activeTutorState, 'CORRECT_OPERATION_UNEXECUTED'],
    ['5. INCORRECT_TRANSFORMATION', '3x squared equals 48', activeTutorHist, activeTutorState, 'INCORRECT_TRANSFORMATION'],
    ['6. AMBIGUOUS_RESPONSE', 'the square root of x plus 3', activeTutorHist, activeTutorState, 'AMBIGUOUS_RESPONSE'],
    ['7. UNRELATED_OR_CONVERSATIONAL', 'Actually, can you explain the quadratic formula instead?', activeTutorHist, activeTutorState, 'UNRELATED_OR_CONVERSATIONAL']
  ];
  for (const [label, input, hist, state, expectedCategory] of taxonomyChecks) {
    checkCase('13_VERIFICATION_INTEGRITY', `7-Category Taxonomy check: ${label}`, () => {
      const intent = classifyStudentIntent(input, hist, state);
      const evalRes = evaluateStudentWork(input, intent, hist, state);
      assert.strictEqual(evalRes.evaluationCategory, expectedCategory);
    });
  }

  // =========================================================================
  // PERFORMANCE BENCHMARK
  // =========================================================================
  const perfStart = performance.now();
  const iterations = 1000;
  for (let i = 0; i < iterations; i++) {
    interpretUserTurn(`Can you help me find the derivitive of ${i}x squared plus 3?`, activeTutorHist, activeTutorState);
  }
  const totalPerfMs = performance.now() - perfStart;
  const avgMs = totalPerfMs / iterations;

  console.log('\n======================================================================');
  console.log('CATEGORY COVERAGE SUMMARY:');
  for (const [cat, count] of Object.entries(categoryCounts)) {
    console.log(`  • ${cat.padEnd(34)} : ${count} cases`);
  }
  console.log('----------------------------------------------------------------------');
  console.log(`PERFORMANCE: ${iterations} uncached turns interpreted in ${totalPerfMs.toFixed(2)}ms (${avgMs.toFixed(4)}ms/turn)`);
  console.log(`TOTAL RESULTS: ${passedCases}/${totalCases} PASSED (${failedCases} FAILED)`);
  console.log('======================================================================');
}

runCampaign();
