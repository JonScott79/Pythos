/**
 * energy_transfer.js
 *
 * Physics Model: Mechanical Energy Conservation & Gravitational Transfer (Pendulum / Rollercoaster)
 * E_total = K + U = 1/2 m v^2 + m g h
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PythosEnergyTransferModel = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  const DEFAULT_CONFIG = {
    title: "Conservation of Energy: Potential & Kinetic Transfer",
    subtitle: "MECHANICAL WORK & ENERGY DYNAMICS (ΕΝΕΡΓΕΙΑ)",
    description: "Conservation of mechanical energy for a mass m released from initial height h₀ at current height h.",
    variables: {
      mass: {
        label: 'Mass (m)',
        value: 5,
        default: 5,
        min: 1,
        max: 50,
        step: 1,
        unit: 'kg'
      },
      initialHeight: {
        label: 'Initial Height (h₀)',
        value: 20,
        default: 20,
        min: 5,
        max: 50,
        step: 1,
        unit: 'm'
      },
      currentHeight: {
        label: 'Current Position (h)',
        value: 8,
        default: 8,
        min: 0,
        max: 50,
        step: 1,
        unit: 'm'
      },
      gravity: {
        label: 'Gravity (g)',
        value: 9.8,
        default: 9.8,
        min: 1.6,
        max: 24.8,
        step: 0.1,
        unit: 'm/s²'
      }
    }
  };

  function compute(vars) {
    const m = Number(vars.mass !== undefined ? vars.mass : 5);
    const h0 = Number(vars.initialHeight !== undefined ? vars.initialHeight : 20);
    let h = Number(vars.currentHeight !== undefined ? vars.currentHeight : 8);
    const g = Number(vars.gravity !== undefined ? vars.gravity : 9.8);

    // Clamp current height to not exceed initial release height
    h = Math.min(h, h0);

    const totalEnergy = m * g * h0; // Joules
    const potentialEnergy = m * g * h;
    const kineticEnergy = Math.max(0, totalEnergy - potentialEnergy);
    const velocity = Math.sqrt((2 * kineticEnergy) / m);

    const kineticPercent = totalEnergy > 0 ? (kineticEnergy / totalEnergy) * 100 : 0;
    const potentialPercent = totalEnergy > 0 ? (potentialEnergy / totalEnergy) * 100 : 0;

    return {
      inputs: { mass: m, initialHeight: h0, currentHeight: h, gravity: g },
      metrics: [
        { id: 'totalEnergy', label: 'Total Energy (E)', value: totalEnergy, formatted: totalEnergy.toFixed(1) + ' J' },
        { id: 'kinetic', label: 'Kinetic (K = ½mv²)', value: kineticEnergy, formatted: kineticEnergy.toFixed(1) + ' J' },
        { id: 'potential', label: 'Potential (U = mgh)', value: potentialEnergy, formatted: potentialEnergy.toFixed(1) + ' J' },
        { id: 'velocity', label: 'Velocity (v)', value: velocity, formatted: velocity.toFixed(2) + ' m/s' }
      ],
      diagram: {
        h0,
        h,
        kineticPercent,
        potentialPercent,
        velocity
      }
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
    const peCol = isDark ? '#38bdf8' : '#0284c7'; // Aegean
    const keCol = isDark ? '#fb923c' : '#ea580c'; // Bronze/Fire
    const textCol = isDark ? '#e2e8f0' : '#1e293b';

    ctx.fillStyle = bgCol;
    ctx.fillRect(0, 0, w, h);

    // Split view: Left: Physical Track Simulation, Right: Energy Bar Comparison
    const midX = w * 0.58;

    // Track path (curved ramp from h0 to 0)
    const padX = 50;
    const padY = 40;
    const rampW = midX - padX - 30;
    const rampH = h - padY - 50;

    const h0 = calcResult.diagram.h0;
    const currH = calcResult.diagram.h;

    // Draw ramp curve
    ctx.beginPath();
    ctx.moveTo(padX, padY);
    ctx.quadraticCurveTo(padX + rampW * 0.3, padY + rampH, padX + rampW, padY + rampH);
    ctx.strokeStyle = axisCol;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Mass position along curve
    // Parametric fraction: t = 1 - (h / h0)
    const frac = 1 - (currH / h0);
    const cartX = padX + (1 - frac) * 0 + frac * rampW;
    const cartY = padY + rampH - (currH / h0) * rampH;

    ctx.fillStyle = keCol;
    ctx.beginPath();
    ctx.arc(cartX, cartY, 10, 0, 2 * Math.PI);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Label height
    ctx.fillStyle = textCol;
    ctx.font = '11px Inter, sans-serif';
    ctx.fillText(`h = ${currH}m (v = ${calcResult.diagram.velocity.toFixed(1)} m/s)`, cartX + 16, cartY + 4);

    // Vertical Divider
    ctx.strokeStyle = axisCol;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(midX, 20);
    ctx.lineTo(midX, h - 20);
    ctx.stroke();

    // Right Side: Classical Energy Column
    const barX = midX + 60;
    const barW = 55;
    const barMaxH = 180;
    const barBaseY = h - 60;

    const peH = (calcResult.diagram.potentialPercent / 100) * barMaxH;
    const keH = (calcResult.diagram.kineticPercent / 100) * barMaxH;

    // Potential Energy Block (Bottom)
    ctx.fillStyle = peCol;
    ctx.fillRect(barX, barBaseY - peH, barW, peH);

    // Kinetic Energy Block (Top)
    ctx.fillStyle = keCol;
    ctx.fillRect(barX, barBaseY - peH - keH, barW, keH);

    // Outline
    ctx.strokeStyle = isDark ? '#ffffff' : '#1e293b';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(barX, barBaseY - barMaxH, barW, barMaxH);

    // Legend
    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.fillStyle = peCol;
    ctx.fillText(`■ Potential (U): ${calcResult.diagram.potentialPercent.toFixed(0)}%`, midX + 130, barBaseY - 80);
    ctx.fillStyle = keCol;
    ctx.fillText(`■ Kinetic (K): ${calcResult.diagram.kineticPercent.toFixed(0)}%`, midX + 130, barBaseY - 110);
    ctx.fillStyle = textCol;
    ctx.fillText(`Total E = ${calcResult.metrics[0].formatted}`, midX + 130, barBaseY - 140);
  }

  return {
    modelId: 'energy_transfer',
    type: 'PHYSICS',
    defaultConfig: DEFAULT_CONFIG,
    compute,
    draw
  };
}));
