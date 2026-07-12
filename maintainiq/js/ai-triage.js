/* ============================================================
   AI-TRIAGE.JS

   The spec's "AI Issue Triage" feature turns a free-text complaint
   into structured fields (title, category, priority, causes, checks).

   For Track B, the spec explicitly allows a rule-based classifier
   when the class hasn't covered secure server-side AI calls yet,
   because a REAL AI API key must never sit in frontend JS — anyone
   could open dev tools and steal it.

   This file simulates that structured output with simple keyword
   matching, so the whole workflow (suggest -> user reviews/edits ->
   save) works end-to-end and is easy to explain in an interview.

   TO UPGRADE TO A REAL AI LATER:
   Replace the body of runAiTriage() with a fetch() call to a
   Supabase Edge Function (which safely holds the real API key on
   the server) and keep everything else — the review/edit UI, the
   save logic — exactly the same.
   ============================================================ */

const TRIAGE_RULES = [
  { keywords: ["leak", "water", "dripping"], category: "Plumbing / Leakage", priority: "High",
    causes: "Blocked drain, worn seal/gasket, cracked pipe or condensation tray.",
    checks: "Turn off nearby power if water is near electrical points. Check for visible dripping source and place a container underneath." },
  { keywords: ["spark", "shock", "smoke", "burning smell", "fire"], category: "Electrical Safety", priority: "Critical",
    causes: "Damaged wiring, overloaded circuit, or component failure.",
    checks: "Switch off and unplug the unit immediately. Do not touch exposed wiring. Keep people away until a qualified technician arrives." },
  { keywords: ["noise", "vibration", "rattling", "grinding"], category: "Mechanical", priority: "Medium",
    causes: "Loose component, worn bearing, or misaligned part.",
    checks: "Note when the noise occurs (startup/continuous) and if it changes with load or speed." },
  { keywords: ["not turning on", "no power", "dead", "won't start", "not working"], category: "Power / Electrical", priority: "High",
    causes: "Power supply failure, tripped breaker, or internal fault.",
    checks: "Confirm the power source and cable connection. Check if a nearby breaker has tripped." },
  { keywords: ["flicker", "hdmi", "display", "screen", "projector"], category: "Electronics / Display", priority: "Medium",
    causes: "Loose or damaged cable, failing bulb/panel, or driver fault.",
    checks: "Reseat the HDMI/power cable. Try a different input source or cable if available." },
  { keywords: ["cooling", "not cold", "warm", "ac", "air conditioner", "hvac"], category: "HVAC", priority: "Medium",
    causes: "Low refrigerant, dirty filter, or blocked airflow.",
    checks: "Check filter cleanliness and confirm vents are unobstructed." },
  { keywords: ["crack", "broken", "damaged", "torn"], category: "Structural / Physical Damage", priority: "Medium",
    causes: "Physical impact, material fatigue, or manufacturing defect.",
    checks: "Photograph the damage and cordon off the area if it poses a trip/injury risk." },
];

const DEFAULT_TRIAGE = { category: "General Maintenance", priority: "Medium",
  causes: "Cause unclear from description — needs on-site inspection.",
  checks: "Perform a visual inspection and test basic functionality before further diagnosis." };

function buildTitle(description) {
  const trimmed = description.trim().replace(/\s+/g, " ");
  const short = trimmed.length > 60 ? trimmed.slice(0, 57) + "..." : trimmed;
  return short.charAt(0).toUpperCase() + short.slice(1);
}

function runAiTriage() {
  const description = document.getElementById("rDescription").value.trim();
  if (!description) {
    showToast("Describe the problem first, then request AI suggestions.", "error");
    return;
  }

  const lower = description.toLowerCase();
  const match = TRIAGE_RULES.find(rule => rule.keywords.some(k => lower.includes(k))) || DEFAULT_TRIAGE;

  document.getElementById("aiTitle").value = buildTitle(description);
  document.getElementById("aiCategory").value = match.category;
  document.getElementById("aiPriority").value = match.priority;
  document.getElementById("aiCauses").value = match.causes;
  document.getElementById("aiChecks").value = match.checks;
  document.getElementById("aiSuggestionBox").style.display = "block";

  showToast("AI suggestion ready — review and edit before submitting", "success");
}
