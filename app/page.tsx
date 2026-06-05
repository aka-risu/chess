// app/page.tsx
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { addSignup, getTournament, listSignups, removeSignup, subscribeSignups, subscribeTournament } from "@/lib/supabase";
import { standings } from "@/lib/swiss";
import type { Signup, Tournament } from "@/lib/types";
import { Countdown, formatEventDate } from "@/components/Countdown";

const MINE_KEY = "swiss_my_signups";
const getMine = (): string[] => { try { return JSON.parse(localStorage.getItem(MINE_KEY) || "[]"); } catch { return []; } };
const setMine = (ids: string[]) => localStorage.setItem(MINE_KEY, JSON.stringify(ids));

const DEFAULT_LOCATION = "The office, Koh Tao";

export default function SignupPage() {
  const [name, setName] = useState("");
  const [signups, setSignups] = useState<Signup[]>([]);
  const [t, setT] = useState<Tournament | null>(null);
  const [mine, setMineState] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setSignups(await listSignups());
    setT(await getTournament());
  };
  useEffect(() => {
    const raf = requestAnimationFrame(() => setMineState(getMine()));
    refresh();
    const a = subscribeSignups(refresh);
    const b = subscribeTournament(refresh);
    return () => { cancelAnimationFrame(raf); a.unsubscribe(); b.unsubscribe(); };
  }, []);

  const submit = async () => {
    const n = name.trim();
    if (!n || busy) return;
    setBusy(true);
    const row = await addSignup(n);
    setBusy(false);
    if (row) {
      const next = [...getMine(), row.id]; setMine(next); setMineState(next);
      setName("");
    }
  };
  const withdraw = async (id: string) => {
    await removeSignup(id);
    const next = getMine().filter((x) => x !== id); setMine(next); setMineState(next);
  };

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
      {t?.event_at && status !== "active" && (
        <div className="muted" style={{ marginTop: 8 }}>{formatEventDate(t.event_at)}</div>
      )}
    </div>
  );

  if (status === "active") {
    return (
      <>
        {header}
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
        <button className="btn block" onClick={submit} disabled={!name.trim() || busy}>Sign me up</button>
      </div>

      <p className="kicker" style={{ marginTop: 18 }}>{signups.length} signed up</p>

      {t?.signups_public ? (
        <div className="stack" style={{ marginTop: 10 }}>
          {signups.map((sgn, i) => (
            <div key={sgn.id} className="card row" style={{ justifyContent: "space-between" }}>
              <span><span className="num" style={{ color: "var(--accent)", marginRight: 10 }}>{i + 1}</span>{sgn.name}</span>
              {mine.includes(sgn.id) && <button className="btn danger" onClick={() => withdraw(sgn.id)}>Remove</button>}
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
                  <span>✓ {sgn.name}</span>
                  <button className="btn danger" onClick={() => withdraw(sgn.id)}>Remove</button>
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
