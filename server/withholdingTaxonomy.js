/**
 * server/withholdingTaxonomy.js
 *
 * Authoritative taxonomy and student-facing copy for Pythos Safe Withholding.
 *
 * Core Principles:
 * 1. Safe withholding feels like Pythos being careful, not like an error.
 * 2. Pythos should never guess when it cannot verify an answer.
 * 3. Never expose internal terminology: UNKNOWN, verification gate, claim extraction,
 *    verifier failure, provider failure, confidence score, internal model output,
 *    chain-of-thought, or raw verifier traces.
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
    headline: "I need a little more information to solve this problem.",
    explanation: "I don't have enough information to solve the problem reliably. Add the missing measurement, equation, or other information and I'll try again.",
    cause: "The problem statement is missing an essential value, variable relationship, or equation needed for an exact solution.",
    help: "Providing the missing number, boundary condition, or formula mentioned in the problem.",
    nextStep: "Add the missing details to your question and submit it again."
  },
  AMBIGUOUS_PROBLEM: {
    code: 'AMBIGUOUS_PROBLEM',
    headline: "I need a little more information to solve this problem.",
    explanation: "There are multiple ways to interpret this problem, and I don't want to guess. Clarify what the problem is asking and I'll try again.",
    cause: "The question could be interpreted in more than one mathematical way, and guessing would risk giving you an incorrect derivation.",
    help: "Specifying which variable to solve for or which interpretation of the problem you want to explore.",
    nextStep: "Tell me what specific quantity or result you're looking for, and I'll solve it."
  },
  IMAGE_UNVERIFIABLE: {
    code: 'IMAGE_UNVERIFIABLE',
    headline: "I need a little more information to solve this problem.",
    explanation: "I can see the image, but I can't reliably determine one or more of the measurements, labels, or relationships I need to solve it.",
    cause: "One or more measurements, angle markers, or labels in the diagram or photo could not be reliably confirmed.",
    help: "A clearer photo, closer crop, or typing the given side lengths and angle values directly into the chat.",
    nextStep: "Double-check the diagram labels or type the numbers into your message, and I'll work through the solution with you."
  },
  CLAIM_NOT_VERIFIED: {
    code: 'CLAIM_NOT_VERIFIED',
    headline: "I need a little more information to solve this problem.",
    explanation: "I worked through a possible answer, but I couldn't verify it well enough to give it to you. I'd rather not guess.",
    cause: "The mathematical derivation could not be certified with sufficient certainty by our verification checks.",
    help: "Pythos evaluated the derivation, but could not establish the intermediate reasoning steps or final result with sufficient mathematical certainty.",
    nextStep: "You can ask Pythos to review the specific unverified step, explain the underlying mathematical principles, or work through the derivation together one step at a time."
  },
  UNDEFINED_EXPRESSION: {
    code: 'UNDEFINED_EXPRESSION',
    headline: "I need a little more information to solve this problem.",
    explanation: "This expression contains an undefined mathematical operation, such as division by zero or a domain violation.",
    cause: "The expression contains an undefined mathematical operation (such as division by zero or an even root of a negative value over the real domain).",
    help: "Division by zero or taking an even root of a negative value over real numbers produces no defined value in mathematics.",
    nextStep: "Check for zero denominators or real-domain boundaries in the problem expression before solving."
  },
  PROMPT_CLAIM_MISMATCH: {
    code: 'PROMPT_CLAIM_MISMATCH',
    headline: "I need a little more information to solve this problem.",
    explanation: "I worked through a possible answer, but it didn't fully match what was asked in the problem. I'd rather not guess.",
    cause: "The generated steps addressed a different expression or variable than the one in your question.",
    help: "Rephrasing the question or confirming the exact equation you want solved.",
    nextStep: "Check the equation or question text and try sending it once more."
  },
  INFRASTRUCTURE_FAILURE: {
    code: 'INFRASTRUCTURE_FAILURE',
    headline: "I need a little more information to solve this problem.",
    explanation: "I wasn't able to complete the verification needed for this problem. Please try again.",
    cause: "A temporary connection or computational service delay interrupted the verification process.",
    help: "Resending the question in a few moments.",
    nextStep: "Please click Send again to retry."
  },
  DUAL_PROVIDER_FAILURE: {
    code: 'DUAL_PROVIDER_FAILURE',
    headline: "I need a little more information to solve this problem.",
    explanation: "I wasn't able to complete the verification needed for this problem. Please try again.",
    cause: "Our primary and backup reasoning services were temporarily unable to complete processing.",
    help: "Trying your question again in a moment.",
    nextStep: "Please send your question again."
  },
  UNSUPPORTED_PROBLEM: {
    code: 'UNSUPPORTED_PROBLEM',
    headline: "I need a little more information to solve this problem.",
    explanation: "I don't currently have the tools needed to verify this specific type of problem. I'd rather be upfront than guess.",
    cause: "This problem involves topics or formats that fall outside our deterministic verification coverage.",
    help: "Asking about algebra, calculus, geometry, trigonometry, physics, or probability problems.",
    nextStep: "Feel free to ask a question in one of Pythos's supported math or physics subjects."
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

function sanitizeDynamicText(val, maxLen = 220) {
  if (typeof val !== 'string') return '';
  return val
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[<>]/g, '')
    .replace(/`/g, "'")
    .trim()
    .slice(0, maxLen);
}

function getSafeWithholding(reasonCode, overrides = null) {
  const cfg = SAFE_WITHHOLDING_CONFIG[reasonCode] || SAFE_WITHHOLDING_CONFIG.CLAIM_NOT_VERIFIED;
  const result = { ...cfg };

  if (overrides && typeof overrides === 'object') {
    const weirdSnippet = sanitizeDynamicText(overrides.weirdSnippet, 120);
    const suggestedFix = sanitizeDynamicText(overrides.suggestedFix, 200);
    const anomalyExplanation = sanitizeDynamicText(overrides.anomalyExplanation, 260);

    if (anomalyExplanation) {
      result.explanation = anomalyExplanation;
      result.cause = weirdSnippet
        ? `${anomalyExplanation} (Spotted near \`${weirdSnippet}\`.)`
        : anomalyExplanation;
    } else if (weirdSnippet) {
      result.explanation = `${cfg.explanation} Specifically, \`${weirdSnippet}\` looks misformatted.`;
      result.cause = `Misplaced or incomplete formatting near \`${weirdSnippet}\`.`;
    }

    if (suggestedFix) {
      result.explanation = `${result.explanation}\n\nDid you mean \`${suggestedFix}\`?`;
      result.nextStep = `Try re-submitting with \`${suggestedFix}\`.`;
    }
  }

  return {
    ...result,
    formattedContent: `${result.headline}\n\n${result.explanation}`
  };
}

function resolveWithholdingDecision({
  lastUserText = '',
  hasImages = false,
  auditText = '',
  promptFidelity = { valid: true },
  detectFormattingAnomaly = null
} = {}) {
  const lowerAudit = String(auditText || '').toLowerCase();

  // Higher-priority safety/security/auth/resource-limit/availability/domain failures must NEVER be masked by MALFORMED_SYNTAX
  if (lowerAudit.includes('safety') || lowerAudit.includes('security') || lowerAudit.includes('unauthorized') || lowerAudit.includes('forbidden')) {
    return { reason: WITHHOLDING_REASONS.CLAIM_NOT_VERIFIED, overrides: null };
  }
  if (hasImages) {
    return { reason: WITHHOLDING_REASONS.IMAGE_UNVERIFIABLE, overrides: null };
  }
  if (
    lowerAudit.includes('rate limit') ||
    lowerAudit.includes('quota') ||
    lowerAudit.includes('service unavailable') ||
    lowerAudit.includes('cas_queue_saturated') ||
    lowerAudit.includes('cas_circuit_open') ||
    lowerAudit.includes('timed out')
  ) {
    return { reason: WITHHOLDING_REASONS.INFRASTRUCTURE_FAILURE, overrides: null };
  }
  if (lowerAudit.includes('division by zero') || lowerAudit.includes('mathematically undefined') || lowerAudit.includes('domain violation')) {
    return { reason: WITHHOLDING_REASONS.UNDEFINED_EXPRESSION, overrides: null };
  }

  if (typeof detectFormattingAnomaly === 'function' && typeof lastUserText === 'string' && lastUserText.trim()) {
    const anomaly = detectFormattingAnomaly(lastUserText);
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

  if (lowerAudit.includes('missing') || lowerAudit.includes('insufficient') || lowerAudit.includes('undefined variable') || lowerAudit.includes('not enough info')) {
    return { reason: WITHHOLDING_REASONS.MISSING_INFORMATION, overrides: null };
  }
  if (lowerAudit.includes('ambiguous') || lowerAudit.includes('multiple interpretation')) {
    return { reason: WITHHOLDING_REASONS.AMBIGUOUS_PROBLEM, overrides: null };
  }
  if ((!promptFidelity.valid && promptFidelity.primaryClaimStatus !== 'UNKNOWN') || lowerAudit.includes('fidelity') || lowerAudit.includes('mismatch') || lowerAudit.includes('different equation')) {
    return { reason: WITHHOLDING_REASONS.PROMPT_CLAIM_MISMATCH, overrides: null };
  }

  return { reason: WITHHOLDING_REASONS.CLAIM_NOT_VERIFIED, overrides: null };
}

module.exports = {
  WITHHOLDING_REASONS,
  SAFE_WITHHOLDING_CONFIG,
  getSafeWithholding,
  resolveWithholdingDecision
};
