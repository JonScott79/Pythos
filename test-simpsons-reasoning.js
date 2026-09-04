/**
 * test-simpsons-reasoning.js
 *
 * Dedicated regression test suite for Simpson's Paradox & Named-Phenomenon Reasoning.
 *
 * Validates:
 * Case A: User's false-positive dataset (Stone A vs Stone B: 93% vs 87%, 64% vs 55%, 71.25% vs 71.00%)
 *         -> No reversal -> MUST NOT identify Simpson's paradox.
 * Case B: Genuine Simpson's paradox dataset with an actual reversal (Charig kidney stone data)
 *         -> Reversal occurs -> MUST identify Simpson's paradox.
 * Case C: Skewed subgroup distributions/weights (1000 vs 100) with no reversal
 *         -> Severe enabling conditions present, but no reversal -> MUST NOT identify Simpson's paradox.
 * Case D: Reversal context vs Phenomenon instantiation:
 *         -> Distinguishes between enabling conditions and defining conditions.
 *
 * Also tests:
 * - Deterministic router preflight fact extraction for subgroup comparative datasets.
 * - Reasoning verifier auditPhenomenonEntailment general reasoning layer.
 * - Verification bridge claim extraction for false-positive phenomenon claims.
 */

const { extractPreflightDeterministicFacts } = require('./server/deterministicRouter');
const { extractClaims, runDeterministicVerification } = require('./server/verificationBridge');
const { auditPhenomenonEntailment } = require('./server/reasoningVerifier');

