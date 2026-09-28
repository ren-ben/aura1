// The Ye skin: every era of Kanye as something Kael'thos wears
// (inspiration/kanye). The rig draws his head as usual and asks here for a
// costume's pieces: what covers or joins the head (yeHead), what hangs on a
// bust's chest (yeChest) and what goes over a full body square to us
// (yeBody). Each scene picks the costume of its own era; see CHARACTER.md.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import opentype from 'opentype.js';
import { curve, ellipse, outline, rng, shape, stroke, superellipse, toPath, wobble, type Pt } from './ink.ts';
import type { Palette } from './face.ts';

// bear: the Dropout Bear's head and a graduation cap (Dropout, Late
// Registration, Graduation). mask: the jewelled Margiela mask and a rope chain
// (Yeezus, Bully). balaclava: the black mask, a spiked jacket, DONDA on the
// vest, boots (Donda). suit: blazer, striped tie, a heart pin, white sneakers
// (Late Registration, 808s). shades: shutter shades and a chain (Graduation,
// Glow in the Dark). horus: the Horus chain from Power (MBDTF). bare: nothing
// (Saint Pablo, ye, Kids See Ghosts, Jesus Is King).
export const COSTUMES = ['bear', 'mask', 'balaclava', 'suit', 'shades', 'horus', 'bare'] as const;
export type Costume = (typeof COSTUMES)[number];

export const ink = (pts: Pt[], s: number, p: Palette, amp = 1) => shape(wobble(pts, s, amp), p.ink);
export const paper = (pts: Pt[], s: number, p: Palette, amp = 1) => shape(wobble(pts, s, amp), p.paper);
export const line = (pts: Pt[], w: number, s: number, fill: string) => shape(wobble(stroke(curve(pts), () => w), s, 0.4), fill);
export const poly = (pts: Pt[]) => `M ${pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L ')} Z`;

// Text set as ink outlines, so it reads the same on the glass and in a
// browser that lacks the font.
const fonts = new Map<string, opentype.Font>();
export function lettering(text: string, x: number, y: number, px: number, file: string, fill: string): string {
  if (!fonts.has(file)) {
    const buf = readFileSync(resolve(import.meta.dirname, '../fonts', file));
    fonts.set(file, opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)));
  }
  const font = fonts.get(file)!;
  const w = font.getAdvanceWidth(text, px);
  return `<path d="${font.getPath(text, x - w / 2, y, px).toPathData(1)}" fill="${fill}"/>`;
}

// ---- Heads -------------------------------------------------------------------

// The head's pieces as the rig drew them, for a costume to keep or replace.
export type HeadParts = {
  whiskers: string[]; ears: string[]; head: string; openings: string[];
  eyes: string[]; nose: string; features: string[];
  silhouette: Pt[][]; // head and ears as shapes, for a costume that covers them
};

// The graduation cap: a flat board seen from the front, a tassel off one corner.
function mortarboard(p: Palette, s: number): string[] {
  const board: Pt[] = [[98, 96], [204, 60], [304, 92], [196, 126]];
  const cap = outline([[146, 100], [148, 138], [200, 150], [252, 136], [254, 98]], 3);
  return [
    ink(cap, s, p, 0.8),
    `<path d="${poly(board)}" fill="${p.paper}" stroke="${p.ink}" stroke-width="7" stroke-linejoin="miter"/>`,
    paper(ellipse(202, 92, 6, 4, 12), s + 5, p, 0.2),
    line([[202, 90], [262, 100], [296, 96], [304, 140]], 5, s + 3, p.ink),
    ink(ellipse(304, 150, 8, 14, 16), s + 4, p, 0.4),
  ];
}

