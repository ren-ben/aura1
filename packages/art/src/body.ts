// The body kit: full-body poses around the locked head. The head is drawn by
// rig.head() in its canonical coordinates and placed on the pose's neck at a
// smaller scale; strokes are thickened as it shrinks so the device still
// shows them. Bodies are short and plain, like the mouth: one soft ink
// silhouette with no leg lines, toes or joints, and the head is the star.
// The face always shows; there is no pose from behind.

import { curve, ellipse, outline, sampleCubics, shape, stroke, toPath, withWeight, wobble, type Pt } from './ink.ts';
import { head, NECK, type Palette, type Wear } from './rig.ts';
import type { Expression } from './expressions.ts';

// Places the head so its neck lands on `neck` at `scale`, keeping lines legible.
export function placeHead(expr: Expression, p: Palette, neck: Pt, scale: number, wear: Wear = {}): string {
  const [tx, ty] = [neck[0] - NECK[0] * scale, neck[1] - NECK[1] * scale];
  const inner = withWeight(scale ** -0.7, () => head(expr, p, wear));
  return `<g transform="translate(${tx.toFixed(1)} ${ty.toFixed(1)}) scale(${scale})">${inner}</g>`;
}

const ink = (pts: Pt[], p: Palette, seed: number, amp = 1.6) => shape(wobble(pts, seed, amp), p.ink);
// A tail: a tapering brush stroke with a rounded end.
export function tail(pts: Pt[], p: Palette, seed: number, root = 16, tip = 11): string {
  const end = pts[pts.length - 1]!;
  return shape(wobble(stroke(curve(pts), (t) => root + (tip - root) * t), seed, 0.8), p.ink)
    + shape(ellipse(end[0], end[1], tip / 2, tip / 2, 16), p.ink);
}
// A paw or arm outlined in paper, so it reads against his black chest.
const outlined = (pts: Pt[], p: Palette, seed: number) =>
  `<path d="${toPath(wobble(pts, seed, 0.6))}" fill="${p.ink}" stroke="${p.paper}" stroke-width="5" paint-order="stroke"/>`;

// Sitting, seen from the front: a short soft pear from the chin to the floor,
// haunches rounding out low down, a small dip where the front paws meet.
export const SIT_NECK: Pt = [200, 246];
export const SIT_SCALE = 0.66;
const SIT_BODY = sampleCubics([
  'M 174 238',
  'C 168 266, 160 290, 150 310',
  'C 130 336, 122 368, 134 384',
  'C 144 394, 172 393, 190 391',
  'C 195 387, 205 387, 210 391',
  'C 228 393, 256 394, 266 384',
  'C 278 368, 270 336, 250 310',
  'C 240 290, 232 266, 226 238',
  'C 210 232, 190 232, 174 238',
].join(' '), 10);
const SIT_TAIL: Pt[] = [[258, 386], [292, 386], [316, 370], [322, 342], [316, 318], [324, 300], [340, 296]];

// Standing on his hind legs: the same pear, split into two stubby legs.
const STAND_BODY = sampleCubics([
  'M 178 238',
  'C 170 266, 162 296, 164 324',
  'C 166 350, 160 372, 160 390',
  'C 170 394, 182 394, 190 390',
  'C 192 374, 196 364, 200 364',
  'C 204 364, 208 374, 210 390',
  'C 218 394, 230 394, 240 390',
  'C 240 372, 234 350, 236 324',
  'C 238 296, 230 266, 222 238',
  'C 208 232, 192 232, 178 238',
].join(' '), 10);

export type Pose = 'sit' | 'wave' | 'loaf' | 'peek' | 'reach' | 'hold';

const sitting = (p: Palette) => tail(SIT_TAIL, p, 5) + ink(SIT_BODY, p, 3);
const paw = (x: number, y: number, p: Palette, seed: number, rx = 13, ry = 11) => outlined(ellipse(x, y, rx, ry, 24), p, seed);

