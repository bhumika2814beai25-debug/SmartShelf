/* =========================================================
   SmartShelf — App Logic (frontend-only, localStorage backed)
   ========================================================= */

/* ---------- Safe text helper ---------- */
function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>'"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[ch]));
}

/* ---------- Toast ---------- */
function toast(message, type = "success") {
  let box = document.querySelector(".toast-box");
  if (!box) {
    box = document.createElement("div");
    box.className = "toast-box";
    document.body.appendChild(box);
  }
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.innerHTML = `<i class="fa-solid ${type === "success" ? "fa-circle-check" : type === "error" ? "fa-circle-exclamation" : "fa-circle-info"}"></i><span>${message}</span>`;
  box.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 300);
  }, 3200);
}

/* ---------- Flash messages (survive a redirect) ---------- */
function setFlash(message, type = "success") {
  sessionStorage.setItem("ss_flash", JSON.stringify({ message, type }));
}
function showFlashIfAny() {
  const raw = sessionStorage.getItem("ss_flash");
  if (!raw) return;
  sessionStorage.removeItem("ss_flash");
  try {
    const { message, type } = JSON.parse(raw);
    toast(message, type);
  } catch (e) { /* ignore malformed flash */ }
}

/* ---------- Theme (dark / light mode) ---------- */
function initTheme() {
  const saved = localStorage.getItem("ss_theme") || "dark";
  document.body.classList.toggle("light-mode", saved === "light");
  updateThemeIcon();
}
function toggleTheme() {
  const isLight = document.body.classList.toggle("light-mode");
  localStorage.setItem("ss_theme", isLight ? "light" : "dark");
  updateThemeIcon();
}
function updateThemeIcon() {
  const btn = document.getElementById("themeToggle");
  if (!btn) return;
  const isLight = document.body.classList.contains("light-mode");
  btn.innerHTML = `<i class="fa-solid ${isLight ? "fa-sun" : "fa-moon"}"></i>`;
  btn.setAttribute("aria-label", isLight ? "Switch to dark mode" : "Switch to light mode");
}

/* ---------- Auth (simulated) ---------- */
function currentUser() {
  const session = dbGet(DB_KEYS.session, null);
  if (!session) return null;
  const users = dbGet(DB_KEYS.users, []);
  return users.find(u => u.email === session.email) || null;
}

function signup(name, email, password, role = "student") {
  const users = dbGet(DB_KEYS.users, []);
  if (users.some(u => u.email === email)) return { ok: false, error: "An account with this email already exists." };
  const user = { name, email, password, role, joined: new Date().toISOString() };
  users.push(user);
  dbSet(DB_KEYS.users, users);
  dbSet(DB_KEYS.session, { email });
  return { ok: true, user };
}

function login(email, password, expectedRole = null) {
  const users = dbGet(DB_KEYS.users, []);
  let user = users.find(u => u.email === email && u.password === password);
  if (!user && email === "admin@admin.smartshelf" && password === "admin123") {
    user = { name: "Library Admin", email, password, role: "admin", joined: new Date().toISOString() };
    users.push(user);
    dbSet(DB_KEYS.users, users);
  }
  if (!user) return { ok: false, error: "Incorrect email or password." };
  if (expectedRole && user.role !== expectedRole) {
    const roleNames = { student: "Student", admin: "Librarian", staff: "Staff" };
    return { ok: false, error: `Select ${roleNames[user.role] || "the correct role"} to use this account.` };
  }
  dbSet(DB_KEYS.session, { email });
  return { ok: true, user };
}

function logout() {
  localStorage.removeItem(DB_KEYS.session);
  setFlash("You are successfully logged out.", "success");
  window.location.href = "index.html";
}

function findUserByEmail(email) {
  const users = dbGet(DB_KEYS.users, []);
  return users.find(u => u.email === email) || null;
}

function resetPassword(email, newPassword) {
  const users = dbGet(DB_KEYS.users, []);
  const user = users.find(u => u.email === email);
  if (!user) return { ok: false, error: "No account found with that email." };
  user.password = newPassword;
  dbSet(DB_KEYS.users, users);
  return { ok: true };
}

function requireAuth(redirectTo = "login.html") {
  const user = currentUser();
  if (!user) { window.location.href = redirectTo; return null; }
  return user;
}

