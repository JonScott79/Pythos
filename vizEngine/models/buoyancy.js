/**
 * buoyancy.js
 *
 * Physics Model: Archimedes' Principle & Buoyancy
 * F_b = rho_fluid * V_sub * g, W = rho_obj * V * g, F_net = F_b - W
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PythosBuoyancyModel = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  const DEFAULT_CONFIG = {
    title: "Fluid Mechanics: Archimedes' Principle & Buoyancy",
    subtitle: 'HYDROSTATIC UPTHRUST & FLOTATION: F_b = ρ · V · g (ΑΝΩΣΙΣ)',
    description: 'An object immersed in a fluid experiencing upward buoyant force equal to the displaced fluid weight.',
    variables: {
      objDensity: {
        label: 'Object Density (ρ_obj)',
        value: 700,
        default: 700,
        min: 150,
        max: 2700,
        step: 50,
        unit: 'kg/m³'
      },
      fluidDensity: {
        label: 'Fluid Density (ρ_fluid)',
        value: 1000,
        default: 1000,
        min: 500,
        max: 1400,
        step: 25,
        unit: 'kg/m³'
      },
      volume: {
        label: 'Object Volume (V)',
        value: 0.010,
        default: 0.010,
        min: 0.002,
        max: 0.030,
        step: 0.002,
        unit: 'm³'
      },
      gravity: {
        label: 'Gravity (g)',
        value: 9.8,
        default: 9.8,
        min: 1.6,
        max: 20.0,
        step: 0.2,
        unit: 'm/s²'
      }
    }
  };

  function compute(vars) {
    const rhoObj = Number(vars.objDensity !== undefined ? vars.objDensity : 700);
    const rhoFluid = Number(vars.fluidDensity !== undefined ? vars.fluidDensity : 1000);
    const V = Number(vars.volume !== undefined ? vars.volume : 0.010);
    const g = Number(vars.gravity !== undefined ? vars.gravity : 9.8);

    // Total Object Mass & Weight
    const mass = rhoObj * V;
    const weight = mass * g;

    // Submerged Fraction & Volume
    const submergedFraction = Math.min(1.0, rhoObj / rhoFluid);
    const Vsub = V * submergedFraction;

    // Upward Buoyant Force
    const buoyantForce = rhoFluid * Vsub * g;

    // Net Vertical Force (prior to normal force from bottom)
    const netForce = buoyantForce - weight;

    let status = 'Floats (In Equilibrium)';
    let normalForce = 0;
    if (rhoObj > rhoFluid) {
      status = 'Sinks to Bottom';
      normalForce = weight - buoyantForce;
    } else if (Math.abs(rhoObj - rhoFluid) < 1e-4) {
      status = 'Neutrally Buoyant (Suspended)';
    }

    return {
      inputs: { objDensity: rhoObj, fluidDensity: rhoFluid, volume: V, gravity: g },
      metrics: [
        { id: 'status', label: 'Flotation State', value: submergedFraction, formatted: status },
        { id: 'buoyantForce', label: 'Buoyant Force (F_b)', value: buoyantForce, formatted: buoyantForce.toFixed(2) + ' N' },
        { id: 'weight', label: 'Object Weight (W = mg)', value: weight, formatted: weight.toFixed(2) + ' N' },
        { id: 'submergedPct', label: 'Submerged Fraction', value: submergedFraction * 100, formatted: (submergedFraction * 100).toFixed(1) + '%' },
        { id: 'displacedMass', label: 'Displaced Fluid Mass', value: rhoFluid * Vsub, formatted: (rhoFluid * Vsub).toFixed(2) + ' kg' }
      ],
      diagram: { rhoObj, rhoFluid, V, g, mass, weight, submergedFraction, buoyantForce, normalForce, status }
    };
  }

  function draw(canvas, calcResult) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const bgCol = isDark ? '#090d16' : '#fdfbf7';
    const tankCol = isDark ? '#334155' : '#cbd5e1';
    const waterCol = isDark ? 'rgba(14, 116, 144, 0.4)' : 'rgba(56, 189, 248, 0.32)';
    const textCol = isDark ? '#e2e8f0' : '#1e293b';

    ctx.fillStyle = bgCol;
    ctx.fillRect(0, 0, w, h);

    const tankLeft = 70;
    const tankRight = w - 70;
    const tankWidth = tankRight - tankLeft;
    const tankTop = 50;
    const tankBottom = h - 45;
    const waterLevelY = tankTop + 45;

    // Draw Fluid in Tank
    ctx.fillStyle = waterCol;
    ctx.fillRect(tankLeft, waterLevelY, tankWidth, tankBottom - waterLevelY);

    // Fluid surface line with wave effect
    ctx.strokeStyle = isDark ? '#38bdf8' : '#0284c7';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(tankLeft, waterLevelY);
    for (let x = tankLeft; x <= tankRight; x += 10) {
      const wave = Math.sin((x - tankLeft) * 0.1) * 2;
      ctx.lineTo(x, waterLevelY + wave);
    }
    ctx.stroke();

    // Draw Tank Boundaries (glass container)
    ctx.strokeStyle = tankCol;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(tankLeft, tankTop);
    ctx.lineTo(tankLeft, tankBottom);
    ctx.lineTo(tankRight, tankBottom);
    ctx.lineTo(tankRight, tankTop);
    ctx.stroke();

    // Tank tick marks (graduations)
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 1.2;
    for (let y = tankBottom; y >= waterLevelY; y -= 28) {
      ctx.beginPath();
      ctx.moveTo(tankLeft, y);
      ctx.lineTo(tankLeft + 10, y);
      ctx.stroke();
    }

    // Object Dimensions
    const blockW = 85;
    const blockH = 85;
    const subFraction = calcResult.diagram.submergedFraction;
    const rhoObj = calcResult.diagram.rhoObj;
    const rhoFluid = calcResult.diagram.rhoFluid;

    let blockTopY = 0;
    if (rhoObj > rhoFluid) {
      // Sunk to bottom
      blockTopY = tankBottom - blockH;
    } else {
      // Floating with fraction submerged below waterLevelY
      blockTopY = waterLevelY - blockH * (1 - subFraction);
    }
    const blockLeftX = (tankLeft + tankRight) / 2 - blockW / 2;

    // Draw Submerged Block
    let blockFill = isDark ? '#d97706' : '#b45309';
    if (rhoObj > 1000) {
      blockFill = isDark ? '#64748b' : '#475569';
    } else if (rhoObj < 500) {
      blockFill = isDark ? '#ca8a04' : '#eab308';
    }

    ctx.fillStyle = blockFill;
    ctx.fillRect(blockLeftX, blockTopY, blockW, blockH);
    ctx.strokeStyle = isDark ? '#ffffff' : '#1e293b';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(blockLeftX, blockTopY, blockW, blockH);

    // Object Label
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(rhoObj + ' kg/m³', blockLeftX + blockW / 2, blockTopY + blockH / 2 - 4);
    ctx.font = '10px Inter, sans-serif';
    ctx.fillText(calcResult.diagram.mass.toFixed(1) + ' kg', blockLeftX + blockW / 2, blockTopY + blockH / 2 + 10);

    // Vector Arrows:
    const centerX = blockLeftX + blockW / 2;
    const centerY = blockTopY + blockH / 2;

    // Downward Weight Vector (Red)
    const W = calcResult.diagram.weight;
    const wLen = Math.min(W * 0.75, 65);
    drawVectorArrow(ctx, centerX, centerY, centerX, centerY + wLen, '#ef4444', 'W = ' + W.toFixed(1) + 'N', true);

    // Upward Buoyancy Vector (Green)
    const Fb = calcResult.diagram.buoyantForce;
    const fbLen = Math.min(Fb * 0.75, 65);
    drawVectorArrow(ctx, centerX, centerY, centerX, centerY - fbLen, '#10b981', 'F_b = ' + Fb.toFixed(1) + 'N', false);

    // Fluid label
    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.fillStyle = isDark ? '#38bdf8' : '#0369a1';
    ctx.textAlign = 'left';
    ctx.fillText('Fluid: ' + rhoFluid + ' kg/m³', tankLeft + 15, tankBottom - 14);

    // Status Badge
    ctx.font = 'bold 12px Inter, sans-serif';
    ctx.fillStyle = textCol;
    ctx.textAlign = 'center';
    ctx.fillText(calcResult.diagram.status, w / 2, 28);
  }

  function drawVectorArrow(ctx, x1, y1, x2, y2, color, label, isDown) {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    const head = 7;
    ctx.beginPath();
    if (isDown) {
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - head * 0.6, y2 - head);
      ctx.lineTo(x2 + head * 0.6, y2 - head);
    } else {
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - head * 0.6, y2 + head);
      ctx.lineTo(x2 + head * 0.6, y2 + head);
    }
    ctx.closePath();
    ctx.fill();

    ctx.font = 'bold 10px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(label, x2 + 10, isDown ? y2 : y2 + 8);
  }

  return {
    modelId: 'buoyancy',
    type: 'PHYSICS',
    defaultConfig: DEFAULT_CONFIG,
    compute,
    draw
  };
}));
