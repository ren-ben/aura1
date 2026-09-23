// His script: a logogram in the heptapod manner. One closed ring written in
// one breath, its weight swelling and thinning, broken where the sentence
// breathes, with hooks thrown off it for the words that carry the meaning and
// chords drawn across it for the ones that bind them.
//
// Every logogram is the same shape of data - the same counts of everything -
// so any two can be mixed, and one sentence can be watched turning into the
// next rather than cutting to it.
import { rand } from './plate';

const N = 240;      // samples around the ring
const TENDRILS = 5;  // places where the brush splayed and left hairs
const HAIR = 6;      // hairs in each of them
const BLOTS = 4;     // where it stopped and the ink pooled

export type Logo = {
  weight: number[];   // ink at each sample
  wobble: number[];   // how far the rim wanders there
  open: number[];     // 0 where the stroke lifts off the page
  tendrils: { at: number; len: number; spread: number; lean: number; hairs: number }[];
  blots: { at: number; size: number; reach: number }[];
  lean: number;       // the whole ring tips a little
  seed: number;
};

const seedOf = (text: string) => ([...text].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 2147483646, 7) + 1);

export function logoFor(text: string): Logo {
  const r = rand(seedOf(text));
  const words = text.trim().split(/\s+/).filter(Boolean);
  const weight: number[] = [], wobble: number[] = [], open: number[] = [];

  // One turn of a loaded brush. It starts fat, thins where the wrist runs
  // out of ink, swells again where it is pressed, and never once holds an
  // even width - the ring is a stroke, not a circle.
  const heavy = [r() * 7, r() * 7, r() * 7];
  const swell = [0.8 + r() * 0.5, 0.5 + r() * 0.4, 0.3 + r() * 0.3];
  const phase = [r() * 7, r() * 7, r() * 7];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    let wgt = 1 + swell[0]! * Math.sin(a + phase[0]!) + swell[1]! * Math.sin(a * 2 + phase[1]!) + swell[2]! * Math.sin(a * 3 + phase[2]!);
    for (const at of heavy) {
      const d = Math.abs(((a - at + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      wgt += Math.max(0, 1 - d / 1.3) * 1.7;
    }
    // Never thinner than a hair, and fat where it was pressed.
    weight.push(Math.max(0.42, wgt * 0.55));
    wobble.push(Math.sin(a * 2 + phase[1]!) * 0.7 + Math.sin(a * 5 + phase[0]!) * 0.25);
    open.push(1);
  }
  // Where the brush left the page: one clean lift, tapered both sides.
  const breaks = words.length > 12 ? 2 : 1;
  for (let k = 0; k < breaks; k++) {
    const at = Math.floor(r() * N), span = 5 + Math.floor(r() * 9);
    for (let j = -span; j <= span; j++) {
      const i = (at + j + N * 2) % N;
      open[i] = Math.min(open[i]!, Math.pow(Math.min(1, Math.abs(j) / span), 0.55));
    }
  }

  // Where the hairs splayed: short fans, close to the ring, like fingers off
  // the end of a stroke rather than rays out of a sun.
  const strong = [...words].sort((a, b) => b.length - a.length);
  const tendrils = Array.from({ length: TENDRILS }, (_, k) => {
    const word = strong[k % Math.max(1, strong.length)] ?? '';
    const strength = Math.min(1, word.length / 10);
    return {
      at: r() * Math.PI * 2,
      len: (0.06 + strength * 0.1 + r() * 0.04) * (k < 2 ? 1 : 0.6),
      spread: 0.1 + r() * 0.22,
      lean: (r() - 0.5) * 1.1,
      hairs: k < 2 ? HAIR : 3,
    };
  });

  // Where it stopped: ink pooled, and threw a little off the end.
  const blots = Array.from({ length: BLOTS }, () => ({
    at: r() * Math.PI * 2,
    size: 0.4 + r() * 0.8,
    reach: r() < 0.5 ? 1 : -1,
  }));

  return { weight, wobble, open, tendrils, blots, lean: (r() - 0.5) * 0.4, seed: seedOf(text) };
}

const mix = (a: number, b: number, u: number) => a + (b - a) * u;
const nearest = (from: number, to: number, u: number) => {
  const d = ((to - from + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  return from + d * u;
};

export function mixLogo(a: Logo, b: Logo, u: number): Logo {
  return {
    weight: a.weight.map((v, i) => mix(v, b.weight[i]!, u)),
    wobble: a.wobble.map((v, i) => mix(v, b.wobble[i]!, u)),
    open: a.open.map((v, i) => mix(v, b.open[i]!, u)),
    tendrils: a.tendrils.map((td, i) => {
      const o = b.tendrils[i]!;
      return {
        at: nearest(td.at, o.at, u),
        len: mix(td.len, o.len, u),
        spread: mix(td.spread, o.spread, u),
        lean: mix(td.lean, o.lean, u),
        hairs: u < 0.5 ? td.hairs : o.hairs,
      };
    }),
    blots: a.blots.map((bl, i) => {
      const o = b.blots[i]!;
      return { at: nearest(bl.at, o.at, u), size: mix(bl.size, o.size, u), reach: u < 0.5 ? bl.reach : o.reach };
    }),
    lean: mix(a.lean, b.lean, u),
    seed: u < 0.5 ? a.seed : b.seed,
  };
}

// Ink laid by a loaded brush on rough paper. The body is built as one filled
// band whose two edges wander independently, then bitten into: dry streaks
// where the hairs carried nothing, and a frayed border where it dragged.
export function drawLogo(g: CanvasRenderingContext2D, w: number, h: number, lo: Logo, t = 0): void {
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.3;
  const r = rand(lo.seed);
  const breathe = 1 + Math.sin(t * 0.5) * 0.003;
  const half = (i: number) => lo.weight[i]! * R * 0.07 * Math.min(1, lo.open[i]! * 1.5);

  const pt = (i: number, off: number) => {
    const a = (i / N) * Math.PI * 2 + lo.lean * 0.08;
    const rad = (R + lo.wobble[i]! * R * 0.014 + off) * breathe;
    return [cx + Math.cos(a) * rad, cy + Math.sin(a) * rad] as const;
  };

  // The body.
  g.fillStyle = '#c5bcab';
  let run: number[][] = [];
  const flush = () => {
    if (run.length > 2) {
      g.beginPath();
      for (let k = 0; k < run.length; k++) g[k ? 'lineTo' : 'moveTo'](run[k]![0]!, run[k]![1]!);
      for (let k = run.length - 1; k >= 0; k--) g.lineTo(run[k]![2]!, run[k]![3]!);
      g.closePath(); g.fill();
    }
    run = [];
  };
  for (let i = 0; i <= N; i++) {
    const j = i % N;
    if (lo.open[j]! < 0.08) { flush(); continue; }
    const t2 = half(j);
    // The outer edge is the steadier one; the inner edge is where the brush
    // skidded, so it wanders twice as much.
    const out = t2 * (0.9 + Math.sin(j * 0.13) * 0.18 + Math.sin(j * 0.41 + 2) * 0.1);
    const inn = t2 * (0.85 + Math.sin(j * 0.09 + 1) * 0.3 + Math.sin(j * 0.29) * 0.16);
    const [ox, oy] = pt(j, out);
    const [ix, iy] = pt(j, -inn);
    run.push([ox, oy, ix, iy]);
  }
  flush();

  // Where it stopped and pooled: a blot sitting on the ring, spreading off it.
  for (const bl of lo.blots) {
    const i = Math.round(((bl.at / (Math.PI * 2)) * N + N) % N);
    const t2 = half(i);
    if (lo.open[i]! < 0.3) continue;
    const [bx, by] = pt(i, bl.reach * t2 * 0.4);
    const rad = t2 * (0.7 + bl.size * 0.5);
    g.beginPath();
    for (let k = 0; k <= 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const wob = 0.62 + 0.38 * Math.abs(Math.sin(a * 3 + bl.at * 7));
      const x = bx + Math.cos(a) * rad * wob, y = by + Math.sin(a) * rad * wob * 0.85;
      g[k ? 'lineTo' : 'moveTo'](x, y);
    }
    g.closePath(); g.fill();
  }

  // Dry streaks: hairs that carried no ink, cut back out of the body.
  g.globalCompositeOperation = 'destination-out';
  for (let k = 0; k < 16; k++) {
    const at = Math.floor(r() * N), along = 5 + Math.floor(r() * 26);
    const depth = (r() - 0.5) * 1.3;
    g.beginPath();
    for (let j = 0; j <= along; j++) {
      const i = (at + j) % N;
      const [x, y] = pt(i, half(i) * depth);
      g[j ? 'lineTo' : 'moveTo'](x, y);
    }
    g.lineWidth = 0.5 + r() * 1.3;
    g.strokeStyle = '#000';
    g.globalAlpha = 0.3 + r() * 0.45;
    g.stroke();
  }
  // And the frayed border: the edge is never a line.
  for (let k = 0; k < 70; k++) {
    const i = Math.floor(r() * N);
    if (lo.open[i]! < 0.25) continue;
    const side = r() < 0.5 ? 1 : -1;
    const [x, y] = pt(i, side * half(i) * (0.92 + r() * 0.25));
    g.globalAlpha = 0.3 + r() * 0.45;
    g.beginPath(); g.arc(x, y, 0.7 + r() * 1.5, 0, 7); g.fill();
  }
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 1;

  // The spray it threw, outside the stroke.
  g.fillStyle = '#c5bcab';
  for (let i = 0; i < N; i++) {
    if (lo.open[i]! < 0.25) continue;
    if (r() < 0.55) continue;
    const side = r() < 0.5 ? 1 : -1;
    const [x, y] = pt(i, side * (half(i) + r() * 10));
    g.globalAlpha = 0.12 + r() * 0.4;
    g.fillRect(x, y, 1.4, 1.4);
  }

  // The fans. Ink leaves a brush in trails, not in noodles: each one starts
  // at the weight of the stroke it came off, breaks where the hair skipped,
  // splits where it caught, and ends in whatever was left of the load.
  for (const td of lo.tendrils) {
    if (td.len < 0.03) continue;
    const i = Math.round(((td.at / (Math.PI * 2)) * N + N) % N);
    const root = half(i);

    const trail = (from: number, spread: number, length: number, weight: number, depth: number) => {
      const steps = 22;
      let skipping = false;
      for (let k = 0; k < steps; k++) {
        const u = k / steps, next = (k + 1) / steps;
        // A hair skips: the trail is broken, the way dry ink breaks.
        if (!skipping && depth === 0 && r() < 0.07) skipping = true;
        else if (skipping && r() < 0.35) skipping = false;
        if (skipping) continue;

        const bend = (v: number) => from + spread * (0.5 + v * 1.5) + td.lean * v * v * 0.4 + lo.lean * 0.08;
        const out = (v: number) => R + root * 0.5 + v * length * R * 2.6 + Math.sin(v * 4 + depth) * R * 0.01;
        const a0 = bend(u), a1 = bend(next);
        const r0 = out(u), r1 = out(next);
        // Tapering: fat where it left the stroke, nothing where it ran out.
        const w0 = weight * Math.pow(1 - u, 1.5), w1 = weight * Math.pow(1 - next, 1.5);
        const x0 = cx + Math.cos(a0) * r0, y0 = cy + Math.sin(a0) * r0;
        const x1 = cx + Math.cos(a1) * r1, y1 = cy + Math.sin(a1) * r1;
        // Drawn as a quad, so the taper is in the shape and not in a stroke.
        const n0 = a0 + Math.PI / 2, n1 = a1 + Math.PI / 2;
        g.globalAlpha = 0.5 + 0.5 * (1 - u);
        g.beginPath();
        g.moveTo(x0 + Math.cos(n0) * w0, y0 + Math.sin(n0) * w0);
        g.lineTo(x1 + Math.cos(n1) * w1, y1 + Math.sin(n1) * w1);
        g.lineTo(x1 - Math.cos(n1) * w1, y1 - Math.sin(n1) * w1);
        g.lineTo(x0 - Math.cos(n0) * w0, y0 - Math.sin(n0) * w0);
        g.closePath();
        g.fill();

        // Where it caught, it splits and the split goes its own way.
        if (depth === 0 && u > 0.3 && u < 0.8 && r() < 0.1) {
          trail(a0 - lo.lean * 0.08, (r() - 0.5) * 0.3, length * (0.3 + r() * 0.4) * (1 - u), w0 * 0.6, depth + 1);
        }
        // And it throws what it cannot hold.
        if (r() < 0.06) {
          g.globalAlpha = 0.15 + r() * 0.35;
          g.beginPath();
          g.arc(x1 + (r() - 0.5) * 7, y1 + (r() - 0.5) * 7, 0.5 + r() * 1.4, 0, 7);
          g.fill();
        }
      }
      // The last of the load, sitting at the end of it.
      if (depth === 0 && r() < 0.6) {
        const a = bendEnd(from, spread);
        const rad = R + root * 0.5 + length * R * 2.6;
        g.globalAlpha = 0.55 + r() * 0.4;
        g.beginPath();
        g.ellipse(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad, weight * (0.7 + r()), weight * (0.5 + r() * 0.8), a, 0, 7);
        g.fill();
      }
    };
    const bendEnd = (from: number, spread: number) => from + spread * 2 + td.lean * 0.4 + lo.lean * 0.08;

    for (let hair = 0; hair < td.hairs; hair++) {
      const off = (hair / Math.max(1, td.hairs - 1) - 0.5) * td.spread;
      const grown = 0.45 + r() * 0.9;
      trail(td.at + off * 0.4, off, td.len * grown, Math.max(0.6, root * 0.5 * (1 - Math.abs(off))), 0);
    }
  }
  g.globalAlpha = 1;
}
