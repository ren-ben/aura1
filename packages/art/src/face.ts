// The face kit: eyes, brows, mouth and blush, drawn on the head's canonical
// coordinates (see rig.ts). Paper marks sit on the ink fur. An expression is
// just a choice from each drawer; expressions.ts names the combinations.

import { curve, ellipse, outline, shape, stroke, wobble, type Pt } from './ink.ts';

export type Palette = { ink: string; paper: string; background?: string };

export type EyeKind =
  | 'open' | 'wide' | 'sparkle' | 'teary' | 'happy' | 'content' | 'sleep'
  | 'half' | 'glare' | 'crescent' | 'dizzy';
export type Brows = 'angry' | 'worried' | 'raised' | 'flat';
export type Mouth = 'cat' | 'open' | 'yawn' | 'grin' | 'pout';

export const EYES: Pt[] = [[154, 208], [246, 208]];
const RX = 24;
const RY = 31;

// A pen stroke: widest in the middle, tapered at both ends.
const swell = (min: number, max: number) => (t: number) => min + (max - min) * Math.sin(Math.PI * t);
const line = (pts: Pt[], width: (t: number) => number, seed: number, amp = 0.4) =>
  wobble(stroke(curve(pts), width), seed, amp);

// side: -1 for his right eye (on the left of the picture), +1 for the other.
// look moves the pupils; lid is how far a lid comes down (0..1).
export function eye(kind: EyeKind, [cx, cy]: Pt, side: number, look: Pt, lid: number, seed: number, p: Palette): string[] {
  const white = shape(wobble(ellipse(cx, cy, RX, RY, 48), seed, 0.7), p.paper);
  const pupil = (rx: number, ry: number, at: Pt = look) =>
    shape(wobble(ellipse(cx + at[0], cy + at[1], rx, ry, 32), seed + 1, 0.3), p.ink);
  const arc = (pts: Pt[]) => [shape(line(pts, swell(3, 8), seed), p.paper)];

  switch (kind) {
    case 'open':
      return [white, pupil(10, 16)];
    case 'wide':
      // Startled: a bigger white and a pinprick pupil.
      return [shape(wobble(ellipse(cx, cy, RX + 3, RY + 3, 48), seed, 0.7), p.paper),
        pupil(6, 9, [look[0] * 0.5, look[1] * 0.5])];
    case 'sparkle':
    case 'teary': {
      // Big glossy pupils with two highlights; teary adds a drop at the corner.
      const [px, py] = [cx + look[0], cy + look[1]];
      const parts = [white, pupil(13, 19),
        shape(ellipse(px - 4, py - 7, 4.5, 5, 16), p.paper),
        shape(ellipse(px + 5, py + 6, 2.5, 2.5, 12), p.paper)];
      if (kind === 'teary') {
        const [tx, ty] = [cx + side * 17, cy + RY + 6];
        parts.push(shape(wobble(outline([[tx, ty - 9], [tx + 5, ty + 2], [tx, ty + 8], [tx - 5, ty + 2]]), seed + 3, 0.3), p.paper));
      }
      return parts;
    }
    case 'happy':
      // Closed, bowed upward: ^ ^
      return arc([[cx - 20, cy + 8], [cx - 8, cy - 6], [cx + 8, cy - 6], [cx + 20, cy + 8]]);
    case 'content':
      return arc([[cx - 24, cy + 2], [cx - 9, cy - 2], [cx + 9, cy - 2], [cx + 24, cy + 2]]);
    case 'sleep':
      // Closed, bowed downward, the lash line of a sleeper.
      return arc([[cx - 20, cy - 2], [cx - 8, cy + 8], [cx + 8, cy + 8], [cx + 20, cy - 2]]);
    case 'half': {
      // A lid across the top, sagging a little toward the outer corner.
      const edge = cy - RY + 2 * RY * lid;
      const lidShape: Pt[] = [[cx - RX - 6, cy - RY - 6], [cx + RX + 6, cy - RY - 6],
        [cx + RX + 6, edge + (side > 0 ? 4 : -2)], [cx, edge], [cx - RX - 6, edge + (side < 0 ? 4 : -2)]];
      return [white, pupil(10, 15), shape(wobble(lidShape, seed + 2, 0.5), p.ink)];
    }
    case 'glare': {
      // The lid slants down toward the nose.
      const inner = side < 0 ? 1 : -1;
      const hi = cy - RY + 2 * RY * lid * 0.4;
      const lo = cy - RY + 2 * RY * lid * 1.2;
      const lidShape: Pt[] = [[cx - RX - 6, cy - RY - 6], [cx + RX + 6, cy - RY - 6],
        [cx + RX + 6, inner > 0 ? lo : hi], [cx - RX - 6, inner > 0 ? hi : lo]];
      return [white, pupil(8, 13), shape(wobble(lidShape, seed + 2, 0.5), p.ink)];
    }
    case 'crescent': {
      // Sly moons: an ink eye shifted over the white leaves a crescent.
      const shift = shape(wobble(ellipse(cx + look[0], cy + look[1] - 14, RX + 2, RY, 48), seed + 2, 0.5), p.ink);
      return [white, shift];
    }
    case 'dizzy': {
      const spiral: Pt[] = Array.from({ length: 30 }, (_, i) => {
        const t = i / 29;
        const a = t * Math.PI * 5 * (side < 0 ? 1 : -1);
        const r = 2 + 17 * t;
        return [cx + r * Math.cos(a), cy + r * Math.sin(a) * 1.2] as Pt;
      });
      return [white, shape(wobble(stroke(curve(spiral, 3), () => 3.5), seed + 2, 0.2), p.ink)];
    }
  }
}

