// -----------------------------
// Firebase Firestore Integration
// -----------------------------

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  query,
  orderBy,
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

// TODO: Replace with your Firebase project configuration
const firebaseConfig = {
  apiKey: "YOUR_FIREBASE_API_KEY",
  authDomain: "YOUR_FIREBASE_AUTH_DOMAIN",
  projectId: "YOUR_FIREBASE_PROJECT_ID",
  storageBucket: "YOUR_FIREBASE_STORAGE_BUCKET",
  messagingSenderId: "YOUR_FIREBASE_MESSAGING_SENDER_ID",
  appId: "YOUR_FIREBASE_APP_ID",
};

const isFirebaseConfigValid = Object.values(firebaseConfig).every(
  (value) => typeof value === "string" && value.trim() !== "" && !value.includes("YOUR_FIREBASE")
);

if (!isFirebaseConfigValid) {
  console.error("Firebase config is not set. Please update script.js with your Firebase project settings.");
  document.body.innerHTML = `
    <div style="display:flex;min-height:100vh;align-items:center;justify-content:center;background:#050710;color:#fff;font-family:sans-serif;padding:2rem;">
      <div style="max-width:480px;text-align:center;">
        <h1 style="margin:0 0 1rem;">Firebase not configured</h1>
        <p style="margin:0 0 1rem;opacity:.85;">Please update <code style="background:rgba(255,255,255,.08);padding:.2rem .4rem;border-radius:.35rem;">script.js</code> with your Firestore configuration.</p>
        <p style="opacity:.7;font-size:.9rem;">Transactions will not work until Firebase is configured.</p>
      </div>
    </div>
  `;
  throw new Error("Firebase configuration missing");
}

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const transactionsRef = collection(db, "transactions");

const PASSWORD = "csevalona";

const state = {
  transactions: [],
  editingId: null,
};

const $ = (selector) => document.querySelector(selector);

const formatCurrency = (value) => {
  const formatter = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "BDT",
    currencyDisplay: "symbol",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

  return formatter.format(value);
};

const formatDate = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
};

const updateDashboard = () => {
  const collected = state.transactions
    .filter((t) => t.type === "collection")
    .reduce((sum, t) => sum + t.amount, 0);

  const expenses = state.transactions
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + t.amount, 0);

  const balance = collected - expenses;

  $("#totalCollected").textContent = formatCurrency(collected);
  $("#totalExpenses").textContent = formatCurrency(expenses);
  $("#currentBalance").textContent = formatCurrency(balance);

  const balanceCard = $("#card-balance");
  balanceCard.style.borderColor = balance < 0 ? "rgba(255, 94, 94, 0.56)" : "rgba(63, 228, 194, 0.56)";
};

const createBadge = (type) => {
  const badge = document.createElement("span");
  badge.className = `badge badge--${type}`;
  badge.textContent = type === "collection" ? "Collection" : "Expense";
  return badge;
};

const toggleModal = (open) => {
  const modal = $("#editModal");
  modal.setAttribute("aria-hidden", String(!open));
};

const getPassword = () => {
  const entered = window.prompt("Enter password to proceed:", "");
  return entered === null ? null : entered.trim();
};

const verifyPassword = () => {
  const attempt = getPassword();
  if (attempt === null) return false;
  if (attempt !== PASSWORD) {
    window.alert("Incorrect password. Action canceled.");
    return false;
  }
  return true;
};

const clearForm = () => {
  $("#description").value = "";
  $("#amount").value = "";
  $("#type").value = "collection";
};

