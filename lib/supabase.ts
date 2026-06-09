// lib/supabase.ts
"use client";
import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import { emptyState, type HistoryEntry, type Signup, type Tournament, type TournamentState } from "./types";
import { isTestMode } from "./mode";

let _client: SupabaseClient | null = null;

// Lazily create the client so a missing env var (e.g. during build-time
// prerendering) doesn't crash module evaluation. The client is only built
// the first time a data function actually runs.
function supabase() {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase env vars missing: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }
  _client = createClient(url, key);
  return _client;
}

let channelSeq = 0;

const TID = "current";

// Turn a Supabase/PostgREST error object into a readable Error (so callers and
// the Next overlay show a real message instead of "[object Object]").
function fail(where: string, error: { message?: string; details?: string; hint?: string; code?: string }): never {
  const parts = [error?.message, error?.details, error?.hint, error?.code].filter(Boolean);
  throw new Error(`${where}: ${parts.join(" · ") || "Supabase error"}`);
}

// In-memory caches of the last successful fetch. Switching tabs unmounts/remounts
// a page; seeding state from these lets it render instantly instead of flashing a
// "Loading…" state, then refresh silently. Loading shows only on the very first
// fetch (cache still null).
let _cacheT: Tournament | null = null;
let _cacheS: Signup[] | null = null;
let _cacheH: HistoryEntry[] | null = null;
export const cachedTournament = (): Tournament | null => (isTestMode() ? _test?.tournament ?? null : _cacheT);
export const cachedSignups = (): Signup[] | null => (isTestMode() ? _test?.signups ?? null : _cacheS);
export const cachedHistory = (): HistoryEntry[] | null => (isTestMode() ? _test?.history ?? null : _cacheH);

// --- Test mode (local sandbox; see lib/mode.ts) ---
// While `?test` is active, all reads/writes hit this in-memory snapshot and the
// database is never touched. A tiny local pub/sub keeps the UI reactive.
interface TestData { tournament: Tournament | null; signups: Signup[]; history: HistoryEntry[]; }
let _test: TestData | null = null;
const _testListeners = {
  tournament: new Set<() => void>(),
  signups: new Set<() => void>(),
  history: new Set<() => void>(),
};
function notify(kind: keyof typeof _testListeners) { _testListeners[kind].forEach((fn) => fn()); }
function fakeChannel(kind: keyof typeof _testListeners, onChange: () => void): RealtimeChannel {
  _testListeners[kind].add(onChange);
  return { unsubscribe: () => { _testListeners[kind].delete(onChange); } } as unknown as RealtimeChannel;
}
function blankTournament(): Tournament {
  return {
    id: TID, title: "Test Tournament", rounds: 4, status: "setup", state: emptyState(),
    location: null, event_at: null, signups_public: false, show_sponsor: false, show_venue: false,
    updated_at: new Date().toISOString(),
  };
}
// Seed the sandbox once from a read-only copy of live data (blank if unreachable).
async function ensureTestSeed(): Promise<TestData> {
  if (_test) return _test;
  let tournament: Tournament | null = null, signups: Signup[] = [], history: HistoryEntry[] = [];
  try {
    const c = supabase();
    const [tr, sr, hr] = await Promise.all([
      c.from("tournament").select("*").eq("id", TID).single(),
      c.from("signups").select("*").order("created_at"),
      c.from("tournament_history").select("*").order("finished_at", { ascending: false }),
    ]);
    tournament = (tr.data as Tournament) ?? null;
    signups = (sr.data ?? []) as Signup[];
    history = (hr.data ?? []) as HistoryEntry[];
  } catch { /* offline / no DB → blank sandbox */ }
  _test = {
    tournament: tournament ? structuredClone(tournament) : null,
    signups: structuredClone(signups),
    history: structuredClone(history),
  };
  return _test;
}

