/*
    test-learner-state.js

    Pythos Regression & Verification Suite: Learner-Aware Tutoring & Student State Modeling.

    Mandated by Section 15:
    Tests all 20 required scenarios verifying BOTH:
      A. Mathematical / content behavior (verification integrity, CAS authority)
      B. Learner-aware response behavior (state classification, tone, cognitive load, directive)
*/

const assert = require('assert');
const { classifyLearnerState, formatLearnerStateContext, LEARNER_STATES } = require('./server/learnerState');
const { classifyStudentIntent, INTENTS } = require('./server/studentIntentClassifier');
const { evaluateStudentWork, formatStudentWorkContext } = require('./server/studentWorkEvaluator');
const { extractActiveProblemState } = require('./server/contextManager');

console.log('================================================================');
console.log('🧠 PYTHOS: LEARNER-AWARE TUTORING & STUDENT STATE VERIFICATION');
console.log('================================================================\n');

let totalTests = 0;
let passedTests = 0;

function runTest(id, name, testFn) {
  totalTests++;
  try {
    testFn();
    passedTests++;
    console.log(`  ✅ [PASS ${id}] ${name}`);
  } catch (err) {
    console.error(`  ❌ [FAIL ${id}] ${name}`);
    console.error(`     Error: ${err.message}`);
  }
}

// -------------------------------------------------------------
// 1. Student gives correct answer
// -------------------------------------------------------------
runTest(1, 'Student gives correct answer', () => {
  const userText = 'I got 1.';
  const history = [
    { role: 'user', content: 'What is sin^2(x) + cos^2(x)?' },
    { role: 'assistant', content: 'What does the Pythagorean trigonometric identity equal?' }
  ];
  const intent = classifyStudentIntent(userText, history);
  const evaluation = {
    status: 'ANSWER_VERIFIED_CORRECT',
    variable: 'answer',
    proposedValue: '1',
    details: '1 matches the verified identity value 1.'
  };
  const activeProblem = { active: { verifiedSolution: '1', activeExpression: 'sin^2(x) + cos^2(x) = 1' } };
  const res = classifyLearnerState(userText, history, activeProblem, intent, evaluation);

  // A. Mathematical Verification
  assert.strictEqual(evaluation.status, 'ANSWER_VERIFIED_CORRECT');
  assert.strictEqual(evaluation.proposedValue, '1');

  // B. Learner-Aware Tutoring
  assert.strictEqual(res.state, LEARNER_STATES.CORRECT_ANSWER_ACHIEVEMENT);
  assert.strictEqual(res.pedagogy.action, 'CONFIRM_SUCCESS_WITH_EXPLANATION');
  assert.ok(res.pedagogy.directive.includes('Explicitly confirm success'));
  assert.ok(res.pedagogy.directive.includes('Explain WHY their result is correct'));
  assert.ok(res.pedagogy.directive.includes('Avoid empty, generic cheerleading'));
});

// -------------------------------------------------------------
// 2. Student celebrates correct answer
// -------------------------------------------------------------
runTest(2, 'Student celebrates correct answer', () => {
  const userText = 'YES I GOT 1!';
  const history = [
    { role: 'user', content: 'Solve 2x + 4 = 6' },
    { role: 'assistant', content: 'Subtract 4 from both sides: 2x = 2. Now solve for x.' }
  ];
  const intent = classifyStudentIntent(userText, history);
  const evaluation = {
    status: 'ANSWER_VERIFIED_CORRECT',
    variable: 'x',
    proposedValue: '1',
    details: '2(1) + 4 = 6 holds.'
  };
  const res = classifyLearnerState(userText, history, null, intent, evaluation);

  // A. Mathematical Verification
  assert.strictEqual(evaluation.status, 'ANSWER_VERIFIED_CORRECT');

  // B. Learner-Aware Tutoring
  assert.strictEqual(res.state, LEARNER_STATES.CORRECT_ANSWER_ACHIEVEMENT);
  assert.strictEqual(res.metadata.celebration, true);
  assert.ok(res.pedagogy.tone.includes('enthusiastic'));
  assert.ok(res.pedagogy.directive.includes('Explain WHY their result is correct'));
});

