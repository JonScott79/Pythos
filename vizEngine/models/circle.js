/**
 * circle.js
 *
 * Mathematics & Geometry Model: Interactive Circle, Radius, Sector & Arc Length
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PythosCircleModel = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  const DEFAULT_CONFIG = {
    title: "Classical Geometry: Circle, Radius & Sector Dynamics",
    subtitle: "EUCLIDEAN CURVATURE & CIRCULAR MEASUREMENT (ΚΥΚΛΟΣ)",
    description: "Interactive circle with adjustable radius and sector angle, computing diameter, circumference, area, arc length, and sector area.",
    variables: {
      radius: {
        label: 'Radius (r)',
        value: 5,
        default: 5,
        min: 1,
        max: 20,
        step: 0.5,
        unit: ' units'
      },
      sectorAngle: {
        label: 'Sector Angle (θ)',
        value: 60,
        default: 60,
        min: 0,
        max: 360,
        step: 5,
        unit: '°'
      }
    }
  };

  function compute(vars) {
    const r = Math.max(0.1, Number(vars.radius !== undefined ? vars.radius : 5));
    const angleDeg = Math.min(360, Math.max(0, Number(vars.sectorAngle !== undefined ? vars.sectorAngle : 60)));
    const angleRad = (angleDeg * Math.PI) / 180;

    const diameter = 2 * r;
    const circumference = 2 * Math.PI * r;
    const totalArea = Math.PI * r * r;
    const arcLength = r * angleRad;
    const sectorArea = 0.5 * r * r * angleRad;

    return {
      inputs: { radius: r, sectorAngle: angleDeg },
      metrics: [
        { id: 'diam', label: 'Diameter (d = 2r)', value: diameter, formatted: diameter.toFixed(2) },
        { id: 'circ', label: 'Circumference (C = 2πr)', value: circumference, formatted: circumference.toFixed(2) },
        { id: 'area', label: 'Total Area (A = πr²)', value: totalArea, formatted: totalArea.toFixed(2) + ' sq units' },
        { id: 'arc', label: 'Arc Length (s = r·θ)', value: arcLength, formatted: arcLength.toFixed(2) },
        { id: 'secArea', label: 'Sector Area (½·r²·θ)', value: sectorArea, formatted: sectorArea.toFixed(2) + ' sq units' },
        { id: 'rad', label: 'Angle in Radians', value: angleRad, formatted: angleRad.toFixed(3) + ' rad' }
      ],
      diagram: { r, angleDeg, angleRad, diameter, circumference, totalArea, arcLength, sectorArea }
    };
  }

  function draw(canvas, calcResult) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const bgCol = isDark ? '#090d16' : '#fdfbf7';
    const circleCol = isDark ? 'rgba(255, 255, 255, 0.25)' : 'rgba(0, 0, 0, 0.2)';
    const sectorFill = isDark ? 'rgba(56, 189, 248, 0.15)' : 'rgba(2, 132, 199, 0.12)';
    const radiusCol = isDark ? '#38bdf8' : '#0284c7';
    const arcCol = isDark ? '#f59e0b' : '#d97706';
    const textCol = isDark ? '#e2e8f0' : '#1e293b';

    ctx.fillStyle = bgCol;
    ctx.fillRect(0, 0, w, h);

    const { r, angleRad, angleDeg } = calcResult.diagram;

    const cx = w / 2;
    const cy = h / 2;
    const maxRadiusPx = Math.min(w, h) * 0.38;
    const scale = maxRadiusPx / 20;
    const radiusPx = Math.max(30, r * scale);

    // Full circle outline
    ctx.strokeStyle = circleCol;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, radiusPx, 0, 2 * Math.PI);
    ctx.stroke();

    // Shaded Sector
    if (angleRad > 0.01) {
      ctx.fillStyle = sectorFill;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radiusPx, 0, -angleRad, true);
      ctx.closePath();
      ctx.fill();

      // Highlighted Arc
      ctx.strokeStyle = arcCol;
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(cx, cy, radiusPx, 0, -angleRad, true);
      ctx.stroke();
    }

    // Radius line
    ctx.strokeStyle = radiusCol;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + radiusPx, cy);
    ctx.stroke();

    // Secondary sector arm
    if (angleRad > 0.01) {
      const armX = cx + radiusPx * Math.cos(-angleRad);
      const armY = cy + radiusPx * Math.sin(-angleRad);
      ctx.strokeStyle = arcCol;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(armX, armY);
      ctx.stroke();
    }

    // Center point
    ctx.fillStyle = radiusCol;
    ctx.beginPath();
    ctx.arc(cx, cy, 4.5, 0, Math.PI * 2);
    ctx.fill();

    // Labels
    ctx.fillStyle = textCol;
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`r = ${r}`, cx + radiusPx / 2, cy + 18);

    if (angleDeg > 15) {
      ctx.fillStyle = arcCol;
      ctx.fillText(`θ = ${angleDeg}°`, cx + (radiusPx * 0.45) * Math.cos(-angleRad / 2), cy + (radiusPx * 0.45) * Math.sin(-angleRad / 2));
    }
  }

  return {
    modelId: 'circle',
    type: 'MATH',
    defaultConfig: DEFAULT_CONFIG,
    compute,
    draw
  };
}));
