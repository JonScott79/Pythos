import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, collection, addDoc, updateDoc, doc, getDocs, query, orderBy, serverTimestamp, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

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

  if (window.renderMathInElement) {
    renderMathInElement(div, {
      delimiters: [
        { left: "$$", right: "$$", display: true },
        { left: "$", right: "$", display: false },
        { left: "\\[", right: "\\]", display: true },
        { left: "\\(", right: "\\)", display: false }
      ]
    });
  }
  output.scrollTop = output.scrollHeight;
}

function clearChatUI() {
  output.innerHTML = "";
  messages = [];
  const intro = "Greetings. I am Pythos, your mathematical and physics guide. What concepts shall we explore today?";
  messages.push({ role: "assistant", content: intro });
  appendMessage("assistant", intro);
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

    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      const div = document.createElement("div");
      div.className = "chat-item";
      div.textContent = data.title || "Unknown Session";
      if (docSnap.id === currentChatId) div.classList.add("active");
      
      div.addEventListener("click", () => loadChat(docSnap.id));
      listEl.appendChild(div);
    });
  } catch (e) {
    console.error(e);
    listEl.innerHTML = "<em>Failed to load chats</em>";
  }
}

async function loadChat(chatId) {
  if (!currentUser) return;
  currentChatId = chatId;
  
  // Update UI active state
  document.querySelectorAll(".chat-item").forEach(el => el.classList.remove("active"));
  loadSidebarChats(); // Refresh list to set active class properly
  
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
  } catch(e) {
    console.error("Error loading chat", e);
  }
}

document.getElementById("newChatBtn").addEventListener("click", () => {
  currentChatId = null;
  clearChatUI();
  document.querySelectorAll(".chat-item").forEach(el => el.classList.remove("active"));
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
async function askPythos(userText) {
  if (!userText.trim()) return;

  // Append user message to history
  messages.push({ role: "user", content: userText });
  appendMessage("user", userText);
  input.value = "";

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
}

// ===== EVENTS =====
button.addEventListener("click", () => askPythos(input.value));
input.addEventListener("keypress", e => {
  if (e.key === "Enter") askPythos(input.value);
});

// Mobile menu toggle
const sidebar = document.getElementById("sidebar");
document.getElementById("mobileMenuBtn").addEventListener("click", () => {
  sidebar.classList.toggle("open");
});

// ===== INIT =====
clearChatUI();