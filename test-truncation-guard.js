/**
 * test-truncation-guard.js
 *
 * Test suite verifying response truncation handling, reasoning effort budgeting,
 * max_tokens limits, and delivery gate safe withholding on cut-off responses.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log("====================================================");
console.log("TEST SUITE: Response Truncation & Token Budget Guard");
console.log("====================================================\n");

// 1. Verify server.js contains the low reasoning effort and 2048 token budgeting
const serverSource = fs.readFileSync(path.join(__dirname, 'server/server.js'), 'utf8');

assert.strictEqual(
  serverSource.includes("payloadObj.reasoning_effort = 'low'"),
  true,
  "server.js must set reasoning_effort = 'low' for reasoning models in Groq"
);

assert.strictEqual(
  serverSource.includes("max_tokens: Math.min(options?.num_predict || options?.max_tokens || 2048, 2048)"),
  true,
  "server.js must allow up to 2048 tokens for text generation"
);

assert.strictEqual(
  serverSource.includes("const isTruncated = finishReason === 'length'"),
  true,
  "server.js must detect Groq truncation via finish_reason === 'length'"
);

assert.strictEqual(
  serverSource.includes("const isCandidateIncomplete = isCandidateTruncated || endsWithIncompleteHeader || hasUnclosedDisplayMath"),
  true,
  "Delivery gate must guard against candidate responses ending with incomplete headers or unclosed math"
);

// 2. Unit test incomplete candidate detection logic
function checkIncomplete(finalContent, candidateResult = {}) {
  const isCandidateTruncated = candidateResult?.truncated === true;
  const endsWithIncompleteHeader = /(?:##\s*Final\s*answer|\*\*Final\s*Answer\*\*|###\s*Answer|###\s*Final\s*Result)[:\s]*$/i.test(finalContent.trim());
  const displayMathOpen = (finalContent.match(/\\\[/g) || []).length;
  const displayMathClose = (finalContent.match(/\\\]/g) || []).length;
  const hasUnclosedDisplayMath = displayMathOpen > displayMathClose;
  return isCandidateTruncated || endsWithIncompleteHeader || hasUnclosedDisplayMath;
}

// Test case A: Completed answer
const completeAnswer = "Step 1: Simplify...\nStep 2: Factor...\n\n## Final answer\n\n\\[\\boxed{x = 0}\\]";
assert.strictEqual(checkIncomplete(completeAnswer), false, "Complete answer must not be flagged incomplete");

// Test case B: Cut off at ## Final answer
const cutOffAnswer = "Step 1: Simplify...\nStep 2: Factor...\n\n## Final answer";
assert.strictEqual(checkIncomplete(cutOffAnswer), true, "Response ending at '## Final answer' must be flagged incomplete");

// Test case C: Cut off with unclosed display math
const unclosedMath = "Step 1: Simplify...\n\\[ x = \\frac{1}{2}";
assert.strictEqual(checkIncomplete(unclosedMath), true, "Response with unclosed '\\[ ' must be flagged incomplete");

// Test case D: Marked truncated by provider
const providerTruncated = "Step 1: Some valid text with matching \\[ x = 1 \\]";
assert.strictEqual(checkIncomplete(providerTruncated, { truncated: true }), true, "Provider-flagged truncated must be flagged incomplete");

console.log("✅ All truncation guard assertions passed successfully!");
console.log("====================================================\n");
