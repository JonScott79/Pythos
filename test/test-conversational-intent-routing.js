/**
 * test/test-conversational-intent-routing.js
 *
 * Comprehensive Regression & Architectural Verification Suite for:
 * Incident: Pythagorean Trigonometric Identity Request Routed to Geometry Model (v1.8.75 -> v1.8.76)
 *
 * Verifies:
 * 1. Exact 10-turn reconstructed incident reproduction (emoticon '=)' handling, post-warning recovery,
 *    context preservation, zero false 3-4-5 right-triangle tool selection, and full verification of
 *    all three Pythagorean trigonometric identities and their derivations/rearrangements).
 * 2. All Section 3A & Section 5 mandatory scenarios across:
 *    - Fresh sessions
 *    - Multi-turn trigonometric sessions
 *    - Mixed mathematical and conversational sessions
 *    - Student correction / disambiguation sessions
 * 3. Client-side (js/mathInputEngine.js) and Server-side (server/mathFormatDetector.js) parity on
 *    conversational emoticons (=), :), :-), ;), :D, =D, :(, =() vs. genuine malformed math syntax.
 * 4. Strict domain & routing separation between:
 *    - "What is a 3-4-5 triangle?" -> GEOMETRY / RIGHT_TRIANGLE_GEOMETRY + render_geometry_triangle (3-4-5)
 *    - "Explain the Pythagorean theorem" -> GEOMETRY / PYTHAGOREAN_THEOREM (no unsolicited 3-4-5 calculation)
 *    - "Show me the Pythagorean trigonometric identities" -> TRIGONOMETRY / TRIGONOMETRIC_IDENTITIES (no geometry tool)
 */

const assert = require('assert');
const { detectFormattingAnomaly } = require('../server/mathFormatDetector');
const { classifyProblem, DOMAINS } = require('../server/problemClassifier');
const { classifyStudentIntent, INTENTS, containsMathSymbols } = require('../server/studentIntentClassifier');
const { buildEffectivePrompt, extractActiveProblemState, formatActiveProblemContext } = require('../server/contextManager');
const toolController = require('../server/toolController');
const { constructSafeVerifiedResponse } = require('../server/safeResponseConstructor');
const { verifyResponseClaims, auditPromptClaimFidelity } = require('../server/verificationBridge');
const { extractRightTriangleParameters } = require('../server/vizEngine/visualFidelity');
const clientMathEngine = require('../js/mathInputEngine');

console.log('======================================================================');
console.log('PYTHOS: CONVERSATIONAL INTENT & ROUTING FAILURE REGRESSION SUITE');
console.log('======================================================================\n');

let passed = 0;
let failed = 0;

