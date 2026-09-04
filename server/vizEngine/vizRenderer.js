/**
 * vizRenderer.js
 *
 * Classical Presentation Layer & Interactive UI Component Builder for Pythos.
 *
 * Visual Aesthetics:
 * - Ancient Greek / classical mathematical instrument presentation
 * - Aegean blue accents, bronze indicators, marble/parchment surfaces
 * - Cinzel headings, Greek-styled subtitles, etched metric tablets
 * - Custom classical styled range sliders with live value feedback
 * - Canvas coordinate rendering with classical gridlines and trajectory styling
 * - Reset and interactive control mechanisms
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PythosVizRenderer = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  const models = {};

  function registerModel(modelDef) {
    if (modelDef && modelDef.modelId) {
      models[modelDef.modelId.toLowerCase()] = modelDef;
    }
  }

  // Auto-register models if loaded in global/window scope
  if (typeof window !== 'undefined') {
    if (window.PythosProjectileModel) registerModel(window.PythosProjectileModel);
    if (window.PythosNewtonsLawsModel) registerModel(window.PythosNewtonsLawsModel);
    if (window.PythosEnergyTransferModel) registerModel(window.PythosEnergyTransferModel);
    if (window.PythosMomentumModel) registerModel(window.PythosMomentumModel);
    if (window.PythosHookesLawModel) registerModel(window.PythosHookesLawModel);
    if (window.PythosWavesModel) registerModel(window.PythosWavesModel);
    if (window.PythosCircuitsModel) registerModel(window.PythosCircuitsModel);
    if (window.PythosTrigonometryModel) registerModel(window.PythosTrigonometryModel);
    if (window.PythosCalculusModel) registerModel(window.PythosCalculusModel);
  }

  /**
   * Mounts an interactive visualization instrument into a target DOM container.
   * @param {HTMLElement} container - The wrapper element
   * @param {Object} spec - Validated visualization spec
   */
  function renderInstrument(container, spec) {
    if (!container || !spec) return false;

    const modelDef = models[spec.model.toLowerCase()];
    if (!modelDef) {
      container.innerHTML = `<div class="viz-render-fail">Unknown visualization model: ${spec.model}</div>`;
      return false;
    }

    // Local reactive state
    const state = {};
    for (const [k, v] of Object.entries(spec.variables)) {
      state[k] = v.value;
    }

    // Build Instrument Shell
    container.innerHTML = "";
    container.className = "pythos-viz-instrument";

    // 1. Classical Header
    const header = document.createElement("div");
    header.className = "pythos-viz-header";
    header.innerHTML = `
      <div class="pythos-viz-title-group">
        <div class="pythos-viz-tag">MATHEMATICAL INSTRUMENT &bull; ${spec.type}</div>
        <h3 class="pythos-viz-title">${spec.title}</h3>
        ${spec.subtitle ? `<div class="pythos-viz-subtitle">${spec.subtitle}</div>` : ""}
      </div>
      <button class="pythos-viz-reset-btn" title="Reset variables to initial state" aria-label="Reset Model">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
          <path d="M3 3v5h5"></path>
        </svg>
        <span>Reset</span>
      </button>
    `;
    container.appendChild(header);

    // 2. Canvas Stage Container
    const stageWrap = document.createElement("div");
    stageWrap.className = "pythos-viz-stage-wrap";

    const canvas = document.createElement("canvas");
    canvas.className = "pythos-viz-canvas";
    canvas.width = 640;
    canvas.height = 300;
    stageWrap.appendChild(canvas);
    container.appendChild(stageWrap);

    // 3. Metric Tablets / Readout Row
    const metricsRow = document.createElement("div");
    metricsRow.className = "pythos-viz-metrics-row";
    container.appendChild(metricsRow);

    // 4. Interactive Sliders / Controls Panel
    const controlsPanel = document.createElement("div");
    controlsPanel.className = "pythos-viz-controls-panel";
    container.appendChild(controlsPanel);

    // Draw onto canvas
    function drawCanvas(calcResult) {
      // If the model provides its own dedicated classical renderer, delegate to it!
      if (typeof modelDef.draw === "function") {
        modelDef.draw(canvas, calcResult);
        return;
      }

      const ctx = canvas.getContext("2d");
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const isDark = document.documentElement.getAttribute("data-theme") === "dark";
      const bgCol = isDark ? "#090d16" : "#fdfbf7";
      const gridCol = isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.06)";
      const axisCol = isDark ? "#334155" : "#cbd5e1";
      const groundCol = isDark ? "#1e293b" : "#e2e8f0";
      const trajCol = isDark ? "#38bdf8" : "#2a728f"; // Aegean Blue
      const trajGlow = isDark ? "rgba(56, 189, 248, 0.18)" : "rgba(42, 114, 143, 0.12)";
      const apexCol = isDark ? "#fb923c" : "#ea580c"; // Classical Terracotta / Orange
      const textCol = isDark ? "#94a3b8" : "#64748b";

      // Background
      ctx.fillStyle = bgCol;
      ctx.fillRect(0, 0, w, h);

      // Coordinate Scaling
      const padLeft = 55;
      const padRight = 35;
      const padTop = 30;
      const padBottom = 45;
      const plotW = w - padLeft - padRight;
      const plotH = h - padTop - padBottom;

      const maxX = calcResult.bounds.maxX;
      const maxY = calcResult.bounds.maxY;

      const toCanvasX = (x) => padLeft + (x / maxX) * plotW;
      const toCanvasY = (y) => padTop + plotH - (y / maxY) * plotH;

      // Draw Classical Grid
      ctx.strokeStyle = gridCol;
      ctx.lineWidth = 1;
      const xSteps = 5;
      for (let i = 1; i <= xSteps; i++) {
        const xVal = (maxX / xSteps) * i;
        const cx = toCanvasX(xVal);
        ctx.beginPath();
        ctx.moveTo(cx, padTop);
        ctx.lineTo(cx, padTop + plotH);
        ctx.stroke();

        ctx.fillStyle = textCol;
        ctx.font = "10px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(xVal.toFixed(0) + "m", cx, padTop + plotH + 15);
      }

      const ySteps = 4;
      for (let i = 1; i <= ySteps; i++) {
        const yVal = (maxY / ySteps) * i;
        const cy = toCanvasY(yVal);
        ctx.beginPath();
        ctx.moveTo(padLeft, cy);
        ctx.lineTo(padLeft + plotW, cy);
        ctx.stroke();

        ctx.fillStyle = textCol;
        ctx.font = "10px Inter, sans-serif";
        ctx.textAlign = "right";
        ctx.fillText(yVal.toFixed(0) + "m", padLeft - 8, cy + 3);
      }

      // Ground plane
      ctx.fillStyle = groundCol;
      ctx.fillRect(padLeft, padTop + plotH, plotW, 4);

      // Axes
      ctx.strokeStyle = axisCol;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(padLeft, padTop);
      ctx.lineTo(padLeft, padTop + plotH);
      ctx.lineTo(padLeft + plotW, padTop + plotH);
      ctx.stroke();

      // Parabolic Trajectory
      if (calcResult.points && calcResult.points.length > 1) {
        // Shaded trajectory area
        ctx.beginPath();
        ctx.moveTo(toCanvasX(0), toCanvasY(0));
        for (const pt of calcResult.points) {
          ctx.lineTo(toCanvasX(pt.x), toCanvasY(pt.y));
        }
        ctx.lineTo(toCanvasX(calcResult.points[calcResult.points.length - 1].x), toCanvasY(0));
        ctx.closePath();
        ctx.fillStyle = trajGlow;
        ctx.fill();

        // Parabola stroke line
        ctx.beginPath();
        ctx.moveTo(toCanvasX(calcResult.points[0].x), toCanvasY(calcResult.points[0].y));
        for (let i = 1; i < calcResult.points.length; i++) {
          ctx.lineTo(toCanvasX(calcResult.points[i].x), toCanvasY(calcResult.points[i].y));
        }
        ctx.strokeStyle = trajCol;
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }

      // Draw Apex Point
      const maxHeightMetric = calcResult.metrics.find(m => m.id === 'maxHeight');
      const rangeMetric = calcResult.metrics.find(m => m.id === 'range');
      if (maxHeightMetric && rangeMetric) {
        const apexX = toCanvasX(rangeMetric.value / 2);
        const apexY = toCanvasY(maxHeightMetric.value);

        // Dashed drop lines to axes
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = isDark ? "rgba(251, 146, 60, 0.4)" : "rgba(234, 88, 12, 0.4)";
        ctx.beginPath();
        ctx.moveTo(apexX, apexY);
        ctx.lineTo(apexX, toCanvasY(0));
        ctx.moveTo(apexX, apexY);
        ctx.lineTo(padLeft, apexY);
        ctx.stroke();
        ctx.setLineDash([]);

        // Apex marker
        ctx.fillStyle = apexCol;
        ctx.beginPath();
        ctx.arc(apexX, apexY, 4.5, 0, 2 * Math.PI);
        ctx.fill();

        ctx.fillStyle = apexCol;
        ctx.font = "bold 11px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`Apex: ${maxHeightMetric.formatted}`, apexX, apexY - 10);
      }

      // Draw Launch Velocity Vector
      if (calcResult.vectors && calcResult.vectors.launch) {
        const lv = calcResult.vectors.launch;
        const startX = toCanvasX(0);
        const startY = toCanvasY(0);
        const vecScale = 1.2;
        const endX = startX + lv.vx * vecScale;
        const endY = startY - lv.vy * vecScale;

        ctx.strokeStyle = trajCol;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();

        // Arrowhead
        const angle = Math.atan2(-(endY - startY), endX - startX);
        const headLen = 7;
        ctx.fillStyle = trajCol;
        ctx.beginPath();
        ctx.moveTo(endX, endY);
        ctx.lineTo(endX - headLen * Math.cos(angle - Math.PI / 6), endY + headLen * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(endX - headLen * Math.cos(angle + Math.PI / 6), endY + headLen * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();
      }

      // Origin Point
      ctx.fillStyle = trajCol;
      ctx.beginPath();
      ctx.arc(toCanvasX(0), toCanvasY(0), 4, 0, 2 * Math.PI);
      ctx.fill();
    }

    // Update readouts and sliders
    function updateMetrics(calcResult) {
      metricsRow.innerHTML = "";
      calcResult.metrics.forEach(m => {
        const card = document.createElement("div");
        card.className = "pythos-viz-metric-card";
        card.innerHTML = `
          <div class="pythos-metric-label">${m.label}</div>
          <div class="pythos-metric-value">${m.formatted}</div>
        `;
        metricsRow.appendChild(card);
      });
    }

    // Build controls
    function buildControls() {
      controlsPanel.innerHTML = "";
      for (const [key, v] of Object.entries(spec.variables)) {
        const group = document.createElement("div");
        group.className = "pythos-slider-group";

        const labelRow = document.createElement("div");
        labelRow.className = "pythos-slider-label-row";
        labelRow.innerHTML = `
          <span class="pythos-slider-name">${v.label}</span>
          <span class="pythos-slider-val-badge" id="badge-${key}">${state[key]} ${v.unit}</span>
        `;

        const slider = document.createElement("input");
        slider.type = "range";
        slider.className = "pythos-classical-slider";
        slider.min = v.min;
        slider.max = v.max;
        slider.step = v.step;
        slider.value = state[key];

        slider.addEventListener("input", (e) => {
          const val = Number(e.target.value);
          state[key] = val;
          const badge = group.querySelector(`#badge-${key}`);
          if (badge) badge.textContent = `${val} ${v.unit}`;

          // Live local update
          const newCalc = modelDef.compute(state);
          drawCanvas(newCalc);
          updateMetrics(newCalc);
        });

        group.appendChild(labelRow);
        group.appendChild(slider);
        controlsPanel.appendChild(group);
      }
    }

    // Reset handler
    const resetBtn = header.querySelector(".pythos-viz-reset-btn");
    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        for (const [k, v] of Object.entries(spec.variables)) {
          state[k] = v.default;
        }
        buildControls();
        const initialCalc = modelDef.compute(state);
        drawCanvas(initialCalc);
        updateMetrics(initialCalc);
      });
    }

    // Initial render
    buildControls();
    const initialCalc = modelDef.compute(state);
    drawCanvas(initialCalc);
    updateMetrics(initialCalc);

    return true;
  }

  return {
    registerModel,
    renderInstrument
  };
}));
