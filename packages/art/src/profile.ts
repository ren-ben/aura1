// His head in profile, facing right: for the poses a lift is read from the
// side. The same parts as the front (rig.ts), turned: the bun skull with a
// small nose on its front and no muzzle, the near ear laid over it and the far
// one peeking behind, one tall eye near the front (the front eye,
// foreshortened), and three whiskers from the cheek. It sits on the
// same neck, so a pose places it exactly as it places the front head.

import { curve, ellipse, outline, shape, stroke, superellipse, wobble, type Pt } from './ink.ts';
import { eye, mouth, type Palette } from './face.ts';
import { marks } from './marks.ts';
import { NECK } from './rig.ts';
import type { Expression } from './expressions.ts';

// The skull: the front bun, a little shorter front to back, domed over the top.
const SKULL = superellipse(184, 226, 88, { b: 90, n: 2.2 }, { b: 64, n: 2.0 });
// The nose: only a small bump on the front of the bun, level with the eye's foot.
const NOSE = ellipse(270, 238, 8, 6, 24);
// The ears, tip to base. The near one rises from the crown and leans a touch
// forward; the far one stands a little behind it and lower, mostly hidden.
const NEAR_EAR: Pt[] = [[138, 196], [144, 140], [156, 88], [172, 36], [186, 48], [198, 96], [208, 146], [216, 192]];
const FAR_EAR: Pt[] = [[100, 206], [104, 152], [114, 102], [128, 58], [140, 72], [148, 120], [154, 186]];
const EYE: Pt = [240, 208];
// Three whiskers from the cheek, arcing forward and drooping.
const WHISKERS: Pt[][] = [
  [[262, 244], [302, 236], [330, 240], [346, 250]],
  [[262, 254], [306, 254], [334, 262], [346, 276]],
  [[256, 262], [294, 270], [318, 284], [328, 300]],
];

const brush = (line: Pt[], root: number, tip: number) => stroke(curve(line), (t) => root + (tip - root) * t);
const shorten = (line: Pt[], k: number): Pt[] =>
  line.map(([x, y]) => [line[0]![0] + (x - line[0]![0]) * k, line[0]![1] + (y - line[0]![1]) * k]);

// The near ear's opening: a white stroke just inside its front edge, thin at
// the tip, widest low down, as on the front.
function opening(): Pt[] {
  return stroke(curve([[176, 60], [184, 88], [190, 114], [194, 136]], 6), (t) => 2.5 + 8 * Math.sin(Math.PI * Math.pow(t, 0.8)));
}

export function profileHead(expr: Expression, p: Palette): string {
  const kind = Array.isArray(expr.eyes) ? expr.eyes[1] : expr.eyes;
  // The look runs along the face: forward is +x; a little up or down stays.
  // Always ahead, never back at you: the pupil sits at the front of the eye.
  const look: Pt = [Math.max(11, Math.abs(expr.look?.[0] ?? 11)), expr.look?.[1] ?? 0];
  const eyeParts = eye(kind, EYE, 1, look, expr.lid ?? 0.45, 60, p);
  const parts = [
    shape(wobble(outline(FAR_EAR), 24, 1.2), p.ink),
    ...WHISKERS.map((w, i) => shape(wobble(brush(shorten(w, 0.8), 5.2, 3), 34 + i, 0.4), p.ink)),
    shape(wobble(SKULL, 7, 1.8), p.ink),
    shape(wobble(NOSE, 8, 0.6), p.ink),
    shape(wobble(outline(NEAR_EAR), 21, 1.2), p.ink),
    shape(wobble(opening(), 41, 0.5), p.paper),
    // The eye, foreshortened: the front eye, narrowed about its centre.
    `<g transform="translate(${EYE[0]} ${EYE[1]}) scale(0.68 1) translate(${-EYE[0]} ${-EYE[1]})">${eyeParts.join('')}</g>`,
    ...(expr.mouth ? mouth(expr.mouth, 110, p).map((m) => `<g transform="translate(78 4)">${m}</g>`) : []),
    ...marks(expr.marks ?? [], 230, p),
  ];
  return `<g transform="rotate(${expr.tilt ?? 0} ${NECK[0]} ${NECK[1]})">${parts.join('')}</g>`;
}
