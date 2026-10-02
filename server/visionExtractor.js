/**
 * visionExtractor.js
 * 
 * Vision & Multimodal Problem Extraction Module for Pythos AI.
 * 
 * Responsibilities:
 * 1. Build specialized prompts for vision models (llava, qwen2.5-vl, minicpm-v, etc.)
 *    that enforce strict separation between:
 *    - The original problem statement (printed or stated)
 *    - The student's handwritten work or attempt
 *    - Diagram / graph details (axes, vectors, circuit elements, geometry)
 * 2. Post-process and normalize vision model OCR output using ocrMathNormalizer.
 * 3. Extract mathematical assertions from student handwriting for deterministic verification.
 */

const { normalizeWorksheetMath } = require('./ocrMathNormalizer');

/**
 * Generates the system / framing instructions for multimodal requests with images.
 */
function buildVisionPromptDirective() {
  return `

# MULTIMODAL & IMAGE PROBLEM EXTRACTION INSTRUCTIONS (CRITICAL)
You have received an image from a student. It may contain a printed textbook page, worksheet, screenshot, diagram, graph, or handwritten student work.
Carefully examine the image and adhere to these strict rules:

1. DISTINGUISH PROBLEM vs. STUDENT WORK:
   - Identify the ACTUAL PROBLEM to be solved (e.g. printed text, prompt, teacher's assignment).
   - Identify the STUDENT'S HANDWRITTEN WORK or attempted solution if present.
   - NEVER assume the student's handwritten steps or final written number is correct. You must verify it independently!

2. TRANSCRIBE ACCURATELY INTO LATEX:
   - Transcribe mathematical formulas into standard LaTeX ($...$ inline or $$...$$ display).
   - Use \\frac{a}{b} for fractions, \\sqrt{x} for square roots, and proper superscripts/subscripts.
   - For diagrams or graphs, describe the key given quantities (e.g., initial velocity $v_0 = 15\\text{ m/s}$, launch angle $\\theta = 35^\\circ$, circuit resistances $R_1, R_2$, or geometric angles).

3. DETECT VISUAL AMBIGUITY & UNCERTAINTY (DO NOT SILENTLY GUESS):
   - If handwriting or notation is messy, degraded, partially erased, or ambiguous (e.g., cannot confidently distinguish '3x' from '8x', '3\\pi' from '8\\pi', '+' from '±', or 't' from '+'):
     * Explicitly surface the uncertainty rather than inventing a transcription.
     * State what characters or interpretations are possible (e.g., "Note: The handwritten term in Step 2 appears ambiguous and could be read as either $3x$ or $8x$").
     * Never silently guess on ambiguous tokens.

4. NOTATION & EXPONENT FIDELITY (DO NOT SILENTLY REINTERPRET):
   - If a diagram labels a geometric quantity (such as a triangle hypotenuse or leg) with a power or ambiguous symbol (e.g., 'x^2', 'x²', or 'x2'):
     * Do NOT silently change or normalize it to 'x'.
     * Recognize that if the hypotenuse is literally x², the Pythagorean equation is leg1² + leg2² = (x²)² = x⁴.
     * Explicitly surface the ambiguity: "There is an ambiguity in the diagram. If the hypotenuse is labeled x², then the Pythagorean theorem gives x⁴ = 100. If the intended label is x, then x = 10. Please confirm which was intended."

5. SOCRATIC PEDAGOGY:
   - If the student has already started solving the problem and made an error in their handwritten steps:
     * Acknowledge where their reasoning was correct.
     * Gently pinpoint the exact step where their handwritten calculation or formula deviated.
     * Ask a guided question about that specific step.
   - If the student is asking "How do I do this?" or "Solve this":
     * State what the problem asks in clear terms.
     * Guide them through Step 1 without dumping the entire solution.
`;
}

/**
 * Formats a user message containing images for upstream Ollama vision models,
 * ensuring proper base64 cleaning.
 */
