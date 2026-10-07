---
title: From Dev.to Comment to Production in 24h: Building an Inspectable Math Verification Contract in Pythos (and Fixing the Pearson Trap)
published: true
tags: ai, webdev, architecture, opensource
cover_image: https://pythos.lanzar.me/assets/social/pythos_launch_post_1080x1080.jpg
---

Earlier this week, I published an article here on DEV: [**"Why We Stopped Letting LLMs Do Raw Math: Building Pythos With Deterministic Verification"**](https://dev.to/jonscott79). 

The response was humbling, but one particular comment from an enterprise AI engineer at **IT Path Solutions** stood out. They validated our core thesis—*treat the LLM as a conversational interface, never the mathematical source of truth*—and left a game-changing suggestion:

> *"Make the verification result part of the data contract... each step could carry the expression evaluated, the verification method, the assumptions used, and the exact state that was checked."*

They were 100% right. 

In Pythos, our dual-engine verifier (in-process **Math.js** for exact arithmetic and a sandboxed **SymPy CAS** daemon for symbolic algebra/calculus) was already validating derivations step-by-step behind the scenes. But once the delivery decision gate passed, we were condensing all that rich telemetry into simple binary flags before shipping the text to the client.

We decided to build what they suggested. 

Here is how we turned mathematical verification into an explicit, wire-level data contract, built a client-side derivation inspector, and—in a hilarious twist of real-world battle testing—fixed a production bug where Pearson homework boilerplate tricked our deterministic router into computing the area of a right triangle.

---

## 1. The Architecture: The `VerificationStepAudit` Data Contract

Prior to v1.8.35, Pythos knew *internally* whether a claim was true or false, but the frontend only received markdown text with basic metadata.

We formalized a new data contract: **`VerificationStepAudit`**. Every evaluated claim emitted over our streaming NDJSON and JSON endpoints now carries structured audit telemetry:

```typescript
interface VerificationStepAudit {
  stepIndex: number;
  expressionEvaluated: string;
  verificationMethod: 'SYMPY_CAS' | 'MATHJS_EXACT' | 'DETERMINISTIC_FASTPATH';
  engine: 'sympy' | 'mathjs' | 'native';
  assumptions: {
    domain?: 'real' | 'complex' | 'integer';
    tolerance?: number;
    quadrant?: string;
  };
  checkedState: {
    proposed: string;
    expected: string;
    discrepancy?: string;
  };
  certified: boolean;
  rejectionRationale?: string;
}
```

### Why This Matters for AI Tutoring
1. **Zero Black-Box Math:** The student (and educator) isn't just told "Trust me, the answer is $x = \frac{1}{2}$." They can inspect the actual symbolic reduction that certified the step.
2. **Targeted Socratic Revision:** When an LLM generates a multi-step derivation and makes a sign error on Step 4, we don't ask it to "try again" blindly. The verifier catches the exact step failure and feeds the structured `VerificationStepAudit` back into the Socratic revision prompt:
   > *"Step 4 failed: evaluated $\sin^2\theta + \cos^2\theta = 2$, expected $1$. Discrepancy: Pythagorean identity violation."*
   The model corrects itself with mathematical precision.

---

## 2. The UX: The Derivation Inspector

Exposing verification metadata without cluttering the learning experience is tricky. If you dump raw JSON or giant debug banners on students, it overwhelms them.

Instead, we added a subtle, accessible badge on the bottom-right action bar of assistant messages, sitting cleanly alongside the **Report** and **Copy** buttons:

```
[ 🛡️ Verified (3 steps) ]  [ 📋 Copy ]  [ 🐞 Report ]
```

Clicking **Verified** expands a slide-out Derivation Inspector panel directly underneath the response:
- Highlights each individual derivation step.
- Displays the exact mathematical expression tested.
- Shows the certified CAS engine badge (`SymPy CAS` or `Math.js`).
- Confirms the active assumptions (e.g., $x > 0$, real domain).

Now, students aren't just reading AI generated text; they can audit the mathematical proof behind it in real time.

---

## 3. The Multimodal Polish: Magic Bytes & Vision History

Alongside the audit contract, we upgraded our multimodal screenshot ingestion pipeline. Students frequently screenshot math worksheets and paste them directly into Pythos.

We ran into two edge cases with upstream vision models (Llama 3.2 Vision on Groq):
1. **MIME-Type Rejections (400 Bad Request):** Some browsers generate clipboard image blobs with generic or missing MIME headers. We implemented client-side magic-byte sniffing (inspecting PNG `\x89PNG`, JPEG `\xFF\xD8\xFF`, and WebP headers) to guarantee strict `Content-Type` tagging.
2. **Vision TPM Throttling (429 Rate Limit):** In a multi-turn conversation, re-transmitting multi-megabyte base64 images on every turn quickly incinerates Token-Per-Minute (TPM) limits on free-tier inference gateways. We bounded conversational image history so previous turns retain verified OCR transcripts while releasing redundant base64 payloads once grounded.

---

## 4. The "Pearson Trap": When Homework Boilerplate Met Deterministic Routing

No deployment story is complete without a hilarious production edge case. 

Shortly after releasing v1.8.35, I was using Pythos myself to work through college trigonometry homework from Pearson MyLab. I pasted a problem:

```text
Use a right triangle to write the following expression as an algebraic expression. 
Assume that x is positive and that the given inverse trigonometric function is defined for the expression in x.
tangent left parenthesis cosine Superscript negative 1 Baseline 4 x right parenthesis
Question content area bottom
Part 1
tangent left parenthesis cosine Superscript negative 1 Baseline 4 x right parenthesisequals
```

I expected Pythos to derive:
$$\tan(\cos^{-1}(4x)) = \frac{\sqrt{1 - 16x^2}}{4x}$$

Instead, Pythos instantly and cheerfully responded:

> 📐 **Right-Triangle Area**  
> Here is the right triangle with base 3 and height 4:  
> $\text{Area} = \frac{1}{2} \times \text{base} \times \text{height} = \frac{1}{2}(3)(4) = 6$

Wait... what? Where did a 3-4-5 triangle and an area of 6 come from?!

### The Root Cause
To keep latency near zero and save GPU compute costs, Pythos features an in-process **Deterministic Router** that short-circuits simple calculations (arithmetic, unit conversions, geometry requests) before invoking the LLM.

Two bugs in the router had collided:
1. **Screen-Reader Web Boilerplate:** Pearson MyLab outputs accessibility tags including the phrase:
   > *"Question content **area** bottom"*
2. **Overly Eager Regex:** The router's geometry parser checked for right triangle queries, followed by:
   ```javascript
   const isArea = /\barea\b/i.test(clean);
   ```
   It matched the word **"area"** in *"Question content area bottom"*!
3. **The Dummy Fallback:** Because the prompt asked to *"Use a right triangle..."* to solve an algebraic expression, no numerical leg lengths were given. The legacy geometry routine fell back to a default `3, 4, 5` triangle and happily computed $\frac{1}{2} \times 3 \times 4 = 6$.

### The Hardened Fix
We patched `server/deterministicRouter.js` immediately:
1. Added an `isAlgebraicOrInverseTrig` guard that completely blocks prompts containing algebraic keywords (`algebraic expression`, `simplify`, `expand`) or inverse trig operators (`cos^-1`, `arcsin`, `StartFraction`, `Superscript negative 1`) from ever being hijacked as static geometry drawings.
2. Sanitized web platform boilerplate (`question content area`, `content area bottom`) before testing for geometric intents.
3. Required geometric area calculations to have explicit numerical side lengths and dedicated question phrasing (e.g., *"find the area"*).

---

## 5. Adding It to the Master Regression Suite

A bug once discovered must never happen again. 

We created **Group G** in our fast-path hardening suite (`test-deterministic-fastpath-hardening.js`) with tests specifically checking Pearson screen-reader transcripts, algebraic inverse trig phrases, and fractional boilerplate:

```javascript
runTest('G1: Pearson screen-reader inverse trig prompt must not trigger dummy triangle area', () => {
  const prompt = 'Use a right triangle to write... tangent left parenthesis cosine Superscript negative 1 Baseline 4 x right parenthesis Question content area bottom...';
  const intent = deterministicRouter.analyzeDeterministicIntent(prompt, []);
  assert.strictEqual(intent, null); // Must pass through to LLM + CAS verification!
});
```

We then promoted this into **Suite 25** of our master regression test harness (`test-regression-harness.js`). 

All 25 regression suites—covering SymPy CAS, Math.js adversarial arithmetic, student privacy redaction, streaming verification, and fast-path hardening—are passing 100% green.

---

## Summary

In less than 24 hours:
- A great comment from the DEV community gave us the exact conceptual blueprint we needed.
- We turned verification into a first-class, inspectable `VerificationStepAudit` data contract.
- We added an accessible client-side UI inspector to prove mathematical derivations to students.
- We caught and eliminated a wild edge-case where Pearson homework boilerplate masqueraded as a geometry problem.

Huge thanks to the DEV community and our commenter from IT Path Solutions for pushing us to make Pythos better. 

You can try out Pythos for free anytime at [**pythos.lanzar.me**](https://pythos.lanzar.me) or explore the code and verification engine on [**GitHub**](https://github.com/JonScott79/Pythos).

What are your thoughts on exposing deterministic verifier contracts directly in AI chat interfaces? Would you find step-level mathematical receipts helpful when studying or building math tools? Let's discuss in the comments!
