// app/page.tsx
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { addSignup, cachedSignups, cachedTournament, getTournament, listSignups, removeSignup, subscribeSignups, subscribeTournament } from "@/lib/supabase";
import { standings } from "@/lib/swiss";
import { DEFAULT_LEVEL, LEVELS, levelShort, type Signup, type Tournament } from "@/lib/types";
import { Countdown, formatEventDate } from "@/components/Countdown";
import { MyMatch } from "@/components/MyMatch";
import { SPONSOR } from "@/lib/sponsor";
import { ME_KEY, MINE_KEY } from "@/lib/identity";

const getMine = (): string[] => { try { return JSON.parse(localStorage.getItem(MINE_KEY) || "[]"); } catch { return []; } };
const setMine = (ids: string[]) => localStorage.setItem(MINE_KEY, JSON.stringify(ids));
const getMe = (): string | null => { try { return localStorage.getItem(ME_KEY); } catch { return null; } };
const setMe = (id: string | null) => { if (id) localStorage.setItem(ME_KEY, id); else localStorage.removeItem(ME_KEY); };

const DEFAULT_LOCATION = "The office, Koh Tao";

export default function SignupPage() {
  const [name, setName] = useState("");
  const [level, setLevel] = useState(DEFAULT_LEVEL);
  const [signups, setSignups] = useState<Signup[]>(cachedSignups() ?? []);
  const [t, setT] = useState<Tournament | null>(cachedTournament());
  const [mine, setMineState] = useState<string[]>([]);
  const [meState, setMeStateLocal] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(cachedTournament() === null);

  const refresh = async () => {
    setSignups(await listSignups());
    setT(await getTournament());
    setLoading(false);
  };
  useEffect(() => {
    const raf = requestAnimationFrame(() => { setMineState(getMine()); setMeStateLocal(getMe()); setNowMs(Date.now()); });
    refresh();
    const a = subscribeSignups(refresh);
    const b = subscribeTournament(refresh);
    return () => { cancelAnimationFrame(raf); a.unsubscribe(); b.unsubscribe(); };
  }, []);

  const submit = async () => {
    const n = name.trim();
    if (!n || busy) return;
    setBusy(true);
    const row = await addSignup(n, level);
    setBusy(false);
    if (row) {
      const next = [...getMine(), row.id]; setMine(next); setMineState(next);
      // First player registered on this device defaults to "me" (the common
      // case: you sign yourself up first, friends after). See lib/identity.ts.
      if (!getMe()) { setMe(row.id); setMeStateLocal(row.id); }
      setName("");
    }
  };
  const withdraw = async (id: string) => {
    await removeSignup(id);
    const next = getMine().filter((x) => x !== id); setMine(next); setMineState(next);
    if (getMe() === id) { setMe(null); setMeStateLocal(null); }
  };
  const chooseMe = (id: string) => { setMe(id); setMeStateLocal(id); };
  // Right-hand controls for a player this device registered. The "This is me"
  // toggle only appears when several were registered here — otherwise the single
  // one is implicitly you (see lib/identity.ts resolveMe).
  const ownerControls = (id: string) => (
    <span className="row" style={{ gap: 6 }}>
      {mine.length > 1 && (
        <button className="pill" onClick={() => chooseMe(id)}
          style={meState === id ? { background: "var(--accent)", color: "#0b0d10" } : undefined}>
          {meState === id ? "✓ This is me" : "This is me"}
        </button>
      )}
      <button className="btn danger" onClick={() => withdraw(id)}>Remove</button>
    </span>
  );

  const headerShell = (
    <div className="mast">
      <div>
        <span className="title">Chess Tournament</span>
        <div className="kicker" style={{ marginTop: 4 }}>Swiss system</div>
      </div>
    </div>
  );
  if (loading) return <>{headerShell}<div className="empty">Loading…</div></>;

  const status = t?.status ?? "setup";
  const location = t?.location || DEFAULT_LOCATION;
  const myEntries = signups.filter((s) => mine.includes(s.id));

  const header = (
    <div className="mast">
      <div>
        <span className="title">Chess Tournament</span>
        <div className="kicker" style={{ marginTop: 4 }}>Swiss system</div>
      </div>
      <span className={status === "active" ? "pill live" : "pill"}>
        {status === "setup" ? "Sign-up open" : status === "active" ? "Live" : "Finished"}
      </span>
    </div>
  );

  // --- Finished: announce the winner ---
  if (status === "finished" && t) {
    const rows = standings(t.state);
    return (
      <>
        {header}
        <div className="finished">
          <span className="kicker label">Tournament finished</span>
          <div className="win">🏆 {rows[0]?.name ?? "—"}</div>
          <div className="muted" style={{ marginTop: 6 }}>is the champion</div>
          {t.show_sponsor && <div className="muted" style={{ marginTop: 8, fontSize: 13 }}>Organized by {SPONSOR.name}</div>}
        </div>
        <Link className="btn block" href="/results">View full results →</Link>
      </>
    );
  }

  // --- Event card (shown for setup + active) ---
  const eventCard = (
    <div className="event">
      <span className="kicker">Next event</span>
      <div className="where">{location}</div>
      {status === "active"
        ? <div className="big">In progress ♟</div>
        : <Countdown target={t?.event_at ?? null} />}
      {t?.event_at && status !== "active" && !(nowMs !== null && new Date(t.event_at).getTime() <= nowMs) && (
        <div className="muted" style={{ marginTop: 8 }}>{formatEventDate(t.event_at)}</div>
      )}
    </div>
  );

  if (status === "active") {
    return (
      <>
        {header}
        <MyMatch t={t!} />
        {eventCard}
        <div className="empty">
          The tournament has started — sign-up is closed.<br />
          <Link className="btn" style={{ marginTop: 14 }} href="/results">View live results →</Link>
        </div>
      </>
    );
  }

  // --- Setup: sign-up form ---
  return (
    <>
      {header}
      {eventCard}
      <h2 className="section">Sign up to play</h2>
      <p className="muted">Enter your name to join the next tournament. No account needed.</p>
      <div className="stack" style={{ margin: "16px 0" }}>
        <input type="text" placeholder="Your name" value={name} maxLength={40}
          onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
        <span className="kicker">Your level</span>
        <div className="row" style={{ gap: 6 }}>
          {LEVELS.map((l) => (
            <button key={l.value} onClick={() => setLevel(l.value)} className="num"
              style={{
                flex: 1, minHeight: 44, borderRadius: 8, border: "1px solid var(--line)",
                background: level === l.value ? "var(--accent)" : "var(--surface-2)",
                color: level === l.value ? "#0b0d10" : "var(--ink-soft)", fontWeight: level === l.value ? 800 : 600,
                fontSize: 12, textTransform: "uppercase", letterSpacing: ".03em",
              }}>{l.label}</button>
          ))}
        </div>
        <button className="btn block" onClick={submit} disabled={!name.trim() || busy}>Sign me up</button>
      </div>

      <p className="kicker" style={{ marginTop: 18 }}>{signups.length} signed up</p>

      {t?.signups_public ? (
        <div className="stack" style={{ marginTop: 10 }}>
          {signups.map((sgn, i) => (
            <div key={sgn.id} className="card row" style={{ justifyContent: "space-between" }}>
              <span className="row" style={{ gap: 8 }}>
                <span className="num" style={{ color: "var(--accent)" }}>{i + 1}</span>{sgn.name}
                {sgn.level && <span className="pill" style={{ padding: "2px 8px", fontSize: 10 }}>{levelShort(sgn.level)}</span>}
              </span>
              {mine.includes(sgn.id) && ownerControls(sgn.id)}
            </div>
          ))}
          {signups.length === 0 && <div className="empty">No one yet — be the first.</div>}
        </div>
      ) : (
        <>
          {myEntries.length > 0 && (
            <div className="stack" style={{ marginTop: 10 }}>
              <span className="muted">You&apos;re signed up:</span>
              {myEntries.map((sgn) => (
                <div key={sgn.id} className="card row" style={{ justifyContent: "space-between" }}>
                  <span className="row" style={{ gap: 8 }}>✓ {sgn.name}
                    {sgn.level && <span className="pill" style={{ padding: "2px 8px", fontSize: 10 }}>{levelShort(sgn.level)}</span>}
                  </span>
                  {ownerControls(sgn.id)}
                </div>
              ))}
            </div>
          )}
          {signups.length === 0 && <div className="empty" style={{ marginTop: 10 }}>No one yet — be the first.</div>}
        </>
      )}
    </>
  );
}
