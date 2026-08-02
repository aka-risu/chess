# Per-event tiebreak override

**Date:** 2026-08-02
**Status:** Approved, pending implementation

## Problem

The 2026-08-02 event (Recovery Koh Tao, history id `2b55e66b-7af4-4a52-8d8b-01b51fe1fb22`)
finished with Omri 2nd and Rob 3rd. The organizer was told the algorithm was wrong.

It is not. Every stored number was independently recomputed from the raw game
records and is correct; all 15 tests in `lib/swiss.test.ts` pass. What happened:

- Omri and Rob both finished 3/4, and each lost exactly one game — both to the
  champion, MaxOnlyPlaysE4. Their records are otherwise identical.
- The app breaks ties on Buchholz (sum of opponents' final scores).
  Omri 10, Rob 9. The whole difference is one opponent: Rob played Ibra, who
  finished on 1, while all four of Omri's opponents finished on 2 or better.
- Rob played round 4 board 1 against the champion because he was 3/3 going in
  (Omri was 2/3). Being paired on the top board is a consequence of pairing, not
  a tiebreak in any scoring system.

The organizer's intuition — "Rob led going into the final round" — is a real,
FIDE-recognized tiebreak: **Cumulative (progressive) scores**. Under it Rob
scores 9 and Omri 8, putting Rob second.

So this is a choice of tiebreak rule, not a defect. Buchholz → SB was a
deliberate decision in the original design spec. The organizer wants cumulative
applied **to this one event only**.

## Goal

Let a single tournament opt into the cumulative tiebreak, leaving every other
event — past and future — on Buchholz.

## Non-goals

- **Not** changing the default tiebreak for the app.
- **Not** an admin UI picker. This is a one-off data edit; a settings control is
  YAGNI until per-event selection is actually a recurring need.
- **Not** fixing the separate bye/Buchholz defect noted below.

## Design

### Engine

`lib/types.ts`:

- `Derived` gains `cum: number` — the player's running score after each round,
  summed across rounds. Computed unconditionally; the cost is negligible.
- `TournamentState` gains `tiebreak?: "buchholz" | "cumulative"`.
  **Absent means `"buchholz"`.** Every existing tournament is therefore
  unaffected, which the existing test suite verifies by passing unchanged.

`lib/swiss.ts`:

- `deriveData` accumulates `cum` while walking rounds. A bye adds to the running
  score in the round it falls, consistent with how byes already affect `score`.
- `standings()` picks a comparator from `state.tiebreak`:
  - `buchholz` (default): score → buch → sb → name
  - `cumulative`: score → **cum** → buch → sb → name

  Buchholz and SB remain as later fallbacks so ordering stays deterministic when
  cumulative also ties. Name remains the final tiebreak, so the sort is total.

`standings()` at `lib/swiss.ts:101` is the single sort point feeding both the
archived podium and the expandable history table, so one change keeps every view
consistent.

### Display

`components/StandingsTable.tsx` shows a **Cum** column when — and only when — the
active tiebreak is cumulative.

This is not cosmetic. Without it the table shows Rob 2nd on Buch 9 above Omri on
Buch 10 with no visible justification, which reads as exactly the bug that
prompted this work. The column makes the ordering self-evident. It requires
threading the active tiebreak into `StandingsTable` from its call sites
(`app/history/page.tsx`, `app/results/page.tsx`, `app/page.tsx`).

### Data migration

A one-off script, following the `scripts/fix-result.mjs` precedent:

1. Set `state.tiebreak = "cumulative"` on history row `2b55e66b`.
2. Set the same on the live `tournament` row, whose `state.uid` matches this
   event and whose status is `finished`.
3. Recompute the archived `standings` column from the engine's new ordering.

Step 3 **supersedes an earlier manual swap** of the podium's 2nd and 3rd entries.
That patch changed only the stored `standings` column, leaving the expandable
table disagreeing with the podium. Recomputing from the engine removes the
inconsistency: Rob 2nd and Omri 3rd now fall out of the rules rather than being
hand-written.

Resulting order — note that places 5–9 also reorder, an accepted consequence of
applying a different rule rather than hand-editing two rows:

| # | Before (Buchholz) | After (cumulative) |
|---|---|---|
| 1 | MaxOnlyPlaysE4 4 | MaxOnlyPlaysE4 4 |
| 2 | Omri 3 | **Rob 3** |
| 3 | Rob 3 | **Omri 3** |
| 4 | Shruthi 3 | Shruthi 3 |
| 5–9 | Mayank, Karim, Ty, Finley, Caleb | **Ty, Mayank, Caleb, Karim, Finley** |
| 10–12 | Ibra, Ian, Curtis | Ibra, Ian, Curtis |

The pre-edit row is backed up at `history-backup-2b55e66b.json` in the session
scratchpad.

### Scope containment

"New tournament" (`app/admin/page.tsx:261`) writes a fresh literal
`{ players: [], schedule: [], viewRound: 1 }`, so `tiebreak` cannot leak into a
subsequent event. Verified.

`lib/leaderboard.ts` aggregates all-time stats by array index. Both players stay
inside the top 3 and `points` sums each player's `score`, which is
order-independent — so all-time wins, podiums and points are unchanged by this
reordering.

## Testing

- All 15 existing `lib/swiss.test.ts` tests must pass **unmodified**. This is the
  primary evidence that the default is preserved.
- New tests:
  - `cum` arithmetic across rounds, including a bye.
  - `tiebreak: "cumulative"` orders by cumulative ahead of Buchholz.
  - Absent `tiebreak` defaults to Buchholz.
  - Regression fixture from the real event: Omri 8 / Rob 9 cumulative, Rob placed
    2nd under cumulative and 3rd under Buchholz.
- `StandingsTable` renders the Cum column only for cumulative events.

## Known defect, deliberately deferred

`lib/swiss.ts:34-42` skips a bye before pushing to `oppList`, so a bye contributes
nothing to that player's Buchholz — there is no FIDE-style virtual opponent. A
player who receives a bye gets an artificially depressed Buchholz. It did not
affect this event (12 players, no byes) but will affect any odd-sized field.
Tracked separately.
