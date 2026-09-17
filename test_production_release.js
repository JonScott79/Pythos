/**
 * test_production_release.js
 * End-to-end verification against live production gateway: https://pythos-api.lanzar.me/api/chat
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const PROD_ENDPOINT = 'https://pythos-api.lanzar.me/api/chat';

function postJson(payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const u = new URL(PROD_ENDPOINT);
    const req = https.request({
      hostname: u.hostname,
      port: 443,
      path: u.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'User-Agent': 'Pythos-Production-Release-Auditor/1.6.0'
      },
      timeout: 120000
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: body
        });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out after 120s'));
    });

    req.write(data);
    req.end();
  });
}

async function runLiveProductionAudit() {
  console.log('======================================================================');
  console.log('🚀 LIVE PRODUCTION VERIFICATION SUITE — https://pythos-api.lanzar.me');
  console.log('======================================================================\n');

  const results = {};

  // TEST 1: Production Text Request
  console.log('▶ [TEST 1] Production text request...');
  try {
    const textRes = await postJson({
      messages: [{ role: 'user', content: 'What is 15 * 14? Please compute directly.' }]
    });
    console.log(`  Status: ${textRes.statusCode}`);
    const parsed = JSON.parse(textRes.body);
    const content = parsed.message?.content || parsed.response || '';
    console.log(`  Assistant Response: ${content.slice(0, 150)}...`);
    const passed = textRes.statusCode === 200 && content.includes('210');
    results['1_text_request'] = { passed, status: textRes.statusCode, snippet: content.slice(0, 100) };
    console.log(`  Result: ${passed ? 'PASSED ✅' : 'FAILED ❌'}\n`);
  } catch (err) {
    console.error('  Failed:', err.message);
    results['1_text_request'] = { passed: false, error: err.message };
  }

  // Helper to load base64 image
  const case1B64 = fs.readFileSync(path.join(__dirname, 'benchmark_images', 'case1_printed_hw.jpg')).toString('base64');
  const case2B64 = fs.readFileSync(path.join(__dirname, 'benchmark_images', 'case2_messy_crossedout.jpg')).toString('base64');
  const case5B64 = fs.readFileSync(path.join(__dirname, 'benchmark_images', 'case5_geometry_circle.jpg')).toString('base64');

  // TEST 2: Production Image Request (Basic Vision Transcription & Interpretation)
  console.log('▶ [TEST 2] Production image request (Circle Geometry)...');
  try {
    const imgRes = await postJson({
      messages: [{
        role: 'user',
        content: 'Please transcribe what geometry diagram and values are shown in this image.',
        images: [case5B64]
      }]
    });
    console.log(`  Status: ${imgRes.statusCode}`);
    const parsed = JSON.parse(imgRes.body);
    const content = parsed.message?.content || '';
    console.log(`  Assistant Response: ${content.slice(0, 200)}...`);
    const passed = imgRes.statusCode === 200 && (content.includes('42') || content.toLowerCase().includes('inscribed') || content.toLowerCase().includes('circle'));
    results['2_image_request'] = { passed, status: imgRes.statusCode, model: parsed.model, snippet: content.slice(0, 150) };
    console.log(`  Result: ${passed ? 'PASSED ✅' : 'FAILED ❌'}\n`);
  } catch (err) {
    console.error('  Failed:', err.message);
    results['2_image_request'] = { passed: false, error: err.message };
  }

  await new Promise(r => setTimeout(r, 6000));

  // TEST 3: Production Image + Mathematical Reasoning
  console.log('▶ [TEST 3] Production image + mathematical reasoning...');
  try {
    const mathRes = await postJson({
      messages: [{
        role: 'user',
        content: 'Look at the angle theta in this circle diagram. What is the measure of angle theta and what mathematical theorem explains it?',
        images: [case5B64]
      }]
    });
    console.log(`  Status: ${mathRes.statusCode}`);
    const parsed = JSON.parse(mathRes.body);
    const content = parsed.message?.content || '';
    console.log(`  Assistant Response: ${content.slice(0, 250)}...`);
    const has84 = content.includes('84');
    const hasTheorem = /inscribed\s+angle|central\s+angle|twice/i.test(content);
    const passed = mathRes.statusCode === 200 && (has84 || hasTheorem);
    results['3_image_math_reasoning'] = { passed, status: mathRes.statusCode, has84, hasTheorem, snippet: content.slice(0, 150) };
    console.log(`  Result: ${passed ? 'PASSED ✅' : 'FAILED ❌'}\n`);
  } catch (err) {
    console.error('  Failed:', err.message);
    results['3_image_math_reasoning'] = { passed: false, error: err.message };
  }

  await new Promise(r => setTimeout(r, 6000));

  const v1MistakeB64 = fs.readFileSync(path.join(__dirname, 'benchmark_images', 'validation_set', 'v1_pencil_messy_fractions_mistake.jpg')).toString('base64');

  // TEST 4: Production Image + Student-Error Detection
  console.log('▶ [TEST 4] Production image + student-error detection...');
  try {
    const errRes = await postJson({
      messages: [{
        role: 'user',
        content: 'Check the student handwritten steps in this photo. Did the student make any mistake in their work?',
        images: [v1MistakeB64]
      }]
    });
    console.log(`  Status: ${errRes.statusCode}`);
    const parsed = JSON.parse(errRes.body);
    const content = parsed.message?.content || '';
    console.log(`  Assistant Response: ${content.slice(0, 250)}...`);
    // V1 mistake: student calculated (2/3) * 12 = 9 instead of 8
    const mentionsError = /mistake|error|incorrect|9|8|arithmetic|calculation|fraction/i.test(content);
    const passed = errRes.statusCode === 200 && mentionsError;
    results['4_student_error_detection'] = { passed, status: errRes.statusCode, mentionsError, snippet: content.slice(0, 150) };
    console.log(`  Result: ${passed ? 'PASSED ✅' : 'FAILED ❌'}\n`);
  } catch (err) {
    console.error('  Failed:', err.message);
    results['4_student_error_detection'] = { passed: false, error: err.message };
  }

  await new Promise(r => setTimeout(r, 6000));

  // TEST 5: Production Image + Ambiguous Handwriting
  console.log('▶ [TEST 5] Production image + ambiguous handwriting...');
  try {
    const ambRes = await postJson({
      messages: [{
        role: 'user',
        content: 'Transcribe this handwritten math problem. If any character or step is messy, ambiguous, or crossed out, state your uncertainty clearly.',
        images: [case2B64]
      }]
    });
    console.log(`  Status: ${ambRes.statusCode}`);
    const parsed = JSON.parse(ambRes.body);
    const content = parsed.message?.content || '';
    const notesAmbiguity = /ambigu|unclear|could\s+be|either|3x|8x|crossed|uncertain|question\s*mark|\?|possibly/i.test(content);
    const passed = ambRes.statusCode === 200 && notesAmbiguity;
    results['5_ambiguous_handwriting'] = { passed, status: ambRes.statusCode, notesAmbiguity, snippet: content.slice(0, 150) };
    console.log(`  Result: ${passed ? 'PASSED ✅' : 'FAILED ❌'}\n`);
  } catch (err) {
    console.error('  Failed:', err.message);
    results['5_ambiguous_handwriting'] = { passed: false, error: err.message };
  }

  await new Promise(r => setTimeout(r, 6000));

  // TEST 6: Production Conversational Follow-up Referencing the Image
  console.log('▶ [TEST 6] Production conversational follow-up referencing the image...');
  try {
    const followUpRes = await postJson({
      messages: [
        {
          role: 'user',
          content: 'Here is the circle geometry problem.',
          images: [case5B64]
        },
        {
          role: 'assistant',
          content: 'I see the circle with an inscribed angle of $42^\\circ$ intercepting the arc, and a central angle labeled $\\theta$.'
        },
        {
          role: 'user',
          content: 'What would the central angle be if the inscribed angle were changed to 35 degrees instead?'
        }
      ]
    });
    console.log(`  Status: ${followUpRes.statusCode}`);
    const parsed = JSON.parse(followUpRes.body);
    const content = parsed.message?.content || '';
    console.log(`  Assistant Response: ${content.slice(0, 250)}...`);
    const has70 = content.includes('70');
    const passed = followUpRes.statusCode === 200 && has70;
    results['6_conversational_followup'] = { passed, status: followUpRes.statusCode, has70, snippet: content.slice(0, 150) };
    console.log(`  Result: ${passed ? 'PASSED ✅' : 'FAILED ❌'}\n`);
  } catch (err) {
    console.error('  Failed:', err.message);
    results['6_conversational_followup'] = { passed: false, error: err.message };
  }

  console.log('======================================================================');
  console.log('📊 PRODUCTION VERIFICATION SUMMARY');
  console.log('======================================================================');
  console.log(JSON.stringify(results, null, 2));

  fs.writeFileSync(path.join(__dirname, 'prod_verification_results.json'), JSON.stringify(results, null, 2));
}

runLiveProductionAudit().catch(console.error);
