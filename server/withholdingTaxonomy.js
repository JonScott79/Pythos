/**
 * server/withholdingTaxonomy.js
 *
 * Authoritative taxonomy, evidence-based diagnostic extraction, and student-facing
 * copy for Pythos Safe Withholding.
 *
 * Core Principles:
 * 1. Say what actually went wrong and what specific info (if any) Pythos needs.
 * 2. Never blame the student or say "I need more information" when a verification
 *    step failed, divided by zero, or hit a temporary service hiccup.
 * 3. Never expose internal terminology: stack traces, server paths, API keys,
 *    provider/model IDs, worker names, database identifiers, or raw exceptions.
 * 4. Do not invent diagnostic details when structured evidence is insufficient.
 */

const WITHHOLDING_REASONS = {
  MISSING_INFORMATION: 'MISSING_INFORMATION',
  AMBIGUOUS_PROBLEM: 'AMBIGUOUS_PROBLEM',
  IMAGE_UNVERIFIABLE: 'IMAGE_UNVERIFIABLE',
  CLAIM_NOT_VERIFIED: 'CLAIM_NOT_VERIFIED',
  UNDEFINED_EXPRESSION: 'UNDEFINED_EXPRESSION',
  PROMPT_CLAIM_MISMATCH: 'PROMPT_CLAIM_MISMATCH',
  INFRASTRUCTURE_FAILURE: 'INFRASTRUCTURE_FAILURE',
  DUAL_PROVIDER_FAILURE: 'DUAL_PROVIDER_FAILURE',
  UNSUPPORTED_PROBLEM: 'UNSUPPORTED_PROBLEM',
  MALFORMED_SYNTAX: 'MALFORMED_SYNTAX'
};

const SAFE_WITHHOLDING_CONFIG = {
  MISSING_INFORMATION: {
    code: 'MISSING_INFORMATION',
    headline: "I'm missing a specific piece of information needed to finish this problem.",
    explanation: "To solve this reliably, I need the missing value, bound, measurement, or variable from the problem.",
    cause: "The problem statement is missing an essential value, boundary condition, or target variable needed for a unique solution.",
    help: "Supply the specific missing number, interval bound, diagram measurement, or variable to solve for.",
    nextStep: "Add the missing detail to your message and send it again."
  },
  AMBIGUOUS_PROBLEM: {
    code: 'AMBIGUOUS_PROBLEM',
    headline: "This problem can be read in more than one mathematical way.",
    explanation: "Two different interpretations lead to different answers, so I held back rather than guessing which one you meant.",
    cause: "Part of the expression or question has multiple valid mathematical readings (such as unparenthesized division order or unspecified angle units).",
    help: "Add parentheses to group fractions/products clearly, specify degrees vs. radians, or clarify which quantity you want.",
    nextStep: "Clarify the intended grouping or quantity and submit the problem again."
  },
  IMAGE_UNVERIFIABLE: {
    code: 'IMAGE_UNVERIFIABLE',
    headline: "I can see the image, but a label or measurement isn't clear enough to verify.",
    explanation: "I couldn't confirm all of the numbers, symbols, or diagram markings in the image well enough to certify the solution.",
    cause: "One or more measurements, exponents, angle markers, or equation terms in the image could not be read reliably.",
    help: "Upload a sharper/closer crop of the problem, or type the given numbers and equation directly into chat.",
    nextStep: "Confirm the labels or type the equation text into your message so I can solve it cleanly."
  },
  CLAIM_NOT_VERIFIED: {
    code: 'CLAIM_NOT_VERIFIED',
    headline: "I checked part of this problem, but I couldn't confirm the final answer.",
    explanation: "Some intermediate steps checked out, or the main result couldn't be verified independently, so I held back rather than guessing.",
    cause: "Pythos could not independently confirm every mathematical step needed to verify the final answer.",
    help: "Checking each step independently prevents wrong numbers or unverified jumps from slipping through.",
    nextStep: "Try sending just the equation on its own, or ask me to walk through it one step at a time."
  },
  UNDEFINED_EXPRESSION: {
    code: 'UNDEFINED_EXPRESSION',
    headline: "This expression hits an undefined mathematical value.",
    explanation: "Under the real numbers, part of this expression evaluates to an undefined operation (such as dividing by zero or taking an even root of a negative value).",
    cause: "The expression triggers division by zero, an undefined trig point, or a real-domain violation.",
    help: "Check denominators, reciprocal trig functions (csc, sec, cot), logarithms, and square-root domains for excluded values.",
    nextStep: "Exclude any undefined values (or tell me if you want complex solutions) and try again."
  },
  PROMPT_CLAIM_MISMATCH: {
    code: 'PROMPT_CLAIM_MISMATCH',
    headline: "My draft solution didn't match what you asked for.",
    explanation: "The solution I checked answered a slightly different equation, variable, or constraint than the one in your question.",
    cause: "The checked solution solved for a different quantity or missed a constraint from your question.",
    help: "Keep constraints like positive roots or angle units (degrees vs. radians) clear, or name the variable you want solved.",
    nextStep: "Try sending the problem again (or specify the exact variable or condition you want)."
  },
  INFRASTRUCTURE_FAILURE: {
    code: 'INFRASTRUCTURE_FAILURE',
    headline: "Verification was interrupted by a temporary service hiccup.",
    explanation: "My verification check timed out or hit a brief delay before finishing — nothing is wrong with your question.",
    cause: "A temporary processing delay interrupted verification before the answer could be confirmed.",
    help: "Waiting a few seconds and resending usually clears temporary busyness.",
    nextStep: "Please send your question again in a moment."
  },
  DUAL_PROVIDER_FAILURE: {
    code: 'DUAL_PROVIDER_FAILURE',
    headline: "I'm temporarily unable to reach my solving services right now.",
    explanation: "I couldn't connect to a live solver to finish this problem safely at the moment.",
    cause: "Solving capacity was temporarily unavailable or busy during this request.",
    help: "Wait a few moments for service capacity to clear before resending.",
    nextStep: "Please resend your question in a few moments."
  },
  UNSUPPORTED_PROBLEM: {
    code: 'UNSUPPORTED_PROBLEM',
    headline: "I can't independently verify this type of problem yet.",
    explanation: "I don't currently have an independent checker for this topic, and I'd rather be upfront than guess.",
    cause: "This topic falls outside what Pythos can verify automatically right now.",
    help: "Pythos checks arithmetic, algebra, polynomial and trig equations, calculus, geometry, physics kinematics/units, and basic probability.",
    nextStep: "Try breaking the question into algebraic, calculus, trig, geometry, or physics steps I can check."
  },
  MALFORMED_SYNTAX: {
    code: 'MALFORMED_SYNTAX',
    headline: "The formatting on this problem looks a little weird.",
    explanation: "A symbol, exponent, delimiter, or operator appears misplaced or incomplete, so I can't parse it reliably without guessing.",
    cause: "The submitted mathematical expression has a structural formatting issue (such as a dangling operator, misplaced exponent argument, or unmatched delimiter).",
    help: "Check for stray operators inside exponents, missing closing parentheses or braces, or incomplete fractions.",
    nextStep: "Fix the formatting and send the problem again."
  }
};

