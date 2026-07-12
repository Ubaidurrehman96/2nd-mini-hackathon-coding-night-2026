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


#

   https://maintain-iq-mini-hackathone.netlify.app/login.html
