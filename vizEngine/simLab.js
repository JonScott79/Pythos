/**
 * simLab.js
 *
 * Classical Physics & Mathematics Simulation Laboratory (PhET-style Interactive Lab)
 * Provides an interactive shelf and live mounting workbench for all 17 Pythos STEM instruments.
 */

(function () {
  'use strict';

  const SIM_LAB_CATALOG = [
    // -------------------------------------------------------------
    // Physics & Mechanics (10 Models)
    // -------------------------------------------------------------
    {
      id: 'projectile',
      title: 'Classical Projectile Motion',
      category: 'physics',
      badge: 'Kinematics',
      icon: '🏹',
      formula: 'v_0, \\theta, g \\implies y(x)',
      plainFormula: 'v0, θ, g → y(x)',
      desc: 'Parabolic ballistics under gravity with real-time apex tracking, ground range, and velocity vectors.',
      defaultPrompt: "I'm experimenting with the Classical Projectile Motion simulation in the Sim Lab. Can you guide me through how the launch angle and initial velocity affect the flight time and maximum range?"
    },
    {
      id: 'newtons_laws',
      title: "Newton's Second Law & Incline",
      category: 'physics',
      badge: 'Dynamics',
      icon: '⚖️',
      formula: 'F_{\\text{net}} = m \\cdot a',
      plainFormula: 'F_net = m · a',
      desc: 'Inclined plane dynamics with adjustable mass, applied force, gravity, and kinetic friction.',
      defaultPrompt: "I'm testing Newton's Second Law on an inclined plane in the Sim Lab. How do friction and the ramp angle change the net acceleration of the mass?"
    },
    {
      id: 'hookes_law',
      title: "Hooke's Law & Oscillations",
      category: 'physics',
      badge: 'Elasticity',
      icon: '🪢',
      formula: 'F = -k \\cdot x, \\quad U = \\frac{1}{2}kx^2',
      plainFormula: 'F = -kx, U = ½kx²',
      desc: 'Restoring spring forces, harmonic frequency, and elastic potential energy scaling.',
      defaultPrompt: "I'm exploring Hooke's Law and spring oscillations in the Sim Lab. Can you explain why the restoring force opposes displacement and how energy trades off?"
    },
    {
      id: 'pendulum',
      title: 'Simple Harmonic Pendulum',
      category: 'physics',
      badge: 'Periodic Motion',
      icon: '⏱️',
      formula: 'T \\approx 2\\pi\\sqrt{L/g}',
      plainFormula: 'T ≈ 2π√(L/g)',
      desc: 'Periodic pendulum motion with large-angle Borda correction, restoring torque, and velocity.',
      defaultPrompt: "I'm analyzing the Simple Pendulum simulation in the Sim Lab. Why does the period depend strongly on length and gravity, but not on the mass of the bob?"
    },
    {
      id: 'energy_transfer',
      title: 'Conservation of Energy',
      category: 'physics',
      badge: 'Energy',
      icon: '🔋',
      formula: 'PE + KE = E_{\\text{total}}',
      plainFormula: 'PE + KE = E_total',
      desc: 'Mechanical energy conservation trading gravitational potential energy for kinetic velocity.',
      defaultPrompt: "I'm looking at the Conservation of Energy simulation in the Sim Lab. Can you help me derive the object's speed at any given height?"
    },
    {
      id: 'momentum',
      title: 'Momentum & 1D Collisions',
      category: 'physics',
      badge: 'Collisions',
      icon: '💥',
      formula: 'm_1 v_1 + m_2 v_2 = p_{\\text{total}}',
      plainFormula: 'm1·v1 + m2·v2 = p_total',
      desc: 'Elastic and inelastic collisions on a frictionless track comparing momentum and kinetic energy conservation.',
      defaultPrompt: "I'm testing 1D cart collisions in the Sim Lab. What is the fundamental difference in energy conservation between elastic and inelastic collisions?"
    },
    {
      id: 'waves',
      title: 'Wave Mechanics & Propagation',
      category: 'physics',
      badge: 'Waves',
      icon: '🌊',
      formula: 'v = f \\cdot \\lambda',
      plainFormula: 'v = f · λ',
      desc: 'Harmonic wave propagation examining amplitude, frequency, wave speed, and wavelength.',
      defaultPrompt: "I'm playing with the Wave Mechanics simulation in the Sim Lab. How do frequency and wavelength interact to determine the wave's phase velocity?"
    },
    {
      id: 'optics',
      title: "Snell's Law & Refraction",
      category: 'physics',
      badge: 'Optics',
      icon: '🔦',
      formula: 'n_1 \\sin\\theta_1 = n_2 \\sin\\theta_2',
      plainFormula: 'n1·sin(θ1) = n2·sin(θ2)',
      desc: 'Light refraction across planar media boundaries, critical angles, and Total Internal Reflection (TIR).',
      defaultPrompt: "I'm working with Snell's Law and Refraction in the Sim Lab. Can you guide me through calculating the critical angle for Total Internal Reflection?"
    },
    {
      id: 'buoyancy',
      title: "Archimedes' Buoyancy & Upthrust",
      category: 'physics',
      badge: 'Fluids',
      icon: '🚢',
      formula: 'F_b = \\rho_{\\text{fluid}} \\cdot V_{\\text{sub}} \\cdot g',
      plainFormula: 'Fb = ρ · V_sub · g',
      desc: 'Hydrostatic upthrust, fluid displacement, density ratios, and sinking vs. floating equilibrium.',
      defaultPrompt: "I'm experimenting with Archimedes' Buoyancy principle in the Sim Lab. How does the ratio of object density to fluid density determine the submerged percentage?"
    },
    {
      id: 'circuits',
      title: "Ohm's Law & DC Circuits",
      category: 'physics',
      badge: 'Electricity',
      icon: '⚡',
      formula: 'V = I \\cdot R, \\quad P = V \\cdot I',
      plainFormula: 'V = I · R, P = V · I',
      desc: 'Direct current resistor circuit loop with live current flow animation and power dissipation.',
      defaultPrompt: "I'm testing Ohm's Law and DC circuits in the Sim Lab. How does changing resistance affect the circuit current and power dissipation?"
    },

    // -------------------------------------------------------------
    // Chemistry & Thermodynamics (1 Model)
    // -------------------------------------------------------------
    {
      id: 'gas_laws',
      title: 'Ideal Gas Law & Piston',
      category: 'chemistry',
      badge: 'Thermodynamics',
      icon: '💨',
      formula: 'P \\cdot V = n \\cdot R \\cdot T',
      plainFormula: 'PV = nRT',
      desc: 'Gas state variables in a thermal piston chamber demonstrating Boyle’s, Charles’s, and Avogadro’s relationships.',
      defaultPrompt: "I'm investigating the Ideal Gas Law piston in the Sim Lab. How do pressure and temperature affect the equilibrium volume of the gas chamber?"
    },

    // -------------------------------------------------------------
    // Mathematics & Geometry (6 Models)
    // -------------------------------------------------------------
    {
      id: 'triangle',
      title: 'Pythagorean Right Triangle',
      category: 'math',
      badge: 'Geometry',
      icon: '📐',
      formula: 'a^2 + b^2 = c^2',
      plainFormula: 'a² + b² = c²',
      desc: 'Dynamic right triangle geometry with scalable legs, hypotenuse derivation, and acute angle calculations.',
      defaultPrompt: "I'm exploring the Right Triangle geometry instrument in the Sim Lab. Can you show me how the Pythagorean theorem and trigonometry connect?"
    },
    {
      id: 'circle',
      title: 'Circle & Sector Dynamics',
      category: 'math',
      badge: 'Geometry',
      icon: '⭕',
      formula: 'A = \\pi r^2, \\quad s = r\\theta',
      plainFormula: 'A = πr², s = rθ',
      desc: 'Circle properties with radius adjustment, highlighted sector slices, perimeter arc lengths, and area.',
      defaultPrompt: "I'm using the Circle and Sector Dynamics instrument in the Sim Lab. How are arc length and sector area derived from radians?"
    },
    {
      id: 'trigonometry',
      title: 'Pythagorean Unit Circle',
      category: 'math',
      badge: 'Trigonometry',
      icon: '🔄',
      formula: '\\sin^2\\theta + \\cos^2\\theta = 1',
      plainFormula: 'sin²θ + cos²θ = 1',
      desc: 'Interactive unit circle coordinate plane with rotating radius vector and real-time sin, cos, tan projections.',
      defaultPrompt: "I'm studying the Unit Circle instrument in the Sim Lab. Can you explain why sin and cos represent the coordinates on the unit circle across all 4 quadrants?"
    },
    {
      id: 'calculus_derivatives',
      title: 'Differential Calculus & Tangents',
      category: 'math',
      badge: 'Calculus',
      icon: '📈',
      formula: "f'(x) = \\lim_{\\Delta x \\to 0} \\frac{\\Delta y}{\\Delta x}",
      plainFormula: "f'(x) = lim(Δy/Δx)",
      desc: 'Secant slope converging to the instantaneous tangent slope to build geometric intuition for derivatives.',
      defaultPrompt: "I'm experimenting with the Differential Calculus Tangent instrument in the Sim Lab. How does shrinking Δx illustrate the limit definition of the derivative?"
    },
    {
      id: 'normal_distribution',
      title: 'Gaussian Normal Distribution',
      category: 'math',
      badge: 'Statistics',
      icon: '📊',
      formula: 'Z = \\frac{X - \\mu}{\\sigma}',
      plainFormula: 'Z = (X - μ) / σ',
      desc: 'Bell curve probability density with 68-95-99.7% empirical standard deviation intervals and shaded Z-scores.',
      defaultPrompt: "I'm examining the Normal Distribution bell curve in the Sim Lab. How do mean and standard deviation shape the distribution and determine percentile rank?"
    },
    {
      id: 'exponential_growth',
      title: 'Exponential Dynamics',
      category: 'math',
      badge: 'Algebra',
      icon: '📉',
      formula: 'P(t) = P_0(1 + r)^t',
      plainFormula: 'P(t) = P0(1 + r)^t',
      desc: 'Continuous compound growth, decay curves, doubling time, and radioactive half-life modeling.',
      defaultPrompt: "I'm investigating Exponential Dynamics in the Sim Lab. Can you walk me through the difference between linear and exponential rates of change?"
    }
  ];

  let currentCategory = 'all';
  let searchQuery = '';
  let activeSimulation = null;

  function initSimLab() {
    const overlay = document.getElementById('simLabOverlay');
    const toggleBtn = document.getElementById('toolSimLabBtn');
    const closeBtn = document.getElementById('simLabCloseBtn');
    const backBtn = document.getElementById('simLabBackBtn');
    const askBtn = document.getElementById('simLabAskBtn');
    const searchInput = document.getElementById('simLabSearchInput');
    const tabs = document.querySelectorAll('.sim-tab');

    if (!overlay) return;

    // Toggle button in toolbox
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        openSimLab();
      });
    }

    // Close button
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        closeSimLab();
      });
    }

    // Overlay backdrop click to close
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        closeSimLab();
      }
    });

    // Escape key handling
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && overlay.classList.contains('visible')) {
        if (activeSimulation) {
          showShelfView();
        } else {
          closeSimLab();
        }
      }
    });

    // Category Tabs
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        tabs.forEach((t) => {
          t.classList.remove('active');
          t.setAttribute('aria-selected', 'false');
        });
        tab.classList.add('active');
        tab.setAttribute('aria-selected', 'true');
        currentCategory = tab.getAttribute('data-cat') || 'all';
        renderCatalog();
      });
    });

    // Search Input
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        searchQuery = (e.target.value || '').trim().toLowerCase();
        renderCatalog();
      });
    }

    // Back to All Sims Button
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        showShelfView();
      });
    }

    // Ask Pythos Button
    if (askBtn) {
      askBtn.addEventListener('click', () => {
        handleAskPythos();
      });
    }

    // Initial render of shelf cards
    renderCatalog();
  }

  function openSimLab(modelId) {
    const overlay = document.getElementById('simLabOverlay');
    const toggleBtn = document.getElementById('toolSimLabBtn');
    if (!overlay) return;

    overlay.classList.add('visible');
    if (toggleBtn) toggleBtn.classList.add('active');

    if (modelId) {
      launchSimulation(modelId);
    } else {
      showShelfView();
    }
  }

  function closeSimLab() {
    const overlay = document.getElementById('simLabOverlay');
    const toggleBtn = document.getElementById('toolSimLabBtn');
    if (!overlay) return;

    overlay.classList.remove('visible');
    if (toggleBtn) toggleBtn.classList.remove('active');
  }

  function renderCatalog() {
    const grid = document.getElementById('simLabGrid');
    if (!grid) return;

    grid.innerHTML = '';

    const filtered = SIM_LAB_CATALOG.filter((item) => {
      const matchesCat = currentCategory === 'all' || item.category === currentCategory;
      const matchesSearch =
        !searchQuery ||
        item.title.toLowerCase().includes(searchQuery) ||
        item.badge.toLowerCase().includes(searchQuery) ||
        item.desc.toLowerCase().includes(searchQuery) ||
        item.plainFormula.toLowerCase().includes(searchQuery) ||
        item.id.toLowerCase().includes(searchQuery);
      return matchesCat && matchesSearch;
    });

    if (filtered.length === 0) {
      grid.innerHTML = `
        <div class="sim-lab-empty">
          <div style="font-size: 2.2rem; margin-bottom: 8px;">🔍</div>
          <div style="font-weight: 600; font-size: 1rem; color: var(--text-main);">No simulations match your search</div>
          <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 4px;">Try searching for "pendulum", "optics", "energy", "triangle", or select "All (17)".</div>
        </div>
      `;
      return;
    }

    filtered.forEach((item) => {
      const card = document.createElement('div');
      card.className = 'sim-lab-card';
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-label', 'Launch ' + item.title + ' simulation');

      card.innerHTML = `
        <div class="sim-card-top">
          <div class="sim-card-avatar">${item.icon}</div>
          <span class="sim-card-badge ${item.category}">${item.badge}</span>
        </div>
        <h4 class="sim-card-title">${item.title}</h4>
        <p class="sim-card-desc">${item.desc}</p>
        <div class="sim-card-footer">
          <span class="sim-card-formula">${item.plainFormula}</span>
          <button class="sim-card-launch-btn" tabindex="-1">
            <span>Launch</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
          </button>
        </div>
      `;

      const launch = () => launchSimulation(item.id);
      card.addEventListener('click', launch);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          launch();
        }
      });

      grid.appendChild(card);
    });
  }

  function launchSimulation(modelId) {
    const shelfView = document.getElementById('simLabShelfView');
    const activeView = document.getElementById('simLabActiveView');
    const mount = document.getElementById('simLabInstrumentMount');
    const titleEl = document.getElementById('simLabActiveTitle');

    const item = SIM_LAB_CATALOG.find((s) => s.id === modelId);
    if (!item) return;

    activeSimulation = item;

    if (shelfView) { shelfView.style.setProperty('display', 'none', 'important'); }
    if (activeView) { activeView.style.setProperty('display', 'flex', 'important'); }
    if (titleEl) {
      titleEl.innerHTML = `
        <span class="sim-lab-active-icon">${item.icon}</span>
        <span>${item.title}</span>
        <span class="sim-card-badge ${item.category}" style="margin-left: 8px;">${item.badge}</span>
      `;
    }

    if (!mount) return;
    mount.innerHTML = '';

    const renderer = window.PythosVizRenderer;
    if (!renderer) {
      mount.innerHTML = '<div class="viz-render-fail">Visualization engine loading... please wait.</div>';
      return;
    }

    const modelDef = typeof renderer.getModel === 'function' ? renderer.getModel(modelId) : null;
    if (!modelDef || !modelDef.defaultConfig) {
      mount.innerHTML = `<div class="viz-render-fail">Model "${modelId}" definition not found.</div>`;
      return;
    }

    const spec = {
      type: modelDef.type || 'PHYSICS',
      model: modelDef.modelId,
      title: modelDef.defaultConfig.title,
      subtitle: modelDef.defaultConfig.subtitle,
      description: modelDef.defaultConfig.description,
      variables: JSON.parse(JSON.stringify(modelDef.defaultConfig.variables))
    };

    renderer.renderInstrument(mount, spec);
  }

  function showShelfView() {
    activeSimulation = null;
    const shelfView = document.getElementById('simLabShelfView');
    const activeView = document.getElementById('simLabActiveView');
    const mount = document.getElementById('simLabInstrumentMount');

    if (activeView) { activeView.style.setProperty('display', 'none', 'important'); }
    if (shelfView) { shelfView.style.setProperty('display', 'flex', 'important'); }
    if (mount) mount.innerHTML = '';
  }

  function handleAskPythos() {
    if (!activeSimulation) return;

    const input = document.getElementById('userInput');
    const mount = document.getElementById('simLabInstrumentMount');
    let promptText = activeSimulation.defaultPrompt;
    const stateParts = [];
    const metricsParts = [];

    if (mount) {

      // Priority 1: Direct reactive state attached to container
      const instState = mount.__pythosInstrumentState;
      if (instState && instState.state && instState.spec && instState.spec.variables) {
        for (const [key, val] of Object.entries(instState.state)) {
          const varDef = instState.spec.variables[key];
          const label = varDef && varDef.label ? varDef.label : key;
          const unit = varDef && varDef.unit ? ` ${varDef.unit}` : '';
          stateParts.push(`${label} = ${val}${unit}`);
        }
        if (instState.calcResult && Array.isArray(instState.calcResult.metrics)) {
          for (const m of instState.calcResult.metrics) {
            if (m.label && m.formatted) {
              metricsParts.push(`${m.label}: ${m.formatted}`);
            }
          }
        }
      } else {
        // Priority 2: Fallback extraction from DOM elements
        const sliderGroups = mount.querySelectorAll('.pythos-slider-group');
        sliderGroups.forEach(group => {
          const name = group.querySelector('.pythos-slider-name')?.textContent?.trim();
          const badge = group.querySelector('.pythos-slider-val-badge')?.textContent?.trim();
          if (name && badge) stateParts.push(`${name} = ${badge}`);
        });
        const metricCards = mount.querySelectorAll('.pythos-metric-card');
        metricCards.forEach(card => {
          const lbl = card.querySelector('.pythos-metric-label')?.textContent?.trim();
          const val = card.querySelector('.pythos-metric-value')?.textContent?.trim();
          if (lbl && val) metricsParts.push(`${lbl}: ${val}`);
        });
      }

      if (stateParts.length > 0 || metricsParts.length > 0) {
        let contextSummary = `[SIMULATION STATE - ${activeSimulation.title}]`;
        if (stateParts.length > 0) {
          contextSummary += `\n• Live Settings: ${stateParts.join(', ')}`;
        }
        if (metricsParts.length > 0) {
          contextSummary += `\n• Calculated Values: ${metricsParts.join(', ')}`;
        }
        promptText = `${contextSummary}\n\n${activeSimulation.defaultPrompt}`;
      }
    }

    closeSimLab();

    const shortDetails = stateParts.length > 0 ? stateParts.join(', ') : (metricsParts.length > 0 ? metricsParts.join(', ') : '');
    const contextSummary = `[SIMULATION STATE - ${activeSimulation.title}]` +
      (stateParts.length > 0 ? `\n• Live Settings: ${stateParts.join(', ')}` : '') +
      (metricsParts.length > 0 ? `\n• Calculated Values: ${metricsParts.join(', ')}` : '');

    if (typeof window.attachSimulationToInput === 'function') {
      window.attachSimulationToInput({
        type: 'sim',
        title: activeSimulation.title,
        details: shortDetails,
        contextText: contextSummary,
        defaultPrompt: activeSimulation.defaultPrompt
      });
    } else if (input) {
      input.value = `${contextSummary}\n\n${activeSimulation.defaultPrompt}`;
      input.focus();
    }
  }

  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSimLab);
  } else {
    initSimLab();
  }

  // Export to window
  if (typeof window !== 'undefined') {
    window.PythosSimLab = {
      open: openSimLab,
      close: closeSimLab,
      launch: launchSimulation,
      catalog: SIM_LAB_CATALOG
    };
  }
})();
