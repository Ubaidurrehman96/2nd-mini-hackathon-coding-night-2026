/* ============================================================
   UTILS - small reusable helper functions
   ============================================================ */

// Reads a query-string param, e.g. getParam('id') for "page.html?id=123"
function getParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

// Turns a Date into a readable string like "11 Jul 2026"
function formatDate(dateStr) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateTime(dateStr) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// Generates a short unique code, e.g. asset code "AST-7K2N9" or issue number "ISS-4821"
function generateCode(prefix) {
  const random = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `${prefix}-${random}`;
}

// Shows a temporary toast message at the bottom of the screen
function showToast(message, type = "info") {
  let toast = document.getElementById("toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.className = `toast toast-${type} show`;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove("show"), 3200);
}

// Maps a status string to a CSS class suffix, used for colored badges
function statusClass(status) {
  return status.toLowerCase().replace(/\s+/g, "-");
}

// Simple redirect guard: if nobody is logged in, send them to login page.
// Call this at the top of every INTERNAL page (dashboard, asset, issue).
async function requireLogin() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    window.location.href = "login.html";
    return null;
  }
  return session;
}

// Fetches the logged-in user's profile row (name + role)
async function getCurrentProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (error) {
    console.error("Failed to load profile:", error.message);
    return null;
  }
  return data;
}

// Writes one row to asset_history. Call this after every meaningful action.
async function logHistory(assetId, issueId, actor, action, details = "") {
  const { error } = await supabase.from("asset_history").insert({
    asset_id: assetId,
    issue_id: issueId,
    actor,
    action,
    details,
  });
  if (error) console.error("Failed to log history:", error.message);
}

function escapeHtml(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
