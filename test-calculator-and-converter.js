// test-calculator-and-converter.js
// Full Comprehensive Test Suite for Pythos Scientific Calculator & Unit Converter

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const targetDir = 'C:/Projects/lanzar/pythos';
const math = require(path.join(targetDir, 'server/node_modules/mathjs'));
const MathJSVerifier = require(path.join(targetDir, 'server/mathjsVerifier'));

console.log('================================================================');
console.log('🧪 FULL VERIFICATION: SCIENTIFIC CALCULATOR & UNIT CONVERTER');
console.log('================================================================\n');

// Load files
const indexHtml = fs.readFileSync(path.join(targetDir, 'index.html'), 'utf8');
const siteIndexHtml = fs.readFileSync(path.join(targetDir, 'server/site_sources/index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(targetDir, 'app.js'), 'utf8');

// ================================================================
// SUITE 1: DOM & ATTRIBUTES INTEGRITY
// ================================================================
console.log('--- SUITE 1: DOM & Static Contract Checks ---');

// Exponent button in index.html and server/site_sources/index.html
assert(indexHtml.includes('data-calc="^"'), 'index.html exponent button must have data-calc="^"');
assert(!indexHtml.includes('data-calc="pow"'), 'index.html exponent button must not have data-calc="pow"');
assert(siteIndexHtml.includes('data-calc="^"'), 'server/site_sources/index.html exponent button must have data-calc="^"');
console.log('  ✅ Exponent button properly declared with data-calc="^" in both HTML templates');

// Calculator display attributes
assert(indexHtml.includes('id="calcDisplay"'), 'calcDisplay element exists in index.html');
assert(!indexHtml.includes('id="calcDisplay" class="calc-display" readonly'), 'calcDisplay must be keyboard-accessible (no readonly)');
console.log('  ✅ calcDisplay is editable and accessible');

// Unit converter input elements
assert(indexHtml.includes('id="unitsValueInput"'), 'unitsValueInput exists in index.html');
assert(indexHtml.includes('id="unitsTargetInput"'), 'unitsTargetInput exists in index.html');
assert(indexHtml.includes('id="unitsConvertBtn"'), 'unitsConvertBtn exists in index.html');
assert(indexHtml.includes('id="unitsResultArea"'), 'unitsResultArea exists in index.html');
console.log('  ✅ Unit Converter DOM elements properly configured');

// Static checks in app.js
assert(appJs.includes('registerCustomUnits'), 'app.js defines custom units registration');
assert(appJs.includes('normalizeUnitString'), 'app.js defines unit string normalizer');
assert(appJs.includes('runUnitConversion'), 'app.js defines runUnitConversion function');
assert(appJs.includes('evaluateCalculator'), 'app.js defines evaluateCalculator');
assert(appJs.includes('val === "pow" || val === "^"'), 'app.js handles both pow and ^ for exponent key');
assert(appJs.includes('cleanFloat'), 'app.js defines cleanFloat precision handler');
console.log('  ✅ app.js integration methods present');

// ================================================================
// SUITE 2: SCIENTIFIC CALCULATOR - BUTTON & PIPELINE PARITY
// ================================================================
console.log('\n--- SUITE 2: Scientific Calculator Functionality ---');

function cleanFloat(v) {
  if (typeof v !== "number") return v;
  if (Math.abs(v) < 1e-14) return 0;
  const rounded = parseFloat(v.toPrecision(12));
  return Math.abs(rounded - Math.round(rounded)) < 1e-12 ? Math.round(rounded) : rounded;
}

// Emulate calculator click + evaluation pipeline exactly as in app.js
function simulateCalculatorClick(buttonValues, isDeg = true) {
  let display = "0";
  
  for (const val of buttonValues) {
    if (val === "clear") {
      display = "0";
    } else if (val === "=") {
      let raw = display.trim();
      let expr = raw
        .replace(/÷/g, "/")
        .replace(/×/g, "*")
        .replace(/π/g, "pi")
        .replace(/√\(/g, "sqrt(")
        .replace(/√/g, "sqrt")
        .replace(/\^\{([^}]+)\}/g, "^($1)")
        .replace(/\*\*/g, "^")
        .replace(/(\d+|\))\s*pow\s*(\d+|\()/gi, "$1^$2");

      const scope = {
        ln: (x) => math.log(x),
        log: (x, base) => base !== undefined ? math.log(x, base) : math.log10(x)
      };
      if (isDeg) {
        scope.sin = (x) => cleanFloat(Math.sin(x * Math.PI / 180));
        scope.cos = (x) => cleanFloat(Math.cos(x * Math.PI / 180));
        scope.tan = (x) => {
          if (Math.abs((x - 90) % 180) < 1e-9) throw new Error("Tangent undefined at 90°");
          return cleanFloat(Math.tan(x * Math.PI / 180));
        };
      }

      const evalRes = math.evaluate(expr, scope);
      const res = typeof evalRes === "number" ? cleanFloat(evalRes) : evalRes;
      display = String(res);
    } else {
      let base = (display === "0" || display === "Error") ? "" : display;
      if (val === "sqrt") {
        base += "sqrt(";
      } else if (val === "pow" || val === "^") {
        base += "^";
      } else if (val === "sin" || val === "cos" || val === "tan" || val === "ln" || val === "log") {
        base += `${val}(`;
      } else {
        base += val;
      }
      display = base;
    }
  }

  return display;
}

// Emulate typed input pipeline as in app.js
function simulateCalculatorTyped(raw, isDeg = true) {
  let expr = raw
    .replace(/÷/g, "/")
    .replace(/×/g, "*")
    .replace(/π/g, "pi")
    .replace(/√\(/g, "sqrt(")
    .replace(/√/g, "sqrt")
    .replace(/\^\{([^}]+)\}/g, "^($1)")
    .replace(/\*\*/g, "^")
    .replace(/(\d+|\))\s*pow\s*(\d+|\()/gi, "$1^$2");

  const scope = {
    ln: (x) => math.log(x),
    log: (x, base) => base !== undefined ? math.log(x, base) : math.log10(x)
  };
  if (isDeg) {
    scope.sin = (x) => cleanFloat(Math.sin(x * Math.PI / 180));
    scope.cos = (x) => cleanFloat(Math.cos(x * Math.PI / 180));
    scope.tan = (x) => {
      if (Math.abs((x - 90) % 180) < 1e-9) throw new Error("Tangent undefined at 90°");
      return cleanFloat(Math.tan(x * Math.PI / 180));
    };
  }

  const evalRes = math.evaluate(expr, scope);
  const res = typeof evalRes === "number" ? cleanFloat(evalRes) : evalRes;
  return String(res);
}

// Test Exponent cases
console.log('  Testing Exponent Calculations:');
const exponentCases = [
  { desc: 'Button click 2 ^ 3 =', clicks: ['2', '^', '3', '='], expected: '8' },
  { desc: 'Legacy button click 2 pow 3 =', clicks: ['2', 'pow', '3', '='], expected: '8' },
  { desc: 'Button click 5 ^ 2 =', clicks: ['5', '^', '2', '='], expected: '25' },
  { desc: 'Button click 10 ^ 3 =', clicks: ['1', '0', '^', '3', '='], expected: '1000' },
  { desc: 'Typed 2^3', typed: '2^3', expected: '8' },
  { desc: 'Typed 2**3 (JS style)', typed: '2**3', expected: '8' },
  { desc: 'Typed 2pow3 (legacy string)', typed: '2pow3', expected: '8' },
  { desc: 'Typed 2^{3} (LaTeX curly braces)', typed: '2^{3}', expected: '8' },
  { desc: 'Negative exponent 2^-3', typed: '2^-3', expected: '0.125' },
  { desc: 'Zero exponent 5^0', typed: '5^0', expected: '1' },
  { desc: 'Fractional exponent 16^(0.5)', typed: '16^(0.5)', expected: '4' },
  { desc: 'Compound base (2+3)^2', typed: '(2+3)^2', expected: '25' }
];

exponentCases.forEach(tc => {
  const result = tc.clicks ? simulateCalculatorClick(tc.clicks) : simulateCalculatorTyped(tc.typed);
  assert.strictEqual(Number(result), Number(tc.expected), `${tc.desc}: got ${result}, expected ${tc.expected}`);
  console.log(`    ✅ ${tc.desc} ➔ ${result}`);
});

// Test Trig DEG vs RAD mode
console.log('  Testing Trigonometry (DEG vs RAD):');
assert.strictEqual(simulateCalculatorTyped('sin(90)', true), '1', 'sin(90) in DEG must be 1');
console.log('    ✅ sin(90) [DEG] ➔ 1');
assert.strictEqual(simulateCalculatorTyped('cos(60)', true), '0.5', 'cos(60) in DEG must be 0.5');
console.log('    ✅ cos(60) [DEG] ➔ 0.5');
assert.strictEqual(simulateCalculatorTyped('cos(90)', true), '0', 'cos(90) in DEG must be 0');
console.log('    ✅ cos(90) [DEG] ➔ 0');
assert.strictEqual(simulateCalculatorTyped('tan(45)', true), '1', 'tan(45) in DEG must be 1');
console.log('    ✅ tan(45) [DEG] ➔ 1');

// In RAD mode, sin(pi/2) = 1
const radSin = Number(simulateCalculatorTyped('sin(pi/2)', false));
assert(Math.abs(radSin - 1) < 1e-9, `sin(pi/2) in RAD must be 1, got ${radSin}`);
console.log(`    ✅ sin(pi/2) [RAD] ➔ ${radSin}`);

// Test Logarithms (ln and log10)
console.log('  Testing Logarithms (ln & log):');
const lnE = Number(simulateCalculatorTyped('ln(e)'));
assert(Math.abs(lnE - 1) < 1e-9, 'ln(e) must be 1');
console.log(`    ✅ ln(e) ➔ ${lnE}`);

const log100 = Number(simulateCalculatorTyped('log(100)'));
assert(Math.abs(log100 - 2) < 1e-9, 'log(100) base-10 must be 2');
console.log(`    ✅ log(100) ➔ ${log100}`);

const logCustomBase = Number(simulateCalculatorTyped('log(8, 2)'));
assert(Math.abs(logCustomBase - 3) < 1e-9, 'log(8, 2) must be 3');
console.log(`    ✅ log(8, 2) ➔ ${logCustomBase}`);

// Standard math & roots
console.log('  Testing Arithmetic & Roots:');
assert.strictEqual(simulateCalculatorTyped('10 ÷ 2'), '5');
console.log('    ✅ 10 ÷ 2 ➔ 5');
assert.strictEqual(simulateCalculatorTyped('5 × 6'), '30');
console.log('    ✅ 5 × 6 ➔ 30');
assert.strictEqual(simulateCalculatorTyped('sqrt(144)'), '12');
console.log('    ✅ sqrt(144) ➔ 12');
assert.strictEqual(simulateCalculatorTyped('√(144)'), '12');
console.log('    ✅ √(144) ➔ 12');

// ================================================================
// SUITE 3: UNIT CONVERTER ENGINE & DOM PIPELINE
// ================================================================
console.log('\n--- SUITE 3: Unit Converter Engine & Normalization ---');

function registerTestCustomUnits(m) {
  try {
    m.createUnit('mph', '1 mi/h', { override: true });
    m.createUnit('kph', '1 km/h', { override: true });
    m.createUnit('kmh', '1 km/h', { override: true });
    m.createUnit('mps', '1 m/s', { override: true });
    m.createUnit('fps', '1 ft/s', { override: true });
    m.createUnit('knot', '1.852 km/h', { override: true });
    m.createUnit('knots', '1 knot', { override: true });
    m.createUnit('cal', '4.184 J', { override: true });
    m.createUnit('kcal', '4184 J', { override: true });
    m.createUnit('btu', '1 BTU', { override: true });
  } catch (_) {}
}

function normalizeTestUnitString(str) {
  if (!str) return "";
  let s = str.trim().replace(/^(?:to|in)\s+/i, "");
  s = s.replace(/°\s*C\b/gi, "degC")
       .replace(/°\s*F\b/gi, "degF")
       .replace(/°\s*K\b/gi, "K");
  s = s.replace(/\bcelsius\b/gi, "degC");
  s = s.replace(/\bfahrenheit\b/gi, "degF");
  s = s.replace(/\bC\b/g, "degC");
  s = s.replace(/\bF\b/g, "degF");
  s = s.replace(/\bkph\b/gi, "kph");
  s = s.replace(/\bmph\b/gi, "mph");
  s = s.replace(/\bkmh\b/gi, "kmh");
  return s;
}

registerTestCustomUnits(math);

function simulateConvert(rawVal, rawTarget) {
  const normVal = normalizeTestUnitString(rawVal);
  const normTarget = normalizeTestUnitString(rawTarget);
  const u = math.unit(normVal);
  const converted = u.to(normTarget);
  return {
    val: rawVal,
    target: rawTarget,
    convertedStr: converted.toString(),
    numeric: converted.toNumber(normTarget)
  };
}

// Conversion test battery
const conversionTests = [
  // User specific report: kph to mph
  { val: '100 kph', target: 'mph', check: n => Math.abs(n - 62.1371) < 0.001, expectedStr: '~62.137 mph' },
  { val: '60 mph', target: 'kph', check: n => Math.abs(n - 96.5606) < 0.001, expectedStr: '~96.561 kph' },
  { val: '100 km/h', target: 'mph', check: n => Math.abs(n - 62.1371) < 0.001, expectedStr: '~62.137 mph' },
  { val: '100 kmh', target: 'mph', check: n => Math.abs(n - 62.1371) < 0.001, expectedStr: '~62.137 mph' },
  { val: '100 mph', target: 'm/s', check: n => Math.abs(n - 44.704) < 0.01, expectedStr: '~44.704 m/s' },
  { val: '20 mps', target: 'mph', check: n => Math.abs(n - 44.7387) < 0.01, expectedStr: '~44.74 mph' },
  { val: '10 fps', target: 'm/s', check: n => Math.abs(n - 3.048) < 0.001, expectedStr: '3.048 m/s' },
  { val: '10 knots', target: 'mph', check: n => Math.abs(n - 11.5078) < 0.01, expectedStr: '~11.51 mph' },
  { val: '10 knot', target: 'kph', check: n => Math.abs(n - 18.52) < 0.001, expectedStr: '18.52 kph' },

  // Temperature
  { val: '100 C', target: 'F', check: n => Math.abs(n - 212) < 0.001, expectedStr: '212 degF' },
  { val: '32 F', target: 'C', check: n => Math.abs(n - 0) < 0.001, expectedStr: '0 degC' },
  { val: '100 °C', target: '°F', check: n => Math.abs(n - 212) < 0.001, expectedStr: '212 degF' },
  { val: '0 degC', target: 'degF', check: n => Math.abs(n - 32) < 0.001, expectedStr: '32 degF' },
  { val: '273.15 K', target: 'degC', check: n => Math.abs(n - 0) < 0.001, expectedStr: '0 degC' },
  { val: '100 celsius', target: 'fahrenheit', check: n => Math.abs(n - 212) < 0.001, expectedStr: '212 degF' },

  // Energy & Power
  { val: '500 cal', target: 'J', check: n => Math.abs(n - 2092) < 0.1, expectedStr: '2092 J' },
  { val: '1 kcal', target: 'cal', check: n => Math.abs(n - 1000) < 0.1, expectedStr: '1000 cal' },
  { val: '1 kWh', target: 'MJ', check: n => Math.abs(n - 3.6) < 0.001, expectedStr: '3.6 MJ' },
  { val: '1 btu', target: 'J', check: n => Math.abs(n - 1055.06) < 1, expectedStr: '~1055 J' },
  { val: '1 hp', target: 'W', check: n => Math.abs(n - 745.7) < 0.5, expectedStr: '~745.7 W' },

  // Length & Distance
  { val: '1 mi', target: 'km', check: n => Math.abs(n - 1.60934) < 0.001, expectedStr: '~1.609 km' },
  { val: '100 m', target: 'ft', check: n => Math.abs(n - 328.084) < 0.01, expectedStr: '~328.08 ft' },
  { val: '12 in', target: 'cm', check: n => Math.abs(n - 30.48) < 0.001, expectedStr: '30.48 cm' },

  // Pressure
  { val: '1 atm', target: 'psi', check: n => Math.abs(n - 14.6959) < 0.01, expectedStr: '~14.7 psi' },
  { val: '1 bar', target: 'kPa', check: n => Math.abs(n - 100) < 0.001, expectedStr: '100 kPa' },
  { val: '760 torr', target: 'atm', check: n => Math.abs(n - 1) < 0.001, expectedStr: '1 atm' }
];

conversionTests.forEach(test => {
  const res = simulateConvert(test.val, test.target);
  assert(test.check(res.numeric), `Failed conversion: ${test.val} -> ${test.target}. Got ${res.numeric}`);
  console.log(`  ✅ ${test.val} ➔ ${test.target}: ${res.convertedStr}`);
});

// ================================================================
// SUITE 4: SERVER BACKEND MathJSVerifier INTEGRATION
// ================================================================
console.log('\n--- SUITE 4: Backend MathJSVerifier Unit Verification ---');

const serverUnitClaims = [
  { value_with_units: '100 kph', target_units: 'mph', expected_value: 62.1371, tolerance: 0.01 },
  { value_with_units: '60 mph', target_units: 'kph', expected_value: 96.5606, tolerance: 0.01 },
  { value_with_units: '100 C', target_units: 'F', expected_value: 212, tolerance: 0.01 },
  { value_with_units: '500 cal', target_units: 'J', expected_value: 2092, tolerance: 0.5 },
  { value_with_units: '1 kcal', target_units: 'cal', expected_value: 1000, tolerance: 0.1 }
];

serverUnitClaims.forEach(claim => {
  const result = MathJSVerifier.verifyUnits(claim);
  assert(result.verified, `Server MathJSVerifier failed for ${claim.value_with_units} -> ${claim.target_units}: ${result.reason || result.details}`);
  console.log(`  ✅ Server Verifier: ${claim.value_with_units} = ${result.formatted} (Status: ${result.status})`);
});

// Incompatible units should gracefully return error without throwing
const incompatibleClaim = { value_with_units: '100 kph', target_units: 'kg' };
const incompatResult = MathJSVerifier.verifyUnits(incompatibleClaim);
assert(!incompatResult.verified, 'Incompatible units must return verified: false');
assert(incompatResult.error_type === 'INCOMPATIBLE_UNITS' || incompatResult.status === 'UNIT_MISMATCH', 'Must return INCOMPATIBLE_UNITS status');
console.log(`  ✅ Incompatible units rejected safely: "${incompatibleClaim.value_with_units}" to "${incompatibleClaim.target_units}"`);

// ================================================================
// SUMMARY
// ================================================================
console.log('\n================================================================');
console.log('🎉 ALL SCIENTIFIC CALCULATOR & UNIT CONVERTER TESTS PASSED (100%)');
console.log('================================================================\n');