async function runTests() {
  console.log('==================================================');
  console.log('⚡ SIMPSON\'S PARADOX & PHENOMENON REASONING SUITE');
  console.log('==================================================\n');

  let passed = 0;
  let total = 0;

  // -------------------------------------------------------------
  // TEST 1: Case A - False Positive Stone Dataset Preflight Extraction
  // -------------------------------------------------------------
  total++;
  console.log('▶ [TEST 1] Case A: Stone Dataset Preflight Ground Truth Extraction (No Reversal)');
  const promptA = `
Small stones:
- A: 93/100 = 93%
- B: 87/100 = 87%

Large stones:
- A: 192/300 = 64%
- B: 55/100 = 55%

Aggregate:
- A: 285/400 = 71.25%
- B: 142/200 = 71.00%

Does this dataset demonstrate Simpson's paradox?
`;

  const factsA = extractPreflightDeterministicFacts(promptA);
  const simpsonFactA = factsA.find(f => f.type === 'SIMPSONS_PARADOX_EVALUATION');

  if (
    simpsonFactA &&
    simpsonFactA.isGenuineParadox === false &&
    simpsonFactA.subgroupDirection === 'A>B' &&
    simpsonFactA.overallDirection === 'A>B'
  ) {
    console.log(`  Subgroup Direction: ${simpsonFactA.subgroupDirection}`);
    console.log(`  Aggregate Direction: ${simpsonFactA.overallDirection}`);
    console.log(`  Genuine Paradox? ${simpsonFactA.isGenuineParadox}`);
    console.log('  Status: ✅ PASSED\n');
    passed++;
  } else {
    console.error('  Extracted Facts:', simpsonFactA);
    console.error('  Status: ❌ FAILED\n');
  }

  // -------------------------------------------------------------
  // TEST 2: Case B - Genuine Simpson's Paradox Preflight Extraction
  // -------------------------------------------------------------
  total++;
  console.log('▶ [TEST 2] Case B: Genuine Simpson\'s Paradox Dataset Preflight Extraction (Actual Reversal)');
  const promptB = `
Kidney Stones Treatment:
Small stones:
- A: 81/87
- B: 234/270

Large stones:
- A: 192/263
- B: 55/80

Aggregate:
- A: 273/350
- B: 289/350

Explain whether this exhibits Simpson's paradox.
`;

  const factsB = extractPreflightDeterministicFacts(promptB);
  const simpsonFactB = factsB.find(f => f.type === 'SIMPSONS_PARADOX_EVALUATION');

  if (
    simpsonFactB &&
    simpsonFactB.isGenuineParadox === true &&
    simpsonFactB.subgroupDirection === 'A>B' &&
    simpsonFactB.overallDirection === 'B>A'
  ) {
    console.log(`  Subgroup Direction: ${simpsonFactB.subgroupDirection}`);
    console.log(`  Aggregate Direction: ${simpsonFactB.overallDirection}`);
    console.log(`  Genuine Paradox? ${simpsonFactB.isGenuineParadox}`);
    console.log('  Status: ✅ PASSED\n');
    passed++;
  } else {
    console.error('  Extracted Facts:', simpsonFactB);
    console.error('  Status: ❌ FAILED\n');
  }

  // -------------------------------------------------------------
  // TEST 3: Verification Bridge Catching False-Positive Assistant Claim on Case A
  // -------------------------------------------------------------
  total++;
  console.log('▶ [TEST 3] Verification Bridge: Intercepts False-Positive Paradox Claim on Case A');
  const falsePositiveResponse = "Yes, this dataset demonstrates Simpson's paradox because the weighted averages could flip the trend.";
  const claims = extractClaims(falsePositiveResponse, promptA);
  const paradoxClaim = claims.find(c => c.claim_type === 'simpsons_paradox');

  if (!paradoxClaim) {
    console.error('  Failed to extract simpsons_paradox claim from assistant text');
    console.error('  Status: ❌ FAILED\n');
  } else {
    const verif = await runDeterministicVerification(paradoxClaim);
    if (!verif.verified && verif.status === 'FALSE_POSITIVE_PHENOMENON') {
      console.log(`  Verification Status: ${verif.status}`);
      console.log(`  Reason: ${verif.reason}`);
      console.log('  Status: ✅ PASSED\n');
      passed++;
    } else {
      console.error('  Verification Result:', verif);
      console.error('  Status: ❌ FAILED\n');
    }
  }

  // -------------------------------------------------------------
  // TEST 4: Case C - Heavy Distribution Imbalance Without Reversal
  // -------------------------------------------------------------
  total++;
  console.log('▶ [TEST 4] Case C: Severe Weight Asymmetry (1000 vs 100) Without Reversal');
  const promptC = `
Department 1:
- A: 900/1000
- B: 80/100

Department 2:
- A: 50/100
- B: 400/1000

Aggregate:
- A: 950/1100
- B: 480/1100

Explain whether this demonstrates Simpson's paradox.
`;

  const factsC = extractPreflightDeterministicFacts(promptC);
  const simpsonFactC = factsC.find(f => f.type === 'SIMPSONS_PARADOX_EVALUATION');

  if (
    simpsonFactC &&
    simpsonFactC.isGenuineParadox === false &&
    simpsonFactC.subgroupDirection === 'A>B' &&
    simpsonFactC.overallDirection === 'A>B'
  ) {
    console.log(`  Subgroup Direction: ${simpsonFactC.subgroupDirection}`);
    console.log(`  Aggregate Direction: ${simpsonFactC.overallDirection}`);
    console.log(`  Genuine Paradox? ${simpsonFactC.isGenuineParadox}`);
    console.log('  Status: ✅ PASSED\n');
    passed++;
  } else {
    console.error('  Extracted Facts:', simpsonFactC);
    console.error('  Status: ❌ FAILED\n');
  }

  // -------------------------------------------------------------
  // TEST 5: Case D - General Reasoning Layer auditPhenomenonEntailment
  // -------------------------------------------------------------
  total++;
  console.log('▶ [TEST 5] Case D: General Reasoning Verifier Layer (auditPhenomenonEntailment)');

  // D1: Claimed present, enabling met, but defining NOT met -> FALSE_POSITIVE_PHENOMENON
  const d1 = await auditPhenomenonEntailment("Simpson's paradox", true, false, true, "Unequal weights present, but no direction flip.");
  // D2: Claimed present, enabling met, and defining met -> VERIFIED
  const d2 = await auditPhenomenonEntailment("Simpson's paradox", true, true, true, "Actual reversal observed.");
  // D3: Claimed absent, enabling met, defining NOT met -> VERIFIED
  const d3 = await auditPhenomenonEntailment("Simpson's paradox", true, false, false, "Correctly stated no paradox.");

  if (
    !d1.verified && d1.status === 'FALSE_POSITIVE_PHENOMENON' &&
    d2.verified && d2.status === 'VERIFIED' &&
    d3.verified && d3.status === 'VERIFIED'
  ) {
    console.log(`  D1 (False-positive trap): ${d1.status} (Verified=${d1.verified})`);
    console.log(`  D2 (True phenomenon): ${d2.status} (Verified=${d2.verified})`);
    console.log(`  D3 (Correct absence): ${d3.status} (Verified=${d3.verified})`);
    console.log('  Status: ✅ PASSED\n');
    passed++;
  } else {
    console.error('  D1 Result:', d1);
    console.error('  D2 Result:', d2);
    console.error('  D3 Result:', d3);
    console.error('  Status: ❌ FAILED\n');
  }

  console.log('==================================================');
  console.log(`📊 REASONING SUITE SUMMARY: ${passed}/${total} (${Math.round((passed/total)*100)}%)`);
  console.log('==================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Error running tests:', err);
  process.exit(1);
});
