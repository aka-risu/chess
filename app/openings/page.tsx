// app/openings/page.tsx
"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Chess, type Color, type Square } from "chess.js";
import { ChessBoard } from "@/components/ChessBoard";
import { GameReview } from "@/components/GameReview";
import { PlayNav } from "@/components/PlayNav";
import { OPENINGS, canonicalLine, type Opening } from "@/lib/openings";
import { fetchGameSan, fetchOpeningGames, type MasterGame } from "@/lib/openingGames";

type TrainerMode = "learn" | "drill" | "examples" | "quiz";
const LEARNED_KEY = "swiss_openings_learned";
const SHORT_PLIES = 10; // default depth (~5 moves each) before "Full line" is expanded

function replaySan(moves: string[]): Chess {
  const c = new Chess();
  for (const m of moves) { try { c.move(m); } catch { break; } }
  return c;
}
function kingSquare(chess: Chess, color: Color): string | null {
  const b = chess.board();
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const sq = b[r][c];
    if (sq && sq.type === "k" && sq.color === color) return `${"abcdefgh"[c]}${8 - r}`;
  }
  return null;
}
const sideName = (c: Color) => (c === "w" ? "White" : "Black");
const resultDash = (w: MasterGame["winner"]) => (w === "white" ? "1–0" : w === "black" ? "0–1" : "½–½");

