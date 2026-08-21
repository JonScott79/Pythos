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
  if (window.renderMathInElement) {
    renderMathInElement(element, {
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
      throwOnError: false,
      errorColor: "#ef4444"
    });
  }
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

// =========================
// UI HELPERS
// =========================
function showThinking() {
  const div = document.createElement("div");
  div.className = "message thinking";
  div.innerHTML = `<em>The Oracle is pondering...</em>`;
  output.appendChild(div);
  output.scrollTop = output.scrollHeight;
  return div;
}

function removeThinking(el) {
  if (el && el.parentNode) el.parentNode.removeChild(el);
}

function renderInlineGraph(canvas, exprString) {
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);

  const xMin = -10, xMax = 10, yMin = -10, yMax = 10;
  const toCanvasX = x => ((x - xMin) / (xMax - xMin)) * width;
  const toCanvasY = y => height - ((y - yMin) / (yMax - yMin)) * height;

  // Background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  // Grid
  ctx.strokeStyle = "#f1f5f9";
  ctx.lineWidth = 1;
  for (let x = xMin; x <= xMax; x += 2) {
    ctx.beginPath();
    ctx.moveTo(toCanvasX(x), 0);
    ctx.lineTo(toCanvasX(x), height);
    ctx.stroke();
  }
  for (let y = yMin; y <= yMax; y += 2) {
    ctx.beginPath();
    ctx.moveTo(0, toCanvasY(y));
    ctx.lineTo(width, toCanvasY(y));
    ctx.stroke();
  }

  // Axes
  ctx.strokeStyle = "#cbd5e1";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, toCanvasY(0));
  ctx.lineTo(width, toCanvasY(0));
  ctx.moveTo(toCanvasX(0), 0);
  ctx.lineTo(toCanvasX(0), height);
  ctx.stroke();

  // Axis Labels
  ctx.fillStyle = "#94a3b8";
  ctx.font = "10px Inter, sans-serif";
  ctx.fillText("x", width - 12, toCanvasY(0) - 4);
  ctx.fillText("y", toCanvasX(0) + 4, 12);

  if (!window.math || !exprString.trim()) return false;

  try {
    // Sanitize mathematical expression
    let cleanExpr = exprString
      .replace(/f\(x\)\s*=\s*/g, "")
      .replace(/y\s*=\s*/g, "")
      .replace(/=\s*0/g, "")
      .replace(/\\cdot/g, "*")
      .replace(/\\times/g, "*")
      .replace(/(\d+)\s*x/g, "$1*x");

    const compiled = window.math.compile(cleanExpr);
    ctx.strokeStyle = "#2a728f";
    ctx.lineWidth = 2.5;
    ctx.beginPath();

    let started = false;
    const step = (xMax - xMin) / width;

    for (let cx = 0; cx <= width; cx++) {
      const xVal = xMin + cx * step;
      try {
        const yVal = compiled.evaluate({ x: xVal });
        if (typeof yVal === "number" && !isNaN(yVal) && isFinite(yVal)) {
          const cy = toCanvasY(yVal);
          if (!started) {
            ctx.moveTo(cx, cy);
            started = true;
          } else {
            ctx.lineTo(cx, cy);
          }
        } else {
          started = false;
        }
      } catch (e) {
        started = false;
      }
    }
    ctx.stroke();
    return true;
  } catch (err) {
    console.warn("[GRAPH RENDERING ERROR]:", err.message);
    return false;
  }
}

function appendMessage(role, text) {
  const div = document.createElement("div");
  div.className = `message ${role}`;
  
  const contentDiv = document.createElement("div");
  contentDiv.className = "message-content";

  // Filter out any raw TikZ blocks if LLM accidentally hallucinates them
  let sanitized = text.replace(/\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\}/gi, "");

  // Detect [GRAPH: expr] tokens
  const graphTokenRegex = /\[GRAPH:\s*([^\]]+)\]/i;
  const graphMatch = sanitized.match(graphTokenRegex);

  if (graphMatch) {
    const exprToGraph = graphMatch[1].trim();
    sanitized = sanitized.replace(graphTokenRegex, '<div class="msg-inline-graph-card"></div>');
  }

  const formattedText = sanitized.replace(/\n/g, '<br>');
  contentDiv.innerHTML = formattedText;

  // If a graph was detected, instantiate the live canvas
  if (graphMatch) {
    const graphCard = contentDiv.querySelector(".msg-inline-graph-card");
    if (graphCard) {
      const exprToGraph = graphMatch[1].trim();
      const canvas = document.createElement("canvas");
      canvas.className = "msg-graph-canvas";
      canvas.width = 360;
      canvas.height = 200;
      
      const success = renderInlineGraph(canvas, exprToGraph);
      if (success) {
        const caption = document.createElement("div");
        caption.className = "msg-graph-caption";
        caption.innerHTML = `<strong>📈 Rendered Graph:</strong> <code>f(x) = ${exprToGraph}</code>`;
        graphCard.appendChild(canvas);
        graphCard.appendChild(caption);
      } else {
        graphCard.innerHTML = `<div class="graph-render-fail">⚠️ Could not render graph for <code>${exprToGraph}</code>. Check expression syntax.</div>`;
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
  copyBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
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

      // Wrapper
      const wrapper = document.createElement("div");
      wrapper.className = "chat-item-wrapper";

      // Chat title
      const titleEl = document.createElement("div");
      titleEl.className = "chat-item";
      titleEl.textContent = data.title || "Unknown Session";
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

// ----- Delete -----
async function deleteChat(chatId) {
  if (!confirm("Delete this chat session?")) return;
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
        appendMessage(msg.role, msg.content);
      });
    }
    loadSidebarChats(); // Refresh to update active state
  } catch(e) {
    console.error("Error loading chat", e);
  }
}

