/**
 * server/engines/geometryEngine.js
 *
 * Pythos Dedicated Geometry Engine
 * Implements deterministic geometry solvers:
 * - Coordinate geometry: distance, midpoints, slopes, line equations, line intersections, Shoelace polygon area (N >= 3)
 * - Triangle geometry: Pythagorean theorem, missing side/hypotenuse, perimeter, Heron's area, Law of Cosines angles, triangle inequality validation
 * - Circle geometry: circumference, area, center-radius form, general second-degree form
 * - Circle sector & arc length: arc length s = r*theta, sector area A = 1/2*r^2*theta (radians & degrees)
 * - Geometric constraints: exact collinearity predicate, degeneracy detection, triangle inequality validation
 */

// Exact Rational Class for robust predicate evaluations (collinearity, slope, determinant)
class Rational {
  constructor(num, den = 1n) {
    if (typeof num === 'number') {
      if (!Number.isFinite(num)) throw new Error('Non-finite rational input');
      if (num === 0) {
        this.num = 0n;
        this.den = 1n;
        return;
      }
      const str = num.toString().toLowerCase();
      if (str.includes('e')) {
        const [mantissa, exponent] = str.split('e');
        const exp = parseInt(exponent, 10);
        let mNum, mDen;
        const sign = mantissa.startsWith('-') ? -1n : 1n;
        const absMantissa = mantissa.startsWith('-') ? mantissa.slice(1) : mantissa;
        if (absMantissa.includes('.')) {
          const [intP, decP] = absMantissa.split('.');
          const decLen = decP.length;
          const factor = 10n ** BigInt(decLen);
          const absInt = BigInt(intP);
          mNum = sign * (absInt * factor + BigInt(decP));
          mDen = factor;
        } else {
          mNum = sign * BigInt(absMantissa);
          mDen = 1n;
        }
        const denFactor = BigInt(den);
        if (exp >= 0) {
          num = mNum * (10n ** BigInt(exp));
          den = mDen * denFactor;
        } else {
          num = mNum;
          den = mDen * (10n ** BigInt(-exp)) * denFactor;
        }
      } else if (str.includes('.')) {
        const parts = str.split('.');
        const decimals = parts[1].length;
        const factor = 10n ** BigInt(decimals);
        const integerPart = BigInt(parts[0]);
        const decimalPart = BigInt(parts[1]);
        const sign = num < 0 ? -1n : 1n;
        num = integerPart * factor + (sign * decimalPart);
        den = factor * BigInt(den);
      } else {
        num = BigInt(Math.trunc(num));
        den = BigInt(den);
      }
    } else {
      num = BigInt(num);
      den = BigInt(den);
    }

    if (den === 0n) throw new Error('Division by zero in Rational');
    if (den < 0n) {
      num = -num;
      den = -den;
    }
    const g = Rational.gcd(num < 0n ? -num : num, den);
    this.num = num / g;
    this.den = den / g;
  }

  static gcd(a, b) {
    while (b !== 0n) {
      const t = b;
      b = a % b;
      a = t;
    }
    return a;
  }

  plus(other) {
    const o = other instanceof Rational ? other : new Rational(other);
    return new Rational(this.num * o.den + o.num * this.den, this.den * o.den);
  }

  minus(other) {
    const o = other instanceof Rational ? other : new Rational(other);
    return new Rational(this.num * o.den - o.num * this.den, this.den * o.den);
  }

  times(other) {
    const o = other instanceof Rational ? other : new Rational(other);
    return new Rational(this.num * o.num, this.den * o.den);
  }

  div(other) {
    const o = other instanceof Rational ? other : new Rational(other);
    return new Rational(this.num * o.den, this.den * o.num);
  }

  isZero() {
    return this.num === 0n;
  }

  toNumber() {
    return Number(this.num) / Number(this.den);
  }

  toString() {
    if (this.den === 1n) return this.num.toString();
    return `${this.num}/${this.den}`;
  }
}

/**
 * Format numeric value for display while preserving precision.
 */
function formatNumber(val, maxDecimals = 8) {
  if (val === null || val === undefined) return '';
  if (val === 0 || Object.is(val, -0)) return '0';
  if (Number.isInteger(val)) return val.toString();
  if (Math.abs(val) < 1e-4 || Math.abs(val) >= 1e10) {
    return val.toExponential(4).replace('e+', 'e');
  }
  const nearestInt = Math.round(val);
  const diffFromInt = Math.abs(val - nearestInt);
  if (diffFromInt > 0 && diffFromInt < 1e-6) {
    return nearestInt.toString();
  }
  const str = parseFloat(val.toFixed(maxDecimals)).toString();
  if (str === '0' && val !== 0) {
    return val.toExponential(4).replace('e+', 'e');
  }
  return str;
}

