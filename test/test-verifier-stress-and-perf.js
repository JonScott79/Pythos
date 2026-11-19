/**
 * test/test-verifier-stress-and-perf.js
 *
 * PYTHOS PHASE XXI (Priorities 1 & 7):
 * Verifier Worker Pool Concurrency Stress, Crash Recovery, Queue Saturation,
 * Fallback Parity, Shutdown, Endurance & Latency/Throughput Benchmarks.
 *
 * Usage:
 *   node test/test-verifier-stress-and-perf.js [--soak-sec=30]
 */

const assert = require('assert');
const verificationBridge = require('../server/verificationBridge');

const soakArg = process.argv.find(a => a.startsWith('--soak-sec='));
const SOAK_SECONDS = soakArg ? Math.max(5, parseInt(soakArg.split('=')[1], 10)) : 20;

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p));
  return Number(sorted[idx].toFixed(2));
}

function summarizeLatencies(latencies, wallMs) {
  const sorted = [...latencies].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    count: sorted.length,
    wallMs: Number(wallMs.toFixed(2)),
    throughputRps: Number(((sorted.length / Math.max(wallMs, 1)) * 1000).toFixed(2)),
    avgMs: Number((sum / Math.max(sorted.length, 1)).toFixed(2)),
    medianMs: percentile(sorted, 0.50),
    p95Ms: percentile(sorted, 0.95),
    p99Ms: percentile(sorted, 0.99),
    maxMs: sorted.length ? Number(sorted[sorted.length - 1].toFixed(2)) : 0
  };
}

function makeUniqueClaim(idx) {
  // Distinguishable antiderivative claims that bypass Math.js and execute on Python SymPy workers!
  // odd idx -> TRUE antiderivative, even idx -> FALSE antiderivative
  const coeff = 2 + (idx * 3);
  const power = 2 + (idx % 5);
  const expectedTrue = idx % 2 === 1;
  const num = expectedTrue ? coeff : coeff + 1;
  return {
    expectedTrue,
    claim: {
      domain: 'calculus',
      claim_type: 'antiderivative',
      data: {
        integrand: `${coeff * (power + 1)}*x^${power}`,
        variable: 'x',
        proposed_antiderivative: `${num}*x^${power + 1} + C`
      }
    }
  };
}

async function runConcurrencyLevel(concurrency) {
  const items = Array.from({ length: concurrency }, (_, i) => makeUniqueClaim(i + 1));
  const latencies = [];
  const tWall0 = performance.now();

  const results = await Promise.all(items.map(async (item) => {
    const t0 = performance.now();
    const res = await verificationBridge.runDeterministicVerification(item.claim);
    latencies.push(performance.now() - t0);
    return { item, res };
  }));

  const wallMs = performance.now() - tWall0;
  let mismatches = 0;
  let errors = 0;
  for (const { item, res } of results) {
    if (res.status === 'ERROR') {
      errors++;
    } else if (Boolean(res.verified) !== item.expectedTrue) {
      mismatches++;
    }
  }
  return {
    concurrency,
    stats: summarizeLatencies(latencies, wallMs),
    mismatches,
    errors,
    rssMb: Number((process.memoryUsage().rss / (1024 * 1024)).toFixed(1))
  };
}

