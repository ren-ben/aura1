// The Ye skin's stages: a backdrop for every era's scenes (inspiration/kanye),
// in the same hand as the cat. scenes.ts puts him on them; each says where
// his feet go.

import { curve, ellipse, outline, rng, shape, stroke, toPath, wobble, type Pt } from './ink.ts';
import type { Palette } from './face.ts';
import { ink, lettering, line, paper, poly } from './ye.ts';

// A straight-edged shape with a hand tremor: edges split and jittered, corners kept.
function rough(pts: Pt[], seed: number, amp = 1.4): string {
  const r = rng(seed);
  const out: Pt[] = [];
  pts.forEach((a, i) => {
    const b = pts[(i + 1) % pts.length]!;
    const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 12));
    for (let k = 0; k < steps; ++k) {
      const j = k ? amp : amp * 0.3;
      out.push([a[0] + ((b[0] - a[0]) * k) / steps + (r() - 0.5) * j, a[1] + ((b[1] - a[1]) * k) / steps + (r() - 0.5) * j]);
    }
  });
  return poly(out);
}
export const NIGHT = `<rect width="400" height="400" fill="url(#d75)"/>`;

// Yeezus: the white sun and the carved mountain. His feet at (200, 266).
export function peak(p: Palette): string {
  const r = rng(3002);
  return `<path d="${toPath(wobble(ellipse(200, 176, 170, 146, 80), 3000, 1))}" fill="${p.paper}"/>`
    + `<path d="${rough([[200, 262], [398, 402], [2, 402]], 3001, 2)}" fill="${p.ink}"/>`
    + Array.from({ length: 14 }, (_, i) => {
      const x = 20 + i * 27 + r() * 8;
      const t = 0.25 + r() * 0.35;
      return line([[200 + (x - 200) * t, 262 + 140 * t], [x, 402]], 2.5, 3003 + i, p.paper);
    }).join('');
}

// Saint Pablo: the stage hung by cables under a truss of lamps, light falling
// on it. His feet on the deck at (200, 262); the crowd goes in front of him.
export function floatingStage(p: Palette): string {
  return `<path d="M 72 70 L 328 70 L 352 258 L 48 258 Z" fill="url(#d25)"/>`
    + `<path d="${rough([[60, 22], [340, 22], [340, 38], [60, 38]], 3100, 1)}" fill="${p.ink}"/>`
    + Array.from({ length: 13 }, (_, i) => `<rect x="${70 + i * 21}" y="38" width="5" height="${34 + (i % 3) * 14}" fill="${p.ink}"/>`).join('')
    + line([[80, 38], [56, 262]], 3, 3110, p.ink) + line([[320, 38], [344, 262]], 3, 3111, p.ink)
    + `<path d="${rough([[40, 262], [360, 262], [346, 290], [54, 290]], 3120, 1)}" fill="${p.ink}"/>`
    + Array.from({ length: 9 }, (_, i) => line([[66 + i * 34, 288], [82 + i * 34, 264]], 2.5, 3121 + i, p.paper)).join('');
}
export function crowd(p: Palette): string {
  const r = rng(3140);
  return Array.from({ length: 24 }, (_, i) => {
    const x = i * 17.5 + r() * 8;
    const y = 358 + r() * 14;
    const arm = r() < 0.45 ? line([[x + 4, y], [x + 8 + r() * 6, y - 30 - r() * 12]], 5, 3160 + i, p.ink) : '';
    const phone = r() < 0.25 ? `<rect x="${x - 3}" y="${y - 30}" width="6" height="8" fill="${p.ink}" stroke="${p.paper}" stroke-width="2"/>` : '';
    return ink(ellipse(x, y, 10, 12, 16), 3180 + i, p) + arm + phone;
  }).join('') + `<rect x="0" y="368" width="400" height="34" fill="${p.ink}"/>`;
}

