# Swiss Tournament App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **⚠️ NEVER run `git commit` or `git push`.** The user commits manually. "Checkpoint" markers indicate good moments for the *user* to commit — do not commit for them.

**Goal:** A mobile-first Next.js + Supabase web app to run one Swiss-system chess tournament: remote name-only sign-up, organizer-run pairings/scoring, and a public live results board.

**Architecture:** Next.js App Router (TypeScript) with three routes — `/` (sign-up), `/results` (public live board), `/admin` (passcode-gated organizer). A pure, unit-tested Swiss engine (`lib/swiss.ts`, ported from the existing `index.html` prototype) holds all pairing/standings logic. Supabase stores one `tournament` row (full engine state as JSONB) plus a `signups` table, and pushes realtime updates to viewers. No custom server code.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Supabase (`@supabase/supabase-js`), Vitest for engine tests, Vercel for hosting, dark "broadcast scoreboard" CSS theme.

---

## File Structure

```
chess-swiss/
  .env.local                         # Supabase URL/key + organizer passcode (NOT committed)
  .env.example                       # template
  package.json
  next.config.ts
  tsconfig.json
  vitest.config.ts
  supabase/schema.sql                # SQL the user pastes into Supabase
  app/
    layout.tsx                       # root layout, theme, mobile tab bar
    globals.css                      # dark broadcast theme tokens + base styles
    page.tsx                         # Sign-up (public)
    results/page.tsx                 # Public live board
    admin/page.tsx                   # Organizer (passcode-gated)
  lib/
    swiss.ts                         # pure Swiss engine (ported)
    swiss.test.ts                    # engine unit tests (Vitest)
    types.ts                         # shared types (Player, Game, TournamentState…)
    supabase.ts                      # client + typed data helpers
  components/
    StatusPill.tsx                   # Setup / In progress / Finished badge
    StandingsTable.tsx               # ranked table w/ tiebreaks
    PairingBoard.tsx                 # one board (two seats, colors, result)
    RoundNav.tsx                     # round switcher
    Glow.tsx                         # flash-on-update wrapper (reduced-motion aware)
```

**Responsibilities:** `lib/swiss.ts` is pure logic (no DOM, no I/O). `lib/supabase.ts` is the only file that talks to the network. `components/*` are presentational. Pages compose helpers + engine + components.

---

## Task 1: Scaffold Next.js project

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`

- [ ] **Step 1: Create the Next.js app in the existing folder**

The project folder `chess-swiss/` already exists with a `docs/` and `.git/`. Scaffold into it without overwriting:

Run:
```bash
cd /Users/aka_risu/chess-swiss
npx create-next-app@latest . --typescript --app --no-tailwind --no-src-dir --eslint --import-alias "@/*" --use-npm
```
When prompted that the directory is not empty, choose to continue (it keeps `docs/` and `.git/`).
Expected: `app/`, `package.json`, `tsconfig.json`, `next.config.ts` created.

- [ ] **Step 2: Verify dev server boots**

Run:
```bash
npm run dev
```
Expected: server starts on http://localhost:3000 with the default Next page. Stop it with Ctrl-C.

- [ ] **Step 3: Add the Supabase client + Vitest dev deps**

Run:
```bash
npm install @supabase/supabase-js
npm install -D vitest @vitejs/plugin-react jsdom
```
Expected: installs succeed, `package.json` updated.

- [ ] **Step 4: Add the test script**

In `package.json`, add to `"scripts"`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

_Checkpoint: good moment for the user to commit the scaffold._

---

## Task 2: Shared types

**Files:**
- Create: `lib/types.ts`

- [ ] **Step 1: Write the types**

```typescript
// lib/types.ts
export type Id = string;

export interface Player {
  id: Id;
  name: string;
}

/** Game result: null = unreported, 'w' white win, 'b' black win, 'd' draw, 'bye' */
export type GameResult = null | "w" | "b" | "d" | "bye";

export interface Game {
  w: Id;
  b: Id | null; // null => bye
  res: GameResult;
}

export type Round = Game[];

/** Full engine state — stored verbatim in tournament.state JSONB */
export interface TournamentState {
  players: Player[];
  schedule: Round[];
  viewRound: number;
}

export type TournamentStatus = "setup" | "active" | "finished";

/** The single tournament row */
export interface Tournament {
  id: string; // always 'current'
  title: string;
  rounds: number;
  status: TournamentStatus;
  state: TournamentState;
  updated_at: string;
}

export interface Signup {
  id: string;
  name: string;
  created_at: string;
}

/** Per-player derived standings data (computed, never stored) */
export interface Derived {
  id: Id;
  score: number;
  opp: Set<Id>;
  oppList: Id[];
  results: Record<number, string>; // round index -> '+','-','=','bye'
  white: number;
  black: number;
  last: "w" | "b" | null;
  byes: number;
  beat: Id[];
  drew: Id[];
  buch: number; // Buchholz
  sb: number; // Sonneborn–Berger
}

export interface StandingRow extends Derived {
  name: string;
}

export function emptyState(): TournamentState {
  return { players: [], schedule: [], viewRound: 1 };
}
```

_No test needed — types only._

---

## Task 3: Swiss engine — standings & tiebreaks (TDD)

**Files:**
- Create: `lib/swiss.ts`, `lib/swiss.test.ts`, `vitest.config.ts`

- [ ] **Step 1: Create the Vitest config**

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
});
```

- [ ] **Step 2: Write failing tests for deriveData + standings**

