/**
 * server/toolHandoffBuilder.js
 *
 * Builds deterministic, structured tool-handoff contracts from prompt,
 * domain classification, specialist assist, tool executions, and SymPy/CAS
 * verification results. Never parses freeform AI prose to invent math.
 */

const { normalizeUnicodeSuperscriptsForSolver } = require('./specialistAssist');

const SIM_LAB_TOPICS = [
  { id: 'projectile', title: 'Classical Projectile Motion', re: /\b(?:projectile|trajectory|launch\s+angle|max(?:imum)?\s+height|horizontal\s+range|ballistic)\b/i },
  { id: 'newtons_laws', title: "Newton's Second Law & Incline", re: /\b(?:inclined?\s+plane|ramp\s+angle|newton'?s\s+second|f\s*=\s*m\s*\*?\s*a|kinetic\s+friction)\b/i },
  { id: 'hookes_law', title: "Hooke's Law & Oscillations", re: /\b(?:hooke'?s?\s+law|spring\s+constant|elastic\s+potential|restoring\s+force)\b/i },
  { id: 'pendulum', title: 'Simple Harmonic Pendulum', re: /\b(?:pendulum|oscillat|harmonic\s+period)\b/i },
  { id: 'energy_transfer', title: 'Conservation of Energy', re: /\b(?:conservation\s+of\s+energy|kinetic\s+energy|potential\s+energy)\b/i },
  { id: 'momentum', title: 'Momentum & 1D Collisions', re: /(?<!angular\s|conjugate\s|canonical\s)\b(?:momentum|elastic\s+collision|inelastic\s+collision|impulse)\b/i },
  { id: 'waves', title: 'Wave Mechanics & Propagation', re: /\b(?:wavelength|wave\s+speed|frequency|amplitude|standing\s+wave)\b/i },
  { id: 'optics', title: "Snell's Law & Refraction", re: /\b(?:snell'?s?\s+law|refraction|refractive\s+index|critical\s+angle|total\s+internal\s+reflection)\b/i },
  { id: 'buoyancy', title: "Archimedes' Buoyancy & Upthrust", re: /\b(?:buoyan|archimedes|submerged\s+volume|upthrust)\b/i },
  { id: 'circuits', title: "Ohm's Law & DC Circuits", re: /\b(?:ohm'?s?\s+law|resistor|circuit\s+current|voltage|dissipation)\b/i },
  { id: 'gas_laws', title: 'Ideal Gas Law & Piston', re: /\b(?:ideal\s+gas|boyle'?s?\s+law|charles'?s?\s+law|pv\s*=\s*nrt)\b/i },
  { id: 'triangle', title: 'Pythagorean Right Triangle', re: /\b(?:right\s+triangle|pythagorean|hypotenuse|opposite|adjacent)\b/i },
  { id: 'circle', title: 'Circle & Sector Dynamics', re: /\b(?:circle|radius|circumference|arc\s+length|sector\s+area|diameter)\b/i },
  { id: 'trigonometry', title: 'Pythagorean Unit Circle', re: /\b(?:unit\s+circle|quadrant|coterminal|reference\s+angle)\b/i },
  { id: 'calculus_derivatives', title: 'Differential Calculus & Tangents', re: /\b(?:tangent\s+line|secant\s+line|rate\s+of\s+change|derivative)\b/i },
  { id: 'normal_distribution', title: 'Gaussian Normal Distribution', re: /\b(?:normal\s+distribution|z-?score|standard\s+deviation|bell\s+curve)\b/i },
  { id: 'exponential_growth', title: 'Exponential Dynamics', re: /\b(?:exponential\s+growth|exponential\s+decay|half-?life|doubling\s+time|compound\s+interest)\b/i }
];

function stripOuterMathDelimiters(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let s = raw.trim();
  if (/^\$\$[\s\S]*\$\$$/.test(s)) s = s.slice(2, -2).trim();
  else if (/^\$[\s\S]*\$$/.test(s)) s = s.slice(1, -1).trim();
  else if (/^\\\[[\s\S]*\\\]$/.test(s)) s = s.slice(2, -2).trim();
  else if (/^\\\([\s\S]*\\\)$/.test(s)) s = s.slice(2, -2).trim();
  return s;
}

function normalizeMathForTools(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let s = normalizeUnicodeSuperscriptsForSolver(stripOuterMathDelimiters(raw));
  s = s
    .replace(/÷/g, '/')
    .replace(/[×·✕]/g, '*')
    .replace(/[−–—]/g, '-')
    .replace(/π/g, 'pi')
    .replace(/\\pi\b/g, 'pi')
    .replace(/\\(?:cdot|times)\b/g, '*')
    .replace(/\\div\b/g, '/')
    .replace(/\\left\s*([(\[{|])/g, '$1')
    .replace(/\\right\s*([)\]}|])/g, '$1')
    .replace(/\\(sin|cos|tan|csc|sec|cot|arcsin|arccos|arctan|sinh|cosh|tanh|ln|log|exp|sqrt|abs)\b/g, '$1')
    .replace(/(?<![a-zA-Z])(sin|cos|tan|csc|sec|cot|sinh|cosh|tanh)\s*\^\s*(?:\{([^{}]+)\}|\(([^()]+)\)|(-?\d+(?:\.\d+)?))\s*\(([^()]+)\)/g, '($1($5))^($2$3$4)')
    .replace(/(?<![a-zA-Z])(sin|cos|tan|csc|sec|cot|sinh|cosh|tanh)\s*\^\s*(?:\{([^{}]+)\}|\(([^()]+)\)|(-?\d+(?:\.\d+)?))\s+([a-zA-Z])\b/g, '($1($5))^($2$3$4)')
    .replace(/(?<![a-zA-Z])(sin|cos|tan|csc|sec|cot|arcsin|arccos|arctan|ln|log|exp|sqrt|abs)\s+([a-zA-Z])\b/g, '$1($2)')
    .replace(/\\(?:d|t)?frac\{([^{}]+)\}\{([^{}]+)\}/g, '(($1)/($2))')
    .replace(/\\sqrt\{([^{}]+)\}/g, 'sqrt($1)')
    .replace(/\^\s*\{([^{}]+)\}/g, '^($1)')
    .replace(/\s+/g, ' ')
    .trim();
  return s;
}

const REFERENTIAL_PROSE_WORDS = new Set([
  'it', 'this', 'that', 'these', 'those', 'them', 'me', 'my', 'you', 'your',
  'here', 'there', 'please', 'kindly', 'function', 'curve', 'graph', 'plot',
  'sketch', 'equation', 'formula', 'problem', 'answer', 'solution', 'work', 'step'
]);

const ALLOWED_MATH_MULTI_WORDS = new Set([
  'sin', 'cos', 'tan', 'csc', 'sec', 'cot',
  'asin', 'acos', 'atan', 'arcsin', 'arccos', 'arctan',
  'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh',
  'ln', 'log', 'log10', 'log2', 'exp', 'sqrt', 'cbrt',
  'abs', 'floor', 'round', 'ceil', 'pi', 'theta', 'alpha',
  'beta', 'gamma', 'delta', 'omega', 'inf', 'infinity',
  'mod', 'gcd', 'lcm', 'det', 'dim', 'deg', 'rad', 'diff', 'integrate',
  'dx', 'dy', 'dt', 'dz'
]);

function isSafeAsciiMathExpression(expr) {
  if (!expr || typeof expr !== 'string') return false;
  const s = expr.trim();
  if (!s || s.length > 260) return false;
  if (/[<>`$;]/.test(s)) return false;
  if (!/[a-zA-Z0-9]/.test(s)) return false;
  if (/^(?:it|this|that|these|those|them|me|here|there|please|kindly)$/i.test(s)) return false;

  // Reject any expression containing referential/prose English words or multiple unknown multi-letter tokens
  const multiLetterWords = s.match(/\b[a-zA-Z]{2,}\b/g) || [];
  const unknownWords = multiLetterWords.filter(w => !ALLOWED_MATH_MULTI_WORDS.has(w.toLowerCase()));
  if (unknownWords.some(w => REFERENTIAL_PROSE_WORDS.has(w.toLowerCase()))) return false;
  if (unknownWords.length > 1) return false;
  if (unknownWords.length === 1 && !/[0-9+\-*/^()=.]/.test(s)) return false;
  return true;
}

function extractVariables(expr) {
  if (!expr || typeof expr !== 'string') return [];
  const cleaned = expr.replace(/\b(?:arcsin|arccos|arctan|sinh|cosh|tanh|sin|cos|tan|csc|sec|cot|asin|acos|atan|log10|log2|log|ln|exp|sqrt|cbrt|abs|pi|theta|Infinity|diff|integrate)\b/gi, ' ');
  const singleVars = cleaned.match(/(?<![a-zA-Z])[a-zA-Z](?![a-zA-Z])/g) || [];
  return Array.from(new Set(singleVars.filter(v => v !== 'e' && v !== 'i')));
}

function extractEquationFromPrompt(prompt) {
  if (!prompt || typeof prompt !== 'string') return null;
  let s = stripOuterMathDelimiters(prompt);
  // Strip common leading imperatives cleanly
  s = s
    .replace(/^(?:please\s+)?(?:can\s+you\s+|help\s+me\s+)?(?:solve|verify|check|simplify|factor|find\s+(?:all\s+)?(?:real\s+)?(?:values\s+of\s+[a-zA-Z]\s+(?:for|where|such\s+that)\s+|solutions?\s+(?:to|of|for)\s+|roots?\s+(?:to|of|for)\s+)?|graph|plot|sketch|evaluate)\s+(?:for\s+[a-zA-Z]\s*[:,-]?\s*)?(?:the\s+(?:equation|function|identity)\s+)?(?:that\s+)?/i, '')
    .replace(/[?.!]+$/, '')
    .trim();

  // Strip trailing prose like "for all real x" or "using quadratic formula"
  s = s.replace(/\s+(?:for\s+all\s+real(?:\s+numbers?)?(?:\s+[a-zA-Z])?|over\s+the\s+reals|using\s+[^,;.]+|step\s+by\s+step|by\s+factoring)\s*$/i, '').trim();
  const norm = normalizeMathForTools(s);
  if (!norm.includes('=')) return null;
  const parts = norm.split('=');
  if (parts.length !== 2) return null;
  const lhs = parts[0].trim();
  const rhs = parts[1].trim();
  if (!lhs || !rhs) return null;
  if (!isSafeAsciiMathExpression(lhs) || !isSafeAsciiMathExpression(rhs)) return null;
  return `${lhs} = ${rhs}`;
}

function extractFunctionExprFromPrompt(prompt) {
  if (!prompt || typeof prompt !== 'string') return null;
  const s = stripOuterMathDelimiters(prompt).trim();

  const fnDef = s.match(/(?:[fygh]\s*\(\s*[a-zA-Z]\s*\)|y)\s*=\s*([^;?\n!]+)/i);
  if (fnDef) {
    const candidate = normalizeMathForTools(fnDef[1].replace(/\s+(?:and\s+find|on\s+\[|for\s+x\s+in).*$/i, '').trim());
    if (isSafeAsciiMathExpression(candidate) && extractVariables(candidate).length <= 2) {
      return candidate;
    }
  }

  const graphCmd = s.match(/\b(?:graph|plot|sketch)\s+(?:the\s+(?:function|curve|equation)\s+)?(?:y\s*=\s*|f\s*\(\s*x\s*\)\s*=\s*)?([^\n?!;]+)/i);
  if (graphCmd) {
    const rawTarget = graphCmd[1]
      .replace(/\s+(?:from|on|over|between|for)\s+.*$/i, '')
      .replace(/\s+(?:please|kindly|on\s+a\s+graph|in\s+a\s+graph|on\s+the\s+graph)$/i, '')
      .trim();
    const candidate = normalizeMathForTools(rawTarget);
    if (candidate && !/^(?:it|this|that|these|those|the\s+(?:function|curve|graph|equation))$/i.test(candidate)) {
      if (candidate.includes('=')) {
        const [lhs, rhs] = candidate.split('=').map(p => p.trim());
        if (lhs && rhs && isSafeAsciiMathExpression(lhs) && isSafeAsciiMathExpression(rhs)) {
          return rhs === '0' ? lhs : `(${lhs}) - (${rhs})`;
        }
      } else if (isSafeAsciiMathExpression(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

function extractUnitConversionFromPrompt(prompt) {
  if (!prompt || typeof prompt !== 'string') return null;
  const m = prompt.match(/(-?\d+(?:\.\d+)?\s*(?:°\s*[CFK]|mph|kph|kmh|km\/h|m\/s|ft\/s|knots?|m|km|cm|mm|mi|miles?|ft|feet|in|inches|kg|g|mg|lb|lbs|pounds?|oz|s|sec|min|hr|hrs|hours?|degC|degF|celsius|fahrenheit|kelvin|K|J|cal|kcal|BTU|N|Pa|atm|bar|L|mL|gal|gallons?))\s+(?:to|into|in)\s+(°\s*[CFK]|[a-zA-Z°/]+(?:\^[0-9]+)?)/i);
  if (!m) return null;
  return {
    valueWithUnit: m[1].trim(),
    targetUnit: m[2].replace(/[?.!,]+$/, '').trim()
  };
}

function extractMatricesFromPrompt(prompt) {
  if (!prompt || typeof prompt !== 'string') return null;
  const bracketMats = prompt.match(/\[\s*\[[^\]]+\](?:\s*,\s*\[[^\]]+\])*\s*\]/g);
  if (bracketMats && bracketMats.length > 0) {
    const valid = bracketMats.filter(m => {
      try {
        const parsed = JSON.parse(m);
        return Array.isArray(parsed) && parsed.length > 0 && Array.isArray(parsed[0]);
      } catch (_) {
        return false;
      }
    });
    if (valid.length > 0) {
      return {
        matrixA: valid[0],
        matrixB: valid[1] || null
      };
    }
  }

  // Convert \begin{bmatrix} a & b \\ c & d \end{bmatrix}
  const latexMats = [];
  const bmatRe = /\\begin\{[bpv]?matrix\}([\s\S]*?)\\end\{[bpv]?matrix\}/g;
  let bm;
  while ((bm = bmatRe.exec(prompt)) !== null) {
    const rows = bm[1].trim().split(/\\\\/).map(r =>
      r.trim().split('&').map(cell => cell.trim()).filter(Boolean)
    ).filter(r => r.length > 0);
    if (rows.length > 0) {
      const formatted = `[${rows.map(r => `[${r.join(', ')}]`).join(', ')}]`;
      latexMats.push(formatted);
    }
  }
  if (latexMats.length > 0) {
    return {
      matrixA: latexMats[0],
      matrixB: latexMats[1] || null
    };
  }
  return null;
}

function extractLinearDenominatorRestrictions(expr, variable = 'x') {
  if (!expr || typeof expr !== 'string') return [];
  const restrictions = new Set();
  const safeVar = variable.replace(/[^a-zA-Z]/g, '') || 'x';

  // Extract explicit (x - a) / (x + a) / x denominators deterministically
  const denMatches = expr.match(/\/\s*(?:\(([^()]+)\)|([a-zA-Z]))/g) || [];
  for (const dm of denMatches) {
    const body = dm.replace(/^\/\s*/, '').replace(/^\(|\)$/g, '').trim();
    if (body === safeVar) {
      restrictions.add(`${safeVar} != 0`);
    } else {
      const lin = body.match(new RegExp(`^(\\d+\\s*\\*?\\s*)?${safeVar}\\s*([+-])\\s*(\\d+(?:\\.\\d+)?)$`));
      if (lin) {
        const coef = lin[1] ? parseFloat(lin[1]) : 1;
        const sign = lin[2] === '+' ? -1 : 1;
        const num = parseFloat(lin[3]);
        if (coef && !Number.isNaN(num)) {
          const val = (sign * num) / coef;
          restrictions.add(`${safeVar} != ${Number.isInteger(val) ? val : Number(val.toFixed(6))}`);
        }
      }
    }
  }

  // Natural trig denominator singularities for reciprocal/quotient trig functions
  if (/\b(?:csc|cot)\s*\(/i.test(expr) || /\/\s*(?:sin)\s*\(/i.test(expr)) {
    restrictions.add(`sin(${safeVar}) != 0 (${safeVar} != n*pi, n \u2208 Z)`);
  }
  if (/\b(?:sec|tan)\s*\(/i.test(expr) || /\/\s*(?:cos)\s*\(/i.test(expr)) {
    restrictions.add(`cos(${safeVar}) != 0 (${safeVar} != pi/2 + n*pi, n \u2208 Z)`);
  }
  if (/\b(?:ln|log\d*)\s*\(/i.test(expr)) {
    restrictions.add('logarithm argument > 0');
  }
  if (/\bsqrt\s*\(/i.test(expr)) {
    restrictions.add('radicand >= 0 (for real values)');
  }
  return Array.from(restrictions);
}

function collectDeterministicRestrictions(verificationResults = [], normalizedExpr = '', variable = 'x') {
  const out = new Set();
  const varName = variable || 'x';

  for (const v of (Array.isArray(verificationResults) ? verificationResults : [])) {
    if (!v || typeof v !== 'object') continue;
    const sources = []
      .concat(Array.isArray(v.domain_restrictions) ? v.domain_restrictions : [])
      .concat(Array.isArray(v.stated_restrictions) ? v.stated_restrictions : []);
    for (const r of sources) {
      if (typeof r === 'number' && Number.isFinite(r)) {
        out.add(`${varName} != ${Number.isInteger(r) ? r : Number(r.toFixed(6))}`);
      } else if (typeof r === 'string' && r.trim()) {
        out.add(r.trim());
      }
    }
  }

  const hasPeriodicSin = Array.from(out).some(r => /sin\(|n\*pi/i.test(r));
  const hasPeriodicCos = Array.from(out).some(r => /cos\(|pi\/2\s*\+\s*n\*pi/i.test(r));
  for (const r of extractLinearDenominatorRestrictions(normalizedExpr, varName)) {
    if (hasPeriodicSin && /^sin\(/i.test(r)) continue;
    if (hasPeriodicCos && /^cos\(/i.test(r)) continue;
    out.add(r);
  }
  return Array.from(out);
}

/**
 * Builds the deterministic contextual tool handoff contract for an assistant response.
 */
function buildToolHandoffContract({
  userPrompt = '',
  classification = null,
  specialistAssistResult = null,
  preflightToolResult = null,
  claims = [],
  verificationResults = [],
  verificationState = 'UNVERIFIED_CONCEPTUAL',
  withheld = false,
  withholdingReason = null,
  activeProblemState = null,
  studentIntent = null,
  studentEvaluation = null
} = {}) {
  const rawPrompt = typeof userPrompt === 'string' ? userPrompt.trim() : '';
  if (!rawPrompt) return null;

  // If the user submitted a step/validation follow-up OR a referential graph request
  // (e.g. "graph it for me please") against an active problem in conversation state,
  // anchor handoffs on the authoritative active problem rather than prose/discarded steps.
  const activeProbExpr = activeProblemState?.active?.activeExpression || activeProblemState?.active?.initialUserPrompt || '';
  const hasExplicitRawMath = Boolean(
    extractFunctionExprFromPrompt(rawPrompt) ||
    extractEquationFromPrompt(rawPrompt)
  );
  const isStepFeedbackTurn = Boolean(
    activeProbExpr &&
    studentIntent?.intent !== 'NEW_PROBLEM' &&
    studentIntent?.intent !== 'GRAPH_REQUEST' &&
    (
      studentEvaluation?.status === 'STEP_VERIFIED_INCORRECT' ||
      studentEvaluation?.status === 'STEP_VERIFIED_CORRECT' ||
      studentEvaluation?.status === 'ANSWER_VERIFIED_INCORRECT' ||
      ['PROPOSED_STEP', 'PROPOSED_ANSWER', 'VALIDATION_REQUEST', 'HINT_REQUEST', 'CONTINUATION', 'TENTATIVE_HYPOTHESIS'].includes(studentIntent?.intent)
    )
  );
  const isReferentialGraphTurn = Boolean(
    !hasExplicitRawMath &&
    (preflightToolResult?.parameters?.expression || activeProbExpr) &&
    (
      studentIntent?.intent === 'GRAPH_REQUEST' ||
      /\b(?:graph|plot|sketch)\s+(?:it|this|that|the\s+(?:function|curve|equation))\b/i.test(rawPrompt)
    )
  );
  const prompt = isStepFeedbackTurn
    ? String(activeProbExpr).trim()
    : (isReferentialGraphTurn ? String(preflightToolResult?.parameters?.expression || activeProbExpr).trim() : rawPrompt);

  // Never offer irrelevant calculation handoffs for off-topic, infra failures, or malformed syntax
  // (MALFORMED_SYNTAX already receives Feature 1 Suggested Equation actions).
  if (withheld && ['MALFORMED_SYNTAX', 'OFF_TOPIC', 'INFRASTRUCTURE_FAILURE', 'DUAL_PROVIDER_FAILURE', 'RATE_LIMITED'].includes(withholdingReason)) {
    return null;
  }

  const domain = String(classification?.problemDomain || '').toUpperCase();
  const subtype = String(classification?.problemSubtype || '').toUpperCase();
  if (domain === 'OFF_TOPIC') return null;

  const safeClaims = Array.isArray(claims) ? claims : [];
  const safeResults = Array.isArray(verificationResults) ? verificationResults : [];

  // 1. Unit Conversion Detection
  const unitInfo = extractUnitConversionFromPrompt(prompt);
  if (unitInfo) {
    return {
      version: 1,
      originalProblem: prompt,
      normalizedExpression: `${unitInfo.valueWithUnit} to ${unitInfo.targetUnit}`,
      graphExpression: null,
      equationForCheck: null,
      expressionType: 'unit_conversion',
      variables: [],
      domainRestrictions: [],
      verificationState,
      tools: [
        {
          id: 'units',
          label: 'Open Units',
          toolId: 'floatUnitsWindow',
          params: {
            valueWithUnit: unitInfo.valueWithUnit,
            targetUnit: unitInfo.targetUnit
          }
        }
      ]
    };
  }

  // 2. Matrix Detection
  const matrixInfo = extractMatricesFromPrompt(prompt);
  if (matrixInfo || domain === 'LINEAR_ALGEBRA') {
    const tools = [];
    if (matrixInfo) {
      tools.push({
        id: 'matrix',
        label: 'Open Matrix',
        toolId: 'floatMatrixWindow',
        params: {
          matrixA: matrixInfo.matrixA,
          ...(matrixInfo.matrixB ? { matrixB: matrixInfo.matrixB } : {})
        }
      });
    } else {
      tools.push({
        id: 'matrix',
        label: 'Open Matrix',
        toolId: 'floatMatrixWindow',
        params: {}
      });
    }
    if (!withheld && matrixInfo) {
      tools.push({
        id: 'try_another_method',
        label: 'Try Another Method',
        prompt: `Can you solve this same matrix problem (${prompt}) using an alternative method or geometric interpretation?`
      });
    }
    return {
      version: 1,
      originalProblem: prompt,
      normalizedExpression: matrixInfo ? matrixInfo.matrixA : prompt,
      graphExpression: null,
      equationForCheck: null,
      expressionType: 'matrix',
      variables: [],
      domainRestrictions: [],
      verificationState,
      tools
    };
  }

  // 3. Determine Primary Equation / Function from deterministic sources ONLY
  let normalizedExpr = '';
  let equationForCheck = null;
  let graphExpression = null;
  let primaryVar = 'x';

  const fnExprFromPrompt = extractFunctionExprFromPrompt(prompt);
  const eqFromPrompt = extractEquationFromPrompt(prompt);

  if (preflightToolResult?.tool === 'render_function_graph' && preflightToolResult.parameters?.expression) {
    graphExpression = normalizeMathForTools(String(preflightToolResult.parameters.expression));
    normalizedExpr = graphExpression;
  }

  if (specialistAssistResult?.outcome?.equation) {
    const specEq = normalizeMathForTools(String(specialistAssistResult.outcome.equation));
    if (specEq.includes('=')) equationForCheck = specEq;
  }
  if (!equationForCheck && eqFromPrompt) {
    equationForCheck = eqFromPrompt;
  }

  // Fallback to deterministic claim inputs ONLY if prompt already gave an equation/calculus/trig claim
  if (!equationForCheck && !fnExprFromPrompt) {
    const eqClaim = safeClaims.find(c => c && c.claim_type === 'equation_solution' && c.data?.equation);
    if (eqClaim) {
      const cand = normalizeMathForTools(eqClaim.data.equation);
      if (cand.includes('=') && isSafeAsciiMathExpression(cand.replace('=', ''))) {
        equationForCheck = cand;
        if (eqClaim.data.variable) primaryVar = String(eqClaim.data.variable);
      }
    }
  }

  if (!graphExpression && fnExprFromPrompt) {
    graphExpression = fnExprFromPrompt;
  }

  // Extract calculus integrand/expression if prompt asked derivative/integral/limit
  if (!graphExpression) {
    const calcClaim = safeClaims.find(c =>
      c && (c.claim_type === 'derivative' || c.claim_type === 'antiderivative' || c.claim_type === 'definite_integral' || c.claim_type === 'limit') &&
      (c.data?.expression || c.data?.integrand)
    );
    if (calcClaim) {
      const calcRaw = normalizeMathForTools(String(calcClaim.data.expression || calcClaim.data.integrand));
      if (isSafeAsciiMathExpression(calcRaw)) {
        graphExpression = calcRaw;
        if (calcClaim.data.variable) primaryVar = String(calcClaim.data.variable);
      }
    }
  }

  // For single-variable equation lhs = rhs, derive plot curve lhs - (rhs) for Graph this
  if (!graphExpression && equationForCheck) {
    const [lhs, rhs] = equationForCheck.split('=').map(p => p.trim());
    const eqVars = extractVariables(equationForCheck);
    if (eqVars.length <= 1 && isSafeAsciiMathExpression(lhs) && isSafeAsciiMathExpression(rhs)) {
      if (eqVars.length === 1) primaryVar = eqVars[0];
      graphExpression = rhs === '0' ? lhs : `(${lhs}) - (${rhs})`;
    }
  }

  // For f(x) = expr (without solving =), allow Check my Work with expr = 0 cleanly
  if (!equationForCheck && fnExprFromPrompt) {
    const fnVars = extractVariables(fnExprFromPrompt);
    if (fnVars.length === 1 && fnVars[0] === 'x') {
      equationForCheck = `${fnExprFromPrompt} = 0`;
    }
  } else if (equationForCheck && /^(?:[fygh]\s*\(\s*x\s*\)|y)\s*=/.test(equationForCheck)) {
    const rhs = equationForCheck.split('=')[1].trim();
    if (isSafeAsciiMathExpression(rhs)) {
      equationForCheck = `${rhs} = 0`;
    }
  }

  normalizedExpr = equationForCheck || graphExpression || normalizeMathForTools(prompt);
  const variables = extractVariables(normalizedExpr);
  if (variables.length > 0 && !variables.includes(primaryVar)) {
    primaryVar = variables[0];
  }

  const isExplicitFnNotation = Boolean(fnExprFromPrompt) && (
    /\b(?:graph|plot|sketch)\b/i.test(prompt) ||
    /(?:^|\s)(?:[fygh]\s*\(\s*[a-zA-Z]\s*\)|y)\s*=/.test(prompt)
  );
  const isTrig = domain === 'TRIGONOMETRY' || /\b(?:sin|cos|tan|csc|sec|cot|arcsin|arccos|arctan)\b/i.test(normalizedExpr);
  const isRational = /\/\s*(?:\([^)]*[a-zA-Z][^)]*\)|[a-zA-Z])/.test(normalizedExpr);
  const isCalculus = domain === 'CALCULUS' || subtype.includes('DERIVATIVE') || subtype.includes('INTEGRAL') || subtype.includes('LIMIT');

  let expressionType = 'general';
  if (domain === 'PHYSICS') expressionType = 'physics';
  else if (domain === 'GEOMETRY') expressionType = 'geometry';
  else if (isRational) expressionType = 'rational_equation';
  else if (isTrig) expressionType = 'trigonometric';
  else if (isCalculus) expressionType = 'calculus';
  else if (isExplicitFnNotation || subtype.includes('FUNCTION') || subtype.includes('GRAPH')) expressionType = 'function';
  else if (equationForCheck) expressionType = 'algebraic_equation';
  else if (domain === 'ARITHMETIC') expressionType = 'arithmetic';

  const domainRestrictions = collectDeterministicRestrictions(safeResults, normalizedExpr, primaryVar);
  const simMatch = subtype === 'THEORETICAL_MECHANICS_AND_RELATIVITY'
    ? null
    : SIM_LAB_TOPICS.find(t => t.re.test(prompt));

  const tools = [];

  // Contextual tool ordering by problem type
  if (expressionType === 'function' || expressionType === 'calculus') {
    if (graphExpression && variables.length <= 1) {
      tools.push({ id: 'graph', label: 'Graph this', toolId: 'floatGraphWindow', params: { expression: graphExpression } });
    }
    if (equationForCheck && variables.length === 1) {
      tools.push({ id: 'check_work', label: 'Check my Work', toolId: 'floatCheckWindow', params: { equation: equationForCheck, variable: primaryVar } });
    }
  } else if (expressionType === 'trigonometric') {
    if (graphExpression && variables.length <= 1) {
      tools.push({ id: 'graph', label: 'Graph this', toolId: 'floatGraphWindow', params: { expression: graphExpression } });
    }
    if (domainRestrictions.length > 0) {
      tools.push({ id: 'domain_restrictions', label: 'Show Domain Restrictions', restrictions: domainRestrictions, expression: normalizedExpr });
    }
    if (equationForCheck && variables.length === 1) {
      tools.push({ id: 'check_work', label: 'Check my Work', toolId: 'floatCheckWindow', params: { equation: equationForCheck, variable: primaryVar } });
    }
  } else if (expressionType === 'rational_equation') {
    if (domainRestrictions.length > 0) {
      tools.push({ id: 'domain_restrictions', label: 'Show Domain Restrictions', restrictions: domainRestrictions, expression: normalizedExpr });
    }
    if (equationForCheck && variables.length === 1) {
      tools.push({ id: 'check_work', label: 'Check my Work', toolId: 'floatCheckWindow', params: { equation: equationForCheck, variable: primaryVar } });
    }
    if (graphExpression && variables.length <= 1) {
      tools.push({ id: 'graph', label: 'Graph this', toolId: 'floatGraphWindow', params: { expression: graphExpression } });
    }
  } else if (expressionType === 'algebraic_equation') {
    if (equationForCheck && variables.length === 1) {
      tools.push({ id: 'check_work', label: 'Check my Work', toolId: 'floatCheckWindow', params: { equation: equationForCheck, variable: primaryVar } });
    }
    if (domainRestrictions.length > 0) {
      tools.push({ id: 'domain_restrictions', label: 'Show Domain Restrictions', restrictions: domainRestrictions, expression: normalizedExpr });
    }
    if (graphExpression && variables.length <= 1) {
      tools.push({ id: 'graph', label: 'Graph this', toolId: 'floatGraphWindow', params: { expression: graphExpression } });
    }
  } else if (domainRestrictions.length > 0) {
    tools.push({ id: 'domain_restrictions', label: 'Show Domain Restrictions', restrictions: domainRestrictions, expression: normalizedExpr });
  }

  // Geometry / Physics Simulation Lab handoff when topic maps cleanly
  if (simMatch && (domain === 'GEOMETRY' || domain === 'PHYSICS' || isTrig || isCalculus || domain === 'STATISTICS')) {
    tools.push({
      id: 'sim_lab',
      label: `Open ${simMatch.title.split('&')[0].trim()} Sim`,
      toolId: 'simLabOverlay',
      params: { simId: simMatch.id, simTitle: simMatch.title }
    });
  }

  // Try Another Method on non-withheld solvable math/physics prompts
  if (!withheld && (equationForCheck || isCalculus || domain === 'ALGEBRA' || domain === 'TRIGONOMETRY' || domain === 'PHYSICS' || domain === 'GEOMETRY')) {
    // Multi-line / multi-part problems are referenced (the server preserves the complete active
    // problem); embedding them would exceed the client handoff limit or embed a truncated fragment.
    const altBase = String(activeProblemState?.active?.fullProblemText || prompt || '');
    const isMultiPart = altBase.length > 160 || /\n/.test(altBase) || /\n/.test(prompt) || prompt.length > 160;
    tools.push({
      id: 'try_another_method',
      label: 'Try Another Method',
      prompt: isMultiPart
        ? 'Can you solve this problem using a different method and briefly compare the two approaches?'
        : `Can you solve "${prompt}" using a different method and briefly compare the two approaches?`
    });
  }

  if (tools.length === 0) return null;

  return {
    version: 1,
    originalProblem: prompt,
    normalizedExpression: normalizedExpr,
    graphExpression: graphExpression || null,
    equationForCheck: equationForCheck || null,
    expressionType,
    variables,
    domainRestrictions,
    verificationState,
    tools
  };
}

module.exports = {
  buildToolHandoffContract,
  extractLinearDenominatorRestrictions,
  normalizeMathForTools
};
