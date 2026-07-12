# MaintainIQ — AI-Powered QR Maintenance & Asset History Platform

Built for **SMIT Final Hackathon — Track B (HTML/CSS/JS + Supabase)**.

Plain HTML, CSS and JavaScript on the frontend. Supabase provides the
database, authentication, file storage, and security rules — no custom
backend server is written or needed.

---

## 1. What this project does

- Every asset (projector, AC, chair, machine...) gets a unique code and a
  QR code.
- Scanning the QR opens a **public page** — no login needed — where anyone
  can see safe asset info and report a problem.
- Admins/technicians log in to a **dashboard** to manage assets, assign
  technicians, update issue status, and record maintenance work.
- Every important action is written to a permanent **asset history**
  timeline (who did what, and when).
- An **AI Issue Triage** feature turns a plain-language complaint into a
  structured suggestion (title, category, priority, causes, checks) that
  the reporter can review and edit before submitting.

## 2. Folder structure

```
maintainiq/
├── index.html            entry point → redirects to login or dashboard
├── login.html             sign in / sign up
├── dashboard.html         asset list, search/filter, register asset
├── asset.html              one asset: details, QR code, issues, history
├── issues.html            all issues across every asset
├── issue.html              one issue: status workflow, maintenance notes
├── public.html            the page the QR code opens (no login)
├── css/
│   └── style.css          all styling
├── js/
│   ├── supabase-client.js  Supabase connection (URL + key) — ONE place
│   ├── utils.js             small shared helper functions
│   ├── auth.js               login.html logic
│   ├── dashboard.js           dashboard.html logic
│   ├── asset.js                asset.html logic + QR code generation
│   ├── issues-list.js           issues.html logic
│   ├── issue.js                  issue.html logic
│   ├── public.js                  public.html logic
│   └── ai-triage.js               rule-based "AI" suggestion engine
└── supabase-schema.sql    run once in Supabase SQL editor
```

Every HTML page loads the same three scripts in order:
`supabase-client.js` → `utils.js` → its own page script. This keeps each
file small and focused on one screen, which makes it easy to explain: "this
file only handles the login page", "this file only handles one asset".

## 3. Setup (5 steps)

1. **Create a Supabase project** at [supabase.com](https://supabase.com)
   (free tier is enough).
2. **Run the schema**: open your project → SQL Editor → paste the contents
   of `supabase-schema.sql` → Run. This creates all tables, security
   rules, the auto-profile trigger, and the `evidence` storage bucket.
3. **Get your API keys**: Project Settings → API → copy the *Project URL*
   and the *anon public* key.
4. **Paste them into `js/supabase-client.js`**:
   ```js
   const SUPABASE_URL = "https://xxxxxxxx.supabase.co";
   const SUPABASE_ANON_KEY = "eyJhbGciOi....";
   ```
5. **Open `index.html`** with a local server (e.g. VS Code "Live Server"
   extension, or `npx serve`). Don't just double-click the file — some
   browsers block features like `fetch` on `file://` URLs.

To deploy: push the folder to GitHub and connect it to Vercel/Netlify/GitHub
Pages — it's static files, no build step needed.

## 4. How the core workflow maps to code

| Spec requirement | Where it lives |
|---|---|
| Unique asset code | `dashboard.js` → `generateCode('AST')`, retried on collision |
| QR code generation | `asset.js` → `renderQR()` using the `qrcodejs` library |
| Public safe page | `public.html` + `public.js` — only reads columns that don't contain private notes |
| Report an issue | `public.js` → inserts into `issues`, updates asset status, writes history |
| AI Issue Triage | `ai-triage.js` → keyword-matching "AI" that returns structured suggestions; user can edit before saving |
| Assignment | `asset.js` / `issue.js` → `assignTechnician()` |
| Status workflow | `issue.js` → `updateStatus()` + `ASSET_STATUS_FOR_ISSUE_STATUS` map (implements spec table 5.1) |
| Maintenance record | `issue.js` → `maintenanceForm` submit handler, inserts into `maintenance_logs` |
| Can't resolve without a note | `issue.js` → `updateStatus()` checks `maintenanceCount === 0` |
| Asset history | `utils.js` → `logHistory()`, called after every meaningful action |
| Search & filter | `dashboard.js` / `issues-list.js` → filter the cached array in `renderAssets()` / `renderIssues()` |

## 5. Database design (why 5 tables)

- **profiles** — extends Supabase's built-in `auth.users` with `full_name`
  and `role` (admin/technician), since Supabase Auth only stores
  email/password by default.
- **assets** — one row per physical asset.
- **issues** — one row per reported problem, linked to an asset.
- **maintenance_logs** — one row per repair action a technician logs
  against an issue (this is what "closes the loop": notes, parts, cost).
- **asset_history** — an append-only timeline row for every important
  event, across the whole system.

A database **trigger** (`handle_new_user`) automatically creates a
`profiles` row whenever someone signs up, using the name/role they typed
on the signup form.

## 6. Security model (Row Level Security)

Supabase's anon key is safe to ship in frontend code *because* every table
has **Row Level Security (RLS)** rules that say exactly what an anonymous
visitor vs. a logged-in user is allowed to do:

- `assets` and `issues` are **readable by anyone** (needed for the public
  QR page) but only **writable by logged-in users** — except `issues`
  also allows anonymous **insert**, since visitors report problems
  without logging in.
- `maintenance_logs` (private technician notes/costs) can only be read or
  written by logged-in users — the public page never queries this table.
- `asset_history` is readable by everyone (a safe activity feed) but only
  writable by logged-in users, with one narrow exception allowing an
  anonymous "Issue Reported" event so the public report flow can log
  itself.

This is what the spec means by "public asset pages must expose only safe
information" — it's enforced at the database level, not just hidden in
the UI.

## 7. About the "AI" Issue Triage

The spec allows a rule-based classifier for tracks that haven't covered
secure server-side AI calls yet — a real AI API key must **never** sit in
frontend JavaScript, since anyone can read it from the browser's dev
tools. `js/ai-triage.js` simulates the same structured output (title,
category, priority, causes, checks) using keyword matching, so the full
product workflow — suggest → user reviews/edits → save — works exactly as
the spec describes.

**To upgrade to a real AI later:** create a Supabase Edge Function that
holds the real API key server-side, have `runAiTriage()` call that
function with `fetch()` instead of running the local rules, and keep
everything else (the review/edit UI, the save logic) unchanged.

## 8. Demo script (for live evaluation)

1. Sign up as Admin → register "Classroom Projector 01".
2. Open its asset page → show the QR code → open the public link in a new
   tab (or scan with a phone).
3. On the public page, type a complaint, click "Suggest details with AI",
   edit the suggestion, submit.
4. Back in the dashboard, open the issue → assign a technician → change
   status to "Inspection Started" → "Maintenance In Progress".
5. Add a maintenance note (parts + cost) → change status to "Resolved".
6. Go back to the asset page → status is now "Operational" → scroll the
   history timeline to show every step that was recorded automatically.
