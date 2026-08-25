/**
 * Test Suite for Pythos Verified Mistake Learning System
 * 
 * Verifies:
 * TEST A — Valid correction verification & storage (Birthday problem n=23)
 * TEST B — False student correction rejection (Student claims n=17 -> rejected, not learned)
 * TEST C — Future recurrence context retrieval on similar problems
 * TEST D — Unrelated problem lesson isolation (Physics query does not inject probability lesson)
 * TEST E — Conflict handling (Candidate contradicting existing record is flagged, not overwritten)
 * TEST F — Failure mode & reasoning auditability (Verifies failure_mode and explanation fields)
 */

const API_BASE = 'http://localhost:3006';
const learningStore = require('./server/learningStore');

async function runLearningTests() {
  console.log('==================================================');
  console.log('🧠 PYTHOS VERIFIED MISTAKE LEARNING SYSTEM TESTS');
  console.log('==================================================\n');

  const results = [];

  // =========================================================================
  // TEST A: Valid Correction Verification & Storage
  // =========================================================================
  console.log('▶ [TEST A] Testing Valid Correction Verification (Birthday Problem n=23)...');
  const validCandidate = {
    topic: 'Probability',
    problem_type: 'Birthday Problem',
    original_error: 'Claimed 24 people were required for probability > 50%.',
    failure_mode: 'Off-by-one threshold interpretation when solving probability >= 0.5',
    corrected_result: '23 people',
    explanation: 'At n=23, the probability of at least one shared birthday is approximately 50.73%, which exceeds 50%. At n=22, P ≈ 47.57%.'
  };

  const storeRes = learningStore.storeVerifiedCorrection(validCandidate);
  const testAPassed = storeRes.success === true && storeRes.status === 'verified_and_stored' && storeRes.record.confidence === 'verified';
  console.log(`Store Result:`, storeRes.status);
  console.log(`Result: ${testAPassed ? '✅ PASSED' : '❌ FAILED'}\n`);
  results.push({ name: 'TEST A: Valid Correction Storage', passed: testAPassed });

  // =========================================================================
  // TEST B: False Student Correction Rejection
  // =========================================================================
  console.log('▶ [TEST B] Testing False Student Correction Rejection (Student claims n=17)...');
  const falseCandidate = {
    topic: 'Probability',
    problem_type: 'Birthday Problem',
    original_error: 'Claimed 23 people.',
    failure_mode: 'Student claiming 17 is enough.',
    corrected_result: '17 people',
    explanation: 'Student insists 17 people exceed 50% probability.'
  };

  const falseRes = learningStore.storeVerifiedCorrection(falseCandidate);
  const testBPassed = falseRes.success === false && (falseRes.status === 'rejected' || falseRes.status === 'conflict_flagged');
  console.log(`Store Result (Expected rejection or conflict flag):`, falseRes.status, `(${falseRes.reason || falseRes.message})`);
  console.log(`Result: ${testBPassed ? '✅ PASSED' : '❌ FAILED'}\n`);
  results.push({ name: 'TEST B: False Correction Rejection', passed: testBPassed });

  // =========================================================================
  // TEST C: Future Recurrence Context Retrieval
  // =========================================================================
  console.log('▶ [TEST C] Testing Context Retrieval on Similar Problem...');
  const retrieved = learningStore.retrieveRelevantCorrections('What is the probability of shared birthdays in a room of people?');
  const testCPassed = Array.isArray(retrieved) && retrieved.length > 0 && retrieved.some(r => r.problem_type === 'Birthday Problem');
  console.log(`Retrieved ${retrieved.length} relevant verified lessons:`, retrieved.map(r => r.failure_mode));
  console.log(`Result: ${testCPassed ? '✅ PASSED' : '❌ FAILED'}\n`);
  results.push({ name: 'TEST C: Future Recurrence Retrieval', passed: testCPassed });

  // =========================================================================
  // TEST D: Unrelated Problem Isolation
  // =========================================================================
  console.log('▶ [TEST D] Testing Isolation on Unrelated Problem (Physics Kinematics)...');
  const physicsRetrieved = learningStore.retrieveRelevantCorrections('A ball is dropped from a height of 20 meters. Find the time to hit the ground.');
  const testDPassed = Array.isArray(physicsRetrieved) && physicsRetrieved.length === 0;
  console.log(`Retrieved lessons for physics query: ${physicsRetrieved.length} (Expected: 0)`);
  console.log(`Result: ${testDPassed ? '✅ PASSED' : '❌ FAILED'}\n`);
  results.push({ name: 'TEST D: Unrelated Problem Isolation', passed: testDPassed });

  // =========================================================================
  // TEST E: Conflicting Correction Handling (No Silent Overwrite)
  // =========================================================================
  console.log('▶ [TEST E] Testing Conflict Handling on Contradictory Claim...');
  const conflictCandidate = {
    topic: 'Probability',
    problem_type: 'Birthday Problem',
    original_error: 'Old error',
    failure_mode: 'Contradictory claim',
    corrected_result: '25 people',
    explanation: 'Someone claims 25 people',
    verification_method: 'unverified_manual',
    confidence: 'verified' // Simulated external flag attempting to overwrite
  };

  const conflictRes = learningStore.storeVerifiedCorrection(conflictCandidate);
  const data = learningStore.getLearningHistory();
  const existingUnchanged = data.records.find(r => r.problem_type === 'Birthday Problem').corrected_result === '23 people';
  const conflictLogged = data.conflicts && data.conflicts.length > 0;
  const testEPassed = conflictRes.status === 'conflict_flagged' && existingUnchanged && conflictLogged;

  console.log(`Conflict Result:`, conflictRes.status);
  console.log(`Existing record preserved: ${existingUnchanged}, Conflict logged: ${conflictLogged}`);
  console.log(`Result: ${testEPassed ? '✅ PASSED' : '❌ FAILED'}\n`);
  results.push({ name: 'TEST E: Conflicting Correction Protection', passed: testEPassed });

  // =========================================================================
  // TEST F: Failure Mode & Reasoning Auditability
  // =========================================================================
  console.log('▶ [TEST F] Testing Failure Mode & Reason Schema Verification...');
  const history = learningStore.getLearningHistory();
  const sampleRecord = history.records[0];
  const testFPassed = sampleRecord &&
                      typeof sampleRecord.failure_mode === 'string' && sampleRecord.failure_mode.length > 10 &&
                      typeof sampleRecord.explanation === 'string' && sampleRecord.explanation.length > 10 &&
                      typeof sampleRecord.verification_method === 'string' &&
                      typeof sampleRecord.version === 'number' &&
                      typeof sampleRecord.created_at === 'string';

  console.log(`Record Schema Sample:`, {
    topic: sampleRecord.topic,
    failure_mode: sampleRecord.failure_mode,
    explanation: sampleRecord.explanation,
    verification_method: sampleRecord.verification_method,
    version: sampleRecord.version
  });
  console.log(`Result: ${testFPassed ? '✅ PASSED' : '❌ FAILED'}\n`);
  results.push({ name: 'TEST F: Reason vs Answer Schema Audit', passed: testFPassed });

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log('==================================================');
  console.log('📊 PYTHOS VERIFIED LEARNING TEST SUMMARY');
  console.log('==================================================');
  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  results.forEach((r, idx) => {
    console.log(`[${r.passed ? 'PASS' : 'FAIL'}] ${r.name}`);
  });
  console.log(`\nOverall: ${passed}/${total} (${Math.round((passed / total) * 100)}%)\n`);

  if (passed !== total) {
    process.exit(1);
  }
}

runLearningTests();
