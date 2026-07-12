/* ============================================================
   PUBLIC.JS — runs on public.html?code=<asset_code>
   No login required. Only "safe" fields are read/shown here —
   private technician notes and maintenance costs live in tables
   this page never queries.
   ============================================================ */

const assetCode = getParam("code");
let publicAsset = null;

async function init() {
  if (!assetCode) return showNotFound();

  const { data, error } = await supabase.from("assets").select("*").eq("asset_code", assetCode).single();

  if (error || !data) return showNotFound();

  publicAsset = data;
  renderAsset();
}

function showNotFound() {
  document.getElementById("notFoundState").style.display = "block";
}

function renderAsset() {
  const a = publicAsset;
  document.getElementById("mainState").style.display = "block";
  document.getElementById("pCode").textContent = a.asset_code;
  document.getElementById("pName").textContent = a.name;
  document.getElementById("pCategory").textContent = a.category;
  document.getElementById("pLocation").textContent = a.location;
  document.getElementById("pStatus").textContent = a.status;
  document.getElementById("pCondition").textContent = a.condition;
  document.getElementById("pLastService").textContent = formatDate(a.last_service_date);
  document.getElementById("pNextService").textContent = formatDate(a.next_service_date);

  if (a.status === "Retired") {
    document.getElementById("retiredNotice").style.display = "block";
  }
}

document.getElementById("reportForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = document.getElementById("submitReportBtn");
  const errorEl = document.getElementById("reportError");
  errorEl.textContent = "";
  btn.disabled = true; btn.textContent = "Submitting...";

  const description = document.getElementById("rDescription").value.trim();
  const aiBoxVisible = document.getElementById("aiSuggestionBox").style.display === "block";

  // If the reporter used the AI suggestion box, use those (possibly edited) values.
  // Otherwise fall back to sensible defaults built straight from the description.
  const title = aiBoxVisible ? document.getElementById("aiTitle").value.trim() : buildTitle(description);
  const category = aiBoxVisible ? document.getElementById("aiCategory").value.trim() : "General Maintenance";
  const priority = aiBoxVisible ? document.getElementById("aiPriority").value : "Medium";

  let evidence_url = null;
  const file = document.getElementById("rEvidence").files[0];
  if (file) {
    const path = `public-reports/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from("evidence").upload(path, file);
    if (uploadError) {
      errorEl.textContent = "Evidence upload failed: " + uploadError.message;
      btn.disabled = false; btn.textContent = "Submit report";
      return;
    }
    evidence_url = supabase.storage.from("evidence").getPublicUrl(path).data.publicUrl;
  }

  // Generate a unique issue number, retrying on the rare chance of a collision.
  let issue_number, insertedIssue, insertError;
  for (let attempt = 0; attempt < 5; attempt++) {
    issue_number = generateCode("ISS");
    const { data, error } = await supabase.from("issues").insert({
      issue_number,
      asset_id: publicAsset.id,
      title,
      description,
      category,
      priority,
      reporter_name: document.getElementById("rName").value.trim() || "Anonymous",
      reporter_contact: document.getElementById("rContact").value.trim() || null,
      evidence_url,
    }).select().single();

    if (!error) { insertedIssue = data; break; }
    if (!error?.message?.includes("duplicate")) { insertError = error; break; }
  }

  btn.disabled = false; btn.textContent = "Submit report";

  if (insertError || !insertedIssue) {
    errorEl.textContent = insertError ? insertError.message : "Could not submit report, please try again.";
    return;
  }

  // Move the asset into "Issue Reported" status (business rule 5.1)
  await supabase.from("assets").update({ status: "Issue Reported" }).eq("id", publicAsset.id);

  // Log this on the permanent asset history timeline
  await logHistory(publicAsset.id, insertedIssue.id, insertedIssue.reporter_name, "Issue Reported", title);

  document.getElementById("reportForm").style.display = "none";
  document.getElementById("successIssueNumber").textContent = issue_number;
  document.getElementById("successState").style.display = "block";
});

function buildTitle(description) {
  const trimmed = description.trim().replace(/\s+/g, " ");
  const short = trimmed.length > 60 ? trimmed.slice(0, 57) + "..." : trimmed;
  return short.charAt(0).toUpperCase() + short.slice(1);
}

init();