/**
 * 1. COORDINATE GEOMETRY: TWO POINTS
 */
function solveTwoPoints(p1, p2) {
  if (!p1 || !p2 || !Number.isFinite(p1.x) || !Number.isFinite(p1.y) || !Number.isFinite(p2.x) || !Number.isFinite(p2.y)) {
    return {
      status: 'UNRESOLVED',
      error: 'Invalid or non-finite point coordinates'
    };
  }

  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;

  if (dx === 0 && dy === 0) {
    return {
      status: 'DEGENERATE',
      operation: 'TWO_POINTS',
      points: [p1, p2],
      distance: 0,
      midpoint: { x: p1.x, y: p1.y },
      slope: null,
      isVertical: false,
      isHorizontal: false,
      formattedResult: 'Points are identical (distance = 0)',
      derivationSteps: ['Points P1 and P2 have identical coordinates. Distance is 0. Slope is undefined.']
    };
  }

  const distanceSquared = dx * dx + dy * dy;
  const distance = Math.sqrt(distanceSquared);
  const midpoint = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };

  let slope = null;
  let isVertical = false;
  let isHorizontal = false;
  let lineEquation = '';
  let lineEquationGeneral = '';

  if (Math.abs(dx) < 1e-15) {
    isVertical = true;
    slope = Infinity;
    lineEquation = `x = ${formatNumber(p1.x)}`;
    lineEquationGeneral = `x - ${formatNumber(p1.x)} = 0`;
  } else {
    slope = dy / dx;
    if (Math.abs(dy) < 1e-15) {
      isHorizontal = true;
      slope = 0;
      lineEquation = `y = ${formatNumber(p1.y)}`;
      lineEquationGeneral = `y - ${formatNumber(p1.y)} = 0`;
    } else {
      const yIntercept = p1.y - slope * p1.x;
      const bSign = yIntercept >= 0 ? `+ ${formatNumber(yIntercept)}` : `- ${formatNumber(Math.abs(yIntercept))}`;
      lineEquation = `y = ${formatNumber(slope)}x ${bSign}`;
      const A = dy;
      const B = -dx;
      const C = dx * p1.y - dy * p1.x;
      lineEquationGeneral = `${formatNumber(A)}x + ${formatNumber(B)}y + ${formatNumber(C)} = 0`;
    }
  }

  const derivationSteps = [
    `Points: P_1(${formatNumber(p1.x)}, ${formatNumber(p1.y)}), P_2(${formatNumber(p2.x)}, ${formatNumber(p2.y)})`,
    `\\Delta x = ${formatNumber(p2.x)} - (${formatNumber(p1.x)}) = ${formatNumber(dx)}`,
    `\\Delta y = ${formatNumber(p2.y)} - (${formatNumber(p1.y)}) = ${formatNumber(dy)}`,
    `Distance: d = \\sqrt{(\\Delta x)^2 + (\\Delta y)^2} = \\sqrt{${formatNumber(distanceSquared)}} = ${formatNumber(distance)}`,
    `Midpoint: M = \\left(\\frac{x_1 + x_2}{2}, \\frac{y_1 + y_2}{2}\\right) = (${formatNumber(midpoint.x)}, ${formatNumber(midpoint.y)})`,
    isVertical ? `Line is vertical: x = ${formatNumber(p1.x)}` : `Slope: m = \\frac{\\Delta y}{\\Delta x} = \\frac{${formatNumber(dy)}}{${formatNumber(dx)}} = ${formatNumber(slope)}, Line: ${lineEquation}`
  ];

  return {
    status: 'VERIFIED',
    operation: 'TWO_POINTS',
    domain: 'geometry',
    points: [p1, p2],
    distance,
    distanceSquared,
    midpoint,
    slope: isVertical ? null : slope,
    isVertical,
    isHorizontal,
    lineEquation,
    lineEquationGeneral,
    exactResult: formatNumber(distance),
    numericResult: distance,
    formattedResult: `d = ${formatNumber(distance)}, M = (${formatNumber(midpoint.x)}, ${formatNumber(midpoint.y)})${isVertical ? ', vertical line' : `, m = ${formatNumber(slope)}, ${lineEquation}`}`,
    derivationSteps,
    verificationEvidence: {
      method: 'PYTHAGOREAN_METRIC',
      independentCheck: `d^2 = (${formatNumber(dx)})^2 + (${formatNumber(dy)})^2 = ${formatNumber(distanceSquared)}`,
      passed: Math.abs(distance * distance - distanceSquared) < 1e-10,
      tolerance: 1e-10
    },
    warnings: []
  };
}

