import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, getDocs, query, orderBy, serverTimestamp, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// =========================
// FIREBASE CONFIGURATION
// (Shared with LANZAR Auth Hub & Threadline: lanzar-95ae3)
// =========================
const firebaseConfig = {
  apiKey: "AIzaSyCm11MJPwYKk2ckDIrTOGLNHdyFkdCOM2k",
  authDomain: "lanzar-95ae3.firebaseapp.com",
  projectId: "lanzar-95ae3",
  storageBucket: "lanzar-95ae3.firebasestorage.app",
  messagingSenderId: "61309916889",
  appId: "1:61309916889:web:a6bce4cb213af2a52250c8"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// =========================
// PYTHOS ENGINE STATE
// =========================
const output = document.getElementById("output");
const input = document.getElementById("userInput");
const button = document.getElementById("submitBtn");

let messages = [];
let currentUser = null;
let currentChatId = null;

// =========================
// KATEX RENDERING
// =========================
function renderMath(element) {
  if (!element) return;
  
  const doRender = () => {
    if (window.renderMathInElement) {
      window.renderMathInElement(element, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "\\[", right: "\\]", display: true },
          { left: "\\begin{equation}", right: "\\end{equation}", display: true },
          { left: "\\begin{align}", right: "\\end{align}", display: true },
          { left: "\\begin{pmatrix}", right: "\\end{pmatrix}", display: true },
          { left: "\\begin{bmatrix}", right: "\\end{bmatrix}", display: true },
          { left: "$", right: "$", display: false },
          { left: "\\(", right: "\\)", display: false }
        ],
        ignoredTags: ["script", "noscript", "style", "textarea", "pre", "code", "option"],
        throwOnError: false,
        errorColor: "#ef4444"
      });
    } else if (window.katex) {
      // Fallback if auto-render extension is not yet attached
      console.warn("[KATEX] auto-render not ready, retrying...");
      setTimeout(doRender, 100);
    }
  };

  doRender();
}

// Render a KaTeX preview of the user's input below the input box
function renderInputPreview() {
  let preview = document.getElementById("mathPreview");
  const raw = input.value;
  // Only show preview if there's a math delimiter present
  const hasMath = /\$|\\\(|\\\[/.test(raw);
  if (!hasMath || !raw.trim()) {
    if (preview) preview.style.display = "none";
    return;
  }
  if (!preview) {
    preview = document.createElement("div");
    preview.id = "mathPreview";
    preview.style.cssText = "padding:8px 20px;font-size:0.9rem;color:#64748b;border-top:1px dashed #e2e8f0;background:#f8fafc;";
    document.querySelector(".input-area").appendChild(preview);
  }
  preview.style.display = "block";
  preview.textContent = raw;
  renderMath(preview);
}

// ============================================================
// DYNAMIC ROTATING WAIT-STATE SYSTEM
// ============================================================

const WAIT_STATE_MESSAGES = {
  ARITHMETIC: [
    "Crunching the numbers...",
    "Checking the calculation...",
    "Making sure the fractions behave..."
  ],
  ALGEBRA: [
    "Untangling the equation...",
    "Finding x...",
    "Checking the algebra..."
  ],
  CALCULUS: [
    "Working through the optimization...",
    "Checking the critical point...",
    "Making sure we found the maximum..."
  ],
  PROBABILITY: [
    "Following the probabilities...",
    "Checking the conditional relationships...",
    "Making sure Bayes isn't sneaking around..."
  ],
  STATISTICS: [
    "Looking at the data from another angle...",
    "Checking the group sizes...",
    "Making sure the averages aren't lying to us..."
  ],
  PHYSICS: [
    "Setting up the physics...",
    "Checking the units...",
    "Making sure gravity is behaving...",
    "Running the numbers..."
  ],
  CONCEPTUAL: [
    "Working through the problem...",
    "Thinking this one through...",
    "Checking the details...",
    "Putting the pieces together..."
  ],
  DEFAULT: [
    "This one's making me think...",
    "Taking a closer look...",
    "Checking the problem from another angle...",
    "Working through the details..."
  ]
};

function inferClientDomain(text) {
  if (!text) return 'DEFAULT';
  const lower = text.toLowerCase();

  if (lower.includes('probability') || lower.includes('bayes') || lower.includes('defect rate') || lower.includes('chance that')) {
    return 'PROBABILITY';
  }
  if (lower.includes('simpson') || lower.includes('subgroup') || lower.includes('hospital') || lower.includes('statistics')) {
    return 'STATISTICS';
  }
  if (lower.includes('fencing') || lower.includes('maximize') || lower.includes('minimize') || lower.includes('derivative') || lower.includes('integral') || lower.includes('tangent line') || lower.includes('optimization')) {
    return 'CALCULUS';
  }
  if (lower.includes('projectile') || lower.includes('velocity') || lower.includes('gravity') || lower.includes('speed') || lower.includes('pendulum') || lower.includes('sphere') || lower.includes('angle of')) {
    return 'PHYSICS';
  }
  if (lower.includes('solve for') || (lower.includes('=') && (lower.includes('x') || lower.includes('y')))) {
    return 'ALGEBRA';
  }
  if (/^[-+*/^0-9.()\s,]+$/.test(text) || (text.includes('/') && /\d+\s*\/\s*\d+/.test(text) && !text.includes('x'))) {
    return 'ARITHMETIC';
  }
  if (lower.includes('why') || lower.includes('explain') || lower.includes('meaning') || lower.includes('concept')) {
    return 'CONCEPTUAL';
  }
  return 'DEFAULT';
}

function showThinking(userQuery = '') {
  const div = document.createElement("div");
  div.className = "message thinking";
  div.setAttribute("role", "status");
  div.setAttribute("aria-live", "polite");

  const domain = inferClientDomain(userQuery);
  const messagesList = WAIT_STATE_MESSAGES[domain] || WAIT_STATE_MESSAGES.DEFAULT;
  let idx = 0;

  div.innerHTML = `
    <div class="thinking-status-wrap">
      <span class="thinking-spinner" aria-hidden="true"></span>
      <span class="thinking-text" aria-hidden="true">${messagesList[0]}</span>
      <span class="sr-only">Pythos is processing your request. ${messagesList[0]}</span>
    </div>
  `;

  const textSpan = div.querySelector('.thinking-text');
  div._waitInterval = setInterval(() => {
    idx = (idx + 1) % messagesList.length;
    if (textSpan) {
      textSpan.style.opacity = '0';
      setTimeout(() => {
        textSpan.textContent = messagesList[idx];
        textSpan.style.opacity = '1';
      }, 200);
    }
  }, 3500);

  output.appendChild(div);
  output.scrollTop = output.scrollHeight;
  return div;
}

function removeThinking(el) {
  if (el) {
    if (el._waitInterval) {
      clearInterval(el._waitInterval);
      el._waitInterval = null;
    }
    if (el.parentNode) el.parentNode.removeChild(el);
  }
}

// Helper: robust expression compiler supporting LaTeX and implicit multiplication
function sanitizeGraphExpr(raw) {
  if (!raw || typeof raw !== "string") return "";
  let expr = raw.trim();

  // Strip prefixes & LaTeX delimiters
  expr = expr
    .replace(/^f\(x\)\s*=\s*/i, "")
    .replace(/^y\s*=\s*/i, "")
    .replace(/=\s*0$/i, "")
    .replace(/\\left\(/g, "(")
    .replace(/\\right\)/g, ")")
    .replace(/\\cdot/g, "*")
    .replace(/\\times/g, "*");

  // Fractions: \frac{a}{b} -> ((a)/(b))
  while (/\\frac\{([^}]+)\}\{([^}]+)\}/.test(expr)) {
    expr = expr.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, "(($1)/($2))");
  }

  // Roots & Trig
  expr = expr
    .replace(/\\sqrt\{([^}]+)\}/g, "sqrt($1)")
    .replace(/\\sin/g, "sin")
    .replace(/\\cos/g, "cos")
    .replace(/\\tan/g, "tan")
    .replace(/\\ln/g, "log")
    .replace(/\\log/g, "log10")
    .replace(/\\exp/g, "exp")
    .replace(/\\pi/g, "pi");

  // Implicit multiplication
  expr = expr
    .replace(/(\d+)\s*([a-zA-Z(])/g, "$1*$2")
    .replace(/(\))\s*([a-zA-Z0-9(])/g, "$1*$2")
    .replace(/([x])\s*([a-zA-Z(])/g, "$1*$2");

  return expr;
}

function renderInlineGraph(canvas, exprString) {
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);

  if (!window.math || !exprString || !exprString.trim()) return false;

  try {
    const cleanExpr = sanitizeGraphExpr(exprString);
    const compiled = window.math.compile(cleanExpr);

    const xMin = -10, xMax = 10;
    let yMin = -10, yMax = 10;

    // Sample function for adaptive bounds and extreme ranges
    const samples = [];
    const numSamples = 100;
    const stepSample = (xMax - xMin) / numSamples;
    for (let i = 0; i <= numSamples; i++) {
      const x = xMin + i * stepSample;
      try {
        const y = compiled.evaluate({ x });
        if (typeof y === "number" && isFinite(y) && !isNaN(y) && Math.abs(y) < 1e5) {
          samples.push(y);
        }
      } catch (_) {}
    }

    if (samples.length > 0) {
      samples.sort((a, b) => a - b);
      const p5 = samples[Math.floor(samples.length * 0.05)] || samples[0];
      const p95 = samples[Math.floor(samples.length * 0.95)] || samples[samples.length - 1];

      // Auto-scale if function lies entirely outside [-10, 10] (e.g. x^2 + 50)
      if (p5 > 10 || p95 < -10) {
        const pad = Math.max((p95 - p5) * 0.15, 2);
        yMin = p5 - pad;
        yMax = p95 + pad;
      }
    }

    const toCanvasX = x => ((x - xMin) / (xMax - xMin)) * width;
    const toCanvasY = y => height - ((y - yMin) / (yMax - yMin)) * height;

    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    const bgCol = isDark ? "#0b1120" : "#ffffff";
    const gridCol = isDark ? "#1e293b" : "#f1f5f9";
    const axisCol = isDark ? "#475569" : "#cbd5e1";
    const labelCol = isDark ? "#94a3b8" : "#64748b";
    const curveCol = isDark ? "#38bdf8" : "#2a728f";

    // Background
    ctx.fillStyle = bgCol;
    ctx.fillRect(0, 0, width, height);

    // Grid
    ctx.strokeStyle = gridCol;
    ctx.lineWidth = 1;
    for (let x = xMin; x <= xMax; x += 2) {
      ctx.beginPath();
      ctx.moveTo(toCanvasX(x), 0);
      ctx.lineTo(toCanvasX(x), height);
      ctx.stroke();
    }
    const yGridStep = Math.max(2, Math.round((yMax - yMin) / 10));
    for (let y = Math.floor(yMin); y <= Math.ceil(yMax); y += yGridStep) {
      ctx.beginPath();
      ctx.moveTo(0, toCanvasY(y));
      ctx.lineTo(width, toCanvasY(y));
      ctx.stroke();
    }

    // Axes
    ctx.strokeStyle = axisCol;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const clampedY0 = Math.max(0, Math.min(height, toCanvasY(0)));
    const clampedX0 = Math.max(0, Math.min(width, toCanvasX(0)));
    ctx.moveTo(0, clampedY0);
    ctx.lineTo(width, clampedY0);
    ctx.moveTo(clampedX0, 0);
    ctx.lineTo(clampedX0, height);
    ctx.stroke();

    // Axis Labels
    ctx.fillStyle = labelCol;
    ctx.font = "10px Inter, sans-serif";
    ctx.fillText("x", width - 12, clampedY0 > height - 15 ? clampedY0 - 15 : clampedY0 - 4);
    ctx.fillText("y", clampedX0 < 15 ? clampedX0 + 15 : clampedX0 + 4, 12);

    // Plot Curve with Discontinuity & Asymptote Detection
    ctx.strokeStyle = curveCol;
    ctx.lineWidth = 2.5;
    ctx.beginPath();

    let started = false;
    let prevY = null;
    const step = (xMax - xMin) / width;
    const ySpan = yMax - yMin;

    for (let cx = 0; cx <= width; cx++) {
      const xVal = xMin + cx * step;
      try {
        const yVal = compiled.evaluate({ x: xVal });
        if (typeof yVal === "number" && isFinite(yVal) && !isNaN(yVal)) {
          // Check for vertical asymptote jump (e.g. 1/x, tan(x))
          const isJump = prevY !== null && Math.abs(yVal - prevY) > ySpan * 0.7 && (yVal * prevY < 0 || Math.abs(yVal) > ySpan || Math.abs(prevY) > ySpan);
          if (isJump) {
            ctx.stroke();
            ctx.beginPath();
            started = false;
          }

          const cy = toCanvasY(yVal);
          if (!started) {
            ctx.moveTo(cx, cy);
            started = true;
          } else {
            ctx.lineTo(cx, cy);
          }
          prevY = yVal;
        } else {
          if (started) {
            ctx.stroke();
            ctx.beginPath();
            started = false;
          }
          prevY = null;
        }
      } catch (e) {
        if (started) {
          ctx.stroke();
          ctx.beginPath();
          started = false;
        }
        prevY = null;
      }
    }
    ctx.stroke();
    return true;
  } catch (err) {
    console.warn("[GRAPH RENDERING ERROR]:", err.message);
    return false;
  }
}

