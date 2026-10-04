// The Arcana (docs/superpowers/specs/2026-10-04-deck-design.md): the cards
// as the table deals them. A card is a Moodle card or one of yours; either
// way it has a dark question face, a light answer face and the deck's back.
// Faces are HTML with maths as \( \), set by KaTeX, and step their type down
// until they fit. Kael'thos is drawn from the locked rig, dark against a lamp.
import renderMathInElement from 'katex/contrib/auto-render';
import 'katex/dist/katex.min.css';
import { clozeNums, type CardDto, type DueCardDto, type Mask, type NoteDto, type NoteFields, type NoteKind } from '@aura/shared';
import art from './gl/art.json';

export const ROMAN = ['0', 'I', 'II', 'III', 'IV', 'V'];
const REDUCE = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
// Your own fields are plain text with maths; Moodle's are its HTML.
const plain = (s = '') => esc(s).replace(/\r?\n/g, '<br>');
export const imageUrl = (id?: number) => (id ? `/api/v1/academy/own/images/${id}` : '');

export type TableCard = {
  key: string; kind: NoteKind | 'moodle'; name: string; deck: string; n: number; flip?: boolean;
  front?: string; back?: string; text?: string; plain?: string;
  img?: string; masks?: Mask[]; labels?: string[]; mode?: 'all' | 'one';
  box?: number;                                   // a Moodle card's Leitner box
  moodle?: CardDto;                               // where its answer goes
  own?: DueCardDto;                               // or this
};

export const fromMoodle = (c: CardDto, deck: string): TableCard => ({ key: `m${c.id}`, kind: 'moodle', name: c.name, deck, n: 1, front: c.front, back: c.back, box: c.box, moodle: c });

// The card a note makes for one of its numbers.
export function fromNote(note: { kind: NoteKind; name: string; fields: NoteFields }, ord: number, deck: string, key = ''): TableCard {
  const f = note.fields, base = { key, kind: note.kind, name: note.name || 'untitled', deck, n: ord };
  if (note.kind === 'occlusion') return { ...base, name: `${base.name} ${ord}`, img: imageUrl(f.imageId), masks: f.masks ?? [], labels: f.labels ?? [], mode: f.mode ?? 'all' };
  if (note.kind === 'cloze') return { ...base, name: `${base.name} c${ord}`, text: f.text ?? '' };
  return { ...base, front: f.front ?? '', back: f.back ?? '', plain: f.plain, flip: note.kind === 'reverse' && ord === 2 };
}
export const fromDue = (d: DueCardDto, deck: string): TableCard => ({ ...fromNote(d.note, d.ord, deck, `o${d.id}`), own: d });
export function cardsOfNote(note: { kind: NoteKind; name: string; fields: NoteFields }, deck: string): TableCard[] {
  const ords = note.kind === 'cloze' ? clozeNums(note.fields.text ?? '') : note.kind === 'occlusion' ? (note.fields.masks ?? []).map((_, i) => i + 1) : note.kind === 'reverse' ? [1, 2] : [1];
  return ords.map((o) => fromNote(note, o, deck, `p${o}`));
}
export type { NoteDto };

// A cloze for its number: the asked one a bar (its hint in it), the others
// read as they are; on the answer, the asked one underlined.
function cloze(text: string, n: number, side: 'q' | 'a') {
  return plain(text).replace(/\{\{c(\d+)::([\s\S]*?)(?:::([\s\S]*?))?\}\}/g, (_, k, ans, hint) =>
    (Number(k) !== n ? ans : side === 'q' ? `<span class="bar">${hint || '[ . . . ]'}</span>` : `<mark>${ans}</mark>`));
}
const place = (m: Mask) => `left:${m.x * 100}%;top:${m.y * 100}%;width:${m.w * 100}%;height:${m.h * 100}%`;

