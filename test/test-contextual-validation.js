/**
 * test-contextual-validation.js
 *
 * Acceptance Suite for Contextual Validation & Continuation State.
 * Verifies Acceptance Requirements 1, 2, 4, 5:
 *  - Case A: "Solve 2x + 4 = 12" -> "I got 4." -> "Is that right?" (validates x = 4 specifically)
 *  - Case B: "Solve 3x + 7 = 22" -> "So then it becomes 3x = 15." -> "Is this right?" (validates 3x = 15 specifically)
 *  - Case C: "Solve 3x + 7 = 22" -> "So then it becomes 3x = 16" -> "Is this right?" (rejects/corrects 3x = 16 specifically)
 *  - Case D: "-29π/3" -> "So then it becomes -29/3 pi + 2pi * 5" -> "Is this right?" (verifies pi-coterminal transformation)
 *  - Case E: "Continue." after a completed solution (recognizes completion, no repeated substitution)
 *  - Case F: "Continue." during an incomplete solution (advances to next required step without restarting)
 */

const assert = require('assert');
const { INTENTS, classifyStudentIntent } = require('../server/studentIntentClassifier');
const {
  evaluateStudentWork,
  parseLinearEquation,
  evaluateLinearEquationStep,
  formatStudentWorkContext
} = require('../server/studentWorkEvaluator');
const {
  extractActiveProblemState,
  buildBoundedConversationContext
} = require('../server/contextManager');