export default function OpeningsPage() {
  const [opening, setOpening] = useState<Opening>(OPENINGS[0]);
  const [mode, setMode] = useState<TrainerMode>("learn");
  const [learnPly, setLearnPly] = useState(0); // moves shown in Learn mode
  const [plies, setPlies] = useState<string[]>([]); // SAN played in Drill/Quiz mode
  const [wrong, setWrong] = useState(false);
  const [selected, setSelected] = useState<Square | null>(null);
  const [learned, setLearned] = useState<string[]>([]);
  const [expanded, setExpanded] = useState(false);
  // Quiz: plies (indices into the line) the user missed or took a hint on.
  const [taint, setTaint] = useState<Set<number>>(new Set());
  // Examples: master-game list (keyed by opening id so a stale list never shows),
  // plus a single game being replayed.
  const [gameData, setGameData] = useState<{ id: string; list: MasterGame[] } | null>(null);
  const [gameErr, setGameErr] = useState<string | null>(null); // opening id whose fetch failed
  const [reviewMoves, setReviewMoves] = useState<string[] | null>(null);
  const [loadingGame, setLoadingGame] = useState(false);
  const [reviewErr, setReviewErr] = useState(false);

  const fullLine = useMemo(() => canonicalLine(opening.moves), [opening]);
  const line = useMemo(() => (expanded ? fullLine : fullLine.slice(0, Math.min(SHORT_PLIES, fullLine.length))), [fullLine, expanded]);
  const total = line.length;

  // Restore the "learned" set once, after mount.
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      try {
        const raw = localStorage.getItem(LEARNED_KEY);
        if (raw) { const a = JSON.parse(raw); if (Array.isArray(a)) setLearned(a.filter((x) => typeof x === "string")); }
      } catch { /* ignore */ }
    });
    return () => cancelAnimationFrame(raf);
  }, []);
  const writeLearned = (next: string[]) => { try { localStorage.setItem(LEARNED_KEY, JSON.stringify(next)); } catch { /* ignore */ } };
  const toggleLearned = (id: string) => setLearned((prev) => {
    const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
    writeLearned(next); return next;
  });
  const markLearned = (id: string) => setLearned((prev) => {
    if (prev.includes(id)) return prev;
    const next = [...prev, id]; writeLearned(next); return next;
  });
  const isLearned = learned.includes(opening.id);

  const resetPlay = () => { setLearnPly(0); setPlies([]); setWrong(false); setSelected(null); setTaint(new Set()); };
  const load = (o: Opening) => {
    setOpening(o); setExpanded(false); resetPlay();
    setReviewMoves(null); setReviewErr(false); // game list is keyed by id, so it self-refreshes
  };
  const toggleExpand = () => { setExpanded((e) => !e); resetPlay(); };
  const switchMode = (m: TrainerMode) => { setMode(m); resetPlay(); setReviewMoves(null); setReviewErr(false); };

  // ---------- Learn mode ----------
  const learnPos = useMemo(() => replaySan(line.slice(0, learnPly)), [line, learnPly]);
  const learnLast = learnPos.history({ verbose: true }).at(-1);

  // ---------- Drill / Quiz modes ----------
  const drilling = mode === "drill" || mode === "quiz";
  const drillPos = useMemo(() => replaySan(plies), [plies]);
  const idx = plies.length;
  const done = idx >= total;
  const userTurn = drilling && !done && (opening.side === "w") === (idx % 2 === 0);

  useEffect(() => { // auto-play the opponent's book replies in Drill/Quiz mode
    if (!drilling || done || userTurn) return;
    const t = setTimeout(() => setPlies((p) => (p.length < total ? [...p, line[p.length]] : p)), 350);
    return () => clearTimeout(t);
  }, [drilling, done, userTurn, total, line]);

  // User plies (indices it's the learner's turn) — drives the quiz score.
  const userPlies = useMemo(() => {
    const arr: number[] = [];
    for (let i = 0; i < total; i++) if ((opening.side === "w") === (i % 2 === 0)) arr.push(i);
    return arr;
  }, [total, opening.side]);
  const quizScore = userPlies.filter((i) => i < idx && !taint.has(i)).length;

  const attempt = (from: Square, to: Square): boolean => {
    if (!userTurn) return false;
    const c = new Chess(drillPos.fen());
    let san: string | null = null;
    try { san = c.move({ from, to, promotion: "q" }).san; } catch { return false; }
    setSelected(null);
    if (san === line[idx]) {
      setWrong(false); setPlies((p) => [...p, san!]);
      if (idx + 1 >= total) markLearned(opening.id); // completed the line from memory
    } else {
      setWrong(true);
      if (mode === "quiz") setTaint((t) => new Set(t).add(idx));
    }
    return true;
  };
  const onSquare = (sq: Square) => {
    if (!userTurn) return;
    setWrong(false);
    if (selected) {
      if (sq === selected) { setSelected(null); return; }
      if (attempt(selected, sq)) return;
      const pc = drillPos.get(sq);
      setSelected(pc && pc.color === opening.side ? sq : null);
    } else {
      const pc = drillPos.get(sq);
      if (pc && pc.color === opening.side) setSelected(sq);
    }
  };
  const onMove = (from: Square, to: Square) => { if (!attempt(from, to)) setSelected(null); };
  const drillHint = () => {
    if (!userTurn) return;
    if (mode === "quiz") setTaint((t) => new Set(t).add(idx)); // a hint forfeits the point
    const c = new Chess(drillPos.fen());
    try { setSelected(c.move(line[idx]).from as Square); } catch { /* ignore */ }
  };

  // ---------- Examples mode ----------
  // Fetch the master-game list for the current opening. State is only set inside
  // the async callbacks (never synchronously in the effect body).
  useEffect(() => {
    if (mode !== "examples") return;
    if (gameData?.id === opening.id || gameErr === opening.id) return; // settled already
    let cancelled = false;
    fetchOpeningGames(opening.id)
      .then((list) => { if (!cancelled) setGameData({ id: opening.id, list }); })
      .catch(() => { if (!cancelled) setGameErr(opening.id); });
    return () => { cancelled = true; };
  }, [mode, opening.id, gameData, gameErr]);

  const openGame = async (g: MasterGame) => {
    setLoadingGame(true); setReviewErr(false);
    try { setReviewMoves(await fetchGameSan(g.gameId)); }
    catch { setReviewErr(true); }
    finally { setLoadingGame(false); }
  };

  // ---------- shared board props (learn/drill/quiz) ----------
  const learning = mode === "learn";
  const chess = learning ? learnPos : drillPos;
  const last = learning ? learnLast : drillPos.history({ verbose: true }).at(-1);
  const lastMove = last ? { from: last.from, to: last.to } : null;
  const checkSquare = chess.isCheck() ? kingSquare(chess, chess.turn()) : null;
  const targets = new Set(drilling && selected ? chess.moves({ square: selected, verbose: true }).map((m) => m.to) : []);

  const statusText = mode === "quiz"
    ? (done
        ? `Quiz complete — ${quizScore}/${userPlies.length} book moves found first try.`
        : wrong ? "Not the book move — try again (this one no longer counts)."
        : userTurn ? `Find the book move as ${sideName(opening.side)}.`
        : "Opponent plays the book reply…")
    : (done
        ? "Line complete! ✓ You played the whole opening from memory."
        : wrong ? "Not the book move — try again, or use a hint."
        : userTurn ? `Your move as ${sideName(opening.side)} — play move ${Math.floor(idx / 2) + 1}.`
        : "Opponent plays the book reply…");

  const modeLabels: Record<TrainerMode, string> = { learn: "📖 Learn", drill: "🎯 Drill", examples: "♟ Games", quiz: "❓ Quiz" };

  return (
    <>
      <div className="mast">
        <div>
          <span className="title">Openings</span>
          <div className="kicker" style={{ marginTop: 4 }}>Learn, drill, quiz & study master games</div>
        </div>
      </div>
      <PlayNav />

      <div className="card" style={{ marginBottom: 12, borderColor: "var(--accent-2)" }}>
        <div className="row" style={{ justifyContent: "space-between", gap: 8 }}>
          <span className="pill" style={{ background: "var(--accent-2)", color: "#0b0d10", fontWeight: 800 }}>
            {opening.name} · you play {sideName(opening.side)}
          </span>
          <button onClick={() => toggleLearned(opening.id)} className="pill"
            style={{ background: isLearned ? "var(--accent)" : "var(--surface-2)", color: isLearned ? "#0b0d10" : "var(--ink-soft)", fontWeight: 700, whiteSpace: "nowrap" }}>
            {isLearned ? "✓ Learned" : "Mark learned"}
          </button>
        </div>
        <p className="muted" style={{ marginTop: 8, fontSize: 13 }}>{opening.desc}</p>
        <Link href={`/play?from=${opening.id}`} className="num"
          style={{ display: "block", textAlign: "center", marginTop: 10, padding: "8px 0", borderRadius: 8,
            border: "1px solid var(--line)", background: "var(--surface-2)", color: "var(--ink-soft)", fontWeight: 700, fontSize: 12 }}>
          ♟ Play this opening vs the computer →
        </Link>
        <div className="row" style={{ gap: 6, marginTop: 10 }}>
          {(["learn", "drill", "examples", "quiz"] as const).map((m) => (
            <button key={m} onClick={() => switchMode(m)} className="num"
              style={{
                flex: 1, minHeight: 38, borderRadius: 8, border: "1px solid var(--line)",
                background: mode === m ? "var(--accent)" : "var(--surface-2)",
                color: mode === m ? "#0b0d10" : "var(--ink-soft)", fontWeight: mode === m ? 800 : 600,
                fontSize: 11, padding: "0 4px",
              }}>{modeLabels[m]}</button>
          ))}
        </div>
      </div>

      {mode === "examples" ? (
        <ExamplesPanel
          opening={opening}
          games={gameData?.id === opening.id ? gameData.list : null}
          gamesErr={gameErr === opening.id}
          reviewMoves={reviewMoves} reviewErr={reviewErr} loadingGame={loadingGame}
          onOpen={openGame} onRetry={() => setGameErr(null)}
          onCloseReview={() => { setReviewMoves(null); setReviewErr(false); }} />
      ) : (
        <>
          {drilling && (
            <div className="card" style={{ marginBottom: 12, borderColor: done ? "var(--accent)" : "var(--line)" }}>
              <div style={{ fontSize: 16, fontWeight: 800 }}>{statusText}</div>
              {mode === "quiz" && !done && idx > 0 && (
                <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>Score: {quizScore}/{userPlies.length}</div>
              )}
            </div>
          )}

          <ChessBoard
            board={chess.board()} orientation={opening.side} selected={selected} targets={targets}
            lastMove={lastMove} checkSquare={checkSquare} onSquare={onSquare} onMove={onMove}
            disabled={learning || !userTurn} />

          {/* Move list — in Drill/Quiz only the moves already played are shown (no peeking). */}
          <div className="card" style={{ marginTop: 12 }}>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <span className="kicker">Moves</span>
              {fullLine.length > SHORT_PLIES && (
                <button onClick={toggleExpand} className="num"
                  style={{ background: "none", border: "none", color: "var(--accent)", fontSize: 11, cursor: "pointer", padding: 0 }}>
                  {expanded ? "▴ Short line" : "▾ Full line"}
                </button>
              )}
            </div>
            <div className="row" style={{ flexWrap: "wrap", gap: "2px 6px", marginTop: 6 }}>
              {drilling && idx === 0 && <span className="muted" style={{ fontSize: 13 }}>Hidden — play it from memory.</span>}
              {line.map((san, i) => {
                if (drilling && i >= idx) return null; // hide unplayed moves while drilling/quizzing
                const shown = learning ? i < learnPly : true;
                const current = learning ? i === learnPly - 1 : i === idx - 1;
                return (
                  <span key={i} onClick={learning ? () => setLearnPly(i + 1) : undefined} className="num"
                    style={{
                      cursor: learning ? "pointer" : "default", fontSize: 13, padding: "1px 4px", borderRadius: 4,
                      background: current ? "var(--accent)" : "transparent",
                      color: current ? "#0b0d10" : shown ? "var(--ink)" : "var(--ink-dim)",
                      fontWeight: current ? 800 : 600,
                    }}>
                    {i % 2 === 0 ? `${i / 2 + 1}.` : ""}{san}
                  </span>
                );
              })}
            </div>
          </div>

          {learning ? (
            <>
              <div className="row" style={{ gap: 6, marginTop: 12 }}>
                <button className="btn ghost grow" onClick={() => setLearnPly(0)} disabled={learnPly === 0}>⏮</button>
                <button className="btn ghost grow" onClick={() => setLearnPly((p) => Math.max(0, p - 1))} disabled={learnPly === 0}>◀</button>
                <span className="num" style={{ flex: 1, textAlign: "center", lineHeight: "40px", fontWeight: 700 }}>{learnPly}/{total}</span>
                <button className="btn ghost grow" onClick={() => setLearnPly((p) => Math.min(total, p + 1))} disabled={learnPly >= total}>▶</button>
                <button className="btn ghost grow" onClick={() => setLearnPly(total)} disabled={learnPly >= total}>⏭</button>
              </div>
              <button className="btn block" style={{ marginTop: 8 }} onClick={() => switchMode("drill")}>
                🎯 Drill it from memory →
              </button>
              <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                Step through the line to see how it goes, then drill it. You play {sideName(opening.side)}.
              </p>
            </>
          ) : (
            <div className="row" style={{ gap: 8, marginTop: 12 }}>
              <button className="btn ghost grow" onClick={drillHint} disabled={!userTurn}>💡 Hint</button>
              <button className="btn ghost grow" onClick={resetPlay} disabled={idx === 0}>↻ Restart</button>
              <button className="btn ghost grow" onClick={() => switchMode("learn")}>📖 Learn</button>
            </div>
          )}
        </>
      )}

      <div className="card stack" style={{ marginTop: 12 }}>
        <span className="kicker">Choose an opening</span>
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          {OPENINGS.map((o) => (
            <button key={o.id} onClick={() => load(o)} className="num"
              style={{
                padding: "7px 11px", borderRadius: 999, border: "1px solid var(--line)",
                background: o.id === opening.id ? "var(--accent)" : "var(--surface-2)",
                color: o.id === opening.id ? "#0b0d10" : "var(--ink-soft)", fontWeight: o.id === opening.id ? 800 : 600,
                fontSize: 11, whiteSpace: "nowrap",
              }}>{learned.includes(o.id) ? "✓ " : ""}{o.name}</button>
          ))}
        </div>
      </div>
    </>
  );
}

