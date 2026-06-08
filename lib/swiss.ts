// lib/swiss.ts
import type { Derived, Game, Id, Player, Round, StandingRow, TournamentState } from "./types";

export function deriveData(state: TournamentState, uptoRound?: number): Record<Id, Derived> {
  const playerSet = new Set(state.players.map((p) => p.id));
  const limit = uptoRound !== undefined ? uptoRound : state.schedule.length;

  // Initialize derived records for all known players
  const d: Record<Id, Derived> = {};
  for (const p of state.players) {
    d[p.id] = {
      id: p.id,
      score: 0,
      opp: new Set<Id>(),
      oppList: [],
      results: {},
      white: 0,
      black: 0,
      last: null,
      byes: 0,
      beat: [],
      drew: [],
      buch: 0,
      sb: 0,
    };
  }

  for (let r = 0; r < limit; r++) {
    const round = state.schedule[r];
    if (!round) continue;
    for (const game of round) {
      const { w, b, res } = game;
      // Bye
      if (b === null || res === "bye") {
        const W = d[w];
        if (W) {
          W.byes++;
          W.results[r] = "bye";
          if (res === "bye") W.score += 1;
        }
        continue;
      }

      const W = d[w];
      const B = d[b];
      const wPresent = playerSet.has(w);
      const bPresent = playerSet.has(b);

      // Always record white/black/last for present sides
      if (wPresent && W) {
        W.white++;
        W.last = "w";
      }
      if (bPresent && B) {
        B.black++;
        B.last = "b";
      }

      // Only do opp tracking and scoring when both are present
      if (wPresent && bPresent && W && B) {
        W.opp.add(b);
        W.oppList.push(b);
        B.opp.add(w);
        B.oppList.push(w);

        if (res === "w") {
          W.score += 1;
          W.results[r] = "+";
          B.results[r] = "-";
          W.beat.push(b);
        } else if (res === "b") {
          B.score += 1;
          W.results[r] = "-";
          B.results[r] = "+";
          B.beat.push(w);
        } else if (res === "d") {
          W.score += 0.5;
          B.score += 0.5;
          W.results[r] = "=";
          B.results[r] = "=";
          W.drew.push(b);
          B.drew.push(w);
        }
      }
    }
  }

  // Compute Buchholz and Sonneborn-Berger
  for (const p of state.players) {
    const pd = d[p.id];
    if (!pd) continue;
    pd.buch = pd.oppList.reduce((sum, oppId) => sum + (d[oppId]?.score ?? 0), 0);
    pd.sb =
      pd.beat.reduce((sum, oppId) => sum + (d[oppId]?.score ?? 0), 0) +
      0.5 * pd.drew.reduce((sum, oppId) => sum + (d[oppId]?.score ?? 0), 0);
  }

  return d;
}

export function standings(state: TournamentState): StandingRow[] {
  const d = deriveData(state);
  const playerMap = new Map(state.players.map((p) => [p.id, p.name]));
  return state.players
    .map((p) => ({ ...d[p.id], name: playerMap.get(p.id) ?? p.id }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.buch !== a.buch) return b.buch - a.buch;
      if (b.sb !== a.sb) return b.sb - a.sb;
      return a.name.localeCompare(b.name);
    });
}

type Rng = () => number;

export function matchPairs(
  list: Player[],
  d: Record<Id, Derived>,
  allowRematch: boolean
): [Player, Player][] | null {
  if (list.length === 0) return [];
  if (list.length === 1) return null; // odd number - caller should handle bye first

  const first = list[0];
  const rest = list.slice(1);

  for (let i = 0; i < rest.length; i++) {
    const candidate = rest[i];
    const canPair =
      allowRematch || !d[first.id]?.opp.has(candidate.id);
    if (!canPair) continue;

    const remaining = [...rest.slice(0, i), ...rest.slice(i + 1)];
    const subPairs = matchPairs(remaining, d, allowRematch);
    if (subPairs !== null) {
      return [[first, candidate], ...subPairs];
    }
  }

  return null;
}