export async function getTournament(): Promise<Tournament | null> {
  if (isTestMode()) return (await ensureTestSeed()).tournament;
  const { data, error } = await supabase().from("tournament").select("*").eq("id", TID).single();
  if (error) { console.error("getTournament", error); return null; }
  _cacheT = data as Tournament;
  return _cacheT;
}

export async function saveTournament(
  patch: Partial<Pick<Tournament, "title" | "rounds" | "status" | "state" | "location" | "event_at" | "signups_public" | "show_sponsor" | "show_venue">>,
): Promise<void> {
  if (isTestMode()) {
    const d = await ensureTestSeed();
    d.tournament = { ...(d.tournament ?? blankTournament()), ...patch, updated_at: new Date().toISOString() };
    notify("tournament");
    return;
  }
  const { error } = await supabase()
    .from("tournament")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", TID);
  if (error) fail("Supabase write", error);
}

export async function saveState(state: TournamentState): Promise<void> {
  return saveTournament({ state });
}

/**
 * Record a game's moves with a fresh read-modify-write, so a player editing
 * notation doesn't clobber a concurrent result entry. Anyone may record moves.
 */
export async function saveGameMoves(roundIdx: number, gameIdx: number, moves: string): Promise<void> {
  const t = await getTournament();
  if (!t) return;
  const state: TournamentState = structuredClone(t.state);
  const game = state.schedule[roundIdx]?.[gameIdx];
  if (!game) return;
  const trimmed = moves.trim();
  if (trimmed) game.moves = trimmed; else delete game.moves;
  await saveTournament({ state });
}

/**
 * Let a player report the result of their own board, add-only, with a fresh
 * read-modify-write so it can't clobber a concurrent entry. Guards: the round
 * must be the latest one, the game must exist, not be a bye, and not already
 * have a result (the "report once" rule). Round progression / finishing stays
 * admin-only, so this never changes status or archives.
 */
export async function reportResult(roundIdx: number, gameIdx: number, res: "w" | "d" | "b"): Promise<void> {
  const t = await getTournament();
  if (!t) return;
  const state: TournamentState = structuredClone(t.state);
  if (roundIdx !== state.schedule.length - 1) return; // not the live round
  const game = state.schedule[roundIdx]?.[gameIdx];
  if (!game || game.b === null || game.res !== null) return;
  game.res = res;
  await saveTournament({ state });
}

/**
 * Withdraw a player mid-tournament. Their past games are kept (so opponents'
 * Buchholz is unaffected) but they're never paired again. Any unfinished game
 * they have in the latest round is forfeited to the opponent (full point). Does
 * not change status — the organiser still advances/finishes the round.
 */
export async function withdrawPlayer(playerId: string): Promise<void> {
  const t = await getTournament();
  if (!t) return;
  const state: TournamentState = structuredClone(t.state);
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return;
  player.out = true;
  // Forfeit any unfinished current-round game (a real pairing, not a bye).
  const latest = state.schedule[state.schedule.length - 1];
  if (latest) {
    for (const g of latest) {
      if (g.res !== null || g.b === null) continue;
      if (g.w === playerId) g.res = "b"; // opponent (black) wins
      else if (g.b === playerId) g.res = "w"; // opponent (white) wins
    }
  }
  await saveTournament({ state });
}

/**
 * Add a latecomer mid-tournament. They join at 0 points and are paired from the
 * next round the organiser generates. Returns the new player's id.
 */
export async function addLatePlayer(name: string, level?: number): Promise<string | null> {
  const t = await getTournament();
  if (!t) return null;
  const trimmed = name.trim();
  if (!trimmed) return null;
  const state: TournamentState = structuredClone(t.state);
  const id = crypto.randomUUID();
  state.players.push({ id, name: trimmed, level });
  await saveTournament({ state });
  return id;
}

export async function listSignups(): Promise<Signup[]> {
  if (isTestMode()) return (await ensureTestSeed()).signups;
  const { data, error } = await supabase().from("signups").select("*").order("created_at");
  if (error) { console.error("listSignups", error); return _cacheS ?? []; }
  _cacheS = (data ?? []) as Signup[];
  return _cacheS;
}