export function faces(c: TableCard): { q: string; a: string } {
  const mark = c.box != null ? ROMAN[c.box] : c.kind === 'cloze' ? `C${c.n}` : c.kind === 'occlusion' ? String(c.n) : 'O';
  const head = (side: 'q' | 'a') => `<span class="corner tl"></span><span class="corner br"></span><div class="head"><b>${mark}</b><span>${side === 'q' ? 'quaestio' : 'responsio'}</span></div><div class="rule"></div>`;
  const foot = `<div class="foot"><span>${esc(c.name)}</span><span>${esc(c.deck)}</span></div>`;
  let q: string, a: string, asked = '';
  if (c.kind === 'moodle') { q = c.front!; a = c.back!; }
  else if (c.kind === 'cloze') { q = cloze(c.text!, c.n, 'q'); a = cloze(c.text!, c.n, 'a'); }
  else if (c.kind === 'occlusion') {
    const bars = (c.masks ?? []).map((m, i) => (i !== c.n - 1 && c.mode === 'one' ? '' : `<i class="${i === c.n - 1 ? 'target' : ''}" style="${place(m)}"></i>`)).join('');
    q = `<div class="occ"><img alt="" src="${c.img}">${bars}</div><div class="ask">What is under the outlined bar?</div>`;
    a = `<div class="occ"><img alt="" src="${c.img}">${bars}</div><div class="ask">${plain(c.labels?.[c.n - 1] ?? '')}</div>`;
  } else if (c.kind === 'type') { q = `${plain(c.front)}<div class="typed"><input placeholder="type it" aria-label="your answer"></div>`; a = plain(c.back); asked = plain(c.front); }
  else if (c.flip) { q = plain(c.back); a = plain(c.front); asked = plain(c.back); }
  else { q = plain(c.front); a = plain(c.back); asked = plain(c.front); }
  return {
    q: `${head('q')}<div class="body"><div>${q}</div></div><div class="seal">· · ·</div>${foot}<div class="shine"></div>`,
    a: `${head('a')}${asked ? `<div class="asked">${asked}</div>` : ''}<div class="body"><div>${a}</div></div>${foot}<div class="shine"></div>`,
  };
}

// Maths set, then each face's type stepped down until its widest formula or
// picture sits inside nine tenths of the card and the whole fits its height.
export function typeset(el: HTMLElement) {
  renderMathInElement(el, { delimiters: [{ left: '\\(', right: '\\)', display: false }, { left: '\\[', right: '\\]', display: true }], throwOnError: false });
}
export function fit(card: HTMLElement) {
  for (const body of card.querySelectorAll<HTMLElement>('.body')) {
    const inner = body.firstElementChild as HTMLElement | null;
    if (!inner || inner.querySelector('.occ')) continue;
    let size = parseFloat(getComputedStyle(inner).fontSize);
    const widest = () => Math.max(0, ...[...inner.querySelectorAll<HTMLElement>('.katex, img')].map((m) => m.offsetWidth));
    for (let k = 0; k < 14 && (widest() > (body.clientWidth - 4) * 0.9 || inner.scrollHeight > (body.clientHeight - 4) * 0.94); k++) { size *= 0.92; inner.style.fontSize = `${size}px`; }
  }
}

// ---- 1-bit art -------------------------------------------------------------
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
export const bayer = (x: number, y: number) => BAYER[(y & 3) * 4 + (x & 3)]!;
const INK = [197, 188, 171], HI = [230, 224, 212], GROUND = [12, 11, 10];
function dither(ctx: CanvasRenderingContext2D, W: number, H: number) {
  const img = ctx.getImageData(0, 0, W, H), d = img.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4, L = d[i]! / 255, c = L > 0.9 ? HI : L > bayer(x, y) * 0.96 + 0.03 ? INK : GROUND;
    d[i] = c[0]!; d[i + 1] = c[1]!; d[i + 2] = c[2]!; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}
// The back of every card: his eye in a ring of stars, framed.
let back = '';
export function cardBack(): string {
  if (back) return back;
  const W = 100, H = 160, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d', { willReadFrequently: true })!;
  const g = x.createRadialGradient(W / 2, H / 2, 4, W / 2, H / 2, 90); g.addColorStop(0, 'rgba(255,255,255,.5)'); g.addColorStop(1, 'rgba(255,255,255,.03)');
  x.fillStyle = '#000'; x.fillRect(0, 0, W, H); x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.strokeStyle = '#fff'; x.strokeRect(5.5, 5.5, W - 11, H - 11); x.strokeRect(8.5, 8.5, W - 17, H - 17);
  for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2; x.fillStyle = '#fff'; x.fillRect(W / 2 + Math.cos(a) * 34 - 1, H / 2 + Math.sin(a) * 34 - 1, 2, 2); }
  x.beginPath(); x.arc(W / 2, H / 2, 24, 0, Math.PI * 2); x.fillStyle = 'rgba(255,255,255,.75)'; x.fill(); x.stroke();
  x.beginPath(); x.ellipse(W / 2, H / 2, 5, 20, 0, 0, Math.PI * 2); x.fillStyle = '#000'; x.fill();
  dither(x, W, H);
  return (back = c.toDataURL());
}

