/**
 * calculus_derivatives.js
 *
 * Mathematics Model: Differential Calculus, Secant to Tangent & Derivatives
 * f(x) = x^3 - 3x, f'(x0) = lim_{h->0} (f(x0+h) - f(x0))/h
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PythosCalculusModel = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  const DEFAULT_CONFIG = {
    title: "Differential Calculus: Tangent Line & Local Derivative",
    subtitle: "INSTANTANEOUS RATE OF CHANGE & LIMITS (ΑΠΕΙΡΟΣΤΙΚΟΣ ΛΟΓΙΣΜΟΣ)",
    description: "Function f(x) = x³ - 3x showing tangent line slope at point x₀ and secant convergence.",
    variables: {
      x0: {
        label: 'Evaluation Point (x₀)',
        value: 1.0,
        default: 1.0,
        min: -2.0,
        max: 2.0,
        step: 0.1,
        unit: ''
      },
      deltaX: {
        label: 'Step / Secant Offset (Δx)',
        value: 0.8,
        default: 0.8,
        min: 0.05,
        max: 1.5,
        step: 0.05,
        unit: ''
      }
    }
  };

  function f(x) {
    return x * x * x - 3 * x;
  }

  function df(x) {
    return 3 * x * x - 3;
  }

  function compute(vars) {
    const x0 = Number(vars.x0 !== undefined ? vars.x0 : 1.0);
    const dx = Number(vars.deltaX !== undefined ? vars.deltaX : 0.8);

    const y0 = f(x0);
    const x1 = x0 + dx;
    const y1 = f(x1);

    // Exact derivative (slope of tangent)
    const exactSlope = df(x0);

    // Secant slope (average rate of change)
    const secantSlope = (y1 - y0) / dx;

    // Error between secant and true tangent
    const diffError = Math.abs(secantSlope - exactSlope);

    // Generate curve points for x in [-2.5, 2.5]
    const curve = [];
    const minX = -2.4;
    const maxX = 2.4;
    const steps = 80;
    for (let i = 0; i <= steps; i++) {
      const cx = minX + ((maxX - minX) * i) / steps;
      curve.push({ x: cx, y: f(cx) });
    }

    return {
      inputs: { x0, deltaX: dx },
      metrics: [
        { id: 'derivative', label: "True Derivative f'(x₀)", value: exactSlope, formatted: exactSlope.toFixed(3) },
        { id: 'secant', label: 'Secant Slope (Δy/Δx)', value: secantSlope, formatted: secantSlope.toFixed(3) },
        { id: 'fx0', label: 'Function Value f(x₀)', value: y0, formatted: y0.toFixed(3) },
        { id: 'error', label: 'Secant Discrepancy', value: diffError, formatted: diffError.toFixed(4) }
      ],
      diagram: { x0, dx, y0, x1, y1, exactSlope, secantSlope, curve }
    };
  }

  function draw(canvas, calcResult) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const bgCol = isDark ? '#090d16' : '#fdfbf7';
    const axisCol = isDark ? '#334155' : '#cbd5e1';
    const curveCol = isDark ? '#38bdf8' : '#0284c7';
    const tangCol = isDark ? '#fb923c' : '#ea580c';
    const secCol = isDark ? '#10b981' : '#059669';
    const textCol = isDark ? '#e2e8f0' : '#1e293b';

    ctx.fillStyle = bgCol;
    ctx.fillRect(0, 0, w, h);

    const padX = 50;
    const padY = 30;
    const plotW = w - 2 * padX;
    const plotH = h - 2 * padY;

    const minX = -2.5;
    const maxX = 2.5;
    const minY = -4.0;
    const maxY = 4.0;

    const toCanvasX = (x) => padX + ((x - minX) / (maxX - minX)) * plotW;
    const toCanvasY = (y) => padY + plotH - ((y - minY) / (maxY - minY)) * plotH;

    // Axes
    const origX = toCanvasX(0);
    const origY = toCanvasY(0);

    ctx.strokeStyle = axisCol;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padX, origY);
    ctx.lineTo(padX + plotW, origY);
    ctx.moveTo(origX, padY);
    ctx.lineTo(origX, padY + plotH);
    ctx.stroke();

    // Curve f(x)
    const pts = calcResult.diagram.curve;
    ctx.strokeStyle = curveCol;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(toCanvasX(pts[0].x), toCanvasY(pts[0].y));
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(toCanvasX(pts[i].x), toCanvasY(pts[i].y));
    }
    ctx.stroke();

    const d = calcResult.diagram;
    const px0 = toCanvasX(d.x0);
    const py0 = toCanvasY(d.y0);
    const px1 = toCanvasX(d.x1);
    const py1 = toCanvasY(d.y1);

    // Tangent Line (Orange)
    const tSpan = 1.2;
    ctx.strokeStyle = tangCol;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(toCanvasX(d.x0 - tSpan), toCanvasY(d.y0 - d.exactSlope * tSpan));
    ctx.lineTo(toCanvasX(d.x0 + tSpan), toCanvasY(d.y0 + d.exactSlope * tSpan));
    ctx.stroke();

    // Secant Line (Green dashed)
    ctx.strokeStyle = secCol;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(px0, py0);
    ctx.lineTo(px1, py1);
    ctx.stroke();
    ctx.setLineDash([]);

    // Points
    ctx.fillStyle = tangCol;
    ctx.beginPath();
    ctx.arc(px0, py0, 5, 0, 2 * Math.PI);
    ctx.fill();

    ctx.fillStyle = secCol;
    ctx.beginPath();
    ctx.arc(px1, py1, 4, 0, 2 * Math.PI);
    ctx.fill();

    // Legend
    ctx.font = '10px Inter, sans-serif';
    ctx.fillStyle = tangCol;
    ctx.fillText(`— Tangent Slope: ${d.exactSlope.toFixed(2)}`, padX + 10, padY + 18);
    ctx.fillStyle = secCol;
    ctx.fillText(`-- Secant Slope: ${d.secantSlope.toFixed(2)}`, padX + 10, padY + 34);
  }

  return {
    modelId: 'calculus_derivatives',
    type: 'MATH',
    defaultConfig: DEFAULT_CONFIG,
    compute,
    draw
  };
}));
