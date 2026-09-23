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
const HOOKS = 7;    // strokes thrown off it
const CHORDS = 3;   // lines drawn across the inside

export type Logo = {
  weight: number[];   // ink at each sample
  wobble: number[];   // how far the rim wanders there
  open: number[];     // 0 where the stroke lifts off the page
  hooks: { at: number; len: number; curl: number; out: number; blob: number }[];
  chords: { a: number; b: number; bow: number; ink: number }[];
  lean: number;       // the whole ring tips a little
  seed: number;
};

const seedOf = (text: string) => ([...text].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 2147483646, 7) + 1);

export function logoFor(text: string): Logo {
  const r = rand(seedOf(text));
  const words = text.trim().split(/\s+/).filter(Boolean);
  const weight: number[] = [], wobble: number[] = [], open: number[] = [];

  // The hand presses and lifts as it goes round: a few slow swells, a faster
  // tremor over them, and one heavy passage where the sentence leans.
  const swell = [0.9 + r() * 0.6, 0.5 + r() * 0.5, 0.3 + r() * 0.4];
  const phase = [r() * 7, r() * 7, r() * 7];
  const heavyAt = r() * Math.PI * 2, heavyWidth = 0.7 + r() * 0.9;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    let wgt = 1 + swell[0]! * Math.sin(a * 2 + phase[0]!) + swell[1]! * Math.sin(a * 3 + phase[1]!) + swell[2]! * Math.sin(a * 5 + phase[2]!);
    const d = Math.abs(((a - heavyAt + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    wgt += Math.max(0, 1 - d / heavyWidth) * 1.6;
    weight.push(Math.max(0.1, wgt * 0.5));
    wobble.push(Math.sin(a * 3 + phase[2]!) * 0.5 + Math.sin(a * 7 + phase[0]!) * 0.25);
    open.push(1);
  }
  // Where it breathes: one break for every few words, tapered at both ends.
  const breaks = 1 + Math.min(3, Math.floor(words.length / 5));
  for (let k = 0; k < breaks; k++) {
    const at = Math.floor(r() * N), span = 3 + Math.floor(r() * 7);
    for (let j = -span; j <= span; j++) {
      const i = (at + j + N * 2) % N;
      open[i] = Math.min(open[i]!, Math.min(1, Math.abs(j) / span));
    }
  }

  // The hooks: one for each of the longest words, thrown outward or inward,
  // curling, and stopped with a blob where the hand lifted.
  const strong = [...words].sort((a, b) => b.length - a.length);
  const hooks = Array.from({ length: HOOKS }, (_, k) => {
    const word = strong[k % Math.max(1, strong.length)] ?? '';
    return {
      at: r() * Math.PI * 2,
      len: 0.14 + Math.min(0.34, word.length * 0.03) + r() * 0.08,
      curl: (r() - 0.5) * 3.2,
      out: r() < 0.72 ? 1 : -1,
      blob: word.length > 4 ? 0.5 + r() * 0.7 : 0.15 + r() * 0.35,
    };
  });

  // The chords: the sentence tying itself together across the middle.
  const chords = Array.from({ length: CHORDS }, () => ({
    a: r() * Math.PI * 2,
    b: r() * Math.PI * 2,
    bow: 0.2 + r() * 0.55,
    ink: words.length > 6 ? 0.5 + r() * 0.5 : r() * 0.45,
  }));

  return { weight, wobble, open, hooks, chords, lean: (r() - 0.5) * 0.5, seed: seedOf(text) };
}

const mix = (a: number, b: number, u: number) => a + (b - a) * u;

export function mixLogo(a: Logo, b: Logo, u: number): Logo {
  return {
    weight: a.weight.map((v, i) => mix(v, b.weight[i]!, u)),
    wobble: a.wobble.map((v, i) => mix(v, b.wobble[i]!, u)),
    open: a.open.map((v, i) => mix(v, b.open[i]!, u)),
    hooks: a.hooks.map((h, i) => {
      const o = b.hooks[i]!;
      // Angles take the short way round, or hooks swing the long way back.
      let d = o.at - h.at;
      d = ((d + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      return { at: h.at + d * u, len: mix(h.len, o.len, u), curl: mix(h.curl, o.curl, u), out: u < 0.5 ? h.out : o.out, blob: mix(h.blob, o.blob, u) };
    }),
    chords: a.chords.map((c, i) => {
      const o = b.chords[i]!;
      return { a: mix(c.a, o.a, u), b: mix(c.b, o.b, u), bow: mix(c.bow, o.bow, u), ink: mix(c.ink, o.ink, u) };
    }),
    lean: mix(a.lean, b.lean, u),
    seed: u < 0.5 ? a.seed : b.seed,
  };
}

// Ink, laid down the way a wet brush lays it: a solid core, a ragged edge
// where it dragged, and the spray it threw doing it.
export function drawLogo(g: CanvasRenderingContext2D, w: number, h: number, lo: Logo, t = 0): void {
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.33;
  const r = rand(lo.seed);
  const breathe = 1 + Math.sin(t * 0.6) * 0.006;

  const pt = (i: number, off: number) => {
    const a = (i / N) * Math.PI * 2 + lo.lean * 0.1;
    const rad = (R + lo.wobble[i]! * R * 0.022 + off) * breathe;
    return [cx + Math.cos(a) * rad, cy + Math.sin(a) * rad * (1 - lo.lean * 0.06)] as const;
  };

  // The stroke itself: an outer and an inner edge, filled as one ribbon.
  g.fillStyle = '#c5bcab';
  let run: number[][] = [];
  const flush = () => {
    if (run.length < 3) { run = []; return; }
    g.beginPath();
    for (let k = 0; k < run.length; k++) g[k ? 'lineTo' : 'moveTo'](run[k]![0]!, run[k]![1]!);
    for (let k = run.length - 1; k >= 0; k--) g.lineTo(run[k]![2]!, run[k]![3]!);
    g.closePath(); g.fill();
    run = [];
  };
  for (let i = 0; i <= N; i++) {
    const j = i % N;
    const o = lo.open[j]!;
    if (o < 0.12) { flush(); continue; }
    const half = lo.weight[j]! * R * 0.055 * o;
    const [ox, oy] = pt(j, half);
    const [ix, iy] = pt(j, -half);
    run.push([ox, oy, ix, iy]);
  }
  flush();

  // The ragged edge, and the spray.
  for (let i = 0; i < N; i++) {
    const o = lo.open[i]!;
    if (o < 0.2) continue;
    const half = lo.weight[i]! * R * 0.055 * o;
    for (let k = 0; k < 5; k++) {
      const side = r() < 0.5 ? 1 : -1;
      const [x, y] = pt(i, side * (half + r() * half * 0.5));
      g.globalAlpha = 0.25 + r() * 0.5;
      g.fillRect(x, y, 1.6, 1.6);
    }
    if (r() < 0.16) {
      const [x, y] = pt(i, (r() < 0.5 ? 1 : -1) * (half + 4 + r() * 14));
      g.globalAlpha = 0.1 + r() * 0.3;
      g.fillRect(x, y, 1.4, 1.4);
    }
  }
  g.globalAlpha = 1;

  // The hooks, tapering as they leave and blotting where they stop.
  for (const hk of lo.hooks) {
    const steps = 26;
    for (let k = 0; k <= steps; k++) {
      const u = k / steps;
      const a = hk.at + hk.curl * u * u * 0.5 + lo.lean * 0.1;
      const rad = R + hk.out * u * hk.len * R * 2.1;
      const x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad * (1 - lo.lean * 0.06);
      const wgt = Math.max(0.6, (1 - u) * R * 0.03);
      g.globalAlpha = 0.55 + 0.45 * (1 - u);
      g.beginPath(); g.arc(x, y, wgt, 0, 7); g.fill();
      if (r() < 0.25) { g.globalAlpha = 0.3; g.fillRect(x + (r() - 0.5) * 5, y + (r() - 0.5) * 5, 1.4, 1.4); }
    }
    if (hk.blob > 0.2) {
      const a = hk.at + hk.curl * 0.5 + lo.lean * 0.1;
      const rad = R + hk.out * hk.len * R * 2.1;
      const x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad * (1 - lo.lean * 0.06);
      g.globalAlpha = 0.9;
      g.beginPath(); g.arc(x, y, hk.blob * R * 0.045, 0, 7); g.fill();
      // The ink that ran off it.
      for (let k = 0; k < 8; k++) {
        const aa = r() * 7, dd = hk.blob * R * (0.05 + r() * 0.06);
        g.globalAlpha = 0.15 + r() * 0.3;
        g.fillRect(x + Math.cos(aa) * dd, y + Math.sin(aa) * dd, 1.5, 1.5);
      }
    }
  }
  g.globalAlpha = 1;

  // The chords across the inside, drawn light.
  for (const ch of lo.chords) {
    if (ch.ink < 0.18) continue;
    const ax = cx + Math.cos(ch.a) * R, ay = cy + Math.sin(ch.a) * R;
    const bx = cx + Math.cos(ch.b) * R, by = cy + Math.sin(ch.b) * R;
    const mx = (ax + bx) / 2 + (cx - (ax + bx) / 2) * ch.bow;
    const my = (ay + by) / 2 + (cy - (ay + by) / 2) * ch.bow;
    g.strokeStyle = '#c5bcab';
    g.globalAlpha = ch.ink * 0.5;
    g.lineWidth = Math.max(0.8, ch.ink * R * 0.012);
    g.beginPath(); g.moveTo(ax, ay); g.quadraticCurveTo(mx, my, bx, by); g.stroke();
  }
  g.globalAlpha = 1;
}