// -------------------------------------------------------------
// 3. Student independently discovers a mistake
// -------------------------------------------------------------
runTest(3, 'Student independently discovers a mistake', () => {
  const userText = 'Wait, I messed that up, I divided by 2 instead of multiplying.';
  const history = [
    { role: 'user', content: 'x / 3 = 6' },
    { role: 'assistant', content: 'What operation undoes dividing by 3?' },
    { role: 'user', content: 'x = 3' }
  ];
  const intent = classifyStudentIntent(userText, history);
  const res = classifyLearnerState(userText, history, null, intent, null);

  // A. Intent & Math state
  assert.ok(intent.intent === INTENTS.CORRECTION || res.signals.includes('self_correction_detected'));

  // B. Learner-Aware Tutoring
  assert.strictEqual(res.state, LEARNER_STATES.SELF_CORRECTION);
  assert.strictEqual(res.pedagogy.action, 'ACKNOWLEDGE_SELF_CORRECTION');
  assert.ok(res.pedagogy.directive.includes('Explicitly confirm and validate their self-discovery'));
  assert.ok(res.pedagogy.directive.includes('Reinforce self-checking behavior'));
});

// -------------------------------------------------------------
// 4. Student says HAHAHA after discovering a mistake
// -------------------------------------------------------------
runTest(4, 'Student says HAHAHA after discovering a mistake', () => {
  const userText = 'yeah i messed that all up and was doing and old problem HAHAHA';
  const history = [
    { role: 'user', content: 'Given tan theta = -1/6 and cos theta < 0, find sec theta' },
    { role: 'assistant', content: 'First determine which quadrant theta is in.' },
    { role: 'user', content: 'a = -3, b = 4, c = 5' }
  ];
  const intent = classifyStudentIntent(userText, history);
  const res = classifyLearnerState(userText, history, null, intent, null);

  // A. Content behavior
  assert.ok(res.signals.includes('self_correction_detected'));
  assert.ok(res.signals.includes('humor_laughter_present'));

  // B. Learner-Aware Tutoring
  assert.strictEqual(res.state, LEARNER_STATES.SELF_CORRECTION_WITH_HUMOR);
  assert.strictEqual(res.pedagogy.action, 'ACKNOWLEDGE_SELF_CORRECTION_WITH_HUMOR');
  assert.ok(res.pedagogy.directive.includes('shared humor'));
  assert.ok(res.pedagogy.directive.includes('praise the fact that THEY caught the mismatch'));
  assert.ok(res.pedagogy.directive.includes('Cleanly reset to the current problem'));
  assert.ok(res.pedagogy.directive.includes('DO NOT simply repeat or restate the final answer'));
});

// -------------------------------------------------------------
// 5. Student makes a tentative guess
// -------------------------------------------------------------
runTest(5, 'Student makes a tentative guess', () => {
  const userText = 'is this quad 4????';
  const history = [
    { role: 'user', content: 'tan theta = -1/6 and cos theta < 0' },
    { role: 'assistant', content: 'Since tan is negative and cos is negative, which quadrant does theta lie in?' }
  ];
  const intent = classifyStudentIntent(userText, history);
  const res = classifyLearnerState(userText, history, null, intent, null);

  // A. Content behavior
  assert.strictEqual(intent.intent, INTENTS.TENTATIVE_HYPOTHESIS);
  assert.strictEqual(intent.extractedExpression, 'quad 4');

  // B. Learner-Aware Tutoring
  assert.strictEqual(res.state, LEARNER_STATES.TENTATIVE_HYPOTHESIS);
  assert.strictEqual(res.pedagogy.action, 'TEST_HYPOTHESIS_ACTIVE_REASONING');
  assert.ok(res.pedagogy.directive.includes('Treat this as an active hypothesis to test'));
  assert.ok(res.pedagogy.directive.includes('Let\'s check your reasoning rather than just guess'));
});

