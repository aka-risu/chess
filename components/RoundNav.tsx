// components/RoundNav.tsx
"use client";

export function RoundNav({
  count, current, done, onPick,
}: { count: number; current: number; done: (i: number) => boolean; onPick: (i: number) => void }) {
  return (
    <div className="row" style={{ gap: 6, flexWrap: "wrap", margin: "8px 0 16px" }}>
      {Array.from({ length: count }, (_, i) => {
        const active = i === current;
        return (
          <button key={i} onClick={() => onPick(i)} className="num"
            style={{
              width: 38, height: 38, borderRadius: "50%",
              border: `1px solid ${done(i) ? "var(--accent)" : "var(--line)"}`,
              background: active ? "var(--accent)" : "transparent",
              color: active ? "#0b0d10" : done(i) ? "var(--accent)" : "var(--ink-soft)",
              fontWeight: active ? 800 : 500,
            }}>{i + 1}</button>
        );
      })}
    </div>
  );
}
