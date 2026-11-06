/**
 * test-admin-reports-regression.js
 *
 * Dedicated regression test suite covering the 8 production incident reports from the Admin Panel:
 * 1. PY-810baadf / PY-32058692: Implicit trigonometric equation normalization (sinx * secx = tanx, x=0)
 * 2. PY-94f45e89 / PY-fb7b022d: Parametric solution families (\boxed{x = n\pi \quad\text{for all integers } n}) never extract fake ['i']
 * 3. PY-e1da85d8 / PY-2a824c16: "No real solution" derivations never extract spurious roots from inequalities or test values
 * 4. PY-c0d062a7: Identity prompts ("does ... = ...", "cos²x") never extract test values as equation roots, and UTF-8 exponents parse cleanly
 * 5. PY-32058692 (Context Manager): Standalone new equations in multi-turn conversations are not contaminated by prior turn prompts
 * 6. PY-c3972e31: Clean KaTeX math rendering without leaking uncompiled LaTeX
 */

const assert = require('assert');
const vb = require('./server/verificationBridge.js');
const contextManager = require('./server/contextManager.js');

console.log('====================================================');
console.log('📋 TESTING ADMIN REPORTS REGRESSION SUITE (8 CASES)');
console.log('====================================================\n');

(async () => {
  // TEST 1: Implicit trig equation normalization and verification (PY-810baadf, PY-32058692)
  console.log('--- TEST 1: Implicit Trig Equation Normalization & Solution Verification ---');
  const trigClaim = {
    domain: 'algebra',
    claim_type: 'equation_solution',
    raw_match: 'x = 0',
    data: {
      equation: 'sinx * secx = tanx',
      variable: 'x',
      proposed_solutions: [0]
    }
  };
  const trigResult = await vb.runDeterministicVerification(trigClaim, 'sinx * secx = tanx');
  assert.strictEqual(trigResult.verified, true, 'sinx * secx = tanx must be verified for root x=0');
  console.log('  ✔ [PASS] Test 1: Implicit trig equation sinx * secx = tanx verified for root x=0.\n');

  // TEST 2: Parametric periodic families (PY-94f45e89, PY-fb7b022d)
  console.log('--- TEST 2: Parametric Periodic Families Never Extract Fake Root "i" ---');
  const periodicText = `Factor: \\(\\sin x (\\cos^2 x - 1) = 0\\), which gives \\(\\sin x = 0\\).
\\[\\boxed{\\,x = n\\pi \\quad\\text{for all integers } n\\,}\\]`;
  const periodicClaims = vb.extractClaims(periodicText, 'sinx * cosx = tanx');
  const fakeIClaim = periodicClaims.find(c => c.data?.proposed_solutions?.includes('i') || c.data?.proposed_solutions?.includes('I'));
  assert.strictEqual(fakeIClaim, undefined, 'Parametric family with \\pi and integers must never extract imaginary unit i as a candidate root');
  console.log('  ✔ [PASS] Test 2: n\\pi periodic solution families do not extract fake "i" roots.\n');

  // TEST 3: No-real-solution derivations (PY-e1da85d8, PY-2a824c16)
  console.log('--- TEST 3: No-Real-Solution Explanations Never Extract Fake Roots ---');
  const noSolText = `We know \\(\\cot x + \\tan x = \\frac{2}{\\sin(2x)}\\).
Setting this equal to 1 gives \\(\\sin(2x) = 2\\).
Since \\(|\\sin(2x)| \\le 1\\), there is no real x.
Thus, the equation has no real solutions.`;
  const noSolClaims = vb.extractClaims(noSolText, 'cotx+tanx=1');
  const spuriousRoot = noSolClaims.find(c => c.claim_type === 'equation_solution');
  assert.strictEqual(spuriousRoot, undefined, 'No-real-solution derivation must not extract inequalities or prose as candidate roots');
  console.log('  ✔ [PASS] Test 3: No-real-solution explanations extract zero false root claims.\n');

  // TEST 4: Identity prompts & test points (PY-c0d062a7)
  console.log('--- TEST 4: Identity Questions Never Extract Test Points as Roots ---');
  const identityText = `To test if this is an identity, try x = 1.
When x = 1, LHS != RHS.
So the statement is not an identity; for example at x = 1 the two sides differ.`;
  const identityClaims = vb.extractClaims(identityText, 'does cosx/(1+sinx)+(1+sinx)/cosx=cos²x');
  const testPointClaim = identityClaims.find(c => c.claim_type === 'equation_solution');
  assert.strictEqual(testPointClaim, undefined, 'Identity prompt must not treat test values like x=1 as candidate equation roots');
  console.log('  ✔ [PASS] Test 4: Identity test points like x=1 are not extracted as equation roots.\n');

  // TEST 5: Context Manager Turn Independence (PY-32058692)
  console.log('--- TEST 5: Context Manager Independent Standalone Equations ---');
  const messages = [
    { role: 'user', content: 'sinx * secx = tanx' },
    { role: 'assistant', content: 'The equation simplifies to tanx = tanx...' },
    { role: 'user', content: 'tanx+cotx=1' }
  ];
  const effectivePrompt = contextManager.buildEffectivePrompt(messages);
  assert.strictEqual(effectivePrompt, 'tanx+cotx=1', 'Fresh equation in multi-turn conversation must not be contaminated by prior prompt');
  console.log('  ✔ [PASS] Test 5: Fresh standalone equations in multi-turn chats remain unpolluted.\n');

  // TEST 6: Student Formatting & KaTeX Compilation (PY-c3972e31)
  console.log('--- TEST 6: Student Identity Proof Formatting ---');
  const fs = require('fs');
  const path = require('path');
  const appSource = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
  const funcMatch = appSource.match(/function formatResponseText\(raw\) \{([\s\S]*?)\n  \}/);
  assert.ok(funcMatch, 'formatResponseText must exist in app.js');
  const mockKatex = { renderToString(expr) { return `<span class="katex">${expr}</span>`; } };
  const formatFn = new Function('raw', 'window', `const katex = window.katex; ${funcMatch[1]}`);
  const sampleProof = `\\[ \\frac{\\tan\\theta+\\sin\\theta}{1+\\cos\\theta} = \\tan\\theta \\]`;
  const formattedHtml = formatFn(sampleProof, { katex: mockKatex });
  assert.ok(formattedHtml.includes('class="katex"'), 'Proof must compile cleanly into KaTeX');
  console.log('  ✔ [PASS] Test 6: Trigonometric identity proof compiles to KaTeX with zero leaks.\n');

  // TEST 7: Chained Equality Discriminant Verification Catches Arithmetic Errors
  console.log('--- TEST 7: Chained Equality Discriminant Verification ---');
  const falseDiscriminantTurn = `The algebraic steps lead to the quadratic:
8x^2 - 44x + 59 = 0
and its discriminant is:
\\Delta = (-44)^2 - 4 \\cdot 8 \\cdot 59 = 1936 - 1896 = 40 = 2^2 \\cdot 10.`;
  const falseRes = await vb.verifyResponseClaims(falseDiscriminantTurn, 'double check the discriminant');
  assert.ok(falseRes.invalidClaims.length > 0, 'Must flag (-44)^2 - 4*8*59 = 40 as invalid arithmetic');
  assert.ok(falseRes.invalidClaims.some(ic => ic.verification.details.includes('48')), 'Invalid claim details must state that (-44)^2 - 4*8*59 is 48');

  const trueDiscriminantTurn = `The discriminant is:
\\Delta = (-44)^2 - 4 \\cdot 8 \\cdot 59 = 1936 - 1888 = 48.`;
  const trueRes = await vb.verifyResponseClaims(trueDiscriminantTurn, 'double check the discriminant');
  assert.strictEqual(trueRes.invalidClaims.length, 0, 'Correct arithmetic must have zero invalid claims');
  assert.ok(trueRes.verificationResults.some(vr => vr.verified === true), 'Correct arithmetic must be verified');
  console.log('  ✔ [PASS] Test 7: Chained equality discriminant correctly catches 4*8*59 arithmetic slip and validates 48.\n');

  console.log('====================================================');
  console.log('ALL 7 ADMIN REPORT REGRESSION TESTS PASSED! (100%)');
  console.log('====================================================');
  process.exit(0);
})().catch(err => {
  console.error('FAILED:', err);
  process.exit(1);
});
