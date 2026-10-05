/**
 * exponential_growth.js
 *
 * Algebra & Pre-Calculus Model: Exponential Growth & Decay, Compound Interest
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PythosExponentialGrowthModel = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  const DEFAULT_CONFIG = {
    title: "Algebra & Pre-Calculus: Exponential Dynamics",
    subtitle: "EXPONENTIAL GROWTH, DECAY & COMPOUND DYNAMICS (ΕΚΘΕΤΙΚΗ)",
    description: "Interactive exponential curve y = P₀(1 + r)^t illustrating population growth, radioactive decay, and compound interest.",
    variables: {
      initial: {
        label: 'Initial Value (P₀)',
        value: 100,
        default: 100,
        min: 10,
        max: 500,
        step: 10,
        unit: ''
      },
      rate: {
        label: 'Rate of Change (r)',
        value: 8,
        default: 8,
        min: -20,
        max: 40,
        step: 0.5,
        unit: '%'
      },
      time: {
        label: 'Time Periods (t)',
        value: 10,
        default: 10,
        min: 1,
        max: 40,
        step: 1,
        unit: ' periods'
      }
    }
  };

  function compute(vars) {
    const P0 = Math.max(1, Number(vars.initial !== undefined ? vars.initial : 100));
    const rPct = Number(vars.rate !== undefined ? vars.rate : 8);
    const r = rPct / 100;
    const t = Math.max(0, Number(vars.time !== undefined ? vars.time : 10));

    const finalVal = P0 * Math.pow(1 + r, t);
    const doublingOrHalfTime = r !== 0 ? (r > 0 ? Math.log(2) / Math.log(1 + r) : Math.log(0.5) / Math.log(1 + r)) : Infinity;

    return {
      inputs: { initial: P0, rate: rPct, time: t },
      metrics: [
        { id: 'final', label: 'Final Amount P(t)', value: finalVal, formatted: finalVal.toFixed(2) },
        { id: 'double', label: r >= 0 ? 'Doubling Time (periods)' : 'Half-Life (periods)', value: doublingOrHalfTime, formatted: isFinite(doublingOrHalfTime) ? doublingOrHalfTime.toFixed(2) : 'N/A' },
        { id: 'netChange', label: 'Net Change', value: finalVal - P0, formatted: (finalVal - P0 >= 0 ? '+' : '') + (finalVal - P0).toFixed(2) },
        { id: 'multiplier', label: 'Growth Factor (1+r)', value: 1 + r, formatted: (1 + r).toFixed(3) }
      ],
      diagram: { P0, rPct, r, t, finalVal }
    };
  }

  function draw(canvas, calcResult) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const bgCol = isDark ? '#090d16' : '#fdfbf7';
    const textCol = isDark ? '#e2e8f0' : '#1e293b';
    const axisCol = isDark ? '#334155' : '#cbd5e1';
    const lineCol = isDark ? '#38bdf8' : '#0284c7';
    const pointCol = isDark ? '#f43f5e' : '#e11d48';

    ctx.fillStyle = bgCol;
    ctx.fillRect(0, 0, w, h);

    const { P0, r, t, finalVal } = calcResult.diagram;

    const padLeft = 55;
    const padRight = 35;
    const padBottom = 40;
    const padTop = 30;

    const plotW = w - padLeft - padRight;
    const plotH = h - padTop - padBottom;
    const floorY = h - padBottom;

    const maxT = Math.max(15, t * 1.3);
    const maxVal = Math.max(P0 * 1.5, finalVal * 1.25);

    function toScreenX(timeVal) {
      return padLeft + (timeVal / maxT) * plotW;
    }
    function toScreenY(pVal) {
      return floorY - (Math.max(0, pVal) / maxVal) * plotH;
    }

    // Axes
    ctx.strokeStyle = axisCol;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(padLeft, floorY);
    ctx.lineTo(w - padRight, floorY);
    ctx.moveTo(padLeft, floorY);
    ctx.lineTo(padLeft, padTop);
    ctx.stroke();

    // Curve
    ctx.strokeStyle = lineCol;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    const steps = 100;
    for (let i = 0; i <= steps; i++) {
      const curT = (i / steps) * maxT;
      const curP = P0 * Math.pow(1 + r, curT);
      const px = toScreenX(curT);
      const py = toScreenY(curP);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Current point (t, P(t))
    const curPtX = toScreenX(t);
    const curPtY = toScreenY(finalVal);

    ctx.strokeStyle = isDark ? '#94a3b8' : '#64748b';
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(curPtX, floorY);
    ctx.lineTo(curPtX, curPtY);
    ctx.lineTo(padLeft, curPtY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = pointCol;
    ctx.beginPath();
    ctx.arc(curPtX, curPtY, 5, 0, Math.PI * 2);
    ctx.fill();

    // Label at current point
    ctx.fillStyle = textCol;
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`P(${t}) = ${finalVal.toFixed(1)}`, curPtX + 8, curPtY - 4);

    // Initial label
    ctx.fillStyle = isDark ? '#94a3b8' : '#64748b';
    ctx.textAlign = 'right';
    ctx.fillText(`P₀=${P0}`, padLeft - 8, toScreenY(P0) + 4);
  }

  return {
    modelId: 'exponential_growth',
    type: 'MATH',
    defaultConfig: DEFAULT_CONFIG,
    compute,
    draw
  };
}));
