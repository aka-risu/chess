// lib/supabase.ts
"use client";
import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import type { HistoryEntry, Signup, Tournament, TournamentState } from "./types";

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

export async function getTournament(): Promise<Tournament | null> {
  const { data, error } = await supabase().from("tournament").select("*").eq("id", TID).single();
  if (error) { console.error("getTournament", error); return null; }
  return data as Tournament;
}

export async function saveTournament(
  patch: Partial<Pick<Tournament, "title" | "rounds" | "status" | "state" | "location" | "event_at" | "signups_public">>,
): Promise<void> {
  const { error } = await supabase()
    .from("tournament")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", TID);
  if (error) throw error;
}

export async function saveState(state: TournamentState): Promise<void> {
  return saveTournament({ state });
}

export async function listSignups(): Promise<Signup[]> {
  const { data, error } = await supabase().from("signups").select("*").order("created_at");
  if (error) { console.error("listSignups", error); return []; }
  return (data ?? []) as Signup[];
}

export async function addSignup(name: string): Promise<Signup | null> {
  const { data, error } = await supabase().from("signups").insert({ name }).select().single();
  if (error) { console.error("addSignup", error); return null; }
  return data as Signup;
}

export async function removeSignup(id: string): Promise<void> {
  const { error } = await supabase().from("signups").delete().eq("id", id);
  if (error) throw error;
}

export function subscribeTournament(onChange: () => void): RealtimeChannel {
  return supabase()
    .channel("tournament-changes-" + (++channelSeq))
    .on("postgres_changes", { event: "*", schema: "public", table: "tournament" }, onChange)
    .subscribe();
}

export function subscribeSignups(onChange: () => void): RealtimeChannel {
  return supabase()
    .channel("signups-changes-" + (++channelSeq))
    .on("postgres_changes", { event: "*", schema: "public", table: "signups" }, onChange)
    .subscribe();
}

// --- Tournament history ---

/** Insert or update an archived tournament (keyed by id). Leaves `visible` untouched on update. */
export async function upsertHistory(
  e: Pick<HistoryEntry, "id" | "title" | "location" | "event_at" | "rounds" | "standings">,
): Promise<void> {
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
  const { data, error } = await supabase()
    .from("tournament_history")
    .select("*")
    .order("finished_at", { ascending: false });
  if (error) { console.error("listHistory", error); return []; }
  return (data ?? []) as HistoryEntry[];
}

export async function setHistoryVisible(id: string, visible: boolean): Promise<void> {
  const { error } = await supabase().from("tournament_history").update({ visible }).eq("id", id);
  if (error) throw error;
}

export function subscribeHistory(onChange: () => void): RealtimeChannel {
  return supabase()
    .channel("history-changes-" + (++channelSeq))
    .on("postgres_changes", { event: "*", schema: "public", table: "tournament_history" }, onChange)
    .subscribe();
}
