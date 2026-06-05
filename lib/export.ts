// lib/export.ts
// Pure helpers for exporting a tournament to CSV. Kept free of DOM/browser
// APIs so it can be unit-tested; the download trigger lives in `downloadText`.
import type { GameResult, Tournament } from "./types";
import { standings } from "./swiss";

function cell(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function row(...cells: (string | number | null | undefined)[]): string {
  return cells.map(cell).join(",");
}

/** Human-readable score string from White's perspective. */
function resultLabel(res: GameResult, isBye: boolean): string {
  if (isBye) return "BYE";
  switch (res) {
    case "w": return "1-0";
    case "b": return "0-1";
    case "d": return "½-½";
    default: return ""; // unreported
  }
}

function fmtNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** Build a CSV document (metadata + pairings + standings) for a tournament. */
export function tournamentCsv(t: Tournament): string {
  const nameOf = (id: string) => t.state.players.find((p) => p.id === id)?.name ?? id;
  const rows = standings(t.state);
  const lines: string[] = [];

  // --- Metadata ---
  lines.push(row("Tournament", t.title));
  lines.push(row("System", "Swiss"));
  lines.push(row("Location", t.location ?? ""));
  lines.push(row("Date", t.event_at ?? ""));
  lines.push(row("Status", t.status));
  lines.push(row("Rounds played", `${t.state.schedule.length} of ${t.rounds}`));
  if (t.status === "finished" && rows.length > 0) {
    lines.push(row("Winner", rows[0].name));
  }
  lines.push("");

  // --- Pairings ---
  lines.push(row("Round", "Board", "White", "Black", "Result"));
  t.state.schedule.forEach((round, ri) => {
    let board = 0;
    for (const g of round) {
      const isBye = g.b === null;
      if (!isBye) board++;
      lines.push(row(
        ri + 1,
        isBye ? "" : board,
        nameOf(g.w),
        isBye ? "" : nameOf(g.b as string),
        resultLabel(g.res, isBye),
      ));
    }
  });
  lines.push("");

  // --- Standings ---
  lines.push(row("Rank", "Player", "Points", "Buchholz", "SB"));
  rows.forEach((p, i) => {
    lines.push(row(i + 1, p.name, fmtNum(p.score), fmtNum(p.buch), fmtNum(p.sb)));
  });

  return lines.join("\r\n");
}

/** Trigger a browser download of text content. No-op outside the browser. */
export function downloadText(filename: string, text: string, mime = "text/csv"): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([text], { type: `${mime};charset=utf-8;` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Convenience: filename-safe slug from a tournament title. */
export function csvFilename(t: Tournament): string {
  const slug = (t.title || "tournament").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${slug || "tournament"}-results.csv`;
}