function cleanVisionMessage(msg) {
  if (!msg || typeof msg !== 'object') return msg;

  const clean = {
    role: msg.role || 'user',
    content: msg.content || ''
  };

  if (Array.isArray(msg.images) && msg.images.length > 0) {
    clean.images = msg.images.map(img => {
      if (typeof img === 'string' && img.includes('base64,')) {
        return img.split('base64,')[1].trim();
      }
      return typeof img === 'string' ? img.trim() : img;
    }).filter(Boolean);
  }

  return clean;
}

/**
 * Validates a base64-encoded image string by checking magic bytes and payload integrity.
 * Returns { valid: boolean, format: string, error?: string }.
 */
function validateBase64Image(b64String) {
  if (!b64String || typeof b64String !== 'string') {
    return { valid: false, format: 'unknown', error: 'Empty or non-string image data' };
  }

  // Clean data URL prefix if present
  let cleanB64 = b64String;
  if (cleanB64.includes('base64,')) {
    cleanB64 = cleanB64.split('base64,')[1].trim();
  } else {
    cleanB64 = cleanB64.trim();
  }

  // Images must have sufficient byte size to contain header + frame data
  if (cleanB64.length < 120) {
    return { valid: false, format: 'unknown', error: 'Image file is truncated or corrupted (payload too small)' };
  }

  try {
    const fullBuffer = Buffer.from(cleanB64, 'base64');
    if (fullBuffer.length < 64) {
      return { valid: false, format: 'unknown', error: 'Image file is truncated or corrupted' };
    }

    // JPEG: FF D8 FF
    if (fullBuffer[0] === 0xFF && fullBuffer[1] === 0xD8 && fullBuffer[2] === 0xFF) {
      // Check for minimal JPEG structure (must be at least 100 bytes and not just an unclosed header)
      if (fullBuffer.length < 100) {
        return { valid: false, format: 'unknown', error: 'Corrupted or truncated JPEG file' };
      }
      return { valid: true, format: 'jpeg' };
    }

    // PNG: 89 50 4E 47
    if (fullBuffer[0] === 0x89 && fullBuffer[1] === 0x50 && fullBuffer[2] === 0x4E && fullBuffer[3] === 0x47) {
      if (fullBuffer.length < 64) {
        return { valid: false, format: 'unknown', error: 'Corrupted or truncated PNG file' };
      }
      return { valid: true, format: 'png' };
    }

    // GIF: 47 49 46 38
    if (fullBuffer[0] === 0x47 && fullBuffer[1] === 0x49 && fullBuffer[2] === 0x46 && fullBuffer[3] === 0x38) {
      return { valid: true, format: 'gif' };
    }

    // WebP: RIFF....WEBP
    if (fullBuffer.length >= 12 &&
        fullBuffer[0] === 0x52 && fullBuffer[1] === 0x49 && fullBuffer[2] === 0x46 && fullBuffer[3] === 0x46 &&
        fullBuffer[8] === 0x57 && fullBuffer[9] === 0x45 && fullBuffer[10] === 0x42 && fullBuffer[11] === 0x50) {
      return { valid: true, format: 'webp' };
    }

    // BMP: 42 4D
    if (fullBuffer[0] === 0x42 && fullBuffer[1] === 0x4D) {
      return { valid: true, format: 'bmp' };
    }

    // HEIC / HEIF
    if (fullBuffer.length >= 12 &&
        fullBuffer[4] === 0x66 && fullBuffer[5] === 0x74 && fullBuffer[6] === 0x79 && fullBuffer[7] === 0x70) {
      return { valid: true, format: 'heic' };
    }

    return { valid: false, format: 'unknown', error: 'Unrecognized image magic header or corrupt binary data' };
  } catch (err) {
    return { valid: false, format: 'unknown', error: err.message };
  }
}

/**
 * Post-processes vision model text output to clean LaTeX formatting,
 * normalize stacked fractions, and ensure KaTeX readability.
 */
function postProcessVisionResponse(text) {
  if (!text || typeof text !== 'string') return '';
  return normalizeWorksheetMath(text);
}

/**
 * Determines whether text contains explicit references to visual artifacts,
 * diagrams, images, photos, handwriting, or deictic phrases.
 */
