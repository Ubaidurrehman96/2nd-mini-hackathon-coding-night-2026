/* ============================================================
   DASHBOARD.JS — runs on dashboard.html
   ============================================================ */

let allAssets = [];   // cache so search/filter don't hit the DB every keystroke
let currentProfile = null;

async function init() {
  const session = await requireLogin();
  if (!session) return;

  currentProfile = await getCurrentProfile();
  document.getElementById("userName").textContent =
    currentProfile ? `${currentProfile.full_name} (${currentProfile.role})` : "";

  await loadAssets();
}

async function loadAssets() {
  // Also pull each asset's issues so we can compute "open issues" summary card
  // and show live status without a second round-trip per row.
  const { data, error } = await supabase
    .from("assets")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    showToast("Failed to load assets: " + error.message, "error");
    return;
  }

  allAssets = data;
  populateCategoryFilter();
  renderStats();
  renderAssets();
}

function populateCategoryFilter() {
  const select = document.getElementById("categoryFilter");
  const existing = new Set(Array.from(select.options).map(o => o.value));
  const categories = [...new Set(allAssets.map(a => a.category))];
  categories.forEach(cat => {
    if (!existing.has(cat)) {
      const opt = document.createElement("option");
      opt.value = cat;
      opt.textContent = cat;
      select.appendChild(opt);
    }
  });
}

function renderStats() {
  document.getElementById("statTotal").textContent = allAssets.length;
  document.getElementById("statIssues").textContent =
    allAssets.filter(a => a.status === "Issue Reported" || a.status === "Under Inspection" || a.status === "Under Maintenance").length;
  document.getElementById("statOOS").textContent =
    allAssets.filter(a => a.status === "Out of Service").length;
}

function renderAssets() {
  const search = document.getElementById("searchInput").value.trim().toLowerCase();
  const statusFilter = document.getElementById("statusFilter").value;
  const categoryFilter = document.getElementById("categoryFilter").value;

  const filtered = allAssets.filter(a => {
    const matchesSearch = !search || a.name.toLowerCase().includes(search) || a.asset_code.toLowerCase().includes(search);
    const matchesStatus = !statusFilter || a.status === statusFilter;
    const matchesCategory = !categoryFilter || a.category === categoryFilter;
    return matchesSearch && matchesStatus && matchesCategory;
  });

  const tbody = document.getElementById("assetsTableBody");

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6">No assets match your search/filters.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(a => `
    <tr onclick="window.location.href='asset.html?id=${a.id}'">
      <td><strong>${escapeHtml(a.name)}</strong></td>
      <td><span class="asset-tag">${escapeHtml(a.asset_code)}</span></td>
      <td>${escapeHtml(a.category)}</td>
      <td>${escapeHtml(a.location)}</td>
      <td><span class="badge badge-${statusClass(a.status)}"><span class="led"></span>${a.status}</span></td>
      <td>${formatDate(a.next_service_date)}</td>
    </tr>
  `).join("");
}

// ---------- Add asset modal ----------
function openAssetModal() {
  document.getElementById("assetModalBackdrop").style.display = "flex";
}
function closeAssetModal() {
  document.getElementById("assetModalBackdrop").style.display = "none";
  document.getElementById("assetForm").reset();
  document.getElementById("assetFormError").textContent = "";
}

document.getElementById("assetForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = document.getElementById("saveAssetBtn");
  const errorEl = document.getElementById("assetFormError");
  errorEl.textContent = "";
  btn.disabled = true;
  btn.textContent = "Saving...";

  const { data: { user } } = await supabase.auth.getUser();

  // Keep generating a code until we find one that isn't already taken.
  // (Collisions are extremely rare with a 5-character random suffix, but we
  // guard for it since asset_code must be unique.)
  let asset_code, insertError, insertedRow;
  for (let attempt = 0; attempt < 5; attempt++) {
    asset_code = generateCode("AST");
    const { data, error } = await supabase.from("assets").insert({
      asset_code,
      name: document.getElementById("fName").value.trim(),
      category: document.getElementById("fCategory").value.trim(),
      location: document.getElementById("fLocation").value.trim(),
      condition: document.getElementById("fCondition").value,
      status: document.getElementById("fStatus").value,
      description: document.getElementById("fDescription").value.trim(),
      last_service_date: document.getElementById("fLastService").value || null,
      next_service_date: document.getElementById("fNextService").value || null,
      created_by: user.id,
    }).select().single();

    if (!error) { insertedRow = data; break; }
    if (!error?.message?.includes("duplicate")) { insertError = error; break; }
  }

  btn.disabled = false;
  btn.textContent = "Save asset";

  if (insertError || !insertedRow) {
    errorEl.textContent = insertError ? insertError.message : "Could not generate a unique asset code, please try again.";
    return;
  }

  await logHistory(insertedRow.id, null, currentProfile.full_name, "Asset Registered", `Asset "${insertedRow.name}" added to the system.`);

  showToast("Asset registered successfully", "success");
  closeAssetModal();
  await loadAssets();
});

async function logout() {
  await supabase.auth.signOut();
  window.location.href = "login.html";
}

init();
