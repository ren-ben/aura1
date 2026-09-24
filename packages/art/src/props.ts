// Props and set dressing for scenes, in the same hand as the cat: paper fill
// with a wobbling ink outline, so they read against his black fur. Dark props
// in front of him get a paper halo. The cosmic and Bloodborne pieces (moons,
// eyes in the dark, tentacles, the hunter's tricorn, the saw cleaver,
// the void) carry the lore: an old god who likes you, from somewhere else.

import { curve, ellipse, outline, rng, rotate, stroke, toPath, wobble, type Pt } from './ink.ts';
import type { Palette } from './face.ts';

type Opts = { seed?: number; w?: number };

// Closed line art: paper inside, ink outline.
export function drawn(pts: Pt[], p: Palette, { seed = 1, w = 5 }: Opts = {}, fill = p.paper): string {
  return `<path d="${toPath(wobble(pts, seed, 0.9))}" fill="${fill}" stroke="${p.ink}" stroke-width="${w}" stroke-linejoin="round"/>`;
}
// An open ink line.
export function inkLine(pts: Pt[], p: Palette, { seed = 1, w = 5 }: Opts = {}): string {
  return `<path d="${toPath(wobble(stroke(curve(pts), (t) => w * (0.75 + 0.25 * Math.sin(Math.PI * t))), seed, 0.4))}" fill="${p.ink}"/>`;
}
// A solid ink shape with a paper halo, for dark things in front of the cat.
function haloed(pts: Pt[], p: Palette, seed: number, halo = 7): string {
  const d = toPath(wobble(pts, seed, 0.8));
  return `<path d="${d}" fill="${p.ink}" stroke="${p.paper}" stroke-width="${halo}" stroke-linejoin="round" paint-order="stroke"/>`;
}
const box = (x: number, y: number, w: number, h: number, r = 6): Pt[] => outline([
  [x + r, y], [x + w - r, y], [x + w, y + r], [x + w, y + h - r], [x + w - r, y + h], [x + r, y + h], [x, y + h - r], [x, y + r],
], 2);

// 1-bit dither fills (at the device's half scale these are 1 px patterns), and
// `halo`: a paper border around anything held in front of his black fur.
export const DITHER = (p: Palette) => `<defs>
<pattern id="d25" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="2" height="2" fill="${p.ink}"/></pattern>
<pattern id="d50" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="2" height="2" fill="${p.ink}"/><rect x="2" y="2" width="2" height="2" fill="${p.ink}"/></pattern>
<pattern id="d75" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="4" fill="${p.ink}"/><rect width="2" height="2" fill="${p.paper}"/></pattern>
<filter id="halo" x="-20%" y="-20%" width="140%" height="140%"><feMorphology in="SourceAlpha" operator="dilate" radius="4" result="grown"/><feFlood flood-color="${p.paper}"/><feComposite in2="grown" operator="in"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>`;

export function desk(y: number, p: Palette, seed = 30): string {
  return inkLine([[-6, y], [140, y + 1], [270, y - 1], [406, y]], p, { seed, w: 6 });
}

// A laptop from behind: the lid's back in ink, a white crescent on it.
export function laptop(x: number, y: number, p: Palette, seed = 40): string {
  return haloed(box(x - 58, y - 56, 116, 62, 8), p, seed)
    + `<path d="${toPath(wobble(outline([[x - 8, y - 34], [x + 2, y - 42], [x + 12, y - 36], [x + 3, y - 38], [x - 3, y - 30], [x + 6, y - 22], [x - 6, y - 24]]), seed + 1, 0.3))}" fill="${p.paper}"/>`
    + inkLine([[x - 78, y + 8], [x + 78, y + 8]], p, { seed: seed + 2, w: 7 });
}

// An open book lying on the desk, pages fanning.
export function book(x: number, y: number, p: Palette, seed = 50): string {
  const left = outline([[x, y - 6], [x - 30, y - 16], [x - 62, y - 10], [x - 66, y + 4], [x, y + 6]], 3);
  const right = outline([[x, y - 6], [x + 30, y - 16], [x + 62, y - 10], [x + 66, y + 4], [x, y + 6]], 3);
  const lines = [-44, -30].flatMap((dx) => [
    inkLine([[x + dx, y - 6], [x + dx + 22, y - 10]], p, { seed: seed + dx, w: 2.5 }),
    inkLine([[x - dx - 22, y - 10], [x - dx, y - 6]], p, { seed: seed - dx, w: 2.5 }),
  ]);
  return drawn(left, p, { seed }) + drawn(right, p, { seed: seed + 1 }) + lines.join('');
}

// A mug of black coffee with steam curling off it.
export function mug(x: number, y: number, p: Palette, seed = 60, steam = true): string {
  const body = outline([[x - 16, y - 34], [x + 16, y - 34], [x + 15, y - 2], [x + 10, y + 2], [x - 10, y + 2], [x - 15, y - 2]], 3);
  const handle = inkLine([[x + 15, y - 26], [x + 26, y - 24], [x + 26, y - 12], [x + 15, y - 10]], p, { seed: seed + 1, w: 5 });
  const coffee = `<path d="${toPath(ellipse(x, y - 32, 13, 3.5, 16))}" fill="${p.ink}"/>`;
  const wisps = steam ? [inkLine([[x - 6, y - 42], [x - 10, y - 54], [x - 4, y - 64], [x - 8, y - 76]], p, { seed: seed + 2, w: 3 }),
    inkLine([[x + 6, y - 44], [x + 10, y - 56], [x + 5, y - 68]], p, { seed: seed + 3, w: 3 })].join('') : '';
  return drawn(body, p, { seed }) + handle + coffee + wisps;
}

