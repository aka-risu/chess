// components/SponsorFooter.tsx — "Organized by / Hosted at" credits.
// Visibility of each block is controlled by the organizer (tournament.show_sponsor
// / show_venue), so it reads the current tournament and reacts to changes.
"use client";
import { useEffect, useState } from "react";
import { getTournament, subscribeTournament } from "@/lib/supabase";
import { SPONSOR, sponsorInstagramUrl } from "@/lib/sponsor";

export function SponsorFooter() {
  const [showSponsor, setShowSponsor] = useState(false);
  const [showVenue, setShowVenue] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const t = await getTournament();
      if (alive && t) { setShowSponsor(t.show_sponsor); setShowVenue(t.show_venue); }
    };
    load();
    const ch = subscribeTournament(load);
    return () => { alive = false; ch.unsubscribe(); };
  }, []);

  const ig = sponsorInstagramUrl();
  const venue = SPONSOR.venue;
  const venueVisible = showVenue && !!venue.name;

  if (!showSponsor && !venueVisible) return null;

  return (
    <footer className="sponsor">
      {showSponsor && (
        <>
          <span className="kicker">Organized by</span>
          <a href={SPONSOR.site} target="_blank" rel="noopener noreferrer" aria-label={SPONSOR.name}>
            {/* eslint-disable-next-line @next/next/no-img-element -- local SVG asset */}
            <img src={SPONSOR.logoHorizontal} alt={SPONSOR.name} className="sponsor-logo" />
          </a>
        </>
      )}

      {venueVisible && (
        <div className="venue-credit">
          <span className="kicker">Hosted at</span>
          {venue.logo ? (
            venue.link
              // eslint-disable-next-line @next/next/no-img-element -- local asset
              ? <a href={venue.link} target="_blank" rel="noopener noreferrer"><img src={venue.logo} alt={venue.name} className="sponsor-logo" /></a>
              // eslint-disable-next-line @next/next/no-img-element -- local asset
              : <img src={venue.logo} alt={venue.name} className="sponsor-logo" />
          ) : (
            venue.link
              ? <a href={venue.link} target="_blank" rel="noopener noreferrer" style={{ color: "var(--ink)", fontWeight: 700 }}>{venue.name}</a>
              : <span style={{ fontWeight: 700 }}>{venue.name}</span>
          )}
        </div>
      )}

      {showSponsor && SPONSOR.discountCode && (
        <div className="sponsor-promo">
          Players get {SPONSOR.discountText} — code <b>{SPONSOR.discountCode}</b>
        </div>
      )}

      {showSponsor && (
        <div className="sponsor-links">
          <a href={SPONSOR.site} target="_blank" rel="noopener noreferrer">Book a freediving course →</a>
          {ig && <a href={ig} target="_blank" rel="noopener noreferrer">{SPONSOR.instagram}</a>}
        </div>
      )}
    </footer>
  );
}
