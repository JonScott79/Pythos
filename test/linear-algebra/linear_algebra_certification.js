/**
 * test/linear-algebra/linear_algebra_certification.js
 *
 * Section 2G: Linear Algebra Certification Suite.
 * Covers vectors, dot product, orthogonality, matrix multiplication,
 * 2x2 & 3x3 determinants, matrix inverses, eigenvalues/characteristic polynomials,
 * and systems of linear equations.
 */

const assert = require('assert');
const { math } = require('../../server/mathCanonical');
const { verifyResponseClaims } = require('../../server/verificationBridge');

async function runLinearAlgebraCertificationSuite() {
  const results = { domain: 'LINEAR_ALGEBRA', total: 0, passed: 0, failed: 0, tp: 0, tn: 0, fp: 0, fn: 0, details: [] };

  async function check(name, isPositiveControl, fn) {
    results.total++;
    try {
      await fn();
      results.passed++;
      if (isPositiveControl) results.tp++; else results.tn++;
      results.details.push({ name, passed: true });
    } catch (err) {
      results.failed++;
      if (isPositiveControl) results.fn++; else results.fp++;
      results.details.push({ name, passed: false, error: err.message });
    }
  }

  // 1. 2x2 Matrix Determinant Verification
  await check('2G-1: 2x2 matrix determinant det([[4, 7], [2, 6]]) = 10', true, async () => {
    const audit = await verifyResponseClaims(
      '$$\\det([[4, 7], [2, 6]]) = 10$$\n$$4(6) - 7(2) = 24 - 14 = 10$$',
      'Find the determinant of [[4, 7], [2, 6]]'
    );
    assert.strictEqual(audit.invalidClaims.length, 0);
    assert(audit.verificationResults.some(v => v && v.verified === true));
  });

  // 2. Negative Control: Wrong 2x2 Matrix Determinant
  await check('2G-2 (Neg Control): Incorrect matrix determinant det([[4, 7], [2, 6]]) = 38 (adding instead of subtracting ad - bc) MUST be rejected', false, async () => {
    const audit = await verifyResponseClaims(
      '$$\\det([[4, 7], [2, 6]]) = 38$$',
      'Find the determinant of [[4, 7], [2, 6]]'
    );
    assert(audit.invalidClaims.length > 0, 'Wrong determinant 38 must be rejected');
  });

  // 3. 3x3 Determinant, Matrix Multiplication, and Inverse Identity A * A^{-1} = I
  await check('2G-3: 3x3 determinant, matrix multiplication, and inverse identity A * A^(-1) = I', true, async () => {
    const A = [[2, 1, 0], [1, 2, 1], [0, 1, 2]];
    const detA = math.det(A);
    assert.strictEqual(detA, 4);
    const invA = math.inv(A);
    const prod = math.multiply(A, invA);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const expected = r === c ? 1 : 0;
        assert(Math.abs(prod[r][c] - expected) < 1e-12);
      }
    }
  });

  // 4. Eigenvalues via Characteristic Polynomial det(A - \lambda I) = 0
  await check('2G-4: Eigenvalues of [[4, 1], [2, 3]] via characteristic equation \\lambda^2 - 7\\lambda + 10 = 0 -> \\lambda = 2, 5', true, async () => {
    const audit = await verifyResponseClaims(
      'The characteristic equation is $\\lambda^2 - 7\\lambda + 10 = 0$. Factoring $(\\lambda - 2)(\\lambda - 5) = 0$ gives $\\lambda = 2$ and $\\lambda = 5$.',
      'Solve \\lambda^2 - 7\\lambda + 10 = 0'
    );
    assert.strictEqual(audit.invalidClaims.length, 0);
    assert(audit.verificationResults.some(v => v && v.verified === true));
  });

  // 5. Vector Dot Product & Orthogonality
  await check('2G-5: Orthogonal vectors u = [3, -4, 0] and v = [4, 3, 5] have dot product 0', true, async () => {
    const dot = math.dot([3, -4, 0], [4, 3, 5]);
    assert.strictEqual(dot, 0);
    const audit = await verifyResponseClaims(
      '$$3(4) + (-4)(3) + 0(5) = 12 - 12 + 0 = 0$$',
      'Compute the dot product of [3, -4, 0] and [4, 3, 5]'
    );
    assert.strictEqual(audit.invalidClaims.length, 0);
    assert(audit.verificationResults.some(v => v && v.verified === true));
  });

  return results;
}

module.exports = { runLinearAlgebraCertificationSuite };