// A candle with drips; lit, it has a flame and a few rays, else a smoke curl.
export function candle(x: number, y: number, p: Palette, lit = true, seed = 70): string {
  const body = outline([[x - 11, y - 50], [x - 4, y - 53], [x + 11, y - 50], [x + 12, y - 30], [x + 11, y], [x - 11, y], [x - 12, y - 24]], 3);
  const drip = inkLine([[x - 5, y - 50], [x - 5, y - 38]], p, { seed: seed + 1, w: 3 });
  const wick = inkLine([[x, y - 52], [x + 1, y - 60]], p, { seed: seed + 2, w: 2.5 });
  const flame = lit
    ? `<path d="${toPath(wobble(outline([[x + 1, y - 84], [x + 8, y - 68], [x + 1, y - 58], [x - 6, y - 68]]), seed + 3, 0.4))}" fill="${p.ink}"/>`
      + [[-22, -72], [22, -72], [0, -98], [-16, -90], [16, -90]].map(([dx, dy], i) =>
        inkLine([[x + dx! * 0.7, y + dy! * 0.95], [x + dx!, y + dy!]], p, { seed: seed + 4 + i, w: 2.5 })).join('')
    : inkLine([[x + 1, y - 62], [x - 6, y - 74], [x + 4, y - 86], [x - 3, y - 100]], p, { seed: seed + 4, w: 2.5 });
  return drawn(body, p, { seed }) + drip + wick + flame;
}

// A quill standing in an inkpot.
export function quill(x: number, y: number, p: Palette, seed = 80): string {
  const pot = outline([[x - 16, y - 20], [x + 16, y - 20], [x + 18, y], [x - 18, y]], 3);
  const vane = outline([[x - 2, y - 22], [x + 18, y - 70], [x + 30, y - 104], [x + 22, y - 72], [x + 6, y - 30]], 4);
  return drawn(vane, p, { seed: seed + 1, w: 4 }) + inkLine([[x - 2, y - 22], [x + 26, y - 100]], p, { seed: seed + 2, w: 2.5 })
    + drawn(pot, p, { seed }, p.ink);
}

// A window pane with a moon: 'crescent', 'full' (paleblood, dithered) or 'blood' (dark, dithered).
export function windowMoon(x: number, y: number, w: number, h: number, p: Palette, moon: 'crescent' | 'full' | 'blood', seed = 90): string {
  const frame = drawn(box(x, y, w, h, 4), p, { seed, w: 7 });
  const bars = inkLine([[x + w / 2, y], [x + w / 2, y + h]], p, { seed: seed + 1, w: 6 })
    + inkLine([[x, y + h * 0.55], [x + w, y + h * 0.55]], p, { seed: seed + 2, w: 6 });
  const [mx, my, r] = [x + w * 0.28, y + h * 0.3, Math.min(w, h) * 0.16];
  const moonArt = moon === 'crescent'
    ? `<path d="${toPath(wobble(ellipse(mx, my, r, r, 32), seed + 3, 0.4))}" fill="${p.ink}"/><path d="${toPath(ellipse(mx + r * 0.45, my - r * 0.2, r * 0.85, r * 0.85, 32))}" fill="${p.paper}"/>`
    : `<path d="${toPath(wobble(ellipse(mx, my, r, r, 32), seed + 3, 0.4))}" fill="url(#${moon === 'blood' ? 'd75' : 'd25'})" stroke="${p.ink}" stroke-width="4"/>`;
  const stars = [[0.72, 0.18], [0.84, 0.36], [0.62, 0.4], [0.14, 0.72], [0.8, 0.78]].map(([fx, fy], i) =>
    `<path d="${toPath(ellipse(x + w * fx!, y + h * fy!, 2.5, 2.5, 8))}" fill="${p.ink}"/>`).join('');
  return frame + moonArt + stars + bars;
}

// A little sheet ghost, his friend from the haunted house.
export function ghost(x: number, y: number, p: Palette, seed = 100, s = 1): string {
  const body = outline([[x, y - 40 * s], [x + 22 * s, y - 26 * s], [x + 24 * s, y + 4 * s], [x + 30 * s, y + 20 * s], [x + 14 * s, y + 14 * s],
    [x, y + 22 * s], [x - 14 * s, y + 14 * s], [x - 30 * s, y + 20 * s], [x - 24 * s, y + 4 * s], [x - 22 * s, y - 26 * s]], 4);
  const eyes = [-8, 8].map((dx) => `<path d="${toPath(ellipse(x + dx * s, y - 14 * s, 3.5 * s, 5 * s, 12))}" fill="${p.ink}"/>`).join('');
  return drawn(body, p, { seed, w: 5 }) + eyes;
}

export function bat(x: number, y: number, p: Palette, s = 1, seed = 110): string {
  const wing = (dir: number): Pt[] => [[x, y], [x + dir * 10 * s, y - 8 * s], [x + dir * 22 * s, y - 6 * s], [x + dir * 16 * s, y + 1 * s],
    [x + dir * 20 * s, y + 6 * s], [x + dir * 10 * s, y + 3 * s]];
  return `<path d="${toPath(wobble(outline([...wing(-1), ...wing(1).reverse()], 2), seed, 0.5))}" fill="${p.ink}"/>`;
}