// Where a held thing sits: against his chest, between the paws.
export const HOLD: Pt = [200, 318];

// Holding something against his chest: `held` is drawn over the body and
// under the paws, which grip its sides. No arms: two paws say enough.
// Centre it on HOLD.
export function holding(expr: Expression, p: Palette, held: string, wear: Wear = {}): string {
  const [x, y] = HOLD;
  return [
    sitting(p),
    placeHead(expr, p, SIT_NECK, SIT_SCALE, wear),
    held ? `<g filter="url(#halo)">${held}</g>` : '',
    paw(x - 32, y + 2, p, 33),
    paw(x + 32, y + 2, p, 34),
  ].join('');
}

// frame varies a pose between animation frames (the waving paw's angle).
export function pose(kind: Pose, expr: Expression, p: Palette, wear: Wear = {}, frame = 0): string {
  switch (kind) {
    case 'sit':
      return sitting(p) + placeHead(expr, p, SIT_NECK, SIT_SCALE, wear);
    case 'wave': {
      // His near paw raised beside his cheek, swinging between frames.
      const swing = frame % 2 === 0 ? 0 : 12;
      const tip: Pt = [314 - swing, 208 + swing * 0.3];
      const arm = [[226, 282], [262, 270], [292 - swing * 0.5, 244], tip] as Pt[];
      return sitting(p)
        + shape(wobble(stroke(curve(arm), (t) => 20 - 4 * t), 8, 0.8), p.ink)
        + placeHead(expr, p, SIT_NECK, SIT_SCALE, wear)
        + paw(tip[0], tip[1] - 6, p, 9, 13, 15);
    }
    case 'loaf':
      // Paws tucked under, a bread loaf of a cat, tail wrapped along the front.
      return [
        ink(outline([[124, 380], [134, 336], [170, 306], [230, 294], [290, 300], [326, 326], [336, 362],
          [326, 388], [230, 394], [140, 392]]), p, 4),
        tail([[326, 384], [292, 396], [236, 398], [190, 394]], p, 7, 14, 10),
        placeHead(expr, p, [176, 332], 0.62, wear),
      ].join('');
    case 'reach': {
      // Paws up: halfway on odd frames, all the way on even ones.
      const up = frame % 2 === 0 ? 1 : 0.55;
      const arm = (side: number): Pt[] => [[200 + side * 20, 266], [200 + side * (46 + 30 * up), 262 - 50 * up],
        [200 + side * (70 + 26 * up), 262 - 100 * up]];
      const [armL, armR] = [arm(-1), arm(1)];
      return [
        tail([[232, 380], [270, 374], [294, 350], [298, 322], [292, 300], [302, 282], [318, 278]], p, 5),
        ink(STAND_BODY, p, 3),
        shape(wobble(stroke(curve(armL), (t) => 18 - 4 * t), 41, 0.7), p.ink),
        shape(wobble(stroke(curve(armR), (t) => 18 - 4 * t), 42, 0.7), p.ink),
        placeHead(expr, p, SIT_NECK, SIT_SCALE, wear),
        paw(armL[2]![0], armL[2]![1] - 4, p, 43), paw(armR[2]![0], armR[2]![1] - 4, p, 46),
      ].join('');
    }
    case 'hold':
      return holding(expr, p, '', wear);
    case 'peek':
      // Only the head and two paws above an edge along the bottom.
      return [
        placeHead(expr, p, [200, 372], 0.95, wear),
        `<rect x="0" y="340" width="400" height="60" fill="${p.paper}"/>`,
        shape(wobble(stroke([[-4, 342], [404, 342]], () => 6), 21, 0.8), p.ink),
        shape(wobble(ellipse(128, 336, 26, 17, 28), 22, 1), p.ink),
        shape(wobble(ellipse(272, 336, 26, 17, 28), 23, 1), p.ink),
      ].join('');
  }
}
