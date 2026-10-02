/**
 * test-practice-generation.js
 *
 * Comprehensive Test Suite for Pythos Practice-Problem Generation & Pedagogical Safety.
 * Verifies all 14 requirements from Task 19:
 * 1. "Give me another problem."
 * 2. "Give me another problem similar to that one."
 * 3. "Quiz me."
 * 4. "Give me a harder one."
 * 5. "Give me an easier one."
 * 6. "Give me one like the last problem."
 * 7. Generated problem has valid mathematical structure.
 * 8. Generated problem targets the requested concept.
 * 9. Pythos does not unnecessarily solve the generated problem.
 * 10. Pythos does not refuse solely because it cannot verify the final answer.
 * 11. Student can subsequently submit an answer to the generated problem.
 * 12. Submitted answer enters the normal verification pipeline.
 * 13. "What's the answer to the practice problem?" enters normal verified answer delivery.
 * 14. Practice generation does not weaken fail-closed behavior for actual answers.
 */

const assert = require('assert');
const { INTENTS, classifyStudentIntent } = require('./server/studentIntentClassifier');
const {
  DOMAINS,
  SUBTYPES,
  isPracticeRequest,
  extractDifficultyPreference,
  identifyTargetConcept,
  validateProblemStructure,
  generatePracticeProblem,
  formatPracticeProblemDelivery
} = require('./server/practiceProblemGenerator');
const {
  extractActiveProblemState,
  buildEffectivePrompt
} = require('./server/contextManager');
const { evaluateStudentWork } = require('./server/studentWorkEvaluator');
const { getSafeWithholding, WITHHOLDING_REASONS } = require('./server/withholdingTaxonomy');

console.log('================================================================');
console.log('📚 PYTHOS: PRACTICE-PROBLEM GENERATION & SAFETY TEST SUITE');
console.log('================================================================\n');

let passed = 0;
let total = 0;

function runTest(name, fn) {
  total++;
  try {
    fn();
    console.log(`  ✅ [PASS ${total}] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ [FAIL ${total}] ${name}: ${err.message}`);
    throw err;
  }
}

// -------------------------------------------------------------
// 1. "Give me another problem."
// -------------------------------------------------------------
runTest('"Give me another problem." enters PRACTICE_REQUEST', () => {
  const text = "Give me another problem.";
  const classified = classifyStudentIntent(text);
  assert.strictEqual(classified.intent, INTENTS.PRACTICE_REQUEST);
  assert.strictEqual(classified.difficulty, 'similar');
});

// -------------------------------------------------------------
// 2. "Give me another problem similar to that one."
// -------------------------------------------------------------
runTest('"Give me another problem similar to that one." enters PRACTICE_REQUEST', () => {
  const text = "Give me another problem similar to that one.";
  const classified = classifyStudentIntent(text);
  assert.strictEqual(classified.intent, INTENTS.PRACTICE_REQUEST);
  assert.strictEqual(classified.difficulty, 'similar');

  // Also check conversational slang from transcript: "gimme another problem similar to that one"
  const transcriptText = "gimme another problem similar to that one";
  const transcriptClassified = classifyStudentIntent(transcriptText);
  assert.strictEqual(transcriptClassified.intent, INTENTS.PRACTICE_REQUEST);
  assert.strictEqual(transcriptClassified.difficulty, 'similar');
});

// -------------------------------------------------------------
// 3. "Quiz me."
// -------------------------------------------------------------
runTest('"Quiz me." enters PRACTICE_REQUEST', () => {
  const text = "Quiz me.";
  const classified = classifyStudentIntent(text);
  assert.strictEqual(classified.intent, INTENTS.PRACTICE_REQUEST);

  const textWithContext = "Quiz me on this topic";
  assert.strictEqual(classifyStudentIntent(textWithContext).intent, INTENTS.PRACTICE_REQUEST);
});

// -------------------------------------------------------------
// 4. "Give me a harder one."
// -------------------------------------------------------------
runTest('"Give me a harder one." enters PRACTICE_REQUEST with harder difficulty', () => {
  const text = "Give me a harder one.";
  const classified = classifyStudentIntent(text);
  assert.strictEqual(classified.intent, INTENTS.PRACTICE_REQUEST);
  assert.strictEqual(classified.difficulty, 'harder');

  const alt = "Can you make me a more challenging one?";
  assert.strictEqual(classifyStudentIntent(alt).difficulty, 'harder');
});

// -------------------------------------------------------------
// 5. "Give me an easier one."
// -------------------------------------------------------------
runTest('"Give me an easier one." enters PRACTICE_REQUEST with easier difficulty', () => {
  const text = "Give me an easier one.";
  const classified = classifyStudentIntent(text);
  assert.strictEqual(classified.intent, INTENTS.PRACTICE_REQUEST);
  assert.strictEqual(classified.difficulty, 'easier');

  const alt = "Give me a simpler problem please";
  assert.strictEqual(classifyStudentIntent(alt).difficulty, 'easier');
});