function appendMessage(role, text, images = null) {
  const div = document.createElement("div");
  div.className = `message ${role}`;
  
  // If there are attached image payloads, display them at the top of the bubble
  if (images && Array.isArray(images) && images.length > 0) {
    const imgContainer = document.createElement("div");
    imgContainer.className = "msg-image-attachment-wrap";
    imgContainer.style.cssText = "margin-bottom:8px; display:flex; flex-wrap:wrap; gap:8px;";
    images.forEach(imgData => {
      const imgEl = document.createElement("img");
      imgEl.src = typeof imgData === "string" && imgData.startsWith("data:") ? imgData : `data:image/jpeg;base64,${imgData}`;
      imgEl.style.cssText = "max-width:240px; max-height:180px; border-radius:6px; border:1px solid var(--border-color); object-fit:contain; background:#000;";
      imgContainer.appendChild(imgEl);
    });
    div.appendChild(imgContainer);
  }

  const contentDiv = document.createElement("div");
  contentDiv.className = "message-content";

  // Filter out any raw TikZ blocks if LLM accidentally hallucinates them
  let sanitized = text
    .replace(/\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\}/gi, "")
    .replace(/\\\\([()[\]])/g, "\\$1"); // normalize double-escaped LaTeX delimiters

  // Detect [GRAPH: expr] tokens
  const graphTokenRegex = /\[GRAPH:\s*([^\]]+)\]/i;
  const graphMatch = sanitized.match(graphTokenRegex);

  if (graphMatch) {
    sanitized = sanitized.replace(graphTokenRegex, "%%%INLINE_GRAPH_PLACEHOLDER%%%");
  }

  // Helper to safely format markdown while preserving LaTeX blocks without breaking them
  function formatResponseText(raw) {
    const mathBlocks = [];
    // Protect display and inline math blocks so markdown/<br> transforms don't corrupt them
    // Matches: $$, \[, \begin{...}...\end{...}, \(, $...$
    const mathRegex = /(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\begin\{[A-Za-z0-9_*]+\}[\s\S]*?\\end\{[A-Za-z0-9_*]+\}|\\\([\s\S]*?\\\)|\$(?!\s)[^$\n]+(?<!\s)\$)/g;
    
    let protectedText = raw.replace(mathRegex, (match) => {
      const idx = mathBlocks.length;
      mathBlocks.push(match);
      return `%%%MATH_BLOCK_${idx}%%%`;
    });

    // Escape HTML special characters in the non-math prose
    protectedText = protectedText
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    // Convert markdown headers
    protectedText = protectedText.replace(/^###\s+([^\n<]+)/gm, '<h3 class="msg-h3">$1</h3>');
    protectedText = protectedText.replace(/^##\s+([^\n<]+)/gm, '<h2 class="msg-h2">$1</h2>');
    protectedText = protectedText.replace(/^#\s+([^\n<]+)/gm, '<h1 class="msg-h1">$1</h1>');

    // Convert code ticks `...` to <code>...</code>
    protectedText = protectedText.replace(/`([^`]+)`/g, "<code>$1</code>");

    // Convert **bold** to <strong>bold</strong>
    protectedText = protectedText.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

    // Convert *italic* to <em>italic</em>
    protectedText = protectedText.replace(/\*([^*]+)\*/g, "<em>$1</em>");

    // Convert newlines to <br> for regular text
    protectedText = protectedText.replace(/\n/g, "<br>");

    // Remove redundant <br> immediately after heading tags
    protectedText = protectedText.replace(/<\/h[1-6]><br>/g, (m) => m.slice(0, -4));

    // Insert legitimate graph placeholder container into HTML after escaping is complete
    protectedText = protectedText.replace("%%%INLINE_GRAPH_PLACEHOLDER%%%", '<div class="msg-inline-graph-card"></div>');

    // Restore protected math blocks verbatim
    protectedText = protectedText.replace(/%%%MATH_BLOCK_(\d+)%%%/g, (_, idx) => {
      return mathBlocks[parseInt(idx, 10)] || "";
    });

    return protectedText;
  }

  const formattedText = formatResponseText(sanitized);
  contentDiv.innerHTML = formattedText;

  // If a graph was detected, instantiate the live canvas
  if (graphMatch) {
    const graphCard = contentDiv.querySelector(".msg-inline-graph-card");
    if (graphCard) {
      const exprToGraph = graphMatch[1].trim();
      graphCard.dataset.formula = exprToGraph;
      const canvas = document.createElement("canvas");
      canvas.className = "msg-graph-canvas";
      canvas.width = 360;
      canvas.height = 200;
      
      const success = renderInlineGraph(canvas, exprToGraph);
      if (success) {
        const infoRow = document.createElement("div");
        infoRow.className = "msg-graph-footer";

        const caption = document.createElement("div");
        caption.className = "msg-graph-caption";
        caption.innerHTML = `<strong>📈 Rendered Graph:</strong> <code>f(x) = ${exprToGraph}</code>`;

        const openBtn = document.createElement("button");
        openBtn.className = "msg-graph-open-btn";
        openBtn.title = "Open and explore in the full Graph workspace";
        openBtn.innerHTML = `Open in Graph ↗`;
        openBtn.addEventListener("click", () => {
          const graphWin = document.getElementById("floatGraphWindow");
          const graphToggle = document.getElementById("toolGraphBtn");
          const graphInput = document.getElementById("graphFuncInput");
          
          if (graphWin && graphInput) {
            graphWin.style.display = "flex";
            if (graphToggle) graphToggle.classList.add("active");
            graphInput.value = exprToGraph;
            const plotBtn = document.getElementById("graphPlotBtn");
            if (plotBtn) plotBtn.click();
          }
        });

        infoRow.appendChild(caption);
        infoRow.appendChild(openBtn);

        graphCard.appendChild(canvas);
        graphCard.appendChild(infoRow);
      } else {
        // If the expression was not a valid 2D scalar function (e.g. vector prose or multi-variable), cleanly remove the placeholder card
        graphCard.remove();
      }
    }
  }

  div.appendChild(contentDiv);

  // Copy button for easy clipboard copying
  const actionRow = document.createElement("div");
  actionRow.className = "msg-actions";
  const copyBtn = document.createElement("button");
  copyBtn.className = "msg-copy-btn";
  copyBtn.title = "Copy message";
  copyBtn.setAttribute("aria-label", "Copy message text to clipboard");
  copyBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
  copyBtn.addEventListener("click", () => {
    navigator.clipboard.writeText(text);
    copyBtn.innerHTML = `<span style="font-size:10px; color:#166534;">✓</span>`;
    setTimeout(() => {
      copyBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
    }, 1500);
  });
  actionRow.appendChild(copyBtn);
  div.appendChild(actionRow);

  output.appendChild(div);
  renderMath(contentDiv);
  output.scrollTop = output.scrollHeight;
}

function clearChatUI() {
  output.innerHTML = "";
  messages = [];
  const intro = "Greetings. I am Pythos, your mathematical and physics guide. What concepts shall we explore today?";
  messages.push({ role: "assistant", content: intro });
  appendMessage("assistant", intro);
  // Clear the preview
  const preview = document.getElementById("mathPreview");
  if (preview) preview.style.display = "none";
}

// =========================
// FIREBASE AUTHENTICATION
// =========================
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const userInfo = document.getElementById("userInfo");
const userName = document.getElementById("userName");
const userAvatar = document.getElementById("userAvatar");

loginBtn.addEventListener("click", async () => {
  const provider = new GoogleAuthProvider();
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    console.error("Login failed", error);
    alert("Authentication failed.");
  }
});

logoutBtn.addEventListener("click", () => {
  signOut(auth);
});

onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUser = user;
    loginBtn.style.display = "none";
    userInfo.style.display = "flex";
    logoutBtn.style.display = "block";
    userName.textContent = user.displayName;
    userAvatar.src = user.photoURL;
    loadSidebarChats();
  } else {
    currentUser = null;
    loginBtn.style.display = "block";
    userInfo.style.display = "none";
    logoutBtn.style.display = "none";
    document.getElementById("chatHistoryList").innerHTML = "";
    currentChatId = null;
    clearChatUI();
  }
});

// =========================
// FIRESTORE CHAT HISTORY
// =========================
async function loadSidebarChats() {
  if (!currentUser) return;
  const listEl = document.getElementById("chatHistoryList");
  listEl.innerHTML = "<em>Loading past sessions...</em>";

  try {
    const q = query(collection(db, `users/${currentUser.uid}/pythos_chats`), orderBy("timestamp", "desc"));
    const snapshot = await getDocs(q);
    listEl.innerHTML = "";

    if (snapshot.empty) {
      listEl.innerHTML = '<em style="color:#94a3b8;padding:8px;font-size:0.85rem;">No chats yet. Start one!</em>';
      return;
    }

    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      const chatId = docSnap.id;
      const title = (data.title || "Unknown Session").trim();

      // Prevent developer test & benchmark artifacts from appearing in student-facing history
      const isTestArtifact = /^(Math Exam \d+|Test Suite|Benchmark Run|Automated Test|E2E Test|CI_TEST)/i.test(title) ||
                             (data.isTest === true) ||
                             (data.testArtifact === true);
      if (isTestArtifact) return;

      // Wrapper
      const wrapper = document.createElement("div");
      wrapper.className = "chat-item-wrapper";

      // Chat title
      const titleEl = document.createElement("div");
      titleEl.className = "chat-item";
      titleEl.textContent = title;
      if (chatId === currentChatId) titleEl.classList.add("active");
      titleEl.addEventListener("click", () => loadChat(chatId));

      // Action buttons container
      const actions = document.createElement("div");
      actions.className = "chat-actions";

      // Rename button (pencil icon)
      const renameBtn = document.createElement("button");
      renameBtn.className = "chat-action-btn";
      renameBtn.title = "Rename";
      renameBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`;
      renameBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        startRename(wrapper, chatId, data.title || "");
      });

      // Delete button (trash icon)
      const deleteBtn = document.createElement("button");
      deleteBtn.className = "chat-action-btn delete";
      deleteBtn.title = "Delete";
      deleteBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
      deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteChat(chatId);
      });

      actions.appendChild(renameBtn);
      actions.appendChild(deleteBtn);
      wrapper.appendChild(titleEl);
      wrapper.appendChild(actions);
      listEl.appendChild(wrapper);
    });
  } catch (e) {
    console.error(e);
    listEl.innerHTML = "<em>Failed to load chats</em>";
  }
}

