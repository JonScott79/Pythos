/**
 * normal_distribution.js
 *
 * Statistics & Probability Model: Gaussian Bell Curve & Cumulative Distribution
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PythosNormalDistributionModel = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  const DEFAULT_CONFIG = {
    title: "Statistics: Normal Distribution & Empirical Rule",
    subtitle: "GAUSSIAN BELL CURVE & CUMULATIVE PROBABILITY (ΚΑΤΑΝΟΜΗ)",
    description: "Interactive Gaussian distribution with adjustable Mean (μ), Standard Deviation (σ), and threshold x to compute z-scores and cumulative probabilities.",
    variables: {
      mean: {
        label: 'Mean (μ)',
        value: 0,
        default: 0,
        min: -10,
        max: 10,
        step: 0.5,
        unit: ''
      },
      stdDev: {
        label: 'Std Deviation (σ)',
        value: 1,
        default: 1,
        min: 0.2,
        max: 5,
        step: 0.1,
        unit: ''
      },
      xVal: {
        label: 'Threshold Value (x)',
        value: 1,
        default: 1,
        min: -15,
        max: 15,
        step: 0.25,
        unit: ''
      }
    }
  };

  // Error function approximation for cumulative normal distribution
  function erf(x) {
    const a1 =  0.254829592;
    const a2 = -0.284496736;
    const a3 =  1.421413741;
    const a4 = -1.453152027;
    const a5 =  1.061405429;
    const p  =  0.3275911;

    const sign = x < 0 ? -1 : 1;
    const absX = Math.abs(x);
    const t = 1.0 / (1.0 + p * absX);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);

    return sign * y;
  }

  function normalCdf(x, mean, stdDev) {
    return 0.5 * (1 + erf((x - mean) / (stdDev * Math.SQRT2)));
  }

  function compute(vars) {
    const mu = Number(vars.mean !== undefined ? vars.mean : 0);
    const sigma = Math.max(0.01, Number(vars.stdDev !== undefined ? vars.stdDev : 1));
    const x = Number(vars.xVal !== undefined ? vars.xVal : 1);

    const zScore = (x - mu) / sigma;
    const probLess = normalCdf(x, mu, sigma);
    const probGreater = 1 - probLess;
    const peakPdf = 1 / (sigma * Math.sqrt(2 * Math.PI));

    return {
      inputs: { mean: mu, stdDev: sigma, xVal: x },
      metrics: [
        { id: 'z', label: 'z-score ((x-μ)/σ)', value: zScore, formatted: zScore.toFixed(3) },
        { id: 'cdf', label: 'P(X ≤ x) [Percentile]', value: probLess, formatted: (probLess * 100).toFixed(2) + '%' },
        { id: 'pGreater', label: 'P(X > x) [Right Tail]', value: probGreater, formatted: (probGreater * 100).toFixed(2) + '%' },
        { id: 'sigma1', label: '68% Interval (μ ± 1σ)', value: 0, formatted: `[${(mu - sigma).toFixed(2)}, ${(mu + sigma).toFixed(2)}]` },
        { id: 'sigma2', label: '95% Interval (μ ± 2σ)', value: 0, formatted: `[${(mu - 2 * sigma).toFixed(2)}, ${(mu + 2 * sigma).toFixed(2)}]` },
        { id: 'peak', label: 'Curve Peak Height', value: peakPdf, formatted: peakPdf.toFixed(3) }
      ],
      diagram: { mu, sigma, x, zScore, probLess, peakPdf }
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
    const curveCol = isDark ? '#38bdf8' : '#0284c7';
    const shadeCol = isDark ? 'rgba(56, 189, 248, 0.25)' : 'rgba(2, 132, 199, 0.2)';
    const xMarkerCol = isDark ? '#f43f5e' : '#e11d48';

    ctx.fillStyle = bgCol;
    ctx.fillRect(0, 0, w, h);

    const { mu, sigma, x, zScore, probLess } = calcResult.diagram;

    const padLeft = 45;
    const padRight = 45;
    const padBottom = 40;
    const padTop = 30;

    const plotW = w - padLeft - padRight;
    const plotH = h - padTop - padBottom;
    const floorY = h - padBottom;

    // We plot from mu - 4*sigma to mu + 4*sigma
    const xMin = mu - 4 * sigma;
    const xMax = mu + 4 * sigma;
    const yMax = 1 / (sigma * Math.sqrt(2 * Math.PI)) * 1.15;

    function toScreenX(val) {
      return padLeft + ((val - xMin) / (xMax - xMin)) * plotW;
    }
    function toScreenY(pdfVal) {
      return floorY - (pdfVal / yMax) * plotH;
    }
    function normalPdf(val) {
      const exponent = -0.5 * Math.pow((val - mu) / sigma, 2);
      return (1 / (sigma * Math.sqrt(2 * Math.PI))) * Math.exp(exponent);
    }

    // Baseline axis
    ctx.strokeStyle = axisCol;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(padLeft, floorY);
    ctx.lineTo(w - padRight, floorY);
    ctx.stroke();

    // Shaded Area for P(X <= x)
    ctx.fillStyle = shadeCol;
    ctx.beginPath();
    ctx.moveTo(toScreenX(xMin), floorY);
    const steps = 150;
    for (let i = 0; i <= steps; i++) {
      const curVal = xMin + (i / steps) * (xMax - xMin);
      if (curVal > x) break;
      const pdf = normalPdf(curVal);
      ctx.lineTo(toScreenX(curVal), toScreenY(pdf));
    }
    ctx.lineTo(toScreenX(Math.min(x, xMax)), floorY);
    ctx.closePath();
    ctx.fill();

    // Full Curve Stroke
    ctx.strokeStyle = curveCol;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const curVal = xMin + (i / steps) * (xMax - xMin);
      const pdf = normalPdf(curVal);
      const px = toScreenX(curVal);
      const py = toScreenY(pdf);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Mean Line (μ)
    const muX = toScreenX(mu);
    ctx.strokeStyle = isDark ? '#94a3b8' : '#64748b';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(muX, floorY);
    ctx.lineTo(muX, toScreenY(normalPdf(mu)));
    ctx.stroke();
    ctx.setLineDash([]);

    // Mean label
    ctx.fillStyle = textCol;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`μ = ${mu}`, muX, floorY + 16);

    // x-marker line
    const curX = toScreenX(Math.max(xMin, Math.min(xMax, x)));
    ctx.strokeStyle = xMarkerCol;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(curX, floorY);
    ctx.lineTo(curX, toScreenY(normalPdf(x)));
    ctx.stroke();

    // Label for threshold x
    ctx.fillStyle = xMarkerCol;
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.fillText(`x = ${x} (z = ${zScore.toFixed(2)})`, curX, toScreenY(normalPdf(x)) - 8);

    // Cumulative probability overlay
    ctx.fillStyle = curveCol;
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`P(X ≤ ${x}) = ${(probLess * 100).toFixed(1)}%`, padLeft + 10, padTop + 14);
  }

  return {
    modelId: 'normal_distribution',
    type: 'MATH',
    defaultConfig: DEFAULT_CONFIG,
    compute,
    draw
  };
}));