function isVisionIntent(text, hasAttachedImage = false) {
  if (!text) return true;
  const trimmed = text.trim();
  if (trimmed === 'Please inspect and help me with this problem.') return true;

  // Explicit visual reference or student handwriting/diagram inspection
  const visualPattern = /\b(?:image|photo|picture|diagram|graph|drawing|screenshot|worksheet|figure|handwriting|handwritten|sketch|check\s+(?:my\s+)?work|inspect\s+(?:my\s+)?work|my\s+work|my\s+steps|my\s+attempt|my\s+solution)\b/i;
  const deicticPattern = /\b(?:look\s+at\s+(?:this|the|my|again|closer)|look\s+again|see\s+attached|what\s+does\s+(?:the\s+(?:image|picture|diagram|photo|figure)|it)\s+(?:show|say|mean)|can\s+you\s+(?:see|read|inspect|transcribe)|in\s+the\s+photo|on\s+the\s+page|from\s+the\s+photo|based\s+on\s+the\s+(?:image|diagram|drawing)|according\s+to\s+the\s+(?:image|diagram|worksheet))\b/i;
  if (visualPattern.test(trimmed) || deicticPattern.test(trimmed)) return true;

  // Terse image-dependent phrases with no independent problem
  const tersePattern = /^(?:(?:can\s+you\s+)?(?:please\s+)?(?:help(?:\s+me)?|solve|check|work\s+out|look\s+at|inspect)\s+(?:this|my\s+work)|here\s+(?:is|'s)\s+(?:my\s+)?(?:problem|work|homework)|solve\s+this|what\s+is\s+this|check\s+this|is\s+this\s+right|is\s+my\s+answer\s+correct|how\s+do\s+i\s+do\s+this|how\s+do\s+i\s+solve\s+this|what\s+do\s+i\s+do\s+here|find\s+the\s+answer|help)[.?!]?$/i;
  if (tersePattern.test(trimmed)) return true;

  // If an image is present, check if text is a complete self-contained math/science problem
  if (hasAttachedImage) {
    const clean = trimmed.replace(/[?.,!]+$/, '').trim();
    const hasEquation = /[a-zA-Z0-9+\-*\/^().\s]+\s*=\s*[a-zA-Z0-9+\-*\/^().\s]+/.test(clean) && !/^[a-zA-Z]\s*=/.test(clean);
    const hasArithmetic = /^(?:(?:calculate|compute|evaluate|what\s+is|find|value\s+of)\s*)?[-+*\/^0-9.(),\s]+$/i.test(clean) && /\d/.test(clean);
    const hasCalculus = /\b(?:derivative|integral|integrate|differentiate|limit|dx|dy\/dx)\b/i.test(clean);
    const hasConceptual = /\b(?:what\s+is\s+the\s+formula|why\s+is|explain\s+the\s+concept|theorem|definition)\b/i.test(clean);
    const hasAlgebra = /\b(?:solve|factor|simplify|expand|evaluate|root|roots|quadratic)\b/i.test(clean);

    let hasCompleteMath = hasEquation || hasArithmetic || hasCalculus || hasConceptual || hasAlgebra;
    if (!hasCompleteMath) {
      try {
        const { classifyProblem } = require('./problemClassifier');
        const cls = classifyProblem(trimmed);
        if (cls && cls.problemDomain !== 'UNKNOWN' && cls.problemDomain !== 'OFF_TOPIC') {
          if (cls.deterministicWorkAvailable || Object.keys(cls.knownQuantities || {}).length > 0) {
            hasCompleteMath = true;
          }
        }
      } catch (_) {}
    }

    if (hasCompleteMath) {
      return false; // Complete text math problem, does not require vision
    }

    return true; // Fragment or incomplete text with attached image
  }

  return false;
}

/**
 * Determines whether the current turn actually requires multimodal vision reasoning.
 * Enforces the strict architectural distinction:
 * 1. Image is attached / available in session or UI
 * 2. Current turn actually requires vision
 *
 * @param {Object} activeUserMsg - Current user message { role: 'user', content: string, images?: string[] }
 * @param {Array} conversationMessages - Full conversation history
 * @returns {{ requiresVision: boolean, reason: string }}
 */
function isVisionRequiredForTurn(activeUserMsg, conversationMessages = []) {
  if (!activeUserMsg || activeUserMsg.role !== 'user') {
    return { requiresVision: false, reason: 'NO_USER_MESSAGE' };
  }

  const currentTurnHasImages = Array.isArray(activeUserMsg.images) && activeUserMsg.images.length > 0;
  const historyHasImages = conversationMessages.some((m) => {
    if (m === activeUserMsg) return false;
    return (Array.isArray(m.images) && m.images.length > 0) || m.hasHistoricalImage === true;
  });

  const isImageAvailable = currentTurnHasImages || historyHasImages;
  if (!isImageAvailable) {
    return { requiresVision: false, reason: 'NO_IMAGE_AVAILABLE' };
  }

  const content = (activeUserMsg.content || '').trim();

  // Rule 1: Empty or default fallback prompt when an image is attached
  if (!content || content === 'Please inspect and help me with this problem.') {
    return { requiresVision: true, reason: 'EMPTY_OR_DEFAULT_IMAGE_PROMPT' };
  }

  // Rule 2: Explicit visual reference
  const visualPattern = /\b(?:image|photo|picture|diagram|graph|drawing|screenshot|worksheet|figure|handwriting|handwritten|sketch|check\s+(?:my\s+)?work|inspect\s+(?:my\s+)?work|my\s+work|my\s+steps|my\s+attempt|my\s+solution)\b/i;
  const deicticPattern = /\b(?:look\s+at\s+(?:this|the|my|again|closer)|look\s+again|see\s+attached|what\s+does\s+(?:the\s+(?:image|picture|diagram|photo|figure)|it)\s+(?:show|say|mean)|can\s+you\s+(?:see|read|inspect|transcribe)|in\s+the\s+photo|on\s+the\s+page|from\s+the\s+photo|based\s+on\s+the\s+(?:image|diagram|drawing)|according\s+to\s+the\s+(?:image|diagram|worksheet))\b/i;
  if (visualPattern.test(content) || deicticPattern.test(content)) {
    return { requiresVision: true, reason: 'EXPLICIT_VISUAL_REFERENCE' };
  }

  // Rule 3: Terse / deictic image-dependent phrases
  const tersePattern = /^(?:(?:can\s+you\s+)?(?:please\s+)?(?:help(?:\s+me)?|solve|check|work\s+out|look\s+at|inspect)\s+(?:this|my\s+work)|here\s+(?:is|'s)\s+(?:my\s+)?(?:problem|work|homework)|solve\s+this|what\s+is\s+this|check\s+this|is\s+this\s+right|is\s+my\s+answer\s+correct|how\s+do\s+i\s+do\s+this|how\s+do\s+i\s+solve\s+this|what\s+do\s+i\s+do\s+here|find\s+the\s+answer|help)[.?!]?$/i;
  if (tersePattern.test(content)) {
    return { requiresVision: true, reason: 'TERSE_IMAGE_DEPENDENT' };
  }

  // Rule 4: If new image was provided on this turn
  if (currentTurnHasImages) {
    if (!isVisionIntent(content, true)) {
      return { requiresVision: false, reason: 'SELF_CONTAINED_TEXT_PROBLEM_WITH_INCIDENTAL_IMAGE' };
    }
    return { requiresVision: true, reason: 'NEW_IMAGE_INCOMPLETE_TEXT_DEPENDENCY' };
  }

  // Rule 5: Existing image from prior turns, but current turn has no new image and no visual reference
  return { requiresVision: false, reason: 'EXISTING_IMAGE_UNRELATED_TEXT_TURN' };
}

module.exports = {
  buildVisionPromptDirective,
  cleanVisionMessage,
  validateBase64Image,
  postProcessVisionResponse,
  isVisionRequiredForTurn,
  isVisionIntent
};