// ----- Rename -----
function startRename(wrapper, chatId, currentTitle) {
  // Replace wrapper content with an input
  const existingTitle = wrapper.querySelector(".chat-item");
  const existingActions = wrapper.querySelector(".chat-actions");
  existingTitle.style.display = "none";
  existingActions.style.display = "none";

  const renameInput = document.createElement("input");
  renameInput.type = "text";
  renameInput.className = "rename-input";
  renameInput.value = currentTitle;
  wrapper.appendChild(renameInput);
  renameInput.focus();
  renameInput.select();

  const finishRename = async () => {
    const newTitle = renameInput.value.trim();
    if (newTitle && newTitle !== currentTitle) {
      try {
        const docRef = doc(db, `users/${currentUser.uid}/pythos_chats`, chatId);
        await updateDoc(docRef, { title: newTitle });
      } catch (e) {
        console.error("Rename failed", e);
      }
    }
    loadSidebarChats();
  };

  renameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") finishRename();
    if (e.key === "Escape") loadSidebarChats(); // cancel
  });

  renameInput.addEventListener("blur", finishRename);
}

// ----- Greek Quotes on Erasure, Impermanence & Dissolution -----
const GREEK_DELETION_QUOTES = [
  `"What is written on the slate may be erased, but wisdom once gained remains." — Classical Proverb`,
  `"No man ever steps in the same river twice, for it's not the same river and he's not the same man." — Heraclitus`,
  `"Time is a game played beautifully by children, building and sweeping away the sands." — Heraclitus`,
  `"Nothing exists except atoms and empty space; everything else is opinion." — Democritus`,
  `"All is flux, nothing stays still... to clear the past is to make way for the new." — Heraclitus`,
  `"The secret of change is to focus all of your energy not on fighting the old, but on building the new." — Socrates`,
  `"To dissolve a problem is often more enlightening than to retain its confusion." — Aristotle`,
  `"Let this discourse return to the void, that fresh inquiry may begin." — Socratic Reflection`
];

let lastQuoteIndex = -1;

function getRandomGreekQuote() {
  let nextIdx;
  do {
    nextIdx = Math.floor(Math.random() * GREEK_DELETION_QUOTES.length);
  } while (nextIdx === lastQuoteIndex && GREEK_DELETION_QUOTES.length > 1);
  lastQuoteIndex = nextIdx;
  return GREEK_DELETION_QUOTES[nextIdx];
}

// ----- Custom Pythos Confirmation Modal Helper -----
function showPythosConfirm(message = "Are you sure you wish to delete this chat session?") {
  return new Promise((resolve) => {
    const modal = document.getElementById("pythosConfirmModal");
    const msgEl = document.getElementById("pythosConfirmMessage");
    const quoteEl = document.getElementById("pythosConfirmQuote");
    const okBtn = document.getElementById("pythosConfirmOk");
    const cancelBtn = document.getElementById("pythosConfirmCancel");
    const previouslyFocused = document.activeElement;

    if (!modal) {
      return resolve(window.confirm(message));
    }

    if (msgEl) msgEl.textContent = message;
    if (quoteEl) quoteEl.textContent = getRandomGreekQuote();
    modal.classList.add("visible");
    modal.focus();
    if (cancelBtn) cancelBtn.focus();

    const cleanup = (result) => {
      modal.classList.remove("visible");
      okBtn.removeEventListener("click", onOk);
      cancelBtn.removeEventListener("click", onCancel);
      modal.removeEventListener("keydown", onKey);
      if (previouslyFocused && typeof previouslyFocused.focus === "function") {
        previouslyFocused.focus();
      }
      resolve(result);
    };

    const onOk = () => cleanup(true);
    const onCancel = () => cleanup(false);
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cleanup(false);
      }
      // Focus trap
      if (e.key === "Tab") {
        const focusable = [cancelBtn, okBtn].filter(Boolean);
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    okBtn.addEventListener("click", onOk);
    cancelBtn.addEventListener("click", onCancel);
    modal.addEventListener("keydown", onKey);
  });
}

