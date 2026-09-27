// The named faces from CHARACTER.md. Each is a pick from the face kit plus
// the head's tilt, the ears and the marks around him. Expression comes from
// the eyes; the mouth only when it opens.

import type { EyeKind, Mouth } from './face.ts';
import type { Pt } from './ink.ts';
import type { Mark } from './marks.ts';

export type Ears = 'up' | 'back' | 'perk';

export type Expression = {
  eyes: EyeKind | [EyeKind, EyeKind];
  look?: Pt;
  lid?: number;
  mouth?: Mouth;
  blush?: boolean;
  ears?: Ears;
  tilt?: number;
  marks?: Mark[];
};

export const EXPRESSIONS = {
  curious: { eyes: 'open', look: [5, -7], tilt: -5 },
  content: { eyes: 'content', tilt: 4 },
  happy: { eyes: 'smile', look: [2, 2], tilt: 5 },
  delighted: { eyes: 'open', look: [3, -8], mouth: 'open', ears: 'perk', tilt: -4 },
  overjoyed: { eyes: 'huge', look: [0, -2], blush: true, tilt: 6 },
  proud: { eyes: 'happy', ears: 'perk', tilt: -3, marks: ['sparkles'] },
  flustered: { eyes: 'sparkle', look: [-7, 6], blush: true, tilt: -7 },
  hmph: { eyes: 'glare', look: [-7, 2], lid: 0.55, ears: 'back', tilt: -8, marks: ['anger'] },
  furious: { eyes: 'fury', look: [0, 0], ears: 'back', tilt: 0, marks: ['anger'] },
  annoyed: { eyes: 'flat', look: [0, 0], lid: 0.5, tilt: 2 },
  questioning: { eyes: ['open', 'glare'], look: [4, 1], lid: 0.38, tilt: 6, marks: ['question'] },
  surprised: { eyes: 'wide', mouth: 'o', ears: 'perk', tilt: 0, marks: ['exclaim'] },
  scared: { eyes: 'wide', look: [-4, 2], ears: 'back', tilt: -4, marks: ['sweat'] },
  sleepy: { eyes: 'flat', look: [0, 4], lid: 0.62, mouth: 'yawn', tilt: 7 },
  asleep: { eyes: 'sleep', tilt: 8, marks: ['zzz'] },
  serene: { eyes: 'sleep', tilt: 1 },
  dizzy: { eyes: 'dizzy', ears: 'back', tilt: 9, marks: ['sweat'] },
  vowing: { eyes: 'open', look: [0, -3], ears: 'perk', tilt: 0 },
  determined: { eyes: 'flat', look: [4, 9], lid: 0.28, tilt: 2 },
  lonely: { eyes: 'droop', look: [-6, 9], lid: 0.4, ears: 'back', tilt: -6 },
} satisfies Record<string, Expression>;

export type ExpressionName = keyof typeof EXPRESSIONS;
