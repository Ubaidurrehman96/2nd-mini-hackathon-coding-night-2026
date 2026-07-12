/* ============================================================
   ISSUE.JS — runs on issue.html?id=<issue_id>

   Business rules enforced here (from the spec):
   - An issue cannot be Resolved without at least one maintenance note.
   - A Closed issue cannot be edited until it is Reopened.
   - Maintenance cost cannot be negative (also enforced by DB check).
   - Status changes cascade to the parent asset's status (table 5.1).
   ============================================================ */

const issueId = getParam("id");
let currentIssue = null;
let currentProfile = null;
let maintenanceCount = 0;

// Maps an issue status to the asset status it should trigger (spec 5.1)
const ASSET_STATUS_FOR_ISSUE_STATUS = {
  "Reported": "Issue Reported",
  "Assigned": "Issue Reported",
  "Inspection Started": "Under Inspection",
  "Maintenance In Progress": "Under Maintenance",
  "Waiting for Parts": "Under Maintenance",
  "Resolved": "Operational",
  "Closed": "Operational",
  "Reopened": "Issue Reported",
};

async function init() {
  const session = await requireLogin();
  if (!session) return;
  if (!issueId) { window.location.href = "issues.html"; return; }

  currentProfile = await getCurrentProfile();
  document.getElementById("userName").textContent =
    currentProfile ? `${currentProfile.full_name} (${currentProfile.role})` : "";

  await loadTechnicians();
  await loadIssue();
  await loadMaintenanceLogs();
}

async function loadIssue() {
  const { data, error } = await supabase
    .from("issues")
    .select("*, assets(id, name, asset_code, status)")
    .eq("id", issueId)
    .single();

  if (error || !data) {
    showToast("Issue not found", "error");
    setTimeout(() => window.location.href = "issues.html", 1200);
    return;
  }
  currentIssue = data;
  renderIssue();
}

function renderIssue() {
  const i = currentIssue;
  document.getElementById("issueNumber").textContent = i.issue_number;
  document.getElementById("issueTitle").textContent = i.title;
  document.getElementById("issueMeta").textContent = `Reported ${formatDateTime(i.created_at)}`;
  document.getElementById("issueDescription").textContent = i.description;
  document.getElementById("iCategory").textContent = i.category || "-";
  document.getElementById("iReporter").textContent = i.reporter_name || "Anonymous";

  const priorityPill = document.getElementById("priorityPill");
  priorityPill.className = `priority-pill priority-${i.priority.toLowerCase()}`;
  priorityPill.textContent = i.priority;

  const badge = document.getElementById("issueStatusBadge");
  badge.className = `badge badge-${statusClass(i.status)}`;
  badge.innerHTML = `<span class="led"></span>${i.status}`;

  document.getElementById("statusSelect").value = i.status;
  document.getElementById("assignSelect").value = i.assigned_to || "";

  if (i.evidence_url) {
    document.getElementById("evidenceWrap").style.display = "block";
    document.getElementById("evidenceLink").href = i.evidence_url;
  }

  const asset = i.assets;
  document.getElementById("assetLinkWrap").innerHTML =
    `<a href="asset.html?id=${asset.id}" class="btn btn-outline btn-sm">${escapeHtml(asset.name)} (${escapeHtml(asset.asset_code)})</a>`;
  document.getElementById("backToAsset").href = `asset.html?id=${asset.id}`;

  // Closed issues are locked until reopened. The status dropdown stays
  // enabled (so the user CAN pick "Reopened"), but the maintenance form
  // is disabled until that happens.
  const isLocked = i.status === "Closed";
  document.querySelectorAll("#maintenanceForm input, #maintenanceForm textarea, #maintenanceForm button").forEach(el => {
    el.disabled = isLocked;
  });
  if (isLocked) {
    document.getElementById("maintenanceError").textContent = "This issue is closed. Reopen it before adding further notes.";
  }
}

// ---------- TECHNICIAN ASSIGNMENT ----------
async function loadTechnicians() {
  const { data, error } = await supabase.from("profiles").select("*").eq("role", "technician");
  if (error) return;
  const select = document.getElementById("assignSelect");
  data.forEach(tech => {
    const opt = document.createElement("option");
    opt.value = tech.id;
    opt.textContent = tech.full_name;
    select.appendChild(opt);
  });
}

async function assignTechnician() {
  const techId = document.getElementById("assignSelect").value || null;
  const updates = { assigned_to: techId, updated_at: new Date().toISOString() };
  // Assigning a technician to a freshly reported issue naturally moves it to "Assigned"
  if (techId && currentIssue.status === "Reported") updates.status = "Assigned";

  const { error } = await supabase.from("issues").update(updates).eq("id", issueId);
  if (error) return showToast("Failed to assign: " + error.message, "error");

  const techName = techId ? document.getElementById("assignSelect").selectedOptions[0].textContent : "Unassigned";
  await logHistory(currentIssue.assets.id, issueId, currentProfile.full_name, "Issue Assigned", `Assigned to ${techName}.`);
  showToast("Technician assigned", "success");
  await loadIssue();
}

