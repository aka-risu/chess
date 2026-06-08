// lib/stockfish.ts
// Async engine backed by Stockfish (classical sf10) running in a Web Worker via
// the UCI protocol. Loaded lazily and only in the browser. If the worker fails
// to start (or we're not in a browser), every call falls back to the small
// built-in JS engine in ./engine, so the app always works.
import { Chess } from "chess.js";
import { analyse as jsAnalyse, chooseMove as jsChoose, type Analysis, type EngineMove } from "./engine";

const SEARCH_TIMEOUT = 6000; // ms before we give up on a search and fall back
type SearchOpts = { skill?: number; movetime?: number; depth?: number };
type Raw = { best: string | null; cp: number; mate: number | null };

let worker: Worker | null = null;
let initPromise: Promise<boolean> | null = null;
let chain: Promise<unknown> = Promise.resolve(); // serializes worker access

const lineOf = (e: MessageEvent): string => (typeof e.data === "string" ? e.data : String(e.data?.data ?? ""));

// Bring the worker up and complete the UCI handshake. Resolves false if Stockfish
// is unavailable for any reason (no Worker, load error, timeout).
function ensure(): Promise<boolean> {
  if (initPromise) return initPromise;
  initPromise = new Promise<boolean>((resolve) => {
    if (typeof window === "undefined" || typeof Worker === "undefined") { resolve(false); return; }
    let w: Worker;
    try { w = new Worker("/stockfish/stockfish.js"); } catch { resolve(false); return; }
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(to);
      w.removeEventListener("message", onMsg);
      w.removeEventListener("error", onErr);
      if (ok) worker = w; else try { w.terminate(); } catch { /* ignore */ }
      resolve(ok);
    };
    const onMsg = (e: MessageEvent) => { if (lineOf(e) === "readyok") done(true); };
    const onErr = () => done(false);
    const to = setTimeout(() => done(false), SEARCH_TIMEOUT);
    w.addEventListener("message", onMsg);
    w.addEventListener("error", onErr);
    w.postMessage("uci");
    w.postMessage("isready");
  });
  return initPromise;
}

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(task, task);
  chain = run.catch(() => {});
  return run;
}

// One UCI search. Rejects on timeout so callers can fall back.
function search(fen: string, opts: SearchOpts): Promise<Raw> {
  return enqueue(async () => {
    const ok = await ensure();
    if (!ok || !worker) throw new Error("stockfish unavailable");
    const w = worker;
    return new Promise<Raw>((resolve, reject) => {
      let cp = 0, mate: number | null = null;
      const finish = (fn: () => void) => { clearTimeout(to); w.removeEventListener("message", onMsg); fn(); };
      const onMsg = (e: MessageEvent) => {
        const line = lineOf(e);
        if (line.startsWith("info")) {
          const m = line.match(/score (cp|mate) (-?\d+)/);
          if (m) { if (m[1] === "cp") { cp = +m[2]; mate = null; } else { mate = +m[2]; cp = 0; } }
        } else if (line.startsWith("bestmove")) {
          const mv = line.split(/\s+/)[1];
          finish(() => resolve({ best: mv && mv !== "(none)" ? mv : null, cp, mate }));
        }
      };
      const to = setTimeout(() => finish(() => reject(new Error("search timeout"))), SEARCH_TIMEOUT);
      w.addEventListener("message", onMsg);
      if (opts.skill != null) w.postMessage(`setoption name Skill Level value ${opts.skill}`);
      w.postMessage(`position fen ${fen}`);
      w.postMessage(opts.movetime != null ? `go movetime ${opts.movetime}` : `go depth ${opts.depth ?? 12}`);
    });
  });
}

const parseUci = (uci: string): EngineMove => ({
  from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci[4] : undefined,
});

// Difficulty → Stockfish skill level + thinking time.
const LEVELS: Record<number, SearchOpts> = {
  1: { skill: 0, movetime: 60 },
  2: { skill: 6, movetime: 250 },
  3: { skill: 20, movetime: 600 },
};

/** Best move for the bot at a difficulty level. Falls back to the JS engine. */
export async function engineMove(fen: string, level: number): Promise<EngineMove | null> {
  try {
    const r = await search(fen, LEVELS[level] ?? LEVELS[2]);
    return r.best ? parseUci(r.best) : null;
  } catch {
    return jsChoose(fen, level);
  }
}

/** Full-strength analysis (White-perspective). Falls back to the JS engine. */
export async function engineAnalyse(fen: string, depth = 12): Promise<Analysis> {
  // Terminal positions: return an unambiguous eval (engines report these
  // inconsistently). Checkmate = decisive for the side that just moved.
  const pos = new Chess(fen);
  if (pos.isGameOver()) {
    const whiteToMove = pos.turn() === "w";
    const cp = pos.isCheckmate() ? (whiteToMove ? -100_000 : 100_000) : 0;
    return { best: null, cp, mate: null };
  }
  try {
    const r = await search(fen, { skill: 20, depth });
    const whiteToMove = fen.split(" ")[1] === "w";
    return {
      best: r.best ? parseUci(r.best) : null,
      cp: whiteToMove ? r.cp : -r.cp,
      mate: r.mate == null ? null : (whiteToMove ? r.mate : -r.mate),
    };
  } catch {
    return jsAnalyse(fen, 3);
  }
}

/** Kick off worker init early (e.g. on page load) so the first move isn't slow. */
export function warmEngine(): void { void ensure(); }