export function pumpkin(x: number, y: number, p: Palette, seed = 120): string {
  const body = outline([[x, y - 30], [x + 26, y - 26], [x + 36, y - 8], [x + 30, y + 10], [x, y + 14], [x - 30, y + 10], [x - 36, y - 8], [x - 26, y - 26]], 4);
  return drawn(body, p, { seed }) + inkLine([[x, y - 28], [x - 2, y + 12]], p, { seed: seed + 1, w: 3.5 })
    + inkLine([[x - 16, y - 26], [x - 20, y + 10]], p, { seed: seed + 2, w: 3.5 }) + inkLine([[x + 16, y - 26], [x + 20, y + 10]], p, { seed: seed + 3, w: 3.5 })
    + inkLine([[x, y - 30], [x + 4, y - 42], [x + 10, y - 44]], p, { seed: seed + 4, w: 5 });
}

// The containment unit Amygdala Inc. shipped him in: a plain ink slab with
// hard edges, a hazard band and stencilled words. Minimal and a little
// brutal; the joke is in the label. Its lid is drawn apart, so he can come
// up between the two.
export function containmentBox(x: number, y: number, w: number, h: number, p: Palette): string {
  const cx = x + w / 2;
  const body = `<path d="M ${x} ${y} H ${x + w} V ${y + h} H ${x} Z" fill="${p.ink}" stroke="${p.paper}" stroke-width="4" paint-order="stroke"/>`;
  const stripes = `<clipPath id="band${x}"><path d="M ${x + 8} ${y + 8} H ${x + w - 8} V ${y + 22} H ${x + 8} Z"/></clipPath>`
    + `<g clip-path="url(#band${x})">${Array.from({ length: Math.ceil(w / 16) + 1 }, (_, i) =>
      `<path d="M ${x + i * 16} ${y + 22} L ${x + i * 16 + 8} ${y + 22} L ${x + i * 16 + 22} ${y + 8} L ${x + i * 16 + 14} ${y + 8} Z" fill="${p.paper}"/>`).join('')}</g>`;
  const text = (ty: number, size: number, body: string, spacing = 1) =>
    `<text x="${cx}" y="${ty}" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="${size}" letter-spacing="${spacing}" fill="${p.paper}">${body}</text>`;
  const bolts = [[x + 10, y + h - 10], [x + w - 10, y + h - 10]].map(([bx, by]) =>
    `<path d="${toPath(ellipse(bx!, by!, 3.5, 3.5, 10))}" fill="${p.paper}"/>`).join('');
  return body + stripes + text(y + h * 0.48, h * 0.2, 'FRAGILE', 3) + text(y + h * 0.66, h * 0.12, 'COSMIC ENTITY')
    + text(y + h * 0.8, h * 0.12, 'DO NOT FEED') + bolts;
}

// The unit's heavy lid, tipping back on its hinge at the right as it is
// pushed open: 0 shut, 1 wide.
export function containmentLid(x: number, y: number, w: number, p: Palette, open = 0): string {
  return `<g transform="rotate(${open * 32} ${x + w} ${y})"><path d="M ${x - 6} ${y - 14} H ${x + w + 6} V ${y} H ${x - 6} Z" fill="${p.ink}" stroke="${p.paper}" stroke-width="4" paint-order="stroke"/></g>`;
}

// The hunter's tricorn, worn over the head between the ears: a wide brim
// swept up into two side points and a front point, a low crown behind.
export function tricorn(p: Palette, seed = 140): string {
  const crown = outline([[150, 142], [162, 104], [200, 94], [238, 104], [250, 142]], 3);
  const brim = outline([[84, 104], [118, 134], [160, 146], [200, 170], [240, 146], [282, 134], [316, 104], [296, 150],
    [248, 164], [200, 186], [152, 164], [104, 150]], 3);
  return haloed(crown, p, seed, 8) + haloed(brim, p, seed + 1, 8)
    + `<path d="${toPath(wobble(stroke(curve([[120, 146], [160, 156], [200, 176], [240, 156], [280, 146]]), () => 3), seed + 2, 0.3))}" fill="${p.paper}"/>`;
}

// A small saw cleaver held upright, folded, in his paw.
export function cleaver(x: number, y: number, p: Palette, seed = 150): string {
  const blade = outline([[x - 6, y - 96], [x + 14, y - 100], [x + 16, y - 30], [x - 4, y - 26]], 2);
  const teeth = Array.from({ length: 6 }, (_, i) => inkLine([[x + 16, y - 92 + i * 11], [x + 22, y - 88 + i * 11]], p, { seed: seed + i, w: 3 })).join('');
  return drawn(blade, p, { seed, w: 5 }) + teeth + inkLine([[x + 4, y - 28], [x + 3, y + 10]], p, { seed: seed + 9, w: 8 });
}

