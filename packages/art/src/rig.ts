// Kael'thos, as a parts rig. A flat ink silhouette with paper marks: big eyes,
// a dash of a nose, inner-ear lines, drooping whiskers. Every outline is
// hand-wobbled (see ink.ts) so it reads as drawn, not constructed. Poses pick
// part variants; skins add overlays. The device and the web both compose from
// here, so they cannot drift.
//
// Units: a 400 x 400 canvas. The device bakes at 200, so marks stay at least
// ~5 units wide here.

import {
  curve, ellipse, sampleCubics, stroke, superellipse, toPath, wobble, type Pt,
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
const NECK: Pt = [200, 300];

// The head is a pill: a superellipse, about 1.3x wider than tall, whose sides
// curve evenly everywhere. Straight sides read as a rounded rectangle; uneven
// rounding reads as drooping cheeks. The ears are their own triangles laid
// over the top corners, so they meet the head at a small natural bend, the
// way a hand draws them. The right ear is a touch lower: drawn, not mirrored.
const HEAD = superellipse(200, 232, 112, 86, 2.6);

const outline = (pts: Pt[]) => curve([...pts, pts[0]!], 4).slice(0, -1);
const EARS: Pt[][] = [
  outline([[118, 226], [104, 176], [110, 130], [120, 88], [129, 54], [136, 32], [142, 24], [149, 24],
    [154, 31], [166, 62], [178, 98], [188, 134], [197, 170]]),
  outline([[203, 170], [212, 134], [224, 98], [236, 64], [248, 34], [253, 28], [260, 28], [265, 36],
    [274, 64], [284, 100], [292, 140], [297, 180], [284, 226]]),
];

// From the neck (about half the head's width) the body flares gently and runs
// off the bottom edge; its top hides inside the head.
const BODY = sampleCubics([
  'M 118 404',
  'C 128 372, 140 344, 146 296',
  'C 180 288, 220 288, 254 296',
  'C 260 344, 272 372, 282 404',
  'C 216 408, 166 408, 118 404',
].join(' '), 12);

// Anime eyes: taller than wide, and drawn cleaner than the rest.
const EYES: Pt[] = [[156, 236], [244, 236]];
const EYE_RX = 25;
const EYE_RY = 33;

// He likes you: faces are bright or content, never sullen.
//   open: round eyes, pupils looking (lookX, lookY); smile lifts the lower
//         edge of each eye like a cheek pushing up.
//   content: closed, gently arched eyes, as in ghibli6.
type Face =
  | { eyes: 'open'; lookX: number; lookY: number; smile: number; tilt: number }
  | { eyes: 'content'; tilt: number };
const FACES: Record<Pose, Face> = {
  // Curious: wide eyes looking up and aside, head cocked.
  idle: { eyes: 'open', lookX: 6, lookY: -8, smile: 0, tilt: -5 },
  // Eyes closed, in the zone, bopping to the music.
  focused: { eyes: 'content', tilt: 4 },
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
const EAR_LINES: Pt[][] = [
  [[139, 50], [132, 78], [125, 106], [119, 136]],
  [[260, 52], [270, 80], [277, 108], [283, 138]],
];
const earWidth = (t: number) => 2.5 + 6 * Math.sin(Math.PI * Math.pow(t, 0.8));

// Whiskers leave the cheek, arc out and droop at the tips; each one is a
// different length and angle, tapering to a fine end.
// Roots sit well inside the cheek so no whisker floats off the face.
const WHISKERS: Pt[][] = [
  [[118, 262], [80, 255], [52, 256], [34, 265]],
  [[118, 274], [76, 274], [48, 280], [34, 292]],
  [[126, 286], [88, 292], [62, 304], [50, 320]],
  [[282, 262], [320, 254], [348, 257], [366, 267]],
  [[282, 274], [324, 275], [352, 282], [366, 295]],
  [[274, 286], [312, 293], [338, 306], [350, 321]],
];

const brush = (line: Pt[], root: number, tip: number) =>
  stroke(curve(line), (t) => root + (tip - root) * t);

// Headphones after ghibli7: a band that floats over the head behind the ears,
// with a white line along it, and big round cups with a white rim.
function headphonesBehind(p: Palette, seed: number): string[] {
  const band = curve([[80, 210], [72, 150], [94, 96], [148, 68], [200, 62], [252, 68], [306, 96], [328, 150], [320, 210]]);
  const inner = curve([[92, 204], [86, 152], [104, 106], [152, 80], [200, 74], [248, 80], [296, 106], [314, 152], [308, 204]]);
  return [
    path(wobble(stroke(band, () => 15), seed, 0.8), p.ink),
    path(wobble(stroke(inner, (t) => 2.5 + 3.5 * Math.sin(Math.PI * t)), seed + 1, 0.5), p.paper),
  ];
}

function headphonesFront(p: Palette, seed: number): string[] {
  // Seen side-on, so each cup is a tall narrow oval, not a ball.
  const cup = (cx: number, side: number, s: number) => {
    const rim = curve([[cx + side * 3, 204], [cx + side * 9, 232], [cx + side * 3, 260]]);
    return [
      path(wobble(ellipse(cx, 232, 20, 41), s, 1), p.paper),
      path(wobble(ellipse(cx, 232, 15, 36), s + 1, 1), p.ink),
      path(wobble(stroke(rim, (t) => 2.5 + 3.5 * Math.sin(Math.PI * t)), s + 2, 0.4), p.paper),
    ];
  };
  return [...cup(88, -1, seed + 3), ...cup(312, 1, seed + 6)];
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
      ...EARS.map((e, i) => path(wobble(e, 20 + i, 1.2), p.ink)),
      path(wobble(HEAD, 7, 1.8), p.ink),
      ...EAR_LINES.map((l, i) => path(wobble(stroke(curve(l), earWidth), 40 + i, 0.5), p.paper)),
      ...eye(EYES[0]!, face, 50, p),
      ...eye(EYES[1]!, face, 60, p),
      // The nose: a tiny dash level with the lower half of the eyes.
      path(wobble(ellipse(200, 256, 6, 3, 16), 80, 0.4), p.paper),
      ...(phones ? headphonesFront(p, 90) : []),
    ].join('')),
  ];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}">${parts.join('')}</svg>`;
}
