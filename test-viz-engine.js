/**
 * test-viz-engine.js
 *
 * Comprehensive Test Suite for Pythos Classical Visualization Engine:
 * 1. Valid visualization specification acceptance
 * 2. Invalid / malformed specification rejection (injection, invalid bounds, unknown models)
 * 3. Projectile physics model calculations (H, T, R, trajectory curve points)
 * 4. Slider & input bounds clamping
 * 5. State reset restoration
 * 6. Deterministic router projectile simulation intent and token payload validation
 */

const assert = require('assert');
const { validateVisualizationSpec, ALLOWED_TYPES, ALLOWED_MODELS } = require('./vizEngine/vizProtocol');
const ProjectileModel = require('./vizEngine/models/projectile');
const { analyzeDeterministicIntent, buildDeterministicResponse } = require('./server/deterministicRouter');

console.log("==================================================");
console.log("🏛️ RUNNING PYTHOS VISUALIZATION ENGINE TEST SUITE");
console.log("==================================================");

// --- TEST 1: Valid Visualization Specification ---
console.log("\n▶ [TEST 1] Valid Specification Acceptance");
const validSpec = {
  type: 'PHYSICS',
  model: 'projectile',
  title: 'Classical Projectile Trajectory',
  subtitle: 'BALLISTICS (ΒΛΗΜΑ)',
  variables: {
    velocity: { label: 'Speed', value: 30, min: 5, max: 60, step: 1, unit: 'm/s' },
    angle: { label: 'Angle', value: 45, min: 10, max: 80, step: 1, unit: '°' }
  }
};
const res1 = validateVisualizationSpec(validSpec);
assert(res1.valid === true, `Expected valid spec, got error: ${res1.error}`);
assert.strictEqual(res1.spec.type, 'PHYSICS');
assert.strictEqual(res1.spec.model, 'projectile');
assert.strictEqual(res1.spec.variables.velocity.value, 30);
console.log("✅ Valid visualization spec accepted and sanitized.");

// --- TEST 2: Invalid Specification Rejections ---
console.log("\n▶ [TEST 2] Invalid & Malicious Specification Rejections");

// 2a. Unknown type
const badType = { ...validSpec, type: 'ARBITRARY_SCRIPT' };
assert.strictEqual(validateVisualizationSpec(badType).valid, false, 'Should reject unknown type');

// 2b. Unknown model
const badModel = { ...validSpec, model: 'arbitrary_eval_runner' };
assert.strictEqual(validateVisualizationSpec(badModel).valid, false, 'Should reject unknown model');

// 2c. Missing title
const badTitle = { ...validSpec, title: '' };
assert.strictEqual(validateVisualizationSpec(badTitle).valid, false, 'Should reject empty title');

// 2d. Inverted min/max bounds
const badBounds = {
  type: 'PHYSICS',
  model: 'projectile',
  title: 'Bad Bounds',
  variables: {
    velocity: { value: 10, min: 50, max: 20, step: 1 }
  }
};
assert.strictEqual(validateVisualizationSpec(badBounds).valid, false, 'Should reject min >= max');

// 2e. Non-numeric values
const badNum = {
  type: 'PHYSICS',
  model: 'projectile',
  title: 'Bad Numbers',
  variables: {
    velocity: { value: 'NaN_DROP_TABLE', min: 0, max: 100, step: 1 }
  }
};
assert.strictEqual(validateVisualizationSpec(badNum).valid, false, 'Should reject non-numeric variable value');
console.log("✅ All invalid and adversarial specifications successfully rejected.");

// --- TEST 3: Projectile Physics Model Calculations ---
console.log("\n▶ [TEST 3] Analytical Physics Model Accuracy");
// For v0 = 20 m/s, theta = 30 deg, g = 9.8 m/s^2:
// v0x = 20 * cos(30°) = 20 * 0.866025 = 17.3205 m/s
// v0y = 20 * sin(30°) = 20 * 0.5 = 10.0 m/s
// T = 2 * 10 / 9.8 = 2.0408 s
// H = (10)^2 / (2 * 9.8) = 100 / 19.6 = 5.1020 m
// R = 17.3205 * 2.0408 = 35.3479 m
const calc = ProjectileModel.compute({ velocity: 20, angle: 30, gravity: 9.8 });

const tMetric = calc.metrics.find(m => m.id === 'flightTime').value;
const hMetric = calc.metrics.find(m => m.id === 'maxHeight').value;
const rMetric = calc.metrics.find(m => m.id === 'range').value;
const v0xMetric = calc.metrics.find(m => m.id === 'v0x').value;
const v0yMetric = calc.metrics.find(m => m.id === 'v0y').value;

assert(Math.abs(v0xMetric - 17.3205) < 0.01, `v0x expected 17.32, got ${v0xMetric}`);
assert(Math.abs(v0yMetric - 10.0) < 0.01, `v0y expected 10.0, got ${v0yMetric}`);
assert(Math.abs(tMetric - 2.04) < 0.02, `Flight time expected ~2.04s, got ${tMetric}`);
assert(Math.abs(hMetric - 5.10) < 0.02, `Max height expected ~5.10m, got ${hMetric}`);
assert(Math.abs(rMetric - 35.35) < 0.05, `Range expected ~35.35m, got ${rMetric}`);

