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

3. SOCRATIC PEDAGOGY:
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
  postProcessVisionResponse
};
