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
        { left: "$", right: "$", display: false },
        { left: "\\[", right: "\\]", display: true },
        { left: "\\(", right: "\\)", display: false }
      ],
      throwOnError: false
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

function appendMessage(role, text) {
  const div = document.createElement("div");
  div.className = `message ${role}`;
  const formattedText = text.replace(/\n/g, '<br>');
  div.innerHTML = formattedText;
  output.appendChild(div);
  renderMath(div);
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
// OLLAMA INTEGRATION
// =========================
let isProcessing = false;
const MAX_INPUT_LENGTH = 500;

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
  // Hide the math preview
  const preview = document.getElementById("mathPreview");
  if (preview) preview.style.display = "none";

  const thinking = showThinking();

  try {
    const res = await fetch("http://localhost:11434/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "pythos",
        messages: messages,
        stream: false,
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

// Enforce max length live
input.addEventListener("input", () => {
  if (input.value.length > MAX_INPUT_LENGTH) {
    input.value = input.value.substring(0, MAX_INPUT_LENGTH);
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

// Click-to-insert: clicking a guide example inserts the text into the input
document.querySelectorAll(".guide-item[data-insert]").forEach(item => {
  item.addEventListener("click", () => {
    const text = item.getAttribute("data-insert");
    const inputEl = document.getElementById("userInput");
    // Insert at cursor position (or append)
    const start = inputEl.selectionStart;
    const end = inputEl.selectionEnd;
    const current = inputEl.value;
    inputEl.value = current.substring(0, start) + text + current.substring(end);
    inputEl.focus();
    // Place cursor after the inserted text
    const newPos = start + text.length;
    inputEl.setSelectionRange(newPos, newPos);
    // Trigger the live preview
    inputEl.dispatchEvent(new Event("input"));
  });
});

// Close guide with Escape key
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && guideOverlay.classList.contains("visible")) {
    guideOverlay.classList.remove("visible");
  }
});

// ===== INIT =====
clearChatUI();