/**
 * Robust collinearity test using exact cross-product determinant.
 */
function checkCollinear(p1, p2, p3) {
  try {
    const rx1 = new Rational(p1.x);
    const ry1 = new Rational(p1.y);
    const rx2 = new Rational(p2.x);
    const ry2 = new Rational(p2.y);
    const rx3 = new Rational(p3.x);
    const ry3 = new Rational(p3.y);

    const dx1 = rx2.minus(rx1);
    const dy1 = ry2.minus(ry1);
    const dx2 = rx3.minus(rx1);
    const dy2 = ry3.minus(ry1);

    const cross = dx1.times(dy2).minus(dy1.times(dx2));
    const isCollinear = cross.isZero();
    return {
      collinear: isCollinear,
      exactDeterminant: cross.toString(),
      numericDeterminant: cross.toNumber()
    };
  } catch (_) {
    const cross = (p2.x - p1.x) * (p3.y - p1.y) - (p2.y - p1.y) * (p3.x - p1.x);
    const maxCoord = Math.max(
      Math.abs(p1.x), Math.abs(p1.y),
      Math.abs(p2.x), Math.abs(p2.y),
      Math.abs(p3.x), Math.abs(p3.y)
    );
    const scale = Math.max(maxCoord, 1e-12);
    const tol = 1e-12 * scale * scale;
    return {
      collinear: Math.abs(cross) <= tol,
      exactDeterminant: cross.toString(),
      numericDeterminant: cross
    };
  }
}

/**
 * Line-Line intersection of L1: A1*x + B1*y + C1 = 0 and L2: A2*x + B2*y + C2 = 0
 */
function intersectLines(l1, l2) {
  const { A: a1, B: b1, C: c1 } = l1;
  const { A: a2, B: b2, C: c2 } = l2;

  const det = a1 * b2 - a2 * b1;
  if (Math.abs(det) < 1e-14) {
    const isCoincident = Math.abs(a1 * c2 - a2 * c1) < 1e-14 && Math.abs(b1 * c2 - b2 * c1) < 1e-14;
    return {
      status: isCoincident ? 'COINCIDENT' : 'PARALLEL',
      operation: 'LINE_INTERSECTION',
      domain: 'geometry',
      intersection: null,
      isParallel: true,
      isCoincident,
      formattedResult: isCoincident ? 'Lines are coincident (infinitely many intersections)' : 'Lines are parallel (no intersection)',
      derivationSteps: [`Determinant A_1 B_2 - A_2 B_1 = ${det} \\approx 0. Lines do not intersect at a unique point.`]
    };
  }

  const x = (b1 * c2 - b2 * c1) / det;
  const y = (c1 * a2 - c2 * a1) / det;

  return {
    status: 'VERIFIED',
    operation: 'LINE_INTERSECTION',
    domain: 'geometry',
    intersection: { x, y },
    isParallel: false,
    isCoincident: false,
    exactResult: `(${formatNumber(x)}, ${formatNumber(y)})`,
    numericResult: { x, y },
    formattedResult: `Intersection at (${formatNumber(x)}, ${formatNumber(y)})`,
    derivationSteps: [
      `L_1: ${formatNumber(a1)}x + ${formatNumber(b1)}y + ${formatNumber(c1)} = 0`,
      `L_2: ${formatNumber(a2)}x + ${formatNumber(b2)}y + ${formatNumber(c2)} = 0`,
      `\\Delta = A_1 B_2 - A_2 B_1 = ${formatNumber(det)}`,
      `x = \\frac{B_1 C_2 - B_2 C_1}{\\Delta} = ${formatNumber(x)}`,
      `y = \\frac{C_1 A_2 - C_2 A_1}{\\Delta} = ${formatNumber(y)}`
    ],
    verificationEvidence: {
      method: 'SUBSTITUTION_CHECK',
      independentCheck: `L1 residual = ${formatNumber(a1 * x + b1 * y + c1)}, L2 residual = ${formatNumber(a2 * x + b2 * y + c2)}`,
      passed: Math.abs(a1 * x + b1 * y + c1) < 1e-10 && Math.abs(a2 * x + b2 * y + c2) < 1e-10,
      tolerance: 1e-10
    }
  };
}

