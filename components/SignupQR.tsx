// components/SignupQR.tsx
"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";

/**
 * Renders a QR code that opens the sign-up page (this app's origin). Generated
 * locally with the `qrcode` package, so it works offline. Organizer-facing.
 */
export function SignupQR() {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [url, setUrl] = useState("");

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const origin = window.location.origin + "/";
      setUrl(origin);
      QRCode.toDataURL(origin, { width: 480, margin: 1, color: { dark: "#0b0d10", light: "#ffffff" } })
        .then(setDataUrl)
        .catch(() => setDataUrl(null));
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="card stack" style={{ alignItems: "center", textAlign: "center" }}>
      <span className="kicker">Scan to sign up</span>
      {dataUrl
        // eslint-disable-next-line @next/next/no-img-element -- data URL, not a remote asset
        ? <img src={dataUrl} alt="Sign-up QR code" width={220} height={220} style={{ borderRadius: 10, background: "#fff", padding: 8 }} />
        : <div className="empty" style={{ width: "100%" }}>Generating…</div>}
      <span className="num muted" style={{ wordBreak: "break-all" }}>{url}</span>
    </div>
  );
}
