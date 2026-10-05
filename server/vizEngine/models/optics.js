/**
 * optics.js
 *
 * Physics Model: Geometric Optics & Snell's Law (Refraction & Reflection)
 * n1 * sin(theta1) = n2 * sin(theta2), theta_c = arcsin(n2 / n1)
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PythosOpticsModel = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  const DEFAULT_CONFIG = {
    title: "Geometric Optics: Snell's Law & Refraction",
    subtitle: 'LIGHT PROPAGATION AT BOUNDARIES: n₁ sin θ₁ = n₂ sin θ₂ (ΔΙΑΘΛΑΣΙΣ)',
    description: 'A light ray traversing from Medium 1 (index n₁) across a planar boundary into Medium 2 (index n₂).',
    variables: {
      n1: {
        label: 'Medium 1 Index (n₁)',
        value: 1.00,
        default: 1.00,
        min: 1.00,
        max: 2.50,
        step: 0.05,
        unit: ''
      },
      n2: {
        label: 'Medium 2 Index (n₂)',
        value: 1.50,
        default: 1.50,
        min: 1.00,
        max: 2.50,
        step: 0.05,
        unit: ''
      },
      theta1: {
        label: 'Incident Angle (θ₁)',
        value: 45,
        default: 45,
        min: 0,
        max: 85,
        step: 1,
        unit: '°'
      }
    }
  };

  function compute(vars) {
    const n1 = Number(vars.n1 !== undefined ? vars.n1 : 1.00);
    const n2 = Number(vars.n2 !== undefined ? vars.n2 : 1.50);
    const deg1 = Number(vars.theta1 !== undefined ? vars.theta1 : 45);

    const rad1 = (deg1 * Math.PI) / 180;
    const sinTheta2 = (n1 / n2) * Math.sin(rad1);

    const isTIR = sinTheta2 > 1.0;
    let deg2 = null;
    let rad2 = null;
    if (!isTIR) {
      rad2 = Math.asin(sinTheta2);
      deg2 = (rad2 * 180) / Math.PI;
    }

    // Critical Angle (only defined when n1 > n2)
    let criticalAngleDeg = null;
    if (n1 > n2) {
      criticalAngleDeg = (Math.asin(n2 / n1) * 180) / Math.PI;
    }

    // Speed ratio: v2 / v1 = n1 / n2
    const speedRatio = n1 / n2;

    const metrics = [
      {
        id: 'theta2',
        label: 'Refraction Angle (θ₂)',
        value: isTIR ? -1 : deg2,
        formatted: isTIR ? 'TOTAL INTERNAL REFLECTION' : deg2.toFixed(1) + '°'
      },
      {
        id: 'theta_r',
        label: 'Reflection Angle (θ_r)',
        value: deg1,
        formatted: deg1.toFixed(1) + '°'
      },
      {
        id: 'critical',
        label: 'Critical Angle (θ_c)',
        value: criticalAngleDeg !== null ? criticalAngleDeg : -1,
        formatted: criticalAngleDeg !== null ? criticalAngleDeg.toFixed(1) + '°' : 'N/A (n₁ ≤ n₂)'
      },
      {
        id: 'speedRatio',
        label: 'Relative Speed (v₂ / v₁)',
        value: speedRatio,
        formatted: speedRatio.toFixed(3) + '×'
      }
    ];

    return {
      inputs: { n1, n2, theta1: deg1 },
      metrics,
      diagram: { n1, n2, deg1, rad1, deg2, rad2, isTIR, criticalAngleDeg }
    };
  }

  function getMediumName(n) {
    if (Math.abs(n - 1.0) < 0.03) return 'Air / Vacuum (n ≈ 1.0)';
    if (Math.abs(n - 1.33) < 0.05) return 'Water (n ≈ 1.33)';
    if (Math.abs(n - 1.50) < 0.05) return 'Glass / Acrylic (n ≈ 1.50)';
    if (Math.abs(n - 2.42) < 0.08) return 'Diamond (n ≈ 2.42)';
    return 'n = ' + n.toFixed(2);
  }

  function draw(canvas, calcResult) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const bgCol1 = isDark ? '#090d16' : '#fdfbf7';
    const n2Tint = isDark ? 'rgba(14, 116, 144, 0.28)' : 'rgba(56, 189, 248, 0.16)';
    const boundaryCol = isDark ? '#38bdf8' : '#0284c7';
    const normalCol = isDark ? 'rgba(255, 255, 255, 0.25)' : 'rgba(0, 0, 0, 0.25)';
    const rayCol = '#f59e0b';
    const tirCol = '#ef4444';

    const midY = h / 2;
    const originX = w / 2;

    // Draw Medium 1 (Top)
    ctx.fillStyle = bgCol1;
    ctx.fillRect(0, 0, w, midY);

    // Draw Medium 2 (Bottom)
    ctx.fillStyle = n2Tint;
    ctx.fillRect(0, midY, w, midY);

    // Interface boundary
    ctx.strokeStyle = boundaryCol;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(w, midY);
    ctx.stroke();

    // Normal line (vertical dashed)
    ctx.strokeStyle = normalCol;
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(originX, 15);
    ctx.lineTo(originX, h - 15);
    ctx.stroke();
    ctx.setLineDash([]);

    // Medium labels
    ctx.font = 'bold 12px Inter, sans-serif';
    ctx.fillStyle = isDark ? '#94a3b8' : '#475569';
    ctx.textAlign = 'left';
    ctx.fillText('Medium 1: ' + getMediumName(calcResult.diagram.n1), 20, 28);
    ctx.fillText('Medium 2: ' + getMediumName(calcResult.diagram.n2), 20, midY + 28);

    const rad1 = calcResult.diagram.rad1;
    const rayLen = Math.min(w, h) * 0.42;

    // 1. Incident Ray: arrives at (originX, midY) from top-left
    const incStartX = originX - rayLen * Math.sin(rad1);
    const incStartY = midY - rayLen * Math.cos(rad1);

    ctx.strokeStyle = rayCol;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(incStartX, incStartY);
    ctx.lineTo(originX, midY);
    ctx.stroke();

    // Incident Ray arrow marker
    const incMidX = (incStartX + originX) / 2;
    const incMidY = (incStartY + midY) / 2;
    drawRayArrow(ctx, incMidX, incMidY, Math.PI / 2 - rad1, rayCol);

    // 2. Incident angle arc θ1
    const arcR = 36;
    ctx.strokeStyle = '#fb923c';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(originX, midY, arcR, -Math.PI / 2 - rad1, -Math.PI / 2, false);
    ctx.stroke();
    ctx.fillStyle = '#fb923c';
    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('θ₁=' + calcResult.diagram.deg1 + '°', originX - arcR * 0.8 * Math.sin(rad1 / 2), midY - arcR * 0.9 * Math.cos(rad1 / 2));

    // 3. Reflected Ray (top-right)
    const refEndX = originX + rayLen * Math.sin(rad1);
    const refEndY = midY - rayLen * Math.cos(rad1);
    const isTIR = calcResult.diagram.isTIR;

    ctx.strokeStyle = isTIR ? tirCol : 'rgba(245, 158, 11, 0.45)';
    ctx.lineWidth = isTIR ? 3.5 : 1.8;
    ctx.beginPath();
    ctx.moveTo(originX, midY);
    ctx.lineTo(refEndX, refEndY);
    ctx.stroke();

    if (isTIR) {
      ctx.fillStyle = tirCol;
      ctx.font = 'bold 12px Inter, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('⚡ TOTAL INTERNAL REFLECTION', originX + 25, midY - 30);
    }

    // 4. Refracted Ray (bottom-right into Medium 2)
    if (!isTIR && calcResult.diagram.rad2 !== null) {
      const rad2 = calcResult.diagram.rad2;
      const refrEndX = originX + rayLen * Math.sin(rad2);
      const refrEndY = midY + rayLen * Math.cos(rad2);

      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(originX, midY);
      ctx.lineTo(refrEndX, refrEndY);
      ctx.stroke();

      // Refracted arrow marker
      const refrMidX = (originX + refrEndX) / 2;
      const refrMidY = (midY + refrEndY) / 2;
      drawRayArrow(ctx, refrMidX, refrMidY, Math.PI / 2 + rad2, '#38bdf8');

      // Refracted angle arc θ2
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(originX, midY, arcR, Math.PI / 2 - rad2, Math.PI / 2, false);
      ctx.stroke();
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 11px Inter, sans-serif';
      ctx.fillText('θ₂=' + calcResult.diagram.deg2.toFixed(1) + '°', originX + arcR * 0.8 * Math.sin(rad2 / 2), midY + arcR * 0.9 * Math.cos(rad2 / 2));
    }
  }

  function drawRayArrow(ctx, x, y, angle, color) {
    const s = 6;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(s, 0);
    ctx.lineTo(-s, -s * 0.7);
    ctx.lineTo(-s, s * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  return {
    modelId: 'optics',
    type: 'PHYSICS',
    defaultConfig: DEFAULT_CONFIG,
    compute,
    draw
  };
}));