// A moon disc, solid so nothing shows through it. 'paleblood' is paper with a
// dithered shadow along one side and two craters; 'blood' is dark.
export function moon(x: number, y: number, r: number, p: Palette, kind: 'paleblood' | 'blood', seed = 170): string {
  const disc = toPath(wobble(ellipse(x, y, r, r, 64), seed, 1));
  const rim = `<path d="${disc}" fill="none" stroke="${p.ink}" stroke-width="5"/>`;
  if (kind === 'blood') return `<path d="${disc}" fill="${p.paper}"/><path d="${disc}" fill="url(#d75)"/>${rim}`;
  const craters = [[0.3, -0.25, 0.16], [-0.05, 0.35, 0.11]].map(([dx, dy, cr]) =>
    `<path d="${toPath(ellipse(x + dx! * r, y + dy! * r, cr! * r, cr! * r, 16))}" fill="none" stroke="${p.ink}" stroke-width="2.5"/>`).join('');
  return `<clipPath id="moon${seed}"><path d="${disc}"/></clipPath>`
    + `<path d="${disc}" fill="url(#d25)"/>`
    + `<path d="${toPath(ellipse(x + r * 0.3, y - r * 0.12, r, r, 48))}" fill="${p.paper}" clip-path="url(#moon${seed})"/>`
    + craters + rim;
}


// Buildings in his ink: solid silhouettes like his fur, with windows cut out
// in paper. Corners stay sharp, only the vertices drift a little, like a
// woodcut.
function solid(pts: Pt[], p: Palette, seed: number, fill = p.ink): string {
  const r = rng(seed);
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'} ${(x + (r() - 0.5) * 1.6).toFixed(1)} ${(y + (r() - 0.5) * 1.6).toFixed(1)}`).join(' ');
  return `<path d="${d} Z" fill="${fill}"/>`;
}

// A needle spire from (x0..x1, base) up to `tip`, with crockets: little
// hooks jutting from its edges on the way up.
function spire(x0: number, x1: number, base: number, tip: number, p: Palette, seed: number): string {
  const cx = (x0 + x1) / 2;
  const n = Math.max(2, Math.floor((base - tip) / 22));
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i < n; ++i) {
    const t = i / n;
    const y = base - (base - tip) * t;
    const half = ((x1 - x0) / 2) * (1 - t);
    const t2 = (i + 0.5) / n;
    const y2 = base - (base - tip) * t2;
    const half2 = ((x1 - x0) / 2) * (1 - t2);
    left.push([cx - half, y], [cx - half2 - 5, y2 + 4], [cx - half2, y2]);
    right.push([cx + half, y], [cx + half2 + 5, y2 + 4], [cx + half2, y2]);
  }
  return solid([...left, [cx, tip], ...right.reverse()], p, seed)
    + inkLine([[cx, tip + 2], [cx, tip - 14]], p, { seed: seed + 1, w: 3 })
    + inkLine([[cx - 5, tip - 8], [cx + 5, tip - 8]], p, { seed: seed + 2, w: 3 });
}

// A pinnacle: a thin spike on a post, for tower corners and buttresses.
const pinnacle = (x: number, y: number, h: number, p: Palette, seed: number) =>
  solid([[x - 4, y], [x - 4, y - h * 0.4], [x, y - h], [x + 4, y - h * 0.4], [x + 4, y]], p, seed);

// A pointed (lancet) window cut in paper.
const lancet = (cx: number, top: number, w: number, h: number, p: Palette) =>
  `<path d="M ${cx - w / 2} ${top + h} L ${cx - w / 2} ${top + w * 0.7} Q ${cx - w / 2} ${top + w * 0.15} ${cx} ${top} Q ${cx + w / 2} ${top + w * 0.15} ${cx + w / 2} ${top + w * 0.7} L ${cx + w / 2} ${top + h} Z" fill="${p.paper}"/>`;

// A gothic town along the bottom, all in ink: a cathedral on the left with
// two crocketed needle spires, pinnacles, a flying buttress, a rose window
// and a pointed portal; a chapel spire at the right edge, clear of his tail
// and under the moon. The middle stays open for him.
export function gothicTown(p: Palette, seed = 320, { houses = true } = {}): string {
  const base = 396;
  const tower = (x0: number, x1: number, top: number, tip: number, s: number) => {
    const cx = (x0 + x1) / 2;
    return solid([[x0, base], [x0, top], [x1, top], [x1, base]], p, s)
      + spire(x0 + 2, x1 - 2, top, tip, p, s + 1)
      + pinnacle(x0 + 1, top, 22, p, s + 2) + pinnacle(x1 - 1, top, 22, p, s + 3)
      + lancet(cx, top + 16, 9, 30, p) + lancet(cx, top + 64, 9, 30, p);
  };
  const rose = (cx: number, cy: number, r: number) =>
    `<path d="${toPath(ellipse(cx, cy, r, r, 28))}" fill="${p.paper}"/>`
    + Array.from({ length: 4 }, (_, i) => {
      const a = (i / 4) * Math.PI;
      return inkLine([[cx - r * Math.cos(a), cy - r * Math.sin(a)], [cx + r * Math.cos(a), cy + r * Math.sin(a)]], p, { seed: seed + 60 + i, w: 3 });
    }).join('')
    + `<path d="${toPath(ellipse(cx, cy, 4, 4, 12))}" fill="${p.ink}"/>`;
  const buttress = solid([[112, 300], [132, 320], [140, 348], [140, base], [132, base], [130, 352], [120, 326], [112, 318]], p, seed + 70)
    + pinnacle(136, 350, 34, p, seed + 71);
  const cathedral = solid([[30, base], [30, 268], [62, 226], [94, 268], [94, base]], p, seed)
    + pinnacle(62, 230, 26, p, seed + 5)
    + tower(4, 36, 214, 86, seed + 10) + tower(88, 116, 236, 128, seed + 20)
    + buttress
    + rose(62, 292, 14)
    + lancet(62, 336, 22, 60, p);
  const house = (x0: number, x1: number, wall: number, peak: number, s: number) => {
    const cx = (x0 + x1) / 2;
    return solid([[x0, base], [x0, wall], [cx, peak], [x1, wall], [x1, base]], p, s)
      + pinnacle(cx, peak + 4, 18, p, s + 1)
      + lancet(cx - 9, wall + 12, 8, 22, p) + lancet(cx + 9, wall + 12, 8, 22, p);
  };
  const town = houses
    ? solid([[362, base], [362, 262], [394, 262], [394, base]], p, seed + 45)
      + spire(364, 392, 262, 160, p, seed + 46) + lancet(378, 284, 9, 28, p) + house(390, 424, 330, 290, seed + 50)
    : '';
  return cathedral + town;
}

