/**
 * test_error_taxonomy.js
 * 
 * Comprehensive Test Suite for Pythos Error Normalization & Taxonomy:
 * 1. Groq 429 / Rate Limit (UPSTREAM_RATE_LIMITED)
 * 2. Upstream Timeout (UPSTREAM_TIMEOUT)
 * 3. Upstream 401/403 Authentication Failure (UPSTREAM_AUTH_ERROR)
 * 4. Upstream 400 Bad Request (UPSTREAM_BAD_REQUEST)
 * 5. Upstream 5xx Server Error (UPSTREAM_SERVER_ERROR)
 * 6. Network / Unreachable Failure (UPSTREAM_UNAVAILABLE)
 * 7. Unexpected Internal Error (INTERNAL_ERROR)
 * 8. Sanitization & Privacy: Guarantee zero API keys, Org IDs, file paths, or Base64 payloads leak
 * 9. Integration tests against live server /api/chat error handling
 */

const assert = require('assert');
const http = require('http');
const { classifyUpstreamError, sanitizeErrorDetail, extractRetrySeconds } = require('./server/errorHandler');

console.log('🧪 Running Pythos Error Taxonomy & Response Normalization Suite...\n');

function testUnitClassifications() {
  console.log('--- PART 1: Unit Test Error Classifications ---');

  // 1. Rate Limit (HTTP 429)
  const rateLimitErr = new Error('Rate limit reached for model `qwen/qwen3.8-27b` in organization `org_01m15vbt17emvs7g2bm8fgxmwn` service tier `on_demand` on tokens per day (TPD): Limit 200000, Used 199876, Requested 3250. Please try again in 8m41.424s.');
  rateLimitErr.statusCode = 429;
  rateLimitErr.body = rateLimitErr.message;
  
  const c1 = classifyUpstreamError(rateLimitErr, 'vision');
  assert.strictEqual(c1.status, 429, 'Rate limit must map to HTTP 429');
  assert.strictEqual(c1.error, 'UPSTREAM_RATE_LIMITED');
  assert(c1.message.includes('busy with high demand'), 'Message must be student-friendly');
  assert(c1.message.includes('about 9 minutes'), 'Must calculate friendly retry duration');
  assert.strictEqual(c1.retryAfter, 522, 'Must extract exact retry seconds (8m 42s = 522s)');
  assert(!c1.message.includes('org_'), 'Must not leak organization ID to message');
  assert(!c1.sanitizedDetail.includes('org_01m15vbt17emvs7g2bm8fgxmwn'), 'Must sanitize organization ID from details');
  console.log('  [PASS] 1. Rate Limit (UPSTREAM_RATE_LIMITED, HTTP 429)');

  // 2. Timeout (ETIMEDOUT / 504)
  const timeoutErr = new Error('ETIMEDOUT');
  timeoutErr.code = 'ETIMEDOUT';
  const c2 = classifyUpstreamError(timeoutErr, 'text');
  assert.strictEqual(c2.status, 504, 'Timeout must map to HTTP 504');
  assert.strictEqual(c2.error, 'UPSTREAM_TIMEOUT');
  assert(c2.message.includes('longer than expected'), 'Must have helpful timeout message');
  console.log('  [PASS] 2. Timeout (UPSTREAM_TIMEOUT, HTTP 504)');

  // 3. Auth Failure (401/403)
  const authErr = new Error('Groq Vision returned 401: {"error":{"message":"Invalid API Key provided: gsk_1234567890abcdef1234567890"}}');
  authErr.statusCode = 401;
  const c3 = classifyUpstreamError(authErr, 'vision');
  assert.strictEqual(c3.status, 502, 'Auth failure must map to HTTP 502 for client');
  assert.strictEqual(c3.error, 'UPSTREAM_AUTH_ERROR');
  assert(c3.message.includes('scheduled maintenance'), 'Must display safe maintenance message without credentials');
  assert(!c3.message.includes('gsk_'), 'Must not leak API key to student message');
  assert(!c3.sanitizedDetail.includes('gsk_1234567890abcdef1234567890'), 'Must sanitize raw API key from details');
  console.log('  [PASS] 3. Auth Failure (UPSTREAM_AUTH_ERROR, HTTP 502)');

  // 4. Bad Request (400)
  const badReqErr = new Error('Upstream provider returned status 400: invalid prompt format');
  badReqErr.statusCode = 400;
  const c4 = classifyUpstreamError(badReqErr, 'text');
  assert.strictEqual(c4.status, 400, 'Bad request must map to HTTP 400');
  assert.strictEqual(c4.error, 'UPSTREAM_BAD_REQUEST');
  assert(c4.message.includes('rephrase'), 'Must advise rephrasing');
  console.log('  [PASS] 4. Bad Request (UPSTREAM_BAD_REQUEST, HTTP 400)');

  // 5. Upstream Server Error (500/503)
  const srvErr = new Error('Upstream provider returned status 503: Service Unavailable');
  srvErr.statusCode = 503;
  const c5 = classifyUpstreamError(srvErr, 'text');
  assert.strictEqual(c5.status, 502, 'Upstream 503 must map to HTTP 502');
  assert.strictEqual(c5.error, 'UPSTREAM_SERVER_ERROR');
  assert(c5.message.includes('high load'), 'Must indicate high load or temporary glitch');
  console.log('  [PASS] 5. Server Error (UPSTREAM_SERVER_ERROR, HTTP 502)');

  // 6. Network / Unreachable Failure (ECONNREFUSED)
  const netErr = new Error('connect ECONNREFUSED 127.0.0.1:11434');
  netErr.code = 'ECONNREFUSED';
  const c6 = classifyUpstreamError(netErr, 'text');
  assert.strictEqual(c6.status, 503, 'Connection refused must map to HTTP 503');
  assert.strictEqual(c6.error, 'UPSTREAM_UNAVAILABLE');
  assert(c6.message.includes('Connection to the reasoning service could not be established'), 'Must indicate connection failure');
  console.log('  [PASS] 6. Network / Unreachable (UPSTREAM_UNAVAILABLE, HTTP 503)');

  // 7. Unexpected Internal Error
  const unknownErr = new TypeError('Cannot read properties of undefined (reading "foo")');
  const c7 = classifyUpstreamError(unknownErr, 'internal');
  assert.strictEqual(c7.status, 500, 'Unknown errors must map to HTTP 500');
  assert.strictEqual(c7.error, 'INTERNAL_ERROR');
  assert(c7.message.includes('unexpected error occurred'), 'Must offer generic safe message');
  console.log('  [PASS] 7. Unexpected Internal Error (INTERNAL_ERROR, HTTP 500)');

  // 8. Retry Interval Edge Cases
  const rateLimitNoWait = new Error('Rate limit exceeded');
  rateLimitNoWait.statusCode = 429;
  const c8a = classifyUpstreamError(rateLimitNoWait, 'text');
  assert(!c8a.message.includes('about 0 minutes'), 'Never emit 0 minutes');
  assert.strictEqual(c8a.retryAfter, undefined, 'retryAfter undefined when provider gives no duration');
  assert(c8a.message.includes('Please wait a moment and try again'), 'Honest fallback message when no duration provided');

  // Provider with 15 second delay
  const rateLimitShort = new Error('Rate limit: try again in 15.2s');
  rateLimitShort.statusCode = 429;
  rateLimitShort.body = rateLimitShort.message;
  const c8b = classifyUpstreamError(rateLimitShort, 'vision');
  assert(c8b.message.includes('about 16 seconds') || c8b.message.includes('about 15 seconds'), 'Short delays must be in seconds, not 0 minutes');
  assert.strictEqual(c8b.retryAfter, 16);
  console.log('  [PASS] 8. Retry Edge Cases: No 0 minutes, no negative values, clean provider fallback');
}

