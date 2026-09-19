// The named faces from CHARACTER.md. Each is a pick from the face kit plus
// the head's tilt, the ears and the marks around him.

import type { Brows, EyeKind, Mouth } from './face.ts';
import type { Pt } from './ink.ts';
import type { Mark } from './marks.ts';

export type Ears = 'up' | 'back' | 'perk';

export type Expression = {
  eyes: EyeKind | [EyeKind, EyeKind];
  look?: Pt;
  lid?: number;
  brows?: Brows;
  mouth?: Mouth;
  blush?: boolean;
  ears?: Ears;
  tilt?: number;
  marks?: Mark[];
};

export const EXPRESSIONS = {
  curious: { eyes: 'open', look: [5, -7], tilt: -5 },
  content: { eyes: 'content', tilt: 4 },
  happy: { eyes: 'happy', mouth: 'cat', tilt: 6 },
  proud: { eyes: 'happy', mouth: 'cat', tilt: -2, ears: 'perk', marks: ['sparkles'] },
  flustered: { eyes: 'sparkle', look: [-7, 6], blush: true, mouth: 'cat', tilt: -7 },
  touched: { eyes: 'teary', look: [0, -3], blush: true, mouth: 'cat', tilt: 5 },
  hmph: { eyes: 'glare', look: [-7, 2], lid: 0.55, brows: 'angry', mouth: 'pout', ears: 'back', tilt: -8, marks: ['anger'] },
  skeptical: { eyes: 'half', look: [7, 2], lid: 0.45, brows: 'raised', tilt: 6, marks: ['question'] },
  surprised: { eyes: 'wide', mouth: 'open', ears: 'perk', tilt: 0, marks: ['exclaim'] },
  scared: { eyes: 'wide', look: [-4, 2], brows: 'worried', ears: 'back', tilt: -4, marks: ['sweat'] },
  sleepy: { eyes: 'half', look: [0, 6], lid: 0.62, mouth: 'yawn', tilt: 7 },
  asleep: { eyes: 'sleep', tilt: 8, marks: ['zzz'] },
  dizzy: { eyes: 'dizzy', ears: 'back', tilt: 9, marks: ['sweat'] },
  smug: { eyes: 'crescent', look: [3, 0], mouth: 'grin', tilt: -6 },
  determined: { eyes: 'half', look: [4, 9], lid: 0.28, brows: 'flat', tilt: 2 },
  lonely: { eyes: 'open', look: [-6, 9], brows: 'worried', ears: 'back', tilt: -6 },
} satisfies Record<string, Expression>;

export type ExpressionName = keyof typeof EXPRESSIONS;