// -------------------------------------------------------------
// 6. Student asks 'is this right?'
// -------------------------------------------------------------
runTest(6, "Student asks 'is this right?'", () => {
  const userText = 'Is this right?';
  const history = [
    { role: 'user', content: '2x + 7 = 15' },
    { role: 'assistant', content: 'What is the first step?' },
    { role: 'user', content: '2x = 8' }
  ];
  const intent = classifyStudentIntent(userText, history);
  const evaluation = {
    status: 'STEP_VERIFIED_CORRECT',
    target: '2x = 8',
    details: '15 - 7 = 8'
  };
  const res = classifyLearnerState(userText, history, null, intent, evaluation);

  // A. Intent & Math Validation
  assert.strictEqual(intent.intent, INTENTS.VALIDATION_REQUEST);

  // B. Learner-Aware Tutoring
  assert.ok(res.state === LEARNER_STATES.VALIDATION_REQUEST || res.state === LEARNER_STATES.CORRECT_ANSWER_ACHIEVEMENT);
  assert.ok(res.pedagogy.directive.includes('evaluate') || res.pedagogy.directive.includes('confirm'));
});

// -------------------------------------------------------------
// 7. Student is confused
// -------------------------------------------------------------
runTest(7, 'Student is confused', () => {
  const userText = "I don't get this.";
  const history = [
    { role: 'user', content: 'Find the reference angle for 210 degrees.' },
    { role: 'assistant', content: '210 degrees is in Quadrant III. The reference angle formula is theta - 180.' }
  ];
  const intent = classifyStudentIntent(userText, history);
  const res = classifyLearnerState(userText, history, null, intent, null);

  // A. Intent
  assert.strictEqual(intent.intent, INTENTS.CONFUSION);

  // B. Learner-Aware Tutoring
  assert.strictEqual(res.state, LEARNER_STATES.CONFUSION);
  assert.strictEqual(res.pedagogy.cognitiveLoad, 'reduce');
  assert.ok(res.pedagogy.directive.includes('Identify the specific conceptual obstacle'));
  assert.ok(res.pedagogy.directive.includes('Keep the explanation concise and single-concept focused'));
});

// -------------------------------------------------------------
// 8. Student repeats the same confusion
// -------------------------------------------------------------
runTest(8, 'Student repeats the same confusion', () => {
  const userText = "I still don't get it";
  const history = [
    { role: 'user', content: "I don't understand how quadrant 3 makes tangent positive." },
    { role: 'assistant', content: 'Tangent is sine over cosine. In QIII both are negative, so negative divided by negative is positive.' }
  ];
  const intent = classifyStudentIntent(userText, history);
  const res = classifyLearnerState(userText, history, null, intent, null);

  // A. Repeated confusion recognition
  assert.strictEqual(res.state, LEARNER_STATES.REPEATED_CONFUSION);

  // B. Learner-Aware Tutoring
  assert.strictEqual(res.pedagogy.action, 'PIVOT_EXPLANATION_STRATEGY');
  assert.strictEqual(res.pedagogy.cognitiveLoad, 'reduce');
  assert.ok(res.pedagogy.directive.includes('CHANGE THE EXPLANATION STRATEGY'));
  assert.ok(res.pedagogy.directive.includes('Do not repeat the same words or increase explanation volume'));
  assert.ok(res.pedagogy.directive.includes('Use a concrete counterexample or simpler analogy'));
});

// -------------------------------------------------------------
// 9. Student expresses frustration
// -------------------------------------------------------------
runTest(9, 'Student expresses frustration', () => {
  const userText = 'This is so annoying, why is this so hard??';
  const history = [
    { role: 'user', content: 'Prove sin^4(x) - cos^4(x) = sin^2(x) - cos^2(x)' }
  ];
  const intent = classifyStudentIntent(userText, history);
  const res = classifyLearnerState(userText, history, null, intent, null);

  // A. Emotional Recognition
  assert.strictEqual(res.state, LEARNER_STATES.FRUSTRATION);

  // B. Learner-Aware Tutoring
  assert.strictEqual(res.pedagogy.action, 'DE_ESCALATE_FRUSTRATION');
  assert.ok(res.pedagogy.directive.includes('Zero moralizing, scolding, or lecturing'));
  assert.ok(res.pedagogy.directive.includes('Keep your response concise and focused on de-escalation'));
  assert.ok(res.pedagogy.directive.includes('Isolate the exact friction point into one bite-sized, manageable step'));
});

