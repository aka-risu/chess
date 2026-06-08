-- supabase/schema.sql
-- Paste into Supabase → SQL Editor → Run.

create table if not exists tournament (
  id          text primary key default 'current',
  title       text not null default 'Swiss Tournament',
  rounds      int  not null default 4,
  status      text not null default 'setup',
  state       jsonb not null default '{"players":[],"schedule":[],"viewRound":1}'::jsonb,
  location    text,
  event_at    timestamptz,
  signups_public boolean not null default false,
  show_sponsor   boolean not null default false,
  show_venue     boolean not null default false,
  updated_at  timestamptz not null default now()
);

-- Migration for existing tournament tables (safe to re-run):
alter table tournament add column if not exists location text;
alter table tournament add column if not exists event_at timestamptz;
-- Whether the full sign-up name list is public (else only a count is shown):
alter table tournament add column if not exists signups_public boolean not null default false;
-- Footer credit toggles (off by default — organizer opts in):
alter table tournament add column if not exists show_sponsor boolean not null default false;
alter table tournament add column if not exists show_venue boolean not null default false;

-- Archived finished tournaments (history). One row per finished tournament,
-- keyed by the per-tournament uid so post-finish edits update the same row.
create table if not exists tournament_history (
  id          uuid primary key,
  title       text not null,
  location    text,
  event_at    timestamptz,
  finished_at timestamptz not null default now(),
  rounds      int not null default 0,
  standings   jsonb not null default '[]'::jsonb, -- [{name,score,buch,sb}], sorted; podium = first 3
  state       jsonb, -- full engine state (players + schedule) for the detailed standings table
  visible     boolean not null default true
);
-- Migration for existing history tables:
alter table tournament_history add column if not exists state jsonb;

create table if not exists signups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  level       int,
  created_at  timestamptz not null default now()
);
-- Migration for existing signups tables:
alter table signups add column if not exists level int;

-- seed the single tournament row
insert into tournament (id) values ('current') on conflict (id) do nothing;

-- Row Level Security (no-auth public app)
alter table tournament         enable row level security;
alter table signups            enable row level security;
alter table tournament_history enable row level security;

-- public can read everything
create policy "read tournament" on tournament for select using (true);
create policy "read signups"    on signups    for select using (true);
create policy "read history"    on tournament_history for select using (true);

-- history writes (no auth available)
create policy "insert history" on tournament_history for insert with check (true);
create policy "update history" on tournament_history for update using (true) with check (true);
create policy "delete history" on tournament_history for delete using (true);

-- public can sign up (insert) and remove their own row (delete)
create policy "insert signups" on signups for insert with check (true);
create policy "delete signups" on signups for delete using (true);

-- tournament writes (no auth available): allow update of the singleton row
create policy "update tournament" on tournament for update using (true) with check (true);

-- enable realtime
alter publication supabase_realtime add table tournament;
alter publication supabase_realtime add table signups;
alter publication supabase_realtime add table tournament_history;
