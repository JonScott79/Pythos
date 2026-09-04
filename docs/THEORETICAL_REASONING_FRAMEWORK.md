# Pythos Theoretical Reasoning & Verification Framework

## 1. Executive Summary & Epistemic Principle

The foundational axiom of the Pythos Reasoning & Verification Engine is:

$$\text{CLAIM STRENGTH} \le \text{EVIDENCE STRENGTH}$$

Whenever an agent, student, or model asserts a proposition $C$ from premises or evidence $E$, the modal, statistical, and deductive force of $C$ must never exceed the epistemic warrant established by $E$.

### The Motivating Failure Mode
Consider the premise:
> *"Students who study $\ge 2$ hours usually score $>80\%$."*

If this is converted into:
> *"Studying $\ge 2$ hours guarantees a score $>80\%$."*

The claim has performed an illicit modal jump from probabilistic/qualified induction ($\approx 70\%\text{--}90\%$) to universal deductive necessity ($100\%$). 

### The Critical Epistemic Distinction: False vs. Not Established
The verification engine must strictly separate:
1. **The conclusion is false ($\bot$)**: A concrete counterexample or proof of contradiction has been established (e.g., student Bob studied 3 hours and scored 72%).
2. **The conclusion is not established by the supplied evidence ($\text{UNESTABLISHED}$ / $\text{EVIDENCE\_STRENGTH\_MISMATCH}$)**: The conclusion may or may not be factually true in the external world, but the premises provided are epistemically insufficient to warrant the claimed strength of the conclusion.

Conflating *"unsupported"* with *"false"* is itself a logical fallacy (the argument from ignorance / *argumentum ad ignorantiam*). Pythos preserves:
$$\text{UNKNOWN is always preferable to fabricated certainty.}$$
Never permit $\text{UNKNOWN} \to \text{VERIFIED}$ without genuine new evidence or rigorous proof.

---

## 2. Structured Claim Representation

Reasoning in Pythos is evaluated through structured claim objects rather than superficial keyword matching. A claim node represents an inferential step:

```
Claim
  ├── ID: string (e.g. "claim-step-3")
  ├── Domain: "logic" | "statistics" | "arithmetic" | "algebra" | "calculus" | "physics"
  ├── Type: ClaimType
  ├── Assumptions: Set<Assumption>
  ├── Evidence: Set<EvidenceItem>
  ├── InferenceRule: InferenceRule
  ├── Conclusion: Proposition
  ├── EvidenceStrength: EpistemicStrength
  ├── ClaimStrength: EpistemicStrength
  └── VerificationStatus: StatusVerdict
```

### 2.1 The Epistemic Strength Hierarchy
Epistemic strength is modeled on a rigorous bounded lattice:

$$\text{UNKNOWN} \prec \text{ANECDOTAL} \prec \text{OBSERVATIONAL\_CORRELATION} \prec \text{PROBABILISTIC\_QUALIFIED} \prec \text{CONTROLLED\_EXPERIMENT} \prec \text{DETERMINISTIC\_PROOF}$$

| Level | Epistemic Strength Rank | Definition & Formal Bounds | Examples |
|---|---|---|---|
| **L5** | `DETERMINISTIC_PROOF` | Strict deductive validity, mathematical theorems, universal quantification ($\forall x \in D$), deterministic arithmetic identity ($P=1.0$). | "For all $x \in \mathbb{R}$, $x^2 \ge 0$", "Modus ponens with true premises", "12 + 15 = 27". |
| **L4** | `CONTROLLED_EXPERIMENT` | Causal warrant via randomized controlled trials (RCTs), prospective intervention, confounding elimination, valid double-blind controls. | "Randomized trial with $p < 0.001$, active control, and verified protocol". |
| **L3** | `STATISTICAL_SAMPLE` | Quantified observational empirical data with sample size $N$, standard errors, confidence intervals, and hypothesis tests. | "$N=1,200$, 95% CI $[0.12, 0.18]$, $p=0.01$". |
| **L2** | `PROBABILISTIC_QUALIFIED` | Qualified inductive claims with non-universal quantifiers ("usually", "likely", "most", "tends to", "frequently"). | "Usually scores $>80\%$", "Most patients recover within 5 days". |
| **L1** | `OBSERVATIONAL_CORRELATION` | Observed statistical co-occurrence without controlled intervention; susceptible to confounders, reverse causality, selection bias. | "Ice cream sales correlate with drowning incidents", "Study hours correlate with grades". |
| **L0** | `ANECDOTAL_OR_UNSUPPORTED` | Isolated single observations, hearsay, unquantified assertions, fabricated precision, or absent data. | "My friend tried this and felt better", "Highly likely with no supporting data". |

