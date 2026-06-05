# Swiss Tournament App — Design Spec

**Date:** 2026-06-05
**Status:** Approved (pending user spec review)

## Summary

A mobile-first web app for running a single chess tournament with the Swiss
system. Players sign up remotely in advance (name only, no login). On the day,
one organizer selects who actually showed up, runs the tournament, and enters
results. Pairings and standings are visible live to everyone on their phones.

This builds on an existing offline single-file prototype (`index.html`) whose
Swiss pairing/standings engine is reused largely intact, now backed by a shared
database instead of `localStorage`.

## Roles & Access

- **Public (no auth):** can sign up and view live results/pairings.
- **Organizer:** unlocks editing with a shared **passcode** entered in the app.
  - Honest limitation: in a browser-only app the passcode gates the *UI*, not
    the database. Someone with developer tools and the public API key could
    write directly. Acceptable for a friendly club tournament. We harden what
    we reasonably can (see Security).

## Scope

- **One tournament at a time.** When finished, the organizer resets to start a
  new one. Past tournaments are not archived. (YAGNI: no multi-tournament,
  no accounts, no player profiles, no Elo.)

## Stack

- **Next.js (App Router, TypeScript)** — routes, components.
- **Supabase** — hosted Postgres + auto REST API + realtime subscriptions.
- **Vercel** — free static/edge hosting.
- No custom server code; the Supabase client runs in the browser.

## Routes / Pages

1. **`/` — Sign-up (public)**
   - Text field + "Sign me up" button. Appends to the sign-up list.
   - Shows confirmation + live list of everyone signed up.
   - A player can remove their own just-added entry (tracked by a local id in
     their browser; no auth).
   - Once the organizer starts the tournament, sign-up closes and this page
     links to `/results`.

2. **`/results` — Public live board**
   - Status banner (Setup / In progress · Round X of Y / Finished).
   - Current-round pairings: board number, both names, colors, who-plays-whom.
   - Past-round pairings viewable (read-only round switcher).
   - Standings table: Rank, Player, per-round marks, Points, Buchholz, SB.
   - Champion banner when finished.
   - **Realtime:** auto re-renders when the organizer writes. No manual refresh.
   - Pre-start: "Not started yet" + sign-up count.

3. **`/admin` — Organizer (passcode-gated)**
   - Passcode prompt; on success, unlocked state stored in `sessionStorage`.
   - **Attendance:** checklist of signed-up players to mark who showed; can
     delete bogus sign-ups; set title + number of rounds.
   - **Start tournament:** copies selected sign-ups into the tournament player
     list and generates round 1.
   - **Run:** the pairings + result-entry + next-round flow ported from the
     prototype (tap 1–0 / ½ / 0–1, advance rounds, add extra round, reset).

## Data Model (Supabase)

Single-tournament model. Two tables.

```sql
-- the one active tournament; row id is a fixed singleton key
create table tournament (
  id          text primary key default 'current',
  title       text not null default 'Swiss Tournament',
  rounds      int  not null default 4,
  status      text not null default 'setup',  -- 'setup' | 'active' | 'finished'
  state       jsonb not null default '{}'::jsonb, -- {players, schedule, viewRound}
  updated_at  timestamptz not null default now()
);

create table signups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);
```

- `state` reuses the prototype's shape (`players`, `schedule`, `viewRound`) so
  the engine logic ports unchanged. Storing the schedule as one JSON blob keeps
  the battle-tested engine intact; the DB is just sync + visibility.
- Realtime is enabled on both tables.

## Architecture / Modules

- **`lib/swiss.ts`** — pure engine ported from the prototype:
  `deriveData`, `standings`, `generateRound`, `assignColors`, `matchPairs`,
  `roundComplete`, `allDone`, tiebreaks (Buchholz, Sonneborn–Berger). No DOM,
  no I/O — fully unit-testable.
- **`lib/supabase.ts`** — client init + typed helpers:
  `getTournament`, `saveState`, `listSignups`, `addSignup`, `removeSignup`,
  `subscribeTournament`, `subscribeSignups`.
- **`app/page.tsx`** (sign-up), **`app/results/page.tsx`**, **`app/admin/page.tsx`**
  — thin UI over the helpers + engine.
- **Shared UI:** scoreboard components (StandingsTable, PairingBoard, StatusPill,
  RoundNav) styled for the dark broadcast theme.

## Data Flow

1. Player signs up → `addSignup` → row inserted → all viewers' sign-up lists
   update via realtime.
2. Organizer starts → selected names written into `tournament.state.players`,
   `generateRound()` runs, `status='active'`, `saveState`.
3. Organizer enters a result → engine mutates `state` → `saveState` → realtime
   pushes the new `state` to `/results` viewers, who re-render.
4. Last round complete → `status='finished'` → champion banner.

## Design / Visual

Dark **broadcast scoreboard** aesthetic, mobile-first:

- Deep charcoal background; one vivid electric accent (e.g. lime or amber).
- Large tabular-numeric type for scores/boards; condensed mono for labels.
- Subtle **glow/flash** animation on a result when it updates live.
- High contrast for phone legibility in varied lighting.
- Sticky bottom tab bar on mobile for the public pages; large tap targets.
- Respects `prefers-reduced-motion`.

## Error Handling

- **Supabase unreachable:** banner shown; organizer can keep working against
  in-memory state and a `localStorage` cache, syncing on reconnect.
- **Conflict resolution:** last-write-wins. Safe because there is exactly one
  organizer editing.
- **Validation:** trim/empty-name guard on sign-up; enforce 7–16 players to
  start (matching the prototype's Swiss constraints); clamp rounds to
  `1..players-1`.

## Security

- Passcode gates the organizer UI (compared against an env-provided value).
- Supabase Row Level Security: enable RLS; allow public `insert` on `signups`
  and `select` on both tables; restrict `tournament` writes as far as the
  no-auth model permits (documented trade-off — see Roles & Access).
- No personal data beyond a chosen display name.

## Testing

- Unit tests for `lib/swiss.ts`:
  - Pairing avoids rematches when possible; relaxes when forced.
  - Bye assigned to lowest scorer without a prior bye; bye = +1 point.
  - Color balance / alternation logic.
  - Standings ordering and Buchholz / SB tiebreak math.
  - Round-complete / all-done detection.
- Light integration check of Supabase helpers against a test project (optional,
  manual) — core correctness lives in the pure engine tests.

## Out of Scope (YAGNI)

Accounts/login, multiple/archived tournaments, player ratings, manual pairing
overrides, time control / clock, payments, email/notifications.
