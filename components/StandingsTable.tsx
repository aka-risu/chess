// components/StandingsTable.tsx
import type { StandingRow } from "@/lib/types";

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export function StandingsTable({ rows, playedRounds, champion }: { rows: StandingRow[]; playedRounds: number; champion: boolean }) {
  const mark = (m?: string) =>
    m === "+" ? "1" : m === "-" ? "0" : m === "=" ? "½" : m === "bye" ? "B" : "·";
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 15 }}>
        <thead>
          <tr className="num" style={{ color: "var(--ink-dim)", fontSize: 11 }}>
            <th style={{ textAlign: "right", padding: 8 }}>#</th>
            <th style={{ textAlign: "left", padding: 8 }}>Player</th>
            {Array.from({ length: playedRounds }, (_, i) => <th key={i} style={{ padding: 6 }}>R{i + 1}</th>)}
            <th style={{ padding: 8 }}>Pts</th><th style={{ padding: 8 }}>Buch</th><th style={{ padding: 8 }}>SB</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p, i) => (
            <tr key={p.id} style={{ borderTop: "1px solid var(--line)", background: champion && i === 0 ? "rgba(198,247,63,.10)" : undefined }}>
              <td className="num" style={{ textAlign: "right", padding: 8, color: "var(--accent)" }}>{i + 1}</td>
              <td style={{ padding: 8, fontWeight: champion && i === 0 ? 800 : 500 }}>{p.name}{champion && i === 0 ? " ♛" : ""}</td>
              {Array.from({ length: playedRounds }, (_, r) => (
                <td key={r} className="num" style={{ textAlign: "center", padding: 6, color: "var(--ink-soft)" }}>{mark(p.results[r])}</td>
              ))}
              <td className="num" style={{ textAlign: "center", padding: 8, fontWeight: 800, color: "var(--accent)" }}>{fmt(p.score)}</td>
              <td className="num" style={{ textAlign: "center", padding: 8, color: "var(--ink-soft)" }}>{fmt(p.buch)}</td>
              <td className="num" style={{ textAlign: "center", padding: 8, color: "var(--ink-soft)" }}>{fmt(p.sb)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
