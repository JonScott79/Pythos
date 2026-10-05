/**
 * triangle.js
 *
 * Mathematics & Geometry Model: Interactive Pythagorean Right Triangle
 * Sides a (opposite), b (adjacent), c (hypotenuse), Area, Perimeter, and Trigonometric Angles
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PythosTriangleModel = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  const DEFAULT_CONFIG = {
    title: "Classical Geometry: The Pythagorean Right Triangle",
    subtitle: "EUCLIDEAN METRICS & TRIGONOMETRIC RATIOS (ΤΡΙΓΩΝΟΝ)",
    description: "Interactive right triangle with dynamic side length scaling, Pythagorean hypotenuse calculation, and live angular projections.",
    variables: {
      base: {
        label: 'Base / Adjacent (b)',
        value: 4,
        default: 4,
        min: 1,
        max: 30,
        step: 0.5,
        unit: ' units'
      },
      height: {
        label: 'Height / Opposite (a)',
        value: 3,
        default: 3,
        min: 1,
        max: 30,
        step: 0.5,
        unit: ' units'
      }
    }
  };

  function compute(vars) {
    const b = Math.max(0.1, Number(vars.base !== undefined ? vars.base : 4));
    const a = Math.max(0.1, Number(vars.height !== undefined ? vars.height : 3));

    const c = Math.sqrt(a * a + b * b);
    const area = 0.5 * a * b;
    const perimeter = a + b + c;

    const thetaRad = Math.atan2(a, b);
    const thetaDeg = (thetaRad * 180) / Math.PI;
    const betaDeg = 90 - thetaDeg;

    const sinVal = a / c;
    const cosVal = b / c;
    const tanVal = a / b;

    return {
      inputs: { base: b, height: a },
      metrics: [
        { id: 'hyp', label: 'Hypotenuse (c = √(a²+b²))', value: c, formatted: c.toFixed(2) },
        { id: 'area', label: 'Area (½·b·h)', value: area, formatted: area.toFixed(2) + ' sq units' },
        { id: 'theta', label: 'Angle θ (at base)', value: thetaDeg, formatted: thetaDeg.toFixed(1) + '°' },
        { id: 'beta', label: 'Angle β (at peak)', value: betaDeg, formatted: betaDeg.toFixed(1) + '°' },
        { id: 'perimeter', label: 'Perimeter (a+b+c)', value: perimeter, formatted: perimeter.toFixed(2) },
        { id: 'sin', label: 'sin θ (opp/hyp)', value: sinVal, formatted: sinVal.toFixed(3) },
        { id: 'cos', label: 'cos θ (adj/hyp)', value: cosVal, formatted: cosVal.toFixed(3) },
        { id: 'tan', label: 'tan θ (opp/adj)', value: tanVal, formatted: tanVal.toFixed(3) }
      ],
      diagram: { a, b, c, area, perimeter, thetaRad, thetaDeg, betaDeg }
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
    const mutedCol = isDark ? '#94a3b8' : '#64748b';
    const fillCol = isDark ? 'rgba(56, 189, 248, 0.08)' : 'rgba(2, 132, 199, 0.06)';
    const baseCol = isDark ? '#38bdf8' : '#0284c7';
    const heightCol = isDark ? '#fb923c' : '#ea580c';
    const hypCol = isDark ? '#a855f7' : '#9333ea';
    const rightAngleCol = isDark ? '#64748b' : '#94a3b8';

    ctx.fillStyle = bgCol;
    ctx.fillRect(0, 0, w, h);

    const { a, b, c, thetaRad, thetaDeg } = calcResult.diagram;

    const padX = 70;
    const padY = 55;
    const availW = w - padX * 2;
    const availH = h - padY * 2;

    const scale = Math.min(availW / b, availH / a);
    const drawW = b * scale;
    const drawH = a * scale;

    const Cx = padX + (availW - drawW) / 2;
    const Cy = h - padY - (availH - drawH) / 2;
    const Bx = Cx + drawW;
    const By = Cy;
    const Ax = Cx;
    const Ay = Cy - drawH;

    // Fill
    ctx.fillStyle = fillCol;
    ctx.beginPath();
    ctx.moveTo(Cx, Cy);
    ctx.lineTo(Bx, By);
    ctx.lineTo(Ax, Ay);
    ctx.closePath();
    ctx.fill();

    // Right-angle marker
    const sqSize = Math.min(18, Math.min(drawW, drawH) * 0.25);
    ctx.strokeStyle = rightAngleCol;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(Cx + sqSize, Cy);
    ctx.lineTo(Cx + sqSize, Cy - sqSize);
    ctx.lineTo(Cx, Cy - sqSize);
    ctx.stroke();

    // Arc for angle theta at vertex B
    const arcR = Math.min(32, drawW * 0.3);
    ctx.strokeStyle = '#eab308';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(Bx, By, arcR, Math.PI, Math.PI + thetaRad, false);
    ctx.stroke();

    ctx.fillStyle = '#eab308';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`θ = ${thetaDeg.toFixed(1)}°`, Bx - arcR - 6, By - 8);

    // Sides
    // Base
    ctx.strokeStyle = baseCol;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(Cx, Cy);
    ctx.lineTo(Bx, By);
    ctx.stroke();

    // Height
    ctx.strokeStyle = heightCol;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(Cx, Cy);
    ctx.lineTo(Ax, Ay);
    ctx.stroke();

    // Hypotenuse
    ctx.strokeStyle = hypCol;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(Ax, Ay);
    ctx.lineTo(Bx, By);
    ctx.stroke();

    // Labels
    ctx.font = 'bold 12px system-ui, sans-serif';

    ctx.fillStyle = baseCol;
    ctx.textAlign = 'center';
    ctx.fillText(`b (base) = ${b}`, (Cx + Bx) / 2, Cy + 22);

    ctx.fillStyle = heightCol;
    ctx.textAlign = 'right';
    ctx.fillText(`a (height) = ${a}`, Cx - 12, (Ay + Cy) / 2);

    ctx.fillStyle = hypCol;
    ctx.textAlign = 'left';
    ctx.fillText(`c (hypotenuse) = ${c.toFixed(2)}`, (Ax + Bx) / 2 + 14, (Ay + By) / 2 - 6);

    // Vertices
    const vertices = [
      { name: 'C (90°)', x: Cx, y: Cy, offX: -10, offY: 16, align: 'right' },
      { name: 'B', x: Bx, y: By, offX: 12, offY: 16, align: 'left' },
      { name: 'A', x: Ax, y: Ay, offX: -10, offY: -8, align: 'right' }
    ];

    vertices.forEach(v => {
      ctx.fillStyle = textCol;
      ctx.beginPath();
      ctx.arc(v.x, v.y, 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = mutedCol;
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = v.align;
      ctx.fillText(v.name, v.x + v.offX, v.y + v.offY);
    });
  }

  return {
    modelId: 'triangle',
    type: 'MATH',
    defaultConfig: DEFAULT_CONFIG,
    compute,
    draw
  };
}));
