/*
    test/fuzz/fuzz_tests.js
    Fuzz Testing Suite against Parsers, Mathematical Bridge, and JSON-RPC dispatchers.
*/

const MathJSVerifier = require('../../server/mathjsVerifier');
const { runDeterministicVerification } = require('../../server/verificationBridge');

const FUZZ_INPUTS = [
  "",
  " ",
  "   \n\t\r  ",
  "NaN",
  "Infinity",
  "-Infinity",
  "1e1000",
  "1e-1000",
  "9999999999999999999999999999999999999999999999999999999999999999999999999999999999",
  "((((((((((((((((((((((1+1))))))))))))))))))))))",
  "sqrt(sqrt(sqrt(sqrt(-1))))",
  "x / 0",
  "0 / 0",
  "NULL",
  "undefined",
  "__proto__",
  "constructor",
  "<script>alert(1)</script>",
  "DROP TABLE users;",
  "{{7*7}}",
  "${7*7}",
  "\\frac{1}{0}",
  "\\sqrt{-100}",
  "\u0000\u0001\u0002\u0003",
  "∫_0^∞ e^(-x^2) dx",
  "∑_{i=1}^n i",
  "x^2 + y^2 = r^2",
  "sin(cos(tan(cot(sec(csc(x))))))"
];

async function runFuzzTests() {
  const results = [];

  for (const fuzzStr of FUZZ_INPUTS) {
    let mathjsCrashed = false;
    let bridgeCrashed = false;
    let mathjsRes = null;
    let bridgeRes = null;

    try {
      mathjsRes = MathJSVerifier.verify({
        domain: 'arithmetic',
        data: { expression: fuzzStr, proposed_value: 0 }
      });
    } catch (e) {
      mathjsCrashed = true;
    }

    try {
      bridgeRes = await runDeterministicVerification({
        domain: 'arithmetic',
        data: { expression: fuzzStr, proposed_value: 0 }
      });
    } catch (e) {
      bridgeCrashed = true;
    }

    // Fuzz test passes if the system did not crash AND did not falsely verify the garbage expression as 0
    const passed = !mathjsCrashed && !bridgeCrashed && (mathjsRes?.status !== 'VERIFIED' || fuzzStr === '0');
    results.push({
      input: fuzzStr,
      mathjsCrashed,
      bridgeCrashed,
      mathjsStatus: mathjsRes?.status,
      bridgeStatus: bridgeRes?.status,
      passed
    });
  }

  return results;
}

module.exports = { runFuzzTests };
