// lib/identity.ts
// Resolving "which board is mine" on a device that may have registered several
// players. `owned` = signup ids stored on this device (swiss_my_signups); `me`
// = the id the user marked as themselves (swiss_me). Player ids equal signup ids.
import type { Id } from "./types";

export const MINE_KEY = "swiss_my_signups";
export const ME_KEY = "swiss_me";

export interface MeResolution {
  /** The single player id to treat as the viewer, or null if undecided. */
  pid: Id | null;
  /** When undecided between several owned players, the ids to choose from. */
  options: Id[];
}

/**
 * Pick the viewer's player among the ones this device registered.
 * - none owned in the tournament → undecided, no options
 * - `me` is owned → that one
 * - exactly one owned → that one (no need to ask)
 * - several owned and `me` unset/absent → undecided, caller should ask
 */
export function resolveMe(owned: Id[], playerIds: Set<Id>, me: Id | null): MeResolution {
  const present = owned.filter((id) => playerIds.has(id));
  if (present.length === 0) return { pid: null, options: [] };
  if (me && present.includes(me)) return { pid: me, options: [] };
  if (present.length === 1) return { pid: present[0], options: [] };
  return { pid: null, options: present };
}