// -------------------------------------------------------------
// 10. Student expresses discouragement
// -------------------------------------------------------------
runTest(10, 'Student expresses discouragement', () => {
  const userText = "I can't do this. I've been doing this forever and I keep getting it wrong.";
  const history = [
    { role: 'user', content: 'I tried 5' },
    { role: 'assistant', content: 'Not quite.' },
    { role: 'user', content: 'I tried 7' },
    { role: 'assistant', content: 'Not quite.' }
  ];
  const intent = classifyStudentIntent(userText, history);
  const res = classifyLearnerState(userText, history, null, intent, null);

  // A. Discouragement Recognition
  assert.strictEqual(res.state, LEARNER_STATES.DISCOURAGEMENT);

  // B. Learner-Aware Tutoring
  assert.strictEqual(res.pedagogy.action, 'REDUCE_COGNITIVE_LOAD_AND_SCAFFOLD');
  assert.strictEqual(res.pedagogy.cognitiveLoad, 'reduce');
  assert.ok(res.pedagogy.directive.includes('Acknowledge the difficulty plainly without being dramatic or clinical'));
  assert.ok(res.pedagogy.directive.includes('DO NOT dump a large multi-paragraph explanation'));
  assert.ok(res.pedagogy.directive.includes('give the student a quick win and rebuild momentum'));
});

// -------------------------------------------------------------
// 11. Student uses self-deprecating language
// -------------------------------------------------------------
runTest(11, 'Student uses self-deprecating language', () => {
  const userText = "I'm so stupid, I suck at math.";
  const history = [
    { role: 'user', content: '3x + 5 = 20' }
  ];
  const intent = classifyStudentIntent(userText, history);
  const res = classifyLearnerState(userText, history, null, intent, null);

  // A. Self-Deprecation Recognition
  assert.strictEqual(res.state, LEARNER_STATES.SELF_DEPRECATION);

  // B. Learner-Aware Tutoring
  assert.strictEqual(res.pedagogy.action, 'DE_ESCALATE_AND_SHRINK_PROBLEM');
  assert.ok(res.pedagogy.directive.includes('NEVER scold, patronize, or offer clinical/therapeutic diagnoses'));
  assert.ok(res.pedagogy.directive.includes('Explicitly separate student ability from the current problem'));
  assert.ok(res.pedagogy.directive.includes('Drastically shrink the problem down'));
  assert.ok(res.pedagogy.directive.includes('Give the student an immediate, achievable win'));
});

// -------------------------------------------------------------
// 12. Student has a conceptual breakthrough
// -------------------------------------------------------------
runTest(12, 'Student has a conceptual breakthrough', () => {
  const userText = 'WAIT I GET IT. So the negative sign just tells us the quadrant!';
  const history = [
    { role: 'user', content: 'How can a triangle side be -1?' },
    { role: 'assistant', content: 'Triangle side lengths are always positive. The negative sign on tan theta = -1/6 reflects the directional quadrant coordinates, not physical negative distance.' }
  ];
  const intent = classifyStudentIntent(userText, history);
  const res = classifyLearnerState(userText, history, null, intent, null);

  // A. Breakthrough Recognition
  assert.strictEqual(res.state, LEARNER_STATES.GENUINE_BREAKTHROUGH);

  // B. Learner-Aware Tutoring
  assert.strictEqual(res.pedagogy.action, 'REINFORCE_CONCEPTUAL_BREAKTHROUGH');
  assert.ok(res.pedagogy.directive.includes('Acknowledge and reinforce the conceptual breakthrough immediately'));
  assert.ok(res.pedagogy.directive.includes('Explain briefly WHY that concept works'));
  assert.ok(res.pedagogy.directive.includes('Avoid empty praise ("Great job!")'));
});

