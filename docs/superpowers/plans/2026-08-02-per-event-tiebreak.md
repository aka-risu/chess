# Per-Event Tiebreak Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a single tournament opt into the Cumulative (progressive) tiebreak instead of Buchholz, leaving every other event unchanged.

**Architecture:** Add a `cum` field to the engine's derived per-player data and an optional `tiebreak` field to `TournamentState`. `standings()` — the single sort point feeding both the archived podium and the history table — chooses its comparator from that field. Absent means Buchholz, so existing behaviour is preserved. A one-off script sets the field on the 2026-08-02 event and recomputes its archived standings.

**Tech Stack:** TypeScript, Next.js 16 (App Router), Vitest, Supabase REST.

## Global Constraints

- `tiebreak` absent MUST mean `"buchholz"`. All 15 existing tests in `lib/swiss.test.ts` must pass **unmodified** — this is the primary evidence the default is preserved.
- Do not change the app-wide default tiebreak.
- Do not add an admin UI picker (explicit non-goal).
- Do not touch the bye/virtual-opponent Buchholz defect (explicitly deferred).
- Buchholz and SB remain fallback tiebreaks under cumulative, so ordering stays deterministic and the sort stays total.
- Target event: history row `2b55e66b-7af4-4a52-8d8b-01b51fe1fb22`; the live `tournament` row shares this `state.uid`.

## File Structure

- `lib/types.ts` — add `Derived.cum`, add `TournamentState.tiebreak`.
- `lib/swiss.ts` — accumulate `cum` in `deriveData`; branch comparator in `standings()`.
- `lib/swiss.test.ts` — new tests appended to the existing describe blocks.
- `components/StandingsTable.tsx` — optional `tiebreak` prop, conditional Cum column.
- `app/history/page.tsx`, `app/results/page.tsx` — pass `tiebreak` through.
- `scripts/set-cumulative-tiebreak.mjs` — one-off data migration.

## Testing note (deviation from spec)

The spec listed a `StandingsTable` render test. There is no component-test setup in this repo: `vitest.config.ts` includes only `lib/**/*.test.ts` with `environment: "node"`, there are no `.test.tsx` files, and `@testing-library/react` is not installed. Standing up that stack for one conditional column is out of proportion. Task 3 is verified by a manual visual check instead. Engine behaviour — which is where the ordering logic actually lives — is fully unit-tested in Tasks 1 and 2.

---

### Task 1: Cumulative score in the engine

