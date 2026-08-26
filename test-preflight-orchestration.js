/**
 * test-preflight-orchestration.js
 * Test suite for Pre-Flight Numerical Extraction, Dual-Track Evidence Fusion,
 * and AI Timeout Preservation of Deterministic Results.
 */

const {
  analyzeDeterministicIntent,
  extractPreflightDeterministicFacts,
  buildDeterministicResponse,
  buildPreflightContext
} = require('./server/deterministicRouter');

console.log("==================================================");
console.log("⚡ TESTING PRE-FLIGHT ORCHESTRATION & DUAL-TRACK FUSION");
console.log("==================================================\n");

const scenarios = [
  // 1. Embedded natural-language ratio in conceptual statement
  {
    name: "Embedded Bayes natural language ratio assertion",
    text: "95 true positives out of 590 total positive tests means the probability is approximately 66.2%.",
    expectPreflightFacts: true,
    expectedExpr: "(95) / (590)",
    expectedExact: 0.1610,
    studentAsserted: 0.662,
    isStudentCorrect: false
  },

  // 2. Natural language percentage in population query
  {
    name: "Natural language percentage in trials",
    text: "If there are 45 successes in 200 trials, the success rate is 35%.",
    expectPreflightFacts: true,
    expectedExpr: "(45) / (200)",
    expectedExact: 0.225,
    studentAsserted: 0.35,
    isStudentCorrect: false
  },

  // 3. LaTeX fraction embedded in conceptual question
  {
    name: "LaTeX fraction in question",
    text: "Can you explain why \\frac{95}{590} \\approx 0.662 in this medical screening scenario?",
    expectPreflightFacts: true,
    expectedExpr: "(95) / (590)",
    expectedExact: 0.1610,
    studentAsserted: 0.662,
    isStudentCorrect: false
  },

  // 4. Correct student assertion
  {
    name: "Correct student ratio assertion",
    text: "95 out of 590 is about 16.1%, right?",
    expectPreflightFacts: true,
    expectedExpr: "(95) / (590)",
    expectedExact: 0.1610,
    studentAsserted: 0.161,
    isStudentCorrect: true
  },

  // 5. Pure conceptual query (no embedded numerical calculation)
  {
    name: "Pure conceptual question",
    text: "Why does low disease prevalence make false positives dominate the total positive test results?",
    expectPreflightFacts: false
  }
];

let passed = 0;
let total = scenarios.length;

scenarios.forEach((sc, idx) => {
  console.log(`▶ [TEST ${idx + 1}] ${sc.name}...`);
  const facts = extractPreflightDeterministicFacts(sc.text);

  if (sc.expectPreflightFacts) {
    if (facts && facts.length > 0) {
      const f = facts[0];
      const exactVal = Number(f.exact_value);
      console.log(`  ✅ Pre-flight extracted calculation: ${f.expression}`);
      console.log(`     Exact Value: ${exactVal.toFixed(4)} (Expected ≈ ${sc.expectedExact.toFixed(4)})`);
      console.log(`     Student Claim: ${f.proposed_value} (Valid: ${f.is_valid})`);

      const matchesValidity = f.is_valid === sc.isStudentCorrect;
      if (matchesValidity) {
        // Test context formatting for LLM injection
        const contextStr = buildPreflightContext(facts);
        console.log(`     Injected Context Snippet: "${contextStr.trim().replace(/\n/g, ' ')}"`);
        passed++;
      } else {
        console.error(`  ❌ FAILED: Expected is_valid=${sc.isStudentCorrect}, got ${f.is_valid}`);
      }
    } else {
      console.error(`  ❌ FAILED: Did not extract preflight facts from: "${sc.text}"`);
    }
  } else {
    if (!facts || facts.length === 0) {
      console.log(`  ✅ Correctly identified as purely conceptual (no premature numerical extraction)`);
      passed++;
    } else {
      console.error(`  ❌ FAILED: Extracted false facts from pure conceptual query.`);
    }
  }
  console.log("");
});

// Test Fallback when AI times out
console.log("▶ [TEST 6] AI Timeout Fallback with Pre-Computed Facts...");
const sampleFacts = extractPreflightDeterministicFacts("95 true positives out of 590 total positive tests means the probability is approximately 66.2%.");
const fallbackMsg = buildDeterministicResponse({
  type: 'PREFLIGHT_FACTS_FALLBACK',
  facts: sampleFacts
});
console.log(`Generated Fallback Message on Timeout:\n"${fallbackMsg}"\n`);
if (fallbackMsg && fallbackMsg.includes("16.1") && fallbackMsg.includes("66.2")) {
  console.log("✅ Timeout fallback successfully delivers deterministic facts without guessing or blanking!");
  passed++;
  total++;
} else {
  console.error("❌ FAILED: Fallback message did not contain exact calculation.");
  total++;
}

console.log(`==================================================`);
console.log(`📊 PRE-FLIGHT ORCHESTRATION RESULTS: ${passed}/${total} (${Math.round((passed/total)*100)}%) PASSED`);
console.log(`==================================================\n`);

if (passed !== total) {
  process.exit(1);
}
