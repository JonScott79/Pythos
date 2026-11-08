/**
 * test/test-chat-persistence-safeguards.js
 * Regression tests for student chat persistence guards and failure resilience.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('======================================================================');
console.log('PYTHOS CHAT PERSISTENCE & SAFEGUARDS TEST SUITE');
console.log('======================================================================\n');

// 1. Static code inspection of app.js guards
console.log('--- 1. Client Firestore Guard Verification ---');

const appJs = fs.readFileSync(path.resolve(__dirname, '..', 'app.js'), 'utf8');

assert.ok(
  appJs.includes('if (!currentUser || currentUser.isLanzarId || !db) return;'),
  'saveChatState must guard against null db and LANZAR ID accounts'
);

assert.ok(
  appJs.includes('Non-fatal: Failed to persist chat session to Firestore:'),
  'saveChatState must catch errors and log warning rather than bubbling to chat failure handler'
);

console.log('  ✓ [PASS] app.js contains non-fatal Firestore persistence error boundary');
console.log('  ✓ [PASS] saveChatState guards against unauthenticated LANZAR ID client Firestore calls');

// 2. Schema compatibility with firestore.rules
console.log('\n--- 2. Chat Document Schema Compatibility with firestore.rules ---');

const rules = fs.readFileSync(path.resolve(__dirname, '..', 'firestore.rules'), 'utf8');
assert.ok(rules.includes('isValidChatDoc()'), 'firestore.rules must contain isValidChatDoc');

// Verify that fields written by saveChatState: title, timestamp, messages
const writtenFields = ['title', 'timestamp', 'messages'];
for (const f of writtenFields) {
  assert.ok(
    rules.includes(`'${f}'`),
    `firestore.rules allowedFields must include written field "${f}"`
  );
}

console.log('  ✓ [PASS] Written chat fields (title, timestamp, messages) are allowlisted in firestore.rules');

console.log('\n======================================================================');
console.log('CHAT PERSISTENCE SAFEGUARDS: ALL TESTS PASSED');
console.log('======================================================================\n');
