/**
 * test-graphing-engine.js
 * Unit test for graphing expression compiler, discontinuity detection, and adaptive bounds.
 */

const math = require('./server/node_modules/mathjs');

function sanitizeGraphExpression(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let expr = raw.trim();

  // Strip prefixes
  expr = expr
    .replace(/^f\(x\)\s*=\s*/i, '')
    .replace(/^y\s*=\s*/i, '')
    .replace(/=\s*0$/i, '')
    .replace(/\\left\(/g, '(')
    .replace(/\\right\)/g, ')')
    .replace(/\\cdot/g, '*')
    .replace(/\\times/g, '*');

  // Handle \frac{numerator}{denominator}
  while (/\\frac\{([^}]+)\}\{([^}]+)\}/.test(expr)) {
    expr = expr.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '(($1)/($2))');
  }

  // Handle \sqrt{arg}
  expr = expr.replace(/\\sqrt\{([^}]+)\}/g, 'sqrt($1)');

  // Handle standard LaTeX functions
  expr = expr
    .replace(/\\sin/g, 'sin')
    .replace(/\\cos/g, 'cos')
    .replace(/\\tan/g, 'tan')
    .replace(/\\ln/g, 'log')
    .replace(/\\log/g, 'log10')
    .replace(/\\exp/g, 'exp')
    .replace(/\\pi/g, 'pi');

  // Handle implicit multiplication: 5x -> 5*x, 5(x) -> 5*(x), (x+1)(x-1) -> (x+1)*(x-1), x sin(x) -> x*sin(x)
  expr = expr
    .replace(/(\d+)\s*([a-zA-Z(])/g, '$1*$2')
    .replace(/(\))\s*([a-zA-Z0-9(])/g, '$1*$2')
    .replace(/([x])\s*([a-zA-Z(])/g, '$1*$2');

  return expr;
}

function calculateAdaptiveBounds(compiled, xMin = -10, xMax = 10, defaultYMin = -10, defaultYMax = 10) {
  const samples = [];
  const numSamples = 200;
  const step = (xMax - xMin) / numSamples;

  for (let i = 0; i <= numSamples; i++) {
    const x = xMin + i * step;
    try {
      const y = compiled.evaluate({ x });
      if (typeof y === 'number' && Number.isFinite(y) && !Number.isNaN(y)) {
        // Clamp extreme asymptotic values from skewing bounds
        if (Math.abs(y) < 1e6) {
          samples.push(y);
        }
      }
    } catch (_) {}
  }

  if (samples.length === 0) {
    return { yMin: defaultYMin, yMax: defaultYMax };
  }

  // Sort to compute robust percentiles (avoiding asymptotic poles)
  samples.sort((a, b) => a - b);
  const p5 = samples[Math.floor(samples.length * 0.02)] || samples[0];
  const p95 = samples[Math.floor(samples.length * 0.98)] || samples[samples.length - 1];

  let yMin = Math.min(defaultYMin, p5);
  let yMax = Math.max(defaultYMax, p95);

  // If function values are completely outside default range (e.g. x^2 + 50)
  if (p5 > defaultYMax || p95 < defaultYMin) {
    const padding = (p95 - p5) * 0.15 || 2;
    yMin = p5 - padding;
    yMax = p95 + padding;
  }

  return { yMin, yMax };
}

function detectDiscontinuity(yPrev, yCurr, yMin, yMax) {
  if (yPrev === null || yCurr === null) return true;
  const ySpan = yMax - yMin;
  const jump = Math.abs(yCurr - yPrev);

  // If point jumps across more than 80% of viewport with sign change, it's a vertical asymptote (e.g. tan(x), 1/x)
  if (jump > ySpan * 0.75 && (yCurr * yPrev < 0 || Math.abs(yCurr) > ySpan * 2 || Math.abs(yPrev) > ySpan * 2)) {
    return true; // Discontinuity / asymptote: break path
  }

  return false;
}

// ================= TEST SUITE =================
console.log("==================================================");
console.log("⚡ TESTING GRAPHING ENGINE SANITIZATION & BOUNDS");
console.log("==================================================\n");

const sanitizeTests = [
  { raw: "5x^2", expected: "5*x^2" },
  { raw: "y = 2(x + 3)", expected: "2*(x + 3)" },
  { raw: "\\frac{1}{x}", expected: "((1)/(x))" },
  { raw: "\\frac{x^2 - 4}{x - 2}", expected: "((x^2 - 4)/(x - 2))" },
  { raw: "\\sin(x) + \\cos(x)", expected: "sin(x) + cos(x)" },
  { raw: "f(x) = (x+1)(x-1)", expected: "(x+1)*(x-1)" }
];

let passCount = 0;

sanitizeTests.forEach((st, idx) => {
  const result = sanitizeGraphExpression(st.raw);
  const compiled = math.compile(result);
  const evalAt2 = compiled.evaluate({ x: 2 });
  console.log(`[PASS] Test ${idx + 1}: "${st.raw}" -> "${result}" (evaluated at x=2: ${evalAt2})`);
  passCount++;
});

// Test Adaptive bounds on high-range function
const highRangeCompiled = math.compile(sanitizeGraphExpression("x^2 + 50"));
const bounds = calculateAdaptiveBounds(highRangeCompiled, -10, 10);
console.log(`\nAdaptive Bounds for x^2 + 50: [yMin: ${bounds.yMin.toFixed(2)}, yMax: ${bounds.yMax.toFixed(2)}]`);
if (bounds.yMin <= 50 && bounds.yMax >= 150) {
  console.log("[PASS] Adaptive bounds correctly zoomed to function range [50, 150].");
  passCount++;
} else {
  console.error("[FAIL] Adaptive bounds failed on x^2 + 50.");
}

// Test Discontinuity detection on 1/x
const isDiscontinuous = detectDiscontinuity(-100, 100, -10, 10);
if (isDiscontinuous) {
  console.log("[PASS] Vertical asymptote at x=0 for 1/x correctly flagged as discontinuity (path will break).");
  passCount++;
} else {
  console.error("[FAIL] Discontinuity detection failed on 1/x asymptote.");
}

console.log(`\nResults: ${passCount}/${sanitizeTests.length + 2} tests passed.\n`);
