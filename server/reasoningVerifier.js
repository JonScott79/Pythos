/**
 * reasoningVerifier.js
 *
 * Dedicated Reasoning, Logical Entailment, and Tri-Aspect Verification Service.
 *
 * Provides a clean separation of concerns across three critical layers:
 * 1. Interpretation: Correct problem framing and variable assignment.
 * 2. Mathematics: Numerical computation, exact algebra, substitution, and CAS verification.
 * 3. Logic: Inferential validity, deductive entailment, assumption auditing, and counterexamples.
 */

const { runDeterministicVerification } = require('./verificationBridge');
const mathjsVerifier = require('./mathjsVerifier');

/**
 * Audits logical entailment: whether premise(s) logically imply conclusion.
 * Returns counterexample if invalid.
 */
async function auditLogicalEntailment(premise, conclusion, assumptions = [], variable = 'x') {
  const payload = {
    domain: 'logic',
    claim_type: 'logical_entailment',
    data: {
      premise,
      conclusion,
      assumptions: Array.isArray(assumptions) ? assumptions : [assumptions],
      variable
    }
  };

  return await runDeterministicVerification(payload);
}

/**
 * Performs Tri-Aspect Verification of an argument or student response:
 * - interpretation: 'VERIFIED' | 'ERROR' | 'UNKNOWN'
 * - mathematics: 'VERIFIED' | 'ERROR' | 'UNKNOWN'
 * - logic: 'VERIFIED' | 'ERROR' | 'UNKNOWN'
 */
async function verifyTriAspect(claim) {
  const {
    interpretationClaim,
    mathematicsClaim,
    logicClaim
  } = claim;

  const results = {
    overall_verified: true,
    aspects: {
      interpretation: { verified: true, status: 'VERIFIED' },
      mathematics: { verified: true, status: 'VERIFIED' },
      logic: { verified: true, status: 'VERIFIED' }
    },
    counterexample: null,
    details: []
  };

  // 1. Audit Interpretation
  if (interpretationClaim) {
    const intRes = await runDeterministicVerification(interpretationClaim);
    results.aspects.interpretation = intRes;
    if (!intRes.verified) {
      results.overall_verified = false;
      results.details.push(`Interpretation error: ${intRes.details || intRes.reason}`);
    }
  }

  // 2. Audit Mathematics
  if (mathematicsClaim) {
    const mathRes = await runDeterministicVerification(mathematicsClaim);
    results.aspects.mathematics = mathRes;
    if (!mathRes.verified) {
      results.overall_verified = false;
      results.details.push(`Mathematical error: ${mathRes.details || mathRes.reason}`);
    }
  }

  // 3. Audit Logic & Entailment
  if (logicClaim) {
    const logicRes = await runDeterministicVerification(logicClaim);
    results.aspects.logic = logicRes;
    if (!logicRes.verified) {
      results.overall_verified = false;
      if (logicRes.counterexample !== undefined) {
        results.counterexample = logicRes.counterexample;
      }
      results.details.push(`Logical reasoning error: ${logicRes.details || logicRes.reason}`);
    }
  }

  return results;
}

/**
 * Audits named-phenomenon claims (e.g. Simpson's paradox, Berkson's fallacy, etc.)
 * Distinguishes enabling conditions from defining conditions to prevent false-positive pattern matching.
 */
async function auditPhenomenonEntailment(phenomenonName, enablingMet, definingMet, claimedPresent = true, details = '') {
  const payload = {
    domain: 'logic',
    claim_type: 'phenomenon_entailment',
    data: {
      phenomenon_name: phenomenonName,
      enabling_conditions_met: enablingMet,
      defining_condition_met: definingMet,
      claimed_present: claimedPresent,
      details
    }
  };

  return await runDeterministicVerification(payload);
}

module.exports = {
  auditLogicalEntailment,
  auditPhenomenonEntailment,
  verifyTriAspect
};