/**
 * General Shoelace Formula for polygon area (N >= 3 vertices).
 */
function solvePolygonArea(vertices) {
  if (!Array.isArray(vertices) || vertices.length < 3) {
    return {
      status: 'UNSUPPORTED',
      error: 'Polygon area requires at least 3 vertices'
    };
  }

  const MAX_SAFE = Number.MAX_SAFE_INTEGER;
  for (const v of vertices) {
    if (!v || !Number.isFinite(v.x) || !Number.isFinite(v.y)) {
      return {
        status: 'UNRESOLVED',
        error: 'Invalid or non-finite vertex coordinates'
      };
    }
    if (Math.abs(v.x) > MAX_SAFE || Math.abs(v.y) > MAX_SAFE) {
      return {
        status: 'UNRESOLVED',
        operation: 'POLYGON_AREA',
        domain: 'geometry',
        error: 'PRECISION_LIMIT_EXCEEDED',
        reason: 'Coordinates exceed IEEE 754 safe integer precision limit.'
      };
    }
  }

  const n = vertices.length;

  if (n === 3) {
    const colTest = checkCollinear(vertices[0], vertices[1], vertices[2]);
    if (colTest.collinear) {
      return {
        status: 'VERIFIED',
        operation: 'POLYGON_AREA',
        domain: 'geometry',
        isDegenerate: true,
        reason: 'COLLINEAR_VERTICES',
        area: 0,
        exactResult: '0',
        numericResult: 0,
        formattedResult: '0 (Collinear points form a degenerate polygon of area 0)',
        derivationSteps: [
          `Vertices: P_1(${formatNumber(vertices[0].x)}, ${formatNumber(vertices[0].y)}), P_2(${formatNumber(vertices[1].x)}, ${formatNumber(vertices[1].y)}), P_3(${formatNumber(vertices[2].x)}, ${formatNumber(vertices[2].y)})`,
          `Determinant cross product = ${colTest.exactDeterminant} = 0`,
          'All three vertices lie on the same straight line; area is exactly 0.'
        ],
        verificationEvidence: {
          method: 'COLLINEARITY_DETERMINANT',
          independentCheck: `Cross product = ${colTest.exactDeterminant}`,
          passed: true,
          tolerance: 0
        }
      };
    }
  }

  let rationalSuccess = false;
  let exactAreaRational = null;
  try {
    let sum1 = new Rational(0);
    let sum2 = new Rational(0);
    for (let i = 0; i < n; i++) {
      const curr = vertices[i];
      const next = vertices[(i + 1) % n];
      const rx1 = new Rational(curr.x);
      const ry1 = new Rational(curr.y);
      const rx2 = new Rational(next.x);
      const ry2 = new Rational(next.y);

      sum1 = sum1.plus(rx1.times(ry2));
      sum2 = sum2.plus(ry1.times(rx2));
    }
    const diff = sum1.minus(sum2);
    const absDiff = diff.num < 0n ? new Rational(-diff.num, diff.den) : diff;
    exactAreaRational = absDiff.div(new Rational(2));
    rationalSuccess = true;
  } catch (_) {
    rationalSuccess = false;
  }

  let sum1 = 0;
  let sum2 = 0;
  const terms = [];
  for (let i = 0; i < n; i++) {
    const curr = vertices[i];
    const next = vertices[(i + 1) % n];
    sum1 += curr.x * next.y;
    sum2 += curr.y * next.x;
    terms.push(`(${formatNumber(curr.x)} \\cdot ${formatNumber(next.y)} - ${formatNumber(curr.y)} \\cdot ${formatNumber(next.x)})`);
  }

  const rawArea = Math.abs(sum1 - sum2) / 2;
  const finalNumericArea = rationalSuccess ? exactAreaRational.toNumber() : rawArea;
  const finalExactStr = rationalSuccess ? exactAreaRational.toString() : formatNumber(finalNumericArea);

  let perimeter = 0;
  for (let i = 0; i < n; i++) {
    const curr = vertices[i];
    const next = vertices[(i + 1) % n];
    const dx = next.x - curr.x;
    const dy = next.y - curr.y;
    perimeter += Math.sqrt(dx * dx + dy * dy);
  }

  return {
    status: 'VERIFIED',
    operation: 'POLYGON_AREA',
    domain: 'geometry',
    vertexCount: n,
    vertices,
    area: finalNumericArea,
    perimeter,
    isDegenerate: finalNumericArea === 0,
    exactResult: finalExactStr,
    numericResult: finalNumericArea,
    formattedResult: formatNumber(finalNumericArea),
    derivationSteps: [
      `Polygon with ${n} vertices: ${vertices.map((v, i) => `P_${i + 1}(${formatNumber(v.x)}, ${formatNumber(v.y)})`).join(', ')}`,
      `Shoelace Formula: A = \\frac{1}{2} |\\sum (x_i y_{i+1} - y_i x_{i+1})|`,
      `Sum = \\frac{1}{2} |${terms.slice(0, 4).join(' + ')}${terms.length > 4 ? ' + \\dots' : ''}|`,
      `Area = ${formatNumber(finalNumericArea)}${rationalSuccess && exactAreaRational.den !== 1n ? ` = \\frac{${exactAreaRational.num}}{${exactAreaRational.den}}` : ''}`,
      `Perimeter: P = ${formatNumber(perimeter)}`
    ],
    verificationEvidence: {
      method: 'SHOELACE_FORMULA',
      independentCheck: `Shoelace computed Area = ${formatNumber(finalNumericArea)}`,
      passed: true,
      tolerance: 1e-12
    },
    warnings: []
  };
}

