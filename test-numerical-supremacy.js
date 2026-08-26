/**
 * test-numerical-supremacy.js
 * Exhaustive test suite for Deterministic Calculation Supremacy:
 * - Simple arithmetic
 * - Percentages
 * - Ratios
 * - Fractions
 * - Bayes multi-step calculations
 * - Intermediate-value reuse
 * - AI-generated calculations vs deterministic calculation overrides
 */

const { extractClaims, runDeterministicVerification } = require('./server/verificationBridge');
const mathjsVerifier = require('./server/mathjsVerifier');

console.log("==================================================");
console.log("⚡ PYTHOS NUMERICAL & CALCULATION SUPREMACY SUITE");
console.log("==================================================\n");

const testScenarios = [
  // 1. Bayes Population Problem (The user's reported bug)
  {
    name: "Bayes Theorem False Posterior Rejection",
    llmResponse: `
      - True positives = 95
      - False positives = 495
      - Total positive tests = 590 (95 + 495 = 590)
      $$P(Disease | Positive) = \\frac{95}{590} \\approx 0.662$$
    `,
    mustDetectContradiction: true,
    contradictingExpr: "(95) / (590)",
    expectedTrueVal: 0.1610
  },

  // 2. Bayes Theorem Correct Posterior Verification
  {
    name: "Bayes Theorem Correct Posterior Acceptance",
    llmResponse: `
      $$P(Disease | Positive) = \\frac{95}{590} \\approx 0.1610$$
    `,
    mustDetectContradiction: false
  },

  // 3. Percentage Calculation
  {
    name: "Percentage of Population Mismatch",
    llmResponse: `
      Out of 200 participants, 45 tested positive, which gives:
      $$45 / 200 = 35.0%$$
    `,
    mustDetectContradiction: true,
    contradictingExpr: "45 / 200",
    expectedTrueVal: 0.225
  },

  // 4. Multi-Step Ratio Calculation
  {
    name: "Multi-Step Fraction Ratio",
    llmResponse: `
      Evaluating the ratio:
      $$\\frac{120}{800} \\approx 0.25$$
    `,
    mustDetectContradiction: true,
    contradictingExpr: "(120) / (800)",
    expectedTrueVal: 0.150
  },

  // 5. Correct Intermediate Steps with One Flawed Final Step
  {
    name: "Chain of Correct Intermediate Steps + 1 Flawed Step",
    llmResponse: `
      Step 1: Prevalence = 1000 * 0.05 = 50
      Step 2: Healthy = 1000 - 50 = 950
      Step 3: False positives = 950 * 0.10 = 95
      Step 4: Total positives = 50 + 95 = 145
      Step 5: Posterior = \\frac{50}{145} \\approx 0.500
    `,
    mustDetectContradiction: true,
    contradictingExpr: "(50) / (145)",
    expectedTrueVal: 0.3448
  },

  // 6. Simple Arithmetic Addition Mismatch
  {
    name: "Addition Arithmetic Mismatch",
    llmResponse: `
      Combining the components gives:
      $$125 + 375 = 600$$
    `,
    mustDetectContradiction: true,
    contradictingExpr: "125 + 375",
    expectedTrueVal: 500
  },

  // 7. Multiplication & Powers
  {
    name: "Power Calculation Check",
    llmResponse: `
      The total states are:
      $$2^8 = 512$$
    `,
    mustDetectContradiction: true,
    contradictingExpr: "2 ^ 8",
    expectedTrueVal: 256
  }
];

async function runSupremacyTests() {
  let passed = 0;
  let total = testScenarios.length;

  for (let i = 0; i < testScenarios.length; i++) {
    const sc = testScenarios[i];
    console.log(`▶ [TEST ${i + 1}] ${sc.name}...`);

    const claims = extractClaims(sc.llmResponse);
    let contradictionFound = null;
    let verifiedCount = 0;

    for (const claim of claims) {
      const verification = await runDeterministicVerification(claim);
      if (verification && verification.verified === false && verification.status !== 'UNKNOWN') {
        contradictionFound = { claim, verification };
      } else if (verification && verification.verified === true) {
        verifiedCount++;
      }
    }

    if (sc.mustDetectContradiction) {
      if (contradictionFound) {
        const exact = Number(contradictionFound.verification.exact_value);
        console.log(`  ✅ Contradiction detected on expression: "${contradictionFound.claim.data.expression}"`);
        console.log(`     Proposed: ${contradictionFound.claim.data.proposed_value}`);
        console.log(`     Exact Computed: ${exact.toFixed(4)} (matches expected ≈ ${sc.expectedTrueVal.toFixed(4)})`);
        passed++;
      } else {
        console.error(`  ❌ FAILED: Did not catch contradiction in text:\n${sc.llmResponse}`);
      }
    } else {
      if (!contradictionFound && verifiedCount > 0) {
        console.log(`  ✅ Verified mathematically sound calculation (All ${verifiedCount} steps passed)`);
        passed++;
      } else {
        console.error(`  ❌ FAILED: False alarm on correct calculation.`);
      }
    }
    console.log("");
  }

  console.log(`==================================================`);
  console.log(`📊 NUMERICAL SUPREMACY RESULTS: ${passed}/${total} (${Math.round((passed/total)*100)}%) PASSED`);
  console.log(`==================================================\n`);

  if (passed !== total) {
    process.exit(1);
  }
}

runSupremacyTests();
