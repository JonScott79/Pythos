/*
    test/property/property_tests.js
    Property-Based Test Generator for Mathematical and Invariant Verification.
*/

const MathJSVerifier = require('../../server/mathjsVerifier');
const { runDeterministicVerification } = require('../../server/verificationBridge');

function generateArithmeticTests(count = 50) {
  const results = [];
  for (let i = 0; i < count; i++) {
    const a = Math.floor(Math.random() * 10000) - 5000;
    const b = Math.floor(Math.random() * 10000) - 5000;
    const isCorrupted = Math.random() < 0.5;
    const correctSum = a + b;
    const proposedSum = isCorrupted ? correctSum + (Math.random() < 0.5 ? 1 : -1) * (Math.floor(Math.random() * 10) + 1) : correctSum;

    const res = MathJSVerifier.verify({
      domain: 'arithmetic',
      data: { expression: `${a} + ${b}`, proposed_value: proposedSum }
    });

    const expectedPass = !isCorrupted;
    const passed = (res.verified === expectedPass);
    results.push({
      type: 'arithmetic_property',
      input: `${a} + ${b} = ${proposedSum}`,
      isCorrupted,
      verified: res.verified,
      passed,
      status: res.status
    });
  }
  return results;
}

module.exports = { generateArithmeticTests };
