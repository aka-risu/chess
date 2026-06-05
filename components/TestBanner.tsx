// components/TestBanner.tsx — sticky banner shown while in test mode.
"use client";
import { useEffect, useState } from "react";
import { exitTestMode, isTestMode } from "@/lib/mode";

export function TestBanner() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setOn(isTestMode()));
    return () => cancelAnimationFrame(raf);
  }, []);
  if (!on) return null;
  return (
    <div className="testbar">
      <span>🧪 TEST MODE — changes are NOT saved to the database</span>
      <button onClick={() => { exitTestMode(); window.location.href = "/"; }}>Exit</button>
    </div>
  );
}