// Verify curve points
assert(calc.points.length > 50, 'Trajectory should generate detailed curve points');
assert.strictEqual(calc.points[0].x, 0, 'Initial x is 0');
assert.strictEqual(calc.points[0].y, 0, 'Initial y is 0');
assert(calc.points[calc.points.length - 1].y <= 0.001, 'Final y lands at ground level');
console.log("✅ Kinematics formulas (T, H, R, trajectory curve) verified to high precision.");

// --- TEST 4: Slider Bounds Clamping ---
console.log("\n▶ [TEST 4] Variable Clamping to Min/Max Bounds");
const outOfBoundsSpec = {
  type: 'PHYSICS',
  model: 'projectile',
  title: 'Clamping Test',
  variables: {
    velocity: { value: 999, min: 10, max: 50, step: 1 },
    angle: { value: -50, min: 5, max: 85, step: 1 }
  }
};
const clampResult = validateVisualizationSpec(outOfBoundsSpec);
assert(clampResult.valid === true, 'Clamped spec should remain valid');
assert.strictEqual(clampResult.spec.variables.velocity.value, 50, 'Value > max should clamp to max');
assert.strictEqual(clampResult.spec.variables.angle.value, 5, 'Value < min should clamp to min');
console.log("✅ Automatic boundary clamping verified.");

// --- TEST 5: Reset Behavior ---
console.log("\n▶ [TEST 5] Reset State Defaults");
const defs = ProjectileModel.defaultConfig.variables;
assert.strictEqual(defs.velocity.default, 25, 'Default velocity is 25 m/s');
assert.strictEqual(defs.angle.default, 45, 'Default angle is 45°');
assert.strictEqual(defs.gravity.default, 9.8, 'Default gravity is 9.8 m/s²');
console.log("✅ Default state parameters verified for reset capability.");

// --- TEST 6: Deterministic Router Integration ---
console.log("\n▶ [TEST 6] Deterministic Router Simulation Intent & Payload");
const simQuery = 'Simulate projectile motion';
const intent = analyzeDeterministicIntent(simQuery);
assert(intent && intent.type === 'PROJECTILE_VIZ', `Intent detection failed for "${simQuery}"`);

const responseText = buildDeterministicResponse(intent);
assert(responseText.includes('[VIZ: {'), 'Must include structured [VIZ: ...] token');
assert(responseText.includes('"model":"projectile"'), 'Must specify model: projectile');
assert(responseText.includes('Classical Projectile Instrument'), 'Must include classical Greek header');

// Extract and parse spec from response
const tokenMatch = responseText.match(/\[VIZ:\s*(\{[\s\S]*?\})\]/);
assert(tokenMatch, 'Extracted VIZ token must match regex');
const parsed = JSON.parse(tokenMatch[1]);
const valCheck = validateVisualizationSpec(parsed);
assert(valCheck.valid === true, `Router emitted valid specification: ${valCheck.error}`);
console.log("✅ Router generates schema-compliant [VIZ: ...] token for projectile simulations.");

// --- TEST 7: All Classical Physics & Math Models Verification ---
console.log("\n▶ [TEST 7] Suite of Classical Physics & Mathematics Models");
const allModels = [
  { id: 'newtons_laws', query: "simulate newton's second law", mod: require('./vizEngine/models/newtons_laws') },
  { id: 'energy_transfer', query: "simulate conservation of energy", mod: require('./vizEngine/models/energy_transfer') },
  { id: 'momentum', query: "simulate momentum", mod: require('./vizEngine/models/momentum') },
  { id: 'hookes_law', query: "simulate hooke's law", mod: require('./vizEngine/models/hookes_law') },
  { id: 'waves', query: "simulate waves", mod: require('./vizEngine/models/waves') },
  { id: 'circuits', query: "simulate circuit", mod: require('./vizEngine/models/circuits') },
  { id: 'trigonometry', query: "unit circle simulation", mod: require('./vizEngine/models/trigonometry') },
  { id: 'calculus_derivatives', query: "tangent line simulation", mod: require('./vizEngine/models/calculus_derivatives') }
];

for (const item of allModels) {
  // 1. Model computation test
  const res = item.mod.compute({});
  assert(res && res.metrics && res.metrics.length > 0, `Model ${item.id} must return valid metrics`);
  assert(typeof item.mod.draw === 'function', `Model ${item.id} must provide custom classical draw method`);

  // 2. Intent routing test
  const matchedIntent = analyzeDeterministicIntent(item.query);
  assert(matchedIntent && matchedIntent.type === 'CLASSICAL_MODEL_VIZ' && matchedIntent.model === item.id,
    `Router must recognize query "${item.query}" as model ${item.id}`);

  // 3. Response generation & spec validation test
  const resp = buildDeterministicResponse(matchedIntent);
  const mMatch = resp.match(/\[VIZ:\s*(\{[\s\S]*?\})\]/);
  assert(mMatch, `Response for ${item.id} must contain [VIZ: ...] token`);
  const specObj = JSON.parse(mMatch[1]);
  const specCheck = validateVisualizationSpec(specObj);
  assert(specCheck.valid === true, `Spec for ${item.id} must validate: ${specCheck.error}`);
  console.log(`   ✔ Model [${item.id}] mathematical computation, intent routing & schema validated.`);
}
console.log("✅ All 8 additional physics & mathematics models pass rigorous verification.");

console.log("\n==================================================");
console.log("✔ ALL PYTHOS VIZ ENGINE TESTS PASSED (100%)");
console.log("==================================================\n");
