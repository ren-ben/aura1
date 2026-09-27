// The Hunt's gym: every exercise as its own scene, him doing it, from the side
// where a lift reads from the side and from the front where it reads from the
// front. The equipment is drawn like everything else of his: ink with a paper
// rim where it crosses him, wobbled a little, dither for the iron's weight.
//
// A figure is built from joints: hip to shoulder for the torso, and each limb
// as three points (root, joint, end). Far limbs go behind the body, near limbs
// in front with a paper rim so they read across his black fur.

import { curve, ellipse, shape, stroke, toPath, wobble, type Pt } from './ink.ts';
import { placeHead, tail as drawTail } from './body.ts';
import { profileHead } from './profile.ts';
import { NECK, type Palette } from './rig.ts';
import type { Expression } from './expressions.ts';

const HEAD_SCALE = 0.66;
export const FLOOR = 392;

// ---- The body -------------------------------------------------------------------
export type Figure = {
  hip: Pt; shoulder: Pt;
  // The head sits on `neck`, turned by `turn` degrees; front: face to us.
  neck: Pt; turn?: number; front?: boolean;
  arms: { near: Pt[]; far: Pt[] };
  legs: { near: Pt[]; far: Pt[] };
  tail?: Pt[];
  // Things he holds, drawn between his far arm and near arm, or over all.
  held?: string; over?: string;
  watch?: boolean;
  // Front views with arms across the chest: no paper rim on the arms.
  plain?: boolean;
};

// A shape with a paper rim round the whole of it: the rim is laid first as a
// wide paper stroke, then the ink over it, so overlapping parts show no seams.
// Each part is its own path: overlapping parts in one path cancel each other
// out where they wind opposite ways, and leave holes.
const rimmed = (d: string | string[], p: Palette, w = 5) => {
  const ds = Array.isArray(d) ? d : [d];
  return ds.map((x) => `<path d="${x}" fill="${p.paper}" stroke="${p.paper}" stroke-width="${w * 2}" stroke-linejoin="round"/>`).join('')
    + ds.map((x) => `<path d="${x}" fill="${p.ink}"/>`).join('');
};
const inked = (ds: string[], p: Palette) => ds.map((x) => `<path d="${x}" fill="${p.ink}"/>`).join('');
// Iron against his fur: paper with an ink edge, or it vanishes into him.
export const light = (d: string, p: Palette, w = 4) =>
  `<path d="${d}" fill="${p.paper}" stroke="${p.ink}" stroke-width="${w}" stroke-linejoin="round"/>`;
// A limb: a tapered brush along its three points, rounded at both ends.
function limb(pts: Pt[], p: Palette, seed: number, near: boolean, w0 = 22, w1 = 16): string {
  const line = curve(pts, 6);
  const body = toPath(wobble(stroke(line, (t) => w0 + (w1 - w0) * t), seed, 0.6));
  const ends = [line[0]!, line.at(-1)!].map(([x, y], i) => toPath(ellipse(x, y, (i ? w1 : w0) / 2, (i ? w1 : w0) / 2, 16)));
  const d = [body, ...ends];
  return near ? rimmed(d, p, 3) : inked(d, p);
}
const paw = (at: Pt, p: Palette, seed: number, rx = 11, ry = 9) => rimmed(toPath(wobble(ellipse(at[0], at[1], rx, ry, 20), seed, 0.5)), p, 2.5);
// A foot seen from the side: longer than tall, toes forward.
const foot = (at: Pt, p: Palette, seed: number, dir = 1) =>
  rimmed(toPath(wobble(ellipse(at[0] + dir * 8, at[1], 18, 9, 20), seed, 0.5)), p, 2.5);
