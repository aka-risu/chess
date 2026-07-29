// components/SponsorFooter.tsx — "Organized by / Hosted at" credits.
// Each block is controlled by the organizer (tournament.show_sponsor for the
// sponsor, tournament.venues for which hosts to credit), so it reads the current
// tournament and reacts to changes.
"use client";
import { useEffect, useState } from "react";
import { getTournament, subscribeTournament } from "@/lib/supabase";
import { SPONSOR, selectedVenues, sponsorInstagramUrl, type Venue } from "@/lib/sponsor";

export function SponsorFooter() {
  const [showSponsor, setShowSponsor] = useState(false);
  const [venues, setVenues] = useState<Venue[]>([]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const t = await getTournament();
      if (alive && t) { setShowSponsor(t.show_sponsor); setVenues(selectedVenues(t.venues)); }
    };
    load();
    const ch = subscribeTournament(load);
    return () => { alive = false; ch.unsubscribe(); };
  }, []);

  const ig = sponsorInstagramUrl();
  const venueVisible = venues.length > 0;

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
          <div className="venue-logos">
            {venues.map((venue) => (
              <div key={venue.id}>
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
            ))}
          </div>
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
