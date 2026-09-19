// The body kit: full-body poses around the locked head. The head is drawn by
// rig.head() in its canonical coordinates and placed on the pose's neck at a
// smaller scale; strokes are thickened as it shrinks so the device still
// shows them. Bodies are in between Jiji-slender and chibi: a slim chest,
// long front legs, rounded haunches, a long tail. Separations between legs
// and haunches are white line art on the fur, like everything else on him.

import { curve, ellipse, outline, shape, stroke, toPath, withWeight, wobble, type Pt } from './ink.ts';
import { head, NECK, type Palette, type Wear } from './rig.ts';
import type { Expression } from './expressions.ts';

// Places the head so its neck lands on `neck` at `scale`, keeping lines legible.
export function placeHead(expr: Expression, p: Palette, neck: Pt, scale: number, wear: Wear = {}, opts: { back?: boolean } = {}): string {
  const [tx, ty] = [neck[0] - NECK[0] * scale, neck[1] - NECK[1] * scale];
  const inner = withWeight(scale ** -0.7, () => head(expr, p, wear, opts));
  return `<g transform="translate(${tx.toFixed(1)} ${ty.toFixed(1)}) scale(${scale})">${inner}</g>`;
}

const ink = (pts: Pt[], p: Palette, seed: number, amp = 1.6) => shape(wobble(outline(pts), seed, amp), p.ink);
const whiteLine = (pts: Pt[], p: Palette, seed: number, w = 4) =>
  shape(wobble(stroke(curve(pts), (t) => w * (0.5 + 0.5 * Math.sin(Math.PI * t))), seed, 0.4), p.paper);
// A tail: a tapering brush stroke with a rounded end.
export function tail(pts: Pt[], p: Palette, seed: number, root = 16, tip = 11): string {
  const end = pts[pts.length - 1]!;
  return shape(wobble(stroke(curve(pts), (t) => root + (tip - root) * t), seed, 0.8), p.ink)
    + shape(ellipse(end[0], end[1], tip / 2, tip / 2, 16), p.ink);
}

// Sitting, seen from the front: slim chest, two front legs straight down,
// haunches rounding out behind them, the tail curling up at his side.
const SIT_BODY: Pt[] = [
  [178, 168], [170, 200], [164, 232], [158, 262], [146, 286], [136, 312], [132, 342], [136, 368], [148, 386],
  [176, 391], [224, 391], [252, 386], [264, 368], [268, 342], [264, 312], [254, 286], [242, 262], [236, 232],
  [230, 200], [222, 168],
];
const SIT_NECK: Pt = [200, 180];
const SIT_SCALE = 0.54;

export type Pose = 'sit' | 'back' | 'wave' | 'loaf' | 'peek' | 'reach' | 'hold';

// Standing on his hind legs, both paws thrown up: yay.
const REACH_BODY: Pt[] = [
  [180, 168], [172, 200], [166, 236], [164, 272], [166, 304], [160, 336], [154, 366], [150, 390], [178, 392],
  [184, 360], [196, 330], [204, 330], [216, 360], [222, 392], [250, 390], [246, 366], [240, 336], [234, 304],
  [236, 272], [234, 236], [228, 200], [220, 168],
];

// A paw: a mitten of ink with two toe lines.
function paw(x: number, y: number, p: Palette, seed: number, angle = 0): string {
  const r = (angle * Math.PI) / 180;
  const toe = (dx: number): Pt[] => [[x + dx * Math.cos(r) - 4 * Math.sin(r), y - 4 * Math.cos(r) - dx * Math.sin(r)],
    [x + dx * Math.cos(r) + 5 * Math.sin(r), y + 5 * Math.cos(r) - dx * Math.sin(r)]];
  return shape(wobble(ellipse(x, y, 14, 12, 24), seed, 0.7), p.ink) + whiteLine(toe(-4), p, seed + 1, 2.8) + whiteLine(toe(5), p, seed + 2, 2.8);
}

// Holding something against his chest: `held` is drawn between the arms,
// over the body and under the paws, which grip its sides (x 170 and 230,
// y 266). Centre the held thing on x 200 and let it rise above the paws.
export function holding(expr: Expression, p: Palette, held: string, wear: Wear = {}): string {
  return [
    tail([[262, 380], [300, 378], [324, 356], [330, 322], [324, 290], [332, 264], [348, 256]], p, 5),
    ink(SIT_BODY, p, 3),
    whiteLine([[172, 334], [170, 360], [171, 387]], p, 11, 3.5),
    whiteLine([[228, 334], [230, 360], [229, 387]], p, 12, 3.5),
    whiteLine([[200, 352], [200, 389]], p, 13, 3),
    placeHead(expr, p, SIT_NECK, SIT_SCALE, wear),
    held ? `<g filter="url(#halo)">${held}</g>` : '',
    // Arms and paws are outlined in paper so they read against his chest.
    ...[[[176, 222], [170, 244], [172, 262]], [[224, 222], [230, 244], [228, 262]]].map((pts, i) => {
      const arm = stroke(curve(pts as Pt[]), () => 15);
      return `<path d="${toPath(wobble(arm, 31 + i, 0.6))}" fill="${p.ink}" stroke="${p.paper}" stroke-width="5" paint-order="stroke"/>`;
    }),
    ...[[170, 266, -30], [230, 266, 30]].map(([x, y, a], i) =>
      `<path d="${toPath(wobble(ellipse(x!, y!, 15, 12, 24), 33 + i, 0.6))}" fill="${p.ink}" stroke="${p.paper}" stroke-width="5" paint-order="stroke"/>`
      + paw(x!, y!, p, 36 + i * 3, a)),
  ].join('');
}

