/**
 * test-adaptive-teaching.js
 *
 * Dedicated Verification Suite for Pythos Adaptive Teaching Intelligence (Phases 2, 3, 4)
 *
 * Covers:
 * 1. Student independently solves problem -> Allows student to continue without taking over
 * 2. Student requests a hint -> Provides heuristic hint without revealing complete solution
 * 3. Student discovers a valid shortcut -> Recognizes and explains why it works
 * 4. Student proposes an invalid shortcut -> Identifies exact failure without false praise
 * 5. Student makes a conceptual mistake -> Identifies and corrects misconception
 * 6. Student requests a complete solution -> Delivers direct answer / full walkthrough
 * 7. Student demonstrates mastery -> Evidence-based mastery reduces redundant explanations
 * 8. Verification supremacy -> Deterministic verification overrules ungrounded AI explanation
 * 9. Explicit "Let me try" -> Halts solving and gives student room to work
 * 10. Student requests standard method after shortcut -> Provides canonical procedure
 * 11. Domain boundary & lost roots -> Flags division by variable dropping x = 0
 * 12. Extraneous roots from squaring -> Audits radical equation domain boundary
 * 13. Arithmetic mistake with valid conceptual setup -> Distinguishes from conceptual flaw
 * 14. Mid-conversation agency precedence -> "Let me try" -> "Hint" -> "Direct answer"
 * 15. Concept-specific mastery isolation -> Algebra mastery does not leak into Calculus novice
 * 16. Consistency across physics & math -> Conservation of energy vs kinematics
 * 17. Verification integrity -> Rejects ungrounded verification claims
 * 18. Inconclusive verification -> Avoids manufacturing false certainty
 */

const assert = require('assert');
const { INTENTS, classifyStudentIntent } = require('./server/studentIntentClassifier');
const {
  LEARNING_MODES,
  MASTERY_LEVELS,
  SHORTCUT_STATUS,
  resolveStudentAgencyMode,
  analyzeConceptMastery,
  persistConceptMastery,
  evaluateTransformationSequence,
  auditProposedShortcut,
  auditProposedShortcutAsync,
  generateConceptualWhyGuidance,
  evaluateTeachingStrategy,
  evaluateTeachingStrategyAsync,
  formatAdaptiveTeachingContext
} = require('./server/teachingIntelligence');
const memoryService = require('./server/memoryService');
const { verifyProposedShortcut } = require('./server/verificationBridge');

