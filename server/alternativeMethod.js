/*
    alternativeMethod.js

    Pythos: "Try Another Method" / Alternative Solution Method & Method Comparison support.

    Responsibilities:
    1. Deterministically recognize alternative-method and method-comparison follow-ups
       ("Try another method.", "Can you solve that using Hamilton-Jacobi?",
       "Compare the two derivations.", "Can you use a numerical method instead?").
    2. Identify the complete active problem (all multi-line equations, parameter definitions,
       assumptions, and objectives) so it is never reduced to an isolated fragment.
    3. Detect which solution method(s) were already used in prior assistant derivations.
    4. Select a genuinely different applicable method (or honor the student's requested method).
    5. Emit an authoritative directive that preserves the complete problem, requires an
       independent re-derivation with verifiable intermediate equalities, and requests a
       structured comparison of the two approaches.

    This module is dependency-free (pure functions) so it can be required from contextManager,
    teachingIntelligence, studentIntentClassifier, server, and verificationBridge without cycles.
    It never solves problems and never awards verification status.
*/

// ---------------------------------------------------------------------------
// 1. Request detection
// ---------------------------------------------------------------------------

const ALT_METHOD_PATTERNS = [
  /\btry\s+(?:a(?:n)?\s+)?(?:another|different|alternative|other)\s+(?:method|approach|way|technique)\b/i,
  /\b(?:another|different|alternative|alternate|other|second)\s+(?:method|approach|technique|formulation)\b/i,
  /\b(?:solve|do|derive|redo|work)\s+(?:that|this|it|them|the\s+(?:[\w-]+\s+){0,3}(?:problem|question|derivation|equation|one))\s+(?:again\s+)?(?:using|with|via|by)\s+(?:the\s+)?[a-z][\w'\s-]{2,60}/i,
  /\b(?:use|using|try|apply)\s+(?:a\s+|an\s+|the\s+)?(?:numerical|graphical|hamilton[-\s]*jacobi|hamiltonian|lagrangian|killing[-\s]+vector|effective[-\s]+potential|quadratic\s+formula|completing\s+the\s+square|factoring|substitution|elimination|integration\s+by\s+parts|limit\s+definition|logarithmic\s+differentiation)(?:\s+(?:method|approach|formulation|formalism))?\s+instead\b/i,
  /\bcan\s+you\s+use\s+(?:a\s+|an\s+|the\s+)?(?:numerical|graphical|hamilton[-\s]*jacobi|hamiltonian|lagrangian|killing[-\s]+vector|effective[-\s]+potential|quadratic\s+formula|completing\s+the\s+square|factoring|substitution|elimination|integration\s+by\s+parts|limit\s+definition|logarithmic\s+differentiation)\b/i
];

const COMPARISON_PATTERNS = [
  /\bcompare\s+(?:the\s+)?(?:two|both|these|those)\s+(?:approaches|derivations|methods|solutions|techniques|formulations)\b/i,
  /\b(?:differences?|similarities)\s+between\s+(?:the\s+)?(?:two\s+|both\s+)?(?:approaches|derivations|methods|solutions|techniques|formulations)\b/i,
  /\bhow\s+do\s+(?:the\s+)?(?:two|both)\s+(?:approaches|derivations|methods|solutions)\s+(?:differ|compare)\b/i,
  /\bbriefly\s+compare\b/i
];

// Generic phrases that must never be treated as an alternative-method request
// ("explain it another way" is a reframe request, not a new solution method).
const REFRAME_ONLY = /\b(?:explain|say|put|phrase|tell)\b[^.?!]*\b(?:differently|another\s+way|other\s+way|different\s+way|simpler)\b/i;

function isAlternativeMethodRequest(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim();
  if (!t || t.length > 900) return false;
  if (REFRAME_ONLY.test(t) && !/\bmethod|approach|technique|formulation\b/i.test(t)) return false;
  return ALT_METHOD_PATTERNS.some(re => re.test(t));
}

function isMethodComparisonRequest(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim();
  if (!t || t.length > 900) return false;
  return COMPARISON_PATTERNS.some(re => re.test(t));
}

/** True for any follow-up that refers back to the active problem's solution method. */
function isMethodFollowUpRequest(text) {
  return isAlternativeMethodRequest(text) || isMethodComparisonRequest(text);
}

// ---------------------------------------------------------------------------
// 2. Method catalog
// ---------------------------------------------------------------------------

const METHODS = Object.freeze({
  LAGRANGIAN: { id: 'LAGRANGIAN', label: 'Lagrangian (Euler-Lagrange) formulation', re: /\b(?:lagrangian|euler[-\s]*lagrange)\b/i, family: 'MECHANICS' },
  HAMILTON_JACOBI: { id: 'HAMILTON_JACOBI', label: 'Hamilton-Jacobi formulation', re: /\bhamilton[-\s]*jacobi\b/i, family: 'MECHANICS' },
  HAMILTONIAN: { id: 'HAMILTONIAN', label: "Hamiltonian formulation (Hamilton's equations)", re: /\bhamiltonian\s+(?:formulation|formalism|mechanics|approach|method)\b|\bhamilton'?s\s+equations\b/i, family: 'MECHANICS' },
  KILLING_EFFECTIVE_POTENTIAL: { id: 'KILLING_EFFECTIVE_POTENTIAL', label: 'Killing-vector conserved quantities with null normalization (effective-potential method)', re: /\bkilling\s+vectors?\b|\beffective[-\s]+potential\s+(?:method|approach)\b/i, family: 'MECHANICS' },
  NUMERICAL: { id: 'NUMERICAL', label: 'Numerical method', re: /\bnumerical(?:ly)?\b|\bnewton'?s\s+method\b|\brunge[-\s]*kutta\b|\bbisection\b/i, family: 'ANY' },
  GRAPHICAL: { id: 'GRAPHICAL', label: 'Graphical method', re: /\bgraphical(?:ly)?\b|\bgraph(?:ing)?\s+(?:method|approach)\b/i, family: 'ANY' },
  FACTORING: { id: 'FACTORING', label: 'Factoring', re: /\bfactor(?:ing|ise|ize|ization|isation)\b|\bby\s+factoring\b/i, family: 'ALGEBRA' },
  QUADRATIC_FORMULA: { id: 'QUADRATIC_FORMULA', label: 'Quadratic formula', re: /\bquadratic\s+formula\b/i, family: 'ALGEBRA' },
  COMPLETING_SQUARE: { id: 'COMPLETING_SQUARE', label: 'Completing the square', re: /\bcompleting\s+the\s+square\b|\bcomplete\s+the\s+square\b/i, family: 'ALGEBRA' },
  SUBSTITUTION: { id: 'SUBSTITUTION', label: 'Substitution', re: /\b(?:u-?)?substitution\b/i, family: 'ANY' },
  ELIMINATION: { id: 'ELIMINATION', label: 'Elimination', re: /\belimination\b/i, family: 'ALGEBRA' },
  INTEGRATION_BY_PARTS: { id: 'INTEGRATION_BY_PARTS', label: 'Integration by parts', re: /\bintegration\s+by\s+parts\b/i, family: 'CALCULUS' },
  POWER_RULE: { id: 'POWER_RULE', label: 'Power rule (term-by-term)', re: /\bpower\s+rule\b/i, family: 'CALCULUS' },
  LIMIT_DEFINITION: { id: 'LIMIT_DEFINITION', label: 'Limit definition (first principles)', re: /\blimit\s+definition\b|\bfirst\s+principles\b/i, family: 'CALCULUS' },
  LOG_DIFFERENTIATION: { id: 'LOG_DIFFERENTIATION', label: 'Logarithmic differentiation', re: /\blogarithmic\s+differentiation\b/i, family: 'CALCULUS' },
  RIEMANN_SUM: { id: 'RIEMANN_SUM', label: 'Riemann-sum / definition-of-the-integral reasoning with verification by differentiation', re: /\briemann\s+sums?\b/i, family: 'CALCULUS' }
});

// Genuinely distinct alternatives, ordered by pedagogical preference.
const ALTERNATIVES = Object.freeze({
  LAGRANGIAN: ['HAMILTON_JACOBI', 'KILLING_EFFECTIVE_POTENTIAL', 'HAMILTONIAN'],
  HAMILTON_JACOBI: ['LAGRANGIAN', 'KILLING_EFFECTIVE_POTENTIAL'],
  HAMILTONIAN: ['LAGRANGIAN', 'HAMILTON_JACOBI'],
  KILLING_EFFECTIVE_POTENTIAL: ['HAMILTON_JACOBI', 'LAGRANGIAN'],
  FACTORING: ['QUADRATIC_FORMULA', 'COMPLETING_SQUARE'],
  QUADRATIC_FORMULA: ['FACTORING', 'COMPLETING_SQUARE'],
  COMPLETING_SQUARE: ['QUADRATIC_FORMULA', 'FACTORING'],
  SUBSTITUTION: ['ELIMINATION', 'GRAPHICAL'],
  ELIMINATION: ['SUBSTITUTION', 'GRAPHICAL'],
  POWER_RULE: ['LIMIT_DEFINITION'],
  LIMIT_DEFINITION: ['POWER_RULE'],
  LOG_DIFFERENTIATION: ['POWER_RULE'],
  INTEGRATION_BY_PARTS: ['SUBSTITUTION'],
  NUMERICAL: [],
  GRAPHICAL: []
});

function detectMethodsInText(text) {
  const found = [];
  if (!text || typeof text !== 'string') return found;
  for (const m of Object.values(METHODS)) {
    const matches = text.match(new RegExp(m.re.source, 'gi'));
    if (matches && matches.length) found.push({ id: m.id, count: matches.length, firstIndex: text.search(m.re) });
  }
  return found.sort((a, b) => (b.count - a.count) || (a.firstIndex - b.firstIndex));
}

/** Method explicitly named by the student in the follow-up turn (e.g. "using Hamilton-Jacobi"). */
function detectRequestedMethod(userText) {
  if (!userText || typeof userText !== 'string') return null;
  // Strip the "compare ... approaches" clause so method names inside it don't get misread
  const t = userText;
  const ordered = ['HAMILTON_JACOBI', 'HAMILTONIAN', 'KILLING_EFFECTIVE_POTENTIAL', 'LAGRANGIAN', 'NUMERICAL', 'GRAPHICAL',
    'QUADRATIC_FORMULA', 'COMPLETING_SQUARE', 'FACTORING', 'INTEGRATION_BY_PARTS', 'LIMIT_DEFINITION',
    'LOG_DIFFERENTIATION', 'POWER_RULE', 'ELIMINATION', 'SUBSTITUTION', 'RIEMANN_SUM'];
  for (const id of ordered) {
    if (METHODS[id].re.test(t)) return id;
  }
  return null;
}

// ---------------------------------------------------------------------------
// 3. Problem-structure extraction
// ---------------------------------------------------------------------------

function inferProblemFamily(problemText = '', domain = '', subtype = '') {
  const s = `${problemText} ${domain} ${subtype}`;
  if (/\b(?:schwarzschild|geodesic|lagrangian|hamiltonian|hamilton[-\s]*jacobi|metric|photon\s+sphere|impact\s+parameter|euler[-\s]*lagrange|killing|relativity|THEORETICAL_MECHANICS)\b/i.test(s)) return 'MECHANICS';
  if (/\b(?:derivative|differentiate|integral|integrate|antiderivative|limit|CALCULUS)\b/i.test(s)) return 'CALCULUS';
  if (/\b(?:system|simultaneous)\b/i.test(s) && (s.match(/=/g) || []).length >= 2) return 'SYSTEM';
  if (/\^\s*2|²|\bquadratic\b|QUADRATIC/i.test(s)) return 'QUADRATIC';
  return 'GENERAL';
}

function extractProblemStructure(problemText = '') {
  const text = String(problemText || '');
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const equations = [];
  let current = null;
  for (const line of lines) {
    const isContinuation = current && /^[+\-−*/]/.test(line) && !/^\d+\.\s/.test(line);
    if (isContinuation) {
      current += ' ' + line;
      continue;
    }
    if (current) { equations.push(current); current = null; }
    if (/=/.test(line) && !/^\\\[|^\\\]$/.test(line)) current = line;
  }
  if (current) equations.push(current);

  const parameterDefinitions = [];
  const defRe = /\bwhere\s+([^.\n]+?=[^.\n]+?)(?:\s+is\b[^.\n]*)?(?:[.\n]|$)/gi;
  let dm;
  while ((dm = defRe.exec(text)) !== null) parameterDefinitions.push(dm[1].replace(/\$/g, '').trim());

  const assumptions = [];
  const asmRe = /\b(?:assume|assuming|in\s+the\s+equatorial\s+plane|null\s+geodesic|neglect(?:ing)?|non-rotating|uncharged)\b[^.\n]*/gi;
  let am;
  while ((am = asmRe.exec(text)) !== null) assumptions.push(am[0].trim());

  const objectives = lines.filter(l => /^\d+[.)]\s+/.test(l)).map(l => l.replace(/^\d+[.)]\s+/, '').trim());

  return { equations, parameterDefinitions, assumptions, objectives };
}

function extractBalancedBoxed(text = '') {
  const out = [];
  const s = String(text || '');
  let idx = s.indexOf('\\boxed{');
  while (idx !== -1 && out.length < 6) {
    let depth = 0;
    let j = idx + 6;
    let start = j + 1;
    for (; j < s.length; j++) {
      if (s[j] === '{') depth++;
      else if (s[j] === '}') { depth--; if (depth === 0) break; }
    }
    if (depth === 0 && j < s.length) out.push(s.slice(start, j).trim());
    idx = s.indexOf('\\boxed{', j + 1);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 4. Context analysis & directive
// ---------------------------------------------------------------------------

function findActiveProblemStartIndex(conversationHistory, problemText) {
  if (!Array.isArray(conversationHistory) || !problemText) return 0;
  for (let i = conversationHistory.length - 1; i >= 0; i--) {
    const m = conversationHistory[i];
    if (m && m.role === 'user' && typeof m.content === 'string' && m.content.trim() === String(problemText).trim()) return i;
  }
  return 0;
}

/**
 * Analyzes an alternative-method / method-comparison follow-up against the conversation.
 * Returns null when the turn is not a method follow-up or no active problem exists.
 */
function analyzeAlternativeMethodContext({ userText = '', conversationHistory = [], activeProblemState = null } = {}) {
  const isAlt = isAlternativeMethodRequest(userText);
  const isCompare = isMethodComparisonRequest(userText);
  if (!isAlt && !isCompare) return null;

  const act = activeProblemState && activeProblemState.active ? activeProblemState.active : null;
  const history = Array.isArray(conversationHistory) ? conversationHistory : [];

  let fullProblemStatement = act ? (act.fullProblemText || act.initialUserPrompt || act.activeExpression || '') : '';
  if (!fullProblemStatement) {
    const firstUser = history.find(m => m && m.role === 'user' && typeof m.content === 'string' && !isMethodFollowUpRequest(m.content));
    fullProblemStatement = firstUser ? firstUser.content : '';
  }
  if (!fullProblemStatement) return null;

  const startIdx = findActiveProblemStartIndex(history, fullProblemStatement);
  const priorAssistant = history.slice(startIdx).filter(m => m && m.role === 'assistant' && typeof m.content === 'string');
  const priorText = priorAssistant.map(m => m.content).join('\n\n');

  const methodsUsed = detectMethodsInText(priorText).map(m => m.id);
  // The method explicitly requested in the original problem statement counts as the first method used.
  const problemMethods = detectMethodsInText(fullProblemStatement).map(m => m.id);
  const previousMethodId = methodsUsed[0] || problemMethods[0] || null;

  const family = inferProblemFamily(fullProblemStatement, act?.domain, act?.subtype);
  const requestedMethodId = detectRequestedMethod(userText);

  let targetMethodId = null;
  let selectionSource = 'automatic';
  if (requestedMethodId && requestedMethodId !== previousMethodId) {
    targetMethodId = requestedMethodId;
    selectionSource = 'student_requested';
  } else if (isAlt) {
    const candidates = (previousMethodId && ALTERNATIVES[previousMethodId]) || [];
    targetMethodId = candidates.find(id => !methodsUsed.includes(id)) || candidates[0] || null;
    if (!targetMethodId) {
      if (family === 'MECHANICS') targetMethodId = previousMethodId === 'HAMILTON_JACOBI' ? 'LAGRANGIAN' : 'HAMILTON_JACOBI';
      else if (family === 'QUADRATIC') targetMethodId = previousMethodId === 'QUADRATIC_FORMULA' ? 'COMPLETING_SQUARE' : 'QUADRATIC_FORMULA';
      else if (family === 'CALCULUS') targetMethodId = /\bintegra/i.test(fullProblemStatement) ? 'RIEMANN_SUM' : 'LIMIT_DEFINITION';
      else if (family === 'SYSTEM') targetMethodId = previousMethodId === 'ELIMINATION' ? 'SUBSTITUTION' : 'ELIMINATION';
    }
  }

  const comparisonOnly = isCompare && !isAlt;
  const secondMethodInHistory = methodsUsed.find(id => id !== previousMethodId) || null;

  return {
    isAlternativeMethodRequest: isAlt,
    isComparisonRequest: isCompare,
    comparisonOnly,
    fullProblemStatement,
    problemFamily: family,
    structure: extractProblemStructure(fullProblemStatement),
    previousMethod: previousMethodId ? METHODS[previousMethodId].label : null,
    previousMethodId,
    methodsUsed,
    requestedMethodId,
    targetMethod: targetMethodId ? METHODS[targetMethodId].label : null,
    targetMethodId,
    comparedMethodId: comparisonOnly ? (secondMethodInHistory || targetMethodId) : targetMethodId,
    selectionSource,
    priorKeyResults: extractBalancedBoxed(priorText).slice(-4)
  };
}

const METHOD_GUIDANCE = Object.freeze({
  HAMILTON_JACOBI: 'Start from the Hamilton-Jacobi equation for null geodesics, g^{\\mu\\nu}\\,\\partial_\\mu S\\,\\partial_\\nu S = 0, separate the principal function (e.g. S = -Et + L\\phi + S_r(r) in the equatorial plane), obtain the radial equation from the separation, and derive every requested result from it.',
  LAGRANGIAN: 'Write the Lagrangian for the geodesic, apply the Euler-Lagrange equations to obtain the conserved quantities and the radial equation, then derive every requested result.',
  KILLING_EFFECTIVE_POTENTIAL: 'Use the Killing vectors of the spacetime to write the conserved quantities directly, impose the null (or timelike) normalization of the tangent vector, and analyse the resulting effective potential.',
  HAMILTONIAN: "Construct the Hamiltonian H = \\tfrac{1}{2} g^{\\mu\\nu} p_\\mu p_\\nu, apply Hamilton's equations, identify cyclic coordinates and conserved momenta, and derive every requested result.",
  NUMERICAL: 'Set up an explicit numerical procedure (state the algorithm, initial guess/step size, and stopping criterion), show representative iterations, and compare the numerical result with the exact result to the stated precision. Clearly label numerical values as approximations.',
  QUADRATIC_FORMULA: 'Identify a, b, c, compute the discriminant, and apply x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}.',
  COMPLETING_SQUARE: 'Rewrite the equation in the form (x + d)^2 = k by completing the square, then take square roots.',
  FACTORING: 'Factor the expression into linear factors and apply the zero-product property.',
  LIMIT_DEFINITION: 'Use the limit definition f\'(x) = \\lim_{h \\to 0} \\frac{f(x+h) - f(x)}{h}, expanding and simplifying before taking the limit.',
  POWER_RULE: 'Apply the power rule term by term, showing each term.',
  RIEMANN_SUM: 'Justify the antiderivative independently (e.g. by differentiating the proposed antiderivative to recover the integrand, or via a Riemann-sum argument for a definite integral).'
});

function formatAlternativeMethodDirective(ctx, { tutorMode = false } = {}) {
  if (!ctx) return '';
  const problem = String(ctx.fullProblemStatement || '').slice(0, 3500);
  const lines = [];
  lines.push('\n\n[ALTERNATIVE SOLUTION METHOD & COMPARISON DIRECTIVE]');
  lines.push('The student is asking about a DIFFERENT SOLUTION METHOD for the ACTIVE PROBLEM below. This is a follow-up on the same problem, NOT a new problem.');
  lines.push('COMPLETE ORIGINAL PROBLEM (authoritative — preserve every equation, metric component, parameter definition, assumption, constraint, and objective; never reduce it to a single line or fragment):');
  lines.push('"""');
  lines.push(problem);
  lines.push('"""');
  if (ctx.structure && ctx.structure.equations.length > 1) {
    lines.push(`- The problem contains ${ctx.structure.equations.length} equations/relations; all of them remain part of the problem.`);
  }
  if (ctx.structure && ctx.structure.parameterDefinitions.length > 0) {
    lines.push(`- Parameter definitions to preserve: ${ctx.structure.parameterDefinitions.join('; ')}`);
  }
  if (ctx.structure && ctx.structure.objectives.length > 0) {
    lines.push(`- Original objectives (${ctx.structure.objectives.length}) must all still be addressed by the alternative derivation.`);
  }
  lines.push(`- Method already used: ${ctx.previousMethod || 'the method shown in the previous assistant response (identify it explicitly)'}`);
  if (ctx.priorKeyResults && ctx.priorKeyResults.length > 0) {
    lines.push(`- Previously stated key results (to be re-derived independently, not copied): ${ctx.priorKeyResults.join(' ; ')}`);
  }

  if (ctx.comparisonOnly) {
    const second = ctx.comparedMethodId ? (Object.values(METHODS).find(m => m.id === ctx.comparedMethodId) || {}).label : null;
    lines.push(`- Methods to compare: ${ctx.previousMethod || 'first method'} vs. ${second || 'the alternative method discussed'}.`);
    lines.push('INSTRUCTIONS:');
    lines.push('1. Compare the two approaches for THIS problem in a structured way covering: (a) mathematical foundations, (b) conserved quantities and how each method obtains them, (c) the sequence of derivation steps, (d) advantages, and (e) limitations.');
    lines.push('2. Do not invent new numerical results; reference results as derived earlier and state any key equality explicitly so it can be verified.');
  } else {
    const target = ctx.targetMethod || 'a genuinely different applicable method (state which one)';
    lines.push(`- Alternative method to use: ${target}${ctx.selectionSource === 'student_requested' ? ' (explicitly requested by the student)' : ''}`);
    const guide = ctx.targetMethodId && METHOD_GUIDANCE[ctx.targetMethodId];
    if (guide) lines.push(`- Method outline: ${guide}`);
    lines.push('INSTRUCTIONS:');
    lines.push(`1. Re-derive the solution INDEPENDENTLY using ${target}. Do NOT repeat the previous method and do NOT simply restate earlier results.`);
    lines.push('2. Work on the COMPLETE problem above. Never treat an isolated equation fragment (for example, a single metric term) as an algebraic equation to solve.');
    lines.push('3. Write intermediate calculus/algebraic steps as explicit symbolic equalities and put each final result in \\boxed{...} so every step can be independently verified by CAS.');
    lines.push('4. Finish with a brief structured comparison of the two approaches: mathematical foundations, conserved quantities, derivation steps, advantages, and limitations.');
    lines.push('5. If the two methods disagree anywhere, say so explicitly rather than forcing agreement.');
  }
  if (tutorMode) {
    lines.push('TUTOR MODE NOTE: Tutor Mode rules take precedence — introduce the alternative method progressively (setup and first verified step only) unless the student asked for the full solution.');
  }
  return lines.join('\n');
}

module.exports = {
  METHODS,
  ALTERNATIVES,
  isAlternativeMethodRequest,
  isMethodComparisonRequest,
  isMethodFollowUpRequest,
  detectMethodsInText,
  detectRequestedMethod,
  extractProblemStructure,
  extractBalancedBoxed,
  inferProblemFamily,
  analyzeAlternativeMethodContext,
  formatAlternativeMethodDirective
};
