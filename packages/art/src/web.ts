// The dashboard's drawings of him in each skin: packages/web/src/gl/art.json
// gets "<skin>/<key>" beside his own "<key>", and the web picks the one for
// the skin the device last reported (web/src/worn.ts). Run after changing a
// skin: pnpm --filter @aura/art web.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { holding, HOLD, pose } from './body.ts';
import { EXPRESSIONS, type Expression } from './expressions.ts';
import { DITHER, heldBook } from './props.ts';
import { bustArt, DEVICE_PALETTE as P, type Wear } from './rig.ts';

const file = resolve(import.meta.dirname, '../../web/src/gl/art.json');
const art = JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>;

// Each drawing on a white ground or none, as his own is.
const svg = (key: string, body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">${DITHER(P)}`
  + `${art[key]!.includes('<rect width="400" height="400" fill="#fff"/>') ? '<rect width="400" height="400" fill="#fff"/>' : ''}${body}</svg>`;
// A big head-and-shoulders, as the cameos are drawn.
const cameo = (e: Expression, wear: Wear) => `<g transform="translate(${200 - 200 * 1.28} ${395 - 286 * 1.28}) scale(1.28)">${bustArt(e, P, wear)}</g>`;
const reading = (wear: Wear) => holding({ ...EXPRESSIONS.determined, look: [2, 12] }, P, heldBook(HOLD[0], HOLD[1] + 6, P), wear);

// Per skin, the wear for each drawing. The Ye skin picks an era per drawing:
// the shades day to day, the Dropout Bear with his books, the suit keeping time.
const SKINS: Record<string, Record<string, Wear>> = {
  halloween: Object.fromEntries(['sitting', 'cameo', 'curious', 'reading', 'still', 'keeper', 'keeperDone'].map((k) => [k, { skin: 'halloween' }])),
  ye: {
    sitting: { skin: 'ye', ye: 'shades' }, cameo: { skin: 'ye', ye: 'shades' }, curious: { skin: 'ye', ye: 'shades' },
    reading: { skin: 'ye', ye: 'bear' }, keeper: { skin: 'ye', ye: 'suit' }, keeperDone: { skin: 'ye', ye: 'suit' },
  },
};
const draw: Record<string, (wear: Wear) => string> = {
  // The Ye skin's costumes fit a body square to us, so he sits that way in it.
  sitting: (w) => pose(w.skin === 'ye' ? 'front' : 'sit', EXPRESSIONS.proud, P, w),
  cameo: (w) => cameo(EXPRESSIONS.content, w),
  curious: (w) => cameo(EXPRESSIONS.curious, w),
  reading,
  still: (w) => pose('still', EXPRESSIONS.serene, P, w),
  keeper: (w) => pose('keeper', EXPRESSIONS.vowing, P, w),
  keeperDone: (w) => pose('keeper', EXPRESSIONS.proud, P, w),
};

for (const [skin, keys] of Object.entries(SKINS)) {
  for (const [key, wear] of Object.entries(keys)) art[`${skin}/${key}`] = svg(key, draw[key]!(wear));
}
writeFileSync(file, JSON.stringify(art));
console.log(Object.keys(art).filter((k) => k.includes('/')).join(' '));
