/**
 * projectile.js
 *
 * Physics Model: Projectile Motion under Uniform Gravity (2D Kinematics)
 * Completely style-independent mathematical model.
 *
 * Implements:
 * - Trajectory calculation (x(t), y(t))
 * - Flight Time (T)
 * - Maximum Height (H)
 * - Horizontal Range (R)
 * - Initial velocity components (v0x, v0y)
 * - Vertex coordinates (x_peak, y_peak)
 * - Velocity vectors at launch and vertex
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PythosProjectileModel = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  const DEFAULT_CONFIG = {
    title: 'Kinematics: Classical Projectile Motion',
    subtitle: 'BALLISTICS & PARABOLIC TRAJECTORIES (ΒΛΗΜΑ)',
    description: 'An object launched with initial velocity v₀ at angle θ under uniform gravitational acceleration g.',
    variables: {
      velocity: {
        label: 'Initial Speed (v₀)',
        value: 25,
        default: 25,
        min: 1,
        max: 60,
        step: 1,
        unit: 'm/s'
      },
      angle: {
        label: 'Launch Angle (θ)',
        value: 45,
        default: 45,
        min: 5,
        max: 85,
        step: 1,
        unit: '°'
      },
      gravity: {
        label: 'Gravity (g)',
        value: 9.8,
        default: 9.8,
        min: 1.6, // Moon gravity
        max: 24.8, // Jupiter gravity
        step: 0.1,
        unit: 'm/s²'
      }
    }
  };

  /**
   * Computes the kinematics of the projectile given numeric variable values.
   * @param {Object} vars - { velocity, angle, gravity }
   * @param {number} numPoints - number of points along the trajectory curve
   * @returns {Object} Calculated metrics and trajectory data points
   */
  function compute(vars, numPoints = 80) {
    const v0 = Number(vars.velocity !== undefined ? vars.velocity : DEFAULT_CONFIG.variables.velocity.value);
    const thetaDeg = Number(vars.angle !== undefined ? vars.angle : DEFAULT_CONFIG.variables.angle.value);
    const g = Number(vars.gravity !== undefined ? vars.gravity : DEFAULT_CONFIG.variables.gravity.value);

    const thetaRad = (thetaDeg * Math.PI) / 180;
    const cosTheta = Math.cos(thetaRad);
    const sinTheta = Math.sin(thetaRad);

    const v0x = v0 * cosTheta;
    const v0y = v0 * sinTheta;

    // Kinematic formulas
    // Time of flight: T = 2 * v0y / g
    const flightTime = (2 * v0y) / g;

    // Maximum height: H = (v0y)^2 / (2 * g)
    const maxHeight = (v0y * v0y) / (2 * g);

    // Range: R = v0x * T = (v0^2 * sin(2*theta)) / g
    const range = v0x * flightTime;

    // Vertex position
    const peakX = range / 2;
    const peakY = maxHeight;

    // Generate trajectory coordinates
    const points = [];
    for (let i = 0; i <= numPoints; i++) {
      const t = (flightTime * i) / numPoints;
      const x = v0x * t;
      const y = Math.max(0, v0y * t - 0.5 * g * t * t);
      points.push({ x, y, t });
    }

    // Velocity vectors at key points
    // Launch: (v0x, v0y)
    // Peak: (v0x, 0)
    const vectors = {
      launch: { x: 0, y: 0, vx: v0x, vy: v0y },
      peak: { x: peakX, y: peakY, vx: v0x, vy: 0 }
    };

    return {
      inputs: { velocity: v0, angle: thetaDeg, gravity: g },
      metrics: [
        { id: 'flightTime', label: 'Flight Time (T)', value: flightTime, unit: 's', formatted: flightTime.toFixed(2) + ' s' },
        { id: 'maxHeight', label: 'Max Height (H)', value: maxHeight, unit: 'm', formatted: maxHeight.toFixed(2) + ' m' },
        { id: 'range', label: 'Total Range (R)', value: range, unit: 'm', formatted: range.toFixed(2) + ' m' },
        { id: 'v0x', label: 'Horizontal Velocity (v₀ₓ)', value: v0x, unit: 'm/s', formatted: v0x.toFixed(2) + ' m/s' },
        { id: 'v0y', label: 'Vertical Velocity (v₀ᵧ)', value: v0y, unit: 'm/s', formatted: v0y.toFixed(2) + ' m/s' }
      ],
      bounds: {
        maxX: Math.max(range * 1.1, 10),
        maxY: Math.max(maxHeight * 1.25, 5)
      },
      points,
      vectors
    };
  }

  return {
    modelId: 'projectile',
    type: 'PHYSICS',
    defaultConfig: DEFAULT_CONFIG,
    compute
  };
}));
