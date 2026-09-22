// Kael'thos, as a parts rig. A flat ink silhouette with paper marks: big eyes,
// a dash of a nose, ear openings, drooping whiskers. Every outline is
// hand-wobbled (see ink.ts) so it reads as drawn, not constructed. The face
// kit (face.ts, marks.ts) gives him expressions; accessories and skins are
// overlays. The device and the web both compose from here, so they cannot
// drift. See STYLE.md before changing any shape, CHARACTER.md for moods.
//
// Units: a 400 x 400 canvas. The device bakes at 200, so marks stay at least
// ~5 units wide here.

import {
  curve, ellipse, outline, rotate, sampleCubics, shape, stroke, superellipse, wobble, type Pt,
} from './ink.ts';
import { blush, eye, EYES, mouth, type Palette } from './face.ts';
import { marks } from './marks.ts';
import { EXPRESSIONS, type Ears, type Expression } from './expressions.ts';

export type { Palette } from './face.ts';
export { EXPRESSIONS, type Expression, type ExpressionName } from './expressions.ts';

export const SIZE = 400;

export const POSES = ['idle', 'focused'] as const;
export type Pose = (typeof POSES)[number];

export const SKINS = ['default', 'halo'] as const;
export type Skin = (typeof SKINS)[number];

export const DEVICE_PALETTE: Palette = { ink: '#000', paper: '#fff', background: '#fff' };

// The head tilts on the neck and he looks somewhere, never dead ahead.
export const NECK: Pt = [200, 286];

// The head is a bun: a superellipse domed over the whole top and tapering
// into the cheeks, whose sides curve evenly everywhere. It is only as wide as
// the eyes need, so they sit close to the edges of the face.
const HEAD = superellipse(200, 226, 102, { b: 90, n: 2.2 }, { b: 64, n: 2.0 });

// The ears are their own triangles laid over the top corners, so they meet
// the head at a small natural bend. Each is about three quarters the height of
// the head below it. The right one is a touch lower: drawn, not mirrored.
// Each ear's outer edge, tip to base; the outline adds the inner edge.
const EAR_EDGES: Pt[][] = [
  [[138, 20], [131, 30], [123, 62], [115, 100], [108, 140], [104, 184]],
  [[262, 24], [269, 34], [277, 66], [285, 104], [292, 144], [296, 188]],
];
const EAR_INNER: Pt[][] = [
  [[144, 20], [150, 28], [162, 60], [174, 96], [184, 126], [194, 162]],
  [[206, 162], [216, 126], [226, 96], [238, 62], [250, 32], [256, 24]],
];
// Ears swing about their base: back when angry or scared, forward when alert.
const EAR_PIVOTS: Pt[] = [[150, 196], [250, 196]];
const EAR_SWING: Record<Ears, number> = { up: 0, back: 12, perk: -4 };

// The neck is about 45% of the head's width, its top tucked well inside the
// head, so only the sides emerge from under the chin.
const BODY = sampleCubics([
  'M 116 404',
  'C 130 372, 150 340, 154 296',
  'C 156 270, 160 252, 166 246',
  'C 186 240, 214 240, 234 246',
  'C 240 252, 244 270, 246 296',
  'C 250 340, 270 372, 284 404',
  'C 228 408, 172 408, 116 404',
].join(' '), 12);

// The ear openings face outward: a white stroke that follows each ear's outer
// edge, set in by a thin rim of skin. Thin at the tip, widest low down.
const RIM = 5;
const earWidth = (t: number) => 2.5 + 12 * Math.sin(Math.PI * Math.pow(t, 0.8));
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

// Whiskers leave the cheek, arc out and droop at the tips; each is a
// different length and angle. Roots sit inside the cheek.
const WHISKERS: Pt[][] = [
  [[120, 238], [80, 231], [52, 232], [34, 241]],
  [[120, 250], [76, 250], [48, 256], [34, 268]],
  [[128, 262], [88, 268], [62, 280], [50, 296]],
  [[280, 238], [320, 230], [348, 233], [366, 243]],
  [[280, 250], [324, 251], [352, 258], [366, 271]],
  [[272, 262], [312, 269], [338, 282], [350, 297]],
];
const shorten = (line: Pt[], k: number): Pt[] =>
  line.map(([x, y]) => [line[0]![0] + (x - line[0]![0]) * k, line[0]![1] + (y - line[0]![1]) * k]);
const brush = (line: Pt[], root: number, tip: number) =>
  stroke(curve(line), (t) => root + (tip - root) * t);

// Headphones after ghibli7: a band that floats over the head behind the ears,
// with a white line along it, and side-on oval cups with a white rim.
function headphonesBehind(p: Palette, seed: number): string[] {
  const band = curve([[92, 184], [84, 132], [100, 90], [150, 66], [200, 60], [250, 66], [300, 90], [316, 132], [308, 184]]);
  const inner = curve([[104, 178], [98, 134], [110, 100], [154, 78], [200, 72], [246, 78], [290, 100], [302, 134], [296, 178]]);
  return [
    shape(wobble(stroke(band, () => 15), seed, 0.8), p.ink),
    shape(wobble(stroke(inner, (t) => 2.5 + 3.5 * Math.sin(Math.PI * t)), seed + 1, 0.5), p.paper),
  ];
}
function headphonesFront(p: Palette, seed: number): string[] {
  const cup = (cx: number, side: number, s: number) => {
    const rim = curve([[cx + side * 3, 184], [cx + side * 9, 210], [cx + side * 3, 236]]);
    return [
      shape(wobble(ellipse(cx, 210, 19, 38), s, 1), p.paper),
      shape(wobble(ellipse(cx, 210, 14, 33), s + 1, 1), p.ink),
      shape(wobble(stroke(rim, (t) => 2.5 + 3.5 * Math.sin(Math.PI * t)), s + 2, 0.4), p.paper),
    ];
  };
  return [...cup(98, -1, seed + 3), ...cup(302, 1, seed + 6)];
}

