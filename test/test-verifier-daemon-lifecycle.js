/**
 * test/test-verifier-daemon-lifecycle.js
 *
 * PYTHOS — PHASE XX (MEDIUM-01): Persistent SymPy Verifier Worker Pool Lifecycle & Benchmarks
 *
 * Verifies:
 * 1. Graceful startup and shutdown of the persistent SymPy verifier worker pool.
 * 2. Strict request isolation with zero cross-talk across concurrent single and batch requests.
 * 3. Timeout isolation: a timed-out request terminates only its assigned worker without harming concurrent requests.
 * 4. Malformed input safety: invalid claims/syntax fail closed without crashing the worker.
 * 5. Cold vs warm latency measurement and process cleanup on closeVerifierDaemon().
 */

const assert = require('assert');
const verificationBridge = require('../server/verificationBridge');

async function runTests() {
  console.log('======================================================================');
  console.log('PYTHOS PHASE XX (MEDIUM-01): VERIFIER DAEMON LIFECYCLE & CONCURRENCY');
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

  verificationBridge.closeVerifierDaemon();

  await test('initVerifierDaemon initializes worker pool with expected capacity', async () => {
    verificationBridge.initVerifierDaemon(2);
    const status = verificationBridge.getVerifierPoolStatus();
    assert.strictEqual(status.totalWorkers, 2, 'Pool must contain 2 workers');
    assert.strictEqual(status.busyWorkers, 0, 'No workers should be busy initially');
    assert.strictEqual(status.idleWorkers, 2, 'All workers should be idle');
    assert.strictEqual(status.queuedTasks, 0, 'Task queue should be empty');
  });

  await test('Cold vs warm single-request latency and correctness', async () => {
    const coldClaim = {
      domain: 'calculus',
      claim_type: 'antiderivative',
      data: { integrand: '2*x', variable: 'x', proposed_antiderivative: 'x^2 + C' }
    };

    // Warm both workers in the pool on Python/SymPy antiderivative evaluation before timing warm runs
    const tCold0 = performance.now();
    const [coldRes] = await Promise.all([
      verificationBridge.runDeterministicVerification(coldClaim),
      verificationBridge.runDeterministicVerification({
        domain: 'calculus',
        claim_type: 'antiderivative',
        data: { integrand: '3*x^2', variable: 'x', proposed_antiderivative: 'x^3 + C' }
      })
    ]);
    const coldMs = performance.now() - tCold0;
    assert.strictEqual(coldRes.verified, true, `Expected coldRes verified=true, got ${JSON.stringify(coldRes)}`);

    // Warm runs across both workers (cache-busted unique expressions)
    const warmLatencies = [];
    for (let i = 0; i < 6; i++) {
      const k = i + 2;
      const t0 = performance.now();
      const warmRes = await verificationBridge.runDeterministicVerification({
        domain: 'calculus',
        claim_type: 'antiderivative',
        data: { integrand: `${2 * k}*x`, variable: 'x', proposed_antiderivative: `${k}*x^2 + C` }
      });
      warmLatencies.push(performance.now() - t0);
      assert.strictEqual(warmRes.verified, true, `Expected warmRes verified=true on iter ${i}`);
    }
    const avgWarmMs = warmLatencies.reduce((a, b) => a + b, 0) / warmLatencies.length;
    console.log(`    [BENCH] Cold Python pool warmup (2 workers): ${coldMs.toFixed(2)}ms | Avg warm request (n=6): ${avgWarmMs.toFixed(2)}ms`);
    assert(avgWarmMs < 200, `Expected warm latency < 200ms, got ${avgWarmMs.toFixed(2)}ms`);
  });

  await test('Concurrent single & batch requests execute with zero cross-contamination', async () => {
    const [r1, r2, r3, batchRes] = await Promise.all([
      verificationBridge.runDeterministicVerification({
        domain: 'calculus',
        claim_type: 'derivative',
        data: { expression: 'sin(x)', variable: 'x', proposed_derivative: 'cos(x)' }
      }),
      verificationBridge.runDeterministicVerification({
        domain: 'calculus',
        claim_type: 'derivative',
        data: { expression: 'sin(x)', variable: 'x', proposed_derivative: '-cos(x)' }
      }),
      verificationBridge.runDeterministicVerification({
        domain: 'algebra',
        claim_type: 'symbolic_equivalence',
        data: { expr1: 'abs(x)', expr2: 'sqrt(x^2)' }
      }),
      verificationBridge.runPythonVerifierBatch([
        { domain: 'algebra', claim_type: 'symbolic_equivalence', data: { expr1: '(x^2 - 4)/(x - 2)', expr2: 'x + 2' } },
        { domain: 'calculus', claim_type: 'antiderivative', data: { integrand: '3*x^2', variable: 'x', proposed_antiderivative: 'x^3 + C' } }
      ])
    ]);

    assert.strictEqual(r1.verified, true);
    assert.strictEqual(r2.verified, false);
    assert.strictEqual(r3.verified, true);
    assert.strictEqual(batchRes.length, 2);
    assert.strictEqual(batchRes[0].verified, false);
    assert.strictEqual(batchRes[1].verified, true);
  });

  await test('Malformed claim syntax fails closed without crashing worker pool', async () => {
    const badRes = await verificationBridge.runDeterministicVerification({
      domain: 'calculus',
      claim_type: 'derivative',
      data: { expression: 'x^2 + * / 3', variable: 'x', proposed_derivative: '2*x' }
    });
    assert.strictEqual(badRes.verified, false);

    // Subsequent valid request on the pool must still succeed
    const goodRes = await verificationBridge.runDeterministicVerification({
      domain: 'calculus',
      claim_type: 'derivative',
      data: { expression: 'x^2', variable: 'x', proposed_derivative: '2*x' }
    });
    assert.strictEqual(goodRes.verified, true);
  });

  await test('Timeout isolation kills only timed-out worker and preserves concurrent tasks', async () => {
    const [timedOut, healthy] = await Promise.all([
      verificationBridge.runViaVerifierPool({
        domain: 'calculus',
        claim_type: 'antiderivative',
        data: { integrand: 'exp(-x^2) * sin(x^3 + x)', variable: 'x', proposed_antiderivative: '0' }
      }, { isBatch: false, timeoutMs: 1 }),
      verificationBridge.runDeterministicVerification({
        domain: 'algebra',
        claim_type: 'symbolic_equivalence',
        data: { expr1: 'x^2 - 9', expr2: '(x - 3)*(x + 3)' }
      })
    ]);

    assert.strictEqual(timedOut.verified, false);
    assert.strictEqual(timedOut.error_type, 'CAS_TIMEOUT');
    assert.strictEqual(healthy.verified, true);

    // Give replacement worker a moment to spawn, then verify pool recovers to 2 workers
    await new Promise(r => setTimeout(r, 150));
    const status = verificationBridge.getVerifierPoolStatus();
    assert.strictEqual(status.totalWorkers, 2);
    assert.strictEqual(status.busyWorkers, 0);
  });

  await test('closeVerifierDaemon terminates all workers cleanly', async () => {
    verificationBridge.closeVerifierDaemon();
    const status = verificationBridge.getVerifierPoolStatus();
    assert.strictEqual(status.totalWorkers, 0);
    assert.strictEqual(status.busyWorkers, 0);
    assert.strictEqual(status.queuedTasks, 0);
  });

  console.log(`\nSUMMARY: ${passed}/${total} verifier daemon lifecycle tests passed.`);
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  try { verificationBridge.closeVerifierDaemon(); } catch (_) {}
  process.exit(1);
});
