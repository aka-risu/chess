// components/ChessClock.tsx
"use client";
import { useEffect, useRef, useState } from "react";

type Side = "top" | "bottom";
interface Preset { label: string; base: number; inc: number } // base seconds, inc seconds

const PRESETS: Preset[] = [
  { label: "3 + 2", base: 180, inc: 2 },
  { label: "5 + 0", base: 300, inc: 0 },
  { label: "10 + 5", base: 600, inc: 5 },
  { label: "15 + 10", base: 900, inc: 10 },
];

function fmt(ms: number): string {
  if (ms <= 0) return "0.0";
  const total = ms / 1000;
  if (total < 20) return total.toFixed(1); // tenths under 20s
  const m = Math.floor(total / 60);
  const s = Math.floor(total % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function ChessClock() {
  const [cfg, setCfg] = useState<Preset | null>(null);
  const [times, setTimes] = useState<{ top: number; bottom: number }>({ top: 0, bottom: 0 });
  const [turn, setTurn] = useState<Side | null>(null); // whose clock is currently running
  const [paused, setPaused] = useState(false);
  const [started, setStarted] = useState(false);
  const last = useRef<number>(0);

  // Tick the running clock based on real elapsed time.
  useEffect(() => {
    if (!turn || paused) return;
    last.current = Date.now();
    const id = setInterval(() => {
      const now = Date.now();
      const delta = now - last.current;
      last.current = now;
      setTimes((prev) => {
        const next = Math.max(0, prev[turn] - delta);
        if (next === 0) setTurn(null); // flag fall
        return { ...prev, [turn]: next };
      });
    }, 100);
    return () => clearInterval(id);
  }, [turn, paused]);

  const start = (p: Preset) => {
    setCfg(p);
    setTimes({ top: p.base * 1000, bottom: p.base * 1000 });
    setTurn(null);
    setPaused(false);
    setStarted(false);
  };

  const flaggedSide: Side | null =
    times.top <= 0 ? "top" : times.bottom <= 0 ? "bottom" : null;

  const tap = (side: Side) => {
    if (!cfg || paused || flaggedSide) return;
    if (turn === null) {
      // First press: the presser moved, so the OTHER player's clock starts.
      setStarted(true);
      setTurn(side === "top" ? "bottom" : "top");
      return;
    }
    if (side !== turn) return; // only the player to move presses their own clock
    // End this player's move: add increment, hand over to opponent.
    setTimes((prev) => ({ ...prev, [side]: prev[side] + cfg.inc * 1000 }));
    setTurn(side === "top" ? "bottom" : "top");
  };

  // --- Picker ---
  if (!cfg) {
    return (
      <>
        <div className="mast"><span className="title">Chess Clock</span></div>
        <p className="muted">Pick a time control. The clock runs locally on this device — tap your side after each move.</p>
        <div className="stack" style={{ marginTop: 16 }}>
          {PRESETS.map((p) => (
            <button key={p.label} className="btn block" onClick={() => start(p)}>{p.label}</button>
          ))}
          <CustomStart onStart={start} />
        </div>
      </>
    );
  }

  const sideClass = (side: Side) =>
    `side ${side === "top" ? "top" : ""} ${turn === side ? "active" : ""} ${flaggedSide === side ? "flagged" : ""}`;

  const sideEl = (side: Side) => (
    <div className={sideClass(side)} onClick={() => tap(side)}>
      <div className="time">{fmt(times[side])}</div>
      <div className="meta">
        {flaggedSide === side ? "Flag — time out"
          : turn === side ? "Running · tap when done"
          : started ? "Waiting" : "Tap to start"}
      </div>
    </div>
  );

  return (
    <div className="clock">
      {sideEl("top")}
      <div className="controls">
        <button className="btn ghost grow" onClick={() => setPaused((p) => !p)} disabled={!started || !!flaggedSide}>
          {paused ? "Resume" : "Pause"}
        </button>
        <button className="btn ghost grow" onClick={() => cfg && start(cfg)}>Reset</button>
        <button className="btn ghost grow" onClick={() => setCfg(null)}>Change</button>
      </div>
      {sideEl("bottom")}
    </div>
  );
}

// Custom time-control entry (minutes + increment).
function CustomStart({ onStart }: { onStart: (p: { label: string; base: number; inc: number }) => void }) {
  const [open, setOpen] = useState(false);
  const [min, setMin] = useState(10);
  const [inc, setInc] = useState(0);
  if (!open) return <button className="btn block ghost" onClick={() => setOpen(true)}>Custom…</button>;
  return (
    <div className="card stack">
      <label className="kicker">Minutes per player</label>
      <input type="number" min={1} max={180} value={min} onChange={(e) => setMin(Math.max(1, Number(e.target.value)))} />
      <label className="kicker">Increment (seconds)</label>
      <input type="number" min={0} max={60} value={inc} onChange={(e) => setInc(Math.max(0, Number(e.target.value)))} />
      <button className="btn block" onClick={() => onStart({ label: `${min} + ${inc}`, base: min * 60, inc })}>
        Start {min} + {inc}
      </button>
    </div>
  );
}