// -------------------------------------------------------------
// 6. "Give me one like the last problem."
// -------------------------------------------------------------
runTest('"Give me one like the last problem." enters PRACTICE_REQUEST with similar difficulty', () => {
  const text = "Give me one like the last problem.";
  const classified = classifyStudentIntent(text);
  assert.strictEqual(classified.intent, INTENTS.PRACTICE_REQUEST);
  assert.strictEqual(classified.difficulty, 'similar');

  const alt = "make me another one like that";
  assert.strictEqual(classifyStudentIntent(alt).intent, INTENTS.PRACTICE_REQUEST);
});

// -------------------------------------------------------------
// 7. Generated problem has valid mathematical structure
// -------------------------------------------------------------
runTest('Generated practice problems have valid mathematical structure', () => {
  // Test valid trigonometry candidate
  const trigProb = generatePracticeProblem({
    difficulty: 'similar',
    conversationHistory: [{ role: 'user', content: 'using sketches find the exact value of sec(cot(-36.23))' }]
  });

  const valTrig = validateProblemStructure(trigProb);
  assert(valTrig.valid, `Expected valid structure, got: ${valTrig.reason}`);
  assert(trigProb.problemText.includes('$') || trigProb.problemText.includes('\\'));
  assert(trigProb.expression.length > 0);

  // Test that structural validator catches invalid math
  const invalidDivByZero = {
    problemText: 'Find the value of $x = \\frac{5}{0}$',
    expression: '5/0',
    domain: DOMAINS.ARITHMETIC
  };
  const valZero = validateProblemStructure(invalidDivByZero);
  assert(!valZero.valid);
  assert(valZero.reason.includes('division by zero'));

  const invalidTriangle = {
    problemText: 'A triangle has sides of $3$, $4$, and $10$.',
    expression: '$3, 4, 10$',
    domain: DOMAINS.TRIGONOMETRY
  };
  const valTri = validateProblemStructure(invalidTriangle);
  assert(!valTri.valid);
  assert(valTri.reason.includes('Triangle Inequality'));
});

// -------------------------------------------------------------
// 8. Generated problem targets the requested concept
// -------------------------------------------------------------
runTest('Generated problem targets the requested concept (composite trig & sketches)', () => {
  const history = [
    { role: 'user', content: 'using sketches find the exact value of sec(cot(-36.23))' },
    { role: 'assistant', content: 'The exact value is derived using a reference right triangle...' },
    { role: 'user', content: 'gimme another problem similar to that one' }
  ];

  const concept = identifyTargetConcept(history);
  assert.strictEqual(concept.domain, DOMAINS.TRIGONOMETRY);
  assert.strictEqual(concept.subtype, SUBTYPES.TRIG_COMPOSITE_SKETCH);
  assert(concept.instructionalCharacteristics.includes('reciprocal_trig_functions'));
  assert(concept.instructionalCharacteristics.includes('right_triangle_reasoning'));
  assert(concept.instructionalCharacteristics.includes('sketch_visual_representation'));

  const practice = generatePracticeProblem({ conversationHistory: history });
  assert.strictEqual(practice.domain, DOMAINS.TRIGONOMETRY);
  assert.strictEqual(practice.subtype, SUBTYPES.TRIG_COMPOSITE_SKETCH);
  assert(practice.problemText.toLowerCase().includes('sketch'));
});

// -------------------------------------------------------------
// 9. Pythos does not unnecessarily solve the generated problem
// -------------------------------------------------------------
runTest('Pythos delivers practice problem without unnecessarily solving it', () => {
  const practice = generatePracticeProblem({
    difficulty: 'similar',
    conversationHistory: [{ role: 'user', content: 'using sketches find the exact value of sec(cot(-36.23))' }]
  });

  const response = practice.formattedResponse;
  // Must invite student to try
  assert(/give\s+it\s+a\s+shot|check\s+your\s+work|first\s+step/i.test(response));
  // Must NOT leak boxed final answer in generation turn
  assert(!response.includes('\\boxed'));
  assert(!/\bthe\s+final\s+answer\s+is\b/i.test(response));
});

// -------------------------------------------------------------
// 10. Pythos does not refuse solely because it cannot verify the final answer
// -------------------------------------------------------------
runTest('Practice generation does not trigger safe withholding or timeout failure', () => {
  // Simulate the student asking for practice:
  const lastUserMsg = { role: 'user', content: 'gimme another problem similar to that one' };
  const history = [
    { role: 'user', content: 'using sketches find the exact value of sec(cot(-36.23))' },
    { role: 'assistant', content: 'The value is -sqrt(36.23^2 + 1)/36.23' },
    lastUserMsg
  ];

  const studentIntent = classifyStudentIntent(lastUserMsg.content, history);
  assert.strictEqual(studentIntent.intent, INTENTS.PRACTICE_REQUEST);

  // In practice generation, Pythos produces the practice problem, NEVER withholding
  const practice = generatePracticeProblem({ conversationHistory: history });
  assert(practice && practice.formattedResponse);
  assert(!practice.formattedResponse.includes("That one gave me a workout"));
  assert(!practice.formattedResponse.includes("I don't want to guess"));
});