### 2.2 Core Invariant Rule
$$\forall \text{ Claim } C: \quad \text{Rank}(\text{ClaimStrength}(C)) \le \text{Rank}(\text{EvidenceStrength}(C))$$

If $\text{Rank}(\text{ClaimStrength}(C)) > \text{Rank}(\text{EvidenceStrength}(C))$, the inference is rejected with status `EVIDENCE_STRENGTH_MISMATCH` or `UNSUPPORTED_CONCLUSION`.

---

## 3. Analysis of 25 Theoretical Reasoning Areas

### 1. Deductive Reasoning
- **Principle**: If premises are true and the form is valid, the conclusion *must* be true.
- **Rule**: Deduction requires universal quantification or strict logical implication ($\to$). It cannot be derived from inductive or probabilistic premises.

### 2. Inductive Reasoning
- **Principle**: Generalization from observations to unobserved instances.
- **Rule**: Produces probabilistic or plausible conclusions, never universal necessity. A single counterexample disproves an inductive universal claim.

### 3. Abductive Reasoning
- **Principle**: Inference to the best explanation ($E$ is observed; $H$ explains $E$; therefore $H$ is plausible).
- **Rule**: $H$ remains a hypothesis with rank $\le \text{PROBABILISTIC\_QUALIFIED}$; asserting $H$ as verified certainty is Affirming the Consequent.

### 4. Probabilistic Reasoning
- **Principle**: Reasoning under uncertainty governed by Kolmogorov's axioms.
- **Rule**: $P(A \cap B) \le \min(P(A), P(B))$. Probabilistic qualifiers ("likely", "probably") indicate $P < 1.0$ and forbid deductive detachment.

### 5. Statistical Inference
- **Principle**: Drawing conclusions about a population from sample data.
- **Rule**: Conclusions carry sampling error and confidence bounds. A sample estimate $\hat{\theta}$ does not establish that $\theta = \hat{\theta}$ with zero variance.

### 6. Necessary Conditions
- **Principle**: $B$ is necessary for $A$ means $A \to B$ ($\neg B \to \neg A$).
- **Rule**: Establishing $B$ does *not* prove $A$. Inferring $A$ from $B$ is the fallacy of Affirming the Consequent.

### 7. Sufficient Conditions
- **Principle**: $A$ is sufficient for $B$ means $A \to B$.
- **Rule**: $A$ guarantees $B$, but the absence of $A$ ($\neg A$) does *not* imply $\neg B$. Inferring $\neg B$ from $\neg A$ is the fallacy of Denying the Antecedent.

### 8. Logical Implication
- **Principle**: Material conditional $P \to Q \equiv \neg P \vee Q$.
- **Rule**: Valid deduction: Modus Ponens ($P, P \to Q \vdash Q$), Modus Tollens ($\neg Q, P \to Q \vdash \neg P$), Contraposition ($P \to Q \equiv \neg Q \to \neg P$). Invalid: Converse ($Q \to P$), Inverse ($\neg P \to \neg Q$).

### 9. Quantifiers
- **Principle**: First-order quantifiers $\forall$ (universal) and $\exists$ (existential), and natural quantifiers ("most", "many", "few").
- **Rule**: $\forall x P(x) \implies \exists x P(x)$ (over non-empty domains), but $\exists x P(x) \centernot\implies \forall x P(x)$. "Most $x$ are $P$" does not imply $\forall x P(x)$.

