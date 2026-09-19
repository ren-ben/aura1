// Kael'thos, as a parts rig. A flat ink silhouette with paper marks: big eyes,
// a dash of a nose, inner-ear lines, drooping whiskers. Every outline is
// hand-wobbled (see ink.ts) so it reads as drawn, not constructed. Poses pick
// part variants; skins add overlays. The device and the web both compose from
// here, so they cannot drift.
//
// Units: a 400 x 400 canvas. The device bakes at 200, so marks stay at least
// ~5 units wide here.

import {
  curve, ellipse, sampleCubics, stroke, toPath, wobble, type Pt,
} from './ink.ts';

export const SIZE = 400;

export const POSES = ['idle', 'focused'] as const;
export type Pose = (typeof POSES)[number];

export const SKINS = ['default', 'halo'] as const;
export type Skin = (typeof SKINS)[number];

// ink: the silhouette. paper: eyes, nose, and the drawn lines on the fur.
export type Palette = { ink: string; paper: string; background?: string };
export const DEVICE_PALETTE: Palette = { ink: '#000', paper: '#fff', background: '#fff' };

// The head tilts on the neck and he looks off to one side, never straight at you.
const NECK: Pt = [200, 262];
const TILT = -7;

// Big soft ears with rounded tips, a broad head, after ghibli3 and the Jiji refs.
const HEAD = sampleCubics([
  'M 150 268',
  'C 112 258, 94 226, 96 190',
  'C 96 160, 102 136, 112 116',
  'C 112 82, 118 52, 130 32',
  'C 137 21, 150 21, 156 32',
  'C 166 58, 173 88, 180 112',
  'C 194 107, 206 107, 220 112',
  'C 227 88, 234 58, 244 32',
  'C 250 21, 263 21, 270 32',
  'C 282 52, 288 82, 288 116',
  'C 298 136, 304 160, 304 190',
  'C 306 226, 288 258, 250 268',
  'C 230 276, 170 276, 150 268',
].join(' '), 10);

// A bell from the neck down, running off the bottom edge.
const BODY = sampleCubics([
  'M 96 400',
  'C 112 346, 150 318, 160 246',
  'C 186 240, 214 240, 240 246',
  'C 250 318, 288 346, 304 400',
  'C 236 404, 164 404, 96 400',
].join(' '), 12);

const EYES: Pt[] = [[152, 200], [248, 200]];
const EYE_RX = 33;
const EYE_RY = 30;

// lid: how far the lid comes down (0 open, 1 shut). The gaze moves both pupils
// the same way, so he looks somewhere rather than cross-eyed.
type Face = { lid: number; lookX: number; lookY: number };
const FACES: Record<Pose, Face> = {
  // Heavy-lidded and aloof, glancing aside.
  idle: { lid: 0.36, lookX: 9, lookY: 4 },
  // Eyes down and to the side, on the work.
  focused: { lid: 0.3, lookX: 7, lookY: 12 },
};

const path = (pts: Pt[], fill: string) => `<path d="${toPath(pts)}" fill="${fill}"/>`;

function eye([cx, cy]: Pt, face: Face, seed: number, p: Palette): string[] {
  const white = wobble(ellipse(cx, cy, EYE_RX, EYE_RY), seed, 1.4);
  const pupil = wobble(ellipse(cx + face.lookX, cy + face.lookY, 8, 13, 24), seed + 1, 0.6);
  // The lid's edge sags a little towards the outer corner, like a tired eye.
  const top = cy - EYE_RY - 6;
  const edge = cy - EYE_RY + 2 * EYE_RY * face.lid;
  const outer = cx < 200 ? -1 : 1;
  const lid: Pt[] = [
    [cx - EYE_RX - 6, top], [cx + EYE_RX + 6, top],
    ...curve([
      [cx + EYE_RX + 6, edge + outer * 3], [cx, edge - 1], [cx - EYE_RX - 6, edge - outer * 3],
    ]),
  ];
  return [path(white, p.paper), path(pupil, p.ink), path(wobble(lid, seed + 2, 0.8), p.ink)];
}

// One white line down the inner side of each ear, like the fold in ghibli.jpg.
const EAR_LINES: Pt[][] = [
  [[146, 44], [154, 66], [161, 90], [166, 110]],
  [[254, 44], [246, 66], [239, 90], [234, 110]],
];

