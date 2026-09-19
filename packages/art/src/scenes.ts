// The scene library: every moment in CHARACTER.md, composed from poses,
// faces and props. A scene is a named moment with one or more frames (an
// animation plays them in order); the device picks one scene at random for
// its moment. Frames are full 400 x 400 SVGs; cameos are small busts the UI
// lays over other screens.

import { holding, placeHead, pose, type Pose } from './body.ts';
import { marks } from './marks.ts';
import { EXPRESSIONS, type ExpressionName } from './expressions.ts';
import { ellipse, rng, stroke, toPath, wobble, type Pt } from './ink.ts';
import {
  bat, book, bubble, candle, cardboardBox, cleaver, desk, DITHER, eyesInTheDark, ghost, graves, lamp, laptop, moon, mug,
  heldBook, pumpkin, quill, rain, runes, scaled, starfield, tentacles, tricorn, windowMoon,
} from './props.ts';
import { bustArt, DEVICE_PALETTE, SIZE, type Palette, type Wear } from './rig.ts';

export type Moment =
  | 'wake' | 'sleep' | 'session-axiom' | 'session-workshop' | 'session-heresy' | 'session-dream' | 'session-hunt'
  | 'sealed' | 'sealed-long' | 'sealed-short' | 'sealed-marathon' | 'levelup' | 'todos-done' | 'neglected'
  | 'decay-thinning' | 'decay-fragmenting' | 'decay-dormant' | 'lore' | 'halloween' | 'cameo' | 'watch'
  | 'ritual-0' | 'ritual-1' | 'ritual-2' | 'ritual-3' | 'ritual-4' | 'resurrected';

export type Scene = { id: string; moment: Moment; size: number; frames: string[] };

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

const face = (name: ExpressionName) => EXPRESSIONS[name];
const svg = (body: string, extraDefs = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}">${DITHER(P)}${extraDefs}<rect width="${SIZE}" height="${SIZE}" fill="#fff"/>${body}</svg>`;
const cat = (kind: Pose, name: ExpressionName, wear: Wear = {}, frame = 0, p: Palette = P) => pose(kind, face(name), p, wear, frame);

// Head and shoulders placed anywhere, for desk scenes and cameos.
function bustAt(name: ExpressionName, neck: Pt, scale: number, wear: Wear = {}, p: Palette = P, extra = ''): string {
  const [tx, ty] = [neck[0] - 200 * scale, neck[1] - 286 * scale];
  return `<g transform="translate(${tx.toFixed(1)} ${ty.toFixed(1)}) scale(${scale})">${bustArt(face(name), p, wear)}${extra}</g>`;
}

// Behind a desk: a big bust, the desk top hiding the rest, both front paws
// resting on the edge unless a prop sits there, props on the desk.
const DESK_Y = 318;
function atDesk(name: ExpressionName, onDesk: string, wear: Wear = {}, behind = '', p: Palette = P, paws: number[] = [146, 254]): string {
  const paw = (x: number, i: number) => `<path d="${toPath(wobble(ellipse(x, DESK_Y - 6, 22, 13, 28), 300 + i, 0.8))}" fill="${p.ink}"/>`
    + [-7, 5].map((dx, j) => `<path d="${toPath(wobble(stroke([[x + dx, DESK_Y - 13], [x + dx, DESK_Y - 3]], () => 3), 310 + i * 2 + j, 0.2))}" fill="${p.paper}"/>`).join('');
  return behind + bustAt(name, [200, 290], 0.78, wear, p)
    + `<rect x="0" y="${DESK_Y}" width="400" height="90" fill="#fff"/>` + desk(DESK_Y, p) + paws.map(paw).join('') + onDesk;
}

// Hides whatever lies below an edge and draws the edge, for things in front.
const hideBelow = (y: number) => `<rect x="0" y="${y}" width="400" height="${400 - y}" fill="#fff"/>`;

const scene = (id: string, moment: Moment, frames: string[], size = 200): Scene => ({ id, moment, size, frames });

