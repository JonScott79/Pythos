/**
 * run_hosted_vision_benchmark.js
 * 
 * Runs full benchmark across:
 * - qwen/qwen3.6-27b
 * - qwen/qwen3.8-27b
 * 
 * Across 5 representative student homework cases:
 * Case 1: Printed problem + handwritten work (Algebra 1)
 * Case 2: Messy handwriting + crossed-out work + ambiguous (3x vs 8x vs 3pi) annotation
 * Case 3: Calculus fractions, limits, radicals, and inequalities
 * Case 4: Physics inclined plane diagram with force vectors & friction
 * Case 5: Geometry circle with inscribed angle theorem
 * 
 * Captures:
 * - TTFT, total latency, token count, tokens/sec
 * - Transcription text
 * - Ambiguity handling & confidence
 * - Pythos deterministic claim extraction & verifier execution
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { performance } = require('perf_hooks');

const { extractClaims, runDeterministicVerification, auditInternalConsistency } = require('./server/verificationBridge');
const visionExtractor = require('./server/visionExtractor');

const API_KEY = process.env.GROQ_API_KEY || require('./server/providerPolicy').getGroqApiKey();
const MODELS = ['qwen/qwen3.6-27b', 'qwen/qwen3.8-27b'];

const CASES = [
  {
    id: 'case1_printed_hw',
    title: 'Case 1: Clean Printed Problem + Handwritten Student Steps',
    file: path.join(__dirname, 'benchmark_images', 'case1_printed_hw.jpg'),
    prompt: `Analyze this image carefully.
1. Transcribe the printed problem statement exactly.
2. Transcribe the student's handwritten steps and final answer.
3. Identify whether the student's steps and final conclusion are correct or incorrect.
4. If anything is ambiguous or uncertain, explicitly state it.`
  },
  {
    id: 'case2_messy_crossedout',
    title: 'Case 2: Messy Handwriting, Crossed-Out Work & Ambiguous Annotation',
    file: path.join(__dirname, 'benchmark_images', 'case2_messy_crossedout.jpg'),
    prompt: `Analyze this student's homework page.
1. Transcribe the problem statement.
2. Identify what was crossed out / rejected by the student.
3. Transcribe the student's active/current working steps and answer.
4. CRITICAL: Examine the lower-right annotation. Is the handwritten token completely clear, or is it ambiguous (e.g. could it be 3x, 8x, or 3pi)? Do not guess—explicitly state your visual confidence and note any ambiguity.`
  },
  {
    id: 'case3_fractions_inequalities',
    title: 'Case 3: Handwritten Fractions, Exponents, Limits & Inequalities',
    file: path.join(__dirname, 'benchmark_images', 'case3_fractions_inequalities.jpg'),
    prompt: `Analyze this calculus and inequality homework sheet.
1. Transcribe all mathematical formulas, fractions, limits, radicals, and inequalities using standard LaTeX ($...$ and $$...$$).
2. Distinguish between the printed problem prompts and the student's handwritten derivation lines.
3. Note any symbols like \\pi, \\sqrt{}, \\le, \\ge, or absolute values.`
  },
  {
    id: 'case4_physics_incline',
    title: 'Case 4: Physics Inclined Plane Diagram & Force Vectors',
    file: path.join(__dirname, 'benchmark_images', 'case4_physics_incline.jpg'),
    prompt: `Analyze this AP Physics diagram and problem statement.
1. Transcribe the problem question asked at the bottom.
2. Identify all physical parameters given in the diagram: mass (m), ramp incline angle (theta), coefficient of friction (mu), and acceleration due to gravity (g).
3. Identify all force vectors drawn on the block (e.g. gravity mg, normal force F_N, friction force f_k) and their directions.`
  },
  {
    id: 'case5_geometry_circle',
    title: 'Case 5: Geometry Circle Diagram & Inscribed Angle',
    file: path.join(__dirname, 'benchmark_images', 'case5_geometry_circle.jpg'),
    prompt: `Analyze this geometry circle diagram and problem.
1. Transcribe the problem statement.
2. Identify all labeled points on the circle, the center of the circle, and the inscribed angle measure.
3. State what geometric angle or relationship needs to be determined.`
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
        'User-Agent': 'Pythos-Vision-Benchmark/1.0',
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

async function runBenchmark() {
  console.log('======================================================================');
  console.log('🏛️  PYTHOS HOSTED VISION MODEL BENCHMARK (Groq Qwen 27B Series)');
  console.log('======================================================================\n');

  const benchmarkReport = {};

  for (const model of MODELS) {
    console.log(`\n======================================================================`);
    console.log(`BENCHMARKING CANDIDATE MODEL: ${model}`);
    console.log(`======================================================================`);
    benchmarkReport[model] = {};

    for (const testCase of CASES) {
      console.log(`\n▶ [${testCase.id}] ${testCase.title}`);
      const b64 = fs.readFileSync(testCase.file).toString('base64');

      let success = false;
      let attempts = 0;
      const maxAttempts = 4;

      while (!success && attempts < maxAttempts) {
        attempts++;
        try {
          const resp = await callGroqChatStream(model, testCase.prompt, b64);
          const tokPerSec = (resp.tokenCount / (resp.totalDuration / 1000)).toFixed(1);

          console.log(`  ✓ Completed in ${(resp.totalDuration / 1000).toFixed(2)}s | TTFT: ${(resp.ttft / 1000).toFixed(2)}s | ${resp.tokenCount} tokens (${tokPerSec} tok/s)`);

          // Post-process with Pythos AST / normalizer
          const normalized = visionExtractor.postProcessVisionResponse(resp.fullText);

          // Run through Pythos verification bridge
          const claims = extractClaims(normalized);
          const contradictions = auditInternalConsistency(claims);
          const verifResults = [];
          for (const c of claims) {
            const v = await runDeterministicVerification(c);
            if (v) verifResults.push(v);
          }

          const validClaimsCount = verifResults.filter(v => v.verified === true).length;
          const invalidClaimsCount = verifResults.filter(v => v.verified === false && v.status !== 'UNKNOWN').length;

          console.log(`  ✓ Pythos Verification: ${claims.length} claims extracted | ${validClaimsCount} valid | ${invalidClaimsCount} invalid | ${contradictions.length} contradictions`);

          benchmarkReport[model][testCase.id] = {
            title: testCase.title,
            elapsedSec: Number((resp.totalDuration / 1000).toFixed(2)),
            ttftSec: Number((resp.ttft / 1000).toFixed(2)),
            tokenCount: resp.tokenCount,
            tokPerSec: Number(tokPerSec),
            fullText: resp.fullText,
            normalizedText: normalized,
            claimsExtracted: claims.length,
            claimsVerifiedValid: validClaimsCount,
            claimsVerifiedInvalid: invalidClaimsCount,
            internalContradictions: contradictions.length,
            claimsSummary: verifResults.map(v => ({ claim: v.claim?.raw_match, verified: v.verified, exact: v.exact_value }))
          };
          success = true;

        } catch (err) {
          console.error(`  ✗ Attempt ${attempts} error running ${testCase.id}:`, err.message);
          if (err.message.includes('429') || err.message.includes('rate_limit_exceeded')) {
            // Extract seconds if present
            const match = err.message.match(/try again in ([0-9.]+)s/);
            const waitSec = match ? (parseFloat(match[1]) + 2) : 25;
            console.log(`  ⏳ Rate limit encountered. Sleeping ${waitSec.toFixed(1)}s before retry...`);
            await new Promise(r => setTimeout(r, waitSec * 1000));
          } else {
            benchmarkReport[model][testCase.id] = {
              title: testCase.title,
              error: err.message
            };
            break;
          }
        }
      }

      // Respect Groq On-Demand rate limit window with a pacing delay
      console.log('  ... Pacing 22s for Groq ITPM/OTPM window ...');
      await new Promise(r => setTimeout(r, 22000));
    }
  }

  fs.writeFileSync(
    path.join(__dirname, 'hosted_vision_benchmark_results.json'),
    JSON.stringify(benchmarkReport, null, 2),
    'utf-8'
  );

  console.log('\n======================================================================');
  console.log('✅ BENCHMARK COMPLETED: Results saved to hosted_vision_benchmark_results.json');
  console.log('======================================================================\n');
}

runBenchmark().catch(err => {
  console.error('Fatal Benchmark Error:', err);
});
