/**
 * benchmark-harness.js
 * Comprehensive profiling and telemetry harness measuring:
 * 1. Problem Classification & Routing (Domain, Subtype, Protocol, Knowns/Unknowns, Assumptions/Constraints)
 * 2. Total Gateway latency vs Raw Ollama inference time
 * 3. Deterministic calculation time & Short-circuit status
 * 4. Verification time & Model call budget
 * 5. Mathematical & physical correctness check
 * Across all representative benchmark cases.
 */

const http = require('http');
const { classifyProblem } = require('./server/problemClassifier');
const { extractPreflightDeterministicFacts } = require('./server/deterministicRouter');
const math = require('./server/node_modules/mathjs');

const BENCHMARK_CASES = [
  {
    id: 1,
    tier: 'PURE_MATH',
    name: '1. Exact Fraction Arithmetic (17/24)',
    prompt: 'Calculate 17/24.',
    expectedDomain: 'ARITHMETIC',
    expectedSubtype: 'PURE_CALCULATION',
    expectedValue: 17 / 24,
    verifyFn: (content) => content.includes('17/24') || content.includes('0.7083')
  },
  {
    id: 2,
    tier: 'PURE_MATH_BATCH',
    name: '2. Multiple Percentages & Batch Rates',
    prompt: 'Calculate these four rates:\n93/100\n87/90\n192/300\n55/80\nReturn the four percentages only, one per line.',
    expectedDomain: 'ARITHMETIC',
    expectedSubtype: 'PURE_CALCULATION',
    expectedValue: '93%, 96.67%, 64%, 68.75%',
    verifyFn: (content) => content.includes('93%') && content.includes('64%') && content.includes('68.75%')
  },
  {
    id: 3,
    tier: 'SIMPLE_ALGEBRA',
    name: '3. Simple Algebra Equation Root',
    prompt: 'Solve for x: 3x + 5 = 20.',
    expectedDomain: 'ALGEBRA',
    expectedSubtype: 'LINEAR_EQUATION',
    expectedValue: 5,
    verifyFn: (content) => content.includes('x = 5') || content.includes('5')
  },
  {
    id: 4,
    tier: 'CALCULUS_OPTIMIZATION',
    name: '4. Calculus Optimization (Farmer Fencing)',
    prompt: 'A farmer has 100 meters of fencing to enclose a rectangular field along a straight river (only 3 sides need fencing). Let x be width perpendicular to the river. Find dimensions that maximize area.',
    expectedDomain: 'CALCULUS',
    expectedSubtype: 'CONSTRAINED_OPTIMIZATION',
    expectedValue: 'x=25, y=50, Area=1250',
    verifyFn: (content) => (content.includes('25') && content.includes('50') && content.includes('1250'))
  },
  {
    id: 5,
    tier: 'BAYES_THEOREM',
    name: '5. Two-Machine Bayes Light Bulb Problem',
    prompt: 'Machine A produces 70% of bulbs with 2% defect rate. Machine B produces 30% of bulbs with 6% defect rate. A randomly selected bulb is defective. What is the probability that it came from Machine B?',
    expectedDomain: 'PROBABILITY',
    expectedSubtype: 'BAYES_INVERSE_PROBABILITY',
    expectedValue: '56.25% (0.5625)',
    verifyFn: (content) => content.includes('56.25%') || content.includes('0.5625') || content.includes('9/16')
  },
  {
    id: 6,
    tier: 'STATISTICS_PARADOX',
    name: "6. Simpson's Paradox Explanation",
    prompt: "Explain Simpson's Paradox with a simple numerical example of two hospitals.",
    expectedDomain: 'STATISTICS',
    expectedSubtype: 'SIMPSONS_PARADOX',
    expectedValue: 'Aggregation weighting reversal',
    verifyFn: (content) => content.toLowerCase().includes('simpson') && (content.toLowerCase().includes('subgroup') || content.toLowerCase().includes('aggregate') || content.toLowerCase().includes('weight'))
  },
  {
    id: 7,
    tier: 'PHYSICS_WORD_PROBLEM',
    name: '7. Physics Kinematics (Projectile Motion)',
    prompt: 'A projectile is launched from ground level at 20 m/s at an angle of 30 degrees above the horizontal. Assuming g = 9.8 m/s^2 and no air resistance, find the maximum height and total flight time.',
    expectedDomain: 'PHYSICS',
    expectedSubtype: 'PROJECTILE_KINEMATICS',
    expectedValue: 'H_max ≈ 5.10m, T_flight ≈ 2.04s',
    verifyFn: (content) => (content.includes('5.1') || content.includes('5.10')) && (content.includes('2.04') || content.includes('2.0'))
  },
  {
    id: 8,
    tier: 'MIXED_HYBRID',
    name: '8. Hybrid Population Ratio (72/120 = 60%)',
    prompt: 'I have 120 students. 72 passed the exam. Is it correct to say that 60% of the students passed? Explain briefly why.',
    expectedDomain: 'UNKNOWN', // hybrid / semantic
    expectedSubtype: 'GENERAL_REASONING',
    expectedValue: '60% (Correct)',
    verifyFn: (content) => content.includes('60%') && (content.toLowerCase().includes('yes') || content.toLowerCase().includes('correct'))
  }
];

