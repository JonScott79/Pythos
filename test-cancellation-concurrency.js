// test-cancellation-concurrency.js
// Verifies concurrency limiting, abort controller propagation, queue timeouts, admin routes, and internal consistency.

const assert = require('assert');
const concurrencyLimiter = require('./server/concurrencyLimiter');
const { extractClaims, auditInternalConsistency, runDeterministicVerification } = require('./server/verificationBridge');

async function testConcurrencyAndCancellation() {
  console.log('==================================================');
  console.log('⚡ TESTING CONCURRENCY LIMITER & CANCELLATION');
  console.log('==================================================\n');

  // Test 1: Set limit to 2 and acquire 2 slots
  concurrencyLimiter.setLimit(2);
  assert.strictEqual(concurrencyLimiter.getMaxConcurrent(), 2);
  assert.strictEqual(concurrencyLimiter.getCurrentCount(), 0);

  const controller1 = new AbortController();
  const controller2 = new AbortController();
  const controller3 = new AbortController();

  await concurrencyLimiter.acquire(controller1.signal, 5000);
  assert.strictEqual(concurrencyLimiter.getCurrentCount(), 1);

  await concurrencyLimiter.acquire(controller2.signal, 5000);
  assert.strictEqual(concurrencyLimiter.getCurrentCount(), 2);
  console.log('  ✅ Acquired 2 slots successfully.');

  // Test 2: 3rd request queues up
  let queued3Resolved = false;
  let queued3Rejected = false;
  const p3 = concurrencyLimiter.acquire(controller3.signal, 5000)
    .then(() => { queued3Resolved = true; })
    .catch((e) => { queued3Rejected = true; });

  assert.strictEqual(concurrencyLimiter.getQueueLength(), 1, 'Queue length should be 1');
  console.log('  ✅ 3rd request queued properly.');

  // Test 3: Aborting 3rd request while queued removes it from queue and rejects
  controller3.abort();
  await p3;
  assert.strictEqual(queued3Rejected, true, 'Queued request should reject when aborted');
  assert.strictEqual(concurrencyLimiter.getQueueLength(), 0, 'Queue length should now be 0');
  console.log('  ✅ Aborting queued request evicted it from queue and rejected cleanly.');

  // Test 4: Timeout while queued
  const controller4 = new AbortController();
  let timedOut = false;
  const p4 = concurrencyLimiter.acquire(controller4.signal, 50)
    .catch((err) => {
      if (err.message === 'ETIMEDOUT') timedOut = true;
    });
  await p4;
  assert.strictEqual(timedOut, true, 'Queued request should time out with ETIMEDOUT');
  assert.strictEqual(concurrencyLimiter.getQueueLength(), 0);
  console.log('  ✅ Queued request timeout works.');

  // Test 5: Releasing slot hands over to queued request
  const controller5 = new AbortController();
  let slotHandedOver = false;
  const p5 = concurrencyLimiter.acquire(controller5.signal, 5000).then(() => {
    slotHandedOver = true;
  });
  assert.strictEqual(concurrencyLimiter.getQueueLength(), 1);
  concurrencyLimiter.release(); // release slot 1
  await p5;
  assert.strictEqual(slotHandedOver, true, 'Slot should be handed over to next waiter');
  assert.strictEqual(concurrencyLimiter.getCurrentCount(), 2);
  console.log('  ✅ Slot release hands over to queued request.');

  // Clean up remaining slots
  concurrencyLimiter.release();
  concurrencyLimiter.release();
  assert.strictEqual(concurrencyLimiter.getCurrentCount(), 0);
  console.log('  ✅ All slots released cleanly.');

  // Test 6: clearQueue() drains and rejects
  concurrencyLimiter.setLimit(1);
  await concurrencyLimiter.acquire(null, 5000);
  let queuedCount = 0;
  let rejectCount = 0;
  for (let i = 0; i < 5; i++) {
    concurrencyLimiter.acquire(null, 5000).catch(() => { rejectCount++; });
  }
  assert.strictEqual(concurrencyLimiter.getQueueLength(), 5);
  const cleared = concurrencyLimiter.clearQueue();
  assert.strictEqual(cleared, 5);
  assert.strictEqual(concurrencyLimiter.getQueueLength(), 0);
  // Wait a tick for catch handlers
  await new Promise(r => setTimeout(r, 10));
  assert.strictEqual(rejectCount, 5);
  concurrencyLimiter.release();
  assert.strictEqual(concurrencyLimiter.getCurrentCount(), 0);
  console.log('  ✅ clearQueue() successfully evicts and cancels all queued tasks.');

  // Reset limit
  concurrencyLimiter.setLimit(5);
}

async function testAuditInternalConsistency() {
  console.log('\n==================================================');
  console.log('⚡ TESTING INTERNAL CONTRADICTION DETECTION & VERIFIER');
  console.log('==================================================\n');

  const textWithContradiction = `
    0.02 * 0.70 = 0.014
    0.06 * 0.30 = 0.018
    0.014 + 0.018 = 0.032
    0.06 * 0.30 = 0.09
    0.09 / 0.032 = 0.28125
  `;

  const claims = extractClaims(textWithContradiction);
  assert.strictEqual(claims.length >= 4, true, 'Should extract all mathematical claims');

  const contradictions = auditInternalConsistency(claims);
  assert.strictEqual(contradictions.length > 0, true, 'Should detect internal contradiction for 0.06 * 0.30');
  console.log('  ✅ Contradiction detected:', contradictions[0].details);

  const invalidClaims = [];
  for (const c of claims) {
    const v = await runDeterministicVerification(c);
    if (!v.verified) {
      invalidClaims.push({ c, v });
    }
  }

  assert.strictEqual(invalidClaims.length >= 2, true, 'Should identify 0.06*0.30=0.09 and 0.09/0.032 as invalid claims');
  console.log(`  ✅ Successfully verified ${claims.length} claims and intercepted ${invalidClaims.length} invalid calculations.`);
}

async function runAllTests() {
  try {
    await testConcurrencyAndCancellation();
    await testAuditInternalConsistency();
    console.log('\n==================================================');
    console.log('🎉 ALL CANCELLATION & VERIFICATION TESTS PASSED');
    console.log('==================================================\n');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ TEST FAILED:', err);
    process.exit(1);
  }
}

runAllTests();
