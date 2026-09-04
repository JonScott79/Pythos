/**
 * momentum.js
 *
 * Physics Model: 1D Elastic & Inelastic Collisions & Linear Momentum Conservation
 * m1 v1 + m2 v2 = m1 v1' + m2 v2'
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PythosMomentumModel = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  const DEFAULT_CONFIG = {
    title: "Momentum Conservation: 1D Collisions",
    subtitle: "IMPULSE & COLLISION DYNAMICS (ΟΡΜΗ)",
    description: "Conservation of linear momentum in an elastic collision between two spherical masses m₁ and m₂.",
    variables: {
      m1: {
        label: 'Mass 1 (m₁)',
        value: 4,
        default: 4,
        min: 1,
        max: 20,
        step: 1,
        unit: 'kg'
      },
      v1: {
        label: 'Velocity 1 (v₁)',
        value: 6,
        default: 6,
        min: -15,
        max: 15,
        step: 1,
        unit: 'm/s'
      },
      m2: {
        label: 'Mass 2 (m₂)',
        value: 2,
        default: 2,
        min: 1,
        max: 20,
        step: 1,
        unit: 'kg'
      },
      v2: {
        label: 'Velocity 2 (v₂)',
        value: -2,
        default: -2,
        min: -15,
        max: 15,
        step: 1,
        unit: 'm/s'
      }
    }
  };

  function compute(vars) {
    const m1 = Number(vars.m1 !== undefined ? vars.m1 : 4);
    const v1 = Number(vars.v1 !== undefined ? vars.v1 : 6);
    const m2 = Number(vars.m2 !== undefined ? vars.m2 : 2);
    const v2 = Number(vars.v2 !== undefined ? vars.v2 : -2);

    // Initial total momentum: p_initial = m1*v1 + m2*v2
    const p_total = m1 * v1 + m2 * v2;

    // Initial kinetic energy
    const ke_initial = 0.5 * m1 * v1 * v1 + 0.5 * m2 * v2 * v2;

    // 1D Elastic collision analytical formulas:
    // v1' = ((m1 - m2)/(m1 + m2))*v1 + ((2*m2)/(m1 + m2))*v2
    // v2' = ((2*m1)/(m1 + m2))*v1 + ((m2 - m1)/(m1 + m2))*v2
    const v1_post = ((m1 - m2) / (m1 + m2)) * v1 + ((2 * m2) / (m1 + m2)) * v2;
    const v2_post = ((2 * m1) / (m1 + m2)) * v1 + ((m2 - m1) / (m1 + m2)) * v2;

    // Center of mass velocity
    const v_cm = p_total / (m1 + m2);

    return {
      inputs: { m1, v1, m2, v2 },
      metrics: [
        { id: 'v1Post', label: 'Post-Collision v₁\'', value: v1_post, formatted: v1_post.toFixed(2) + ' m/s' },
        { id: 'v2Post', label: 'Post-Collision v₂\'', value: v2_post, formatted: v2_post.toFixed(2) + ' m/s' },
        { id: 'pTotal', label: 'Total Momentum (P)', value: p_total, formatted: p_total.toFixed(2) + ' kg·m/s' },
        { id: 'vCM', label: 'Center of Mass Velocity', value: v_cm, formatted: v_cm.toFixed(2) + ' m/s' },
        { id: 'ke', label: 'Kinetic Energy (K)', value: ke_initial, formatted: ke_initial.toFixed(1) + ' J' }
      ],
      diagram: {
        m1, v1, m2, v2, v1_post, v2_post
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
    const col1 = isDark ? '#38bdf8' : '#0284c7';
    const col2 = isDark ? '#fb923c' : '#ea580c';
    const textCol = isDark ? '#e2e8f0' : '#1e293b';

    ctx.fillStyle = bgCol;
    ctx.fillRect(0, 0, w, h);

    const trackY = h * 0.55;
    ctx.strokeStyle = axisCol;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(40, trackY);
    ctx.lineTo(w - 40, trackY);
    ctx.stroke();

    // Mass 1 (Blue)
    const r1 = Math.min(Math.max(calcResult.diagram.m1 * 2 + 12, 16), 34);
    const x1 = w * 0.35;
    const y1 = trackY - r1;

    ctx.fillStyle = col1;
    ctx.beginPath();
    ctx.arc(x1, y1, r1, 0, 2 * Math.PI);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${calcResult.diagram.m1}kg`, x1, y1 + 4);

    // Initial Velocity Vector 1
    const v1 = calcResult.diagram.v1;
    if (v1 !== 0) {
      const len1 = v1 * 4;
      ctx.strokeStyle = col1;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x1, y1 - r1 - 10);
      ctx.lineTo(x1 + len1, y1 - r1 - 10);
      ctx.stroke();
      ctx.fillStyle = col1;
      ctx.font = '10px Inter, sans-serif';
      ctx.fillText(`v₁=${v1}m/s`, x1 + len1 / 2, y1 - r1 - 16);
    }

    // Mass 2 (Orange)
    const r2 = Math.min(Math.max(calcResult.diagram.m2 * 2 + 12, 16), 34);
    const x2 = w * 0.65;
    const y2 = trackY - r2;

    ctx.fillStyle = col2;
    ctx.beginPath();
    ctx.arc(x2, y2, r2, 0, 2 * Math.PI);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${calcResult.diagram.m2}kg`, x2, y2 + 4);

    // Initial Velocity Vector 2
    const v2 = calcResult.diagram.v2;
    if (v2 !== 0) {
      const len2 = v2 * 4;
      ctx.strokeStyle = col2;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x2, y2 - r2 - 10);
      ctx.lineTo(x2 + len2, y2 - r2 - 10);
      ctx.stroke();
      ctx.fillStyle = col2;
      ctx.font = '10px Inter, sans-serif';
      ctx.fillText(`v₂=${v2}m/s`, x2 + len2 / 2, y2 - r2 - 16);
    }

    // Post-Collision Outcomes Banner
    ctx.fillStyle = textCol;
    ctx.font = '11px Cinzel, serif';
    ctx.textAlign = 'center';
    ctx.fillText(`Outcome: v₁' = ${calcResult.diagram.v1_post.toFixed(2)} m/s   |   v₂' = ${calcResult.diagram.v2_post.toFixed(2)} m/s`, w / 2, h - 25);
  }

  return {
    modelId: 'momentum',
    type: 'PHYSICS',
    defaultConfig: DEFAULT_CONFIG,
    compute,
    draw
  };
}));
