-- ============================================================
-- MaintainIQ - Supabase Database Schema (Track B)
-- ============================================================
-- Run this whole file once in: Supabase Dashboard -> SQL Editor -> New Query
-- ============================================================

-- 1) PROFILES
-- Every signed-up user gets a row here. We store their role (admin / technician)
-- because Supabase Auth only stores email/password, not app-specific data.
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null default 'technician' check (role in ('admin', 'technician')),
  created_at timestamptz not null default now()
);

-- 2) ASSETS
create table if not exists assets (
  id uuid primary key default gen_random_uuid(),
  asset_code text not null unique,
  name text not null,
  category text not null,
  location text not null,
  condition text not null default 'Good',
  status text not null default 'Operational'
    check (status in ('Operational','Issue Reported','Under Inspection','Under Maintenance','Out of Service','Retired')),
  description text,
  last_service_date date,
  next_service_date date,
  assigned_technician uuid references profiles(id),
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- 3) ISSUES
create table if not exists issues (
  id uuid primary key default gen_random_uuid(),
  issue_number text not null unique,
  asset_id uuid not null references assets(id) on delete cascade,
  title text not null,
  description text not null,
  category text,
  priority text not null default 'Medium' check (priority in ('Low','Medium','High','Critical')),
  status text not null default 'Reported'
    check (status in ('Reported','Assigned','Inspection Started','Maintenance In Progress','Waiting for Parts','Resolved','Closed','Reopened')),
  reporter_name text,
  reporter_contact text,
  evidence_url text,
  assigned_to uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4) MAINTENANCE LOGS
-- One row per maintenance action a technician performs on an issue.
create table if not exists maintenance_logs (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references issues(id) on delete cascade,
  technician_id uuid references profiles(id),
  notes text not null,
  parts_used text,
  cost numeric default 0 check (cost >= 0),
  evidence_url text,
  created_at timestamptz not null default now()
);

-- 5) ASSET HISTORY (permanent, append-only timeline)
create table if not exists asset_history (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references assets(id) on delete cascade,
  issue_id uuid references issues(id),
  actor text not null,        -- name/email of whoever triggered the event
  action text not null,       -- e.g. "Asset Registered", "Issue Reported", "Status changed to Resolved"
  details text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- INDEXES (make search/filter fast)
-- ============================================================
create index if not exists idx_assets_status on assets(status);
create index if not exists idx_assets_category on assets(category);
create index if not exists idx_issues_asset on issues(asset_id);
create index if not exists idx_issues_status on issues(status);
create index if not exists idx_history_asset on asset_history(asset_id);

-- ============================================================
-- AUTO-CREATE PROFILE ON SIGNUP
-- Whenever someone signs up via Supabase Auth, automatically create
-- their profile row using metadata passed at signup (full_name, role).
-- ============================================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    coalesce(new.raw_user_meta_data->>'role', 'technician')
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================
alter table profiles enable row level security;
alter table assets enable row level security;
alter table issues enable row level security;
alter table maintenance_logs enable row level security;
alter table asset_history enable row level security;

-- PROFILES: everyone logged in can read profiles (needed for technician dropdowns)
create policy "profiles readable by authenticated users"
  on profiles for select
  to authenticated
  using (true);

create policy "users can update their own profile"
  on profiles for update
  to authenticated
  using (auth.uid() = id);

-- ASSETS: public (anon) can VIEW assets (needed for the public QR page).
-- Only logged-in users can create/edit/delete.
create policy "assets are publicly readable"
  on assets for select
  to anon, authenticated
  using (true);

create policy "authenticated users can insert assets"
  on assets for insert
  to authenticated
  with check (true);

create policy "authenticated users can update assets"
  on assets for update
  to authenticated
  using (true);

-- ISSUES: public can INSERT (report an issue without login) and SELECT
-- (so a reporter can check status later). Only authenticated users can update.
create policy "issues are publicly readable"
  on issues for select
  to anon, authenticated
  using (true);

create policy "anyone can report an issue"
  on issues for insert
  to anon, authenticated
  with check (true);

create policy "authenticated users can update issues"
  on issues for update
  to authenticated
  using (true);

-- MAINTENANCE LOGS: only authenticated (technicians/admins) can read/write.
-- These are internal notes, never shown on the public page.
create policy "maintenance logs readable by authenticated"
  on maintenance_logs for select
  to authenticated
  using (true);

create policy "authenticated users can insert maintenance logs"
  on maintenance_logs for insert
  to authenticated
  with check (true);

-- ASSET HISTORY: readable by everyone (safe activity feed), writable by
-- authenticated users and by the public-issue-report flow (anon insert
-- is allowed only for the "Issue Reported" event created from the public page).
create policy "history is publicly readable"
  on asset_history for select
  to anon, authenticated
  using (true);

create policy "authenticated users can insert history"
  on asset_history for insert
  to authenticated
  with check (true);

create policy "anon can insert history when reporting an issue"
  on asset_history for insert
  to anon
  with check (action = 'Issue Reported');

-- ============================================================
-- STORAGE BUCKET for evidence photos/videos
-- Create a public bucket called "evidence" from Dashboard -> Storage,
-- or run this (needs storage extension, usually already enabled):
-- ============================================================
insert into storage.buckets (id, name, public)
values ('evidence', 'evidence', true)
on conflict (id) do nothing;

create policy "anyone can upload evidence"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'evidence');

create policy "anyone can view evidence"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'evidence');