// Jesus Is King: the small white chapel alone in the dark woods, weathered and
// leaning, its cross glowing. He sits in the lit doorway, feet at (200, 380);
// the grain goes over everything.
export function chapel(p: Palette): string {
  const trees = [[20, 250, 70, 200], [380, 240, 80, 210], [70, 150, 60, 120], [340, 120, 70, 110]].map(([x, y, rx, ry], i) =>
    `<path d="${toPath(wobble(ellipse(x!, y!, rx!, ry!, 30), 3200 + i, 14))}" fill="${p.ink}"/>`).join('');
  const glow = (rx: number, ry: number, d: string) =>
    `<path d="${toPath(ellipse(200, 92, rx, ry, 30))}" fill="${p.paper}"/><path d="${toPath(ellipse(200, 92, rx, ry, 30))}" fill="url(#${d})"/>`;
  const cross = `<g transform="rotate(-3 200 130)"><path d="${rough([[195, 50], [205, 50], [205, 74], [226, 74], [226, 84], [205, 84], [205, 138], [195, 138], [195, 84], [174, 84], [174, 74], [195, 74]], 3210, 1)}" fill="${p.paper}" stroke="${p.ink}" stroke-width="3"/></g>`;
  const house = `<path d="${rough([[118, 382], [116, 214], [200, 142], [286, 212], [288, 382]], 3220, 2)}" fill="${p.paper}" stroke="${p.ink}" stroke-width="5" stroke-linejoin="round"/>`
    + line([[150, 206], [200, 166], [252, 204]], 3, 3221, p.ink)
    + `<path d="${rough([[96, 228], [304, 222], [300, 250], [100, 256]], 3222, 2)}" fill="${p.ink}"/>`
    + line([[114, 256], [116, 382]], 5, 3223, p.ink) + line([[286, 250], [284, 382]], 5, 3224, p.ink)
    + `<path d="${rough([[146, 380], [148, 270], [252, 266], [254, 380]], 3225, 1.5)}" fill="${p.paper}" stroke="${p.ink}" stroke-width="5"/>`
    + `<path d="${rough([[262, 280], [276, 280], [276, 330], [262, 330]], 3226, 1)}" fill="${p.ink}"/>`;
  const steps = [382, 392].map((y, i) => `<path d="${rough([[138 - i * 12, y], [262 + i * 12, y], [262 + i * 12, y + 10], [138 - i * 12, y + 10]], 3230 + i, 1.2)}" fill="${p.paper}" stroke="${p.ink}" stroke-width="3"/>`).join('');
  return trees + glow(50, 54, 'd50') + glow(32, 36, 'd25') + cross + `<g transform="rotate(-1.5 200 382)">${house}</g>` + steps;
}
export function grain(p: Palette, n = 70, seed = 3240): string {
  const r = rng(seed);
  return Array.from({ length: n }, () => `<rect x="${(r() * 400).toFixed(0)}" y="${(r() * 400).toFixed(0)}" width="${r() < 0.2 ? 4 : 2}" height="2" fill="${p.paper}"/>`).join('');
}

// Kids See Ghosts: the cover's painting. Two pines lean in round Fuji; the
// grinning ghost crosses between them with him riding it, feet at (206, 258).
export function ghostRide(p: Palette): string {
  const fuji = `<path d="M 60 300 L 164 150 Q 200 128 236 150 L 340 300" fill="none" stroke="${p.ink}" stroke-width="5" stroke-linejoin="round"/>`
    + `<path d="M 164 150 Q 200 128 236 150 L 226 168 L 212 158 L 200 172 L 188 158 L 174 170 Z" fill="url(#d50)"/>`;
  const trunk = (pts: Pt[], s: number) => shape(wobble(stroke(curve(pts), (t) => 16 - 10 * t), s, 1.2), p.ink);
  const needles = (x: number, y: number, s: number) => Array.from({ length: 9 }, (_, i) => {
    const a = Math.PI + (i / 8) * Math.PI;
    return line([[x, y], [x + Math.cos(a) * 20, y + Math.sin(a) * 12]], 2.5, s + i, p.ink);
  }).join('');
  const pines = trunk([[30, 402], [44, 300], [30, 200], [60, 110], [110, 40]], 3300) + trunk([[400, 360], [356, 290], [370, 200], [340, 120], [300, 60]], 3301)
    + [[52, 250], [36, 196], [70, 110], [104, 50], [140, 40], [366, 250], [362, 190], [344, 118], [306, 66], [270, 60]].map(([x, y], i) => needles(x!, y!, 3310 + i * 10)).join('');
  const body = outline([[92, 360], [96, 300], [128, 262], [190, 250], [250, 256], [300, 262], [340, 244], [376, 256], [350, 280], [330, 300], [320, 346], [290, 372], [200, 380], [120, 376]], 4);
  const face = [[160, 304], [248, 304]].map(([x, y], i) => ink(ellipse(x!, y!, 18, 18, 24), 3400 + i, p, 0.5) + paper(ellipse(x!, y!, 10, 10, 16), 3402 + i, p, 0.3) + ink(ellipse(x!, y!, 4, 4, 10), 3404 + i, p, 0.1)).join('')
    + `<path d="M 138 334 L 270 334 L 262 362 L 146 362 Z" fill="${p.ink}"/>`
    + `<path d="M 144 336 L 156 352 L 168 336 L 180 354 L 192 336 L 204 354 L 216 336 L 228 354 L 240 336 L 252 352 L 264 336" fill="none" stroke="${p.paper}" stroke-width="4"/>`;
  return fuji + pines + `<path d="${toPath(wobble(body, 3410, 1.5))}" fill="${p.paper}" stroke="${p.ink}" stroke-width="6"/>` + face;
}