// A card on the table: turned from its back to its question, and between
// question and answer as often as wanted. Picture cards lie landscape.
export type CardEl = HTMLElement & { card: TableCard; turn: (to?: 'q' | 'a') => void };
export function makeCard(c: TableCard): CardEl {
  const el = document.createElement('div') as unknown as CardEl;
  el.className = `card${c.kind === 'occlusion' ? ' wide' : ''}`; el.dataset.side = 'down';
  const f = faces(c);
  el.innerHTML = `<div class="tilt"><div class="inner"><div class="face q">${f.q}</div><div class="face back"><img alt="" src="${cardBack()}"></div><div class="face a" style="visibility:hidden">${f.a}</div></div></div>`;
  const backFace = el.querySelector<HTMLElement>('.face.back')!, ans = el.querySelector<HTMLElement>('.face.a')!;
  typeset(el);
  requestAnimationFrame(() => fit(el));
  el.card = c;
  el.turn = (to) => {
    const side = to ?? (el.dataset.side === 'q' ? 'a' : 'q');
    // Off the deck, the far side stops being its back once it has turned away.
    if (el.dataset.side === 'down') setTimeout(() => { backFace.style.visibility = 'hidden'; ans.style.visibility = ''; }, REDUCE() ? 0 : 420);
    el.classList.add('turning'); setTimeout(() => el.classList.remove('turning'), 650);
    el.dataset.side = side;
  };
  const tilt = el.querySelector<HTMLElement>('.tilt')!;
  el.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    tilt.style.transform = `rotateY(${(x - 0.5) * 12}deg) rotateX(${(0.5 - y) * 9}deg)`;
    el.querySelectorAll<HTMLElement>('.shine').forEach((s) => { s.style.setProperty('--sx', `${(s.closest('.face.a') ? 1 - x : x) * 100}%`); s.style.setProperty('--sy', `${y * 100}%`); });
  });
  el.addEventListener('pointerleave', () => { tilt.style.transform = ''; });
  return el;
}

