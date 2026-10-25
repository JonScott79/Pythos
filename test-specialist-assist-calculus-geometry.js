/**
 * test-specialist-assist-calculus-geometry.js
 *
 * Comprehensive Capability & Safety Suite for Calculus & Geometry Specialist Engines.
 * Tests:
 * 1. Calculus Engine: Derivatives, higher-order, tangent lines, indefinite/definite integrals
 * 2. Geometry Engine: Two-point distance/midpoint/slope, line intersection, Shoelace polygon area,
 *    collinearity degeneracy, triangle sides/inequality/Heron, right triangle solver,
 *    circle area/circumference, and circle sector area/arc length
 * 3. Natural Language Intent Extraction
 * 4. Shadow Mode Invariants (Zero prompt mutation, structured telemetry logging)
 * 5. Active Mode Invariants (Ground-truth context formatting, allowlisted tool selection)
 */

const assert = require('assert');
const calculusEngine = require('./server/engines/calculusEngine');
const geometryEngine = require('./server/engines/geometryEngine');
const specialistAssist = require('./server/specialistAssist');
const toolController = require('./server/toolController');

let passCount = 0;
let failCount = 0;

async function asyncTest(name, fn) {
  try {
    await fn();
    console.log(`[PASS] ${name}`);
    passCount++;
  } catch (err) {
    console.error(`[FAIL] ${name}: ${err.message}`);
    failCount++;
  }
}

