// The marks a topic can wear on Mnemosyne's water instead of a plain drop,
// one shelf a subject. Drawn crisp in a few strokes; the ones that are about
// motion move. r is the mark's half-size in screen pixels, t the time.
import type { SkinId } from '@aura/shared';

type Ctx = CanvasRenderingContext2D;
type Mark = (c: Ctx, x: number, y: number, r: number, t: number) => void;

const dot = (c: Ctx, x: number, y: number, r: number) => { c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); };
const line = (c: Ctx, pts: number[]) => { c.beginPath(); c.moveTo(pts[0]!, pts[1]!); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i]!, pts[i + 1]!); c.stroke(); };
function arrow(c: Ctx, x0: number, y0: number, x1: number, y1: number, head: number) {
  const a = Math.atan2(y1 - y0, x1 - x0);
  line(c, [x0, y0, x1, y1]);
  line(c, [x1 - Math.cos(a - 0.5) * head, y1 - Math.sin(a - 0.5) * head, x1, y1, x1 - Math.cos(a + 0.5) * head, y1 - Math.sin(a + 0.5) * head]);
}
const sign = (s: string, scale = 2.3): Mark => (c, x, y, r) => {
  c.font = `${Math.round(r * scale)}px "IM Fell English", Georgia, serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(s, x, y + r * 0.08);
};
function curve(c: Ctx, n: number, f: (u: number) => [number, number]) {
  c.beginPath();
  for (let i = 0; i <= n; i++) { const [X, Y] = f(i / n); if (i) c.lineTo(X, Y); else c.moveTo(X, Y); }
  c.stroke();
}

const MARKS: Record<SkinId, Mark> = {
  // Physics: what moves.
  orbit(c, x, y, r, t) {
    dot(c, x, y, r * 0.26);
    const tilt = -0.5, rx = r * 1.15, ry = r * 0.46;
    c.beginPath(); c.ellipse(x, y, rx, ry, tilt, 0, 7); c.stroke();
    const a = t * 2.1, ex = Math.cos(a) * rx, ey = Math.sin(a) * ry;
    dot(c, x + ex * Math.cos(tilt) - ey * Math.sin(tilt), y + ex * Math.sin(tilt) + ey * Math.cos(tilt), r * 0.18);
  },
  pendulum(c, x, y, r, t) {
    const py = y - r * 0.95, th = Math.sin(t * 2.2) * 0.55, L = r * 1.7;
    line(c, [x - r * 0.5, py, x + r * 0.5, py]);
    const bx = x + Math.sin(th) * L, by = py + Math.cos(th) * L;
    line(c, [x, py, bx, by]);
    dot(c, bx, by, r * 0.3);
  },
  wave(c, x, y, r, t) {
    curve(c, 28, (u) => [x - r * 1.3 + u * r * 2.6, y + Math.sin(u * Math.PI * 3 - t * 3) * r * 0.55 * Math.sin(u * Math.PI)]);
  },
  spring(c, x, y, r, t) {
    const top = y - r * 1.05, len = r * (1.25 + 0.3 * Math.sin(t * 3)), bot = top + len;
    line(c, [x - r * 0.55, top, x + r * 0.55, top]);
    const pts = [x, top];
    for (let i = 1; i <= 6; i++) pts.push(x + (i % 2 ? r * 0.42 : -r * 0.42), top + (len * i) / 7);
    pts.push(x, bot);
    line(c, pts);
    c.fillRect(x - r * 0.32, bot, r * 0.64, r * 0.5);
  },
  // Analysis: limits and their neighbourhoods.
  infinity(c, x, y, r, t) {
    const a = r * 1.3, at = (s: number): [number, number] => { const d = 1 + Math.sin(s) ** 2; return [x + (a * Math.cos(s)) / d, y + (a * Math.sin(s) * Math.cos(s)) / d]; };
    curve(c, 48, (u) => at(u * Math.PI * 2));
    const [X, Y] = at(t * 1.4);
    dot(c, X, Y, r * 0.2);
  },
  epsilon(c, x, y, r, t) {
    dot(c, x, y, r * 0.22);
    c.setLineDash([r * 0.25, r * 0.3]); c.lineDashOffset = -t * r * 0.6;
    c.beginPath(); c.arc(x, y, r * (1 + 0.12 * Math.sin(t * 1.6)), 0, 7); c.stroke();
    c.setLineDash([]); c.lineDashOffset = 0;
  },
  sequence(c, x, y, r, t) {
    const lim = x + r * 1.1;
    c.setLineDash([r * 0.18, r * 0.22]); line(c, [lim, y - r * 0.85, lim, y + r * 0.85]); c.setLineDash([]);
    const on = Math.floor(t * 2.5) % 7;
    for (let n = 0; n < 7; n++) dot(c, lim - r * 2.3 * 0.6 ** n, y, r * (n === on ? 0.22 : 0.13));
  },
  partial: sign('∂'),
  // Calculus: change, area and sums.
  integral: sign('∫', 2.6),
  tangent(c, x, y, r, t) {
    const k = 0.75 / r, Y = (u: number) => y + r * 0.55 - k * u * u;
    curve(c, 24, (s) => { const u = -r * 1.25 + s * r * 2.5; return [x + u, Y(u)]; });
    const u0 = r * 0.85 * Math.sin(t * 0.9), m = -2 * k * u0, d = r * 0.9 / Math.hypot(1, m);
    line(c, [x + u0 - d, Y(u0) - m * d, x + u0 + d, Y(u0) + m * d]);
    dot(c, x + u0, Y(u0), r * 0.18);
  },
  sigma: sign('Σ', 2.1),
  nabla: sign('∇', 2.1),
  phasor(c, x, y, r, t) {
    c.beginPath(); c.arc(x, y, r, 0, 7); c.stroke();
    const a = -t * 1.3, tx = x + Math.cos(a) * r, ty = y + Math.sin(a) * r;
    line(c, [x, y, tx, ty]);
    dot(c, tx, ty, r * 0.18);
    c.setLineDash([r * 0.12, r * 0.18]); line(c, [tx, ty, tx, y]); c.setLineDash([]);
  },
  // Linear algebra: vectors, maps and the spaces they span.
  basis(c, x, y, r) {
    const ox = x - r * 0.6, oy = y + r * 0.6;
    arrow(c, ox, oy, x + r * 0.95, oy, r * 0.38);
    arrow(c, ox, oy, ox, y - r * 0.95, r * 0.38);
  },
  matrix(c, x, y, r) {
    line(c, [x - r * 0.55, y - r, x - r * 0.95, y - r, x - r * 0.95, y + r, x - r * 0.55, y + r]);
    line(c, [x + r * 0.55, y - r, x + r * 0.95, y - r, x + r * 0.95, y + r, x + r * 0.55, y + r]);
    for (const [i, j] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) dot(c, x + i * r * 0.33, y + j * r * 0.42, r * 0.13);
  },
  lattice(c, x, y, r, t) {
    const sp = r * 0.72, s = 0.38 * Math.sin(t * 0.9);
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) dot(c, x + (i + s * j) * sp, y + j * sp, r * (i || j ? 0.12 : 0.2));
  },
  eigen(c, x, y, r, t) {
    const a = -0.6, ux = Math.cos(a), uy = Math.sin(a);
    c.setLineDash([r * 0.15, r * 0.2]); line(c, [x - ux * r * 1.3, y - uy * r * 1.3, x + ux * r * 1.3, y + uy * r * 1.3]); c.setLineDash([]);
    const len = r * (0.55 + 0.6 * (0.5 + 0.5 * Math.sin(t * 1.7)));
    arrow(c, x, y, x + ux * len, y + uy * len, r * 0.36);
  },
  // Proofs: how an argument closes.
  therefore(c, x, y, r) { for (const [dx, dy] of [[0, -0.55], [-0.62, 0.45], [0.62, 0.45]] as const) dot(c, x + dx * r, y + dy * r, r * 0.21); },
  implies: sign('⇒', 2),
  qed(c, x, y, r) { c.fillRect(x - r * 0.48, y - r * 0.6, r * 0.96, r * 1.2); },
};

export function drawSkin(c: Ctx, id: SkinId, x: number, y: number, r: number, t: number, color: string) {
  c.save();
  c.strokeStyle = color; c.fillStyle = color; c.lineWidth = Math.max(1, r * 0.13); c.lineCap = 'round'; c.lineJoin = 'round';
  MARKS[id](c, x, y, r, t);
  c.restore();
}
