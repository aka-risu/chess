// components/TabBar.tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/", label: "Sign up" },
  { href: "/results", label: "Results" },
  { href: "/admin", label: "Organizer" },
];

export function TabBar() {
  const path = usePathname();
  return (
    <nav className="tabbar">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} className={path === t.href ? "active" : ""}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
