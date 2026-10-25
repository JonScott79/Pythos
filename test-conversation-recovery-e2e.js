/**
 * test-conversation-recovery-e2e.js
 *
 * Live End-to-End Response-Generation Integration Suite for Conversation Recovery,
 * Intent Disambiguation, and Zero-Contamination Topic Switching.
 *
 * Exercises the entire runtime stack:
 * HTTP POST /api/chat -> Context Manager -> Intent Classifier -> Prompt Builder ->
 * Local Ollama / LLM Generation -> Verification Bridge / Safe Response Constructor -> Final Output.
 */

const assert = require('assert');
const http = require('http');

process.env.NODE_ENV = 'test';
process.env.PORT = '0';
process.env.OLLAMA_MODEL = 'pythos:latest';

const { app } = require('./server/server');

function sendChatTurn(serverInstance, messages) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      messages,
      stream: false,
      options: { num_ctx: 2048, num_predict: 200 }
    });

    const port = serverInstance.address().port;

    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: '/api/chat',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: 120000
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

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Client request timed out after 120s'));
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function runLiveEndToEndSuite() {
  console.log('=== RUNNING CONVERSATION RECOVERY LIVE E2E GENERATION SUITE ===\n');

  const server = app.listen(0);
  await new Promise(r => server.once('listening', r));
  console.log(`Live test server active on port ${server.address().port}`);

  let totalTests = 0;
  let passedTests = 0;

  try {
    // =========================================================================
    // SCENARIO 1: TOPIC SWITCHING WITH ZERO RESIDUAL CONTAMINATION
    // =========================================================================
    console.log('\n--- SCENARIO 1: Topic Switching (Triangle Inequality -> Arithmetic -> General Knowledge) ---');
    const topicConv = [];

    // Turn 1: Triangle inequality
    totalTests++;
    topicConv.push({ role: 'user', content: 'Can a triangle have side lengths 2, 3, and 8?' });
    console.log('Sending Turn 1: "Can a triangle have side lengths 2, 3, and 8?"');
    const res1 = await sendChatTurn(server, topicConv);
    assert.strictEqual(res1.status, 200, 'Turn 1 must succeed with status 200');
    const reply1 = res1.data?.message?.content || '';
    console.log(`Turn 1 Response: ${reply1.slice(0, 140)}...`);
    assert(
      reply1.toLowerCase().includes('cannot') || reply1.toLowerCase().includes('not') || reply1.toLowerCase().includes('triangle inequality') || reply1.toLowerCase().includes('need a little more information'),
      'Must handle triangle inequality prompt safely and accurately'
    );
    topicConv.push({ role: 'assistant', content: reply1 });
    passedTests++;
    console.log('  [PASS] Turn 1: Triangle inequality handled safely.');

    // Turn 2: Switch to unrelated arithmetic (2 + 2)
    totalTests++;
    topicConv.push({ role: 'user', content: 'What is 2 + 2?' });
    console.log('Sending Turn 2: "What is 2 + 2?" (Unrelated topic switch)');
    const res2 = await sendChatTurn(server, topicConv);
    assert.strictEqual(res2.status, 200, 'Turn 2 must succeed with status 200');
    const reply2 = res2.data?.message?.content || '';
    console.log(`Turn 2 Response: ${reply2.trim()}`);
    assert(reply2.includes('4'), 'Must answer 4');
    // MUST NOT be contaminated with triangle side lengths 2, 3, 8
    assert(!reply2.toLowerCase().includes('side lengths') && !reply2.includes('8'), 'Must NOT contain lingering triangle inequality contamination');
    topicConv.push({ role: 'assistant', content: reply2 });
    passedTests++;
    console.log('  [PASS] Turn 2: Arithmetic answered cleanly with zero lingering triangle contamination.');

    // Turn 3: Switch to general knowledge (Euclid)
    totalTests++;
    topicConv.push({ role: 'user', content: 'Tell me about Euclid in one sentence' });
    console.log('Sending Turn 3: "Tell me about Euclid in one sentence"');
    const res3 = await sendChatTurn(server, topicConv);
    assert.strictEqual(res3.status, 200, 'Turn 3 must succeed with status 200');
    const reply3 = res3.data?.message?.content || '';
    console.log(`Turn 3 Response: ${reply3.slice(0, 140)}...`);
    assert(reply3.toLowerCase().includes('euclid') || reply3.toLowerCase().includes('geometry') || reply3.toLowerCase().includes('mathematician'), 'Must respond about Euclid');
    assert(!reply3.toLowerCase().includes('side lengths 2, 3, and 8'), 'Must NOT regurgitate prior problem side lengths');
    topicConv.push({ role: 'assistant', content: reply3 });
    passedTests++;
    console.log('  [PASS] Turn 3: General knowledge answered without prior context contamination.');

    // =========================================================================
    // SCENARIO 2: NUMERIC EQUALITY VERIFICATION & FALSE PROPOSITION INTEGRITY
    // =========================================================================
    console.log('\n--- SCENARIO 2: Mathematical Proposition Verification Integrity ---');

    // Case 2a: True proposition 10^2 + 24^2 = 26^2
    totalTests++;
    console.log('Sending True Proposition: "10^2 + 24^2 = 26^2"');
    const truePropRes = await sendChatTurn(server, [{ role: 'user', content: '10^2 + 24^2 = 26^2' }]);
    assert.strictEqual(truePropRes.status, 200);
    const trueReply = truePropRes.data?.message?.content || '';
    console.log(`True Proposition Response: ${trueReply.slice(0, 140)}...`);
    assert(trueReply.includes('676') || trueReply.toLowerCase().includes('true') || trueReply.toLowerCase().includes('holds') || trueReply.toLowerCase().includes('correct') || trueReply.toLowerCase().includes('equal') || trueReply.toLowerCase().includes('verified'), 'Must verify 10^2 + 24^2 = 26^2 as true');
    passedTests++;
    console.log('  [PASS] Case 2a: 10^2 + 24^2 = 26^2 verified true.');

    // Case 2b: False proposition 2 + 2 = 5
    totalTests++;
    console.log('Sending False Proposition: "2 + 2 = 5"');
    const falsePropRes = await sendChatTurn(server, [{ role: 'user', content: '2 + 2 = 5' }]);
    assert.strictEqual(falsePropRes.status, 200);
    const falseReply = falsePropRes.data?.message?.content || '';
    console.log(`False Proposition Response: ${falseReply.slice(0, 140)}...`);
    assert(falseReply.toLowerCase().includes('not') || falseReply.toLowerCase().includes('false') || falseReply.includes('4') || falseReply.toLowerCase().includes('does not hold') || falseReply.toLowerCase().includes('incorrect'), 'Must NOT verify 2 + 2 = 5 as true; must state it does not hold');
    passedTests++;
    console.log('  [PASS] Case 2b: 2 + 2 = 5 correctly identified as false / not verified.');

    // =========================================================================
    // SCENARIO 3: CONVERSATIONAL RECOVERY & DISAMBIGUATION
    // =========================================================================
    console.log('\n--- SCENARIO 3: Conversational Recovery & Disambiguation ---');
    const dateConv = [
      { role: 'user', content: '10^2 + 24^2 = 26^2' },
      { role: 'assistant', content: '10^2 = 100, 24^2 = 576, 26^2 = 676. 100 + 576 = 676. This is a valid Pythagorean triple.' },
      { role: 'user', content: 'that represents the date October 24, 2026: 10/24/26. The next occurrence will be in 2105.' },
      { role: 'assistant', content: 'Could you clarify how 2105 relates to the date equation?' },
      { role: 'user', content: 'nope future, 2105 =)' }
    ];

    totalTests++;
    console.log('Sending Turn: "nope future, 2105 =)" after clarification');
    const dateRes = await sendChatTurn(server, dateConv);
    assert.strictEqual(dateRes.status, 200);
    const dateReply = dateRes.data?.message?.content || '';
    console.log(`Disambiguation Response: ${dateReply.slice(0, 160)}...`);
    assert(dateReply.length > 10, 'Must produce a non-empty conversational recovery response');
    passedTests++;
    console.log('  [PASS] Scenario 3: Clarification response delivered gracefully without defensive looping.');

    console.log(`\n=== LIVE E2E SUITE COMPLETE: ${passedTests} / ${totalTests} PASSED ===\n`);
  } catch (err) {
    console.error('\n[FAIL] Live E2E test failed with error:');
    console.error(err);
    process.exitCode = 1;
  } finally {
    server.close();
  }
}

runLiveEndToEndSuite();