function torso(hip: Pt, shoulder: Pt, p: Palette): string {
  const mid: Pt = [(hip[0] + shoulder[0]) / 2 + (hip[0] < shoulder[0] ? -4 : 4), (hip[1] + shoulder[1]) / 2];
  const line = curve([hip, mid, shoulder], 8);
  const d = toPath(wobble(stroke(line, (t) => 66 - 22 * t), 3, 1.2));
  return inked([d, toPath(ellipse(hip[0], hip[1], 33, 30, 24)), toPath(ellipse(shoulder[0], shoulder[1], 22, 22, 20))], p);
}
function head(f: Figure, expr: Expression, p: Palette): string {
  const k = HEAD_SCALE;
  const [nx, ny] = f.neck;
  const inner = f.front ? '' : profileHead({ ...expr, tilt: 0 }, p);
  if (f.front) return `<g transform="rotate(${f.turn ?? 0} ${nx} ${ny})">${placeHead({ ...expr, tilt: expr.tilt ?? 0 }, p, f.neck, k)}</g>`;
  return `<g transform="rotate(${f.turn ?? 0} ${nx} ${ny}) translate(${nx - NECK[0] * k} ${ny - NECK[1] * k}) scale(${k})">${inner}</g>`;
}
// A sports watch on the near wrist: a band across the forearm, a face on it.
function watch(arm: Pt[], p: Palette): string {
  const [e, w] = [arm[1]!, arm[2]!];
  const at: Pt = [e[0] + (w[0] - e[0]) * 0.6, e[1] + (w[1] - e[1]) * 0.6];
  const a = (Math.atan2(w[1] - e[1], w[0] - e[0]) * 180) / Math.PI;
  return `<g transform="translate(${at[0]} ${at[1]}) rotate(${a})"><rect x="-7" y="-14" width="14" height="28" rx="3" fill="${p.paper}" stroke="${p.ink}" stroke-width="3"/><rect x="-4" y="-8" width="8" height="16" rx="2" fill="${p.ink}"/><rect x="-2" y="-5" width="4" height="10" fill="${p.paper}"/></g>`;
}

export function figure(f: Figure, expr: Expression, p: Palette): string {
  const { arms, legs } = f;
  return [
    f.tail ? drawTail(f.tail, p, 5, 14, 10) : '',
    limb(legs.far, p, 61, false, 24, 18), foot(legs.far.at(-1)!, p, 62),
    limb(arms.far, p, 63, false), paw(arms.far.at(-1)!, p, 64),
    torso(f.hip, f.shoulder, p),
    f.held ?? '',
    limb(legs.near, p, 65, true, 24, 18), foot(legs.near.at(-1)!, p, 66),
    head(f, expr, p),
    limb(arms.near, p, 67, !f.plain), paw(arms.near.at(-1)!, p, 68),
    f.watch ? watch(arms.near, p) : '',
    f.over ?? '',
  ].join('');
}

// ---- The iron ---------------------------------------------------------------------
const line = (pts: Pt[], p: Palette, w: number, seed: number) => shape(wobble(stroke(curve(pts, 4), () => w), seed, 0.4), p.ink);
export const floor = (p: Palette) => line([[-6, FLOOR + 2], [406, FLOOR + 2]], p, 6, 261);
const box = (x: number, y: number, w: number, h: number, r = 4) =>
  `M${x + r} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${y + h - r}Q${x + w} ${y + h} ${x + w - r} ${y + h}H${x + r}Q${x} ${y + h} ${x} ${y + h - r}V${y + r}Q${x} ${y} ${x + r} ${y}Z`;
