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

// The head tilts on the neck (per pose) and he looks somewhere, never dead ahead.
const NECK: Pt = [200, 290];

// A tall pill of a head: near-straight sides that run on up into the ears, a
// round U at the bottom, a small crown between the ears. The forehead is
// short: the eyes sit high.
const HEAD = sampleCubics([
  'M 200 304',
  'C 146 304, 102 282, 100 240',
  'C 98 204, 100 170, 105 138',
  'C 110 102, 117 64, 128 34',
  'C 133 22, 146 22, 151 34',
  'C 164 64, 178 98, 188 122',
  'C 196 120, 204 120, 212 122',
  'C 222 98, 236 64, 249 34',
  'C 254 22, 267 22, 272 34',
  'C 283 64, 290 102, 295 138',
  'C 300 170, 302 204, 300 240',
  'C 298 282, 254 304, 200 304',
].join(' '), 10);

// A bell from the neck down, running off the bottom edge.
const BODY = sampleCubics([
  'M 100 400',
  'C 116 346, 150 318, 160 262',
  'C 186 256, 214 256, 240 262',
  'C 250 318, 284 346, 300 400',
  'C 234 404, 166 404, 100 400',
].join(' '), 12);

// Anime eyes: taller than wide, and drawn cleaner than the rest.
const EYES: Pt[] = [[158, 212], [242, 212]];
const EYE_RX = 27;
const EYE_RY = 36;

// He likes you: faces are bright or content, never sullen.
//   open: round eyes, pupils looking (lookX, lookY); smile lifts the lower
//         edge of each eye like a cheek pushing up.
//   content: closed, gently arched eyes, as in ghibli6.
type Face =
  | { eyes: 'open'; lookX: number; lookY: number; smile: number; tilt: number }
  | { eyes: 'content'; tilt: number };
const FACES: Record<Pose, Face> = {
  // Curious: wide eyes looking up and aside, head cocked.
  idle: { eyes: 'open', lookX: 6, lookY: -8, smile: 0, tilt: -12 },
  // Eyes closed, in the zone, bopping to the music.
  focused: { eyes: 'content', tilt: 6 },
};

const path = (pts: Pt[], fill: string) => `<path d="${toPath(pts)}" fill="${fill}"/>`;

function eye([cx, cy]: Pt, face: Face, seed: number, p: Palette): string[] {
  if (face.eyes === 'content') {
    const arc = curve([[cx - 24, cy + 2], [cx - 9, cy - 2], [cx + 9, cy - 2], [cx + 24, cy + 2]]);
    return [path(wobble(stroke(arc, (t) => 3 + 5 * Math.sin(Math.PI * t)), seed, 0.5), p.paper)];
  }
  const white = wobble(ellipse(cx, cy, EYE_RX, EYE_RY, 48), seed, 0.7);
  const pupil = wobble(ellipse(cx + face.lookX, cy + face.lookY, 11, 18, 32), seed + 1, 0.3);
  if (face.smile === 0) return [path(white, p.paper), path(pupil, p.ink)];
  // The cheek: ink over the bottom of the eye, its top edge arched upward.
  const bottom = cy + EYE_RY + 6;
  const edge = cy + EYE_RY - 2 * EYE_RY * face.smile;
  const cheek: Pt[] = [
    [cx + EYE_RX + 6, bottom], [cx - EYE_RX - 6, bottom],
    ...curve([[cx - EYE_RX - 6, edge + 14], [cx - EYE_RX * 0.55, edge + 1], [cx, edge - 3], [cx + EYE_RX * 0.55, edge + 1], [cx + EYE_RX + 6, edge + 14]]),
  ];
  return [path(white, p.paper), path(pupil, p.ink), path(wobble(cheek, seed + 2, 0.6), p.ink)];
}

