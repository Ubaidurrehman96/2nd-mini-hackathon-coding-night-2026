/* ============================================================
   ASSET.JS — runs on asset.html?id=<asset_id>
   ============================================================ */

const assetId = getParam("id");
let currentAsset = null;
let currentProfile = null;

async function init() {
  const session = await requireLogin();
  if (!session) return;
  if (!assetId) { window.location.href = "dashboard.html"; return; }

  currentProfile = await getCurrentProfile();
  document.getElementById("userName").textContent =
    currentProfile ? `${currentProfile.full_name} (${currentProfile.role})` : "";

  await loadTechnicians();
  await loadAsset();
  await loadIssues();
  await loadHistory();
}

async function loadAsset() {
  const { data, error } = await supabase.from("assets").select("*").eq("id", assetId).single();
  if (error || !data) {
    showToast("Asset not found", "error");
    setTimeout(() => window.location.href = "dashboard.html", 1200);
    return;
  }
  currentAsset = data;
  renderAsset();
  renderQR();
}

function renderAsset() {
  const a = currentAsset;
  document.getElementById("assetCode").textContent = a.asset_code;
  document.getElementById("assetName").textContent = a.name;
  document.getElementById("assetMeta").textContent = `${a.category} · ${a.location}`;

  const badge = document.getElementById("assetStatusBadge");
  badge.className = `badge badge-${statusClass(a.status)}`;
  badge.innerHTML = `<span class="led"></span>${a.status}`;

  document.getElementById("dCategory").textContent = a.category;
  document.getElementById("dLocation").textContent = a.location;
  document.getElementById("dCondition").textContent = a.condition;
  document.getElementById("dLastService").textContent = formatDate(a.last_service_date);
  document.getElementById("dNextService").textContent = formatDate(a.next_service_date);
  document.getElementById("dDescription").textContent = a.description || "No description provided.";

  document.getElementById("technicianSelect").value = a.assigned_technician || "";
}

// ---------- QR CODE ----------
function publicUrl() {
  return `${window.location.origin}${window.location.pathname.replace("asset.html", "public.html")}?code=${currentAsset.asset_code}`;
}

function renderQR() {
  const url = publicUrl();
  document.getElementById("publicLinkInput").value = url;
  document.getElementById("openPublicBtn").href = url;

  const qrDiv = document.getElementById("qrcode");
  qrDiv.innerHTML = "";
  // QRCode.js (davidshimjs) draws directly into the div as a <canvas>/<img>
  new QRCode(qrDiv, { text: url, width: 176, height: 176, colorDark: "#1C2521", colorLight: "#ffffff" });
}