// The mask's tiles, a bowed grid of paper squares; pitch grows when he is
// drawn small so the device still shows them.
function tiles(pitch: number, p: Palette): string {
  const out: string[] = [];
  const t = pitch * 0.72;
  for (let y = 16; y < 330; y += pitch) {
    const off = Math.round((y - 16) / pitch) % 2 ? pitch / 2 : 0;
    for (let x = 58 + off; x < 350; x += pitch) {
      const bow = ((x - 200) / 110) ** 2 * 10;
      out.push(`<rect x="${(x - t / 2).toFixed(1)}" y="${(y - t / 2 + bow).toFixed(1)}" width="${t.toFixed(1)}" height="${t.toFixed(1)}" fill="${p.paper}"/>`);
    }
  }
  return out.join('');
}

let clipIds = 0;
// The head's parts in the costume, in drawing order.
export function yeHead(c: Costume, h: HeadParts, p: Palette, pitch = 12): string[] {
  const usual = [...h.whiskers, ...h.ears, h.head, ...h.openings, ...h.eyes, h.nose, ...h.features];
  switch (c) {
    case 'bear': {
      // The mascot head over his, ears and all: round ears, a paper muzzle,
      // his own eyes looking out.
      const skull = superellipse(200, 214, 118, { b: 102, n: 2.1 }, { b: 84, n: 2.0 });
      const ear = (x: number, y: number, s: number) => [ink(ellipse(x, y, 38, 36, 36), s, p), paper(ellipse(x, y + 2, 20, 18, 28), s + 1, p, 0.6)];
      return [...h.whiskers, ...ear(108, 126, 81), ...ear(292, 122, 83), ink(skull, 85, p, 1.6), ...h.eyes,
        paper(ellipse(200, 270, 52, 30, 40), 91, p), ink(ellipse(200, 258, 13, 9, 20), 92, p, 0.4), ...h.features, ...mortarboard(p, 95)];
    }
    case 'mask': {
      // Head and ears crusted in tiles, his eyes through two holes.
      const id = `yemask${clipIds++}`;
      const sil = h.silhouette.map((pts) => toPath(pts)).join(' ');
      return [...h.whiskers, `<clipPath id="${id}"><path d="${sil}"/></clipPath><path d="${sil}" fill="${p.ink}"/><g clip-path="url(#${id})">${tiles(pitch, p)}</g>`,
        ...[[154, 208], [246, 208]].map(([x, y], i) => ink(ellipse(x!, y!, 32, 39, 40), 140 + i, p)), ...h.eyes, ...h.features];
    }
    case 'balaclava': {
      // Black knit over his head: his ears two soft points in it, no openings.
      const bump = (x: number, s: number) => {
        const d = x < 200 ? 1 : -1;
        return ink(outline([[x - 40 * d, 150], [x - 26 * d, 100], [x - 8 * d, 64], [x + 12 * d, 92], [x + 38 * d, 150]] as Pt[], 4), s, p);
      };
      return [...h.whiskers, bump(146, 701), bump(254, 702), ink(superellipse(200, 222, 110, { b: 116, n: 2.1 }, { b: 70, n: 2.0 }), 703, p, 1.4),
        ...h.eyes, ...h.features];
    }
    case 'shades': {
      // Shutter shades: paper frames, the slats cutting across his eyes. The
      // frames and arms sit on an ink rim where they run past his head, so
      // the paper stays his and never joins the sky.
      const lens = (cx: number, s: number) => {
        const frame = toPath(wobble(outline([[cx - 40, 176], [cx + 40, 172], [cx + 44, 212], [cx + 30, 244], [cx - 30, 246], [cx - 44, 214]], 3), s, 0.6));
        return [`<path d="${frame}" fill="none" stroke="${p.ink}" stroke-width="15" stroke-linejoin="round"/>`,
          `<path d="${frame}" fill="none" stroke="${p.paper}" stroke-width="7" stroke-linejoin="round"/>`,
          ...[186, 200, 214, 228].map((y, i) => line([[cx - 42, y], [cx + 42, y - 1]], 5.5, s + i, p.paper))];
      };
      const arms: Pt[][] = [[[194, 190], [200, 186], [206, 190]], [[112, 190], [98, 186]], [[288, 188], [302, 184]]];
      const rims: Pt[][] = [[[190, 191], [200, 185], [210, 191]], [[114, 190], [93, 185]], [[286, 188], [307, 183]]];
      return [...usual, ...rims.map((a, i) => line(a, 14, 906 + i, p.ink)), ...lens(154, 910), ...lens(246, 920),
        ...arms.map((a, i) => line(a, 6, 903 + i, p.paper))];
    }
    default:
      return usual;
  }
}

