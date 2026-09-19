// Props and set dressing for scenes, in the same hand as the cat: paper fill
// with a wobbling ink outline, so they read against his black fur. Dark props
// in front of him get a paper halo. The cosmic and Bloodborne pieces (moons,
// eyes in the dark, tentacles, the hunter's tricorn, the saw cleaver, lamps,
// the void) carry the lore: an old god who likes you, from somewhere else.

import { curve, ellipse, outline, rng, stroke, toPath, wobble, type Pt } from './ink.ts';
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

// A cardboard box, open, for him to sit in or burst out of.
export function cardboardBox(x: number, y: number, w: number, h: number, p: Palette, seed = 130): string {
  const front = outline([[x, y], [x + w, y], [x + w - 4, y + h], [x + 4, y + h]], 2);
  const flapL = outline([[x, y], [x - 26, y - 22], [x - 16, y - 28], [x + 10, y - 6]], 2);
  const flapR = outline([[x + w, y], [x + w + 26, y - 22], [x + w + 16, y - 28], [x + w - 10, y - 6]], 2);
  return drawn(flapL, p, { seed: seed + 1 }) + drawn(flapR, p, { seed: seed + 2 }) + drawn(front, p, { seed })
    + inkLine([[x + w * 0.3, y + h * 0.4], [x + w * 0.7, y + h * 0.4]], p, { seed: seed + 3, w: 3 });
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

// A hanging lamp, like the ones he lights between dreams.
export function lamp(x: number, y: number, p: Palette, seed = 160): string {
  const glass = outline([[x - 14, y - 12], [x + 14, y - 12], [x + 18, y + 16], [x - 18, y + 16]], 3);
  return inkLine([[x, y - 60], [x, y - 12]], p, { seed, w: 3 }) + drawn(glass, p, { seed: seed + 1 })
    + `<path d="${toPath(wobble(outline([[x, y - 6], [x + 5, y + 4], [x, y + 11], [x - 5, y + 4]]), seed + 2, 0.3))}" fill="${p.ink}"/>`
    + inkLine([[x - 20, y - 14], [x + 20, y - 14]], p, { seed: seed + 3, w: 5 });
}

// A moon disc: 'paleblood' is dithered pale, 'blood' dark with a rim.
export function moon(x: number, y: number, r: number, p: Palette, kind: 'paleblood' | 'blood', seed = 170): string {
  return `<path d="${toPath(wobble(ellipse(x, y, r, r, 64), seed, 1))}" fill="url(#${kind === 'blood' ? 'd75' : 'd25'})" stroke="${p.ink}" stroke-width="5"/>`;
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

// Crooked gravestones along the bottom, for the dream between hunts.
export function graves(p: Palette, seed = 230): string {
  const r = rng(seed);
  return [40, 110, 300, 362].map((x, i) => {
    const h = 44 + r() * 30;
    const w = 26 + r() * 10;
    const lean = (r() - 0.5) * 12;
    const stone = outline([[x - w / 2, 400], [x - w / 2 + lean, 400 - h], [x + lean, 400 - h - 14], [x + w / 2 + lean, 400 - h], [x + w / 2, 400]], 3);
    // Dark stones against the lighter sky, a pale cross cut into each.
    return drawn(stone, p, { seed: seed + i, w: 5 }, p.ink)
      + `<path d="${toPath(wobble(stroke(curve([[x + lean * 0.5, 400 - h + 2], [x + lean * 0.5, 400 - h + 24]]), () => 3.5), seed + 20 + i, 0.2))}" fill="${p.paper}"/>`
      + `<path d="${toPath(wobble(stroke(curve([[x + lean * 0.5 - 7, 400 - h + 9], [x + lean * 0.5 + 7, 400 - h + 9]]), () => 3.5), seed + 30 + i, 0.2))}" fill="${p.paper}"/>`;
  }).join('');
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

// A book held up to read, seen from its cover, a moon sigil on the front.
export function heldBook(x: number, y: number, p: Palette, seed = 250): string {
  const cover = outline([[x - 38, y - 56], [x + 38, y - 60], [x + 40, y + 2], [x - 36, y + 4]], 2);
  return drawn(cover, p, { seed, w: 6 }) + inkLine([[x - 30, y - 56], [x - 29, y + 2]], p, { seed: seed + 1, w: 4 })
    + `<path d="${toPath(wobble(ellipse(x + 4, y - 28, 12, 12, 24), seed + 2, 0.4))}" fill="${p.ink}"/>`
    + `<path d="${toPath(ellipse(x + 9, y - 31, 10, 10, 24))}" fill="${p.paper}"/>`;
}