function runContextualValidationTests() {
  console.log('================================================================');
  console.log('🧪 PYTHOS: CONTEXTUAL VALIDATION & CONTINUATION ACCEPTANCE SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      console.log(`  ✓ [PASS ${total}] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL ${total}] ${name}:`, err.message);
      throw err;
    }
  }

  // -------------------------------------------------------------
  // Case A: Correct proposed answer validation ("I got 4." -> "Is that right?")
  // -------------------------------------------------------------
  console.log('▶ [CASE A] Correct Proposed Answer Validation');

  test('Case A: Validates proposed root x = 4 specifically for 2x + 4 = 12', () => {
    const history = [
      { role: 'user', content: 'Solve 2x + 4 = 12' },
      { role: 'assistant', content: 'To solve 2x + 4 = 12, we isolate the variable term.' },
      { role: 'user', content: 'Why did you divide by 2?' },
      { role: 'assistant', content: 'We divide by 2 because x is multiplied by 2.' },
      { role: 'user', content: 'I got 4.' },
      { role: 'assistant', content: 'Good work! What do you want to check?' }
    ];

    const currentMsg = 'Is that right?';
    const intent = classifyStudentIntent(currentMsg, history);
    assert.strictEqual(intent.intent, INTENTS.VALIDATION_REQUEST);

    const activeState = {
      active: {
        activeExpression: '2x + 4 = 12',
        domain: 'ALGEBRA',
        subtype: 'LINEAR_EQUATION'
      }
    };

    const evalResult = evaluateStudentWork(currentMsg, intent, history, activeState);
    assert.strictEqual(evalResult.status, 'ANSWER_VERIFIED_CORRECT');
    assert.strictEqual(evalResult.proposedValue, 4);
    assert.ok(evalResult.details.includes('2(4) + 4 = 12'));

    const context = formatStudentWorkContext(intent, evalResult, activeState);
    assert.ok(context.includes('ANSWER_VERIFIED_CORRECT'));
    assert.ok(context.includes('Explicitly state that the answer is correct'));
  });

  // -------------------------------------------------------------
  // Case B: Correct intermediate step validation ("3x = 15." -> "Is this right?")
  // -------------------------------------------------------------
  console.log('\n▶ [CASE B] Correct Proposed Intermediate Step Validation');

  test('Case B: Validates proposed step 3x = 15 specifically for 3x + 7 = 22', () => {
    const history = [
      { role: 'user', content: 'Solve 3x + 7 = 22' },
      { role: 'assistant', content: 'Let us isolate 3x. Subtract 7 from both sides.' },
      { role: 'user', content: 'So then it becomes 3x = 15.' },
      { role: 'assistant', content: 'Good! What is the next step?' }
    ];

    const currentMsg = 'Is this right?';
    const intent = classifyStudentIntent(currentMsg, history);
    assert.strictEqual(intent.intent, INTENTS.VALIDATION_REQUEST);

    const activeState = {
      active: {
        activeExpression: '3x + 7 = 22',
        domain: 'ALGEBRA',
        subtype: 'LINEAR_EQUATION'
      }
    };

    const evalResult = evaluateStudentWork(currentMsg, intent, history, activeState);
    assert.strictEqual(evalResult.status, 'STEP_VERIFIED_CORRECT');
    assert.strictEqual(evalResult.correctedStep, '3x = 15');
    assert.ok(evalResult.details.includes('3x + 7 - 7 = 22 - 7'));
    assert.ok(evalResult.details.includes('which gives 3x = 15'));
    assert.strictEqual(evalResult.nextOperation, 'divide both sides by 3');

    const context = formatStudentWorkContext(intent, evalResult, activeState);
    assert.ok(context.includes('STEP_VERIFIED_CORRECT'));
    assert.ok(context.includes('3x = 15'));
    assert.ok(context.includes('divide both sides by 3'));
    assert.ok(context.includes('DO NOT regenerate or solve the problem from the beginning'));
  });

  // -------------------------------------------------------------
  // Case C: Adversarial incorrect proposed work ("3x = 16" -> "Is this right?")
  // -------------------------------------------------------------
  console.log('\n▶ [CASE C] Adversarial Incorrect Proposed Step Validation');

  test('Case C: Rejects and corrects 3x = 16 specifically with 22 - 7 = 15, not 16', () => {
    const history = [
      { role: 'user', content: 'Solve 3x + 7 = 22' },
      { role: 'assistant', content: 'Let us isolate 3x by subtracting 7.' },
      { role: 'user', content: 'So then it becomes 3x = 16' },
      { role: 'assistant', content: 'Check your subtraction on the right side.' }
    ];

    const currentMsg = 'Is this right?';
    const intent = classifyStudentIntent(currentMsg, history);
    assert.strictEqual(intent.intent, INTENTS.VALIDATION_REQUEST);

    const activeState = {
      active: {
        activeExpression: '3x + 7 = 22',
        domain: 'ALGEBRA',
        subtype: 'LINEAR_EQUATION'
      }
    };

    const evalResult = evaluateStudentWork(currentMsg, intent, history, activeState);
    assert.strictEqual(evalResult.status, 'STEP_VERIFIED_INCORRECT');
    assert.ok(evalResult.details.includes('Subtracting 7 from 22 gives 15, not 16'));
    assert.strictEqual(evalResult.correctedStep, '3x = 15');
    assert.ok(evalResult.affirmation.includes('Your approach is right; the arithmetic in that step needs correction'));
    assert.ok(evalResult.preferredResponse.includes('❌ Not quite'));

    const context = formatStudentWorkContext(intent, evalResult, activeState);
    assert.ok(context.includes('STEP_VERIFIED_INCORRECT'));
    assert.ok(context.includes('Subtracting 7 from 22 gives 15, not 16'));
    assert.ok(context.includes('3x = 15'));
    assert.ok(context.includes('DO NOT solve the entire problem from the beginning'));

    // Verify continuation immediately after correction advances from 3x = 15
    const updatedHistory = [
      ...history,
      { role: 'user', content: 'Is this right?' },
      { role: 'assistant', content: evalResult.preferredResponse }
    ];
    const postCorrectionState = extractActiveProblemState(updatedHistory);
    assert.strictEqual(postCorrectionState.active.currentStepEquation, '3x = 15');
    assert.strictEqual(postCorrectionState.active.isCompleted, false);

    const contMsg = 'Continue.';
    const contIntent = classifyStudentIntent(contMsg, updatedHistory);
    const contEval = evaluateStudentWork(contMsg, contIntent, updatedHistory, postCorrectionState);
    assert.strictEqual(contEval.status, 'CONTINUATION_INCOMPLETE');
    assert.strictEqual(contEval.preferredResponse, 'Next, divide both sides by 3.');
  });

  // -------------------------------------------------------------
  // Case D: Pi-arithmetic transformation ("-29/3 pi + 2pi * 5" -> "Is this right?")
  // -------------------------------------------------------------
  console.log('\n▶ [CASE D] Pi Transformation Validation');

  test('Case D: Verifies coterminal angle transformation -29/3 pi + 2pi * 5 to pi/3', () => {
    const history = [
      { role: 'user', content: '-29π/3' },
      { role: 'assistant', content: 'Find a coterminal angle in [0, 2π).' },
      { role: 'user', content: 'so then it becomes -29/3 pi + 2pi * 5' }
    ];

    const currentMsg = 'Is this right?';
    const intent = classifyStudentIntent(currentMsg, history);
    assert.strictEqual(intent.intent, INTENTS.VALIDATION_REQUEST);

    const activeState = {
      active: {
        activeExpression: '-29π/3',
        domain: 'TRIGONOMETRY'
      }
    };

    const evalResult = evaluateStudentWork(currentMsg, intent, history, activeState);
    assert.strictEqual(evalResult.status, 'STEP_VERIFIED_CORRECT');
    assert.strictEqual(evalResult.exactValue, 'pi/3');
    assert.strictEqual(evalResult.degreeEquivalent, '60°');
    assert.ok(evalResult.preferredResponse.includes('π/3'));
  });

  // -------------------------------------------------------------
  // Case E: Continuation after a completed solution
  // -------------------------------------------------------------
  console.log('\n▶ [CASE E] Continuation After Completed Problem');

  test('Case E: Recognizes completed problem on "Continue." without repeating substitution', () => {
    const history = [
      { role: 'user', content: 'Solve 3x + 7 = 22' },
      { role: 'assistant', content: 'Let us isolate 3x.' },
      { role: 'user', content: 'x = 5' },
      { role: 'assistant', content: 'x = 5 is correct! Substituting 3(5) + 7 = 22 is verified.' }
    ];

    const activeState = extractActiveProblemState(history);
    assert.strictEqual(activeState.active.isCompleted, true);
    assert.strictEqual(activeState.active.verifiedSolution, 'x = 5');

    const currentMsg = 'Continue.';
    const intent = classifyStudentIntent(currentMsg, history);
    assert.strictEqual(intent.intent, INTENTS.CONTINUATION);

    const evalResult = evaluateStudentWork(currentMsg, intent, history, activeState);
    assert.strictEqual(evalResult.status, 'CONTINUATION_COMPLETED');
    assert.ok(evalResult.preferredResponse.includes('`x = 5` is verified. That\'s the complete solution.'));
    assert.ok(evalResult.preferredResponse.includes('Want another equation to practice?'));

    const context = formatStudentWorkContext(intent, evalResult, activeState);
    assert.ok(context.includes('CONTINUATION'));
    assert.ok(context.includes('COMPLETED'));
    assert.ok(context.includes('DO NOT repeat the substitution verification'));
  });

  // -------------------------------------------------------------
  // Case F: Continuation during an incomplete solution
  // -------------------------------------------------------------
  console.log('\n▶ [CASE F] Continuation During Incomplete Problem');

  test('Case F: Advances to next step on "Continue." during active linear problem', () => {
    const history = [
      { role: 'user', content: 'Solve 3x + 7 = 22' },
      { role: 'assistant', content: 'Subtract 7 from both sides.' },
      { role: 'user', content: 'So then it becomes 3x = 15.' },
      { role: 'assistant', content: 'Yes, 3x = 15 is correct.' }
    ];

    const activeState = extractActiveProblemState(history);
    assert.strictEqual(activeState.active.isCompleted, false);
    assert.strictEqual(activeState.active.currentStepEquation, '3x = 15');
    assert.strictEqual(activeState.active.nextOperation, 'divide both sides by 3');

    const currentMsg = 'Continue.';
    const intent = classifyStudentIntent(currentMsg, history);
    assert.strictEqual(intent.intent, INTENTS.CONTINUATION);

    const evalResult = evaluateStudentWork(currentMsg, intent, history, activeState);
    assert.strictEqual(evalResult.status, 'CONTINUATION_INCOMPLETE');
    assert.strictEqual(evalResult.nextOperation, 'divide both sides by 3');
    assert.strictEqual(evalResult.preferredResponse, 'Next, divide both sides by 3.');

    const context = formatStudentWorkContext(intent, evalResult, activeState);
    assert.ok(context.includes('CONTINUATION'));
    assert.ok(context.includes('IN_PROGRESS'));
    assert.ok(context.includes('Advance to the next required step'));
    assert.ok(context.includes('DO NOT restart the problem from the beginning'));
  });

  // -------------------------------------------------------------
  // Linear Equation Parser & Evaluator Unit Tests
  // -------------------------------------------------------------
  console.log('\n▶ [UNIT] Linear Equation Parser & Evaluator Tests');

  test('parseLinearEquation handles 3x + 7 = 22', () => {
    const p = parseLinearEquation('3x + 7 = 22');
    assert.strictEqual(p.a, 3);
    assert.strictEqual(p.variable, 'x');
    assert.strictEqual(p.b, 7);
    assert.strictEqual(p.c, 22);
    assert.strictEqual(p.expectedStep, '3x = 15');
    assert.strictEqual(p.root, 5);
  });

  test('parseLinearEquation handles 2x + 4 = 12', () => {
    const p = parseLinearEquation('2x + 4 = 12');
    assert.strictEqual(p.a, 2);
    assert.strictEqual(p.expectedStep, '2x = 8');
    assert.strictEqual(p.root, 4);
  });

  test('evaluateLinearEquationStep evaluates 3x = 15 on 3x + 7 = 22 as correct', () => {
    const res = evaluateLinearEquationStep('3x = 15', '3x + 7 = 22');
    assert.strictEqual(res.status, 'STEP_VERIFIED_CORRECT');
    assert.strictEqual(res.nextOperation, 'divide both sides by 3');
  });

  test('evaluateLinearEquationStep evaluates 3x = 16 on 3x + 7 = 22 as arithmetic error', () => {
    const res = evaluateLinearEquationStep('3x = 16', '3x + 7 = 22');
    assert.strictEqual(res.status, 'STEP_VERIFIED_INCORRECT');
    assert.strictEqual(res.correctedStep, '3x = 15');
  });

  console.log('\n================================================================');
  console.log(`✅ ALL ${passed}/${total} CONTEXTUAL VALIDATION & CONTINUATION TESTS PASSED (100%)`);
  console.log('================================================================');
}

runContextualValidationTests();
