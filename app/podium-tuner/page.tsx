// app/podium-tuner/page.tsx
// Dev tool: visually position the name/points overlays on the podium template,
// then copy the resulting SLOTS array into lib/share.ts. Not linked in the nav.
"use client";
import { useEffect, useRef, useState } from "react";
import { SLOTS, TEMPLATE_SRC, drawSlots, loadImage, type Slot } from "@/lib/share";
import type { HistoryEntry } from "@/lib/types";

type Kind = "name" | "pts";
const RANK_COLOR = ["#ffd24a", "#cfd8e3", "#e0935a"];
const round = (n: number) => Math.round(n * 1000) / 1000;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const PASS = process.env.NEXT_PUBLIC_ORGANIZER_PASSCODE;
const UNLOCK_KEY = "swiss_admin_unlocked";

export default function PodiumTuner() {
  const [slots, setSlots] = useState<Slot[]>(() => structuredClone(SLOTS));
  const [names, setNames] = useState(["Alexandra", "Bo", "Charlie"]);
  const [points, setPoints] = useState(["5.5", "5", "4.5"]);
  const [status, setStatus] = useState<"loading" | "ready" | "missing">("loading");
  const [copied, setCopied] = useState(false);
  const [drag, setDrag] = useState<{ i: number; kind: Kind } | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [pass, setPass] = useState("");

  const imgRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);

  // Restore organizer unlock from the same session flag as /admin.
  useEffect(() => {
    const raf = requestAnimationFrame(() => setUnlocked(sessionStorage.getItem(UNLOCK_KEY) === "1"));
    return () => cancelAnimationFrame(raf);
  }, []);

  // Load the template once.
  useEffect(() => {
    let alive = true;
    loadImage(TEMPLATE_SRC)
      .then((img) => { if (alive) { imgRef.current = img; setStatus("ready"); } })
      .catch(() => { if (alive) setStatus("missing"); });
    return () => { alive = false; };
  }, []);

  // Re-render the canvas whenever inputs change.
  useEffect(() => {
    const img = imgRef.current, canvas = canvasRef.current;
    if (status !== "ready" || !img || !canvas) return;
    const W = img.naturalWidth, H = img.naturalHeight;
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(img, 0, 0, W, H);
    const sample: HistoryEntry = {
      id: "sample", title: "Sample", location: "Koh Tao", event_at: null, finished_at: "",
      rounds: 5, visible: true,
      standings: names.map((name, i) => ({ name, score: Number(points[i]) || 0, buch: 0, sb: 0 })),
    };
    drawSlots(ctx, W, H, sample, slots);
  }, [slots, names, points, status]);

  const update = (i: number, patch: Partial<Slot>) =>
    setSlots((prev) => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  const onMove = (e: React.PointerEvent) => {
    if (!drag || !boxRef.current) return;
    const r = boxRef.current.getBoundingClientRect();
    const fx = round(clamp01((e.clientX - r.left) / r.width));
    const fy = round(clamp01((e.clientY - r.top) / r.height));
    update(drag.i, drag.kind === "name" ? { nameX: fx, nameY: fy } : { ptsX: fx, ptsY: fy });
  };

  const copy = async () => {
    const fmtSlot = (s: Slot) =>
      `  { nameX: ${round(s.nameX)}, nameY: ${round(s.nameY)}, nameMaxW: ${round(s.nameMaxW)}, ` +
      `nameSize: ${round(s.nameSize)}, ptsX: ${round(s.ptsX)}, ptsY: ${round(s.ptsY)}, ` +
      `ptsSize: ${round(s.ptsSize)}, color: "${s.color}" },`;
    const code = `export const SLOTS: Slot[] = [\n${slots.map(fmtSlot).join("\n")}\n];`;
    try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    catch { /* clipboard blocked — the <pre> below is selectable */ }
  };

  if (!unlocked) {
    const tryUnlock = () => {
      if (pass === PASS) { sessionStorage.setItem(UNLOCK_KEY, "1"); setUnlocked(true); }
      else alert("Wrong passcode");
    };
    return (
      <>
        <div className="mast"><span className="kicker">Organizer</span></div>
        <h2 className="section">Enter passcode</h2>
        <div className="stack" style={{ marginTop: 14 }}>
          <input type="text" placeholder="Passcode" value={pass}
            onChange={(e) => setPass(e.target.value)} onKeyDown={(e) => e.key === "Enter" && tryUnlock()} />
          <button className="btn block" onClick={tryUnlock}>Unlock</button>
        </div>
      </>
    );
  }

  if (status === "missing") {
    return (
      <>
        <div className="mast"><span className="title">Podium tuner</span></div>
        <div className="empty">
          No template found at <span className="num">public/podium-template.png</span>.<br />
          Add that image, then reload this page.
        </div>
      </>
    );
  }

  const handle = (i: number, kind: Kind) => {
    const s = slots[i];
    const x = (kind === "name" ? s.nameX : s.ptsX) * 100;
    const y = (kind === "name" ? s.nameY : s.ptsY) * 100;
    return (
      <div
        key={`${i}-${kind}`}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setDrag({ i, kind }); }}
        onPointerMove={onMove}
        onPointerUp={() => setDrag(null)}
        style={{
          position: "absolute", left: `${x}%`, top: `${y}%`, transform: "translate(-50%,-50%)",
          width: 26, height: 26, borderRadius: "50%", cursor: "grab", touchAction: "none",
          border: `2px solid ${RANK_COLOR[i]}`, background: kind === "name" ? RANK_COLOR[i] : "transparent",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 10, fontWeight: 800, color: "#0b0d10", boxShadow: "0 0 0 2px rgba(0,0,0,.5)",
        }}
        title={`#${i + 1} ${kind}`}
      >{kind === "name" ? "N" : "P"}</div>
    );
  };

  const step = (i: number, field: keyof Slot, delta: number) => {
    const s = slots[i];
    update(i, { [field]: round((s[field] as number) + delta) } as Partial<Slot>);
  };

  const sizeRow = (i: number, label: string, field: keyof Slot, delta: number) => (
    <div className="row" style={{ justifyContent: "space-between" }}>
      <span className="muted">{label}</span>
      <span className="row" style={{ gap: 6 }}>
        <button className="btn ghost" style={{ minHeight: 32, padding: "4px 10px" }} onClick={() => step(i, field, -delta)}>−</button>
        <span className="num" style={{ width: 56, textAlign: "center" }}>{round(slots[i][field] as number)}</span>
        <button className="btn ghost" style={{ minHeight: 32, padding: "4px 10px" }} onClick={() => step(i, field, delta)}>+</button>
      </span>
    </div>
  );

  return (
    <>
      <div className="mast"><span className="title">Podium tuner</span></div>
      <p className="muted">Drag the <b>N</b> (name) and <b>P</b> (points) dots onto each plaque. Fine-tune sizes below, then copy the values into <span className="num">lib/share.ts</span>.</p>

      {/* Editable sample */}
      <div className="card stack" style={{ margin: "12px 0" }}>
        <label className="kicker">Sample names / points (to preview fit)</label>
        {[0, 1, 2].map((i) => (
          <div key={i} className="row" style={{ gap: 8 }}>
            <input className="grow" type="text" value={names[i]}
              onChange={(e) => setNames((n) => n.map((v, j) => (j === i ? e.target.value : v)))} />
            <input type="text" style={{ width: 80 }} value={points[i]}
              onChange={(e) => setPoints((p) => p.map((v, j) => (j === i ? e.target.value : v)))} />
          </div>
        ))}
      </div>

      {/* Preview with draggable handles */}
      <div ref={boxRef} style={{ position: "relative", width: "100%", lineHeight: 0 }}>
        <canvas ref={canvasRef} style={{ width: "100%", height: "auto", borderRadius: 8, border: "1px solid var(--line)" }} />
        {status === "ready" && [0, 1, 2].flatMap((i) => [handle(i, "name"), handle(i, "pts")])}
      </div>

      {/* Per-slot fine controls */}
      <div className="stack" style={{ marginTop: 14 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="card stack">
            <span className="kicker" style={{ color: RANK_COLOR[i] }}>#{i + 1} plaque</span>
            {sizeRow(i, "Name size", "nameSize", 0.001)}
            {sizeRow(i, "Name max width", "nameMaxW", 0.005)}
            {sizeRow(i, "Points size", "ptsSize", 0.001)}
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className="muted">Text colour</span>
              <input type="color" value={slots[i].color}
                onChange={(e) => update(i, { color: e.target.value })}
                style={{ width: 48, height: 32, background: "none", border: "1px solid var(--line)", borderRadius: 6 }} />
            </div>
          </div>
        ))}
      </div>

      <button className="btn block" style={{ marginTop: 16 }} onClick={copy}>
        {copied ? "Copied ✓" : "Copy SLOTS code"}
      </button>
      <p className="muted" style={{ marginTop: 12 }}>Paste this over the <span className="num">SLOTS</span> array in lib/share.ts:</p>
      <pre className="card" style={{ overflowX: "auto", fontSize: 12, fontFamily: "var(--mono)", whiteSpace: "pre" }}>
{`export const SLOTS: Slot[] = [
${slots.map((s) => `  { nameX: ${round(s.nameX)}, nameY: ${round(s.nameY)}, nameMaxW: ${round(s.nameMaxW)}, nameSize: ${round(s.nameSize)}, ptsX: ${round(s.ptsX)}, ptsY: ${round(s.ptsY)}, ptsSize: ${round(s.ptsSize)}, color: "${s.color}" },`).join("\n")}
];`}
      </pre>
    </>
  );
}
