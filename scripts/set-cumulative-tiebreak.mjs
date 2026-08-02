// One-off: put the 2026-08-02 (Recovery Koh Tao) event on the cumulative
// tiebreak. Sets state.tiebreak on the history row AND the matching live
// tournament row, then recomputes the archived standings column from the
// engine so the podium and the expandable table agree.
//
// Imports the real standings() rather than inlining a copy (as fix-result.mjs
// does): a duplicated engine could drift and rewrite the archived standings to
// something the history table then contradicts — the exact bug class this fixes.
// Node 20 cannot import .ts, so run this under tsx:
//   set -a && . ./.env.local && set +a && npx --yes tsx scripts/set-cumulative-tiebreak.mjs
import { standings } from "../lib/swiss.ts";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error("ABORT: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY");
  process.exit(1);
}

const ID = "2b55e66b-7af4-4a52-8d8b-01b51fe1fb22";
const H = { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json", Prefer: "return=representation" };
const podium = (state) => standings(state).map((r) => ({ name: r.name, score: r.score, buch: r.buch, sb: r.sb }));
const fmt = (rows) => rows.map((r, i) => `  ${i + 1}. ${r.name}  ${r.score} (buch ${r.buch}, sb ${r.sb})`).join("\n");

const [h] = await (await fetch(`${url}/rest/v1/tournament_history?id=eq.${ID}&select=*`, { headers: H })).json();
if (!h?.state) {
  console.error("ABORT: history row or its state not found");
  process.exit(1);
}

const state = h.state;
console.log("BEFORE (Buchholz):\n" + fmt(podium(state)));
state.tiebreak = "cumulative";
const after = podium(state);
console.log("\nAFTER (cumulative):\n" + fmt(after));
if (after[1].name !== "Rob" || after[2].name !== "Omri") {
  console.error(`ABORT: expected Rob 2nd and Omri 3rd, got ${after[1].name} / ${after[2].name}`);
  process.exit(1);
}

const r1 = await fetch(`${url}/rest/v1/tournament_history?id=eq.${ID}`, {
  method: "PATCH", headers: H, body: JSON.stringify({ state, standings: after }),
});
console.log("\nhistory PATCH:", r1.status, r1.ok ? "ok" : await r1.text());

// The live tournament row is still this event (same uid, status finished).
const [t] = await (await fetch(`${url}/rest/v1/tournament?id=eq.current&select=state`, { headers: H })).json();
if (t?.state?.uid === ID) {
  t.state.tiebreak = "cumulative";
  const r2 = await fetch(`${url}/rest/v1/tournament?id=eq.current`, {
    method: "PATCH", headers: H, body: JSON.stringify({ state: t.state, updated_at: new Date().toISOString() }),
  });
  console.log("live tournament PATCH:", r2.status, r2.ok ? "ok" : await r2.text());
} else {
  console.log("live tournament row is a different event (uid " + t?.state?.uid + ") — left untouched");
}