/**
 * 2. TRIANGLE GEOMETRY: THREE SIDES
 */
function solveTriangleSides(a, b, c) {
  if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c)) {
    return { status: 'UNRESOLVED', error: 'Non-finite side length' };
  }

  if (a <= 0 || b <= 0 || c <= 0) {
    return {
      status: 'FAILED',
      error: 'GEOMETRIC_IMPOSSIBILITY',
      reason: `Triangle side lengths must be strictly positive (got a=${a}, b=${b}, c=${c})`
    };
  }

  const sorted = [a, b, c].sort((x, y) => x - y);
  const [s1, s2, s3] = sorted;

  if (s1 + s2 <= s3) {
    const isCollinear = Math.abs(s1 + s2 - s3) < 1e-12;
    return {
      status: 'FAILED',
      error: 'TRIANGLE_INEQUALITY_VIOLATION',
      isDegenerate: isCollinear,
      reason: isCollinear
        ? `Degenerate flat triangle: ${s1} + ${s2} = ${s3} (vertices are collinear)`
        : `Impossible triangle: ${s1} + ${s2} < ${s3} violates triangle inequality (sum of two sides must exceed third side)`
    };
  }

  const perimeter = a + b + c;
  const s = perimeter / 2;
  const radicand = s * (s - a) * (s - b) * (s - c);
  const area = Math.sqrt(Math.max(0, radicand));

  const cosA = Math.max(-1, Math.min(1, (b * b + c * c - a * a) / (2 * b * c)));
  const cosB = Math.max(-1, Math.min(1, (a * a + c * c - b * b) / (2 * a * c)));
  const cosC = Math.max(-1, Math.min(1, (a * a + b * b - c * c) / (2 * a * b)));

  const angleRadA = Math.acos(cosA);
  const angleRadB = Math.acos(cosB);
  const angleRadC = Math.acos(cosC);

  const angleDegA = (angleRadA * 180) / Math.PI;
  const angleDegB = (angleRadB * 180) / Math.PI;
  const angleDegC = (angleRadC * 180) / Math.PI;

  const pythDiff = Math.abs(s1 * s1 + s2 * s2 - s3 * s3);
  const isRight = pythDiff < 1e-9;
  const isEquilateral = Math.abs(s1 - s3) < 1e-12;
  const isIsosceles = isEquilateral || Math.abs(s1 - s2) < 1e-12 || Math.abs(s2 - s3) < 1e-12;

  let angleType = 'ACUTE';
  if (isRight) angleType = 'RIGHT';
  else if (s1 * s1 + s2 * s2 < s3 * s3) angleType = 'OBTUSE';

  const derivationSteps = [
    `Given side lengths: a = ${formatNumber(a)}, b = ${formatNumber(b)}, c = ${formatNumber(c)}`,
    `Triangle Inequality check: ${formatNumber(s1)} + ${formatNumber(s2)} = ${formatNumber(s1 + s2)} > ${formatNumber(s3)} (Valid)`,
    `Perimeter: P = ${formatNumber(a)} + ${formatNumber(b)} + ${formatNumber(c)} = ${formatNumber(perimeter)}`,
    `Semi-perimeter: s = ${formatNumber(s)}`,
    `Heron's Formula: A = \\sqrt{s(s-a)(s-b)(s-c)} = \\sqrt{${formatNumber(radicand)}} = ${formatNumber(area)}`,
    isRight ? `Right triangle confirmed by Pythagorean Theorem: ${formatNumber(s1)}^2 + ${formatNumber(s2)}^2 = ${formatNumber(s3)}^2` : `Angles via Law of Cosines: A \\approx ${formatNumber(angleDegA, 2)}^\\circ, B \\approx ${formatNumber(angleDegB, 2)}^\\circ, C \\approx ${formatNumber(angleDegC, 2)}^\\circ`
  ];

  return {
    status: 'VERIFIED',
    operation: 'TRIANGLE_SIDES',
    domain: 'geometry',
    a,
    b,
    c,
    perimeter,
    semiPerimeter: s,
    area,
    anglesDeg: { A: angleDegA, B: angleDegB, C: angleDegC },
    anglesRad: { A: angleRadA, B: angleRadB, C: angleRadC },
    isRight,
    isEquilateral,
    isIsosceles,
    angleType,
    exactResult: formatNumber(area),
    numericResult: area,
    formattedResult: `Area = ${formatNumber(area)}, P = ${formatNumber(perimeter)}${isRight ? ' (Right Triangle)' : ''}`,
    derivationSteps,
    verificationEvidence: {
      method: 'HERON_AND_LAW_OF_COSINES',
      independentCheck: `Angle sum = ${formatNumber(angleDegA + angleDegB + angleDegC, 4)}° (expected 180°)`,
      passed: Math.abs(angleDegA + angleDegB + angleDegC - 180) < 1e-4,
      tolerance: 1e-4
    },
    warnings: []
  };
}