function downloadQR() {
  const canvas = document.querySelector("#qrcode canvas");
  if (!canvas) return showToast("QR not ready yet", "error");
  const link = document.createElement("a");
  link.download = `${currentAsset.asset_code}-qr.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

function copyPublicLink() {
  navigator.clipboard.writeText(publicUrl());
  showToast("Public link copied to clipboard", "success");
}

// ---------- TECHNICIAN ASSIGNMENT ----------
async function loadTechnicians() {
  const { data, error } = await supabase.from("profiles").select("*").eq("role", "technician");
  if (error) return;
  const select = document.getElementById("technicianSelect");
  data.forEach(tech => {
    const opt = document.createElement("option");
    opt.value = tech.id;
    opt.textContent = tech.full_name;
    select.appendChild(opt);
  });
}

async function assignTechnician() {
  const techId = document.getElementById("technicianSelect").value || null;
  const { error } = await supabase.from("assets").update({ assigned_technician: techId }).eq("id", assetId);
  if (error) return showToast("Failed to assign technician: " + error.message, "error");

  const techName = techId
    ? document.getElementById("technicianSelect").selectedOptions[0].textContent
    : "Unassigned";
  await logHistory(assetId, null, currentProfile.full_name, "Technician Assigned", `Assigned to ${techName}.`);
  showToast("Technician updated", "success");
  loadHistory();
}

// ---------- EDIT ASSET ----------
function openEditModal() {
  const a = currentAsset;
  document.getElementById("eName").value = a.name;
  document.getElementById("eCategory").value = a.category;
  document.getElementById("eLocation").value = a.location;
  document.getElementById("eCondition").value = a.condition;
  document.getElementById("eStatus").value = a.status;
  document.getElementById("eDescription").value = a.description || "";
  document.getElementById("eLastService").value = a.last_service_date || "";
  document.getElementById("eNextService").value = a.next_service_date || "";
  document.getElementById("editModalBackdrop").style.display = "flex";
}
function closeEditModal() {
  document.getElementById("editModalBackdrop").style.display = "none";
  document.getElementById("editFormError").textContent = "";
}

document.getElementById("editForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = document.getElementById("saveEditBtn");
  btn.disabled = true; btn.textContent = "Saving...";

  const statusChanged = currentAsset.status !== document.getElementById("eStatus").value;

  const updates = {
    name: document.getElementById("eName").value.trim(),
    category: document.getElementById("eCategory").value.trim(),
    location: document.getElementById("eLocation").value.trim(),
    condition: document.getElementById("eCondition").value,
    status: document.getElementById("eStatus").value,
    description: document.getElementById("eDescription").value.trim(),
    last_service_date: document.getElementById("eLastService").value || null,
    next_service_date: document.getElementById("eNextService").value || null,
  };

  // Business rule: next service date cannot be before last service date
  if (updates.last_service_date && updates.next_service_date && updates.next_service_date < updates.last_service_date) {
    document.getElementById("editFormError").textContent = "Next service date cannot be before last service date.";
    btn.disabled = false; btn.textContent = "Save changes";
    return;
  }

  const { error } = await supabase.from("assets").update(updates).eq("id", assetId);

  btn.disabled = false; btn.textContent = "Save changes";

  if (error) {
    document.getElementById("editFormError").textContent = error.message;
    return;
  }

  if (statusChanged) {
    await logHistory(assetId, null, currentProfile.full_name, "Asset Details Updated", `Status changed to ${updates.status}.`);
  } else {
    await logHistory(assetId, null, currentProfile.full_name, "Asset Details Updated", "Asset information edited.");
  }

  showToast("Asset updated", "success");
  closeEditModal();
  await loadAsset();
  await loadHistory();
});

// ---------- ISSUES LIST ----------
async function loadIssues() {
  const { data, error } = await supabase
    .from("issues")
    .select("*")
    .eq("asset_id", assetId)
    .order("created_at", { ascending: false });

  const tbody = document.getElementById("issuesTableBody");
  if (error) { tbody.innerHTML = `<tr class="empty-row"><td colspan="5">Failed to load issues.</td></tr>`; return; }
  if (data.length === 0) { tbody.innerHTML = `<tr class="empty-row"><td colspan="5">No issues reported for this asset yet.</td></tr>`; return; }

  tbody.innerHTML = data.map(i => `
    <tr onclick="window.location.href='issue.html?id=${i.id}'">
      <td><span class="asset-tag">${escapeHtml(i.issue_number)}</span></td>
      <td>${escapeHtml(i.title)}</td>
      <td><span class="priority-pill priority-${i.priority.toLowerCase()}">${i.priority}</span></td>
      <td><span class="badge badge-${statusClass(i.status)}"><span class="led"></span>${i.status}</span></td>
      <td>${formatDate(i.created_at)}</td>
    </tr>
  `).join("");
}

// ---------- HISTORY TIMELINE ----------
async function loadHistory() {
  const { data, error } = await supabase
    .from("asset_history")
    .select("*")
    .eq("asset_id", assetId)
    .order("created_at", { ascending: false });

  const list = document.getElementById("historyTimeline");
  if (error) { list.innerHTML = `<li><div class="t-action">Failed to load history.</div></li>`; return; }
  if (data.length === 0) { list.innerHTML = `<li><div class="t-action">No activity yet.</div></li>`; return; }

  list.innerHTML = data.map(h => `
    <li>
      <div class="t-action">${escapeHtml(h.action)}</div>
      <div class="t-meta">${escapeHtml(h.actor)} · ${formatDateTime(h.created_at)}</div>
      ${h.details ? `<div class="t-details">${escapeHtml(h.details)}</div>` : ""}
    </li>
  `).join("");
}

async function logout() {
  await supabase.auth.signOut();
  window.location.href = "login.html";
}

init();
