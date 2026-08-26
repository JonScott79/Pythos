// test-specialized-router.js
// Independent unit and regression test suite for Pythos Specialized Problem Classifier & Routing Engine.

const assert = require('assert');
const { classifyProblem, DOMAINS, PROTOCOLS } = require('./server/problemClassifier');

console.log('==================================================');
console.log('⚡ TESTING PYTHOS SPECIALIZED PROBLEM ROUTING ENGINE');
console.log('==================================================\n');

// -------------------------------------------------------------
// 1. ARITHMETIC (Pure Calculation)
// -------------------------------------------------------------
const arithQuery = "Calculate 93/100, 87/90, 192/300, 55/80. Return the four percentages only, one per line.";
const cArith = classifyProblem(arithQuery);
console.log('▶ [TEST 1] ARITHMETIC Domain:');
console.log('  Domain:', cArith.problemDomain);
console.log('  Subtype:', cArith.problemSubtype);
console.log('  Confidence:', cArith.confidence);
console.log('  Can Short-Circuit:', cArith.canShortCircuit);
assert.strictEqual(cArith.problemDomain, DOMAINS.ARITHMETIC);
assert.strictEqual(cArith.problemSubtype, 'PURE_CALCULATION');
assert.strictEqual(cArith.confidence, 'high');
assert.strictEqual(cArith.canShortCircuit, true);
console.log('✅ Test 1 Passed: Pure arithmetic routed straight to calculator.\n');

// -------------------------------------------------------------
// 2. ALGEBRA (Linear Equation Isolation)
// -------------------------------------------------------------
const algQuery = "Solve 3x + 5 = 20 for x";
const cAlg = classifyProblem(algQuery);
console.log('▶ [TEST 2] ALGEBRA Domain:');
console.log('  Domain:', cAlg.problemDomain);
console.log('  Subtype:', cAlg.problemSubtype);
console.log('  Confidence:', cAlg.confidence);
assert.strictEqual(cAlg.problemDomain, DOMAINS.ALGEBRA);
assert.strictEqual(cAlg.problemSubtype, 'LINEAR_EQUATION');
assert.strictEqual(cAlg.confidence, 'high');
assert.strictEqual(cAlg.canShortCircuit, true);
console.log('✅ Test 2 Passed: Algebra correctly identified and routed.\n');

// -------------------------------------------------------------
// 3. CALCULUS: CONSTRAINED OPTIMIZATION
// -------------------------------------------------------------
const optQuery = "A farmer has 100 meters of fencing to enclose a rectangular field along a straight river. The river forms one side of the rectangle, so that side does not need fencing. Find the dimensions that maximize the area and the maximum possible area.";
const cOpt = classifyProblem(optQuery);
console.log('▶ [TEST 3] CALCULUS Optimization Domain:');
console.log('  Domain:', cOpt.problemDomain);
console.log('  Subtype:', cOpt.problemSubtype);
console.log('  Knowns:', cOpt.knownQuantities);
console.log('  Assumptions:', cOpt.assumptions);
console.log('  Constraints:', cOpt.constraints);
assert.strictEqual(cOpt.problemDomain, DOMAINS.CALCULUS);
assert.strictEqual(cOpt.problemSubtype, 'CONSTRAINED_OPTIMIZATION');
assert.strictEqual(cOpt.confidence, 'high');
assert.strictEqual(cOpt.constraints.length > 0, true, 'Must identify 3-sided constraint');
assert.strictEqual(cOpt.canShortCircuit, false, 'Requires semantic explanation pass');
console.log('✅ Test 3 Passed: Constrained optimization model established.\n');

// -------------------------------------------------------------
// 4. CALCULUS: DERIVATIVES & INTEGRALS
// -------------------------------------------------------------
const derivQuery = "Find the derivative of f(x) = sin(x^2) * e^(2x)";
const cDeriv = classifyProblem(derivQuery);
console.log('▶ [TEST 4] CALCULUS Derivative Domain:');
console.log('  Domain:', cDeriv.problemDomain);
console.log('  Subtype:', cDeriv.problemSubtype);
assert.strictEqual(cDeriv.problemDomain, DOMAINS.CALCULUS);
assert.strictEqual(cDeriv.problemSubtype, 'DERIVATIVE');
console.log('✅ Test 4 Passed: Derivative correctly classified.\n');

// -------------------------------------------------------------
// 5. PROBABILITY: BAYES' THEOREM (INVERSE CONDITIONAL)
// -------------------------------------------------------------
const bayesQuery = `A factory produces light bulbs from two machines. Machine A produces 70% of the bulbs and has a 2% defect rate. Machine B produces 30% of the bulbs and has a 6% defect rate. A randomly selected bulb is defective. What is the probability that it came from Machine B? Explain the difference between P(defective | Machine B) and P(Machine B | defective).`;
const cBayes = classifyProblem(bayesQuery);
console.log('▶ [TEST 5] PROBABILITY Bayes Domain:');
console.log('  Domain:', cBayes.problemDomain);
console.log('  Subtype:', cBayes.problemSubtype);
console.log('  Protocol Rules Count:', cBayes.specializedProtocol.length);
assert.strictEqual(cBayes.problemDomain, DOMAINS.PROBABILITY);
assert.strictEqual(cBayes.problemSubtype, 'BAYES_INVERSE_PROBABILITY');
assert.strictEqual(cBayes.confidence, 'high');
assert.strictEqual(cBayes.specializedProtocol.some(p => p.includes('distinguish conditional direction')), true);
console.log('✅ Test 5 Passed: Bayes inverse probability protocol established.\n');

