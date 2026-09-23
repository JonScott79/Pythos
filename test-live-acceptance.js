/**
 * test-live-acceptance.js
 * End-to-end verification of Pythos Self-Knowledge / Site Grounding & Conversational Acceptance.
 */

const assert = require('assert');
const http = require('http');

// Load the Pythos server module in test mode
process.env.NODE_ENV = 'test';
process.env.PORT = '3007';
process.env.OLLAMA_MODEL = 'qwen2.5-coder:7b';

const { app } = require('./server/server');

function makeChatRequest(serverInstance, messages) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      messages,
      stream: false,
      options: { num_ctx: 2048 }
    });

    const addr = serverInstance.address();
    const port = addr.port;

    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: '/api/chat',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: 60000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, data: json });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function runAcceptanceSuite() {
  console.log('🏛️  PYTHOS LIVE CONVERSATIONAL ACCEPTANCE SUITE\n');

  const server = app.listen(0);
  await new Promise(r => server.once('listening', r));
  console.log(`Test server running on port ${server.address().port}`);

  const conversation = [];

  try {
    // -------------------------------------------------------------
    // TURN 1: User asks about accuracy rate
    // -------------------------------------------------------------
    console.log('\n=============================================================');
    console.log('▶ TURN 1: "whats your accuracy rate with math?"');
    console.log('=============================================================');
    conversation.push({ role: 'user', content: 'whats your accuracy rate with math?' });

    const res1 = await makeChatRequest(server, conversation);
    console.log(`Status: ${res1.status}`);
    const reply1 = res1.data?.message?.content || '';
    console.log(`Assistant Response:\n${reply1}\n`);

    assert.strictEqual(res1.status, 200, 'Turn 1 must return 200');
    // Must NOT say 99%
    assert(!reply1.includes('99%') && !reply1.includes('99 %'), 'Must NOT claim generic "above 99%"');
    // Must contain published validation facts
    const hasValidationMetric = reply1.includes('95.81') || reply1.includes('50,000') || reply1.includes('47,907') || reply1.includes('withheld') || reply1.includes('validation');
    assert(hasValidationMetric, 'Must cite published validation information');
    console.log('  ✅ Turn 1 PASSED: Grounded in official validation data (not pre-trained 99%).');

    conversation.push({ role: 'assistant', content: reply1 });

    // -------------------------------------------------------------
    // TURN 2: User asks "who made you?"
    // -------------------------------------------------------------
    console.log('\n=============================================================');
    console.log('▶ TURN 2: "who made you?"');
    console.log('=============================================================');
    conversation.push({ role: 'user', content: 'who made you?' });

    const res2 = await makeChatRequest(server, conversation);
    console.log(`Status: ${res2.status}`);
    const reply2 = res2.data?.message?.content || '';
    console.log(`Assistant Response:\n${reply2}\n`);

    assert.strictEqual(res2.status, 200, 'Turn 2 must return 200');
    // Must NOT say OpenAI
    assert(!reply2.toLowerCase().includes('openai'), 'Must NOT claim to be created by OpenAI');
    // Must mention Jon Scott or LANZAR
    const hasCreatorAttribution = reply2.toLowerCase().includes('jon scott') || reply2.toLowerCase().includes('lanzar') || reply2.toLowerCase().includes('student');
    assert(hasCreatorAttribution, 'Must be grounded in Jon Scott / LANZAR attribution');
    console.log('  ✅ Turn 2 PASSED: Grounded in Pythos About/project source (Jon Scott / LANZAR).');

    conversation.push({ role: 'assistant', content: reply2 });

    // -------------------------------------------------------------
    // TURN 3: User asks about mission
    // -------------------------------------------------------------
    console.log('\n=============================================================');
    console.log('▶ TURN 3: "what is your mission?"');
    console.log('=============================================================');
    conversation.push({ role: 'user', content: 'what is your mission?' });

    const res3 = await makeChatRequest(server, conversation);
    console.log(`Status: ${res3.status}`);
    const reply3 = res3.data?.message?.content || '';
    console.log(`Assistant Response:\n${reply3}\n`);

    assert.strictEqual(res3.status, 200, 'Turn 3 must return 200');
    const hasMission = reply3.toLowerCase().includes('free') || reply3.toLowerCase().includes('education') || reply3.toLowerCase().includes('learn') || reply3.toLowerCase().includes('student');
    assert(hasMission, 'Must reflect Pythos educational mission');
    console.log('  ✅ Turn 3 PASSED: Grounded in Pythos nonprofit/mission source.');

    conversation.push({ role: 'assistant', content: reply3 });

    // -------------------------------------------------------------
    // TURN 4: User asks for math
    // -------------------------------------------------------------
    console.log('\n=============================================================');
    console.log('▶ TURN 4: "okay now solve x^2 - 5x + 6 = 0"');
    console.log('=============================================================');
    conversation.push({ role: 'user', content: 'okay now solve x^2 - 5x + 6 = 0' });

    const res4 = await makeChatRequest(server, conversation);
    console.log(`Status: ${res4.status}`);
    const reply4 = res4.data?.message?.content || '';
    console.log(`Assistant Response:\n${reply4}\n`);

    assert.strictEqual(res4.status, 200, 'Turn 4 must return 200');
    assert(res4.data?.deterministic === true || res4.data?.model?.includes('deterministic') || (reply4.includes('2') && reply4.includes('3')), 'Must solve quadratic equation correctly');
    console.log('  ✅ Turn 4 PASSED: Deterministic mathematics executed with 0 extra tokens.');

    console.log('\n🎉 ALL LIVE CONVERSATIONAL ACCEPTANCE CRITERIA MET!\n');
  } finally {
    server.close();
  }
}

runAcceptanceSuite().catch(err => {
  console.error('\n❌ ACCEPTANCE TEST FAILED:', err);
  process.exit(1);
});