const UNSAFE_INTERNAL_PATTERN = new RegExp(
  [
    'traceback',
    'stack trace',
    '\\bat\\s+[a-zA-Z0-9_$.]+\\s*\\(',
    '[a-zA-Z]:\\\\[^\\s]+',
    '/(?:app|server|usr|var|home|opt)/[^\\s]+',
    '\\b[a-zA-Z0-9_-]+\\.(?:js|py)\\b',
    '\\b(?:sk-[a-zA-Z0-9_-]{8,}|gsk_[a-zA-Z0-9_-]{8,}|AIza[a-zA-Z0-9_-]{8,}|Bearer\\s+[a-zA-Z0-9._-]+)\\b',
    '\\b(?:groq-text|ollama-text|openai/gpt-oss|gemini-[0-9a-z-]+|VerifierWorker|CalculusWorker|firestore|app_staging|users_staging|pythos_chats)\\b',
    '\\b(?:ECONNREFUSED|ETIMEDOUT|ENOTFOUND|TypeError:|ReferenceError:|SyntaxError:|CAS_QUEUE_SATURATED|CAS_CIRCUIT_OPEN|CAS_TIMEOUT|CAS_PIPE_ERROR)\\b'
  ].join('|'),
  'i'
);

function sanitizeDynamicText(val, maxLen = 220) {
  if (typeof val !== 'string') return '';
  return val
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<\/?[a-zA-Z!][a-zA-Z0-9-]*(?:[\s/][^>]*)?>/g, '')
    .replace(/\bon[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript\s*:/gi, '')
    .replace(/`/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

function isSafePublicDetail(val) {
  const s = sanitizeDynamicText(val, 400);
  if (!s) return false;
  return !UNSAFE_INTERNAL_PATTERN.test(s);
}

function sanitizePublicDetail(val, maxLen = 220) {
  if (!isSafePublicDetail(val)) return '';
  return sanitizeDynamicText(val, maxLen);
}

function sanitizePlainDetailsText(val, maxLen = 280) {
  const safe = sanitizePublicDetail(val, maxLen);
  if (!safe) return '';
  return safe
    .replace(/^(?:\\\[|\\\(|\\?\$\$?)\s*|\s*(?:\\\]|\\\)|\\?\$\$?)$/g, '')
    .replace(/\\left\s*([([])/g, '$1')
    .replace(/\\right\s*([)\]])/g, '$1')
    .replace(/`/g, '')
    .replace(/->/g, '→')
    .trim();
}

function humanizeFidelityReasonText(rawReason) {
  let msg = sanitizePlainDetailsText(rawReason, 220);
  if (!msg) return '';
  msg = msg
    .replace(/^Prompt-to-claim fidelity mismatch:\s*/i, '')
    .replace(/\bPrompt requested\b/gi, 'You asked for')
    .replace(/\bcandidate claim\b/gi, 'the draft step')
    .replace(/\bcandidate\b/gi, 'the draft answer')
    .replace(/\bequation_solution\b/g, 'equation solution')
    .replace(/\bsystem_solution\b/g, 'system solution')
    .replace(/\bcoterminal_angle\b/g, 'coterminal angle')
    .replace(/\bfunction_evaluation\b/g, 'function evaluation')
    .replace(/\bgeometry_area\b/g, 'triangle area')
    .replace(/\bkinematics_velocity\b/g, 'velocity calculation')
    .replace(/\bsymbolic_equivalence\b/g, 'algebraic equivalence')
    .replace(/\bclaim was established\b/gi, 'step could be verified')
    .replace(/\bprimary claim\b/gi, 'main answer');
  return msg.trim();
}

