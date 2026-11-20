/**
 * test/test-phase2-ux-trust.js
 *
 * Phase 2 Regression Suite:
 * - Feature 1: Suggested Equation Actions (withholdingDetails.suggestedFix)
 * - Feature 4: Authoritative Verification Trust Indicators (Symbolic vs Numerical vs Partial vs Withheld)
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vb = require('../server/verificationBridge');

console.log('======================================================================');
console.log('PYTHOS PHASE 2: SUGGESTED FIX & VERIFICATION TRUST INDICATOR SUITE');
console.log('======================================================================\n');

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log(`  ✓ [PASS] ${name}`);
}

check('Symbolic equivalence trust report proves symbolic + domain restrictions', () => {
  const claims = [{ domain: 'trigonometry', claim_type: 'symbolic_equivalence', data: { expr1: 'csc(x)', expr2: '1/sin(x)' } }];
  const results = [{ verified: true, status: 'VERIFIED', domain_restrictions: [0, 3.1415926536] }];
  const evalState = vb.evaluateVerificationState({ claims, verificationResults: results, prompt: 'Verify csc(x) = 1/sin(x)' });
  const trust = vb.buildVerificationTrustReport({ claims, verificationResults: results, verificationEvaluation: evalState });

  assert.strictEqual(trust.badgeLevel, 'VERIFIED');
  assert.strictEqual(trust.showFullVerifiedBadge, true);
  assert.strictEqual(trust.badgeLabel, 'Verified (Symbolic)');
  assert.strictEqual(trust.isSymbolicProven, true);
  assert.strictEqual(trust.isNumericalOnly, false);
  assert(trust.checks.some(c => c.kind === 'SYMBOLIC_EQUIVALENCE'));
  assert(trust.checks.some(c => c.kind === 'DOMAIN_RESTRICTIONS'));
  assert.strictEqual(trust.domainRestrictions.length, 2);
});

check('Exact equation roots report Verified (Exact Roots)', () => {
  const claims = [{ domain: 'algebra', claim_type: 'equation_solution', data: { equation: 'x^2 + 2x - 8 = 0', proposed_solutions: [-4, 2] } }];
  const results = [{ verified: true, status: 'VERIFIED', solutions: ['-4', '2'] }];
  const evalState = vb.evaluateVerificationState({ claims, verificationResults: results, prompt: 'Solve x^2 + 2x - 8 = 0' });
  const trust = vb.buildVerificationTrustReport({ claims, verificationResults: results, verificationEvaluation: evalState });

  assert.strictEqual(trust.badgeLevel, 'VERIFIED');
  assert.strictEqual(trust.badgeLabel, 'Verified (Exact Roots)');
  assert.strictEqual(trust.isSymbolicProven, true);
  assert.strictEqual(trust.isNumericalOnly, false);
  assert(trust.checks.some(c => c.kind === 'EXACT_ROOTS'));
});

check('Numerical-only confirmation is NEVER labeled as symbolic proof', () => {
  const claims = [{ domain: 'algebra', claim_type: 'equation_solution', data: { equation: 'cos(x) = x', is_approximate: true, proposed_solutions: [0.739085] } }];
  const results = [{ verified: true, status: 'VERIFIED', is_approximate: true, numerical: true, solutions: ['0.739085'] }];
  const evalState = vb.evaluateVerificationState({ claims, verificationResults: results, prompt: 'Solve cos(x) = x' });
  const trust = vb.buildVerificationTrustReport({ claims, verificationResults: results, verificationEvaluation: evalState });

  assert.strictEqual(trust.badgeLevel, 'VERIFIED');
  assert.strictEqual(trust.badgeLabel, 'Verified (Numerical)');
  assert.strictEqual(trust.isNumericalOnly, true);
  assert.strictEqual(trust.isSymbolicProven, false);
  assert.strictEqual(trust.proofBasis, 'NUMERICAL');
  assert(trust.checks.some(c => c.kind === 'NUMERICAL_CONFIRMATION'));
  assert(!trust.checks.some(c => c.kind === 'EXACT_ROOTS'));
  assert(!trust.checks.some(c => c.kind === 'SYMBOLIC_EQUIVALENCE'));
});

check('Additional verification passes (revision / override) are tracked accurately', () => {
  const claims = [{ domain: 'arithmetic', claim_type: 'arithmetic', data: { expression: '6 * 7', proposed_value: 42 } }];
  const results = [{ verified: true, status: 'VERIFIED', engine: 'mathjs' }];
  const evalState = vb.evaluateVerificationState({ claims, verificationResults: results, prompt: 'Compute 6 * 7' });
  const trust = vb.buildVerificationTrustReport({
    claims,
    verificationResults: results,
    verificationEvaluation: evalState,
    revisionPassCount: 1,
    overrideReverified: true
  });

  assert.strictEqual(trust.additionalPassesCount, 2);
  const passCheck = trust.checks.find(c => c.kind === 'ADDITIONAL_PASSES');
  assert(passCheck && (passCheck.label + ' ' + passCheck.detail).includes('2'));
});

check('PARTIALLY_VERIFIED, WITHHELD, and UNVERIFIED_CONCEPTUAL never show a full Verified badge', () => {
  const partialClaims = [
    { domain: 'algebra', claim_type: 'equation_solution', data: { equation: 'x+1=3', proposed_solutions: [2] } },
    { domain: 'algebra', claim_type: 'symbolic_equivalence', data: { expr1: 'a', expr2: 'b' } }
  ];
  const partialResults = [
    { verified: true, status: 'VERIFIED', solutions: ['2'] },
    { verified: false, status: 'UNKNOWN' }
  ];
  const partialEval = vb.evaluateVerificationState({ claims: partialClaims, verificationResults: partialResults, prompt: 'Solve x+1=3' });
  const partialTrust = vb.buildVerificationTrustReport({ claims: partialClaims, verificationResults: partialResults, verificationEvaluation: partialEval });
  assert.strictEqual(partialTrust.badgeLevel, 'PARTIAL');
  assert.strictEqual(partialTrust.showFullVerifiedBadge, false);
  assert(partialTrust.badgeLabel.includes('Partially Verified'));

  const withheldEval = vb.evaluateVerificationState({ claims: partialClaims, verificationResults: partialResults, prompt: 'Solve x+1=3', withheld: true });
  const withheldTrust = vb.buildVerificationTrustReport({ claims: partialClaims, verificationResults: partialResults, verificationEvaluation: withheldEval });
  assert.strictEqual(withheldTrust.badgeLevel, 'NONE');
  assert.strictEqual(withheldTrust.showFullVerifiedBadge, false);

  const conceptualEval = vb.evaluateVerificationState({ claims: [], verificationResults: [], prompt: 'Explain algebra' });
  const conceptualTrust = vb.buildVerificationTrustReport({ claims: [], verificationResults: [], verificationEvaluation: conceptualEval });
  assert.strictEqual(conceptualTrust.badgeLevel, 'NONE');
  assert.strictEqual(conceptualTrust.showFullVerifiedBadge, false);
});

check('CONDITIONAL equivalence counts as verified in evaluateVerificationState', () => {
  const claims = [{ domain: 'algebra', claim_type: 'symbolic_equivalence', data: { expr1: '(x^2-4)/(x-2), for x != 2', expr2: 'x+2' } }];
  const results = [{ verified: true, status: 'CONDITIONALLY_EQUIVALENT', domain_restrictions: [2] }];
  const evalState = vb.evaluateVerificationState({ claims, verificationResults: results, prompt: 'Simplify (x^2-4)/(x-2) for x != 2' });
  assert.strictEqual(evalState.state, 'VERIFIED');
  assert.strictEqual(evalState.verifiedCount, 1);
  const trust = vb.buildVerificationTrustReport({ claims, verificationResults: results, verificationEvaluation: evalState });
  assert.strictEqual(trust.showFullVerifiedBadge, true);
  assert(trust.checks.some(c => c.kind === 'DOMAIN_RESTRICTIONS'));
});

check('resolveWithholdingDecision + getSafeWithholding preserves suggestedFix for MALFORMED_SYNTAX actions', () => {
  const { detectFormattingAnomaly } = require('../server/mathFormatDetector');
  const { resolveWithholdingDecision, getSafeWithholding } = require('../server/withholdingTaxonomy');
  const decision = resolveWithholdingDecision({
    lastUserText: '\\[\n2\\sin²⁽ˣ⁾⁺\\csc(x)-9=0\n\\]',
    detectFormattingAnomaly
  });
  const sw = getSafeWithholding(decision.reason, decision.overrides);
  assert.strictEqual(decision.reason, 'MALFORMED_SYNTAX');
  assert(typeof sw.suggestedFix === 'string' && sw.suggestedFix.includes('2\\sin^2(x)'), `Expected suggestedFix on getSafeWithholding, got ${JSON.stringify(sw.suggestedFix)}`);
});

check('server.js forwards withholdingDetails.suggestedFix and app.js wires Solve + Edit + Trust card cleanly', () => {
  const serverJs = fs.readFileSync(path.join(__dirname, '..', 'server', 'server.js'), 'utf8');
  const appJs = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  assert(serverJs.includes('safeWithholding.suggestedFix'), 'server.js must include suggestedFix on withholdingDetails');
  assert(serverJs.includes('buildVerificationTrustReport'), 'server.js must attach trustReport on verificationSummary');
  assert(appJs.includes('pythos-suggested-fix-solve'), 'app.js must render Solve Suggested Equation button');
  assert(appJs.includes('pythos-suggested-fix-edit'), 'app.js must render Edit in Input button');
  assert(appJs.includes('pythos-trust-details'), 'app.js must render expandable Verification Trust Indicator');
  assert(appJs.includes('!/[<>]/.test(rawSuggestedFix)'), 'app.js must sanitize suggestedFix before creating controls');
});

console.log(`\n======================================================================`);
console.log(`RESULTS: ${passed}/${passed} PASSED`);
console.log(`======================================================================`);
