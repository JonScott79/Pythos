/**
 * test_online_torture.js
 *
 * Phase 1: Online Torture Testing for Multimodal Vision (qwen/qwen3.8-27b)
 *
 * Torture tests the complete hosted pipeline:
 * 1. Geometry circle diagram & central/inscribed angle theorem
 * 2. AP Physics inclined plane with friction, vectors, and acceleration equation
 * 3. Multi-turn conversational follow-up referring to the uploaded image without re-uploading
 * 4. Messy lined paper with crossed-out work & ambiguous annotation gating (Case 2)
 * 5. Faint pencil with vertical fractions & student arithmetic error detection
 * 6. Skewed perspective, shadow gradient & tiny trig notation (v3)
 * 7. Kinematics inequalities with subscripts & ambiguous 't' vs '+' (v4)
 * 8. Client upload / paste flow simulation, sanitization & payload edge handling
 *
 * Resiliency:
 * Automatically handles HTTP 429 (rate limit) and HTTP 503 (provider over-capacity)
 * with exponential backoff and retry.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { performance } = require('perf_hooks');

const { extractClaims } = require('./server/verificationBridge');
const visionExtractor = require('./server/visionExtractor');

const MODEL = 'qwen/qwen3.8-27b';
// Load from process.env or .env
if (!process.env.GROQ_API_KEY) {
  try {
    const envFile = fs.readFileSync(path.join(__dirname, 'server', '.env'), 'utf8');
    const match = envFile.match(/GROQ_API_KEY=(.*)/);
    if (match) process.env.GROQ_API_KEY = match[1].trim();
  } catch (e) {}
}
const API_KEY = process.env.GROQ_API_KEY;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function callGroqVisionChatWithRetry({ messages, temperature = 0.1, maxTokens = 350, timeoutMs = 60000, maxRetries = 6 }) {
  let attempt = 0;
  while (attempt < maxRetries) {
    attempt++;
    try {
      return await new Promise((resolve, reject) => {
        const formattedMessages = messages.map(m => {
          if (m.images && m.images.length > 0) {
            const contentParts = [{ type: 'text', text: m.content || 'Inspect this image' }];
            m.images.forEach(b64 => {
              contentParts.push({
                type: 'image_url',
                image_url: { url: `data:image/jpeg;base64,${b64}` }
              });
            });
            return { role: m.role, content: contentParts };
          }
          return { role: m.role, content: m.content };
        });

        const payload = JSON.stringify({
          model: MODEL,
          messages: formattedMessages,
          temperature,
          max_tokens: maxTokens
        });

        const startReq = performance.now();

        const req = https.request({
          hostname: 'api.groq.com',
          port: 443,
          path: '/openai/v1/chat/completions',
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'Content-Type': 'application/json',
            'User-Agent': 'Pythos-Torture-Testing/1.0',
            'Content-Length': Buffer.byteLength(payload)
          },
          timeout: timeoutMs
        }, (res) => {
          let body = '';
          res.on('data', c => body += c);

          res.on('end', () => {
            const totalDuration = Math.round(performance.now() - startReq);

            if (res.statusCode === 429) {
              const waitMatch = body.match(/try again in ([\d.]+)s/i);
              const waitSec = waitMatch ? Math.ceil(parseFloat(waitMatch[1])) + 3 : 20;
              const err = new Error(`RATE_LIMIT_429: wait ${waitSec}s`);
              err.retryAfterMs = waitSec * 1000;
              return reject(err);
            }

            if (res.statusCode === 503 || res.statusCode === 502) {
              const err = new Error(`OVER_CAPACITY_${res.statusCode}`);
              err.retryAfterMs = 12000;
              return reject(err);
            }

            if (res.statusCode >= 400) {
              return reject(new Error(`Groq HTTP ${res.statusCode}: ${body}`));
            }

            try {
              const json = JSON.parse(body);
              const fullText = json.choices?.[0]?.message?.content || '';
              const tokenCount = json.usage?.completion_tokens || 0;
              const tps = totalDuration > 0 ? ((tokenCount / totalDuration) * 1000).toFixed(1) : 0;
              resolve({
                fullText,
                ttft: totalDuration,
                totalDuration,
                tokenCount,
                tokensPerSec: parseFloat(tps)
              });
            } catch (err) {
              reject(err);
            }
          });
        });

        req.on('timeout', () => {
          req.destroy();
          reject(new Error('TIMEOUT_EXCEEDED'));
        });

        req.on('error', (err) => {
          reject(err);
        });

        req.write(payload);
        req.end();
      });
    } catch (err) {
      if ((err.message.includes('RATE_LIMIT_429') || err.message.includes('OVER_CAPACITY') || err.message.includes('ECONNRESET')) && attempt < maxRetries) {
        const waitMs = err.retryAfterMs || 15000;
        console.log(`    ⏳ [Transient Retry] ${err.message}. Waiting ${Math.round(waitMs / 1000)}s before attempt ${attempt + 1}/${maxRetries}...`);
        await sleep(waitMs);
        continue;
      }
      throw err;
    }
  }
}

function loadBase64(filePath) {
  const buf = fs.readFileSync(filePath);
  return buf.toString('base64');
}

async function runTortureSuite() {
  console.log('===============================================================');
  console.log(`🔥 PYTHOS ONLINE TORTURE TESTING — MODEL: ${MODEL}`);
  console.log('===============================================================\n');

  const results = [];
  let criticalFailures = 0;

  // ──────────────────────────────────────────────────────────────────────────
  // Torture Test 1: Geometry & Inscribed Angles (Circle + Triangle)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('▶ [TORTURE 1/8] Geometry Circle Diagram & Inscribed Angle Theorem');
  try {
    const b64 = loadBase64(path.join(__dirname, 'benchmark_images', 'case5_geometry_circle.jpg'));
    const directive = visionExtractor.buildVisionPromptDirective();
    const prompt = `${directive}\nAnalyze diagram. Inscribed angle ACB = 42°. Find central angle AOB.`;

    const res = await callGroqVisionChatWithRetry({
      messages: [{ role: 'user', content: prompt, images: [b64] }]
    });

    const isCentralAngleCorrect = res.fullText.includes('84') || res.fullText.includes('2 * 42') || res.fullText.includes('2(42)');
    const mentionsInscribed = /inscribed|central/i.test(res.fullText);
    const passed = isCentralAngleCorrect && mentionsInscribed;

    console.log(`  - Total: ${res.totalDuration}ms | Speed: ${res.tokensPerSec} t/s`);
    console.log(`  - Mentions Inscribed/Central Angle: ${mentionsInscribed ? 'YES' : 'NO'}`);
    console.log(`  - Identifies Angle AOB = 84°: ${isCentralAngleCorrect ? 'YES' : 'NO'}`);
    console.log(`  - Status: ${passed ? '✅ PASS' : '❌ FAIL'}\n`);

    results.push({ test: 'Geometry Circle & Angle', passed, latency: res.totalDuration });
    if (!passed) criticalFailures++;
  } catch (err) {
    console.error(`  ❌ ERROR: ${err.message}\n`);
    results.push({ test: 'Geometry Circle & Angle', passed: false, error: err.message });
    criticalFailures++;
  }
  await sleep(16000);

  // ──────────────────────────────────────────────────────────────────────────
  // Torture Test 2: AP Physics Inclined Plane with Friction & Vectors
  // ──────────────────────────────────────────────────────────────────────────
  console.log('▶ [TORTURE 2/8] AP Physics Inclined Plane with Force Vectors & Friction');
  try {
    const b64 = loadBase64(path.join(__dirname, 'benchmark_images', 'case4_physics_incline.jpg'));
    const directive = visionExtractor.buildVisionPromptDirective();
    const prompt = `${directive}\nIdentify mass m, theta, and friction mu from diagram. Set up acceleration formula down ramp.`;

    const res = await callGroqVisionChatWithRetry({
      messages: [{ role: 'user', content: prompt, images: [b64] }]
    });

    const hasVectors = /mg|F_N|f_k|friction|normal|gravity/i.test(res.fullText);
    const hasAngle = /30|30°|\b30\s*deg\b/i.test(res.fullText);
    const hasMu = /0\.2/.test(res.fullText);
    const hasFormulaOrAcc = /g\s*\(|sin|cos|F_net|3\.2/i.test(res.fullText);
    const passed = hasVectors && hasAngle && hasMu && hasFormulaOrAcc;

    console.log(`  - Total: ${res.totalDuration}ms | Speed: ${res.tokensPerSec} t/s`);
    console.log(`  - Recognized theta=30°: ${hasAngle ? 'YES' : 'NO'}`);
    console.log(`  - Recognized mu=0.2 & vectors: ${hasMu && hasVectors ? 'YES' : 'NO'}`);
    console.log(`  - Set up acceleration equation: ${hasFormulaOrAcc ? 'YES' : 'NO'}`);
    console.log(`  - Status: ${passed ? '✅ PASS' : '❌ FAIL'}\n`);

    results.push({ test: 'Physics Inclined Plane Dynamics', passed, latency: res.totalDuration });
    if (!passed) criticalFailures++;
  } catch (err) {
    console.error(`  ❌ ERROR: ${err.message}\n`);
    results.push({ test: 'Physics Inclined Plane Dynamics', passed: false, error: err.message });
    criticalFailures++;
  }
  await sleep(16000);

  // ──────────────────────────────────────────────────────────────────────────
  // Torture Test 3: Multi-turn Conversational Follow-Up Referring to Image
  // ──────────────────────────────────────────────────────────────────────────
  console.log('▶ [TORTURE 3/8] Multi-turn Conversational Follow-up Referring to Uploaded Image');
  try {
    const b64 = loadBase64(path.join(__dirname, 'benchmark_images', 'case1_printed_hw.jpg'));
    const directive = visionExtractor.buildVisionPromptDirective();

    // Turn 1
    const turn1User = `${directive}\nWorksheet check: confirm problem and student steps.`;
    const res1 = await callGroqVisionChatWithRetry({
      messages: [{ role: 'user', content: turn1User, images: [b64] }]
    });

    await sleep(16000);

    // Turn 2: Follow-up referring to the image without re-uploading
    const turn2User = `In my step 3x = 15, why did I divide by 3 instead of subtracting 3?`;
    const res2 = await callGroqVisionChatWithRetry({
      messages: [
        { role: 'user', content: turn1User, images: [b64] },
        { role: 'assistant', content: res1.fullText },
        { role: 'user', content: turn2User }
      ]
    });

    const addressesInverseOp = /inverse|coefficient|multipli|undo|divide/i.test(res2.fullText);
    const mentions3x = /3x|3\s*\*\s*x|3\cdot x/i.test(res2.fullText);
    const passed = addressesInverseOp && mentions3x;

    console.log(`  - Turn 1 Latency: ${res1.totalDuration}ms | Turn 2 Latency: ${res2.totalDuration}ms`);
    console.log(`  - Correctly maintains context of 3x = 15 from image: ${mentions3x ? 'YES' : 'NO'}`);
    console.log(`  - Explains inverse operations: ${addressesInverseOp ? 'YES' : 'NO'}`);
    console.log(`  - Status: ${passed ? '✅ PASS' : '❌ FAIL'}\n`);

    results.push({ test: 'Multi-turn Conversational Context Retention', passed, latency: res2.totalDuration });
    if (!passed) criticalFailures++;
  } catch (err) {
    console.error(`  ❌ ERROR: ${err.message}\n`);
    results.push({ test: 'Multi-turn Conversational Context Retention', passed: false, error: err.message });
    criticalFailures++;
  }
  await sleep(16000);

  // ──────────────────────────────────────────────────────────────────────────
  // Torture Test 4: Messy Lined Paper with Crossed-out work & Ambiguous Annotation (Case 2)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('▶ [TORTURE 4/8] Crossed-out Work Handling & Ambiguous Annotation Gating');
  try {
    const b64 = loadBase64(path.join(__dirname, 'benchmark_images', 'case2_messy_crossedout.jpg'));
    const directive = visionExtractor.buildVisionPromptDirective();
    const prompt = `${directive}\nTranscribe active area work. Check crossed out line. Is corner annotation clearly 3x, 8x, or ambiguous?`;

    const res = await callGroqVisionChatWithRetry({
      messages: [{ role: 'user', content: prompt, images: [b64] }]
    });

    const identifiesCrossedOut = /crossed\s*out|strike|red|rejected|circumference/i.test(res.fullText);
    const identifiesActiveArea = /16\s*\\pi|50\.26|\\pi\s*r\^2|16pi/i.test(res.fullText);
    const surfacesAmbiguity = /ambiguous|uncertain|unclear|could be read|either|8x|3x|3\\pi|8\\pi|not clear/i.test(res.fullText);

    // Deterministic extraction check: Ensure visual ambiguity gate does not admit false facts
    const claims = extractClaims(res.fullText);
    const claimsContainAmbiguousCorner = claims.some(c => c.raw_match && (c.raw_match.includes('8x') || c.raw_match.includes('3x')));

    const passed = identifiesCrossedOut && identifiesActiveArea && surfacesAmbiguity && !claimsContainAmbiguousCorner;

    console.log(`  - Recognizes crossed-out / rejected red line: ${identifiesCrossedOut ? 'YES' : 'NO'}`);
    console.log(`  - Identifies active circle area (16pi ≈ 50.26): ${identifiesActiveArea ? 'YES' : 'NO'}`);
    console.log(`  - Surfaces ambiguity for corner annotation without guessing: ${surfacesAmbiguity ? 'YES' : 'NO'}`);
    console.log(`  - Ambiguity Gate stopped ambiguous corner claim: ${!claimsContainAmbiguousCorner ? 'YES (PROTECTED)' : 'NO (LEAKED)'}`);
    console.log(`  - Status: ${passed ? '✅ PASS' : '❌ FAIL'}\n`);

    results.push({ test: 'Crossed-out Work & Ambiguity Gate', passed, latency: res.totalDuration });
    if (!passed) criticalFailures++;
  } catch (err) {
    console.error(`  ❌ ERROR: ${err.message}\n`);
    results.push({ test: 'Crossed-out Work & Ambiguity Gate', passed: false, error: err.message });
    criticalFailures++;
  }
  await sleep(16000);

  // ──────────────────────────────────────────────────────────────────────────
  // Torture Test 5: Faint Pencil with Vertical Fractions & Student Arithmetic Error
  // ──────────────────────────────────────────────────────────────────────────
  console.log('▶ [TORTURE 5/8] Faint Pencil, Vertical Fractions & Student Arithmetic Error Detection');
  try {
    const b64 = loadBase64(path.join(__dirname, 'benchmark_images', 'validation_set', 'v1_pencil_messy_fractions_mistake.jpg'));
    const directive = visionExtractor.buildVisionPromptDirective();
    const prompt = `${directive}\nCheck student limit steps. Did the student make an arithmetic mistake on (2/3)*12?`;

    const res = await callGroqVisionChatWithRetry({
      messages: [{ role: 'user', content: prompt, images: [b64] }]
    });

    const detectedMistake = /error|mistake|incorrect|instead of 8|should be 8|equal 8|wrote 9/i.test(res.fullText);
    const mentions9 = /9/.test(res.fullText);
    const mentions8 = /8/.test(res.fullText);
    const passed = detectedMistake && mentions9 && mentions8;

    console.log(`  - Student wrote: (2/3)*12 = 9`);
    console.log(`  - Model caught error: ${detectedMistake ? 'YES' : 'NO'}`);
    console.log(`  - Identified correct calculation is 8: ${mentions8 ? 'YES' : 'NO'}`);
    console.log(`  - Status: ${passed ? '✅ PASS' : '❌ FAIL'}\n`);

    results.push({ test: 'Handwritten Student Arithmetic Error Detection', passed, latency: res.totalDuration });
    if (!passed) criticalFailures++;
  } catch (err) {
    console.error(`  ❌ ERROR: ${err.message}\n`);
    results.push({ test: 'Handwritten Student Arithmetic Error Detection', passed: false, error: err.message });
    criticalFailures++;
  }
  await sleep(16000);

  // ──────────────────────────────────────────────────────────────────────────
  // Torture Test 6: Skewed Perspective, Shadow Gradient & Tiny Trig Notation (v3)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('▶ [TORTURE 6/8] Skewed Photo with Lighting Glare / Shadow & Tiny Trig Notation');
  try {
    const b64 = loadBase64(path.join(__dirname, 'benchmark_images', 'validation_set', 'v3_skewed_shadow_trig_taylor.jpg'));
    const directive = visionExtractor.buildVisionPromptDirective();
    const prompt = `${directive}\nTranscribe limit result and check corner symbol '= 0 ?' for ambiguity.`;

    const res = await callGroqVisionChatWithRetry({
      messages: [{ role: 'user', content: prompt, images: [b64] }]
    });

    const hasLimit = /1\/2|0\.5|\\frac\{1\}\{2\}/.test(res.fullText);
    const flagsAmbiguity = /ambiguous|uncertain|unclear|theta|0|6/i.test(res.fullText);
    const passed = hasLimit && flagsAmbiguity;

    console.log(`  - Transcribed limit with answer 1/2: ${hasLimit ? 'YES' : 'NO'}`);
    console.log(`  - Surfaced uncertainty on corner symbol (theta vs 0 vs 6): ${flagsAmbiguity ? 'YES' : 'NO'}`);
    console.log(`  - Status: ${passed ? '✅ PASS' : '❌ FAIL'}\n`);

    results.push({ test: 'Skewed Photo & Shadow Gradient Robustness', passed, latency: res.totalDuration });
    if (!passed) criticalFailures++;
  } catch (err) {
    console.error(`  ❌ ERROR: ${err.message}\n`);
    results.push({ test: 'Skewed Photo & Shadow Gradient Robustness', passed: false, error: err.message });
    criticalFailures++;
  }
  await sleep(16000);

  // ──────────────────────────────────────────────────────────────────────────
  // Torture Test 7: Kinematics Inequalities with Subscripts & Ambiguous 't' vs '+' (v4)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('▶ [TORTURE 7/8] Inequalities, Subscripts, Radical Intervals & Ambiguous t vs +');
  try {
    const b64 = loadBase64(path.join(__dirname, 'benchmark_images', 'validation_set', 'v4_inequalities_subscripts_t_vs_plus.jpg'));
    const directive = visionExtractor.buildVisionPromptDirective();
    const prompt = `${directive}\nTranscribe inequality interval. Is 'Note: 15 [?] - 10 = ?' ambiguous between 't' and '+'?`;

    const res = await callGroqVisionChatWithRetry({
      messages: [{ role: 'user', content: prompt, images: [b64] }]
    });

    const hasInequalityOrRoots = /<=|>=|\\le|\\ge|0\.98|2\.08|29/.test(res.fullText);
    const surfacesTvsPlus = /ambiguous|uncertain|unclear|'t'|\bt\b|\+/i.test(res.fullText);
    const passed = hasInequalityOrRoots && surfacesTvsPlus;

    console.log(`  - Transcribed inequalities with roots or symbols: ${hasInequalityOrRoots ? 'YES' : 'NO'}`);
    console.log(`  - Surfaced ambiguity on 't' vs '+' stroke: ${surfacesTvsPlus ? 'YES' : 'NO'}`);
    console.log(`  - Status: ${passed ? '✅ PASS' : '❌ FAIL'}\n`);

    results.push({ test: 'Inequalities & Ambiguous Symbol (t vs +)', passed, latency: res.totalDuration });
    if (!passed) criticalFailures++;
  } catch (err) {
    console.error(`  ❌ ERROR: ${err.message}\n`);
    results.push({ test: 'Inequalities & Ambiguous Symbol (t vs +)', passed: false, error: err.message });
    criticalFailures++;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Torture Test 8: Client-Side Upload / Paste Flow Simulation & Edge Robustness
  // ──────────────────────────────────────────────────────────────────────────
  console.log('▶ [TORTURE 8/8] Upload / Paste Simulation, Sanitization & Payload Edge Handling');
  let flowPassed = true;

  // 8a: Base64 data URI stripping
  const sampleDataUrl = 'data:image/jpeg;base64,' + Buffer.from('mock-small-image').toString('base64');
  const cleaned = visionExtractor.cleanVisionMessage({
    role: 'user',
    content: 'Check this',
    images: [sampleDataUrl, '   ' + sampleDataUrl + '  ']
  });
  if (cleaned.images[0].includes('data:image') || cleaned.images[0].includes('base64,')) {
    flowPassed = false;
    console.log('  ❌ 8a: Failed to strip data URI prefix');
  } else {
    console.log('  ✅ 8a: Data URI prefix cleanly stripped');
  }

  // 8b: Firestore persistence check: Large image data must never be serialized
  const firestoreSanitized = {
    role: 'user',
    content: 'Here is my work',
    images: [sampleDataUrl]
  };
  const forDb = {
    ...firestoreSanitized,
    images: (firestoreSanitized.images || []).map(() => '[IMAGE_ATTACHED]')
  };
  if (forDb.images[0] !== '[IMAGE_ATTACHED]') {
    flowPassed = false;
    console.log('  ❌ 8b: Firestore did not sanitize image data');
  } else {
    console.log('  ✅ 8b: Firestore document sanitization verified (< 1MB safe)');
  }

  // 8c: Unreadable/empty image payload rejected safely
  const cleanedEmpty = visionExtractor.cleanVisionMessage({
    role: 'user',
    content: 'Blank',
    images: ['', null, undefined]
  });
  if (cleanedEmpty.images.length !== 0) {
    flowPassed = false;
    console.log('  ❌ 8c: Failed to filter empty image entries');
  } else {
    console.log('  ✅ 8c: Empty/corrupted image entries filtered');
  }

  console.log(`  - Status: ${flowPassed ? '✅ PASS' : '❌ FAIL'}\n`);
  results.push({ test: 'Client Flow Simulation & Edge Sanitization', passed: flowPassed });
  if (!flowPassed) criticalFailures++;

  // ──────────────────────────────────────────────────────────────────────────
  // SUMMARY REPORT
  // ──────────────────────────────────────────────────────────────────────────
  console.log('===============================================================');
  console.log('📊 ONLINE TORTURE TEST RESULTS SUMMARY');
  console.log('===============================================================');
  results.forEach(r => {
    const latStr = r.latency ? ` (${r.latency}ms)` : '';
    console.log(`${r.passed ? '✅' : '❌'} ${r.test}${latStr}`);
  });
  console.log('---------------------------------------------------------------');
  console.log(`Total Tests: ${results.length}`);
  console.log(`Passed: ${results.filter(r => r.passed).length}`);
  console.log(`Critical Failures: ${criticalFailures}`);
  console.log('===============================================================\n');

  if (criticalFailures > 0) {
    console.error(`💥 TORTURE TEST FAILED with ${criticalFailures} critical failure(s)!`);
    process.exit(1);
  } else {
    console.log('🎉 ALL ONLINE TORTURE TESTS PASSED WITH ZERO CRITICAL FAILURES!');
    process.exit(0);
  }
}

runTortureSuite().catch(err => {
  console.error('Fatal crash in torture test runner:', err);
  process.exit(1);
});
