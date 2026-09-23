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
const TENDRILS = 6;  // places where the brush splayed and left hairs
const HAIR = 5;      // hairs in each of them

export type Logo = {
  weight: number[];   // ink at each sample
  wobble: number[];   // how far the rim wanders there
  open: number[];     // 0 where the stroke lifts off the page
  tendrils: { at: number; len: number; spread: number; lean: number; hairs: number }[];
  lean: number;       // the whole ring tips a little
  seed: number;
};

const seedOf = (text: string) => ([...text].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 2147483646, 7) + 1);

export function logoFor(text: string): Logo {
  const r = rand(seedOf(text));
  const words = text.trim().split(/\s+/).filter(Boolean);
  const weight: number[] = [], wobble: number[] = [], open: number[] = [];

  // One turn of the wrist: the brush presses and lifts, twice heavily and a
  // few times lightly, and the rim wanders a little as it goes round.
  const heavy = [r() * 7, r() * 7];
  const swell = [0.7 + r() * 0.5, 0.45 + r() * 0.4, 0.25 + r() * 0.3];
  const phase = [r() * 7, r() * 7, r() * 7];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    let wgt = 1 + swell[0]! * Math.sin(a + phase[0]!) + swell[1]! * Math.sin(a * 2 + phase[1]!) + swell[2]! * Math.sin(a * 3 + phase[2]!);
    for (const at of heavy) {
      const d = Math.abs(((a - at + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      wgt += Math.max(0, 1 - d / 1.25) * 2.6;
    }
    weight.push(Math.max(0.08, wgt * 0.3));
    wobble.push(Math.sin(a * 2 + phase[1]!) * 0.6 + Math.sin(a * 5 + phase[0]!) * 0.2);
    open.push(1);
  }
  // Where the brush left the page. A longer sentence breathes more often.
  const breaks = words.length > 10 ? 2 : 1;
  for (let k = 0; k < breaks; k++) {
    const at = Math.floor(r() * N), span = 4 + Math.floor(r() * 8);
    for (let j = -span; j <= span; j++) {
      const i = (at + j + N * 2) % N;
      open[i] = Math.min(open[i]!, Math.pow(Math.min(1, Math.abs(j) / span), 0.7));
    }
  }

  // Where the hairs splayed: a few places on the rim, each throwing a fan of
  // fine strokes. The longest words get the longest fans.
  const strong = [...words].sort((a, b) => b.length - a.length);
  const tendrils = Array.from({ length: TENDRILS }, (_, k) => {
    const word = strong[k % Math.max(1, strong.length)] ?? '';
    const strength = Math.min(1, word.length / 9);
    return {
      at: r() * Math.PI * 2,
      len: (0.1 + strength * 0.26 + r() * 0.06) * (k < 3 ? 1 : 0.45),
      spread: 0.18 + r() * 0.4,
      lean: (r() - 0.5) * 1.5,
      hairs: k < 3 ? HAIR : 3,
    };
  });

  return { weight, wobble, open, tendrils, lean: (r() - 0.5) * 0.4, seed: seedOf(text) };
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
    lean: mix(a.lean, b.lean, u),
    seed: u < 0.5 ? a.seed : b.seed,
  };
}

// Ink laid by a loaded brush on rough paper: a body with ragged edges, the
// dry streaks its hairs leave through it, and the fans where it splayed.
export function drawLogo(g: CanvasRenderingContext2D, w: number, h: number, lo: Logo, t = 0): void {
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.33;
  const r = rand(lo.seed);
  const breathe = 1 + Math.sin(t * 0.5) * 0.004;
  const halfOf = (i: number) => lo.weight[i]! * R * 0.075 * Math.min(1, lo.open[i]! * 1.6);

  const pt = (i: number, off: number) => {
    const a = (i / N) * Math.PI * 2 + lo.lean * 0.08;
    const rad = (R + lo.wobble[i]! * R * 0.03 + off) * breathe;
    return [cx + Math.cos(a) * rad, cy + Math.sin(a) * rad] as const;
  };

  // The body of the stroke.
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
    if (lo.open[j]! < 0.1) { flush(); continue; }
    const half = halfOf(j);
    // The two edges do not wander together: one side is always the rougher.
    const [ox, oy] = pt(j, half * (0.82 + Math.abs(Math.sin(j * 0.7)) * 0.4));
    const [ix, iy] = pt(j, -half * (0.7 + Math.abs(Math.sin(j * 0.31 + 1)) * 0.5));
    run.push([ox, oy, ix, iy]);
  }
  flush();

  // The dry streaks: hairs that carried no ink, cut back out of the body.
  g.globalCompositeOperation = 'destination-out';
  for (let k = 0; k < 26; k++) {
    const at = Math.floor(r() * N), along = 6 + Math.floor(r() * 26);
    const depth = (r() - 0.5) * 1.1;
    g.beginPath();
    for (let j = 0; j <= along; j++) {
      const i = (at + j) % N;
      const [x, y] = pt(i, halfOf(i) * depth);
      g[j ? 'lineTo' : 'moveTo'](x, y);
    }
    g.lineWidth = 0.5 + r() * 1.3;
    g.strokeStyle = '#000';
    g.globalAlpha = 0.5 + r() * 0.5;
    g.stroke();
  }
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 1;

  // The ragged edge, and the spray it threw.
  g.fillStyle = '#c5bcab';
  for (let i = 0; i < N; i++) {
    if (lo.open[i]! < 0.2) continue;
    const half = halfOf(i);
    for (let k = 0; k < 3; k++) {
      const side = r() < 0.5 ? 1 : -1;
      const [x, y] = pt(i, side * (half + r() * half * 0.55));
      g.globalAlpha = 0.3 + r() * 0.5;
      g.fillRect(x, y, 1.5, 1.5);
    }
    if (r() < 0.07) {
      const [x, y] = pt(i, (r() < 0.5 ? 1 : -1) * (half + 3 + r() * 16));
      g.globalAlpha = 0.12 + r() * 0.3;
      g.fillRect(x, y, 1.3, 1.3);
    }
  }

  // The fans: where the hairs opened, each stroke thinning to nothing.
  for (const td of lo.tendrils) {
    if (td.len < 0.04) continue;
    for (let hair = 0; hair < td.hairs; hair++) {
      const off = (hair / Math.max(1, td.hairs - 1) - 0.5) * td.spread;
      const steps = 22;
      g.beginPath();
      for (let k = 0; k <= steps; k++) {
        const u = k / steps;
        const a = td.at + off * (0.4 + u) + td.lean * u * u * 0.5 + lo.lean * 0.08;
        const rad = R + u * td.len * R * 2.4 + Math.sin(u * 5 + hair) * R * 0.012;
        g[k ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
      }
      g.strokeStyle = '#c5bcab';
      g.globalAlpha = 0.5 + 0.5 * (1 - Math.abs(off) / Math.max(0.01, td.spread));
      g.lineWidth = Math.max(0.6, R * 0.016 * (1 - Math.abs(off)));
      g.lineCap = 'round';
      g.stroke();
      // The last of the ink, shaken off the end.
      if (r() < 0.5) {
        const a = td.at + off * 1.4 + td.lean * 0.5 + lo.lean * 0.08;
        const rad = R + td.len * R * 2.4;
        g.globalAlpha = 0.2 + r() * 0.4;
        g.fillRect(cx + Math.cos(a) * rad + (r() - 0.5) * 6, cy + Math.sin(a) * rad + (r() - 0.5) * 6, 1.6, 1.6);
      }
    }
  }
  g.globalAlpha = 1;
}
