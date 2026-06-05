// app/history/page.tsx
"use client";
import { useEffect, useState } from "react";
import { listHistory, setHistoryVisible, subscribeHistory } from "@/lib/supabase";
import { sharePodium } from "@/lib/share";
import type { HistoryEntry } from "@/lib/types";

const UNLOCK_KEY = "swiss_admin_unlocked";
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const MEDALS = ["🥇", "🥈", "🥉"];

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export default function HistoryPage() {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [isOrganizer, setIsOrganizer] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

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

  const header = <div className="mast"><span className="title">Past tournaments</span></div>;

  if (entries === null) return <>{header}<div className="empty">Loading…</div></>;

  const shown = isOrganizer ? entries : entries.filter((e) => e.visible);
  if (shown.length === 0) {
    return <>{header}<div className="empty">No finished tournaments yet.<br />They appear here once a tournament ends.</div></>;
  }

  return (
    <>
      {header}
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

              {/* Full standings (expandable) */}
              {isOpen && e.standings.length > 3 && (
                <div className="stack" style={{ gap: 4, marginTop: 6, borderTop: "1px solid var(--line)", paddingTop: 8 }}>
                  {e.standings.slice(3).map((p, i) => (
                    <div key={i} className="row" style={{ justifyContent: "space-between", color: "var(--ink-soft)" }}>
                      <span className="num" style={{ gap: 10 }}><span style={{ color: "var(--ink-dim)" }}>{i + 4}.</span> {p.name}</span>
                      <span className="num">{fmt(p.score)}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="row" style={{ gap: 8, marginTop: 6 }}>
                {e.standings.length > 3 && (
                  <button className="btn ghost grow" onClick={() => toggleExpand(e.id)}>
                    {isOpen ? "Hide standings" : `Full standings (${e.standings.length})`}
                  </button>
                )}
                <button className="btn grow" onClick={() => sharePodium(e)}>↗ Share</button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
