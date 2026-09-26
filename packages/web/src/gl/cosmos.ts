// The sky behind a lecture map: stars in three depths that wrap without
// end, and far off, dim enough never to crowd a card, a spiral galaxy, a
// black hole with its ring of light, and a ringed planet. Drawn in grey for
// a plate to dither; the bodies are drawn once and moved, never redrawn.
import { rand } from './plate';

type Body = { img: HTMLCanvasElement; x: number; y: number; depth: number; spin?: number };

const grey = (v: number, a = 1) => `rgba(${Math.round(v * 255)},${Math.round(v * 255)},${Math.round(v * 255)},${a})`;
const canvas = (s: number) => { const c = document.createElement('canvas'); c.width = c.height = s; return c; };

// A spiral galaxy: a bright bar of a core and two arms of dust and stars
// winding out of it, seen a little from the side.
function galaxy(s: number): HTMLCanvasElement {
  const c = canvas(s), g = c.getContext('2d')!, r = rand(21), m = s / 2;
  const core = g.createRadialGradient(m, m, 0, m, m, s * 0.18);
  core.addColorStop(0, grey(0.55)); core.addColorStop(1, grey(0, 0));
  g.fillStyle = core; g.fillRect(0, 0, s, s);
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 2600; i++) {
    const arm = i % 2, t = r() ** 0.7, a = arm * Math.PI + t * 5.2 + (r() - 0.5) * 0.5;
    const rr = t * s * 0.46, x = m + Math.cos(a) * rr, y = m + Math.sin(a) * rr * 0.55;
    g.fillStyle = grey(0.1 + (1 - t) * 0.22, 0.9);
    g.fillRect(x, y, r() < 0.08 ? 2 : 1, 1);
  }
  return c;
}
// A black hole: the dark of it, a ring of glowing dust, brighter on the side
// turning toward us, and the lensed arc over the top.
function blackHole(s: number): HTMLCanvasElement {
  const c = canvas(s), g = c.getContext('2d')!, r = rand(5), m = s / 2;
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 3200; i++) {
    const a = r() * Math.PI * 2, rr = s * (0.2 + r() ** 1.6 * 0.26);
    const x = m + Math.cos(a) * rr, y = m + Math.sin(a) * rr * 0.42;
    const doppler = 0.5 + 0.5 * Math.cos(a);
    g.fillStyle = grey(0.06 + doppler * 0.22 * (1 - (rr / s - 0.2) / 0.26));
    g.fillRect(x, y, 1.5, 1);
  }
  g.strokeStyle = grey(0.28); g.lineWidth = Math.max(1, s * 0.012);
  g.beginPath(); g.ellipse(m, m - s * 0.02, s * 0.2, s * 0.17, 0, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
  g.globalCompositeOperation = 'source-over';
  g.fillStyle = '#000'; g.beginPath(); g.arc(m, m, s * 0.13, 0, 7); g.fill();
  g.fillStyle = grey(0.9); g.fillRect(m - 1, m - s * 0.05, 1, s * 0.1); g.fillRect(m - s * 0.05, m, s * 0.1, 1);
  return c;
}
// A ringed planet, lit from the upper left, its ring tilted across it.
function planet(s: number): HTMLCanvasElement {
  const c = canvas(s), g = c.getContext('2d')!, m = s / 2, R = s * 0.2;
  const ring = (front: boolean) => {
    g.save(); g.translate(m, m); g.rotate(-0.35);
    g.strokeStyle = grey(0.3); g.lineWidth = s * 0.035;
    g.beginPath(); g.ellipse(0, 0, R * 2.1, R * 0.55, 0, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2); g.stroke();
    g.strokeStyle = grey(0.16); g.lineWidth = s * 0.015;
    g.beginPath(); g.ellipse(0, 0, R * 1.65, R * 0.42, 0, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2); g.stroke();
    g.restore();
  };
  ring(false);
  const body = g.createRadialGradient(m - R * 0.45, m - R * 0.45, R * 0.1, m, m, R);
  body.addColorStop(0, grey(0.5)); body.addColorStop(0.7, grey(0.2)); body.addColorStop(1, grey(0.03));
  g.fillStyle = body; g.beginPath(); g.arc(m, m, R, 0, 7); g.fill();
  ring(true);
  return c;
}

export function cosmos() {
  let size = 0, bodies: Body[] = [];
  const build = (w: number, h: number) => {
    size = w;
    const u = Math.min(w, h);
    bodies = [
      { img: galaxy(Math.round(u * 0.7)), x: -0.3, y: -0.2, depth: 0.05, spin: 0.004 },
      { img: blackHole(Math.round(u * 0.55)), x: 0.34, y: 0.3, depth: 0.08 },
      { img: planet(Math.round(u * 0.3)), x: 0.36, y: -0.32, depth: 0.14 },
    ];
  };
  return (g: CanvasRenderingContext2D, w: number, h: number, t: number, vx: number, vy: number) => {
    if (w !== size) build(w, h);
    const wrap = (a: number, n: number) => ((a % n) + n) % n;
    // Stars: three depths, each moving less the farther it is, and wrapping
    // on both axes however far the map is dragged.
    for (const [count, depth, seed, bright] of [[w * h / 140, 0.04, 11, 0.45], [w * h / 420, 0.1, 12, 0.7], [w * h / 1600, 0.2, 13, 0.95]] as const) {
      const r = rand(seed);
      for (let i = 0; i < count; i++) {
        const x = wrap(r() * w + vx * depth, w), y = wrap(r() * h + vy * depth, h);
        const tw = r() < 0.1 ? 0.6 + 0.4 * Math.sin(t * (1 + r() * 2) + i) : 1;
        g.fillStyle = grey((0.3 + r() * 0.7) * bright * tw);
        g.fillRect(x, y, r() < 0.06 ? 2 : 1, 1);
      }
    }
    // The far bodies, moving least of all; the black hole hides what is behind it.
    for (const b of bodies) {
      const x = w / 2 + b.x * w + vx * b.depth, y = h / 2 + b.y * h + vy * b.depth;
      g.save(); g.translate(x, y);
      if (b.spin) g.rotate(t * b.spin);
      g.drawImage(b.img, -b.img.width / 2, -b.img.height / 2);
      g.restore();
    }
  };
}
