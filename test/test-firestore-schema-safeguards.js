/**
 * test/test-firestore-schema-safeguards.js
 *
 * Pythos Milestone 2.4: Firestore Schema Safeguards Verification Suite (LOW-01)
 *
 * Verifies:
 * 1. Explicit schema validation and strict field allowlists for pythos_chats documents.
 * 2. Type constraints, length checks, and oversized payload rejection (> 1 MB).
 * 3. User ownership and document path validation (users/{uid}/pythos_chats).
 * 4. Protection against unexpected fields and malformed payloads in learning records and conflicts.
 * 5. Integration of validation into learningStore.storeVerifiedCorrection().
 * 6. Static and logical verification of firestore.rules constraints.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  validateDocumentPathOwnership,
  validateChatDocument,
  validateLearningDocument,
  MAX_CHAT_DOC_BYTES,
  MAX_LEARNING_DOC_BYTES,
  MAX_CHAT_TITLE_LENGTH,
  MAX_MESSAGES_COUNT,
  MAX_MESSAGE_CONTENT_LENGTH
} = require('../server/firestoreSchemaValidator');

const learningStore = require('../server/learningStore');

async function runTests() {
  console.log('======================================================================');
  console.log('PYTHOS MILESTONE 2.4: FIRESTORE SCHEMA SAFEGUARDS SUITE (LOW-01)');
  console.log('======================================================================\n');

  let passed = 0;
  let total = 0;

  async function test(name, fn) {
    total++;
    try {
      await fn();
      console.log(`  ✓ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ [FAIL] ${name}`);
      console.error(`    ${err.message}`);
      if (err.stack) console.error(err.stack);
      process.exitCode = 1;
    }
  }

  // -------------------------------------------------------------
  // 1. Path Ownership & Authorization Validation
  // -------------------------------------------------------------
  console.log('--- 1. Document Path Ownership & Authorization ---');

  await test('validateDocumentPathOwnership accepts matching authenticated user paths', async () => {
    const valid = validateDocumentPathOwnership('users/student_abc123/pythos_chats/chat_xyz', 'student_abc123');
    assert.strictEqual(valid.valid, true);

    const validLearning = validateDocumentPathOwnership('users/usr_456/pythos_learning/learn_789', 'usr_456');
    assert.strictEqual(validLearning.valid, true);
  });

  await test('validateDocumentPathOwnership rejects mismatched or forged user paths', async () => {
    const mismatched = validateDocumentPathOwnership('users/victim_user/pythos_chats/chat_xyz', 'attacker_user');
    assert.strictEqual(mismatched.valid, false);
    assert.ok(mismatched.error.includes('Unauthorized document path access'));

    const invalidPrefix = validateDocumentPathOwnership('accounts/acc_1/pythos_chats/chat_xyz', 'attacker_user');
    assert.strictEqual(invalidPrefix.valid, false);
  });

  // -------------------------------------------------------------
  // 2. Chat Document Schema Validation (pythos_chats)
  // -------------------------------------------------------------
  console.log('\n--- 2. pythos_chats Schema Validation ---');

  await test('validateChatDocument accepts valid chat payloads', async () => {
    const validChat = {
      title: 'Derivatives of Polynomials',
      timestamp: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [
        { role: 'user', content: 'What is the derivative of x^3?' },
        { role: 'assistant', content: 'The derivative is $3x^2$.' }
      ]
    };
    const res = validateChatDocument(validChat, {
      path: 'users/student_1/pythos_chats/chat_1',
      uid: 'student_1'
    });
    assert.strictEqual(res.valid, true, `Expected valid, got errors: ${res.errors.join(', ')}`);
  });

  await test('validateChatDocument rejects unexpected/unauthorized fields (field allowlist)', async () => {
    const docWithRogueFields = {
      title: 'Valid Title',
      messages: [{ role: 'user', content: 'Hello' }],
      isAdmin: true,
      privilegedRole: 'system_admin',
      maliciousScript: '<script>alert(1)</script>'
    };
    const res = validateChatDocument(docWithRogueFields);
    assert.strictEqual(res.valid, false);
    assert.ok(res.errors.some(e => e.includes('isAdmin')), 'Must reject isAdmin field');
    assert.ok(res.errors.some(e => e.includes('privilegedRole')), 'Must reject privilegedRole field');
    assert.ok(res.errors.some(e => e.includes('maliciousScript')), 'Must reject maliciousScript field');
  });

  await test('validateChatDocument rejects invalid or missing title', async () => {
    const missingTitle = { messages: [] };
    assert.strictEqual(validateChatDocument(missingTitle).valid, false);

    const emptyTitle = { title: '   ', messages: [] };
    assert.strictEqual(validateChatDocument(emptyTitle).valid, false);

    const oversizedTitle = { title: 'A'.repeat(MAX_CHAT_TITLE_LENGTH + 1), messages: [] };
    const res = validateChatDocument(oversizedTitle);
    assert.strictEqual(res.valid, false);
    assert.ok(res.errors.some(e => e.includes('maximum allowable length')));
  });

  await test('validateChatDocument rejects malformed messages and invalid message roles', async () => {
    const invalidRole = {
      title: 'Test',
      messages: [{ role: 'super_admin_bot', content: 'Injected' }]
    };
    const res = validateChatDocument(invalidRole);
    assert.strictEqual(res.valid, false);
    assert.ok(res.errors.some(e => e.includes('invalid role')));

    const messageWithUnexpectedField = {
      title: 'Test',
      messages: [{ role: 'user', content: 'Hi', injectCredentials: 'secret_token' }]
    };
    const res2 = validateChatDocument(messageWithUnexpectedField);
    assert.strictEqual(res2.valid, false);
    assert.ok(res2.errors.some(e => e.includes('injectCredentials')));
  });

  await test('validateChatDocument rejects oversized payloads (> 1MB)', async () => {
    const hugeContent = 'x'.repeat(1024 * 1024 + 100);
    const oversizedChat = {
      title: 'Massive Payload Test',
      messages: [{ role: 'user', content: hugeContent }]
    };
    const res = validateChatDocument(oversizedChat);
    assert.strictEqual(res.valid, false);
    assert.ok(res.errors.some(e => e.includes('exceeds maximum allowable limit')));
  });

  // -------------------------------------------------------------
  // 3. Learning Document Schema Validation (learning_data / pythos_learning)
  // -------------------------------------------------------------
  console.log('\n--- 3. Learning Document Schema Validation ---');

  await test('validateLearningDocument accepts valid verified learning record', async () => {
    const validRecord = {
      type: 'record',
      topic: 'Calculus',
      problem_type: 'chain_rule',
      original_error: 'Forgot inner derivative',
      failure_mode: 'Forgot to multiply by inner derivative g\'(x)',
      corrected_result: 'd/dx[sin(x^2)] = 2x*cos(x^2)',
      explanation: 'Chain rule requires multiplying the derivative of the outer function by the derivative of the inner function.',
      verification_method: 'deterministic_symbolic_check',
      confidence: 'verified',
      version: 1
    };
    const res = validateLearningDocument(validRecord, {
      path: 'users/student_9/pythos_learning/record_1',
      uid: 'student_9'
    });
    assert.strictEqual(res.valid, true, `Expected valid, got errors: ${res.errors.join(', ')}`);
  });

  await test('validateLearningDocument rejects learning record with unexpected fields', async () => {
    const docWithExtra = {
      type: 'record',
      topic: 'Algebra',
      problem_type: 'quadratic',
      corrected_result: 'x = 3',
      explanation: 'Factoring',
      verification_method: 'symbolic',
      confidence: 'verified',
      version: 1,
      unapprovedKey: 'malicious_override',
      autoBypassVerification: true
    };
    const res = validateLearningDocument(docWithExtra);
    assert.strictEqual(res.valid, false);
    assert.ok(res.errors.some(e => e.includes('unapprovedKey')));
    assert.ok(res.errors.some(e => e.includes('autoBypassVerification')));
  });

  await test('validateLearningDocument rejects missing required fields and invalid types', async () => {
    const missingFields = {
      type: 'record',
      topic: 'Algebra'
      // missing problem_type, corrected_result, etc.
    };
    const res = validateLearningDocument(missingFields);
    assert.strictEqual(res.valid, false);
    assert.ok(res.errors.some(e => e.includes('problem_type')));
    assert.ok(res.errors.some(e => e.includes('corrected_result')));

    const invalidVersion = {
      type: 'record',
      topic: 'Algebra',
      problem_type: 'linear',
      corrected_result: 'x=1',
      explanation: 'test',
      version: -5
    };
    const res2 = validateLearningDocument(invalidVersion);
    assert.strictEqual(res2.valid, false);
    assert.ok(res2.errors.some(e => e.includes('version')));
  });

  await test('validateLearningDocument accepts valid conflict record and rejects malformed conflict', async () => {
    const validConflict = {
      type: 'conflict',
      existing_id: 'learn_123',
      candidate_data: { topic: 'Probability', corrected_result: '23' },
      flagged_at: new Date().toISOString(),
      status: 'pending_review',
      reason: 'Contradiction with existing verified record'
    };
    assert.strictEqual(validateLearningDocument(validConflict).valid, true);

    const malformedConflict = {
      type: 'conflict',
      // missing existing_id and candidate_data
      reason: 'Conflict occurred'
    };
    const res = validateLearningDocument(malformedConflict);
    assert.strictEqual(res.valid, false);
    assert.ok(res.errors.some(e => e.includes('existing_id')));
    assert.ok(res.errors.some(e => e.includes('candidate_data')));
  });

  // -------------------------------------------------------------
  // 4. learningStore Integration Enforcement
  // -------------------------------------------------------------
  console.log('\n--- 4. learningStore Schema Enforcement Integration ---');

  await test('learningStore.storeVerifiedCorrection validates schema before storing', async () => {
    const testUid = `student_schema_test_${Date.now()}`;
    await learningStore.clearStudentLearning(testUid);

    // 1. Valid verified candidate
    const validCandidate = {
      topic: 'Probability',
      problem_type: 'birthday_problem',
      corrected_result: '23',
      explanation: 'At least 23 people give P >= 0.5',
      confidence: 'verified',
      verification_method: 'deterministic_probability_computation'
    };
    const storeRes = await learningStore.storeVerifiedCorrection(testUid, validCandidate);
    assert.strictEqual(storeRes.success, true);
    assert.strictEqual(storeRes.status, 'verified_and_stored');

    // 2. Candidate with injection/unapproved fields that would fail schema
    const rogueCandidate = {
      topic: 'Probability',
      problem_type: 'birthday_problem',
      corrected_result: '23',
      explanation: 'Valid explanation',
      confidence: 'verified',
      verification_method: 'deterministic_probability_computation',
      rogue_field: 'should_fail_schema'
    };
    const failRes = await learningStore.storeVerifiedCorrection(testUid, rogueCandidate);
    assert.strictEqual(failRes.success, false);
    assert.strictEqual(failRes.status, 'schema_validation_failed');
    assert.ok(failRes.reason.includes('rogue_field'));

    await learningStore.clearStudentLearning(testUid);
  });

  // -------------------------------------------------------------
  // 5. firestore.rules Static & Logical Inspection
  // -------------------------------------------------------------
  console.log('\n--- 5. firestore.rules Static & Logical Inspection ---');

  await test('firestore.rules incorporates isValidChatDoc() allowlist and client write protections', async () => {
    const rulesPath = path.resolve(__dirname, '..', 'firestore.rules');
    assert.ok(fs.existsSync(rulesPath), 'firestore.rules must exist');
    const content = fs.readFileSync(rulesPath, 'utf8');

    // Chat schema helper presence
    assert.ok(content.includes('function isValidChatDoc()'), 'Must contain isValidChatDoc helper');
    assert.ok(content.includes("allowedFields = ['title', 'timestamp', 'updatedAt', 'messages', 'isTest', 'testArtifact']"), 'Must enforce chat field allowlist');
    assert.ok(content.includes('data.title.size() <= 300'), 'Must enforce max title length');
    assert.ok(content.includes('data.messages.size() <= 500'), 'Must enforce max messages length');

    // Ownership & write rule
    assert.ok(content.includes('match /pythos_chats/{chatId}'), 'Must match /pythos_chats/{chatId}');
    assert.ok(content.includes('isValidChatDoc()'), 'pythos_chats write must enforce isValidChatDoc()');

    // pythos_learning write denial
    const learningMatch = content.match(/match\s+\/pythos_learning\/\{document=\*\*\}[^}]+}/s);
    assert.ok(learningMatch, 'pythos_learning rule must exist');
    assert.ok(learningMatch[0].includes('allow write: if false;'), 'pythos_learning must deny client writes');

    // learning_data top-level write denial
    const learningDataMatch = content.match(/match\s+\/learning_data\/\{document=\*\*\}[^}]+}/s);
    assert.ok(learningDataMatch, 'learning_data rule must exist');
    assert.ok(learningDataMatch[0].includes('allow read, write: if false;'), 'learning_data must deny client reads and writes');
  });

  console.log('\n======================================================================');
  console.log(`RESULTS: ${passed} / ${total} TESTS PASSED`);
  console.log('======================================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Unhandled error in test runner:', err);
  process.exit(1);
});
