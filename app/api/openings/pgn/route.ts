// app/api/openings/pgn/route.ts
// Proxies a single Lichess game export as plain PGN. A given game never
// changes, so this is cached aggressively. The id is validated to keep the
// upstream URL from being manipulated.
import { type NextRequest } from "next/server";

const MONTH = 60 * 60 * 24 * 30;

export async function GET(req: NextRequest) {
  const gameId = req.nextUrl.searchParams.get("gameId") ?? "";
  if (!/^[a-zA-Z0-9]{8}$/.test(gameId)) {
    return Response.json({ error: "bad game id" }, { status: 400 });
  }
  const url = `https://lichess.org/game/export/${gameId}.pgn?clocks=false&evals=false&literate=false`;
  try {
    const r = await fetch(url, {
      headers: { Accept: "application/x-chess-pgn" },
      next: { revalidate: MONTH },
    });
    if (!r.ok) return Response.json({ error: "upstream failed" }, { status: 502 });
    const pgn = await r.text();
    return new Response(pgn, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  } catch {
    return Response.json({ error: "upstream failed" }, { status: 502 });
  }
}
