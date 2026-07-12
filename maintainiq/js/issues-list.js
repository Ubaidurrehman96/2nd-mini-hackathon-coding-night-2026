/* ============================================================
   ISSUES-LIST.JS — runs on issues.html
   ============================================================ */

let allIssues = [];

async function init() {
  const session = await requireLogin();
  if (!session) return;

  const profile = await getCurrentProfile();
  document.getElementById("userName").textContent = profile ? `${profile.full_name} (${profile.role})` : "";

  await loadIssues();
}

async function loadIssues() {
  // Supabase lets us pull the related asset's name/code in the same query
  // using a foreign-key join: assets(name, asset_code)
  const { data, error } = await supabase
    .from("issues")
    .select("*, assets(name, asset_code)")
    .order("created_at", { ascending: false });

  if (error) {
    showToast("Failed to load issues: " + error.message, "error");
    return;
  }

  allIssues = data;
  renderStats();
  renderIssues();
}

function renderStats() {
  const openStatuses = ["Reported", "Assigned", "Inspection Started", "Maintenance In Progress", "Waiting for Parts", "Reopened"];
  document.getElementById("statOpen").textContent = allIssues.filter(i => openStatuses.includes(i.status)).length;
  document.getElementById("statCritical").textContent = allIssues.filter(i => i.priority === "Critical").length;
  document.getElementById("statUnassigned").textContent = allIssues.filter(i => !i.assigned_to).length;
}

function renderIssues() {
  const search = document.getElementById("searchInput").value.trim().toLowerCase();
  const statusFilter = document.getElementById("statusFilter").value;
  const priorityFilter = document.getElementById("priorityFilter").value;

  const filtered = allIssues.filter(i => {
    const matchesSearch = !search || i.title.toLowerCase().includes(search) || i.issue_number.toLowerCase().includes(search);
    const matchesStatus = !statusFilter || i.status === statusFilter;
    const matchesPriority = !priorityFilter || i.priority === priorityFilter;
    return matchesSearch && matchesStatus && matchesPriority;
  });

  const tbody = document.getElementById("issuesTableBody");
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6">No issues match your search/filters.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(i => `
    <tr onclick="window.location.href='issue.html?id=${i.id}'">
      <td><span class="asset-tag">${escapeHtml(i.issue_number)}</span></td>
      <td>${escapeHtml(i.title)}</td>
      <td>${i.assets ? escapeHtml(i.assets.name) : "-"}</td>
      <td><span class="priority-pill priority-${i.priority.toLowerCase()}">${i.priority}</span></td>
      <td><span class="badge badge-${statusClass(i.status)}"><span class="led"></span>${i.status}</span></td>
      <td>${formatDate(i.created_at)}</td>
    </tr>
  `).join("");
}

async function logout() {
  await supabase.auth.signOut();
  window.location.href = "login.html";
}

init();
