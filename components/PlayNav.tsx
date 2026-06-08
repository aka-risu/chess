// components/PlayNav.tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/play", label: "Practice" },
  { href: "/puzzles", label: "Puzzles" },
];

/** Segmented sub-navigation shared by the Practice and Puzzles pages. */
export function PlayNav() {
  const path = usePathname();
  return (
    <div className="row" style={{ gap: 6, marginBottom: 12 }}>
      {links.map((l) => {
        const active = path === l.href;
        return (
          <Link key={l.href} href={l.href} className="num"
            style={{
              flex: 1, textAlign: "center", minHeight: 40, lineHeight: "40px", borderRadius: 8,
              border: "1px solid var(--line)", textDecoration: "none",
              background: active ? "var(--accent)" : "var(--surface-2)",
              color: active ? "#0b0d10" : "var(--ink-soft)", fontWeight: active ? 800 : 600,
              fontSize: 12, textTransform: "uppercase", letterSpacing: ".03em",
            }}>{l.label}</Link>
        );
      })}
    </div>
  );
}