// ----- Delete -----
async function deleteChat(chatId) {
  const confirmed = await showPythosConfirm("Are you sure you wish to delete this discussion from the archives?");
  if (!confirmed) return;
  try {
    const docRef = doc(db, `users/${currentUser.uid}/pythos_chats`, chatId);
    await deleteDoc(docRef);
    // If we deleted the active chat, reset
    if (chatId === currentChatId) {
      currentChatId = null;
      clearChatUI();
    }
    loadSidebarChats();
  } catch (e) {
    console.error("Delete failed", e);
    alert("Failed to delete chat.");
  }
}

async function loadChat(chatId) {
  if (!currentUser) return;
  currentChatId = chatId;
  
  output.innerHTML = "";
  try {
    const docRef = doc(db, `users/${currentUser.uid}/pythos_chats`, chatId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      messages = docSnap.data().messages || [];
      messages.forEach(msg => {
        appendMessage(msg.role, msg.content, msg.images || null);
      });
    }
    loadSidebarChats(); // Refresh to update active state
    closeMobileSidebar();
  } catch(e) {
    console.error("Error loading chat", e);
  }
}

document.getElementById("newChatBtn").addEventListener("click", () => {
  currentChatId = null;
  clearChatUI();
  loadSidebarChats();
  closeMobileSidebar();
});

async function saveChatState(userMessage, botReply) {
  if (!currentUser) return; // Only save if logged in

  const chatsRef = collection(db, `users/${currentUser.uid}/pythos_chats`);
  
  if (!currentChatId) {
    // Generate a title based on the first user message
    const title = userMessage.length > 30 ? userMessage.substring(0, 30) + "..." : userMessage;
    const newDoc = await addDoc(chatsRef, {
      title: title,
      timestamp: serverTimestamp(),
      messages: messages
    });
    currentChatId = newDoc.id;
    loadSidebarChats(); // Refresh sidebar to show new chat
  } else {
    // Update existing chat
    const docRef = doc(db, `users/${currentUser.uid}/pythos_chats`, currentChatId);
    await updateDoc(docRef, {
      messages: messages,
      timestamp: serverTimestamp() // bump to top
    });
  }
}

// =========================
// EASTER EGG: DEEP THOUGHT
// =========================
const DEEP_THOUGHT_PATTERNS = [
  /meaning\s+of\s+life/i,
  /answer\s+to\s+life/i,
  /life[,]?\s*(the\s+)?universe[,]?\s*(and\s+)?(everything|all)/i,
  /ultimate\s+answer/i,
  /what('s|\s+is)\s+the\s+(meaning|purpose|point)\s+of\s+(life|existence)/i,
  /hitchhiker/i,
  /deep\s+thought/i,
  /42\s*(the\s+)?answer/i
];

function isDeepThoughtQuestion(text) {
  const clean = text.trim().toLowerCase();
  // Don't trigger on math/physics problems that happen to mention these words in equations
  if (/\d\s*[\+\-\*\/\=]\s*\d/.test(clean) && clean.length < 20) return false;
  return DEEP_THOUGHT_PATTERNS.some(pattern => pattern.test(clean));
}

function fakeThinkingDelay(ms) {
  const thinkEl = showThinking();
  return new Promise(resolve => {
    setTimeout(() => {
      removeThinking(thinkEl);
      resolve();
    }, ms);
  });
}

function showDeepThoughtResponse() {
  const div = document.createElement("div");
  div.className = "message assistant deep-thought";
  div.innerHTML = `
    <div class="dt-header">PYTHOS // DEEP THOUGHT MODE</div>
    <div class="dt-answer">42</div>
    <div class="dt-fields">
      <span class="dt-label">ULTIMATE ANSWER:</span> 42<br>
      <span class="dt-label">QUESTION:</span> UNKNOWN
    </div>
    <div class="dt-explanation">
      Long ago, a civilization of hyper-intelligent beings built an enormous supercomputer 
      and asked it to determine the Answer to the Ultimate Question of Life, the Universe, 
      and Everything. After computing for 7.5 million years, the machine finally delivered 
      its verdict: <strong>42</strong>.<br><br>
      The catch? Nobody had ever figured out what the actual <em>Question</em> was. 
      So while the Answer is technically correct — the best kind of correct — it remains 
      spectacularly unhelpful without knowing what was being asked in the first place.<br><br>
      <em style="opacity:0.6;">Don't panic.</em>
    </div>
  `;
  output.appendChild(div);
  output.scrollTop = output.scrollHeight;
}

// =========================
// DETERMINISTIC MATH ENGINE (mathjs)
// =========================
window.DeterministicMath = {
  // Evaluate raw mathematical expressions deterministically
  evaluate: function(expression) {
    try {
      if (window.math) {
        return window.math.evaluate(expression);
      }
      return null;
    } catch (e) {
      console.warn("[MATH ENGINE] Eval error:", e.message);
      return null;
    }
  },

  // Simplify an algebraic expression
  simplify: function(expression) {
    try {
      if (window.math && window.math.simplify) {
        return window.math.simplify(expression).toString();
      }
      return null;
    } catch (e) {
      console.warn("[MATH ENGINE] Simplify error:", e.message);
      return null;
    }
  },

  // Deterministically verify an equation and candidate substitution
  // e.g. equation: "2*x + 7 = 19", variable: "x", value: 5
  verifyEquationSolution: function(leftExpr, rightExpr, variable, proposedValue) {
    try {
      if (!window.math) return null;
      const scope = {};
      scope[variable] = proposedValue;
      const leftVal = window.math.evaluate(leftExpr, scope);
      const rightVal = window.math.evaluate(rightExpr, scope);
      const isCorrect = Math.abs(leftVal - rightVal) < 1e-9;
      return {
        isCorrect,
        leftVal,
        rightVal,
        leftExpr,
        rightExpr,
        proposedValue
      };
    } catch (e) {
      console.warn("[MATH ENGINE] Verification error:", e.message);
      return null;
    }
  }
};

// =========================
// OLLAMA INTEGRATION
// =========================
let isProcessing = false;
const MAX_INPUT_LENGTH = 1500;
const charCounter = document.getElementById("charCounter");

function setInputLocked(locked) {
  isProcessing = locked;
  button.disabled = locked;
  input.disabled = locked;
  button.style.opacity = locked ? "0.5" : "1";
  button.style.cursor = locked ? "not-allowed" : "pointer";
  input.style.opacity = locked ? "0.7" : "1";

  if (!locked) {
    // Restore focus to chat input if the student is not actively focusing on another interactive element (e.g. tool window, modal, math-field)
    const active = document.activeElement;
    const isInteractingElsewhere = active && (
      active.tagName === "INPUT" ||
      active.tagName === "TEXTAREA" ||
      active.tagName === "MATH-FIELD" ||
      active.closest(".floating-window") ||
      active.closest(".math-guide-overlay")
    );

    if (!isInteractingElsewhere) {
      input.focus();
    }
  }
}

async function askPythos(userText) {
  if (!userText || !userText.trim()) return;
  if (isProcessing) return; // Block spam

  // Cap input length
  let cleanText = userText.trim();
  if (cleanText.length > MAX_INPUT_LENGTH) {
    cleanText = cleanText.substring(0, MAX_INPUT_LENGTH);
  }

  setInputLocked(true);

  // Append user message to history
  messages.push({ role: "user", content: cleanText });
  appendMessage("user", cleanText);
  input.value = "";
  if (charCounter) charCounter.style.display = "none";
  // Hide the math preview
  const preview = document.getElementById("mathPreview");
  if (preview) preview.style.display = "none";

  // ===== EASTER EGG: Deep Thought =====
  if (isDeepThoughtQuestion(userText)) {
    await fakeThinkingDelay(2500);
    showDeepThoughtResponse();
    const eggContent = "42 — The Ultimate Answer to Life, the Universe, and Everything.";
    messages.push({ role: "assistant", content: eggContent });
    await saveChatState(userText, eggContent);
    setTimeout(() => setInputLocked(false), 1000);
    return;
  }

  const thinking = showThinking(cleanText);

  // Pythos API Endpoint (Local dev: port 3006, Prod: /api/chat or https://pythos-api.lanzar.me)
  const pythosApiUrl = window.location.hostname === "localhost" ? "http://localhost:3006/api/chat" : "https://pythos-api.lanzar.me/api/chat";

  try {
    const res = await fetch(pythosApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: messages,
        options: { temperature: 0.3 }
      })
    });

    const data = await res.json();
    removeThinking(thinking);

    if (data.message && data.message.content) {
        const botReply = data.message.content.trim();
        messages.push({ role: "assistant", content: botReply });
        appendMessage("assistant", botReply);
        
        // Save to Firebase
        await saveChatState(userText, botReply);
    } else {
        const errNotice = data.message || "The Oracle is silent. (API Error)";
        appendMessage("assistant", errNotice);
    }

  } catch (err) {
    console.error(err);
    removeThinking(thinking);
    appendMessage("assistant", "The connection to Athens has been lost. Is the inference server running?");
  }

  // Cooldown before allowing next message
  setTimeout(() => setInputLocked(false), 1000);
}