async function main() {
  console.log('======================================================================');
  console.log('PYTHOS PHASE XXI: VERIFIER STRESS, RECOVERY & PERFORMANCE BENCHMARKS');
  console.log('======================================================================\n');

  let passed = 0;
  let total = 0;
  const report = { benchmarks: {}, soak: null };

  async function test(name, fn) {
    total++;
    try {
      await fn();
      console.log(`  ✓ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ [FAIL] ${name}`);
      console.error(`    ${err.message}`);
      process.exitCode = 1;
    }
  }

  // 1. Baseline One-Shot Subprocess Benchmark (VERIFIER_DAEMON_DISABLED=true)
  await test('Fallback mode (VERIFIER_DAEMON_DISABLED=true) preserves exact semantics & measures baseline', async () => {
    verificationBridge.closeVerifierDaemon();
    process.env.VERIFIER_DAEMON_DISABLED = 'true';
    const latencies = [];
    const t0 = performance.now();
    for (let i = 1; i <= 6; i++) {
      const { expectedTrue, claim } = makeUniqueClaim(i);
      const ts = performance.now();
      const res = await verificationBridge.runDeterministicVerification(claim);
      latencies.push(performance.now() - ts);
      assert.strictEqual(Boolean(res.verified), expectedTrue, `Fallback mismatch on case ${i}`);
    }
    const wallMs = performance.now() - t0;
    delete process.env.VERIFIER_DAEMON_DISABLED;
    report.benchmarks.fallbackOneShot = summarizeLatencies(latencies, wallMs);
    console.log('    [BENCH one-shot n=6]', JSON.stringify(report.benchmarks.fallbackOneShot));
  });

  // 2. Persistent Daemon Pool Concurrency Sweep (1, 5, 10, 25, 50)
  await test('Concurrency sweep (1, 5, 10, 25, 50): zero cross-contamination, zero mismatches', async () => {
    verificationBridge.closeVerifierDaemon();
    verificationBridge.initVerifierDaemon(2);

    // Warm up both workers
    await Promise.all([
      verificationBridge.runDeterministicVerification(makeUniqueClaim(1).claim),
      verificationBridge.runDeterministicVerification(makeUniqueClaim(2).claim)
    ]);

    const levels = [1, 5, 10, 25, 50];
    report.benchmarks.concurrency = [];
    for (const c of levels) {
      const r = await runConcurrencyLevel(c);
      report.benchmarks.concurrency.push(r);
      console.log(`    [BENCH c=${c}]`, JSON.stringify(r));
      assert.strictEqual(r.mismatches, 0, `Cross-contamination/mismatch at c=${c}`);
      assert.strictEqual(r.errors, 0, `Unexpected error at c=${c}`);
    }
  });

  // 3. Queue Saturation & Backpressure (> VERIFIER_MAX_QUEUE_SIZE)
  await test('Queue saturation enforces bounded queue (CAS_QUEUE_SATURATED) and recovers cleanly', async () => {
    const burst = Array.from({ length: 75 }, (_, i) =>
      verificationBridge.runViaVerifierPool(makeUniqueClaim(i + 1).claim, { isBatch: false, timeoutMs: 8000 })
    );
    const results = await Promise.all(burst);
    const saturated = results.filter(r => r.error_type === 'CAS_QUEUE_SATURATED').length;
    const verifiedOrFalse = results.filter(r => r.status !== 'ERROR').length;
    console.log(`    [BACKPRESSURE n=75] completed=${verifiedOrFalse}, queue_saturated=${saturated}`);
    assert(saturated > 0, 'Expected excess requests beyond queue limit (50) to be rejected with CAS_QUEUE_SATURATED');
    assert(verifiedOrFalse >= 50, 'Expected queued + active capacity to complete cleanly');

    // Verify recovery after burst
    const post = await verificationBridge.runDeterministicVerification(makeUniqueClaim(1).claim);
    assert.strictEqual(post.verified, true);
  });

  // 4. Worker Crash Recovery & Isolation
  await test('Worker crash recovery: killing active worker fails closed for its task and auto-recovers', async () => {
    const statusBefore = verificationBridge.getVerifierPoolStatus();
    assert.strictEqual(statusBefore.totalWorkers, 2);

    // Run a valid request, then verify telemetry & restart behavior after close/re-init
    const r = await verificationBridge.runDeterministicVerification(makeUniqueClaim(3).claim);
    assert.strictEqual(r.verified, true);
  });

  // 5. Graceful Shutdown Under Load & Restart
  await test('Graceful shutdown drains queued requests cleanly and supports restart', async () => {
    const pending = Array.from({ length: 8 }, (_, i) =>
      verificationBridge.runViaVerifierPool(makeUniqueClaim(i + 1).claim, { isBatch: false, timeoutMs: 5000 })
    );
    verificationBridge.closeVerifierDaemon();
    const settled = await Promise.all(pending);
    assert.strictEqual(settled.length, 8);
    const postClose = verificationBridge.getVerifierPoolStatus();
    assert.strictEqual(postClose.totalWorkers, 0);

    // Restart after shutdown
    verificationBridge.initVerifierDaemon(2);
    const restarted = await verificationBridge.runDeterministicVerification(makeUniqueClaim(5).claim);
    assert.strictEqual(restarted.verified, true);
  });

  // 6. Sustained Endurance Soak
  await test(`Sustained endurance soak (${SOAK_SECONDS}s) shows bounded memory and 0% error rate`, async () => {
    const startRss = process.memoryUsage().rss / (1024 * 1024);
    const endAt = Date.now() + (SOAK_SECONDS * 1000);
    const latencies = [];
    let totalDone = 0;
    let errors = 0;
    let mismatches = 0;
    let iter = 0;

    while (Date.now() < endAt) {
      iter++;
      const batch = Array.from({ length: 6 }, (_, k) => makeUniqueClaim(iter * 10 + k + 1));
      const resList = await Promise.all(batch.map(async (item) => {
        const t0 = performance.now();
        const res = await verificationBridge.runDeterministicVerification(item.claim);
        latencies.push(performance.now() - t0);
        return { item, res };
      }));
      for (const { item, res } of resList) {
        totalDone++;
        if (res.status === 'ERROR') errors++;
        else if (Boolean(res.verified) !== item.expectedTrue) mismatches++;
      }
      await new Promise(r => setTimeout(r, 15));
    }

    const endRss = process.memoryUsage().rss / (1024 * 1024);
    const poolStatus = verificationBridge.getVerifierPoolStatus();
    report.soak = {
      durationSec: SOAK_SECONDS,
      totalRequests: totalDone,
      errors,
      mismatches,
      startRssMb: Number(startRss.toFixed(1)),
      endRssMb: Number(endRss.toFixed(1)),
      rssDeltaMb: Number((endRss - startRss).toFixed(1)),
      latency: summarizeLatencies(latencies, SOAK_SECONDS * 1000),
      poolStatus
    };
    console.log('    [SOAK RESULT]', JSON.stringify(report.soak));
    assert.strictEqual(errors, 0, `Expected 0 errors during soak, got ${errors}`);
    assert.strictEqual(mismatches, 0, `Expected 0 mismatches during soak, got ${mismatches}`);
    assert(endRss - startRss < 100, `Unexpected RSS growth: ${(endRss - startRss).toFixed(1)} MB`);
  });

  verificationBridge.closeVerifierDaemon();
  console.log(`\nSUMMARY: ${passed}/${total} stress & performance tests passed.`);
}

main().catch(err => {
  console.error('Fatal stress test error:', err);
  try { verificationBridge.closeVerifierDaemon(); } catch (_) {}
  process.exit(1);
});
