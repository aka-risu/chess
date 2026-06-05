// app/history/page.tsx
"use client";
import { useEffect, useState } from "react";
import { cachedHistory, deleteHistory, listHistory, setHistoryVisible, subscribeHistory } from "@/lib/supabase";
import { sharePodium } from "@/lib/share";
import { aggregate } from "@/lib/leaderboard";
import { standings } from "@/lib/swiss";
import { StandingsTable } from "@/components/StandingsTable";
import type { HistoryEntry } from "@/lib/types";

const UNLOCK_KEY = "swiss_admin_unlocked";
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const MEDALS = ["🥇", "🥈", "🥉"];
// Deleting history is destructive — only exposed when running locally (dev).
const IS_DEV = process.env.NODE_ENV !== "production";

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export default function HistoryPage() {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(cachedHistory());
  const [isOrganizer, setIsOrganizer] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<"events" | "alltime">("events");

  const refresh = async () => setEntries(await listHistory());
  useEffect(() => {
    const raf = requestAnimationFrame(() => setIsOrganizer(sessionStorage.getItem(UNLOCK_KEY) === "1"));
    refresh();
    const ch = subscribeHistory(refresh);
    return () => { cancelAnimationFrame(raf); ch.unsubscribe(); };
  }, []);

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  const toggleVisible = async (e: HistoryEntry) => {
    await setHistoryVisible(e.id, !e.visible);
    refresh();
  };

  const onDelete = async (e: HistoryEntry) => {
    if (!confirm(`Delete "${e.title}" from history? This cannot be undone.`)) return;
    await deleteHistory(e.id);
    refresh();
  };

  const header = <div className="mast"><span className="title">Past tournaments</span></div>;

  if (entries === null) return <>{header}<div className="empty">Loading…</div></>;

  const shown = isOrganizer ? entries : entries.filter((e) => e.visible);
  if (shown.length === 0) {
    return <>{header}<div className="empty">No finished tournaments yet.<br />They appear here once a tournament ends.</div></>;
  }

  const tab = (key: "events" | "alltime", label: string) => (
    <button
      onClick={() => setMode(key)}
      className="num"
      style={{
        flex: 1, minHeight: 40, borderRadius: 8, border: "1px solid var(--line)",
        background: mode === key ? "var(--accent)" : "transparent",
        color: mode === key ? "#0b0d10" : "var(--ink-soft)", fontWeight: mode === key ? 800 : 600,
        textTransform: "uppercase", letterSpacing: ".06em", fontSize: 12,
      }}
    >{label}</button>
  );

  const segmented = (
    <div className="row" style={{ gap: 8, margin: "8px 0 16px" }}>
      {tab("events", "Past events")}
      {tab("alltime", "All-time")}
    </div>
  );

  if (mode === "alltime") {
    const board = aggregate(shown);
    return (
      <>
        {header}
        {segmented}
        <p className="muted" style={{ marginBottom: 10 }}>Across {shown.length} event{shown.length === 1 ? "" : "s"} · ranked by wins.</p>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 15 }}>
            <thead>
              <tr className="num" style={{ color: "var(--ink-dim)", fontSize: 11 }}>
                <th style={{ textAlign: "right", padding: 8 }}>#</th>
                <th style={{ textAlign: "left", padding: 8 }}>Player</th>
                <th style={{ padding: 8 }}>🥇</th><th style={{ padding: 8 }}>Podiums</th>
                <th style={{ padding: 8 }}>Events</th><th style={{ padding: 8 }}>Pts</th>
              </tr>
            </thead>
            <tbody>
              {board.map((r, i) => (
                <tr key={r.name} style={{ borderTop: "1px solid var(--line)" }}>
                  <td className="num" style={{ textAlign: "right", padding: 8, color: "var(--accent)" }}>{i + 1}</td>
                  <td style={{ padding: 8, fontWeight: i === 0 ? 800 : 500 }}>{r.name}</td>
                  <td className="num" style={{ textAlign: "center", padding: 8, fontWeight: 800, color: "var(--accent)" }}>{r.wins}</td>
                  <td className="num" style={{ textAlign: "center", padding: 8, color: "var(--ink-soft)" }}>{r.podiums}</td>
                  <td className="num" style={{ textAlign: "center", padding: 8, color: "var(--ink-soft)" }}>{r.events}</td>
                  <td className="num" style={{ textAlign: "center", padding: 8, color: "var(--ink-soft)" }}>{r.points % 1 === 0 ? r.points : r.points.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    );
  }

  return (
    <>
      {header}
      {segmented}
      {!isOrganizer && <p className="muted" style={{ marginBottom: 12 }}>Champions of past events.</p>}
      <div className="stack" style={{ gap: 14 }}>
        {shown.map((e) => {
          const podium = e.standings.slice(0, 3);
          const isOpen = expanded.has(e.id);
          return (
            <div key={e.id} className="card stack" style={{ opacity: e.visible ? 1 : 0.55 }}>
              <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 17 }}>{e.title}</div>
                  <div className="muted" style={{ fontSize: 13 }}>
                    {[fmtDate(e.event_at || e.finished_at), e.location].filter(Boolean).join(" · ")}
                  </div>
                </div>
                {isOrganizer && (
                  <button className="pill" onClick={() => toggleVisible(e)}>
                    {e.visible ? "Visible" : "Hidden"}
                  </button>
                )}
              </div>

              {/* Podium */}
              <div className="stack" style={{ gap: 6, marginTop: 4 }}>
                {podium.map((p, i) => (
                  <div key={i} className="row" style={{ justifyContent: "space-between" }}>
                    <span className="row" style={{ gap: 10 }}>
                      <span style={{ fontSize: 20 }}>{MEDALS[i]}</span>
                      <span style={{ fontWeight: i === 0 ? 800 : 600 }}>{p.name}</span>
                    </span>
                    <span className="num" style={{ color: "var(--accent)", fontWeight: 700 }}>{fmt(p.score)}</span>
                  </div>
                ))}
              </div>

              {/* Full standings (expandable) — detailed table when we have the
                  saved engine state, else a simple list for older entries. */}
              {isOpen && (
                <div style={{ marginTop: 6, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
                  {e.state ? (
                    <StandingsTable
                      rows={standings(e.state)}
                      playedRounds={e.state.schedule.length}
                      champion
                    />
                  ) : (
                    <div className="stack" style={{ gap: 4 }}>
                      {e.standings.map((p, i) => (
                        <div key={i} className="row" style={{ justifyContent: "space-between", color: "var(--ink-soft)" }}>
                          <span className="num"><span style={{ color: "var(--ink-dim)" }}>{i + 1}.</span> {p.name}</span>
                          <span className="num">{fmt(p.score)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="row" style={{ gap: 8, marginTop: 6 }}>
                {(e.state || e.standings.length > 3) && (
                  <button className="btn ghost grow" onClick={() => toggleExpand(e.id)}>
                    {isOpen ? "Hide info" : "All info"}
                  </button>
                )}
                <button className="btn grow" onClick={() => sharePodium(e)}>↗ Share</button>
                {IS_DEV && <button className="btn danger" onClick={() => onDelete(e)}>Delete</button>}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
