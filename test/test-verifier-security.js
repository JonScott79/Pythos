/**
 * test/test-verifier-security.js
 *
 * PYTHOS PHASE XXI (Priority Six): Mathematical Input Isolation & Security Regression Suite
 */

const assert = require('assert');
const verificationBridge = require('../server/verificationBridge');
const calculusEngine = require('../server/engines/calculusEngine');

async function runTests() {
  console.log('======================================================================');
  console.log('PYTHOS PHASE XXI: MATHEMATICAL INPUT SECURITY & ISOLATION SUITE');
  console.log('======================================================================\n');

  let passed = 0;
  let total = 0;

  async function test(name, fn) {
    total++;
    try {
      await fn();
      console.log(`  ✓ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ [FAIL] ${name}`);
      console.error(`    ${err.message}`);
      process.exitCode = 1;
    }
  }

  const maliciousExprs = [
    "__import__('os').system('echo PWNED')",
    "__import__(chr(111)+chr(115))",
    "(1).__class__.__base__.__subclasses__()",
    "lambda x: x",
    "[x for x in range(10)]",
    "open('/etc/passwd').read()",
    "9**9**9**9",
    "x**999999",
    "x + " + "1 + ".repeat(2000) + "1"
  ];

  await test('SymPy verifier rejects all RCE, attribute-traversal, comprehension, and DoS payloads', async () => {
    for (const expr of maliciousExprs) {
      const res = await verificationBridge.runDeterministicVerification({
        domain: 'algebra',
        claim_type: 'symbolic_equivalence',
        data: { expr1: expr, expr2: '0' }
      });
      assert.strictEqual(res.verified, false, `Malicious expression must never verify: ${expr.slice(0, 40)}`);
    }
  });

  await test('Calculus worker rejects RCE, attribute-traversal, and DoS payloads', async () => {
    for (const expr of maliciousExprs) {
      const res = await calculusEngine.differentiate(expr, { variable: 'x' });
      assert.strictEqual(res.status, 'FAILED', `Calculus worker must fail closed on: ${expr.slice(0, 40)}`);
    }
  });

  await test('Verifier and calculus pools remain healthy after malicious input attempts', async () => {
    const vRes = await verificationBridge.runDeterministicVerification({
      domain: 'calculus',
      claim_type: 'derivative',
      data: { expression: 'x^3', variable: 'x', proposed_derivative: '3*x^2' }
    });
    assert.strictEqual(vRes.verified, true);

    const cRes = await calculusEngine.differentiate('sin(2*x)', { variable: 'x' });
    assert.strictEqual(cRes.status, 'VERIFIED');
  });

  verificationBridge.closeVerifierDaemon();
  calculusEngine.closeCalculusDaemon();
  console.log(`\nSUMMARY: ${passed}/${total} security isolation tests passed.`);
}

runTests().catch(err => {
  console.error('Fatal security test error:', err);
  try { verificationBridge.closeVerifierDaemon(); } catch (_) {}
  try { calculusEngine.closeCalculusDaemon(); } catch (_) {}
  process.exit(1);
});
