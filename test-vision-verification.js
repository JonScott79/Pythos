/**
 * test-vision-verification.js
 *
 * Comprehensive Test Suite for Pythos Todo #3: Vision Verification Audit.
 * Verifies that image-based mathematics follows the exact same trust architecture
 * as text-based math:
 *
 * Image -> Vision candidate -> Claim extraction -> Prompt/claim fidelity
 *       -> Deterministic verification -> Revision / re-verification
 *       -> Deterministic supremacy -> Delivery gate
 *
 * THE VISION MODEL MUST NEVER CERTIFY ITS OWN MATHEMATICAL ANSWER.
 */

process.env.NODE_ENV = 'test';

const assert = require('assert');
const http = require('http');
const https = require('https');
const providerPolicy = require('./server/providerPolicy');
const { verifyResponseClaims, runDeterministicVerification, extractClaims, checkPromptClaimFidelity } = require('./server/verificationBridge');
const mathjsVerifier = require('./server/mathjsVerifier');

const VALID_TEST_IMAGE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJgggAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

console.log('🛡️  PYTHOS VISION VERIFICATION AUDIT TEST SUITE (TODO #3)\n');

let totalTests = 0;
let passedTests = 0;

async function test(name, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  ✅ PASS: ${name}`);
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${err.message}`);
    throw err;
  }
}