// Eyes opening in the dark around him: insight, the horror at the edges.
export function eyesInTheDark(p: Palette, count: number, seed = 180, area: [number, number, number, number] = [0, 0, 400, 400], avoid?: [number, number, number]): string {
  const r = rng(seed);
  const out: string[] = [];
  let tries = 0;
  while (out.length < count && tries++ < 400) {
    const x = area[0] + r() * area[2];
    const y = area[1] + r() * area[3];
    if (avoid && Math.hypot(x - avoid[0], y - avoid[1]) < avoid[2]) continue;
    const s = 0.6 + r() * 0.8;
    const lid = outline([[x - 14 * s, y], [x, y - 7 * s], [x + 14 * s, y], [x, y + 7 * s]], 4);
    out.push(`<path d="${toPath(wobble(lid, seed + out.length, 0.5))}" fill="${p.paper}" stroke="${p.ink}" stroke-width="3"/>`
      + `<path d="${toPath(ellipse(x + (r() - 0.5) * 6 * s, y, 2.5 * s, 5.5 * s, 12))}" fill="${p.ink}"/>`);
  }
  return out.join('');
}

// Tentacles rising from the bottom edge, in ink.
export function tentacles(p: Palette, seed = 190, xs: number[] = [40, 110, 300, 360]): string {
  const r = rng(seed);
  return xs.map((x, i) => {
    const h = 120 + r() * 120;
    const bend = (r() - 0.5) * 60;
    const pts: Pt[] = [[x, 410], [x + bend * 0.3, 400 - h * 0.35], [x - bend * 0.4, 400 - h * 0.7], [x + bend, 400 - h], [x + bend * 1.3, 400 - h - 14]];
    return `<path d="${toPath(wobble(stroke(curve(pts), (t) => 22 * (1 - t) + 3), seed + i, 1))}" fill="${p.ink}"/>`;
  }).join('');
}

// Stars scattered as paper dots, used inside his silhouette for the void form.
export function starfield(p: Palette, count: number, seed = 200, area: [number, number, number, number] = [0, 0, 400, 400]): string {
  const r = rng(seed);
  return Array.from({ length: count }, () => {
    const [x, y] = [area[0] + r() * area[2], area[1] + r() * area[3]];
    const big = r() < 0.15;
    return big
      ? `<path d="${toPath(outline(Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2;
        const rr = i % 2 ? 1.5 : 6;
        return [x + rr * Math.cos(a), y + rr * Math.sin(a)] as Pt;
      }), 2))}" fill="${p.paper}"/>`
      : `<path d="${toPath(ellipse(x, y, 1.6, 1.6, 8))}" fill="${p.paper}"/>`;
  }).join('');
}

// A speech bubble with its tail toward (tx, ty).
export function bubble(x: number, y: number, w: number, h: number, tx: number, ty: number, p: Palette, seed = 210): string {
  const pts: Pt[] = [...box(x, y, w, h, 18)];
  const cx = Math.min(Math.max(tx, x + 24), x + w - 24);
  const tailPts: Pt[] = [[cx - 12, y + h - 2], [tx, ty], [cx + 12, y + h - 2]];
  return drawn(pts, p, { seed, w: 5 }) + drawn(tailPts, p, { seed: seed + 1, w: 5 })
    + `<path d="${toPath(outline([[cx - 9, y + h - 6], [cx + 9, y + h - 6], [cx, y + h + 4]], 2))}" fill="${p.paper}"/>`;
}

// Eldritch runes floating off his work: circles, crescents, an eye, a cross.
export function runes(x: number, y: number, p: Palette, seed = 220, count = 3): string {
  const r = rng(seed);
  const glyphs = [
    (gx: number, gy: number) => inkLine(ellipse(gx, gy, 9, 9, 20).concat([[gx + 9, gy]]), p, { seed: seed + 1, w: 3 })
      + inkLine([[gx, gy - 14], [gx, gy + 14]], p, { seed: seed + 2, w: 3 }),
    (gx: number, gy: number) => inkLine([[gx - 8, gy - 10], [gx + 2, gy - 4], [gx + 4, gy + 6], [gx - 6, gy + 12]], p, { seed: seed + 3, w: 3 })
      + `<path d="${toPath(ellipse(gx + 9, gy - 8, 2.5, 2.5, 8))}" fill="${p.ink}"/>`,
    (gx: number, gy: number) => inkLine([[gx - 12, gy], [gx, gy - 7], [gx + 12, gy], [gx, gy + 7], [gx - 12, gy]], p, { seed: seed + 4, w: 3 })
      + `<path d="${toPath(ellipse(gx, gy, 3, 4, 8))}" fill="${p.ink}"/>`,
    (gx: number, gy: number) => inkLine([[gx - 10, gy - 10], [gx + 10, gy + 10]], p, { seed: seed + 5, w: 3 })
      + inkLine([[gx + 10, gy - 10], [gx - 10, gy + 10]], p, { seed: seed + 6, w: 3 })
      + inkLine([[gx, gy - 14], [gx, gy - 6]], p, { seed: seed + 7, w: 3 }),
  ];
  return Array.from({ length: count }, (_, i) => glyphs[Math.floor(r() * glyphs.length)]!(x + i * 30 + (r() - 0.5) * 10, y - i * 22 + (r() - 0.5) * 10)).join('');
}

