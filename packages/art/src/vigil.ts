// The Vigil's scenes: him sitting still, eyes lowered, the tail round his
// feet. Four places to sit in (on the floor; in the breathing rings; on a
// temple ledge under the moon; under the two eyes in the sky), the plain sit
// the device draws its breath rings round, and the sit kept.
import { pose } from './body.ts';
import { EXPRESSIONS } from './expressions.ts';
import { marks } from './marks.ts';
import { outline, rng, shape, stroke, toPath, wobble } from './ink.ts';
import { DITHER, moon } from './props.ts';
import { DEVICE_PALETTE as P, SIZE } from './rig.ts';

const svg = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}">${DITHER(P)}<rect width="${SIZE}" height="${SIZE}" fill="#fff"/>${body}</svg>`;
// Moves the sitting cat so his feet land on (x, y) at scale k.
const at = (art: string, x: number, y: number, k: number) =>
  `<g transform="translate(${(x - 200 * k).toFixed(1)} ${(y - 392 * k).toFixed(1)}) scale(${k})">${art}</g>`;
const still = (face = EXPRESSIONS.serene) => pose('still', face, P);
// A paper edge round him, for a dark or busy ground.
const lifted = (art: string) => `<g filter="url(#halo)">${art}</g>`;
const floor = (y: number) => shape(wobble(stroke([[-4, y], [404, y]], () => 5), 261, 0.6), P.ink);

// The night: black, and stars scattered one by one (a tiled pattern shows
// its seams on the glass).
function night(h: number, seed: number, count = 70): string {
  const r = rng(seed);
  return `<rect width="400" height="${h}" fill="${P.ink}"/>` + Array.from({ length: count }, () => {
    const big = r() < 0.1;
    return `<rect x="${Math.floor(r() * 200) * 2}" y="${Math.floor(r() * h / 2) * 2}" width="${big ? 4 : 2}" height="${big ? 4 : 2}" fill="${P.paper}"/>`;
  }).join('');
}

// Two dotted rings round him: the breath, held still.
const rings = () => [[176, 5, '2 8'], [146, 8, '2 6']]
  .map(([r, w, dash]) => `<circle cx="200" cy="262" r="${r}" fill="none" stroke="${P.ink}" stroke-width="${w}" stroke-dasharray="${dash}"/>`).join('');

// The temple: a column at the right edge, a stone ledge running out from it
// with a step below, and moonlit ground falling away on the left. He sits
// near the ledge's lip, small against the night.
function temple(): string {
  const r = rng(91);
  // The ground far below, lit in streaks.
  const ground = `<rect x="0" y="318" width="400" height="82" fill="url(#d25)"/>`
    + Array.from({ length: 16 }, (_, i) => {
      const y = 326 + i * 5 + r() * 3, x = r() * 120, w = 60 + r() * 140;
      return `<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="${w.toFixed(0)}" height="2" fill="${P.paper}"/>`;
    }).join('');
  // Stone is cut, not drawn: straight edges, ink rims, no wobble.
  const slab = (pts: number[][], fill: string) =>
    `<path d="M${pts.map((q) => q.join(' ')).join(' L')} Z" fill="${fill}" stroke="${P.ink}" stroke-width="5" stroke-linejoin="miter"/>`;
  // The ledge: its top lit by the moon, its face in shadow, a step under it.
  const top = slab([[96, 300], [404, 294], [404, 310], [90, 318]], P.paper);
  const face = slab([[90, 318], [404, 310], [404, 340], [90, 348]], 'url(#d50)');
  const step = slab([[140, 348], [404, 340], [404, 404], [140, 404]], 'url(#d75)');
  // The column: a fluted shaft lit on its left, a capital out of sight above,
  // a square base standing on the ledge.
  const shaft = slab([[330, -8], [404, -8], [404, 262], [330, 262]], P.paper)
    + `<rect x="376" y="-8" width="28" height="270" fill="url(#d50)"/>`
    + [346, 360, 374, 388].map((x) => `<rect x="${x}" y="-8" width="3" height="268" fill="${P.ink}"/>`).join('');
  const base = slab([[318, 262], [404, 262], [404, 296], [318, 298]], P.paper) + slab([[312, 280], [404, 280], [404, 296], [312, 298]], 'url(#d25)');
  return ground + step + face + top + shaft + base;
}

// An eye hung in the sky: a lit almond, a grey iris, a black pupil, looking
// down at him.
const skyEye = (x: number, y: number, s: number) =>
  `<path d="${toPath(wobble(outline([[x - 46 * s, y], [x, y - 22 * s], [x + 46 * s, y], [x, y + 20 * s]], 6), x, 0.8))}" fill="${P.paper}"/>`
  + `<circle cx="${x + 3}" cy="${y + 3}" r="${13 * s}" fill="url(#d50)"/><circle cx="${x + 3}" cy="${y + 4}" r="${6 * s}" fill="${P.ink}"/>`;

export type VigilScene = { id: string; moment: 'vigil' | 'vigil-breath' | 'vigil-kept'; frames: string[] };

export function vigilScenes(): VigilScene[] {
  return [
    // While sitting: one of these, picked when the sit begins.
    { id: 'vigil-still', moment: 'vigil', frames: [svg(at(still(), 200, 384, 1) + floor(390))] },
    { id: 'vigil-rings', moment: 'vigil', frames: [svg(rings() + at(still(), 200, 384, 1) + floor(390))] },
    { id: 'vigil-ledge', moment: 'vigil', frames: [svg(night(318, 9) + moon(78, 78, 30, P, 'paleblood', 176) + temple() + lifted(at(still(), 214, 306, 0.56)))] },
    { id: 'vigil-eyes', moment: 'vigil', frames: [svg(night(320, 13) + skyEye(116, 110, 1) + skyEye(290, 124, 1)
      + `<rect y="320" width="400" height="80" fill="url(#d25)"/>` + lifted(at(still(), 200, 336, 0.5)))] },
    // The breathing practices: the device draws the rings round him, so he
    // sits alone and a little smaller.
    { id: 'vigil-breath', moment: 'vigil-breath', frames: [svg(at(still(), 200, 360, 0.8))] },
    // Kept: the same stillness, with a little light round him.
    { id: 'vigil-kept', moment: 'vigil-kept', frames: [svg(at(pose('still', { ...EXPRESSIONS.serene, marks: ['sparkles'] }, P), 200, 384, 1) + floor(390))] },
  ];
}