// =====================================
// CHAT PROMPT HISTORY (CLI ↑ / ↓ STYLE)
// =====================================
const promptHistory = [];
let historyIndex = -1;
let savedDraft = "";

function addToPromptHistory(text) {
  const trimmed = text.trim();
  if (!trimmed) return;
  // Do not duplicate consecutive identical entries
  if (promptHistory.length === 0 || promptHistory[promptHistory.length - 1] !== trimmed) {
    promptHistory.push(trimmed);
  }
  historyIndex = -1;
  savedDraft = "";
}

// ===== EVENTS =====
button.addEventListener("click", () => {
  addToPromptHistory(input.value);
  askPythos(input.value);
});

input.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    addToPromptHistory(input.value);
    askPythos(input.value);
    return;
  }

  // Handle terminal-style Arrow Up / Down navigation
  if (e.key === "ArrowUp") {
    // Only intercept if cursor is at the very beginning of the input (or single-line input)
    if (input.selectionStart === 0 && input.selectionEnd === 0) {
      if (promptHistory.length > 0) {
        if (historyIndex === -1) {
          savedDraft = input.value; // Save whatever the user was typing
          historyIndex = promptHistory.length - 1;
        } else if (historyIndex > 0) {
          historyIndex--;
        }
        input.value = promptHistory[historyIndex];
        e.preventDefault();
        renderInputPreview();
      }
    }
  } else if (e.key === "ArrowDown") {
    // Only intercept if cursor is at the end of the input (or moving forward through history)
    if (historyIndex !== -1) {
      if (historyIndex < promptHistory.length - 1) {
        historyIndex++;
        input.value = promptHistory[historyIndex];
      } else {
        // Return to the current draft
        historyIndex = -1;
        input.value = savedDraft;
      }
      e.preventDefault();
      renderInputPreview();
    }
  }
});

// Enforce max length and update character counter live
input.addEventListener("input", () => {
  if (input.value.length > MAX_INPUT_LENGTH) {
    input.value = input.value.substring(0, MAX_INPUT_LENGTH);
  }
  const len = input.value.length;
  if (charCounter) {
    if (len > 100) {
      charCounter.style.display = "inline";
      charCounter.textContent = `${len}/${MAX_INPUT_LENGTH}`;
      charCounter.style.color = len > 1400 ? "#ef4444" : "var(--text-muted)";
    } else {
      charCounter.style.display = "none";
    }
  }
  renderInputPreview();
});

// Mobile menu toggle & sidebar backdrop management
const sidebar = document.getElementById("sidebar");
const sidebarOverlay = document.getElementById("sidebarOverlay");
const mobileMenuBtn = document.getElementById("mobileMenuBtn");
const sidebarCloseBtn = document.getElementById("sidebarCloseBtn");

function openMobileSidebar() {
  if (sidebar) sidebar.classList.add("open");
  if (sidebarOverlay) sidebarOverlay.classList.add("visible");
}

function closeMobileSidebar() {
  if (sidebar) sidebar.classList.remove("open");
  if (sidebarOverlay) sidebarOverlay.classList.remove("visible");
}

if (mobileMenuBtn) {
  mobileMenuBtn.addEventListener("click", () => {
    if (sidebar && sidebar.classList.contains("open")) {
      closeMobileSidebar();
    } else {
      openMobileSidebar();
    }
  });
}

if (sidebarCloseBtn) {
  sidebarCloseBtn.addEventListener("click", closeMobileSidebar);
}

if (sidebarOverlay) {
  sidebarOverlay.addEventListener("click", closeMobileSidebar);
}

// Close sidebar on Escape key
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && sidebar && sidebar.classList.contains("open")) {
    closeMobileSidebar();
  }
});

// ===== MATH INPUT GUIDE =====
const guideOverlay = document.getElementById("mathGuideOverlay");
const helpBtn = document.getElementById("helpBtn");
const mathGuideClose = document.getElementById("mathGuideClose");

function openMathGuide() {
  if (!guideOverlay) return;
  guideOverlay.classList.add("visible");
  if (helpBtn) helpBtn.setAttribute("aria-expanded", "true");
  if (mathGuideClose) mathGuideClose.focus();
}

function closeMathGuide() {
  if (!guideOverlay) return;
  guideOverlay.classList.remove("visible");
  if (helpBtn) {
    helpBtn.setAttribute("aria-expanded", "false");
    helpBtn.focus();
  }
}

if (helpBtn) {
  helpBtn.addEventListener("click", openMathGuide);
}

if (mathGuideClose) {
  mathGuideClose.addEventListener("click", closeMathGuide);
}

if (guideOverlay) {
  guideOverlay.addEventListener("click", (e) => {
    if (e.target === guideOverlay) closeMathGuide();
  });
}

// Click-to-insert: clicking a guide example or starter phrase inserts text into the input
document.querySelectorAll(".guide-item[data-insert], .starter-tag[data-insert]").forEach(item => {
  item.addEventListener("click", () => {
    const text = item.getAttribute("data-insert");
    const inputEl = document.getElementById("userInput");
    // If it's a starter phrase, set it cleanly; if it's a math item, insert at cursor
    if (item.classList.contains("starter-tag")) {
      inputEl.value = text;
      closeMathGuide();
    } else {
      const start = inputEl.selectionStart;
      const end = inputEl.selectionEnd;
      const current = inputEl.value;
      inputEl.value = current.substring(0, start) + text + current.substring(end);
    }
    inputEl.focus();
    inputEl.dispatchEvent(new Event("input"));
  });
});

// Close guide with Escape key
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && guideOverlay && guideOverlay.classList.contains("visible")) {
    closeMathGuide();
  }
});

// =========================
// FLOATING WINDOW UTILITIES
// =========================
function makeDraggable(winEl, handleEl) {
  let isDragging = false;
  let offsetX = 0;
  let offsetY = 0;

  handleEl.addEventListener("mousedown", (e) => {
    if (e.target.closest("button")) return; // Don't drag when clicking close/action buttons
    isDragging = true;
    offsetX = e.clientX - winEl.getBoundingClientRect().left;
    offsetY = e.clientY - winEl.getBoundingClientRect().top;
    winEl.style.zIndex = 1001; // Bring to front
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    const x = Math.max(10, Math.min(window.innerWidth - winEl.offsetWidth - 10, e.clientX - offsetX));
    const y = Math.max(10, Math.min(window.innerHeight - winEl.offsetHeight - 10, e.clientY - offsetY));
    winEl.style.left = `${x}px`;
    winEl.style.top = `${y}px`;
    winEl.style.right = "auto";
  });

  document.addEventListener("mouseup", () => {
    isDragging = false;
  });
}

function setupFloatingTool(toggleBtnId, windowId, closeBtnId) {
  const toggleBtn = document.getElementById(toggleBtnId);
  const win = document.getElementById(windowId);
  const closeBtn = document.getElementById(closeBtnId);
  if (!toggleBtn || !win || !closeBtn) return;
  const header = win.querySelector(".window-header");

  if (header) makeDraggable(win, header);

  function openTool() {
    win.style.display = "flex";
    toggleBtn.classList.add("active");
    toggleBtn.setAttribute("aria-expanded", "true");
    
    // Focus first interactive control in floating window for screen reader & keyboard navigation
    const targetInput = win.querySelector("input:not([readonly]), math-field, button");
    if (targetInput) {
      setTimeout(() => targetInput.focus(), 60);
    }
  }

  function closeTool() {
    win.style.display = "none";
    toggleBtn.classList.remove("active");
    toggleBtn.setAttribute("aria-expanded", "false");
    toggleBtn.focus();
  }

  toggleBtn.addEventListener("click", () => {
    const isVisible = win.style.display !== "none";
    if (isVisible) {
      closeTool();
    } else {
      openTool();
    }
  });

  closeBtn.addEventListener("click", () => {
    closeTool();
  });

  win.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      closeTool();
    }
  });
}

// Initialize tools
setupFloatingTool("toolCalcBtn", "floatCalcWindow", "calcCloseBtn");
setupFloatingTool("toolGraphBtn", "floatGraphWindow", "graphCloseBtn");
setupFloatingTool("toolCheckBtn", "floatCheckWindow", "checkCloseBtn");
setupFloatingTool("toolUnitsBtn", "floatUnitsWindow", "unitsCloseBtn");
setupFloatingTool("toolMatrixBtn", "floatMatrixWindow", "matrixCloseBtn");
setupFloatingTool("toolEditorBtn", "floatEditorWindow", "editorCloseBtn");

// =========================
// VISUAL EQUATION EDITOR (MathLive)
// =========================
const mathField = document.getElementById("visualMathField");
const editorStatusMsg = document.getElementById("editorStatusMsg");
const editorModeToggle = document.getElementById("editorModeToggle");
const editorPaletteContainer = document.getElementById("editorPaletteContainer");