// -------------------------------------------------------------
// 6. STATISTICS: SIMPSON'S PARADOX
// -------------------------------------------------------------
const simpsonQuery = "Explain Simpson's Paradox in medical trials where a treatment has higher success in every subgroup but lower aggregate success.";
const cSimpson = classifyProblem(simpsonQuery);
console.log('▶ [TEST 6] STATISTICS Simpson Paradox Domain:');
console.log('  Domain:', cSimpson.problemDomain);
console.log('  Subtype:', cSimpson.problemSubtype);
assert.strictEqual(cSimpson.problemDomain, DOMAINS.STATISTICS);
assert.strictEqual(cSimpson.problemSubtype, 'SIMPSONS_PARADOX');
assert.strictEqual(cSimpson.confidence, 'high');
console.log('✅ Test 6 Passed: Simpson paradox aggregation weighting identified.\n');

// -------------------------------------------------------------
// 7. PHYSICS: CIRCULAR DYNAMICS & CONICAL MOTION
// -------------------------------------------------------------
const circleQuery = "A small sphere of mass M is suspended by a string of length L. The sphere is made to move in a horizontal circle of radius R at a constant speed. The string makes an angle theta with the vertical. A student claims that because no forces point to the center, there is no centripetal force. Audit the student reasoning.";
const cCircle = classifyProblem(circleQuery);
console.log('▶ [TEST 7] PHYSICS Circular Dynamics Domain:');
console.log('  Domain:', cCircle.problemDomain);
console.log('  Subtype:', cCircle.problemSubtype);
console.log('  Constraints:', cCircle.constraints);
assert.strictEqual(cCircle.problemDomain, DOMAINS.PHYSICS);
assert.strictEqual(cCircle.problemSubtype, 'CIRCULAR_DYNAMICS');
assert.strictEqual(cCircle.confidence, 'high');
assert.strictEqual(cCircle.constraints.some(c => c.includes('Sigma Fr = m * v^2 / r')), true);
console.log('✅ Test 7 Passed: Physics circular dynamics model established.\n');

// -------------------------------------------------------------
// 8. PHYSICS: PROJECTILE KINEMATICS
// -------------------------------------------------------------
const projQuery = "A projectile is launched with velocity v0 = 20 m/s at an angle of 30 degrees above horizontal. Find the maximum height and total flight time.";
const cProj = classifyProblem(projQuery);
console.log('▶ [TEST 8] PHYSICS Projectile Kinematics Domain:');
console.log('  Domain:', cProj.problemDomain);
console.log('  Subtype:', cProj.problemSubtype);
console.log('  Knowns:', cProj.knownQuantities);
console.log('  Unknowns:', cProj.unknownQuantities);
assert.strictEqual(cProj.problemDomain, DOMAINS.PHYSICS);
assert.strictEqual(cProj.problemSubtype, 'PROJECTILE_KINEMATICS');
assert.strictEqual(cProj.confidence, 'high');
assert.strictEqual(cProj.knownQuantities.angle, '30 degrees');
console.log('✅ Test 8 Passed: Projectile kinematics model established.\n');

// -------------------------------------------------------------
// 9. CONCEPTUAL / PEDAGOGICAL INQUIRY
// -------------------------------------------------------------
const conceptQuery = "What is the physical meaning of entropy in statistical mechanics?";
const cConcept = classifyProblem(conceptQuery);
console.log('▶ [TEST 9] CONCEPTUAL Domain:');
console.log('  Domain:', cConcept.problemDomain);
console.log('  Subtype:', cConcept.problemSubtype);
assert.strictEqual(cConcept.problemDomain, DOMAINS.CONCEPTUAL);
assert.strictEqual(cConcept.problemSubtype, 'CONCEPTUAL_EXPLANATION');
console.log('✅ Test 9 Passed: Conceptual inquiry classified.\n');

// -------------------------------------------------------------
// 10. UNKNOWN / AMBIGUOUS FALLBACK
// -------------------------------------------------------------
const unknownQuery = "Could you tell me something interesting about the stars today?";
const cUnknown = classifyProblem(unknownQuery);
console.log('▶ [TEST 10] UNKNOWN / GENERAL Fallback:');
console.log('  Domain:', cUnknown.problemDomain);
console.log('  Subtype:', cUnknown.problemSubtype);
console.log('  Confidence:', cUnknown.confidence);
assert.strictEqual(cUnknown.problemDomain, DOMAINS.UNKNOWN);
assert.strictEqual(cUnknown.confidence, 'low');
console.log('✅ Test 10 Passed: Safe fallback to general reasoning for low-confidence queries.\n');

console.log('==================================================');
console.log('🎉 ALL 10/10 SPECIALIZED ROUTER TESTS PASSED (100%)');
console.log('==================================================\n');