// Brows are short paper strokes above the eyes.
export function brows(kind: Brows, seed: number, p: Palette): string[] {
  return EYES.flatMap(([cx, cy], i) => {
    const side = i === 0 ? -1 : 1;
    const inner = -side;  // toward the nose
    const y = cy - 44;
    const pts: Pt[] | null = {
      angry: [[cx - inner * 18, y - 6], [cx + inner * 16, y + 6]] as Pt[],
      worried: [[cx - inner * 18, y + 6], [cx + inner * 16, y - 6]] as Pt[],
      flat: [[cx - inner * 16, y - 2], [cx + inner * 16, y + 2]] as Pt[],
      raised: side > 0 ? [[cx - 16, y + 2], [cx, y - 8], [cx + 16, y - 2]] as Pt[] : null,
    }[kind];
    return pts ? [shape(line(pts, swell(3, 6.5), seed + i), p.paper)] : [];
  });
}

export function mouth(kind: Mouth, seed: number, p: Palette): string[] {
  switch (kind) {
    case 'cat':
      return [shape(line([[190, 238], [195, 244], [200, 240], [205, 244], [210, 238]], () => 3.2, seed, 0.2), p.paper)];
    case 'open':
      return [shape(wobble(ellipse(200, 245, 6, 8, 20), seed, 0.4), p.paper)];
    case 'yawn':
      return [shape(wobble(ellipse(200, 252, 11, 15, 24), seed, 0.6), p.paper)];
    case 'grin': {
      const fang = (x: number) => shape(outline([[x - 3, 243], [x + 3, 243], [x, 252]]), p.paper);
      return [shape(line([[182, 236], [191, 245], [200, 239], [209, 245], [218, 236]], () => 3.5, seed, 0.2), p.paper),
        fang(190), fang(210)];
    }
    case 'pout':
      return [shape(line([[193, 246], [200, 240], [207, 246]], () => 3.2, seed, 0.2), p.paper)];
  }
}

// Three short slanted strokes on each cheek, as in the Jiji references.
export function blush(seed: number, p: Palette): string[] {
  return [138, 262].flatMap((x, side) => [-9, 0, 9].map((dx, i) =>
    shape(line([[x + dx - 3, 252], [x + dx + 3, 242]], () => 3.2, seed + side * 3 + i, 0.2), p.paper)));
}
