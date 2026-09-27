// The scene library: every moment in CHARACTER.md, composed from poses,
// faces and props. A scene is a named moment with one or more frames (an
// animation plays them in order); the device picks one scene at random for
// its moment. Frames are full 400 x 400 SVGs; cameos are small busts the UI
// lays over other screens.
//
// Scenes live in places (env): the study, the night window, the Hunter's
// Dream, Yharnam, the void, Halloween, a plain room. Every place
// has its own goodnight and good morning, so switching off never jumps
// somewhere else: the device plays the sleep of the place on the glass, and
// wakes in the place it fell asleep. Nothing big sits behind his head: moons
// and windows keep to the corners.

import { HOLD, holding, HUNT_POSES, huntPose, placeHead, pose, SIT_NECK, SIT_SCALE, type Pose } from './body.ts';
import { marks } from './marks.ts';
import { EXPRESSIONS, type Expression, type ExpressionName } from './expressions.ts';
import { ellipse, rng, stroke, toPath, wobble, type Pt } from './ink.ts';
import {
  amygdala, bat, bonfire, book, bubble, candle, candy, cleaver, containmentBox, containmentLid, copyBook, deadTree, desk, DITHER,
  eyesInTheDark, fence, ghost, gothicTown, jackOLantern, laptop, manor, messenger, moon, mug, heldBook, pail, pumpkin, quill, rain,
  runes, scaled, sign, skyEye, tentacledMoon, penQuill, tentacles, web, windowMoon, type Arm,
} from './props.ts';
import { bustArt, DEVICE_PALETTE, SIZE, type Palette, type Skin, type Wear } from './rig.ts';
import { vigilScenes } from './vigil.ts';

export type Moment =
  | 'wake' | 'sleep' | 'session-axiom' | 'session-workshop' | 'session-heresy' | 'session-dream' | 'session-hunt'
  | 'sealed' | 'sealed-long' | 'sealed-short' | 'sealed-marathon' | 'levelup' | 'todos-done' | 'neglected'
  | 'decay-thinning' | 'decay-fragmenting' | 'decay-dormant' | 'lore' | 'halloween' | 'cameo' | 'watch'
  | 'ritual-0' | 'ritual-1' | 'ritual-2' | 'ritual-3' | 'ritual-4' | 'resurrected' | 'transcribe'
  | 'vigil' | 'vigil-breath' | 'vigil-kept' | 'hunt';

export type Env = 'room' | 'desk' | 'window' | 'dream' | 'yharnam' | 'void' | 'halloween' | 'manor' | 'patch';
// skin: the scene belongs to a skin's own set, which the device prefers
// while he wears it; moments the set leaves out fall back to his usual ones.
export type Scene = { id: string; moment: Moment; size: number; frames: string[]; env?: Env; skin?: Skin };

const P = DEVICE_PALETTE;
// The void: his ink becomes a star-strewn night. Everything he is, drawn in it.
const VOID: Palette = { ...P, ink: 'url(#void)' };
const voidDefs = (seed: number) => {
  const r = rng(seed);
  const dots = Array.from({ length: 22 }, () => {
    const [x, y, big] = [r() * 120, r() * 120, r() < 0.2];
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${big ? 2.4 : 1.4}" fill="#fff"/>`;
  }).join('');
  return `<defs><pattern id="void" width="120" height="120" patternUnits="userSpaceOnUse"><rect width="120" height="120" fill="#000"/>${dots}</pattern></defs>`;
};

type Face = ExpressionName | Expression;
const face = (f: Face): Expression => (typeof f === 'string' ? EXPRESSIONS[f] : f);
const svg = (body: string, extraDefs = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}">${DITHER(P)}${extraDefs}<rect width="${SIZE}" height="${SIZE}" fill="#fff"/>${body}</svg>`;
const cat = (kind: Pose, f: Face, wear: Wear = {}, frame = 0, p: Palette = P) => pose(kind, face(f), p, wear, frame);
// Moves a full-body cat so his feet land on (x, y) at scale k.
const at = (art: string, x: number, y: number, k: number) =>
  `<g transform="translate(${(x - 200 * k).toFixed(1)} ${(y - 392 * k).toFixed(1)}) scale(${k})">${art}</g>`;
// A paper outline around him, for busy backgrounds.
const lifted = (art: string) => `<g filter="url(#halo)">${art}</g>`;
const withMarks = (name: ExpressionName, m: NonNullable<Expression['marks']>): Expression => ({ ...face(name), marks: m });

