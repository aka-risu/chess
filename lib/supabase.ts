// lib/supabase.ts
"use client";
import { createClient, type RealtimeChannel } from "@supabase/supabase-js";
import type { Signup, Tournament, TournamentState } from "./types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(url, key);

let channelSeq = 0;

const TID = "current";

export async function getTournament(): Promise<Tournament | null> {
  const { data, error } = await supabase.from("tournament").select("*").eq("id", TID).single();
  if (error) { console.error("getTournament", error); return null; }
  return data as Tournament;
}

export async function saveTournament(
  patch: Partial<Pick<Tournament, "title" | "rounds" | "status" | "state">>,
): Promise<void> {
  const { error } = await supabase
    .from("tournament")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", TID);
  if (error) throw error;
}

export async function saveState(state: TournamentState): Promise<void> {
  return saveTournament({ state });
}

export async function listSignups(): Promise<Signup[]> {
  const { data, error } = await supabase.from("signups").select("*").order("created_at");
  if (error) { console.error("listSignups", error); return []; }
  return (data ?? []) as Signup[];
}

export async function addSignup(name: string): Promise<Signup | null> {
  const { data, error } = await supabase.from("signups").insert({ name }).select().single();
  if (error) { console.error("addSignup", error); return null; }
  return data as Signup;
}

export async function removeSignup(id: string): Promise<void> {
  const { error } = await supabase.from("signups").delete().eq("id", id);
  if (error) throw error;
}

export function subscribeTournament(onChange: () => void): RealtimeChannel {
  return supabase
    .channel("tournament-changes-" + (++channelSeq))
    .on("postgres_changes", { event: "*", schema: "public", table: "tournament" }, onChange)
    .subscribe();
}

export function subscribeSignups(onChange: () => void): RealtimeChannel {
  return supabase
    .channel("signups-changes-" + (++channelSeq))
    .on("postgres_changes", { event: "*", schema: "public", table: "signups" }, onChange)
    .subscribe();
}
