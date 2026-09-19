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
const NECK: Pt = [200, 320];

// Proportions measured from the reference drawing (inspiration: the "?" Jiji):
// head about 1.3x wider than crown-to-neck, sides almost straight with a
// faint bulge, widest above the eyes (never at the cheeks, which reads fat),
// lower corners curving in over the bottom third, a neck 45% of the head
// width. Each ear's base spans ~42% of the head, its outer edge meets the side
// at a ~23 degree bend, and the right ear sits a little lower: drawn, not
// mirrored. Points are smoothed like a pen line (Catmull-Rom).
const outline = (pts: Pt[]) => curve([...pts, pts[0]!], 4).slice(0, -1);
const HEAD = outline([
  [147, 324], [126, 310], [108, 299], [97, 281], [89, 262], [87, 234], [86, 205], [86, 178], [88, 152],
  [96, 120], [105, 86], [116, 58], [126, 40], [132, 31], [138, 28], [143, 30],
  [150, 42], [159, 58], [168, 76], [175, 95], [180, 113], [183, 130], [186, 146],
  [200, 148], [222, 146],
  [226, 130], [230, 114], [237, 95], [244, 77], [252, 58], [260, 44], [266, 36],
  [271, 34], [276, 36], [281, 42],
  [290, 62], [298, 80], [304, 98], [309, 116], [313, 140], [315, 165], [316, 190], [315, 215], [316, 240],
  [315, 262], [308, 281], [296, 299], [284, 309], [268, 318], [250, 326], [200, 334],
]);

// From the narrow neck the body flares gently and runs off the bottom edge.
const BODY = sampleCubics([
  'M 117 404',
  'C 128 370, 140 340, 148 300',
  'C 180 294, 220 294, 252 300',
  'C 256 340, 260 370, 265 404',
  'C 216 408, 166 408, 117 404',
].join(' '), 12);

// Anime eyes: taller than wide, and drawn cleaner than the rest.
const EYES: Pt[] = [[158, 232], [246, 232]];
const EYE_RX = 26;
const EYE_RY = 35;

// He likes you: faces are bright or content, never sullen.
//   open: round eyes, pupils looking (lookX, lookY); smile lifts the lower
//         edge of each eye like a cheek pushing up.
//   content: closed, gently arched eyes, as in ghibli6.
type Face =
  | { eyes: 'open'; lookX: number; lookY: number; smile: number; tilt: number }
  | { eyes: 'content'; tilt: number };
const FACES: Record<Pose, Face> = {
  // Curious: wide eyes looking up and aside, head cocked.
  idle: { eyes: 'open', lookX: 6, lookY: -8, smile: 0, tilt: -8 },
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
const EAR_LINES: Pt[][] = [
  [[131, 58], [122, 86], [112, 114], [103, 140], [99, 150]],
  [[278, 60], [287, 88], [296, 116], [304, 140], [307, 150]],
];
const earWidth = (t: number) => 3 + 10 * Math.sin(Math.PI * Math.pow(t, 0.8));

// Whiskers leave the cheek, arc out and droop at the tips; each one is a
// different length and angle, tapering to a fine end.
// Roots sit well inside the cheek so no whisker floats off the face.
const WHISKERS: Pt[][] = [
  [[116, 270], [78, 263], [52, 264], [34, 273]],
  [[118, 282], [76, 282], [48, 288], [34, 300]],
  [[128, 294], [88, 300], [62, 312], [50, 328]],
  [[288, 270], [326, 262], [352, 265], [368, 275]],
  [[286, 282], [328, 283], [354, 290], [368, 303]],
  [[276, 294], [316, 301], [340, 314], [350, 329]],
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
  return [...cup(88, -1, seed + 3), ...cup(314, 1, seed + 6)];
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
      path(wobble(ellipse(202, 254, 6, 3, 16), 80, 0.4), p.paper),
      ...(phones ? headphonesFront(p, 90) : []),
    ].join('')),
  ];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}">${parts.join('')}</svg>`;
}