// ---- Chest pieces on the bust (the rig's canonical coordinates) -------------

// A chain of paper links, a bear-head piece on it.
function chain(p: Palette, s: number): string {
  const pts = curve([[136, 300], [162, 334], [200, 346], [238, 334], [264, 300]], 6);
  return pts.filter((_, i) => i % 2 === 0).map((q, i) => paper(ellipse(q[0], q[1], 6, 4.5, 12), s + i, p, 0.3)).join('')
    + paper(ellipse(200, 366, 18, 16, 24), s + 50, p, 0.6) + ink(ellipse(200, 368, 7, 6, 16), s + 51, p, 0.3)
    + paper(ellipse(186, 352, 7, 7, 12), s + 52, p, 0.3) + paper(ellipse(214, 352, 7, 7, 12), s + 53, p, 0.3);
}
// A thick rope chain, twisted.
function rope(p: Palette, s: number): string {
  const pts = curve([[150, 306], [175, 356], [200, 368], [225, 356], [250, 306]], 8);
  return shape(wobble(stroke(pts, () => 16), s, 0.5), p.paper)
    + pts.filter((_, i) => i % 2 === 1).map((q, i) => line([[q[0] - 5, q[1] - 6], [q[0] + 5, q[1] + 6]], 3, s + i, p.ink)).join('');
}
// A spike: a long ink triangle with a paper rim.
function spike(base: Pt, a: number, len: number, half: number, rim: number, p: Palette): string {
  const tip: Pt = [base[0] + Math.cos(a) * len, base[1] + Math.sin(a) * len];
  const [nx, ny] = [-Math.sin(a) * half, Math.cos(a) * half];
  return `<path d="${poly([[base[0] + nx, base[1] + ny], tip, [base[0] - nx, base[1] - ny]])}" fill="${p.ink}" stroke="${p.paper}" stroke-width="${rim}" stroke-linejoin="round" paint-order="stroke"/>`;
}
// Spikes bristling out along an edge toward `side`.
function spikes(edge: Pt[], side: number, count: number, len: number, half: number, rim: number, seed: number, p: Palette): string {
  const r = rng(seed);
  const pts = curve(edge, 12);
  return Array.from({ length: count }, (_, i) => {
    const q = pts[Math.round((i / (count - 1)) * (pts.length - 1))]!;
    const a = (side < 0 ? Math.PI : 0) - side * (0.9 - (i / (count - 1)) * 1.3) + (r() - 0.5) * 0.25;
    return spike([q[0] - side * half * 0.6, q[1]], a, len * (0.8 + r() * 0.4), half, rim, p);
  }).join('');
}
const heart = (x: number, y: number, k: number, p: Palette) =>
  `<path transform="translate(${x} ${y}) scale(${k})" d="M 0 16 C -20 2 -18 -16 -6 -14 C -2 -14 0 -10 0 -8 C 0 -10 2 -14 6 -14 C 18 -16 20 2 0 16 Z" fill="${p.paper}"/>`;
