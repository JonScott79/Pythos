/**
 * test-cross-step-consistency.js
 * Comprehensive multi-step adversarial tests for internal contradiction detection,
 * intermediate value tracking, chained expressions, and variable consistency.
 */

const { extractClaims, auditInternalConsistency, runDeterministicVerification } = require('./server/verificationBridge');

console.log("==================================================");
console.log("⚡ AUDITING MULTI-STEP INTERNAL CONSISTENCY & CONTRADICTIONS");
console.log("==================================================\n");

const adversarialScenarios = [
  // Scenario 1: Exact user report (Late repeated multiplication failure + bad final division)
  {
    name: "1. Late Repeated Multiplication Failure & Broken Division",
    text: `
      Step 1: P(Pos|Healthy) * P(Healthy) = 0.02 * 0.70 = 0.014
      Step 2: P(Pos|Diseased) * P(Diseased) = 0.06 * 0.30 = 0.018
      Step 3: Total Positives = 0.014 + 0.018 = 0.032
      Step 4: Numerator = 0.06 * 0.30 = 0.09
      Step 5: Posterior = 0.09 / 0.032 = 0.28125
    `,
    expectedViolations: 2 // 0.06*0.30=0.09 and 0.09/0.032=0.28125
  },

  // Scenario 2: Chained arithmetic with flawed addition
  {
    name: "2. Chained Multi-Step Addition Mismatch",
    text: `
      Let's sum the components:
      12.5 + 27.5 = 40.0
      40.0 + 15.0 = 55.0
      55.0 + 45.0 = 110.0
    `,
    expectedViolations: 1 // 55.0 + 45.0 = 100.0, not 110.0
  },

  // Scenario 3: Variable / Symbolic contradiction across steps
  {
    name: "3. Direct Repeated Expression Contradiction",
    text: `
      In Part 1, we find:
      0.15 * 400 = 60
      In Part 2, we reuse:
      0.15 * 400 = 75
    `,
    expectedViolations: 1, // 0.15 * 400 = 75 is false
    expectInternalAuditFlag: true
  },

  // Scenario 4: Fully Sound Multi-Step Derivation
  {
    name: "4. Fully Sound Multi-Step Calculation",
    text: `
      Step 1: 0.02 * 0.70 = 0.014
      Step 2: 0.06 * 0.30 = 0.018
      Step 3: 0.014 + 0.018 = 0.032
      Step 4: 0.018 / 0.032 = 0.5625
    `,
    expectedViolations: 0
  }
];

async function runAdversarialAudit() {
  let passed = 0;
  let total = adversarialScenarios.length;

  for (let i = 0; i < adversarialScenarios.length; i++) {
    const s = adversarialScenarios[i];
    console.log(`▶ [SCENARIO ${i + 1}] ${s.name}...`);
    const claims = extractClaims(s.text);
    console.log(`  Extracted ${claims.length} claim(s).`);

    let violations = 0;
    for (const c of claims) {
      const res = await runDeterministicVerification(c);
      if (!res.verified) {
        violations++;
        console.log(`  ❌ Intercepted Invalid Claim: "${c.data.expression}" -> proposed: ${c.data.proposed_value} (exact: ${res.exact_value})`);
      }
    }

    const internalContradictions = auditInternalConsistency(claims);
    if (internalContradictions.length > 0) {
      console.log(`  ⚖️ Internal Contradiction Detected: ${internalContradictions.map(ic => ic.details).join('; ')}`);
    }

    const violationMatches = violations === s.expectedViolations;
    const internalMatches = !s.expectInternalAuditFlag || internalContradictions.length > 0;

    if (violationMatches && internalMatches) {
      console.log(`  ✅ Passed (Violations: ${violations}/${s.expectedViolations})\n`);
      passed++;
    } else {
      console.error(`  ❌ FAILED: Expected ${s.expectedViolations} violations, got ${violations}.\n`);
    }
  }

  console.log("==================================================");
  console.log(`📊 ADVERSARIAL MULTI-STEP RESULTS: ${passed}/${total} (${Math.round((passed/total)*100)}%) PASSED`);
  console.log("==================================================\n");

  if (passed !== total) {
    process.exit(1);
  }
}

runAdversarialAudit();
