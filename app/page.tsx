// app/page.tsx
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { addSignup, getTournament, listSignups, removeSignup, subscribeSignups, subscribeTournament } from "@/lib/supabase";
import type { Signup, TournamentStatus } from "@/lib/types";

const MINE_KEY = "swiss_my_signups";
const getMine = (): string[] => { try { return JSON.parse(localStorage.getItem(MINE_KEY) || "[]"); } catch { return []; } };
const setMine = (ids: string[]) => localStorage.setItem(MINE_KEY, JSON.stringify(ids));

export default function SignupPage() {
  const [name, setName] = useState("");
  const [signups, setSignups] = useState<Signup[]>([]);
  const [status, setStatus] = useState<TournamentStatus>("setup");
  const [mine, setMineState] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setSignups(await listSignups());
    const t = await getTournament();
    if (t) setStatus(t.status);
  };
  useEffect(() => {
    setMineState(getMine());
    refresh();
    const a = subscribeSignups(refresh);
    const b = subscribeTournament(refresh);
    return () => { a.unsubscribe(); b.unsubscribe(); };
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

  if (status !== "setup") {
    return (
      <>
        <div className="mast"><span className="kicker">Swiss Tournament</span></div>
        <div className="empty">
          Sign-up is closed — the tournament has started.<br />
          <Link className="btn" style={{ marginTop: 14 }} href="/results">View live results →</Link>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="mast"><span className="kicker">Swiss Tournament</span><span className="pill">Sign-up open</span></div>
      <h2 className="section">Sign up to play</h2>
      <p className="muted">Enter your name to join the next tournament. No account needed.</p>
      <div className="stack" style={{ margin: "16px 0" }}>
        <input type="text" placeholder="Your name" value={name} maxLength={40}
          onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
        <button className="btn block" onClick={submit} disabled={!name.trim() || busy}>Sign me up</button>
      </div>
      <p className="kicker" style={{ marginTop: 18 }}>{signups.length} signed up</p>
      <div className="stack">
        {signups.map((sgn, i) => (
          <div key={sgn.id} className="card row" style={{ justifyContent: "space-between" }}>
            <span><span className="num" style={{ color: "var(--accent)", marginRight: 10 }}>{i + 1}</span>{sgn.name}</span>
            {mine.includes(sgn.id) && <button className="btn danger" onClick={() => withdraw(sgn.id)}>Remove</button>}
          </div>
        ))}
        {signups.length === 0 && <div className="empty">No one yet — be the first.</div>}
      </div>
    </>
  );
}