function classifyAndTranslateFidelityOutcome(promptFidelity, combinedReasons = '') {
  const rawReason = String(promptFidelity?.reason || '');
  const lowerReason = rawReason.toLowerCase();
  const hasExplicitMismatchPhrase = /(?:different equation|mutated|but candidate|answered .* instead|differentiated .* instead|prompt requested (?:variable|perimeter|diameter|smaller|larger|total|average|discount|error|positive|non-zero)|fidelity mismatch)/i.test(
    `${rawReason} ${combinedReasons}`
  );
  const isUncertaintyPattern = Boolean(
    promptFidelity?.isUncertainty === true ||
    (!hasExplicitMismatchPhrase && (
      promptFidelity?.primaryClaimStatus === 'UNKNOWN' ||
      /no verified .* claim was established|intermediate arithmetic alone cannot certify|primary domain claim could not be verified|returned unknown/i.test(lowerReason)
    ))
  );

  if (isUncertaintyPattern) {
    let target = promptFidelity?.uncertaintyTarget || '';
    if (!target) {
      if (/equation_solution|system_solution|solving an equation/i.test(lowerReason)) target = 'final equation solution';
      else if (/coterminal/i.test(lowerReason)) target = 'final coterminal angle';
      else if (/function_evaluation|function evaluation/i.test(lowerReason)) target = 'final function value';
      else if (/geometry_area|geometry area/i.test(lowerReason)) target = 'triangle area';
      else if (/kinematics|velocity/i.test(lowerReason)) target = 'final velocity result';
      else if (/antiderivative|integral/i.test(lowerReason)) target = 'final antiderivative';
      else if (/derivative/i.test(lowerReason)) target = 'final derivative';
      else target = 'final result';
    }
    const targetPhrase = target.startsWith('final ') ? target : `final ${target}`;
    return {
      kind: 'UNCERTAINTY',
      overrides: {
        diagnosticHeadline: `I checked the calculation steps, but I couldn't confirm the ${targetPhrase} yet.`,
        diagnosticExplanation: `The intermediate calculations look consistent, but I couldn't independently confirm the ${targetPhrase} yet. Let's work through it one step at a time.`,
        diagnosticCause: `Intermediate calculations were checked, while the ${targetPhrase} could not be confirmed automatically.`,
        diagnosticHelp: "Sharing the single equation or asking to check one step at a time makes full verification easier.",
        diagnosticNextStep: "Send just the core equation on its own, or share the next step you'd like to check."
      }
    };
  }

  const humanized = humanizeFidelityReasonText(rawReason);
  return {
    kind: 'MISMATCH',
    overrides: humanized
      ? {
          diagnosticExplanation: humanized,
          diagnosticCause: humanized
        }
      : null
  };
}