export function scenes(): Scene[] {
  const moonWindow = windowMoon(250, 40, 120, 130, P, 'crescent');
  return [
    // Power on: he comes to meet you.
    scene('wake-wave', 'wake', [svg(cat('sit', 'curious')), svg(cat('wave', 'happy')), svg(cat('wave', 'delighted', {}, 1))]),
    scene('wake-peek', 'wake', [svg(cat('peek', 'asleep')), svg(cat('peek', 'curious'))]),
    scene('wake-box', 'wake', [
      svg(bustAt('curious', [200, 330], 0.7) + hideBelow(262) + cardboardBox(120, 262, 160, 120, P)),
      svg(bustAt('delighted', [200, 290], 0.7, {}, P) + hideBelow(262) + cardboardBox(120, 262, 160, 120, P)),
    ]),
    scene('wake-stretch', 'wake', [svg(cat('loaf', 'asleep')), svg(cat('loaf', 'sleepy')), svg(cat('sit', 'curious'))]),

    // Power off: goodnight.
    scene('sleep-wave', 'sleep', [svg(cat('wave', 'happy')), svg(cat('loaf', 'asleep'))]),
    scene('sleep-candle', 'sleep', [
      svg(cat('sit', 'sleepy') + candle(90, 390, P, true)),
      svg(`<rect width="400" height="400" fill="url(#d25)"/>` + cat('sit', 'asleep') + candle(90, 390, P, false)),
    ]),
    scene('sleep-book', 'sleep', [svg(atDesk('asleep', book(200, DESK_Y - 4, P) + mug(335, DESK_Y, P, 61, false), {}, '', P, [120, 262]))]),
    scene('sleep-moon', 'sleep', [svg(windowMoon(120, 30, 160, 170, P, 'full', 91) + cat('back', 'content'))]),
    scene('sleep-void', 'sleep', [svg(cat('sit', 'content')), svg(cat('sit', 'asleep', {}, 0, VOID), voidDefs(7))]),

    // Sessions, by folder.
    scene('axiom-study', 'session-axiom', [svg(atDesk('determined', book(200, DESK_Y - 4, P) + mug(335, DESK_Y, P), {}, '', P, [118, 282]))]),
    scene('axiom-laptop', 'session-axiom', [svg(atDesk('content', laptop(200, DESK_Y, P) + mug(335, DESK_Y, P), { headphones: true }, '', P, []))]),
    scene('workshop-laptop', 'session-workshop', [svg(atDesk('determined', laptop(200, DESK_Y, P), {}, '', P, [110, 290]))]),
    scene('workshop-vibing', 'session-workshop', [svg(atDesk('content', laptop(170, DESK_Y, P) + mug(330, DESK_Y, P), { headphones: true }, '', P, [262]))]),
    scene('heresy-quill', 'session-heresy', [svg(atDesk('determined', quill(318, DESK_Y, P) + candle(70, DESK_Y, P, true, 71)
      + book(196, DESK_Y - 4, P, 51), {}, '', P, [130]))]),
    scene('dream-moon', 'session-dream', [svg(atDesk('content', book(200, DESK_Y - 4, P), {}, moonWindow))]),
    scene('hunt-hunter', 'session-hunt', [svg(moon(300, 90, 70, P, 'paleblood') + cat('sit', 'determined')
      + placeHeadWear('determined') + cleaver(252, 370, P))]),

    // A session sealed: proud, or a comment on how it went.
    scene('sealed-proud', 'sealed', [svg(cat('sit', 'proud'))]),
    scene('sealed-happy', 'sealed', [svg(cat('sit', 'happy'))]),
    scene('sealed-long', 'sealed-long', [svg(cat('sit', 'flustered'))]),
    scene('sealed-short', 'sealed-short', [svg(cat('sit', 'annoyed'))]),
    scene('sealed-marathon', 'sealed-marathon', [svg(cat('sit', 'dizzy'))]),

    // Milestones and neglect.
    scene('levelup', 'levelup', [svg(pose('wave', { ...face('delighted'), marks: ['sparkles'] }, P))]),
    scene('todos-done', 'todos-done', [svg(cat('sit', 'overjoyed'))]),
    scene('neglected', 'neglected', [svg(cat('sit', 'furious'))]),

    // Decay.
    scene('decay-thinning', 'decay-thinning', [svg(windowMoon(110, 30, 180, 190, P, 'crescent', 92) + cat('back', 'lonely'))]),
    scene('decay-fragmenting', 'decay-fragmenting', [svg(cat('sit', 'lonely', {}, 0, { ...P, ink: 'url(#d50)' }))]),
    scene('decay-dormant', 'decay-dormant', [svg(cat('loaf', 'asleep', {}, 0, VOID) + eyesInTheDark(P, 5, 181, [0, 0, 400, 200]), voidDefs(8))]),

    // Lore screensavers: the old god at home.
    scene('lore-hunter', 'lore', [svg(moon(200, 120, 110, P, 'paleblood') + lamp(60, 150, P) + lamp(340, 170, P, 161)
      + cat('sit', 'content') + placeHeadWear('content'))]),
    scene('lore-insight', 'lore', [svg(eyesInTheDark(P, 16, 182, [0, 0, 400, 400], [200, 230, 150]) + tentacles(P)
      + cat('sit', 'content', {}, 0, VOID), voidDefs(9))]),
    scene('lore-haunted', 'halloween', [svg(windowMoon(30, 30, 140, 150, P, 'blood', 93) + ghost(320, 150, P) + bat(90, 250, P)
      + bat(330, 60, P, 0.8, 111) + cat('sit', 'curious'))]),
    scene('lore-pumpkin', 'halloween', [svg(bat(80, 70, P) + bat(320, 110, P, 0.7, 112) + cat('sit', 'delighted', { skin: 'halo' })
      + pumpkin(92, 370, P))]),

    // More of him: the yay, the morning mug, the long blink, the dream.
    scene('wake-yay', 'wake', [svg(cat('sit', 'curious')), svg(cat('reach', 'delighted', {}, 1)), svg(cat('reach', 'delighted'))]),
    scene('wake-coffee', 'wake', [svg(holding(face('sleepy'), P, scaled(mug(196, 294, P, 62), 196, 294, 1.5))), svg(holding(face('happy'), P, scaled(mug(196, 294, P, 62), 196, 294, 1.5)))]),
    scene('sleep-blink', 'sleep', [svg(cat('sit', 'curious')), svg(cat('sit', 'content')), svg(cat('loaf', 'asleep'))]),
    scene('sleep-lamp', 'sleep', [
      svg(lamp(90, 250, P) + cat('sit', 'sleepy')),
      svg(`<rect width="400" height="400" fill="url(#d25)"/>` + lamp(90, 250, P) + cat('sit', 'asleep')),
    ]),
    scene('axiom-reading', 'session-axiom', [svg(holding({ ...face('determined'), look: [2, 12] }, P, heldBook(200, 288, P)))]),
    scene('hunt-lantern', 'session-hunt', [svg(`<rect width="400" height="220" fill="url(#d25)"/>` + moon(80, 70, 44, P, 'paleblood', 171)
      + holding(face('determined'), P, scaled(lamp(200, 262, P, 162), 200, 262, 1.5)) + placeHeadWear('determined'))]),
    scene('dream-asleep', 'session-dream', [svg(windowMoon(250, 30, 120, 130, P, 'crescent', 94) + starfield({ ...P, paper: '#000' }, 12, 201, [20, 20, 200, 150])
      + cat('loaf', 'asleep'))]),
    scene('heresy-runes', 'session-heresy', [svg(atDesk('content', quill(318, DESK_Y, P, 81) + book(190, DESK_Y - 4, P, 53), {}, runes(40, 150, P, 221, 4), P, [130]))]),
    scene('levelup-yay', 'levelup', [svg(pose('reach', { ...face('delighted'), marks: ['sparkles'] }, P))]),
    scene('todos-yay', 'todos-done', [svg(pose('reach', { ...face('overjoyed'), marks: ['hearts'] }, P))]),
    scene('neglected-sulk', 'neglected', [svg(cat('back', 'content') + marks(['anger'], 400, P))]),
    scene('lore-dream', 'lore', [svg(`<rect width="400" height="260" fill="url(#d25)"/>` + moon(300, 80, 56, P, 'paleblood', 172)
      + graves(P) + lamp(70, 150, P, 163) + cat('back', 'content'))]),
    scene('lore-rain', 'lore', [svg(windowMoon(90, 30, 220, 230, P, 'crescent', 95) + rain(P, [100, 40, 200, 210]) + cat('back', 'content'))]),
    // His true form, glimpsed: the void where a head should be, eyes opening across it.
    scene('lore-trueform', 'lore', [svg(`<g transform="translate(-40 -60) scale(1.2)">${bustArt({ ...face('curious'), look: [0, -4] }, VOID)}</g>`
      + eyesInTheDark(P, 7, 183, [70, 40, 260, 130]), voidDefs(10))]),
    scene('lore-pumpkin-hold', 'halloween', [svg(bat(70, 60, P) + bat(330, 90, P, 0.8, 113) + holding(face('delighted'), P, scaled(pumpkin(200, 282, P, 121), 200, 282, 1.3)))]),

    // The rite that wakes him from dormancy: his void form asleep, a candle lit
    // for every quarter hour, then his return.
    ...[0, 1, 2, 3, 4].map((lit) => scene(`ritual-${lit}`, `ritual-${lit}` as Moment, [svg(
      `<rect width="400" height="400" fill="url(#d25)"/>` + runes(150, 140, P, 222 + lit, 3)
      + cat('loaf', 'asleep', {}, 0, VOID)
      + [[80, 396], [370, 396], [40, 262], [372, 262]].map(([x, y], i) => candle(x!, y!, P, i < lit, 72 + i)).join(''),
      voidDefs(11))])),
    scene('resurrected-back', 'resurrected', [svg(pose('sit', { ...face('overjoyed'), marks: ['sparkles'] }, P)
      + [[46, 392], [354, 392]].map(([x, y], i) => candle(x!, y!, P, false, 76 + i)).join(''))]),
    scene('resurrected-yay', 'resurrected', [svg(pose('reach', { ...face('delighted'), marks: ['sparkles'] }, P)
      + [[46, 392], [354, 392]].map(([x, y], i) => candle(x!, y!, P, false, 78 + i)).join(''))]),

    // Cameos: small busts the UI lays over other screens (quotes, lists).
    ...(['curious', 'content', 'happy', 'delighted', 'questioning', 'overjoyed', 'annoyed', 'proud', 'sleepy', 'flustered', 'hmph', 'surprised', 'scared'] as ExpressionName[])
      .map((name) => scene(`cameo-${name}`, 'cameo', [svg(bustAt(name, [200, 395], 1.28))], 72)),
    // The watcher peeking up from a corner, eyes following the cursor.
    ...([[-11, -6], [0, -10], [11, -6]] as Pt[]).map((look, i) =>
      scene(`watch-${['left', 'up', 'right'][i]}`, 'watch', [svg(placeHead({ ...face('curious'), look, tilt: 0 }, P, [200, 470], 1.35)
        + hideBelow(392))], 64)),
  ];

  // The hunter's tricorn over the sitting pose's head.
  function placeHeadWear(name: ExpressionName): string {
    return `<g transform="translate(${(200 - 200 * 0.54).toFixed(1)} ${(180 - 286 * 0.54).toFixed(1)}) scale(0.54) rotate(${face(name).tilt ?? 0} 200 286)">${tricorn(P)}</g>`;
  }
}

export { bubble };