// Rain: short slanted strokes across an area.
export function rain(p: Palette, area: [number, number, number, number], seed = 240, count = 40): string {
  const r = rng(seed);
  return Array.from({ length: count }, (_, i) => {
    const [x, y] = [area[0] + r() * area[2], area[1] + r() * area[3]];
    return inkLine([[x, y], [x - 5, y + 16]], p, { seed: seed + i, w: 2.5 });
  }).join('');
}

// Scales any prop about a point, for holding things bigger than they stand.
export function scaled(svg: string, x: number, y: number, k: number): string {
  return `<g transform="translate(${x} ${y}) scale(${k}) translate(${-x} ${-y})">${svg}</g>`;
}

// A quill in the hand, its nib at (x, y), leaning away up to the right.
export function penQuill(x: number, y: number, p: Palette, seed = 90): string {
  const vane = outline([[x + 6, y - 14], [x + 20, y - 52], [x + 38, y - 96], [x + 32, y - 58], [x + 14, y - 20]], 4);
  return drawn(vane, p, { seed, w: 4 }) + inkLine([[x, y], [x + 36, y - 94]], p, { seed: seed + 1, w: 2.5 });
}

// The book he copies into, open on the desk: its right leaf fills with a line
// of his script for every `lines`, left to right, top to bottom.
export function copyBook(x: number, y: number, p: Palette, lines: number, seed = 95): string {
  const left = outline([[x, y - 6], [x - 30, y - 16], [x - 62, y - 10], [x - 66, y + 4], [x, y + 6]], 3);
  const right = outline([[x, y - 6], [x + 30, y - 16], [x + 62, y - 10], [x + 66, y + 4], [x, y + 6]], 3);
  const written = [-44, -30].map((dx, i) => inkLine([[x + dx, y - 6], [x + dx + 22, y - 10]], p, { seed: seed + i, w: 2.5 }));
  for (let i = 0; i < lines; i++) {
    const dx = 8 + i * 13;
    written.push(inkLine([[x + dx, y - 8 - i * 0.6], [x + dx + 9, y - 11 - i * 0.6]], p, { seed: seed + 10 + i, w: 2.5 }));
  }
  return drawn(left, p, { seed }) + drawn(right, p, { seed: seed + 1 }) + written.join('');
}

// A book held up to read, seen from its cover, a moon sigil on the front.
export function heldBook(x: number, y: number, p: Palette, seed = 250): string {
  const cover = outline([[x - 38, y - 56], [x + 38, y - 60], [x + 40, y + 2], [x - 36, y + 4]], 2);
  return drawn(cover, p, { seed, w: 6 }) + inkLine([[x - 30, y - 56], [x - 29, y + 2]], p, { seed: seed + 1, w: 4 })
    + `<path d="${toPath(wobble(ellipse(x + 4, y - 28, 12, 12, 24), seed + 2, 0.4))}" fill="${p.ink}"/>`
    + `<path d="${toPath(ellipse(x + 9, y - 31, 10, 10, 24))}" fill="${p.paper}"/>`;
}