### 10. Counterexamples
- **Principle**: A single instance $c$ such that $A(c) \wedge \neg B(c)$ decisively refutes the universal claim $\forall x (A(x) \to B(x))$.
- **Rule**: Counterexamples strictly defeat universal claims ($100\% \to 0\%$). Counterexamples do *not* automatically refute qualified probabilistic claims ("most $x$ are $P$") unless the frequency of counterexamples exceeds the allowed threshold.

### 11. Definitions
- **Principle**: Definitions establish biconditionals ($A \iff \text{Def}(A)$) by convention.
- **Rule**: Definitions hold with rank `DETERMINISTIC_PROOF`. They cannot be altered by empirical observations.

### 12. Theorems
- **Principle**: Propositions derived deductively from axioms and definitions.
- **Rule**: Hold with rank `DETERMINISTIC_PROOF` within the explicit domain of the axiomatic system.

### 13. Assumptions
- **Principle**: Stated or unstated preconditions under which an inference is valid.
- **Rule**: Any unstated assumption required for validity (e.g., $x \neq 0$, continuous $f$, independent variables) must be flagged with `UNESTABLISHED_ASSUMPTION` if missing.

### 14. Mathematical Equivalence
- **Principle**: Two expressions or statements evaluate to identical truth values across their entire shared domain.
- **Rule**: Equivalence must account for domain restrictions (e.g., $\sqrt{x^2} = |x| \neq x$ for general real $x$).

### 15. Approximation
- **Principle**: $\hat{y} \approx y$ within an explicit or implicit tolerance $\epsilon$.
- **Rule**: Approximate equality cannot be substituted for exact algebraic identity without propagating the error bound.

### 16. Uncertainty
- **Principle**: Epistemic state where information is incomplete or stochastic.
- **Rule**: Uncertainty must be preserved. Converting an interval or confidence bound into a single point claim without qualifying language is forbidden.

### 17. Causal Inference
- **Principle**: Pearl's do-calculus / Rubin causal model: $P(Y | \text{do}(X)) \neq P(Y | X)$ in the presence of confounding.
- **Rule**: Observational correlation alone cannot establish causal direction or causal effect size.

### 18. Correlation
- **Principle**: Statistical association between random variables $\text{Cov}(X, Y) \neq 0$.
- **Rule**: Correlation is symmetric ($\text{Corr}(X,Y) = \text{Corr}(Y,X)$); causation is directed ($X \to Y \not\equiv Y \to X$).

### 19. Experimental Evidence
- **Principle**: Empirical data generated through deliberate intervention, randomization, and control.
- **Rule**: Only properly randomized or quasi-experimental designs with documented confounder control can justify causal claims.

### 20. Model Assumptions
- **Principle**: Preconditions of statistical/physical models (e.g., normality, i.i.d., linearity, friction-free).
- **Rule**: A model output is valid only to the extent that its assumptions are satisfied. Violations degrade evidence strength.

### 21. Domain Restrictions
- **Principle**: The set of values for which an operation, function, or relation is defined.
- **Rule**: Inferences outside the domain (e.g., dividing by zero, taking $\log(x)$ for $x \le 0$, negative absolute temperature) are `UNDEFINED`.

### 22. Boundary Cases
- **Principle**: Values at the extreme limits of the valid domain (e.g., $x=0$, $N=1$, $v \to c$, $p=0, 1$).
- **Rule**: Inferences that hold in the interior of a domain must be separately tested at boundaries.

### 23. Limiting Cases
- **Principle**: Asymptotic behavior as a parameter tends toward infinity or zero.
- **Rule**: Inferences regarding limiting behavior must not assume uniform convergence without verification.

### 24. Contradictory Premises
- **Principle**: A set of premises that cannot be simultaneously satisfied ($P \wedge \neg P$).
- **Rule**: In standard logic, from contradiction anything follows (principle of explosion). Pythos intercepts contradictory premises and flags `PREMISE_DATA_CONTRADICTION` or `INCONSISTENT_ASSUMPTION` rather than validating arbitrary conclusions.