export async function addSignup(name: string, level?: number): Promise<Signup | null> {
  if (isTestMode()) {
    const d = await ensureTestSeed();
    const row: Signup = { id: crypto.randomUUID(), name, level, created_at: new Date().toISOString() };
    d.signups.push(row); notify("signups"); return row;
  }
  const { data, error } = await supabase().from("signups").insert({ name, level }).select().single();
  if (error) { console.error("addSignup", error); return null; }
  return data as Signup;
}

export async function removeSignup(id: string): Promise<void> {
  if (isTestMode()) {
    const d = await ensureTestSeed();
    d.signups = d.signups.filter((s) => s.id !== id); notify("signups"); return;
  }
  const { error } = await supabase().from("signups").delete().eq("id", id);
  if (error) fail("Supabase write", error);
}

export function subscribeTournament(onChange: () => void): RealtimeChannel {
  if (isTestMode()) return fakeChannel("tournament", onChange);
  return supabase()
    .channel("tournament-changes-" + (++channelSeq))
    .on("postgres_changes", { event: "*", schema: "public", table: "tournament" }, onChange)
    .subscribe();
}

export function subscribeSignups(onChange: () => void): RealtimeChannel {
  if (isTestMode()) return fakeChannel("signups", onChange);
  return supabase()
    .channel("signups-changes-" + (++channelSeq))
    .on("postgres_changes", { event: "*", schema: "public", table: "signups" }, onChange)
    .subscribe();
}

// --- Tournament history ---

/** Insert or update an archived tournament (keyed by id). Leaves `visible` untouched on update. */
export async function upsertHistory(
  e: Pick<HistoryEntry, "id" | "title" | "location" | "event_at" | "rounds" | "standings" | "state">,
): Promise<void> {
  if (isTestMode()) {
    const d = await ensureTestSeed();
    const idx = d.history.findIndex((h) => h.id === e.id);
    const visible = idx >= 0 ? d.history[idx].visible : true;
    const row: HistoryEntry = { ...e, finished_at: new Date().toISOString(), visible };
    if (idx >= 0) d.history[idx] = row; else d.history.unshift(row);
    notify("history");
    return;
  }
  const { error } = await supabase()
    .from("tournament_history")
    .upsert(
      { ...e, finished_at: new Date().toISOString() },
      { onConflict: "id" },
    );
  if (error) console.error("upsertHistory", error);
}

/** All archived tournaments, newest first. Caller filters by `visible` for public views. */
export async function listHistory(): Promise<HistoryEntry[]> {
  if (isTestMode()) return (await ensureTestSeed()).history;
  const { data, error } = await supabase()
    .from("tournament_history")
    .select("*")
    .order("finished_at", { ascending: false });
  if (error) { console.error("listHistory", error); return _cacheH ?? []; }
  _cacheH = (data ?? []) as HistoryEntry[];
  return _cacheH;
}

export async function setHistoryVisible(id: string, visible: boolean): Promise<void> {
  if (isTestMode()) {
    const d = await ensureTestSeed();
    d.history = d.history.map((h) => (h.id === id ? { ...h, visible } : h)); notify("history"); return;
  }
  const { error } = await supabase().from("tournament_history").update({ visible }).eq("id", id);
  if (error) fail("Supabase write", error);
}

export async function deleteHistory(id: string): Promise<void> {
  if (isTestMode()) {
    const d = await ensureTestSeed();
    d.history = d.history.filter((h) => h.id !== id); notify("history"); return;
  }
  const { error } = await supabase().from("tournament_history").delete().eq("id", id);
  if (error) fail("Supabase write", error);
}

export function subscribeHistory(onChange: () => void): RealtimeChannel {
  if (isTestMode()) return fakeChannel("history", onChange);
  return supabase()
    .channel("history-changes-" + (++channelSeq))
    .on("postgres_changes", { event: "*", schema: "public", table: "tournament_history" }, onChange)
    .subscribe();
}
