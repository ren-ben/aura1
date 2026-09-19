// Marks around the head: the manga shorthand that carries a mood (?, !,
// sweat, the anger vein, notes, zzz, sparkles, hearts). Ink on the paper
// around him, placed by the scene; the defaults suit the bust framing.

import { curve, ellipse, outline, shape, stroke, wobble, type Pt } from './ink.ts';
import type { Palette } from './face.ts';

export type MarkKind = 'question' | 'exclaim' | 'sweat' | 'anger' | 'notes' | 'zzz' | 'sparkles' | 'hearts';
export type Mark = MarkKind | { kind: MarkKind; at: Pt; scale?: number };

const DEFAULT_AT: Record<MarkKind, Pt> = {
  question: [74, 96], exclaim: [330, 92], sweat: [318, 150], anger: [324, 84],
  notes: [66, 120], zzz: [314, 90], sparkles: [200, 70], hearts: [326, 104],
};

const pen = (pts: Pt[], w: number, seed: number) => wobble(stroke(curve(pts), (t) => w * (1 - 0.3 * t)), seed, 0.3);

function draw(kind: MarkKind, [x, y]: Pt, k: number, seed: number, p: Palette): string[] {
  const at = (dx: number, dy: number): Pt => [x + dx * k, y + dy * k];
  const ink = (pts: Pt[]) => shape(pts, p.ink);
  switch (kind) {
    case 'question':
      return [ink(pen([at(-12, -14), at(-6, -26), at(8, -28), at(14, -16), at(6, -4), at(0, 4), at(0, 14)], 7 * k, seed)),
        ink(ellipse(...at(0, 28), 5 * k, 5 * k, 16))];
    case 'exclaim':
      return [ink(pen([at(0, -28), at(-1, 12)], 8 * k, seed)), ink(ellipse(...at(-1, 28), 5 * k, 5 * k, 16))];
    case 'sweat': {
      const drop = outline([at(0, -16), at(9, 2), at(0, 12), at(-9, 2)]);
      return [ink(wobble(outline([at(0, -21), at(13, 3), at(0, 17), at(-13, 3)]), seed, 0.5)), shape(drop, p.paper)];
    }
    case 'anger':
      // The popping vein: four bent strokes around a point.
      return [0, 90, 180, 270].map((deg, i) => {
        const r = (deg * Math.PI) / 180;
        const rot = ([u, v]: Pt): Pt => at(u * Math.cos(r) - v * Math.sin(r), u * Math.sin(r) + v * Math.cos(r));
        return ink(pen([rot([5, -16]), rot([6, -6]), rot([16, -5])], 5.5 * k, seed + i));
      });
    case 'notes': {
      const note = (dx: number, dy: number, s: number, n: number) => [
        ink(wobble(ellipse(...at(dx, dy), 8 * s, 6 * s, 16), seed + n, 0.3)),
        ink(pen([at(dx + 7 * s, dy - 1), at(dx + 7 * s, dy - 30 * s)], 4 * s, seed + n + 1)),
        ink(pen([at(dx + 7 * s, dy - 30 * s), at(dx + 16 * s, dy - 24 * s), at(dx + 18 * s, dy - 14 * s)], 4 * s, seed + n + 2)),
      ];
      return [...note(0, 0, k, 0), ...note(26, -26, k * 0.75, 3)];
    }
    case 'zzz': {
      const z = (dx: number, dy: number, s: number, n: number) =>
        ink(pen([at(dx - s, dy - s), at(dx + s, dy - s), at(dx - s, dy + s), at(dx + s, dy + s)], 4.5 * k, seed + n));
      return [z(0, 0, 11, 0), z(24, -26, 8, 1), z(42, -46, 6, 2)];
    }
    case 'sparkles': {
      const star = (dx: number, dy: number, r: number) => ink(outline(
        Array.from({ length: 8 }, (_, i) => {
          const a = (i / 8) * Math.PI * 2;
          const rr = (i % 2 ? r * 0.22 : r) * k;
          return [x + dx * k + rr * Math.cos(a), y + dy * k + rr * Math.sin(a)] as Pt;
        }), 2));
      return [star(-128, 10, 20), star(124, 70, 15), star(112, -20, 11)];
    }
    case 'hearts': {
      const heart = (dx: number, dy: number, s: number, n: number) => ink(pen([
        at(dx, dy + 12 * s), at(dx - 12 * s, dy), at(dx - 11 * s, dy - 9 * s), at(dx - 4 * s, dy - 11 * s),
        at(dx, dy - 5 * s), at(dx + 4 * s, dy - 11 * s), at(dx + 11 * s, dy - 9 * s), at(dx + 12 * s, dy), at(dx, dy + 12 * s),
      ], 4.5 * k, seed + n));
      return [heart(0, 0, 1, 0), heart(22, -30, 0.65, 1)];
    }
  }
}

export function marks(list: Mark[], seed: number, p: Palette): string[] {
  return list.flatMap((m, i) => {
    const { kind, at, scale } = typeof m === 'string' ? { kind: m, at: DEFAULT_AT[m], scale: 1 } : m;
    return draw(kind, at, scale ?? 1, seed + i * 10, p);
  });
}
