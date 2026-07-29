// lib/sponsor.ts — single place to edit sponsor (Antara Freediving) details.
// Fill `instagram` and the discount fields to make those bits appear.
export const SPONSOR = {
  name: "Antara Freediving",
  site: "https://antarafreedive.com/",
  siteLabel: "antarafreedive.com",
  instagram: "@antarafreedive",
  discountCode: "CALMMIND5",
  discountText: "a discount on a freediving course",
  logoHorizontal: "/antara/logo-horizontal.svg",
  logoSquare: "/antara/logo.svg",
  diver: "/antara/diver.svg",
  // The partner venues that can provide the place (credit only). The organizer
  // picks which ones host each tournament in admin → Display settings; the ids
  // are what gets stored on the tournament row, so keep them stable.
  // `logo` and `link` are optional; a nameless entry is never offered.
  venues: [
    {
      id: "office",
      name: "The Office, Koh Tao",
      link: "https://theofficekohtao.com/",
      logo: "/venue/logo.webp",
    },
    {
      id: "recovery-club",
      name: "Recovery Club Koh Tao",
      link: "",
      logo: "/venue/recovery-club.webp",
    },
  ],
};

export type Venue = (typeof SPONSOR.venues)[number];

/** The venues offered in the organizer's picker. */
export const pickableVenues = (): Venue[] => SPONSOR.venues.filter((v) => !!v.name);

/**
 * Resolve stored venue ids to venues, always in `SPONSOR.venues` order so the
 * credits read the same everywhere. Ids that no longer exist are dropped.
 */
export const selectedVenues = (ids: readonly string[] | null | undefined): Venue[] =>
  ids?.length ? pickableVenues().filter((v) => ids.includes(v.id)) : [];

/** Full Instagram URL, or null if no handle is set. */
export const sponsorInstagramUrl = (): string | null =>
  SPONSOR.instagram ? `https://instagram.com/${SPONSOR.instagram.replace(/^@/, "")}` : null;
