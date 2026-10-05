/**
 * gas_laws.js
 *
 * Chemistry & Thermodynamics Model: Ideal Gas Law (PV = nRT)
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PythosGasLawsModel = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  const R = 0.08206; // L*atm / (mol*K)

  const DEFAULT_CONFIG = {
    title: "Thermodynamics & Chemistry: Ideal Gas Law",
    subtitle: "STATE VARIABLES OF GASES: PV = nRT (ΑΕΡΙΑ)",
    description: "Interactive piston chamber illustrating the relationship between Pressure (P), Volume (V), Temperature (T), and Moles (n).",
    variables: {
      pressure: {
        label: 'Pressure (P)',
        value: 1.0,
        default: 1.0,
        min: 0.2,
        max: 5.0,
        step: 0.1,
        unit: ' atm'
      },
      temperature: {
        label: 'Temperature (T)',
        value: 300,
        default: 300,
        min: 100,
        max: 600,
        step: 10,
        unit: ' K'
      },
      moles: {
        label: 'Amount (n)',
        value: 1.0,
        default: 1.0,
        min: 0.1,
        max: 3.0,
        step: 0.1,
        unit: ' mol'
      }
    }
  };

  function compute(vars) {
    const P = Math.max(0.1, Number(vars.pressure !== undefined ? vars.pressure : 1.0));
    const T = Math.max(50, Number(vars.temperature !== undefined ? vars.temperature : 300));
    const n = Math.max(0.05, Number(vars.moles !== undefined ? vars.moles : 1.0));

    // V = nRT / P
    const V = (n * R * T) / P;
    const avgKineticEnergy = 1.5 * 8.314 * T; // J/mol

    return {
      inputs: { pressure: P, temperature: T, moles: n },
      metrics: [
        { id: 'vol', label: 'Volume (V = nRT/P)', value: V, formatted: V.toFixed(2) + ' L' },
        { id: 'celsius', label: 'Temperature in Celsius', value: T - 273.15, formatted: (T - 273.15).toFixed(1) + ' °C' },
        { id: 'ke', label: 'Avg Kinetic Energy (³/₂RT)', value: avgKineticEnergy, formatted: avgKineticEnergy.toFixed(0) + ' J/mol' },
        { id: 'density', label: 'Molar Density (n/V)', value: n / V, formatted: (n / V).toFixed(3) + ' mol/L' }
      ],
      diagram: { P, T, n, V }
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
    const chamberBorder = isDark ? '#64748b' : '#94a3b8';
    const pistonCol = isDark ? '#e2e8f0' : '#475569';
    const gasCol = isDark ? 'rgba(56, 189, 248, 0.15)' : 'rgba(2, 132, 199, 0.1)';

    ctx.fillStyle = bgCol;
    ctx.fillRect(0, 0, w, h);

    const { P, T, n, V } = calcResult.diagram;

    // Chamber dimensions
    const cWidth = 140;
    const maxChamberH = 160;
    const cx = w / 2 - 30;
    const cy = h / 2 + 10;
    const bottomY = cy + maxChamberH / 2;

    // Piston height inversely related to pressure / directly related to V
    // Clamped height
    const pistonHeightPx = Math.min(maxChamberH - 20, Math.max(30, (V / 80) * maxChamberH));
    const pistonY = bottomY - pistonHeightPx;

    // Gas fill
    ctx.fillStyle = gasCol;
    ctx.fillRect(cx - cWidth / 2, pistonY, cWidth, pistonHeightPx);

    // Chamber walls (U shape)
    ctx.strokeStyle = chamberBorder;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(cx - cWidth / 2, bottomY - maxChamberH);
    ctx.lineTo(cx - cWidth / 2, bottomY);
    ctx.lineTo(cx + cWidth / 2, bottomY);
    ctx.lineTo(cx + cWidth / 2, bottomY - maxChamberH);
    ctx.stroke();

    // Movable Piston
    ctx.fillStyle = pistonCol;
    ctx.fillRect(cx - cWidth / 2 + 2, pistonY - 8, cWidth - 4, 10);

    // Piston rod
    ctx.strokeStyle = pistonCol;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(cx, pistonY - 8);
    ctx.lineTo(cx, pistonY - 35);
    ctx.stroke();

    // Gas molecules (dots)
    const numDots = Math.min(45, Math.max(8, Math.round(n * 15)));
    ctx.fillStyle = isDark ? '#38bdf8' : '#0284c7';
    for (let i = 0; i < numDots; i++) {
      const rx = (cx - cWidth / 2 + 10) + ((i * 37) % (cWidth - 20));
      const ry = pistonY + 8 + ((i * 53) % Math.max(10, pistonHeightPx - 16));
      ctx.beginPath();
      ctx.arc(rx, ry, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Pressure Gauge Box
    const gaugeX = cx + cWidth / 2 + 35;
    const gaugeY = cy - 20;
    ctx.strokeStyle = chamberBorder;
    ctx.lineWidth = 2;
    ctx.strokeRect(gaugeX, gaugeY, 80, 60);

    ctx.fillStyle = textCol;
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PRESSURE', gaugeX + 40, gaugeY + 18);
    ctx.fillStyle = '#ef4444';
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.fillText(`${P.toFixed(1)} atm`, gaugeX + 40, gaugeY + 42);

    // Temperature indicator
    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`Temp: ${T} K`, cx, bottomY + 22);
  }

  return {
    modelId: 'gas_laws',
    type: 'PHYSICS',
    defaultConfig: DEFAULT_CONFIG,
    compute,
    draw
  };
}));