// Amygdala, the Great One who clings to the cathedral, in ink like the town:
// a long lumpy cranium with no face but clusters of small eyes, and long
// bony arms that hold on to the stone. Each arm is [shoulder, elbow, hand] in
// head units, head up; headDown turns the whole of him over, as he hangs.
// A paper edge keeps him apart from the ink stone he clings to.
export type Arm = [number, number, number, number, number, number];
export function amygdala(x: number, y: number, p: Palette, arms: Arm[], { seed = 270, k = 1, headDown = false } = {}): string {
  const r = rng(seed);
  const bone = (pts: Pt[], w: number) => stroke(curve(pts, 6), (t) => w * (1 - 0.45 * t));
  const at = (dx: number, dy: number): Pt => [x + dx * k, y + dy * k];
  const parts: Pt[][] = [];
  for (const [sx, sy, ex, ey, hx, hy] of arms) {
    const [sh, el, hand] = [at(sx, sy), at(ex, ey), at(hx, hy)];
    parts.push(bone([sh, el], 12 * k), bone([el, hand], 9 * k));
    // Long fingers, curled on in the arm's direction.
    const [dx, dy] = [hand[0] - el[0], hand[1] - el[1]];
    const len = Math.hypot(dx, dy);
    const [ux, uy] = [dx / len, dy / len];
    for (const spread of [-0.5, 0, 0.5]) {
      const [fx, fy] = [ux * Math.cos(spread) - uy * Math.sin(spread), ux * Math.sin(spread) + uy * Math.cos(spread)];
      parts.push(bone([hand, [hand[0] + fx * 12 * k, hand[1] + fy * 12 * k], [hand[0] + (fx * 20 + ux * 4) * k, hand[1] + (fy * 20 + uy * 4) * k]], 4 * k));
    }
  }
  // The cranium: a long egg, lumpy along its crown.
  parts.push(Array.from({ length: 48 }, (_, i) => {
    const a = (i / 48) * Math.PI * 2;
    const lump = a > Math.PI ? 1 + 0.07 * Math.sin(a * 7) : 1;
    return [x + Math.cos(a) * 34 * k * lump, y + Math.sin(a) * 58 * k * lump] as Pt;
  }));
  const ink = parts.map((q) => toPath(wobble(q, seed + 7, 0.5))).join(' ');
  const eyes = Array.from({ length: 22 }, () => {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * 0.82;
    const [cx, cy] = [x + Math.cos(a) * d * 30 * k, y + 8 * k + Math.sin(a) * d * 48 * k];
    const e = (2 + r() * 2.2) * k;
    return `<path d="${toPath(ellipse(cx, cy, e, e * 1.3, 10))}" fill="${p.paper}"/>`
      + `<path d="${toPath(ellipse(cx, cy + e * 0.2, e * 0.4, e * 0.6, 8))}" fill="${p.ink}"/>`;
  }).join('');
  return `<g transform="rotate(${headDown ? 180 : 0} ${x} ${y})"><path d="${ink}" fill="${p.ink}" stroke="${p.paper}" stroke-width="${6 * k}" stroke-linejoin="round"/>`
    + `<path d="${ink}" fill="${p.ink}"/>${eyes}</g>`;
}

// A messenger from the Hunter's Dream: a pale little thing rising out of the
// ground, round bald head, hollow eyes, thin arms up. Harmless and odd.
export function messenger(x: number, y: number, p: Palette, seed = 280, s = 1): string {
  const body = outline([[x - 8 * s, y], [x - 6 * s, y - 20 * s], [x, y - 24 * s], [x + 6 * s, y - 20 * s], [x + 8 * s, y]], 3);
  const headShape = ellipse(x, y - 34 * s, 13 * s, 12 * s, 20);
  const arms = [-1, 1].map((d) => inkLine([[x + d * 6 * s, y - 16 * s], [x + d * 16 * s, y - 24 * s], [x + d * 20 * s, y - 36 * s]], p, { seed: seed + d, w: 3 * s })).join('');
  const eyes = [-5, 5].map((dx) => `<path d="${toPath(ellipse(x + dx * s, y - 34 * s, 3 * s, 3.5 * s, 10))}" fill="${p.ink}"/>`).join('');
  return arms + drawn(body, p, { seed, w: 4 }) + drawn(headShape, p, { seed: seed + 3, w: 4 }) + eyes
    + inkLine([[x - 16 * s, y + 2], [x + 16 * s, y + 2]], p, { seed: seed + 5, w: 4 });
}

// A moon with something vast behind it: long tentacles hanging from its rim.
export function tentacledMoon(x: number, y: number, rad: number, p: Palette, seed = 290): string {
  const r = rng(seed);
  const hanging = Array.from({ length: 5 }, (_, i) => {
    const a = Math.PI * (0.15 + i * 0.175);
    const [sx, sy] = [x + Math.cos(a) * rad * 0.9, y + Math.sin(a) * rad * 0.9];
    const len = 60 + r() * 90;
    const sway = (r() - 0.5) * 30;
    const pts: Pt[] = [[sx, sy], [sx + sway * 0.4, sy + len * 0.4], [sx - sway * 0.3, sy + len * 0.75], [sx + sway, sy + len]];
    return `<path d="${toPath(wobble(stroke(curve(pts), (t) => 11 * (1 - t) + 2), seed + i, 0.6))}" fill="${p.ink}"/>`;
  });
  return hanging.join('') + moon(x, y, rad, p, 'paleblood', seed + 9);
}


