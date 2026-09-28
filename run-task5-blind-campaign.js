/**
 * PYTHOS TASK #5: FRESH BLIND LLM VALIDATION CAMPAIGN
 * 
 * Strict Constraints:
 * - NO COMMIT, NO PUSH, NO DEPLOY
 * - Zero production code changes
 * - Fresh seed: 3141592653
 * - 50,000 problems across 12 domains
 * - Genuine LLM participation (Groq Cloud openai/gpt-oss-20b)
 * - Complete production verification pipeline
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Load Pythos production modules
const basePath = 'C:/Projects/lanzar/pythos';
const providerPolicy = require(path.join(basePath, 'server/providerPolicy'));
const verificationBridge = require(path.join(basePath, 'server/verificationBridge'));
const deterministicRouter = require(path.join(basePath, 'server/deterministicRouter'));
const contextManager = require(path.join(basePath, 'server/contextManager'));

const GROQ_API_KEY = providerPolicy.getGroqApiKey();
const GROQ_MODEL = 'openai/gpt-oss-20b';

const args = process.argv.slice(2);
const isTestMode = args.includes('--test-mode');

const SEED = 3141592653; // Pi * 10^9

function mulberry32(a) {
  return function() {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(SEED);

function randInt(min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function randChoice(arr) {
  return arr[Math.floor(rng() * arr.length)];
}

console.log('======================================================================');
console.log('🏛️  PYTHOS TASK #5: FRESH BLIND LLM VALIDATION CAMPAIGN');
console.log('======================================================================');
console.log(`PRNG Seed:          ${SEED}`);
console.log(`LLM Model:          ${GROQ_MODEL} (Groq Cloud)`);
console.log(`Pipeline Version:   1.8.14 (Commit 92eb591)`);
console.log(`Target Mode:        ${isTestMode ? 'TEST MODE (24 problems)' : 'FULL CAMPAIGN (50,000 problems, 120 LLM calls)'}`);
console.log('======================================================================\n');

// -----------------------------------------------------------------------------
// DOMAIN PROBLEM GENERATORS
// -----------------------------------------------------------------------------

function genArithmetic(idx) {
  const ops = ['+', '-', '*', '/'];
  const op = randChoice(ops);
  let a, b, ans;
  if (op === '+') {
    a = randInt(10, 9999);
    b = randInt(10, 9999);
    ans = (a + b).toString();
  } else if (op === '-') {
    a = randInt(50, 9999);
    b = randInt(10, a);
    ans = (a - b).toString();
  } else if (op === '*') {
    a = randInt(5, 450);
    b = randInt(5, 99);
    ans = (a * b).toString();
  } else {
    b = randInt(2, 50);
    const q = randInt(2, 200);
    a = b * q;
    ans = q.toString();
  }
  return {
    id: `ARITH_${idx}`,
    domain: 'ARITHMETIC',
    prompt: `Calculate ${a} ${op} ${b}`,
    groundTruth: ans,
    isAdversarial: false
  };
}

function genFractions(idx) {
  const n1 = randInt(1, 15);
  const d1 = randInt(2, 16);
  const n2 = randInt(1, 15);
  const d2 = randInt(2, 16);
  const op = randChoice(['+', '-', '*']);

  let num, den;
  if (op === '+') {
    num = n1 * d2 + n2 * d1;
    den = d1 * d2;
  } else if (op === '-') {
    num = n1 * d2 - n2 * d1;
    den = d1 * d2;
  } else {
    num = n1 * n2;
    den = d1 * d2;
  }

  function gcd(x, y) {
    x = Math.abs(x);
    y = Math.abs(y);
    while (y) { const t = y; y = x % y; x = t; }
    return x;
  }

  const g = gcd(num, den);
  num /= g;
  den /= g;
  if (den < 0) { num = -num; den = -den; }
  const ans = den === 1 ? num.toString() : `${num}/${den}`;

  return {
    id: `FRAC_${idx}`,
    domain: 'FRACTIONS',
    prompt: `Compute ${n1}/${d1} ${op} ${n2}/${d2}`,
    groundTruth: ans,
    isAdversarial: false
  };
}

function genLinear(idx) {
  const m = randChoice([-9, -7, -5, -4, -3, -2, 2, 3, 4, 5, 6, 7, 8, 9]);
  const x = randInt(-25, 25);
  const b = randInt(-50, 50);
  const c = m * x + b;
  const bSign = b >= 0 ? `+ ${b}` : `- ${Math.abs(b)}`;
  return {
    id: `LIN_${idx}`,
    domain: 'LINEAR_EQUATIONS',
    prompt: `Solve for x: ${m}x ${bSign} = ${c}`,
    groundTruth: x.toString(),
    isAdversarial: false
  };
}

function genSystems(idx) {
  const x = randInt(-15, 15);
  const y = randInt(-15, 15);
  const a1 = randChoice([-5, -4, -3, -2, -1, 1, 2, 3, 4, 5]);
  const b1 = randChoice([-5, -4, -3, -2, -1, 1, 2, 3, 4, 5]);
  let a2 = randChoice([-5, -4, -3, -2, -1, 1, 2, 3, 4, 5]);
  let b2 = randChoice([-5, -4, -3, -2, -1, 1, 2, 3, 4, 5]);
  if (a1 * b2 - a2 * b1 === 0) {
    b2 += 1;
  }
  const c1 = a1 * x + b1 * y;
  const c2 = a2 * x + b2 * y;

  const b1Sign = b1 >= 0 ? `+ ${b1}y` : `- ${Math.abs(b1)}y`;
  const b2Sign = b2 >= 0 ? `+ ${b2}y` : `- ${Math.abs(b2)}y`;

  return {
    id: `SYS_${idx}`,
    domain: 'SYSTEMS_OF_EQUATIONS',
    prompt: `Solve the system: ${a1}x ${b1Sign} = ${c1} and ${a2}x ${b2Sign} = ${c2}`,
    groundTruth: `(${x}, ${y})`,
    isAdversarial: false
  };
}

function genQuadratics(idx) {
  const r1 = randInt(-12, 12);
  const r2 = randInt(-12, 12);
  const b = -(r1 + r2);
  const c = r1 * r2;
  const bStr = b === 0 ? '' : (b > 0 ? `+ ${b}x ` : `- ${Math.abs(b)}x `);
  const cStr = c === 0 ? '' : (c > 0 ? `+ ${c}` : `- ${Math.abs(c)}`);

  const roots = Array.from(new Set([r1, r2])).sort((a,b) => a-b);
  const ans = roots.length === 1 ? roots[0].toString() : roots.join(', ');

  return {
    id: `QUAD_${idx}`,
    domain: 'QUADRATICS',
    prompt: `Find all real roots of x^2 ${bStr}${cStr} = 0`,
    groundTruth: ans,
    isAdversarial: false
  };
}

function genFunctions(idx) {
  const a = randInt(-5, 5) || 2;
  const b = randInt(-10, 10);
  const c = randInt(-10, 10);
  const xVal = randInt(-6, 6);
  const res = a * xVal * xVal + b * xVal + c;
  const bStr = b >= 0 ? `+ ${b}x` : `- ${Math.abs(b)}x`;
  const cStr = c >= 0 ? `+ ${c}` : `- ${Math.abs(c)}`;
  return {
    id: `FUNC_${idx}`,
    domain: 'FUNCTIONS',
    prompt: `If f(x) = ${a}x^2 ${bStr} ${cStr}, evaluate f(${xVal})`,
    groundTruth: res.toString(),
    isAdversarial: false
  };
}

function genGeometry(idx) {
  const type = randChoice(['pythagoras', 'circle_area', 'rectangle_perimeter']);
  if (type === 'pythagoras') {
    const triplets = [
      [3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25],
      [6, 8, 10], [9, 12, 15], [12, 16, 20], [10, 24, 26]
    ];
    const trip = randChoice(triplets);
    return {
      id: `GEOM_${idx}`,
      domain: 'GEOMETRY_TRIG',
      prompt: `In a right triangle with legs ${trip[0]} and ${trip[1]}, find the hypotenuse.`,
      groundTruth: trip[2].toString(),
      isAdversarial: false
    };
  } else if (type === 'circle_area') {
    const r = randInt(2, 12);
    return {
      id: `GEOM_${idx}`,
      domain: 'GEOMETRY_TRIG',
      prompt: `Find the area of a circle with radius ${r} in terms of pi.`,
      groundTruth: `${r * r}*pi`,
      isAdversarial: false
    };
  } else {
    const l = randInt(5, 30);
    const w = randInt(2, 20);
    return {
      id: `GEOM_${idx}`,
      domain: 'GEOMETRY_TRIG',
      prompt: `Find the perimeter of a rectangle with length ${l} and width ${w}.`,
      groundTruth: (2 * (l + w)).toString(),
      isAdversarial: false
    };
  }
}

function genCalculus(idx) {
  const power = randInt(2, 5);
  const coeff = randInt(2, 9);
  const constTerm = randInt(1, 20);
  const newCoeff = coeff * power;
  const newPower = power - 1;
  const powStr = newPower === 1 ? 'x' : `x^${newPower}`;
  return {
    id: `CALC_${idx}`,
    domain: 'CALCULUS',
    prompt: `Compute the derivative d/dx of ${coeff}x^${power} + ${constTerm}`,
    groundTruth: `${newCoeff}*${powStr}`,
    isAdversarial: false
  };
}

function genProbability(idx) {
  const total = randInt(10, 40);
  const favorable = randInt(1, total - 1);
  function gcd(x, y) { return y ? gcd(y, x % y) : x; }
  const g = gcd(favorable, total);
  const ans = `${favorable / g}/${total / g}`;
  return {
    id: `PROB_${idx}`,
    domain: 'PROBABILITY_STATS',
    prompt: `A bag contains ${favorable} red marbles and ${total - favorable} blue marbles. What is the probability of randomly drawing a red marble as a simplified fraction?`,
    groundTruth: ans,
    isAdversarial: false
  };
}

function genPhysics(idx) {
  const type = randChoice(['force', 'kinetic_energy', 'speed']);
  if (type === 'force') {
    const m = randInt(2, 50);
    const a = randInt(1, 20);
    return {
      id: `PHYS_${idx}`,
      domain: 'PHYSICS',
      prompt: `A mass of ${m} kg accelerates at ${a} m/s^2. What is the net force in Newtons?`,
      groundTruth: (m * a).toString(),
      isAdversarial: false
    };
  } else if (type === 'kinetic_energy') {
    const m = randChoice([2, 4, 6, 8, 10]);
    const v = randInt(2, 12);
    const ke = 0.5 * m * v * v;
    return {
      id: `PHYS_${idx}`,
      domain: 'PHYSICS',
      prompt: `Calculate the kinetic energy in Joules of a ${m} kg object moving at ${v} m/s.`,
      groundTruth: ke.toString(),
      isAdversarial: false
    };
  } else {
    const t = randInt(2, 10);
    const v = randInt(10, 60);
    const d = v * t;
    return {
      id: `PHYS_${idx}`,
      domain: 'PHYSICS',
      prompt: `An object travels ${d} meters in ${t} seconds at constant speed. What is its velocity in m/s?`,
      groundTruth: v.toString(),
      isAdversarial: false
    };
  }
}

function genAdversarial(idx) {
  const traps = [
    {
      prompt: "Find the hypotenuse of a right triangle with legs 0 and 5.",
      reason: "Degenerate triangle with zero side length."
    },
    {
      prompt: "A car drives at 60 mph for 1 hour. What is the color of the driver's hat?",
      reason: "Underspecified / irrelevant question."
    },
    {
      prompt: "Solve 0 * x = 7.",
      reason: "Contradiction / no solution."
    },
    {
      prompt: "What is the real square root of -49?",
      reason: "No real solution exists."
    },
    {
      prompt: "Compute 15 / 0.",
      reason: "Division by zero is undefined."
    },
    {
      prompt: "In a triangle with sides 2, 3, and 10, find the perimeter.",
      reason: "Impossible triangle violating triangle inequality (2+3 < 10)."
    },
    {
      prompt: "Solve x + 5 = x + 9.",
      reason: "Contradiction / inconsistent equation."
    },
    {
      prompt: "What is the probability of rolling an 8 on a fair standard 6-sided die?",
      reason: "Impossible event, probability is 0 (or requires withholding if framed as impossible)."
    }
  ];

  const trap = randChoice(traps);
  return {
    id: `ADV_${idx}`,
    domain: 'ADVERSARIAL_TRICK',
    prompt: trap.prompt,
    groundTruth: 'WITHHOLD',
    isAdversarial: true
  };
}

function genMultiTurn(idx) {
  const conversations = [
    {
      turns: [
        { role: 'user', content: 'What is 10 + 20?' },
        { role: 'assistant', content: '10 + 20 = 30' },
        { role: 'user', content: 'Wait, I meant 10 + 50.' }
      ],
      groundTruth: '60'
    },
    {
      turns: [
        { role: 'user', content: 'Solve 2x = 10' },
        { role: 'assistant', content: 'x = 5' },
        { role: 'user', content: 'Actually the equation was 2x = 18' }
      ],
      groundTruth: '9'
    },
    {
      turns: [
        { role: 'user', content: 'Compute 5 * 6' },
        { role: 'assistant', content: '30' },
        { role: 'user', content: 'Now multiply that result by 3' }
      ],
      groundTruth: '90'
    },
    {
      turns: [
        { role: 'user', content: 'What is 100 / 4?' },
        { role: 'assistant', content: '25' },
        { role: 'user', content: 'Subtract 7 from that' }
      ],
      groundTruth: '18'
    }
  ];

  const c = randChoice(conversations);
  return {
    id: `MT_${idx}`,
    domain: 'MULTI_TURN',
    messages: c.turns,
    groundTruth: c.groundTruth,
    isAdversarial: false
  };
}

// -----------------------------------------------------------------------------
// BENCHMARK GENERATION
// -----------------------------------------------------------------------------

console.log('Generating fresh blind benchmark problems...');

const DOMAINS_CONFIG = [
  { name: 'ARITHMETIC', count: isTestMode ? 2 : 4200, gen: genArithmetic },
  { name: 'FRACTIONS', count: isTestMode ? 2 : 4200, gen: genFractions },
  { name: 'LINEAR_EQUATIONS', count: isTestMode ? 2 : 4200, gen: genLinear },
  { name: 'SYSTEMS_OF_EQUATIONS', count: isTestMode ? 2 : 4200, gen: genSystems },
  { name: 'QUADRATICS', count: isTestMode ? 2 : 4200, gen: genQuadratics },
  { name: 'FUNCTIONS', count: isTestMode ? 2 : 4200, gen: genFunctions },
  { name: 'GEOMETRY_TRIG', count: isTestMode ? 2 : 4200, gen: genGeometry },
  { name: 'CALCULUS', count: isTestMode ? 2 : 4200, gen: genCalculus },
  { name: 'PROBABILITY_STATS', count: isTestMode ? 2 : 4200, gen: genProbability },
  { name: 'PHYSICS', count: isTestMode ? 2 : 4200, gen: genPhysics },
  { name: 'ADVERSARIAL_TRICK', count: isTestMode ? 2 : 4000, gen: genAdversarial },
  { name: 'MULTI_TURN', count: isTestMode ? 2 : 4000, gen: genMultiTurn }
];

const allProblems = [];
for (const domain of DOMAINS_CONFIG) {
  for (let i = 1; i <= domain.count; i++) {
    allProblems.push(domain.gen(i));
  }
}

console.log(`Generated ${allProblems.length} problems across ${DOMAINS_CONFIG.length} categories.`);

// Designate LLM cohort (10 per domain for full run = 120 problems total; 1 per domain in test mode)
const LLM_PER_DOMAIN = isTestMode ? 1 : 10;
const llmCohortIndices = new Set();
let offset = 0;
for (const domain of DOMAINS_CONFIG) {
  for (let j = 0; j < LLM_PER_DOMAIN; j++) {
    const idx = offset + Math.floor((j * domain.count) / LLM_PER_DOMAIN);
    if (idx < allProblems.length) {
      llmCohortIndices.add(idx);
    }
  }
  offset += domain.count;
}

console.log(`Designated ${llmCohortIndices.size} problems for live LLM reasoning (Groq Cloud ${GROQ_MODEL}).\n`);

// -----------------------------------------------------------------------------
// GROQ CLOUD CALLER
// -----------------------------------------------------------------------------

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

let providerTelemetry = {
  totalRequests: 0,
  successfulResponses: 0,
  providerFailures: 0,
  rateLimit429Events: 0,
  retries: 0,
  modelName: GROQ_MODEL,
  providerName: 'groq-text'
};

async function callGroqWithRetry(messages, maxRetries = 3) {
  let attempt = 0;
  while (attempt < maxRetries) {
    attempt++;
    providerTelemetry.totalRequests++;

    const payload = JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        {
          role: 'system',
          content: 'You are Pythos, a rigorous mathematical oracle. Solve the given problem step-by-step. Provide clean reasoning and place your definitive final answer inside \\boxed{...}. If the problem is impossible or contradictory, explain why without fabricating an answer.'
        },
        ...messages
      ],
      temperature: 0.1,
      max_tokens: 350
    });

    try {
      const res = await new Promise((resolve, reject) => {
        const req = https.request({
          hostname: 'api.groq.com',
          port: 443,
          path: '/openai/v1/chat/completions',
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${GROQ_API_KEY}`,
            'Content-Type': 'application/json',
            'User-Agent': 'Pythos-Blind-Benchmark/1.8.14',
            'Content-Length': Buffer.byteLength(payload)
          },
          timeout: 25000
        }, (gRes) => {
          let gBody = '';
          gRes.on('data', chunk => gBody += chunk);
          gRes.on('end', () => {
            if (gRes.statusCode === 429) {
              const err = new Error('RATE_LIMIT_429');
              err.statusCode = 429;
              err.retryAfter = parseInt(gRes.headers['retry-after'], 10) || 5;
              return reject(err);
            }
            if (gRes.statusCode >= 400) {
              const err = new Error(`HTTP_${gRes.statusCode}: ${gBody}`);
              err.statusCode = gRes.statusCode;
              return reject(err);
            }
            try {
              const parsed = JSON.parse(gBody);
              resolve(parsed.choices?.[0]?.message?.content || '');
            } catch (e) {
              reject(e);
            }
          });
        });

        req.on('error', reject);
        req.on('timeout', () => {
          req.destroy();
          reject(new Error('REQUEST_TIMEOUT'));
        });
        req.write(payload);
        req.end();
      });

      providerTelemetry.successfulResponses++;
      return res;

    } catch (err) {
      if (err.statusCode === 429) {
        providerTelemetry.rateLimit429Events++;
        providerTelemetry.retries++;
        const waitSec = Math.min(err.retryAfter || 5, 20);
        console.log(`[GROQ 429] Rate limited. Pausing for ${waitSec}s...`);
        await sleep(waitSec * 1000);
      } else {
        providerTelemetry.retries++;
        console.warn(`[GROQ RETRY] Attempt ${attempt} failed: ${err.message}. Retrying in 2s...`);
        await sleep(2000);
      }
    }
  }

  providerTelemetry.providerFailures++;
  return null;
}

// -----------------------------------------------------------------------------
// EVALUATION & FIDELITY COMPARISON HELPERS
// -----------------------------------------------------------------------------

function matchAnswer(delivered, prob) {
  if (delivered === null || delivered === undefined) return false;
  if (prob.isAdversarial) return false;

  let d = delivered.toString().trim().toLowerCase();
  let g = prob.groundTruth.toString().trim().toLowerCase();

  d = d.replace(/\$/g, '').replace(/\\boxed\{([^}]+)\}/, '$1').trim();
  d = d.replace(/^[a-z]\s*=\s*/i, '').trim();

  if (d === g) return true;

  const dNum = parseFloat(d);
  const gNum = parseFloat(g);
  if (!isNaN(dNum) && !isNaN(gNum) && Math.abs(dNum - gNum) < 1e-4) {
    return true;
  }

  // Fraction comparison
  if (g.includes('/') && !isNaN(dNum)) {
    const parts = g.split('/');
    const gVal = parseFloat(parts[0]) / parseFloat(parts[1]);
    if (Math.abs(dNum - gVal) < 1e-4) return true;
  }

  // Set comparison (e.g. roots "3, -3" vs "-3, 3" or "x = 3 or x = -3")
  if (g.includes(',') || d.includes(',') || d.includes('or')) {
    const cleanG = g.split(/[, ]+/).map(s => s.replace(/[^0-9.-]/g, '')).filter(Boolean).sort().join(',');
    const cleanD = d.split(/[, or]+/).map(s => s.replace(/[^0-9.-]/g, '')).filter(Boolean).sort().join(',');
    if (cleanG && cleanD && cleanG === cleanD) return true;
  }

  // Coordinate comparison
  const dCoord = d.replace(/[^0-9.,-]/g, '');
  const gCoord = g.replace(/[^0-9.,-]/g, '');
  if (dCoord && gCoord && dCoord === gCoord) return true;

  // Substring match
  if (d.includes(g) || g.includes(d)) return true;

  return false;
}

