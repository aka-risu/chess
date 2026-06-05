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
  // The partner venue that provides the place (credit only). Fill `name` to show
  // "Hosted at …"; `logo` and `link` are optional.
  venue: {
    name: "The Office, Koh Tao",
    link: "https://theofficekohtao.com/",
    logo: "/venue/logo.webp",
  },
};

/** Full Instagram URL, or null if no handle is set. */
export const sponsorInstagramUrl = (): string | null =>
  SPONSOR.instagram ? `https://instagram.com/${SPONSOR.instagram.replace(/^@/, "")}` : null;
