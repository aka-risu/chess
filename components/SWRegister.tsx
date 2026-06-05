// components/SWRegister.tsx — registers the offline service worker (prod only).
"use client";
import { useEffect } from "react";

export function SWRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return; // skip in dev to avoid stale caches
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => { /* ignore */ });
  }, []);
  return null;
}
