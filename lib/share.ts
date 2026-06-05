// lib/share.ts
// Builds a shareable podium PNG and shares it via the native share sheet (with
// the image file) where supported, else downloads it.
//
// Preferred path: overlay the winners' names + points onto a designed template
// image at /public/podium-template.png. If that image is missing/unloadable we
// fall back to drawing a simple card from scratch.
// Browser-only: every function is a safe no-op outside the DOM.
import type { HistoryEntry } from "./types";
import { SPONSOR } from "./sponsor";

export const TEMPLATE_SRC = "/podium-template.png";

const fmtNum = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const MEDALS = ["🥇", "🥈", "🥉"];

// ---- Template overlay -------------------------------------------------------

// Anchor positions for each plaque, as FRACTIONS of the image width/height so
// they scale to whatever size the template is. Index 0 = 1st (centre plaque),
// 1 = 2nd (left), 2 = 3rd (right). Tune these with /podium-tuner.
export interface Slot {
  nameX: number; nameY: number; nameMaxW: number; nameSize: number;
  ptsX: number; ptsY: number; ptsSize: number;
  color: string;
}
export const SLOTS: Slot[] = [
  // 1st — centre, cream/gold plaque → dark brown text
  { nameX: 0.504, nameY: 0.702, nameMaxW: 0.235, nameSize: 0.031, ptsX: 0.502, ptsY: 0.804, ptsSize: 0.04, color: "#4a3210" },
  // 2nd — left, light silver plaque → dark navy text
  { nameX: 0.212, nameY: 0.703, nameMaxW: 0.2, nameSize: 0.031, ptsX: 0.21, ptsY: 0.799, ptsSize: 0.034, color: "#26354e" },
  // 3rd — right, light bronze plaque → dark brown text
  { nameX: 0.791, nameY: 0.717, nameMaxW: 0.2, nameSize: 0.026, ptsX: 0.788, ptsY: 0.81, ptsSize: 0.034, color: "#4d2c18" },
];

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Draw the name + points overlays onto an already-painted template canvas. */
export function drawSlots(
  ctx: CanvasRenderingContext2D, W: number, H: number, entry: HistoryEntry, slots: Slot[],
): void {
  ctx.textAlign = "center";
  const podium = entry.standings.slice(0, 3);
  slots.forEach((s, i) => {
    const p = podium[i];
    if (!p) return;
    ctx.fillStyle = s.color;
    ctx.font = `800 ${Math.round(H * s.nameSize)}px Inter, system-ui, sans-serif`;
    ctx.fillText(truncate(ctx, p.name.toUpperCase(), W * s.nameMaxW), W * s.nameX, H * s.nameY);
    ctx.font = `800 ${Math.round(H * s.ptsSize)}px ui-monospace, Menlo, monospace`;
    ctx.fillText(fmtNum(p.score), W * s.ptsX, H * s.ptsY);
  });
}

async function templateBlob(entry: HistoryEntry): Promise<Blob | null> {
  let img: HTMLImageElement;
  try {
    img = await loadImage(TEMPLATE_SRC);
  } catch {
    return null; // template not present → caller falls back
  }
  const W = img.naturalWidth, H = img.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.drawImage(img, 0, 0, W, H);
  drawSlots(ctx, W, H, entry, SLOTS);

  return await new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
}

// ---- Fallback: draw a card from scratch -------------------------------------

const C = { bg: "#0b0d10", panel: "#171b22", ink: "#f3f6fa", dim: "#97a3b1", accent: "#d4ff52" };

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

