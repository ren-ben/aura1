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
const NECK: Pt = [200, 286];

// The head is a bun: a superellipse domed over the whole top and flatter
// underneath, whose sides curve evenly everywhere. Straight sides read as a
// rounded rectangle; uneven rounding reads as drooping cheeks. It is only as
// wide as the eyes need, so they sit close to the edges of the face. The ears are their own triangles laid
// over the top corners, so they meet the head at a small natural bend, the
// way a hand draws them. The right ear is a touch lower: drawn, not mirrored.
const HEAD = superellipse(200, 226, 102, { b: 90, n: 2.2 }, { b: 64, n: 2.0 });

const outline = (pts: Pt[]) => curve([...pts, pts[0]!], 4).slice(0, -1);
// Each ear's outer edge, tip to base; the ear outline adds the inner edge.
// Sized from the reference: each ear about three quarters the height of the
// head below it, its base about 40% of the head's width.
const EAR_EDGES: Pt[][] = [
  [[138, 20], [131, 30], [123, 62], [115, 100], [108, 140], [104, 184]],
  [[262, 24], [269, 34], [277, 66], [285, 104], [292, 144], [296, 188]],
];
const EARS: Pt[][] = [
  outline([[122, 228], ...EAR_EDGES[0]!.slice().reverse(), [144, 20],
    [150, 28], [162, 60], [174, 96], [184, 126], [194, 162]]),
  outline([[206, 162], [216, 126], [226, 96], [238, 62], [250, 32], [256, 24], ...EAR_EDGES[1]!, [278, 228]]),
];

// The neck is about 45% of the head's width. Its top is tucked well inside
// the head, so only the sides emerge from under the chin, and the head can
// tilt without a body corner poking out. From there it flares gently and runs
// off the bottom edge.
const BODY = sampleCubics([
  'M 116 404',
  'C 130 372, 150 340, 154 296',
  'C 156 270, 160 252, 166 246',
  'C 186 240, 214 240, 234 246',
  'C 240 252, 244 270, 246 296',
  'C 250 340, 270 372, 284 404',
  'C 228 408, 172 408, 116 404',
].join(' '), 12);

// Anime eyes: taller than wide, and drawn cleaner than the rest.
// The bottom of the eyes sits a third of the way up the head.
const EYES: Pt[] = [[154, 208], [246, 208]];
const EYE_RX = 24;
const EYE_RY = 31;

// He likes you: faces are bright or content, never sullen.
//   open: round eyes, pupils looking (lookX, lookY); smile lifts the lower
//         edge of each eye like a cheek pushing up.
//   content: closed, gently arched eyes, as in ghibli6.
type Face =
  | { eyes: 'open'; lookX: number; lookY: number; smile: number; tilt: number }
  | { eyes: 'content'; tilt: number };
const FACES: Record<Pose, Face> = {
  // Curious: wide eyes looking up and aside, head cocked.
  idle: { eyes: 'open', lookX: 5, lookY: -7, smile: 0, tilt: -5 },
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
  const pupil = wobble(ellipse(cx + face.lookX, cy + face.lookY, 10, 16, 32), seed + 1, 0.3);
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

// The ear openings face outward: a white stroke that follows each ear's outer
// edge, set in by a thin rim of skin. Thin at the tip, widest low down, and
// stopping short of where the ear meets the head.
const RIM = 5;
function earOpening(edge: Pt[], inward: number): Pt[] {
  const line = curve(edge.slice(1, -1), 6);
  return stroke(line.map((p, i) => {
    const a = line[Math.max(0, i - 1)]!;
    const b = line[Math.min(line.length - 1, i + 1)]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const push = RIM + earWidth(i / (line.length - 1)) / 2;
    return [p[0] + inward * ((b[1] - a[1]) / len) * -push, p[1] + inward * ((b[0] - a[0]) / len) * push] as Pt;
  }), earWidth);
}
function earWidth(t: number): number { return 2.5 + 12 * Math.sin(Math.PI * Math.pow(t, 0.8)); }

// Whiskers leave the cheek, arc out and droop at the tips; each one is a
// different length and angle, tapering to a fine end.
// Roots sit well inside the cheek so no whisker floats off the face.
const WHISKERS: Pt[][] = [
  [[120, 238], [80, 231], [52, 232], [34, 241]],
  [[120, 250], [76, 250], [48, 256], [34, 268]],
  [[128, 262], [88, 268], [62, 280], [50, 296]],
  [[280, 238], [320, 230], [348, 233], [366, 243]],
  [[280, 250], [324, 251], [352, 258], [366, 271]],
  [[272, 262], [312, 269], [338, 282], [350, 297]],
];

const brush = (line: Pt[], root: number, tip: number) =>
  stroke(curve(line), (t) => root + (tip - root) * t);

// Headphones after ghibli7: a band that floats over the head behind the ears,
// with a white line along it, and big round cups with a white rim.
function headphonesBehind(p: Palette, seed: number): string[] {
  const band = curve([[92, 184], [84, 132], [100, 90], [150, 66], [200, 60], [250, 66], [300, 90], [316, 132], [308, 184]]);
  const inner = curve([[104, 178], [98, 134], [110, 100], [154, 78], [200, 72], [246, 78], [290, 100], [302, 134], [296, 178]]);
  return [
    path(wobble(stroke(band, () => 15), seed, 0.8), p.ink),
    path(wobble(stroke(inner, (t) => 2.5 + 3.5 * Math.sin(Math.PI * t)), seed + 1, 0.5), p.paper),
  ];
}

function headphonesFront(p: Palette, seed: number): string[] {
  // Seen side-on, so each cup is a tall narrow oval, not a ball.
  const cup = (cx: number, side: number, s: number) => {
    const rim = curve([[cx + side * 3, 184], [cx + side * 9, 210], [cx + side * 3, 236]]);
    return [
      path(wobble(ellipse(cx, 210, 19, 38), s, 1), p.paper),
      path(wobble(ellipse(cx, 210, 14, 33), s + 1, 1), p.ink),
      path(wobble(stroke(rim, (t) => 2.5 + 3.5 * Math.sin(Math.PI * t)), s + 2, 0.4), p.paper),
    ];
  };
  return [...cup(98, -1, seed + 3), ...cup(302, 1, seed + 6)];
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
      ...EAR_EDGES.map((e, i) => path(wobble(earOpening(e, i === 0 ? -1 : 1), 40 + i, 0.5), p.paper)),
      ...eye(EYES[0]!, face, 50, p),
      ...eye(EYES[1]!, face, 60, p),
      // The nose: a tiny dash level with the lower half of the eyes.
      path(wobble(ellipse(200, 230, 6, 3, 16), 80, 0.4), p.paper),
      ...(phones ? headphonesFront(p, 90) : []),
    ].join('')),
  ];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}">${parts.join('')}</svg>`;
}
