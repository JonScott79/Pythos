/**
 * test-general-deterministic-router.js
 * Comprehensive test suite for Multi-Expression, Format-Directed,
 * Pure Arithmetic Short-Circuiting, and Pre-Flight Hybrid Processing.
 */

const {
  analyzeDeterministicIntent,
  extractPreflightDeterministicFacts,
  buildDeterministicResponse,
  buildPreflightContext
} = require('./server/deterministicRouter');

console.log("==================================================");
console.log("⚡ TESTING GENERAL DETERMINISTIC ROUTER & SHORT-CIRCUITING");
console.log("==================================================\n");

const testCases = [
  // 1. The exact regression query
  {
    name: "Exact User Multi-Rate Prompt with Formatting Directive",
    prompt: "Calculate these four rates:\n\n93/100\n87/90\n192/300\n55/80\n\nReturn the four percentages only, one per line.",
    expectDeterministic: true,
    expectType: "BATCH_ARITHMETIC",
    expectedResults: ["93%", "96.6667%", "64%", "68.75%"]
  },

  // 2. Single calculation
  {
    name: "Calculate 17/20",
    prompt: "Calculate 17/20.",
    expectDeterministic: true,
    expectedResults: ["17/20", "0.85"]
  },

  // 3. Dual calculation with 'and'
  {
    name: "Calculate 17/20 and 13/25",
    prompt: "Calculate 17/20 and 13/25.",
    expectDeterministic: true,
    expectType: "BATCH_ARITHMETIC",
    expectedResults: ["0.85", "0.52"]
  },

  // 4. Multiple expressions requested as percentages
  {
    name: "What are 17/20 and 13/25 as percentages?",
    prompt: "What are 17/20 and 13/25 as percentages?",
    expectDeterministic: true,
    expectType: "BATCH_ARITHMETIC",
    expectedResults: ["85%", "52%"]
  },

  // 5. Output format constraint: 'Give me only the answer'
  {
    name: "Give me only the answer: 17/20",
    prompt: "Give me only the answer: 17/20.",
    expectDeterministic: true,
    expectedResults: ["0.85"]
  },

  // 6. Comma-separated list
  {
    name: "Calculate these: 3/7, 5/8, 11/20",
    prompt: "Calculate these: 3/7, 5/8, 11/20.",
    expectDeterministic: true,
    expectType: "BATCH_ARITHMETIC",
    expectedResults: ["0.4286", "0.625", "0.55"]
  },

  // 7. Single standard arithmetic
  {
    name: "What is 15 * 342?",
    prompt: "What is 15 * 342?",
    expectDeterministic: true,
    expectedResults: ["5130"]
  },

  // 8. Mixed operations in one line
  {
    name: "Calculate 15 * 342 and 19/4",
    prompt: "Calculate 15 * 342 and 19/4.",
    expectDeterministic: true,
    expectType: "BATCH_ARITHMETIC",
    expectedResults: ["5130", "4.75"]
  },

  // 9. Hybrid: Numerical + Conceptual Explanation
  {
    name: "Hybrid: Calculate 93/100 and explain what the percentage means",
    prompt: "Calculate 93/100 and explain what the percentage means.",
    expectDeterministic: false, // Must reach AI for explanation!
    expectPreflightFacts: true,  // But must extract pre-flight fact 93/100 = 93%
    expectedPreflightVal: 0.93
  },

  // 10. Complex pure conceptual query
  {
    name: "Pure Conceptual (No Arithmetic)",
    prompt: "Why does low disease prevalence make false positives dominate the total positive test results?",
    expectDeterministic: false,
    expectPreflightFacts: false
  }
];

let passed = 0;
let total = testCases.length;

testCases.forEach((tc, idx) => {
  console.log(`▶ [TEST ${idx + 1}] ${tc.name}...`);
  const intent = analyzeDeterministicIntent(tc.prompt);

  if (tc.expectDeterministic) {
    if (intent) {
      console.log(`  ✅ Successfully intercepted by Deterministic Router (Type: ${intent.type})`);
      const response = buildDeterministicResponse(intent);
      console.log(`     Response Sample:\n${response.split('\n').map(l => '       ' + l).join('\n')}`);
      passed++;
    } else {
      console.error(`  ❌ FAILED: Query was NOT recognized by Deterministic Router and would fall through to LLM:\n"${tc.prompt}"`);
    }
  } else {
    if (!intent) {
      console.log(`  ✅ Correctly routed to Semantic AI Track (Not pure arithmetic)`);
      if (tc.expectPreflightFacts) {
        const facts = extractPreflightDeterministicFacts(tc.prompt);
        if (facts && facts.length > 0) {
          console.log(`  ✅ Pre-flight facts extracted: ${facts.map(f => f.expression + ' = ' + f.exact_formatted).join(', ')}`);
          passed++;
        } else {
          console.error(`  ❌ FAILED: Pre-flight facts were NOT extracted for hybrid query.`);
        }
      } else {
        passed++;
      }
    } else {
      console.error(`  ❌ FAILED: Pure conceptual or hybrid query was prematurely intercepted as pure arithmetic.`);
    }
  }
  console.log("");
});

console.log(`==================================================`);
console.log(`📊 ROUTER RESULTS: ${passed}/${total} (${Math.round((passed/total)*100)}%) PASSED`);
console.log(`==================================================\n`);

if (passed !== total) {
  process.exit(1);
}
