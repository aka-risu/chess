# Staging environment & branch workflow

Goal: test changes on a stable staging URL with its **own** Supabase data before
promoting to production — so you never experiment against live event data.

## One-time setup

### 1. A separate Supabase project for staging
- Create a second Supabase project (e.g. `chess-swiss-staging`).
- Run the full [`supabase/schema.sql`](../supabase/schema.sql) in its SQL Editor
  (creates the tables, RLS policies, realtime — same as production).
- Note its Project URL and anon key.

### 2. A long-lived `staging` branch
```bash
git checkout -b staging
git push -u origin staging
```
Vercel auto-creates a deployment for this branch with a **stable alias**
(e.g. `chess-swiss-git-staging-<org>.vercel.app`).

### 3. Branch-scoped environment variables in Vercel
In Vercel → Project → Settings → Environment Variables, add the **Preview**
values pointed at the *staging* Supabase, scoped to the `staging` branch:

| Variable | Production | Preview (branch: `staging`) |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | prod project URL | **staging** project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | prod anon key | **staging** anon key |
| `NEXT_PUBLIC_ORGANIZER_PASSCODE` | prod passcode | a staging passcode |

> Vercel lets you scope a Preview variable to a specific Git branch, so the
> `staging` branch reads staging values while other preview branches can differ.

## Day-to-day workflow

```
feature branch  →  PR into `staging`  →  test on staging URL  →  merge `staging` → `master`  →  production
```

1. Branch off `master` for a feature: `git checkout -b feat/x`.
2. Open a PR. Vercel posts a **preview URL** per push — quick look.
3. Merge into `staging`. Verify on the stable staging URL against staging data
   (finish a tournament, share a podium, etc. — without touching live events).
4. When happy, merge `staging` → `master`. Vercel deploys **production**.
5. If something slips through, use Vercel's **Instant Rollback** (Deployments →
   pick the last good production deploy → Promote) or **Rolling Releases**.

## Notes
- Local dev uses `.env.local` (gitignored) — keep that pointed at staging (or a
  personal Supabase) so local testing never hits production either.
- Database schema changes must be run in **both** Supabase projects (staging
  first, then production after verifying). `schema.sql` is idempotent.
- There is no separate backend service — Supabase *is* the backend. "Staging
  backend" here means a staging Supabase + branch-scoped config, not a new server.