// frame varies a pose between animation frames (the waving paw's angle).
export function pose(kind: Pose, expr: Expression, p: Palette, wear: Wear = {}, frame = 0): string {
  switch (kind) {
    case 'sit':
      return [
        tail([[262, 380], [300, 378], [324, 356], [330, 322], [324, 290], [332, 264], [348, 256]], p, 5),
        ink(SIT_BODY, p, 3),
        // Front legs and the line where they meet the haunches.
        whiteLine([[172, 334], [170, 360], [171, 387]], p, 11, 3.5),
        whiteLine([[228, 334], [230, 360], [229, 387]], p, 12, 3.5),
        whiteLine([[200, 352], [200, 389]], p, 13, 3),
        whiteLine([[185, 378], [185, 389]], p, 14, 3), whiteLine([[215, 378], [215, 389]], p, 15, 3),
        placeHead(expr, p, SIT_NECK, SIT_SCALE, wear),
      ].join('');
    case 'back':
      // From behind: no face, the tail wrapped around the front of his paws.
      return [
        ink(SIT_BODY, p, 3),
        whiteLine([[200, 200], [202, 260], [200, 330]], p, 16, 3),
        placeHead(expr, p, SIT_NECK, SIT_SCALE, wear, { back: true }),
        tail([[150, 382], [190, 394], [236, 392], [266, 380], [282, 360]], p, 6, 15, 10),
      ].join('');
    case 'wave': {
      // Sitting with his near paw raised beside his face.
      const swing = frame % 2 === 0 ? 0 : 14;
      const arm = [[228, 238], [258, 222], [280 - swing * 0.6, 196], [290 - swing, 172 + swing * 0.2]] as Pt[];
      const [px, py] = [292 - swing, 162 + swing * 0.2];
      return [
        tail([[262, 380], [300, 378], [324, 356], [330, 322], [324, 290], [332, 264], [348, 256]], p, 5),
        ink(SIT_BODY, p, 3),
        whiteLine([[172, 334], [170, 360], [171, 387]], p, 11, 3.5),
        whiteLine([[200, 352], [200, 389]], p, 13, 3),
        whiteLine([[185, 378], [185, 389]], p, 14, 3),
        shape(wobble(stroke(curve(arm), (t) => 21 - 3 * t), 8, 0.8), p.ink),
        shape(wobble(ellipse(px, py, 14, 16, 24), 9, 0.8), p.ink),
        whiteLine([[px - 7, py - 8], [px - 6, py + 2]], p, 17, 3), whiteLine([[px + 2, py - 10], [px + 2, py]], p, 18, 3),
        placeHead(expr, p, SIT_NECK, SIT_SCALE, wear),
      ].join('');
    }
    case 'loaf':
      // Paws tucked under, a bread loaf of a cat, tail wrapped along the front.
      return [
        ink([[124, 380], [134, 336], [170, 306], [230, 294], [290, 300], [326, 326], [336, 362],
          [326, 388], [230, 394], [140, 392]], p, 4),
        tail([[326, 384], [292, 396], [236, 398], [190, 394]], p, 7, 14, 10),
        placeHead(expr, p, [176, 332], 0.62, wear),
      ].join('');
    case 'reach': {
      // Paws up: halfway on odd frames, all the way on even ones.
      const up = frame % 2 === 0 ? 1 : 0.55;
      const arm = (side: number): Pt[] => [[200 + side * 26, 206], [200 + side * (40 + 26 * up), 206 - 50 * up],
        [200 + side * (52 + 22 * up), 206 - 96 * up]];
      const armL = arm(-1);
      const armR = arm(1);
      return [
        tail([[236, 378], [274, 372], [300, 346], [306, 312], [300, 280], [310, 256], [326, 250]], p, 5),
        ink(REACH_BODY, p, 3),
        whiteLine([[200, 334], [200, 390]], p, 13, 3),
        shape(wobble(stroke(curve(armL), (t) => 17 - 3 * t), 41, 0.7), p.ink),
        shape(wobble(stroke(curve(armR), (t) => 17 - 3 * t), 42, 0.7), p.ink),
        placeHead(expr, p, SIT_NECK, SIT_SCALE, wear),
        paw(armL[2]![0], armL[2]![1] - 6, p, 43, -20), paw(armR[2]![0], armR[2]![1] - 6, p, 46, 20),
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
        whiteLine([[120, 330], [121, 344]], p, 24, 3), whiteLine([[134, 330], [134, 344]], p, 25, 3),
        whiteLine([[266, 330], [266, 344]], p, 26, 3), whiteLine([[280, 330], [279, 344]], p, 27, 3),
      ].join('');
  }
}
