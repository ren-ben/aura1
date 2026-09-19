// The face kit: eyes, mouth and blush, drawn on the head's canonical
// coordinates (see rig.ts). Expression lives in the eye shapes; he has no
// brows. The mouth only appears when it matters, low on the face, and when it
// opens it opens wide with two fangs (inspiration/catmouthopen.png).
// expressions.ts names the combinations.

import { curve, ellipse, outline, shape, stroke, wobble, type Pt } from './ink.ts';

export type Palette = { ink: string; paper: string; background?: string };

export type EyeKind =
  | 'open' | 'wide' | 'sparkle' | 'huge' | 'smile' | 'happy' | 'content' | 'sleep'
  | 'flat' | 'glare' | 'droop' | 'dizzy';
export type Mouth = 'o' | 'open' | 'yawn';

export const EYES: Pt[] = [[154, 208], [246, 208]];
const RX = 24;
const RY = 31;

// A pen stroke: widest in the middle, tapered at both ends.
const swell = (min: number, max: number) => (t: number) => min + (max - min) * Math.sin(Math.PI * t);
const line = (pts: Pt[], width: (t: number) => number, seed: number, amp = 0.4) =>
  wobble(stroke(curve(pts), width), seed, amp);

// side: -1 for the eye on the left of the picture, +1 for the other.
// look moves the pupils; lid is how far a lid comes down (0..1).
export function eye(kind: EyeKind, [cx, cy]: Pt, side: number, look: Pt, lid: number, seed: number, p: Palette): string[] {
  const white = (grow = 0) => shape(wobble(ellipse(cx, cy, RX + grow, RY + grow, 48), seed, 0.7), p.paper);
  const pupil = (rx: number, ry: number, at: Pt = look) =>
    shape(wobble(ellipse(cx + at[0], cy + at[1], rx, ry, 32), seed + 1, 0.3), p.ink);
  const glint = (dx: number, dy: number, r: number, at: Pt = look) =>
    shape(ellipse(cx + at[0] + dx, cy + at[1] + dy, r, r * 1.1, 16), p.paper);
  const arc = (pts: Pt[]) => [shape(line(pts, swell(3, 8), seed), p.paper)];
  // Ink over part of the eye, bounded by a lid edge from the outer to the
  // inner corner: outerY and innerY are the edge's heights at each corner.
  const lidCut = (outerY: number, innerY: number, from: 'top' | 'bottom') => {
    const inner = -side;
    const edge = curve([[cx - inner * (RX + 6), outerY], [cx, (outerY + innerY) / 2 - 1], [cx + inner * (RX + 6), innerY]]);
    const far = from === 'top' ? cy - RY - 8 : cy + RY + 8;
    return shape(wobble([[cx + inner * (RX + 6), far], [cx - inner * (RX + 6), far], ...edge], seed + 2, 0.5), p.ink);
  };
  const lidY = cy - RY + 2 * RY * lid;

  switch (kind) {
    case 'open':
      return [white(), pupil(10, 16)];
    case 'wide':
      // Startled: a bigger white and a pinprick pupil.
      return [white(3), pupil(6, 9, [look[0] * 0.5, look[1] * 0.5])];
    case 'sparkle':
      return [white(), pupil(13, 19), glint(-4, -7, 4.5), glint(5, 6, 2.5)];
    case 'huge': {
      // So happy he nearly cries: pupils dilated to fill the eye, wet glints,
      // a tear gathering at the outer corner.
      const [tx, ty] = [cx + side * 20, cy + RY - 2];
      return [white(2), pupil(18, 25), glint(-6, -9, 6), glint(6, 8, 3), glint(-8, 9, 2),
        shape(wobble(outline([[tx, ty - 8], [tx + 5, ty + 3], [tx, ty + 9], [tx - 5, ty + 3]]), seed + 3, 0.3), p.paper)];
    }
    case 'smile':
      // Round on top, the bottom flattened as if the cheeks push up.
      return [white(), pupil(11, 16, [look[0], look[1] - 2]), lidCut(cy + RY * 0.78, cy + RY * 0.78, 'bottom')];
    case 'happy':
      // Closed, bowed upward: ^ ^
      return arc([[cx - 20, cy + 8], [cx - 8, cy - 6], [cx + 8, cy - 6], [cx + 20, cy + 8]]);
    case 'content':
      return arc([[cx - 24, cy + 2], [cx - 9, cy - 2], [cx + 9, cy - 2], [cx + 24, cy + 2]]);
    case 'sleep':
      // Closed, bowed downward, the lash line of a sleeper.
      return arc([[cx - 20, cy - 2], [cx - 8, cy + 8], [cx + 8, cy + 8], [cx + 20, cy - 2]]);
    case 'flat':
      // Annoyed or heavy: a straight lid, the pupil hanging from it.
      return [white(), pupil(9, 13, [look[0], Math.max(look[1], lidY - cy + 11)]), lidCut(lidY, lidY, 'top')];
    case 'glare':
      // The lid slants down toward the nose.
      return [white(), pupil(8, 13), lidCut(lidY - RY * lid * 0.6, lidY + RY * lid * 0.5, 'top')];
    case 'droop':
      // The lid slants down toward the outer corner: forlorn.
      return [white(), pupil(10, 15), lidCut(lidY + RY * lid * 0.5, lidY - RY * lid * 0.6, 'top')];
    case 'dizzy': {
      const spiral: Pt[] = Array.from({ length: 30 }, (_, i) => {
        const t = i / 29;
        const a = t * Math.PI * 5 * (side < 0 ? 1 : -1);
        const r = 2 + 17 * t;
        return [cx + r * Math.cos(a), cy + r * Math.sin(a) * 1.2] as Pt;
      });
      return [white(), shape(wobble(stroke(curve(spiral, 3), () => 3.5), seed + 2, 0.2), p.ink)];
    }
  }
}

// Low on the face, below the nose. Open mouths are drawn as a white outline
// around the dark inside, with two fangs from the top edge and a tongue line.
export function mouth(kind: Mouth, seed: number, p: Palette): string[] {
  if (kind === 'o') return [shape(wobble(ellipse(200, 258, 5, 6, 16), seed, 0.3), p.paper)];
  const [w, top, bottom] = kind === 'open' ? [24, 250, 282] : [17, 250, 290];
  const rim = outline([[200 - w, top], [200, top - 2], [200 + w, top], [200 + w * 0.7, bottom - 8], [200, bottom], [200 - w * 0.7, bottom - 8]]);
  const inside = outline([[200 - w + 5, top + 3], [200, top + 1], [200 + w - 5, top + 3], [200 + w * 0.6, bottom - 11], [200, bottom - 4], [200 - w * 0.6, bottom - 11]]);
  const fang = (x: number) => shape(outline([[x - 3.5, top + 2], [x + 3.5, top + 2], [x, top + 11]], 2), p.paper);
  const tongue = line([[200 - w * 0.45, bottom - 9], [200, bottom - 15], [200 + w * 0.45, bottom - 9]], swell(2, 3.5), seed + 1, 0.2);
  return [shape(wobble(rim, seed, 0.6), p.paper), shape(wobble(inside, seed + 2, 0.4), p.ink),
    fang(200 - w + 9), fang(200 + w - 9), shape(tongue, p.paper)];
}

// Three short slanted strokes on each cheek, as in the Jiji references.
export function blush(seed: number, p: Palette): string[] {
  return [138, 262].flatMap((x, side) => [-9, 0, 9].map((dx, i) =>
    shape(line([[x + dx - 3, 252], [x + dx + 3, 242]], () => 3.2, seed + side * 3 + i, 0.2), p.paper)));
}