**Files:**
- Modify: `lib/types.ts:94-108` (the `Derived` interface)
- Modify: `lib/swiss.ts:11-25` (initialiser), `lib/swiss.ts:28-86` (round loop)
- Test: `lib/swiss.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `Derived.cum: number` — a player's running score after each round, summed across rounds. Task 2's comparator and Task 3's column both read it.

- [ ] **Step 1: Write the failing tests**

Append inside the existing `describe("deriveData", ...)` block in `lib/swiss.test.ts`:

```ts
  it("computes the cumulative (progressive) score", () => {
    const st = s(["a", "b", "c", "d"], [
      [{ w: "a", b: "b", res: "w" }, { w: "c", b: "d", res: "w" }],
      [{ w: "a", b: "c", res: "w" }, { w: "b", b: "d", res: "w" }],
      [{ w: "a", b: "d", res: "b" }, { w: "b", b: "c", res: "w" }],
    ]);
    const d = deriveData(st);
    // running scores -> a: 1,2,2 = 5   b: 0,1,2 = 3
    expect(d.a.cum).toBe(5);
    expect(d.b.cum).toBe(3);
  });

  it("counts a bye toward the cumulative score", () => {
    const st = s(["a", "b", "c"], [
      [{ w: "a", b: "b", res: "w" }, { w: "c", b: null, res: "bye" }],
      [{ w: "a", b: "c", res: "w" }, { w: "b", b: null, res: "bye" }],
    ]);
    const d = deriveData(st);
    // c is on 1 after R1 and still 1 after R2 -> 2
    expect(d.c.cum).toBe(2);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/swiss.test.ts`
Expected: FAIL — `d.a.cum` is `undefined`, not `5`.

- [ ] **Step 3: Add `cum` to the `Derived` interface**

In `lib/types.ts`, inside `interface Derived`, directly after the `sb` line:

```ts
  sb: number; // Sonneborn–Berger
  cum: number; // Cumulative (progressive) score — running score summed per round
```

- [ ] **Step 4: Initialise and accumulate `cum` in `deriveData`**

In `lib/swiss.ts`, add to the initialiser object (after `sb: 0,`):

```ts
      sb: 0,
      cum: 0,
```

Then, at the very end of the `for (let r = 0; r < limit; r++)` round loop — after the
inner `for (const game of round)` loop closes, still inside the round loop:

```ts
    // Cumulative (progressive): add every player's running score after each round.
    for (const p of state.players) {
      const pd = d[p.id];
      if (pd) pd.cum += pd.score;
    }
  }
```

Note: the existing `if (!round) continue;` guard means an unplayed round contributes
nothing, which is correct — no round, no running score to bank.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run lib/swiss.test.ts`
Expected: PASS — 17 tests (15 existing, unmodified, plus 2 new).

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/swiss.ts lib/swiss.test.ts
git commit -m "feat(swiss): compute cumulative (progressive) score"
```

---

### Task 2: Per-event tiebreak selection

**Files:**
- Modify: `lib/types.ts:40-45` (the `TournamentState` interface)
- Modify: `lib/swiss.ts:101-112` (`standings`)
- Test: `lib/swiss.test.ts`

**Interfaces:**
- Consumes: `Derived.cum` from Task 1.
- Produces: `TournamentState.tiebreak?: "buchholz" | "cumulative"`. Task 3 reads it to decide whether to render the Cum column; Task 4 writes it to the database.

- [ ] **Step 1: Write the failing tests**

Append inside the existing `describe("standings", ...)` block in `lib/swiss.test.ts`:

```ts
  it("defaults to Buchholz when tiebreak is absent", () => {
    const st = s(["a", "b", "c", "d"], [
      [{ w: "a", b: "c", res: "w" }, { w: "b", b: "d", res: "w" }],
      [{ w: "a", b: "d", res: "b" }, { w: "b", b: "c", res: "b" }],
    ]);
    const rows = standings(st);
    expect(st.tiebreak).toBeUndefined();
    // a and b both finish on 1; ordering must follow Buchholz, unchanged behaviour
    expect(rows.map((r) => r.id).slice(0, 2).sort()).toEqual(["a", "b"]);
  });

  it("ranks by cumulative ahead of Buchholz when tiebreak is cumulative", () => {
    // Real regression fixture: the 2026-08-02 event. Omri and Rob both finish 3/4,
    // each losing only to the champion. Buchholz favours Omri (10 v 9); cumulative
    // favours Rob (9 v 8) because Rob led going into the final round.
    const ids = ["max", "omri", "rob", "shruthi", "mayank", "karim", "ty", "finley", "caleb", "ibra", "ian", "curtis"];
    const schedule: TournamentState["schedule"] = [
      [
        { w: "max", b: "ian", res: "w" }, { w: "ty", b: "curtis", res: "w" },
        { w: "mayank", b: "shruthi", res: "w" }, { w: "omri", b: "finley", res: "w" },
        { w: "karim", b: "rob", res: "b" }, { w: "ibra", b: "caleb", res: "w" },
      ],
      [
        { w: "mayank", b: "omri", res: "b" }, { w: "max", b: "ty", res: "w" },
        { w: "rob", b: "ibra", res: "w" }, { w: "caleb", b: "curtis", res: "w" },
        { w: "ian", b: "shruthi", res: "b" }, { w: "finley", b: "karim", res: "b" },
      ],
      [
        { w: "omri", b: "max", res: "b" }, { w: "rob", b: "mayank", res: "w" },
        { w: "ty", b: "ibra", res: "w" }, { w: "shruthi", b: "karim", res: "w" },
        { w: "caleb", b: "ian", res: "w" }, { w: "curtis", b: "finley", res: "b" },
      ],
      [
        { w: "max", b: "rob", res: "w" }, { w: "omri", b: "ty", res: "w" },
        { w: "shruthi", b: "caleb", res: "w" }, { w: "ibra", b: "mayank", res: "b" },
        { w: "karim", b: "curtis", res: "w" }, { w: "finley", b: "ian", res: "w" },
      ],
    ];
    const byBuch = s(ids, schedule);
    const d = deriveData(byBuch);
    expect(d.omri.score).toBe(3);
    expect(d.rob.score).toBe(3);
    expect(d.omri.buch).toBe(10);
    expect(d.rob.buch).toBe(9);
    expect(d.omri.cum).toBe(8);
    expect(d.rob.cum).toBe(9);

    // Default (Buchholz): Omri 2nd, Rob 3rd
    expect(standings(byBuch).map((r) => r.id).slice(0, 3)).toEqual(["max", "omri", "rob"]);

    // Cumulative: Rob 2nd, Omri 3rd
    const byCum: TournamentState = { ...s(ids, schedule), tiebreak: "cumulative" };
    expect(standings(byCum).map((r) => r.id).slice(0, 3)).toEqual(["max", "rob", "omri"]);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/swiss.test.ts`
Expected: FAIL — TypeScript rejects `tiebreak` on `TournamentState`, and the cumulative ordering assertion does not hold.

- [ ] **Step 3: Add `tiebreak` to `TournamentState`**

In `lib/types.ts`, inside `interface TournamentState`, after the `uid` line:

```ts
  uid?: string; // stable id for this tournament instance (used as history key)
  /**
   * Tiebreak rule for this event only. Absent = "buchholz" (the app default).
   * "cumulative" ranks by progressive score — the running total after each
   * round, summed — which rewards leading early. Set per-event; `reset()` in
   * app/admin/page.tsx writes a fresh state, so it never carries over.
   */
  tiebreak?: "buchholz" | "cumulative";
```

- [ ] **Step 4: Branch the comparator in `standings`**

Replace the body of `standings` in `lib/swiss.ts`:

```ts
export function standings(state: TournamentState): StandingRow[] {
  const d = deriveData(state);
  const playerMap = new Map(state.players.map((p) => [p.id, p.name]));
  const cumulative = state.tiebreak === "cumulative";
  return state.players
    .map((p) => ({ ...d[p.id], name: playerMap.get(p.id) ?? p.id, out: p.out }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (cumulative && b.cum !== a.cum) return b.cum - a.cum;
      if (b.buch !== a.buch) return b.buch - a.buch;
      if (b.sb !== a.sb) return b.sb - a.sb;
      return a.name.localeCompare(b.name);
    });
}
```

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS — all files. `lib/swiss.test.ts` reports 19 tests, with the original 15 unmodified.

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/swiss.ts lib/swiss.test.ts
git commit -m "feat(swiss): per-event cumulative tiebreak, defaulting to Buchholz"
```

---

### Task 3: Show the Cum column for cumulative events

**Files:**
- Modify: `components/StandingsTable.tsx:6`, `:17`, `:31-33`
- Modify: `app/history/page.tsx:163-167`
- Modify: `app/results/page.tsx:81`

**Interfaces:**
- Consumes: `TournamentState.tiebreak` (Task 2), `Derived.cum` (Task 1).
- Produces: `StandingsTable` accepts an optional `tiebreak?: TournamentState["tiebreak"]` prop. Omitting it renders exactly today's columns.

Without this, the table shows Rob 2nd on Buch 9 above Omri on Buch 10 with no visible
justification — which reads as the very bug that prompted this work.

- [ ] **Step 1: Add the prop and conditional column**

In `components/StandingsTable.tsx`, change the import and signature:

```tsx
import type { StandingRow, TournamentState } from "@/lib/types";

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export function StandingsTable({ rows, playedRounds, champion, tiebreak }: { rows: StandingRow[]; playedRounds: number; champion: boolean; tiebreak?: TournamentState["tiebreak"] }) {
  const showCum = tiebreak === "cumulative";
```

Replace the header cells line (currently line 17):

```tsx
            <th style={{ padding: 8 }}>Pts</th>
            {showCum && <th style={{ padding: 8 }}>Cum</th>}
            <th style={{ padding: 8 }}>Buch</th><th style={{ padding: 8 }}>SB</th>
```

Insert the body cell immediately after the `Pts` cell (currently line 31):

```tsx
              <td className="num" style={{ textAlign: "center", padding: 8, fontWeight: 800, color: "var(--accent)" }}>{fmt(p.score)}</td>
              {showCum && <td className="num" style={{ textAlign: "center", padding: 8, color: "var(--ink-soft)" }}>{fmt(p.cum)}</td>}
```

- [ ] **Step 2: Pass the tiebreak from the history page**

In `app/history/page.tsx`, the `StandingsTable` call at line 163:

```tsx
                    <StandingsTable
                      rows={standings(e.state)}
                      playedRounds={e.state.schedule.length}
                      champion
                      tiebreak={e.state.tiebreak}
                    />
```

- [ ] **Step 3: Pass the tiebreak from the results page**

In `app/results/page.tsx` line 81:

```tsx
      <StandingsTable rows={rows} playedRounds={t.state.schedule.length} champion={t.status === "finished" || done} tiebreak={t.state.tiebreak} />
```

- [ ] **Step 4: Verify types and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add components/StandingsTable.tsx app/history/page.tsx app/results/page.tsx
git commit -m "feat(standings): show Cum column for cumulative-tiebreak events"
```

---

### Task 4: Migrate the 2026-08-02 event

**Files:**
- Create: `scripts/set-cumulative-tiebreak.mjs`

**Interfaces:**
- Consumes: `TournamentState.tiebreak` (Task 2).
- Produces: nothing consumed by later tasks — this is the final task.

Follows the `scripts/fix-result.mjs` precedent, but reads credentials from the
environment rather than hardcoding them, and guards before writing.

- [ ] **Step 1: Write the script**

```js
// One-off: put the 2026-08-02 (Recovery Koh Tao) event on the cumulative
// tiebreak. Sets state.tiebreak on the history row AND the matching live
// tournament row, then recomputes the archived standings column from the
// engine so the podium and the expandable table agree.
// Run with: set -a && . ./.env.local && set +a && node scripts/set-cumulative-tiebreak.mjs
import { standings } from "../lib/swiss.ts";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) { console.error("ABORT: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY"); process.exit(1); }

const ID = "2b55e66b-7af4-4a52-8d8b-01b51fe1fb22";
const H = { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json", Prefer: "return=representation" };
const podium = (state) => standings(state).map((r) => ({ name: r.name, score: r.score, buch: r.buch, sb: r.sb }));
const fmt = (rows) => rows.map((r, i) => `  ${i + 1}. ${r.name}  ${r.score} (buch ${r.buch}, sb ${r.sb})`).join("\n");

const [h] = await (await fetch(`${url}/rest/v1/tournament_history?id=eq.${ID}&select=*`, { headers: H })).json();
if (!h?.state) { console.error("ABORT: history row or its state not found"); process.exit(1); }

const state = h.state;
console.log("BEFORE (Buchholz):\n" + fmt(podium(state)));
state.tiebreak = "cumulative";
const after = podium(state);
console.log("\nAFTER (cumulative):\n" + fmt(after));
if (after[1].name !== "Rob" || after[2].name !== "Omri") {
  console.error(`ABORT: expected Rob 2nd and Omri 3rd, got ${after[1].name} / ${after[2].name}`);
  process.exit(1);
}

const r1 = await fetch(`${url}/rest/v1/tournament_history?id=eq.${ID}`, {
  method: "PATCH", headers: H, body: JSON.stringify({ state, standings: after }),
});
console.log("\nhistory PATCH:", r1.status, r1.ok ? "ok" : await r1.text());

// The live tournament row is still this event (same uid, status finished).
const [t] = await (await fetch(`${url}/rest/v1/tournament?id=eq.current&select=state`, { headers: H })).json();
if (t?.state?.uid === ID) {
  t.state.tiebreak = "cumulative";
  const r2 = await fetch(`${url}/rest/v1/tournament?id=eq.current`, {
    method: "PATCH", headers: H, body: JSON.stringify({ state: t.state, updated_at: new Date().toISOString() }),
  });
  console.log("live tournament PATCH:", r2.status, r2.ok ? "ok" : await r2.text());
} else {
  console.log("live tournament row is a different event (uid " + t?.state?.uid + ") — left untouched");
}
```

- [ ] **Step 2: Run it**

Run: `set -a && . ./.env.local && set +a && npx --yes tsx scripts/set-cumulative-tiebreak.mjs`

`tsx` is required: this repo runs Node v20.19.5, which cannot import `.ts` modules
(`ERR_UNKNOWN_FILE_EXTENSION`). Both verified. Importing the real `standings()` rather
than inlining a copy — as `fix-result.mjs` does — is deliberate: a duplicated engine
could drift from the app and rewrite the archived standings to something the history
table then contradicts, which is the exact class of bug this work is fixing.

Expected: BEFORE shows Omri 2nd / Rob 3rd; AFTER shows Rob 2nd / Omri 3rd, with places 5–9 reordered to Ty, Mayank, Caleb, Karim, Finley; both PATCHes return 200.

- [ ] **Step 3: Verify the write landed**

```bash
set -a && . ./.env.local && set +a && curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/tournament_history?id=eq.2b55e66b-7af4-4a52-8d8b-01b51fe1fb22&select=standings,state" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" -H "Authorization: Bearer $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  | python3 -c "import json,sys; d=json.load(sys.stdin)[0]; print('tiebreak:', d['state'].get('tiebreak')); [print(f\"{i+1}. {p['name']} {p['score']}\") for i,p in enumerate(d['standings'][:4])]"
```

Expected: `tiebreak: cumulative`, then MaxOnlyPlaysE4 4, Rob 3, Omri 3, Shruthi 3.

- [ ] **Step 4: Visual check of the Cum column**

Run `npm run dev`, open `/history`, expand the 2026-08-02 event. Confirm a **Cum** column appears showing Rob 9 above Omri 8, and that the podium above matches the table. Then expand an older event and confirm it has **no** Cum column and is unchanged.

- [ ] **Step 5: Commit**

```bash
git add scripts/set-cumulative-tiebreak.mjs
git commit -m "chore: migrate 2026-08-02 event to cumulative tiebreak"
```