// Head and shoulders placed anywhere, for desk scenes and cameos.
function bustAt(f: Face, neck: Pt, scale: number, wear: Wear = {}, p: Palette = P): string {
  const [tx, ty] = [neck[0] - 200 * scale, neck[1] - 286 * scale];
  return `<g transform="translate(${tx.toFixed(1)} ${ty.toFixed(1)}) scale(${scale})">${bustArt(face(f), p, wear)}</g>`;
}

// Behind a desk: a big bust, the desk top hiding the rest, both front paws
// resting on the edge unless a prop sits there, props on the desk. `slump`
// lowers him until his chin rests on the desk: asleep over his work.
const DESK_Y = 318;
function atDesk(f: Face, onDesk: string, { wear = {}, behind = '', paws = [146, 254], slump = 0 }:
  { wear?: Wear; behind?: string; paws?: number[]; slump?: number } = {}): string {
  const paw = (x: number, i: number) => `<path d="${toPath(wobble(ellipse(x, DESK_Y - 6, 22, 13, 28), 300 + i, 0.8))}" fill="${P.ink}"/>`;
  return behind + bustAt(f, [200, 290 + slump], 0.78, wear)
    + `<rect x="0" y="${DESK_Y}" width="400" height="90" fill="#fff"/>` + desk(DESK_Y, P) + paws.map(paw).join('') + onDesk;
}

// Hides whatever lies below an edge and draws the edge, for things in front.
const hideBelow = (y: number) => `<rect x="0" y="${y}" width="400" height="${400 - y}" fill="#fff"/>`;

const scene = (id: string, moment: Moment, frames: string[], env?: Env, size = 200): Scene => ({ id, moment, size, frames, env });

// A place's goodnight and good morning: he settles from sitting into a
// sleeping loaf, and wakes the same way back, ending with a wave.
function nightAndMorning(env: Env, set: (cat: string) => string, wear: Wear = {}, prefix = ''): Scene[] {
  const s = (kind: Pose, f: Face, frame = 0) => svg(set(cat(kind, f, wear, frame)));
  return [
    scene(`${prefix}sleep-${env}`, 'sleep', [s('sit', 'content'), s('sit', 'sleepy'), s('loaf', 'asleep')], env),
    scene(`${prefix}wake-${env}`, 'wake', [s('loaf', 'asleep'), s('sit', 'sleepy'), s('wave', 'happy'), s('wave', 'delighted', 1)], env),
  ];
}

const HAT: Wear = { hat: true };
// Amygdala's arms as he rises behind the cathedral: [shoulder, elbow, hand]
// in head units, reaching over the towers and hooked on them.
const AMYGDALA_BEHIND: Arm[] = [
  [-16, 30, -52, -30, -46, 40], [-18, 44, -66, 10, -58, 76],
  [16, 30, 52, -30, 44, 58], [18, 44, 62, 20, 50, 96],
];