// Master-games browser: a list of real games, or one replayed via GameReview.
function ExamplesPanel({
  opening, games, gamesErr, reviewMoves, reviewErr, loadingGame, onOpen, onRetry, onCloseReview,
}: {
  opening: Opening; games: MasterGame[] | null; gamesErr: boolean;
  reviewMoves: string[] | null; reviewErr: boolean; loadingGame: boolean;
  onOpen: (g: MasterGame) => void; onRetry: () => void; onCloseReview: () => void;
}) {
  if (reviewMoves) {
    return (
      <>
        <button className="btn ghost" style={{ marginBottom: 12 }} onClick={onCloseReview}>← Back to games</button>
        <GameReview moves={reviewMoves} mySide={opening.side} onClose={onCloseReview} />
      </>
    );
  }
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <span className="kicker">Master games · {opening.name}</span>
      <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
        Real games from the Lichess masters database that reached this opening. Tap one to replay it with engine analysis.
      </p>
      {reviewErr && <p style={{ color: "var(--loss)", fontSize: 13, marginTop: 8 }}>Couldn’t load that game — try another.</p>}
      {loadingGame && <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>Loading game…</p>}

      {gamesErr ? (
        <div style={{ marginTop: 10 }}>
          <p style={{ color: "var(--loss)", fontSize: 13 }}>Couldn’t load games — check your connection.</p>
          <button className="btn ghost" style={{ marginTop: 8 }} onClick={onRetry}>↻ Try again</button>
        </div>
      ) : games === null ? (
        <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>Loading master games…</p>
      ) : games.length === 0 ? (
        <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>No master games found for this line.</p>
      ) : (
        <div className="stack" style={{ gap: 6, marginTop: 10 }}>
          {games.map((g) => (
            <button key={g.gameId} onClick={() => onOpen(g)} disabled={loadingGame} className="num"
              style={{ textAlign: "left", padding: "9px 11px", borderRadius: 8, border: "1px solid var(--line)",
                background: "var(--surface-2)", color: "var(--ink)" }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>
                {g.white}{g.whiteElo ? ` (${g.whiteElo})` : ""} – {g.black}{g.blackElo ? ` (${g.blackElo})` : ""}
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                {resultDash(g.winner)}{g.year ? ` · ${g.year}` : ""}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