function requireAdmin() {
  const user = requireAuth("login.html");
  if (user && user.role !== "admin") { toast("Admin access only. Try admin@admin.smartshelf", "error"); setTimeout(() => window.location.href = "index.html", 900); return null; }
  return user;
}

/* ---------- Borrow / Return ---------- */
function getBorrowRecords() { return dbGet(DB_KEYS.borrowed, []); }

function borrowBook(bookId) {
  const user = currentUser();
  if (!user) { toast("Please sign in to borrow a book.", "error"); return false; }
  const book = getAllBooks().find(b => b.id === bookId);
  if (!book || book.available <= 0) { toast("This book is currently unavailable. You can reserve it instead.", "info"); return false; }

  const queue = getReservationQueue(bookId);
  if (queue.length) {
    const queueIndex = queue.findIndex(item => item.email === user.email);
    const reservedSlots = Math.min(book.available, queue.length);
    if ((queueIndex === -1 && reservedSlots >= book.available) || (queueIndex >= book.available)) {
      toast("Available copies are currently reserved for students ahead in the queue.", "info");
      return false;
    }
  }

  const records = getBorrowRecords();
  if (records.some(r => r.bookId === bookId && r.email === user.email && !r.returned)) {
    toast("You already have this book borrowed.", "info");
    return false;
  }
  const borrowedDate = new Date();
  const dueDate = new Date(borrowedDate.getTime() + 14 * 24 * 60 * 60 * 1000);
  records.push({ id: "r" + Date.now(), bookId, email: user.email, borrowedDate: borrowedDate.toISOString(), dueDate: dueDate.toISOString(), returned: false });
  dbSet(DB_KEYS.borrowed, records);

  // If this student was first in the reservation queue, borrowing fulfils it.
  if (queue.some(item => item.email === user.email)) removeReservationForUser(bookId, user.email);

  toast("Book borrowed! Due back in 14 days.", "success");
  return true;
}

function returnBook(recordId) {
  const records = getBorrowRecords();
  const rec = records.find(r => r.id === recordId);
  if (!rec) return false;
  rec.returned = true;
  rec.returnedDate = new Date().toISOString();
  rec.fine = calculateFineForRecord(rec);
  dbSet(DB_KEYS.borrowed, records);
  const fineNote = rec.fine > 0 ? ` Late fine recorded: ₹${rec.fine}.` : "";
  toast(`Book returned.${fineNote}`, rec.fine > 0 ? "info" : "success");
  return true;
}

function myBorrowRecords() {
  const user = currentUser();
  if (!user) return [];
  return getBorrowRecords().filter(r => r.email === user.email);
}