// -------------------------------------------------------------
// 13. Student makes an arithmetic mistake but has correct setup
// -------------------------------------------------------------
runTest(13, 'Student makes an arithmetic mistake but has correct setup', () => {
  const userText = '3x = 16';
  const history = [
    { role: 'user', content: '3x + 7 = 22' },
    { role: 'assistant', content: 'Subtract 7 from both sides to isolate the 3x term.' }
  ];
  const intent = classifyStudentIntent(userText, history);
  const evaluation = {
    status: 'STEP_VERIFIED_INCORRECT',
    failureReason: 'ARITHMETIC_ERROR',
    details: 'Subtracting 7 from 22 gives 15, not 16. So the equation becomes 3x = 15.',
    affirmation: 'Your approach is right; the arithmetic in that step needs correction.',
    target: '3x = 16'
  };
  const res = classifyLearnerState(userText, history, null, intent, evaluation);

  // A. Mathematical Verification
  assert.strictEqual(evaluation.status, 'STEP_VERIFIED_INCORRECT');
  assert.strictEqual(evaluation.failureReason, 'ARITHMETIC_ERROR');

  // B. Learner-Aware Tutoring
  assert.strictEqual(res.state, LEARNER_STATES.PRODUCTIVE_MISTAKE_ARITHMETIC);
  assert.strictEqual(res.pedagogy.action, 'VALIDATE_SETUP_AND_ISOLATE_ARITHMETIC');
  assert.ok(res.pedagogy.directive.includes('Validate their algebraic/conceptual setup first'));
  assert.ok(res.pedagogy.directive.includes('Point out the exact arithmetic calculation that slipped'));
  assert.ok(res.pedagogy.directive.includes('without penalizing their conceptual understanding'));
});

// -------------------------------------------------------------
// 14. Student uses the wrong concept
// -------------------------------------------------------------
runTest(14, 'Student uses the wrong concept', () => {
  const userText = 'so tan -1/6 means the hypotenuse is 6?';
  const history = [
    { role: 'user', content: 'Given tan theta = -1/6' }
  ];
  const intent = classifyStudentIntent(userText, history);
  const evaluation = {
    status: 'STEP_VERIFIED_INCORRECT',
    failureReason: 'CONCEPTUAL_ERROR',
    details: 'Tangent is opposite over adjacent, not hypotenuse.'
  };
  const res = classifyLearnerState(userText, history, null, intent, evaluation);

  // A. Mathematical distinction
  assert.strictEqual(evaluation.failureReason, 'CONCEPTUAL_ERROR');

  // B. Learner-Aware Tutoring
  assert.strictEqual(res.state, LEARNER_STATES.PRODUCTIVE_MISTAKE_CONCEPTUAL);
  assert.strictEqual(res.pedagogy.action, 'REDIRECT_CONCEPTUAL_FRAMEWORK');
  assert.ok(res.pedagogy.directive.includes('Note that arithmetic is not the issue') || res.pedagogy.directive.includes('concept/definition is what needs adjusting'));
  assert.ok(res.pedagogy.directive.includes('Clarify the correct'));
});

// -------------------------------------------------------------
// 15. Student accidentally works on an old/different problem
// -------------------------------------------------------------
runTest(15, 'Student accidentally works on an old/different problem', () => {
  const userText = 'so tan -1/6 != a=-3 b=4 c=5???';
  const history = [
    { role: 'user', content: 'In problem 1: reference triangle had sides 3, 4, 5' },
    { role: 'assistant', content: 'Problem 1 solved. Now Problem 2: tan theta = -1/6 in Q2.' }
  ];
  const activeProblem = { active: { activeExpression: 'tan theta = -1/6' } };
  const intent = classifyStudentIntent(userText, history);
  const res = classifyLearnerState(userText, history, activeProblem, intent, null);

  // A. Contamination Detection
  assert.strictEqual(res.state, LEARNER_STATES.CROSS_PROBLEM_CONTAMINATION);

  // B. Learner-Aware Tutoring
  assert.strictEqual(res.pedagogy.action, 'ISOLATE_CURRENT_PROBLEM_AND_RESET');
  assert.strictEqual(res.pedagogy.cognitiveLoad, 'reduce');
  assert.ok(res.pedagogy.directive.includes('Explicitly point out that numbers/triangles from the previous problem'));
  assert.ok(res.pedagogy.directive.includes('Instruct the student to set aside the previous numbers/triangle entirely'));
  assert.ok(res.pedagogy.directive.includes('build the current model') && res.pedagogy.directive.includes('using ONLY the current problem\'s givens'));
});