let isKeyboardMode = false;

if (editorModeToggle) {
  editorModeToggle.addEventListener("click", () => {
    isKeyboardMode = !isKeyboardMode;
    if (isKeyboardMode) {
      editorModeToggle.textContent = "🎨 Visual Palette";
      editorModeToggle.style.background = "var(--primary-color)";
      editorModeToggle.style.color = "#ffffff";
      if (editorPaletteContainer) editorPaletteContainer.style.display = "none";
      showEditorStatus("Keyboard Mode: Type naturally (e.g. x^2 + sqrt(x))");
    } else {
      editorModeToggle.textContent = "⌨️ Keyboard Mode";
      editorModeToggle.style.background = "var(--sidebar-hover)";
      editorModeToggle.style.color = "var(--text-main)";
      if (editorPaletteContainer) editorPaletteContainer.style.display = "block";
      showEditorStatus("Visual Mode: Click templates to build expressions");
    }
    if (mathField) mathField.focus();
  });
}

function showEditorStatus(msg) {
  if (!editorStatusMsg) return;
  editorStatusMsg.style.display = "block";
  editorStatusMsg.textContent = msg;
  setTimeout(() => { editorStatusMsg.style.display = "none"; }, 2500);
}

// Click-to-insert palette templates directly into visual math-field
document.querySelectorAll(".palette-btn[data-insert]").forEach(btn => {
  btn.addEventListener("click", () => {
    const template = btn.getAttribute("data-insert");
    if (mathField && mathField.insert) {
      mathField.insert(template, { focus: true });
    }
  });
});

// 1. Send Expression to Pythos Chat
document.getElementById("sendEqToPythos").addEventListener("click", () => {
  const latex = mathField ? mathField.value : "";
  if (!latex) return;
  const inputEl = document.getElementById("userInput");
  inputEl.value += (inputEl.value ? " " : "") + `$${latex}$`;
  inputEl.focus();
  inputEl.dispatchEvent(new Event("input"));
  showEditorStatus("Inserted into chat input!");
});

// 2. Send Expression to Scientific Calculator
document.getElementById("sendEqToCalc").addEventListener("click", () => {
  const latex = mathField ? mathField.value : "";
  if (!latex) return;
  // Convert basic LaTeX to calculator expression
  let expr = latex
    .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, "($1)/($2)")
    .replace(/\\sqrt\{([^}]+)\}/g, "sqrt($1)")
    .replace(/\\cdot/g, "*")
    .replace(/\\times/g, "*")
    .replace(/\\pi/g, "pi")
    .replace(/\\left\(/g, "(")
    .replace(/\\right\)/g, ")");
  
  const calcWin = document.getElementById("floatCalcWindow");
  const calcToggle = document.getElementById("toolCalcBtn");
  calcWin.style.display = "flex";
  calcToggle.classList.add("active");
  const calcDisplayEl = document.getElementById("calcDisplay");
  if (calcDisplayEl) calcDisplayEl.value = expr;
  showEditorStatus("Sent to Calculator!");
});

// 3. Send Expression to Function Grapher
document.getElementById("sendEqToGraph").addEventListener("click", () => {
  const latex = mathField ? mathField.value : "";
  if (!latex) return;
  let expr = latex
    .replace(/f\(x\)\s*=\s*/g, "")
    .replace(/y\s*=\s*/g, "")
    .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, "($1)/($2)")
    .replace(/\\sqrt\{([^}]+)\}/g, "sqrt($1)")
    .replace(/\\cdot/g, "*")
    .replace(/\\times/g, "*")
    .replace(/\\left\(/g, "(")
    .replace(/\\right\)/g, ")");
  
  const graphWin = document.getElementById("floatGraphWindow");
  const graphToggle = document.getElementById("toolGraphBtn");
  graphWin.style.display = "flex";
  graphToggle.classList.add("active");
  const graphInput = document.getElementById("graphFuncInput");
  if (graphInput) {
    graphInput.value = expr;
    const plotBtn = document.getElementById("graphPlotBtn");
    if (plotBtn) plotBtn.click();
  }
  showEditorStatus("Sent & Plotted in Grapher!");
});

// 4. Send Expression to Check My Work
document.getElementById("sendEqToCheck").addEventListener("click", () => {
  const latex = mathField ? mathField.value : "";
  if (!latex) return;
  const checkWin = document.getElementById("floatCheckWindow");
  const checkToggle = document.getElementById("toolCheckBtn");
  checkWin.style.display = "flex";
  checkToggle.classList.add("active");
  const checkEqInputEl = document.getElementById("checkEqInput");
  if (checkEqInputEl) checkEqInputEl.value = latex;
  showEditorStatus("Sent to Check My Work!");
});

// 5. Copy LaTeX Code
document.getElementById("copyEqLaTeX").addEventListener("click", () => {
  const latex = mathField ? mathField.value : "";
  navigator.clipboard.writeText(latex);
  showEditorStatus("LaTeX copied to clipboard!");
});

// =========================
// UNIT CONVERTER LOGIC
// =========================
const unitsValueInput = document.getElementById("unitsValueInput");
const unitsTargetInput = document.getElementById("unitsTargetInput");
const unitsConvertBtn = document.getElementById("unitsConvertBtn");
const unitsResultArea = document.getElementById("unitsResultArea");
const unitsSendToPythos = document.getElementById("unitsSendToPythos");

unitsConvertBtn.addEventListener("click", () => {
  const valStr = unitsValueInput.value.trim();
  const targetUnit = unitsTargetInput.value.trim();

  try {
    if (window.math && window.math.unit) {
      const u = window.math.unit(valStr);
      const converted = u.to(targetUnit);
      unitsResultArea.style.display = "block";
      unitsResultArea.className = "check-result-area check-result-pass";
      unitsResultArea.innerHTML = `<strong>Result:</strong> ${converted.toString()}`;
    }
  } catch (err) {
    unitsResultArea.style.display = "block";
    unitsResultArea.className = "check-result-area check-result-fail";
    unitsResultArea.innerHTML = `<strong>Error:</strong> Cannot convert <em>${valStr}</em> to <em>${targetUnit}</em>.`;
  }
});

unitsSendToPythos.addEventListener("click", () => {
  const text = unitsResultArea.innerText.replace("Result: ", "").trim() || `${unitsValueInput.value} to ${unitsTargetInput.value}`;
  const inputEl = document.getElementById("userInput");
  inputEl.value += (inputEl.value ? " " : "") + text;
  inputEl.focus();
  inputEl.dispatchEvent(new Event("input"));
});

// =========================
// MATRIX CALCULATOR LOGIC
// =========================
const matrixAInput = document.getElementById("matrixAInput");
const matrixBInput = document.getElementById("matrixBInput");
const matrixResultArea = document.getElementById("matrixResultArea");
const matrixSendToPythos = document.getElementById("matrixSendToPythos");

function parseMatrix(inputStr) {
  try {
    return JSON.parse(inputStr);
  } catch (e) {
    return window.math.evaluate(inputStr);
  }
}

function displayMatrixResult(res, opName) {
  matrixResultArea.style.display = "block";
  matrixResultArea.className = "check-result-area check-result-pass";
  matrixResultArea.innerHTML = `<strong>${opName}:</strong><br><code>${JSON.stringify(res)}</code>`;
}

document.getElementById("matDetBtn").addEventListener("click", () => {
  try {
    const a = parseMatrix(matrixAInput.value);
    const d = window.math.det(a);
    displayMatrixResult(d, "det(A)");
  } catch (err) {
    matrixResultArea.style.display = "block";
    matrixResultArea.className = "check-result-area check-result-fail";
    matrixResultArea.innerHTML = `Error: ${err.message}`;
  }
});

document.getElementById("matInvBtn").addEventListener("click", () => {
  try {
    const a = parseMatrix(matrixAInput.value);
    const inv = window.math.inv(a);
    displayMatrixResult(inv, "inv(A)");
  } catch (err) {
    matrixResultArea.style.display = "block";
    matrixResultArea.className = "check-result-area check-result-fail";
    matrixResultArea.innerHTML = `Error: ${err.message}`;
  }
});

document.getElementById("matMulBtn").addEventListener("click", () => {
  try {
    const a = parseMatrix(matrixAInput.value);
    const b = parseMatrix(matrixBInput.value);
    const prod = window.math.multiply(a, b);
    displayMatrixResult(prod, "A × B");
  } catch (err) {
    matrixResultArea.style.display = "block";
    matrixResultArea.className = "check-result-area check-result-fail";
    matrixResultArea.innerHTML = `Error: ${err.message}`;
  }
});

document.getElementById("matAddBtn").addEventListener("click", () => {
  try {
    const a = parseMatrix(matrixAInput.value);
    const b = parseMatrix(matrixBInput.value);
    const sum = window.math.add(a, b);
    displayMatrixResult(sum, "A + B");
  } catch (err) {
    matrixResultArea.style.display = "block";
    matrixResultArea.className = "check-result-area check-result-fail";
    matrixResultArea.innerHTML = `Error: ${err.message}`;
  }
});

