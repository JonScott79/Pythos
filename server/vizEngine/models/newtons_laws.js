/**
 * newtons_laws.js
 *
 * Physics Model: Newton's Second Law & Inclined Plane / Block Dynamics (F = ma)
 * Completely style-independent mathematical model with classical canvas renderer.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PythosNewtonsLawsModel = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  const DEFAULT_CONFIG = {
    title: "Dynamics: Newton's Second Law & Inclined Plane",
    subtitle: "FORCES, ACCELERATION & INCLINE DYNAMICS (ΔΥΝΑΜΙΚΗ)",
    description: "A block of mass m subjected to applied force F on an incline with angle θ and friction coefficient μ.",
    variables: {
      mass: {
        label: 'Mass (m)',
        value: 10,
        default: 10,
        min: 1,
        max: 100,
        step: 1,
        unit: 'kg'
      },
      appliedForce: {
        label: 'Applied Force (F)',
        value: 80,
        default: 80,
        min: 0,
        max: 300,
        step: 5,
        unit: 'N'
      },
      angle: {
        label: 'Incline Angle (θ)',
        value: 30,
        default: 30,
        min: 0,
        max: 60,
        step: 1,
        unit: '°'
      },
      friction: {
        label: 'Friction Coeff (μ)',
        value: 0.2,
        default: 0.2,
        min: 0,
        max: 0.8,
        step: 0.05,
        unit: ''
      }
    }
  };

  function compute(vars) {
    const m = Number(vars.mass !== undefined ? vars.mass : 10);
    const F = Number(vars.appliedForce !== undefined ? vars.appliedForce : 80);
    const thetaDeg = Number(vars.angle !== undefined ? vars.angle : 30);
    const mu = Number(vars.friction !== undefined ? vars.friction : 0.2);
    const g = 9.8;

    const thetaRad = (thetaDeg * Math.PI) / 180;
    const sinTheta = Math.sin(thetaRad);
    const cosTheta = Math.cos(thetaRad);

    // Gravity components:
    // Parallel down the incline: F_g_parallel = m * g * sin(theta)
    // Perpendicular into incline: F_g_perp = m * g * cos(theta)
    const F_g = m * g;
    const F_parallel = m * g * sinTheta;
    const NormalForce = m * g * cosTheta;
    const maxFriction = mu * NormalForce;

    // Net force up the incline:
    // F_net = F_applied - F_parallel - F_friction
    // If block is accelerating or stationary
    const drivingForce = F - F_parallel;
    let frictionForce = 0;
    let netForce = 0;
    let accel = 0;

    if (Math.abs(drivingForce) <= maxFriction) {
      frictionForce = -drivingForce;
      netForce = 0;
      accel = 0;
    } else if (drivingForce > maxFriction) {
      frictionForce = maxFriction;
      netForce = drivingForce - frictionForce;
      accel = netForce / m;
    } else {
      // sliding downhill
      frictionForce = -maxFriction;
      netForce = drivingForce - frictionForce;
      accel = netForce / m;
    }

    return {
      inputs: { mass: m, appliedForce: F, angle: thetaDeg, friction: mu },
      metrics: [
        { id: 'accel', label: 'Acceleration (a)', value: accel, formatted: accel.toFixed(2) + ' m/s²' },
        { id: 'netForce', label: 'Net Force (F_net)', value: netForce, formatted: netForce.toFixed(2) + ' N' },
        { id: 'normal', label: 'Normal Force (N)', value: NormalForce, formatted: NormalForce.toFixed(2) + ' N' },
        { id: 'gravityParallel', label: 'Down-slope Gravity (mg sinθ)', value: F_parallel, formatted: F_parallel.toFixed(2) + ' N' },
        { id: 'frictionForce', label: 'Friction (f)', value: Math.abs(frictionForce), formatted: Math.abs(frictionForce).toFixed(2) + ' N' }
      ],
      diagram: {
        thetaRad,
        mass: m,
        F,
        NormalForce,
        F_parallel,
        frictionForce,
        accel
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
    const wedgeCol = isDark ? '#1e293b' : '#e2e8f0';
    const blockCol = isDark ? '#2a728f' : '#38bdf8';
    const forceCol = isDark ? '#fb923c' : '#ea580c';
    const normCol = isDark ? '#38bdf8' : '#0284c7';
    const textCol = isDark ? '#e2e8f0' : '#1e293b';

    ctx.fillStyle = bgCol;
    ctx.fillRect(0, 0, w, h);

    const padLeft = 80;
    const padBottom = 60;
    const inclineLen = 340;
    const theta = calcResult.diagram.thetaRad;

    const x0 = padLeft;
    const y0 = h - padBottom;
    const x1 = x0 + inclineLen * Math.cos(theta);
    const y1 = y0 - inclineLen * Math.sin(theta);

    // Draw Incline Wedge
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y0);
    ctx.lineTo(x1, y1);
    ctx.closePath();
    ctx.fillStyle = wedgeCol;
    ctx.fill();
    ctx.strokeStyle = axisCol;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Angle arc
    ctx.beginPath();
    ctx.arc(x0, y0, 45, 0, -theta, true);
    ctx.strokeStyle = forceCol;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = textCol;
    ctx.font = '11px Inter, sans-serif';
    ctx.fillText(`${calcResult.inputs.angle}°`, x0 + 55, y0 - 12);

    // Block on incline
    const blockDist = inclineLen * 0.55;
    const bx = x0 + blockDist * Math.cos(theta);
    const by = y0 - blockDist * Math.sin(theta);
    const bw = 50;
    const bh = 32;

    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(-theta);

    // Block body
    ctx.fillStyle = blockCol;
    ctx.fillRect(-bw / 2, -bh, bw, bh);
    ctx.strokeStyle = isDark ? '#ffffff' : '#1e293b';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-bw / 2, -bh, bw, bh);

    // Center mass label
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${calcResult.inputs.mass}kg`, 0, -bh / 2 + 4);

    // Draw Force Vector (F applied)
    if (calcResult.diagram.F > 0) {
      const fLen = Math.min(calcResult.diagram.F * 0.7, 90);
      ctx.strokeStyle = forceCol;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(bw / 2, -bh / 2);
      ctx.lineTo(bw / 2 + fLen, -bh / 2);
      ctx.stroke();

      // Arrowhead
      ctx.fillStyle = forceCol;
      ctx.beginPath();
      ctx.moveTo(bw / 2 + fLen, -bh / 2);
      ctx.lineTo(bw / 2 + fLen - 8, -bh / 2 - 5);
      ctx.lineTo(bw / 2 + fLen - 8, -bh / 2 + 5);
      ctx.closePath();
      ctx.fill();

      ctx.font = '10px Inter, sans-serif';
      ctx.fillText(`F=${calcResult.diagram.F}N`, bw / 2 + fLen + 15, -bh / 2 + 3);
    }

    // Normal force (perpendicular upwards)
    const nLen = 45;
    ctx.strokeStyle = normCol;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -bh);
    ctx.lineTo(0, -bh - nLen);
    ctx.stroke();
    ctx.fillStyle = normCol;
    ctx.beginPath();
    ctx.moveTo(0, -bh - nLen);
    ctx.lineTo(-5, -bh - nLen + 7);
    ctx.lineTo(5, -bh - nLen + 7);
    ctx.closePath();
    ctx.fill();
    ctx.fillText('N', 12, -bh - nLen + 10);

    ctx.restore();

    // Acceleration banner
    ctx.fillStyle = calcResult.diagram.accel > 0 ? forceCol : textCol;
    ctx.font = 'bold 12px Cinzel, serif';
    ctx.textAlign = 'right';
    ctx.fillText(`a = ${calcResult.metrics[0].formatted}`, w - 30, 35);
  }

  return {
    modelId: 'newtons_laws',
    type: 'PHYSICS',
    defaultConfig: DEFAULT_CONFIG,
    compute,
    draw
  };
}));