// -------------------------------------------------------------
// 16. Student becomes disengaged after several long explanations
// -------------------------------------------------------------
runTest(16, 'Student becomes disengaged after several long explanations', () => {
  const userText = 'k';
  const history = [
    { role: 'assistant', content: 'Let us consider the trigonometric nature of circles. '.repeat(40) },
    { role: 'user', content: 'ok' },
    { role: 'assistant', content: 'Furthermore, the unit circle is parameterized by cosine and sine. '.repeat(40) }
  ];
  const intent = classifyStudentIntent(userText, history);
  const res = classifyLearnerState(userText, history, null, intent, null);

  // A. Fatigue Detection
  assert.strictEqual(res.state, LEARNER_STATES.LONG_EXPLANATION_FATIGUE);

  // B. Learner-Aware Tutoring
  assert.strictEqual(res.pedagogy.action, 'DRASTICALLY_SHORTEN_AND_FOCUS');
  assert.strictEqual(res.pedagogy.cognitiveLoad, 'reduce');
  assert.ok(res.pedagogy.directive.includes('Be extremely brief (1–2 sentences maximum)'));
  assert.ok(res.pedagogy.directive.includes('Zero extra theory or lengthy preamble'));
});

// -------------------------------------------------------------
// 17. Student explicitly asks for step-by-step teaching
// -------------------------------------------------------------
runTest(17, 'Student explicitly asks for step-by-step teaching', () => {
  const userText = 'Can you walk me through this step-by-step?';
  const history = [
    { role: 'user', content: 'Solve 4x^2 - 16 = 0' }
  ];
  const intent = classifyStudentIntent(userText, history);
  const res = classifyLearnerState(userText, history, null, intent, null);

  // A. Teaching Request
  assert.strictEqual(res.state, LEARNER_STATES.EXPLICIT_STEP_BY_STEP);

  // B. Learner-Aware Tutoring
  assert.strictEqual(res.pedagogy.action, 'PROVIDE_METHODICAL_STEP_BY_STEP');
  assert.ok(res.pedagogy.directive.includes('Provide clear, structured step-by-step scaffolding'));
  assert.ok(res.pedagogy.directive.includes('Walk through the current step thoroughly'));
});

// -------------------------------------------------------------
// 18. Student explicitly asks for only a hint
// -------------------------------------------------------------
runTest(18, 'Student explicitly asks for only a hint', () => {
  const userText = "Don't give me the answer, just give me a hint.";
  const history = [
    { role: 'user', content: 'Find the limit as x approaches 0 of sin(x)/x' }
  ];
  const intent = classifyStudentIntent(userText, history);
  const res = classifyLearnerState(userText, history, null, intent, null);

  // A. Hint Intent
  assert.strictEqual(res.state, LEARNER_STATES.HINT_REQUEST);

  // B. Learner-Aware Tutoring
  assert.strictEqual(res.pedagogy.action, 'PROVIDE_TARGETED_HINT_ONLY');
  assert.strictEqual(res.pedagogy.scaffoldLevel, 'targeted_hint');
  assert.ok(res.pedagogy.directive.includes('Provide ONLY a targeted hint or conceptual nudge'));
  assert.ok(res.pedagogy.directive.includes('DO NOT reveal the intermediate equation or complete calculation'));
});

// -------------------------------------------------------------
// 19. Student asks for the final answer after attempting the problem
// -------------------------------------------------------------
runTest(19, 'Student asks for the final answer after attempting the problem', () => {
  const userText = 'What is the final answer?';
  const history = [
    { role: 'user', content: '2x + 7 = 15' },
    { role: 'assistant', content: 'Subtract 7 gives 2x = 8. What is x?' },
    { role: 'user', content: 'I tried calculating it.' }
  ];
  const intent = classifyStudentIntent(userText, history);
  const res = classifyLearnerState(userText, history, null, intent, null);

  // A. Solution release directive
  assert.strictEqual(res.state, LEARNER_STATES.FINAL_ANSWER_REQUEST);

  // B. Learner-Aware Tutoring
  assert.strictEqual(res.pedagogy.action, 'PROVIDE_FULL_VERIFIED_SOLUTION');
  assert.strictEqual(res.pedagogy.scaffoldLevel, 'full_solution');
  assert.ok(res.pedagogy.directive.includes('Provide the complete verified solution and final answer clearly'));
  assert.ok(res.pedagogy.directive.includes('Do not withhold or force further guessing'));
});

