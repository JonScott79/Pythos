/**
 * test/test-adaptive-scenarios-phase21.js
 *
 * PYTHOS PHASE XXI (Priority Four): End-to-End Multi-Turn Adaptive Teaching Scenarios (A–J)
 */

const assert = require('assert');
const teachingIntelligence = require('../server/teachingIntelligence');
const studentIntentClassifier = require('../server/studentIntentClassifier');
const learnerState = require('../server/learnerState');
const lanzarIdService = require('../server/lanzarIdService');
const serverGateway = require('../server/server');

async function runTests() {
  console.log('======================================================================');
  console.log('PYTHOS PHASE XXI: ADAPTIVE MULTI-TURN SCENARIOS (SCENARIOS A–J)');
  console.log('======================================================================\n');

  let passed = 0;
  let total = 0;

  async function test(name, fn) {
    total++;
    try {
      await fn();
      console.log(`  ✓ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ [FAIL] ${name}`);
      console.error(`    ${err.message}`);
      process.exitCode = 1;
    }
  }

  await test('Scenario A: Independent learner earns MASTERY after 3+ unassisted steps', async () => {
    const history = [
      { role: 'user', content: 'Solve 2x + 4 = 10' },
      { role: 'assistant', content: 'Go ahead with your first step.' },
      { role: 'user', content: '2x = 6' },
      { role: 'assistant', content: 'Correct!' },
      { role: 'user', content: 'x = 3' },
      { role: 'assistant', content: 'Exactly! Next problem: 3x - 3 = 9' },
      { role: 'user', content: '3x = 12' },
      { role: 'assistant', content: 'Spot on!' }
    ];
    const mastery = teachingIntelligence.analyzeConceptMastery({
      classification: { problemDomain: 'ALGEBRA', problemSubtype: 'LINEAR_EQUATION' },
      conversationHistory: history
    });
    assert.strictEqual(mastery.level, teachingIntelligence.MASTERY_LEVELS.MASTERY);
    assert(mastery.metrics.unassistedSuccessCount >= 3);
  });

  await test('Scenario B: Hint-assisted step increments assistedSuccessCount, not unassistedSuccessCount', async () => {
    const history = [
      { role: 'user', content: 'Solve 5x - 10 = 15' },
      { role: 'assistant', content: 'Here is a hint: try adding 10 to both sides first.' },
      { role: 'user', content: '5x = 25' }
    ];
    const mastery = teachingIntelligence.analyzeConceptMastery({
      classification: { problemDomain: 'ALGEBRA', problemSubtype: 'LINEAR_EQUATION' },
      studentEvaluation: { status: 'STEP_VERIFIED_CORRECT' },
      conversationHistory: history
    });
    assert.strictEqual(mastery.metrics.unassistedSuccessCount, 0);
    assert(mastery.metrics.assistedSuccessCount >= 1);
    assert.notStrictEqual(mastery.level, teachingIntelligence.MASTERY_LEVELS.MASTERY);
  });

  await test('Scenario C: Repeated conceptual/arithmetic error keeps mastery low and surfaces errors', async () => {
    const history = [
      { role: 'user', content: 'Solve 3x + 7 = 22' },
      { role: 'assistant', content: 'What is your first step?' },
      { role: 'user', content: '3x = 29' },
      { role: 'assistant', content: 'Not quite — check your sign when moving 7.' },
      { role: 'user', content: '3x = 29 again?' },
      { role: 'assistant', content: 'Check your subtraction: 22 - 7.' }
    ];
    const mastery = teachingIntelligence.analyzeConceptMastery({
      classification: { problemDomain: 'ALGEBRA', problemSubtype: 'LINEAR_EQUATION' },
      studentEvaluation: { status: 'STEP_VERIFIED_INCORRECT' },
      conversationHistory: history
    });
    assert(mastery.metrics.errorCount >= 2);
    assert.strictEqual(mastery.level, teachingIntelligence.MASTERY_LEVELS.NOVICE);
  });

  await test('Scenario D: Invalid algebraic shortcuts are deterministically audited and rejected', async () => {
    const rad = teachingIntelligence.auditProposedShortcut({ userText: 'Can I simplify sqrt(x^2 + 9) to x + 3?' });
    assert.strictEqual(rad.isValid, false);
    assert.strictEqual(rad.failureReason, 'RADICAL_DOES_NOT_DISTRIBUTE_OVER_ADDITION');

    const zeroDiv = teachingIntelligence.auditProposedShortcut({ userText: 'Can I divide both sides by x on x^2 = 5x?' });
    assert.strictEqual(zeroDiv.isValid, false);
    assert.strictEqual(zeroDiv.failureReason, 'ZERO_DIVISOR_AND_LOST_SOLUTION');
  });

  await test('Scenario E: Student frustration/confusion adapts cognitiveLoad to reduce', async () => {
    const intent = studentIntentClassifier.classifyStudentIntent('I am totally lost', []);
    assert.strictEqual(intent.intent, studentIntentClassifier.INTENTS.CONFUSION);
    const state = learnerState.classifyLearnerState('I still do not get this', [
      { role: 'user', content: 'I am confused' },
      { role: 'assistant', content: 'Let us try again.' }
    ], null, intent, null);
    assert.strictEqual(state.state, learnerState.LEARNER_STATES.REPEATED_CONFUSION);
    assert.strictEqual(state.pedagogy.cognitiveLoad, 'reduce');
  });

  await test('Scenario F: Student challenge triggers tutor re-verification flag, not self-correction', async () => {
    const history = [{ role: 'assistant', content: 'The product is 1896.' }];
    const intent = studentIntentClassifier.classifyStudentIntent("That isn't 1896; it is 1888", history);
    assert.strictEqual(intent.intent, studentIntentClassifier.INTENTS.CORRECTION);
    assert.strictEqual(intent.isTutorChallenge, true);
    const state = learnerState.classifyLearnerState("That isn't 1896; it is 1888", history, null, intent, null);
    assert.notStrictEqual(state.state, learnerState.LEARNER_STATES.SELF_CORRECTION);
  });

  await test('Scenario G: Subject transitions (Algebra -> Physics -> Calculus) prevent mastery bleed', async () => {
    const algebraMasteredHistory = [
      { role: 'user', content: 'Solve 2x + 4 = 10' },
      { role: 'assistant', content: 'Next step?' },
      { role: 'user', content: '2x = 6' },
      { role: 'assistant', content: 'Correct!' },
      { role: 'user', content: 'x = 3' },
      { role: 'assistant', content: 'Exactly! Next: Solve 3x = 9' },
      { role: 'user', content: 'x = 3' },
      { role: 'assistant', content: 'Spot on!' }
    ];
    const physMastery = teachingIntelligence.analyzeConceptMastery({
      classification: { problemDomain: 'PHYSICS', problemSubtype: 'KINEMATICS' },
      conversationHistory: algebraMasteredHistory
    });
    const calcMastery = teachingIntelligence.analyzeConceptMastery({
      classification: { problemDomain: 'CALCULUS', problemSubtype: 'DIFFERENTIATION' },
      conversationHistory: algebraMasteredHistory
    });
    assert.strictEqual(physMastery.metrics.unassistedSuccessCount, 0);
    assert.strictEqual(calcMastery.metrics.unassistedSuccessCount, 0);
    assert.strictEqual(physMastery.level, teachingIntelligence.MASTERY_LEVELS.NOVICE);
    assert.strictEqual(calcMastery.level, teachingIntelligence.MASTERY_LEVELS.NOVICE);
  });

  await test('Scenario H: Persisted concept mastery restores across sessions', async () => {
    const savedProfile = {
      learning: {
        masteredConcepts: [
          'LINEAR_EQUATION|conf:0.92|ind:4'
        ]
      }
    };
    const restored = teachingIntelligence.analyzeConceptMastery({
      classification: { problemDomain: 'ALGEBRA', problemSubtype: 'LINEAR_EQUATION' },
      conversationHistory: [],
      studentProfile: savedProfile
    });
    assert.strictEqual(restored.fromPersistedProfile, true);
    assert.strictEqual(restored.level, teachingIntelligence.MASTERY_LEVELS.MASTERY);
    assert(restored.metrics.unassistedSuccessCount >= 4);
  });

  await test('Scenario I: LANZAR ID and Firebase auth resolve isolated canonical identities', async () => {
    const lanzarToken = lanzarIdService.signLanzarToken({
      uid: 'lanzar_p21_test_user',
      email: 'p21_lanzar@lanzar.test',
      displayName: 'Lanzar Test'
    });
    const lanzarRes = await serverGateway.verifyAuthenticatedRequestUser({
      headers: { authorization: `Bearer ${lanzarToken}` }
    });
    assert.strictEqual(lanzarRes.uid, 'lanzar_p21_test_user');
    assert.strictEqual(lanzarRes.provider, 'lanzar_id');

    serverGateway.app.setGoogleTokenVerifierForTesting(async (tok) => (
      tok === 'mock_fb_tok' ? { uid: 'fb_p21_test_user', email: 'p21_fb@lanzar.test', name: 'Firebase Test' } : null
    ));
    const fbRes = await serverGateway.verifyAuthenticatedRequestUser({
      headers: { authorization: 'Bearer mock_fb_tok' }
    });
    serverGateway.app.setGoogleTokenVerifierForTesting(null);
    assert.strictEqual(fbRes.uid, 'fb_p21_test_user');
    assert.strictEqual(fbRes.provider, 'firebase');
    assert.notStrictEqual(lanzarRes.uid, fbRes.uid);
  });

  await test('Scenario J: Conflicting pedagogical signals resolve to one coherent decision', async () => {
    const whyIntent = studentIntentClassifier.classifyStudentIntent('Why do we divide both sides by 2a?', []);
    assert.strictEqual(whyIntent.intent, studentIntentClassifier.INTENTS.WHY_EXPLANATION_REQUEST);
    const whyState = learnerState.classifyLearnerState('Why do we divide both sides by 2a?', [], null, whyIntent, null);
    assert.notStrictEqual(whyState.state, learnerState.LEARNER_STATES.CONFUSION);

    const compound = studentIntentClassifier.classifyStudentIntent('Is my work right? Can you visualize this?', [
      { role: 'user', content: 'Right triangle with opposite = 3, adjacent = 4' },
      { role: 'assistant', content: 'Find the hypotenuse.' }
    ]);
    assert.strictEqual(compound.intent, studentIntentClassifier.INTENTS.VALIDATION_REQUEST);
  });

  console.log(`\nSUMMARY: ${passed}/${total} adaptive multi-turn scenarios passed.`);
}

runTests().catch(err => {
  console.error('Fatal adaptive test error:', err);
  process.exit(1);
});
