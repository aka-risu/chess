-- supabase/schema.sql
-- Paste into Supabase → SQL Editor → Run.

create table if not exists tournament (
  id          text primary key default 'current',
  title       text not null default 'Swiss Tournament',
  rounds      int  not null default 4,
  status      text not null default 'setup',
  state       jsonb not null default '{"players":[],"schedule":[],"viewRound":1}'::jsonb,
  updated_at  timestamptz not null default now()
);

create table if not exists signups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

-- seed the single tournament row
insert into tournament (id) values ('current') on conflict (id) do nothing;

-- Row Level Security (no-auth public app)
alter table tournament enable row level security;
alter table signups   enable row level security;

-- public can read everything
create policy "read tournament" on tournament for select using (true);
create policy "read signups"    on signups    for select using (true);

-- public can sign up (insert) and remove their own row (delete)
create policy "insert signups" on signups for insert with check (true);
create policy "delete signups" on signups for delete using (true);

-- tournament writes (no auth available): allow update of the singleton row
create policy "update tournament" on tournament for update using (true) with check (true);

-- enable realtime
alter publication supabase_realtime add table tournament;
alter publication supabase_realtime add table signups;
