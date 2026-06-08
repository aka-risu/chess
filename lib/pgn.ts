// lib/pgn.ts — build a PGN document from a tournament's recorded game moves.
// Only games that actually have moves recorded are included. Pure & testable.
import type { GameResult, Tournament } from "./types";

const RESULT: Record<string, string> = { w: "1-0", b: "0-1", d: "1/2-1/2" };
const resultTag = (res: GameResult): string => (res && RESULT[res]) || "*";

function pgnDate(iso: string | null): string {
  if (!iso) return "????.??.??";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "????.??.??";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}

// PGN tag values escape backslash and quote.
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

/** Returns a PGN string for all games with recorded moves, or "" if none. */
export function tournamentPgn(t: Tournament): string {
  const nameOf = (id: string) => t.state.players.find((p) => p.id === id)?.name ?? id;
  const date = pgnDate(t.event_at);
  const site = t.location || "Koh Tao";
  const games: string[] = [];

  t.state.schedule.forEach((round, ri) => {
    let board = 0;
    for (const g of round) {
      if (g.b === null) continue; // bye
      board++;
      if (!g.moves || !g.moves.trim()) continue; // only recorded games
      const result = resultTag(g.res);
      const tags = [
        `[Event "${esc(t.title)}"]`,
        `[Site "${esc(site)}"]`,
        `[Date "${date}"]`,
        `[Round "${ri + 1}.${board}"]`,
        `[White "${esc(nameOf(g.w))}"]`,
        `[Black "${esc(nameOf(g.b))}"]`,
        `[Result "${result}"]`,
      ].join("\n");
      const movetext = g.moves.trim().replace(/\s+/g, " ");
      games.push(`${tags}\n\n${movetext} ${result}`);
    }
  });

  return games.join("\n\n");
}

/** Whether any game has recorded moves (to show/hide the export button). */
export function hasRecordedMoves(t: Tournament): boolean {
  return t.state.schedule.some((r) => r.some((g) => g.b !== null && !!g.moves?.trim()));
}