async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ [PASS] ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ✗ [FAIL] ${name}: ${err.message}`);
    if (err.stack) {
      console.error('    ' + err.stack.split('\n').slice(1, 4).join('\n    '));
    }
  }
}

(async () => {
  // =========================================================================
  // 1. INPUT NORMALIZATION & EMOTICON / CONVERSATIONAL DIALOGUE DISCRIMINATION
  // =========================================================================
  await check('1. Conversational emoticons (=), :), ;), :D, =D, :(, =() never trigger server or client malformed syntax warnings', () => {
    const conversationalInputs = [
      'yes i understand identities i just wanted yout o show them all to me =)',
      'Yes, I understand =)',
      'I understand.',
      'Show me all of them',
      'I meant the other identities.',
      "No, that's not what I meant.",
      'Thanks for explaining that :)',
      'Got it now ;-)',
      'Oh I was confused before :(',
      'Can you show me all the identities =D',
      '1) Show me the sine and cosine identity\n2) Show me the tangent and cotangent identities'
    ];

    for (const input of conversationalInputs) {
      const serverAnomaly = detectFormattingAnomaly(input);
      assert.strictEqual(
        serverAnomaly.isWeird,
        false,
        `Server detectFormattingAnomaly falsely flagged "${input}" as ${serverAnomaly.kind}: ${serverAnomaly.explanation}`
      );

      const clientIssue = clientMathEngine.detectInputFormattingIssue(input);
      assert.strictEqual(
        clientIssue.hasIssue,
        false,
        `Client detectInputFormattingIssue falsely flagged "${input}" as ${clientIssue.kind}: ${clientIssue.message}`
      );

      assert.strictEqual(
        clientMathEngine.detectMathInInput(input),
        false,
        `Client detectMathInInput falsely classified "${input}" as mathematical notation`
      );

      assert.strictEqual(
        containsMathSymbols(input),
        false,
        `studentIntentClassifier.containsMathSymbols falsely flagged "${input}"`
      );
    }
  });

  await check('2. Genuine malformed mathematical expressions continue to be caught without weakening validation', () => {
    const malformedInputs = [
      { expr: '2\\sin^{2(x)+}\\csc(x) - 9 = 0', expectedKind: 'TRAPPED_OPERATOR_IN_EXPONENT' },
      { expr: '\\frac{1-\\cos^{2(x)}}{\\sin(x)}', expectedKind: 'TRIG_POWER_ARG_MISMATCH' },
      { expr: '(x + 2) + 3) = 7', expectedKind: 'UNBALANCED_DELIMITERS' },
      { expr: '\\frac{2x}{}', expectedKind: 'EMPTY_LATEX_BLOCK' },
      { expr: '2x + = 5', expectedKind: 'DANGLING_OPERATOR' }
    ];

    for (const { expr, expectedKind } of malformedInputs) {
      const serverAnomaly = detectFormattingAnomaly(expr);
      assert.strictEqual(serverAnomaly.isWeird, true, `Expected server to flag malformed math "${expr}"`);
      assert.strictEqual(serverAnomaly.kind, expectedKind, `Expected ${expectedKind} for "${expr}", got ${serverAnomaly.kind}`);

      const clientIssue = clientMathEngine.detectInputFormattingIssue(expr);
      assert.strictEqual(clientIssue.hasIssue, true, `Expected client to flag malformed math "${expr}"`);
    }
  });

  // =========================================================================
  // 2. RECONSTRUCTED 10-TURN INCIDENT END-TO-END TRACE
  // =========================================================================
  const incidentHistory = [
    { role: 'user', content: '\\[ \\boxed{ \\frac{1-\\cos^2(x)}{\\sin(x)} + \\frac{1-\\sin^2(x)}{\\cos(x)} } \\]' },
    {
      role: 'assistant',
      content: 'Great, that’s the expression we’ll work with:\n$$\\frac{1-\\cos^2 x}{\\sin x} + \\frac{1-\\sin^2 x}{\\cos x}$$\nStep 1 – Recognize the Pythagorean identities\nRecall that for any angle $x$,\n$$\\sin^2 x + \\cos^2 x = 1$$\nFrom this we can rewrite the numerators:\n$$1 - \\cos^2 x = \\sin^2 x$$\n$$1 - \\sin^2 x = \\cos^2 x$$'
    },
    { role: 'user', content: 'show me the identities please' },
    {
      role: 'assistant',
      content: 'Sure! The basic Pythagorean identities come directly from the right-triangle definition of sine and cosine (or from the unit circle).\nFor any angle $x$:\n$$\\sin^2 x + \\cos^2 x = 1$$\nFrom this single relation we can solve for either $\\sin^2 x$ or $\\cos^2 x$:\n$$1 - \\cos^2 x = \\sin^2 x, \\quad 1 - \\sin^2 x = \\cos^2 x$$'
    }
  ];

  await check('3. Reconstructed Incident Turn 7/8 ("yes i understand identities i just wanted yout o show them all to me =)"): zero format warning, routes to TRIGONOMETRY, zero geometry tool', () => {
    const turn7Input = 'yes i understand identities i just wanted yout o show them all to me =)';
    const messagesAtTurn7 = [...incidentHistory, { role: 'user', content: turn7Input }];

    // 1. Format anomaly check
    const anomaly = detectFormattingAnomaly(turn7Input, { conversationHistory: incidentHistory });
    assert.strictEqual(anomaly.isWeird, false, 'Turn 7 must not trigger UNBALANCED_DELIMITERS on =)');

    // 2. Effective prompt & context preservation
    const effectivePrompt = buildEffectivePrompt(messagesAtTurn7);
    assert(
      effectivePrompt.includes('Pythagorean trigonometric identities'),
      `Expected effectivePrompt to preserve trigonometric identity topic context, got: ${effectivePrompt}`
    );

    // 3. Problem classification
    const classification = classifyProblem(effectivePrompt);
    assert.strictEqual(classification.problemDomain, DOMAINS.TRIGONOMETRY);
    assert.strictEqual(classification.problemSubtype, 'TRIGONOMETRIC_IDENTITIES');

    // 4. Student intent classification
    const activeState = extractActiveProblemState(incidentHistory, [], { excludeUnverifiedUserSteps: true });
    const intent = classifyStudentIntent(turn7Input, incidentHistory, activeState);
    assert.strictEqual(intent.intent, INTENTS.EXPLANATION_REQUEST);
    assert.strictEqual(intent.isReferentialFollowUp, true);

    // 5. Tool selection & right-triangle parameter extraction
    const triangleParams = extractRightTriangleParameters(turn7Input, incidentHistory, activeState);
    assert.strictEqual(triangleParams, null, 'Must NOT extract 3-4-5 right triangle parameters from assistant prose');

    const selectedTool = toolController.selectAppropriateTool(intent, turn7Input, messagesAtTurn7, activeState);
    assert.strictEqual(selectedTool, null, 'Must NOT select render_geometry_triangle on trigonometric identity request');

    // 6. Active problem context includes recent explanation topic
    const formattedCtx = formatActiveProblemContext(activeState);
    assert(
      formattedCtx.includes('Pythagorean Trigonometric Identities') &&
      formattedCtx.includes('1 + \\tan^2(x) = \\sec^2(x)') &&
      formattedCtx.includes('1 + \\cot^2(x) = \\csc^2(x)'),
      'Active problem context must surface the three fundamental Pythagorean trigonometric identities'
    );
  });

  await check('4. Reconstructed Incident Turn 9/10 (repeated without "=)" even after a prior MALFORMED_SYNTAX turn): never triggers 3-4-5 triangle and verifies all 3 Pythagorean identities + derivations', async () => {
    const turn9Input = 'yes i understand identities i just wanted yout o show them all to me.';
    const historyWithPriorWarning = [
      ...incidentHistory,
      { role: 'user', content: 'yes i understand identities i just wanted yout o show them all to me =)' },
      {
        role: 'assistant',
        content: "The formatting on this problem looks a little weird.\n\nIt looks like there's an extra closing ) near ll to me =) without an opening match.",
        withholdingReason: 'MALFORMED_SYNTAX'
      }
    ];
    const messagesAtTurn9 = [...historyWithPriorWarning, { role: 'user', content: turn9Input }];

    const effectivePrompt = buildEffectivePrompt(messagesAtTurn9);
    assert(
      effectivePrompt.includes(turn9Input) && effectivePrompt.includes('Pythagorean trigonometric identities'),
      `Turn 9 effectivePrompt must not be overwritten with Turn 1 raw equation; got: ${effectivePrompt}`
    );

    const activeState = extractActiveProblemState(historyWithPriorWarning, [], { excludeUnverifiedUserSteps: true });
    const intent = classifyStudentIntent(turn9Input, historyWithPriorWarning, activeState);
    assert.strictEqual(intent.intent, INTENTS.EXPLANATION_REQUEST);

    const selectedTool = toolController.selectAppropriateTool(intent, turn9Input, messagesAtTurn9, activeState);
    assert.strictEqual(selectedTool, null, 'Turn 9 must NOT select render_geometry_triangle');

    // Even if a preflight geometry tool result were hypothetically passed to constructSafeVerifiedResponse,
    // it must refuse to overwrite a trigonometric identity inquiry with a 3-4-5 right triangle!
    const safeRecovery = constructSafeVerifiedResponse({
      userPrompt: turn9Input,
      preflightToolResult: {
        success: true,
        tool: 'render_geometry_triangle',
        opp: 3,
        adj: 4,
        hyp: 5
      },
      activeProblemState: activeState,
      messages: messagesAtTurn9
    });
    assert.strictEqual(safeRecovery, null, 'constructSafeVerifiedResponse must never return a 3-4-5 triangle for an identity request');

    // Verify expected response containing all 3 fundamental Pythagorean identities, their derivations, and rearrangements
    const expectedIdentityResponse = [
      'Here are all three fundamental **Pythagorean trigonometric identities** and how the second and third are derived from the first:',
      '',
      '### 1. Sine and Cosine Identity',
      '$$\\sin^2(x) + \\cos^2(x) = 1$$',
      'Common rearrangements:',
      '$$1 - \\cos^2(x) = \\sin^2(x), \\quad 1 - \\sin^2(x) = \\cos^2(x)$$',
      '',
      '### 2. Tangent and Secant Identity',
      'Divide every term of $\\sin^2(x) + \\cos^2(x) = 1$ by $\\cos^2(x)$:',
      '$$\\frac{\\sin^2(x)}{\\cos^2(x)} + \\frac{\\cos^2(x)}{\\cos^2(x)} = \\frac{1}{\\cos^2(x)}$$',
      'Using $\\tan(x) = \\frac{\\sin(x)}{\\cos(x)}$, $\\frac{\\cos^2(x)}{\\cos^2(x)} = 1$, and $\\sec(x) = \\frac{1}{\\cos(x)}$:',
      '$$\\tan^2(x) + 1 = \\sec^2(x) \\quad \\text{or} \\quad 1 + \\tan^2(x) = \\sec^2(x)$$',
      'Common rearrangements:',
      '$$\\tan^2(x) = \\sec^2(x) - 1, \\quad \\sec^2(x) - \\tan^2(x) = 1$$',
      '',
      '### 3. Cotangent and Cosecant Identity',
      'Divide every term of $\\sin^2(x) + \\cos^2(x) = 1$ by $\\sin^2(x)$:',
      '$$\\frac{\\sin^2(x)}{\\sin^2(x)} + \\frac{\\cos^2(x)}{\\sin^2(x)} = \\frac{1}{\\sin^2(x)}$$',
      'Using $\\frac{\\sin^2(x)}{\\sin^2(x)} = 1$, $\\cot(x) = \\frac{\\cos(x)}{\\sin(x)}$, and $\\csc(x) = \\frac{1}{\\sin(x)}$:',
      '$$1 + \\cot^2(x) = \\csc^2(x)$$',
      'Common rearrangements:',
      '$$\\cot^2(x) = \\csc^2(x) - 1, \\quad \\csc^2(x) - \\cot^2(x) = 1$$'
    ].join('\n');

    const vRes = await verifyResponseClaims(expectedIdentityResponse, effectivePrompt);
    assert.strictEqual(
      vRes.invalidClaims.length,
      0,
      `Expected 0 invalid claims on complete Pythagorean identities presentation, got: ${JSON.stringify(vRes.invalidClaims)}`
    );
    assert.strictEqual(vRes.unknownClaims.length, 0, 'Expected 0 unknown claims');
    assert(vRes.claims.length >= 10, `Expected at least 10 verified identity claims, got ${vRes.claims.length}`);
  });

  // =========================================================================
  // 3. SECTION 5 MANDATORY SCENARIO MATRIX (Fresh, Multi-Turn, Mixed, Correction)
  // =========================================================================
  await check('5. All 10 Section 5 regression table scenarios + Section 3A cases pass in Multi-Turn Sessions', () => {
    const tableScenarios = [
      {
        input: 'Show me all the identities',
        expectedIntent: INTENTS.EXPLANATION_REQUEST,
        expectedDomain: DOMAINS.TRIGONOMETRY,
        expectedSubtype: 'TRIGONOMETRIC_IDENTITIES',
        expectedTool: null
      },
      {
        input: 'I understand that one, show me the others',
        expectedIntent: INTENTS.EXPLANATION_REQUEST,
        expectedDomain: DOMAINS.TRIGONOMETRY,
        expectedSubtype: 'TRIGONOMETRIC_IDENTITIES',
        expectedTool: null
      },
      {
        input: 'Yes, I understand =)',
        expectedIntent: INTENTS.EUREKA_OR_GRATITUDE,
        expectedDomain: DOMAINS.TRIGONOMETRY,
        expectedSubtype: 'TRIGONOMETRIC_RELATIONS',
        expectedTool: null
      },
      {
        input: 'I understand.',
        expectedIntent: INTENTS.EUREKA_OR_GRATITUDE,
        expectedDomain: DOMAINS.TRIGONOMETRY,
        expectedSubtype: 'TRIGONOMETRIC_RELATIONS',
        expectedTool: null
      },
      {
        input: 'Can you show me another way?',
        expectedIntent: INTENTS.REFRAME_REQUEST,
        expectedDomain: DOMAINS.TRIGONOMETRY,
        expectedSubtype: 'TRIGONOMETRIC_RELATIONS',
        expectedTool: null
      },
      {
        input: 'What about tangent?',
        expectedIntent: INTENTS.EXPLANATION_REQUEST,
        expectedDomain: DOMAINS.TRIGONOMETRY,
        expectedSubtype: 'TRIGONOMETRIC_IDENTITIES',
        expectedTool: null
      },
      {
        input: "No, that's not what I meant",
        expectedIntent: INTENTS.CORRECTION,
        expectedDisambiguation: true,
        expectedTool: null
      },
      {
        input: 'I meant the other identities.',
        expectedIntent: INTENTS.CORRECTION,
        expectedDisambiguation: true,
        expectedDomain: DOMAINS.TRIGONOMETRY,
        expectedSubtype: 'TRIGONOMETRIC_IDENTITIES',
        expectedTool: null
      },
      {
        input: 'Show me all of them',
        expectedIntent: INTENTS.EXPLANATION_REQUEST,
        expectedDomain: DOMAINS.TRIGONOMETRY,
        expectedSubtype: 'TRIGONOMETRIC_IDENTITIES',
        expectedTool: null
      },
      {
        input: 'What is a 3-4-5 triangle?',
        expectedIntent: INTENTS.EXPLANATION_REQUEST,
        expectedDomain: DOMAINS.GEOMETRY,
        expectedSubtype: 'RIGHT_TRIANGLE_GEOMETRY',
        expectedTool: 'render_geometry_triangle'
      },
      {
        input: 'Explain the Pythagorean theorem',
        expectedIntent: INTENTS.EXPLANATION_REQUEST,
        expectedDomain: DOMAINS.GEOMETRY,
        expectedSubtype: 'PYTHAGOREAN_THEOREM',
        expectedTool: null
      },
      {
        input: 'Show me the Pythagorean trigonometric identities',
        expectedIntent: INTENTS.EXPLANATION_REQUEST,
        expectedDomain: DOMAINS.TRIGONOMETRY,
        expectedSubtype: 'TRIGONOMETRIC_IDENTITIES',
        expectedTool: null
      }
    ];

    const activeState = extractActiveProblemState(incidentHistory, [], { excludeUnverifiedUserSteps: true });

    for (const sc of tableScenarios) {
      const msgs = [...incidentHistory, { role: 'user', content: sc.input }];
      const anom = detectFormattingAnomaly(sc.input, { conversationHistory: incidentHistory });
      assert.strictEqual(anom.isWeird, false, `Unexpected formatting anomaly on "${sc.input}"`);

      const stu = classifyStudentIntent(sc.input, incidentHistory, activeState);
      assert.strictEqual(stu.intent, sc.expectedIntent, `Intent mismatch for "${sc.input}": expected ${sc.expectedIntent}, got ${stu.intent}`);
      if (sc.expectedDisambiguation) {
        assert.strictEqual(stu.isDisambiguation, true, `Expected isDisambiguation=true for "${sc.input}"`);
        assert.strictEqual(stu.extractedExpression, undefined, `Must not extract English words as math expression for "${sc.input}"`);
      }

      const effPrompt = buildEffectivePrompt(msgs);
      const prob = classifyProblem(effPrompt);
      if (sc.expectedDomain) {
        assert.strictEqual(prob.problemDomain, sc.expectedDomain, `Domain mismatch for "${sc.input}": expected ${sc.expectedDomain}, got ${prob.problemDomain}`);
      }
      if (sc.expectedSubtype) {
        assert.strictEqual(prob.problemSubtype, sc.expectedSubtype, `Subtype mismatch for "${sc.input}": expected ${sc.expectedSubtype}, got ${prob.problemSubtype}`);
      }

      const tool = toolController.selectAppropriateTool(stu, sc.input, msgs, activeState);
      const actualToolName = tool ? tool.tool : null;
      assert.strictEqual(actualToolName, sc.expectedTool, `Tool selection mismatch for "${sc.input}": expected ${sc.expectedTool}, got ${actualToolName}`);
      if (sc.expectedTool === 'render_geometry_triangle') {
        assert.strictEqual(tool.arguments.opposite, 3);
        assert.strictEqual(tool.arguments.adjacent, 4);
        assert.strictEqual(tool.arguments.hypotenuse, 5);
      }
    }
  });

  await check('6. Fresh Session vs. Mixed Session vs. Student Correction Session behavior', () => {
    // A. Fresh Session (empty history)
    const fresh345 = classifyProblem('What is a 3-4-5 triangle?');
    assert.strictEqual(fresh345.problemDomain, DOMAINS.GEOMETRY);
    assert.strictEqual(fresh345.problemSubtype, 'RIGHT_TRIANGLE_GEOMETRY');
    const fresh345Intent = classifyStudentIntent('What is a 3-4-5 triangle?', []);
    const fresh345Tool = toolController.selectAppropriateTool(fresh345Intent, 'What is a 3-4-5 triangle?', []);
    assert(fresh345Tool && fresh345Tool.tool === 'render_geometry_triangle', 'Fresh "What is a 3-4-5 triangle?" must select render_geometry_triangle');

    const freshPythThm = classifyProblem('Explain the Pythagorean theorem');
    assert.strictEqual(freshPythThm.problemDomain, DOMAINS.GEOMETRY);
    assert.strictEqual(freshPythThm.problemSubtype, 'PYTHAGOREAN_THEOREM');
    const freshPythThmTool = toolController.selectAppropriateTool(
      classifyStudentIntent('Explain the Pythagorean theorem', []),
      'Explain the Pythagorean theorem',
      []
    );
    assert.strictEqual(freshPythThmTool, null, 'Fresh "Explain the Pythagorean theorem" must not inject unsolicited 3-4-5 calculation');

    const freshPythTrig = classifyProblem('Show me the Pythagorean trigonometric identities');
    assert.strictEqual(freshPythTrig.problemDomain, DOMAINS.TRIGONOMETRY);
    assert.strictEqual(freshPythTrig.problemSubtype, 'TRIGONOMETRIC_IDENTITIES');
    const freshPythTrigTool = toolController.selectAppropriateTool(
      classifyStudentIntent('Show me the Pythagorean trigonometric identities', []),
      'Show me the Pythagorean trigonometric identities',
      []
    );
    assert.strictEqual(freshPythTrigTool, null, 'Fresh "Show me the Pythagorean trigonometric identities" must not select geometry tool');

    // B. Ambiguous request in a fresh session ("Show me all of them" with zero prior history)
    // Must not fabricate a 3-4-5 right triangle!
    const freshAmbigIntent = classifyStudentIntent('Show me all of them', []);
    assert.strictEqual(freshAmbigIntent.intent, INTENTS.EXPLANATION_REQUEST);
    const freshAmbigTool = toolController.selectAppropriateTool(freshAmbigIntent, 'Show me all of them', []);
    assert.strictEqual(freshAmbigTool, null, 'Ambiguous "Show me all of them" in fresh session must not select a geometry triangle');

    // C. Mixed session where student corrects a previous interpretation ("No, that's not what I meant" -> "I meant the other identities")
    const correctionHistory = [
      ...incidentHistory,
      { role: 'user', content: "No, that's not what I meant" },
      { role: 'assistant', content: 'My apologies! Could you let me know whether you want to see the other Pythagorean identities (involving tangent/secant and cotangent/cosecant) or continue simplifying the expression?' },
      { role: 'user', content: 'I meant the other identities.' }
    ];
    const corrEffPrompt = buildEffectivePrompt(correctionHistory);
    assert(corrEffPrompt.includes('Pythagorean trigonometric identities'), `Expected resolved trig identity context after correction, got: ${corrEffPrompt}`);
    const corrProb = classifyProblem(corrEffPrompt);
    assert.strictEqual(corrProb.problemDomain, DOMAINS.TRIGONOMETRY);
    assert.strictEqual(corrProb.problemSubtype, 'TRIGONOMETRIC_IDENTITIES');
  });

  console.log('\n======================================================================');
  console.log(`CONVERSATIONAL INTENT & ROUTING RESULTS: ${passed}/${passed + failed} PASSED (${failed} failed)`);
  console.log('======================================================================');
  process.exit(failed > 0 ? 1 : 0);
})();