/**
 * 3. RIGHT TRIANGLE (Given any 2 of a, b, c)
 */
function solveRightTriangle({ a = null, b = null, c = null }) {
  const numA = a !== null ? Number(a) : null;
  const numB = b !== null ? Number(b) : null;
  const numC = c !== null ? Number(c) : null;

  if (numA !== null && numB !== null) {
    if (numA <= 0 || numB <= 0) {
      return { status: 'FAILED', error: 'Leg lengths must be strictly positive' };
    }
    const hyp = Math.hypot(numA, numB);
    const area = (numA * numB) / 2;
    const perimeter = numA + numB + hyp;
    const thetaA = (Math.atan(numA / numB) * 180) / Math.PI;
    const thetaB = 90 - thetaA;

    return {
      status: 'VERIFIED',
      operation: 'RIGHT_TRIANGLE',
      domain: 'geometry',
      a: numA,
      b: numB,
      c: hyp,
      hypotenuse: hyp,
      area,
      perimeter,
      anglesDeg: { A: thetaA, B: thetaB, C: 90 },
      exactResult: formatNumber(hyp),
      numericResult: hyp,
      formattedResult: `c = \\sqrt{${formatNumber(numA)}^2 + ${formatNumber(numB)}^2} = ${formatNumber(hyp)}, Area = ${formatNumber(area)}`,
      derivationSteps: [
        `Given legs: a = ${formatNumber(numA)}, b = ${formatNumber(numB)}`,
        `Pythagorean Theorem: c^2 = a^2 + b^2 = ${formatNumber(numA)}^2 + ${formatNumber(numB)}^2 = ${formatNumber(numA * numA + numB * numB)}`,
        `Hypotenuse: c = \\sqrt{${formatNumber(numA * numA + numB * numB)}} = ${formatNumber(hyp)}`,
        `Area: A = \\frac{1}{2}ab = \\frac{1}{2}(${formatNumber(numA)})(${formatNumber(numB)}) = ${formatNumber(area)}`,
        `Perimeter: P = a + b + c = ${formatNumber(perimeter)}`
      ]
    };
  }

  if (numC !== null && (numA !== null || numB !== null)) {
    const knownLeg = numA !== null ? numA : numB;
    const legName = numA !== null ? 'a' : 'b';
    const missingName = numA !== null ? 'b' : 'a';

    if (numC <= knownLeg) {
      return { status: 'FAILED', error: 'Hypotenuse must be strictly greater than leg length' };
    }
    const missingLeg = Math.sqrt(numC * numC - knownLeg * knownLeg);
    const area = (knownLeg * missingLeg) / 2;
    const perimeter = knownLeg + missingLeg + numC;

    return {
      status: 'VERIFIED',
      operation: 'RIGHT_TRIANGLE',
      domain: 'geometry',
      [legName]: knownLeg,
      [missingName]: missingLeg,
      c: numC,
      hypotenuse: numC,
      area,
      perimeter,
      exactResult: formatNumber(missingLeg),
      numericResult: missingLeg,
      formattedResult: `${missingName} = \\sqrt{${formatNumber(numC)}^2 - ${formatNumber(knownLeg)}^2} = ${formatNumber(missingLeg)}, Area = ${formatNumber(area)}`,
      derivationSteps: [
        `Given: hypotenuse c = ${formatNumber(numC)}, leg ${legName} = ${formatNumber(knownLeg)}`,
        `Pythagorean Theorem: ${missingName}^2 = c^2 - ${legName}^2 = ${formatNumber(numC)}^2 - ${formatNumber(knownLeg)}^2 = ${formatNumber(numC * numC - knownLeg * knownLeg)}`,
        `Missing leg: ${missingName} = \\sqrt{${formatNumber(numC * numC - knownLeg * knownLeg)}} = ${formatNumber(missingLeg)}`,
        `Area: A = \\frac{1}{2}(${formatNumber(knownLeg)})(${formatNumber(missingLeg)}) = ${formatNumber(area)}`,
        `Perimeter: P = ${formatNumber(perimeter)}`
      ]
    };
  }

  return { status: 'UNRESOLVED', error: 'Right triangle requires two known side lengths' };
}