(async () => {
  console.log('=== RUNNING CALCULUS & GEOMETRY SPECIALIST TEST SUITE ===\n');

  // ==========================================
  // 1. CALCULUS ENGINE CAPABILITIES
  // ==========================================
  console.log('--- 1. Calculus Engine Unit Tests ---');

  await asyncTest('Calculus: First derivative of sin(x^2)', async () => {
    const res = await calculusEngine.differentiate('sin(x^2)');
    assert.strictEqual(res.status, 'VERIFIED');
    assert.ok(res.exactResult.includes('cos') && res.exactResult.includes('2*x'), `Unexpected result: ${res.exactResult}`);
  });

  await asyncTest('Calculus: Second derivative of x^4 - 3x^2', async () => {
    const res = await calculusEngine.differentiate('x^4 - 3*x^2', { order: 2 });
    assert.strictEqual(res.status, 'VERIFIED');
    assert.ok(res.exactResult.includes('12*x') && res.exactResult.includes('6'), `Unexpected result: ${res.exactResult}`);
  });

  await asyncTest('Calculus: Tangent line to x^2 + 3x at x = 2 (Slope 7, y = 7x - 4)', async () => {
    const res = await calculusEngine.tangentLine('x^2 + 3*x', { point: 2 });
    assert.strictEqual(res.status, 'VERIFIED');
    assert.strictEqual(res.slopeNumeric, 7);
    assert.strictEqual(res.yNumeric, 10);
    assert.ok(res.tangentEquation.includes('7*x - 4') || res.tangentEquation.includes('7*x + -4'), `Unexpected tangent: ${res.tangentEquation}`);
  });

  await asyncTest('Calculus: Indefinite integral of 3x^2 (x^3 + C)', async () => {
    const res = await calculusEngine.integrate('3*x^2', { isDefinite: false });
    assert.strictEqual(res.status, 'VERIFIED');
    assert.ok(res.exactResult.includes('x**3') || res.exactResult.includes('x^3'), `Unexpected integral: ${res.exactResult}`);
  });

  await asyncTest('Calculus: Definite integral of sin(x) from 0 to pi (= 2)', async () => {
    const res = await calculusEngine.integrate('sin(x)', { isDefinite: true, lowerLimit: 0, upperLimit: 'pi' });
    assert.strictEqual(res.status, 'VERIFIED');
    assert.strictEqual(res.exactResult, '2');
    assert.strictEqual(res.numericResult, 2);
  });

  // ==========================================
  // 2. GEOMETRY ENGINE CAPABILITIES
  // ==========================================
  console.log('\n--- 2. Geometry Engine Unit Tests ---');

  await asyncTest('Geometry: Two-point distance and midpoint between (1, 2) and (4, 6) (d = 5, M = (2.5, 4))', () => {
    const res = geometryEngine.solveTwoPoints({ x: 1, y: 2 }, { x: 4, y: 6 });
    assert.strictEqual(res.status, 'VERIFIED');
    assert.strictEqual(res.distance, 5);
    assert.strictEqual(res.midpoint.x, 2.5);
    assert.strictEqual(res.midpoint.y, 4);
    assert.ok(Math.abs(res.slope - 4 / 3) < 1e-9);
  });

  await asyncTest('Geometry: Line-Line intersection of 2x + y = 5 and x - y = 1 (Intersection (2, 1))', () => {
    const res = geometryEngine.intersectLines({ A: 2, B: 1, C: -5 }, { A: 1, B: -1, C: -1 });
    assert.strictEqual(res.status, 'VERIFIED');
    assert.strictEqual(res.intersection.x, 2);
    assert.strictEqual(res.intersection.y, 1);
  });

  await asyncTest('Geometry: Shoelace polygon area of 4x3 rectangle (Area = 12)', () => {
    const vertices = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }];
    const res = geometryEngine.solvePolygonArea(vertices);
    assert.strictEqual(res.status, 'VERIFIED');
    assert.strictEqual(res.area, 12);
    assert.strictEqual(res.perimeter, 14);
  });

  await asyncTest('Geometry: Shoelace collinear points detection (Area = 0, isDegenerate = true)', () => {
    const vertices = [{ x: 0, y: 0 }, { x: 2, y: 2 }, { x: 4, y: 4 }];
    const res = geometryEngine.solvePolygonArea(vertices);
    assert.strictEqual(res.status, 'VERIFIED');
    assert.strictEqual(res.isDegenerate, true);
    assert.strictEqual(res.area, 0);
  });

  await asyncTest('Geometry: Triangle 3, 4, 5 (Right Triangle, Area = 6, Perimeter = 12)', () => {
    const res = geometryEngine.solveTriangleSides(3, 4, 5);
    assert.strictEqual(res.status, 'VERIFIED');
    assert.strictEqual(res.isRight, true);
    assert.strictEqual(res.area, 6);
    assert.strictEqual(res.perimeter, 12);
  });

  await asyncTest('Geometry: Triangle inequality violation (1, 2, 10 -> FAILED)', () => {
    const res = geometryEngine.solveTriangleSides(1, 2, 10);
    assert.strictEqual(res.status, 'FAILED');
    assert.strictEqual(res.error, 'TRIANGLE_INEQUALITY_VIOLATION');
  });

  await asyncTest('Geometry: Right triangle missing leg (leg = 5, hypotenuse = 13 -> missing leg = 12, area = 30)', () => {
    const res = geometryEngine.solveRightTriangle({ a: 5, c: 13 });
    assert.strictEqual(res.status, 'VERIFIED');
    assert.strictEqual(res.b, 12);
    assert.strictEqual(res.area, 30);
    assert.strictEqual(res.perimeter, 30);
  });

  await asyncTest('Geometry: Circle radius = 5 (Area = 25pi, Circumference = 10pi)', () => {
    const res = geometryEngine.solveCircle({ radius: 5 });
    assert.strictEqual(res.status, 'VERIFIED');
    assert.strictEqual(res.areaExact, '25\\pi');
    assert.strictEqual(res.circumferenceExact, '10\\pi');
  });

  await asyncTest('Geometry: Circle sector radius = 6, angle = 60 deg (Arc Length = 2pi, Sector Area = 6pi)', () => {
    const res = geometryEngine.solveCircleSector({ radius: 6, angle: 60, unit: 'degrees' });
    assert.strictEqual(res.status, 'VERIFIED');
    assert.strictEqual(res.arcExact, '2\\pi');
    assert.strictEqual(res.areaExact, '6\\pi');
    assert.ok(Math.abs(res.arcLength - 2 * Math.PI) < 1e-9);
    assert.ok(Math.abs(res.sectorArea - 6 * Math.PI) < 1e-9);
  });

  // ==========================================
  // 3. NATURAL LANGUAGE INTENT EXTRACTION
  // ==========================================
  console.log('\n--- 3. Intent Extraction Tests ---');

  await asyncTest('Extract: Tangent line natural query', () => {
    const task = specialistAssist.extractSpecialistTask('Find the tangent line to f(x) = x^2 + 3x at x = 2');
    assert.ok(task);
    assert.strictEqual(task.domain, 'calculus');
    assert.strictEqual(task.operation, 'TANGENT_LINE');
    assert.strictEqual(task.point, 2);
  });

  await asyncTest('Extract: Derivative natural query', () => {
    const task = specialistAssist.extractSpecialistTask('What is the derivative of sin(x^2)?');
    assert.ok(task);
    assert.strictEqual(task.domain, 'calculus');
    assert.strictEqual(task.operation, 'DIFFERENTIATION');
  });

  await asyncTest('Extract: Definite integral natural query', () => {
    const task = specialistAssist.extractSpecialistTask('calculate the integral of sin(x) from 0 to pi');
    assert.ok(task);
    assert.strictEqual(task.domain, 'calculus');
    assert.strictEqual(task.operation, 'INTEGRATION');
    assert.strictEqual(task.isDefinite, true);
  });

  await asyncTest('Extract: Two points distance natural query', () => {
    const task = specialistAssist.extractSpecialistTask('distance between (1, 2) and (4, 6)');
    assert.ok(task);
    assert.strictEqual(task.domain, 'geometry');
    assert.strictEqual(task.operation, 'TWO_POINTS');
    assert.deepStrictEqual(task.p1, { x: 1, y: 2 });
    assert.deepStrictEqual(task.p2, { x: 4, y: 6 });
  });

  await asyncTest('Extract: Circle sector arc length natural query', () => {
    const task = specialistAssist.extractSpecialistTask('arc length of a circle with radius 6 and angle 60 degrees');
    assert.ok(task);
    assert.strictEqual(task.domain, 'geometry');
    assert.strictEqual(task.operation, 'CIRCLE_SECTOR');
    assert.strictEqual(task.radius, 6);
    assert.strictEqual(task.angle, 60);
  });

  // ==========================================
  // 4. SHADOW MODE VS ACTIVE MODE
  // ==========================================
  console.log('\n--- 4. Shadow Mode vs Active Mode Invariants ---');

  await asyncTest('Shadow Mode Invariant: Computes answer in background, logs telemetry, returns empty context', async () => {
    process.env.SPECIALIST_ENGINE_MODE = 'shadow';
    specialistAssist.clearSpecialistTelemetry();

    const evalRes = await specialistAssist.evaluateSpecialistAssist('What is the derivative of sin(x^2)?');
    assert.strictEqual(evalRes.matched, true);
    assert.strictEqual(evalRes.mode, 'shadow');
    assert.strictEqual(evalRes.contextString, '', 'Shadow mode must NEVER mutate prompt context');
    assert.ok(evalRes.result);
    assert.strictEqual(evalRes.result.status, 'VERIFIED');

    const telem = specialistAssist.getSpecialistTelemetry();
    assert.strictEqual(telem.stats.shadowRuns, 1);
    assert.strictEqual(telem.recentLog.length, 1);
    assert.strictEqual(telem.recentLog[0].operation, 'DIFFERENTIATION');
    assert.strictEqual(telem.recentLog[0].status, 'VERIFIED');
  });

  await asyncTest('Shadow Mode Invariant: toolController does NOT intercept queries when mode is shadow', () => {
    process.env.SPECIALIST_ENGINE_MODE = 'shadow';
    const toolSel = toolController.selectAppropriateTool(null, 'What is the derivative of sin(x^2)?', []);
    assert.strictEqual(toolSel, null, 'toolController must NOT select specialist tool when mode is shadow');
  });

  await asyncTest('Active Mode Invariant: Injects ground truth context and enables toolController tool selection', async () => {
    process.env.SPECIALIST_ENGINE_MODE = 'active';

    const evalRes = await specialistAssist.evaluateSpecialistAssist('What is the derivative of sin(x^2)?');
    assert.strictEqual(evalRes.matched, true);
    assert.strictEqual(evalRes.mode, 'active');
    assert.ok(evalRes.contextString.includes('# PRE-COMPUTED DETERMINISTIC GROUND TRUTH (CALCULUS: DIFFERENTIATION)'));
    assert.ok(evalRes.contextString.includes('Authoritative Verified Result:'));

    const toolSel = toolController.selectAppropriateTool(null, 'What is the derivative of sin(x^2)?', []);
    assert.ok(toolSel, 'Expected tool selection in active mode');
    assert.strictEqual(toolSel.tool, toolController.TOOL_ALLOWLIST.SOLVE_CALCULUS);
    assert.strictEqual(toolSel.arguments.operation, 'DIFFERENTIATION');
  });

  // Reset to default shadow mode
  process.env.SPECIALIST_ENGINE_MODE = 'shadow';
  calculusEngine.closeCalculusDaemon();

  console.log(`\n=== SPECIALIST SUITE SUMMARY: ${passCount} PASSED, ${failCount} FAILED ===\n`);
  if (failCount > 0) {
    process.exit(1);
  }
})();