export function scenes(): Scene[] {
  // The night: no window, only the moon up in the corner, clear of his head.
  const nightMoon = (kind: 'paleblood' | 'blood' = 'paleblood', seed = 173) => moon(72, 72, 36, P, kind, seed);
  const ground = `<path d="${toPath(wobble(stroke([[-4, 388], [404, 388]], () => 6), 261, 0.6))}" fill="#000"/>`;
  const yharnam = (houses = true) => gothicTown(P, 320, { houses }) + ground;
  // The Hunter's Dream: a bonfire from the old lands to rest at, or a dead
  // tree the messengers gather under, under the paleblood moon.
  const dreamMoon = moon(344, 56, 34, P, 'paleblood', 172);
  const fire = (x: number, k: number) => scaled(bonfire(x, 388, P), x, 388, k);
  const voidEyes = (count: number, seed = 181) => eyesInTheDark(P, count, seed, [0, 0, 400, 400], [200, 240, 170]);
  // The void's night: dark dither, eyes opening in it, his star-filled form
  // lifted out of it by a paper edge.
  const dark = `<rect width="400" height="400" fill="url(#d75)"/>`;
  const voidCat = (kind: Pose, f: Face, frame = 0) => lifted(cat(kind, f, {}, frame, VOID));

  return [
    // A plain room: the greetings that need no set.
    scene('wake-wave', 'wake', [svg(cat('sit', 'curious')), svg(cat('wave', 'happy')), svg(cat('wave', 'delighted', {}, 1))], 'room'),
    scene('wake-peek', 'wake', [svg(cat('peek', 'asleep')), svg(cat('peek', 'sleepy')), svg(cat('peek', 'curious'))], 'room'),
    // Out of his containment unit: the lid shut, pushed up, thrown back.
    scene('wake-box', 'wake', [
      svg(containmentLid(110, 262, 180, P) + containmentBox(110, 262, 180, 126, P)),
      svg(`<rect x="112" y="244" width="176" height="20" fill="#000"/>` + containmentLid(110, 244, 180, P)
        + [182, 218].map((x) => `<path d="${toPath(ellipse(x, 254, 6, 4, 12))}" fill="#fff"/>`).join('') + containmentBox(110, 262, 180, 126, P)),
      svg(containmentLid(110, 262, 180, P, 1) + bustAt('delighted', [200, 296], 0.7) + hideBelow(262) + containmentBox(110, 262, 180, 126, P)),
    ], 'room'),
    scene('wake-stretch', 'wake', [svg(cat('loaf', 'asleep')), svg(cat('loaf', 'sleepy')), svg(cat('sit', 'curious')), svg(cat('reach', 'delighted'))], 'room'),
    scene('wake-yay', 'wake', [svg(cat('sit', 'curious')), svg(cat('reach', 'delighted', {}, 1)), svg(cat('reach', 'delighted'))], 'room'),
    scene('wake-coffee', 'wake', [
      svg(holding(face('sleepy'), P, scaled(mug(HOLD[0], HOLD[1] + 16, P, 62), HOLD[0], HOLD[1] + 16, 1.5))),
      svg(holding(face('content'), P, scaled(mug(HOLD[0], HOLD[1] + 16, P, 62), HOLD[0], HOLD[1] + 16, 1.5))),
      svg(holding(face('happy'), P, scaled(mug(HOLD[0], HOLD[1] + 16, P, 62), HOLD[0], HOLD[1] + 16, 1.5))),
    ], 'room'),
    scene('sleep-wave', 'sleep', [svg(cat('wave', 'happy')), svg(cat('sit', 'sleepy')), svg(cat('loaf', 'asleep'))], 'room'),
    scene('sleep-blink', 'sleep', [svg(cat('front', 'curious')), svg(cat('front', 'content')), svg(cat('loaf', 'asleep'))], 'room'),

    // A session sealed: proud, or a comment on how it went.
    scene('sealed-proud', 'sealed', [svg(cat('sit', 'proud'))], 'room'),
    scene('sealed-happy', 'sealed', [svg(cat('front', 'happy'))], 'room'),
    scene('sealed-long', 'sealed-long', [svg(cat('sit', 'flustered'))], 'room'),
    scene('sealed-short', 'sealed-short', [svg(cat('sit', 'annoyed'))], 'room'),
    scene('sealed-marathon', 'sealed-marathon', [svg(cat('front', 'dizzy'))], 'room'),
    scene('levelup', 'levelup', [svg(cat('wave', withMarks('delighted', ['sparkles'])))], 'room'),
    scene('levelup-yay', 'levelup', [svg(cat('reach', withMarks('delighted', ['sparkles'])))], 'room'),
    scene('levelup-insight', 'levelup', [svg(dark + voidEyes(12, 185) + voidCat('reach', 'overjoyed'), voidDefs(13))], 'void'),
    scene('todos-done', 'todos-done', [svg(cat('front', 'overjoyed'))], 'room'),
    scene('todos-yay', 'todos-done', [svg(cat('reach', withMarks('overjoyed', ['hearts'])))], 'room'),
    scene('neglected', 'neglected', [svg(cat('front', 'furious'))], 'room'),
    scene('neglected-hmph', 'neglected', [svg(cat('sit', withMarks('hmph', ['anger'])))], 'room'),
    // Left too long, the blood moon rises over him.
    scene('neglected-bloodmoon', 'neglected', [svg(moon(340, 64, 44, P, 'blood', 173) + bat(60, 60, P) + bat(110, 110, P, 0.7, 114)
      + cat('sit', 'furious'))], 'yharnam'),

    // The study: sessions at the desk, falling asleep over the book.
    scene('axiom-study', 'session-axiom', [svg(atDesk('determined', book(200, DESK_Y - 4, P) + mug(335, DESK_Y, P), { paws: [118, 282] }))], 'desk'),
    scene('axiom-laptop', 'session-axiom', [svg(atDesk('content', laptop(200, DESK_Y, P) + mug(335, DESK_Y, P), { wear: { headphones: true }, paws: [] }))], 'desk'),
    scene('axiom-reading', 'session-axiom', [svg(holding({ ...face('determined'), look: [2, 12] }, P, heldBook(HOLD[0], HOLD[1] + 6, P)))], 'room'),
    scene('workshop-laptop', 'session-workshop', [svg(atDesk('determined', laptop(200, DESK_Y, P), { paws: [110, 290] }))], 'desk'),
    scene('workshop-vibing', 'session-workshop', [svg(atDesk('content', laptop(170, DESK_Y, P) + mug(330, DESK_Y, P), { wear: { headphones: true }, paws: [262] }))], 'desk'),
    scene('heresy-quill', 'session-heresy', [svg(atDesk('determined', quill(318, DESK_Y, P) + candle(70, DESK_Y, P, true, 71)
      + book(196, DESK_Y - 4, P, 51), { paws: [130] }))], 'desk'),
    scene('heresy-runes', 'session-heresy', [svg(atDesk('content', quill(318, DESK_Y, P, 81) + book(190, DESK_Y - 4, P, 53),
      { behind: runes(30, 150, P, 221, 3), paws: [130] }))], 'desk'),
    // Forbidden reading: the tentacles come up to look over his shoulder.
    scene('heresy-tentacles', 'session-heresy', [svg(atDesk('determined', book(200, DESK_Y - 4, P, 54) + candle(334, DESK_Y, P, true, 74),
      { behind: scaled(tentacles(P, 191, [96, 322]), 200, 400, 1.5), paws: [118, 282] }))], 'desk'),
    // A book being copied onto the card: he writes it out by hand, the book
    // he reads from giving up its words, which rise off its pages as he goes.
    // One frame a chapter, round and round until the last one is down.
    scene('transcribe', 'transcribe', [0, 1, 2, 3].map((k) => {
      const paw = (x: number, seed: number) => `<path d="${toPath(wobble(ellipse(x, DESK_Y - 8, 20, 12, 28), seed, 0.8))}" fill="${P.ink}"/>`;
      // The words leave the book on the left and rise up the edge of the glass.
      const rising = [[38, 250], [70, 196], [42, 142], [74, 88]].map(([x, y], i) =>
        runes(x!, y! - k * 14, P, 227 + i * 3 + (k % 2), 1)).join('');
      const nib = 286 + k * 11;
      return svg(atDesk({ ...face('determined'), look: [10, 14] },
        book(112, DESK_Y - 4, P, 57) + paw(140, 311) + copyBook(282, DESK_Y - 4, P, k + 1)
        + penQuill(nib, DESK_Y - 12, P) + paw(nib + 8, 312), { paws: [], behind: rising }));
    }), 'desk'),
    scene('dream-moon', 'session-dream', [svg(atDesk('content', book(200, DESK_Y - 4, P), { behind: windowMoon(292, 20, 94, 110, P, 'crescent', 96) }))], 'desk'),
    scene('sleep-desk', 'sleep', [
      svg(atDesk('content', book(200, DESK_Y - 4, P) + mug(335, DESK_Y, P, 61), { paws: [120, 262] })),
      svg(atDesk('sleepy', book(200, DESK_Y - 4, P) + mug(335, DESK_Y, P, 61, false), { paws: [120, 262], slump: 18 })),
      svg(atDesk('asleep', book(200, DESK_Y - 4, P) + mug(335, DESK_Y, P, 61, false), { paws: [120, 262], slump: 40 })),
    ], 'desk'),
    scene('wake-desk', 'wake', [
      svg(atDesk('asleep', book(200, DESK_Y - 4, P) + mug(335, DESK_Y, P, 61, false), { paws: [120, 262], slump: 40 })),
      svg(atDesk('surprised', book(200, DESK_Y - 4, P) + mug(335, DESK_Y, P, 61, false), { paws: [120, 262], slump: 10 })),
      svg(atDesk('happy', book(200, DESK_Y - 4, P) + mug(335, DESK_Y, P, 61), { paws: [120, 262] })),
    ], 'desk'),

    // The night window, up in the corner.
    scene('lore-rain', 'lore', [svg(rain(P, [0, 0, 400, 380], 240, 70) + nightMoon() + at(cat('sit', 'content'), 230, 392, 0.94))], 'window'),
    // Something vast looks in at the window. He does not mind; it is family.
    scene('lore-sky-eye', 'lore', [svg(skyEye(84, 76, 130, P) + at(cat('sit', { ...face('content'), look: [-8, -4] }), 250, 392, 0.94))], 'window'),
    scene('dream-asleep', 'session-dream', [svg(nightMoon() + cat('loaf', 'asleep'))], 'window'),
    scene('decay-thinning', 'decay-thinning', [svg(nightMoon('paleblood', 92) + at(cat('sit', 'lonely'), 234, 392, 0.94))], 'window'),
    ...nightAndMorning('window', (c) => nightMoon() + at(c, 234, 392, 0.94)),

    // The Hunter's Dream. At the bonfire he rests bareheaded; under the
    // moon alone, or with the messengers, he wears the hunter's hat.
    scene('lore-dream', 'lore', [svg(dreamMoon + ground + cat('sit', 'content', HAT))], 'dream'),
    scene('lore-bonfire', 'lore', [svg(dreamMoon + fire(92, 1.8) + ground + at(cat('sit', 'content'), 272, 392, 0.94))], 'dream'),
    scene('lore-bonfire-tree', 'lore', [svg(dreamMoon + deadTree(30, 388, P, 351) + fire(114, 1.45) + ground
      + at(cat('sit', 'content'), 276, 392, 0.94))], 'dream'),
    scene('lore-messengers', 'lore', [svg(dreamMoon + deadTree(60, 388, P) + messenger(128, 388, P, 281, 1.9)
      + ground + at(cat('sit', { ...face('delighted'), look: [-8, 6] }, HAT), 262, 392, 0.94))], 'dream'),
    ...nightAndMorning('dream', (c) => dreamMoon + fire(92, 1.8) + ground + at(c, 272, 392, 0.94)),

    // Yharnam's cathedral under the paleblood moon, and what clings to it.
    scene('lore-yharnam', 'lore', [svg(moon(340, 64, 40, P, 'paleblood', 174) + bat(300, 150, P) + bat(360, 180, P, 0.7, 115)
      + yharnam() + lifted(cat('sit', 'content')))], 'yharnam'),
    // Amygdala rising behind the cathedral: his head between its spires,
    // his hands hooked over the towers. The cathedral drawn a little larger.
    scene('lore-amygdala', 'lore', [svg(moon(344, 56, 34, P, 'paleblood', 174)
      + `<g transform="translate(0 ${392 - 392 * 1.2}) scale(1.2)">${amygdala(62, 150, P, AMYGDALA_BEHIND, { k: 0.9 }) + gothicTown(P, 320, { houses: false })}</g>`
      + ground + lifted(at(cat('sit', { ...face('curious'), look: [-10, -6] }), 292, 392, 0.86)))], 'yharnam'),
    scene('lore-cathedral', 'lore', [svg(moon(344, 56, 34, P, 'paleblood', 176) + yharnam(false)
      + lifted(at(cat('sit', { ...face('content'), look: [-10, -6] }), 270, 392, 0.94)))], 'yharnam'),
    scene('hunt-yharnam', 'session-hunt', [svg(moon(340, 64, 40, P, 'paleblood', 175) + yharnam()
      + lifted(cat('sit', 'determined', HAT) + cleaver(292, 380, P)))], 'yharnam'),
    ...nightAndMorning('yharnam', (c) => moon(340, 64, 40, P, 'paleblood', 174) + yharnam() + lifted(c)),

    // The void: his true form, and the eyes that open around it.
    scene('lore-insight', 'lore', [svg(dark + voidEyes(14, 182) + lifted(tentacles(P)) + voidCat('sit', 'content'), voidDefs(9))], 'void'),
    scene('lore-trueform', 'lore', [svg(`<g transform="translate(-40 -60) scale(1.2)">${bustArt({ ...face('curious'), look: [0, -4] }, VOID)}</g>`
      + eyesInTheDark(P, 7, 183, [70, 40, 260, 130]), voidDefs(10))], 'void'),
    // The moon is not a moon: something hangs from it.
    scene('lore-moon-presence', 'lore', [svg(dark + lifted(tentacledMoon(66, 60, 40, P)) + eyesInTheDark(P, 5, 186, [270, 20, 120, 160])
      + at(voidCat('sit', { ...face('content'), look: [-8, -6] }), 240, 392, 0.94), voidDefs(12))], 'void'),
    scene('decay-fragmenting', 'decay-fragmenting', [svg(voidEyes(6, 187) + cat('front', 'lonely', {}, 0, { ...P, ink: 'url(#d50)' }))], 'void'),
    scene('decay-dormant', 'decay-dormant', [svg(dark + voidCat('loaf', 'asleep') + eyesInTheDark(P, 5, 181, [0, 0, 400, 200]), voidDefs(8))], 'void'),
    // Goodnight in the void: the eyes close with him; good morning, they open.
    scene('sleep-void', 'sleep', [
      svg(dark + voidEyes(12) + voidCat('sit', 'content'), voidDefs(7)),
      svg(dark + voidEyes(6) + voidCat('sit', 'sleepy'), voidDefs(7)),
      svg(dark + voidEyes(2) + voidCat('loaf', 'asleep'), voidDefs(7)),
    ], 'void'),
    scene('wake-void', 'wake', [
      svg(dark + voidEyes(2) + voidCat('loaf', 'asleep'), voidDefs(7)),
      svg(dark + voidEyes(7) + voidCat('sit', 'sleepy'), voidDefs(7)),
      svg(dark + voidEyes(12) + voidCat('wave', 'happy'), voidDefs(7)),
      svg(dark + voidEyes(12) + voidCat('wave', 'delighted', 1), voidDefs(7)),
    ], 'void'),
    // The rite that wakes him from dormancy: his void form asleep, a candle lit
    // for every quarter hour, then his return.
    ...[0, 1, 2, 3, 4].map((lit) => scene(`ritual-${lit}`, `ritual-${lit}` as Moment, [svg(
      `<rect width="400" height="400" fill="url(#d25)"/>` + runes(150, 140, P, 222 + lit, 3)
      + cat('loaf', 'asleep', {}, 0, VOID)
      + [[80, 396], [370, 396], [40, 262], [372, 262]].map(([x, y], i) => candle(x!, y!, P, i < lit, 72 + i)).join(''),
      voidDefs(11))], 'void')),
    scene('resurrected-back', 'resurrected', [svg(cat('front', withMarks('overjoyed', ['sparkles']))
      + [[46, 392], [354, 392]].map(([x, y], i) => candle(x!, y!, P, false, 76 + i)).join(''))], 'room'),
    scene('resurrected-yay', 'resurrected', [svg(cat('reach', withMarks('delighted', ['sparkles']))
      + [[46, 392], [354, 392]].map(([x, y], i) => candle(x!, y!, P, false, 78 + i)).join(''))], 'room'),

    // Halloween, the last week of October.
    scene('lore-haunted', 'halloween', [svg(nightMoon('blood', 93) + ghost(330, 150, P) + bat(350, 50, P, 0.8, 111)
      + at(cat('sit', 'curious'), 224, 392, 0.94))], 'halloween'),
    scene('lore-pumpkin', 'halloween', [svg(bat(60, 60, P) + bat(340, 90, P, 0.7, 112) + cat('sit', 'delighted', { skin: 'halo' })
      + pumpkin(76, 370, P))], 'halloween'),
    scene('lore-pumpkin-hold', 'halloween', [svg(bat(60, 60, P) + bat(340, 90, P, 0.8, 113)
      + holding(face('delighted'), P, scaled(pumpkin(HOLD[0], HOLD[1] + 6, P, 121), HOLD[0], HOLD[1] + 6, 1.2)))], 'halloween'),
    ...nightAndMorning('halloween', (c) => nightMoon('blood', 93) + ghost(340, 170, P, 101, 0.8) + at(c, 234, 392, 0.94)),

    // Cameos: small busts the UI lays over other screens (quotes, lists).
    ...(['curious', 'content', 'happy', 'delighted', 'questioning', 'overjoyed', 'annoyed', 'proud', 'sleepy', 'flustered', 'hmph', 'surprised', 'scared'] as ExpressionName[])
      .map((name) => scene(`cameo-${name}`, 'cameo', [svg(bustAt(name, [200, 395], 1.28))], undefined, 72)),
    // The watcher peeking up from a corner, eyes following the cursor.
    ...([[-11, -6], [0, -10], [11, -6]] as Pt[]).map((look, i) =>
      scene(`watch-${['left', 'up', 'right'][i]}`, 'watch', [svg(placeHead({ ...face('curious'), look, tilt: 0 }, P, [200, 470], 1.35)
        + hideBelow(392))], undefined, 64)),
    // The Vigil: sitting still (src/vigil.ts).
    ...vigilScenes().map((v) => scene(v.id, v.moment, v.frames)),
    // The Hunt: him at each movement, small, beside the set on the glass.
    ...HUNT_POSES.map((k) => scene(`hunt-${k}`, 'hunt', [svg(huntPose(k, face(k === 'run' ? 'happy' : k === 'core' || k === 'stairs' ? 'content' : 'vowing'), P))], undefined, 80)),
  ];
}