```typescript
// lib/swiss.test.ts
import { describe, it, expect } from "vitest";
import { deriveData, standings } from "./swiss";
import type { TournamentState } from "./types";

function s(players: string[], schedule: TournamentState["schedule"]): TournamentState {
  return { players: players.map((id) => ({ id, name: id.toUpperCase() })), schedule, viewRound: 1 };
}

describe("deriveData", () => {
  it("scores a white win, black loss, and a draw", () => {
    const st = s(["a", "b", "c", "d"], [
      [
        { w: "a", b: "b", res: "w" },
        { w: "c", b: "d", res: "d" },
      ],
    ]);
    const d = deriveData(st);
    expect(d.a.score).toBe(1);
    expect(d.b.score).toBe(0);
    expect(d.c.score).toBe(0.5);
    expect(d.d.score).toBe(0.5);
    expect(d.a.white).toBe(1);
    expect(d.b.black).toBe(1);
    expect(d.a.opp.has("b")).toBe(true);
  });

  it("awards a bye worth 1 point and records it", () => {
    const st = s(["a", "b", "c"], [[{ w: "a", b: "b", res: "w" }, { w: "c", b: null, res: "bye" }]]);
    const d = deriveData(st);
    expect(d.c.score).toBe(1);
    expect(d.c.byes).toBe(1);
    expect(d.c.results[0]).toBe("bye");
  });

  it("computes Buchholz and Sonneborn–Berger", () => {
    // a beat b, a drew c. b lost to a. c drew a and beat d.
    const st = s(["a", "b", "c", "d"], [
      [{ w: "a", b: "b", res: "w" }, { w: "c", b: "d", res: "w" }],
      [{ w: "a", b: "c", res: "d" }, { w: "b", b: "d", res: "d" }],
    ]);
    const d = deriveData(st);
    // scores: a=1.5, b=0.5, c=1.5, d=0.5
    expect(d.a.score).toBe(1.5);
    expect(d.c.score).toBe(1.5);
    // a's opponents: b(0.5)+c(1.5)=2.0 Buchholz
    expect(d.a.buch).toBe(2.0);
    // a's SB: beat b(0.5) + 0.5*drew c(1.5) = 0.5 + 0.75 = 1.25
    expect(d.a.sb).toBe(1.25);
  });
});

describe("standings", () => {
  it("ranks by score, then Buchholz, then SB, then name", () => {
    const st = s(["a", "b"], [[{ w: "a", b: "b", res: "w" }]]);
    const rows = standings(st);
    expect(rows[0].id).toBe("a");
    expect(rows[1].id).toBe("b");
  });
});
```

- [ ] **Step 3: Run tests, verify they fail**

Run: `npm test`
Expected: FAIL — `deriveData`/`standings` not exported.

- [ ] **Step 4: Implement deriveData + standings**

```typescript
// lib/swiss.ts
import type { Derived, Id, StandingRow, TournamentState } from "./types";

/** Recompute all derived data from the schedule. uptoRound: include rounds [0, uptoRound). */
export function deriveData(state: TournamentState, uptoRound?: number): Record<Id, Derived> {
  const limit = uptoRound == null ? state.schedule.length : uptoRound;
  const d: Record<Id, Derived> = {};
  for (const p of state.players) {
    d[p.id] = {
      id: p.id, score: 0, opp: new Set(), oppList: [], results: {},
      white: 0, black: 0, last: null, byes: 0, beat: [], drew: [], buch: 0, sb: 0,
    };
  }
  for (let r = 0; r < limit; r++) {
    const games = state.schedule[r] || [];
    for (const g of games) {
      if (g.b === null || g.res === "bye") {
        const W = d[g.w];
        if (W) { W.byes++; W.results[r] = "bye"; if (g.res === "bye") W.score += 1; }
        continue;
      }
      const W = d[g.w], B = d[g.b];
      if (!W || !B) continue;
      W.opp.add(g.b); B.opp.add(g.w);
      W.oppList.push(g.b); B.oppList.push(g.w);
      W.white++; B.black++; W.last = "w"; B.last = "b";
      if (g.res === "w") { W.score += 1; W.results[r] = "+"; B.results[r] = "-"; W.beat.push(g.b); }
      else if (g.res === "b") { B.score += 1; B.results[r] = "+"; W.results[r] = "-"; B.beat.push(g.w); }
      else if (g.res === "d") { W.score += 0.5; B.score += 0.5; W.results[r] = "="; B.results[r] = "="; W.drew.push(g.b); B.drew.push(g.w); }
    }
  }
  for (const p of Object.values(d)) {
    p.buch = p.oppList.reduce((sum, oid) => sum + (d[oid] ? d[oid].score : 0), 0);
    p.sb =
      p.beat.reduce((sum, oid) => sum + (d[oid] ? d[oid].score : 0), 0) +
      p.drew.reduce((sum, oid) => sum + (d[oid] ? d[oid].score : 0) * 0.5, 0);
  }
  return d;
}

export function standings(state: TournamentState): StandingRow[] {
  const d = deriveData(state);
  const arr: StandingRow[] = state.players.map((p) => ({ ...d[p.id], name: p.name }));
  arr.sort((a, b) => b.score - a.score || b.buch - a.buch || b.sb - a.sb || a.name.localeCompare(b.name));
  return arr;
}
```

- [ ] **Step 5: Run tests, verify they pass**

Run: `npm test`
Expected: PASS (all deriveData + standings tests green).

_Checkpoint._

---

## Task 4: Swiss engine — pairing, byes, colors (TDD)

**Files:**
- Modify: `lib/swiss.ts`, `lib/swiss.test.ts`

- [ ] **Step 1: Write failing tests for pairing + byes + colors + completion**