### 25. Unsupported Conclusions
- **Principle**: A conclusion whose truth value is not determined by the provided premises or calculations.
- **Rule**: Evaluates to `UNESTABLISHED` / `UNSUPPORTED_CONCLUSION`, distinct from `FALSE`.

---

## 4. Theoretical Test Matrix

| Category | Principle | Valid Example (Positive Control) | Invalid Example (Adversarial Trap) | Required Verifier Behavior | Expected Status |
|---|---|---|---|---|---|
| **A. Qualifier Strength** | Modal bounds | "Students usually score $>80\%$; therefore, a given student is likely to score $>80\%$." | "Students usually score $>80\%$; therefore, studying guarantees scoring $>80\%$." | Detect claim strength (certainty) > evidence strength (probabilistic). | `EVIDENCE_STRENGTH_MISMATCH` |
| **B. Necessary vs Sufficient** | Direction of implication | "$A$ is sufficient for $B$; $A$ holds; therefore $B$ holds." | "$A$ is necessary for $B$; $A$ holds; therefore $B$ must hold." | Flag Affirming the Consequent / condition confusion. | `INVALID_INFERENCE` / `CONDITION_CONFUSION` |
| **C. Implication / Logic** | Formal entailment | Modus Tollens: $P \to Q, \neg Q \vdash \neg P$. | Denying the Antecedent: $P \to Q, \neg P \vdash \neg Q$. | Generate counterexample where $P=\text{False}, Q=\text{True}$. | `DENYING_ANTECEDENT` |
| **D. Conditional Probability** | $P(A\|B) \neq P(B\|A)$ | $P(\text{positive}\|\text{disease})=0.99$, compute $P(\text{disease}\|\text{positive})$ with base rate $0.001$ deterministically via Bayes. | "Test is 99% accurate, you tested positive, therefore there is a 99% chance you have the disease." | Deterministically compute exact posterior ($P \approx 9\%$) and reject the transposed conditional. | `TRANSPOSED_CONDITIONAL` / `INCORRECT_RESULT` |
| **E. Correlation vs Causation** | Observational vs Causal | "A randomized trial where $X$ was assigned showed a 20% increase in $Y$ ($p < 0.01$); thus $X$ caused the increase." | "Ice cream consumption correlates with drowning ($r = 0.82$); therefore eating ice cream causes drowning." | Identify lack of causal warrant; observational data cannot justify causal verbs ("causes", "produces"). | `CORRELATION_NOT_CAUSATION` |
| **F. Study Methodology** | Evidence hierarchy | "In an observational cohort, high fiber was associated with lower cardiovascular risk." | "An observational survey proved that eating nuts prevents heart attacks." | Downgrade causal claim from observational study to associative claim. | `EVIDENCE_STRENGTH_MISMATCH` |
| **G. Statistical Significance** | Practical vs Statistical | "The difference was statistically significant ($p = 0.03$), but with an effect size of $d = 0.01$, practical impact is negligible." | "The test had $p = 0.20$, which definitively proves that the treatment has zero effect." | Reject claiming $p > 0.05$ proves the null hypothesis ($H_0$). | `UNSUPPORTED_CONCLUSION` |
| **H. Sample Size & Uncertainty** | Small sample variance | "In a sample of $N=5$, 4 improved; this suggests a possible benefit, but the 95% CI is wide $[0.28, 0.99]$." | "In our trial of 5 patients, 4 recovered; this proves an 80% success rate." | Reject fabricated precision and unquantified generalization from small samples. | `UNSUPPORTED_PRECISION` |
| **I. Simpson's Paradox** | Defining vs Enabling conditions | Subgroup $A>B$, Subgroup $A>B$, Aggregate $B>A$ -> Simpson's paradox present. | Subgroup $A>B$, Subgroup $A>B$, Aggregate $A>B$ -> Simpson's paradox claimed due to unequal weights. | Verify mathematical reversal before permitting the named phenomenon. | `FALSE_POSITIVE_PHENOMENON` |
| **J. Unsupported Precision** | Qualitative to quantitative | "Most students passed; therefore, more than half of the students passed." | "Most students passed; therefore, exactly 82% passed." | Reject converting qualitative terms ("most", "usually") into fabricated numbers. | `UNSUPPORTED_NUMERICAL_PRECISION` |
| **K. Evidence Direction** | Directional proportionality | Deterministic proof -> Certainty; Probabilistic premise -> Probabilistic conclusion. | Anecdotal observation -> Universal scientific certainty. | Strictly enforce non-increasing epistemic strength. | `EVIDENCE_STRENGTH_MISMATCH` |
| **L. Counterexamples** | Universal refutation | "All prime numbers are odd." Counterexample: $p=2$. Refutation verified. | "Usually birds fly." Counterexample: penguin. Refutation: "This proves birds do not usually fly." | Distinguish refuting $\forall x P(x)$ from refuting $\text{Usually}(P(x))$. | `INVALID_INFERENCE` |
| **M. Wrong Reasoning, Right Answer** | Inferential validity | Solve $x^2 = 9 \implies x = \pm 3 \implies x = 3$ if $x > 0$. | "Solve $x^2 = 9$: since $2 \times 3 = 6$ and $6+3 = 9$, $x = 3$." | Verify intermediate logical steps; do not accept just because final answer is 3. | `INVALID_INFERENCE` |
| **N. Right Reasoning, Wrong Answer** | Arithmetic isolation | Formula $K = \frac{1}{2}mv^2$ applied correctly, but $0.5 \times 2 \times 16$ evaluated as 32 instead of 16. | Reasoning: kinetic energy formula. Calculation: arithmetic error. | Preserve validity of conceptual reasoning, isolate and flag the arithmetic mistake. | `INCORRECT_RESULT` |
| **O. Contradictory Evidence** | Premise vs Data consistency | Data: Group 1 $A=80\%, B=70\%$; Group 2 $A=60\%, B=40\%$. Stated premise: $A>B$ in both. | Data: Group 1 $A=80\%, B=70\%$; Group 2 $A=20\%, B=60\%$. Stated premise: $A>B$ in both. | Intercept contradiction between stated premise and actual subgroup rates before reasoning proceeds. | `PREMISE_DATA_CONTRADICTION` |