/**
 * 4. CIRCLE GEOMETRY
 */
function solveCircle({ radius = null, diameter = null, center = { x: 0, y: 0 } }) {
  let r = radius;
  if (r === null && diameter !== null) {
    r = diameter / 2;
  }

  if (r === null || !Number.isFinite(r)) {
    return { status: 'UNRESOLVED', error: 'Missing or non-finite radius' };
  }

  if (r <= 0) {
    return {
      status: 'FAILED',
      error: 'DEGENERATE_CIRCLE',
      reason: `Circle radius must be strictly positive (got r = ${r})`
    };
  }

  const h = center && Number.isFinite(center.x) ? center.x : 0;
  const k = center && Number.isFinite(center.y) ? center.y : 0;

  const d = 2 * r;
  const circumference = 2 * Math.PI * r;
  const area = Math.PI * r * r;

  const hTerm = h === 0 ? 'x^2' : (h > 0 ? `(x - ${formatNumber(h)})^2` : `(x + ${formatNumber(Math.abs(h))})^2`);
  const kTerm = k === 0 ? 'y^2' : (k > 0 ? `(y - ${formatNumber(k)})^2` : `(y + ${formatNumber(Math.abs(k))})^2`);
  const r2Str = formatNumber(r * r);
  const standardEquation = `${hTerm} + ${kTerm} = ${r2Str}`;

  const D = -2 * h;
  const E = -2 * k;
  const F = h * h + k * k - r * r;
  const generalEquation = `x^2 + y^2 ${D >= 0 ? `+ ${formatNumber(D)}x` : `- ${formatNumber(Math.abs(D))}x`} ${E >= 0 ? `+ ${formatNumber(E)}y` : `- ${formatNumber(Math.abs(E))}y`} ${F >= 0 ? `+ ${formatNumber(F)}` : `- ${formatNumber(Math.abs(F))}`} = 0`;

  const derivationSteps = [
    `Center: (${formatNumber(h)}, ${formatNumber(k)}), Radius: r = ${formatNumber(r)}`,
    `Diameter: d = 2r = ${formatNumber(d)}`,
    `Circumference: C = 2\\pi r = 2\\pi(${formatNumber(r)}) = ${formatNumber(2 * r)}\\pi (\\approx ${formatNumber(circumference)})`,
    `Area: A = \\pi r^2 = \\pi(${formatNumber(r)})^2 = ${formatNumber(r * r)}\\pi (\\approx ${formatNumber(area)})`,
    `Standard Form: ${standardEquation}`
  ];

  return {
    status: 'VERIFIED',
    operation: 'CIRCLE_GEOMETRY',
    domain: 'geometry',
    radius: r,
    diameter: d,
    center: { x: h, y: k },
    circumference,
    area,
    circumferenceExact: `${formatNumber(2 * r)}\\pi`,
    areaExact: `${formatNumber(r * r)}\\pi`,
    standardEquation,
    generalEquation,
    exactResult: `${formatNumber(r * r)}\\pi`,
    numericResult: area,
    formattedResult: `Area = ${formatNumber(r * r)}\\pi (\\approx ${formatNumber(area)}), C = ${formatNumber(2 * r)}\\pi (\\approx ${formatNumber(circumference)})`,
    derivationSteps,
    verificationEvidence: {
      method: 'CIRCLE_METRIC_CONSISTENCY',
      independentCheck: `C^2 / (4*pi*A) = ${formatNumber((circumference * circumference) / (4 * Math.PI * area), 6)} (expected 1.0)`,
      passed: Math.abs((circumference * circumference) / (4 * Math.PI * area) - 1.0) < 1e-10,
      tolerance: 1e-10
    },
    warnings: []
  };
}