// -------------------------------------------------------------
// 11. Student can subsequently submit an answer to the generated problem
// -------------------------------------------------------------
runTest('Student can subsequently submit an answer to the generated problem', () => {
  const generatedProblem = 'Using a sketch, find the exact value of $\\csc(\\cot(-28.45))$.';
  const historyWithPractice = [
    { role: 'user', content: 'using sketches find the exact value of sec(cot(-36.23))' },
    { role: 'assistant', content: 'Here is a similar practice problem:\n\n' + generatedProblem + "\n\nDon't solve it yet — give it a shot and I'll check your work!" },
    { role: 'user', content: 'I got -sqrt(810.4025)' }
  ];

  // extractActiveProblemState identifies the practice problem as active
  const state = extractActiveProblemState(historyWithPractice);
  assert(state.active !== null);
  assert.strictEqual(state.active.domain, 'TRIGONOMETRY');
  assert.strictEqual(state.active.subtype, 'TRIG_COMPOSITE_SKETCH');
  assert.strictEqual(state.active.isPracticeProblem, true);

  // Subsequent student answer is classified as PROPOSED_ANSWER
  const ansIntent = classifyStudentIntent(historyWithPractice[2].content, historyWithPractice);
  assert.strictEqual(ansIntent.intent, INTENTS.PROPOSED_ANSWER);
});

// -------------------------------------------------------------
// 12. Submitted answer enters the normal verification pipeline
// -------------------------------------------------------------
runTest('Submitted answer to practice problem enters normal verification pipeline', () => {
  // Test with linear equation practice problem
  const linearHistory = [
    { role: 'user', content: 'Solve 2x + 5 = 15' },
    { role: 'assistant', content: 'Here is another practice problem:\n\nSolve for $x$: $$4x - 9 = 27$$\n\nGive it a shot!' },
    { role: 'user', content: 'I got 9' }
  ];

  const state = extractActiveProblemState(linearHistory);
  assert(state.active !== null);
  assert.strictEqual(state.active.activeExpression, '4x - 9 = 27');

  const intent = classifyStudentIntent('I got 9', linearHistory);
  const evalResult = evaluateStudentWork('I got 9', intent, linearHistory, state);
  assert(evalResult !== null);
  assert.strictEqual(evalResult.status, 'ANSWER_VERIFIED_CORRECT');
  assert.strictEqual(evalResult.proposedValue, 9);
});

// -------------------------------------------------------------
// 13. "What's the answer to the practice problem?" enters normal verified answer delivery
// -------------------------------------------------------------
runTest('"What\'s the answer to the practice problem?" enters answer delivery', () => {
  const text = "What's the answer to the practice problem?";
  const classified = classifyStudentIntent(text);
  // Must NOT be classified as PRACTICE_REQUEST (because user is asking for the answer, not a new problem)
  assert.notStrictEqual(classified.intent, INTENTS.PRACTICE_REQUEST);
  assert.strictEqual(classified.intent, INTENTS.EXPLANATION_REQUEST);

  const alt = "Can you give me the answer?";
  const classifiedAlt = classifyStudentIntent(alt);
  assert.notStrictEqual(classifiedAlt.intent, INTENTS.PRACTICE_REQUEST);
  assert.strictEqual(classifiedAlt.intent, INTENTS.EXPLANATION_REQUEST);
});

// -------------------------------------------------------------
// 14. Practice generation does not weaken fail-closed behavior for actual answers
// -------------------------------------------------------------
runTest('Practice generation does not weaken fail-closed behavior for actual answers', () => {
  // If the student submits a blatantly wrong answer or impossible contradiction,
  // the verifier still flags it and does NOT falsely accept it!
  const linearHistory = [
    { role: 'user', content: 'Solve 2x + 5 = 15' },
    { role: 'assistant', content: 'Here is another practice problem:\n\nSolve for $x$: $$4x - 9 = 27$$\n\nGive it a shot!' },
    { role: 'user', content: 'I got 999' }
  ];

  const state = extractActiveProblemState(linearHistory);
  const intent = classifyStudentIntent('I got 999', linearHistory);
  const evalResult = evaluateStudentWork('I got 999', intent, linearHistory, state);
  assert(evalResult !== null);
  assert.strictEqual(evalResult.status, 'ANSWER_VERIFIED_INCORRECT');

  // If a candidate answer is completely unverified, getSafeWithholding still triggers
  const withholding = getSafeWithholding(WITHHOLDING_REASONS.CLAIM_NOT_VERIFIED);
  assert(withholding !== null);
  assert(withholding.formattedContent.includes("couldn't verify it well enough") || withholding.formattedContent.includes("rather not guess"));
});

console.log('\n================================================================');
console.log(`RESULTS: ${passed}/${total} TESTS PASSED (${total - passed} failures)`);
console.log('================================================================\n');
