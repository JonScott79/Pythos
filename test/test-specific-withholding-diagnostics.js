/**
 * test/test-specific-withholding-diagnostics.js
 *
 * PYTHOS: Specific Evidence-Based Withholding Diagnostics Test Suite
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {
  WITHHOLDING_REASONS,
  SAFE_WITHHOLDING_CONFIG,
  sanitizePublicDetail,
  isSafePublicDetail,
  getSafeWithholding,
  resolveWithholdingDecision
} = require('../server/withholdingTaxonomy');
const { detectFormattingAnomaly } = require('../server/mathFormatDetector');

let passed = 0;
let total = 0;

function test(name, fn) {
  total++;
  try {
    fn();
    console.log(`  ✓ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}`);
    console.error(`    ${err.stack || err.message}`);
    process.exitCode = 1;
  }
}

console.log('======================================================================');
console.log('PYTHOS: SPECIFIC WITHHOLDING DIAGNOSTICS SUITE');
console.log('======================================================================\n');

// 1. Taxonomy uniqueness & client/server consistency
test('All 10 withholding reasons have distinct, context-appropriate headlines and required fields', () => {
  const keys = Object.keys(WITHHOLDING_REASONS);
  assert.strictEqual(keys.length, 10);
  const headlines = new Set();
  for (const k of keys) {
    const cfg = SAFE_WITHHOLDING_CONFIG[k];
    assert(cfg, `Missing SAFE_WITHHOLDING_CONFIG.${k}`);
    assert(cfg.headline && cfg.explanation && cfg.cause && cfg.help && cfg.nextStep);
    headlines.add(cfg.headline);
    if (k !== 'MISSING_INFORMATION') {
      assert(!cfg.headline.includes('I need a little more information'), `${k} must not use generic MISSING_INFORMATION headline`);
    }
  }
  assert.strictEqual(headlines.size, 10, 'Every withholding reason must have its own distinct headline');
});

test('Client CLIENT_WITHHOLDING_EXPLANATIONS in app.js matches server headlines for every reason', () => {
  const appJs = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const m = appJs.match(/const CLIENT_WITHHOLDING_EXPLANATIONS\s*=\s*(\{[\s\S]*?\n\});/);
  assert(m, 'Could not locate CLIENT_WITHHOLDING_EXPLANATIONS in app.js');
  const sandbox = {};
  vm.runInNewContext(`result = ${m[1]}`, sandbox);
  for (const k of Object.keys(WITHHOLDING_REASONS)) {
    const cli = sandbox.result[k];
    const srv = SAFE_WITHHOLDING_CONFIG[k];
    assert(cli, `Client missing CLIENT_WITHHOLDING_EXPLANATIONS.${k}`);
    assert.strictEqual(cli.headline, srv.headline, `Headline mismatch for ${k}`);
    assert.strictEqual(cli.explanation, srv.explanation, `Explanation mismatch for ${k}`);
  }
});

// 2. Unresolved symbols: numeric parameter vs missing assumption vs symbolic parameter
test('Unresolved symbols: numerical root check missing parameter asks specifically for parameter value or symbolic option', () => {
  const dec = resolveWithholdingDecision({
    lastUserText: 'Solve x + a = 0, x = 3',
    unknownClaims: [{
      claim: { claim_type: 'equation_solution', data: { equation: 'x + a = 0', variable: 'x', proposed_solutions: [3] } },
      verification: { verified: false, status: 'UNKNOWN', reason: "Equation contains unresolved symbols ['a']; root check is undecidable." }
    }]
  });
  assert.strictEqual(dec.reason, WITHHOLDING_REASONS.MISSING_INFORMATION);
  const w = getSafeWithholding(dec.reason, dec.overrides);
  assert(w.explanation.includes("'a'"));
  assert(w.explanation.includes('symbolic'));
});

test('Unresolved symbols: missing domain assumption explains required assumption instead of demanding numbers', () => {
  const dec = resolveWithholdingDecision({
    lastUserText: 'Simplify sqrt(x^2) = x',
    invalidClaims: [{
      claim: { claim_type: 'algebraic_equivalence' },
      verification: { verified: false, status: 'FALSE', reason: "Equation contains unresolved symbols ['x'] and only holds under real domain_assumptions x > 0" }
    }]
  });
  assert.strictEqual(dec.reason, WITHHOLDING_REASONS.CLAIM_NOT_VERIFIED);
  const w = getSafeWithholding(dec.reason, dec.overrides);
  assert(w.headline.includes('domain assumption'));
  assert(w.explanation.includes("'x'"));
  assert(w.nextStep.includes('assume x > 0'));
});

test('Symbolic parameter without numeric claim stays honest CLAIM_NOT_VERIFIED without demanding numeric values for every symbol', () => {
  const dec = resolveWithholdingDecision({
    lastUserText: 'Verify identity (a+b)^2 = a^2 + b^2',
    unknownClaims: [{
      claim: { claim_type: 'symbolic_equivalence' },
      verification: { verified: false, status: 'UNKNOWN', reason: "Symbolic check involving ['a', 'b'] returned UNKNOWN." }
    }]
  });
  assert.notStrictEqual(dec.reason, WITHHOLDING_REASONS.MISSING_INFORMATION);
});

// 3. Specific mathematical failures
test('Incorrect numerical root (0.1129) names rejected root and equation without endorsing it', () => {
  const dec = resolveWithholdingDecision({
    lastUserText: 'Solve 2t^3 - 9t + 1 = 0',
    invalidClaims: [{
      claim: { claim_type: 'equation_solution', data: { equation: '2*t^3 - 9*t + 1 = 0', variable: 't', proposed_solutions: ['0.1129'] } },
      verification: { verified: false, status: 'EXTRANEOUS_ROOT', error_type: 'EXTRANEOUS_ROOT', extraneous_roots: [0.1129] }
    }]
  });
  assert.strictEqual(dec.reason, WITHHOLDING_REASONS.CLAIM_NOT_VERIFIED);
  const w = getSafeWithholding(dec.reason, dec.overrides);
  assert(w.explanation.includes('0.1129'));
  assert(w.explanation.includes('2*t^3 - 9*t + 1 = 0'));
  assert(w.explanation.includes('failed substitution verification'));
});

test('Lost root explains omitted root(s) rather than generic message', () => {
  const dec = resolveWithholdingDecision({
    lastUserText: 'Solve x^2 = 5x',
    invalidClaims: [{
      claim: { claim_type: 'equation_solution', data: { equation: 'x^2 = 5*x', variable: 'x', proposed_solutions: [5] } },
      verification: { verified: false, status: 'LOST_ROOT', error_type: 'LOST_ROOT', lost_roots: ['0'] }
    }]
  });
  assert.strictEqual(dec.reason, WITHHOLDING_REASONS.CLAIM_NOT_VERIFIED);
  const w = getSafeWithholding(dec.reason, dec.overrides);
  assert(w.explanation.includes('dropped one or more valid real roots'));
  assert(w.explanation.includes('missing 0'));
});

test('NO_REAL_ROOTS identifies negative discriminant / no real solutions', () => {
  const dec = resolveWithholdingDecision({
    lastUserText: 'Solve x^2 + 1 = 0',
    invalidClaims: [{
      claim: { claim_type: 'equation_solution', data: { equation: 'x^2 + 1 = 0', variable: 'x' } },
      verification: { verified: false, status: 'EXTRANEOUS_ROOT', error_type: 'NO_REAL_ROOTS' }
    }]
  });
  assert.strictEqual(dec.reason, WITHHOLDING_REASONS.CLAIM_NOT_VERIFIED);
  const w = getSafeWithholding(dec.reason, dec.overrides);
  assert(w.headline.includes('no real solutions'));
});

test('Derivative, substitution, dimension, and internal contradiction diagnostics are specific', () => {
  const d = getSafeWithholding(...Object.values(resolveWithholdingDecision({
    invalidClaims: [{ claim: { claim_type: 'derivative' }, verification: { status: 'INCORRECT_DERIVATIVE' } }]
  })));
  assert(d.explanation.includes('differentiation step'));

  const s = getSafeWithholding(...Object.values(resolveWithholdingDecision({
    invalidClaims: [{ claim: { claim_type: 'change_of_variables' }, verification: { status: 'INVALID_SUBSTITUTION' } }]
  })));
  assert(s.explanation.includes('change-of-variables substitution'));

  const p = getSafeWithholding(...Object.values(resolveWithholdingDecision({
    invalidClaims: [{ claim: { claim_type: 'dimensions' }, verification: { status: 'DIMENSION_ERROR' } }]
  })));
  assert(p.explanation.includes('physical units or dimensions'));

  const ic = getSafeWithholding(...Object.values(resolveWithholdingDecision({
    internalContradictions: [{ details: 'Step 1 contradicts Step 2' }]
  })));
  assert(ic.explanation.includes('contradicted each other'));
});

// 4. Division by zero, missing bounds/measurements/variable, ambiguous, mismatch, infra, provider, unsupported
test('Division by zero & domain restrictions route to UNDEFINED_EXPRESSION with restrictions', () => {
  const dec = resolveWithholdingDecision({
    lastUserText: 'Simplify (x^2 - 4)/(x - 2) vs x + 2',
    invalidClaims: [{
      claim: { claim_type: 'symbolic_equivalence' },
      verification: { status: 'DOMAIN_ERROR', error_type: 'DOMAIN_VIOLATION', domain_restrictions: ['x != 2'] }
    }]
  });
  assert.strictEqual(dec.reason, WITHHOLDING_REASONS.UNDEFINED_EXPRESSION);
  const w = getSafeWithholding(dec.reason, dec.overrides);
  assert(w.explanation.includes('x != 2'));
});

test('Missing integral bounds, missing target variable, and missing measurement give specific MISSING_INFORMATION guidance', () => {
  const intDec = resolveWithholdingDecision({
    unknownClaims: [{ claim: { claim_type: 'integral', data: { isDefinite: true, lowerLimit: null, upperLimit: 2 } }, verification: { status: 'UNKNOWN' } }]
  });
  assert.strictEqual(intDec.reason, WITHHOLDING_REASONS.MISSING_INFORMATION);
  assert(getSafeWithholding(intDec.reason, intDec.overrides).explanation.includes('integration bounds'));

  const varDec = resolveWithholdingDecision({ auditText: 'Missing target variable: unclear which variable to solve for' });
  assert.strictEqual(varDec.reason, WITHHOLDING_REASONS.MISSING_INFORMATION);
  assert(getSafeWithholding(varDec.reason, varDec.overrides).explanation.includes('which variable'));

  const measDec = resolveWithholdingDecision({ auditText: 'Missing side length for triangle' });
  assert.strictEqual(measDec.reason, WITHHOLDING_REASONS.MISSING_INFORMATION);
  assert(getSafeWithholding(measDec.reason, measDec.overrides).explanation.includes('side length'));
});

test('Ambiguous notation, prompt mismatch, infra, dual-provider, and unsupported operations produce accurate diagnostics', () => {
  const ambDiv = resolveWithholdingDecision({
    unknownClaims: [{ claim: { claim_type: 'algebra' }, verification: { status: 'AMBIGUOUS_NOTATION', error_type: 'AMBIGUOUS_DIVISION_BINDING' } }]
  });
  assert.strictEqual(ambDiv.reason, WITHHOLDING_REASONS.AMBIGUOUS_PROBLEM);
  assert(getSafeWithholding(ambDiv.reason, ambDiv.overrides).explanation.includes('1/(2*x)'));

  const mis = resolveWithholdingDecision({
    promptFidelity: { valid: false, primaryClaimStatus: 'INVALID', reason: 'Prompt requested positive solution only.' }
  });
  assert.strictEqual(mis.reason, WITHHOLDING_REASONS.PROMPT_CLAIM_MISMATCH);
  assert(getSafeWithholding(mis.reason, mis.overrides).explanation.includes('positive solution only'));

  const infra = resolveWithholdingDecision({ auditText: 'CAS_QUEUE_SATURATED rate limit' });
  assert.strictEqual(infra.reason, WITHHOLDING_REASONS.INFRASTRUCTURE_FAILURE);
  assert(getSafeWithholding(infra.reason).headline.includes('temporary service hiccup'));

  const dual = resolveWithholdingDecision({ auditText: 'Dual provider failure' });
  assert.strictEqual(dual.reason, WITHHOLDING_REASONS.DUAL_PROVIDER_FAILURE);

  const unsup = resolveWithholdingDecision({
    unknownClaims: [{ claim: { domain: 'calculus', claim_type: 'infinite_series' }, verification: { status: 'UNKNOWN', reason: 'Infinite series exceeds scope' } }]
  });
  assert.strictEqual(unsup.reason, WITHHOLDING_REASONS.UNSUPPORTED_PROBLEM);
  assert(getSafeWithholding(unsup.reason, unsup.overrides).explanation.includes('infinite_series'));
});

// 5. Security & internal detail sanitization + malformed overrides + honest insufficient-evidence fallback
test('Safety: strips internal paths, stack traces, keys, worker/provider/DB tokens & sanitizes HTML/unexpected overrides', () => {
  const leakyStrings = [
    'TypeError: Cannot read property at VerifierWorker.execute (C:\\Projects\\lanzar\\pythos\\server\\verificationBridge.js:123)',
    'groq-text failed with gsk_1234567890abcdef and pythos/app_staging error',
    '/server/verifier/algebra_verifier.py Traceback line 42',
    'ECONNREFUSED 127.0.0.1:11434 ollama-text'
  ];
  for (const s of leakyStrings) {
    assert.strictEqual(isSafePublicDetail(s), false, `Failed to reject leaky detail: ${s}`);
    assert.strictEqual(sanitizePublicDetail(s), '');
  }

  // Attempting to pass leaky/HTML overrides must not leak or crash
  const safeRes = getSafeWithholding(WITHHOLDING_REASONS.CLAIM_NOT_VERIFIED, {
    diagnosticExplanation: 'C:\\secret\\verifier.py TypeError: crash gsk_abcdef123456',
    diagnosticCause: '<script>alert(1)</script>',
    diagnosticNextStep: 12345
  });
  assert(!safeRes.explanation.includes('verifier.py'));
  assert(!safeRes.explanation.includes('gsk_'));
  assert(!safeRes.cause.includes('<script>'));

  // Unexpected/malformed override shapes
  for (const badOverride of [null, undefined, 'str', 42, ['bad'], { weirdSnippet: 99 }]) {
    const r = getSafeWithholding(WITHHOLDING_REASONS.CLAIM_NOT_VERIFIED, badOverride);
    assert(r.headline && r.explanation && r.formattedContent);
  }

  // Honest fallback when no specific evidence exists
  const emptyEvidence = resolveWithholdingDecision({ auditText: 'Verification returned UNKNOWN without details' });
  assert.strictEqual(emptyEvidence.reason, WITHHOLDING_REASONS.CLAIM_NOT_VERIFIED);
  assert.strictEqual(emptyEvidence.overrides, null);
});

// 6. Priority & Multi-Turn Isolation
test('Priority & Multi-Turn: security/infra/undefined outrank malformed; prior context never contaminates new turn', () => {
  const weird = '2\\sin^{2(x)+}\\csc(x) - 9 = 0';
  assert.strictEqual(
    resolveWithholdingDecision({ lastUserText: weird, auditText: 'Rate limit exceeded CAS_TIMEOUT', detectFormattingAnomaly }).reason,
    WITHHOLDING_REASONS.INFRASTRUCTURE_FAILURE
  );
  assert.strictEqual(
    resolveWithholdingDecision({ lastUserText: weird, hasImages: true, detectFormattingAnomaly }).reason,
    WITHHOLDING_REASONS.IMAGE_UNVERIFIABLE
  );
  assert.strictEqual(
    resolveWithholdingDecision({
      lastUserText: weird,
      invalidClaims: [{ verification: { status: 'DOMAIN_ERROR' } }],
      detectFormattingAnomaly
    }).reason,
    WITHHOLDING_REASONS.UNDEFINED_EXPRESSION
  );

  // Follow-up clean turn ignores previous weird input
  const cleanTurn = resolveWithholdingDecision({
    lastUserText: 'Solve 2x + 3 = 11',
    auditText: 'temporary service unavailable',
    detectFormattingAnomaly
  });
  assert.strictEqual(cleanTurn.reason, WITHHOLDING_REASONS.INFRASTRUCTURE_FAILURE);
});

console.log(`\n======================================================================`);
console.log(`RESULTS: ${passed}/${total} PASSED`);
console.log('======================================================================');
