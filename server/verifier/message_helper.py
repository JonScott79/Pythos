import logging

logger = logging.getLogger(__name__)

# Fixed emoji set (✅ ❌ 🤔 ⏳ 🔄 ⚖️ ℹ️)
_USER_MESSAGES = {
    "VERIFIED": "✅ That looks correct! Here's why:",
    "ERROR": "❌ I couldn't verify that answer reliably, so I'm not going to present it as correct.",
    "UNKNOWN": "🤔 I don't have enough information to verify that confidently.",
    "TIMEOUT": "⏳ That one gave me a workout. I couldn't finish checking it carefully enough, so I don't want to guess.",
    "RETRY": "🔄 I caught a mistake in my reasoning. Let me correct it.",
    "DISAGREEMENT": "⚖️ My checks didn't agree, so I'm not going to pretend I'm certain.",
    # Arithmetic / general computation errors
    "INCORRECT_RESULT": "❌ That doesn't match what I get when I work through the calculation.",
    "UNDEFINED": "❌ That expression is mathematically undefined — it involves something like division by zero.",
    # Algebra errors
    "EXTRANEOUS_ROOT": "❌ One of those solutions doesn't actually satisfy the original equation.",
    "LOST_ROOT": "❌ There's a valid solution missing from that answer.",
    "NON_EQUIVALENT": "❌ Those two expressions aren't algebraically equivalent.",
    # Calculus errors
    "INCORRECT_DERIVATIVE": "❌ That derivative doesn't match what I get by differentiating the expression.",
    "INCORRECT_INTEGRAL": "❌ That antiderivative isn't correct — differentiating it doesn't give the integrand.",
    "INVALID_SUBSTITUTION": "❌ The change of variables has an error in the transformed integrand.",
    "INCORRECT_INTEGRAL_VALUE": "❌ The improper integral evaluates to a different value.",
    "INVALID_CONVERGENCE_CONDITION": "❌ The convergence condition for that integral isn't right.",
    "INCORRECT_CLOSED_FORM": "❌ The closed-form value doesn't match the integral.",
    "INVALID_CONVERGENCE_CLASSIFICATION": "❌ That convergence classification isn't correct for this integral.",
    "INCORRECT_EVALUATED_RESULT": "❌ The special-case evaluation doesn't match.",
    "INVALID_SINGULARITY_CLASSIFICATION": "❌ That singularity is classified incorrectly.",
    # Physics errors
    "INCORRECT_FORCE_BALANCE": "❌ The force balance has an error — the net force isn't what you'd expect.",
    "INCORRECT_VECTOR_COMPONENT": "❌ The trig components are mixed up in the vector decomposition.",
    "INCORRECT_NORMAL_FORCE": "❌ The normal force expression isn't correct for a surface at an angle.",
    "INCORRECT_INCLINE_ACCELERATION": "❌ The acceleration along the incline doesn't match the physics.",
    "INCORRECT_STABILITY_CLASSIFICATION": "❌ The stability classification doesn't match the multiplier value.",
    "INCORRECT_STABILITY_INTERVAL": "❌ The stability interval doesn't match the condition |f'(x*)| < 1.",
    "FALSE_PHYSICAL_LAW": "❌ That contradicts a fundamental physical law.",
    "FALSE_PHYSICAL_REASONING": "❌ The physical reasoning has a conceptual error.",
    "INCONSISTENT_ASSUMPTION": "❌ The assumptions are contradictory — you can't have both at once.",
    "INVENTED_PHYSICAL_CONDITION": "❌ The solution introduces a physical condition that isn't in the problem.",
    "DIMENSION_ERROR": "❌ The dimensions don't match — that equation isn't physically consistent.",
    # Dynamical systems / chaos errors
    "INVALID_FIXED_POINT": "❌ That point isn't actually a fixed point of the map.",
    "FALSE_MATHEMATICAL_INFERENCE": "❌ That logical inference isn't mathematically valid.",
    "UNSUPPORTED_NUMERICAL_CLAIM": "🤔 That numerical claim needs an explicit derivation or orbit data to support it.",
    "INVALID_INVARIANT_DOMAIN": "❌ That claim ignores the domain restriction — not all orbits behave that way.",
    "INCORRECT_BIFURCATION_IDENTIFICATION": "❌ That parameter value corresponds to a different bifurcation event.",
    "INCORRECT_CONSTANT_VALUE": "❌ The numerical value cited for that constant isn't correct.",
    # Statistics
    "SIMSONS_PARADOX_TRUE": "❌ The data exhibits Simpson's paradox.",
    "SIMSONS_PARADOX_FALSE": "✅ No Simpson's paradox in this dataset.",
    "GENERAL_REASONING_INVALID": "🤔 The general reasoning about Simpson's paradox is incorrect.",
    "EQUAL_RATES": "⚖️ Rates are equal; no paradox.",
    "INSUFFICIENT_DATA": "⏳ Not enough data to evaluate.",
    # Default
    "COMPOUND_HAS_ERRORS": "❌ The reasoning chain has an error — let me show you where.",
    # Probability
    "INVALID_FORMULA": "❌ The formula used isn't mathematically correct.",
    "INCORRECT_THRESHOLD": "❌ That threshold value doesn't match the exact calculation.",
    # Logical and Analytical Reasoning
    "INVALID_INFERENCE": "❌ That inference does not logically follow from the premises.",
    "UNESTABLISHED_ASSUMPTION": "❌ That deduction requires an unstated assumption that has not been established.",
    "AFFIRMING_CONSEQUENT": "❌ Logical fallacy: affirming the consequent does not prove the premise.",
    "DENYING_ANTECEDENT": "❌ Logical fallacy: denying the antecedent does not prove the negation of the conclusion.",
    # Default
    "DEFAULT": "ℹ️ I'm not sure how to handle that problem right now."
}

def user_message(status: str, context: dict | None = None) -> str:
    """Return the friendly, emoji‑prefixed message for the supplied status.
    ``context`` may contain ``general_reasoning_invalid`` to prepend that warning.
    """
    base_msg = _USER_MESSAGES.get(status, _USER_MESSAGES["DEFAULT"])
    if context and context.get("general_reasoning_invalid"):
        extra = _USER_MESSAGES.get("GENERAL_REASONING_INVALID", "")
        # Prepend the extra warning if present
        return f"{extra} {base_msg}" if extra else base_msg
    return base_msg

def log_internal(detail: str, level: str = "warning") -> None:
    """Write raw diagnostics to the server log – never shown to the user."""
    getattr(logger, level.lower(), logger.warning)(detail)
