// components/PairingBoard.tsx
"use client";
import type { Game } from "@/lib/types";

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export function PairingBoard({
  game, board, nameOf, wpts, bpts, editable, onResult,
}: {
  game: Game; board: number; nameOf: (id: string) => string;
  wpts: number; bpts: number; editable: boolean;
  onResult?: (res: "w" | "d" | "b") => void;
}) {
  if (game.b === null) {
    return (
      <div className="card" style={{ borderStyle: "dashed", borderColor: "var(--accent-2)", marginBottom: 9 }}>
        <span className="num" style={{ color: "var(--accent-2)" }}>BYE</span> — <b>{nameOf(game.w)}</b> sits out (+1)
      </div>
    );
  }
  const seat = (id: string, color: "w" | "b", pts: number, won: boolean, lost: boolean) => (
    <div className="row" style={{ justifyContent: "space-between", padding: "6px 0" }}>
      <span className="row" style={{ gap: 10 }}>
        <span style={{
          width: 14, height: 14, borderRadius: "50%", flex: "none",
          background: color === "w" ? "var(--ink)" : "transparent",
          border: "2px solid var(--ink)",
        }} />
        <span style={{ fontWeight: won ? 800 : 500, color: lost ? "var(--loss)" : "var(--ink)" }}>{nameOf(id)}</span>
      </span>
      <span className="num muted">{fmt(pts)}</span>
    </div>
  );
  const btn = (code: "w" | "d" | "b", label: string) => (
    <button
      onClick={editable && onResult ? () => onResult(code) : undefined}
      disabled={!editable}
      className="num"
      style={{
        flex: 1, minHeight: 44, border: "1px solid var(--line)", background: game.res === code ? "var(--accent)" : "var(--surface-2)",
        color: game.res === code ? "#0b0d10" : "var(--ink-soft)", fontWeight: game.res === code ? 800 : 500,
        borderRadius: 8,
      }}
    >{label}</button>
  );
  return (
    <div className="card" style={{ marginBottom: 9 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="num" style={{ color: "var(--accent)" }}>Board {board}</span>
      </div>
      {seat(game.w, "w", wpts, game.res === "w", game.res === "b")}
      {seat(game.b, "b", bpts, game.res === "b", game.res === "w")}
      <div className="row" style={{ gap: 6, marginTop: 8 }}>
        {btn("w", "1–0")}{btn("d", "½")}{btn("b", "0–1")}
      </div>
    </div>
  );
}
