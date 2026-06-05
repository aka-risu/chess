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
}

export type TournamentStatus = "setup" | "active" | "finished";

/** The single tournament row */
export interface Tournament {
  id: string; // always 'current'
  title: string;
  rounds: number;
  status: TournamentStatus;
  state: TournamentState;
  updated_at: string;
}

export interface Signup {
  id: string;
  name: string;
  created_at: string;
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