// The Eye of Horus in ink, centred on (x, y), k its scale.
function horusEye(x: number, y: number, k: number, s: number, p: Palette): string {
  const T = (pts: Pt[]) => pts.map(([a, b]) => [x + a * k, y + b * k] as Pt);
  const w = 3.5 * k;
  return line(T([[-16, -2], [-6, -9], [6, -8], [16, -2]]), w, s, p.ink) + line(T([[-16, -2], [-4, 5], [10, 3], [16, -2]]), w, s + 1, p.ink)
    + ink(T(ellipse(0, -2, 5, 5.5, 14)), s + 2, p, 0.2) + line(T([[-18, -14], [0, -17], [18, -13]]), w, s + 3, p.ink)
    + line(T([[-3, 4], [-5, 18]]), w, s + 4, p.ink) + line(T([[6, 3], [10, 14], [18, 16], [20, 10], [15, 8]]), w, s + 5, p.ink);
}
// Flat links along a line, alternating ink and paper, each turned along it.
function links(pts: Pt[], w: number, h: number, rim: number, p: Palette): string {
  return pts.map((q, i) => {
    const n = pts[Math.min(i + 1, pts.length - 1)]!;
    const m = pts[Math.max(i - 1, 0)]!;
    const a = Math.atan2(n[1] - m[1], n[0] - m[0]) * 180 / Math.PI;
    return `<rect x="${(q[0] - w / 2).toFixed(1)}" y="${(q[1] - h / 2).toFixed(1)}" width="${w}" height="${h}" rx="2" fill="${i % 2 ? p.paper : p.ink}" stroke="${p.paper}" stroke-width="${rim}" transform="rotate(${a.toFixed(0)} ${q[0].toFixed(1)} ${q[1].toFixed(1)})"/>`;
  }).join('');
}
// The Horus piece: a paper disc, a ring inside, the eye.
const medallion = (y: number, r: number, s: number, p: Palette) =>
  `<path d="${toPath(wobble(ellipse(200, y, r, r, 40), s, 0.6))}" fill="${p.paper}" stroke="${p.ink}" stroke-width="${Math.max(3, r / 8)}"/>`
  + `<path d="${toPath(ellipse(200, y, r * 0.82, r * 0.82, 40))}" fill="none" stroke="${p.ink}" stroke-width="${Math.max(2, r / 13)}"/>` + horusEye(200, y + 1, r / 30, s + 10, p);

export function yeChest(c: Costume, p: Palette): string {
  switch (c) {
    case 'bear': case 'shades': return chain(p, 1000);
    case 'mask': return rope(p, 1100);
    case 'balaclava':
      return spikes([[160, 292], [150, 330], [132, 370], [118, 404]], -1, 6, 62, 13, 6, 1200, p)
        + spikes([[240, 292], [250, 330], [268, 370], [282, 404]], 1, 6, 62, 13, 6, 1210, p)
        + `<rect x="160" y="348" width="80" height="28" fill="${p.ink}" stroke="${p.paper}" stroke-width="4"/>` + lettering('DONDA', 200, 370, 22, 'Tektur.ttf', p.paper);
    case 'suit': {
      const tie = `<path d="${toPath(wobble(outline([[193, 304], [207, 304], [212, 322], [206, 392], [200, 400], [194, 392], [188, 322]], 2), 1401, 0.5))}" fill="${p.ink}" stroke="${p.paper}" stroke-width="3"/>`;
      return paper(outline([[170, 292], [186, 288], [200, 300], [214, 288], [230, 292], [200, 352]], 2), 1400, p, 0.6) + tie
        + [326, 346, 366].map((y, i) => line([[190, y + 6], [210, y - 4]], 4, 1402 + i, p.paper)).join('')
        + line([[172, 296], [158, 344], [174, 404]], 4.5, 1410, p.paper) + line([[228, 296], [242, 344], [226, 404]], 4.5, 1411, p.paper)
        + heart(246, 340, 1, p);
    }
    case 'horus':
      // The chain comes round from behind his neck, both ends out of its
      // sides under the chin, and hangs to the piece.
      return links(curve([[156, 302], [162, 330], [178, 344], [200, 348], [222, 344], [238, 330], [244, 302]], 5), 14, 10, 3, p)
        + medallion(372, 32, 2000, p);
    default: return '';
  }
}

