// The marks a topic can wear on Mnemosyne's water instead of a plain drop:
// one a broad area of the degree, quiet and still, a few thin strokes each.
// r is the mark's half-size in screen pixels.
import type { SkinId } from '@aura/shared';

type Ctx = CanvasRenderingContext2D;
type Mark = (c: Ctx, x: number, y: number, r: number) => void;

const dot = (c: Ctx, x: number, y: number, r: number) => { c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); };
const line = (c: Ctx, pts: number[]) => { c.beginPath(); c.moveTo(pts[0]!, pts[1]!); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i]!, pts[i + 1]!); c.stroke(); };
function curve(c: Ctx, n: number, f: (u: number) => [number, number]) {
  c.beginPath();
  for (let i = 0; i <= n; i++) { const [X, Y] = f(i / n); if (i) c.lineTo(X, Y); else c.moveTo(X, Y); }
  c.stroke();
}
const sign = (s: string, scale = 2.2): Mark => (c, x, y, r) => {
  c.font = `${Math.round(r * scale)}px "IM Fell English", Georgia, serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(s, x, y + r * 0.08);
};

const MARKS: Record<SkinId, Mark> = {
  // Physics.
  mechanics(c, x, y, r) {
    // A body thrown: its path, and where it set out from.
    c.setLineDash([r * 0.2, r * 0.22]);
    curve(c, 20, (u) => [x - r * 1.1 + u * r * 2.2, y + r * 0.6 - Math.sin(u * Math.PI) * r * 1.3]);
    c.setLineDash([]);
    dot(c, x - r * 1.1, y + r * 0.6, r * 0.2);
  },
  fields(c, x, y, r) {
    // Two charges and the lines between them.
    dot(c, x - r * 0.95, y, r * 0.18); dot(c, x + r * 0.95, y, r * 0.18);
    for (const k of [-1, 1]) curve(c, 16, (u) => [x - r * 0.95 + u * r * 1.9, y + k * Math.sin(u * Math.PI) * r * 0.75]);
    line(c, [x - r * 0.75, y, x + r * 0.75, y]);
  },
  waves(c, x, y, r) { curve(c, 24, (u) => [x - r * 1.15 + u * r * 2.3, y - Math.sin(u * Math.PI * 2) * r * 0.55]); },
  heat(c, x, y, r) {
    // Haze rising.
    for (const dx of [-0.6, 0, 0.6]) curve(c, 14, (u) => [x + dx * r + Math.sin(u * Math.PI * 2) * r * 0.16, y + r * 0.9 - u * r * 1.8]);
  },
  quantum: sign('ψ', 2.3),
  atoms(c, x, y, r) {
    // A nucleus and one electron's orbit.
    dot(c, x, y, r * 0.24);
    c.beginPath(); c.ellipse(x, y, r * 1.15, r * 0.48, -0.5, 0, 7); c.stroke();
    dot(c, x + Math.cos(-0.5) * r * 1.15, y + Math.sin(-0.5) * r * 1.15, r * 0.15);
  },
  matter(c, x, y, r) {
    // A crystal: a square lattice, bonded.
    const s = r * 0.8;
    for (const k of [-1, 0, 1]) { line(c, [x - s, y + k * s, x + s, y + k * s]); line(c, [x + k * s, y - s, x + k * s, y + s]); }
    for (const i of [-1, 0, 1]) for (const j of [-1, 0, 1]) dot(c, x + i * s, y + j * s, r * 0.14);
  },
  relativity(c, x, y, r) {
    // A light cone: the paths of light through an event, and the cone's rim.
    line(c, [x - r, y + r, x + r, y - r]); line(c, [x + r, y + r, x - r, y - r]);
    c.beginPath(); c.ellipse(x, y - r, r, r * 0.28, 0, 0, 7); c.stroke();
    dot(c, x, y, r * 0.16);
  },
  // Mathematics.
  analysis(c, x, y, r) {
    const a = r * 1.25;
    curve(c, 48, (u) => { const s = u * Math.PI * 2, d = 1 + Math.sin(s) ** 2; return [x + (a * Math.cos(s)) / d, y + (a * Math.sin(s) * Math.cos(s)) / d]; });
  },
  algebra(c, x, y, r) {
    line(c, [x - r * 0.55, y - r, x - r * 0.95, y - r, x - r * 0.95, y + r, x - r * 0.55, y + r]);
    line(c, [x + r * 0.55, y - r, x + r * 0.95, y - r, x + r * 0.95, y + r, x + r * 0.55, y + r]);
    for (const [i, j] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) dot(c, x + i * r * 0.33, y + j * r * 0.42, r * 0.12);
  },
  calculus: sign('∫', 2.5),
  chance(c, x, y, r) {
    line(c, [x - r * 1.2, y + r * 0.7, x + r * 1.2, y + r * 0.7]);
    curve(c, 28, (u) => { const v = (u - 0.5) * 4.4; return [x + (u - 0.5) * r * 2.4, y + r * 0.7 - Math.exp(-v * v / 2) * r * 1.45]; });
  },
  proof(c, x, y, r) { for (const [dx, dy] of [[0, -0.5], [-0.58, 0.45], [0.58, 0.45]] as const) dot(c, x + dx * r, y + dy * r, r * 0.19); },
  // Craft.
  lab(c, x, y, r) {
    // A gauge: a measurement read off a dial.
    c.beginPath(); c.arc(x, y + r * 0.55, r * 1.1, Math.PI, 0); c.stroke();
    line(c, [x - r * 1.2, y + r * 0.55, x + r * 1.2, y + r * 0.55]);
    line(c, [x, y + r * 0.55, x + Math.cos(-0.9) * r * 0.85, y + r * 0.55 + Math.sin(-0.9) * r * 0.85]);
  },
  code: sign('λ', 2.2),
};

export function drawSkin(c: Ctx, id: SkinId, x: number, y: number, r: number, color: string) {
  const mark = MARKS[id];
  if (!mark) return;
  c.save();
  c.strokeStyle = color; c.fillStyle = color; c.lineWidth = Math.max(1, r * 0.11); c.lineCap = 'round'; c.lineJoin = 'round';
  mark(c, x, y, r);
  c.restore();
}