Append to `lib/swiss.test.ts`:
```typescript
import { generateRound, roundComplete, allDone, matchPairs, assignColors } from "./swiss";

const seq = (vals: number[]) => { let i = 0; return () => vals[i++ % vals.length]; };

describe("matchPairs", () => {
  it("avoids a rematch when an alternative exists", () => {
    const st = s(["a", "b", "c", "d"], [[{ w: "a", b: "b", res: "w" }, { w: "c", b: "d", res: "w" }]]);
    const d = deriveData(st);
    const list = st.players.slice();
    const pairs = matchPairs(list, d, false);
    expect(pairs).not.toBeNull();
    const ids = pairs!.map((p) => [p[0].id, p[1].id].sort().join("-"));
    expect(ids).not.toContain("a-b");
    expect(ids).not.toContain("c-d");
  });

  it("returns null when no rematch-free pairing exists and rematch disallowed", () => {
    // only two players who already played -> impossible without rematch
    const st = s(["a", "b"], [[{ w: "a", b: "b", res: "w" }]]);
    const d = deriveData(st);
    expect(matchPairs(st.players.slice(), d, false)).toBeNull();
    expect(matchPairs(st.players.slice(), d, true)).not.toBeNull();
  });
});

describe("generateRound", () => {
  it("round 1 pairs everyone into boards (even field)", () => {
    const st = s(["a", "b", "c", "d"], []);
    const round = generateRound(st, seq([0]));
    expect(round.filter((g) => g.b !== null).length).toBe(2);
    expect(round.some((g) => g.res === "bye")).toBe(false);
  });

  it("assigns a bye to a player when the field is odd, worth nothing until scored as bye", () => {
    const st = s(["a", "b", "c"], []);
    const round = generateRound(st, seq([0]));
    const bye = round.find((g) => g.b === null);
    expect(bye).toBeDefined();
    expect(bye!.res).toBe("bye");
  });

  it("does not give a second bye to a player who already had one", () => {
    const st = s(["a", "b", "c"], [[{ w: "a", b: "b", res: "w" }, { w: "c", b: null, res: "bye" }]]);
    st.schedule.push(generateRound(st, seq([0])));
    const round2 = st.schedule[1];
    const bye = round2.find((g) => g.b === null);
    if (bye) expect(bye.w).not.toBe("c");
  });
});

describe("assignColors", () => {
  it("gives white to the player with fewer prior whites", () => {
    const st = s(["a", "b"], [[{ w: "a", b: "x", res: "w" }]]); // a already played white once
    const d = deriveData(st);
    const game = assignColors(st.players[0], st.players[1], d);
    expect(game.b).toBe("a"); // a should now get black
    expect(game.w).toBe("b");
  });
});

describe("roundComplete / allDone", () => {
  it("roundComplete is false until every game has a result", () => {
    const st = s(["a", "b", "c", "d"], [[{ w: "a", b: "b", res: "w" }, { w: "c", b: "d", res: null }]]);
    expect(roundComplete(st, 0)).toBe(false);
    st.schedule[0][1].res = "d";
    expect(roundComplete(st, 0)).toBe(true);
  });

  it("allDone requires planned rounds reached and last round complete", () => {
    const st = s(["a", "b"], [[{ w: "a", b: "b", res: "w" }]]);
    expect(allDone(st, 1)).toBe(true);
    expect(allDone(st, 2)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests, verify the new ones fail**

Run: `npm test`
Expected: FAIL — `generateRound`/`matchPairs`/`assignColors`/`roundComplete`/`allDone` not exported.

- [ ] **Step 3: Implement pairing engine**

Append to `lib/swiss.ts`:
```typescript
import type { Game, Player, Round } from "./types";

type Rng = () => number;

function shuffle<T>(a: T[], rng: Rng): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Recursive matcher: pair list[0] with nearest legal partner, backtrack. */
export function matchPairs(
  list: Player[],
  d: Record<Id, Derived>,
  allowRematch: boolean,
): [Player, Player][] | null {
  if (list.length === 0) return [];
  const a = list[0];
  for (let j = 1; j < list.length; j++) {
    const b = list[j];
    if (allowRematch || !d[a.id].opp.has(b.id)) {
      const rest = list.slice(1);
      rest.splice(j - 1, 1);
      const sub = matchPairs(rest, d, allowRematch);
      if (sub !== null) return [[a, b], ...sub];
    }
  }
  return null;
}

export function assignColors(a: Player, b: Player, d: Record<Id, Derived>): Game {
  const balA = d[a.id].white - d[a.id].black;
  const balB = d[b.id].white - d[b.id].black;
  let wp: Player, bp: Player;
  if (balA < balB) { wp = a; bp = b; }
  else if (balB < balA) { wp = b; bp = a; }
  else {
    if (d[a.id].last === "b" && d[b.id].last !== "b") { wp = a; bp = b; }
    else if (d[b.id].last === "b" && d[a.id].last !== "b") { wp = b; bp = a; }
    else { wp = a; bp = b; }
  }
  return { w: wp.id, b: bp.id, res: null };
}

/** Build the next round's games. Pure: returns the Round; caller appends to schedule. */
export function generateRound(state: TournamentState, rng: Rng = Math.random): Round {
  const roundIndex = state.schedule.length;
  const d = deriveData(state);
  let pool: Player[];
  if (roundIndex === 0) {
    pool = shuffle(state.players.slice(), rng);
  } else {
    pool = state.players.slice().sort((a, b) => {
      const A = d[a.id], B = d[b.id];
      return B.score - A.score || B.buch - A.buch || rng() - 0.5;
    });
  }
  let bye: Player | null = null;
  if (pool.length % 2 === 1) {
    for (let i = pool.length - 1; i >= 0; i--) {
      if (d[pool[i].id].byes === 0) { bye = pool.splice(i, 1)[0]; break; }
    }
    if (!bye) bye = pool.pop()!;
  }
  let pairs = matchPairs(pool, d, false);
  if (pairs === null) pairs = matchPairs(pool, d, true);
  if (pairs === null) pairs = [];
  const games: Round = pairs.map(([a, b]) => assignColors(a, b, d));
  if (bye) games.push({ w: bye.id, b: null, res: "bye" });
  return games;
}

export function roundComplete(state: TournamentState, r: number): boolean {
  const g = state.schedule[r];
  if (!g) return false;
  return g.every((x) => x.res !== null);
}

export function allDone(state: TournamentState, plannedRounds: number): boolean {
  return state.schedule.length >= plannedRounds && roundComplete(state, state.schedule.length - 1);
}

export function recommendedRounds(n: number): number {
  return n > 0 ? Math.max(3, Math.ceil(Math.log2(n))) : 4;
}

export function clampRounds(n: number, playerCount: number): number {
  const max = Math.max(1, playerCount - 1);
  return Math.min(Math.max(Math.trunc(n) || 0, 1), max);
}
```

- [ ] **Step 4: Run tests, verify all pass**

Run: `npm test`
Expected: PASS — all engine tests green.

_Checkpoint._

---

## Task 5: Supabase schema (hand to user)

**Files:**
- Create: `supabase/schema.sql`

- [ ] **Step 1: Write the schema file**

```sql
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

