/**
 * pendulum.js
 *
 * Physics Model: Simple Pendulum & Harmonic Oscillation
 * T = 2*pi*sqrt(L/g), tau = -mgL sin(theta), E = mgL(1 - cos(theta))
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PythosPendulumModel = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  const DEFAULT_CONFIG = {
    title: 'Mechanics: Simple Harmonic Pendulum',
    subtitle: 'PERIODIC MOTION & RESTORING TORQUE (ΕΚΚΡΕΜΕΣ)',
    description: 'A mass bob suspended on a light arm of length L swinging under uniform gravity g.',
    variables: {
      length: {
        label: 'Pendulum Length (L)',
        value: 2.0,
        default: 2.0,
        min: 0.5,
        max: 4.0,
        step: 0.1,
        unit: 'm'
      },
      angle: {
        label: 'Release Angle (θ)',
        value: 30,
        default: 30,
        min: 5,
        max: 80,
        step: 1,
        unit: '°'
      },
      gravity: {
        label: 'Gravity (g)',
        value: 9.8,
        default: 9.8,
        min: 1.6,
        max: 25.0,
        step: 0.2,
        unit: 'm/s²'
      },
      mass: {
        label: 'Bob Mass (m)',
        value: 1.0,
        default: 1.0,
        min: 0.2,
        max: 5.0,
        step: 0.1,
        unit: 'kg'
      }
    }
  };

  function compute(vars) {
    const L = Number(vars.length !== undefined ? vars.length : (vars.L !== undefined ? vars.L : 2.0));
    const deg = Number(vars.angle !== undefined ? vars.angle : (vars.theta !== undefined ? vars.theta : 30));
    const g = Number(vars.gravity !== undefined ? vars.gravity : (vars.g !== undefined ? vars.g : 9.8));
    const m = Number(vars.mass !== undefined ? vars.mass : (vars.m !== undefined ? vars.m : 1.0));

    const thetaRad = (deg * Math.PI) / 180;

    // Small angle period: T0 = 2*pi*sqrt(L/g)
    const T0 = 2 * Math.PI * Math.sqrt(L / g);
    // Borda second-order correction for large angles
    const T = T0 * (1 + (1 / 16) * Math.pow(thetaRad, 2) + (11 / 3072) * Math.pow(thetaRad, 4));
    const freq = 1 / T;
    const omega = (2 * Math.PI) / T;

    // Potential Energy at release: PE = m * g * L * (1 - cos(theta))
    const maxPE = m * g * L * (1 - Math.cos(thetaRad));
    // Maximum velocity at bottom (all PE converted to KE)
    const maxVelocity = Math.sqrt(2 * g * L * (1 - Math.cos(thetaRad)));
    // Restoring torque at max angle: tau = -m * g * L * sin(theta)
    const restoringTorque = -m * g * L * Math.sin(thetaRad);
    // Max string tension at bottom: T_string = m*g + m*v^2/L = m*g*(3 - 2*cos(theta))
    const maxTension = m * g * (3 - 2 * Math.cos(thetaRad));

    return {
      inputs: { length: L, angle: deg, gravity: g, mass: m },
      metrics: [
        { id: 'period', label: 'Oscillation Period (T)', value: T, formatted: T.toFixed(3) + ' s' },
        { id: 'freq', label: 'Frequency (f = 1/T)', value: freq, formatted: freq.toFixed(3) + ' Hz' },
        { id: 'vmax', label: 'Max Speed (v_max)', value: maxVelocity, formatted: maxVelocity.toFixed(2) + ' m/s' },
        { id: 'pe', label: 'Peak Potential Energy', value: maxPE, formatted: maxPE.toFixed(2) + ' J' },
        { id: 'tension', label: 'Bottom String Tension', value: maxTension, formatted: maxTension.toFixed(2) + ' N' }
      ],
      diagram: { L, deg, thetaRad, g, m, maxVelocity, maxPE }
    };
  }

  function draw(canvas, calcResult) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const bgCol = isDark ? '#090d16' : '#fdfbf7';
    const plateCol = isDark ? '#334155' : '#cbd5e1';
    const stringCol = isDark ? '#94a3b8' : '#64748b';
    const arcCol = isDark ? 'rgba(56, 189, 248, 0.4)' : 'rgba(42, 114, 143, 0.35)';
    const textCol = isDark ? '#e2e8f0' : '#1e293b';
    const orangeCol = isDark ? '#fb923c' : '#ea580c';

    ctx.fillStyle = bgCol;
    ctx.fillRect(0, 0, w, h);

    const pivotX = w / 2;
    const pivotY = 48;

    // Top mounting plate
    ctx.fillStyle = plateCol;
    ctx.fillRect(pivotX - 40, pivotY - 14, 80, 14);
    ctx.fillStyle = '#64748b';
    ctx.beginPath();
    ctx.arc(pivotX, pivotY, 5, 0, Math.PI * 2);
    ctx.fill();

    const L = calcResult.diagram.L;
    const thetaRad = calcResult.diagram.thetaRad;
    const deg = calcResult.diagram.deg;

    // Scale visual length to canvas bounds (length 0.5m - 4m -> 100px - 210px)
    const pxLen = 90 + (L / 4.0) * 120;

    // Bob center position
    const bobX = pivotX + pxLen * Math.sin(thetaRad);
    const bobY = pivotY + pxLen * Math.cos(thetaRad);

    // Symmetric opposite swing limit (ghost)
    const ghostX = pivotX - pxLen * Math.sin(thetaRad);
    const ghostY = bobY;

    // Draw dashed vertical reference line (equilibrium)
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.18)';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(pivotX, pivotY);
    ctx.lineTo(pivotX, pivotY + pxLen + 30);
    ctx.stroke();

    // Draw trajectory arc
    ctx.strokeStyle = arcCol;
    ctx.setLineDash([2, 2]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(pivotX, pivotY, pxLen, Math.PI / 2 - thetaRad, Math.PI / 2 + thetaRad, false);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw release angle arc indicator
    const angleArcR = 40;
    ctx.strokeStyle = orangeCol;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(pivotX, pivotY, angleArcR, Math.PI / 2, Math.PI / 2 + (thetaRad > 0 ? -thetaRad : thetaRad), true);
    ctx.stroke();

    ctx.fillStyle = orangeCol;
    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(deg + '°', pivotX + 24 * Math.sin(thetaRad / 2), pivotY + 36);

    // Draw ghost bob on opposite side
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.15)';
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(pivotX, pivotY);
    ctx.lineTo(ghostX, ghostY);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(ghostX, ghostY, 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw main pendulum suspension rod/string
    ctx.strokeStyle = stringCol;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(pivotX, pivotY);
    ctx.lineTo(bobX, bobY);
    ctx.stroke();

    // Draw bob with 3D gradient
    const bobR = 14 + (calcResult.diagram.m / 5.0) * 8;
    const grad = ctx.createRadialGradient(bobX - bobR * 0.35, bobY - bobR * 0.35, bobR * 0.1, bobX, bobY, bobR);
    if (isDark) {
      grad.addColorStop(0, '#7dd3fc');
      grad.addColorStop(1, '#0284c7');
    } else {
      grad.addColorStop(0, '#38bdf8');
      grad.addColorStop(1, '#0369a1');
    }
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(bobX, bobY, bobR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = isDark ? '#bae6fd' : '#075985';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Bob mass label
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 10px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(calcResult.diagram.m + 'kg', bobX, bobY + 3);

    // Tangential Velocity Vector Arrow (v_max at bottom)
    const vMax = calcResult.diagram.maxVelocity;
    if (vMax > 0.1) {
      const arrowLen = Math.min(vMax * 14, 55);
      const eqBottomX = pivotX;
      const eqBottomY = pivotY + pxLen;

      ctx.strokeStyle = '#10b981';
      ctx.fillStyle = '#10b981';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(eqBottomX - arrowLen / 2, eqBottomY + bobR + 10);
      ctx.lineTo(eqBottomX + arrowLen / 2, eqBottomY + bobR + 10);
      ctx.stroke();

      // Arrowhead
      ctx.beginPath();
      ctx.moveTo(eqBottomX + arrowLen / 2, eqBottomY + bobR + 10);
      ctx.lineTo(eqBottomX + arrowLen / 2 - 6, eqBottomY + bobR + 6);
      ctx.lineTo(eqBottomX + arrowLen / 2 - 6, eqBottomY + bobR + 14);
      ctx.closePath();
      ctx.fill();

      ctx.font = '10px Inter, sans-serif';
      ctx.fillText('v_max = ' + vMax.toFixed(2) + ' m/s', eqBottomX, eqBottomY + bobR + 25);
    }
  }

  return {
    modelId: 'pendulum',
    type: 'PHYSICS',
    defaultConfig: DEFAULT_CONFIG,
    compute,
    draw
  };
}));
