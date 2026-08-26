// test-two-stage-reasoning.js
// Test suite verifying that non-trivial problems identify situation/model first,
// while pure arithmetic passes directly through the deterministic engine.

const assert = require('assert');
const { analyzeDeterministicIntent, extractPreflightDeterministicFacts } = require('./server/deterministicRouter');

console.log('==================================================');
console.log('⚡ TESTING TWO-STAGE REASONING & ORCHESTRATION PIPELINE');
console.log('==================================================\n');

// 1. Trivial Arithmetic Check (Direct calculation, no meta-reasoning overhead)
const trivialQuery1 = "Calculate 72/120";
const intent1 = analyzeDeterministicIntent(trivialQuery1);
console.log('▶ [TEST 1] Trivial Arithmetic (72/120):');
console.log('  Intent Classification:', intent1.type);
assert.strictEqual(intent1.type, 'ARITHMETIC', 'Trivial arithmetic must be classified as pure ARITHMETIC');
assert.strictEqual(intent1.expression, '72/120', 'Direct expression 72/120 evaluated');
assert.strictEqual(intent1.result, 0.6, 'Calculated result is 0.6');
console.log('✅ Test 1 Passed: Trivial arithmetic routes straight to calculator.\n');

// 2. Optimization Problem (Objective + Boundary Constraint)
const optQuery = "A farmer has 100 meters of fencing to enclose a rectangular field along a straight river. The river forms one side, so only three sides require fencing. Find the dimensions that maximize the area.";
const intentOpt = analyzeDeterministicIntent(optQuery);
const factsOpt = extractPreflightDeterministicFacts(optQuery);
console.log('▶ [TEST 2] Optimization (Constrained Fencing):');
console.log('  Routes to Semantic AI Track (intent === null):', intentOpt === null);
console.log('  Pre-flight Facts:', factsOpt);
assert.strictEqual(factsOpt.length > 0, true, 'Pre-flight must extract optimization parameters');
assert.strictEqual(factsOpt[0].type, 'OPTIMIZATION_FENCING');
assert.strictEqual(factsOpt[0].optimalX, 25, 'Optimal width x must be 25m');
assert.strictEqual(factsOpt[0].optimalY, 50, 'Optimal length y must be 50m');
assert.strictEqual(factsOpt[0].maxArea, 1250, 'Max area must be 1250 m^2');
console.log('✅ Test 2 Passed: Model & deterministic ground truth established.\n');

// 3. Bayes Theorem Problem (Prior vs Inverse Conditional Likelihood)
const bayesQuery = `A factory produces light bulbs from two machines. Machine A produces 70% of the bulbs and has a 2% defect rate. Machine B produces 30% of the bulbs and has a 6% defect rate. A randomly selected bulb is defective. 1. What is the probability that it came from Machine B? 2. A student says: "Machine B has three times the defect rate of Machine A, so there is a 3-to-1 chance that a defective bulb came from B." Is the student's reasoning correct? 3. Explain the difference between: P(defective | Machine B) and P(Machine B | defective).`;
const intentBayes = analyzeDeterministicIntent(bayesQuery);
const factsBayes = extractPreflightDeterministicFacts(bayesQuery);
console.log('▶ [TEST 3] Bayes Theorem (Forward vs Inverse Conditional):');
console.log('  Routes to Semantic AI Track (intent === null):', intentBayes === null);
console.log('  Facts:', factsBayes);
assert.strictEqual(factsBayes.length > 0, true, 'Pre-flight must extract Bayes facts');
assert.strictEqual(factsBayes[0].type, 'BAYES_TWO_CLASS');
assert.strictEqual(factsBayes[0].postB, 0.5625, 'Posterior P(B|D) must equal 0.5625 (56.25%)');
console.log('✅ Test 3 Passed: Bayes model and inverse probability established.\n');

// 4. Hybrid Student Claim Verification
const hybridQuery = "I have 120 students. 72 passed the exam. Is it correct to say that 60% of the students passed? If so, explain briefly why. If not, correct the percentage.";
const intentHybrid = analyzeDeterministicIntent(hybridQuery);
const factsHybrid = extractPreflightDeterministicFacts(hybridQuery);
console.log('▶ [TEST 4] Hybrid Claim (72/120 = 60% with Explanation):');
console.log('  Routes to Semantic AI Track (intent === null):', intentHybrid === null);
console.log('  Pre-flight Facts:', factsHybrid);
assert.strictEqual(factsHybrid.length > 0, true, 'Preflight facts extracted');
assert.strictEqual(factsHybrid[0].is_valid, true, 'Must identify that 60% is mathematically valid');
console.log('✅ Test 4 Passed: Model established before semantic explanation.\n');

console.log('==================================================');
console.log('🎉 ALL TWO-STAGE REASONING & ORCHESTRATION TESTS PASSED');
console.log('==================================================\n');