async function measureRawOllama(prompt) {
  const start = Date.now();
  const payload = JSON.stringify({
    model: 'pythos:latest',
    messages: [{ role: 'user', content: prompt }],
    stream: false,
    options: { temperature: 0.1 }
  });

  return new Promise((resolve) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: 11434,
      path: '/api/chat',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: 120000
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        const totalTime = Date.now() - start;
        try {
          const json = JSON.parse(body);
          const evalCount = json.eval_count || 0;
          const evalDurationNs = json.eval_duration || 1;
          const promptEvalDurationNs = json.prompt_eval_duration || 1;
          const evalDurationMs = evalDurationNs / 1e6;
          const promptEvalMs = promptEvalDurationNs / 1e6;
          const tokPerSec = evalCount / (evalDurationNs / 1e9);

          resolve({
            ok: true,
            totalMs: totalTime,
            evalCount,
            tokPerSec: parseFloat(tokPerSec.toFixed(2)),
            promptEvalMs: Math.round(promptEvalMs),
            evalMs: Math.round(evalDurationMs),
            content: (json.message && json.message.content) ? json.message.content : ''
          });
        } catch (e) {
          resolve({ ok: false, error: e.message, totalMs: totalTime });
        }
      });
    });
    req.on('error', (e) => resolve({ ok: false, error: e.message, totalMs: Date.now() - start }));
    req.write(payload);
    req.end();
  });
}

async function measurePythosGateway(prompt) {
  const start = Date.now();
  const payload = JSON.stringify({
    messages: [{ role: 'user', content: prompt }]
  });

  return new Promise((resolve) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: 3006,
      path: '/api/chat',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: 120000
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        const totalTime = Date.now() - start;
        try {
          const json = JSON.parse(body);
          resolve({
            ok: res.statusCode === 200,
            statusCode: res.statusCode,
            totalMs: totalTime,
            deterministic: !!json.deterministic,
            model: json.model || 'unknown',
            content: (json.message && json.message.content) ? json.message.content : ''
          });
        } catch (e) {
          resolve({ ok: false, statusCode: res.statusCode, error: e.message, totalMs: totalTime });
        }
      });
    });
    req.on('error', (e) => resolve({ ok: false, error: e.message, totalMs: Date.now() - start }));
    req.write(payload);
    req.end();
  });
}

async function runBenchmarkSuite() {
  console.log("=======================================================================");
  console.log("⏱️  PYTHOS PRE-LIVE VALIDATION & PERFORMANCE BENCHMARK");
  console.log("=======================================================================\n");

  const results = [];

  for (const tc of BENCHMARK_CASES) {
    console.log(`-----------------------------------------------------------------------`);
    console.log(`▶ [PROMPT ${tc.id}/${BENCHMARK_CASES.length}] ${tc.name}`);
    console.log(`  Query: "${tc.prompt.replace(/\n/g, ' ')}"`);

    // 1. Classification & Routing Analysis
    const classification = classifyProblem(tc.prompt);
    const preflightFacts = extractPreflightDeterministicFacts(tc.prompt);
    console.log(`  [CLASSIFIER] Domain: ${classification.problemDomain} | Subtype: ${classification.problemSubtype} | Conf: ${classification.confidence}`);
    console.log(`  [ROUTING] Short-Circuit: ${classification.canShortCircuit} | Deterministic Work: ${classification.deterministicWorkAvailable}`);
    if (classification.constraints.length > 0) {
      console.log(`  [CONSTRAINTS] ${classification.constraints.join('; ')}`);
    }

    // 2. Gateway Measure
    const pythosRes = await measurePythosGateway(tc.prompt);
    console.log(`  [GATEWAY] Total Latency: ${pythosRes.totalMs} ms (Status: ${pythosRes.statusCode || 200}, Deterministic: ${pythosRes.deterministic})`);

    // 3. Raw Ollama Inference Measure
    let rawRes = null;
    if (!pythosRes.deterministic) {
      rawRes = await measureRawOllama(tc.prompt);
      if (rawRes.ok) {
        console.log(`  [RAW OLLAMA] Inference: ${rawRes.totalMs} ms (Tokens: ${rawRes.evalCount}, Speed: ${rawRes.tokPerSec} t/s, PromptEval: ${rawRes.promptEvalMs}ms)`);
      } else {
        console.log(`  [RAW OLLAMA] Error: ${rawRes.error}`);
      }
    } else {
      console.log(`  [RAW OLLAMA] 0 ms (0 AI calls — Direct Deterministic Engine)`);
    }

    // 4. Correctness Check
    const isCorrect = tc.verifyFn(pythosRes.content);
    console.log(`  [CORRECTNESS] ${isCorrect ? '✅ VERIFIED ACCURATE' : '❌ INCORRECT / UNVERIFIED'}`);
    if (!isCorrect) {
      console.log(`  Snippet: ${pythosRes.content.slice(0, 150)}...`);
    }

    results.push({
      id: tc.id,
      name: tc.name,
      domain: classification.problemDomain,
      subtype: classification.problemSubtype,
      shortCircuit: classification.canShortCircuit,
      pythosMs: pythosRes.totalMs,
      rawOllamaMs: rawRes ? rawRes.totalMs : 0,
      tokPerSec: rawRes ? rawRes.tokPerSec : 0,
      tokens: rawRes ? rawRes.evalCount : 0,
      aiCalls: pythosRes.deterministic ? 0 : 1,
      correct: isCorrect
    });
  }

  console.log("\n=======================================================================");
  console.log("📊 COMPLETE BENCHMARK TELEMETRY & ROUTING TABLE");
  console.log("=======================================================================");
  console.table(results.map(r => ({
    Test: r.name.slice(0, 30),
    Domain: r.domain,
    Subtype: r.subtype.slice(0, 20),
    "Gateway (ms)": r.pythosMs,
    "AI Calls": r.aiCalls,
    "Raw Ollama (ms)": r.rawOllamaMs || "0 (N/A)",
    "Tokens/sec": r.tokPerSec || "N/A",
    Correct: r.correct ? "✅ YES" : "❌ NO"
  })));
}

runBenchmarkSuite();
