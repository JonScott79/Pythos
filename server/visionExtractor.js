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

4. SOCRATIC PEDAGOGY:
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

module.exports = {
  buildVisionPromptDirective,
  cleanVisionMessage,
  validateBase64Image,
  postProcessVisionResponse
};