function getSafeWithholding(reasonCode, overrides = null) {
  const cfg = SAFE_WITHHOLDING_CONFIG[reasonCode] || SAFE_WITHHOLDING_CONFIG.CLAIM_NOT_VERIFIED;
  const result = { ...cfg };

  if (overrides && typeof overrides === 'object' && !Array.isArray(overrides)) {
    const weirdSnippet = sanitizePublicDetail(overrides.weirdSnippet, 120);
    const rawSuggestedFix = typeof overrides.suggestedFix === 'string' ? overrides.suggestedFix.trim() : '';
    const isSuggestedFixConciseMath =
      rawSuggestedFix.length > 0 &&
      rawSuggestedFix.length <= 180 &&
      !/\b[a-zA-Z]{4,}\s+[a-zA-Z]{4,}\s+[a-zA-Z]{4,}\b/.test(rawSuggestedFix.replace(/\\[a-zA-Z]+/g, ''));
    const suggestedFix = isSuggestedFixConciseMath ? sanitizePublicDetail(rawSuggestedFix, 200) : '';
    const anomalyExplanation = sanitizePublicDetail(overrides.anomalyExplanation, 260);
    const diagnosticHeadline = sanitizePublicDetail(overrides.diagnosticHeadline, 140);
    const diagnosticExplanation = sanitizePublicDetail(overrides.diagnosticExplanation, 280);
    const diagnosticCause = sanitizePlainDetailsText(overrides.diagnosticCause, 280);
    const diagnosticHelp = sanitizePlainDetailsText(overrides.diagnosticHelp, 240);
    const diagnosticNextStep = sanitizePlainDetailsText(overrides.diagnosticNextStep, 220);

    if (diagnosticHeadline) {
      result.headline = diagnosticHeadline;
    }
    if (diagnosticExplanation) {
      result.explanation = diagnosticExplanation;
    }
    if (diagnosticCause) {
      result.cause = diagnosticCause;
    }
    if (diagnosticHelp) {
      result.help = diagnosticHelp;
    }
    if (diagnosticNextStep) {
      result.nextStep = diagnosticNextStep;
    }

    if (anomalyExplanation) {
      result.explanation = anomalyExplanation;
      result.cause = weirdSnippet
        ? sanitizePlainDetailsText(`${anomalyExplanation} (Spotted near ${weirdSnippet}.)`, 280)
        : sanitizePlainDetailsText(anomalyExplanation, 280);
    } else if (weirdSnippet && !diagnosticExplanation) {
      result.explanation = `${cfg.explanation} Specifically, ${weirdSnippet} looks misformatted.`;
      result.cause = sanitizePlainDetailsText(`Misplaced or incomplete formatting near ${weirdSnippet}.`, 280);
    }

    if (suggestedFix) {
      const hasMathDelimiters = /^(?:\\\(|\\\[|\$\$?)/.test(suggestedFix);
      const renderedFix = hasMathDelimiters
        ? suggestedFix
        : (/[\\^_{}]/.test(suggestedFix) ? `\\( ${suggestedFix} \\)` : suggestedFix);
      const isDisplayBlock = /^(?:\\\[|\$\$)/.test(renderedFix);
      const followUpPrompt = isDisplayBlock
        ? `Did you mean:\n\n${renderedFix}\n\nGo ahead and send that (or tweak your equation), and I'll solve it right away.`
        : `Did you mean ${renderedFix}? Go ahead and send that (or tweak your equation), and I'll solve it right away.`;
      result.explanation = `${result.explanation}\n\n${followUpPrompt}`;
      const plainFix = sanitizePlainDetailsText(suggestedFix, 200);
      result.nextStep = `Try sending ${plainFix || suggestedFix} and I'll solve it right away.`;
      result.suggestedFix = plainFix || suggestedFix;
    }
  }

  result.cause = sanitizePlainDetailsText(result.cause, 280) || cfg.cause;
  result.help = sanitizePlainDetailsText(result.help, 240) || cfg.help;
  result.nextStep = sanitizePlainDetailsText(result.nextStep, 220) || cfg.nextStep;

  return {
    ...result,
    formattedContent: `${result.headline}\n\n${result.explanation}`
  };
}

function parseUnresolvedSymbols(text) {
  const m = String(text || '').match(/unresolved\s+symbols?\s*\[([^\]]+)\]/i);
  if (!m) return [];
  return m[1]
    .split(',')
    .map(s => s.replace(/['"\s]/g, '').trim())
    .filter(s => /^[a-zA-Z_][a-zA-Z0-9_]{0,12}$/.test(s));
}

function formatValuesList(vals, limit = 4) {
  if (!Array.isArray(vals) || vals.length === 0) return '';
  const cleaned = vals
    .slice(0, limit)
    .map(v => {
      if (typeof v === 'object' && v !== null && v.solution !== undefined) return String(v.solution);
      return String(v);
    })
    .map(s => sanitizePublicDetail(s, 32))
    .filter(Boolean);
  return cleaned.join(', ');
}

/**
 * Extracts structured, student-safe diagnostics from verifier/audit outputs
 * without exposing raw exceptions, stack traces, paths, or worker/provider IDs.
 */
function resolveWithholdingDecision({
  lastUserText = '',
  hasImages = false,
  auditText = '',
  promptFidelity = { valid: true },
  detectFormattingAnomaly = null,
  invalidClaims = [],
  unknownClaims = [],
  internalContradictions = [],
  classification = null,
  studentIntent = null,
  providerError = null,
  conversationHistory = [],
  clarificationContext = null
} = {}) {
  const safeInvalid = (Array.isArray(invalidClaims) ? invalidClaims : []).filter(
    e => !e?.verification || e.verification.verified !== true
  );
  const safeUnknown = (Array.isArray(unknownClaims) ? unknownClaims : []).filter(
    e => !e?.verification || e.verification.verified !== true
  );
  const safeContradictions = Array.isArray(internalContradictions) ? internalContradictions : [];

  const allEntries = [...safeInvalid, ...safeUnknown];
  const combinedReasons = [
    String(auditText || ''),
    ...allEntries.map(e => `${e?.verification?.status || ''} ${e?.verification?.error_type || ''} ${e?.verification?.reason || ''} ${e?.verification?.details || ''}`),
    ...safeContradictions.map(ic => ic?.details || '')
  ].join(' ');
  const lowerAudit = combinedReasons.toLowerCase();

  // 1. Security / safety / auth / authorization retain top priority
  if (
    lowerAudit.includes('safety') ||
    lowerAudit.includes('security') ||
    lowerAudit.includes('unauthorized') ||
    lowerAudit.includes('forbidden') ||
    lowerAudit.includes('authentication') ||
    lowerAudit.includes('unauthenticated') ||
    lowerAudit.includes('permission denied') ||
    lowerAudit.includes('access denied')
  ) {
    return { reason: WITHHOLDING_REASONS.CLAIM_NOT_VERIFIED, overrides: null };
  }

  // 2. Dual-provider / infrastructure / resource-limit / rate-limit failures
  if (lowerAudit.includes('dual provider') || lowerAudit.includes('all providers unavailable')) {
    return { reason: WITHHOLDING_REASONS.DUAL_PROVIDER_FAILURE, overrides: null };
  }
  if (
    providerError ||
    lowerAudit.includes('rate limit') ||
    lowerAudit.includes('rate_limit') ||
    lowerAudit.includes('quota') ||
    lowerAudit.includes('resource limit') ||
    lowerAudit.includes('memory limit') ||
    lowerAudit.includes('token limit') ||
    lowerAudit.includes('service unavailable') ||
    lowerAudit.includes('econnrefused') ||
    lowerAudit.includes('etimedout') ||
    lowerAudit.includes('cas_queue_saturated') ||
    lowerAudit.includes('cas_circuit_open') ||
    lowerAudit.includes('cas_timeout') ||
    lowerAudit.includes('cas_pipe_error') ||
    lowerAudit.includes('timed out')
  ) {
    return { reason: WITHHOLDING_REASONS.INFRASTRUCTURE_FAILURE, overrides: null };
  }

  // 3. Images
  if (hasImages) {
    const missingDiagMatch = combinedReasons.match(/missing\s+(?:measurement|label|angle|side|value)[^.;\n]*/i);
    const diagDetail = missingDiagMatch ? sanitizePublicDetail(missingDiagMatch[0], 140) : '';
    return {
      reason: WITHHOLDING_REASONS.IMAGE_UNVERIFIABLE,
      overrides: diagDetail
        ? {
            diagnosticExplanation: `I can see the image, but I couldn't confirm it reliably (${diagDetail}).`,
            diagnosticCause: `Unverified image details: ${diagDetail}.`
          }
        : null
    };
  }

  // 4. Undefined expression / domain violation (must beat generic MALFORMED_SYNTAX & CLAIM_NOT_VERIFIED)
  const domainEntry = allEntries.find(e =>
    e?.verification?.status === 'DOMAIN_ERROR' ||
    e?.verification?.error_type === 'DOMAIN_VIOLATION' ||
    /division by zero|mathematically undefined|domain violation|square root of a negative|domain_excluded/i.test(
      `${e?.verification?.reason || ''} ${e?.verification?.details || ''}`
    )
  );
  if (domainEntry || lowerAudit.includes('division by zero') || lowerAudit.includes('mathematically undefined') || lowerAudit.includes('domain violation')) {
    const restr = domainEntry?.verification?.domain_restrictions;
    const restrStr = formatValuesList(Array.isArray(restr) ? restr : [], 4);
    const rawDomMsg = domainEntry?.verification?.reason || domainEntry?.verification?.details || '';
    const safeDomMsg = sanitizePublicDetail(rawDomMsg, 180);
    return {
      reason: WITHHOLDING_REASONS.UNDEFINED_EXPRESSION,
      overrides: restrStr
        ? {
            diagnosticExplanation: `This expression hits an undefined value unless domain restrictions are respected (${restrStr}).`,
            diagnosticCause: `Undefined operation or excluded domain value (${restrStr}).`,
            diagnosticNextStep: `Exclude ${restrStr} from the solution set (or specify if you want complex numbers) and resend.`
          }
        : (safeDomMsg
            ? {
                diagnosticExplanation: `This expression runs into an undefined mathematical value: ${safeDomMsg}.`,
                diagnosticCause: safeDomMsg
              }
            : null)
    };
  }

  // 5. Formatting anomalies on latest user expression
  if (typeof detectFormattingAnomaly === 'function' && typeof lastUserText === 'string' && lastUserText.trim()) {
    const anomaly = detectFormattingAnomaly(lastUserText, {
      conversationHistory,
      clarificationContext
    });
    if (anomaly && anomaly.isWeird === true) {
      return {
        reason: WITHHOLDING_REASONS.MALFORMED_SYNTAX,
        overrides: {
          weirdSnippet: anomaly.snippet,
          suggestedFix: anomaly.suggestedFix,
          anomalyExplanation: anomaly.explanation
        },
        anomaly
      };
    }
  }

  // 6. Missing information & unresolved variables / bounds / measurements / target variable
  // 6a. Definite integral missing bounds
  const missingBoundsClaim = allEntries.find(e =>
    (e?.claim?.claim_type === 'integral' || e?.claim?.claim_type === 'calculus_integral') &&
    e?.claim?.data?.isDefinite === true &&
    (e?.claim?.data?.lowerLimit === undefined || e?.claim?.data?.upperLimit === undefined || e?.claim?.data?.lowerLimit === null || e?.claim?.data?.upperLimit === null)
  );
  if (missingBoundsClaim || /missing\s+(?:integral\s+)?(?:bounds?|limits?)/i.test(lowerAudit)) {
    return {
      reason: WITHHOLDING_REASONS.MISSING_INFORMATION,
      overrides: {
        diagnosticExplanation: "This looks like a definite integral, but I'm missing the lower and/or upper integration bounds needed to compute a numeric value.",
        diagnosticCause: "Definite integral requested without both lower and upper limits of integration.",
        diagnosticHelp: "Specify both bounds (for example, 'from x = 0 to x = 2'), or ask for the indefinite antiderivative instead.",
        diagnosticNextStep: "Add the lower and upper bounds to your integral and try again."
      }
    };
  }

  // 6b. Missing target variable ("which variable to solve for") or missing diagram measurement
  if (/missing\s+(?:target\s+)?variable|which\s+variable\s+to\s+solve/i.test(lowerAudit)) {
    return {
      reason: WITHHOLDING_REASONS.MISSING_INFORMATION,
      overrides: {
        diagnosticExplanation: "I see more than one variable here and need to know which variable you want to solve for.",
        diagnosticCause: "Multiple variables appear in the equation with no target variable specified.",
        diagnosticHelp: "Tell me which variable to isolate (for example, 'solve for x').",
        diagnosticNextStep: "Specify the variable to solve for and resend."
      }
    };
  }
  if (/missing\s+(?:measurement|side|angle|radius|height|width|length|initial|mass|velocity)/i.test(lowerAudit)) {
    const mMeas = combinedReasons.match(/missing\s+(?:a\s+)?(?:measurement|side|angle|radius|height|width|length|initial\s+\w+|mass|velocity)[^.;\n]*/i);
    const safeMeas = mMeas ? sanitizePublicDetail(mMeas[0], 140) : 'missing measurement';
    return {
      reason: WITHHOLDING_REASONS.MISSING_INFORMATION,
      overrides: {
        diagnosticExplanation: `I'm missing a specific value needed to finish (${safeMeas}).`,
        diagnosticCause: `Problem requires ${safeMeas}.`,
        diagnosticNextStep: "Provide the missing value in your message and I'll solve it."
      }
    };
  }

  // 6c. Unresolved symbols: distinguish numeric-value-needed vs domain-assumption-needed vs symbolic parameter
  const missingInfoRegex = /missing\s+(?:information|data|details|value|bound|limit|variable)|insufficient\s+(?:information|data|details|values|measurements)|undefined variable|not enough info/i;
  const unresolvedEntry = allEntries.find(e =>
    e?.verification?.status === 'UNRESOLVED' ||
    /unresolved\s+symbols?/i.test(`${e?.verification?.reason || ''} ${e?.verification?.details || ''}`)
  );
  if (unresolvedEntry || /undefined variable|missing.*(?:value|parameter)/i.test(lowerAudit)) {
    const syms = parseUnresolvedSymbols(`${unresolvedEntry?.verification?.reason || ''} ${combinedReasons}`);
    const symListStr = syms.map(s => `'${s}'`).join(', ');
    const eqClaim = unresolvedEntry?.claim;
    const isNumericEquationEval = Boolean(
      eqClaim?.claim_type === 'equation_solution' &&
      Array.isArray(eqClaim?.data?.proposed_solutions) &&
      eqClaim.data.proposed_solutions.some(v => Number.isFinite(Number(v)))
    );
    const asksAssumptionOnly = /assumption|positive|real\s+domain|domain_assumptions|branch|sign|non-?negative|non-?zero|integer|natural|special case|!=|>=|<=|>|</i.test(lowerAudit);

    if (asksAssumptionOnly) {
      const targetStr = symListStr || 'the parameter';
      return {
        reason: WITHHOLDING_REASONS.CLAIM_NOT_VERIFIED,
        overrides: {
          diagnosticHeadline: "This step depends on a missing domain assumption.",
          diagnosticExplanation: `A transformation or special case here depends on an explicit sign or domain assumption on ${targetStr} (for example, assuming it is positive, nonzero, or not an excluded edge value).`,
          diagnosticCause: `Unverified transformation due to missing domain assumption on ${targetStr}.`,
          diagnosticHelp: `State whether ${targetStr} is positive, nonzero, an integer, or avoids special edge cases so I can apply the exact rule.`,
          diagnosticNextStep: `Add your assumption on ${targetStr} (for example, 'assume ${syms[0] || 'x'} > 0') and resend.`
        }
      };
    }

    if (isNumericEquationEval && syms.length > 0) {
      return {
        reason: WITHHOLDING_REASONS.MISSING_INFORMATION,
        overrides: {
          diagnosticExplanation: `I can't check a numerical solution while parameter ${symListStr} has no value assigned. Give a value for ${symListStr}, or ask me to solve symbolically in terms of ${symListStr}.`,
          diagnosticCause: `Numerical root check requires a value for parameter ${symListStr}.`,
          diagnosticHelp: `Supply a number for ${symListStr}, or clarify that you want a symbolic formula in terms of ${symListStr}.`,
          diagnosticNextStep: `Tell me the value of ${symListStr} (or ask for a symbolic answer) and try again.`
        }
      };
    }

    if (missingInfoRegex.test(lowerAudit)) {
      return {
        reason: WITHHOLDING_REASONS.MISSING_INFORMATION,
        overrides: null
      };
    }
  } else if (missingInfoRegex.test(lowerAudit)) {
    return { reason: WITHHOLDING_REASONS.MISSING_INFORMATION, overrides: null };
  }

  // 7. Ambiguous notation or interpretation
  const ambiguousEntry = allEntries.find(e =>
    e?.verification?.status === 'AMBIGUOUS_NOTATION' ||
    e?.verification?.error_type === 'AMBIGUOUS_DIVISION_BINDING'
  );
  if (
    ambiguousEntry ||
    studentIntent?.intent === 'AMBIGUOUS_NOTATION' ||
    lowerAudit.includes('ambiguous') ||
    lowerAudit.includes('multiple interpretation')
  ) {
    const rawAmb = ambiguousEntry?.verification?.reason || ambiguousEntry?.verification?.details || '';
    const isDivBind = /division\s+binding|AMBIGUOUS_DIVISION_BINDING/i.test(`${ambiguousEntry?.verification?.error_type || ''} ${rawAmb}`);
    const isUnits = /degrees|radians|bare\s+trig/i.test(`${rawAmb} ${lowerAudit}`);
    return {
      reason: WITHHOLDING_REASONS.AMBIGUOUS_PROBLEM,
      overrides: isDivBind
        ? {
            diagnosticExplanation: "Part of this expression (like `1/2x`) can mean either `(1/2)*x` or `1/(2*x)`, so I won't guess which grouping you meant.",
            diagnosticCause: "Ambiguous fraction division grouping without explicit parentheses.",
            diagnosticHelp: "Wrap either (1/2)x or 1/(2x) in parentheses so there is only one meaning.",
            diagnosticNextStep: "Add parentheses around the intended denominator or fraction and resend."
          }
        : (isUnits
            ? {
                diagnosticExplanation: "A trigonometric angle here didn't state whether it is in degrees or radians, which give different values.",
                diagnosticCause: "Missing angle unit (degrees vs. radians) for a numeric trigonometric input.",
                diagnosticHelp: "Write deg, °, or rad explicitly after the angle.",
                diagnosticNextStep: "Specify degrees or radians and send the problem again."
              }
            : null)
    };
  }

  // 8. Prompt-to-claim fidelity mismatch vs verification uncertainty
  const fidelityOutcome = (promptFidelity && !promptFidelity.valid)
    ? classifyAndTranslateFidelityOutcome(promptFidelity, combinedReasons)
    : null;
  const auditMismatchSignal = /(?:prompt-to-claim\s+fidelity\s+mismatch|different\s+equation|answered\s+.*\s+instead)/i.test(lowerAudit);
  if ((fidelityOutcome && fidelityOutcome.kind === 'MISMATCH') || auditMismatchSignal) {
    return {
      reason: WITHHOLDING_REASONS.PROMPT_CLAIM_MISMATCH,
      overrides: fidelityOutcome ? fidelityOutcome.overrides : null
    };
  }

  // 9. Unsupported problem / domain outside deterministic coverage
  const unsupportedEntry = allEntries.find(e =>
    e?.verification?.status === 'UNKNOWN' &&
    /exceeds|not in scope|unsupported|outside.*coverage|differential equation|quantified|infinite series|conditional probability/i.test(
      `${e?.verification?.reason || ''} ${e?.verification?.details || ''}`
    )
  );
  if (unsupportedEntry || /unsupported\s+(?:domain|operation|problem|claim)|not in scope/i.test(lowerAudit)) {
    const domName = sanitizePlainDetailsText(String(unsupportedEntry?.claim?.claim_type || unsupportedEntry?.claim?.domain || ''), 60);
    return {
      reason: WITHHOLDING_REASONS.UNSUPPORTED_PROBLEM,
      overrides: domName
        ? {
            diagnosticExplanation: `I don't currently have an independent verifier for ${domName} claims, so I held back rather than guessing.`,
            diagnosticCause: `Automatic verification for ${domName} is outside current coverage.`
          }
        : null
    };
  }

  // 10. Specific verification failures (CLAIM_NOT_VERIFIED) backed by structured evidence
  if (safeContradictions.length > 0) {
    return {
      reason: WITHHOLDING_REASONS.CLAIM_NOT_VERIFIED,
      overrides: {
        diagnosticExplanation: "Two steps in the draft derivation contradicted each other mathematically, so I held back the response.",
        diagnosticCause: "Internal mathematical contradiction detected between derivation steps.",
        diagnosticNextStep: "Ask me to re-derive the problem step by step from the beginning."
      }
    };
  }

  if (safeInvalid.length > 0) {
    const first = safeInvalid[0];
    const v = first?.verification || {};
    const c = first?.claim || {};
    const eq = sanitizePlainDetailsText(c?.data?.equation || '', 90);

    // 10a. No real roots
    if (v.error_type === 'NO_REAL_ROOTS') {
      return {
        reason: WITHHOLDING_REASONS.CLAIM_NOT_VERIFIED,
        overrides: {
          diagnosticHeadline: "This equation has no real solutions, and a candidate step didn't check out.",
          diagnosticExplanation: eq
            ? `Verification found that ${eq} has no real solutions (negative discriminant), so a proposed real root could not be accepted.`
            : "Verification found that the equation has no real roots, so a proposed real value was rejected.",
          diagnosticCause: "Equation has negative discriminant over the real numbers.",
          diagnosticHelp: "Specify if you want complex solutions instead of real solutions.",
          diagnosticNextStep: "Ask for complex roots if intended, or re-check the equation coefficients."
        }
      };
    }

    // 10b. Extraneous or inaccurate numerical roots
    if (v.status === 'EXTRANEOUS_ROOT' || v.error_type === 'EXTRANEOUS_ROOT') {
      const badRoots = formatValuesList(v.extraneous_roots || v.invalid_roots || [], 4);
      const eqClause = eq ? ` for ${eq}` : '';
      const badClause = badRoots ? ` (${badRoots})` : '';
      return {
        reason: WITHHOLDING_REASONS.CLAIM_NOT_VERIFIED,
        overrides: {
          diagnosticExplanation: `A proposed root${badClause} failed substitution verification${eqClause} because it does not satisfy the original equation within tolerance (or is extraneous).`,
          diagnosticCause: `Proposed value${badClause} failed substitution check${eqClause}.`,
          diagnosticHelp: "Check each candidate root by substituting it back into the original unsimplified equation.",
          diagnosticNextStep: "Re-check the equation solving step or try sending the equation on its own."
        }
      };
    }

    // 10c. Lost valid roots
    if (v.status === 'LOST_ROOT' || v.error_type === 'LOST_ROOT') {
      const lostList = formatValuesList(v.lost_roots || [], 4);
      const eqClause = eq ? ` for ${eq}` : '';
      const lostClause = lostList ? ` (missing ${lostList})` : '';
      return {
        reason: WITHHOLDING_REASONS.CLAIM_NOT_VERIFIED,
        overrides: {
          diagnosticExplanation: `The draft solution${eqClause} dropped one or more valid real roots${lostClause}, so it was incomplete.`,
          diagnosticCause: `Incomplete root set${eqClause}: valid root(s) omitted${lostClause}.`,
          diagnosticHelp: "Remember to keep all branches (e.g., both ± roots, or factoring rather than dividing by a variable).",
          diagnosticNextStep: "Ask for the complete solution set (checking zero-product and +/- cases)."
        }
      };
    }

    // 10d. Incorrect derivative / integral / arithmetic / dimension mismatch
    if (v.status === 'INCORRECT_DERIVATIVE') {
      return {
        reason: WITHHOLDING_REASONS.CLAIM_NOT_VERIFIED,
        overrides: {
          diagnosticExplanation: "A differentiation step in the draft did not match the exact symbolic derivative.",
          diagnosticCause: "Proposed derivative failed symbolic equivalence verification.",
          diagnosticHelp: "Check product, quotient, or chain rule factors in the differentiation step.",
          diagnosticNextStep: "Send the function you want differentiated on its own so I can compute it cleanly."
        }
      };
    }
    if (v.status === 'INVALID_SUBSTITUTION') {
      return {
        reason: WITHHOLDING_REASONS.CLAIM_NOT_VERIFIED,
        overrides: {
          diagnosticExplanation: "A change-of-variables substitution step (such as transforming dx into du) did not match algebraically.",
          diagnosticCause: "Differential or integrand transformation in substitution step failed equivalence check.",
          diagnosticHelp: "Check that both the integrand and the differential (dx → du) were substituted consistently.",
          diagnosticNextStep: "Ask me to walk through the u-substitution step by step."
        }
      };
    }
    if (v.status === 'DIMENSION_ERROR') {
      return {
        reason: WITHHOLDING_REASONS.CLAIM_NOT_VERIFIED,
        overrides: {
          diagnosticExplanation: "The physical units or dimensions on the two sides of the equation do not match.",
          diagnosticCause: "Dimensional analysis check found mismatched physical dimensions.",
          diagnosticHelp: "Verify that both sides represent the same physical quantity (for example, both force or both energy).",
          diagnosticNextStep: "Check the formula or units in your problem and try again."
        }
      };
    }
    if (v.status === 'INCORRECT_RESULT' || v.status === 'INVALID_REASONING_STEP') {
      return {
        reason: WITHHOLDING_REASONS.CLAIM_NOT_VERIFIED,
        overrides: {
          diagnosticExplanation: "A numerical calculation or intermediate algebraic step in the draft failed an exact check, so I held back the response.",
          diagnosticCause: "Arithmetic or intermediate step equality did not verify cleanly.",
          diagnosticNextStep: "Try resending just the equation or asking me to check one step at a time."
        }
      };
    }
  }

  // 10e. Honest uncertainty diagnostic when intermediate calculations checked out
  //      or primary claim returned UNKNOWN / unconfirmed (never branded as invalid or prompt mismatch)
  if (fidelityOutcome && fidelityOutcome.kind === 'UNCERTAINTY') {
    return {
      reason: WITHHOLDING_REASONS.CLAIM_NOT_VERIFIED,
      overrides: fidelityOutcome.overrides
    };
  }

  // 11. Honest fallback when structured evidence cannot pinpoint why verification could not confirm it
  return {
    reason: WITHHOLDING_REASONS.CLAIM_NOT_VERIFIED,
    overrides: null
  };
}

module.exports = {
  WITHHOLDING_REASONS,
  SAFE_WITHHOLDING_CONFIG,
  sanitizeDynamicText,
  sanitizePublicDetail,
  isSafePublicDetail,
  getSafeWithholding,
  resolveWithholdingDecision
};
