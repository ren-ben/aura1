// The body kit: full-body poses around the locked head. The head is drawn by
// rig.head() in its canonical coordinates and placed on the pose's neck at a
// smaller scale; strokes are thickened as it shrinks so the device still
// shows them. Bodies are short and plain, like the mouth: one soft ink
// silhouette with no leg lines, toes or joints, and the head is the star.
// The face always shows; there is no pose from behind.

import { curve, ellipse, outline, sampleCubics, shape, stroke, toPath, withWeight, wobble, type Pt } from './ink.ts';
import { fold, head, NECK, type Palette, type Wear } from './rig.ts';
import { hourglass, tricorn } from './props.ts';
import type { Expression } from './expressions.ts';

// Places the head so its neck lands on `neck` at `scale`, keeping lines
// legible; `weight` overrides the line weight for art baked very small.
export function placeHead(expr: Expression, p: Palette, neck: Pt, scale: number, wear: Wear = {}, weight = scale ** -0.7): string {
  const [tx, ty] = [neck[0] - NECK[0] * scale, neck[1] - NECK[1] * scale];
  const inner = withWeight(weight, () => head(expr, p, wear));
  // The hat tips with his head, as tricorn() is drawn upright between the ears.
  const hat = wear.hat ? `<g transform="rotate(${expr.tilt ?? 0} ${NECK[0]} ${NECK[1]})">${tricorn(p)}</g>` : '';
  return `<g transform="translate(${tx.toFixed(1)} ${ty.toFixed(1)}) scale(${scale})">${inner}${hat}</g>`;
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

// Sitting, two ways, both with a slim neck like Jiji's: most often turned a
// little (a straight chest down to the near front paw, the haunch rounding
// out toward the tail, one paper line between leg and haunch), sometimes
// square to us (a slim bell). The tail is drawn first, its root tucked inside
// the haunch, so it always grows out of him.
export const SIT_NECK: Pt = [200, 246];
export const SIT_SCALE = 0.66;
const TURNED_BODY = sampleCubics([
  'M 186 236',
  'C 182 270, 176 310, 174 350',
  'C 172 372, 170 386, 178 391',
  'C 190 395, 204 393, 208 387',
  'C 218 393, 256 395, 270 386',
  'C 284 372, 280 334, 256 314',
  'C 238 298, 230 268, 224 236',
  'C 212 231, 198 231, 186 236',
].join(' '), 10);
const TURNED_TAIL: Pt[] = [[246, 382], [288, 388], [314, 372], [322, 344], [316, 318], [324, 300], [340, 296]];
const TURNED_LEG: Pt[] = [[210, 389], [212, 362], [220, 336]];
const FRONT_BODY = sampleCubics([
  'M 178 236',
  'C 172 262, 162 300, 154 330',
  'C 146 360, 140 378, 148 388',
  'C 158 394, 176 392, 186 390',
  'C 192 394, 208 394, 214 390',
  'C 224 392, 242 394, 252 388',
  'C 260 378, 254 360, 246 330',
  'C 238 300, 228 262, 222 236',
  'C 210 232, 190 232, 178 236',
].join(' '), 10);
const FRONT_TAIL: Pt[] = [[226, 382], [262, 390], [298, 382], [318, 360], [320, 334], [314, 314], [322, 298], [338, 294]];

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

export type Pose = 'sit' | 'front' | 'wave' | 'loaf' | 'peek' | 'reach' | 'hold' | 'still' | 'keeper';

const paperLine = (pts: Pt[], p: Palette, seed: number) => shape(wobble(stroke(curve(pts), () => 4), seed, 0.4), p.paper);
const sitting = (p: Palette) => tail(TURNED_TAIL, p, 5) + ink(TURNED_BODY, p, 3) + paperLine(TURNED_LEG, p, 9);
const sittingFront = (p: Palette) => tail(FRONT_TAIL, p, 5) + ink(FRONT_BODY, p, 3);
const paw = (x: number, y: number, p: Palette, seed: number, rx = 13, ry = 11) => outlined(ellipse(x, y, rx, ry, 24), p, seed);

// Sitting still, for the Vigil: square to us, the tail grown out of the right
// haunch and wrapped round the front of his feet, lying on the floor. It is
// one ink shape with the body; a paper line along its top edge, only where it
// crosses in front of him, makes it read as lying over him, not cut off.
const STILL_TAIL: Pt[] = [[236, 360], [262, 368], [274, 380], [258, 390], [214, 392], [170, 391], [138, 384], [124, 370], [128, 354]];
function stillTail(p: Palette): string {
  const line = curve(STILL_TAIL, 10);
  const w = (t: number) => 18 - 8 * t;
  const n = line.length;
  const rim = line.map((pt, i) => [pt, i] as const)
    .filter(([[x, y], i]) => x < 250 && x > 146 && y > 382 && i > n * 0.3)
    .map(([[x, y], i]) => [x, y - w(i / (n - 1)) / 2 - 2] as Pt);
  return shape(wobble(stroke(line, w), 6, 0.8), p.ink) + shape(ellipse(128, 354, 5, 5, 16), p.ink)
    + (rim.length > 1 ? shape(wobble(stroke(rim, () => 4), 7, 0.3), p.paper) : '');
}

// Where a held thing sits: against his chest, between the paws.
export const HOLD: Pt = [200, 318];

// Holding something against his chest, square to us: `held` is drawn over the body and
// under the paws, which grip its sides. No arms: two paws say enough.
// Centre it on HOLD.
export function holding(expr: Expression, p: Palette, held: string, wear: Wear = {}): string {
  const [x, y] = HOLD;
  return [
    sittingFront(p),
    placeHead(expr, p, SIT_NECK, SIT_SCALE, wear),
    held ? `<g filter="url(#halo)">${held}</g>` : '',
    paw(x - 32, y + 2, p, 33),
    paw(x + 32, y + 2, p, 34),
  ].join('');
}

// Loafing in the Halloween sheet (inspiration/ghost2.png): the whole of him
// under it, a long heap of cloth with his head at the front, his tail up
// out of the back and his front paws peeking out under the hem.
function loafUnderSheet(expr: Expression, p: Palette, wear: Wear): string {
  const hem: Pt[] = [[348, 392], [322, 386], [298, 393], [270, 386], [244, 392], [214, 385], [186, 392], [158, 386], [126, 392], [104, 388]];
  const heap = outline([[100, 380], [112, 330], [150, 296], [220, 284], [290, 290], [336, 318], [352, 360], ...hem], 3);
  const cloth = `<path d="${toPath(wobble(heap, 61, 1.4))}" fill="${p.paper}" stroke="${p.ink}" stroke-width="7" stroke-linejoin="round"/>`;
  const folds = [[[258, 300], [270, 340], [262, 382]], [[300, 306], [318, 344], [314, 380]], [[224, 330], [230, 360], [226, 382]]]
    .map((f, i) => fold(curve(f as Pt[]), 4, 62 + i, p)).join('');
  return [
    tail([[318, 322], [344, 300], [354, 262], [342, 232], [352, 208], [368, 202]], p, 7),
    cloth, folds,
    paw(150, 392, p, 63, 15, 9), paw(190, 393, p, 64, 15, 9),
    placeHead(expr, p, [178, 322], 0.64, { ...wear, hem: 382 }),
  ].join('');
}

// frame varies a pose between animation frames (the waving paw's angle).
export function pose(kind: Pose, expr: Expression, p: Palette, wear: Wear = {}, frame = 0): string {
  switch (kind) {
    case 'sit':
      return sitting(p) + placeHead(expr, p, SIT_NECK, SIT_SCALE, wear);
    case 'front':
      return sittingFront(p) + placeHead(expr, p, SIT_NECK, SIT_SCALE, wear);
    case 'still':
      return ink(FRONT_BODY, p, 3) + stillTail(p) + placeHead(expr, p, SIT_NECK, SIT_SCALE, wear);
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
      // Lifted so the tail, the lowest of him, rests on the floor line.
      if (wear.skin === 'halloween') return loafUnderSheet(expr, p, wear);
      return `<g transform="translate(0 -12)">${[
        ink(outline([[124, 380], [134, 336], [170, 306], [230, 294], [290, 300], [326, 326], [336, 362],
          [326, 388], [230, 394], [140, 392]]), p, 4),
        tail([[326, 384], [292, 396], [236, 398], [190, 394]], p, 7, 14, 10),
        placeHead(expr, p, [176, 332], 0.62, wear),
      ].join('')}</g>`;
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
    case 'keeper':
      // Square to us, the hourglass of the day held to his chest.
      return holding(expr, p, hourglass(HOLD[0], HOLD[1] + 2, p, 75, 0.62), wear);
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