// A bonfire, as in the old lands: a coiled sword leaning in a mound of ash
// and bones, low flames curling around its foot, a few embers rising.
export function bonfire(x: number, y: number, p: Palette, seed = 330, lean = 10): string {
  const r = rng(seed);
  const mound = outline([[x - 58, y], [x - 44, y - 12], [x - 22, y - 20], [x, y - 24], [x + 24, y - 20], [x + 44, y - 12], [x + 60, y]], 3);
  // Bones and skulls half sunk in the ash, cut out in paper.
  const bones = [[-36, -8, 9, 3.5, -0.3], [-12, -16, 6, 5, 0], [14, -14, 10, 3, 0.4], [38, -7, 7, 3, -0.2]].map(([dx, dy, rx, ry, a]) =>
    `<path d="${toPath(rotate(ellipse(x + dx!, y + dy!, rx!, ry!, 12), a! * 57, [x + dx!, y + dy!]))}" fill="${p.paper}"/>`).join('')
    + `<path d="${toPath(ellipse(x - 12, y - 17, 2, 2, 8))}" fill="${p.ink}"/><path d="${toPath(ellipse(x - 8, y - 17, 2, 2, 8))}" fill="${p.ink}"/>`;
  // The coiled sword, upright but leaning: a blade twisted along its length
  // (the paper notches), a short guard, a grip and a round pommel.
  const blade: Pt[] = [[x - 4, y - 14], [x - 4, y - 96], [x, y - 106], [x + 4, y - 96], [x + 4, y - 14]];
  const twist = Array.from({ length: 7 }, (_, i) => {
    const ty = y - 24 - i * 11;
    return `<path d="M ${x - 4} ${ty} L ${x + 4} ${ty - 6} L ${x + 4} ${ty - 3} L ${x - 4} ${ty + 3} Z" fill="${p.paper}"/>`;
  }).join('');
  const hilt = `<path d="M ${x - 14} ${y - 98} L ${x + 14} ${y - 98} L ${x + 12} ${y - 92} L ${x - 12} ${y - 92} Z" fill="${p.ink}"/>`
    + `<path d="M ${x - 3} ${y - 98} L ${x - 3} ${y - 120} L ${x + 3} ${y - 120} L ${x + 3} ${y - 98} Z" fill="${p.ink}"/>`
    + `<path d="${toPath(ellipse(x, y - 124, 6, 6, 12))}" fill="${p.ink}"/>`;
  const sword = `<g transform="rotate(${lean} ${x} ${y - 14})"><path d="${toPath(blade)}" fill="${p.ink}" stroke="${p.paper}" stroke-width="3" paint-order="stroke"/>${twist}${hilt}</g>`;
  // Flames: a few tongues no higher than the sword's lower third, curling.
  const tongue = (fx: number, h: number, curl: number, s: number) => {
    const pts: Pt[] = [[fx - 16, y - 16], [fx - 18, y - h * 0.45], [fx - 6 + curl * 0.3, y - h * 0.8], [fx + curl, y - h],
      [fx + 6, y - h * 0.62], [fx + 17, y - h * 0.4], [fx + 15, y - 16]];
    return `<path d="${toPath(wobble(outline(pts, 3), s, 0.8))}" fill="${p.ink}"/>`;
  };
  const flames = tongue(x - 22, 50, -10, seed + 1) + tongue(x + 20, 56, 12, seed + 2) + tongue(x - 2, 72, -8, seed + 3)
    + `<path d="${toPath(wobble(outline([[x - 12, y - 16], [x - 10, y - 38], [x - 2, y - 52], [x + 4, y - 40], [x + 10, y - 30], [x + 12, y - 16]], 3), seed + 5, 0.6))}" fill="${p.paper}"/>`;
  const embers = Array.from({ length: 6 }, () => {
    const [ex, ey] = [x + (r() - 0.5) * 70, y - 60 - r() * 80];
    return `<path d="${toPath(ellipse(ex, ey, 2, 2, 8))}" fill="${p.ink}"/>`;
  }).join('');
  return sword + flames + `<path d="${toPath(wobble(mound, seed + 6, 1))}" fill="${p.ink}"/>` + bones + embers;
}


// A gnarled dead tree in ink at the edge of the dream, roots in the ground.
export function deadTree(x: number, y: number, p: Palette, seed = 350, dir = 1): string {
  const r = rng(seed);
  const parts: string[] = [];
  const branch = (from: Pt, angle: number, len: number, w: number, depth: number) => {
    const bend = (r() - 0.5) * 0.6;
    const mid: Pt = [from[0] + Math.cos(angle + bend) * len * 0.5, from[1] + Math.sin(angle + bend) * len * 0.5];
    const to: Pt = [from[0] + Math.cos(angle) * len, from[1] + Math.sin(angle) * len];
    parts.push(`<path d="${toPath(wobble(stroke(curve([from, mid, to], 6), (t) => w * (1 - 0.6 * t) + 1), seed + parts.length, 0.5))}" fill="${p.ink}"/>`);
    if (depth > 0) {
      branch(to, angle - 0.5 - r() * 0.3, len * 0.7, w * 0.6, depth - 1);
      branch(to, angle + 0.4 + r() * 0.3, len * 0.65, w * 0.6, depth - 1);
    }
  };
  branch([x, y], -Math.PI / 2 + dir * 0.08, 150, 26, 3);
  parts.push(`<path d="${toPath(wobble(outline([[x - 30, y + 2], [x - 12, y - 14], [x + 12, y - 14], [x + 30, y + 2]], 3), seed, 1))}" fill="${p.ink}"/>`);
  return parts.join('');
}


// A great eye open in the night sky, no window around it: something vast
// looking down at him. Ink lids, a paper white, a slit pupil.
export function skyEye(x: number, y: number, w: number, p: Palette, seed = 300): string {
  const h = w * 0.42;
  const lid = outline([[x - w / 2, y], [x - w / 4, y - h * 0.8], [x + w / 4, y - h * 0.8], [x + w / 2, y], [x + w / 4, y + h * 0.7], [x - w / 4, y + h * 0.7]], 5);
  const lashes = [-0.3, -0.1, 0.1, 0.3].map((f, i) => inkLine([[x + w * f, y - h * 0.62], [x + w * f * 1.3, y - h * 0.95]], p, { seed: seed + 5 + i, w: 3 })).join('');
  return `<path d="${toPath(wobble(lid, seed + 1, 0.8))}" fill="${p.paper}" stroke="${p.ink}" stroke-width="6"/>`
    + `<path d="${toPath(ellipse(x - 4, y + 2, h * 0.5, h * 0.5, 28))}" fill="${p.ink}"/>`
    + `<path d="${toPath(ellipse(x - 4, y + 2, 2.5, h * 0.36, 12))}" fill="${p.paper}"/>` + lashes;
}
