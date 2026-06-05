// components/ChessClock.tsx
"use client";
import { useEffect, useState } from "react";

type Side = "top" | "bottom";
interface Preset { label: string; base: number; inc: number } // base seconds, inc seconds

const PRESETS: Preset[] = [
  { label: "3 + 2", base: 180, inc: 2 },
  { label: "5 + 0", base: 300, inc: 0 },
  { label: "10 + 5", base: 600, inc: 5 },
  { label: "15 + 0", base: 900, inc: 0 },
  { label: "15 + 10", base: 900, inc: 10 },
];

// Persisted clock state. `base` holds each side's remaining ms as of the start
// of the current running segment (`runStart`); the running side's displayed time
// is base - (now - runStart). Storing absolute timestamps means the clock
// restores correctly — and keeps counting — across tab navigation / reloads.
interface ClockState {
  cfg: Preset | null;
  base: { top: number; bottom: number };
  turn: Side | null;
  paused: boolean;
  started: boolean;
  runStart: number;
}

const KEY = "swiss_clock_v1";
const DEFAULT: ClockState = { cfg: null, base: { top: 0, bottom: 0 }, turn: null, paused: false, started: false, runStart: 0 };

function load(): ClockState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as ClockState;
    if (!s || typeof s !== "object") return null;
    return s;
  } catch { return null; }
}

const other = (s: Side): Side => (s === "top" ? "bottom" : "top");

function fmt(ms: number): string {
  if (ms <= 0) return "0.0";
  const total = ms / 1000;
  if (total < 20) return total.toFixed(1); // tenths under 20s
  const m = Math.floor(total / 60);
  const sec = Math.floor(total % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export function ChessClock() {
  const [st, setSt] = useState<ClockState>(DEFAULT);
  const [now, setNow] = useState(0);
  const [hydrated, setHydrated] = useState(false);

  // Restore persisted state on mount (client only).
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const saved = load();
      if (saved) setSt(saved);
      setNow(Date.now());
      setHydrated(true);
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  // Tick + flag detection. Only `now` changes per tick; clock math derives from
  // base/runStart, so we don't thrash persisted state every 100ms.
  useEffect(() => {
    if (!hydrated) return;
    const id = setInterval(() => {
      setNow(Date.now());
      setSt((s) => {
        if (!s.turn || s.paused) return s;
        if (s.base[s.turn] - (Date.now() - s.runStart) <= 0) {
          return { ...s, base: { ...s.base, [s.turn]: 0 }, turn: null }; // flag fall
        }
        return s;
      });
    }, 100);
    return () => clearInterval(id);
  }, [hydrated]);

  // Persist on every state change (events only — not per tick).
  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { /* ignore */ }
  }, [st, hydrated]);

  const live = (s: Side): number =>
    st.turn === s && !st.paused ? Math.max(0, st.base[s] - (now - st.runStart)) : st.base[s];

  const flagged: Side | null = live("top") <= 0 ? "top" : live("bottom") <= 0 ? "bottom" : null;

  const start = (p: Preset) =>
    setSt({ cfg: p, base: { top: p.base * 1000, bottom: p.base * 1000 }, turn: null, paused: false, started: false, runStart: 0 });

  const tap = (side: Side) => {
    if (!st.cfg || st.paused || flagged) return;
    if (st.turn === null) {
      // First press: presser moved, so the OTHER player's clock starts.
      setSt((s) => ({ ...s, started: true, turn: other(side), runStart: Date.now() }));
      return;
    }
    if (side !== st.turn) return; // only the player to move presses their own clock
    setSt((s) => {
      const t = Date.now();
      const cur = s.turn as Side;
      const remaining = Math.max(0, s.base[cur] - (t - s.runStart)) + (s.cfg?.inc ?? 0) * 1000;
      return { ...s, base: { ...s.base, [cur]: remaining }, turn: other(cur), runStart: t };
    });
  };

  const togglePause = () =>
    setSt((s) => {
      if (!s.turn) return { ...s, paused: !s.paused };
      if (!s.paused) {
        const remaining = Math.max(0, s.base[s.turn] - (Date.now() - s.runStart));
        return { ...s, paused: true, base: { ...s.base, [s.turn]: remaining } };
      }
      return { ...s, paused: false, runStart: Date.now() };
    });

  if (!hydrated) {
    return <><div className="mast"><span className="title">Chess Clock</span></div><div className="empty">Loading…</div></>;
  }

  // --- Picker ---
  if (!st.cfg) {
    return (
      <>
        <div className="mast"><span className="title">Chess Clock</span></div>
        <p className="muted">Pick a time control. The clock runs locally on this device — tap your side after each move. It keeps running if you switch tabs.</p>
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
    `side ${side === "top" ? "top" : ""} ${st.turn === side ? "active" : ""} ${flagged === side ? "flagged" : ""}`;

  const sideEl = (side: Side) => (
    <div className={sideClass(side)} onClick={() => tap(side)}>
      <div className="time">{fmt(live(side))}</div>
      <div className="meta">
        {flagged === side ? "Flag — time out"
          : st.turn === side ? (st.paused ? "Paused" : "Running · tap when done")
          : st.started ? "Waiting" : "Tap to start"}
      </div>
    </div>
  );

  return (
    <div className="clock">
      {sideEl("top")}
      <div className="controls">
        <button className="btn ghost grow" onClick={togglePause} disabled={!st.started || !!flagged}>
          {st.paused ? "Resume" : "Pause"}
        </button>
        <button className="btn ghost grow" onClick={() => st.cfg && start(st.cfg)}>Reset</button>
        <button className="btn ghost grow" onClick={() => setSt((s) => ({ ...s, cfg: null }))}>Change</button>
      </div>
      {sideEl("bottom")}
    </div>
  );
}

// Custom time-control entry (minutes + increment).
function CustomStart({ onStart }: { onStart: (p: Preset) => void }) {
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
