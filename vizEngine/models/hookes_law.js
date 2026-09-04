/**
 * hookes_law.js
 *
 * Physics Model: Hooke's Law & Simple Harmonic Oscillator (Springs)
 * F = -k * x, U_s = 1/2 k x^2, T = 2*pi*sqrt(m/k), f = 1/T
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PythosHookesLawModel = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  const DEFAULT_CONFIG = {
    title: "Elasticity: Hooke's Law & Harmonic Oscillations",
    subtitle: "RESTORING FORCES & OSCILLATOR FREQUENCY (ΕΛΑΤΗΡΙΟΝ)",
    description: "A spring of stiffness k attached to mass m displaced by distance x from equilibrium.",
    variables: {
      stiffness: {
        label: 'Spring Constant (k)',
        value: 50,
        default: 50,
        min: 10,
        max: 200,
        step: 5,
        unit: 'N/m'
      },
      displacement: {
        label: 'Displacement (x)',
        value: 0.25,
        default: 0.25,
        min: -0.6,
        max: 0.6,
        step: 0.02,
        unit: 'm'
      },
      mass: {
        label: 'Attached Mass (m)',
        value: 2,
        default: 2,
        min: 0.5,
        max: 10,
        step: 0.5,
        unit: 'kg'
      }
    }
  };

  function compute(vars) {
    const k = Number(vars.stiffness !== undefined ? vars.stiffness : 50);
    const x = Number(vars.displacement !== undefined ? vars.displacement : 0.25);
    const m = Number(vars.mass !== undefined ? vars.mass : 2);

    // Restoring force: F = -k * x
    const restoringForce = -k * x;

    // Elastic potential energy: U = 0.5 * k * x^2
    const elasticPotentialEnergy = 0.5 * k * x * x;

    // Period of simple harmonic motion: T = 2 * pi * sqrt(m / k)
    const period = 2 * Math.PI * Math.sqrt(m / k);

    // Frequency: f = 1 / T
    const frequency = 1 / period;

    // Maximum acceleration: a_max = |F| / m = (k * |x|) / m
    const maxAccel = Math.abs(restoringForce) / m;

    return {
      inputs: { stiffness: k, displacement: x, mass: m },
      metrics: [
        { id: 'force', label: 'Restoring Force (F = -kx)', value: restoringForce, formatted: restoringForce.toFixed(2) + ' N' },
        { id: 'pe', label: 'Elastic Energy (Uₛ)', value: elasticPotentialEnergy, formatted: elasticPotentialEnergy.toFixed(2) + ' J' },
        { id: 'period', label: 'Oscillation Period (T)', value: period, formatted: period.toFixed(2) + ' s' },
        { id: 'frequency', label: 'Natural Frequency (f)', value: frequency, formatted: frequency.toFixed(2) + ' Hz' },
        { id: 'accel', label: 'Acceleration (a = F/m)', value: -restoringForce / m, formatted: (-restoringForce / m).toFixed(2) + ' m/s²' }
      ],
      diagram: { k, x, m, restoringForce }
    };
  }

  function draw(canvas, calcResult) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const bgCol = isDark ? '#090d16' : '#fdfbf7';
    const wallCol = isDark ? '#334155' : '#cbd5e1';
    const springCol = isDark ? '#38bdf8' : '#0284c7';
    const blockCol = isDark ? '#fb923c' : '#ea580c';
    const textCol = isDark ? '#e2e8f0' : '#1e293b';

    ctx.fillStyle = bgCol;
    ctx.fillRect(0, 0, w, h);

    const wallX = 60;
    const floorY = h * 0.65;

    // Left Wall
    ctx.fillStyle = wallCol;
    ctx.fillRect(wallX - 16, floorY - 90, 16, 90);
    // Floor
    ctx.fillRect(wallX - 16, floorY, w - wallX, 3);

    // Equilibrium marker
    const eqX = wallX + 220;
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(eqX, floorY - 110);
    ctx.lineTo(eqX, floorY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = textCol;
    ctx.font = '10px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Equilibrium (x=0)', eqX, floorY + 18);

    // Current block position based on displacement x (-0.6 to 0.6 scaled to pixels)
    const pxScale = 180;
    const blockX = eqX + calcResult.diagram.x * pxScale;
    const bw = 50;
    const bh = 50;

    // Draw Spring Coils (Zigzag from wallX to blockX)
    const springStart = wallX;
    const springEnd = blockX - bw / 2;
    const coils = 14;
    const springW = springEnd - springStart;
    const coilAmp = 14;
    const centerY = floorY - bh / 2;

    ctx.strokeStyle = springCol;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(springStart, centerY);
    for (let i = 0; i <= coils; i++) {
      const cx = springStart + (i / coils) * springW;
      const cy = i === 0 || i === coils ? centerY : centerY + (i % 2 === 0 ? coilAmp : -coilAmp);
      ctx.lineTo(cx, cy);
    }
    ctx.stroke();

    // Mass Block
    ctx.fillStyle = blockCol;
    ctx.fillRect(blockX - bw / 2, floorY - bh, bw, bh);
    ctx.strokeStyle = isDark ? '#ffffff' : '#1e293b';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(blockX - bw / 2, floorY - bh, bw, bh);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${calcResult.diagram.m}kg`, blockX, floorY - bh / 2 + 4);

    // Restoring Force Vector
    const force = calcResult.diagram.restoringForce;
    if (Math.abs(force) > 0.5) {
      const fLen = (force / 30) * 40;
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(blockX, floorY - bh - 15);
      ctx.lineTo(blockX + fLen, floorY - bh - 15);
      ctx.stroke();

      ctx.fillStyle = '#ef4444';
      ctx.font = '10px Inter, sans-serif';
      ctx.fillText(`F = ${force.toFixed(1)}N`, blockX + fLen / 2, floorY - bh - 22);
    }
  }

  return {
    modelId: 'hookes_law',
    type: 'PHYSICS',
    defaultConfig: DEFAULT_CONFIG,
    compute,
    draw
  };
}));