async function drawnBlob(entry: HistoryEntry): Promise<Blob | null> {
  if (typeof document === "undefined") return null;
  const S = 1080;
  const canvas = document.createElement("canvas");
  canvas.width = S; canvas.height = S;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = "rgba(212,255,82,0.06)"; ctx.fillRect(0, 0, S, 8);
  ctx.textAlign = "center";

  ctx.fillStyle = C.accent;
  ctx.font = "600 26px ui-monospace, Menlo, monospace";
  ctx.fillText("♟  CHESS TOURNAMENT · SWISS", S / 2, 96);
  ctx.fillStyle = C.ink;
  ctx.font = "800 58px Inter, system-ui, sans-serif";
  ctx.fillText(truncate(ctx, entry.title, S - 120), S / 2, 168);
  ctx.fillStyle = C.dim;
  ctx.font = "400 28px Inter, system-ui, sans-serif";
  const sub = [fmtDate(entry.event_at || entry.finished_at), entry.location || ""].filter(Boolean).join("  ·  ");
  ctx.fillText(sub, S / 2, 214);

  const podium = entry.standings.slice(0, 3);
  const order = [1, 0, 2];
  const colW = 280, gap = 24;
  const startX = (S - (colW * 3 + gap * 2)) / 2;
  const baseY = 940;
  const heights = [300, 420, 230];
  const rankColors = ["#ffd24a", "#cfd8e3", "#e0935a"];

  order.forEach((rank, slot) => {
    const p = podium[rank];
    const x = startX + slot * (colW + gap);
    const h = heights[rank];
    const topY = baseY - h;
    ctx.fillStyle = C.panel; roundRect(ctx, x, topY, colW, h, 18); ctx.fill();
    ctx.strokeStyle = rankColors[rank]; ctx.lineWidth = 3; roundRect(ctx, x, topY, colW, h, 18); ctx.stroke();
    const cx = x + colW / 2;
    ctx.font = "96px Inter, system-ui, sans-serif";
    ctx.fillText(MEDALS[rank], cx, topY - 24);
    if (p) {
      ctx.fillStyle = C.ink; ctx.font = "800 34px Inter, system-ui, sans-serif";
      ctx.fillText(truncate(ctx, p.name, colW - 24), cx, topY + 70);
      ctx.fillStyle = rankColors[rank]; ctx.font = "800 56px ui-monospace, Menlo, monospace";
      ctx.fillText(fmtNum(p.score), cx, topY + 140);
      ctx.fillStyle = C.dim; ctx.font = "400 22px ui-monospace, Menlo, monospace";
      ctx.fillText("PTS", cx, topY + 172);
    }
    ctx.fillStyle = rankColors[rank]; ctx.font = "800 64px ui-monospace, Menlo, monospace";
    ctx.fillText(String(rank + 1), cx, baseY - 28);
  });

  ctx.fillStyle = C.dim; ctx.font = "400 24px Inter, system-ui, sans-serif";
  ctx.fillText(`${entry.rounds} rounds · ${entry.standings.length} players`, S / 2, 1010);

  return await new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
}

// ---- Shared helpers ---------------------------------------------------------

function truncate(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1);
  return t + "…";
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function podiumText(entry: HistoryEntry): string {
  const medals = entry.standings.slice(0, 3)
    .map((p, i) => `${MEDALS[i]} ${p.name} (${fmtNum(p.score)})`)
    .join("\n");
  const org = `Organized by ${SPONSOR.name}${SPONSOR.venue.name ? ` · Hosted at ${SPONSOR.venue.name}` : ""}`;
  const lines = [`🏆 ${entry.title}`, medals, "", org, SPONSOR.siteLabel];
  if (SPONSOR.discountCode) lines.push(`${SPONSOR.discountText} — code ${SPONSOR.discountCode}`);
  return lines.join("\n");
}

/** Build the podium PNG (template overlay if available, else drawn card). */
export async function podiumImageBlob(entry: HistoryEntry): Promise<Blob | null> {
  if (typeof document === "undefined") return null;
  return (await templateBlob(entry)) ?? (await drawnBlob(entry));
}

/** Share the podium image via the native share sheet, falling back to download. */
export async function sharePodium(entry: HistoryEntry): Promise<void> {
  if (typeof navigator === "undefined") return;
  const blob = await podiumImageBlob(entry);
  const slug = (entry.title || "tournament").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  // Unique suffix so repeated downloads don't collide / show a stale cached file.
  const filename = `${slug || "tournament"}-podium-${Date.now()}.png`;
  const text = podiumText(entry);

  if (blob) {
    const file = new File([blob], filename, { type: "image/png" });
    const navAny = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (navAny.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: entry.title, text });
        return;
      } catch {
        // cancelled / failed — fall through to download
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return;
  }

  if (navigator.share) {
    try { await navigator.share({ title: entry.title, text }); } catch { /* ignore */ }
  }
}