// ye: the Tetons at dusk over the sage flats, the line written level on the
// solid rock below the snow. He sits out in the field, feet near (300, 372).
export function tetons(p: Palette): string {
  const clouds = [[40, 30, 140], [180, 46, 200], [90, 70, 120], [260, 18, 130]].map(([x, y, w], i) =>
    `<path d="${toPath(wobble(ellipse(x! + w! / 2, y!, w! / 2, 7, 24), 3900 + i, 3))}" fill="url(#d25)"/>`).join('');
  const ridge: Pt[] = [[0, 150], [30, 124], [52, 104], [70, 118], [96, 96], [118, 84], [140, 102], [160, 96], [180, 76], [196, 60], [214, 74],
    [232, 68], [250, 86], [268, 78], [290, 94], [314, 84], [340, 104], [370, 110], [400, 126], [400, 292], [0, 292]];
  const r = rng(3920);
  // Snow only high up, in the gullies under each peak, clear of the words.
  const snow = ridge.slice(1, 18).map(([x, y], i) => {
    const len = 16 + r() * 22;
    const lean = (r() - 0.5) * 14;
    return `<path d="${rough([[x - 6, y + 3], [x + 6, y + 3], [x + lean + 2, y + len], [x + lean - 3, y + len * 0.8]], 3921 + i, 1.2)}" fill="${p.paper}"/>`;
  }).join('');
  const words = ['I hate being', 'Bi-Polar', 'its awesome'].map((t, i) => lettering(t, 200, 206 + i * 26, 24, 'IMFellEnglish.ttf', p.paper)).join('');
  const field = `<rect x="0" y="292" width="400" height="110" fill="url(#d50)"/>` + line([[0, 292], [400, 294]], 4, 3940, p.ink);
  const sage = Array.from({ length: 20 }, (_, i) => {
    const [x, y] = [r() * 400, 304 + r() * 96];
    return `<path d="${toPath(wobble(ellipse(x, y, 10 + r() * 8, 5 + r() * 3, 14), 3950 + i, 2))}" fill="${p.ink}"/>`;
  }).join('');
  return clouds + `<path d="${rough(ridge, 3910, 2.5)}" fill="${p.ink}"/>` + snow + words + field + sage;
}

