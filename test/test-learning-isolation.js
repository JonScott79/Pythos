/**
 * test-learning-isolation.js
 *
 * P0 Security Test Suite: Multi-Tenant Student Learning Store Isolation.
 * Proves strict cryptographic/UID partitioning across all learning operations:
 * 1. User A stores verified correction.
 * 2. User B queries for relevant corrections -> gets 0 results (User A data not leaked).
 * 3. User B receives NONE of User A's corrections in history.
 * 4. User B stores its own verified correction (different topic).
 * 5. User A queries -> gets only User A's data, zero User B contamination.
 * 6. Concurrent / interleaved requests between User A and User B remain isolated.
 * 7. Unauthenticated request (null/missing/invalid UID) -> denied (fail-closed, returns 0/unauthorized).
 * 8. Clean isolation under repeated conflict detection.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

process.env.NODE_ENV = 'test';

// Resolve service account credentials if present
const credsPath1 = path.resolve(__dirname, '..', 'firebase-credentials', 'lanzar-95ae3-firebase-adminsdk-fbsvc-86e8ea5817.json');
const credsPath2 = path.resolve(__dirname, '..', '..', 'firebase-credentials', 'lanzar-95ae3-firebase-adminsdk-fbsvc-86e8ea5817.json');
const credPath = fs.existsSync(credsPath1) ? credsPath1 : (fs.existsSync(credsPath2) ? credsPath2 : null);
if (credPath && !process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON = fs.readFileSync(credPath, 'utf8');
}

const learningStore = require('../server/learningStore');

async function runIsolationTests() {
  console.log('====================================================');
  console.log('🔒 PYTHOS P0: PER-USER LEARNING STORE ISOLATION TEST');
  console.log('====================================================\n');

  const UID_A = 'student_test_user_alpha_101';
  const UID_B = 'student_test_user_beta_202';

  // Teardown any preexisting test artifacts
  await learningStore.clearStudentLearning(UID_A);
  await learningStore.clearStudentLearning(UID_B);

  // -------------------------------------------------------------
  // TEST 1: Unauthenticated Guardrail (Fail Closed)
  // -------------------------------------------------------------
  console.log('▶ [TEST 1] Missing or invalid UID fails closed');
  const unauthStore = await learningStore.storeVerifiedCorrection(null, {
    topic: 'Probability',
    problem_type: 'Birthday Problem',
    corrected_result: '23 people'
  });
  assert.strictEqual(unauthStore.success, false);
  assert.strictEqual(unauthStore.status, 'unauthorized');

  const unauthRetrieve = await learningStore.retrieveRelevantCorrections(null, 'birthday problem');
  assert.deepStrictEqual(unauthRetrieve, []);

  const unauthHistory = await learningStore.getLearningHistory(null);
  assert.deepStrictEqual(unauthHistory.records, []);
  console.log('  ✓ No UID -> zero storage or retrieval access (fail closed).');

  // -------------------------------------------------------------
  // TEST 2: User A Stores Verified Correction
  // -------------------------------------------------------------
  console.log('▶ [TEST 2] User A stores verified correction');
  const candidateA = {
    topic: 'Probability',
    problem_type: 'Birthday Problem',
    original_error: 'Claimed 24 people for >50% chance.',
    failure_mode: 'Off-by-one boundary condition in complement probability',
    corrected_result: '23 people',
    explanation: 'n=23 gives 50.73% probability of at least one shared birthday.'
  };

  const storeResA = await learningStore.storeVerifiedCorrection(UID_A, candidateA);
  assert.strictEqual(storeResA.success, true);
  assert.strictEqual(storeResA.status, 'verified_and_stored');
  assert.strictEqual(storeResA.record.corrected_result, '23 people');
  console.log('  ✓ User A stored verified correction successfully.');

  // -------------------------------------------------------------
  // TEST 3: User B Retrieval Isolation
  // -------------------------------------------------------------
  console.log('▶ [TEST 3] User B queries for relevant corrections');
  const retrievedB = await learningStore.retrieveRelevantCorrections(UID_B, 'How many people for the birthday problem?');
  assert.strictEqual(retrievedB.length, 0, 'User B must receive 0 records from User A');

  const historyB = await learningStore.getLearningHistory(UID_B);
  assert.strictEqual(historyB.records.length, 0, 'User B history must contain 0 records');
  console.log('  ✓ User B received NONE of User A\'s corrections.');

  // -------------------------------------------------------------
  // TEST 4: User B Stores Different Correction
  // -------------------------------------------------------------
  console.log('▶ [TEST 4] User B stores its own correction');
  const candidateB = {
    topic: 'Algebra',
    problem_type: 'Linear Systems',
    original_error: 'Computed 2x = 10 -> x = 4',
    failure_mode: 'Division arithmetic slip',
    corrected_result: '5',
    explanation: '10 / 2 = 5',
    verification_expression: '10 / 2',
    expected_value: 5
  };

  const storeResB = await learningStore.storeVerifiedCorrection(UID_B, candidateB);
  assert.strictEqual(storeResB.success, true);
  assert.strictEqual(storeResB.status, 'verified_and_stored');
  console.log('  ✓ User B stored its own correction.');

  // -------------------------------------------------------------
  // TEST 5: User A and User B Boundary Check
  // -------------------------------------------------------------
  console.log('▶ [TEST 5] Independent verification of User A and User B stores');
  const historyA = await learningStore.getLearningHistory(UID_A);
  assert.strictEqual(historyA.records.length, 1);
  assert.strictEqual(historyA.records[0].problem_type, 'Birthday Problem');

  const historyBUpdated = await learningStore.getLearningHistory(UID_B);
  assert.strictEqual(historyBUpdated.records.length, 1);
  assert.strictEqual(historyBUpdated.records[0].problem_type, 'Linear Systems');

  const retrievedA = await learningStore.retrieveRelevantCorrections(UID_A, 'Solving a linear systems problem');
  assert.strictEqual(retrievedA.length, 0, 'User A should NOT see User B linear systems lesson');
  console.log('  ✓ User A receives ONLY User A data; User B receives ONLY User B data.');

  // -------------------------------------------------------------
  // TEST 6: Concurrent / Interleaved Requests
  // -------------------------------------------------------------
  console.log('▶ [TEST 6] Concurrent interleaved operations');
  const ops = await Promise.all([
    learningStore.retrieveRelevantCorrections(UID_A, 'birthday problem'),
    learningStore.retrieveRelevantCorrections(UID_B, 'linear systems'),
    learningStore.retrieveRelevantCorrections(UID_A, 'linear systems'),
    learningStore.retrieveRelevantCorrections(UID_B, 'birthday problem')
  ]);

  assert.strictEqual(ops[0].length, 1, 'User A got A\'s birthday problem');
  assert.strictEqual(ops[1].length, 1, 'User B got B\'s linear systems');
  assert.strictEqual(ops[2].length, 0, 'User A got zero B data under concurrency');
  assert.strictEqual(ops[3].length, 0, 'User B got zero A data under concurrency');
  console.log('  ✓ Zero cross-user data leakage under interleaved asynchronous operations.');

  // -------------------------------------------------------------
  // TEST 7: Conflict Isolation
  // -------------------------------------------------------------
  console.log('▶ [TEST 7] Conflict detection is user-partitioned');
  // Candidate conflicting with User A's record
  const conflictCand = {
    topic: 'Probability',
    problem_type: 'Birthday Problem',
    original_error: 'Claimed 23',
    failure_mode: 'Contradiction',
    corrected_result: '50 people' // Direct conflict with '23 people'
  };

  // User B submitting this does NOT trigger conflict with User A because User B has no Birthday Problem record
  const bConflictCheck = await learningStore.storeVerifiedCorrection(UID_B, conflictCand);
  assert.notStrictEqual(bConflictCheck.status, 'conflict_flagged', 'User B should not conflict with User A\'s records');

  // User A submitting this DOES trigger conflict with User A's own record
  const aConflictCheck = await learningStore.storeVerifiedCorrection(UID_A, conflictCand);
  assert.strictEqual(aConflictCheck.status, 'conflict_flagged', 'User A conflicts with User A\'s own record');
  console.log('  ✓ Conflict detection is partitioned per student UID.');

  // Cleanup
  await learningStore.clearStudentLearning(UID_A);
  await learningStore.clearStudentLearning(UID_B);

  console.log('\n====================================================');
  console.log('✅ ALL P0 LEARNING STORE ISOLATION TESTS PASSED');
  console.log('====================================================');
}

runIsolationTests().catch(err => {
  console.error('\n❌ LEARNING STORE ISOLATION TEST FAILED:', err);
  process.exit(1);
});
