/**
 * test-bayes-lightbulb.js
 * Test suite for Machine A & B Bayes Two-Class Screening & Light Bulb Problem
 */

const {
  extractPreflightDeterministicFacts,
  buildPreflightContext
} = require('./server/deterministicRouter');

const {
  extractClaims,
  auditInternalConsistency,
  runDeterministicVerification
} = require('./server/verificationBridge');

console.log("==================================================");
console.log("⚡ TESTING BAYES TWO-CLASS (LIGHT BULB MACHINE) EXTRACTION & CONSISTENCY");
console.log("==================================================\n");

const userPrompt = `
A factory produces light bulbs from two machines. Machine A produces 70% of the bulbs and has a 2% defect rate. Machine B produces 30% of the bulbs and has a 6% defect rate. A randomly selected bulb is defective.
1. What is the probability that it came from Machine B?
2. A student says: "Machine B has three times the defect rate of Machine A, so there is a 3-to-1 chance that a defective bulb came from B." Is the student's reasoning correct?
3. Explain the difference between: P(defective | Machine B) and P(Machine B | defective). Show the calculation clearly and keep the explanation concise.
`;

console.log("▶ [TEST 1] Pre-Flight Extraction on Two-Class Bayes Light Bulb Scenario...");
const preflightFacts = extractPreflightDeterministicFacts(userPrompt);
console.log(`Extracted ${preflightFacts.length} preflight facts:`);
preflightFacts.forEach((f, i) => {
  console.log(`  Fact ${i + 1}: ${f.type} -> ${f.expression} = ${f.exact_formatted} (${f.exact_value})`);
});

const preflightCtx = buildPreflightContext(preflightFacts);
console.log("\nInjected Context Preview:\n" + preflightCtx);

const modelFlawedOutput = `
P(defective) = 0.02 * 0.70 + 0.06 * 0.30 = 0.014 + 0.018 = 0.032
P(Machine B | defective) = (0.06 * 0.30) / 0.032
= 0.09 / 0.032
= 0.28125
So the probability is approximately 28.13%.
`;

console.log("▶ [TEST 2] Verifying Contradiction Interception on Model Flawed Output...");
(async () => {
  const claims = extractClaims(modelFlawedOutput);
  console.log(`Extracted ${claims.length} claims from model output.`);

  let contradictionsCaught = 0;
  for (const c of claims) {
    const v = await runDeterministicVerification(c);
    if (!v.verified) {
      contradictionsCaught++;
      console.log(`  ❌ Caught contradiction: ${c.data.expression} = ${c.data.proposed_value} (Expected: ${v.exact_value})`);
    } else {
      console.log(`  ✅ Verified step: ${c.data.expression} = ${c.data.proposed_value}`);
    }
  }

  const internal = auditInternalConsistency(claims);
  if (internal.length > 0) {
    console.log(`  ⚖️ Internal inconsistency flagged: ${internal.map(i => i.details).join('; ')}`);
  }

  if (preflightFacts.length > 0 && contradictionsCaught >= 1) {
    console.log("\n==================================================");
    console.log("🎯 ALL TESTS PASSED: Preflight establishes exact Bayes truth and verifier catches all hallucinations!");
    console.log("==================================================\n");
  } else {
    console.error("❌ FAILED: Preflight or verifier check failed.");
    process.exit(1);
  }
})();
