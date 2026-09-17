/**
 * profile_pipeline.js
 * 
 * End-to-end profiler measuring timing across:
 * 1. Image preprocessing / compression simulation
 * 2. Network transfer & payload serialization
 * 3. Direct Vision Model inference (isolated baseline)
 * 4. Full Pythos Multimodal pipeline:
 *    - Request receipt & prompt preparation
 *    - Model invocation & time-to-first-token (TTFT)
 *    - Full response generation (tokens/sec)
 *    - Deterministic claim extraction & verification
 *    - Total response turnaround
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { performance } = require('perf_hooks');

const { extractClaims, runDeterministicVerification, auditInternalConsistency } = require('./server/verificationBridge');
const visionExtractor = require('./server/visionExtractor');

const OLLAMA_HOST = 'http://localhost:11434';
const MODELS_TO_TEST = ['llava:7b', 'minicpm-v:latest'];
const SAMPLE_IMAGE_PATH = path.join(__dirname, 'benchmark_images', 'case1_printed_hw.jpg');

async function ollamaChatStream(model, messages, options = {}) {
  return new Promise((resolve, reject) => {
    const startReq = performance.now();
    let ttft = null;
    let fullText = '';
    let tokenCount = 0;

    const payload = JSON.stringify({
      model,
      messages,
      stream: true,
      options: Object.assign({ temperature: 0.1 }, options)
    });

    const parsed = new URL(`${OLLAMA_HOST}/api/chat`);
    const req = http.request({
      hostname: parsed.hostname,
      port: parsed.port || 11434,
      path: parsed.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: 180000
    }, (res) => {
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
          if (!trimmed) continue;
          try {
            const data = JSON.parse(trimmed);
            if (data.message && data.message.content) {
              fullText += data.message.content;
              tokenCount++;
            }
          } catch (_) {}
        }
      });

      res.on('end', () => {
        const totalDuration = performance.now() - startReq;
        resolve({
          ttft: ttft !== null ? ttft : totalDuration,
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

async function runProfiler() {
  console.log('================================================================');
  console.log('⏱️  PYTHOS VISION PIPELINE END-TO-END PROFILER');
  console.log('================================================================\n');

  // ── Stage 1: Client Preprocessing & Compression ────────────────────────────
  console.log('1. PROFILING CLIENT PREPROCESSING & COMPRESSION:');
  const rawStats = fs.statSync(SAMPLE_IMAGE_PATH);
  const rawBytes = rawStats.size;
  const t0_prep = performance.now();

  const fileBuf = fs.readFileSync(SAMPLE_IMAGE_PATH);
  const base64Data = fileBuf.toString('base64');
  const t1_prep = performance.now();
  const prepTimeMs = t1_prep - t0_prep;

  console.log(`   - File: ${SAMPLE_IMAGE_PATH}`);
  console.log(`   - Raw file size: ${(rawBytes / 1024).toFixed(1)} KB`);
  console.log(`   - Base64 payload size: ${(base64Data.length / 1024).toFixed(1)} KB`);
  console.log(`   - Preprocessing / Base64 serialization: ${prepTimeMs.toFixed(2)} ms\n`);

  // ── Stage 2: Direct Model Baseline (Isolated from Pythos) ───────────────────
  console.log('2. DIRECT VISION MODEL BASELINE (No Pythos system prompts/verification):');

  for (const model of MODELS_TO_TEST) {
    console.log(`\n   --- Testing ${model} Direct Baseline ---`);
    try {
      const messages = [
        {
          role: 'user',
          content: 'Read this math problem and state the answer.',
          images: [base64Data]
        }
      ];

      const baseline = await ollamaChatStream(model, messages, { num_ctx: 2048 });
      console.log(`   - Vision model: ${model}`);
      console.log(`   - Time to first token (TTFT): ${(baseline.ttft / 1000).toFixed(2)} s`);
      console.log(`   - Total generation time: ${(baseline.totalDuration / 1000).toFixed(2)} s`);
      console.log(`   - Tokens generated: ${baseline.tokenCount}`);
      const tps = baseline.tokenCount / (baseline.totalDuration / 1000);
      console.log(`   - Generation throughput: ${tps.toFixed(2)} tokens/sec`);
      console.log(`   - Raw response snippet: "${baseline.fullText.slice(0, 120).replace(/\n/g, ' ')}..."`);
    } catch (err) {
      console.log(`   - Error testing ${model}: ${err.message}`);
    }
  }

  // ── Stage 3: Full Pythos Multimodal Pipeline ───────────────────────────────
  console.log('\n================================================================');
  console.log('3. FULL PYTHOS PIPELINE PROFILE (Multimodal Vision -> Socratic -> Verifier)');
  console.log('================================================================');

  const selectedModel = 'llava:7b';
  console.log(`\nUsing configured model: ${selectedModel}`);

  const userPrompt = 'Please help me check this homework.';
  const rawUserMsg = {
    role: 'user',
    content: userPrompt,
    images: [base64Data]
  };

  // Step A: Railway API Receipt & Message Cleaning
  const t0_api = performance.now();
  const cleanedUserMsg = visionExtractor.cleanVisionMessage(rawUserMsg);
  const t1_cleaning = performance.now();

  // Step B: Context & Prompt Construction
  const t0_prompt = performance.now();
  const visionDirective = visionExtractor.buildVisionPromptDirective();
  const fullSystemPrompt = "You are Pythos, a wise mathematics tutor." + visionDirective;
  const preparedMessages = [
    { role: 'system', content: fullSystemPrompt },
    cleanedUserMsg
  ];
  const t1_prompt = performance.now();

  console.log(`\n[TIMESTAMPS & DURATIONS]:`);
  console.log(`   [1] Image Preprocessing/Compression:      ${prepTimeMs.toFixed(2)} ms`);
  console.log(`   [2] Railway/API Receipt & Cleaning:        ${(t1_cleaning - t0_api).toFixed(2)} ms`);
  console.log(`   [3] Prompt Assembly & Vision Directives:   ${(t1_prompt - t0_prompt).toFixed(2)} ms`);

  // Step C: Vision Model Request & Inference
  console.log(`   [4] Vision Model Request Start...`);
  const t0_inf = performance.now();
  let fullInference;
  try {
    fullInference = await ollamaChatStream(selectedModel, preparedMessages, { num_ctx: 4096 });
  } catch (infErr) {
    console.error(`Inference failed: ${infErr.message}`);
    return;
  }
  const t1_inf = performance.now();

  console.log(`   [5] First Vision Token Received (TTFT):    ${(fullInference.ttft / 1000).toFixed(2)} s`);
  console.log(`   [6] Vision Extraction Completed:           ${((t1_inf - t0_inf) / 1000).toFixed(2)} s`);
  console.log(`       -> Tokens generated: ${fullInference.tokenCount}`);
  console.log(`       -> Throughput: ${(fullInference.tokenCount / ((t1_inf - t0_inf) / 1000)).toFixed(2)} tok/s`);

  // Step D: Pythos Reasoning & OCR Normalization
  const t0_reason = performance.now();
  const normalizedText = visionExtractor.postProcessVisionResponse(fullInference.fullText);
  const t1_reason = performance.now();
  console.log(`   [7] Pythos Post-Process & OCR Normalization: ${(t1_reason - t0_reason).toFixed(2)} ms`);

  // Step E: Deterministic Verification Bridge
  const t0_verif = performance.now();
  const claims = extractClaims(normalizedText, userPrompt);
  const internalContradictions = auditInternalConsistency(claims);
  const verifResults = [];

  for (const c of claims) {
    const res = await runDeterministicVerification(c);
    if (res) verifResults.push(res);
  }
  const t1_verif = performance.now();
  console.log(`   [8] Verification Started & Completed:      ${(t1_verif - t0_verif).toFixed(2)} ms`);
  console.log(`       -> Extracted claims: ${claims.length}`);
  console.log(`       -> Verified claims: ${verifResults.filter(v => v.verified).length}/${claims.length}`);

  // Step F: Total Turnaround
  const totalTurnaround = (t1_verif - t0_api) + prepTimeMs;
  console.log(`   [9] Final Response Generated:              Total Pipeline: ${(totalTurnaround / 1000).toFixed(2)} s\n`);

  console.log('================================================================');
  console.log('BOTTLENECK BREAKDOWN & DIAGNOSTIC FINDINGS');
  console.log('================================================================');
  console.log(`1. Client Preprocessing:     ${(prepTimeMs / totalTurnaround * 100).toFixed(1)}%`);
  console.log(`2. Railway / API Dispatch:   ${((t1_cleaning - t0_api) / totalTurnaround * 100).toFixed(1)}%`);
  console.log(`3. Vision Model Inference:   ${((t1_inf - t0_inf) / totalTurnaround * 100).toFixed(1)}%  <-- PRIMARY BOTTLENECK`);
  console.log(`4. Deterministic Verifier:   ${((t1_verif - t0_verif) / totalTurnaround * 100).toFixed(1)}%`);
  console.log(`\nGenerated Pythos Output Snippet:\n----------------------------------------\n${normalizedText.slice(0, 300)}...\n----------------------------------------\n`);
}

runProfiler().catch(err => {
  console.error('Profiler Error:', err);
});
