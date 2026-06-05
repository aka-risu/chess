// app/layout.tsx
import "./globals.css";
import type { Metadata, Viewport } from "next";
import { TabBar } from "@/components/TabBar";
import { SponsorFooter } from "@/components/SponsorFooter";
import { SWRegister } from "@/components/SWRegister";

const TITLE = "Chess Tournament · Koh Tao";
const DESC = "Swiss-system chess tournament at The office, Koh Tao — presented by Antara Freediving. Sign up, live results, podium & clock.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  applicationName: "Chess Tournament",
  icons: { icon: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }], apple: "/apple-icon.png" },
  appleWebApp: { capable: true, title: "Chess", statusBarStyle: "black-translucent" },
  openGraph: { title: TITLE, description: DESC, type: "website", images: ["/podium-template.png"] },
  twitter: { card: "summary_large_image", title: TITLE, description: DESC, images: ["/podium-template.png"] },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0b0d10" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="wrap">
          {children}
          <SponsorFooter />
        </div>
        <TabBar />
        <SWRegister />
      </body>
    </html>
  );
}
