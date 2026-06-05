// lib/types.ts
export type Id = string;

export interface Player {
  id: Id;
  name: string;
}

/** Game result: null = unreported, 'w' white win, 'b' black win, 'd' draw, 'bye' */
export type GameResult = null | "w" | "b" | "d" | "bye";

export interface Game {
  w: Id;
  b: Id | null; // null => bye
  res: GameResult;
}

export type Round = Game[];

/** Full engine state — stored verbatim in tournament.state JSONB */
export interface TournamentState {
  players: Player[];
  schedule: Round[];
  viewRound: number;
  uid?: string; // stable id for this tournament instance (used as history key)
}

export type TournamentStatus = "setup" | "active" | "finished";

/** The single tournament row */
export interface Tournament {
  id: string; // always 'current'
  title: string;
  rounds: number;
  status: TournamentStatus;
  state: TournamentState;
  location: string | null;
  event_at: string | null; // ISO timestamp of the next event, or null if unscheduled
  signups_public: boolean; // whether the full sign-up name list is public
  show_sponsor: boolean; // show Antara Freediving credit in the footer
  show_venue: boolean; // show host/venue credit in the footer
  updated_at: string;
}

export interface Signup {
  id: string;
  name: string;
  created_at: string;
}

/** A single row in an archived tournament's final standings. */
export interface PodiumRow {
  name: string;
  score: number;
  buch: number;
  sb: number;
}

/** An archived finished tournament. The podium is the first 3 standings rows. */
export interface HistoryEntry {
  id: string;
  title: string;
  location: string | null;
  event_at: string | null;
  finished_at: string;
  rounds: number;
  standings: PodiumRow[];
  state?: TournamentState | null; // full engine state for the detailed standings table (older entries may lack it)
  visible: boolean;
}

/** Per-player derived standings data (computed, never stored) */
export interface Derived {
  id: Id;
  score: number;
  opp: Set<Id>;
  oppList: Id[];
  results: Record<number, string>; // round index -> '+','-','=','bye'
  white: number;
  black: number;
  last: "w" | "b" | null;
  byes: number;
  beat: Id[];
  drew: Id[];
  buch: number; // Buchholz
  sb: number; // Sonneborn–Berger
}

export interface StandingRow extends Derived {
  name: string;
}

export function emptyState(): TournamentState {
  return { players: [], schedule: [], viewRound: 1 };
}
