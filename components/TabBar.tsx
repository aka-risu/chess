// components/TabBar.tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/", label: "Sign up", ico: "♟" },
  { href: "/results", label: "Results", ico: "🏆" },
  { href: "/history", label: "History", ico: "📜" },
  { href: "/clock", label: "Clock", ico: "⏱" },
  { href: "/admin", label: "Organizer", ico: "⚙" },
];

export function TabBar() {
  const path = usePathname();
  return (
    <nav className="tabbar">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} className={path === t.href ? "active" : ""}>
          <span className="ico">{t.ico}</span>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
