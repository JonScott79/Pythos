/**
 * test/test-account-erasure-followup.js
 *
 * Pythos Milestone 2.4: Targeted Account-Erasure Remediation & Storage Suite
 *
 * Verifies:
 * 1. Selective cleanup of Pythos-owned localStorage keys without indiscriminate localStorage.clear().
 * 2. Unrelated browser storage keys are strictly preserved.
 * 3. Theme preservation flag (pythos_theme kept on logout, deleted on full erasure).
 * 4. Safe idempotent retry behavior after partial server-side erasure where account credentials
 *    and mailing consent have already been removed.
 * 5. Full erasure completion reporting 100% success on retry without requiring re-supplied email.
 */

const assert = require('assert');
const path = require('path');

const accountErasureService = require('../server/accountErasureService');
const lanzarIdService = require('../server/lanzarIdService');
const firestoreService = require('../server/firestoreService');
const learningStore = require('../server/learningStore');
const memoryService = require('../server/memoryService');

// Create a mock Web Storage API implementation to test clearPythosClientStorage
function createMockStorage(initialItems = {}) {
  const store = new Map(Object.entries(initialItems));
  let clearCalled = false;

  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      clearCalled = true;
      store.clear();
    },
    key(index) {
      return Array.from(store.keys())[index] || null;
    },
    get length() {
      return store.size;
    },
    dump() {
      return Object.fromEntries(store.entries());
    },
    wasClearCalled() {
      return clearCalled;
    }
  };
}

