#!/usr/bin/env node
/**
 * test/test-final-architectural-qualification.js
 *
 * PYTHOS — Final Architectural Challenge:
 * Mathematical Representation, Claim Integrity, Derivation Integrity,
 * Controlled JSON/NDJSON Transport Consistency, Expanded 12-Class Property-Based
 * Adversarial Testing, and Hosted LLM Operational Resilience Qualification Suite.
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { performance } = require('perf_hooks');

const {
  IR_KINDS,
  PROPOSITION_ROLES,
  buildMathIR,
  classifyPropositionRole,
  extractBoundSubstitutionSpec,
  enrichClaimsWithContract
} = require('../server/mathIR');
const {
  verifyResponseClaims,
  evaluateVerificationState,
  closeVerifierDaemon
} = require('../server/verificationBridge');
const {
  closeCalculusDaemon
} = require('../server/engines/calculusEngine');
const providerPolicy = require('../server/providerPolicy');

async function runFinalArchitecturalQualification() {
  console.log('================================================================================');
  console.log('🏛️  PYTHOS — FINAL ARCHITECTURAL CHALLENGE & PRODUCTION QUALIFICATION SUITE');
  console.log('================================================================================\n');

  const summary = {
    module1_mathIrAndClaimContract: { passed: 0, total: 0 },
    module2_derivationIntegrity8Scenarios: { passed: 0, total: 0, tp: 0, tn: 0 },
    module3_jsonNdjsonTransportParity: { passed: 0, total: 0, cases: [] },
    module4_expanded12ClassAdversarial72: { passed: 0, total: 0, tp: 0, tn: 0, fp: 0, fn: 0, byClass: {} },
    module5_providerResilience: { passed: 0, total: 0 }
  };

  // ===========================================================================
  // MODULE 1: TYPED MATHEMATICAL INTERMEDIATE REPRESENTATION (MathIR) & 9-ROLE CONTRACT
  // ===========================================================================
  console.log('▶ [MODULE 1] Typed Mathematical Intermediate Representation (MathIR) & 9-Role Claim Contract...');

  function checkM1(name, fn) {
    summary.module1_mathIrAndClaimContract.total++;
    fn();
    summary.module1_mathIrAndClaimContract.passed++;
  }

  // 1.1 Verify MathIR across all required mathematical object types
  checkM1('M1-1: Arithmetic & Nested Fraction MathIR', () => {
    const ir = buildMathIR('\\dfrac{3}{2} + \\tfrac{1}{4}');
    assert.strictEqual(ir.kind, IR_KINDS.ARITHMETIC);
    assert.strictEqual(ir.ast.parseable, true);
    assert.strictEqual(ir.variables.length, 0);
  });

  checkM1('M1-2: Algebraic & Rational Expression with Intrinsic AST Domain Hazards', () => {
    const ir = buildMathIR('\\frac{\\sqrt{x - 3}}{\\sin(x) \\cdot \\ln(x - 1)}');
    assert.strictEqual(ir.ast.parseable, true);
    assert(ir.variables.includes('x'));
    assert(ir.ast.domainHazards.denominators.length >= 1, 'Must detect denominator from AST');
    assert(ir.ast.domainHazards.evenRootRadicands.some(r => r.includes('x') && r.includes('3')), 'Must detect even-root radicand from AST');
    assert(ir.ast.domainHazards.logArguments.some(a => a.includes('x') && a.includes('1')), 'Must detect log argument from AST');
  });

  checkM1('M1-3: Function Composition & Trigonometric Power AST Distinction', () => {
    const irPow = buildMathIR('\\sin^2(x)');
    const irComp = buildMathIR('\\sin(x^2)');
    const irInv = buildMathIR('\\sin^{-1}(x)');
    assert.strictEqual(irPow.canonical, '(sin(x))^2');
    assert.strictEqual(irComp.canonical, 'sin(x^2)');
    assert.strictEqual(irInv.canonical, 'arcsin(x)');
    assert(irInv.ast.domainHazards.inverseTrigArguments.includes('x'));
  });

  checkM1('M1-4: Symbolic Parameters vs Independent Variables in Physics Potential', () => {
    const ir = buildMathIR('\\frac{L^2}{r^2}\\left(1 - \\frac{r_s}{r}\\right)');
    assert(ir.variables.includes('r'), 'r must be classified as independent variable');
    assert(ir.parameters.includes('L') && ir.parameters.includes('r_s'), 'L and r_s must be classified as symbolic parameters');
    assert(ir.ast.domainHazards.denominators.some(d => d.includes('r')));
  });

  checkM1('M1-5: 9 Semantic Proposition Roles Classification', () => {
    assert.strictEqual(
      classifyPropositionRole('1 - \\cos^2(x) = \\sin^2(x)', { claimType: 'symbolic_equivalence', isStandaloneIdentity: true }),
      PROPOSITION_ROLES.IDENTITY
    );
    assert.strictEqual(
      classifyPropositionRole('Solve 2x^2 - 7x + 6 = 0', { claimType: 'equation_solution' }),
      PROPOSITION_ROLES.EQUATION_TO_SOLVE
    );
    assert.strictEqual(
      classifyPropositionRole('\\sin x = 0 \\Longrightarrow x = k\\pi'),
      PROPOSITION_ROLES.CONDITION_EVALUATION
    );
    assert.strictEqual(
      classifyPropositionRole('Domain restrictions: \\sin(x) \\neq 0 and \\cos(x) \\neq 0'),
      PROPOSITION_ROLES.DOMAIN_RESTRICTION
    );
    assert.strictEqual(
      classifyPropositionRole('Substituting x = 8 into 2x + 5 gives 21', { claimType: 'substitution_evaluation' }),
      PROPOSITION_ROLES.SUBSTITUTION
    );
    assert.strictEqual(
      classifyPropositionRole('Let f(x) = x^4 - 6x^3 + 9x^2'),
      PROPOSITION_ROLES.DEFINITION
    );
    assert.strictEqual(
      classifyPropositionRole('2x^2 - 7x + 6 = (2x - 3)(x - 2)', { claimType: 'symbolic_equivalence', isChainedStep: true, stepIndex: 1 }),
      PROPOSITION_ROLES.INTERMEDIATE_DERIVATION_STEP
    );
    assert.strictEqual(
      classifyPropositionRole('\\boxed{x = \\dfrac{3}{2} \\text{ or } x = 2}'),
      PROPOSITION_ROLES.FINAL_ANSWER
    );
    assert.strictEqual(
      classifyPropositionRole('(2x + ?)(x + ?) = 2x^2 + 7x + 6'),
      PROPOSITION_ROLES.EXPLANATORY_NON_ASSERTION
    );
  });

  checkM1('M1-6: Sequential Step-Chain Contract Linkage (claimId, prevStepId, nextStepId, ir)', async () => {
    // Verified asynchronously below
  });
  const contractAudit = await verifyResponseClaims(
    '$$1 - \\cos^2(x) = \\sin^2(x)$$\n$$1 - \\sin^2(x) = \\cos^2(x)$$\n$$\\boxed{\\sin(x) + \\cos(x)}$$',
    'Where \\sin(x) \\neq 0 and \\cos(x) \\neq 0, simplify \\frac{1-\\cos^2(x)}{\\sin(x)} + \\frac{1-\\sin^2(x)}{\\cos(x)}'
  );
  assert(contractAudit.claims.length >= 2);
  assert.strictEqual(contractAudit.claims[0].contract.claimId, 'claim_1');
  assert.strictEqual(contractAudit.claims[0].contract.prevStepId, null);
  assert.strictEqual(contractAudit.claims[0].contract.nextStepId, 'claim_2');
  assert.strictEqual(contractAudit.claims[1].contract.prevStepId, 'claim_1');
  assert(contractAudit.claims[0].contract.ir && contractAudit.claims[0].contract.ir.ast.parseable);
  console.log(`  ✓ Module 1 passed (${summary.module1_mathIrAndClaimContract.passed}/${summary.module1_mathIrAndClaimContract.total} checks).\n`);

  // ===========================================================================
  // MODULE 2: 8-SCENARIO ADVERSARIAL DERIVATION INTEGRITY PROGRAM (Section 3)
  // ===========================================================================
  console.log('▶ [MODULE 2] 8-Scenario Adversarial Derivation Integrity Program (Section 3)...');

  const derivationIntegrityCases = [
    {
      id: 'DI_1_CORRECT_FINAL_WRONG_INTERMEDIATE',
      description: 'Final answer is correct (x = 3/2 or x = 2) but intermediate factoring step is wrong ((2x - 1)(x - 6) = 2x^2 - 7x + 6)',
      prompt: 'Solve 2x^2 - 7x + 6 = 0 by factoring.',
      response: 'We factor the quadratic:\n$$2x^2 - 7x + 6 = (2x - 1)(x - 6)$$\nTherefore the solutions are $\\boxed{x = \\dfrac{3}{2} \\text{ or } x = 2}$.',
      expectedPositive: false
    },
    {
      id: 'DI_2_CORRECT_INTERMEDIATE_WRONG_FINAL',
      description: 'Intermediate factoring step is correct ((2x - 3)(x - 2) = 2x^2 - 7x + 6) but final answer is wrong (x = 3/2 or x = 4)',
      prompt: 'Solve 2x^2 - 7x + 6 = 0 by factoring.',
      response: 'We factor the quadratic:\n$$2x^2 - 7x + 6 = (2x - 3)(x - 2)$$\nTherefore the solutions are $\\boxed{x = \\dfrac{3}{2} \\text{ or } x = 4}$.',
      expectedPositive: false
    },
    {
      id: 'DI_3_SKIPS_NECESSARY_DOMAIN_RESTRICTION',
      description: 'Derivation cancels (1 - cos(x)) and (1 - sin(x)) without stating cos(x) != 1 and sin(x) != 1',
      prompt: 'Simplify \\frac{\\sin^2(x)}{1-\\cos(x)} + \\frac{\\cos^2(x)}{1-\\sin(x)}',
      response: '$$\\frac{\\sin^2(x)}{1-\\cos(x)} + \\frac{\\cos^2(x)}{1-\\sin(x)} = 2 + \\sin(x) + \\cos(x)$$',
      expectedPositive: false
    },
    {
      id: 'DI_4_TRANSFORMATION_OUTSIDE_DOMAIN',
      description: 'Applies sqrt(x^2) = x unconditionally over all nonzero real x',
      prompt: 'Simplify \\frac{\\sqrt{x^2}}{x} for all nonzero real x.',
      response: 'Since $\\sqrt{x^2} = x$ for all real $x$, we have:\n$$\\frac{\\sqrt{x^2}}{x} = 1$$',
      expectedPositive: false
    },
    {
      id: 'DI_5A_SUBSTITUTION_WRONG_VARIABLE_SWAPPED',
      description: 'Swaps x = 3 and y = 4 when substituting into 2x + 5y (getting 2(4) + 5(3) = 23 instead of 26)',
      prompt: 'Given x = 3 and y = 4, evaluate 2x + 5y.',
      response: 'Substituting the given values into $2x + 5y$ gives:\n$$2(4) + 5(3) = 8 + 15 = 23$$\n$$\\boxed{23}$$',
      expectedPositive: false
    },
    {
      id: 'DI_5B_CONTEXTUAL_SUBSTITUTION_WRONG_VALUE',
      description: 'Contextual follow-up states x = 8 from Turn 1 but substitutes x = 5 into 2x + 5 (getting 2(5) + 8 = 18 instead of 21)',
      prompt: 'Solve 3x - 5 = 19 for x.\n\nStudent follow-up: Now substitute that value of x into 2x + 5 and evaluate it.',
      response: 'From the previous problem, $x = 8$. Substituting into $2x + 5$ gives:\n$$2(5) + 8 = 18$$\n$$\\boxed{18}$$',
      expectedPositive: false
    },
    {
      id: 'DI_5C_SUBSTITUTION_CORRECT_VARIABLE_POSITIVE_CONTROL',
      description: 'Positive control: Correctly substitutes x = 3 and y = 4 into 2x + 5y = 26',
      prompt: 'Given x = 3 and y = 4, evaluate 2x + 5y.',
      response: 'Substituting $x = 3$ and $y = 4$ into $2x + 5y$ gives:\n$$2(3) + 5(4) = 6 + 20 = 26$$\n$$\\boxed{26}$$',
      expectedPositive: true
    },
    {
      id: 'DI_6_FIRST_DERIVATIVE_CORRECT_SECOND_DERIVATIVE_WRONG',
      description: 'First derivative V\'_eff(r) is correct, but second derivative V\'\'_eff(r) has wrong coefficient -10r_s/r^5',
      prompt: 'For V_{\\mathrm{eff}}(r) = \\frac{L^2}{r^2}\\left(1 - \\frac{r_s}{r}\\right), compute V\'_{\\mathrm{eff}}(r) and V\'\'_{\\mathrm{eff}}(r).',
      response: '$$V_{\\mathrm{eff}}(r) = \\frac{L^2}{r^2}\\left(1 - \\frac{r_s}{r}\\right)$$\n$$V\'_{\\mathrm{eff}}(r) = L^2\\left(-\\frac{2}{r^3} + \\frac{3r_s}{r^4}\\right)$$\n$$V\'\'_{\\mathrm{eff}}(r) = L^2\\left(\\frac{6}{r^4} - \\frac{10r_s}{r^5}\\right)$$',
      expectedPositive: false
    },
    {
      id: 'DI_7_EQUATION_SOLVING_DROPS_ONE_ROOT',
      description: 'Valid factoring (2x - 3)(x - 2) = 2x^2 - 7x + 6 but drops root x = 3/2 and reports only x = 2',
      prompt: 'Solve 2x^2 - 7x + 6 = 0.',
      response: 'Factoring gives:\n$$2x^2 - 7x + 6 = (2x - 3)(x - 2)$$\nSetting the factor to zero gives $\\boxed{x = 2}$.',
      expectedPositive: false
    },
    {
      id: 'DI_8A_CLAIMS_SECOND_DERIVATIVE_NEVER_PERFORMED',
      description: 'Prose claims to compute the second derivative, but only the first derivative f\'(x) is actually computed',
      prompt: 'For f(x) = x^4 - 6x^3 + 9x^2, compute the first derivative f\'(x) and the second derivative f\'\'(x).',
      response: 'We differentiate $f(x) = x^4 - 6x^3 + 9x^2$ twice to obtain the first and second derivatives:\n$$\\boxed{f\'(x) = 4x^3 - 18x^2 + 18x}$$',
      expectedPositive: false
    },
    {
      id: 'DI_8B_CLAIMS_DIFFERENTIATION_LEAVES_EXPRESSION_UNCHANGED',
      description: 'Prose claims to apply the power rule to differentiate, but leaves polynomial unchanged',
      prompt: 'Differentiate f(x) = x^3 - 4x + 1.',
      response: 'Applying the power rule to differentiate each term with respect to $x$ gives:\n$$\\frac{d}{dx}(x^3 - 4x + 1) = x^3 - 4x + 1$$',
      expectedPositive: false
    }
  ];

  for (const tc of derivationIntegrityCases) {
    summary.module2_derivationIntegrity8Scenarios.total++;
    const audit = await verifyResponseClaims(tc.response, tc.prompt);
    const evalState = evaluateVerificationState({
      claims: audit.claims,
      verificationResults: audit.verificationResults,
      invalidClaims: audit.invalidClaims,
      unknownClaims: audit.unknownClaims,
      internalContradictions: audit.internalContradictions,
      prompt: tc.prompt,
      withheld: false
    });
    const isVerified = evalState.state === 'VERIFIED';
    const ok = isVerified === tc.expectedPositive;
    assert(ok, `[${tc.id}] Expected verified=${tc.expectedPositive}, got state=${evalState.state} (claims=${audit.claims.length}, invalid=${audit.invalidClaims.length})`);
    summary.module2_derivationIntegrity8Scenarios.passed++;
    if (tc.expectedPositive) summary.module2_derivationIntegrity8Scenarios.tp++;
    else summary.module2_derivationIntegrity8Scenarios.tn++;
  }
  console.log(`  ✓ Module 2 passed (${summary.module2_derivationIntegrity8Scenarios.passed}/${summary.module2_derivationIntegrity8Scenarios.total}: ${summary.module2_derivationIntegrity8Scenarios.tp} TP, ${summary.module2_derivationIntegrity8Scenarios.tn} TN).\n`);

  // ===========================================================================
  // MODULE 3: CONTROLLED JSON vs. NDJSON TRANSPORT CONSISTENCY HARNESS (Section 4)
  // ===========================================================================
  console.log('▶ [MODULE 3] Controlled JSON vs. NDJSON Transport Consistency Harness (Section 4)...');

  // Spin up controlled Express gateway with a deterministic mock upstream that returns the EXACT SAME
  // model response string for both stream:false (JSON) and stream:true (NDJSON).
  const origEnv = { ...process.env };
  let activeMockDraft = '';
  let activeMockRevisionDraft = '';

  const mockUpstream = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      let parsed = {};
      try { parsed = JSON.parse(body || '{}'); } catch (_) {}
      const msgs = Array.isArray(parsed.messages) ? parsed.messages : [];
      const isRevision = msgs.some(m => typeof m?.content === 'string' && m.content.includes('[VERIFICATION FEEDBACK]'));
      const replyText = isRevision ? activeMockRevisionDraft : activeMockDraft;
      res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
      res.end(JSON.stringify({ message: { content: replyText }, done: true }) + '\n');
    });
  });

  await new Promise(resolve => mockUpstream.listen(0, '127.0.0.1', resolve));
  const mockPort = mockUpstream.address().port;

  process.env.NODE_ENV = 'test';
  process.env.PRIMARY_TEXT_PROVIDER = 'ollama-text';
  process.env.OLLAMA_HOST = `http://127.0.0.1:${mockPort}`;
  process.env.OLLAMA_ENABLED = 'true';
  process.env.OLLAMA_LOCAL_ENABLED = 'true';
  process.env.GROQ_API_KEY = '';
  process.env.GEMINI_API_KEY = '';
  providerPolicy.clearRateLimits();

  const { app, clearActiveControllers } = require('../server/server');
  const gateway = await new Promise(resolve => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const gatewayUrl = `http://127.0.0.1:${gateway.address().port}`;

  try {
    const liveCorpus = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'golden', 'latest_live_llm_acceptance.json'), 'utf8')
    );

    const controlledTransportCases = [
      ...liveCorpus.scenarios.map(sc => ({
        id: `PARITY_${sc.id}`,
        messages: [{ role: 'user', content: sc.effectivePrompt }],
        tutorMode: Boolean(sc.tutorMode),
        fixedDraft: sc.rawModelResponse,
        fixedRevisionDraft: '',
        expectWithheld: false
      })),
      {
        id: 'PARITY_LATE_VERIFICATION_WITHHOLD_REVISION_EVENT',
        messages: [{ role: 'user', content: 'Differentiate f(x) = \\sin(x^2) with respect to x.' }],
        tutorMode: false,
        fixedDraft: 'Applying the chain rule gives $$\\frac{d}{dx}\\sin(x^2) = \\cos(x^2)$$. Therefore $$\\boxed{\\cos(x^2)}$$.',
        fixedRevisionDraft: '', // Revision also fails -> triggers late withholding or safe CAS recovery!
        expectLateStreamRevisionEvent: true
      }
    ];

    for (const tc of controlledTransportCases) {
      summary.module3_jsonNdjsonTransportParity.total++;
      activeMockDraft = tc.fixedDraft;
      activeMockRevisionDraft = tc.fixedRevisionDraft;
      app.resetAllRateLimits();

      // 1. Call JSON mode (stream: false)
      const jsonRes = await fetch(`${gatewayUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: tc.messages,
          tutorMode: tc.tutorMode,
          stream: false
        })
      });
      assert.strictEqual(jsonRes.status, 200);
      const jsonBody = await jsonRes.json();

      // 2. Call NDJSON mode (stream: true) with the EXACT SAME mock draft
      const ndjsonRes = await fetch(`${gatewayUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/x-ndjson'
        },
        body: JSON.stringify({
          messages: tc.messages,
          tutorMode: tc.tutorMode,
          stream: true
        })
      });
      assert.strictEqual(ndjsonRes.status, 200);
      const ndjsonText = await ndjsonRes.text();
      const events = ndjsonText.split('\n').map(l => l.trim()).filter(Boolean).map(l => JSON.parse(l));
      const verifiedEv = events.find(e => e.type === 'verified');
      const doneEv = events.find(e => e.type === 'done');
      const revisionEvs = events.filter(e => e.type === 'revision');

      assert(verifiedEv, `[${tc.id}] NDJSON missing verified event`);
      assert(doneEv, `[${tc.id}] NDJSON missing done event`);

      // Assert 100% deterministic parity between JSON and NDJSON on identical model output
      assert.strictEqual(jsonBody.verificationState, verifiedEv.verificationState, `[${tc.id}] verificationState mismatch`);
      assert.strictEqual(Boolean(jsonBody.withheld), Boolean(verifiedEv.withheld), `[${tc.id}] withheld mismatch`);
      assert.strictEqual(jsonBody.withholdingReason || null, verifiedEv.withholdingReason || null, `[${tc.id}] withholdingReason mismatch`);
      assert.strictEqual(Boolean(jsonBody.safeResponseRecovered), Boolean(verifiedEv.safeResponseRecovered), `[${tc.id}] safeResponseRecovered mismatch`);
      assert.strictEqual(jsonBody.finalContent, verifiedEv.finalContent, `[${tc.id}] finalContent mismatch`);
      assert.strictEqual((jsonBody.claims || []).length, (verifiedEv.claims || []).length, `[${tc.id}] extracted claim count mismatch`);
      assert.deepStrictEqual(jsonBody.claims, verifiedEv.claims, `[${tc.id}] extracted claims deep equality mismatch`);
      assert.deepStrictEqual(jsonBody.verification, verifiedEv.verification, `[${tc.id}] verification results deep equality mismatch`);

      if (tc.expectLateStreamRevisionEvent) {
        assert(
          revisionEvs.length >= 1 && revisionEvs[revisionEvs.length - 1].revisedContent === verifiedEv.finalContent,
          `[${tc.id}] When streamed draft fails verification, NDJSON must emit a 'revision' event replacing the streamed tokens with the verified/withheld finalContent`
        );
      }

      summary.module3_jsonNdjsonTransportParity.passed++;
      summary.module3_jsonNdjsonTransportParity.cases.push({
        id: tc.id,
        jsonClaimsCount: (jsonBody.claims || []).length,
        ndjsonClaimsCount: (verifiedEv.claims || []).length,
        verificationState: jsonBody.verificationState,
        withheld: Boolean(jsonBody.withheld),
        safeResponseRecovered: Boolean(jsonBody.safeResponseRecovered),
        revisionEventsEmitted: revisionEvs.length,
        exactParity: true
      });
    }
    console.log(`  ✓ Module 3 passed: ${summary.module3_jsonNdjsonTransportParity.passed}/${summary.module3_jsonNdjsonTransportParity.total} controlled JSON vs. NDJSON pairs produced 100% identical claims, states, and withholding/revision events.\n`);

    // =========================================================================
    // MODULE 4: EXPANDED 12-CLASS PROPERTY-BASED & ADVERSARIAL SUITE (72 Cases: 36 Pos + 36 Neg)
    // =========================================================================
    console.log('▶ [MODULE 4] Expanded 12-Class Property-Based & Adversarial Suite (72 Independent Cases: 36 Pos + 36 Neg)...');

    const expanded72Cases = [];

    // Class 1: Nested Fractions and Radicals (3 Pos, 3 Neg)
    for (let k = 2; k <= 4; k++) {
      // 1 / (1 + 1/x) = x / (x + 1) for x != 0, x != -1
      expanded72Cases.push({
        id: `EXP_C01_NESTED_FRAC_POS_${k}`,
        className: '01_NESTED_FRACTIONS_AND_RADICALS',
        prompt: `Simplify \\frac{1}{1 + \\frac{1}{${k}x}} for x \\neq 0 and ${k}x + 1 \\neq 0.`,
        response: `For $x \\neq 0$ and $${k}x + 1 \\neq 0$:\n$$\\frac{1}{1 + \\frac{1}{${k}x}} = \\frac{${k}x}{${k}x + 1}$$`,
        expectedPositive: true
      });
      expanded72Cases.push({
        id: `EXP_C01_NESTED_FRAC_NEG_${k}`,
        className: '01_NESTED_FRACTIONS_AND_RADICALS',
        prompt: `Simplify \\frac{1}{1 + \\frac{1}{${k}x}} for x \\neq 0 and ${k}x + 1 \\neq 0.`,
        response: `For $x \\neq 0$ and $${k}x + 1 \\neq 0$:\n$$\\frac{1}{1 + \\frac{1}{${k}x}} = \\frac{${k}x}{${k}x - 1}$$`,
        expectedPositive: false
      });
    }

    // Class 2: Implicit Multiplication (3 Pos, 3 Neg)
    for (let k = 2; k <= 4; k++) {
      const a = k;
      const b = k + 1;
      expanded72Cases.push({
        id: `EXP_C02_IMPLICIT_MUL_POS_${k}`,
        className: '02_IMPLICIT_MULTIPLICATION',
        prompt: `Expand ${a}x(x + ${b}) + (x - 1)(x + ${b}).`,
        response: `$$${a}x(x + ${b}) + (x - 1)(x + ${b}) = ${a + 1}x^2 + ${a * b + b - 1}x - ${b}$$`,
        expectedPositive: true
      });
      expanded72Cases.push({
        id: `EXP_C02_IMPLICIT_MUL_NEG_${k}`,
        className: '02_IMPLICIT_MULTIPLICATION',
        prompt: `Expand ${a}x(x + ${b}) + (x - 1)(x + ${b}).`,
        response: `$$${a}x(x + ${b}) + (x - 1)(x + ${b}) = ${a + 1}x^2 + ${a * b + b + 2}x - ${b}$$`,
        expectedPositive: false
      });
    }

    // Class 3: Unicode and LaTeX Equivalence (3 Pos, 3 Neg)
    for (let k = 2; k <= 4; k++) {
      expanded72Cases.push({
        id: `EXP_C03_UNICODE_LATEX_POS_${k}`,
        className: '03_UNICODE_AND_LATEX_EQUIVALENCE',
        prompt: `Simplify ${k}sin²(x) + ${k}cos²(x)`,
        response: `$$${k}\\sin^{2}(x) + ${k}\\cos^{2}(x) = ${k}$$`,
        expectedPositive: true
      });
      expanded72Cases.push({
        id: `EXP_C03_UNICODE_LATEX_NEG_${k}`,
        className: '03_UNICODE_AND_LATEX_EQUIVALENCE',
        prompt: `Simplify ${k}sin²(x) + ${k}cos²(x)`,
        response: `$$${k}\\sin^{2}(x) + ${k}\\cos^{2}(x) = ${k + 1}$$`,
        expectedPositive: false
      });
    }

    // Class 4: Variable and Subscript Boundaries (3 Pos, 3 Neg)
    for (let k = 2; k <= 4; k++) {
      expanded72Cases.push({
        id: `EXP_C04_SUBSCRIPT_BOUNDARY_POS_${k}`,
        className: '04_VARIABLE_AND_SUBSCRIPT_BOUNDARIES',
        prompt: `Differentiate V_{\\mathrm{eff}}(r) = \\frac{L^2}{r^2}\\left(1 - \\frac{${k}r_s}{r}\\right) with respect to r.`,
        response: `$$V_{\\mathrm{eff}}(r) = \\frac{L^2}{r^2}\\left(1 - \\frac{${k}r_s}{r}\\right)$$\n$$V'_{\\mathrm{eff}}(r) = L^2\\left(-2r^{-3} + ${3 * k}r_{s}r^{-4}\\right)$$`,
        expectedPositive: true
      });
      expanded72Cases.push({
        id: `EXP_C04_SUBSCRIPT_BOUNDARY_NEG_${k}`,
        className: '04_VARIABLE_AND_SUBSCRIPT_BOUNDARIES',
        prompt: `Differentiate V_{\\mathrm{eff}}(r) = \\frac{L^2}{r^2}\\left(1 - \\frac{${k}r_s}{r}\\right) with respect to r.`,
        response: `$$V_{\\mathrm{eff}}(r) = \\frac{L^2}{r^2}\\left(1 - \\frac{${k}r_s}{r}\\right)$$\n$$V'_{\\mathrm{eff}}(r) = L^2\\left(-2r^{-3} + ${3 * k + 1}r_{s}r^{-4}\\right)$$`,
        expectedPositive: false
      });
    }

    // Class 5: Multiple Roots (Fractional & Quadratic Root Sets + Lost Root Negatives) (3 Pos, 3 Neg)
    for (let k = 1; k <= 3; k++) {
      const r2 = k + 1;
      // (2x - 3)(x - r2) = 2x^2 - (2*r2 + 3)x + 3*r2 = 0 -> roots 3/2 and r2
      const bCoeff = 2 * r2 + 3;
      const cCoeff = 3 * r2;
      expanded72Cases.push({
        id: `EXP_C05_MULTI_ROOT_POS_${k}`,
        className: '05_MULTIPLE_ROOTS',
        prompt: `Solve 2x^2 - ${bCoeff}x + ${cCoeff} = 0.`,
        response: `Factoring gives $(2x - 3)(x - ${r2}) = 0$, so $$\\boxed{\\displaystyle x = \\dfrac{3}{2}\\quad\\text{or}\\quad x = ${r2}}$$.`,
        expectedPositive: true
      });
      expanded72Cases.push({
        id: `EXP_C05_MULTI_ROOT_NEG_${k}`,
        className: '05_MULTIPLE_ROOTS',
        prompt: `Solve 2x^2 - ${bCoeff}x + ${cCoeff} = 0.`,
        response: `Factoring gives $(2x - 3)(x - ${r2}) = 0$, so $$\\boxed{x = ${r2}}$$.`,
        expectedPositive: false
      });
    }

    // Class 6: Domain Restrictions (Rational Cancellation With vs. Without Stated Restriction) (3 Pos, 3 Neg)
    for (let k = 2; k <= 4; k++) {
      const a2 = k * k;
      expanded72Cases.push({
        id: `EXP_C06_DOMAIN_RESTR_POS_${k}`,
        className: '06_DOMAIN_RESTRICTIONS',
        prompt: `Simplify \\frac{x^2 - ${a2}}{x - ${k}}.`,
        response: `For $x \\neq ${k}$:\n$$\\frac{x^2 - ${a2}}{x - ${k}} = x + ${k}$$`,
        expectedPositive: true
      });
      expanded72Cases.push({
        id: `EXP_C06_DOMAIN_RESTR_NEG_${k}`,
        className: '06_DOMAIN_RESTRICTIONS',
        prompt: `Simplify \\frac{x^2 - ${a2}}{x - ${k}}.`,
        response: `$$\\frac{x^2 - ${a2}}{x - ${k}} = x + ${k}$$`,
        expectedPositive: false
      });
    }

    // Class 7: Symbolic Parameters (3 Pos, 3 Neg)
    for (let k = 2; k <= 4; k++) {
      expanded72Cases.push({
        id: `EXP_C07_SYMBOLIC_PARAM_POS_${k}`,
        className: '07_SYMBOLIC_PARAMETERS',
        prompt: `Expand and simplify (a + ${k}b)^2 - (a - ${k}b)^2.`,
        response: `$$(a + ${k}b)^2 - (a - ${k}b)^2 = ${4 * k}ab$$`,
        expectedPositive: true
      });
      expanded72Cases.push({
        id: `EXP_C07_SYMBOLIC_PARAM_NEG_${k}`,
        className: '07_SYMBOLIC_PARAMETERS',
        prompt: `Expand and simplify (a + ${k}b)^2 - (a - ${k}b)^2.`,
        response: `$$(a + ${k}b)^2 - (a - ${k}b)^2 = ${2 * k}ab$$`,
        expectedPositive: false
      });
    }

    // Class 8: Higher-Order Derivatives (2nd Derivative Order Fidelity & Accuracy) (3 Pos, 3 Neg)
    for (let k = 2; k <= 4; k++) {
      // f(x) = x^4 - k*x^3 -> f'(x) = 4x^3 - 3k*x^2 -> f''(x) = 12x^2 - 6k*x
      expanded72Cases.push({
        id: `EXP_C08_HIGHER_DERIV_POS_${k}`,
        className: '08_HIGHER_ORDER_DERIVATIVES',
        prompt: `For f(x) = x^4 - ${k}x^3, compute the first derivative f'(x) and the second derivative f''(x).`,
        response: `$$f(x) = x^4 - ${k}x^3$$\n$$f'(x) = 4x^3 - ${3 * k}x^2$$\n$$f''(x) = 12x^2 - ${6 * k}x$$`,
        expectedPositive: true
      });
      expanded72Cases.push({
        id: `EXP_C08_HIGHER_DERIV_NEG_${k}`,
        className: '08_HIGHER_ORDER_DERIVATIVES',
        prompt: `For f(x) = x^4 - ${k}x^3, compute the first derivative f'(x) and the second derivative f''(x).`,
        response: `$$f(x) = x^4 - ${k}x^3$$\n$$f'(x) = 4x^3 - ${3 * k}x^2$$\n$$f''(x) = 12x^2 - ${3 * k}x$$`,
        expectedPositive: false
      });
    }

    // Class 9: Equivalent and Non-Equivalent Expressions (3 Pos, 3 Neg)
    for (let k = 2; k <= 4; k++) {
      expanded72Cases.push({
        id: `EXP_C09_EQUIV_NON_EQUIV_POS_${k}`,
        className: '09_EQUIVALENT_AND_NON_EQUIVALENT',
        prompt: `Factor x^3 - ${k * k * k}.`,
        response: `$$x^3 - ${k * k * k} = (x - ${k})(x^2 + ${k}x + ${k * k})$$`,
        expectedPositive: true
      });
      expanded72Cases.push({
        id: `EXP_C09_EQUIV_NON_EQUIV_NEG_${k}`,
        className: '09_EQUIVALENT_AND_NON_EQUIVALENT',
        prompt: `Factor x^3 - ${k * k * k}.`,
        response: `$$x^3 - ${k * k * k} = (x - ${k})(x^2 - ${k}x + ${k * k})$$`,
        expectedPositive: false
      });
    }

    // Class 10: Incorrect Intermediate Steps with Correct Final Answers (3 Pos, 3 Neg)
    for (let k = 2; k <= 4; k++) {
      const rhs = 3 * k + 5;
      expanded72Cases.push({
        id: `EXP_C10_INTERMEDIATE_INTEGRITY_POS_${k}`,
        className: '10_INTERMEDIATE_STEP_INTEGRITY',
        prompt: `Solve 3x + 5 = ${rhs}.`,
        response: `$$${rhs} - 5 = ${3 * k}$$\n$$\\frac{${3 * k}}{3} = ${k}$$\nTherefore $\\boxed{x = ${k}}$.`,
        expectedPositive: true
      });
      expanded72Cases.push({
        id: `EXP_C10_INTERMEDIATE_INTEGRITY_NEG_${k}`,
        className: '10_INTERMEDIATE_STEP_INTEGRITY',
        prompt: `Solve 3x + 5 = ${rhs}.`,
        response: `$$${rhs} - 5 = ${3 * k + 2}$$\nTherefore $\\boxed{x = ${k}}$.`,
        expectedPositive: false
      });
    }

    // Class 11: Contextual & Multivariable Bound Substitutions (3 Pos, 3 Neg)
    for (let k = 1; k <= 3; k++) {
      const xVal = k + 1;
      const yVal = k + 4;
      const trueVal = 3 * xVal + 7 * yVal;
      const swappedVal = 3 * yVal + 7 * xVal;
      expanded72Cases.push({
        id: `EXP_C11_SUBSTITUTION_POS_${k}`,
        className: '11_CONTEXTUAL_AND_BOUND_SUBSTITUTIONS',
        prompt: `Given x = ${xVal} and y = ${yVal}, evaluate 3x + 7y.`,
        response: `Substituting $x = ${xVal}$ and $y = ${yVal}$ gives:\n$$3(${xVal}) + 7(${yVal}) = ${trueVal}$$\n$$\\boxed{${trueVal}}$$`,
        expectedPositive: true
      });
      expanded72Cases.push({
        id: `EXP_C11_SUBSTITUTION_NEG_${k}`,
        className: '11_CONTEXTUAL_AND_BOUND_SUBSTITUTIONS',
        prompt: `Given x = ${xVal} and y = ${yVal}, evaluate 3x + 7y.`,
        response: `Substituting the given values gives:\n$$3(${yVal}) + 7(${xVal}) = ${swappedVal}$$\n$$\\boxed{${swappedVal}}$$`,
        expectedPositive: false
      });
    }

    // Class 12: Multiple Equations in One Response (3 Pos, 3 Neg)
    for (let k = 1; k <= 3; k++) {
      const a = k + 1;
      const b = k + 2;
      expanded72Cases.push({
        id: `EXP_C12_MULTI_EQ_RESPONSE_POS_${k}`,
        className: '12_MULTIPLE_EQUATIONS_IN_ONE_RESPONSE',
        prompt: `Expand (x + ${a})(x + ${b}) and solve (x + ${a})(x + ${b}) = 0.`,
        response: `First expand:\n$$(x + ${a})(x + ${b}) = x^2 + ${a + b}x + ${a * b}$$\nNext solve $(x + ${a})(x + ${b}) = 0$, which gives $\\boxed{x = -${a} \\text{ or } x = -${b}}$.`,
        expectedPositive: true
      });
      expanded72Cases.push({
        id: `EXP_C12_MULTI_EQ_RESPONSE_NEG_${k}`,
        className: '12_MULTIPLE_EQUATIONS_IN_ONE_RESPONSE',
        prompt: `Expand (x + ${a})(x + ${b}) and solve (x + ${a})(x + ${b}) = 0.`,
        response: `First expand:\n$$(x + ${a})(x + ${b}) = x^2 + ${a + b + 3}x + ${a * b}$$\nNext solve $(x + ${a})(x + ${b}) = 0$, which gives $\\boxed{x = -${a} \\text{ or } x = -${b}}$.`,
        expectedPositive: false
      });
    }

    for (const tc of expanded72Cases) {
      summary.module4_expanded12ClassAdversarial72.total++;
      if (!summary.module4_expanded12ClassAdversarial72.byClass[tc.className]) {
        summary.module4_expanded12ClassAdversarial72.byClass[tc.className] = { tp: 0, tn: 0, fp: 0, fn: 0, total: 0 };
      }
      const clsEntry = summary.module4_expanded12ClassAdversarial72.byClass[tc.className];
      clsEntry.total++;

      const audit = await verifyResponseClaims(tc.response, tc.prompt);
      const evalState = evaluateVerificationState({
        claims: audit.claims,
        verificationResults: audit.verificationResults,
        invalidClaims: audit.invalidClaims,
        unknownClaims: audit.unknownClaims,
        internalContradictions: audit.internalContradictions,
        prompt: tc.prompt,
        withheld: false
      });
      const isVerified = evalState.state === 'VERIFIED';
      const ok = isVerified === tc.expectedPositive;
      if (tc.expectedPositive) {
        if (ok) { summary.module4_expanded12ClassAdversarial72.tp++; clsEntry.tp++; }
        else { summary.module4_expanded12ClassAdversarial72.fn++; clsEntry.fn++; }
      } else {
        if (ok) { summary.module4_expanded12ClassAdversarial72.tn++; clsEntry.tn++; }
        else { summary.module4_expanded12ClassAdversarial72.fp++; clsEntry.fp++; }
      }
      assert(ok, `[${tc.id}] Expected verified=${tc.expectedPositive}, got state=${evalState.state}`);
      summary.module4_expanded12ClassAdversarial72.passed++;
    }
    console.log(`  ✓ Module 4 passed: ${summary.module4_expanded12ClassAdversarial72.passed}/${summary.module4_expanded12ClassAdversarial72.total} across 12 classes (TP=${summary.module4_expanded12ClassAdversarial72.tp}, TN=${summary.module4_expanded12ClassAdversarial72.tn}, FP=${summary.module4_expanded12ClassAdversarial72.fp}, FN=${summary.module4_expanded12ClassAdversarial72.fn}).\n`);

    // =========================================================================
    // MODULE 5: HOSTED LLM OPERATIONAL RESILIENCE & FAILOVER QUALIFICATION (Section 6)
    // =========================================================================
    console.log('▶ [MODULE 5] Hosted LLM Operational Resilience & Failover Qualification (Section 6)...');

    async function checkM5(name, fn) {
      summary.module5_providerResilience.total++;
      await fn();
      summary.module5_providerResilience.passed++;
    }

    await checkM5('M5-1: Actual Staging Environment Variable Configuration Audit (Groq single-LLM + CAS recovery)', async () => {
      // Simulate exact Railway staging env vars: RAILWAY_ENVIRONMENT='production', GROQ_API_KEY set, GEMINI_API_KEY unset, OLLAMA_HOST='http://localhost:11434'
      const savedEnv = { ...process.env };
      try {
        providerPolicy.clearRateLimits();
        process.env.RAILWAY_ENVIRONMENT = 'production';
        process.env.PRIMARY_TEXT_PROVIDER = 'groq-text';
        process.env.GROQ_API_KEY = 'gsk_staging_probe_key';
        delete process.env.GEMINI_API_KEY;
        delete process.env.GEMINI_FREE_TIER;
        process.env.OLLAMA_HOST = 'http://localhost:11434';
        delete process.env.OLLAMA_LOCAL_ENABLED;

        const sel1 = providerPolicy.selectProvider({ capability: 'text' });
        assert.strictEqual(sel1.provider.name, 'groq-text');

        // When groq-text is rate-limited in staging and no GEMINI_API_KEY is set:
        providerPolicy.recordRateLimit('groq-text', 17);
        const sel2 = providerPolicy.selectProvider({ capability: 'text' });
        assert.strictEqual(sel2.provider, null);
        assert.strictEqual(sel2.reason, 'ALL_RATE_LIMITED');
        assert(sel2.retryAfter >= 15 && sel2.retryAfter <= 17);
      } finally {
        for (const k of Object.keys(process.env)) {
          if (!(k in savedEnv)) delete process.env[k];
        }
        Object.assign(process.env, savedEnv);
        providerPolicy.clearRateLimits();
      }
    });

    await checkM5('M5-2: Deterministic CAS Safe Recovery When All LLMs Are Rate-Limited (ALL_RATE_LIMITED)', async () => {
      providerPolicy.clearRateLimits();
      providerPolicy.recordRateLimit('ollama-text', 30);
      app.resetAllRateLimits();

      const res = await fetch(`${gatewayUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Differentiate f(x) = \\sin(x^2) with respect to x.' }],
          tutorMode: false,
          stream: false
        })
      });
      assert.strictEqual(res.status, 200, 'CAS safe recovery must deliver HTTP 200 even when all LLMs are rate-limited');
      const body = await res.json();
      assert.strictEqual(body.safeResponseRecovered, true, 'Must flag safeResponseRecovered=true');
      assert.strictEqual(body.verificationState, 'VERIFIED', 'Recovered CAS solution must be VERIFIED');
      providerPolicy.clearRateLimits();
    });

    await checkM5('M5-3: Provider Error (HTTP 503 ALL_RATE_LIMITED on non-CAS conceptual query) vs Mathematical Verification Withholding (HTTP 200 WITHHELD)', async () => {
      providerPolicy.clearRateLimits();
      providerPolicy.recordRateLimit('ollama-text', 25);
      app.resetAllRateLimits();

      // Non-CAS conceptual prompt during total LLM rate-limit cooldown -> returns HTTP 503 UPSTREAM_RATE_LIMITED with retryAfter
      const errRes = await fetch(`${gatewayUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'In one sentence, what is the historical origin of the word algebra?' }],
          tutorMode: false,
          stream: false
        })
      });
      assert.strictEqual(errRes.status, 503);
      const errBody = await errRes.json();
      assert.strictEqual(errBody.error, 'UPSTREAM_RATE_LIMITED');
      assert(typeof errBody.retryAfter === 'number' && errBody.retryAfter > 0);
      assert.strictEqual(errBody.withheld, undefined, 'Provider rate-limit error must never masquerade as mathematical withholding');

      providerPolicy.clearRateLimits();
    });

    console.log(`  ✓ Module 5 passed (${summary.module5_providerResilience.passed}/${summary.module5_providerResilience.total} checks).\n`);
  } finally {
    clearActiveControllers();
    await new Promise(resolve => gateway.close(resolve));
    await new Promise(resolve => mockUpstream.close(resolve));
    for (const k of Object.keys(process.env)) {
      if (!(k in origEnv)) delete process.env[k];
    }
    Object.assign(process.env, origEnv);
    try { closeVerifierDaemon(); } catch (_) {}
    try { closeCalculusDaemon(); } catch (_) {}
  }

  console.log('================================================================================');
  console.log('✅ FINAL ARCHITECTURAL QUALIFICATION SUITE SUMMARY');
  console.log('================================================================================');
  console.log(`• Module 1 (MathIR & 9-Role Claim Contract) : ${summary.module1_mathIrAndClaimContract.passed}/${summary.module1_mathIrAndClaimContract.total} PASSED`);
  console.log(`• Module 2 (8-Scenario Derivation Integrity): ${summary.module2_derivationIntegrity8Scenarios.passed}/${summary.module2_derivationIntegrity8Scenarios.total} PASSED (TP=${summary.module2_derivationIntegrity8Scenarios.tp}, TN=${summary.module2_derivationIntegrity8Scenarios.tn})`);
  console.log(`• Module 3 (Controlled JSON/NDJSON Parity)  : ${summary.module3_jsonNdjsonTransportParity.passed}/${summary.module3_jsonNdjsonTransportParity.total} PASSED (100% claim/state/revision parity)`);
  console.log(`• Module 4 (12-Class 72-Case Adversarial)   : ${summary.module4_expanded12ClassAdversarial72.passed}/${summary.module4_expanded12ClassAdversarial72.total} PASSED (TP=${summary.module4_expanded12ClassAdversarial72.tp}, TN=${summary.module4_expanded12ClassAdversarial72.tn}, FP=${summary.module4_expanded12ClassAdversarial72.fp}, FN=${summary.module4_expanded12ClassAdversarial72.fn})`);
  console.log(`• Module 5 (Hosted LLM Resilience & Recovery): ${summary.module5_providerResilience.passed}/${summary.module5_providerResilience.total} PASSED`);
  console.log('================================================================================\n');

  return summary;
}

if (require.main === module) {
  runFinalArchitecturalQualification().catch(err => {
    console.error('FINAL ARCHITECTURAL QUALIFICATION FAILED:', err);
    try { closeVerifierDaemon(); } catch (_) {}
    try { closeCalculusDaemon(); } catch (_) {}
    process.exit(1);
  });
}

module.exports = { runFinalArchitecturalQualification };