// A ballerina on pointe in arabesque, ink, her toe at (x, y), facing `dir`.
function ballerina(x: number, y: number, k: number, dir: number, s: number, p: Palette): string {
  const T = (pts: Pt[]) => pts.map(([a, b]) => [x + a * k * dir, y + b * k] as Pt);
  const limb = (pts: Pt[], w0: number, w1: number, n: number) => shape(wobble(stroke(curve(T(pts)), (t) => (w0 + (w1 - w0) * t) * k), s + n, 0.3), p.ink);
  const tutu = T([[-36, -64], [-20, -71], [0, -73], [20, -71], [36, -64], [24, -57], [10, -60], [-6, -56], [-22, -60]]);
  return limb([[0, -64], [1, -30], [0, 0]], 7, 3, 1) + limb([[-4, -66], [-30, -72], [-58, -82]], 7, 3, 2)
    + limb([[0, -66], [2, -84], [6, -104]], 10, 7, 3) + limb([[5, -100], [24, -116], [36, -136]], 3.5, 2.5, 4) + limb([[3, -100], [-18, -106], [-38, -98]], 3.5, 2.5, 5)
    + `<path d="${toPath(wobble(tutu, s + 6, 0.8))}" fill="${p.ink}"/>` + ink(T(ellipse(8, -114, 7, 8, 16)), s + 7, p, 0.3) + ink(T(ellipse(4, -122, 4, 4, 10)), s + 8, p, 0.2);
}
// The grand piano side on, lid up on its stick, keys to the left.
function piano(p: Palette): string {
  const body: Pt[] = [[56, 330], [56, 292], [72, 284], [230, 284], [262, 278], [292, 284], [300, 298], [292, 314], [260, 318], [232, 330]];
  const legs = [[68, 330], [150, 330], [272, 318]].map(([x, y], i) => line([[x!, y! - 12], [x! - 1, y! + 24]], 8 - i, 4013 + i, p.ink)).join('')
    + line([[150, 352], [150, 336]], 3, 4016, p.ink) + `<rect x="140" y="350" width="20" height="4" fill="${p.ink}"/>`;
  const lid = `<path d="${rough([[72, 284], [262, 278], [206, 178]], 4011, 1.2)}" fill="${p.ink}" stroke="${p.paper}" stroke-width="3" stroke-linejoin="round"/>`
    + line([[196, 282], [214, 198]], 3, 4012, p.paper);
  const keys = `<rect x="56" y="292" width="92" height="12" fill="${p.paper}" stroke="${p.ink}" stroke-width="2.5"/>`
    + Array.from({ length: 11 }, (_, i) => `<rect x="${61 + i * 8}" y="292" width="4" height="7" fill="${p.ink}"/>`).join('');
  return legs + `<path d="${rough(body, 4010, 1.2)}" fill="${p.ink}"/>` + line([[80, 316], [180, 318], [236, 312]], 2.5, 4017, p.paper) + lid + keys
    + `<rect x="138" y="270" width="36" height="14" fill="${p.ink}" stroke="${p.paper}" stroke-width="2"/>`;
}
// MBDTF / Runaway: a pale hall under a chandelier, the grand piano on a
// gloss floor that mirrors it, a ballerina turning behind. He stands past its
// tail, glass up, feet at (306, RUNAWAY_FLOOR).
export const RUNAWAY_FLOOR = 362;
// A chandelier on its chain: a ring of candle arms, crystal drops under it.
function chandelier(x: number, y: number, p: Palette): string {
  const arms = [-36, -18, 0, 18, 36].map((d, i) => line([[x, y + 8], [x + d * 0.6, y + 16], [x + d, y + 6]], 3, 4080 + i, p.ink)
    + `<rect x="${x + d - 2.5}" y="${y - 8}" width="5" height="12" fill="${p.ink}"/>` + ink(ellipse(x + d, y - 13, 2.5, 4, 8), 4086 + i, p, 0)).join('');
  const drops = [-24, -8, 8, 24].map((d, i) => line([[x + d, y + 18], [x + d, y + 30]], 2, 4092 + i, p.ink) + ink(ellipse(x + d, y + 33, 3, 4.5, 10), 4096 + i, p, 0)).join('');
  return line([[x, 0], [x, y]], 3, 4079, p.ink) + `<path d="${toPath(ellipse(x, y + 8, 40, 7, 30))}" fill="none" stroke="${p.ink}" stroke-width="4"/>` + arms + drops;
}
export function runawayHall(p: Palette): string {
  const f = RUNAWAY_FLOOR;
  // The piano a little smaller than drawn, its keys to the left.
  const placed = (q: Palette) => `<g transform="translate(34 ${f - 354 * 0.82}) scale(0.82)">${piano(q)}</g>`;
  const pillar = `<rect x="12" y="0" width="24" height="${f}" fill="url(#d25)"/>` + line([[12, 0], [12, f]], 2.5, 4030, p.ink) + line([[36, 0], [36, f]], 2.5, 4032, p.ink);
  const floor = `<rect x="0" y="${f}" width="400" height="${400 - f}" fill="${p.paper}"/><rect x="0" y="${f}" width="400" height="${400 - f}" fill="url(#d25)"/>`;
  const mirrored = `<clipPath id="runawayfloor"><rect x="0" y="${f}" width="400" height="${400 - f}"/></clipPath>`
    + `<g clip-path="url(#runawayfloor)"><g transform="translate(0 ${2 * f}) scale(1 -1)">${placed({ ...p, ink: 'url(#d50)' })}</g></g>`;
  return pillar + chandelier(200, 58, p) + ballerina(92, 262, 0.9, 1, 4040, p)
    + floor + mirrored + line([[0, f], [400, f]], 3, 4020, p.ink) + placed(p);
}
// A champagne flute held up at (x, y), bubbles rising.
export const flute = (x: number, y: number, p: Palette) =>
  `<path d="${poly([[x - 7, y - 28], [x + 7, y - 28], [x + 4, y - 6], [x - 4, y - 6]])}" fill="${p.paper}" stroke="${p.ink}" stroke-width="3"/>`
  + line([[x, y - 6], [x, y + 8]], 3, 4070, p.ink) + line([[x - 7, y + 8], [x + 7, y + 8]], 3, 4071, p.ink)
  + [[x - 12, y - 38], [x + 3, y - 44], [x + 14, y - 36]].map(([a, b], i) => ink(ellipse(a!, b!, 2.5, 2.5, 8), 4072 + i, p, 0)).join('');

