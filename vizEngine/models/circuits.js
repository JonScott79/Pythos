/**
 * circuits.js
 *
 * Physics Model: DC Circuits & Ohm's Law (V = I * R, P = V * I)
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PythosCircuitsModel = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  const DEFAULT_CONFIG = {
    title: "Electrodynamics: Ohm's Law & DC Resistor Circuit",
    subtitle: "VOLTAGE, CURRENT & DISSIPATED POWER (ΚΥΚΛΩΜΑ)",
    description: "A series DC circuit with an electromotive source V powering load resistance R.",
    variables: {
      voltage: {
        label: 'Voltage (V)',
        value: 12,
        default: 12,
        min: 1,
        max: 48,
        step: 1,
        unit: 'V'
      },
      resistance: {
        label: 'Resistance (R)',
        value: 6,
        default: 6,
        min: 1,
        max: 50,
        step: 0.5,
        unit: 'Ω'
      }
    }
  };

  function compute(vars) {
    const V = Number(vars.voltage !== undefined ? vars.voltage : 12);
    const R = Number(vars.resistance !== undefined ? vars.resistance : 6);

    // Current: I = V / R
    const I = V / R;

    // Dissipated Power: P = V * I = I^2 * R = V^2 / R
    const P = V * I;

    return {
      inputs: { voltage: V, resistance: R },
      metrics: [
        { id: 'current', label: 'Circuit Current (I = V/R)', value: I, formatted: I.toFixed(2) + ' A' },
        { id: 'power', label: 'Power Dissipated (P = VI)', value: P, formatted: P.toFixed(2) + ' W' },
        { id: 'conductance', label: 'Conductance (G = 1/R)', value: 1 / R, formatted: (1 / R).toFixed(3) + ' S' }
      ],
      diagram: { V, R, I, P }
    };
  }

  function draw(canvas, calcResult) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const bgCol = isDark ? '#090d16' : '#fdfbf7';
    const wireCol = isDark ? '#38bdf8' : '#0284c7';
    const compCol = isDark ? '#fb923c' : '#ea580c';
    const textCol = isDark ? '#e2e8f0' : '#1e293b';

    ctx.fillStyle = bgCol;
    ctx.fillRect(0, 0, w, h);

    const pad = 60;
    const rectX = pad;
    const rectY = pad;
    const rectW = w - 2 * pad;
    const rectH = h - 2 * pad;

    // Draw Main Loop Wire
    ctx.strokeStyle = wireCol;
    ctx.lineWidth = 3;
    ctx.strokeRect(rectX, rectY, rectW, rectH);

    // Left: DC Battery Source
    const midLeftY = rectY + rectH / 2;
    ctx.fillStyle = bgCol;
    ctx.fillRect(rectX - 10, midLeftY - 25, 20, 50);

    // Long plate (+)
    ctx.strokeStyle = compCol;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(rectX - 15, midLeftY - 12);
    ctx.lineTo(rectX + 15, midLeftY - 12);
    ctx.stroke();

    // Short plate (-)
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(rectX - 8, midLeftY + 12);
    ctx.lineTo(rectX + 8, midLeftY + 12);
    ctx.stroke();

    ctx.fillStyle = textCol;
    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${calcResult.diagram.V}V`, rectX - 22, midLeftY + 4);

    // Right: Resistor (Zigzag)
    const midRightX = rectX + rectW;
    const midRightY = rectY + rectH / 2;
    ctx.fillStyle = bgCol;
    ctx.fillRect(midRightX - 15, midRightY - 35, 30, 70);

    ctx.strokeStyle = compCol;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(midRightX, midRightY - 30);
    const zSteps = 6;
    for (let i = 1; i <= zSteps; i++) {
      const zy = (midRightY - 30) + (60 / zSteps) * i;
      const zx = midRightX + (i % 2 === 0 ? 10 : -10);
      ctx.lineTo(i === zSteps ? midRightX : zx, zy);
    }
    ctx.stroke();

    ctx.fillStyle = textCol;
    ctx.textAlign = 'left';
    ctx.fillText(`${calcResult.diagram.R}Ω`, midRightX + 20, midRightY + 4);

    // Top: Current flow indicator arrow
    ctx.fillStyle = isDark ? '#38bdf8' : '#0284c7';
    ctx.font = '11px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`Current Flow → (I = ${calcResult.diagram.I.toFixed(2)}A)`, rectX + rectW / 2, rectY - 12);
  }

  return {
    modelId: 'circuits',
    type: 'PHYSICS',
    defaultConfig: DEFAULT_CONFIG,
    compute,
    draw
  };
}));