-- Row Level Security (no-auth public app; see spec Security section for trade-offs)
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
```

- [ ] **Step 2: Instruct the user (manual)**

Tell the user: open Supabase → SQL Editor → paste `supabase/schema.sql` → Run. Confirm `tournament` and `signups` appear under Table Editor and that Realtime is on for both.

_No automated test (external service)._

---

## Task 6: Environment + Supabase client + data helpers

**Files:**
- Create: `.env.local`, `.env.example`, `lib/supabase.ts`

- [ ] **Step 1: Write env files**

`.env.local` (do NOT commit — already in `.gitignore` via Next default):
```
NEXT_PUBLIC_SUPABASE_URL=https://wulwvhmbwkasxyppkrnd.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_5uaM3BvkUEQm4u6dMJY3GQ_8S9U2nIO
NEXT_PUBLIC_ORGANIZER_PASSCODE=knight2026
```

`.env.example`:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_ORGANIZER_PASSCODE=
```

(Tell the user they may change the passcode value to anything they like.)

- [ ] **Step 2: Write the client + helpers**

```typescript
// lib/supabase.ts
"use client";
import { createClient, type RealtimeChannel } from "@supabase/supabase-js";
import type { Signup, Tournament, TournamentState } from "./types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(url, key);

const TID = "current";

export async function getTournament(): Promise<Tournament | null> {
  const { data, error } = await supabase.from("tournament").select("*").eq("id", TID).single();
  if (error) { console.error("getTournament", error); return null; }
  return data as Tournament;
}

export async function saveTournament(
  patch: Partial<Pick<Tournament, "title" | "rounds" | "status" | "state">>,
): Promise<void> {
  const { error } = await supabase
    .from("tournament")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", TID);
  if (error) throw error;
}

export async function saveState(state: TournamentState): Promise<void> {
  return saveTournament({ state });
}

export async function listSignups(): Promise<Signup[]> {
  const { data, error } = await supabase.from("signups").select("*").order("created_at");
  if (error) { console.error("listSignups", error); return []; }
  return (data ?? []) as Signup[];
}

export async function addSignup(name: string): Promise<Signup | null> {
  const { data, error } = await supabase.from("signups").insert({ name }).select().single();
  if (error) { console.error("addSignup", error); return null; }
  return data as Signup;
}

export async function removeSignup(id: string): Promise<void> {
  const { error } = await supabase.from("signups").delete().eq("id", id);
  if (error) throw error;
}

export function subscribeTournament(onChange: () => void): RealtimeChannel {
  return supabase
    .channel("tournament-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "tournament" }, onChange)
    .subscribe();
}

export function subscribeSignups(onChange: () => void): RealtimeChannel {
  return supabase
    .channel("signups-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "signups" }, onChange)
    .subscribe();
}
```

_Checkpoint._

---

## Task 7: Dark broadcast theme + root layout

**Files:**
- Modify: `app/globals.css`, `app/layout.tsx`

- [ ] **Step 1: Replace globals.css with theme tokens + base styles**

```css
/* app/globals.css */
:root {
  --bg: #0b0d10;
  --bg-2: #12151b;
  --surface: #171b22;
  --surface-2: #1e232c;
  --line: #2a313c;
  --ink: #eef2f6;
  --ink-soft: #9aa6b2;
  --ink-dim: #5d6875;
  --accent: #c6f73f;        /* electric lime */
  --accent-2: #ffb020;      /* amber */
  --win: #c6f73f;
  --loss: #5d6875;
  --live: #ff4d4d;
  --mono: 'SFMono-Regular','SF Mono','JetBrains Mono',Menlo,Consolas,monospace;
  --sans: 'Inter','Avenir Next','Segoe UI',system-ui,-apple-system,sans-serif;
  --radius: 12px;
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  background:
    radial-gradient(circle at 12% -5%, rgba(198,247,63,.08), transparent 38%),
    radial-gradient(circle at 92% 0%, rgba(255,176,32,.06), transparent 42%),
    var(--bg);
  color: var(--ink);
  font-family: var(--sans);
  font-size: 16px;
  line-height: 1.4;
  -webkit-font-smoothing: antialiased;
  min-height: 100dvh;
}
.wrap { max-width: 640px; margin: 0 auto; padding: 18px 16px 96px; }

h1, h2 { letter-spacing: -0.01em; }
.mast { display: flex; align-items: center; justify-content: space-between; padding: 8px 0 16px; }
.mast .title { font-size: 20px; font-weight: 700; }
.kicker { font-family: var(--mono); font-size: 11px; letter-spacing: .22em; text-transform: uppercase; color: var(--ink-dim); }
.section { font-size: 22px; font-weight: 700; margin: 4px 0 2px; }
.muted { color: var(--ink-soft); font-size: 14px; }
.num { font-family: var(--mono); font-variant-numeric: tabular-nums; }

input, button, select { font-family: inherit; font-size: 16px; }
input[type=text], input[type=number] {
  width: 100%; background: var(--surface); color: var(--ink);
  border: 1px solid var(--line); border-radius: 10px; padding: 14px; outline: none;
}
input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(198,247,63,.15); }

.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  background: var(--accent); color: #0b0d10; border: none; border-radius: 10px;
  padding: 14px 18px; font-weight: 700; cursor: pointer; min-height: 48px;
  text-transform: uppercase; letter-spacing: .04em; font-size: 13px;
}
.btn:active { transform: translateY(1px); }
.btn:disabled { opacity: .4; cursor: not-allowed; }
.btn.ghost { background: transparent; color: var(--ink); border: 1px solid var(--line); }
.btn.amber { background: var(--accent-2); }
.btn.danger { background: transparent; border: 1px solid var(--live); color: var(--live); }
.btn.block { width: 100%; }

.card { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 14px; }
.row { display: flex; gap: 10px; align-items: center; }
.grow { flex: 1; }
.stack { display: flex; flex-direction: column; gap: 10px; }

/* bottom tab bar (mobile) */
.tabbar {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 30;
  display: flex; background: rgba(11,13,16,.92); backdrop-filter: blur(10px);
  border-top: 1px solid var(--line);
}
.tabbar a {
  flex: 1; text-align: center; padding: 12px 6px 16px; text-decoration: none;
  color: var(--ink-dim); font-family: var(--mono); font-size: 11px; letter-spacing: .12em; text-transform: uppercase;
}
.tabbar a.active { color: var(--accent); }

.pill { font-family: var(--mono); font-size: 11px; letter-spacing: .12em; text-transform: uppercase;
  border: 1px solid var(--line); border-radius: 999px; padding: 5px 11px; color: var(--ink-soft); }
.pill.live { color: var(--live); border-color: var(--live); }
.pill.live::before { content: '● '; }

.empty { border: 1px dashed var(--line); border-radius: var(--radius); padding: 40px 20px; text-align: center; color: var(--ink-soft); }
.banner { border: 1px solid var(--accent); border-radius: var(--radius); padding: 18px; text-align: center; background: rgba(198,247,63,.06); }
.banner .v { font-size: 26px; font-weight: 800; margin-top: 4px; }

@keyframes flash { 0% { background: rgba(198,247,63,.35); } 100% { background: transparent; } }
.flash { animation: flash .9s ease-out; }
@media (prefers-reduced-motion: reduce) { .flash { animation: none; } }
```

