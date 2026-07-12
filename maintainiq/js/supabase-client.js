/* ============================================================
   SUPABASE CLIENT
   ============================================================ */

const SUPABASE_URL = "https://dgmdkxoegbbxngnkctfb.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_juUtlH6e4DfiAeWVq5hoBQ_1tzreHUs";

// `supabase` global comes from the CDN script tag loaded in every HTML page.
// We reassign window.supabase because the CDN library already creates a
// global called `supabase` — redeclaring it with `const` causes errors.
window.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);