async function runTests() {
  console.log('======================================================================');
  console.log('PYTHOS MILESTONE 2.4: TARGETED ACCOUNT-ERASURE & STORAGE SUITE');
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
  // 1. Targeted Client Storage Cleanup
  // -------------------------------------------------------------
  console.log('--- 1. Targeted Browser Storage Cleanup ---');

  // Load clearPythosClientStorage dynamically from js/lanzarIdAuth.js
  const { clearPythosClientStorage } = await import('../js/lanzarIdAuth.js');

  await test('clearPythosClientStorage wipes all Pythos keys on full erasure without touching unrelated keys', async () => {
    const mockStorage = createMockStorage({
      'pythos_lanzar_id_token': 'jwt.token.value',
      'pythos_lanzar_id_user': '{"uid":"user_1","email":"u@example.org"}',
      'pythos_theme': 'dark',
      'pythos_chat_cache_1': '{"messages":[]}',
      'pythos_last_chat_id': 'chat_1',
      'pythos_draft_message': 'Solving x^2 + 5x = 0',
      'lanzar_session_meta': '{"env":"prod"}',
      'unrelated_app_token': 'secret_oauth_3rd_party',
      'global_analytics_id': 'uuid-12345',
      'dashboard_sidebar_collapsed': 'true'
    });

    const removed = clearPythosClientStorage({ preserveTheme: false, storage: mockStorage });

    assert.strictEqual(mockStorage.wasClearCalled(), false, 'Must NEVER call localStorage.clear()');
    assert.strictEqual(mockStorage.getItem('pythos_lanzar_id_token'), null);
    assert.strictEqual(mockStorage.getItem('pythos_lanzar_id_user'), null);
    assert.strictEqual(mockStorage.getItem('pythos_theme'), null, 'Theme should be removed when preserveTheme is false');
    assert.strictEqual(mockStorage.getItem('pythos_chat_cache_1'), null);
    assert.strictEqual(mockStorage.getItem('pythos_last_chat_id'), null);
    assert.strictEqual(mockStorage.getItem('pythos_draft_message'), null);
    assert.strictEqual(mockStorage.getItem('lanzar_session_meta'), null);

    // Unrelated keys must be 100% intact
    assert.strictEqual(mockStorage.getItem('unrelated_app_token'), 'secret_oauth_3rd_party');
    assert.strictEqual(mockStorage.getItem('global_analytics_id'), 'uuid-12345');
    assert.strictEqual(mockStorage.getItem('dashboard_sidebar_collapsed'), 'true');
    assert.strictEqual(mockStorage.length, 3);
  });

  await test('clearPythosClientStorage preserves theme when preserveTheme is true', async () => {
    const mockStorage = createMockStorage({
      'pythos_lanzar_id_token': 'token123',
      'pythos_theme': 'dark',
      'pythos-theme': 'dark',
      'pythos_chat_cache_9': 'cached',
      'other_setting': 'kept'
    });

    clearPythosClientStorage({ preserveTheme: true, storage: mockStorage });

    assert.strictEqual(mockStorage.wasClearCalled(), false);
    assert.strictEqual(mockStorage.getItem('pythos_lanzar_id_token'), null);
    assert.strictEqual(mockStorage.getItem('pythos_chat_cache_9'), null);
    assert.strictEqual(mockStorage.getItem('pythos_theme'), 'dark', 'pythos_theme must be preserved');
    assert.strictEqual(mockStorage.getItem('pythos-theme'), 'dark', 'pythos-theme must be preserved');
    assert.strictEqual(mockStorage.getItem('other_setting'), 'kept');
  });

  // -------------------------------------------------------------
  // 2. Server-Side Idempotent Retry with Pre-Erased Credentials
  // -------------------------------------------------------------
  console.log('\n--- 2. Server-Side Retry with Pre-Erased Credentials ---');

  await test('Idempotent retry completes successfully when credentials have already been removed in attempt 1', async () => {
    const testEmail = `retry.preerased.${Date.now()}@example.org`;
    const testPassword = 'Password123!Secure';

    // 1. Create account & consent
    const reg = await lanzarIdService.authenticateOrRegisterLanzarId({
      email: testEmail,
      password: testPassword,
      displayName: 'Retry Student',
      mode: 'register',
      mailingListOptIn: true
    });
    const testUid = reg.user.uid;

    mockFirestoreStore.chats.set(testUid, [{ id: 'chat_transient', title: 'Calculus' }]);

    // 2. Simulate partial failure: chat deletion fails, but account & consent succeed
    let failChat = true;
    testAdapter.deleteUserChats = async (uid) => {
      if (failChat) {
        throw new Error('Simulated transient network drop on chats subcollection');
      }
      mockFirestoreStore.chats.delete(uid);
      return true;
    };

    const attempt1 = await accountErasureService.eraseStudentAccount(testUid, testEmail);

    assert.strictEqual(attempt1.success, false, 'Attempt 1 must report partial failure');
    assert.strictEqual(attempt1.components.account, true, 'Account was deleted in attempt 1');
    assert.strictEqual(attempt1.components.mailingConsent, true, 'Consent was deleted in attempt 1');
    assert.strictEqual(attempt1.components.chatHistory, false, 'Chats failed to delete in attempt 1');

    // Verify account and consent are now already gone from storage
    const accountCheck = await lanzarIdService.loadAccountByUid(testUid);
    assert.strictEqual(accountCheck, null, 'Account record is now null in authoritative storage');
    assert.strictEqual(lanzarIdService.getMailingListStatus(testEmail), null, 'Consent is gone');

    // 3. Resolve transient network failure for attempt 2
    failChat = false;

    // Call attempt 2 (retry) with ONLY UID (no email provided!)
    const attempt2 = await accountErasureService.eraseStudentAccount(testUid);

    assert.strictEqual(attempt2.success, true, 'Attempt 2 must succeed idempotently');
    assert.strictEqual(attempt2.components.account, true, 'Account must report true idempotently');
    assert.strictEqual(attempt2.components.mailingConsent, true, 'Mailing consent must report true idempotently');
    assert.strictEqual(attempt2.components.chatHistory, true, 'Chat history must succeed on retry');
    assert.strictEqual(attempt2.errors.length, 0, 'Must have zero errors on successful retry');
    assert.strictEqual(mockFirestoreStore.chats.has(testUid), false, 'Chats must be removed from store');
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
