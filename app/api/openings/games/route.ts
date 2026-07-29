// app/api/openings/games/route.ts
// Returns the top master games that reached an opening's position, via the
// Lichess Masters opening-explorer. Deep mainline positions can be rare in the
// masters database, so we probe a few depths (deepest first) until games turn
// up — but we cap the number of upstream calls to stay under the rate limit,
// and we distinguish "upstream unreachable" (502) from "genuinely no games" ([]).
import { type NextRequest } from "next/server";
import { OPENINGS } from "@/lib/openings";
import { lineFens, type MasterGame } from "@/lib/openingGames";

const EXPLORER = "https://explorer.lichess.ovh/masters";
// Lichess asks API clients to identify themselves; header-less requests are
// the first thing they rate-limit.
const UA = "chess-swiss opening trainer (https://github.com/aka-risu/chess-swiss)";
const DAY = 60 * 60 * 24;

interface ExplorerGame {
  id: string;
  winner: "white" | "black" | null; // null == draw
  white: { name: string; rating: number };
  black: { name: string; rating: number };
  year?: number;
}

function toMaster(g: ExplorerGame): MasterGame {
  return {
    gameId: g.id,
    white: g.white?.name ?? "?",
    black: g.black?.name ?? "?",
    whiteElo: g.white?.rating ?? null,
    blackElo: g.black?.rating ?? null,
    winner: g.winner ?? "draw",
    year: g.year ?? null,
  };
}

// Returns the games at a position. `ok` is false only when the upstream call
// itself failed (so the caller can tell a miss from an outage).
async function gamesAt(fen: string): Promise<{ ok: boolean; games: MasterGame[] }> {
  const url = `${EXPLORER}?fen=${encodeURIComponent(fen)}&topGames=10&moves=0`;
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, next: { revalidate: DAY } });
    if (!r.ok) return { ok: false, games: [] };
    const data = (await r.json()) as { topGames?: ExplorerGame[] };
    return { ok: true, games: (data.topGames ?? []).map(toMaster) };
  } catch {
    return { ok: false, games: [] };
  }
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  const opening = OPENINGS.find((o) => o.id === id);
  if (!opening) return Response.json({ error: "unknown opening" }, { status: 404 });

  const fens = lineFens(opening.moves);
  // A few characteristic depths, deepest first, deduped — at most ~3 calls.
  const n = fens.length;
  const depths = [...new Set([n - 1, Math.floor(n * 0.6), 5].filter((i) => i >= 3 && i < n))];

  let reachedUpstream = false;
  for (const i of depths) {
    const { ok, games } = await gamesAt(fens[i]);
    reachedUpstream ||= ok;
    if (games.length) return Response.json(games);
  }
  // No games anywhere we looked. If we never even reached Lichess, say so.
  if (!reachedUpstream) return Response.json({ error: "explorer unreachable" }, { status: 502 });
  return Response.json([]);
}
