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

import { HOLD, holding, placeHead, pose, SIT_NECK, SIT_SCALE, type Pose } from './body.ts';
import { marks } from './marks.ts';
import { EXPRESSIONS, type Expression, type ExpressionName } from './expressions.ts';
import { ellipse, rng, stroke, toPath, wobble, type Pt } from './ink.ts';
import {
  amygdala, bat, book, bubble, candle, cardboardBox, cleaver, desk, DITHER, eyesInTheDark, flower, ghost, gothicTown, lamp, laptop,
  messenger, moon, mug, heldBook, pumpkin, quill, rain, runes, scaled, tentacledMoon, tentacles,
  tricorn, windowEye, windowMoon,
} from './props.ts';
import { bustArt, DEVICE_PALETTE, SIZE, type Palette, type Wear } from './rig.ts';

export type Moment =
  | 'wake' | 'sleep' | 'session-axiom' | 'session-workshop' | 'session-heresy' | 'session-dream' | 'session-hunt'
  | 'sealed' | 'sealed-long' | 'sealed-short' | 'sealed-marathon' | 'levelup' | 'todos-done' | 'neglected'
  | 'decay-thinning' | 'decay-fragmenting' | 'decay-dormant' | 'lore' | 'halloween' | 'cameo' | 'watch'
  | 'ritual-0' | 'ritual-1' | 'ritual-2' | 'ritual-3' | 'ritual-4' | 'resurrected';

export type Env = 'room' | 'desk' | 'window' | 'dream' | 'yharnam' | 'void' | 'halloween';
export type Scene = { id: string; moment: Moment; size: number; frames: string[]; env?: Env };

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

// The hunter's tricorn over a sitting head.
function tricornOn(f: Face, neck: Pt = SIT_NECK, k = SIT_SCALE): string {
  return `<g transform="translate(${(neck[0] - 200 * k).toFixed(1)} ${(neck[1] - 286 * k).toFixed(1)}) scale(${k}) rotate(${face(f).tilt ?? 0} 200 286)">${tricorn(P)}</g>`;
}

// A place's goodnight and good morning: he settles from sitting into a
// sleeping loaf, and wakes the same way back, ending with a wave.
function nightAndMorning(env: Env, set: (cat: string) => string): Scene[] {
  const s = (kind: Pose, f: Face, frame = 0) => svg(set(cat(kind, f, {}, frame)));
  return [
    scene(`sleep-${env}`, 'sleep', [s('sit', 'content'), s('sit', 'sleepy'), s('loaf', 'asleep')], env),
    scene(`wake-${env}`, 'wake', [s('loaf', 'asleep'), s('sit', 'sleepy'), s('wave', 'happy'), s('wave', 'delighted', 1)], env),
  ];
}

