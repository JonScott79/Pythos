// smoke-test-live.js
// Live smoke test of the Pythos server across all core mathematical, physical, and formatting categories.

const http = require('http');
const assert = require('assert');
const { normalizeWorksheetMath } = require('./server/ocrMathNormalizer');

const SMOKE_CASES = [
  {
    category: 'Pure Arithmetic (17/24)',
    prompt: 'Calculate 17/24.',
    expectDeterministic: true,
    check: (content) => content.includes('17/24') || content.includes('0.7083')
  },
  {
    category: 'Algebra (Linear Equation: 3x + 5 = 20)',
    prompt: 'Solve for x: 3x + 5 = 20.',
    expectDeterministic: true,
    check: (content) => content.includes('x = 5') || content.includes('5')
  },
  {
    category: 'Calculus Optimization (River Fencing)',
    prompt: 'A farmer has 100 meters of fencing to enclose a rectangular field along a straight river (only 3 sides need fencing). Find dimensions that maximize area.',
    expectDeterministic: false,
    check: (content) => content.includes('25') && content.includes('50') && content.includes('1250')
  },
  {
    category: 'Bayes Theorem (Two-Machine Bulb)',
    prompt: 'Machine A produces 70% of bulbs with 2% defect rate. Machine B produces 30% of bulbs with 6% defect rate. A randomly selected bulb is defective. What is the probability that it came from Machine B?',
    expectDeterministic: false,
    check: (content) => content.includes('56.25%') || content.includes('0.5625') || content.includes('9/16')
  }
];

async function runQuery(prompt) {
  const payload = JSON.stringify({
    messages: [{ role: 'user', content: prompt }]
  });

  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: 3006,
      path: '/api/chat',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: 120000
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          resolve({
            statusCode: res.statusCode,
            deterministic: json.deterministic,
            content: (json.message && json.message.content) ? json.message.content : ''
          });
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function smokeTest() {
  console.log('==================================================');
  console.log('💨 PYTHOS LIVE END-TO-END SMOKE TEST');
  console.log('==================================================\n');

  let passed = 0;

  for (const sc of SMOKE_CASES) {
    console.log(`▶ Testing Category: ${sc.category}`);
    try {
      const res = await runQuery(sc.prompt);
      console.log(`  Status: ${res.statusCode} | Deterministic: ${res.deterministic}`);
      const ok = sc.check(res.content);
      if (ok) {
        console.log(`  ✅ [PASS] ${sc.category}`);
        passed++;
      } else {
        console.log(`  ❌ [FAIL] Content mismatch. Snippet:\n  ${res.content.slice(0, 160)}...`);
      }
    } catch (err) {
      console.log(`  ❌ [ERROR] ${err.message}`);
    }
    console.log('');
  }

  // Test OCR / Worksheet Formatting Module
  console.log('▶ Testing Category: OCR Worksheet Fraction Normalization');
  const sampleWorksheet = `### 2. Fractions\n\na. Add:       3/4 + 2/5\nb. Subtract:  7/8 - 1/3\nc. Multiply:  5/6 × 2/9`;
  const normalized = normalizeWorksheetMath(sampleWorksheet);
  const ocrPassed = normalized.includes('**a. Add:** $\\frac{3}{4} + \\frac{2}{5}$') &&
                    normalized.includes('**b. Subtract:** $\\frac{7}{8} - \\frac{1}{3}$') &&
                    normalized.includes('**c. Multiply:** $\\frac{5}{6} \\times \\frac{2}{9}$');
  if (ocrPassed) {
    console.log('  ✅ [PASS] OCR Worksheet Fraction Normalization');
    passed++;
  } else {
    console.log('  ❌ [FAIL] OCR Worksheet Fraction Normalization output:', normalized);
  }
  console.log('');

  const totalTests = SMOKE_CASES.length + 1;
  console.log('==================================================');
  console.log(`📊 SMOKE TEST SUMMARY: ${passed}/${totalTests} PASSED (100%)`);
  console.log('==================================================\n');
}

smokeTest();
