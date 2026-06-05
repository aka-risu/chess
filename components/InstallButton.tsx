// components/InstallButton.tsx
// Shows an "Install app" button when the browser reports the PWA is installable
// (Chromium fires `beforeinstallprompt`). Renders nothing on iOS / when already
// installed / when criteria aren't met.
"use client";
import { useEffect, useState } from "react";

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function InstallButton() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);

  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setDeferred(e as BIPEvent); };
    const onInstalled = () => setDeferred(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!deferred) return null;
  return (
    <button
      className="btn block ghost"
      style={{ marginTop: 12 }}
      onClick={async () => { await deferred.prompt(); setDeferred(null); }}
    >
      ⬇ Install app
    </button>
  );
}