// Whiskers leave the cheek, arc out and droop at the tips; each one is a
// different length and angle, tapering to a fine end.
const WHISKERS: Pt[][] = [
  [[112, 226], [80, 219], [52, 220], [34, 229]],
  [[110, 238], [78, 238], [50, 244], [36, 256]],
  [[114, 250], [86, 256], [62, 268], [50, 284]],
  [[288, 226], [322, 218], [350, 221], [366, 231]],
  [[290, 238], [322, 239], [348, 246], [362, 259]],
  [[286, 250], [314, 257], [336, 270], [346, 285]],
];

const brush = (line: Pt[], root: number, tip: number) =>
  stroke(curve(line), (t) => root + (tip - root) * t);

// Over-ear headphones: an ink band that rides just over the crown between the
// ears, one white line along its inside, and a soft cup on each cheek. It
// merges with the fur instead of cutting into it.
function headphones(p: Palette, seed: number): string[] {
  const band: Pt[] = [[104, 178], [103, 140], [126, 112], [200, 103], [274, 112], [297, 140], [296, 178]];
  const inner: Pt[] = [[114, 176], [114, 143], [134, 121], [200, 113], [266, 121], [286, 143], [286, 176]];
  const cup = (cx: number, s: number) => {
    const shell = wobble(ellipse(cx, 206, 20, 32), s, 1.2);
    const rim = wobble(stroke(curve([[cx - 7, 184], [cx - 10, 206], [cx - 7, 228]]), () => 5), s + 1, 0.4);
    return [path(wobble(ellipse(cx, 206, 25, 37), s + 2, 1.2), p.paper), path(shell, p.ink), path(rim, p.paper)];
  };
  return [
    path(wobble(brush(band, 11, 11), seed, 0.8), p.ink),
    path(wobble(stroke(curve(inner), (t) => 3 + 3 * Math.sin(Math.PI * t)), seed + 1, 0.5), p.paper),
    ...cup(96, seed + 3),
    ...cup(304, seed + 6),
  ];
}

// Astrolabe halo: a tilted orbit behind the ears with bodies on it.
function halo(p: Palette, seed: number): string[] {
  const orbit = ellipse(200, 92, 116, 30, 60);
  const ring = wobble(stroke([...orbit, orbit[0]!], () => 6), seed, 0.8);
  const orbs = [[86, 94], [316, 88], [200, 62]].map(([x, y], i) =>
    path(wobble(ellipse(x!, y!, 8, 8, 16), seed + i + 1, 0.6), p.ink));
  const star: Pt[] = Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 ? 6 : 14;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    return [200 + r * Math.cos(a), 24 + r * Math.sin(a)] as Pt;
  });
  return [path(ring, p.ink), ...orbs, path(wobble(star, seed + 9, 0.5), p.ink)];
}

export function compose(pose: Pose, skin: Skin, p: Palette = DEVICE_PALETTE): string {
  const face = FACES[pose];
  // Everything above the neck turns with the head.
  const head = (svg: string) => `<g transform="rotate(${TILT} ${NECK[0]} ${NECK[1]})">${svg}</g>`;
  const parts = [
    p.background ? `<rect width="${SIZE}" height="${SIZE}" fill="${p.background}"/>` : '',
    path(wobble(BODY, 11, 2.2), p.ink),
    head([
      skin === 'halo' ? halo(p, 70).join('') : '',
      ...WHISKERS.map((w, i) => path(wobble(brush(w, 6.5, 3.2), 30 + i, 0.5), p.ink)),
      path(wobble(HEAD, 7, 2.4), p.ink),
      ...EAR_LINES.map((l, i) => path(wobble(stroke(curve(l), (t) => 3 + 4 * Math.sin(Math.PI * t)), 40 + i, 0.4), p.paper)),
      ...eye(EYES[0]!, face, 50, p),
      ...eye(EYES[1]!, face, 60, p),
      path(wobble(ellipse(200, 234, 7, 3.5, 16), 80, 0.5), p.paper),
      ...(pose === 'focused' ? headphones(p, 90) : []),
    ].join('')),
  ];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}">${parts.join('')}</svg>`;
}
