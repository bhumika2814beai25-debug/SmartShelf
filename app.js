/* =========================================================
   SmartShelf — App Logic (frontend-only, localStorage backed)
   ========================================================= */

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
  const records = getBorrowRecords();
  if (records.some(r => r.bookId === bookId && r.email === user.email && !r.returned)) {
    toast("You already have this book borrowed.", "info");
    return false;
  }
  const borrowedDate = new Date();
  const dueDate = new Date(borrowedDate.getTime() + 14 * 24 * 60 * 60 * 1000);
  records.push({ id: "r" + Date.now(), bookId, email: user.email, borrowedDate: borrowedDate.toISOString(), dueDate: dueDate.toISOString(), returned: false });
  dbSet(DB_KEYS.borrowed, records);
  toast("Book borrowed! Due back in 14 days.", "success");
  return true;
}

function returnBook(recordId) {
  const records = getBorrowRecords();
  const rec = records.find(r => r.id === recordId);
  if (!rec) return false;
  rec.returned = true;
  rec.returnedDate = new Date().toISOString();
  dbSet(DB_KEYS.borrowed, records);
  toast("Book returned. Thanks for keeping SmartShelf moving!", "success");
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
        <div class="rating"><i class="fa-solid fa-star"></i><span>${book.rating}</span></div>
        <div class="availability ${available ? "avail-yes" : "avail-no"}">
          <i class="fa-solid ${available ? "fa-circle-check" : "fa-circle-xmark"}"></i>
          ${available ? `${book.available} of ${book.copies} available` : "All copies borrowed"}
        </div>
        <button onclick="location.href='book-details.html?id=${book.id}'">View Details</button>
      </div>
    </div>`;
}


/* ---------- Reservations ---------- */
function getReservations() {
  const user = currentUser();
  if (!user) return [];
  const all = dbGet(DB_KEYS.reservations, {});
  return all[user.email] || [];
}
function isReserved(bookId) { return getReservations().includes(bookId); }
function toggleReservation(bookId) {
  const user = currentUser();
  if (!user) { toast("Please sign in to reserve a book.", "error"); return false; }
  const all = dbGet(DB_KEYS.reservations, {});
  const mine = all[user.email] || [];
  const idx = mine.indexOf(bookId);
  if (idx > -1) {
    mine.splice(idx, 1);
    toast("Reservation cancelled.", "info");
  } else {
    mine.push(bookId);
    toast("Book reserved. We will flag it when a copy is available.", "success");
  }
  all[user.email] = mine;
  dbSet(DB_KEYS.reservations, all);
  return idx === -1;
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
    if (days < 0) notes.push({ icon: "fa-triangle-exclamation", tone: "danger", text: `${book.title} is ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue.` });
    else if (days <= 3) notes.push({ icon: "fa-clock", tone: "warning", text: `${book.title} is due in ${days} day${days === 1 ? "" : "s"}.` });
  });
  getReservations().forEach(id => {
    const book = getAllBooks().find(b => b.id === id);
    if (book && book.available > 0) notes.push({ icon: "fa-bell", tone: "success", text: `${book.title} is available now. You can borrow it.` });
  });
  return notes.slice(0, 6);
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
    const nowSaved = toggleWishlist(id);
    btn.classList.toggle("active", nowSaved);
    const label = nowSaved ? "Remove from wishlist" : "Save to wishlist";
    btn.setAttribute("aria-label", label);
    btn.setAttribute("title", label);
  });
});