async function runAdaptiveTeachingSuite() {
  console.log('================================================================');
  console.log('🎓 PYTHOS ADAPTIVE TEACHING INTELLIGENCE VERIFICATION SUITE');
  console.log('Standards: Independent Reasoning | Agency | Shortcuts | Verification Integrity');
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

  async function asyncTest(name, fn) {
    total++;
    try {
      await fn();
      console.log(`  ✓ [PASS ${total}] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL ${total}] ${name}:`, err.message);
      throw err;
    }
  }

  // -------------------------------------------------------------
  // SCENARIO 1: Student independently solves a problem (No taking over)
  // -------------------------------------------------------------
  test('Scenario 1: Student independently works; Pythos allows student to continue without taking over', () => {
    const text = 'I subtracted 5 to get 3x = 15. Now dividing by 3 gives x = 5.';
    const studentIntent = classifyStudentIntent(text);
    const strategy = evaluateTeachingStrategy({
      userText: text,
      studentIntent,
      activeProblemState: { active: { activeExpression: '3x + 5 = 20' } }
    });

    assert.ok(strategy.agency.mode === LEARNING_MODES.GUIDED_STEP || strategy.agency.mode === LEARNING_MODES.INDEPENDENT);
    const context = formatAdaptiveTeachingContext(strategy);
    assert.ok(context.includes('ADAPTIVE TEACHING INTELLIGENCE'));
  });

  // -------------------------------------------------------------
  // SCENARIO 2: Student requests a hint without revealing complete solution
  // -------------------------------------------------------------
  test('Scenario 2: Student requests a hint; Pythos restricts to heuristic nudge without solution leakage', () => {
    const text = 'Give me a hint on what to do next.';
    const studentIntent = classifyStudentIntent(text);
    assert.strictEqual(studentIntent.intent, INTENTS.HINT_REQUEST);

    const agency = resolveStudentAgencyMode({ text, studentIntent });
    assert.strictEqual(agency.mode, LEARNING_MODES.HINT_ONLY);
    assert.ok(agency.directive.includes('DO NOT perform the calculation'));
    assert.ok(agency.directive.includes('do not state the final answer'));

    const strategy = evaluateTeachingStrategy({ userText: text, studentIntent });
    const context = formatAdaptiveTeachingContext(strategy);
    assert.ok(context.includes('HINT_ONLY'));
    assert.ok(context.includes('ABSOLUTE PROHIBITION'));
  });

  // -------------------------------------------------------------
  // SCENARIO 3: Student discovers a valid shortcut (Explains why it works)
  // -------------------------------------------------------------
  test('Scenario 3: Student discovers valid shortcut; recognized and explained without false rejection', () => {
    const text = 'Can I divide both sides by 2 first to get x + 3 = 7 instead of distributing?';
    const studentIntent = classifyStudentIntent(text);
    assert.strictEqual(studentIntent.intent, INTENTS.SHORTCUT_PROPOSAL);

    const shortcutAudit = auditProposedShortcut({
      userText: text,
      activeProblemState: { active: { activeExpression: '2(x + 3) = 14' } }
    });

    assert.strictEqual(shortcutAudit.isValid, true);
    assert.strictEqual(shortcutAudit.status, SHORTCUT_STATUS.VALID_SHORTCUT);
    assert.ok(shortcutAudit.explanation.includes('valid and often more efficient'));
    assert.ok(shortcutAudit.explanation.includes('non-zero constant'));
  });

  // -------------------------------------------------------------
  // SCENARIO 4: Student proposes an invalid shortcut (Identifies exact failure without false praise)
  // -------------------------------------------------------------
  test('Scenario 4: Student proposes invalid shortcut; exact failure identified without false praise', () => {
    const text = 'Can I just cancel the x terms in (x^2 - 9)/(x - 3) to get -9/-3 = 3?';
    const studentIntent = classifyStudentIntent(text);
    assert.strictEqual(studentIntent.intent, INTENTS.SHORTCUT_PROPOSAL);

    const shortcutAudit = auditProposedShortcut({
      userText: text,
      activeProblemState: { active: { activeExpression: '(x^2 - 9)/(x - 3)' } }
    });

    assert.strictEqual(shortcutAudit.isValid, false);
    assert.strictEqual(shortcutAudit.status, SHORTCUT_STATUS.INVALID_SHORTCUT);
    assert.strictEqual(shortcutAudit.failureReason, 'TERMS_CANNOT_CANCEL_ACROSS_ADDITION');
    assert.ok(shortcutAudit.pedagogicalDirective.includes('Explain that terms separated by + or - cannot be canceled'));
  });

  // -------------------------------------------------------------
  // SCENARIO 5: Student makes a conceptual mistake (Corrects misconception)
  // -------------------------------------------------------------
  test('Scenario 5: Student makes conceptual definition mistake; redirected to correct framework', () => {
    const text = 'Since sin(x) = 3/5, that means adjacent is 3 and hypotenuse is 5, right?';
    const studentIntent = classifyStudentIntent(text);
    const { evaluateStudentWork } = require('./server/studentWorkEvaluator');
    const evaluation = evaluateStudentWork(text, studentIntent, [], { active: { domain: 'TRIGONOMETRY' } });

    assert.ok(text.includes('sin') && text.includes('adjacent'));
    const { classifyLearnerState } = require('./server/learnerState');
    const learnerState = classifyLearnerState(text, [], { active: { domain: 'TRIGONOMETRY' } }, studentIntent, evaluation);

    assert.strictEqual(learnerState.state, 'PRODUCTIVE_MISTAKE_CONCEPTUAL');
    assert.ok(learnerState.pedagogy.directive.includes('REDIRECT_CONCEPTUAL_FRAMEWORK') || learnerState.pedagogy.action.includes('CONCEPTUAL'));
  });

  // -------------------------------------------------------------
  // SCENARIO 6: Student requests a complete solution (Delivers requested walkthrough)
  // -------------------------------------------------------------
  test('Scenario 6: Student requests complete solution; delivers without Socratic obstruction', () => {
    const text = 'Just give me the answer and show me the full steps.';
    const studentIntent = classifyStudentIntent(text);
    assert.strictEqual(studentIntent.intent, INTENTS.DIRECT_ANSWER_REQUEST);

    const agency = resolveStudentAgencyMode({ text, studentIntent });
    assert.strictEqual(agency.mode, LEARNING_MODES.DIRECT_ANSWER);
    assert.ok(agency.directive.includes('PROVIDE THE COMPLETE ANSWER UPFRONT'));
    assert.ok(agency.directive.includes('DO NOT withhold'));
  });

  // -------------------------------------------------------------
  // SCENARIO 7: Student demonstrates mastery (Reduces unnecessary hand-holding)
  // -------------------------------------------------------------
  test('Scenario 7: Evidence-based mastery reduces redundant explanations and allows independent work', () => {
    const history = [
      { role: 'user', content: 'For 2x + 6 = 20, first subtract 6 to get 2x = 14.' },
      { role: 'assistant', content: 'Yes, exactly! What is the next step?' },
      { role: 'user', content: 'Now divide by 2 to get x = 7.' },
      { role: 'assistant', content: 'Correct, x = 7 is verified.' },
      { role: 'user', content: 'For the next one, 3x - 9 = 21, add 9: 3x = 30.' },
      { role: 'assistant', content: 'Spot on!' },
      { role: 'user', content: 'Divide by 3: x = 10.' },
      { role: 'assistant', content: 'Yes, that completes it!' }
    ];

    const mastery = analyzeConceptMastery({
      conversationHistory: history,
      activeProblemState: { active: { targetConcept: 'LINEAR_EQUATIONS' } }
    });

    assert.strictEqual(mastery.level, MASTERY_LEVELS.MASTERY);
    assert.ok(mastery.metrics.unassistedSuccessCount >= 3);
    assert.strictEqual(mastery.metrics.errorCount, 0);

    const strategy = evaluateTeachingStrategy({
      userText: 'x = 10',
      conversationHistory: history,
      activeProblemState: { active: { targetConcept: 'LINEAR_EQUATIONS' } }
    });

    const context = formatAdaptiveTeachingContext(strategy);
    assert.ok(context.includes('MASTERY'));
    assert.ok(context.includes('Minimize explanation volume'));
  });

  // -------------------------------------------------------------
  // SCENARIO 8: Verification supremacy (Verification takes precedence over AI claim)
  // -------------------------------------------------------------
  test('Scenario 8: Deterministic verification takes absolute precedence over AI claims', () => {
    const strategy = evaluateTeachingStrategy({
      userText: 'Does (x + 2)^2 = x^2 + 4?',
      studentIntent: { intent: INTENTS.SHORTCUT_PROPOSAL }
    });

    assert.strictEqual(strategy.verificationSubordination, true);
    const context = formatAdaptiveTeachingContext(strategy);
    assert.ok(context.includes('strictly subordinate to deterministic verification'));
    assert.ok(context.includes('NEVER override a deterministic verifier result'));
  });

  // -------------------------------------------------------------
  // SCENARIO 9: Explicit "Let me try" agency
  // -------------------------------------------------------------
  test('Scenario 9: Student explicitly says "Let me try"; stops solving and gives space', () => {
    const text = 'Wait, let me try this myself!';
    const studentIntent = classifyStudentIntent(text);
    assert.strictEqual(studentIntent.intent, INTENTS.INDEPENDENT_WORK_REQUEST);

    const agency = resolveStudentAgencyMode({ text, studentIntent });
    assert.strictEqual(agency.mode, LEARNING_MODES.INDEPENDENT);
    assert.ok(agency.directive.includes('STOP SOLVING THE PROBLEM'));
    assert.ok(agency.directive.includes('DO NOT provide the next step'));
  });

  // -------------------------------------------------------------
  // SCENARIO 10: Student requests standard method after shortcut
  // -------------------------------------------------------------
  test('Scenario 10: Student requests standard method after discovering shortcut', () => {
    const text = 'What is the standard textbook method for this?';
    const studentIntent = classifyStudentIntent(text);
    assert.strictEqual(studentIntent.intent, INTENTS.STANDARD_METHOD_REQUEST);

    const agency = resolveStudentAgencyMode({ text, studentIntent });
    assert.strictEqual(agency.mode, LEARNING_MODES.STANDARD_METHOD);
    assert.ok(agency.directive.includes('SHOW THE STANDARD CONVENTIONAL METHOD'));
  });

  // -------------------------------------------------------------
  // SCENARIO 11: Shortcut loses solution at domain boundary (Dividing by x in x^2 = 5x)
  // -------------------------------------------------------------
  test('Scenario 11: Dividing by variable x drops root x = 0; flagged as invalid transformation', () => {
    const text = 'Can I just divide both sides by x to get x = 5?';
    const shortcutAudit = auditProposedShortcut({
      userText: text,
      activeProblemState: { active: { activeExpression: 'x^2 = 5x' } }
    });

    assert.strictEqual(shortcutAudit.isValid, false);
    assert.strictEqual(shortcutAudit.status, SHORTCUT_STATUS.INVALID_SHORTCUT);
    assert.strictEqual(shortcutAudit.failureReason, 'ZERO_DIVISOR_AND_LOST_SOLUTION');
    assert.deepStrictEqual(shortcutAudit.lostRoots, ['x = 0']);
    assert.ok(shortcutAudit.explanation.includes('illegally divides by zero and discards the valid root x = 0'));
  });

  // -------------------------------------------------------------
  // SCENARIO 12: Algebraic transformation introduces extraneous solutions (Squaring radicals)
  // -------------------------------------------------------------
  test('Scenario 12: Squaring radical equation introduces extraneous root; flagged as conditionally valid', () => {
    const text = 'Can I square both sides to solve sqrt(x + 2) = x?';
    const shortcutAudit = auditProposedShortcut({
      userText: text,
      activeProblemState: { active: { activeExpression: 'sqrt(x + 2) = x' } }
    });

    assert.strictEqual(shortcutAudit.status, SHORTCUT_STATUS.CONDITIONALLY_VALID);
    assert.strictEqual(shortcutAudit.failureReason, 'EXTRANEOUS_ROOTS_FROM_SQUARING');
    assert.ok(shortcutAudit.explanation.includes('introduces extraneous roots'));
    assert.ok(shortcutAudit.pedagogicalDirective.includes('Mandate checking candidates against the original equation'));
  });

  // -------------------------------------------------------------
  // SCENARIO 13: Student understands concept but makes arithmetic mistake
  // -------------------------------------------------------------
  test('Scenario 13: Understands algebraic setup but arithmetic slips; isolates arithmetic without penalizing concept', () => {
    const { evaluateLinearEquationStep } = require('./server/studentWorkEvaluator');
    const stepEval = evaluateLinearEquationStep('3x = 18', '3x + 5 = 20'); // Expected 3x = 15, student wrote 3x = 18
    assert.strictEqual(stepEval.status, 'STEP_VERIFIED_INCORRECT');
    assert.strictEqual(stepEval.isSignError, false);
    assert.ok(stepEval.details.toLowerCase().includes('subtracting 5 from 20 gives 15, not 18'));
    assert.ok(stepEval.affirmation.toLowerCase().includes('approach is right') || stepEval.affirmation.toLowerCase().includes('algebraic'));
  });

  // -------------------------------------------------------------
  // SCENARIO 14: Multi-Turn Lifecycle Integration Test (Item 5)
  // Student starts independently -> requests hint -> attempts incorrect step ->
  // Pythos isolates exact error without solving entire problem ->
  // Student requests standard method -> Student requests complete answer
  // -------------------------------------------------------------
  test('Scenario 14: Multi-turn lifecycle: Independent -> Hint -> Incorrect step isolated -> Standard method -> Direct answer', () => {
    const { evaluateLinearEquationStep } = require('./server/studentWorkEvaluator');
    const activeProblem = { active: { activeExpression: '3x + 5 = 20', targetConcept: 'ALGEBRA_LINEAR' } };

    // Step 1: Student starts independently ("Let me try")
    const turn1Intent = classifyStudentIntent('Let me try this myself');
    assert.strictEqual(turn1Intent.intent, INTENTS.INDEPENDENT_WORK_REQUEST);
    const turn1Strategy = evaluateTeachingStrategy({
      userText: 'Let me try this myself',
      studentIntent: turn1Intent,
      activeProblemState: activeProblem
    });
    assert.strictEqual(turn1Strategy.agency.mode, LEARNING_MODES.INDEPENDENT);
    assert.ok(turn1Strategy.agency.directive.includes('STOP SOLVING THE PROBLEM'));

    // Step 2: Student requests a hint ("Can you give me a hint?")
    const turn2Intent = classifyStudentIntent('Actually can you give me a small hint?');
    assert.strictEqual(turn2Intent.intent, INTENTS.HINT_REQUEST);
    const turn2Strategy = evaluateTeachingStrategy({
      userText: 'Actually can you give me a small hint?',
      studentIntent: turn2Intent,
      activeProblemState: activeProblem
    });
    assert.strictEqual(turn2Strategy.agency.mode, LEARNING_MODES.HINT_ONLY);
    assert.ok(turn2Strategy.agency.directive.includes('TARGETED HEURISTIC NUDGE'));

    // Step 3 & 4: Student attempts an incorrect step ("3x = 18")
    // Pythos identifies the exact arithmetic error without solving the whole problem
    const stepEvaluation = evaluateLinearEquationStep('3x = 18', '3x + 5 = 20');
    assert.strictEqual(stepEvaluation.status, 'STEP_VERIFIED_INCORRECT');
    assert.ok(stepEvaluation.details.toLowerCase().includes('subtracting 5 from 20 gives 15, not 18'));
    assert.ok(stepEvaluation.affirmation.toLowerCase().includes('approach is right'));
    // Note that the evaluator points out the intermediate corrected step (3x = 15) and next op (divide by 3),
    // but does NOT dump the final solution x = 5
    assert.strictEqual(stepEvaluation.correctedStep, '3x = 15');

    // Step 5: Student requests the standard method ("Show me the standard method")
    const turn5Intent = classifyStudentIntent('Show me the standard method');
    assert.strictEqual(turn5Intent.intent, INTENTS.STANDARD_METHOD_REQUEST);
    const turn5Strategy = evaluateTeachingStrategy({
      userText: 'Show me the standard method',
      studentIntent: turn5Intent,
      activeProblemState: activeProblem
    });
    assert.strictEqual(turn5Strategy.agency.mode, LEARNING_MODES.STANDARD_METHOD);
    assert.ok(turn5Strategy.agency.directive.includes('SHOW THE STANDARD CONVENTIONAL METHOD'));

    // Step 6: Student subsequently requests the complete solution ("Just give me the answer")
    const turn6Intent = classifyStudentIntent('I am stuck, just give me the answer');
    assert.strictEqual(turn6Intent.intent, INTENTS.DIRECT_ANSWER_REQUEST);
    const turn6Strategy = evaluateTeachingStrategy({
      userText: 'I am stuck, just give me the answer',
      studentIntent: turn6Intent,
      activeProblemState: activeProblem
    });
    assert.strictEqual(turn6Strategy.agency.mode, LEARNING_MODES.DIRECT_ANSWER);
    assert.ok(turn6Strategy.agency.directive.includes('PROVIDE THE COMPLETE ANSWER UPFRONT'));
  });

  // -------------------------------------------------------------
  // SCENARIO 15: Concept-specific mastery isolation (Algebra mastery does not leak into Calculus)
  // -------------------------------------------------------------
  test('Scenario 15: Mastery in Algebra does not leak into novice state in Calculus', () => {
    const algebraHistory = [
      { role: 'user', content: '2x + 4 = 10 -> 2x = 6' },
      { role: 'assistant', content: 'Yes, correct!' },
      { role: 'user', content: 'x = 3' },
      { role: 'assistant', content: 'Correct!' },
      { role: 'user', content: '5x - 5 = 20 -> 5x = 25 -> x = 5' },
      { role: 'assistant', content: 'Spot on!' }
    ];

    // Evaluated under Algebra domain
    const algebraMastery = analyzeConceptMastery({
      conversationHistory: algebraHistory,
      activeProblemState: { active: { targetConcept: 'ALGEBRA_LINEAR' } }
    });
    assert.strictEqual(algebraMastery.level, MASTERY_LEVELS.MASTERY);

    // Evaluated under Calculus derivative domain with zero calculus history
    const calculusMastery = analyzeConceptMastery({
      conversationHistory: [],
      activeProblemState: { active: { targetConcept: 'CALCULUS_CHAIN_RULE' } }
    });
    assert.strictEqual(calculusMastery.level, MASTERY_LEVELS.NOVICE);
  });

  // -------------------------------------------------------------
  // SCENARIO 16: Physics Validation: Conservation of Energy vs Kinematics (Item 6)
  // Demonstrates:
  // 1) Conservative forces (gravity without friction): Energy conservation is a valid and faster shortcut.
  // 2) Non-conservative forces (friction/air resistance): Energy conservation is INVALID because W_nc != 0.
  // 3) When elapsed time is requested: Energy is time-independent, so it cannot substitute for kinematics.
  // -------------------------------------------------------------
  test('Scenario 16: Physics validation: when Conservation of Energy is and is not a valid substitute for kinematics', () => {
    // 16A: Conservative free-fall -> Valid substitute
    const textValid = 'Can I use conservation of energy mgh = 1/2 mv^2 instead of kinematic equations?';
    const auditValid = auditProposedShortcut({
      userText: textValid,
      activeProblemState: { active: { domain: 'PHYSICS', problemType: 'KINEMATICS', activeExpression: 'v^2 = v0^2 + 2gh' } }
    });
    assert.strictEqual(auditValid.isValid, true);
    assert.strictEqual(auditValid.status, SHORTCUT_STATUS.VALID_SHORTCUT);
    assert.ok(auditValid.explanation.includes('completely valid and often much faster approach'));

    // 16B: Non-conservative forces (with friction) -> Invalid substitute
    const textFriction = 'Can I use energy conservation mgh = 1/2 mv^2 for a block sliding down a ramp with friction?';
    const auditFriction = auditProposedShortcut({
      userText: textFriction,
      activeProblemState: { active: { domain: 'PHYSICS', problemType: 'KINEMATICS', activeExpression: 'sliding block with coefficient of friction mu = 0.2' } }
    });
    assert.strictEqual(auditFriction.isValid, false);
    assert.strictEqual(auditFriction.status, SHORTCUT_STATUS.INVALID_SHORTCUT);
    assert.strictEqual(auditFriction.failureReason, 'NON_CONSERVATIVE_FORCES_PRESENT');
    assert.ok(auditFriction.explanation.includes('friction'));
    assert.ok(auditFriction.pedagogicalDirective.includes('friction dissipates mechanical energy'));

    // 16C: Elapsed time requested -> Conditionally valid (cannot find time t from energy alone)
    const textTime = 'Can I use conservation of energy to find how long does it take for the ball to hit the ground?';
    const auditTime = auditProposedShortcut({
      userText: textTime,
      activeProblemState: { active: { domain: 'PHYSICS', problemType: 'KINEMATICS', activeExpression: 'find the time of flight t' } }
    });
    assert.strictEqual(auditTime.isValid, false);
    assert.strictEqual(auditTime.status, SHORTCUT_STATUS.CONDITIONALLY_VALID);
    assert.strictEqual(auditTime.failureReason, 'TIME_INDEPENDENT_FORMULATION');
    assert.ok(auditTime.explanation.includes('time-independent'));
  });

  // -------------------------------------------------------------
  // SCENARIO 17: Conceptual "Why" explanation engine
  // -------------------------------------------------------------
  test('Scenario 17: Explains why completing the square works geometrically', () => {
    const text = 'Why does completing the square work?';
    const studentIntent = classifyStudentIntent(text);
    assert.strictEqual(studentIntent.intent, INTENTS.WHY_EXPLANATION_REQUEST);

    const whyGuidance = generateConceptualWhyGuidance({ userText: text });
    assert.strictEqual(whyGuidance.concept, 'COMPLETING_THE_SQUARE');
    assert.ok(whyGuidance.whyExplanation.includes('physically completes a geometric square'));
  });

  // -------------------------------------------------------------
  // SCENARIO 18: Inconclusive verification does not manufacture false certainty
  // -------------------------------------------------------------
  await asyncTest('Scenario 18: Inconclusive or unverified shortcut does not manufacture false certainty', async () => {
    const unverifiedRes = await verifyProposedShortcut({
      originalExpr: 'BesselJ(0, x)',
      shortcutExpr: 'x^3 - 4',
      domain: 'higher_transcendental'
    });

    assert.strictEqual(unverifiedRes.verified, false);
    assert.ok(unverifiedRes.status === 'UNKNOWN' || unverifiedRes.status === 'UNVERIFIABLE' || unverifiedRes.status === 'NON_EQUIVALENT');
  });

  // -------------------------------------------------------------
  // SCENARIO 19: Valid algebraic symbolic shortcut verified by CAS
  // -------------------------------------------------------------
  await asyncTest('Scenario 19: Valid algebraic identity confirmed by deterministic CAS equivalence', async () => {
    const validCasRes = await verifyProposedShortcut({
      originalExpr: '(x - 3)*(x + 3)',
      shortcutExpr: 'x^2 - 9',
      variable: 'x'
    });

    assert.strictEqual(validCasRes.verified, true);
    assert.strictEqual(validCasRes.status, 'VERIFIED');
  });

  // -------------------------------------------------------------
  // SCENARIO 20: Invalid algebraic identity rejected by deterministic CAS
  // -------------------------------------------------------------
  await asyncTest('Scenario 20: Invalid algebraic expansion rejected by deterministic CAS equivalence', async () => {
    const invalidCasRes = await verifyProposedShortcut({
      originalExpr: '(x + 4)^2',
      shortcutExpr: 'x^2 + 16',
      variable: 'x'
    });

    assert.strictEqual(invalidCasRes.verified, false);
    assert.strictEqual(invalidCasRes.status, 'NON_EQUIVALENT');
  });

  // -------------------------------------------------------------
  // SCENARIO 21: Runtime Transformation Sequence Evaluation connected to evaluateTeachingStrategyAsync
  // -------------------------------------------------------------
  await asyncTest('Scenario 21: Runtime transformation sequence evaluation validates lost roots, extraneous roots, domain restrictions, and valid steps', async () => {
    // 21A: Lost root via runtime evaluateTeachingStrategyAsync
    const lostRootStrat = await evaluateTeachingStrategyAsync({
      userText: 'x^2 = 5x => x = 5',
      activeProblemState: { active: { activeExpression: 'x^2 = 5x', targetConcept: 'ALGEBRA_QUADRATIC' } }
    });
    assert.ok(lostRootStrat.shortcutAudit, 'Expected shortcutAudit to run on step transformation');
    assert.strictEqual(lostRootStrat.shortcutAudit.status, SHORTCUT_STATUS.INVALID_SHORTCUT);
    assert.strictEqual(lostRootStrat.shortcutAudit.failureReason, 'ZERO_DIVISOR_AND_LOST_SOLUTION');
    assert.deepStrictEqual(lostRootStrat.shortcutAudit.lostRoots, ['x = 0']);
    assert.strictEqual(lostRootStrat.shortcutAudit.invalidStepIndex, 0);

    // 21B: Squaring both sides introducing extraneous root (x = -1)
    const extRootStrat = await evaluateTeachingStrategyAsync({
      userText: 'x - 1 = 2 => (x - 1)^2 = 4'
    });
    assert.strictEqual(extRootStrat.shortcutAudit.status, SHORTCUT_STATUS.CONDITIONALLY_VALID);
    assert.strictEqual(extRootStrat.shortcutAudit.failureReason, 'EXTRANEOUS_ROOTS_FROM_SQUARING');
    assert.ok(extRootStrat.shortcutAudit.extraneousRoots.includes('x = -1'));
    assert.strictEqual(extRootStrat.shortcutAudit.invalidStepIndex, 0);

    // 21C: Rational cancellation omitting domain restriction (x != 2)
    const domainSeq = evaluateTransformationSequence({
      userText: '(x^2 - 4)/(x - 2) => x + 2'
    });
    assert.strictEqual(domainSeq.status, SHORTCUT_STATUS.CONDITIONALLY_VALID);
    assert.strictEqual(domainSeq.failureReason, 'MISSING_DOMAIN_RESTRICTION');
    assert.ok(domainSeq.domainRestrictions.includes('x != 2'));

    // 21D: Valid multi-step linear transformation sequence
    const validStrat = await evaluateTeachingStrategyAsync({
      userText: '3x + 6 = 12 => x + 2 = 4 => x = 2'
    });
    assert.strictEqual(validStrat.shortcutAudit.isValid, true);
    assert.strictEqual(validStrat.shortcutAudit.status, SHORTCUT_STATUS.VALID_SHORTCUT);
    assert.strictEqual(validStrat.shortcutAudit.failureReason, null);
  });

  // -------------------------------------------------------------
  // SCENARIO 22: Cross-Session Mastery Persistence via memoryService contract (No denylist rejection)
  // -------------------------------------------------------------
  await asyncTest('Scenario 22: Cross-session mastery persistence survives empty conversationHistory and stays concept-isolated', async () => {
    const history = [
      { role: 'user', content: '2x + 4 = 10 -> 2x = 6' },
      { role: 'assistant', content: 'Yes, exactly right!' },
      { role: 'user', content: 'x = 3' },
      { role: 'assistant', content: 'Correct!' },
      { role: 'user', content: '3x - 3 = 9 -> 3x = 12 -> x = 4' },
      { role: 'assistant', content: 'Spot on!' }
    ];

    const earnedMastery = analyzeConceptMastery({
      conversationHistory: history,
      activeProblemState: { active: { targetConcept: 'LINEAR_EQUATIONS' } }
    });
    assert.strictEqual(earnedMastery.level, MASTERY_LEVELS.MASTERY);
    assert.ok(earnedMastery.confidence >= 0.8);

    // Simulate memoryService backed persistence store verifying real denylist filter passes
    let storedProfile = { learning: { masteredConcepts: [] } };
    const mockMemoryService = {
      async recordMemoryCandidate(uid, candidate) {
        assert.strictEqual(memoryService.isSensitiveOrDisallowed(candidate.value), false, 'Persisted value must pass MATH_CLAIM_DENYLIST_REGEX');
        assert.strictEqual(memoryService.isSensitiveOrDisallowed(candidate.quote), false, 'Persisted quote must pass MATH_CLAIM_DENYLIST_REGEX');
        assert.strictEqual(candidate.category, 'learning');
        assert.strictEqual(candidate.facet, 'mastered');
        storedProfile.learning.masteredConcepts = [candidate.value];
        return { id: 'mem_learning_mastered', ...candidate };
      }
    };

    const persistedRecord = await persistConceptMastery('test_uid_cross_session', earnedMastery, storedProfile, mockMemoryService);
    assert.ok(persistedRecord, 'Expected persistConceptMastery to record mastery candidate');

    // New session with empty conversationHistory restores mastery for LINEAR_EQUATIONS
    const restoredStrategy = await evaluateTeachingStrategyAsync({
      userText: '4x - 8 = 12',
      conversationHistory: [],
      activeProblemState: { active: { targetConcept: 'LINEAR_EQUATIONS' } },
      studentProfile: storedProfile
    });
    assert.strictEqual(restoredStrategy.mastery.level, MASTERY_LEVELS.MASTERY);
    assert.strictEqual(restoredStrategy.mastery.fromPersistedProfile, true);
    assert.ok(restoredStrategy.mastery.confidence >= 0.8);

    // Must remain NOVICE on an unrelated concept even with same storedProfile
    const unrelatedStrategy = await evaluateTeachingStrategyAsync({
      userText: 'Find derivative of sin(x^2)',
      conversationHistory: [],
      activeProblemState: { active: { targetConcept: 'CALCULUS_DERIVATIVES' } },
      studentProfile: storedProfile
    });
    assert.strictEqual(unrelatedStrategy.mastery.level, MASTERY_LEVELS.NOVICE);
    assert.strictEqual(unrelatedStrategy.mastery.fromPersistedProfile, false);
  });

  console.log('\n================================================================');
  console.log(`📊 ADAPTIVE TEACHING RESULTS: ${passed}/${total} TESTS PASSED (0 failures)`);
  console.log('================================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runAdaptiveTeachingSuite().catch(err => {
  console.error('Fatal test suite failure:', err);
  process.exit(1);
});
