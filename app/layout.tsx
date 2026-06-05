// app/layout.tsx
import "./globals.css";
import type { Metadata, Viewport } from "next";
import { TabBar } from "@/components/TabBar";

export const metadata: Metadata = { title: "Swiss Tournament", description: "Live chess tournament" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0b0d10" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="wrap">{children}</div>
        <TabBar />
      </body>
    </html>
  );
}
