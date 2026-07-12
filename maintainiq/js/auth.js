/* ============================================================
   AUTH.JS — runs on login.html
   Handles: tab switching, login, signup (Supabase Auth)
   ============================================================ */

// If a session already exists, skip straight to the dashboard.
(async function redirectIfLoggedIn() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) window.location.href = "dashboard.html";
})();

function switchTab(tab) {
  const isLogin = tab === "login";
  document.getElementById("tabLogin").classList.toggle("active", isLogin);
  document.getElementById("tabSignup").classList.toggle("active", !isLogin);
  document.getElementById("loginForm").style.display = isLogin ? "block" : "none";
  document.getElementById("signupForm").style.display = isLogin ? "none" : "block";
}

// ---------- LOGIN ----------
document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = document.getElementById("loginBtn");
  const errorEl = document.getElementById("loginError");
  errorEl.textContent = "";
  btn.disabled = true;
  btn.textContent = "Signing in...";

  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  btn.disabled = false;
  btn.textContent = "Sign in";

  if (error) {
    errorEl.textContent = error.message;
    return;
  }
  window.location.href = "dashboard.html";
});

// ---------- SIGNUP ----------
document.getElementById("signupForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = document.getElementById("signupBtn");
  const errorEl = document.getElementById("signupError");
  const successEl = document.getElementById("signupSuccess");
  errorEl.textContent = "";
  successEl.textContent = "";
  btn.disabled = true;
  btn.textContent = "Creating account...";

  const full_name = document.getElementById("signupName").value.trim();
  const email = document.getElementById("signupEmail").value.trim();
  const password = document.getElementById("signupPassword").value;
  const role = document.getElementById("signupRole").value;

  // We pass full_name & role as user metadata. A database trigger
  // (see supabase-schema.sql -> handle_new_user) copies this into
  // the `profiles` table automatically when the user is created.
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name, role } },
  });

  btn.disabled = false;
  btn.textContent = "Create account";

  if (error) {
    errorEl.textContent = error.message;
    return;
  }

  if (data.session) {
    // Email confirmation disabled in project settings -> logged in immediately
    window.location.href = "dashboard.html";
  } else {
    successEl.textContent = "Account created! Check your email to confirm, then sign in.";
  }
});
