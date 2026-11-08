/**
 * test/test-privacy-account-erasure.js
 *
 * Pythos Milestone 2.3: Privacy & Account Erasure Verification Suite (MEDIUM-06)
 *
 * Verifies:
 * 1. Complete account erasure covering credentials, mailing consent, learning data, memories, and chats.
 * 2. Component-level tracking and safe, idempotent retry behavior on partial failure.
 * 3. HTTP endpoint protection: DELETE /api/account requires authenticated student session.
 * 4. Privacy policy compliance: accurate Groq/Gemini disclosures, COPPA compliance, verified contact details,
 *    and legal counsel review flagging.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('../server/node_modules/express');

const accountErasureService = require('../server/accountErasureService');
const lanzarIdService = require('../server/lanzarIdService');
const firestoreService = require('../server/firestoreService');
const learningStore = require('../server/learningStore');
const memoryService = require('../server/memoryService');

async function runTests() {
  console.log('======================================================================');
  console.log('PYTHOS MILESTONE 2.3: PRIVACY & ACCOUNT ERASURE SUITE (MEDIUM-06)');
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

  // Set up mock adapter for Firestore to capture all operations
  const mockFirestoreStore = {
    accounts: new Map(),
    consents: new Map(),
    chats: new Map(),
    learning: new Map()
  };

  const testAdapter = {
    saveLanzarAccount: async (acc) => { mockFirestoreStore.accounts.set(acc.uid, acc); return true; },
    getLanzarAccountByUid: async (uid) => mockFirestoreStore.accounts.get(uid) || null,
    deleteLanzarAccount: async (uid) => { mockFirestoreStore.accounts.delete(uid); return true; },
    saveMailingListConsent: async (rec) => { mockFirestoreStore.consents.set(rec.email.toLowerCase(), rec); return true; },
    getMailingListConsentByEmail: async (email) => mockFirestoreStore.consents.get(email.toLowerCase()) || null,
    deleteMailingListConsent: async (email) => { mockFirestoreStore.consents.delete(email.toLowerCase()); return true; },
    deleteUserChats: async (uid) => { mockFirestoreStore.chats.delete(uid); return true; }
  };

  firestoreService.setFirestoreAdapterForTesting(testAdapter);

  // -------------------------------------------------------------
  // 1. Complete Account Erasure Coverage
  // -------------------------------------------------------------
  console.log('--- 1. Complete Account Erasure Across All Stores ---');

  await test('eraseStudentAccount wipes account, consent, learning data, memories, and chats', async () => {
    const testEmail = `erasure.test.student.${Date.now()}@example.org`;
    const testPassword = 'Password123!Secure';
    // 1. Create LANZAR ID Account & Mailing Consent
    const regResult = await lanzarIdService.authenticateOrRegisterLanzarId({
      email: testEmail,
      password: testPassword,
      displayName: 'Erasure Student',
      mode: 'register',
      mailingListOptIn: true
    });
    const testUid = regResult.user.uid;

    // Populate mock Firestore
    mockFirestoreStore.chats.set(testUid, [{ id: 'chat_1', title: 'Calculus Help' }]);

    // Populate learningStore
    await learningStore.saveData(testUid, {
      records: [{ topic: 'Calculus', timestamp: new Date().toISOString() }],
      conflicts: []
    });

    // Verify presence before deletion
    assert.ok(mockFirestoreStore.chats.has(testUid), 'Chats must exist before erasure');
    assert.ok(lanzarIdService.getMailingListStatus(testEmail), 'Consent must exist before erasure');

    // 2. Perform Account Erasure
    const result = await accountErasureService.eraseStudentAccount(testUid, testEmail);

    assert.strictEqual(result.success, true, `Erasure must report overall success: ${JSON.stringify(result)}`);
    assert.strictEqual(result.components.account, true, 'Account component must be deleted');
    assert.strictEqual(result.components.mailingConsent, true, 'Mailing consent must be deleted');
    assert.strictEqual(result.components.learningData, true, 'Learning data must be deleted');
    assert.strictEqual(result.components.memories, true, 'Memories must be deleted');
    assert.strictEqual(result.components.chatHistory, true, 'Chat history must be deleted');

    // 3. Verify deletion across stores
    assert.strictEqual(mockFirestoreStore.chats.has(testUid), false, 'Chats must be removed from Firestore');
    assert.strictEqual(lanzarIdService.getMailingListStatus(testEmail), null, 'Mailing list consent must be deleted');
    assert.strictEqual(mockFirestoreStore.consents.has(testEmail), false, 'Mailing consent must be removed from Firestore');
    assert.strictEqual(mockFirestoreStore.accounts.has(testUid), false, 'Account must be removed from Firestore');
  });

  // -------------------------------------------------------------
  // 2. Safe Partial Failure Handling & Idempotent Retry
  // -------------------------------------------------------------
  console.log('\n--- 2. Partial Failure Handling & Safe Retry ---');

  await test('Partial failure reports failed component without blocking other deletions, and retries safely', async () => {
    const retryUid = `usr_retry_test_${Date.now()}`;
    const retryEmail = 'retry.student@example.org';

    mockFirestoreStore.chats.set(retryUid, [{ id: 'chat_2', title: 'Geometry' }]);

    // Simulate transient failure on chat deletion
    let failChat = true;
    testAdapter.deleteUserChats = async (uid) => {
      if (failChat) {
        throw new Error('Simulated Firestore network timeout');
      }
      mockFirestoreStore.chats.delete(uid);
      return true;
    };

    // First attempt: chat history fails
    const firstAttempt = await accountErasureService.eraseStudentAccount(retryUid, retryEmail);

    assert.strictEqual(firstAttempt.success, false, 'Must report failure when a component fails');
    assert.strictEqual(firstAttempt.components.chatHistory, false, 'Chat history must report false');
    assert.strictEqual(firstAttempt.components.learningData, true, 'Learning data must still have succeeded');
    assert.strictEqual(firstAttempt.components.account, true, 'Account deletion must still have succeeded');
    assert.ok(firstAttempt.errors.some(e => e.includes('Chat history erasure failed')));
    assert.ok(mockFirestoreStore.chats.has(retryUid), 'Chats still exist after partial failure');

    // Resolve simulated failure condition
    failChat = false;

    // Retry erasure: already-deleted components succeed idempotently, and chats are deleted!
    const secondAttempt = await accountErasureService.eraseStudentAccount(retryUid, retryEmail);

    assert.strictEqual(secondAttempt.success, true, 'Retry must report complete success');
    assert.strictEqual(secondAttempt.components.chatHistory, true, 'Chat history must succeed on retry');
    assert.strictEqual(mockFirestoreStore.chats.has(retryUid), false, 'Chats must now be deleted from store');
  });

  // -------------------------------------------------------------
  // 3. HTTP Endpoint Integration & Authentication Enforcement
  // -------------------------------------------------------------
  console.log('\n--- 3. HTTP Endpoint Protection (DELETE /api/account) ---');

  await test('DELETE /api/account rejects unauthenticated calls and erases authenticated session', async () => {
    const app = express();
    app.use(express.json());

    // Minimal auth middleware matching server.js contract
    app.delete('/api/account', async (req, res) => {
      const authHeader = req.headers['authorization'];
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'unauthorized', message: 'Authentication required' });
      }
      const token = authHeader.slice(7).trim();
      const claims = token.startsWith('lanzar.') ? lanzarIdService.verifyLanzarToken(token) : null;
      if (!claims || !claims.uid) {
        return res.status(401).json({ error: 'unauthorized', message: 'Invalid token' });
      }

      const result = await accountErasureService.eraseStudentAccount(claims.uid, claims.email);
      if (result.success) {
        return res.status(200).json({ status: 'ok', message: 'Account erased', erasure: result });
      }
      return res.status(207).json({ status: 'partial_failure', erasure: result });
    });

    const server = http.createServer(app);
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;

    try {
      // 1. Unauthenticated request must return 401
      const unauthRes = await fetch(`http://127.0.0.1:${port}/api/account`, { method: 'DELETE' });
      assert.strictEqual(unauthRes.status, 401, 'Unauthenticated call must be rejected with 401');

      // 2. Authenticated request with signed token
      const studentUid = `usr_http_test_${Date.now()}`;
      const signedToken = lanzarIdService.signLanzarToken({
        uid: studentUid,
        email: 'http.student@example.org'
      });

      const authRes = await fetch(`http://127.0.0.1:${port}/api/account`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${signedToken}` }
      });

      assert.strictEqual(authRes.status, 200);
      const body = await authRes.json();
      assert.strictEqual(body.status, 'ok');
      assert.strictEqual(body.erasure.success, true);
      assert.strictEqual(body.erasure.uid, studentUid);
    } finally {
      await new Promise(r => server.close(r));
    }
  });

  // -------------------------------------------------------------
  // 4. Privacy Policy (privacy.html) Verification
  // -------------------------------------------------------------
  console.log('\n--- 4. Privacy Policy Compliance (privacy.html) ---');

  await test('privacy.html contains accurate third-party, COPPA, erasure, and contact disclosures', async () => {
    const policyPath = path.resolve(__dirname, '..', 'privacy.html');
    const policyHtml = fs.readFileSync(policyPath, 'utf8');

    // 1. Third-party model providers disclosure
    assert.ok(policyHtml.includes('Groq Inc.'), 'Must disclose Groq Inc. as inference provider');
    assert.ok(policyHtml.includes('Google Gemini'), 'Must disclose Google Gemini as vision/reasoning provider');
    assert.ok(policyHtml.includes('Ollama'), 'Must disclose local/self-hosted Ollama deployment');

    // 2. Children's privacy and COPPA disclosure
    assert.ok(policyHtml.includes('COPPA'), 'Must explicitly reference COPPA');
    assert.ok(policyHtml.includes('Children under 13'), 'Must disclose protections for children under 13');
    assert.ok(policyHtml.includes('Parental Rights'), 'Must outline parental inspection and deletion rights');

    // 3. Complete account erasure disclosure
    assert.ok(policyHtml.includes('DELETE /api/account'), 'Must disclose DELETE /api/account automated erasure');
    assert.ok(policyHtml.includes('lanzar_id_accounts'), 'Must disclose account erasure scope');
    assert.ok(policyHtml.includes('pythos_memory'), 'Must disclose personal memory erasure scope');

    // 4. Verified contact information
    assert.ok(policyHtml.includes('contact@lanzar.me'), 'Must provide verified contact email');
    assert.ok(policyHtml.includes('Jon Scott'), 'Must identify verified lead maintainer');
    assert.ok(policyHtml.includes('https://lanzar.me'), 'Must link to verified organization website');

    // 5. Legal review notice
    assert.ok(policyHtml.includes('formal legal counsel review'), 'Must explicitly flag policy language for legal counsel review');
  });

  console.log('\n======================================================================');
  console.log(`PRIVACY & ACCOUNT ERASURE SUMMARY: ${passed}/${total} passed (${total - passed} failed)`);
  console.log('======================================================================\n');

  if (passed !== total) process.exit(1);
}

runTests().catch(err => {
  console.error('Test runner uncaught error:', err);
  process.exit(1);
});