- [ ] **Step 2: Write the root layout with tab bar**

```tsx
// app/layout.tsx
import "./globals.css";
import type { Metadata, Viewport } from "next";
import { TabBar } from "@/components/TabBar";

export const metadata: Metadata = { title: "Swiss Tournament", description: "Live chess tournament" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0b0d10" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="wrap">{children}</div>
        <TabBar />
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Write the TabBar component**

```tsx
// components/TabBar.tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/", label: "Sign up" },
  { href: "/results", label: "Results" },
  { href: "/admin", label: "Organizer" },
];

export function TabBar() {
  const path = usePathname();
  return (
    <nav className="tabbar">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} className={path === t.href ? "active" : ""}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
```

- [ ] **Step 4: Verify it builds**

Run: `npm run dev` and open http://localhost:3000 — expect dark background + bottom tab bar (pages still default/empty is fine). Stop server.

_Checkpoint._

---

## Task 8: Presentational components

**Files:**
- Create: `components/StatusPill.tsx`, `components/StandingsTable.tsx`, `components/PairingBoard.tsx`, `components/RoundNav.tsx`

- [ ] **Step 1: StatusPill**

```tsx
// components/StatusPill.tsx
import type { TournamentStatus } from "@/lib/types";

export function StatusPill({ status, round, rounds }: { status: TournamentStatus; round?: number; rounds?: number }) {
  if (status === "setup") return <span className="pill">Setup</span>;
  if (status === "finished") return <span className="pill">Finished</span>;
  return <span className="pill live">Round {round} / {rounds}</span>;
}
```

- [ ] **Step 2: PairingBoard**

```tsx
// components/PairingBoard.tsx
"use client";
import type { Game } from "@/lib/types";

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export function PairingBoard({
  game, board, nameOf, wpts, bpts, editable, onResult,
}: {
  game: Game; board: number; nameOf: (id: string) => string;
  wpts: number; bpts: number; editable: boolean;
  onResult?: (res: "w" | "d" | "b") => void;
}) {
  if (game.b === null) {
    return (
      <div className="card" style={{ borderStyle: "dashed", borderColor: "var(--accent-2)", marginBottom: 9 }}>
        <span className="num" style={{ color: "var(--accent-2)" }}>BYE</span> — <b>{nameOf(game.w)}</b> sits out (+1)
      </div>
    );
  }
  const seat = (id: string, color: "w" | "b", pts: number, won: boolean, lost: boolean) => (
    <div className="row" style={{ justifyContent: "space-between", padding: "6px 0" }}>
      <span className="row" style={{ gap: 10 }}>
        <span style={{
          width: 14, height: 14, borderRadius: "50%", flex: "none",
          background: color === "w" ? "var(--ink)" : "transparent",
          border: "2px solid var(--ink)",
        }} />
        <span style={{ fontWeight: won ? 800 : 500, color: lost ? "var(--loss)" : "var(--ink)" }}>{nameOf(id)}</span>
      </span>
      <span className="num muted">{fmt(pts)}</span>
    </div>
  );
  const btn = (code: "w" | "d" | "b", label: string) => (
    <button
      onClick={editable && onResult ? () => onResult(code) : undefined}
      disabled={!editable}
      className="num"
      style={{
        flex: 1, minHeight: 44, border: "1px solid var(--line)", background: game.res === code ? "var(--accent)" : "var(--surface-2)",
        color: game.res === code ? "#0b0d10" : "var(--ink-soft)", fontWeight: game.res === code ? 800 : 500,
        borderRadius: 8,
      }}
    >{label}</button>
  );
  return (
    <div className="card" style={{ marginBottom: 9 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="num" style={{ color: "var(--accent)" }}>Board {board}</span>
      </div>
      {seat(game.w, "w", wpts, game.res === "w", game.res === "b")}
      {seat(game.b, "b", bpts, game.res === "b", game.res === "w")}
      <div className="row" style={{ gap: 6, marginTop: 8 }}>
        {btn("w", "1–0")}{btn("d", "½")}{btn("b", "0–1")}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: RoundNav**

```tsx
// components/RoundNav.tsx
"use client";

export function RoundNav({
  count, current, done, onPick,
}: { count: number; current: number; done: (i: number) => boolean; onPick: (i: number) => void }) {
  return (
    <div className="row" style={{ gap: 6, flexWrap: "wrap", margin: "8px 0 16px" }}>
      {Array.from({ length: count }, (_, i) => {
        const active = i === current;
        return (
          <button key={i} onClick={() => onPick(i)} className="num"
            style={{
              width: 38, height: 38, borderRadius: "50%",
              border: `1px solid ${done(i) ? "var(--accent)" : "var(--line)"}`,
              background: active ? "var(--accent)" : "transparent",
              color: active ? "#0b0d10" : done(i) ? "var(--accent)" : "var(--ink-soft)",
              fontWeight: active ? 800 : 500,
            }}>{i + 1}</button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: StandingsTable**

```tsx
// components/StandingsTable.tsx
import type { StandingRow } from "@/lib/types";

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export function StandingsTable({ rows, playedRounds, champion }: { rows: StandingRow[]; playedRounds: number; champion: boolean }) {
  const mark = (m?: string) =>
    m === "+" ? "1" : m === "-" ? "0" : m === "=" ? "½" : m === "bye" ? "B" : "·";
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 15 }}>
        <thead>
          <tr className="num" style={{ color: "var(--ink-dim)", fontSize: 11 }}>
            <th style={{ textAlign: "right", padding: 8 }}>#</th>
            <th style={{ textAlign: "left", padding: 8 }}>Player</th>
            {Array.from({ length: playedRounds }, (_, i) => <th key={i} style={{ padding: 6 }}>R{i + 1}</th>)}
            <th style={{ padding: 8 }}>Pts</th><th style={{ padding: 8 }}>Buch</th><th style={{ padding: 8 }}>SB</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p, i) => (
            <tr key={p.id} style={{ borderTop: "1px solid var(--line)", background: champion && i === 0 ? "rgba(198,247,63,.10)" : undefined }}>
              <td className="num" style={{ textAlign: "right", padding: 8, color: "var(--accent)" }}>{i + 1}</td>
              <td style={{ padding: 8, fontWeight: champion && i === 0 ? 800 : 500 }}>{p.name}{champion && i === 0 ? " ♛" : ""}</td>
              {Array.from({ length: playedRounds }, (_, r) => (
                <td key={r} className="num" style={{ textAlign: "center", padding: 6, color: "var(--ink-soft)" }}>{mark(p.results[r])}</td>
              ))}
              <td className="num" style={{ textAlign: "center", padding: 8, fontWeight: 800, color: "var(--accent)" }}>{fmt(p.score)}</td>
              <td className="num" style={{ textAlign: "center", padding: 8, color: "var(--ink-soft)" }}>{fmt(p.buch)}</td>
              <td className="num" style={{ textAlign: "center", padding: 8, color: "var(--ink-soft)" }}>{fmt(p.sb)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

_Checkpoint._

---

## Task 9: Sign-up page (`/`)

**Files:**
- Create: `app/page.tsx`

- [ ] **Step 1: Implement the sign-up page**

```tsx
// app/page.tsx
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { addSignup, getTournament, listSignups, removeSignup, subscribeSignups, subscribeTournament } from "@/lib/supabase";
import type { Signup, TournamentStatus } from "@/lib/types";

const MINE_KEY = "swiss_my_signups";
const getMine = (): string[] => { try { return JSON.parse(localStorage.getItem(MINE_KEY) || "[]"); } catch { return []; } };
const setMine = (ids: string[]) => localStorage.setItem(MINE_KEY, JSON.stringify(ids));

export default function SignupPage() {
  const [name, setName] = useState("");
  const [signups, setSignups] = useState<Signup[]>([]);
  const [status, setStatus] = useState<TournamentStatus>("setup");
  const [mine, setMineState] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setSignups(await listSignups());
    const t = await getTournament();
    if (t) setStatus(t.status);
  };
  useEffect(() => {
    setMineState(getMine());
    refresh();
    const a = subscribeSignups(refresh);
    const b = subscribeTournament(refresh);
    return () => { a.unsubscribe(); b.unsubscribe(); };
  }, []);

  const submit = async () => {
    const n = name.trim();
    if (!n || busy) return;
    setBusy(true);
    const row = await addSignup(n);
    setBusy(false);
    if (row) {
      const next = [...getMine(), row.id]; setMine(next); setMineState(next);
      setName("");
    }
  };
  const withdraw = async (id: string) => {
    await removeSignup(id);
    const next = getMine().filter((x) => x !== id); setMine(next); setMineState(next);
  };

  if (status !== "setup") {
    return (
      <>
        <div className="mast"><span className="kicker">Swiss Tournament</span></div>
        <div className="empty">
          Sign-up is closed — the tournament has started.<br />
          <Link className="btn" style={{ marginTop: 14 }} href="/results">View live results →</Link>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="mast"><span className="kicker">Swiss Tournament</span><span className="pill">Sign-up open</span></div>
      <h2 className="section">Sign up to play</h2>
      <p className="muted">Enter your name to join the next tournament. No account needed.</p>
      <div className="stack" style={{ margin: "16px 0" }}>
        <input type="text" placeholder="Your name" value={name} maxLength={40}
          onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
        <button className="btn block" onClick={submit} disabled={!name.trim() || busy}>Sign me up</button>
      </div>
      <p className="kicker" style={{ marginTop: 18 }}>{signups.length} signed up</p>
      <div className="stack">
        {signups.map((s, i) => (
          <div key={s.id} className="card row" style={{ justifyContent: "space-between" }}>
            <span><span className="num" style={{ color: "var(--accent)", marginRight: 10 }}>{i + 1}</span>{s.name}</span>
            {mine.includes(s.id) && <button className="btn danger" onClick={() => withdraw(s.id)}>Remove</button>}
          </div>
        ))}
        {signups.length === 0 && <div className="empty">No one yet — be the first.</div>}
      </div>
    </>
  );
}
```

- [ ] **Step 2: Manual verify**

Run `npm run dev`, open `/`, sign up a name. Expect it to appear in the list and persist on reload. Open a second browser — the new name appears live (realtime).

_Checkpoint._

---

## Task 10: Results page (`/results`)

**Files:**
- Create: `app/results/page.tsx`

- [ ] **Step 1: Implement the live results page**

```tsx
// app/results/page.tsx
"use client";
import { useEffect, useState } from "react";
import { getTournament, listSignups, subscribeTournament } from "@/lib/supabase";
import { allDone, deriveData, roundComplete, standings } from "@/lib/swiss";
import type { Tournament } from "@/lib/types";
import { StatusPill } from "@/components/StatusPill";
import { StandingsTable } from "@/components/StandingsTable";
import { PairingBoard } from "@/components/PairingBoard";
import { RoundNav } from "@/components/RoundNav";

export default function ResultsPage() {
  const [t, setT] = useState<Tournament | null>(null);
  const [signupCount, setSignupCount] = useState(0);
  const [view, setView] = useState(0);

  const refresh = async () => {
    const tt = await getTournament();
    setT(tt);
    if (tt) setView(Math.max(0, tt.state.schedule.length - 1));
    if (!tt || tt.status === "setup") setSignupCount((await listSignups()).length);
  };
  useEffect(() => { refresh(); const ch = subscribeTournament(refresh); return () => { ch.unsubscribe(); }; }, []);

  if (!t) return <div className="empty">Loading…</div>;
  const nameOf = (id: string) => t.state.players.find((p) => p.id === id)?.name ?? "?";

  if (t.status === "setup") {
    return (
      <>
        <div className="mast"><span className="title">{t.title}</span><StatusPill status="setup" /></div>
        <div className="empty">Not started yet — {signupCount} player{signupCount === 1 ? "" : "s"} signed up.</div>
      </>
    );
  }

  const rows = standings(t.state);
  const done = allDone(t.state, t.rounds);
  const round = t.state.schedule[view] ?? [];
  const d = deriveData(t.state, view); // points entering the viewed round
  let board = 0;

  return (
    <>
      <div className="mast">
        <span className="title">{t.title}</span>
        <StatusPill status={t.status} round={t.state.schedule.length} rounds={t.rounds} />
      </div>

      {done && rows.length > 0 && (
        <div className="banner"><span className="kicker">Champion</span><div className="v">♛ {rows[0].name}</div></div>
      )}

      <h2 className="section">Pairings</h2>
      <RoundNav count={t.state.schedule.length} current={view} done={(i) => roundComplete(t.state, i)} onPick={setView} />
      {round.map((g, gi) => {
        if (g.b !== null) board++;
        return (
          <PairingBoard key={gi} game={g} board={board} nameOf={nameOf}
            wpts={d[g.w]?.score ?? 0} bpts={g.b ? d[g.b]?.score ?? 0 : 0} editable={false} />
        );
      })}

      <h2 className="section" style={{ marginTop: 24 }}>Standings</h2>
      <p className="muted">Points · Buchholz · Sonneborn–Berger</p>
      <StandingsTable rows={rows} playedRounds={t.state.schedule.length} champion={done} />
    </>
  );
}
```

- [ ] **Step 2: Manual verify**

Open `/results` before a tournament starts → "Not started yet". (Full verification after Task 11.)

_Checkpoint._

---

## Task 11: Admin page (`/admin`)

**Files:**
- Create: `app/admin/page.tsx`

- [ ] **Step 1: Implement organizer page (passcode + attendance + run)**

```tsx
// app/admin/page.tsx
"use client";
import { useEffect, useState } from "react";
import {
  getTournament, listSignups, removeSignup, saveTournament, subscribeSignups, subscribeTournament,
} from "@/lib/supabase";
import {
  allDone, clampRounds, deriveData, generateRound, recommendedRounds, roundComplete, standings,
} from "@/lib/swiss";
import type { Signup, Tournament, TournamentState } from "@/lib/types";
import { StatusPill } from "@/components/StatusPill";
import { PairingBoard } from "@/components/PairingBoard";
import { RoundNav } from "@/components/RoundNav";

const PASS = process.env.NEXT_PUBLIC_ORGANIZER_PASSCODE;
const UNLOCK_KEY = "swiss_admin_unlocked";

export default function AdminPage() {
  const [unlocked, setUnlocked] = useState(false);
  const [pass, setPass] = useState("");
  const [t, setT] = useState<Tournament | null>(null);
  const [signups, setSignups] = useState<Signup[]>([]);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [view, setView] = useState(0);

  const refresh = async () => {
    const tt = await getTournament(); setT(tt);
    if (tt) setView(Math.max(0, tt.state.schedule.length - 1));
    setSignups(await listSignups());
  };
  useEffect(() => {
    if (sessionStorage.getItem(UNLOCK_KEY) === "1") setUnlocked(true);
    refresh();
    const a = subscribeTournament(refresh), b = subscribeSignups(refresh);
    return () => { a.unsubscribe(); b.unsubscribe(); };
  }, []);

  if (!unlocked) {
    const tryUnlock = () => {
      if (pass === PASS) { sessionStorage.setItem(UNLOCK_KEY, "1"); setUnlocked(true); }
      else alert("Wrong passcode");
    };
    return (
      <>
        <div className="mast"><span className="kicker">Organizer</span></div>
        <h2 className="section">Enter passcode</h2>
        <div className="stack" style={{ marginTop: 14 }}>
          <input type="text" placeholder="Passcode" value={pass}
            onChange={(e) => setPass(e.target.value)} onKeyDown={(e) => e.key === "Enter" && tryUnlock()} />
          <button className="btn block" onClick={tryUnlock}>Unlock</button>
        </div>
      </>
    );
  }
  if (!t) return <div className="empty">Loading…</div>;
  const nameOf = (id: string) => t.state.players.find((p) => p.id === id)?.name ?? "?";

  // ---- SETUP: pick attendees, set rounds/title, start ----
  if (t.status === "setup") {
    const toggle = (id: string) => {
      const next = new Set(chosen); next.has(id) ? next.delete(id) : next.add(id); setChosen(next);
    };
    const n = chosen.size;
    const start = async () => {
      if (n < 7 || n > 16) return;
      const players = signups.filter((s) => chosen.has(s.id)).map((s) => ({ id: s.id, name: s.name }));
      const state: TournamentState = { players, schedule: [], viewRound: 1 };
      state.schedule.push(generateRound(state));
      state.viewRound = 1;
      await saveTournament({ status: "active", rounds: clampRounds(t.rounds, players.length), state });
    };
    return (
      <>
        <div className="mast"><span className="title">{t.title}</span><StatusPill status="setup" /></div>
        <h2 className="section">Who showed up?</h2>
        <p className="muted">Select attendees from the sign-up list ({n} selected · need 7–16).</p>
        <div className="stack" style={{ margin: "14px 0" }}>
          {signups.map((s) => (
            <div key={s.id} className="card row" style={{ justifyContent: "space-between" }}>
              <label className="row" style={{ gap: 10 }}>
                <input type="checkbox" checked={chosen.has(s.id)} onChange={() => toggle(s.id)} style={{ width: 22, height: 22 }} />
                {s.name}
              </label>
              <button className="btn danger" onClick={() => removeSignup(s.id)}>Delete</button>
            </div>
          ))}
          {signups.length === 0 && <div className="empty">No sign-ups yet.</div>}
        </div>
        <div className="card stack">
          <label className="kicker">Tournament name</label>
          <input type="text" value={t.title} maxLength={40} onChange={(e) => saveTournament({ title: e.target.value })} />
          <label className="kicker">Rounds (suggested {recommendedRounds(n)})</label>
          <input type="number" min={1} max={Math.max(1, n - 1) || 15} value={t.rounds}
            onChange={(e) => saveTournament({ rounds: clampRounds(Number(e.target.value), n || 16) })} />
        </div>
        <button className="btn block amber" style={{ marginTop: 16 }} disabled={n < 7 || n > 16} onClick={start}>
          Start tournament →
        </button>
      </>
    );
  }

  // ---- ACTIVE / FINISHED: enter results, advance rounds ----
  const cur = t.state.schedule.length - 1;
  const isLatest = view === cur;
  const round = t.state.schedule[view] ?? [];
  const d = deriveData(t.state, view);
  const complete = roundComplete(t.state, cur);
  const done = allDone(t.state, t.rounds);

  const setResult = async (gi: number, res: "w" | "d" | "b") => {
    const state: TournamentState = structuredClone(t.state);
    const g = state.schedule[cur][gi];
    if (!g || g.b === null) return;
    g.res = g.res === res ? null : res;
    const finished = allDone(state, t.rounds);
    await saveTournament({ state, status: finished ? "finished" : "active" });
  };
  const nextRound = async () => {
    if (!complete || t.state.schedule.length >= t.rounds) return;
    const state: TournamentState = structuredClone(t.state);
    state.schedule.push(generateRound(state));
    state.viewRound = state.schedule.length;
    await saveTournament({ state, status: "active" });
  };
  const addExtra = async () => {
    if (!complete) return;
    const state: TournamentState = structuredClone(t.state);
    state.schedule.push(generateRound(state));
    state.viewRound = state.schedule.length;
    await saveTournament({ state, rounds: t.rounds + 1, status: "active" });
  };
  const reset = async () => {
    if (!confirm("Start a brand-new tournament? This erases players and results (sign-ups are kept).")) return;
    await saveTournament({ status: "setup", state: { players: [], schedule: [], viewRound: 1 } });
  };

  let board = 0;
  const rows = standings(t.state);
  return (
    <>
      <div className="mast">
        <span className="title">{t.title}</span>
        <StatusPill status={t.status} round={t.state.schedule.length} rounds={t.rounds} />
      </div>
      {done && rows.length > 0 && (
        <div className="banner"><span className="kicker">Champion</span><div className="v">♛ {rows[0].name}</div></div>
      )}
      <h2 className="section">Round {view + 1} <span className="muted">of {t.rounds}</span></h2>
      <RoundNav count={t.state.schedule.length} current={view} done={(i) => roundComplete(t.state, i)} onPick={setView} />
      {!isLatest && <p className="muted">Viewing a past round (read-only).</p>}
      {round.map((g, gi) => {
        if (g.b !== null) board++;
        return (
          <PairingBoard key={gi} game={g} board={board} nameOf={nameOf}
            wpts={d[g.w]?.score ?? 0} bpts={g.b ? d[g.b]?.score ?? 0 : 0}
            editable={isLatest} onResult={(res) => setResult(gi, res)} />
        );
      })}
      <div className="stack" style={{ marginTop: 16 }}>
        {isLatest && complete && t.state.schedule.length < t.rounds && (
          <button className="btn block amber" onClick={nextRound}>Pair round {t.state.schedule.length + 1} →</button>
        )}
        {isLatest && complete && t.state.schedule.length >= t.rounds && (
          <button className="btn block ghost" onClick={addExtra}>Add another round</button>
        )}
        {isLatest && !complete && <button className="btn block" disabled>Enter all results to continue</button>}
        <button className="btn block danger" onClick={reset}>New tournament</button>
      </div>
    </>
  );
}
```

- [ ] **Step 2: End-to-end manual verify**

1. Sign up 8 names on `/`.
2. On `/admin`, unlock with the passcode, select all 8, set rounds, Start.
3. Enter round-1 results; confirm `/results` (second device/tab) updates live and shows correct standings/colors.
4. Pair next rounds through to a champion; confirm the banner appears on `/results`.
5. "New tournament" returns to setup and keeps sign-ups.

_Checkpoint._

---

## Task 12: Final polish & deploy notes

**Files:**
- Modify: `app/page.tsx` (none expected) — verification + deploy only

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS — all engine tests green.

- [ ] **Step 2: Production build check**

Run: `npm run build`
Expected: build succeeds with no type errors.

- [ ] **Step 3: Deploy notes (manual, for the user)**

- Push the repo to GitHub (user does this — never auto-commit/push).
- Import into Vercel; set the three env vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_ORGANIZER_PASSCODE`) in Vercel → Project → Settings → Environment Variables.
- Deploy. Share the base URL for sign-up/results; keep the passcode private for `/admin`.

_Checkpoint — final._

---

## Notes for the implementer

- **Never run `git commit`/`git push`.** Leave changes on disk; the user commits.
- The engine (`lib/swiss.ts`) is the only place with non-trivial logic — keep it pure and fully covered by `lib/swiss.test.ts`.
- All result writes go through `saveTournament`/`saveState`; realtime fan-out is automatic.
- `structuredClone` is used before mutating state so React state and DB writes stay consistent.
- Mobile-first: 48px tap targets, bottom tab bar, `100dvh`, `prefers-reduced-motion` respected.
```
