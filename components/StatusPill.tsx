// components/StatusPill.tsx
import type { TournamentStatus } from "@/lib/types";

export function StatusPill({ status, round, rounds }: { status: TournamentStatus; round?: number; rounds?: number }) {
  if (status === "setup") return <span className="pill">Setup</span>;
  if (status === "finished") return <span className="pill">Finished</span>;
  return <span className="pill live">Round {round}/{rounds}</span>;
}
