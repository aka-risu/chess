// lib/share.ts
// Renders an archived tournament's podium to a square PNG and shares it via the
// native share sheet (with the image file) where supported, else downloads it.
// Browser-only: every function is a no-op / safe outside the DOM.
import type { HistoryEntry } from "./types";

const C = {
  bg: "#0b0d10",
  panel: "#171b22",
  line: "#2a313c",
  ink: "#f3f6fa",
  soft: "#c2cdd9",
  dim: "#97a3b1",
  accent: "#d4ff52",
};

const fmtNum = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

const MEDALS = ["🥇", "🥈", "🥉"];

/** Draw the podium card to a 1080×1080 canvas and return it as a PNG blob. */
export async function podiumImageBlob(entry: HistoryEntry): Promise<Blob | null> {
  if (typeof document === "undefined") return null;
  const S = 1080;
  const canvas = document.createElement("canvas");
  canvas.width = S; canvas.height = S;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // Background
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = "rgba(212,255,82,0.06)";
  ctx.fillRect(0, 0, S, 8);

  ctx.textAlign = "center";

  // Header
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

  // Podium: 2nd (left), 1st (center, tallest), 3rd (right)
  const podium = entry.standings.slice(0, 3);
  const order = [1, 0, 2]; // draw left→right
  const colW = 280, gap = 24;
  const totalW = colW * 3 + gap * 2;
  const startX = (S - totalW) / 2;
  const baseY = 940;
  const heights = [300, 420, 230]; // by rank 1,2,3
  const rankColors = ["#ffd24a", "#cfd8e3", "#e0935a"];

  order.forEach((rank, slot) => {
    const p = podium[rank];
    const x = startX + slot * (colW + gap);
    const h = heights[rank];
    const topY = baseY - h;

    // Pedestal
    ctx.fillStyle = C.panel;
    roundRect(ctx, x, topY, colW, h, 18);
    ctx.fill();
    ctx.strokeStyle = rankColors[rank];
    ctx.lineWidth = 3;
    roundRect(ctx, x, topY, colW, h, 18);
    ctx.stroke();

    const cx = x + colW / 2;

    // Medal
    ctx.font = "96px Inter, system-ui, sans-serif";
    ctx.fillText(MEDALS[rank], cx, topY - 24);

    if (p) {
      // Name
      ctx.fillStyle = C.ink;
      ctx.font = "800 34px Inter, system-ui, sans-serif";
      ctx.fillText(truncate(ctx, p.name, colW - 24), cx, topY + 70);
      // Points
      ctx.fillStyle = rankColors[rank];
      ctx.font = "800 56px ui-monospace, Menlo, monospace";
      ctx.fillText(fmtNum(p.score), cx, topY + 140);
      ctx.fillStyle = C.dim;
      ctx.font = "400 22px ui-monospace, Menlo, monospace";
      ctx.fillText("PTS", cx, topY + 172);
    } else {
      ctx.fillStyle = C.dim;
      ctx.font = "400 28px Inter, system-ui, sans-serif";
      ctx.fillText("—", cx, topY + 90);
    }

    // Rank numeral on the pedestal base
    ctx.fillStyle = rankColors[rank];
    ctx.font = "800 64px ui-monospace, Menlo, monospace";
    ctx.fillText(String(rank + 1), cx, baseY - 28);
  });

  // Footer
  ctx.fillStyle = C.dim;
  ctx.font = "400 24px Inter, system-ui, sans-serif";
  ctx.fillText(`${entry.rounds} rounds · ${entry.standings.length} players`, S / 2, 1010);

  return await new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
}

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
  return `🏆 ${entry.title}\n${medals}`;
}

/** Share the podium image via the native share sheet, falling back to download. */
export async function sharePodium(entry: HistoryEntry): Promise<void> {
  if (typeof navigator === "undefined") return;
  const blob = await podiumImageBlob(entry);
  const slug = (entry.title || "tournament").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const filename = `${slug || "tournament"}-podium.png`;
  const text = podiumText(entry);

  if (blob) {
    const file = new File([blob], filename, { type: "image/png" });
    const navAny = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (navAny.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: entry.title, text });
        return;
      } catch {
        // user cancelled or share failed — fall through to download
      }
    }
    // Fallback: download the PNG
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return;
  }

  // No canvas/blob available — share text only if possible
  if (navigator.share) {
    try { await navigator.share({ title: entry.title, text }); } catch { /* ignore */ }
  }
}