// ---- Over a full body square to us (sit coordinates, see body.ts) -----------

// The front body's edges, neck to floor.
const LEFT: Pt[] = [[178, 238], [172, 262], [162, 300], [154, 330], [146, 360], [148, 384]];
const RIGHT: Pt[] = LEFT.map(([x, y]) => [400 - x, y]);

export function yeBody(c: Costume, p: Palette): string {
  const r = (pts: Pt[], s: number, fill: string, strokeFill: string, w: number) =>
    `<path d="${toPath(wobble(outline(pts, 2), s, 0.8))}" fill="${fill}" stroke="${strokeFill}" stroke-width="${w}" stroke-linejoin="round"/>`;
  switch (c) {
    case 'bear': case 'shades':
      return curve([[184, 244], [190, 258], [200, 264], [210, 258], [216, 244]], 4).map((q, i) => paper(ellipse(q[0], q[1], 3.5, 2.8, 10), 1500 + i, p, 0.2)).join('')
        + paper(ellipse(200, 274, 7, 7, 16), 1540, p, 0.4) + ink(ellipse(200, 275, 2.5, 2.5, 8), 1541, p, 0.1);
    case 'mask':
      return shape(wobble(stroke(curve([[184, 246], [190, 262], [200, 268], [210, 262], [216, 246]]), () => 8), 1600, 0.3), p.paper)
        + [[189, 256], [196, 265], [205, 265], [212, 256]].map(([x, y], i) => line([[x! - 3, y! - 3], [x! + 3, y! + 3]], 2, 1601 + i, p.ink)).join('');
    case 'balaclava': {
      const boots = [[168, 384], [232, 384]].map(([x, y], i) => r([[x! - 22, y! + 8], [x! - 18, y! - 22], [x! + 12, y! - 22], [x! + 22, y! + 8]], 1720 + i, p.ink, p.paper, 3.5)
        + line([[x! - 21, y! + 2], [x! + 21, y! + 2]], 3, 1722 + i, p.paper)).join('');
      return spikes(LEFT.slice(0, 5), -1, 7, 34, 8, 4, 1700, p) + spikes(RIGHT.slice(0, 5), 1, 7, 34, 8, 4, 1701, p)
        + `<rect x="172" y="266" width="56" height="30" fill="${p.ink}" stroke="${p.paper}" stroke-width="3"/>` + lettering('DONDA', 200, 286, 14, 'Tektur.ttf', p.paper) + boots;
    }
    case 'suit': {
      const tie = `<path d="M 197 250 L 203 250 L 206 260 L 204 312 L 200 318 L 196 312 L 194 260 Z" fill="${p.ink}" stroke="${p.paper}" stroke-width="2.5"/>`
        + [270, 286, 300].map((y, i) => line([[195, y + 4], [205, y - 2]], 2.8, 1801 + i, p.paper)).join('');
      const shoes = [[166, 386], [234, 386]].map(([x, y], i) => r([[x! - 20, y! + 6], [x! - 16, y! - 8], [x! + 8, y! - 10], [x! + 20, y! + 2], [x! + 20, y! + 7]], 1810 + i, p.paper, p.ink, 3.5)).join('');
      return paper([[184, 242], [200, 276], [216, 242]], 1800, p, 0.4) + tie
        + line([[182, 242], [174, 282], [198, 322]], 3.5, 1805, p.paper) + line([[218, 242], [226, 282], [202, 322]], 3.5, 1806, p.paper)
        + line([[150, 352], [200, 342], [250, 352]], 3.5, 1807, p.paper) + paper(ellipse(200, 328, 3, 3, 8), 1808, p, 0) + heart(221, 268, 0.45, p) + shoes;
    }
    case 'horus':
      return links(curve([[181, 250], [184, 268], [192, 278], [200, 280], [208, 278], [216, 268], [219, 250]], 3), 8, 6, 2, p) + medallion(296, 16, 2100, p);
    default: return '';
  }
}
