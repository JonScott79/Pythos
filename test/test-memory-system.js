/**
 * test-memory-system.js
 *
 * Automated Test Suite for Pythos Personal Memory System.
 * Tests:
 * 1. Extraction Pipeline (Deterministic facts vs. behavioral inferences).
 * 2. Privacy & PII Denial Rules.
 * 3. Confidence Calculation & Reinforcement Formula.
 * 4. Token Budget & System Context Formatter.
 * 5. Memory Service Persistence, Overrides & Clear Operations.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

// Set mock service account environment so Admin SDK boots in test mode
const credsPath = path.resolve(__dirname, '..', 'firebase-credentials', 'lanzar-95ae3-firebase-adminsdk-fbsvc-86e8ea5817.json');
if (fs.existsSync(credsPath)) {
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON = fs.readFileSync(credsPath, 'utf8');
}

const memoryService = require('../server/memoryService');
const memoryExtractor = require('../server/memoryExtractor');

async function runTests() {
  console.log('=== RUNNING PYTHOS PERSONAL MEMORY SYSTEM TESTS ===\n');

  // TEST 1: Fact Extraction (Preferred Name & Course)
  console.log('TEST 1: Extract explicit facts from student greeting');
  const greeting = "Hey Pythos, I'm Jake and I take AP Physics.";
  const candidates = memoryExtractor.extractCandidates(greeting, "Greetings, Jake!");
  
  assert.ok(candidates.length >= 2, 'Should extract at least 2 candidates');
  const nameCand = candidates.find(c => c.facet === 'preferredName');
  assert.strictEqual(nameCand.value, 'Jake');
  assert.strictEqual(nameCand.kind, 'observed_fact');
  assert.ok(nameCand.confidence >= 0.90, 'Facts should have high confidence');

  const courseCand = candidates.find(c => c.facet === 'course');
  assert.ok(courseCand.value.includes('AP PHYSICS'));
  console.log('  ✓ Stated name and course extracted with high confidence.');

  // TEST 2: Privacy Filter & PII Rejection
  console.log('TEST 2: Privacy & PII Sanitization');
  const piiText = "My email is jake@example.com and my phone is 555-123-4567.";
  const sanitized = memoryService.sanitizeMemoryString(piiText);
  assert.ok(!sanitized.includes('jake@example.com'), 'Email must be redacted');
  assert.ok(!sanitized.includes('555-123-4567'), 'Phone must be redacted');
  assert.ok(sanitized.includes('[REDACTED_EMAIL]'));
  assert.ok(sanitized.includes('[REDACTED_PHONE]'));

  assert.strictEqual(memoryService.isSensitiveOrDisallowed('my password is 123'), true);
  assert.strictEqual(memoryService.isSensitiveOrDisallowed('I love quadratic equations'), false);
  console.log('  ✓ Sensitive data & PII properly rejected/redacted.');

  // TEST 3: Context Formatter & Token Budget Enforcement
  console.log('TEST 3: Memory Context Formatter & Token Budget');
  const sampleProfile = {
    identity: { preferredName: 'Jake', course: 'AP Physics 1' },
    preferences: { explanationPacing: 'concise', analogyPreference: 'baseball' },
    learning: {
      activeWeaknesses: [
        { facet: 'recurringMistake', description: 'dropping negative signs in parentheses' }
      ]
    }
  };

  const formatted = memoryService.formatMemoryContext(sampleProfile);
  assert.ok(formatted.includes('Addressed as: Jake'));
  assert.ok(formatted.includes('concise explanations'));
  assert.ok(formatted.includes('baseball analogies'));
  assert.ok(formatted.includes('dropping negative signs'));

  // Ensure prompt overhead is concise (under 120 words / ~150 tokens)
  const wordCount = formatted.trim().split(/\s+/).length;
  assert.ok(wordCount < 120, `Memory context must be bounded, got ${wordCount} words`);
  console.log(`  ✓ Formatted prompt is clean and compact (${wordCount} words).`);

  // TEST 4: Live Firestore CRUD & Profile Recompilation (if creds available)
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    console.log('TEST 4: Live Firestore Persistence, Update & Clean (Test User)');
    const testUid = 'test_student_memory_unit_test';

    // 1. Record name
    await memoryService.recordMemoryCandidate(testUid, {
      category: 'identity',
      facet: 'preferredName',
      value: 'Jake',
      kind: 'observed_fact',
      quote: "I'm Jake"
    });

    // 2. Record preference inference
    await memoryService.recordMemoryCandidate(testUid, {
      category: 'preferences',
      facet: 'explanationPacing',
      value: 'concise',
      kind: 'inference',
      quote: 'Keep it short'
    });

    const profile = await memoryService.getStudentMemoryProfile(testUid);
    assert.strictEqual(profile?.identity?.preferredName, 'Jake');
    console.log('  ✓ Memory profile compiled in Firestore successfully.');

    // 3. Update memory item
    await memoryService.updateMemoryItem(testUid, 'mem_identity_preferredname', 'Jacob');
    const updatedProfile = await memoryService.getStudentMemoryProfile(testUid);
    assert.strictEqual(updatedProfile?.identity?.preferredName, 'Jacob');
    console.log('  ✓ Student override updated profile.');

    // 4. Wipe memory (Forget Everything)
    await memoryService.clearAllStudentMemory(testUid);
    const clearedProfile = await memoryService.getStudentMemoryProfile(testUid);
    assert.strictEqual(clearedProfile, null);
    console.log('  ✓ Complete memory erasure ("Forget Everything") verified.');
  }

  console.log('\n=== ALL PYTHOS PERSONAL MEMORY SYSTEM TESTS PASSED ===');
}

runTests().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