// The ear openings face outward: a white stroke close to each ear's outer
// edge, so only a thin rim of skin shows on the outside. Thin at the tip,
// widest low down.
const EAR_OPENING: Pt[] = [[132, 56], [128, 80], [124, 104], [119, 128], [114, 142]];
const EAR_LINES: Pt[][] = [EAR_OPENING, EAR_OPENING.map(([x, y]) => [400 - x, y] as Pt)];
const earWidth = (t: number) => 3 + 10 * Math.sin(Math.PI * Math.pow(t, 0.8));

// Whiskers leave the cheek, arc out and droop at the tips; each one is a
// different length and angle, tapering to a fine end.
// Roots sit well inside the cheek so no whisker floats off the face.
const WHISKERS: Pt[][] = [
  [[118, 238], [80, 231], [52, 232], [34, 241]],
  [[118, 250], [76, 250], [48, 256], [34, 268]],
  [[128, 262], [88, 268], [62, 280], [50, 296]],
  [[282, 238], [322, 230], [350, 233], [366, 243]],
  [[282, 250], [324, 251], [350, 258], [364, 271]],
  [[272, 262], [312, 269], [336, 282], [346, 297]],
];

const brush = (line: Pt[], root: number, tip: number) =>
  stroke(curve(line), (t) => root + (tip - root) * t);

// Headphones after ghibli7: a band that floats over the head behind the ears,
// with a white line along it, and big round cups with a white rim.
function headphonesBehind(p: Palette, seed: number): string[] {
  const band = curve([[92, 184], [96, 128], [132, 86], [200, 72], [268, 86], [304, 128], [308, 184]]);
  const inner = curve([[104, 176], [108, 132], [140, 98], [200, 86], [260, 98], [292, 132], [296, 176]]);
  return [
    path(wobble(stroke(band, () => 15), seed, 0.8), p.ink),
    path(wobble(stroke(inner, (t) => 2.5 + 3.5 * Math.sin(Math.PI * t)), seed + 1, 0.5), p.paper),
  ];
}

function headphonesFront(p: Palette, seed: number): string[] {
  // Seen side-on, so each cup is a tall narrow oval, not a ball.
  const cup = (cx: number, side: number, s: number) => {
    const rim = curve([[cx + side * 3, 186], [cx + side * 9, 214], [cx + side * 3, 242]]);
    return [
      path(wobble(ellipse(cx, 214, 20, 41), s, 1), p.paper),
      path(wobble(ellipse(cx, 214, 15, 36), s + 1, 1), p.ink),
      path(wobble(stroke(rim, (t) => 2.5 + 3.5 * Math.sin(Math.PI * t)), s + 2, 0.4), p.paper),
    ];
  };
  return [...cup(94, -1, seed + 3), ...cup(306, 1, seed + 6)];
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
  const phones = pose === 'focused';
  // Everything above the neck turns with the head.
  const head = (svg: string) => `<g transform="rotate(${face.tilt} ${NECK[0]} ${NECK[1]})">${svg}</g>`;
  const parts = [
    p.background ? `<rect width="${SIZE}" height="${SIZE}" fill="${p.background}"/>` : '',
    path(wobble(BODY, 11, 2.2), p.ink),
    head([
      skin === 'halo' ? halo(p, 70).join('') : '',
      ...(phones ? headphonesBehind(p, 90) : []),
      ...WHISKERS.map((w, i) => path(wobble(brush(w, 6.5, 3.2), 30 + i, 0.5), p.ink)),
      path(wobble(HEAD, 7, 2.4), p.ink),
      ...EAR_LINES.map((l, i) => path(wobble(stroke(curve(l), earWidth), 40 + i, 0.5), p.paper)),
      ...eye(EYES[0]!, face, 50, p),
      ...eye(EYES[1]!, face, 60, p),
      // The nose: a tiny dash level with the lower half of the eyes.
      path(wobble(ellipse(200, 234, 6, 3, 16), 80, 0.4), p.paper),
      ...(phones ? headphonesFront(p, 90) : []),
    ].join('')),
  ];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}">${parts.join('')}</svg>`;
}