// The Halloween skin: a bedsheet ghost (rig.ts) in a Halloween of his own.
// The haunted manor on its hill, a pumpkin patch under a dead tree, webs in
// the corners, trick-or-treating with a pail. Its own set of every everyday
// moment; the rest (decay, the rite, the Vigil, copying a book) stay his usual.
export function halloweenScenes(): Scene[] {
  const G: Wear = { skin: 'halloween' };
  const g = (kind: Pose, f: Face, frame = 0, wear: Wear = {}) => cat(kind, f, { ...G, ...wear }, frame);
  const ground = `<path d="${toPath(wobble(stroke([[-4, 388], [404, 388]], () => 6), 262, 0.6))}" fill="#000"/>`;
  const bats = (seed = 116) => bat(262, 54, P, 0.9, seed) + bat(318, 96, P, 0.7, seed + 1) + bat(214, 100, P, 0.6, seed + 2);
  // The manor on the left, the moon over his side, a railing at his back.
  const manorSet = (c: string, lit = true) => moon(344, 56, 34, P, 'paleblood', 177) + bats() + manor(P, 400, { lit })
    + fence(300, 404, 388, P) + ground + lifted(at(c, 244, 392, 0.94));
  // The pumpkin patch: a dead tree on the right, a blood moon on the left,
  // jack-o'-lanterns about his feet.
  const patchSet = (c: string, lit = true) => moon(64, 60, 32, P, 'blood', 178) + scaled(deadTree(386, 388, P, 353, -1), 386, 388, 0.55)
    + bat(122, 44, P, 0.8, 119) + ground + lifted(at(c, 196, 392, 0.94))
    + scaled(jackOLantern(66, 372, P, 431, lit), 66, 372, 1.1) + jackOLantern(318, 376, P, 432) + scaled(pumpkin(118, 382, P, 433), 118, 382, 0.6);
  const hs = (id: string, moment: Moment, frames: string[], env?: Env, size = 200): Scene =>
    ({ ...scene(`hw-${id}`, moment, frames, env, size), skin: 'halloween' });
  const held = (thing: string) => scaled(thing, HOLD[0], HOLD[1] + 22, 1.3);
  const haul = (seed: number, full = true) => held(pail(HOLD[0], HOLD[1] + 22, P, seed, full));

  return [
    // Waking and sleeping, at the manor and in the patch; a sheet flat on the
    // floor that sits up and waves.
    ...nightAndMorning('manor', (c) => manorSet(c), G, 'hw-'),
    ...nightAndMorning('patch', (c) => patchSet(c), G, 'hw-'),
    hs('wake-sheet', 'wake', [svg(web(P, 1) + g('loaf', 'asleep')), svg(web(P, 1) + g('sit', 'sleepy')), svg(web(P, 1) + g('wave', 'delighted', 1))], 'room'),

    // Sessions at the desk, a jack-o'-lantern on it and a web overhead.
    hs('axiom-study', 'session-axiom', [svg(atDesk('determined', book(190, DESK_Y - 4, P) + jackOLantern(338, DESK_Y - 12, P, 434, true),
      { wear: G, paws: [110, 270], behind: web(P, -1, 461, 40) }))], 'desk'),
    hs('axiom-laptop', 'session-axiom', [svg(atDesk('content', laptop(200, DESK_Y, P) + candy(336, DESK_Y - 8, P, 441, 10) + candy(62, DESK_Y - 8, P, 445, -14),
      { wear: { ...G, headphones: true }, paws: [], behind: web(P, 1, 462, 30) }))], 'desk'),
    hs('workshop-laptop', 'session-workshop', [svg(atDesk('determined', laptop(176, DESK_Y, P) + scaled(pail(330, DESK_Y - 14, P, 451), 330, DESK_Y - 14, 0.9),
      { wear: G, paws: [96], behind: web(P, -1, 463, 50) }))], 'desk'),
    hs('workshop-vibing', 'session-workshop', [svg(atDesk('content', laptop(170, DESK_Y, P) + jackOLantern(334, DESK_Y - 12, P, 435),
      { wear: { ...G, headphones: true }, paws: [], behind: bats(120) }))], 'desk'),
    hs('heresy-quill', 'session-heresy', [svg(atDesk('determined', quill(318, DESK_Y, P) + candle(70, DESK_Y, P, true, 73) + book(196, DESK_Y - 4, P, 52),
      { wear: G, paws: [130], behind: web(P, 1, 464, 20) }))], 'desk'),
    hs('heresy-runes', 'session-heresy', [svg(atDesk('content', quill(318, DESK_Y, P, 82) + book(190, DESK_Y - 4, P, 55),
      { wear: G, behind: runes(30, 150, P, 223, 3), paws: [130] }))], 'desk'),
    hs('dream-asleep', 'session-dream', [svg(moon(72, 72, 36, P, 'paleblood', 179) + ghost(330, 150, P, 102, 0.9) + g('loaf', 'asleep'))], 'patch'),
    hs('hunt-manor', 'session-hunt', [svg(moon(344, 56, 34, P, 'paleblood', 177) + manor(P, 400) + ground
      + lifted(at(g('sit', 'determined', 0, { hat: true }) + cleaver(292, 380, P), 244, 392, 0.94)))], 'manor'),
    hs('sleep-desk', 'sleep', [
      svg(atDesk('content', book(200, DESK_Y - 4, P) + jackOLantern(338, DESK_Y - 12, P, 434, true), { wear: G, paws: [120, 262] })),
      svg(atDesk('sleepy', book(200, DESK_Y - 4, P) + jackOLantern(338, DESK_Y - 12, P, 434), { wear: G, paws: [120, 262], slump: 18 })),
      svg(atDesk('asleep', book(200, DESK_Y - 4, P) + jackOLantern(338, DESK_Y - 12, P, 434), { wear: G, paws: [120, 262], slump: 40 })),
    ], 'desk'),

    // A session sealed: the night's haul.
    hs('sealed-proud', 'sealed', [svg(g('sit', 'proud') + scaled(jackOLantern(76, 372, P, 436, true), 76, 372, 1.2))], 'room'),
    hs('sealed-happy', 'sealed', [svg(web(P, -1, 465) + holding(face('happy'), P, haul(452), G))], 'room'),
    hs('sealed-long', 'sealed-long', [svg(holding(face('flustered'), P, haul(453), G)
      + candy(62, 380, P, 446, 20) + candy(96, 360, P, 447, -30) + candy(338, 382, P, 448, 12))], 'room'),
    // Under ten minutes: a trick, not a treat. The pail comes back empty.
    hs('sealed-short', 'sealed-short', [svg(holding(face('annoyed'), P, haul(454, false), G))], 'room'),
    hs('sealed-marathon', 'sealed-marathon', [svg(g('front', 'dizzy') + ([[56, 384, 10], [92, 370, -40], [320, 384, 30], [352, 366, -8], [300, 360, 60]] as number[][])
      .map(([x, y, a], i) => candy(x!, y!, P, 480 + i * 5, a)).join(''))], 'room'),
    hs('levelup', 'levelup', [svg(g('reach', withMarks('delighted', ['sparkles'])) + ([[70, 120, 20], [330, 150, -30], [92, 240, 40], [318, 270, -10]] as number[][])
      .map(([x, y, a], i) => candy(x!, y!, P, 500 + i * 5, a)).join(''))], 'room'),
    hs('todos-done', 'todos-done', [svg(bats() + holding(withMarks('overjoyed', ['hearts']), P, haul(455), G))], 'room'),
    hs('neglected', 'neglected', [svg(moon(340, 64, 44, P, 'blood', 173) + bat(60, 60, P) + bat(110, 110, P, 0.7, 114)
      + web(P, -1, 466, 110) + g('sit', 'furious'))], 'manor'),

    // Screensavers, shown in his Halloween week too.
    hs('lore-manor', 'lore', [svg(manorSet(g('sit', { ...face('content'), look: [-10, -6] })))], 'manor'),
    // Trick or treat: at the manor's door with his pail.
    hs('lore-trick', 'lore', [svg(moon(344, 56, 30, P, 'paleblood', 177) + manor(P, 400) + ground
      + lifted(at(holding(face('delighted'), P, haul(456), G), 212, 392, 0.9))
      + sign(344, 388, ['TRICK', 'OR TREAT'], P))], 'manor'),
    hs('lore-patch', 'lore', [svg(patchSet(g('sit', 'delighted')))], 'patch'),
    // Under the dead tree with the ghost he knows, loafing in his sheet.
    hs('lore-tree', 'lore', [svg(moon(344, 56, 32, P, 'paleblood', 180) + deadTree(62, 388, P, 354) + bat(120, 70, P, 0.8, 121)
      + ghost(150, 200, P, 103, 0.9) + ground + at(g('loaf', 'content'), 236, 392, 0.9))], 'patch'),
    // A spider comes down on its thread; he watches it, fascinated.
    hs('lore-spider', 'lore', [svg(web(P, 1, 467, 120) + bustAt({ ...face('curious'), look: [10, -10] }, [170, 396], 0.86, G))], 'room'),
    hs('lore-friends', 'lore', [svg(moon(72, 64, 30, P, 'paleblood', 181) + ghost(84, 250, P, 104, 1.3) + ghost(330, 196, P, 105, 1.1)
      + g('wave', 'happy'))], 'room'),

    ...(['curious', 'content', 'happy', 'delighted', 'questioning', 'overjoyed', 'annoyed', 'proud', 'sleepy', 'flustered', 'hmph', 'surprised', 'scared'] as ExpressionName[])
      .map((name) => hs(`cameo-${name}`, 'cameo', [svg(bustAt(name, [200, 395], 1.28, G))], undefined, 72)),
    // The watcher on the menu, peeking up in his sheet. Baked at 64 px, so
    // the cloth's outline is drawn heavier to stay on the page.
    ...([[-11, -6], [0, -10], [11, -6]] as Pt[]).map((look, i) =>
      hs(`watch-${['left', 'up', 'right'][i]}`, 'watch', [svg(placeHead({ ...face('curious'), look, tilt: 0 }, P, [200, 470], 1.35, G, 2.2)
        + hideBelow(392))], undefined, 64)),
  ];
}

export { bubble, marks };
