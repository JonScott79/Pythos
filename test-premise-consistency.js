/**
 * test-premise-consistency.js
 *
 * Comprehensive adversarial regression suite for Premise-Data Consistency & Phenomenon Entailment:
 * 1. Correct premise + matching data (consistent reasoning)
 * 2. Explicit premise contradicted by supplied arithmetic (Program X vs Y admission test)
 * 3. Named phenomenon asserted by user but defining conditions absent (false positive rejection)
 * 4. Named phenomenon not mentioned in prompt but defining conditions actually present (pure data reversal)
 */

const { extractPreflightDeterministicFacts, buildDeterministicResponse } = require('./server/deterministicRouter');
const { extractClaims, runDeterministicVerification } = require('./server/verificationBridge');
const { auditPremiseDataConsistency, auditPhenomenonEntailment } = require('./server/reasoningVerifier');

async function runPremiseConsistencySuite() {
  console.log('====================================================');
  console.log('🔍 PREMISE-DATA CONSISTENCY & PHENOMENON SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  // -------------------------------------------------------------
  // TEST 1: Correct premise + matching data
  // -------------------------------------------------------------
  total++;
  console.log('▶ [TEST 1] Correct Premise + Matching Data');
  const prompt1 = `
In our clinical trial comparing Treatment A and Treatment B:
- Mild Cases: A: 80/100 = 80%, B: 70/100 = 70%
- Severe Cases: A: 60/100 = 60%, B: 40/100 = 40%

Within both groups, Treatment A has the higher recovery rate.
Does this data confirm that Treatment A has the higher recovery rate in both subgroups?
`;
  const facts1 = extractPreflightDeterministicFacts(prompt1);
  const simpsonFact1 = facts1.find(f => f.type === 'SIMPSONS_PARADOX_EVALUATION');

  if (
    simpsonFact1 &&
    simpsonFact1.subgroupDirection === 'A>B' &&
    simpsonFact1.premiseContradiction === null
  ) {
    // Also test through auditPremiseDataConsistency
    const audit1 = await auditPremiseDataConsistency(
      ["Within both groups, Treatment A has the higher recovery rate."],
      [
        { category: "Mild", entity1: "A", val1: 0.80, entity2: "B", val2: 0.70 },
        { category: "Severe", entity1: "A", val1: 0.60, entity2: "B", val2: 0.40 }
      ]
    );

    if (audit1.verified && audit1.status === 'VERIFIED') {
      console.log(`  Premise Confirmed: ${audit1.details}`);
      console.log(`  Subgroup Direction: ${simpsonFact1.subgroupDirection}`);
      console.log('  Status: ✅ PASSED\n');
      passed++;
    } else {
      console.error('  Audit 1 Failed:', audit1);
      console.error('  Status: ❌ FAILED\n');
    }
  } else {
    console.error('  Fact 1 Extraction Failed:', simpsonFact1);
    console.error('  Status: ❌ FAILED\n');
  }

  // -------------------------------------------------------------
  // TEST 2: Explicit premise contradicted by supplied arithmetic (The exact user test)
  // -------------------------------------------------------------
  total++;
  console.log('▶ [TEST 2] Explicit Premise Contradicted by Supplied Arithmetic (Program X vs Program Y)');
  const prompt2 = `
Here is the university admission data:
Engineering:
- Program X: 80/100 = 80%
- Program Y: 70/100 = 70%

Humanities:
- Program X: 20/100 = 20%
- Program Y: 18/30 = 60%

Aggregate:
- Program X: 100/200 = 50%
- Program Y: 88/130 = 67.7%

Within BOTH programs, Program X has the higher admission rate.
Is this a textbook instance of Simpson's paradox?
`;

  const facts2 = extractPreflightDeterministicFacts(prompt2);
  const simpsonFact2 = facts2.find(f => f.type === 'SIMPSONS_PARADOX_EVALUATION');

  if (
    simpsonFact2 &&
    simpsonFact2.premiseContradiction !== null &&
    simpsonFact2.isGenuineParadox === false &&
    simpsonFact2.subgroupDirection === 'MIXED'
  ) {
    console.log(`  Contradiction Detected: ${simpsonFact2.premiseContradiction.details}`);
    console.log(`  Violating Category: ${simpsonFact2.premiseContradiction.violatingCategory}`);
    console.log(`  Simpson's Paradox Result: ${simpsonFact2.isGenuineParadox ? 'PRESENT' : 'ABSENT'}`);

    // Verify through reasoning verifier directly
    const audit2 = await auditPremiseDataConsistency(
      ["Within both programs, Program X has the higher admission rate."],
      [
        { category: "Engineering", entity1: "X", val1: 0.80, entity2: "Y", val2: 0.70 },
        { category: "Humanities", entity1: "X", val1: 0.20, entity2: "Y", val2: 0.60 }
      ]
    );

    // Verify response generator explicitly calls out the contradiction
    const response2 = buildDeterministicResponse({
      type: 'PREFLIGHT_FACTS_FALLBACK',
      facts: facts2
    });

    if (
      !audit2.verified &&
      audit2.status === 'PREMISE_DATA_CONTRADICTION' &&
      response2 &&
      response2.includes('Premise Contradiction') &&
      response2.includes('does NOT demonstrate Simpson\'s paradox')
    ) {
      console.log('  Deterministic Response explains contradiction clearly.');
      console.log('  Status: ✅ PASSED\n');
      passed++;
    } else {
      console.error('  Audit 2 or Response Failed:', { audit2, response2 });
      console.error('  Status: ❌ FAILED\n');
    }
  } else {
    console.error('  Fact 2 Extraction Failed:', simpsonFact2);
    console.error('  Status: ❌ FAILED\n');
  }

  // -------------------------------------------------------------
  // TEST 3: Named phenomenon asserted by user, but defining conditions absent
  // -------------------------------------------------------------
  total++;
  console.log('▶ [TEST 3] Named Phenomenon Asserted by User but Defining Conditions Absent');
  const prompt3 = `
Small stones:
- A: 93/100 = 93%
- B: 87/100 = 87%

Large stones:
- A: 192/300 = 64%
- B: 55/100 = 55%

Aggregate:
- A: 285/400 = 71.25%
- B: 142/200 = 71.00%

This dataset clearly demonstrates Simpson's paradox because the weights are skewed.
`;

  // An assistant claim falsely accepting the user's assertion:
  const falseClaimText = "Yes, this dataset demonstrates Simpson's paradox due to unequal stone distribution.";
  const claims3 = extractClaims(falseClaimText, prompt3);
  const paradoxClaim3 = claims3.find(c => c.claim_type === 'simpsons_paradox');

  if (paradoxClaim3) {
    const verif3 = await runDeterministicVerification(paradoxClaim3);
    if (!verif3.verified && verif3.status === 'FALSE_POSITIVE_PHENOMENON') {
      console.log(`  Intercepted False Positive Claim: Status=${verif3.status}`);
      console.log(`  User Message: ${verif3.user_message}`);
      console.log('  Status: ✅ PASSED\n');
      passed++;
    } else {
      console.error('  Verif 3 Result:', verif3);
      console.error('  Status: ❌ FAILED\n');
    }
  } else {
    console.error('  Failed to extract simpsons_paradox claim for prompt 3');
    console.error('  Status: ❌ FAILED\n');
  }

  // -------------------------------------------------------------
  // TEST 4: Named phenomenon not mentioned in prompt, but defining conditions present
  // -------------------------------------------------------------
  total++;
  console.log('▶ [TEST 4] Named Phenomenon Not Mentioned in Prompt, but Defining Conditions Present');
  const prompt4 = `
Review this medical treatment trial data:
Mild:
- Treatment: 81/87
- Control: 234/270

Severe:
- Treatment: 192/263
- Control: 55/80

Overall:
- Treatment: 273/350
- Control: 289/350

Analyze which treatment is better and explain the aggregated rates.
`;

  const facts4 = extractPreflightDeterministicFacts(prompt4);
  const simpsonFact4 = facts4.find(f => f.type === 'SIMPSONS_PARADOX_EVALUATION');

  if (
    simpsonFact4 &&
    simpsonFact4.isGenuineParadox === true &&
    simpsonFact4.subgroupDirection === 'TREATMENT>CONTROL' &&
    simpsonFact4.overallDirection === 'CONTROL>TREATMENT'
  ) {
    console.log(`  Subgroup Direction: ${simpsonFact4.subgroupDirection}`);
    console.log(`  Aggregate Direction: ${simpsonFact4.overallDirection}`);
    console.log(`  Genuine Reversal Detected: ${simpsonFact4.isGenuineParadox}`);
    console.log('  Status: ✅ PASSED\n');
    passed++;
  } else {
    console.error('  Fact 4 Extraction Failed:', simpsonFact4);
    console.error('  Status: ❌ FAILED\n');
  }

  // -------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------
  console.log('====================================================');
  console.log(`📊 PREMISE CONSISTENCY SUITE: ${passed}/${total} (${Math.round((passed/total)*100)}%)`);
  console.log('====================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

if (require.main === module) {
  runPremiseConsistencySuite().catch(err => {
    console.error('Error running premise consistency tests:', err);
    process.exit(1);
  });
}

module.exports = { runPremiseConsistencySuite };