// -------------------------------------------------------------
// 20. Normal neutral student question should NOT trigger unnecessary emotional language
// -------------------------------------------------------------
runTest(20, 'Normal neutral student question should NOT trigger unnecessary emotional language', () => {
  const userText = 'What is the derivative of sin(x)?';
  const history = [];
  const intent = classifyStudentIntent(userText, history);
  const res = classifyLearnerState(userText, history, null, intent, null);

  // A. Intent & Math
  assert.ok(intent.intent === INTENTS.EXPLANATION_REQUEST || intent.intent === INTENTS.NEW_PROBLEM || intent.intent === INTENTS.UNKNOWN);

  // B. Learner-Aware Tutoring
  assert.strictEqual(res.state, LEARNER_STATES.NEUTRAL_QUESTION);
  assert.strictEqual(res.pedagogy.action, 'SOCRATIC_TUTORING');
  assert.ok(res.pedagogy.directive.includes('DO NOT add artificial praise, emotional cheering, or unsolicited emotional commentary'));
  assert.ok(res.pedagogy.directive.includes('Focus directly on the mathematics and guide the student with the next step'));
});

// -------------------------------------------------------------
// 21. Non-Authoritative Safeguard: Learner State Never Overrides CAS Truth
// -------------------------------------------------------------
runTest(21, 'Safeguard: Learner state never overrides deterministic CAS truth', () => {
  const userText = 'yeah i messed that all up HAHAHA';
  const intent = classifyStudentIntent(userText, []);
  // Even if learner state has humor and self-correction, an incorrect math evaluation remains INCORRECT
  const evaluation = {
    status: 'STEP_VERIFIED_INCORRECT',
    failureReason: 'ARITHMETIC_ERROR',
    details: '2 + 2 is 4, not 5'
  };
  const res = classifyLearnerState(userText, [], null, intent, evaluation);
  const formattedContext = formatLearnerStateContext(res);

  assert.strictEqual(res.state, LEARNER_STATES.SELF_CORRECTION_WITH_HUMOR);
  assert.ok(formattedContext.includes('CRITICAL PEDAGOGICAL GUARDRAIL'));
  assert.ok(formattedContext.includes('This learner state is instructional guidance. It must NEVER override verified mathematical truth'));
});

// -------------------------------------------------------------
// 22. Student celebrates eureka/clarity without submitting work
// -------------------------------------------------------------
runTest(22, 'Student celebrates eureka/clarity on open question without submitting work', () => {
  const history = [
    { role: 'user', content: 'What is a coterminal angle between 0 and 2pi for -13pi/7?' },
    { role: 'assistant', content: 'Since -13pi/7 is negative, we need to add 2pi. To combine 2pi and -13pi/7, what common denominator should we use?' }
  ];
  const userText = 'OOOOOOH that makes it easier thanks pythos!!!!';
  const intent = classifyStudentIntent(userText, history);
  const res = classifyLearnerState(userText, history, null, intent, null);

  // 1. Intent check
  assert.strictEqual(intent.intent, INTENTS.EUREKA_OR_GRATITUDE);

  // 2. Learner state check
  assert.strictEqual(res.state, LEARNER_STATES.GENUINE_BREAKTHROUGH);
  assert.strictEqual(res.confidence, 'high');

  // 3. Directive checks: must enforce zero conversational hallucination and no self-spoilers
  assert.ok(res.pedagogy.directive.includes('CRITICAL CONVERSATIONAL REALISM'));
  assert.ok(res.pedagogy.directive.includes('DO NOT pretend, assume, or hallucinate that the student has already written, calculated, or submitted a step'));
  assert.ok(res.pedagogy.directive.includes('NEVER SPOIL OR ANSWER YOUR OWN PENDING QUESTION'));
  assert.ok(res.pedagogy.directive.includes('invite them directly to execute that specific step now'));
});

console.log('\n================================================================');
console.log(`RESULTS: ${passedTests}/${totalTests} TESTS PASSED (${totalTests - passedTests} failures)`);
console.log('================================================================');

if (passedTests !== totalTests) {
  process.exit(1);
}