export function scenes(): Scene[] {
  // The night window, up in the corner, clear of his head.
  const nightWindow = (moonKind: 'crescent' | 'full' | 'blood' = 'crescent', seed = 94) => windowMoon(14, 20, 104, 120, P, moonKind, seed);
  const ground = `<path d="${toPath(wobble(stroke([[-4, 388], [404, 388]], () => 6), 261, 0.6))}" fill="#000"/>`;
  const yharnam = (houses = true) => gothicTown(P, 320, { houses }) + ground;
  const flowers = () => [[34, 84, 311], [364, 70, 313]]
    .map(([x, h, sd]) => flower(x!, 392, h!, P, sd, 1.8)).join('');
  const hunterDream = () => lamp(44, 120, P, 163) + flowers();
  const voidEyes = (count: number, seed = 181) => eyesInTheDark(P, count, seed, [0, 0, 400, 400], [200, 240, 170]);
  // The void's night: dark dither, eyes opening in it, his star-filled form
  // lifted out of it by a paper edge.
  const dark = `<rect width="400" height="400" fill="url(#d75)"/>`;
  const voidCat = (kind: Pose, f: Face, frame = 0) => lifted(cat(kind, f, {}, frame, VOID));

  return [
    // A plain room: the greetings that need no set.
    scene('wake-wave', 'wake', [svg(cat('sit', 'curious')), svg(cat('wave', 'happy')), svg(cat('wave', 'delighted', {}, 1))], 'room'),
    scene('wake-peek', 'wake', [svg(cat('peek', 'asleep')), svg(cat('peek', 'sleepy')), svg(cat('peek', 'curious'))], 'room'),
    scene('wake-box', 'wake', [
      svg(hideBelow(262) + cardboardBox(120, 262, 160, 120, P)),
      svg(bustAt('curious', [200, 350], 0.7) + hideBelow(262) + cardboardBox(120, 262, 160, 120, P)),
      svg(bustAt('delighted', [200, 290], 0.7) + hideBelow(262) + cardboardBox(120, 262, 160, 120, P)),
    ], 'room'),
    scene('wake-stretch', 'wake', [svg(cat('loaf', 'asleep')), svg(cat('loaf', 'sleepy')), svg(cat('sit', 'curious')), svg(cat('reach', 'delighted'))], 'room'),
    scene('wake-yay', 'wake', [svg(cat('sit', 'curious')), svg(cat('reach', 'delighted', {}, 1)), svg(cat('reach', 'delighted'))], 'room'),
    scene('wake-coffee', 'wake', [
      svg(holding(face('sleepy'), P, scaled(mug(HOLD[0], HOLD[1] + 16, P, 62), HOLD[0], HOLD[1] + 16, 1.5))),
      svg(holding(face('content'), P, scaled(mug(HOLD[0], HOLD[1] + 16, P, 62), HOLD[0], HOLD[1] + 16, 1.5))),
      svg(holding(face('happy'), P, scaled(mug(HOLD[0], HOLD[1] + 16, P, 62), HOLD[0], HOLD[1] + 16, 1.5))),
    ], 'room'),
    scene('sleep-wave', 'sleep', [svg(cat('wave', 'happy')), svg(cat('sit', 'sleepy')), svg(cat('loaf', 'asleep'))], 'room'),
    scene('sleep-blink', 'sleep', [svg(cat('sit', 'curious')), svg(cat('sit', 'content')), svg(cat('loaf', 'asleep'))], 'room'),

    // A session sealed: proud, or a comment on how it went.
    scene('sealed-proud', 'sealed', [svg(cat('sit', 'proud'))], 'room'),
    scene('sealed-happy', 'sealed', [svg(cat('sit', 'happy'))], 'room'),
    scene('sealed-long', 'sealed-long', [svg(cat('sit', 'flustered'))], 'room'),
    scene('sealed-short', 'sealed-short', [svg(cat('sit', 'annoyed'))], 'room'),
    scene('sealed-marathon', 'sealed-marathon', [svg(cat('sit', 'dizzy'))], 'room'),
    scene('levelup', 'levelup', [svg(cat('wave', withMarks('delighted', ['sparkles'])))], 'room'),
    scene('levelup-yay', 'levelup', [svg(cat('reach', withMarks('delighted', ['sparkles'])))], 'room'),
    scene('levelup-insight', 'levelup', [svg(dark + voidEyes(12, 185) + voidCat('reach', 'overjoyed'), voidDefs(13))], 'void'),
    scene('todos-done', 'todos-done', [svg(cat('sit', 'overjoyed'))], 'room'),
    scene('todos-yay', 'todos-done', [svg(cat('reach', withMarks('overjoyed', ['hearts'])))], 'room'),
    scene('neglected', 'neglected', [svg(cat('sit', 'furious'))], 'room'),
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
    scene('lore-rain', 'lore', [svg(nightWindow('crescent', 95) + rain(P, [14, 20, 104, 120]) + at(cat('sit', 'content'), 230, 392, 0.94))], 'window'),
    // Something vast looks in at the window. He does not mind; it is family.
    scene('lore-window-eye', 'lore', [svg(windowEye(14, 20, 110, 120, P) + at(cat('sit', { ...face('content'), look: [-8, -2] }), 234, 392, 0.94))], 'window'),
    scene('dream-asleep', 'session-dream', [svg(nightWindow() + cat('loaf', 'asleep'))], 'window'),
    scene('decay-thinning', 'decay-thinning', [svg(nightWindow('crescent', 92) + at(cat('sit', 'lonely'), 234, 392, 0.94))], 'window'),
    ...nightAndMorning('window', (c) => nightWindow() + at(c, 234, 392, 0.94)),

    // The Hunter's Dream: white flowers, a lamp, the messengers.
    scene('lore-dream', 'lore', [svg(moon(344, 56, 34, P, 'paleblood', 172)
      + hunterDream() + cat('sit', 'content'))], 'dream'),
    scene('lore-messengers', 'lore', [svg(lamp(44, 120, P, 163) + cat('sit', { ...face('delighted'), look: [6, 10] })
      + messenger(66, 392, P, 281, 1.8) + messenger(360, 392, P, 284, 1.4) + messenger(110, 392, P, 287, 1.1))], 'dream'),
    ...nightAndMorning('dream', (c) => hunterDream() + c),

    // Yharnam's cathedral under the paleblood moon, and what clings to it.
    scene('lore-yharnam', 'lore', [svg(moon(340, 64, 40, P, 'paleblood', 174) + bat(300, 150, P) + bat(360, 180, P, 0.7, 115)
      + yharnam() + lifted(cat('sit', 'content')))], 'yharnam'),
    scene('lore-amygdala', 'lore', [svg(amygdala(64, 150, P, 271, 0.78) + yharnam(false) + lifted(at(cat('sit', { ...face('happy'), look: [-10, -4] }), 286, 392, 0.9)))], 'yharnam'),
    scene('hunt-yharnam', 'session-hunt', [svg(moon(340, 64, 40, P, 'paleblood', 175) + yharnam()
      + lifted(cat('sit', 'determined') + tricornOn('determined') + cleaver(292, 380, P)))], 'yharnam'),
    ...nightAndMorning('yharnam', (c) => moon(340, 64, 40, P, 'paleblood', 174) + yharnam() + lifted(c)),

    // The void: his true form, and the eyes that open around it.
    scene('lore-insight', 'lore', [svg(dark + voidEyes(14, 182) + lifted(tentacles(P)) + voidCat('sit', 'content'), voidDefs(9))], 'void'),
    scene('lore-trueform', 'lore', [svg(`<g transform="translate(-40 -60) scale(1.2)">${bustArt({ ...face('curious'), look: [0, -4] }, VOID)}</g>`
      + eyesInTheDark(P, 7, 183, [70, 40, 260, 130]), voidDefs(10))], 'void'),
    // The moon is not a moon: something hangs from it.
    scene('lore-moon-presence', 'lore', [svg(dark + lifted(tentacledMoon(66, 60, 40, P)) + eyesInTheDark(P, 5, 186, [270, 20, 120, 160])
      + at(voidCat('sit', { ...face('content'), look: [-8, -6] }), 240, 392, 0.94), voidDefs(12))], 'void'),
    scene('decay-fragmenting', 'decay-fragmenting', [svg(voidEyes(6, 187) + cat('sit', 'lonely', {}, 0, { ...P, ink: 'url(#d50)' }))], 'void'),
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
    scene('resurrected-back', 'resurrected', [svg(cat('sit', withMarks('overjoyed', ['sparkles']))
      + [[46, 392], [354, 392]].map(([x, y], i) => candle(x!, y!, P, false, 76 + i)).join(''))], 'room'),
    scene('resurrected-yay', 'resurrected', [svg(cat('reach', withMarks('delighted', ['sparkles']))
      + [[46, 392], [354, 392]].map(([x, y], i) => candle(x!, y!, P, false, 78 + i)).join(''))], 'room'),

    // Halloween, the last week of October.
    scene('lore-haunted', 'halloween', [svg(windowMoon(14, 20, 104, 120, P, 'blood', 93) + ghost(330, 150, P) + bat(350, 50, P, 0.8, 111)
      + at(cat('sit', 'curious'), 224, 392, 0.94))], 'halloween'),
    scene('lore-pumpkin', 'halloween', [svg(bat(60, 60, P) + bat(340, 90, P, 0.7, 112) + cat('sit', 'delighted', { skin: 'halo' })
      + pumpkin(76, 370, P))], 'halloween'),
    scene('lore-pumpkin-hold', 'halloween', [svg(bat(60, 60, P) + bat(340, 90, P, 0.8, 113)
      + holding(face('delighted'), P, scaled(pumpkin(HOLD[0], HOLD[1] + 6, P, 121), HOLD[0], HOLD[1] + 6, 1.2)))], 'halloween'),
    ...nightAndMorning('halloween', (c) => windowMoon(14, 20, 104, 120, P, 'blood', 93) + ghost(340, 170, P, 101, 0.8) + at(c, 234, 392, 0.94)),

    // Cameos: small busts the UI lays over other screens (quotes, lists).
    ...(['curious', 'content', 'happy', 'delighted', 'questioning', 'overjoyed', 'annoyed', 'proud', 'sleepy', 'flustered', 'hmph', 'surprised', 'scared'] as ExpressionName[])
      .map((name) => scene(`cameo-${name}`, 'cameo', [svg(bustAt(name, [200, 395], 1.28))], undefined, 72)),
    // The watcher peeking up from a corner, eyes following the cursor.
    ...([[-11, -6], [0, -10], [11, -6]] as Pt[]).map((look, i) =>
      scene(`watch-${['left', 'up', 'right'][i]}`, 'watch', [svg(placeHead({ ...face('curious'), look, tilt: 0 }, P, [200, 470], 1.35)
        + hideBelow(392))], undefined, 64)),
  ];
}

export { bubble, marks };