async function runAllTests() {
  // =========================================================================
  // SUITE 1: DETERMINISTIC REPRODUCTION OF KNOWN FAILURE & GEOMETRIC AUDIT
  // =========================================================================
  console.log('--- Suite 1: Known Failure Reproduction & Geometric Integrity ---');

  await test('1.1: Known Failure Reproduction: csc(60°) = 2/3 on impossible triangle is caught as invalid', async () => {
    const prompt = 'What is csc(60°) based on the triangle in the image?';
    const problematicVisionCandidate = 'Based on the provided right triangle diagram: opposite = 3, adjacent = 1, hypotenuse = 2. Using the definition of cosecant: csc(60°) = hypotenuse / opposite = 2/3 ≈ 0.667. Therefore, we have csc(60°) = 2/3.';

    const audit = await verifyResponseClaims(problematicVisionCandidate, prompt);

    assert(audit.claims.length >= 2, `Expected at least 2 claims, got ${audit.claims.length}`);
    assert(audit.invalidClaims.length > 0, 'Known failure must have invalid claims');
    assert(audit.internalContradictions.length > 0, 'Known failure must have internal geometric contradictions');

    const hasGeometricViolation = audit.internalContradictions.some(c =>
      c.type === 'GEOMETRIC_CONTRADICTION' || c.details.includes('Hypotenuse') || c.details.includes('Pythagorean')
    );
    assert(hasGeometricViolation, 'Must detect geometric contradiction: hypotenuse 2 < leg 3');

    const hasTrigOrArithViolation = audit.invalidClaims.some(ic =>
      ic.verification.error_type === 'TRIGONOMETRIC_RANGE_VIOLATION' ||
      ic.verification.status === 'RANGE_ERROR' ||
      ic.verification.status === 'INCORRECT_RESULT' ||
      ic.verification.status === 'GEOMETRIC_IMPOSSIBILITY'
    );
    assert(hasTrigOrArithViolation, 'Must catch trigonometric falsehood or range violation');
    console.log(`     Reproduction confirmed: ${audit.invalidClaims.length} invalid claims, ${audit.internalContradictions.length} contradictions.`);
  });

  await test('1.2: Geometric Verifier: Flags hypotenuse smaller than leg', async () => {
    const geoClaim = {
      domain: 'geometry',
      claim_type: 'right_triangle_geometry',
      data: { opposite: 3, adjacent: 1, hypotenuse: 2 }
    };
    const res = mathjsVerifier.verify(geoClaim);
    assert.strictEqual(res.verified, false);
    assert.strictEqual(res.status, 'GEOMETRIC_IMPOSSIBILITY');
    assert(res.details.includes('must be strictly greater than'));
  });

  await test('1.3: Geometric Verifier: Flags Pythagorean theorem violation', async () => {
    const geoClaim = {
      domain: 'geometry',
      claim_type: 'right_triangle_geometry',
      data: { opposite: 3, adjacent: 4, hypotenuse: 6 } // 9 + 16 = 25 != 36
    };
    const res = mathjsVerifier.verify(geoClaim);
    assert.strictEqual(res.verified, false);
    assert.strictEqual(res.status, 'PYTHAGOREAN_VIOLATION');
    assert(res.details.includes('Pythagorean theorem contradiction'));
  });

  await test('1.4: Geometric Verifier: Accepts mathematically consistent right triangle', async () => {
    const geoClaim = {
      domain: 'geometry',
      claim_type: 'right_triangle_geometry',
      data: { opposite: 3, adjacent: 4, hypotenuse: 5 } // 9 + 16 = 25 == 25
    };
    const res = mathjsVerifier.verify(geoClaim);
    assert.strictEqual(res.verified, true);
    assert.strictEqual(res.status, 'VERIFIED');
  });

  // =========================================================================
  // SUITE 2: PROMPT-TO-CLAIM FIDELITY FOR VISION
  // =========================================================================
  console.log('\n--- Suite 2: Prompt-to-Claim Fidelity for Vision ---');

  await test('2.1: Fidelity: Rejects candidate solving different trig function (sin instead of csc)', async () => {
    const prompt = 'What is csc(60°) based on the triangle in the image?';
    const wrongClaim = {
      domain: 'arithmetic',
      claim_type: 'arithmetic',
      raw_match: 'sin(60 deg) = 0.866',
      data: { expression: 'sin(60 deg)', proposed_value: 0.866 }
    };
    const fidelity = checkPromptClaimFidelity(wrongClaim, prompt);
    assert.strictEqual(fidelity.ok, false);
    assert(fidelity.reason.includes('Prompt requested trigonometric function \'csc\''));
  });

  await test('2.2: Fidelity: Rejects candidate solving different angle (30° instead of 60°)', async () => {
    const prompt = 'What is csc(60°) based on the triangle in the image?';
    const wrongAngleClaim = {
      domain: 'arithmetic',
      claim_type: 'arithmetic',
      raw_match: 'csc(30 deg) = 2',
      data: { expression: 'csc(30 deg)', proposed_value: 2 }
    };
    const fidelity = checkPromptClaimFidelity(wrongAngleClaim, prompt);
    assert.strictEqual(fidelity.ok, false);
    assert(fidelity.reason.includes('Prompt requested angle \'60\''));
  });

  await test('2.3: Fidelity: Accepts candidate answering exact requested trig quantity', async () => {
    const prompt = 'What is csc(60°) based on the triangle in the image?';
    const correctClaim = {
      domain: 'arithmetic',
      claim_type: 'arithmetic',
      raw_match: 'csc(60 deg) = 1.1547',
      data: { expression: 'csc(60 deg)', proposed_value: 1.1547 }
    };
    const fidelity = checkPromptClaimFidelity(correctClaim, prompt);
    assert.strictEqual(fidelity.ok, true);
  });

  await test('2.4: Fidelity: Rejects candidate solving wrong object in multi-object diagram', async () => {
    const prompt = 'Find the hypotenuse of Triangle B in the diagram.';
    const wrongObjClaim = {
      domain: 'geometry',
      claim_type: 'right_triangle_geometry',
      raw_match: 'Triangle A: opposite=3, adjacent=4, hypotenuse=5',
      data: { opposite: 3, adjacent: 4, hypotenuse: 5 }
    };
    const fidelity = checkPromptClaimFidelity(wrongObjClaim, prompt);
    assert.strictEqual(fidelity.ok, false);
    assert(fidelity.reason.includes('Prompt asked about Triangle B'));
  });

  // =========================================================================
  // SUITE 3: END-TO-END GATEWAY INTEGRATION & DELIVERY GATE
  // =========================================================================
  console.log('\n--- Suite 3: End-to-End Gateway & Delivery Gate ---');

  const { app } = require('./server/server');
  const server = http.createServer(app);
  await new Promise(res => server.listen(0, res));
  const port = server.address().port;

  function makeTestChatRequest(payload) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(payload);
      const req = http.request({
        hostname: 'localhost',
        port: port,
        path: '/api/chat',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        }
      }, (res) => {
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => {
          try {
            resolve({ statusCode: res.statusCode, headers: res.headers, body: JSON.parse(body) });
          } catch (_) {
            resolve({ statusCode: res.statusCode, headers: res.headers, rawBody: body });
          }
        });
      });
      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }

  const origHttpRequest = http.request;
  const origHttpsRequest = https.request;

  try {
    await test('3.1: Known failure (csc(60°) = 2/3 on impossible triangle) is SAFELY WITHHELD by delivery gate', async () => {
      providerPolicy.clearRateLimits();

      // Intercept Groq vision request and return the problematic candidate
      https.request = function(options, callback) {
        const host = options.hostname || options.host;
        if (host === 'api.groq.com') {
          const reqMock = {
            on: () => reqMock,
            write: () => {},
            end: () => {
              const resMock = {
                statusCode: 200,
                headers: {},
                on: (event, handler) => {
                  if (event === 'data') {
                    handler(JSON.stringify({
                      choices: [{
                        message: {
                          role: 'assistant',
                          content: 'Based on the provided right triangle diagram: opposite = 3, adjacent = 1, hypotenuse = 2. Using the definition of cosecant: csc(60°) = hypotenuse / opposite = 2/3 ≈ 0.667. Therefore, we have csc(60°) = 2/3.'
                        }
                      }]
                    }));
                  }
                  if (event === 'end') handler();
                }
              };
              if (callback) callback(resMock);
            }
          };
          return reqMock;
        }
        return origHttpsRequest.apply(https, arguments);
      };

      const resp = await makeTestChatRequest({
        messages: [{
          role: 'user',
          content: 'What is csc(60°) based on the triangle in the image?',
          images: [VALID_TEST_IMAGE]
        }]
      });

      assert.strictEqual(resp.statusCode, 200);
      assert.strictEqual(resp.body.reasoningPath, 'VISION');
      assert.strictEqual(resp.body.withheld, true, 'Delivery gate MUST flag response as withheld');
      assert(!resp.body.message.content.includes('Therefore, we have csc(60°) = 2/3'), 'False answer MUST NOT reach the student');
      assert(resp.body.message.content.includes('I need a little more information') || resp.body.message.content.includes('withhold') || resp.body.message.content.includes('cannot certify'), 'Must explain safe withholding');
      console.log(`     Delivery gate protection verified: withheld=${resp.body.withheld}`);
    });

    await test('3.2: Correct vision candidate passes verification and is DELIVERED', async () => {
      providerPolicy.clearRateLimits();

      https.request = function(options, callback) {
        const host = options.hostname || options.host;
        if (host === 'api.groq.com') {
          const reqMock = {
            on: () => reqMock,
            write: () => {},
            end: () => {
              const resMock = {
                statusCode: 200,
                headers: {},
                on: (event, handler) => {
                  if (event === 'data') {
                    handler(JSON.stringify({
                      choices: [{
                        message: {
                          role: 'assistant',
                          content: 'Looking at the right triangle: opposite = 3, adjacent = 4, hypotenuse = 5. By the Pythagorean theorem, 3^2 + 4^2 = 25 = 5^2. The sine of the angle is opposite / hypotenuse = 3/5 = 0.6.'
                        }
                      }]
                    }));
                  }
                  if (event === 'end') handler();
                }
              };
              if (callback) callback(resMock);
            }
          };
          return reqMock;
        }
        return origHttpsRequest.apply(https, arguments);
      };

      const resp = await makeTestChatRequest({
        messages: [{
          role: 'user',
          content: 'Find the sine of the angle in the 3-4-5 right triangle shown in the image.',
          images: [VALID_TEST_IMAGE]
        }]
      });

      assert.strictEqual(resp.statusCode, 200);
      assert.strictEqual(resp.body.reasoningPath, 'VISION');
      assert.strictEqual(resp.body.withheld, undefined, 'Verified response must NOT be withheld');
      assert(resp.body.message.content.includes('0.6') || resp.body.message.content.includes('3/5'));
      console.log(`     Correct vision candidate delivered successfully: content="${resp.body.message.content.slice(0, 80)}..."`);
    });

    await test('3.3: Vision diagram read correctly but arithmetic wrong -> Deterministic Supremacy overrides', async () => {
      providerPolicy.clearRateLimits();

      https.request = function(options, callback) {
        const host = options.hostname || options.host;
        if (host === 'api.groq.com') {
          const reqMock = {
            on: () => reqMock,
            write: () => {},
            end: () => {
              const resMock = {
                statusCode: 200,
                headers: {},
                on: (event, handler) => {
                  if (event === 'data') {
                    // Triangle geometry is valid (3-4-5), but model miscomputes arithmetic: 3 * 4 = 15
                    handler(JSON.stringify({
                      choices: [{
                        message: {
                          role: 'assistant',
                          content: 'The right triangle has legs 3 and 4, with hypotenuse 5. The area of the triangle is: (3 * 4) / 2. We calculate 3 * 4 = 15, so area = 7.5.'
                        }
                      }]
                    }));
                  }
                  if (event === 'end') handler();
                }
              };
              if (callback) callback(resMock);
            }
          };
          return reqMock;
        }
        return origHttpsRequest.apply(https, arguments);
      };

      const resp = await makeTestChatRequest({
        messages: [{
          role: 'user',
          content: 'Calculate the product of the legs (3 * 4) for the triangle in the image.',
          images: [VALID_TEST_IMAGE]
        }]
      });

      assert.strictEqual(resp.statusCode, 200);
      assert.strictEqual(resp.body.reasoningPath, 'VISION');
      // Deterministic supremacy MUST correct 15 to 12
      assert(!resp.body.message.content.includes('3 * 4 = 15'), 'False arithmetic 3 * 4 = 15 must not be delivered');
      assert(resp.body.message.content.includes('12'), 'Deterministic supremacy must substitute exact CAS truth 12');
      console.log(`     Deterministic supremacy over vision calculation verified: content="${resp.body.message.content.slice(0, 100)}..."`);
    });

    await test('3.4: Vision answers a different quantity -> Delivery gate blocks fidelity failure', async () => {
      providerPolicy.clearRateLimits();

      https.request = function(options, callback) {
        const host = options.hostname || options.host;
        if (host === 'api.groq.com') {
          const reqMock = {
            on: () => reqMock,
            write: () => {},
            end: () => {
              const resMock = {
                statusCode: 200,
                headers: {},
                on: (event, handler) => {
                  if (event === 'data') {
                    // User asks for csc(60°), but vision solves sin(60°)
                    handler(JSON.stringify({
                      choices: [{
                        message: {
                          role: 'assistant',
                          content: 'Based on the diagram, we have: sin(60°) = 0.866. Therefore, the sine is 0.866.'
                        }
                      }]
                    }));
                  }
                  if (event === 'end') handler();
                }
              };
              if (callback) callback(resMock);
            }
          };
          return reqMock;
        }
        return origHttpsRequest.apply(https, arguments);
      };

      const resp = await makeTestChatRequest({
        messages: [{
          role: 'user',
          content: 'What is csc(60°) based on the triangle in the image?',
          images: [VALID_TEST_IMAGE]
        }]
      });

      assert.strictEqual(resp.statusCode, 200);
      assert.strictEqual(resp.body.reasoningPath, 'VISION');
      assert.strictEqual(resp.body.withheld, true, 'Must safely withhold when candidate fails prompt-to-claim fidelity');
      console.log(`     Fidelity gating verified: withheld=${resp.body.withheld}`);
    });

    await test('3.5: Vision provider failure -> Automatic failover to Gemini vision without bypassing verification', async () => {
      providerPolicy.clearRateLimits();
      const savedGeminiKey = process.env.GEMINI_API_KEY;
      const savedGeminiFree = process.env.GEMINI_FREE_TIER;
      process.env.GEMINI_API_KEY = 'AIzaSyMockKeyForTesting1234567890123';
      process.env.GEMINI_FREE_TIER = 'true';

      let groqTried = false;
      let geminiInvoked = false;

      try {
        https.request = function(options, callback) {
          const host = options.hostname || options.host;
          if (host === 'api.groq.com') {
            groqTried = true;
            const reqMock = {
              on: (event, handler) => {
                if (event === 'error') process.nextTick(() => handler(new Error('Groq vision gateway timeout')));
                return reqMock;
              },
              write: () => {},
              end: () => {}
            };
            return reqMock;
          }

          if (host === 'generativelanguage.googleapis.com') {
            geminiInvoked = true;
            const reqMock = {
              on: () => reqMock,
              write: () => {},
              end: () => {
                const resMock = {
                  statusCode: 200,
                  headers: {},
                  on: (event, handler) => {
                    if (event === 'data') {
                      handler(JSON.stringify({
                        candidates: [{
                          content: {
                            parts: [{
                              text: 'Gemini vision failover recovered: In the 3-4-5 triangle, opposite = 3, hypotenuse = 5, so sin = 3/5 = 0.6.'
                            }]
                          }
                        }]
                      }));
                    }
                    if (event === 'end') handler();
                  }
                };
                if (callback) callback(resMock);
              }
            };
            return reqMock;
          }

          return origHttpsRequest.apply(https, arguments);
        };

        const resp = await makeTestChatRequest({
          messages: [{
            role: 'user',
            content: 'Find the sine of the angle in the 3-4-5 right triangle in the image.',
            images: [VALID_TEST_IMAGE]
          }]
        });

        assert.strictEqual(resp.statusCode, 200);
        assert(groqTried, 'Groq vision primary must be attempted first');
        assert(geminiInvoked, 'Gemini vision backup must be invoked upon primary failure');
        assert.strictEqual(resp.body.reasoningPath, 'VISION');
        assert.strictEqual(resp.body.provider, 'gemini-vision');
        assert(resp.body.message.content.includes('0.6'));
        console.log(`     Dual-provider vision failover verified: provider=${resp.body.provider}`);
      } finally {
        if (savedGeminiKey !== undefined) process.env.GEMINI_API_KEY = savedGeminiKey;
        else delete process.env.GEMINI_API_KEY;
        if (savedGeminiFree !== undefined) process.env.GEMINI_FREE_TIER = savedGeminiFree;
        else delete process.env.GEMINI_FREE_TIER;
      }
    });

    await test('3.6: Multi-turn image context preserves diagram and problem history', async () => {
      providerPolicy.clearRateLimits();
      let receivedMessages = null;

      https.request = function(options, callback) {
        const host = options.hostname || options.host;
        if (host === 'api.groq.com') {
          const reqMock = {
            on: () => reqMock,
            write: (chunk) => {
              try {
                const parsed = JSON.parse(chunk);
                receivedMessages = parsed.messages;
              } catch (_) {}
            },
            end: () => {
              const resMock = {
                statusCode: 200,
                headers: {},
                on: (event, handler) => {
                  if (event === 'data') {
                    handler(JSON.stringify({
                      choices: [{
                        message: {
                          role: 'assistant',
                          content: 'From our previous triangle with sides 3, 4, 5, the cosine is adjacent / hypotenuse = 4/5 = 0.8.'
                        }
                      }]
                    }));
                  }
                  if (event === 'end') handler();
                }
              };
              if (callback) callback(resMock);
            }
          };
          return reqMock;
        }
        return origHttpsRequest.apply(https, arguments);
      };

      const resp = await makeTestChatRequest({
        messages: [
          {
            role: 'user',
            content: 'Here is a right triangle diagram.',
            images: [VALID_TEST_IMAGE]
          },
          {
            role: 'assistant',
            content: 'I see the right triangle with sides 3, 4, 5.'
          },
          {
            role: 'user',
            content: 'What is the cosine of that angle?'
          }
        ]
      });

      assert.strictEqual(resp.statusCode, 200);
      assert(receivedMessages, 'Must receive message history');
      assert(receivedMessages.length >= 3, 'Multi-turn context must be preserved');
      assert(resp.body.message.content.includes('0.8'));
      console.log(`     Multi-turn image conversation verified: ${receivedMessages.length} turns in context.`);
    });

  } finally {
    http.request = origHttpRequest;
    https.request = origHttpsRequest;
    server.close();
  }

  console.log(`\n🎉 ALL ${passedTests}/${totalTests} VISION VERIFICATION TESTS PASSED!`);
}

runAllTests().catch(err => {
  console.error('\n❌ Test suite failed:', err);
  process.exit(1);
});