// ---- Kael'thos at the head of the table -------------------------------------
type Pose = 'curious' | 'cameo';
const poses: Partial<Record<Pose, HTMLImageElement>> = {};
const posesReady = Promise.all((['curious', 'cameo'] as Pose[]).map((k) => new Promise<void>((ok) => {
  const img = new Image();
  img.onload = () => { poses[k] = img; ok(); };
  // The rig's white page taken away, so he stands on the dark.
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent((art as Record<string, string>)[k]!.replace('<rect width="400" height="400" fill="#fff"/>', ''))}`;
})));
// Him on a canvas: fur ground-dark, eyes and ears lit, a lamp's glow
// dithered behind him, breathing a little. Stops when stop() is called.
export function portrait(canvas: HTMLCanvasElement, size: number, glowAt = 0.42) {
  canvas.width = canvas.height = size;
  const x = canvas.getContext('2d', { willReadFrequently: true })!;
  const layer = document.createElement('canvas'); layer.width = layer.height = size;
  const lx = layer.getContext('2d', { willReadFrequently: true })!;
  let pose: Pose = 'curious', raf = 0, live = true;
  const draw = (now: number) => {
    const img0 = poses[pose];
    if (img0) {
      const still = REDUCE(), bob = still ? 0 : Math.sin(now / 1100) * size * 0.006;
      lx.clearRect(0, 0, size, size); lx.drawImage(img0, 0, bob, size, size);
      const cat = lx.getImageData(0, 0, size, size).data;
      const img = x.createImageData(size, size), d = img.data, flick = still ? 1 : 0.94 + Math.sin(now / 230) * 0.03 + Math.sin(now / 97) * 0.02;
      for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
        const i = (py * size + px) * 4, a = cat[i + 3]! / 255, lum = cat[i]! / 255;
        const glow = Math.max(0, 0.34 - Math.hypot(px / size - 0.5, (py / size - glowAt) * 1.15) * 0.92) * flick;
        const c = a > 0.5 ? (lum > 0.5 ? HI : GROUND) : glow > bayer(px, py) * 0.5 ? [58, 54, 49] : null;
        if (!c) { d[i + 3] = 0; continue; }
        d[i] = c[0]!; d[i + 1] = c[1]!; d[i + 2] = c[2]!; d[i + 3] = 255;
      }
      x.putImageData(img, 0, 0);
    }
    if (live) raf = requestAnimationFrame(draw);
  };
  posesReady.then(() => { if (live) raf = requestAnimationFrame(draw); });
  return { set(p: Pose) { pose = p; }, stop() { live = false; cancelAnimationFrame(raf); } };
}

// The table's cloth: a lamp's pool in a slow weave, dithered.
export function cloth(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!;
  let W = 0, H = 0, t = 0;
  const size = () => { const r = canvas.getBoundingClientRect(); W = Math.max(40, Math.round(r.width / 3)); H = Math.max(40, Math.round(r.height / 3)); canvas.width = W; canvas.height = H; draw(); };
  const draw = () => {
    const img = ctx.createImageData(W, H), d = img.data;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const lamp = Math.max(0, 0.24 - Math.hypot((x / W - 0.5) * 1.1, (y / H - 0.42) * 1.5) * 0.4);
      const weave = 0.035 * (Math.sin(x * 0.9 + t) * Math.sin(y * 0.9)) + 0.025 * Math.sin((x - y) * 0.11 + t * 0.6);
      const on = lamp + weave > bayer(x, y) * 0.5, i = (y * W + x) * 4;
      d[i] = on ? 58 : 14; d[i + 1] = on ? 54 : 13; d[i + 2] = on ? 49 : 12; d[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  };
  const ro = new ResizeObserver(size); ro.observe(canvas);
  const timer = REDUCE() ? 0 : window.setInterval(() => { t += 0.06; draw(); }, 160);
  return () => { ro.disconnect(); clearInterval(timer); };
}

// The streaks: rewards up the right edge, each a name and a multiplier.
export const STREAKS = [
  { at: 3, name: 'Third Eye', says: 'double insight', mult: 2, icon: '<circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" stroke-width="1.6"/><ellipse cx="10" cy="10" rx="1.6" ry="5" fill="currentColor"/>' },
  { at: 5, name: 'Familiar', says: 'triple insight', mult: 3, icon: '<path d="M4 16 L6 5 L9 9 L11 9 L14 5 L16 16 Z" fill="none" stroke="currentColor" stroke-width="1.6"/>' },
  { at: 7, name: 'Black Sun', says: 'four times insight', mult: 4, icon: '<circle cx="10" cy="10" r="4.5" fill="currentColor"/><path d="M10 1v3M10 16v3M1 10h3M16 10h3M3.6 3.6l2.1 2.1M14.3 14.3l2.1 2.1M3.6 16.4l2.1-2.1M14.3 5.7l2.1-2.1" stroke="currentColor" stroke-width="1.6"/>' },
  { at: 10, name: 'Event Horizon', says: 'five times insight', mult: 5, icon: '<circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="10" cy="10" r="4" fill="currentColor"/>' },
];
export const LINES = {
  deal: ['Draw. You have time. I have rather more.', 'Another. The will grows by being used.', 'Look at it properly before you turn it.'],
  right: ['Correct. Obviously.', 'Yes. You did that, not me.', 'Good. Keep the thread taut.'],
  wrong: ['Again, then. Repetition is how the will learns.', 'It slipped. Back to the first box; it will come round.', 'Wrong, and that is useful. Now you know where to look.'],
};
// How long until a card comes back, said shortly: 1 min, 6 min, 3 days.
export function until(iso: string, now = Date.now()) {
  const m = Math.max(1, Math.round((Date.parse(iso) - now) / 60_000));
  return m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 60)} h` : m < 60 * 24 * 60 ? `${Math.round(m / 1440)} days` : `${Math.round(m / 43_200)} months`;
}