function testSanitization() {
  console.log('\n--- PART 2: Security & Privacy Sanitization Tests ---');

  const dirtyString = `
    Error: Failed to connect with Bearer gsk_abc12345678901234567890 in org_01m15vbt17emvs7g2bm8fgxmwn.
    File located at C:\\Projects\\lanzar\\pythos\\server\\server.js:700:15
    Payload contained data:image/jpeg;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==
  `;

  const cleaned = sanitizeErrorDetail(dirtyString);
  assert(!cleaned.includes('gsk_abc12345678901234567890'), 'Must scrub gsk API keys');
  assert(!cleaned.includes('org_01m15vbt17emvs7g2bm8fgxmwn'), 'Must scrub organization IDs');
  assert(!cleaned.includes('C:\\Projects\\lanzar\\pythos'), 'Must scrub local filesystem paths');
  assert(!cleaned.includes('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='), 'Must scrub base64 image data');
  console.log('  [PASS] All credentials, org IDs, internal paths, and base64 payloads completely redacted.');
}

async function testApiIntegration() {
  console.log('\n--- PART 3: API Integration Tests ---');
  process.env.NODE_ENV = 'test';
  const { app } = require('./server/server');
  const server = await new Promise(resolve => {
    const s = app.listen(0, () => resolve(s));
  });
  const port = server.address().port;

  try {
    // Test malformed payload rejection (400)
    const badReqPromise = new Promise((resolve) => {
      const req = http.request({
        hostname: 'localhost',
        port: port,
        path: '/api/chat',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, (res) => {
        let b = '';
        res.on('data', c => b += c);
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(b) }));
      });
      req.write(JSON.stringify({ messages: [{ role: 'user', content: 99999 }] }));
      req.end();
    });

    const badRes = await badReqPromise;
    assert.strictEqual(badRes.status, 400);
    assert.strictEqual(badRes.body.error, 'invalid_request');
    console.log('  [PASS] Invalid request payload returns HTTP 400 invalid_request');

    // Test corrupted base64 image rejection (400)
    const corruptImgPromise = new Promise((resolve) => {
      const req = http.request({
        hostname: 'localhost',
        port: port,
        path: '/api/chat',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, (res) => {
        let b = '';
        res.on('data', c => b += c);
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(b) }));
      });
      req.write(JSON.stringify({
        messages: [{
          role: 'user',
          content: 'Check this image',
          images: ['not-an-image-just-corrupt-string-data']
        }]
      }));
      req.end();
    });

    const corruptRes = await corruptImgPromise;
    assert.strictEqual(corruptRes.status, 400);
    assert.strictEqual(corruptRes.body.error, 'invalid_image');
    assert(corruptRes.body.message.includes('unsupported format') || corruptRes.body.message.includes('corrupted'));
    console.log('  [PASS] Corrupted image payload returns HTTP 400 invalid_image');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

async function run() {
  testUnitClassifications();
  testSanitization();
  await testApiIntegration();
  console.log('\n==================================================');
  console.log('🎉 ALL ERROR TAXONOMY TESTS PASSED');
  console.log('==================================================\n');
}

run().catch(err => {
  console.error('Test suite failure:', err);
  process.exit(1);
});
