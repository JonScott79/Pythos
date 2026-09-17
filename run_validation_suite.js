/**
 * run_validation_suite.js
 *
 * Runs the deep handwriting validation suite against qwen/qwen3.8-27b.
 * Tests:
 * - Faint pencil & messy fractions with deliberate student arithmetic error.
 * - Multi-colored ink, crossed-out work, and ambiguous +/- vs + in margin.
 * - Skewed/angled photo with lighting shadow gradient and tiny handwriting (Taylor series / trig limits).
 * - Kinematics inequalities with sqrt, <=, >=, subscripts (t_1, t_2), and ambiguous 't' vs '+'.
 *
 * Evaluates:
 * 1. Transcription Accuracy (verbatim notation, symbols)
 * 2. Ambiguity Detection (surfacing uncertainty on degraded characters)
 * 3. End-to-end Pythos Pipeline Integration:
 *    Vision Extraction -> Context Management / Directives -> Mathematical Claim Extraction -> Deterministic CAS Verification
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { performance } = require('perf_hooks');

const { extractClaims, runDeterministicVerification, auditInternalConsistency } = require('./server/verificationBridge');
const visionExtractor = require('./server/visionExtractor');

const MODEL = 'qwen/qwen3.8-27b';
const API_KEY = process.env.GROQ_API_KEY || require('./server/providerPolicy').getGroqApiKey();

const VALIDATION_CASES = [
  {
    id: 'v1_pencil_messy_fractions_mistake',
    title: 'V1: Faint Pencil, Messy Fractions & Handwritten Arithmetic Error',
    file: path.join(__dirname, 'benchmark_images', 'validation_set', 'v1_pencil_messy_fractions_mistake.jpg'),
    prompt: `Carefully read this calculus worksheet.
1. Transcribe the printed problem statement.
2. Transcribe all student handwritten steps line-by-line.
3. Check each student step mathematically: did the student make a calculation mistake? If so, pinpoint the exact step.
4. Note any visual ambiguities or smudges.`
  },
  {
    id: 'v2_colored_ink_crossedout_ambiguity',
    title: 'V2: Multi-colored Ink (Blue/Black/Red), Crossed-out Work & Ambiguous Sign',
    file: path.join(__dirname, 'benchmark_images', 'validation_set', 'v2_colored_ink_crossedout_ambiguity.jpg'),
    prompt: `Analyze this quadratic formula solution.
1. Transcribe the printed problem statement.
2. Identify what was written in red ink and crossed out / rejected by the student.
3. Transcribe the active derivation lines in black ink.
4. CRITICAL AMBIGUITY CHECK: Look at the handwritten notation in the right margin ("x = 3 [?] sqrt(2)"). Is the symbol between 3 and sqrt(2) clearly a '+' or a '+/-'? Surface any visual ambiguity without guessing.`
  },
  {
    id: 'v3_skewed_shadow_trig_taylor',
    title: 'V3: Skewed Perspective, Shadow Gradient & Tiny Trig Notation',
    file: path.join(__dirname, 'benchmark_images', 'validation_set', 'v3_skewed_shadow_trig_taylor.jpg'),
    prompt: `Analyze this skewed photo with shadow gradient.
1. Transcribe the problem statement.
2. Transcribe the student's small handwritten derivation lines.
3. Identify mathematical symbols: theta, limits, fractions, factorials.
4. CRITICAL AMBIGUITY CHECK: In the lower right corner, there is a handwritten symbol "= 0 ?". Is that character definitively theta, 0, or 6? Flag any visual uncertainty.`
  },
  {
    id: 'v4_inequalities_subscripts_t_vs_plus',
    title: 'V4: Kinematics Inequalities, Subscripts, sqrt, <=, >=, and Ambiguous t vs +',
    file: path.join(__dirname, 'benchmark_images', 'validation_set', 'v4_inequalities_subscripts_t_vs_plus.jpg'),
    prompt: `Analyze this physics inequality problem.
1. Transcribe the problem statement and given initial parameters.
2. Transcribe the student's derivation of the inequality and quadratic roots.
3. Identify mathematical symbols: <=, >=, sqrt, subscripts (t_1, t_2).
4. CRITICAL AMBIGUITY CHECK: Examine the handwritten note on the right margin "Note: 15 [?] - 10 = ?". Could the cross-shaped character be interpreted as the variable 't' or the addition sign '+'? Explicitly surface this uncertainty.`
  }
];

function callGroqChatStream(model, promptText, b64Image) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model: model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: promptText },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64Image}` } }
          ]
        }
      ],
      stream: true,
      temperature: 0.1,
      max_tokens: 650
    });

    const startReq = performance.now();
    let ttft = null;
    let fullText = '';
    let tokenCount = 0;

    const req = https.request({
      hostname: 'api.groq.com',
      port: 443,
      path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Pythos-Validation-Suite/1.0',
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: 45000
    }, (res) => {
      if (res.statusCode >= 400) {
        let errBody = '';
        res.on('data', c => errBody += c);
        res.on('end', () => reject(new Error(`Groq HTTP ${res.statusCode}: ${errBody}`)));
        return;
      }

      let buffer = '';
      res.on('data', (chunk) => {
        if (ttft === null) {
          ttft = performance.now() - startReq;
        }
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (trimmed.startsWith('data: ')) {
            try {
              const data = JSON.parse(trimmed.slice(6));
              const delta = data.choices?.[0]?.delta?.content || '';
              if (delta) {
                fullText += delta;
                tokenCount++;
              }
            } catch (_) {}
          }
        }
      });

      res.on('end', () => {
        const totalDuration = performance.now() - startReq;
        resolve({
          ttft: ttft || totalDuration,
          totalDuration,
          tokenCount,
          fullText
        });
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('ETIMEDOUT'));
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function runValidation() {
  console.log('======================================================================');
  console.log('📝 RUNNING DEEP HANDWRITING VALIDATION SUITE AGAINST qwen/qwen3.8-27b');
  console.log('======================================================================\n');

  const report = {};

  for (const testCase of VALIDATION_CASES) {
    console.log(`\n▶ [${testCase.id}] ${testCase.title}`);
    const b64 = fs.readFileSync(testCase.file).toString('base64');

    let success = false;
    let attempts = 0;
    while (!success && attempts < 4) {
      attempts++;
      try {
        const resp = await callGroqChatStream(MODEL, testCase.prompt, b64);
        const tokPerSec = (resp.tokenCount / (resp.totalDuration / 1000)).toFixed(1);

        console.log(`  ✓ Inference completed in ${(resp.totalDuration / 1000).toFixed(2)}s | TTFT: ${(resp.ttft / 1000).toFixed(2)}s | ${resp.tokenCount} tokens (${tokPerSec} tok/s)`);

        // Pipeline stage 2: Normalization
        const normalized = visionExtractor.postProcessVisionResponse(resp.fullText);

        // Pipeline stage 3: Claim extraction
        const claims = extractClaims(normalized);
        const contradictions = auditInternalConsistency(claims);

        // Pipeline stage 4: Deterministic CAS verification
        const verifResults = [];
        for (const c of claims) {
          const v = await runDeterministicVerification(c);
          if (v) verifResults.push(v);
        }

        const validCount = verifResults.filter(v => v.verified === true).length;
        const invalidCount = verifResults.filter(v => v.verified === false && v.status !== 'UNKNOWN').length;

        console.log(`  ✓ Pipeline Verification: ${claims.length} claims extracted | ${validCount} valid | ${invalidCount} invalid`);

        report[testCase.id] = {
          title: testCase.title,
          elapsedSec: Number((resp.totalDuration / 1000).toFixed(2)),
          ttftSec: Number((resp.ttft / 1000).toFixed(2)),
          tokenCount: resp.tokenCount,
          tokPerSec: Number(tokPerSec),
          fullText: resp.fullText,
          normalizedText: normalized,
          claimsExtracted: claims.length,
          claimsValid: validCount,
          claimsInvalid: invalidCount,
          contradictions: contradictions.length,
          verificationSummary: verifResults.map(v => ({ claim: v.claim?.raw_match, verified: v.verified, exact: v.exact_value }))
        };

        success = true;
      } catch (err) {
        console.error(`  ✗ Attempt ${attempts} error:`, err.message);
        if (err.message.includes('429') || err.message.includes('rate_limit_exceeded')) {
          const match = err.message.match(/try again in ([0-9.]+)s/);
          const waitSec = match ? (parseFloat(match[1]) + 2) : 25;
          console.log(`  ⏳ Sleeping ${waitSec.toFixed(1)}s before retry...`);
          await new Promise(r => setTimeout(r, waitSec * 1000));
        } else {
          report[testCase.id] = { title: testCase.title, error: err.message };
          break;
        }
      }
    }

    console.log('  ... Pacing 22s for Groq ITPM/OTPM window ...');
    await new Promise(r => setTimeout(r, 22000));
  }

  fs.writeFileSync(
    path.join(__dirname, 'validation_suite_results.json'),
    JSON.stringify(report, null, 2),
    'utf-8'
  );

  console.log('\n======================================================================');
  console.log('✅ VALIDATION SUITE COMPLETE: Results saved to validation_suite_results.json');
  console.log('======================================================================\n');
}

runValidation().catch(console.error);