// Astrolabe halo: a tilted orbit behind the ears with bodies on it.
function halo(p: Palette, seed: number): string[] {
  const orbit = ellipse(200, 92, 116, 30, 60);
  const ring = wobble(stroke([...orbit, orbit[0]!], () => 6), seed, 0.8);
  const orbs = [[86, 94], [316, 88], [200, 62]].map(([x, y], i) =>
    shape(wobble(ellipse(x!, y!, 8, 8, 16), seed + i + 1, 0.6), p.ink));
  const star: Pt[] = Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 ? 6 : 14;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    return [200 + r * Math.cos(a), 24 + r * Math.sin(a)] as Pt;
  });
  return [shape(ring, p.ink), ...orbs, shape(wobble(star, seed + 9, 0.5), p.ink)];
}

// hat: the hunter's tricorn, for the Hunter's Dream and the hunt.
export type Wear = { skin?: Skin; headphones?: boolean; hat?: boolean };

// The head in canonical coordinates, tilted about the neck. Scenes place it
// with a transform; the bust puts it on the body as drawn.
export function head(expr: Expression, p: Palette, wear: Wear = {}): string {
  const eyes = Array.isArray(expr.eyes) ? expr.eyes : [expr.eyes, expr.eyes];
  const look = expr.look ?? [0, 0];
  const swing = EAR_SWING[expr.ears ?? 'up'];
  const edges = EAR_EDGES.map((e, i) => rotate(e, i === 0 ? -swing : swing, EAR_PIVOTS[i]!));
  const inner = EAR_INNER.map((e, i) => rotate(e, i === 0 ? -swing : swing, EAR_PIVOTS[i]!));
  const ears = [
    outline([rotate([[122, 228]], -swing, EAR_PIVOTS[0]!)[0]!, ...edges[0]!.slice().reverse(), ...inner[0]!]),
    outline([...inner[1]!, ...edges[1]!, rotate([[278, 228]], swing, EAR_PIVOTS[1]!)[0]!]),
  ];
  const parts = [
    wear.skin === 'halo' ? halo(p, 70).join('') : '',
    ...(wear.headphones ? headphonesBehind(p, 90) : []),
    ...WHISKERS.map((w, i) => shape(wobble(brush(shorten(w, 0.8), 5.2, 3), 30 + i, 0.4), p.ink)),
    ...ears.map((e, i) => shape(wobble(e, 20 + i, 1.2), p.ink)),
    shape(wobble(HEAD, 7, 1.8), p.ink),
    ...edges.map((e, i) => shape(wobble(earOpening(e, i === 0 ? -1 : 1), 40 + i, 0.5), p.paper)),
    ...eye(eyes[0]!, EYES[0]!, -1, look, expr.lid ?? 0.45, 50, p),
    ...eye(eyes[1]!, EYES[1]!, 1, look, expr.lid ?? 0.45, 60, p),
    // The nose: a tiny dash level with the lower half of the eyes.
    shape(wobble(ellipse(200, 230, 6, 3, 16), 80, 0.4), p.paper),
    ...(expr.mouth ? mouth(expr.mouth, 110, p) : []),
    ...(expr.blush ? blush(120, p) : []),
    ...(wear.headphones ? headphonesFront(p, 90) : []),
    ...marks(expr.marks ?? [], 200, p),
  ];
  return `<g transform="rotate(${expr.tilt ?? 0} ${NECK[0]} ${NECK[1]})">${parts.join('')}</g>`;
}

// The bust's shapes for the web's 3D model: body, head and ears (to be
// merged into one outline) and the eye whites (holes through it). Upright,
// in canonical coordinates, with the same hand wobble as the drawing.
export function silhouetteParts(): { solids: Pt[][]; eyes: Pt[][] } {
  const ears = [
    outline([[122, 228], ...EAR_EDGES[0]!.slice().reverse(), ...EAR_INNER[0]!]),
    outline([...EAR_INNER[1]!, ...EAR_EDGES[1]!, [278, 228]]),
  ];
  return {
    solids: [wobble(BODY, 11, 2.2), wobble(HEAD, 7, 1.8), ...ears.map((e, i) => wobble(e, 20 + i, 1.2))],
    eyes: EYES.map(([cx, cy], i) => wobble(ellipse(cx, cy, 24, 31, 48), 50 + i * 10, 0.7)),
  };
}

export function svg(inner: string, p: Palette): string {
  const bg = p.background ? `<rect width="${SIZE}" height="${SIZE}" fill="${p.background}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}">${bg}${inner}</svg>`;
}

// Head and shoulders in canonical coordinates, for scenes to place.
export function bustArt(expr: Expression, p: Palette, wear: Wear = {}): string {
  return shape(wobble(BODY, 11, 2.2), p.ink) + head(expr, p, wear);
}

// Head and shoulders, as on the device's portrait screens.
export function bust(expr: Expression, wear: Wear = {}, p: Palette = DEVICE_PALETTE): string {
  return svg(bustArt(expr, p, wear), p);
}

const POSE_FACES: Record<Pose, [Expression, Wear]> = {
  idle: [EXPRESSIONS.curious, {}],
  focused: [EXPRESSIONS.content, { headphones: true }],
};

export function compose(pose: Pose, skin: Skin, p: Palette = DEVICE_PALETTE): string {
  const [expr, wear] = POSE_FACES[pose];
  return bust(expr, { ...wear, skin }, p);
}