matrixSendToPythos.addEventListener("click", () => {
  const resultText = matrixResultArea.innerText.trim() || `Matrix A: ${matrixAInput.value}`;
  const inputEl = document.getElementById("userInput");
  inputEl.value += (inputEl.value ? " " : "") + resultText;
  inputEl.focus();
  inputEl.dispatchEvent(new Event("input"));
});

// =========================
// SCIENTIFIC CALCULATOR LOGIC
// =========================
const calcDisplay = document.getElementById("calcDisplay");
const calcHistory = document.getElementById("calcHistory");
const calcDegRadBtn = document.getElementById("calcDegRad");
let isDegMode = true;
let calcCurrentExpr = "";

calcDegRadBtn.addEventListener("click", () => {
  isDegMode = !isDegMode;
  calcDegRadBtn.textContent = isDegMode ? "DEG" : "RAD";
});

document.querySelectorAll(".calc-key").forEach(btn => {
  btn.addEventListener("click", () => {
    const val = btn.getAttribute("data-calc");
    if (!val || val === "rad-deg") return;

    if (val === "clear") {
      calcCurrentExpr = "";
      calcDisplay.value = "0";
      calcHistory.textContent = "";
    } else if (val === "=") {
      try {
        let expr = calcCurrentExpr
          .replace(/÷/g, "/")
          .replace(/×/g, "*")
          .replace(/π/g, "pi")
          .replace(/√\(/g, "sqrt(")
          .replace(/√/g, "sqrt");

        if (window.math) {
          const res = window.math.evaluate(expr);
          calcHistory.textContent = `${calcCurrentExpr} =`;
          calcDisplay.value = String(res);
          calcCurrentExpr = String(res);
        }
      } catch (e) {
        calcDisplay.value = "Error";
      }
    } else if (val === "copy") {
      navigator.clipboard.writeText(calcDisplay.value);
      calcHistory.textContent = "Copied to clipboard!";
    } else {
      if (val === "sqrt") {
        calcCurrentExpr += "sqrt(";
      } else if (val === "sin" || val === "cos" || val === "tan" || val === "ln" || val === "log") {
        calcCurrentExpr += `${val}(`;
      } else {
        calcCurrentExpr += val;
      }
      calcDisplay.value = calcCurrentExpr;
    }
  });
});

document.getElementById("calcSendToPythos").addEventListener("click", () => {
  const result = calcDisplay.value;
  const inputEl = document.getElementById("userInput");
  inputEl.value += (inputEl.value ? " " : "") + result;
  inputEl.focus();
  inputEl.dispatchEvent(new Event("input"));
});

// =========================
// FUNCTION GRAPHER LOGIC
// =========================
const graphCanvas = document.getElementById("graphCanvas");
const graphCtx = graphCanvas.getContext("2d");
const graphFuncInput = document.getElementById("graphFuncInput");
const graphPlotBtn = document.getElementById("graphPlotBtn");

function drawGraph(exprString) {
  const width = graphCanvas.width;
  const height = graphCanvas.height;
  graphCtx.clearRect(0, 0, width, height);

  if (!window.math || !exprString || !exprString.trim()) return;

  try {
    const cleanExpr = sanitizeGraphExpr(exprString);
    const compiled = window.math.compile(cleanExpr);

    const xMin = -10, xMax = 10;
    let yMin = -10, yMax = 10;

    // Sample function for adaptive bounds
    const samples = [];
    const numSamples = 100;
    const stepSample = (xMax - xMin) / numSamples;
    for (let i = 0; i <= numSamples; i++) {
      const x = xMin + i * stepSample;
      try {
        const y = compiled.evaluate({ x });
        if (typeof y === "number" && isFinite(y) && !isNaN(y) && Math.abs(y) < 1e5) {
          samples.push(y);
        }
      } catch (_) {}
    }

    if (samples.length > 0) {
      samples.sort((a, b) => a - b);
      const p5 = samples[Math.floor(samples.length * 0.05)] || samples[0];
      const p95 = samples[Math.floor(samples.length * 0.95)] || samples[samples.length - 1];

      if (p5 > 10 || p95 < -10) {
        const pad = Math.max((p95 - p5) * 0.15, 2);
        yMin = p5 - pad;
        yMax = p95 + pad;
      }
    }

    const toCanvasX = x => ((x - xMin) / (xMax - xMin)) * width;
    const toCanvasY = y => height - ((y - yMin) / (yMax - yMin)) * height;

    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    const bgCol = isDark ? "#0b1120" : "#ffffff";
    const gridCol = isDark ? "#1e293b" : "#f1f5f9";
    const axisCol = isDark ? "#475569" : "#cbd5e1";
    const labelCol = isDark ? "#94a3b8" : "#64748b";
    const curveCol = isDark ? "#38bdf8" : "#2a728f";

    // Draw Background
    graphCtx.fillStyle = bgCol;
    graphCtx.fillRect(0, 0, width, height);

    // Draw Grid
    graphCtx.strokeStyle = gridCol;
    graphCtx.lineWidth = 1;

    for (let x = xMin; x <= xMax; x += 2) {
      graphCtx.beginPath();
      graphCtx.moveTo(toCanvasX(x), 0);
      graphCtx.lineTo(toCanvasX(x), height);
      graphCtx.stroke();
    }
    const yGridStep = Math.max(2, Math.round((yMax - yMin) / 10));
    for (let y = Math.floor(yMin); y <= Math.ceil(yMax); y += yGridStep) {
      graphCtx.beginPath();
      graphCtx.moveTo(0, toCanvasY(y));
      graphCtx.lineTo(width, toCanvasY(y));
      graphCtx.stroke();
    }

    // Draw Axes
    graphCtx.strokeStyle = axisCol;
    graphCtx.lineWidth = 1.5;
    graphCtx.beginPath();
    const clampedY0 = Math.max(0, Math.min(height, toCanvasY(0)));
    const clampedX0 = Math.max(0, Math.min(width, toCanvasX(0)));
    graphCtx.moveTo(0, clampedY0);
    graphCtx.lineTo(width, clampedY0);
    graphCtx.moveTo(clampedX0, 0);
    graphCtx.lineTo(clampedX0, height);
    graphCtx.stroke();

    // Axis Labels
    graphCtx.fillStyle = labelCol;
    graphCtx.font = "10px Inter, sans-serif";
    graphCtx.fillText("x", width - 12, clampedY0 > height - 15 ? clampedY0 - 15 : clampedY0 - 4);
    graphCtx.fillText("y", clampedX0 < 15 ? clampedX0 + 15 : clampedX0 + 4, 12);

    // Plot Curve with Discontinuity & Asymptote Detection
    graphCtx.strokeStyle = curveCol;
    graphCtx.lineWidth = 2.5;
    graphCtx.beginPath();

    let started = false;
    let prevY = null;
    const step = (xMax - xMin) / width;
    const ySpan = yMax - yMin;

    for (let cx = 0; cx <= width; cx++) {
      const xVal = xMin + cx * step;
      try {
        const yVal = compiled.evaluate({ x: xVal });
        if (typeof yVal === "number" && !isNaN(yVal) && isFinite(yVal)) {
          const isJump = prevY !== null && Math.abs(yVal - prevY) > ySpan * 0.7 && (yVal * prevY < 0 || Math.abs(yVal) > ySpan || Math.abs(prevY) > ySpan);
          if (isJump) {
            graphCtx.stroke();
            graphCtx.beginPath();
            started = false;
          }

          const cy = toCanvasY(yVal);
          if (!started) {
            graphCtx.moveTo(cx, cy);
            started = true;
          } else {
            graphCtx.lineTo(cx, cy);
          }
          prevY = yVal;
        } else {
          if (started) {
            graphCtx.stroke();
            graphCtx.beginPath();
            started = false;
          }
          prevY = null;
        }
      } catch (e) {
        if (started) {
          graphCtx.stroke();
          graphCtx.beginPath();
          started = false;
        }
        prevY = null;
      }
    }
    graphCtx.stroke();
  } catch (err) {
    console.warn("[GRAPHER] Parse error:", err.message);
  }
}

graphPlotBtn.addEventListener("click", () => drawGraph(graphFuncInput.value));
graphFuncInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") drawGraph(graphFuncInput.value);
});
document.getElementById("toolGraphBtn").addEventListener("click", () => {
  setTimeout(() => drawGraph(graphFuncInput.value), 50);
});

document.getElementById("graphSendToPythos").addEventListener("click", () => {
  const func = graphFuncInput.value;
  askPythos(`Can you analyze and explain the behavior of the function f(x) = ${func}?`);
});

// =========================
// CHECK MY WORK (STEP VERIFIER)
// =========================
const checkEqInput = document.getElementById("checkEqInput");
const checkVarInput = document.getElementById("checkVarInput");
const checkAnsInput = document.getElementById("checkAnsInput");
const checkRunBtn = document.getElementById("checkRunBtn");
const checkResultArea = document.getElementById("checkResultArea");
const checkAskPythosBtn = document.getElementById("checkAskPythosBtn");

let lastFailedVerification = null;