const renderTransactions = () => {
  const tbody = $("#transactionTable");
  tbody.innerHTML = "";

  if (!state.transactions.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.setAttribute("colspan", "5");
    cell.className = "empty";
    cell.textContent = "No transactions yet — add one to get started.";
    row.appendChild(cell);
    tbody.appendChild(row);
    return;
  }

  state.transactions.forEach((transaction) => {
    const row = document.createElement("tr");

    const dateCell = document.createElement("td");
    dateCell.textContent = formatDate(transaction.date);

    const descriptionCell = document.createElement("td");
    descriptionCell.textContent = transaction.description;

    const amountCell = document.createElement("td");
    amountCell.textContent = formatCurrency(transaction.amount);
    amountCell.style.color =
      transaction.type === "expense" ? "rgba(255, 94, 94, 0.9)" : "rgba(63, 228, 194, 0.92)";

    const typeCell = document.createElement("td");
    typeCell.appendChild(createBadge(transaction.type));

    const actionsCell = document.createElement("td");
    actionsCell.className = "table__actions";

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "icon-btn";
    editButton.title = "Edit transaction";
    editButton.innerHTML = "✎";
    editButton.addEventListener("click", () => openEditModal(transaction.id));

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "icon-btn";
    deleteButton.title = "Delete transaction";
    deleteButton.innerHTML = "🗑";
    deleteButton.addEventListener("click", () => deleteTransaction(transaction.id));

    actionsCell.append(editButton, deleteButton);
    row.append(dateCell, descriptionCell, amountCell, typeCell, actionsCell);
    tbody.appendChild(row);
  });
};

const syncWithFirestore = () => {
  const q = query(transactionsRef, orderBy("createdAt", "desc"));

  const handleSnapshot = (snapshot) => {
    state.transactions = snapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        description: data.description || "",
        amount: data.amount || 0,
        type: data.type || "collection",
        // Firestore timestamp -> JS Date
        date: data.createdAt ? data.createdAt.toDate() : new Date(),
      };
    });

    updateDashboard();
    renderTransactions();
  };

  const handleError = (error) => {
    console.error("Firestore sync failed:", error);
    // Fallback: listen without ordering if the query fails (e.g. missing createdAt field)
    onSnapshot(transactionsRef, handleSnapshot, (fallbackError) => {
      console.error("Firestore fallback sync failed:", fallbackError);
    });
  };

  onSnapshot(q, handleSnapshot, handleError);
};

const addTransaction = async (event) => {
  event.preventDefault();
  if (!verifyPassword()) return;

  const description = $("#description").value.trim();
  const amount = parseFloat($("#amount").value);
  const type = $("#type").value;

  if (!description || Number.isNaN(amount) || amount <= 0) {
    window.alert("Please provide a valid description and amount.");
    return;
  }

  try {
    // Write new transaction to Firestore
    await addDoc(transactionsRef, {
      description,
      amount,
      type,
      createdAt: serverTimestamp(),
    });

    clearForm();
  } catch (error) {
    console.error("Failed to add transaction:", error);
    window.alert("Unable to add transaction. Please check your network or Firebase configuration.");
  }
};

const openEditModal = (transactionId) => {
  const transaction = state.transactions.find((t) => t.id === transactionId);
  if (!transaction) return;

  state.editingId = transactionId;
  $("#editDescription").value = transaction.description;
  $("#editAmount").value = transaction.amount.toFixed(2);
  $("#editType").value = transaction.type;
  toggleModal(true);
};

const closeEditModal = () => {
  state.editingId = null;
  toggleModal(false);
};

const saveEdit = async (event) => {
  event.preventDefault();
  if (!verifyPassword()) return;

  if (!state.editingId) {
    closeEditModal();
    return;
  }

  const description = $("#editDescription").value.trim();
  const amount = parseFloat($("#editAmount").value);
  const type = $("#editType").value;

  if (!description || Number.isNaN(amount) || amount <= 0) {
    window.alert("Please provide a valid description and amount.");
    return;
  }

  const docRef = doc(db, "transactions", state.editingId);
  await updateDoc(docRef, {
    description,
    amount,
    type,
  });

  closeEditModal();
};

const deleteTransaction = async (transactionId) => {
  const confirmDelete = window.confirm("Are you sure you want to delete this transaction?");
  if (!confirmDelete) return;

  if (!verifyPassword()) return;

  try {
    // Delete transaction from Firestore
    const docRef = doc(db, "transactions", transactionId);
    await deleteDoc(docRef);
  } catch (error) {
    console.error("Failed to delete transaction:", error);
    window.alert("Unable to delete transaction. Please check your network or Firebase configuration.");
  }
};

const bindEvents = () => {
  $("#transactionForm").addEventListener("submit", addTransaction);
  $("#editForm").addEventListener("submit", saveEdit);

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.dataset.close === "true") {
      closeEditModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && $("#editModal").getAttribute("aria-hidden") === "false") {
      closeEditModal();
    }
  });
};

const init = () => {
  bindEvents();
  syncWithFirestore();
};

init();
