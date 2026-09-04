/**
 * trigonometry.js
 *
 * Mathematics Model: Classical Unit Circle & Trigonometric Functions
 * sin(theta), cos(theta), tan(theta), rad, deg
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PythosTrigonometryModel = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  const DEFAULT_CONFIG = {
    title: "Classical Trigonometry: The Pythagorean Unit Circle",
    subtitle: "CIRCULAR FUNCTIONS & PROJECTIONS (ΤΡΙΓΩΝΟΜΕΤΡΙΑ)",
    description: "Cartesian coordinates on a circle of radius r = 1 parameterized by angle θ.",
    variables: {
      angle: {
        label: 'Angle (θ)',
        value: 45,
        default: 45,
        min: 0,
        max: 360,
        step: 1,
        unit: '°'
      }
    }
  };

  function compute(vars) {
    const thetaDeg = Number(vars.angle !== undefined ? vars.angle : 45);
    const thetaRad = (thetaDeg * Math.PI) / 180;

    const sinVal = Math.sin(thetaRad);
    const cosVal = Math.cos(thetaRad);
    const tanVal = Math.abs(cosVal) > 0.0001 ? Math.tan(thetaRad) : Infinity;

    return {
      inputs: { angle: thetaDeg },
      metrics: [
        { id: 'sin', label: 'Sine (sin θ)', value: sinVal, formatted: sinVal.toFixed(4) },
        { id: 'cos', label: 'Cosine (cos θ)', value: cosVal, formatted: cosVal.toFixed(4) },
        { id: 'tan', label: 'Tangent (tan θ)', value: tanVal, formatted: isFinite(tanVal) ? tanVal.toFixed(4) : 'undefined' },
        { id: 'rad', label: 'Radians (θ)', value: thetaRad, formatted: thetaRad.toFixed(3) + ' rad' }
      ],
      diagram: { thetaDeg, thetaRad, sinVal, cosVal }
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
    const circleCol = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)';
    const cosCol = isDark ? '#38bdf8' : '#0284c7';
    const sinCol = isDark ? '#fb923c' : '#ea580c';
    const textCol = isDark ? '#e2e8f0' : '#1e293b';

    ctx.fillStyle = bgCol;
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;
    const radius = 100;

    // Coordinate Axes
    ctx.strokeStyle = axisCol;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - radius - 40, cy);
    ctx.lineTo(cx + radius + 40, cy);
    ctx.moveTo(cx, cy - radius - 30);
    ctx.lineTo(cx, cy + radius + 30);
    ctx.stroke();

    // Unit Circle
    ctx.strokeStyle = circleCol;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
    ctx.stroke();

    const rad = calcResult.diagram.thetaRad;
    const px = cx + radius * Math.cos(rad);
    const py = cy - radius * Math.sin(rad);

    // Right triangle inscribed in circle
    // Horizontal leg (cos theta)
    ctx.strokeStyle = cosCol;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(px, cy);
    ctx.stroke();

    // Vertical leg (sin theta)
    ctx.strokeStyle = sinCol;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(px, cy);
    ctx.lineTo(px, py);
    ctx.stroke();

    // Hypotenuse (radius vector)
    ctx.strokeStyle = isDark ? '#ffffff' : '#1e293b';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(px, py);
    ctx.stroke();

    // Point on circle
    ctx.fillStyle = sinCol;
    ctx.beginPath();
    ctx.arc(px, py, 5, 0, 2 * Math.PI);
    ctx.fill();

    // Angle arc
    ctx.strokeStyle = sinCol;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, 26, 0, -rad, rad > 0);
    ctx.stroke();

    // Labels
    ctx.font = '11px Inter, sans-serif';
    ctx.fillStyle = cosCol;
    ctx.fillText(`cos = ${calcResult.diagram.cosVal.toFixed(2)}`, cx + (px - cx) / 2, cy + 18);
    ctx.fillStyle = sinCol;
    ctx.fillText(`sin = ${calcResult.diagram.sinVal.toFixed(2)}`, px + 8, cy - (cy - py) / 2);
  }

  return {
    modelId: 'trigonometry',
    type: 'MATH',
    defaultConfig: DEFAULT_CONFIG,
    compute,
    draw
  };
}));