document.getElementById("newChatBtn").addEventListener("click", () => {
  currentChatId = null;
  clearChatUI();
  loadSidebarChats();
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
}

async function askPythos(userText) {
  if (!userText.trim()) return;
  if (isProcessing) return; // Block spam

  // Cap input length
  if (userText.length > MAX_INPUT_LENGTH) {
    userText = userText.substring(0, MAX_INPUT_LENGTH);
  }

  setInputLocked(true);

  // Append user message to history
  messages.push({ role: "user", content: userText });
  appendMessage("user", userText);
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

  const thinking = showThinking();

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
        appendMessage("assistant", "The Oracle is silent. (API Error)");
    }

  } catch (err) {
    console.error(err);
    removeThinking(thinking);
    appendMessage("assistant", "The connection to Athens has been lost. Is Ollama running?");
  }

  // Cooldown before allowing next message
  setTimeout(() => setInputLocked(false), 1000);
}

// ===== EVENTS =====
button.addEventListener("click", () => askPythos(input.value));
input.addEventListener("keypress", e => {
  if (e.key === "Enter") askPythos(input.value);
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

// Mobile menu toggle
const sidebar = document.getElementById("sidebar");
document.getElementById("mobileMenuBtn").addEventListener("click", () => {
  sidebar.classList.toggle("open");
});

// ===== MATH INPUT GUIDE =====
const guideOverlay = document.getElementById("mathGuideOverlay");
const helpBtn = document.getElementById("helpBtn");

helpBtn.addEventListener("click", () => {
  guideOverlay.classList.add("visible");
});

document.getElementById("mathGuideClose").addEventListener("click", () => {
  guideOverlay.classList.remove("visible");
});

guideOverlay.addEventListener("click", (e) => {
  if (e.target === guideOverlay) guideOverlay.classList.remove("visible");
});

// Click-to-insert: clicking a guide example or starter phrase inserts text into the input
document.querySelectorAll(".guide-item[data-insert], .starter-tag[data-insert]").forEach(item => {
  item.addEventListener("click", () => {
    const text = item.getAttribute("data-insert");
    const inputEl = document.getElementById("userInput");
    // If it's a starter phrase, set it cleanly; if it's a math item, insert at cursor
    if (item.classList.contains("starter-tag")) {
      inputEl.value = text;
      guideOverlay.classList.remove("visible");
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
  if (e.key === "Escape" && guideOverlay.classList.contains("visible")) {
    guideOverlay.classList.remove("visible");
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
  const header = win.querySelector(".window-header");

  makeDraggable(win, header);

  toggleBtn.addEventListener("click", () => {
    const isVisible = win.style.display !== "none";
    win.style.display = isVisible ? "none" : "flex";
    toggleBtn.classList.toggle("active", !isVisible);
  });

  closeBtn.addEventListener("click", () => {
    win.style.display = "none";
    toggleBtn.classList.remove("active");
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
      editorModeToggle.style.background = "#e2e8f0";
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

  // Coordinate ranges
  const xMin = -10, xMax = 10, yMin = -10, yMax = 10;
  const toCanvasX = x => ((x - xMin) / (xMax - xMin)) * width;
  const toCanvasY = y => height - ((y - yMin) / (yMax - yMin)) * height;

  // Draw Grid
  graphCtx.strokeStyle = "#e2e8f0";
  graphCtx.lineWidth = 1;

  for (let x = xMin; x <= xMax; x += 2) {
    graphCtx.beginPath();
    graphCtx.moveTo(toCanvasX(x), 0);
    graphCtx.lineTo(toCanvasX(x), height);
    graphCtx.stroke();
  }
  for (let y = yMin; y <= yMax; y += 2) {
    graphCtx.beginPath();
    graphCtx.moveTo(0, toCanvasY(y));
    graphCtx.lineTo(width, toCanvasY(y));
    graphCtx.stroke();
  }

  // Draw Axes
  graphCtx.strokeStyle = "#94a3b8";
  graphCtx.lineWidth = 1.5;
  graphCtx.beginPath();
  graphCtx.moveTo(0, toCanvasY(0));
  graphCtx.lineTo(width, toCanvasY(0));
  graphCtx.moveTo(toCanvasX(0), 0);
  graphCtx.lineTo(toCanvasX(0), height);
  graphCtx.stroke();

  // Plot Function
  if (!window.math || !exprString.trim()) return;

  try {
    const compiled = window.math.compile(exprString);
    graphCtx.strokeStyle = "#2a728f";
    graphCtx.lineWidth = 2.5;
    graphCtx.beginPath();

    let started = false;
    const step = (xMax - xMin) / width;

    for (let cx = 0; cx <= width; cx++) {
      const xVal = xMin + cx * step;
      try {
        const yVal = compiled.evaluate({ x: xVal });
        if (typeof yVal === "number" && !isNaN(yVal) && isFinite(yVal)) {
          const cy = toCanvasY(yVal);
          if (!started) {
            graphCtx.moveTo(cx, cy);
            started = true;
          } else {
            graphCtx.lineTo(cx, cy);
          }
        } else {
          started = false;
        }
      } catch (e) {
        started = false;
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

// ===== INIT =====
clearChatUI();

// Render KaTeX mathematical typography on the Equation Builder palette
setTimeout(() => {
  const palette = document.getElementById("editorPaletteContainer");
  if (palette) renderMath(palette);
}, 100);