/**
 * test-deterministic-router.js
 * Test suite for Intelligent First-Line Deterministic Router.
 */

const { analyzeDeterministicIntent, buildDeterministicResponse } = require('./server/deterministicRouter');

console.log("==================================================");
console.log("⚡ TESTING DETERMINISTIC ROUTER (SHORT-CIRCUITING)");
console.log("==================================================\n");

const testCases = [
  {
    input: "15 * 342",
    expectedType: 'ARITHMETIC',
    expectedSubstr: '5130'
  },
  {
    input: "What is 2^10 + 5?",
    expectedType: 'ARITHMETIC',
    expectedSubstr: '1029'
  },
  {
    input: "calculate 1/3 + 1/6",
    expectedType: 'ARITHMETIC',
    expectedSubstr: '1/2'
  },
  {
    input: "convert 50 lbs to kg",
    expectedType: 'UNIT_CONVERSION',
    expectedSubstr: 'kg'
  },
  {
    input: "det([[1, 2], [3, 4]])",
    expectedType: 'MATRIX_DETERMINANT',
    expectedSubstr: '-2'
  },
  // Semantic / non-deterministic questions should NOT be routed (return null for LLM)
  {
    input: "Why is entropy always increasing in a closed system?",
    expectedType: null
  },
  {
    input: "Can you help me understand why x^2 + 16 is not (x+4)^2?",
    expectedType: null
  }
];

let passed = 0;
let total = testCases.length;

testCases.forEach((tc, idx) => {
  const intent = analyzeDeterministicIntent(tc.input);
  if (tc.expectedType === null) {
    if (intent === null) {
      console.log(`[PASS] Test ${idx + 1}: Non-deterministic query correctly routed to LLM -> "${tc.input}"`);
      passed++;
    } else {
      console.error(`[FAIL] Test ${idx + 1}: Query should NOT be intercepted -> "${tc.input}", got type: ${intent.type}`);
    }
  } else {
    if (intent && intent.type === tc.expectedType) {
      const resp = buildDeterministicResponse(intent);
      if (resp && resp.includes(tc.expectedSubstr)) {
        console.log(`[PASS] Test ${idx + 1}: ${tc.expectedType} correctly resolved -> "${tc.input}" => "${intent.formatted}"`);
        passed++;
      } else {
        console.error(`[FAIL] Test ${idx + 1}: Response missing expected substring "${tc.expectedSubstr}". Response:\n${resp}`);
      }
    } else {
      console.error(`[FAIL] Test ${idx + 1}: Expected type ${tc.expectedType}, got: ${intent ? intent.type : 'null'}`);
    }
  }
});

console.log(`\nResults: ${passed}/${total} (${Math.round((passed/total)*100)}%) passed.\n`);

if (passed !== total) {
  process.exit(1);
}