function daysUntil(dateStr) {
  const diff = new Date(dateStr) - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

/* ---------- Fine calculation ---------- */
const FINE_PER_OVERDUE_DAY = 5;
function calculateFineForRecord(record, asOf = new Date()) {
  if (!record || !record.dueDate) return 0;
  const due = new Date(record.dueDate);
  const end = record.returned && record.returnedDate ? new Date(record.returnedDate) : new Date(asOf);
  const overdueMs = end - due;
  if (overdueMs <= 0) return 0;
  const overdueDays = Math.ceil(overdueMs / (1000 * 60 * 60 * 24));
  return overdueDays * FINE_PER_OVERDUE_DAY;
}
function getMyOutstandingFine() {
  return myBorrowRecords().filter(r => !r.returned).reduce((sum, r) => sum + calculateFineForRecord(r), 0);
}
function getMyTotalFineHistory() {
  return myBorrowRecords().reduce((sum, r) => sum + (Number(r.fine) || calculateFineForRecord(r)), 0);
}

/* ---------- Wishlist ("save for later") ---------- */
function getWishlist() {
  const user = currentUser();
  if (!user) return [];
  const all = dbGet(DB_KEYS.wishlist, {});
  return all[user.email] || [];
}

function isWishlisted(bookId) {
  return getWishlist().includes(bookId);
}

function toggleWishlist(bookId) {
  const user = currentUser();
  if (!user) { toast("Please sign in to save books to your wishlist.", "error"); return false; }
  const all = dbGet(DB_KEYS.wishlist, {});
  const mine = all[user.email] || [];
  const idx = mine.indexOf(bookId);
  if (idx > -1) {
    mine.splice(idx, 1);
    toast("Removed from wishlist.", "info");
  } else {
    mine.push(bookId);
    toast("Saved to your wishlist.", "success");
  }
  all[user.email] = mine;
  dbSet(DB_KEYS.wishlist, all);
  return idx === -1; // true if now wishlisted, false if just removed
}

/* ---------- Book card renderer (shared across pages) ---------- */
function bookCoverHTML(book) {
  const g = genreOf(book);
  const ribbon = book.isNew ? `<span class="book-ribbon ribbon-new">New</span>`
    : book.trending ? `<span class="book-ribbon ribbon-trend">🔥 Trending</span>` : "";
  const saved = isWishlisted(book.id);
  return `
    <div class="book-cover" style="background:linear-gradient(135deg, ${g.color1}, ${g.color2})">
      <i class="${g.icon}"></i>
      ${ribbon}
      <button type="button" class="wishlist-btn ${saved ? "active" : ""}" data-wishlist-id="${book.id}" aria-label="${saved ? "Remove from wishlist" : "Save to wishlist"}" title="${saved ? "Remove from wishlist" : "Save to wishlist"}">
        <i class="fa-solid fa-heart"></i>
      </button>
    </div>`;
}

function bookCardHTML(book) {
  const g = genreOf(book);
  const available = book.available > 0;
  return `
    <div class="book-card" data-id="${book.id}">
      ${bookCoverHTML(book)}
      <div class="book-info">
        <span class="subject">${g.label}</span>
        <h3>${book.title}</h3>
        <p class="author">${book.author}</p>
        <div class="rating"><i class="fa-solid fa-star"></i><span>${getBookDisplayRating(book).toFixed(1)}</span></div>
        <div class="availability ${available ? "avail-yes" : "avail-no"}">
          <i class="fa-solid ${available ? "fa-circle-check" : "fa-circle-xmark"}"></i>
          ${available ? `${book.available} of ${book.copies} available` : "All copies borrowed"}
        </div>
        <button onclick="location.href='book-details.html?id=${book.id}'">View Details</button>
      </div>
    </div>`;
}


/* ---------- Reservations + queue ---------- */
function getReservations() {
  const user = currentUser();
  if (!user) return [];
  const all = dbGet(DB_KEYS.reservations, {});
  return all[user.email] || [];
}
function isReserved(bookId) { return getReservations().includes(bookId); }

function getReservationQueue(bookId) {
  const queues = dbGet(DB_KEYS.reservationQueue, {});
  return (queues[bookId] || []).slice().sort((a, b) => new Date(a.reservedAt) - new Date(b.reservedAt));
}

function getReservationPosition(bookId, email = null) {
  const user = currentUser();
  const target = email || (user && user.email);
  if (!target) return null;
  const idx = getReservationQueue(bookId).findIndex(item => item.email === target);
  return idx === -1 ? null : idx + 1;
}

function removeReservationForUser(bookId, email) {
  const all = dbGet(DB_KEYS.reservations, {});
  if (all[email]) {
    all[email] = all[email].filter(id => id !== bookId);
    dbSet(DB_KEYS.reservations, all);
  }
  const queues = dbGet(DB_KEYS.reservationQueue, {});
  if (queues[bookId]) {
    queues[bookId] = queues[bookId].filter(item => item.email !== email);
    if (!queues[bookId].length) delete queues[bookId];
    dbSet(DB_KEYS.reservationQueue, queues);
  }
}

function toggleReservation(bookId) {
  const user = currentUser();
  if (!user) { toast("Please sign in to reserve a book.", "error"); return false; }
  const book = getAllBooks().find(b => b.id === bookId);
  if (!book) return false;

  const all = dbGet(DB_KEYS.reservations, {});
  const mine = all[user.email] || [];
  const idx = mine.indexOf(bookId);
  const queues = dbGet(DB_KEYS.reservationQueue, {});
  const queue = queues[bookId] || [];

  if (idx > -1) {
    mine.splice(idx, 1);
    queues[bookId] = queue.filter(item => item.email !== user.email);
    if (!queues[bookId].length) delete queues[bookId];
    toast("Reservation cancelled.", "info");
    all[user.email] = mine;
    dbSet(DB_KEYS.reservations, all);
    dbSet(DB_KEYS.reservationQueue, queues);
    return false;
  }

  if (book.available > queue.length) {
    toast("A copy is available right now. Borrow it instead of reserving.", "info");
    return false;
  }

  mine.push(bookId);
  queue.push({ email: user.email, name: user.name, reservedAt: new Date().toISOString() });
  queues[bookId] = queue;
  all[user.email] = mine;
  dbSet(DB_KEYS.reservations, all);
  dbSet(DB_KEYS.reservationQueue, queues);
  toast(`Reservation added. Your queue position is #${getReservationPosition(bookId, user.email)}.`, "success");
  return true;
}

/* ---------- Recently viewed ---------- */
function trackRecentView(bookId) {
  const user = currentUser();
  if (!user || !bookId) return;
  const all = dbGet(DB_KEYS.recentViews, {});
  const mine = (all[user.email] || []).filter(id => id !== bookId);
  mine.unshift(bookId);
  all[user.email] = mine.slice(0, 8);
  dbSet(DB_KEYS.recentViews, all);
}
function getRecentViews() {
  const user = currentUser();
  if (!user) return [];
  const all = dbGet(DB_KEYS.recentViews, {});
  return all[user.email] || [];
}

/* ---------- Reading goal ---------- */
function getReadingGoal() {
  const user = currentUser();
  if (!user) return 6;
  const all = dbGet(DB_KEYS.readingGoals, {});
  return Math.max(1, Number(all[user.email] || 6));
}
function setReadingGoal(goal) {
  const user = currentUser();
  if (!user) return;
  const all = dbGet(DB_KEYS.readingGoals, {});
  all[user.email] = Math.max(1, Math.min(50, Number(goal) || 6));
  dbSet(DB_KEYS.readingGoals, all);
}

/* ---------- Ratings & reviews ---------- */
function getBookReviews(bookId) {
  const all = dbGet(DB_KEYS.reviews, {});
  return (all[bookId] || []).slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function getBookDisplayRating(book) {
  const reviews = getBookReviews(book.id);
  if (!reviews.length) return Number(book.rating || 0);
  const reviewTotal = reviews.reduce((sum, r) => sum + Number(r.rating || 0), 0);
  // Keep the catalog seed rating as one baseline vote, then blend real student ratings into it.
  return (Number(book.rating || 0) + reviewTotal) / (reviews.length + 1);
}

function submitBookReview(bookId, rating, comment = "") {
  const user = currentUser();
  if (!user) return { ok: false, error: "Please sign in to rate this book." };
  const n = Number(rating);
  if (!Number.isInteger(n) || n < 1 || n > 5) return { ok: false, error: "Choose a rating from 1 to 5 stars." };
  const text = String(comment || "").trim();
  if (text.length > 400) return { ok: false, error: "Keep the review under 400 characters." };

  const all = dbGet(DB_KEYS.reviews, {});
  const list = all[bookId] || [];
  const existing = list.find(r => r.email === user.email);
  if (existing) {
    existing.rating = n;
    existing.comment = text;
    existing.createdAt = new Date().toISOString();
  } else {
    list.push({ id: "rv_" + Date.now(), email: user.email, name: user.name, rating: n, comment: text, createdAt: new Date().toISOString() });
  }
  all[bookId] = list;
  dbSet(DB_KEYS.reviews, all);
  return { ok: true };
}

function removeOwnReview(bookId) {
  const user = currentUser();
  if (!user) return false;
  const all = dbGet(DB_KEYS.reviews, {});
  const before = all[bookId] || [];
  const after = before.filter(r => r.email !== user.email);
  all[bookId] = after;
  dbSet(DB_KEYS.reviews, all);
  return after.length !== before.length;
}

/* ---------- Search helpers ---------- */
function searchBookSuggestions(query, limit = 6) {
  const q = String(query || "").trim().toLowerCase();
  if (q.length < 2) return [];
  return getAllBooks()
    .filter(b => b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q))
    .sort((a, b) => {
      const aStarts = a.title.toLowerCase().startsWith(q) ? 0 : 1;
      const bStarts = b.title.toLowerCase().startsWith(q) ? 0 : 1;
      return aStarts - bStarts || b.rating - a.rating;
    })
    .slice(0, limit);
}

/* ---------- Admin analytics ---------- */
function getAdminAnalytics() {
  const books = getAllBooks();
  const records = getBorrowRecords();
  const active = records.filter(r => !r.returned);
  const overdue = active.filter(r => daysUntil(r.dueDate) < 0);
  const borrowCounts = records.reduce((acc, r) => { acc[r.bookId] = (acc[r.bookId] || 0) + 1; return acc; }, {});
  const mostBorrowed = Object.entries(borrowCounts).sort((a, b) => b[1] - a[1])[0];
  const popularBook = mostBorrowed ? books.find(b => b.id === mostBorrowed[0]) : null;
  const genreCounts = records.reduce((acc, r) => {
    const book = books.find(b => b.id === r.bookId);
    if (book) acc[book.genre] = (acc[book.genre] || 0) + 1;
    return acc;
  }, {});
  const topGenreEntry = Object.entries(genreCounts).sort((a, b) => b[1] - a[1])[0];
  return {
    activeLoans: active.length,
    overdueLoans: overdue.length,
    outstandingFine: overdue.reduce((sum, r) => sum + calculateFineForRecord(r), 0),
    popularTitle: popularBook ? popularBook.title : "No borrowing data yet",
    popularTitleCount: mostBorrowed ? mostBorrowed[1] : 0,
    topGenre: topGenreEntry ? (GENRES[topGenreEntry[0]]?.label || topGenreEntry[0]) : "No data yet",
    topGenreCount: topGenreEntry ? topGenreEntry[1] : 0
  };
}

/* ---------- Personalized recommendations ---------- */
function getRecommendations(limit = 4) {
  const user = currentUser();
  const books = getAllBooks();
  if (!user) return books.filter(b => b.trending || b.isNew).slice(0, limit);
  const signals = [
    ...myBorrowRecords().map(r => r.bookId),
    ...getWishlist(),
    ...getRecentViews()
  ];
  const genreScore = {};
  signals.forEach(id => {
    const book = books.find(b => b.id === id);
    if (book) genreScore[book.genre] = (genreScore[book.genre] || 0) + 1;
  });
  const excluded = new Set(myBorrowRecords().filter(r => !r.returned).map(r => r.bookId));
  return books
    .filter(b => !excluded.has(b.id))
    .map(b => ({ book: b, score: (genreScore[b.genre] || 0) * 10 + (b.trending ? 3 : 0) + (b.isNew ? 2 : 0) + Number(b.rating || 0) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(x => x.book);
}

/* ---------- Smart account notifications ---------- */
function getLibraryNotifications() {
  const notes = [];
  myBorrowRecords().filter(r => !r.returned).forEach(r => {
    const book = getAllBooks().find(b => b.id === r.bookId);
    if (!book) return;
    const days = daysUntil(r.dueDate);
    const fine = calculateFineForRecord(r);
    if (days < 0) notes.push({ icon: "fa-triangle-exclamation", tone: "danger", text: `${book.title} is ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue. Current fine: ₹${fine}.` });
    else if (days <= 3) notes.push({ icon: "fa-clock", tone: "warning", text: `${book.title} is due in ${days} day${days === 1 ? "" : "s"}.` });
  });
  getReservations().forEach(id => {
    const book = getAllBooks().find(b => b.id === id);
    if (!book) return;
    const position = getReservationPosition(id);
    if (book.available > 0 && position && position <= book.available) {
      notes.push({ icon: "fa-bell", tone: "success", text: `${book.title} is available and reserved for you. Borrow it now.` });
    } else if (position) {
      notes.push({ icon: "fa-list-ol", tone: "info", text: `${book.title}: you are #${position} in the reservation queue.` });
    }
  });
  return notes.slice(0, 8);
}


/* =========================================================
   SmartShelf v2 — JavaScript interaction upgrades
   ========================================================= */

/* ---------- Promise helpers (used in 3 visible workflows) ---------- */
function asyncValue(getter, delay = 120) {
  return new Promise((resolve, reject) => {
    window.setTimeout(() => {
      try { resolve(getter()); }
      catch (error) { reject(error); }
    }, delay);
  });
}

// Promise use #1: catalog data loading
function loadBooksAsync() {
  return asyncValue(() => getAllBooks(), 160);
}

// Promise use #2: borrow action with resolve/reject + async/await on the details page
function borrowBookAsync(bookId) {
  return new Promise((resolve, reject) => {
    const user = currentUser();
    const book = getAllBooks().find(b => b.id === bookId);
    if (!user) { reject(new Error("Please sign in to borrow a book.")); return; }
    if (!book) { reject(new Error("Book not found.")); return; }
    if (book.available <= 0) { reject(new Error("This book is currently unavailable.")); return; }
    window.setTimeout(() => {
      const ok = borrowBook(bookId);
      if (ok) resolve({ ok: true, book });
      else reject(new Error("Borrowing could not be completed."));
    }, 260);
  });
}

// Promise use #3: load independent dashboard modules in parallel
function loadDashboardDataAsync() {
  return Promise.all([
    asyncValue(() => myBorrowRecords(), 100),
    asyncValue(() => getWishlist(), 120),
    asyncValue(() => getReservations(), 140),
    asyncValue(() => getRecommendations(4), 110),
    asyncValue(() => getRecentViews(), 130),
    asyncValue(() => getLibraryNotifications(), 90)
  ]).then(([records, wishlist, reservations, recommendations, recentViews, notifications]) => ({
    records, wishlist, reservations, recommendations, recentViews, notifications
  }));
}

/* ---------- Recent searches ---------- */
function getRecentSearches() {
  const user = currentUser();
  const all = dbGet(DB_KEYS.recentSearches, {});
  return all[user ? user.email : "guest"] || [];
}
function saveRecentSearch(term) {
  const clean = String(term || "").trim();
  if (clean.length < 2) return;
  const user = currentUser();
  const key = user ? user.email : "guest";
  const all = dbGet(DB_KEYS.recentSearches, {});
  const list = (all[key] || []).filter(x => x.toLowerCase() !== clean.toLowerCase());
  list.unshift(clean);
  all[key] = list.slice(0, 5);
  dbSet(DB_KEYS.recentSearches, all);
}
function clearRecentSearches() {
  const user = currentUser();
  const key = user ? user.email : "guest";
  const all = dbGet(DB_KEYS.recentSearches, {});
  all[key] = [];
  dbSet(DB_KEYS.recentSearches, all);
}

/* ---------- Voice search ---------- */
function startVoiceSearch(onTranscript, onState) {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    toast("Voice search is not supported in this browser. Try Chrome or Edge.", "info");
    return false;
  }
  const recognition = new Recognition();
  recognition.lang = "en-IN";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.onstart = () => onState && onState(true);
  recognition.onend = () => onState && onState(false);
  recognition.onerror = () => toast("I could not hear that clearly. Please try again.", "error");
  recognition.onresult = (event) => {
    const text = event.results[0][0].transcript.trim();
    if (text && typeof onTranscript === "function") onTranscript(text);
  };
  recognition.start();
  return true;
}

/* ---------- Undo last action ---------- */
let smartShelfUndo = null;
function setWishlistState(bookId, shouldBeSaved) {
  const user = currentUser();
  if (!user) return;
  const all = dbGet(DB_KEYS.wishlist, {});
  const mine = new Set(all[user.email] || []);
  if (shouldBeSaved) mine.add(bookId); else mine.delete(bookId);
  all[user.email] = [...mine];
  dbSet(DB_KEYS.wishlist, all);
}
function offerUndo(message, undoFn) {
  smartShelfUndo = undoFn;
  const existing = document.querySelector(".undo-toast");
  if (existing) existing.remove();
  const el = document.createElement("div");
  el.className = "undo-toast";
  el.innerHTML = `<span>${escapeHTML(message)}</span><button type="button">Undo</button>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  const timer = setTimeout(() => { el.classList.remove("show"); setTimeout(() => el.remove(), 220); smartShelfUndo = null; }, 5000);
  el.querySelector("button").addEventListener("click", () => {
    clearTimeout(timer);
    if (smartShelfUndo) smartShelfUndo();
    smartShelfUndo = null;
    el.remove();
    toast("Last action restored.", "success");
    window.dispatchEvent(new CustomEvent("smartshelf:undo"));
  });
}

/* ---------- Review draft autosave ---------- */
function reviewDraftKey(bookId) {
  const user = currentUser();
  return user ? `${user.email}::${bookId}` : null;
}
function getReviewDraft(bookId) {
  const key = reviewDraftKey(bookId);
  if (!key) return "";
  return dbGet(DB_KEYS.reviewDrafts, {})[key] || "";
}
function saveReviewDraft(bookId, text) {
  const key = reviewDraftKey(bookId);
  if (!key) return;
  const all = dbGet(DB_KEYS.reviewDrafts, {});
  all[key] = String(text || "").slice(0, 400);
  dbSet(DB_KEYS.reviewDrafts, all);
}
function clearReviewDraft(bookId) {
  const key = reviewDraftKey(bookId);
  if (!key) return;
  const all = dbGet(DB_KEYS.reviewDrafts, {});
  delete all[key];
  dbSet(DB_KEYS.reviewDrafts, all);
}

/* ---------- Reading streak ---------- */
function dateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function trackReadingActivity() {
  const user = currentUser();
  if (!user || user.role === "admin") return;
  const all = dbGet(DB_KEYS.activityDays, {});
  const days = new Set(all[user.email] || []);
  days.add(dateKey());
  all[user.email] = [...days].sort().slice(-120);
  dbSet(DB_KEYS.activityDays, all);
}
function getReadingStreak() {
  const user = currentUser();
  if (!user) return 0;
  const all = dbGet(DB_KEYS.activityDays, {});
  const days = new Set(all[user.email] || []);
  let cursor = new Date();
  let streak = 0;
  while (days.has(dateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/* ---------- Achievement badges ---------- */
function getAchievements() {
  const user = currentUser();
  if (!user) return [];
  const records = myBorrowRecords();
  const returned = records.filter(r => r.returned);
  const books = getAllBooks();
  const signalIds = [...new Set([...records.map(r => r.bookId), ...getWishlist(), ...getRecentViews()])];
  const genres = new Set(signalIds.map(id => books.find(b => b.id === id)?.genre).filter(Boolean));
  const allReviews = dbGet(DB_KEYS.reviews, {});
  const hasReview = Object.values(allReviews).some(list => (list || []).some(r => r.email === user.email));
  const badges = [
    { id: "first-borrow", icon: "fa-book-open", label: "First Borrow", desc: "Borrow your first title", unlocked: records.length >= 1 },
    { id: "reader-5", icon: "fa-trophy", label: "5 Books Read", desc: "Return five books", unlocked: returned.length >= 5 },
    { id: "wishlist", icon: "fa-heart", label: "Wishlist Collector", desc: "Save five books", unlocked: getWishlist().length >= 5 },
    { id: "genres", icon: "fa-compass", label: "Genre Explorer", desc: "Explore three genres", unlocked: genres.size >= 3 },
    { id: "streak", icon: "fa-fire", label: "3-Day Streak", desc: "Visit on three consecutive days", unlocked: getReadingStreak() >= 3 },
    { id: "reviewer", icon: "fa-star", label: "Reviewer", desc: "Post a book review", unlocked: hasReview }
  ];
  return badges;
}

/* ---------- Surprise Me recommendation ---------- */
function pickSurpriseBook() {
  const all = getAllBooks().filter(b => b.available > 0);
  if (!all.length) return null;
  const recommended = getRecommendations(12).filter(b => b.available > 0);
  const pool = recommended.length ? recommended : all;
  return pool[Math.floor(Math.random() * pool.length)];
}

/* ---------- Admin activity log ---------- */
function logAdminActivity(action, details) {
  const user = currentUser();
  if (!user || user.role !== "admin") return;
  const list = dbGet(DB_KEYS.adminLog, []);
  list.unshift({ id: "log_" + Date.now(), action, details, by: user.name, at: new Date().toISOString() });
  dbSet(DB_KEYS.adminLog, list.slice(0, 40));
}
function getAdminActivityLog(limit = 8) {
  return dbGet(DB_KEYS.adminLog, []).slice(0, limit);
}

/* ---------- Command palette (Ctrl/Cmd + K) ---------- */
function initCommandPalette() {
  if (document.getElementById("commandPalette")) return;
  const overlay = document.createElement("div");
  overlay.id = "commandPalette";
  overlay.className = "command-palette";
  overlay.innerHTML = `
    <div class="command-box" role="dialog" aria-modal="true" aria-label="SmartShelf quick commands">
      <div class="command-search"><i class="fa-solid fa-bolt"></i><input id="commandInput" type="text" placeholder="Type a command..." autocomplete="off"><kbd>Esc</kbd></div>
      <div class="command-list" id="commandList"></div>
      <div class="command-hint">Tip: press <kbd>Ctrl</kbd> + <kbd>K</kbd> anywhere in SmartShelf.</div>
    </div>`;
  document.body.appendChild(overlay);

  const actions = [
    { label: "Search the catalog", icon: "fa-magnifying-glass", keywords: "search books catalog", run: () => location.href = "catalog.html?focus=search" },
    { label: "Open my dashboard", icon: "fa-table-columns", keywords: "dashboard account loans", run: () => location.href = currentUser() ? (currentUser().role === "admin" ? "admin.html" : "dashboard.html") : "login.html" },
    { label: "Surprise me with a book", icon: "fa-dice", keywords: "random surprise recommendation", run: () => { const b = pickSurpriseBook(); if (b) location.href = `book-details.html?id=${b.id}`; } },
    { label: "Toggle light / dark theme", icon: "fa-circle-half-stroke", keywords: "theme dark light", run: toggleTheme },
    { label: "Open About SmartShelf", icon: "fa-circle-info", keywords: "about", run: () => location.href = "about.html" }
  ];
  const input = overlay.querySelector("#commandInput");
  const list = overlay.querySelector("#commandList");

  function draw() {
    const q = input.value.trim().toLowerCase();
    const matches = actions.filter(a => !q || `${a.label} ${a.keywords}`.toLowerCase().includes(q));
    list.innerHTML = matches.map((a, i) => `<button type="button" class="command-item" data-index="${actions.indexOf(a)}"><i class="fa-solid ${a.icon}"></i><span>${a.label}</span><i class="fa-solid fa-arrow-right"></i></button>`).join("") || `<p class="command-empty">No matching command.</p>`;
  }
  function open() { overlay.classList.add("open"); input.value = ""; draw(); setTimeout(() => input.focus(), 20); }
  function close() { overlay.classList.remove("open"); }
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); const btn = e.target.closest(".command-item"); if (btn) { close(); actions[Number(btn.dataset.index)].run(); } });
  input.addEventListener("input", draw);
  input.addEventListener("keydown", e => { if (e.key === "Enter") { const first = list.querySelector(".command-item"); if (first) first.click(); } });
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); overlay.classList.contains("open") ? close() : open(); }
    if (e.key === "Escape" && overlay.classList.contains("open")) close();
  });
  draw();
}

/* ---------- Navbar auth-state sync (runs on every page) ---------- */
function syncNavAuthState() {
  const user = currentUser();
  const navBtns = document.querySelector(".nav-btn");
  if (!navBtns) return;

  if (user) {
    navBtns.innerHTML = `
      <a href="${user.role === 'admin' ? 'admin.html' : 'dashboard.html'}" class="login-btn"><i class="fa-solid fa-user"></i> ${user.name.split(" ")[0]}</a>
      <a href="#" class="signup-btn" id="logoutBtn">Logout</a>`;
    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) logoutBtn.addEventListener("click", (e) => { e.preventDefault(); logout(); });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  showFlashIfAny();
  syncNavAuthState();
  trackReadingActivity();
  initCommandPalette();
  const themeBtn = document.getElementById("themeToggle");
  if (themeBtn) themeBtn.addEventListener("click", toggleTheme);

  // Delegated wishlist-heart handler — works for every book card on every
  // page, including ones rendered dynamically after this listener attaches.
  document.body.addEventListener("click", (e) => {
    const btn = e.target.closest(".wishlist-btn");
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const id = btn.dataset.wishlistId;
    const wasSaved = isWishlisted(id);
    const nowSaved = toggleWishlist(id);
    btn.classList.toggle("active", nowSaved);
    offerUndo(nowSaved ? "Book added to wishlist." : "Book removed from wishlist.", () => {
      setWishlistState(id, wasSaved);
      document.querySelectorAll(`[data-wishlist-id="${id}"]`).forEach(x => x.classList.toggle("active", wasSaved));
    });
    const label = nowSaved ? "Remove from wishlist" : "Save to wishlist";
    btn.setAttribute("aria-label", label);
    btn.setAttribute("title", label);
  });
});