export function assignColors(a: Player, b: Player, d: Record<Id, Derived>): Game {
  const da = d[a.id];
  const db = d[b.id];
  const aWhite = da?.white ?? 0;
  const bWhite = db?.white ?? 0;
  const aBlack = da?.black ?? 0;
  const bBlack = db?.black ?? 0;
  const aBalance = aWhite - aBlack; // positive = more whites
  const bBalance = bWhite - bBlack;

  // Player with fewer whites (lower balance) gets white
  if (aBalance < bBalance) {
    return { w: a.id, b: b.id, res: null };
  }
  if (bBalance < aBalance) {
    return { w: b.id, b: a.id, res: null };
  }

  // Tie: alternate from last color
  // If a.last === 'w', a should get black (b gets white)
  // If a.last === 'b', a should get white
  const aLast = da?.last ?? null;
  const bLast = db?.last ?? null;

  if (aLast === "w" && bLast !== "w") {
    return { w: b.id, b: a.id, res: null };
  }
  if (bLast === "w" && aLast !== "w") {
    return { w: a.id, b: b.id, res: null };
  }
  if (aLast === "b" && bLast !== "b") {
    return { w: a.id, b: b.id, res: null };
  }
  if (bLast === "b" && aLast !== "b") {
    return { w: b.id, b: a.id, res: null };
  }

  // Default: a gets white
  return { w: a.id, b: b.id, res: null };
}

function shuffle<T>(arr: T[], rng: Rng): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function generateRound(state: TournamentState, rng: Rng = Math.random): Round {
  const roundIndex = state.schedule.length;
  const d = deriveData(state);

  const seedOf = (p: Player) => p.level ?? 0; // higher = stronger

  let pool: Player[];
  if (roundIndex === 0) {
    // Round 1: seed by level (desc), random within equal level.
    pool = shuffle(state.players.slice(), rng).sort((a, b) => seedOf(b) - seedOf(a));
  } else {
    // Later rounds: by score, then level (rating order within score group), then Buchholz.
    pool = shuffle(state.players.slice(), rng).sort((a, b) => {
      const A = d[a.id], B = d[b.id];
      return B.score - A.score || seedOf(b) - seedOf(a) || B.buch - A.buch;
    });
  }

  let byePlayer: Player | undefined;
  if (pool.length % 2 === 1) {
    // Find lowest-index-from-end player with byes === 0
    for (let i = pool.length - 1; i >= 0; i--) {
      if ((d[pool[i].id]?.byes ?? 0) === 0) {
        byePlayer = pool[i];
        pool = [...pool.slice(0, i), ...pool.slice(i + 1)];
        break;
      }
    }
    // If everyone has a bye, just pop the last player
    if (!byePlayer) {
      byePlayer = pool[pool.length - 1];
      pool = pool.slice(0, pool.length - 1);
    }
  }

  let pairs: [Player, Player][];
  if (roundIndex === 0) {
    // Seeded fold: top half plays bottom half (#1 vs the median seed, etc.).
    const half = pool.length / 2;
    pairs = [];
    for (let i = 0; i < half; i++) pairs.push([pool[i], pool[i + half]]);
  } else {
    pairs = matchPairs(pool, d, false) ?? matchPairs(pool, d, true) ?? [];
  }

  const games: Round = pairs.map(([a, b]) => assignColors(a, b, d));

  if (byePlayer) {
    games.push({ w: byePlayer.id, b: null, res: "bye" });
  }

  return games;
}

export function roundComplete(state: TournamentState, r: number): boolean {
  const round = state.schedule[r];
  if (!round) return false;
  return round.every((g) => g.res !== null);
}

export function allDone(state: TournamentState, plannedRounds: number): boolean {
  if (state.schedule.length < plannedRounds) return false;
  return roundComplete(state, state.schedule.length - 1);
}

export function recommendedRounds(n: number): number {
  return n > 0 ? Math.max(3, Math.ceil(Math.log2(n))) : 4;
}

export function clampRounds(n: number, playerCount: number): number {
  const max = Math.max(1, playerCount - 1);
  return Math.min(Math.max(1, n), max);
}
