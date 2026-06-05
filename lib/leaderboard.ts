// lib/leaderboard.ts
// Aggregate all-time stats across archived tournaments. Players are matched by
// trimmed name (casual app — no player accounts). Pure & unit-tested.
import type { HistoryEntry } from "./types";

export interface LeaderRow {
  name: string;
  events: number;   // tournaments entered
  wins: number;     // 1st-place finishes
  podiums: number;  // top-3 finishes
  points: number;   // total points scored
}

export function aggregate(entries: HistoryEntry[]): LeaderRow[] {
  const map = new Map<string, LeaderRow>();
  for (const e of entries) {
    e.standings.forEach((p, i) => {
      const name = p.name.trim();
      if (!name) return;
      const row = map.get(name) ?? { name, events: 0, wins: 0, podiums: 0, points: 0 };
      row.events += 1;
      if (i === 0) row.wins += 1;
      if (i < 3) row.podiums += 1;
      row.points += p.score;
      map.set(name, row);
    });
  }
  return [...map.values()].sort(
    (a, b) =>
      b.wins - a.wins ||
      b.podiums - a.podiums ||
      b.points - a.points ||
      a.name.localeCompare(b.name),
  );
}