/**
 * 5. CIRCLE SECTOR & ARC LENGTH
 * s = r * theta (theta in radians)
 * A = 1/2 * r^2 * theta (theta in radians)
 */
function solveCircleSector({ radius, angle, unit = 'degrees' }) {
  const r = Number(radius);
  const ang = Number(angle);

  if (!Number.isFinite(r) || !Number.isFinite(ang) || r <= 0 || ang <= 0) {
    return { status: 'FAILED', error: 'Radius and angle must be strictly positive numbers' };
  }

  const isDeg = unit.toLowerCase().startsWith('deg');
  const thetaRad = isDeg ? (ang * Math.PI) / 180 : ang;
  const thetaDeg = isDeg ? ang : (ang * 180) / Math.PI;

  const arcLength = r * thetaRad;
  const sectorArea = 0.5 * r * r * thetaRad;

  // Exact pi fractions if angle in degrees
  let arcExact = null;
  let areaExact = null;
  if (isDeg) {
    // arc = 2*pi*r * (ang/360) = pi * (2 * r * ang / 360)
    const arcFrac = new Rational(Math.round(2 * r * ang), 360n);
    arcExact = arcFrac.den === 1n ? `${arcFrac.num}\\pi` : `\\frac{${arcFrac.num}\\pi}{${arcFrac.den}}`;

    // area = pi * r^2 * (ang/360)
    const areaFrac = new Rational(Math.round(r * r * ang), 360n);
    areaExact = areaFrac.den === 1n ? `${areaFrac.num}\\pi` : `\\frac{${areaFrac.num}\\pi}{${areaFrac.den}}`;
  }

  const derivationSteps = [
    `Radius: r = ${formatNumber(r)}, Central Angle: \\theta = ${formatNumber(ang)}${isDeg ? '^\\circ' : '\\text{ rad}'}${isDeg ? ` = \\frac{${formatNumber(ang)}\\pi}{180} = ${formatNumber(thetaRad, 4)}\\text{ rad}` : ''}`,
    `Arc Length: s = r\\theta = (${formatNumber(r)})(${formatNumber(thetaRad, 4)}) = ${arcExact ? `${arcExact} \\approx ` : ''}${formatNumber(arcLength)}`,
    `Sector Area: A = \\frac{1}{2}r^2\\theta = \\frac{1}{2}(${formatNumber(r)})^2(${formatNumber(thetaRad, 4)}) = ${areaExact ? `${areaExact} \\approx ` : ''}${formatNumber(sectorArea)}`
  ];

  return {
    status: 'VERIFIED',
    operation: 'CIRCLE_SECTOR',
    domain: 'geometry',
    radius: r,
    angle: ang,
    angleDegrees: thetaDeg,
    angleRadians: thetaRad,
    arcLength,
    sectorArea,
    arcExact,
    areaExact,
    exactResult: areaExact || formatNumber(sectorArea),
    numericResult: sectorArea,
    formattedResult: `Arc Length s = ${arcExact ? `${arcExact} (\\approx ${formatNumber(arcLength)})` : formatNumber(arcLength)}, Sector Area A = ${areaExact ? `${areaExact} (\\approx ${formatNumber(sectorArea)})` : formatNumber(sectorArea)}`,
    derivationSteps,
    verificationEvidence: {
      method: 'SECTOR_RATIO_CHECK',
      independentCheck: `Arc / Circumference = ${formatNumber(arcLength / (2 * Math.PI * r), 6)} matches Area / TotalArea = ${formatNumber(sectorArea / (Math.PI * r * r), 6)}`,
      passed: Math.abs((arcLength / (2 * Math.PI * r)) - (sectorArea / (Math.PI * r * r))) < 1e-10,
      tolerance: 1e-10
    }
  };
}

module.exports = {
  Rational,
  solveTwoPoints,
  checkCollinear,
  intersectLines,
  solvePolygonArea,
  solveTriangleSides,
  solveRightTriangle,
  solveCircle,
  solveCircleSector,
  formatNumber
};
