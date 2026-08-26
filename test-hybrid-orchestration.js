/**
 * test-hybrid-orchestration.js
 * Test suite for General Natural-Language Population & Rate Extraction,
 * Pure vs Hybrid Disambiguation, and Deterministic Pre-Flight Fusion.
 */

const {
  analyzeDeterministicIntent,
  extractPreflightDeterministicFacts,
  buildDeterministicResponse,
  buildPreflightContext
} = require('./server/deterministicRouter');

console.log("==================================================");
console.log("⚡ TESTING HYBRID NUMERICAL + SEMANTIC ORCHESTRATION");
console.log("==================================================\n");

const tests = [
  // 1. "What is 72/120?" (Pure)
  {
    name: "1. What is 72/120?",
    prompt: "What is 72/120?",
    expectPureDeterministic: true,
    expectedResult: "0.6"
  },

  // 2. "What is 72/120 as a percentage?" (Pure)
  {
    name: "2. What is 72/120 as a percentage?",
    prompt: "What is 72/120 as a percentage?",
    expectPureDeterministic: true,
    expectedResult: "60%"
  },

  // 3. "Is 72/120 equal to 60%?" (Pure Verification)
  {
    name: "3. Is 72/120 equal to 60%?",
    prompt: "Is 72/120 equal to 60%?",
    expectPureDeterministic: true,
    expectedResult: "60%"
  },

  // 4. "Is 72/120 equal to 60%? Explain briefly." (Hybrid)
  {
    name: "4. Is 72/120 equal to 60%? Explain briefly.",
    prompt: "Is 72/120 equal to 60%? Explain briefly.",
    expectPureDeterministic: false,
    expectPreflightFacts: true,
    expectedFactExpr: "(72) / (120)",
    expectedFactExact: 0.60,
    expectedFactValid: true
  },

  // 5. "Is 72/120 equal to 55%? Explain briefly." (Hybrid - Contradiction)
  {
    name: "5. Is 72/120 equal to 55%? Explain briefly.",
    prompt: "Is 72/120 equal to 55%? Explain briefly.",
    expectPureDeterministic: false,
    expectPreflightFacts: true,
    expectedFactExpr: "(72) / (120)",
    expectedFactExact: 0.60,
    expectedFactValid: false
  },

  // 6. "72 of 120 students passed. Explain what percentage that is." (Hybrid)
  {
    name: "6. 72 of 120 students passed. Explain what percentage that is.",
    prompt: "72 of 120 students passed. Explain what percentage that is.",
    expectPureDeterministic: false,
    expectPreflightFacts: true,
    expectedFactExpr: "(72) / (120)",
    expectedFactExact: 0.60
  },

  // 7. "72 of 120 students passed. Is 60% correct? Explain briefly." (Hybrid)
  {
    name: "7. 72 of 120 students passed. Is 60% correct? Explain briefly.",
    prompt: "72 of 120 students passed. Is 60% correct? Explain briefly.",
    expectPureDeterministic: false,
    expectPreflightFacts: true,
    expectedFactExpr: "(72) / (120)",
    expectedFactExact: 0.60,
    expectedFactValid: true
  },

  // 8. The exact multi-sentence prompt from the user report (Hybrid)
  {
    name: "8. Multi-sentence student population scenario",
    prompt: "I have 120 students.\n72 passed the exam.\nIs it correct to say that 60% of the students passed?\nIf so, explain briefly why. If not, correct the percentage.",
    expectPureDeterministic: false,
    expectPreflightFacts: true,
    expectedFactExpr: "(72) / (120)",
    expectedFactExact: 0.60,
    expectedFactValid: true
  }
];

let passed = 0;
let total = tests.length;

tests.forEach((tc, idx) => {
  console.log(`▶ [TEST ${idx + 1}] ${tc.name}...`);
  const intent = analyzeDeterministicIntent(tc.prompt);

  if (tc.expectPureDeterministic) {
    if (intent) {
      console.log(`  ✅ Pure deterministic route active (Type: ${intent.type})`);
      const response = buildDeterministicResponse(intent);
      console.log(`     Output snippet: ${response.replace(/\n+/g, ' ')}`);
      passed++;
    } else {
      console.error(`  ❌ FAILED: Pure calculation was not recognized deterministically:\n"${tc.prompt}"`);
    }
  } else {
    if (!intent) {
      console.log(`  ✅ Correctly routed to Semantic AI Track for requested explanation`);
      if (tc.expectPreflightFacts) {
        const facts = extractPreflightDeterministicFacts(tc.prompt);
        if (facts && facts.length > 0) {
          const f = facts[0];
          console.log(`  ✅ Pre-flight extracted: ${f.expression} = ${f.exact_formatted} (is_valid: ${f.is_valid})`);
          if (tc.expectedFactExact !== undefined) {
            const mathMatches = Math.abs(f.exact_value - tc.expectedFactExact) < 1e-4;
            const validMatches = tc.expectedFactValid === undefined || f.is_valid === tc.expectedFactValid;
            if (mathMatches && validMatches) {
              // Test timeout fallback generation
              const fallback = buildDeterministicResponse({ type: 'PREFLIGHT_FACTS_FALLBACK', facts });
              console.log(`     Timeout Fallback Output: "${fallback.split('\n')[0]}..."`);
              passed++;
            } else {
              console.error(`  ❌ FAILED: Extracted fact did not match expected values.`);
            }
          } else {
            passed++;
          }
        } else {
          console.error(`  ❌ FAILED: Pre-flight facts were NOT extracted for hybrid query:\n"${tc.prompt}"`);
        }
      } else {
        passed++;
      }
    } else {
      console.error(`  ❌ FAILED: Hybrid query requesting explanation was prematurely intercepted as pure arithmetic.`);
    }
  }
  console.log("");
});

console.log(`==================================================`);
console.log(`📊 HYBRID ORCHESTRATION RESULTS: ${passed}/${total} (${Math.round((passed/total)*100)}%) PASSED`);
console.log(`==================================================\n`);

if (passed !== total) {
  process.exit(1);
}