// ---------- STATUS UPDATE ----------
async function updateStatus() {
  const newStatus = document.getElementById("statusSelect").value;
  const errorEl = document.getElementById("statusError");
  errorEl.textContent = "";

  // Business rule: cannot resolve without a maintenance note
  if (newStatus === "Resolved" && maintenanceCount === 0) {
    errorEl.textContent = "Add at least one maintenance note before resolving this issue.";
    return;
  }

  // Business rule: a Closed issue must be Reopened before any other transition
  if (currentIssue.status === "Closed" && newStatus !== "Reopened") {
    errorEl.textContent = "This issue is closed. Choose 'Reopened' first.";
    return;
  }

  const { error } = await supabase.from("issues").update({
    status: newStatus,
    updated_at: new Date().toISOString(),
  }).eq("id", issueId);

  if (error) { errorEl.textContent = error.message; return; }

  // Cascade the matching asset status change (spec section 5.1)
  const newAssetStatus = ASSET_STATUS_FOR_ISSUE_STATUS[newStatus];
  if (newAssetStatus) {
    await supabase.from("assets").update({ status: newAssetStatus }).eq("id", currentIssue.assets.id);
  }

  await logHistory(currentIssue.assets.id, issueId, currentProfile.full_name, "Issue Status Changed", `Status changed to "${newStatus}".`);
  showToast("Status updated", "success");
  await loadIssue();
}

// ---------- MAINTENANCE LOG ----------
document.getElementById("maintenanceForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = document.getElementById("saveNoteBtn");
  const errorEl = document.getElementById("maintenanceError");
  errorEl.textContent = "";
  btn.disabled = true; btn.textContent = "Saving...";

  const cost = parseFloat(document.getElementById("mCost").value || "0");
  if (cost < 0) {
    errorEl.textContent = "Cost cannot be negative.";
    btn.disabled = false; btn.textContent = "Save maintenance note";
    return;
  }

  let evidence_url = null;
  const file = document.getElementById("mEvidence").files[0];
  if (file) {
    const path = `${issueId}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from("evidence").upload(path, file);
    if (uploadError) {
      errorEl.textContent = "Evidence upload failed: " + uploadError.message;
      btn.disabled = false; btn.textContent = "Save maintenance note";
      return;
    }
    evidence_url = supabase.storage.from("evidence").getPublicUrl(path).data.publicUrl;
  }

  const { error } = await supabase.from("maintenance_logs").insert({
    issue_id: issueId,
    technician_id: currentProfile.id,
    notes: document.getElementById("mNotes").value.trim(),
    parts_used: document.getElementById("mParts").value.trim(),
    cost,
    evidence_url,
  });

  btn.disabled = false; btn.textContent = "Save maintenance note";

  if (error) { errorEl.textContent = error.message; return; }

  await logHistory(currentIssue.assets.id, issueId, currentProfile.full_name, "Maintenance Note Added", document.getElementById("mNotes").value.trim());
  showToast("Maintenance note saved", "success");
  document.getElementById("maintenanceForm").reset();
  await loadMaintenanceLogs();
});

async function loadMaintenanceLogs() {
  const { data, error } = await supabase
    .from("maintenance_logs")
    .select("*, profiles(full_name)")
    .eq("issue_id", issueId)
    .order("created_at", { ascending: false });

  const list = document.getElementById("maintenanceTimeline");
  if (error) { list.innerHTML = `<li><div class="t-action">Failed to load maintenance notes.</div></li>`; return; }

  maintenanceCount = data.length;

  if (data.length === 0) {
    list.innerHTML = `<li><div class="t-action">No maintenance notes yet.</div></li>`;
    return;
  }

  list.innerHTML = data.map(log => `
    <li>
      <div class="t-action">${escapeHtml(log.notes)}</div>
      <div class="t-meta">${log.profiles ? escapeHtml(log.profiles.full_name) : "Technician"} · ${formatDateTime(log.created_at)}</div>
      <div class="t-details">
        ${log.parts_used ? `Parts: ${escapeHtml(log.parts_used)} · ` : ""}Cost: ${Number(log.cost || 0).toFixed(2)}
        ${log.evidence_url ? ` · <a href="${log.evidence_url}" target="_blank">View evidence</a>` : ""}
      </div>
    </li>
  `).join("");
}

async function logout() {
  await supabase.auth.signOut();
  window.location.href = "login.html";
}

init();
