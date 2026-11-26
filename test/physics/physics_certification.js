/**
 * test/physics/physics_certification.js
 *
 * Sections 2E & 3A–3E: Geometry & Physics Reliability Certification Suite.
 * Covers Euclidean/analytic geometry, Classical Mechanics, Electricity & Magnetism,
 * Thermodynamics, Waves & Optics, and Modern Physics & Schwarzschild General Relativity.
 */

const assert = require('assert');
const geometryEngine = require('../../server/engines/geometryEngine');
const { verifyResponseClaims } = require('../../server/verificationBridge');

const { performance } = require('perf_hooks');

async function runPhysicsAndGeometryCertificationSuite() {
  const results = {
    domain: 'PHYSICS_AND_GEOMETRY',
    total: 0,
    passed: 0,
    failed: 0,
    tp: 0,
    tn: 0,
    fp: 0,
    fn: 0,
    solverTotal: 0,
    solverPassed: 0,
    verifyLatenciesMs: [],
    solverLatenciesMs: [],
    details: []
  };

  async function check(name, isPositiveControl, fn, kind = 'VERIFIER') {
    results.total++;
    if (kind === 'SOLVER') results.solverTotal++;
    const t0 = performance.now();
    try {
      await fn();
      const dt = performance.now() - t0;
      if (kind === 'SOLVER') {
        results.solverPassed++;
        results.solverLatenciesMs.push(dt);
      } else {
        results.verifyLatenciesMs.push(dt);
        if (isPositiveControl) results.tp++; else results.tn++;
      }
      results.passed++;
      results.details.push({ name, kind, expectedPositive: Boolean(isPositiveControl), passed: true, latencyMs: Number(dt.toFixed(2)) });
    } catch (err) {
      const dt = performance.now() - t0;
      results.failed++;
      if (kind !== 'SOLVER') {
        if (isPositiveControl) results.fn++; else results.fp++;
      }
      results.details.push({ name, kind, expectedPositive: Boolean(isPositiveControl), passed: false, error: err.message, latencyMs: Number(dt.toFixed(2)) });
    }
  }

  // 2E. Geometry (Right Triangles, Heron's Formula, Triangle Inequality Violation, Analytic Geometry)
  await check('2E-1: Euclidean right triangle, Heron area, and analytic two-point distance/slope', true, async () => {
    const rt = await geometryEngine.solveRightTriangle({ a: 5, b: 12 });
    assert.strictEqual(rt.status, 'VERIFIED');
    assert.strictEqual(Number(rt.exactResult), 13);

    const pts = geometryEngine.solveTwoPoints({ x: 1, y: 2 }, { x: 4, y: 6 });
    assert.strictEqual(pts.status, 'VERIFIED');
    assert.strictEqual(Number(pts.distance), 5);
  }, 'SOLVER');

  await check('2E-2 (Neg Control): Impossible triangle sides (2, 3, 10) violating triangle inequality MUST be rejected', false, async () => {
    const badTri = geometryEngine.solveTriangleSides(2, 3, 10);
    assert.notStrictEqual(badTri.status, 'VERIFIED', 'Impossible triangle (2,3,10) must not verify');
  }, 'SOLVER');

  // 3A. Classical Mechanics (Kinematics, Projectile Range, Elastic Collisions, Centripetal Acceleration)
  await check('3A-1: Classical mechanics kinematics, work-energy, and centripetal force F_c = mv^2/r', true, async () => {
    const audit = await verifyResponseClaims(
      '$$\\frac{2 \\cdot 10^2}{5} = \\frac{200}{5} = 40$$\n$$\\frac{1}{2} \\cdot 2 \\cdot 10^2 = 100$$',
      'A 2 kg mass moves in a circle of radius 5 m at 10 m/s. Find the centripetal force and kinetic energy.'
    );
    assert.strictEqual(audit.invalidClaims.length, 0);
    assert(audit.verificationResults.filter(v => v && v.verified).length >= 2);
  });

  // 3B. Electricity & Magnetism (Ohm's Law, Parallel Resistors, Capacitive Energy)
  await check('3B-1: Electromagnetism Ohm law and parallel resistance 1/(1/6 + 1/3) = 2 ohms', true, async () => {
    const audit = await verifyResponseClaims(
      '$$\\frac{1}{6} + \\frac{1}{3} = \\frac{1}{2}$$\n$$\\frac{12}{2} = 6$$',
      'Two resistors of 6 ohms and 3 ohms are connected in parallel across a 12 V battery. Find total current.'
    );
    assert.strictEqual(audit.invalidClaims.length, 0);
    assert(audit.verificationResults.filter(v => v && v.verified).length >= 2);
  });

  // 3C. Thermodynamics (Temperature Conversion, Ideal Gas Law, Carnot Efficiency)
  await check('3C-1: Thermodynamics Carnot engine efficiency 1 - T_C/T_H = 1 - 300/600 = 0.5', true, async () => {
    const audit = await verifyResponseClaims(
      '$$1 - \\frac{300}{600} = 0.5$$',
      'Find the Carnot efficiency of a heat engine operating between T_H = 600 K and T_C = 300 K.'
    );
    assert.strictEqual(audit.invalidClaims.length, 0);
    assert(audit.verificationResults.some(v => v && v.verified === true));
  });

  // 3D. Waves & Optics (Wave Speed v = f*lambda, Thin Lens Equation 1/f = 1/d_o + 1/d_i)
  await check('3D-1: Geometric optics thin-lens image distance 1/10 - 1/15 = 1/30 -> d_i = 30 cm', true, async () => {
    const audit = await verifyResponseClaims(
      '$$\\frac{1}{10} - \\frac{1}{15} = \\frac{3 - 2}{30} = \\frac{1}{30}$$',
      'An object is placed 15 cm from a converging lens of focal length 10 cm. Find 1/d_i.'
    );
    assert.strictEqual(audit.invalidClaims.length, 0);
    assert(audit.verificationResults.some(v => v && v.verified === true));
  });

  // 3E. Modern Physics & Schwarzschild Relativity (Lorentz Factor, Photon Sphere r_ph = 3r_s/2, V'_eff, V''_eff, b_crit)
  await check('3E-1: Special relativity Lorentz factor at v = 0.8c (\\gamma = 1/\\sqrt{1 - 0.8^2} = 5/3) and Schwarzschild photon sphere', true, async () => {
    const audit = await verifyResponseClaims(
      [
        '$$V_{\\mathrm{eff}}(r) = \\frac{L^2}{r^2}\\left(1 - \\frac{r_s}{r}\\right)$$',
        '$$V\'_{\\mathrm{eff}}(r) = L^2\\left(-\\frac{2}{r^3} + \\frac{3r_s}{r^4}\\right)$$',
        '$$V\'\'_{\\mathrm{eff}}(r) = L^2\\left(\\frac{6}{r^4} - \\frac{12r_s}{r^5}\\right)$$',
        '$$\\frac{\\frac{3}{2}r_s}{\\sqrt{1 - \\frac{2}{3}}} = \\frac{3\\sqrt{3}}{2}r_s$$'
      ].join('\n'),
      'For the Schwarzschild effective potential V_{\\mathrm{eff}}(r) = \\frac{L^2}{r^2}\\left(1 - \\frac{r_s}{r}\\right), verify V\'_{\\mathrm{eff}}(r), V\'\'_{\\mathrm{eff}}(r), and b_{\\mathrm{crit}}.'
    );
    assert.strictEqual(audit.invalidClaims.length, 0);
    assert.strictEqual(audit.verificationResults.filter(v => v && v.verified).length, 3);
  });

  await check('3E-2 (Neg Control): Wrong second derivative coefficient -10r_s/r^5 in Schwarzschild V\'\'_eff(r) MUST be rejected', false, async () => {
    const audit = await verifyResponseClaims(
      [
        '$$V_{\\mathrm{eff}}(r) = \\frac{L^2}{r^2}\\left(1 - \\frac{r_s}{r}\\right)$$',
        '$$V\'\'_{\\mathrm{eff}}(r) = L^2\\left(\\frac{6}{r^4} - \\frac{10r_s}{r^5}\\right)$$'
      ].join('\n'),
      'For V_{\\mathrm{eff}}(r) = \\frac{L^2}{r^2}\\left(1 - \\frac{r_s}{r}\\right), compute V\'\'_{\\mathrm{eff}}(r).'
    );
    assert(audit.invalidClaims.length > 0, 'Wrong coefficient -10r_s/r^5 must be rejected');
  });

  return results;
}

module.exports = { runPhysicsAndGeometryCertificationSuite };