---

## 5. Architectural Verification Lifecycle

```
[User Prompt / Model Response]
             │
             ▼
┌────────────────────────────────────────┐
│      1. Preflight Fact Extraction       │  (Deterministic Router)
│  - Mathematical equations & CAS        │
│  - Statistical tables & rates          │
│  - Explicit premises & claims          │
└──────────────────┬─────────────────────┘
                   │
                   ▼
┌────────────────────────────────────────┐
│     2. Premise-Data Consistency Audit   │  (Statistics & Logic Verifiers)
│  - Stated facts vs. calculated facts   │
│  - Premise-data contradictions detected│
└──────────────────┬─────────────────────┘
                   │
                   ▼
┌────────────────────────────────────────┐
│     3. Epistemic Strength & Qualifier   │  (Evidence-Strength Verifier)
│        Proportionality Check           │
│  - Rank(Claim) <= Rank(Evidence)       │
│  - Modal jump detection                │
│  - Qualitative precision check         │
└──────────────────┬─────────────────────┘
                   │
                   ▼
┌────────────────────────────────────────┐
│     4. Deep Formal Entailment Engine   │  (SymPy Logic & CAS)
│  - Deductive validity (SAT solver)     │
│  - Counterexample generation           │
│  - Tri-Aspect audit (Interp/Math/Logic)│
└──────────────────┬─────────────────────┘
                   │
                   ▼
┌────────────────────────────────────────┐
│     5. Verdict & Status Formatting     │  (Message Helper)
│  - VERIFIED / UNKNOWN / FALSE          │
│  - UNESTABLISHED_CONCLUSION            │
│  - Clean, emoji-standardized output    │
└────────────────────────────────────────┘
```