export const solid = (x: number, y: number, w: number, h: number, p: Palette, r = 4) => rimmed(box(x, y, w, h, r), p, 4);
// A tube from a to b, w thick: frames, posts, bars.
export function tube(a: Pt, b: Pt, w: number, p: Palette, rim = true): string {
  const d = [toPath(stroke([a, b], () => w)), toPath(ellipse(a[0], a[1], w / 2, w / 2, 12)), toPath(ellipse(b[0], b[1], w / 2, w / 2, 12))];
  return rim ? rimmed(d, p, 4) : inked(d, p);
}
// A plate seen face on (the side view of a barbell): a disc, its rim, its hub.
export function plate(c: Pt, r: number, p: Palette): string {
  const [x, y] = c;
  return rimmed(toPath(ellipse(x, y, r, r, 48)), p, 4)
    + `<circle cx="${x}" cy="${y}" r="${r * 0.78}" fill="none" stroke="${p.paper}" stroke-width="2.5"/>`
    + `<circle cx="${x}" cy="${y}" r="${r * 0.2}" fill="${p.paper}"/><circle cx="${x}" cy="${y}" r="${r * 0.1}" fill="${p.ink}"/>`;
}
// A plate seen edge on (front views): a tall slab.
export const slab = (x: number, y: number, h: number, p: Palette, w = 14) => solid(x - w / 2, y - h / 2, w, h, p, 3);
// A barbell seen from the front: the bar, a collar and plates at each end.
export function barbellFront(x0: number, x1: number, y: number, p: Palette, plates = [70, 56]): string {
  const bar = tube([x0, y], [x1, y], 8, p);
  const side = (x: number, dir: number) => plates.map((h, i) => slab(x + dir * (i * 16), y, h, p)).join('') + solid(x - dir * 14 - 4, y - 8, 8, 16, p, 2);
  return bar + side(x0 + 22, 1) + side(x1 - 22, -1);
}
// A weight stack in its frame: the plates in dither, the pin, a pulley on top.
export function tower(x: number, w: number, top: number, p: Palette, pulleys: number[] = []): string {
  const posts = tube([x, top], [x, FLOOR], 12, p) + tube([x + w, top], [x + w, FLOOR], 12, p) + tube([x, top], [x + w, top], 12, p);
  const stack = Array.from({ length: 9 }, (_, i) => `<rect x="${x + 10}" y="${FLOOR - 16 - i * 13}" width="${w - 20}" height="11" fill="url(#d50)" stroke="${p.ink}" stroke-width="2"/>`).join('');
  const rods = [x + w * 0.35, x + w * 0.65].map((rx) => `<rect x="${rx - 1.5}" y="${top + 8}" width="3" height="${FLOOR - top - 130}" fill="${p.ink}"/>`).join('');
  return posts + rods + stack + pulleys.map((py) => pulley([x + w / 2, py], p)).join('');
}
export function pulley(c: Pt, p: Palette, r = 11): string {
  return `<circle cx="${c[0]}" cy="${c[1]}" r="${r}" fill="${p.ink}" stroke="${p.paper}" stroke-width="3"/><circle cx="${c[0]}" cy="${c[1]}" r="${r * 0.35}" fill="${p.paper}"/>`;
}
export const cable = (a: Pt, b: Pt, p: Palette) => `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${p.ink}" stroke-width="3.5" stroke-linecap="round"/>`;
// Handles: a D for one hand, a straight bar, a V for rows.
export const vHandle = (c: Pt, p: Palette) => light(box(c[0] - 18, c[1] - 7, 36, 14, 6), p);
export const dHandle = (c: Pt, p: Palette) => `<path d="M${c[0] - 10} ${c[1] - 10}Q${c[0]} ${c[1] + 16} ${c[0] + 10} ${c[1] - 10}" fill="none" stroke="${p.paper}" stroke-width="10" stroke-linecap="round"/><path d="M${c[0] - 10} ${c[1] - 10}Q${c[0]} ${c[1] + 16} ${c[0] + 10} ${c[1] - 10}" fill="none" stroke="${p.ink}" stroke-width="5" stroke-linecap="round"/>`;
// A padded bench top between two points, and its frame to the floor.
export function bench(a: Pt, b: Pt, p: Palette, legs: Pt[][] = []): string {
  return legs.map(([u, v]) => tube(u!, v!, 12, p)).join('') + tube(a, b, 26, p);
}
