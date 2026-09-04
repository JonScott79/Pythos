/**
 * waves.js
 *
 * Physics Model: Wave Mechanics & Superposition
 * y(x, t) = A * sin(k*x - omega*t + phi), v = lambda * f
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PythosWavesModel = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  const DEFAULT_CONFIG = {
    title: "Wave Mechanics: Harmonic Propagation & Superposition",
    subtitle: "FREQUENCY, WAVELENGTH & DISPERSION (ΚΥΜΑ)",
    description: "Sinusoidal wave propagation showing amplitude A, wavelength λ, and frequency f.",
    variables: {
      amplitude: {
        label: 'Amplitude (A)',
        value: 1.5,
        default: 1.5,
        min: 0.2,
        max: 3.0,
        step: 0.1,
        unit: 'm'
      },
      wavelength: {
        label: 'Wavelength (λ)',
        value: 4.0,
        default: 4.0,
        min: 1.0,
        max: 10.0,
        step: 0.5,
        unit: 'm'
      },
      frequency: {
        label: 'Frequency (f)',
        value: 2.0,
        default: 2.0,
        min: 0.5,
        max: 8.0,
        step: 0.5,
        unit: 'Hz'
      }
    }
  };

  function compute(vars) {
    const A = Number(vars.amplitude !== undefined ? vars.amplitude : 1.5);
    const lambda = Number(vars.wavelength !== undefined ? vars.wavelength : 4.0);
    const f = Number(vars.frequency !== undefined ? vars.frequency : 2.0);

    // Wave speed: v = lambda * f
    const waveSpeed = lambda * f;

    // Period: T = 1 / f
    const period = 1 / f;

    // Wave number: k = 2 * pi / lambda
    const k = (2 * Math.PI) / lambda;

    // Angular frequency: omega = 2 * pi * f
    const omega = 2 * Math.PI * f;

    // Generate wave profile points for x in [0, 16]
    const points = [];
    const maxX = 16;
    const numPoints = 120;
    for (let i = 0; i <= numPoints; i++) {
      const x = (maxX * i) / numPoints;
      const y = A * Math.sin(k * x);
      points.push({ x, y });
    }

    return {
      inputs: { amplitude: A, wavelength: lambda, frequency: f },
      metrics: [
        { id: 'speed', label: 'Wave Speed (v = λf)', value: waveSpeed, formatted: waveSpeed.toFixed(2) + ' m/s' },
        { id: 'period', label: 'Period (T = 1/f)', value: period, formatted: period.toFixed(3) + ' s' },
        { id: 'wavenumber', label: 'Wavenumber (k)', value: k, formatted: k.toFixed(2) + ' rad/m' },
        { id: 'omega', label: 'Angular Speed (ω)', value: omega, formatted: omega.toFixed(2) + ' rad/s' }
      ],
      diagram: { A, lambda, f, points, maxX }
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
    const waveCol = isDark ? '#38bdf8' : '#0284c7';
    const glowCol = isDark ? 'rgba(56, 189, 248, 0.15)' : 'rgba(2, 132, 199, 0.08)';
    const textCol = isDark ? '#e2e8f0' : '#1e293b';

    ctx.fillStyle = bgCol;
    ctx.fillRect(0, 0, w, h);

    const padLeft = 50;
    const padRight = 30;
    const centerY = h / 2;
    const plotW = w - padLeft - padRight;
    const plotH = h - 60;

    // Center equilibrium axis
    ctx.strokeStyle = axisCol;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padLeft, centerY);
    ctx.lineTo(padLeft + plotW, centerY);
    ctx.stroke();

    const maxAmp = 3.5;
    const pts = calcResult.diagram.points;
    const maxX = calcResult.diagram.maxX;

    const toCanvasX = (x) => padLeft + (x / maxX) * plotW;
    const toCanvasY = (y) => centerY - (y / maxAmp) * (plotH / 2);

    // Wave curve
    ctx.beginPath();
    ctx.moveTo(toCanvasX(pts[0].x), toCanvasY(pts[0].y));
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(toCanvasX(pts[i].x), toCanvasY(pts[i].y));
    }
    ctx.strokeStyle = waveCol;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Wavelength double-arrow indicator
    const lambda = calcResult.diagram.lambda;
    if (lambda <= maxX) {
      const xStart = toCanvasX(0);
      const xEnd = toCanvasX(lambda);
      const indY = centerY - 50;

      ctx.strokeStyle = isDark ? '#fb923c' : '#ea580c';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(xStart, indY);
      ctx.lineTo(xEnd, indY);
      ctx.stroke();

      ctx.fillStyle = isDark ? '#fb923c' : '#ea580c';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`λ = ${lambda}m`, (xStart + xEnd) / 2, indY - 6);
    }
  }

  return {
    modelId: 'waves',
    type: 'PHYSICS',
    defaultConfig: DEFAULT_CONFIG,
    compute,
    draw
  };
}));