checkRunBtn.addEventListener("click", () => {
  const rawEq = checkEqInput.value.trim();
  const variable = checkVarInput.value.trim() || "x";
  const proposedVal = checkAnsInput.value.trim();

  if (!rawEq.includes("=")) {
    checkResultArea.style.display = "block";
    checkResultArea.className = "check-result-area check-result-fail";
    checkResultArea.innerHTML = "Please enter an equation containing '=' (e.g. <code>2*x + 7 = 19</code>).";
    checkAskPythosBtn.style.display = "none";
    return;
  }

  const [leftExpr, rightExpr] = rawEq.split("=").map(s => s.trim());
  const parsedVal = parseFloat(proposedVal);

  if (isNaN(parsedVal)) {
    checkResultArea.style.display = "block";
    checkResultArea.className = "check-result-area check-result-fail";
    checkResultArea.innerHTML = "Please enter a valid numerical answer for the variable.";
    checkAskPythosBtn.style.display = "none";
    return;
  }

  const res = window.DeterministicMath.verifyEquationSolution(leftExpr, rightExpr, variable, parsedVal);

  checkResultArea.style.display = "block";
  if (res && res.isCorrect) {
    checkResultArea.className = "check-result-area check-result-pass";
    checkResultArea.innerHTML = `<strong>✓ Correct!</strong> Substituting ${variable} = ${parsedVal} gives: <br>Left Side = ${res.leftVal} | Right Side = ${res.rightVal} (Matches!)`;
    checkAskPythosBtn.style.display = "none";
    lastFailedVerification = null;
  } else if (res) {
    checkResultArea.className = "check-result-area check-result-fail";
    checkResultArea.innerHTML = `<strong>✗ Incorrect.</strong> Substituting ${variable} = ${parsedVal} gives: <br>Left Side: <code>${res.leftVal}</code> ≠ Right Side: <code>${res.rightVal}</code>`;
    checkAskPythosBtn.style.display = "block";
    lastFailedVerification = {
      equation: rawEq,
      variable,
      proposedVal,
      leftVal: res.leftVal,
      rightVal: res.rightVal
    };
  } else {
    checkResultArea.className = "check-result-area check-result-fail";
    checkResultArea.innerHTML = "Could not parse or verify this expression. Check formatting.";
    checkAskPythosBtn.style.display = "none";
  }
});

checkAskPythosBtn.addEventListener("click", () => {
  if (lastFailedVerification) {
    const { equation, variable, proposedVal, leftVal, rightVal } = lastFailedVerification;
    askPythos(`I was solving ${equation} and guessed that ${variable} = ${proposedVal}, but that yielded ${leftVal} instead of ${rightVal}. Can you guide me on where I went wrong?`);
  }
});

// =========================
// THEME SWITCHER (DARK / LIGHT MODE)
// =========================
const themeToggleBtn = document.getElementById("themeToggleBtn");
const themeIconSun = document.getElementById("themeIconSun");
const themeIconMoon = document.getElementById("themeIconMoon");

function applyTheme(theme) {
  if (theme === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
    if (themeIconSun) themeIconSun.style.display = "block";
    if (themeIconMoon) themeIconMoon.style.display = "none";
  } else {
    document.documentElement.removeAttribute("data-theme");
    if (themeIconSun) themeIconSun.style.display = "none";
    if (themeIconMoon) themeIconMoon.style.display = "block";
  }

  // Redraw floating window graph if active
  try {
    const gInput = document.getElementById("graphFuncInput");
    if (gInput && gInput.value && typeof drawGraph === "function") {
      drawGraph(gInput.value);
    }
  } catch (_) {}

  // Redraw all inline chat graph canvases
  try {
    document.querySelectorAll(".msg-inline-graph-card").forEach(card => {
      const c = card.querySelector("canvas");
      const f = card.dataset.formula || (card.querySelector("code") ? card.querySelector("code").textContent.replace(/^f\(x\)\s*=\s*/, "") : null);
      if (c && f && typeof renderInlineGraph === "function") {
        renderInlineGraph(c, f);
      }
    });
  } catch (_) {}
}

// Load saved theme or system preference
const savedTheme = localStorage.getItem("pythos_theme") || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
applyTheme(savedTheme);

if (themeToggleBtn) {
  themeToggleBtn.addEventListener("click", () => {
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    const nextTheme = isDark ? "light" : "dark";
    applyTheme(nextTheme);
    localStorage.setItem("pythos_theme", nextTheme);
  });
}

// =========================
// VOICE INPUT (SPEECH-TO-TEXT)
// =========================
const voiceBtn = document.getElementById("voiceBtn");
let recognition = null;
let isRecording = false;

if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRec();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = "en-US";

  recognition.onstart = () => {
    isRecording = true;
    if (voiceBtn) voiceBtn.classList.add("recording");
    input.placeholder = "Listening... Speak your math problem or question...";
  };

  recognition.onresult = (event) => {
    let transcript = "";
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      transcript += event.results[i][0].transcript;
    }
    if (transcript.trim()) {
      input.value = transcript;
      input.dispatchEvent(new Event("input"));
    }
  };

  recognition.onerror = (event) => {
    console.warn("[SPEECH ERROR]:", event.error);
    isRecording = false;
    if (voiceBtn) voiceBtn.classList.remove("recording");
    input.placeholder = "Speak to the Oracle...";
  };

  recognition.onend = () => {
    isRecording = false;
    if (voiceBtn) voiceBtn.classList.remove("recording");
    input.placeholder = "Speak to the Oracle...";
  };
}

if (voiceBtn) {
  voiceBtn.addEventListener("click", () => {
    if (!recognition) {
      alert("Speech recognition is not supported in this browser. Please try Chrome, Edge, or Safari.");
      return;
    }
    if (isRecording) {
      recognition.stop();
    } else {
      recognition.start();
    }
  });
// =========================
// ACCESSIBILITY: SKIP LINKS & KEYBOARD FOCUS
// =========================
document.querySelectorAll(".skip-link").forEach(link => {
  link.addEventListener("click", (e) => {
    const targetId = link.getAttribute("href").replace(/^#/, "");
    const targetEl = document.getElementById(targetId);
    if (targetEl) {
      e.preventDefault();
      targetEl.focus();
      targetEl.scrollIntoView({ behavior: "smooth", block: "start" });
      const announcer = document.getElementById("srLiveRegion");
      if (announcer) {
        announcer.textContent = `Navigated to ${targetId === "userInput" ? "math problem input" : "conversation history"}`;
      }
    }
  });
});

// =========================
// ACCESSIBILITY: INTERACTIVE LANGUAGE SELECTOR
// =========================
const LANG_LOCALES = {
  en: { code: "en-US", name: "English", placeholder: "Speak to the Oracle, dictate, or ask a math question..." },
  es: { code: "es-MX", name: "Español", placeholder: "Habla con el Oráculo o haz una pregunta de matemáticas..." },
  fr: { code: "fr-FR", name: "Français", placeholder: "Parlez à l'Oracle ou posez une question de maths..." },
  de: { code: "de-DE", name: "Deutsch", placeholder: "Sprich mit dem Orakel oder stelle eine Matheaufgabe..." },
  ja: { code: "ja-JP", name: "日本語", placeholder: "オラクルに数学や物理の質問をする..." },
  zh: { code: "zh-CN", name: "中文", placeholder: "向神谕询问数学或物理问题..." },
  ko: { code: "ko-KR", name: "한국어", placeholder: "오라클에게 수학이나 물리학 질문을 해보세요..." },
  it: { code: "it-IT", name: "Italiano", placeholder: "Parla con l'Oracolo o fai una domanda di matematica..." },
  hi: { code: "hi-IN", name: "हिन्दी", placeholder: "ओरेकल से गणित या भौतिकी का प्रश्न पूछें..." },
  pt: { code: "pt-BR", name: "Português", placeholder: "Fale com o Oráculo ou faça uma pergunta de matemática..." }
};

document.querySelectorAll(".lang-chip").forEach(chip => {
  chip.addEventListener("click", () => {
    const langKey = chip.getAttribute("data-lang");
    const langInfo = LANG_LOCALES[langKey] || LANG_LOCALES.en;

    document.querySelectorAll(".lang-chip").forEach(c => {
      c.classList.remove("active");
      c.setAttribute("aria-pressed", "false");
      const cName = c.getAttribute("data-lang-name") || "Language";
      c.setAttribute("aria-label", `Switch language to ${cName}`);
    });

    chip.classList.add("active");
    chip.setAttribute("aria-pressed", "true");
    chip.setAttribute("aria-label", `Selected Language: ${langInfo.name}`);

    if (input) {
      input.placeholder = langInfo.placeholder;
      input.focus();
    }

    if (recognition) {
      recognition.lang = langInfo.code;
    }

    const announcer = document.getElementById("srLiveRegion");
    if (announcer) {
      announcer.textContent = `Language switched to ${langInfo.name}. You can type or dictate your math problem in ${langInfo.name}.`;
    }
  });
});

// ===== INIT =====
clearChatUI();

// Render KaTeX mathematical typography on the Equation Builder palette
setTimeout(() => {
  const palette = document.getElementById("editorPaletteContainer");
  if (palette) renderMath(palette);
}, 100);