// MBDTF / Power: a frieze, columns either side, the sword hung over him.
// His feet at (200, 380).
export function frieze(p: Palette): string {
  const column = (x: number, s: number) => `<path d="${rough([[x - 26, 360], [x - 22, 80], [x + 22, 80], [x + 26, 360]], s, 1)}" fill="${p.paper}" stroke="${p.ink}" stroke-width="5"/>`
    + [-12, 0, 12].map((d, i) => line([[x + d, 90], [x + d * 1.1, 350]], 2.5, s + 1 + i, p.ink)).join('')
    + `<path d="${rough([[x - 36, 80], [x + 36, 80], [x + 30, 64], [x - 30, 64]], s + 5, 1)}" fill="${p.ink}"/>`
    + `<path d="${rough([[x - 36, 360], [x + 36, 360], [x + 36, 374], [x - 36, 374]], s + 6, 1)}" fill="${p.ink}"/>`;
  const sword = `<path d="${rough([[195, 20], [205, 20], [205, 30], [220, 30], [220, 38], [205, 38], [204, 120], [200, 132], [196, 120], [195, 38], [180, 38], [180, 30], [195, 30]], 4100, 0.8)}" fill="${p.ink}" stroke="${p.paper}" stroke-width="3"/>`
    + line([[200, 0], [200, 20]], 2, 4101, p.ink);
  return column(52, 4110) + column(348, 4120) + `<rect x="0" y="374" width="400" height="30" fill="url(#d50)"/>` + line([[0, 374], [400, 374]], 4, 4102, p.ink) + sword;
}

// Bully: the curve of the world and a beam of light down on it. Feet at (200, 304).
export function world(p: Palette): string {
  const r = rng(3600);
  return `<path d="M 60 0 L 180 0 L 400 300 L 400 400 Z" fill="url(#d25)"/>`
    + `<path d="${toPath(ellipse(200, 700, 420, 400, 120))}" fill="${p.paper}" stroke="${p.ink}" stroke-width="6"/>`
    + Array.from({ length: 5 }, (_, i) => `<path d="${toPath(wobble(ellipse(40 + i * 80 + r() * 20, 350 + r() * 30, 34 + r() * 20, 14 + r() * 8, 20), 3601 + i, 5))}" fill="url(#d50)"/>`).join('');
}

// 808s & Heartbreak: the heart balloon gone flat on the floor, its string
// running up to his paws (him holding, feet at (220, 392)).
export const flatHeart = (p: Palette) =>
  line([[0, 392], [400, 392]], 5, 3501, p.ink) + line([[196, 330], [150, 350], [120, 374], [92, 378]], 3, 3500, p.ink)
  + `<g transform="translate(80 370) rotate(14) scale(1.6)"><path d="M 0 10 C -22 -2 -24 -18 -8 -16 C -3 -16 0 -11 0 -8 C 0 -11 3 -16 8 -16 C 24 -18 22 -2 0 10 Z" fill="${p.paper}" stroke="${p.ink}" stroke-width="4"/></g>`;

// Graduation: caps thrown in the air.
export const caps = (p: Palette) => [[56, 60, -20], [344, 50, 25], [352, 200, -10], [48, 210, 15]].map(([x, y, a], i) =>
  `<g transform="rotate(${a} ${x} ${y})"><path d="${poly([[x! - 30, y!], [x!, y! - 12], [x! + 30, y!], [x!, y! + 12]])}" fill="${p.paper}" stroke="${p.ink}" stroke-width="5"/>${line([[x!, y!], [x! + 22, y! + 18]], 3, 3800 + i, p.ink)}</g>`).join('');

// Late Registration: a stack of library books, bottom at y.
export const bookStack = (x: number, y: number, p: Palette) => [0, 1, 2, 3, 4].map((i) =>
  `<rect x="${x + (i % 2) * 6}" y="${y - 18 - i * 22}" width="${90 - i * 6}" height="18" fill="${i % 2 ? p.ink : p.paper}" stroke="${p.ink}" stroke-width="4"/>`).join('');

// Donda: the white stadium floor, the empty stands dim behind.
export function stadium(p: Palette): string {
  return `<rect x="0" y="0" width="400" height="200" fill="url(#d50)"/>`
    + [60, 100, 140, 180].map((y, i) => line([[0, y], [400, y + 4]], 3, 3700 + i, p.ink)).join('')
    + Array.from({ length: 9 }, (_, i) => line([[i * 50, 40], [i * 50 - 20, 200]], 3, 3710 + i, p.paper)).join('')
    + line([[0, 200], [400, 200]], 5, 3720, p.ink);
}
