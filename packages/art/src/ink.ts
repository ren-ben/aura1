// Hand-drawn geometry: shapes are sampled to points, nudged by smooth seeded
// noise, and written back as smooth curves. The result wobbles like ink but is
// identical on every bake.

export type Pt = [number, number];

// Deterministic PRNG (mulberry32), so a seed always draws the same line.
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Samples a path written as "M x y C x y, x y, x y ..." (cubic segments only).
export function sampleCubics(d: string, perSegment = 16): Pt[] {
  const n = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
  const pts: Pt[] = [[n[0]!, n[1]!]];
  for (let i = 2; i + 5 < n.length; i += 6) {
    const [x0, y0] = pts[pts.length - 1]!;
    const [x1, y1, x2, y2, x3, y3] = n.slice(i, i + 6) as [number, number, number, number, number, number];
    for (let s = 1; s <= perSegment; s++) {
      const t = s / perSegment;
      const u = 1 - t;
      pts.push([
        u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
        u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3,
      ]);
    }
  }
  return pts;
}

export function ellipse(cx: number, cy: number, rx: number, ry: number, steps = 40): Pt[] {
  return Array.from({ length: steps }, (_, i) => {
    const a = (i / steps) * Math.PI * 2;
    return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)] as Pt;
  });
}

// A superellipse: n = 2 is an ellipse, higher n squares it off. Around 2.5 it
// is a pill whose sides curve evenly everywhere, with no straight runs.
// The top and bottom halves may differ: a lower n on top and a higher one
// below gives a bun, domed over the top and flatter underneath.
export function superellipse(
  cx: number, cy: number, a: number,
  top: { b: number; n: number }, bottom: { b: number; n: number }, steps = 120,
): Pt[] {
  return Array.from({ length: steps }, (_, i) => {
    const t = (i / steps) * Math.PI * 2;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const { b, n } = s < 0 ? top : bottom;
    return [cx + a * Math.sign(c) * Math.abs(c) ** (2 / n), cy + b * Math.sign(s) * Math.abs(s) ** (2 / n)] as Pt;
  });
}

export function rotate(pts: Pt[], deg: number, [ox, oy]: Pt): Pt[] {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return pts.map(([x, y]) => [ox + (x - ox) * c - (y - oy) * s, oy + (x - ox) * s + (y - oy) * c]);
}

// Pushes each point along the outline's normal by a sum of two slow waves plus
// a little grain: the hand's drift, not jitter.
export function wobble(pts: Pt[], seed: number, amp: number, closed = true): Pt[] {
  const r = rng(seed);
  const waves = [0, 1, 2].map(() => ({ f: 1 + r() * 3, p: r() * Math.PI * 2, a: r() }));
  const n = pts.length;
  return pts.map((p, i) => {
    const prev = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)]!;
    const next = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)]!;
    const tx = next[0] - prev[0];
    const ty = next[1] - prev[1];
    const len = Math.hypot(tx, ty) || 1;
    const t = i / n;
    const drift = waves.reduce((sum, w) => sum + w.a * Math.sin(t * w.f * Math.PI * 2 + w.p), 0) / 1.5;
    const d = amp * (drift + (r() - 0.5) * 0.25);
    return [p[0] - (ty / len) * d, p[1] + (tx / len) * d];
  });
}

// Line weight for everything drawn inside withWeight(). A head drawn at half
// size in a scene still needs whiskers the device can show, so scenes thicken
// strokes as they shrink the art.
let weight = 1;
export function withWeight<T>(w: number, draw: () => T): T {
  const saved = weight;
  weight = w;
  try { return draw(); } finally { weight = saved; }
}
export const lineWeight = () => weight;

// A brush stroke along an open polyline: width follows widthAt(t), t in 0..1.
export function stroke(line: Pt[], widthAt: (t: number) => number): Pt[] {
  const left: Pt[] = [];
  const right: Pt[] = [];
  line.forEach((p, i) => {
    const prev = line[Math.max(0, i - 1)]!;
    const next = line[Math.min(line.length - 1, i + 1)]!;
    const tx = next[0] - prev[0];
    const ty = next[1] - prev[1];
    const len = Math.hypot(tx, ty) || 1;
    const w = (widthAt(i / (line.length - 1)) * weight) / 2;
    left.push([p[0] - (ty / len) * w, p[1] + (tx / len) * w]);
    right.push([p[0] + (ty / len) * w, p[1] - (tx / len) * w]);
  });
  return [...left, ...right.reverse()];
}

// Smooth closed curve through points (Catmull-Rom as cubic Beziers).
export function toPath(pts: Pt[]): string {
  const n = pts.length;
  const f = (v: number) => v.toFixed(1);
  let d = `M ${f(pts[0]![0])} ${f(pts[0]![1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n]!;
    const p1 = pts[i]!;
    const p2 = pts[(i + 1) % n]!;
    const p3 = pts[(i + 2) % n]!;
    d += ` C ${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)}, `
      + `${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)}, ${f(p2[0])} ${f(p2[1])}`;
  }
  return `${d} Z`;
}

// Smooth open curve through points, for stroke centre lines.
export function curve(pts: Pt[], steps = 8): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[Math.min(pts.length - 1, i + 2)]!;
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      const at = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([at(p0[0], p1[0], p2[0], p3[0]), at(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[pts.length - 1]!);
  return out;
}

// A closed shape through a few hand-placed points, smoothed like a pen line.
export function outline(pts: Pt[], steps = 4): Pt[] {
  return curve([...pts, pts[0]!], steps).slice(0, -1);
}

export function shape(pts: Pt[], fill: string): string {
  return `<path d="${toPath(pts)}" fill="${fill}"/>`;
}
