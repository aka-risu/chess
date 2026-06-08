// components/Countdown.tsx
"use client";
import { useEffect, useState } from "react";

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Big ticking countdown to `target` (ISO string). Renders a friendly message
 * when the date is unset or already passed.
 */
export function Countdown({ target }: { target: string | null }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const raf = requestAnimationFrame(tick); // first paint after mount
    const id = setInterval(tick, 1000);
    return () => { cancelAnimationFrame(raf); clearInterval(id); };
  }, []);

  if (!target) return <div className="big">Date to be announced</div>;
  const ts = new Date(target).getTime();
  if (Number.isNaN(ts)) return <div className="big">Date to be announced</div>;

  // Render nothing time-sensitive until mounted (avoids hydration mismatch).
  if (now === null) return <div className="big">&nbsp;</div>;

  let diff = Math.floor((ts - now) / 1000);
  // The announced time has come and gone without the tournament starting — the
  // date is stale, so treat the next event as not yet scheduled.
  if (diff <= 0) return <div className="big">Next tournament not announced yet</div>;

  const days = Math.floor(diff / 86400); diff -= days * 86400;
  const hours = Math.floor(diff / 3600); diff -= hours * 3600;
  const mins = Math.floor(diff / 60);
  const secs = diff - mins * 60;

  const units: [number, string][] = [
    [days, "days"],
    [hours, "hrs"],
    [mins, "min"],
    [secs, "sec"],
  ];

  return (
    <div className="countdown">
      {units.map(([n, l]) => (
        <div className="unit" key={l}>
          <div className="n">{l === "days" ? n : pad(n)}</div>
          <div className="l">{l}</div>
        </div>
      ))}
    </div>
  );
}

/** Format an ISO timestamp for display, e.g. "Wed 10 Jun, 18:00". */
export function formatEventDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, {
    weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}
