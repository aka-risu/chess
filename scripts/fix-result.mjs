// One-off: fix Round 2 board 1 (Omri vs Amit) from black win -> white win (Omri won),
// in the live tournament.state AND the matching archived history row.
const url = "https://wulwvhmbwkasxyppkrnd.supabase.co";
const key = "sb_publishable_5uaM3BvkUEQm4u6dMJY3GQ_8S9U2nIO";
const H = { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json", Prefer: "return=representation" };

// --- replicate lib/swiss.ts deriveData + standings exactly ---
function deriveData(state) {
  const playerSet = new Set(state.players.map((p) => p.id));
  const d = {};
  for (const p of state.players) d[p.id] = { id: p.id, score: 0, opp: new Set(), oppList: [], results: {}, white: 0, black: 0, last: null, byes: 0, beat: [], drew: [], buch: 0, sb: 0 };
  for (let r = 0; r < state.schedule.length; r++) {
    const round = state.schedule[r];
    if (!round) continue;
    for (const game of round) {
      const { w, b, res } = game;
      if (b === null || res === "bye") { const W = d[w]; if (W) { W.byes++; W.results[r] = "bye"; if (res === "bye") W.score += 1; } continue; }
      const W = d[w], B = d[b];
      const wP = playerSet.has(w), bP = playerSet.has(b);
      if (wP && W) { W.white++; W.last = "w"; }
      if (bP && B) { B.black++; B.last = "b"; }
      if (wP && bP && W && B) {
        W.opp.add(b); W.oppList.push(b); B.opp.add(w); B.oppList.push(w);
        if (res === "w") { W.score += 1; W.results[r] = "+"; B.results[r] = "-"; W.beat.push(b); }
        else if (res === "b") { B.score += 1; W.results[r] = "-"; B.results[r] = "+"; B.beat.push(w); }
        else if (res === "d") { W.score += 0.5; B.score += 0.5; W.results[r] = "="; B.results[r] = "="; W.drew.push(b); B.drew.push(w); }
      }
    }
  }
  for (const p of state.players) {
    const pd = d[p.id]; if (!pd) continue;
    pd.buch = pd.oppList.reduce((s, o) => s + (d[o]?.score ?? 0), 0);
    pd.sb = pd.beat.reduce((s, o) => s + (d[o]?.score ?? 0), 0) + 0.5 * pd.drew.reduce((s, o) => s + (d[o]?.score ?? 0), 0);
  }
  return d;
}
function standings(state) {
  const d = deriveData(state);
  const nm = new Map(state.players.map((p) => [p.id, p.name]));
  return state.players.map((p) => ({ ...d[p.id], name: nm.get(p.id) ?? p.id, out: p.out }))
    .sort((a, b) => (b.score - a.score) || (b.buch - a.buch) || (b.sb - a.sb) || a.name.localeCompare(b.name));
}
const podium = (state) => standings(state).map((r) => ({ name: r.name, score: r.score, buch: r.buch, sb: r.sb }));
const fmt = (rows) => rows.map((r, i) => `  ${i + 1}. ${r.name}  ${r.score} (buch ${r.buch}, sb ${r.sb})`).join("\n");

(async () => {
  const [t] = await (await fetch(url + "/rest/v1/tournament?id=eq.current&select=*", { headers: H })).json();
  const state = t.state;
  const nm = Object.fromEntries(state.players.map((p) => [p.id, p.name]));
  const g = state.schedule[1][0];
  console.log(`Target [1,0]: ${nm[g.w]} (w) vs ${nm[g.b]} (b), res=${JSON.stringify(g.res)}`);
  if (nm[g.w] !== "Omri" || nm[g.b] !== "Amit") { console.error("ABORT: match does not match Omri vs Amit"); process.exit(1); }
  if (g.res !== "b") { console.error(`ABORT: expected res 'b', found ${JSON.stringify(g.res)}`); process.exit(1); }

  console.log("\nBEFORE standings:\n" + fmt(standings(state)));
  g.res = "w"; // Omri (white) won
  console.log("\nAFTER standings:\n" + fmt(standings(state)));

  // 1) live tournament.state
  const r1 = await fetch(url + "/rest/v1/tournament?id=eq.current", { method: "PATCH", headers: H, body: JSON.stringify({ state, updated_at: new Date().toISOString() }) });
  console.log("\nlive tournament PATCH:", r1.status, r1.ok ? "ok" : await r1.text());

  // 2) matching history row (uid == state.uid)
  const hid = state.uid;
  const r2 = await fetch(url + "/rest/v1/tournament_history?id=eq." + hid, { method: "PATCH", headers: H, body: JSON.stringify({ state, standings: podium(state) }) });
  console.log("history PATCH (" + hid + "):", r2.status, r2.ok ? "ok" : await r2.text());
})();
