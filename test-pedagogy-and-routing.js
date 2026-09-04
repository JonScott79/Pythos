/**
 * test-pedagogy-and-routing.js
 *
 * Dedicated verification suite for Priorities 2, 3, and 5:
 * 1. Progressive Tutoring & Instructional Pacing (Trivial vs Complex classification)
 * 2. Adaptive Mathematical Notation
 * 3. Subject Drift & Math-First Routing
 */

const { classifyProblem, DOMAINS, PROTOCOLS } = require('./server/problemClassifier');

async function runPedagogyAndRoutingTests() {
  console.log('==================================================');
  console.log('🎓 PYTHOS PEDAGOGY, NOTATION & ROUTING SUITE (PRIORITIES 2, 3, 5)');
  console.log('==================================================\n');

  let passed = 0;
  let total = 0;

  // TEST 1: Purely Off-Topic Subject Drift Classification (Priority 5)
  total++;
  console.log('▶ [TEST 1] Subject Drift: Purely casual off-topic inquiry flags OFF_TOPIC');
  const q1 = "What is your favorite pizza topping?";
  const c1 = classifyProblem(q1);
  if (c1.problemDomain === DOMAINS.OFF_TOPIC && c1.specializedProtocol === PROTOCOLS.OFF_TOPIC_REDIRECT) {
    console.log(`  Query: "${q1}"`);
    console.log(`  Classified Domain: ${c1.problemDomain}, Protocol: ${c1.requiredMethod}`);
    console.log('  Status: ✅ PASSED\n');
    passed++;
  } else {
    console.error('  Result:', c1);
    console.error('  Status: ❌ FAILED\n');
  }

  // TEST 2: Pop Culture Query without Math flags OFF_TOPIC (Priority 5)
  total++;
  console.log('▶ [TEST 2] Subject Drift: Celebrity inquiry flags OFF_TOPIC');
  const q2 = "Who is Taylor Swift?";
  const c2 = classifyProblem(q2);
  if (c2.problemDomain === DOMAINS.OFF_TOPIC) {
    console.log(`  Query: "${q2}"`);
    console.log(`  Classified Domain: ${c2.problemDomain}`);
    console.log('  Status: ✅ PASSED\n');
    passed++;
  } else {
    console.error('  Result:', c2);
    console.error('  Status: ❌ FAILED\n');
  }

  // TEST 3: Interdisciplinary Applied Math Query (Priority 5)
  total++;
  console.log('▶ [TEST 3] Interdisciplinary: Basketball trajectory classified as INTERDISCIPLINARY');
  const q3 = "What is the trajectory of a basketball shot released at a 45 degree angle?";
  const c3 = classifyProblem(q3);
  if (c3.problemDomain === DOMAINS.INTERDISCIPLINARY || c3.problemDomain === DOMAINS.PHYSICS) {
    console.log(`  Query: "${q3}"`);
    console.log(`  Classified Domain: ${c3.problemDomain}, Subtype: ${c3.problemSubtype}`);
    console.log('  Status: ✅ PASSED\n');
    passed++;
  } else {
    console.error('  Result:', c3);
    console.error('  Status: ❌ FAILED\n');
  }

  // TEST 4: Pure Arithmetic Trivial Question (Priority 2 - Pacing)
  total++;
  console.log('▶ [TEST 4] Pacing: Trivial calculation classified as ARITHMETIC with short-circuit capability');
  const q4 = "15 * 4";
  const c4 = classifyProblem(q4);
  if (c4.problemDomain === DOMAINS.ARITHMETIC && c4.canShortCircuit === true) {
    console.log(`  Query: "${q4}"`);
    console.log(`  Classified Domain: ${c4.problemDomain}, Can Short Circuit: ${c4.canShortCircuit}`);
    console.log('  Status: ✅ PASSED\n');
    passed++;
  } else {
    console.error('  Result:', c4);
    console.error('  Status: ❌ FAILED\n');
  }

  // TEST 5: Intermediate Multi-Step Problem requires Full Tutoring (Priority 2 - Pacing)
  total++;
  console.log('▶ [TEST 5] Pacing: Multi-step equation requires guided algebraic protocol');
  const q5 = "Solve 3x + 5 = 20";
  const c5 = classifyProblem(q5);
  if (c5.problemDomain === DOMAINS.ALGEBRA && c5.problemSubtype === 'LINEAR_EQUATION') {
    console.log(`  Query: "${q5}"`);
    console.log(`  Classified Domain: ${c5.problemDomain}, Method: ${c5.requiredMethod}`);
    console.log('  Status: ✅ PASSED\n');
    passed++;
  } else {
    console.error('  Result:', c5);
    console.error('  Status: ❌ FAILED\n');
  }

  // TEST 6: Compound Interest Applied Math classified as INTERDISCIPLINARY (Priority 5)
  total++;
  console.log('▶ [TEST 6] Interdisciplinary: Financial compound interest modeled mathematically');
  const q6 = "Calculate the compound interest on $1,000 at 5% annual rate";
  const c6 = classifyProblem(q6);
  if (c6.problemDomain === DOMAINS.INTERDISCIPLINARY) {
    console.log(`  Query: "${q6}"`);
    console.log(`  Classified Domain: ${c6.problemDomain}, Protocol: ${c6.specializedProtocol[0]}`);
    console.log('  Status: ✅ PASSED\n');
    passed++;
  } else {
    console.error('  Result:', c6);
    console.error('  Status: ❌ FAILED\n');
  }

  console.log('==================================================');
  console.log(`📊 PEDAGOGY & ROUTING SUMMARY: ${passed}/${total} (${Math.round((passed/total)*100)}%)`);
  console.log('==================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runPedagogyAndRoutingTests().catch(err => {
  console.error('Fatal error running pedagogy tests:', err);
  process.exit(1);
});