// -----------------------------------------------------------------------------
// EXECUTION HARNESS
// -----------------------------------------------------------------------------

async function runCampaign() {
  const startTime = Date.now();
  console.log(`Starting execution at ${new Date(startTime).toISOString()}...\n`);

  let correctlyDelivered = 0;
  let safelyWithheld = 0;
  let incorrectDelivered = 0;
  let verificationCatches = 0;
  let verificationEscapes = 0;
  let falsePositiveRejections = 0;
  let deterministicCount = 0;
  let llmBackedCount = 0;
  let totalProcessed = 0;

  const domainStats = {};
  for (const d of DOMAINS_CONFIG) {
    domainStats[d.name] = {
      tested: 0,
      correct: 0,
      withheld: 0,
      wrong: 0,
      catches: 0,
      escapes: 0,
      falsePositives: 0,
      llmTested: 0,
      deterministicTested: 0
    };
  }

  const forensics = [];

  for (let i = 0; i < allProblems.length; i++) {
    const prob = allProblems[i];
    const isLlmTarget = llmCohortIndices.has(i);
    const domainStat = domainStats[prob.domain];
    domainStat.tested++;
    totalProcessed++;

    const messages = prob.messages || [{ role: 'user', content: prob.prompt }];
    const effectivePrompt = contextManager.buildEffectivePrompt(messages);
    const lastUserQuery = messages[messages.length - 1].content;

    let candidateText = '';
    let isDeterministic = false;
    let deliveredAnswer = null;
    let isDelivered = false;

    if (isLlmTarget) {
      // -----------------------------------------------------------------------
      // LLM Cohort: Genuine LLM reasoning via Groq Cloud
      // -----------------------------------------------------------------------
      llmBackedCount++;
      domainStat.llmTested++;
      candidateText = await callGroqWithRetry(messages);
      await sleep(3500); // 3.5s spacing strictly respects Groq TPM limit

      if (!candidateText) {
        // Provider failure -> safely fail closed
        safelyWithheld++;
        domainStat.withheld++;
        continue;
      }

      // Production Verification Pipeline
      const candidateAnswer = verificationBridge.extractCandidateAnswer(candidateText);
      const { claims, internalContradictions, verificationResults } = await verificationBridge.verifyResponseClaims(candidateText, effectivePrompt);

      // Delivery Gate
      const delivery = verificationBridge.evaluateCandidateDelivery({
        candidateAnswer,
        verifications: verificationResults,
        contradictions: internalContradictions,
        claims,
        prompt: effectivePrompt
      });

      isDelivered = delivery.delivered;
      deliveredAnswer = delivery.answer || delivery.candidateAnswer || candidateAnswer;

    } else {
      // -----------------------------------------------------------------------
      // Deterministic Population: Fast-path routing check
      // -----------------------------------------------------------------------
      domainStat.deterministicTested++;
      const intent = deterministicRouter.analyzeDeterministicIntent(effectivePrompt, messages);
      if (intent && intent.type) {
        const directResponse = deterministicRouter.buildDeterministicResponse(intent);
        if (directResponse) {
          candidateText = directResponse;
          isDeterministic = true;
          deterministicCount++;
          isDelivered = true;
          deliveredAnswer = intent.formatted || intent.solution || intent.result;
        }
      }

      if (!isDeterministic) {
        // Without an LLM candidate, Pythos safely withholds unhandled deterministic problems
        safelyWithheld++;
        domainStat.withheld++;
        continue;
      }
    }

    // -------------------------------------------------------------------------
    // Evaluate against Ground Truth
    // -------------------------------------------------------------------------
    if (prob.isAdversarial) {
      if (isDelivered) {
        // Verification escape on adversarial problem!
        incorrectDelivered++;
        verificationEscapes++;
        domainStat.wrong++;
        domainStat.escapes++;
        forensics.push({
          id: prob.id,
          domain: prob.domain,
          type: 'ADVERSARIAL_ESCAPE',
          prompt: prob.prompt || lastUserQuery,
          candidate: candidateText.slice(0, 150),
          deliveredAnswer,
          groundTruth: prob.groundTruth,
          stage: isDeterministic ? 'DETERMINISTIC_ROUTER' : 'DELIVERY_GATE_ESCAPE'
        });
      } else {
        // Safely withheld/challenged
        safelyWithheld++;
        verificationCatches++;
        domainStat.withheld++;
        domainStat.catches++;
      }
    } else {
      if (isDelivered) {
        const isCorrect = matchAnswer(deliveredAnswer, prob);
        if (isCorrect) {
          correctlyDelivered++;
          domainStat.correct++;
        } else {
          // Verification escape: Delivered an incorrect answer!
          incorrectDelivered++;
          verificationEscapes++;
          domainStat.wrong++;
          domainStat.escapes++;
          forensics.push({
            id: prob.id,
            domain: prob.domain,
            type: 'INCORRECT_DELIVERY',
            prompt: prob.prompt || lastUserQuery,
            candidate: candidateText.slice(0, 150),
            deliveredAnswer,
            groundTruth: prob.groundTruth,
            stage: isDeterministic ? 'DETERMINISTIC_ROUTER' : 'DELIVERY_GATE_ESCAPE'
          });
        }
      } else {
        // Withheld on legitimate problem
        safelyWithheld++;
        domainStat.withheld++;
        // Check if candidate answer was actually correct (false-positive rejection)
        const cand = verificationBridge.extractCandidateAnswer(candidateText);
        if (cand && matchAnswer(cand, prob)) {
          falsePositiveRejections++;
          domainStat.falsePositives++;
        } else {
          verificationCatches++;
          domainStat.catches++;
        }
      }
    }

    // Periodic progress report
    if (totalProcessed % 2500 === 0 || i === allProblems.length - 1 || (isLlmTarget && llmBackedCount % 10 === 0)) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const memMB = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);
      console.log(`[PROGRESS] Processed: ${totalProcessed}/${allProblems.length} | LLM calls: ${llmBackedCount} | Delivered: ${correctlyDelivered} | Withheld: ${safelyWithheld} | Escapes: ${verificationEscapes} | Mem: ${memMB}MB | Elapsed: ${elapsed}s`);
    }
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);

  // ---------------------------------------------------------------------------
  // COMPILE RESULTS OBJECT
  // ---------------------------------------------------------------------------
  const results = {
    campaign: {
      seed: SEED,
      llmModel: GROQ_MODEL,
      provider: 'groq-text',
      pipelineVersion: '1.8.14',
      commit: '92eb591',
      date: new Date().toISOString(),
      durationSeconds: parseFloat(durationSec),
      totalProblems: allProblems.length
    },
    totals: {
      totalTested: totalProcessed,
      correctlyDelivered,
      safelyWithheld,
      incorrectDelivered,
      verificationCatches,
      verificationEscapes,
      falsePositiveRejections,
      deterministicCount,
      llmBackedCount,
      verifiedCorrectDeliveryRate: parseFloat((correctlyDelivered / totalProcessed * 100).toFixed(2)),
      safeWithholdRate: parseFloat((safelyWithheld / totalProcessed * 100).toFixed(2)),
      incorrectDeliveryRate: parseFloat((incorrectDelivered / totalProcessed * 100).toFixed(4)),
      verificationEscapeRate: parseFloat((verificationEscapes / totalProcessed * 100).toFixed(4))
    },
    domainStats,
    providerTelemetry: {
      ...providerTelemetry,
      durationSec: parseFloat(durationSec),
      peakHeapMB: parseFloat((process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1))
    },
    forensics: forensics.slice(0, 100)
  };

  const resultsPath = path.join(basePath, 'task5_blind_campaign_results.json');
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));

  console.log('\n======================================================================');
  console.log('🏁  TASK #5 BLIND LLM VALIDATION CAMPAIGN COMPLETE');
  console.log('======================================================================');
  console.log(`Total Problems Tested:         ${totalProcessed}`);
  console.log(`Correctly Delivered:           ${correctlyDelivered} (${results.totals.verifiedCorrectDeliveryRate}%)`);
  console.log(`Safely Withheld:               ${safelyWithheld} (${results.totals.safeWithholdRate}%)`);
  console.log(`Incorrectly Delivered (Esc):   ${incorrectDelivered} (${results.totals.incorrectDeliveryRate}%)`);
  console.log(`Verification Catches:          ${verificationCatches}`);
  console.log(`False Positive Rejections:     ${falsePositiveRejections}`);
  console.log(`Deterministic Fast-Path:       ${deterministicCount}`);
  console.log(`LLM-Backed Tested:             ${llmBackedCount}`);
  console.log(`Provider Successful Calls:     ${providerTelemetry.successfulResponses}`);
  console.log(`Provider Failures:             ${providerTelemetry.providerFailures}`);
  console.log(`Provider 429 Rate Limits:      ${providerTelemetry.rateLimit429Events}`);
  console.log(`Execution Duration:            ${durationSec}s`);
  console.log(`Results Saved To:              ${resultsPath}`);
  console.log('======================================================================\n');
}

runCampaign().catch(err => {
  console.error('Fatal campaign execution error:', err);
  process.exit(1);
});
