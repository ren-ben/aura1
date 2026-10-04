<script setup lang="ts">
// The Arcana over the Academy (docs/superpowers/specs/2026-10-04-deck-design.md):
// Kael'thos deals your decks at his table, Moodle's and your own; pull the
// lever and he steps back while your files are thrown down on the same
// cloth, to write cards on. Back to the table, and they are swept off.
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { BOXES, type CardDto, type DeckDto, type Mask, type NoteDto, type NoteKind, type OwnDeckDto } from '@aura/shared';
import { LINES, ROMAN, STREAKS, cardsOfNote, cloth, esc, fromDue, fromMoodle, imageUrl, makeCard, portrait, typeset, until, type CardEl, type TableCard } from '../arcana';
import { deckApi, folioApi, type NoteBody } from '../store';

const emit = defineEmits<{ close: [] }>();
const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = (ms: number) => new Promise((r) => setTimeout(r, REDUCE ? 0 : ms));
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)]!;

// ---- the decks -----------------------------------------------------------
const moodle = ref<DeckDto[]>([]);
const own = ref<OwnDeckDto[]>([]);
type Which = { src: 'moodle' | 'own'; id: number };
const current = ref<Which | null>(null);
const label = (w: Which) => (w.src === 'moodle' ? moodle.value.find((d) => d.id === w.id)?.name : `file ${own.value.find((d) => d.id === w.id)?.code}`) ?? '';
const chips = computed(() => [
  ...moodle.value.map((d) => ({ src: 'moodle' as const, id: d.id, name: d.name, count: d.boxes.slice(1).reduce((a, n) => a + n, 0) + d.boxes[0]! })),
  ...own.value.filter((d) => d.notes.length).map((d) => ({ src: 'own' as const, id: d.id, name: `file ${d.code}`, count: d.due })),
]);
const same = (a: Which | null, b: Which) => !!a && a.src === b.src && a.id === b.id;
async function load() {
  const [f, o] = await Promise.all([folioApi.list().catch(() => null), deckApi.own().catch(() => [])]);
  moodle.value = f?.decks ?? []; own.value = o;
}

// ---- the table -----------------------------------------------------------
const stage = ref<HTMLElement | null>(null), felt = ref<HTMLElement | null>(null), clothEl = ref<HTMLCanvasElement | null>(null), dealerEl = ref<HTMLElement | null>(null), dealerCanvas = ref<HTMLCanvasElement | null>(null);
const voice = ref(pick(LINES.deal));
const writing = ref(false);
const streak = ref(0), insight = ref(0);
const mult = computed(() => STREAKS.filter((s) => streak.value >= s.at).pop()?.mult ?? 1);
const fill = (s: (typeof STREAKS)[number], i: number) => { const prev = i ? STREAKS[i - 1]!.at : 0; return Math.max(0, Math.min(1, (streak.value - prev) / (s.at - prev))); };
const banner = ref<(typeof STREAKS)[number] | null>(null);
const judging = ref(false);
const pops = ref<{ id: number; x: number; y: number; text: string }[]>([]);
const ladder = ref<number[]>([0, 0, 0, 0, 0, 0]);
const flash = ref(-1);
let queue: TableCard[] = [], live: CardEl | null = null, kael: ReturnType<typeof portrait> | null = null;
const liveCard = ref<TableCard | null>(null);

async function cardsOf(w: Which): Promise<TableCard[]> {
  if (w.src === 'moodle') {
    const name = moodle.value.find((d) => d.id === w.id)?.name ?? '';
    const cards = await deckApi.moodleCards(w.id).catch(() => [] as CardDto[]);
    ladder.value = [0, 1, 2, 3, 4, 5].map((b) => cards.filter((c) => c.box === b).length);
    // The deck's boxes from the first, then what is still in the pool.
    return cards.slice().sort((a, b) => (a.box || 9) - (b.box || 9)).map((c) => fromMoodle(c, name));
  }
  const code = own.value.find((d) => d.id === w.id)?.code ?? '';
  return (await deckApi.due(w.id).catch(() => [])).map((d) => fromDue(d, `file ${code}`));
}
function size(c: TableCard) {
  const w = felt.value!.clientWidth, h = felt.value!.clientHeight;
  if (c.kind === 'occlusion') { const cw = Math.min(660, w * 0.86, (h - 20) * 1.55); return { cw, x: w / 2 - cw / 2, y: (h - cw / 1.55) / 2 }; }
  const cw = Math.min(330, w * 0.62, (h - 20) / 1.34);
  return { cw, x: w / 2 - cw / 2, y: (h - cw * 1.34) / 2 };
}
async function start() {
  if (!current.value) { voice.value = 'No deck yet. Bind Moodle in the folios, or pull the lever and write one.'; return; }
  queue = await cardsOf(current.value);
  voice.value = pick(LINES.deal);
  deal();
}
function deal() {
  judging.value = false;
  if (!queue.length) { liveCard.value = null; voice.value = current.value?.src === 'own' ? 'Nothing due in this file. It will come round.' : 'This deck is spent for now. Choose another.'; return; }
  const c = queue.shift()!, el = makeCard(c), s = size(c);
  el.style.setProperty('--cw', `${s.cw}px`); el.style.left = `${s.x}px`; el.style.top = `${-s.cw}px`; el.style.transform = 'scale(.55)'; el.style.opacity = '0';
  felt.value!.appendChild(el); live = el; liveCard.value = c; kael?.set('curious');
  requestAnimationFrame(() => requestAnimationFrame(() => { el.style.top = `${s.y}px`; el.style.transform = 'scale(1)'; el.style.opacity = '1'; }));
  el.addEventListener('click', (e) => {
    if (el.dataset.swiped) { delete el.dataset.swiped; return; }
    if ((e.target as HTMLElement).closest('.typed')) return;
    el.turn(); if (el.dataset.side === 'a') judging.value = true;
  });
  // A swipe judges, once the answer has been seen.
  let sx: number | null = null;
  el.addEventListener('pointerdown', (e) => { if (!judging.value || (e.target as HTMLElement).closest('.typed')) return; sx = e.clientX; });
  el.addEventListener('pointermove', (e) => { if (sx === null) return; const dx = e.clientX - sx; if (Math.abs(dx) > 6) { el.style.transition = 'none'; el.style.transform = `translateX(${dx}px) rotate(${dx / 20}deg)`; } });
  el.addEventListener('pointerup', (e) => {
    if (sx === null) return; const dx = e.clientX - sx; sx = null; el.style.transition = '';
    if (Math.abs(dx) > s.cw / 3) { el.dataset.swiped = '1'; decide(dx > 0 ? (c.own ? 2 : 1) : 0); } else el.style.transform = '';
  });
}
// The buttons: Moodle's two, or Anki's four with when each brings it back.
const verdicts = computed(() => {
  const c = liveCard.value;
  if (!c) return [];
  if (c.own) return ['again', 'hard', 'good', 'easy'].map((k, i) => ({ k, r: i, says: until(c.own!.next[i]!) }));
  return [{ k: 'nicht gewusst', r: 0, says: 'back to I' }, { k: 'gewusst', r: 1, says: `up to ${ROMAN[Math.min(5, Math.max(1, c.box ?? 0) + 1)]}` }];
});
let popId = 0;
async function decide(r: number) {
  if (!live || !judging.value) return;
  const el = live, c = el.card, right = c.own ? r > 0 : r === 1;
  judging.value = false; live = null;
  const rect = el.getBoundingClientRect(), sr = stage.value!.getBoundingClientRect();
  if (c.moodle) {
    const box = right ? Math.min(5, Math.max(1, c.box ?? 0) + 1) : 1;
    ladder.value[c.box ?? 0]!--; ladder.value[box]!++; flash.value = box; setTimeout(() => { flash.value = -1; }, 700);
    deckApi.answer(c.moodle.id, right).catch(() => {});
  } else if (c.own) {
    deckApi.review(c.own.id, r + 1).catch(() => {});
    if (r === 0) queue.push(c);
  }
  if (right) {
    streak.value++;
    const gain = 10 * (c.own ? r : Math.max(1, c.box ?? 0) + 1) * mult.value;
    insight.value += gain;
    const id = ++popId; pops.value.push({ id, x: rect.left - sr.left + rect.width / 2 - 30, y: rect.top - sr.top + 20, text: `+${gain}` }); setTimeout(() => { pops.value = pops.value.filter((p) => p.id !== id); }, 1000);
    el.classList.add('gone-up'); kael?.set('cameo');
    const earned = STREAKS.find((s) => s.at === streak.value);
    if (earned) { banner.value = earned; setTimeout(() => { if (banner.value === earned) banner.value = null; }, 1900); }
    else voice.value = pick(LINES.right) + (streak.value >= 2 ? ` ${streak.value} in a row.` : '');
  } else {
    const lost = streak.value; streak.value = 0;
    el.classList.add('burn'); stage.value!.classList.add('shake'); setTimeout(() => stage.value?.classList.remove('shake'), 400);
    voice.value = pick(LINES.wrong) + (lost >= 3 ? ` The ${lost}-streak is gone.` : '');
  }
  await wait(650); el.remove(); deal();
}
// He gathers the card back up to him.
async function gather() {
  judging.value = false;
  const el = live; live = null; liveCard.value = null;
  if (!el) return;
  el.style.top = `${-el.offsetHeight}px`; el.style.transform = 'scale(.45) rotate(-8deg)'; el.style.opacity = '0';
  await wait(450); el.remove();
}
async function choose(w: Which) {
  if (same(current.value, w) || moving) return;
  current.value = w; await gather(); start();
}

// ---- the lever: the desk is the same table -------------------------------
let moving = false;
const deskEl = ref<HTMLElement | null>(null), cabinet = ref<HTMLElement | null>(null), report = ref<HTMLElement | null>(null), side = ref<HTMLElement | null>(null), backBtn = ref<HTMLElement | null>(null);
const deskOpen = ref(false);
async function go(steps: () => Promise<void>) {
  if (moving) return; moving = true;
  try { await steps(); } finally { moving = false; }
}
const PIECES = () => [
  { el: cabinet.value!, from: 'translate(-120%, -30%) rotate(-24deg)', delay: 0 },
  { el: report.value!, from: 'translate(10%, 110%) rotate(14deg) scale(1.08)', delay: 140 },
  { el: side.value!, from: 'translate(130%, -20%) rotate(32deg)', delay: 300 },
  { el: backBtn.value!, from: 'translateY(-40px)', delay: 520 },
];
const toDesk = () => go(async () => {
  voice.value = 'Write, then. I will be at the head of the table when you are done.';
  await gather(); await wait(250);
  writing.value = true;
  dealerEl.value!.animate([{ transform: 'translateX(-50%)', opacity: 1, filter: 'brightness(1)' }, { transform: 'translate(-50%, -38%) scale(.86)', opacity: 0, filter: 'brightness(.2)' }], { duration: REDUCE ? 1 : 550, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'forwards' });
  await wait(220);
  deskOpen.value = true; await nextTick();
  deskEl.value!.scrollTop = 0;
  await Promise.all(PIECES().map((p) => p.el.animate([
    { transform: p.from, opacity: 0, filter: 'drop-shadow(0 40px 30px rgba(0,0,0,.7))' },
    { transform: p.from, opacity: 1, offset: 0.05 },
    { transform: 'translate(0, -1.5%) rotate(-1.2deg)', offset: 0.78, filter: 'drop-shadow(0 18px 16px rgba(0,0,0,.6))' },
    { transform: 'none', opacity: 1, filter: 'drop-shadow(0 0 0 rgba(0,0,0,0))' },
  ], { duration: REDUCE ? 1 : 900, delay: REDUCE ? 0 : p.delay, easing: 'cubic-bezier(.45,0,.2,1)', fill: 'backwards' }).finished));
});
const toTable = () => go(async () => {
  await Promise.all(PIECES().reverse().map((p, i) => p.el.animate([{ transform: 'none', opacity: 1 }, { transform: p.from, opacity: 0 }], { duration: REDUCE ? 1 : 560, delay: REDUCE ? 0 : i * 90, easing: 'cubic-bezier(.65,0,.35,1)', fill: 'forwards' }).finished));
  deskOpen.value = false;
  await load();
  await dealerEl.value!.animate([{ transform: 'translate(-50%, -38%) scale(.86)', opacity: 0, filter: 'brightness(.2)' }, { transform: 'translateX(-50%)', opacity: 1, filter: 'brightness(1)' }], { duration: REDUCE ? 1 : 750, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'forwards' }).finished;
  writing.value = false;
  voice.value = 'Back. Let us see what you wrote.'; await wait(500); start();
});

// ---- the desk ------------------------------------------------------------
const KINDS: [NoteKind, string][] = [['cloze', 'Cloze'], ['basic', 'Basic'], ['reverse', 'Both ways'], ['type', 'Typed'], ['occlusion', 'Image occlusion']];
const ABBR: Record<NoteKind, string> = { cloze: 'CZ', basic: 'BA', reverse: 'BW', type: 'TY', occlusion: 'IO' };
const TAGS = ['PRÜFUNG', 'WICHTIG', 'HERLEITUNG', 'DEFINITION'];
const LATEX: [string, string][] = [['x²', '^{2}'], ['∫', '\\int '], ['∂', '\\partial '], ['frac', '\\frac{a}{b}'], ['√', '\\sqrt{}'], ['Σ', '\\sum_{i=1}^{n} '], ['θ', '\\theta '], ['φ', '\\varphi ']];
const blank = (kind: NoteKind): NoteBody => ({ kind, name: '', tags: [], fields: kind === 'occlusion' ? { masks: [], labels: [], mode: 'all' } : {} });
const fileId = ref<number | null>(null);
const file = computed(() => own.value.find((d) => d.id === fileId.value) ?? null);
const editing = ref<number | null>(null);
const draft = reactive<NoteBody>(blank('cloze'));
const error = ref('');
const dossier = ref<HTMLElement | null>(null);
const counts = (d: OwnDeckDto) => d.notes.reduce((a, n) => a + n.cards, 0);
function load2(n: NoteDto | null, kind: NoteKind = draft.kind) {
  Object.assign(draft, n ? structuredClone({ kind: n.kind, name: n.name, tags: n.tags, fields: n.fields }) : blank(kind));
  editing.value = n?.id ?? null; sel.value = -1; shown.value = 0;
}
// A page turn: the report lifts away, the next is laid down.
async function turnPage(then: () => void, dir = 1) {
  const d = dossier.value!;
  await d.animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${dir * 6}%, -3%) rotateX(14deg) rotate(${dir * 2}deg)`, opacity: 0 }], { duration: REDUCE ? 1 : 260, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' }).finished;
  then(); await nextTick();
  await d.animate([{ transform: `translate(${-dir * 4}%, 4%) rotateX(-10deg) rotate(${-dir}deg)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: REDUCE ? 1 : 420, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'forwards' }).finished;
}
const openFile = (id: number) => { if (id !== fileId.value) turnPage(() => { fileId.value = id; load2(file.value?.notes[0] ?? null); }, -1); };
const openNote = (n: NoteDto | null) => { if (!(n && n.id === editing.value)) turnPage(() => load2(n)); };
const arrived = ref<number | null>(null);
async function newFile() {
  const title = 'Untitled matter';
  try {
    const d = await deckApi.openFile(title);
    await load(); arrived.value = d.id;
    turnPage(() => { fileId.value = d.id; load2(null); });
  } catch (e) { error.value = e instanceof Error ? e.message : 'the file did not open'; }
}
async function rename(e: Event) {
  const t = (e.target as HTMLElement).textContent?.trim();
  if (file.value && t && t !== file.value.title) { await deckApi.renameFile(file.value.id, t).catch(() => {}); await load(); }
}
function setKind(k: NoteKind) {
  if (k === draft.kind) return;
  const keep = { name: draft.name, tags: draft.tags }, old = draft.fields;
  const next = blank(k);
  if (['basic', 'reverse', 'type'].includes(k) && ['basic', 'reverse', 'type'].includes(draft.kind)) next.fields = { ...next.fields, front: old.front, back: old.back };
  if (k === 'cloze' && old.front) next.fields = { text: `${old.front} {{c1::${old.back ?? ''}}}` };
  Object.assign(draft, next, keep); shown.value = 0; sel.value = -1;
}
const toggleTag = (t: string) => { draft.tags = draft.tags.includes(t) ? draft.tags.filter((x) => x !== t) : [...draft.tags, t]; };
// LaTeX keys and redaction act on the field last written in.
const lastField = ref<HTMLTextAreaElement | null>(null);
function insert(text: string) {
  const ta = lastField.value; if (!ta) return;
  const s0 = ta.selectionStart; ta.setRangeText(text, s0, ta.selectionEnd, 'end');
  if (text === '\\( \\)') ta.setSelectionRange(s0 + 3, s0 + 3);
  ta.focus(); ta.dispatchEvent(new Event('input'));
}
const textArea = ref<HTMLTextAreaElement | null>(null);
function redact(sameCard: boolean, e: Event) {
  const ta = textArea.value!, s0 = ta.selectionStart, e0 = ta.selectionEnd;
  if (s0 === e0) { (e.currentTarget as HTMLElement).animate([{ transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'none' }], 200); return; }
  const nums = [...ta.value.matchAll(/\{\{c(\d+)::/g)].map((m) => Number(m[1])), top = nums.length ? Math.max(...nums) : 0;
  ta.setRangeText(`{{c${sameCard && top ? top : top + 1}::${ta.value.slice(s0, e0)}}}`, s0, e0, 'end'); ta.dispatchEvent(new Event('input'));
}
// What the cloze or the question reads as, typeset, under the field.
const typesetView = computed(() => draft.kind === 'cloze'
  ? esc(draft.fields.text ?? '').replace(/\{\{c(\d+)::([\s\S]*?)(?:::([\s\S]*?))?\}\}/g, (_, n, _a, h) => `<span class="bar">C${n}${h ? ` // ${esc(h)}` : ''}</span>`).replace(/\n/g, '<br>')
  : `<div>${esc(draft.fields.front ?? '').replace(/\n/g, '<br>')}</div><hr><div>${esc(draft.fields.back ?? '').replace(/\n/g, '<br>')}</div>`);
const viewEl = ref<HTMLElement | null>(null);
watch(typesetView, () => nextTick(() => viewEl.value && typeset(viewEl.value)), { flush: 'post' });

// ---- the photograph and its bars ----------------------------------------
const picture = ref('');
watch(() => draft.fields.imageId, (id) => { picture.value = imageUrl(id); }, { immediate: true });
async function attach(f?: File | null) {
  if (!f?.type.startsWith('image/')) return;
  if (draft.kind !== 'occlusion') setKind('occlusion');
  picture.value = URL.createObjectURL(f);
  try { draft.fields.imageId = await deckApi.picture(f); draft.fields.imageName = f.name || 'pasted screenshot'; draft.fields.masks = []; draft.fields.labels = []; error.value = ''; }
  catch (e) { error.value = e instanceof Error ? e.message : 'the picture did not go up'; }
}
const sel = ref(-1);
const drafting = ref<Mask | null>(null);
let from: { x: number; y: number } | null = null;
const at = (e: PointerEvent, el: HTMLElement) => { const r = el.getBoundingClientRect(); return { x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)) }; };
function barDown(e: PointerEvent) {
  const t = e.target as HTMLElement;
  if (t.closest('[data-lift]')) return;
  const m = t.closest<HTMLElement>('.mask');
  if (m) { sel.value = sel.value === Number(m.dataset.m) ? -1 : Number(m.dataset.m); return; }
  sel.value = -1; from = at(e, e.currentTarget as HTMLElement); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}
function barMove(e: PointerEvent) {
  if (!from) return; const p = at(e, e.currentTarget as HTMLElement);
  drafting.value = { x: Math.min(from.x, p.x), y: Math.min(from.y, p.y), w: Math.abs(p.x - from.x), h: Math.abs(p.y - from.y) };
}
function barUp() {
  if (!from) return;
  const m = drafting.value;
  if (m && m.w > 0.02 && m.h > 0.02) { draft.fields.masks = [...(draft.fields.masks ?? []), m]; draft.fields.labels = [...(draft.fields.labels ?? []), '']; }
  from = null; drafting.value = null;
}
function lift(i: number) {
  draft.fields.masks = (draft.fields.masks ?? []).filter((_, j) => j !== i);
  draft.fields.labels = (draft.fields.labels ?? []).filter((_, j) => j !== i); sel.value = -1;
}
const labels = computed({ get: () => (draft.fields.labels ?? []).join(' | '), set: (v: string) => { draft.fields.labels = v.split('|').map((s) => s.trim()); } });
const place = (m: Mask) => ({ left: `${m.x * 100}%`, top: `${m.y * 100}%`, width: `${m.w * 100}%`, height: `${m.h * 100}%` });

// ---- the proof: the draft as the table will deal it ----------------------
const proofEl = ref<HTMLElement | null>(null);
const shown = ref(0);
const made = computed(() => cardsOfNote({ kind: draft.kind, name: draft.name, fields: draft.fields }, file.value ? `file ${file.value.code}` : ''));
let proofTimer = 0;
watch([made, shown], () => {
  clearTimeout(proofTimer);
  proofTimer = window.setTimeout(() => {
    const host = proofEl.value; if (!host) return;
    host.replaceChildren();
    const c = made.value[Math.min(shown.value, made.value.length - 1)];
    if (!c) return;
    const el = makeCard(c); el.style.setProperty('--cw', '240px'); host.appendChild(el);
    requestAnimationFrame(() => el.turn('q'));
    el.addEventListener('click', (e) => { if (!(e.target as HTMLElement).closest('.typed')) el.turn(); });
  }, 140);
}, { deep: true, flush: 'post' });

// Filing: the report folds toward you and goes into its folder; a blank is laid down.
async function fileIt() {
  if (!file.value) return;
  if (!made.value.length) { dossier.value!.animate([{ transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'none' }], 240); return; }
  const body: NoteBody = structuredClone({ kind: draft.kind, name: draft.name || 'untitled', tags: draft.tags, fields: draft.fields });
  try { if (editing.value === null) await deckApi.addNote(file.value.id, body); else await deckApi.saveNote(editing.value, body); }
  catch (e) { error.value = e instanceof Error ? e.message : 'it did not file'; return; }
  const f = cabinet.value!.querySelector(`[data-f="${file.value.id}"]`)?.getBoundingClientRect(), d = dossier.value!.getBoundingClientRect();
  if (f) {
    const dx = f.left + f.width / 2 - (d.left + d.width / 2), dy = f.top + f.height / 2 - (d.top + d.height * 0.25);
    await dossier.value!.animate([
      { transform: 'none' }, { transform: 'rotateX(-82deg)', offset: 0.42 },
      { transform: `translate(${dx}px, ${dy}px) rotateX(-88deg) scale(.22)`, opacity: 0.9, offset: 0.85 },
      { transform: `translate(${dx}px, ${dy}px) rotateX(-90deg) scale(.15)`, opacity: 0 },
    ], { duration: REDUCE ? 1 : 1100, easing: 'cubic-bezier(.65,0,.35,1)', fill: 'forwards' }).finished;
  }
  await load(); load2(null, body.kind); error.value = '';
  await nextTick();
  await dossier.value!.animate([{ transform: 'translateY(-30px) rotateX(10deg)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: REDUCE ? 1 : 500, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'forwards' }).finished;
}
// Shredding: the report pulled down out of sight.
async function shred() {
  if (editing.value === null) return;
  await deckApi.shred(editing.value).catch(() => {});
  await dossier.value!.animate([{ clipPath: 'inset(0 0 0 0)', transform: 'none' }, { clipPath: 'inset(0 0 100% 0)', transform: 'translateY(40%)' }], { duration: REDUCE ? 1 : 700, easing: 'cubic-bezier(.65,0,.35,1)', fill: 'forwards' }).finished;
  await load(); load2(file.value?.notes[0] ?? null); await nextTick();
  await dossier.value!.animate([{ clipPath: 'inset(0 0 0 0)', transform: 'translateY(-30px)', opacity: 0 }, { clipPath: 'inset(0 0 0 0)', transform: 'none', opacity: 1 }], { duration: REDUCE ? 1 : 450, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'forwards' }).finished;
}

// ---- keys, paste, drop ---------------------------------------------------
function key(e: KeyboardEvent) {
  const typing = (e.target as HTMLElement).closest?.('input, textarea, [contenteditable]');
  if (e.key === 'Escape') { if (deskOpen.value) toTable(); else emit('close'); return; }
  if (deskOpen.value) { if (sel.value >= 0 && !typing && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); lift(sel.value); } return; }
  if (typing || !live) return;
  if (e.key === ' ') { e.preventDefault(); live.click(); }
  if (e.key === 'ArrowRight') decide(liveCard.value?.own ? 2 : 1);
  if (e.key === 'ArrowLeft') decide(0);
}
function paste(e: ClipboardEvent) {
  if (!deskOpen.value) return;
  const f = [...(e.clipboardData?.files ?? [])].find((x) => x.type.startsWith('image/'));
  if (f) { e.preventDefault(); attach(f); }
}
const dropping = ref(false);
const drop = (e: DragEvent) => { dropping.value = false; attach(e.dataTransfer?.files[0]); };

let stopCloth = () => {};
onMounted(async () => {
  addEventListener('keydown', key); addEventListener('paste', paste);
  stopCloth = cloth(clothEl.value!);
  kael = portrait(dealerCanvas.value!, 180, 0.4);
  await load();
  const first = chips.value[0];
  current.value = first ? { src: first.src, id: first.id } : null;
  fileId.value = own.value[0]?.id ?? null;
  load2(file.value?.notes[0] ?? null);
  start();
});
onBeforeUnmount(() => { removeEventListener('keydown', key); removeEventListener('paste', paste); stopCloth(); kael?.stop(); });
const ankiUrl = computed(() => (file.value ? `/api/v1/academy/own/decks/${file.value.id}/anki` : ''));
const moodleAnki = computed(() => (current.value?.src === 'moodle' ? `/api/v1/academy/decks/${current.value.id}/anki` : current.value ? `/api/v1/academy/own/decks/${current.value.id}/anki` : ''));
</script>

<template>
  <Teleport to="body">
    <div class="arcana-back" @pointerdown.self="emit('close')">
      <section ref="stage" class="arcana" role="dialog" aria-modal="true" aria-label="The Arcana: your decks">
        <div class="table" :class="{ writing }">
          <canvas ref="clothEl" class="cloth" aria-hidden="true"></canvas>
          <div ref="dealerEl" class="dealer"><canvas ref="dealerCanvas" aria-label="Kael'thos, dealing"></canvas></div>
          <p class="voice away" aria-live="polite">{{ voice }}</p>
          <div class="decks away">
            <button v-for="(c, i) in chips" :key="`${c.src}${c.id}`" class="chip" :class="{ own: c.src === 'own', on: same(current, c) }" :style="{ animationDelay: `${i * 40}ms` }" @click="choose(c)">{{ c.name }}<i>{{ c.count }}</i></button>
          </div>
          <div class="tally away"><span class="pix">insight</span><b>{{ insight }}</b><span class="mult">x{{ mult }}</span></div>
          <div class="rail away">
            <div v-for="(s, i) in STREAKS.slice().reverse()" :key="s.at" class="reward" :class="{ got: streak >= s.at }">
              <span><b>{{ s.name }}</b>{{ s.at }} in a row</span>
              <div class="ico"><i :style="{ height: `${fill(s, STREAKS.length - 1 - i) * 100}%` }"></i><svg viewBox="0 0 20 20" v-html="s.icon"></svg></div>
            </div>
          </div>
          <div ref="felt" class="felt"></div>
          <div class="judge" :class="{ on: judging }">
            <button v-for="v in verdicts" :key="v.k" class="btn" :class="{ again: v.r === 0 }" @click="decide(v.r)">{{ v.k }}<small>{{ v.says }}</small></button>
          </div>
          <div class="ladder away">
            <template v-if="current?.src === 'moodle'">
              <div v-for="b in [1, 2, 3, 4, 5]" :key="b" class="rung" :class="{ flash: flash === b }" :title="BOXES[b]"><b>{{ ladder[b] }}</b><i :style="{ height: `${6 + (ladder[b]! / Math.max(1, ...ladder.slice(1))) * 30}px` }"></i><span>{{ ROMAN[b] }}</span></div>
            </template>
            <span v-else-if="current" class="pix">fsrs // {{ own.find((d) => d.id === current!.id)?.due ?? 0 }} due</span>
          </div>
          <span class="tools away"><a v-if="moodleAnki" class="x" :href="moodleAnki">anki</a><button class="x" @click="emit('close')">leave</button></span>
          <button class="lever away" :class="{ pulled: writing }" @click="toDesk"><span class="handle"><i></i></span><span>the desk</span></button>
          <span v-for="p in pops" :key="p.id" class="pop" :style="{ left: `${p.x}px`, top: `${p.y}px` }">{{ p.text }}</span>
          <div v-if="banner" class="banner"><div class="band"><span>{{ banner.at }} in a row</span><b>{{ banner.name }}</b><span>{{ banner.says }}</span></div></div>
          <div class="vignette"></div>
        </div>

        <div v-show="deskOpen" ref="deskEl" class="deskroom" :class="{ dropping }" @dragover.prevent="dropping = true" @dragleave.self="dropping = false" @drop.prevent="drop">
          <button ref="backBtn" class="btn totable" @click="toTable">back to the table</button>
          <div class="desk">
            <aside ref="cabinet" class="cabinet">
              <div class="folders" aria-label="Your files">
                <button v-for="(d, i) in own" :key="d.id" class="folder" :class="{ on: d.id === fileId, arrive: d.id === arrived }" :data-f="d.id"
                        :style="{ '--r': `${[-1.5, 1, -0.6, 1.4][i % 4]}deg`, '--tab': `${14 + (i % 3) * 52}px`, zIndex: d.id === fileId ? 5 : 1 }" @click="openFile(d.id)">
                  <b>{{ d.title }}</b><span>{{ d.code }} // {{ counts(d) }} cards</span>
                </button>
              </div>
              <button class="addfile" @click="newFile">+ open a new file</button>
              <div v-if="file" class="contents">
                <span class="pix">in this file</span>
                <button class="entry new" :class="{ on: editing === null }" style="--i:0" @click="openNote(null)"><b>+ write a new report</b></button>
                <button v-for="(n, i) in file.notes" :key="n.id" class="entry" :class="{ on: n.id === editing }" :style="{ '--i': i + 1 }" @click="openNote(n)">
                  <i>{{ ABBR[n.kind] }}</i><b>{{ n.name || 'untitled' }}</b><em>{{ n.cards }}</em>
                </button>
              </div>
            </aside>

            <div ref="report" class="report">
              <article ref="dossier" class="dossier">
                <span class="clip"></span>
                <p v-if="!file" class="note">Open a file on the left to write in it.</p>
                <template v-else>
                  <div class="letterhead">
                    <div><div class="org">Amygdala Inc. // Containment Archive // Academy Division</div>
                      <h3 contenteditable="plaintext-only" spellcheck="false" title="rename the file" @blur="rename" @keydown.enter.prevent="($event.target as HTMLElement).blur()">{{ file.title }}</h3></div>
                    <div class="fileno">file no.<br><b>{{ file.code }}</b><br><span>{{ counts(file) }} cards on file</span></div>
                  </div>
                  <div class="kinds" role="tablist">
                    <button v-for="[k, n] in KINDS" :key="k" class="kind" :class="{ on: draft.kind === k }" role="tab" :aria-selected="draft.kind === k" @click="setKind(k)">{{ n }}</button>
                  </div>
                  <div class="form">
                    <label class="field"><span>subject</span><input v-model="draft.name" type="text" placeholder="what this report is about"></label>
                    <template v-if="draft.kind === 'cloze'">
                      <label class="field"><span>the report <em>select words, then redact</em></span>
                        <textarea ref="textArea" v-model="draft.fields.text" rows="4" placeholder="Write it out, then black out what should be asked." @focus="lastField = $event.target as HTMLTextAreaElement"></textarea></label>
                      <div class="row"><button class="redact" @click="redact(false, $event)">redact // new card</button><button class="redact dim" @click="redact(true, $event)">redact // same card</button>
                        <span class="keys"><button class="key wide" @click="insert('\\( \\)')">\( math \)</button><button v-for="[l, t] in LATEX" :key="l" class="key" :class="{ wide: l.length > 2 }" @click="insert(t)">{{ l }}</button></span></div>
                      <div ref="viewEl" class="typeset" data-label="as typeset" v-html="typesetView"></div>
                    </template>
                    <template v-else-if="draft.kind === 'occlusion'">
                      <div class="attach"><label class="redact" for="ar-file">attach a photograph</label><input id="ar-file" type="file" accept="image/*" hidden @change="attach(($event.target as HTMLInputElement).files?.[0])"><span>or drop one on the desk, or paste a screenshot (ctrl v)</span></div>
                      <div v-if="picture" class="exhibit">
                        <div class="photo" @pointerdown="barDown" @pointermove="barMove" @pointerup="barUp">
                          <img alt="the exhibit" :src="picture" draggable="false">
                          <div v-for="(m, i) in draft.fields.masks" :key="i" class="mask" :class="{ sel: sel === i }" :data-m="i" :style="place(m)">{{ i + 1 }}<button class="lift" data-lift @pointerdown.stop @click.stop="lift(i)">lift bar {{ i + 1 }}</button></div>
                          <div v-if="drafting" class="draft" :style="place(drafting)"></div>
                        </div>
                        <div class="caption"><span>{{ draft.fields.imageName }}</span><span>drag to lay a bar // tap one to lift it</span></div>
                      </div>
                      <div class="opts"><label><input v-model="draft.fields.mode" type="radio" value="all"> hide all, ask one</label><label><input v-model="draft.fields.mode" type="radio" value="one"> hide one, ask one</label></div>
                      <label class="field"><span>what each bar hides <em>one per bar, split with |</em></span><input v-model="labels" type="text"></label>
                    </template>
                    <template v-else>
                      <label class="field"><span>{{ draft.kind === 'reverse' ? 'one side' : 'the question' }}</span><textarea v-model="draft.fields.front" rows="2" @focus="lastField = $event.target as HTMLTextAreaElement"></textarea></label>
                      <label class="field"><span>{{ draft.kind === 'reverse' ? 'the other side' : 'the answer' }}</span><textarea v-model="draft.fields.back" rows="2" @focus="lastField = $event.target as HTMLTextAreaElement"></textarea></label>
                      <span class="keys"><button class="key wide" @click="insert('\\( \\)')">\( math \)</button><button v-for="[l, t] in LATEX" :key="l" class="key" :class="{ wide: l.length > 2 }" @click="insert(t)">{{ l }}</button></span>
                      <label v-if="draft.kind === 'type'" class="field"><span>what must be typed</span><input v-model="draft.fields.plain" type="text"></label>
                      <div ref="viewEl" class="typeset" data-label="as typeset" v-html="typesetView"></div>
                    </template>
                    <div class="field"><span>tags</span><div class="tags"><button v-for="t in TAGS" :key="t" class="tag" :class="{ on: draft.tags.includes(t) }" @click="toggleTag(t)">{{ t }}</button></div></div>
                  </div>
                  <p v-if="error" class="err">{{ error }}</p>
                  <div class="foot-actions">
                    <span class="makes">{{ made.length ? `this report makes ${made.length} ${made.length === 1 ? 'card' : 'cards'}` : draft.kind === 'occlusion' ? 'lay a bar to make a card' : 'redact something to make a card' }}</span>
                    <span class="acts"><button v-if="editing !== null" class="shred" @click="shred">shred</button><button class="fileit" @click="fileIt">{{ editing === null ? 'file it' : 'refile' }}</button></span>
                  </div>
                </template>
              </article>
            </div>

            <aside ref="side" class="side">
              <span class="pix">the proof</span>
              <div ref="proofEl" class="proof"></div>
              <div v-if="made.length > 1" class="cycle">
                <button v-for="(c, i) in made" :key="c.key" class="chip" :class="{ on: i === Math.min(shown, made.length - 1) }" @click="shown = i">{{ draft.kind === 'cloze' ? `c${c.n}` : draft.kind === 'occlusion' ? `bar ${c.n}` : i ? 'reversed' : 'forward' }}</button>
              </div>
              <p class="note">How it will be dealt. Tap it to see its back.</p>
              <a v-if="ankiUrl && file?.notes.length" class="x" :href="ankiUrl">this file for anki</a>
            </aside>
          </div>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style>
/* Global on purpose: the cards are built outside Vue's templates. Everything is under .arcana. */
.arcana-back { position: fixed; inset: 0; z-index: 55; display: grid; place-items: center; background: rgba(12, 11, 10, .72); backdrop-filter: blur(6px) grayscale(1); animation: ar-fade .45s var(--out); }
@keyframes ar-fade { from { opacity: 0; } }
.arcana { --paper: #cfc6b4; --paper2: #bdb4a2; --ink: #161514; --ink2: #4a463f; --manila: #b9a882; --manila2: #d6c7a2; --type: 'Special Elite', 'Courier New', monospace; --spring: cubic-bezier(.34, 1.4, .64, 1);
  position: relative; width: min(98vw, 1600px); height: 94vh; border: 3px dotted var(--low); background: var(--ground); overflow: hidden; touch-action: pan-y; user-select: none; -webkit-user-select: none; animation: ar-open .7s var(--ease); }
@keyframes ar-open { from { clip-path: inset(49% 30% 49% 30%); opacity: .3; } 60% { clip-path: inset(0 0 0 0); } }
.arcana .table { position: absolute; inset: 0; }
.arcana .cloth { position: absolute; inset: 0; width: 100%; height: 100%; image-rendering: pixelated; pointer-events: none; }
.arcana .vignette { position: absolute; inset: 0; pointer-events: none; z-index: 30; box-shadow: inset 0 0 140px rgba(0, 0, 0, .85); }
.arcana .away { transition: opacity .45s var(--out), transform .55s var(--out); }
.arcana .table.writing .away { opacity: 0; pointer-events: none; }
.arcana .table.writing .decks, .arcana .table.writing .tally, .arcana .table.writing .tools { transform: translateY(-24px); }
.arcana .table.writing .rail { transform: translate(30px, -46%); }
.arcana .table.writing .lever { transform: translateY(24px); }
.arcana .table.writing .ladder { transform: translate(-50%, 24px); }
.arcana .dealer { position: absolute; left: 50%; top: 0; transform: translateX(-50%); width: min(300px, 46vw); aspect-ratio: 1; z-index: 4; pointer-events: none; }
.arcana .dealer canvas { width: 100%; height: 100%; image-rendering: pixelated; display: block; }
.arcana .voice { position: absolute; left: 50%; transform: translateX(-50%); top: min(300px, 46vw); margin: -26px 0 0; width: min(620px, 86%); text-align: center; z-index: 6; font: italic 400 clamp(15px, 1.6vw, 19px)/1.35 var(--fell); color: var(--hi); text-shadow: 0 0 18px rgba(0, 0, 0, .95); min-height: 2.7em; }
.arcana .decks { position: absolute; left: 14px; top: 14px; display: flex; flex-wrap: wrap; gap: 6px; z-index: 12; max-width: 34%; }
.arcana .chip { border: 2px solid var(--low); padding: 5px 10px; font: 400 10px var(--pix); text-transform: uppercase; color: var(--dim); background: var(--ground); white-space: nowrap; transition: border-color .3s, color .3s, background .3s; animation: ar-chip .5s var(--out) both; }
@keyframes ar-chip { from { opacity: 0; transform: translateY(-8px); } }
.arcana .chip i { font-style: normal; margin-left: 7px; opacity: .7; }
.arcana .chip:hover { border-color: var(--phos); color: var(--hi); }
.arcana .chip.on { background: var(--phos); color: var(--ground); border-color: var(--phos); }
.arcana .chip.own { border-style: dashed; }
.arcana .tally { position: absolute; right: 16px; top: 40px; z-index: 12; text-align: right; display: grid; gap: 2px; }
.arcana .tally b { font: 800 34px/1 var(--tek); color: var(--hi); font-variant-numeric: tabular-nums; }
.arcana .tally .mult { font: 800 15px var(--tek); color: var(--ground); background: var(--phos); padding: 1px 7px; justify-self: end; }
.arcana .tools { position: absolute; right: 14px; top: 12px; z-index: 13; display: flex; gap: 12px; }
.arcana .rail { position: absolute; right: 16px; top: 52%; transform: translateY(-46%); z-index: 12; display: grid; gap: 10px; }
.arcana .reward { display: grid; grid-template-columns: auto 34px; gap: 8px; align-items: center; justify-items: end; opacity: .38; transition: opacity .4s, transform .4s var(--spring); }
.arcana .reward .ico { width: 34px; height: 34px; border: 2px solid var(--phos); display: grid; place-items: center; background: var(--deep); position: relative; overflow: hidden; }
.arcana .reward .ico svg { width: 20px; height: 20px; position: relative; z-index: 1; }
.arcana .reward .ico i { position: absolute; left: 0; right: 0; bottom: 0; background: rgba(197, 188, 171, .35); transition: height .4s var(--out); }
.arcana .reward span { font: 400 9px/1.2 var(--pix); color: var(--dim); text-transform: uppercase; text-align: right; }
.arcana .reward span b { display: block; font: 400 13px/1 var(--fell); color: var(--hi); text-transform: none; }
.arcana .reward.got { opacity: 1; transform: translateX(-4px); }
.arcana .ladder { position: absolute; left: 50%; transform: translateX(-50%); bottom: 14px; z-index: 12; display: flex; gap: 6px; align-items: flex-end; }
.arcana .ladder .rung { display: grid; justify-items: center; gap: 3px; }
.arcana .ladder .rung i { width: 20px; background: var(--deep); border: 1.5px solid var(--low); display: block; transition: height .5s var(--out), background .3s; }
.arcana .ladder .rung b { font: 800 11px var(--tek); color: var(--hi); }
.arcana .ladder .rung span { font: 400 8px var(--pix); color: var(--dim); }
.arcana .ladder .rung.flash i { border-color: var(--hi); background: var(--phos); }
.arcana .felt { position: absolute; left: 0; right: 0; top: 28%; bottom: 60px; z-index: 8; }
.arcana .judge { position: absolute; left: 50%; transform: translateX(-50%); bottom: 74px; z-index: 14; display: flex; gap: 10px; opacity: 0; pointer-events: none; transition: opacity .3s; }
.arcana .judge.on { opacity: 1; pointer-events: auto; }
.arcana .judge .btn { background: var(--ground); }
.arcana .judge .btn small { display: block; font-size: 8.5px; opacity: .7; margin-top: 2px; }
.arcana .judge .btn.again { border-color: var(--dim); color: var(--dim); }
.arcana .lever { position: absolute; left: 14px; bottom: 16px; z-index: 12; display: flex; align-items: center; gap: 10px; color: var(--hi); font: 400 10px var(--pix); text-transform: uppercase; }
.arcana .lever .handle { width: 40px; height: 40px; border: 2px solid var(--phos); border-radius: 50%; display: grid; place-items: center; background: var(--deep); }
.arcana .lever .handle i { width: 3px; height: 20px; background: var(--hi); transform-origin: 50% 100%; transform: translateY(-9px) rotate(-30deg); transition: transform .5s var(--spring); }
.arcana .lever:hover .handle i { transform: translateY(-9px) rotate(-12deg); }
.arcana .lever.pulled .handle i { transform: translateY(-9px) rotate(40deg); }
.arcana .pop { position: absolute; z-index: 40; font: 800 28px var(--tek); color: var(--hi); pointer-events: none; animation: ar-pop 1s var(--out) forwards; }
@keyframes ar-pop { 0% { transform: translateY(0) scale(.5); opacity: 0; } 20% { transform: translateY(-14px) scale(1.2); opacity: 1; } 100% { transform: translateY(-70px); opacity: 0; } }
/* A streak earned slams across the table and folds shut where it stands. */
.arcana .banner { position: absolute; left: 0; right: 0; top: 44%; z-index: 35; pointer-events: none; animation: ar-slam 1.9s var(--out) forwards; }
.arcana .banner .band { background: var(--phos); color: var(--ground); text-align: center; padding: 10px 0 8px; clip-path: polygon(0 18%, 100% 0, 100% 82%, 0 100%); }
.arcana .banner .band b { display: block; font: 400 clamp(34px, 6vw, 64px)/.9 var(--goth); }
.arcana .banner .band span { font: 400 11px var(--pix); letter-spacing: .3em; text-transform: uppercase; }
@keyframes ar-slam { 0% { transform: scaleY(0); opacity: 0; } 12% { transform: scaleY(1.15); opacity: 1; } 20% { transform: scaleY(1); } 82% { transform: scaleY(1); opacity: 1; } 100% { transform: scaleY(0); opacity: 0; } }
.arcana.shake { animation: ar-shake .35s; }
@keyframes ar-shake { 20% { transform: translateX(-7px); } 40% { transform: translateX(6px); } 60% { transform: translateX(-3px); } 80% { transform: translateX(2px); } }

/* ---- the card ---- */
.arcana .card { position: absolute; width: var(--cw, 220px); aspect-ratio: 3 / 4; perspective: 1100px; transition: left .6s var(--out), top .6s var(--out), transform .6s var(--out), opacity .4s; will-change: transform; cursor: pointer; }
.arcana .card.wide { aspect-ratio: 31 / 20; }
.arcana .card .tilt { position: absolute; inset: 0; transform-style: preserve-3d; transition: transform .25s var(--out); }
.arcana .card .inner { position: absolute; inset: 0; transform-style: preserve-3d; transition: transform .62s var(--spring); }
.arcana .card[data-side="down"] .inner, .arcana .card[data-side="a"] .inner { transform: rotateY(180deg); }
.arcana .face { position: absolute; inset: 0; backface-visibility: hidden; -webkit-backface-visibility: hidden; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 22px 44px rgba(0, 0, 0, .65); }
.arcana .face.back { transform: rotateY(180deg); border: 2px solid var(--phos); background: var(--deep); }
.arcana .face.back img { width: 100%; height: 100%; image-rendering: pixelated; object-fit: cover; }
.arcana .face.q { background: var(--deep); border: 2px solid var(--phos); padding: calc(var(--cw) * .05); gap: 4px; }
.arcana .face.q::before, .arcana .face.a::before { content: ''; position: absolute; inset: 5px; border: 1px solid var(--low); pointer-events: none; }
.arcana .face .corner { position: absolute; width: 12px; height: 12px; border: 1.5px solid var(--phos); }
.arcana .face .corner.tl { left: 9px; top: 9px; border-right: 0; border-bottom: 0; }
.arcana .face .corner.br { right: 9px; bottom: 9px; border-left: 0; border-top: 0; }
.arcana .face .head { display: flex; justify-content: space-between; align-items: baseline; position: relative; z-index: 1; padding: 2px 6px; }
.arcana .face .head b { font: 400 clamp(18px, calc(var(--cw) * .085), 34px)/1 var(--goth); color: var(--hi); }
.arcana .face .head span { font: 400 8.5px var(--pix); color: var(--dim); text-transform: uppercase; letter-spacing: .1em; }
.arcana .face .rule { height: 1px; background: linear-gradient(90deg, transparent, var(--phos), transparent); margin: 2px 8px 0; }
.arcana .face .body { flex: 1; display: grid; place-items: center; padding: 6px 8px; text-align: center; position: relative; z-index: 1; overflow: hidden; min-height: 0; }
.arcana .face .body > div { font: 400 calc(var(--cw) * .072)/1.32 var(--fell); color: var(--hi); max-width: 100%; }
.arcana .card.wide .face .body > div { font-size: calc(var(--cw) * .036); width: 100%; }
.arcana .face .body img { max-width: 100%; }
.arcana .face .body ul, .arcana .face .body ol { text-align: left; margin: 4px 0; padding-left: 1.1em; }
.arcana .face .foot { display: flex; justify-content: space-between; gap: 8px; font: 400 8.5px var(--pix); color: var(--dim); text-transform: uppercase; padding: 0 6px 2px; position: relative; z-index: 1; }
.arcana .face .seal { font: 400 9px var(--pix); letter-spacing: .3em; color: var(--dim); text-align: center; }
.arcana .face.a { transform: rotateY(180deg); background: var(--paper); border: 2px solid var(--hi); padding: calc(var(--cw) * .05); gap: 4px; }
.arcana .face.a::before { border-color: var(--paper2); }
.arcana .face.a .corner { border-color: var(--ink); }
.arcana .face.a .head b, .arcana .face.a .body > div { color: var(--ink); }
.arcana .face.a .head span, .arcana .face.a .foot, .arcana .face.a .seal { color: var(--ink2); }
.arcana .face.a .rule { background: linear-gradient(90deg, transparent, var(--ink), transparent); }
.arcana .face.a .asked { font: italic 400 clamp(11px, calc(var(--cw) * .045), 18px)/1.3 var(--fell); color: var(--ink2); text-align: center; padding: 0 10px; position: relative; z-index: 1; }
.arcana .face.a mark { background: none; color: var(--ink); border-bottom: 2px solid var(--ink); padding: 0 1px; }
.arcana .face .bar { display: inline-block; background: var(--hi); color: var(--deep); min-width: 3.4em; padding: 0 .35em; font: 400 .62em/1.6 var(--pix); vertical-align: .1em; letter-spacing: .08em; }
.arcana .face .occ { position: relative; width: 100%; }
.arcana .face .occ img { width: 100%; display: block; filter: grayscale(1) contrast(1.08); }
.arcana .face .occ i { position: absolute; background: var(--hi); }
.arcana .face .occ i.target { background: var(--deep); outline: 2px solid var(--hi); }
.arcana .face.a .occ i { background: var(--ink); }
.arcana .face.a .occ i.target { background: transparent; outline: 2px solid var(--ink); }
.arcana .face .ask { font-size: .8em; margin-top: 6px; }
.arcana .face .typed input { width: 100%; background: transparent; border: 0; border-bottom: 1.5px solid var(--phos); color: var(--hi); font: inherit; text-align: center; margin-top: 8px; }
.arcana .face .shine { position: absolute; inset: 0; pointer-events: none; z-index: 4; background: radial-gradient(circle at var(--sx, 50%) var(--sy, 25%), rgba(230, 224, 212, .13), transparent 44%); opacity: 0; transition: opacity .3s; }
.arcana .face.a .shine { background: radial-gradient(circle at var(--sx, 50%) var(--sy, 25%), rgba(255, 255, 255, .28), transparent 44%); }
.arcana .card:hover .shine { opacity: 1; }
.arcana .card.turning .shine { opacity: 0; }
.arcana .card.gone-up { opacity: 0 !important; transform: translateY(-60px) scale(.6) rotate(4deg) !important; }
.arcana .card.burn { animation: ar-burn .75s steps(8) forwards; }
@keyframes ar-burn { 40% { filter: contrast(3) brightness(1.5); } 100% { opacity: 0; transform: translateY(60px) scale(.7) rotate(-9deg); filter: contrast(8) brightness(.15); } }

/* ---- the desk, lying on the same cloth ---- */
.arcana .deskroom { position: absolute; inset: 0; z-index: 20; overflow: auto; overflow-x: hidden; user-select: text; -webkit-user-select: text; }
.arcana .desk { position: relative; min-height: 100%; display: grid; grid-template-columns: 240px minmax(0, 1fr) 270px; gap: 28px; padding: 30px 26px 40px; align-items: start; }
.arcana .totable { position: absolute; right: 18px; top: 14px; z-index: 6; }
.arcana .cabinet { display: grid; gap: 14px; }
.arcana .folders { display: grid; padding-top: 14px; }
.arcana .folder { position: relative; text-align: left; padding: 22px 14px 14px; margin-top: -12px; background: var(--manila); color: var(--ink); box-shadow: 0 6px 14px rgba(0, 0, 0, .5); transform: rotate(var(--r, -1deg)); transition: transform .45s var(--spring), background .3s; }
.arcana .folder::before { content: ''; position: absolute; top: -10px; left: var(--tab, 14px); width: 76px; height: 12px; background: inherit; border-radius: 3px 3px 0 0; }
.arcana .folder b { display: block; font: 400 15px/1.15 var(--type); }
.arcana .folder span { font: 400 10px var(--type); letter-spacing: .1em; text-transform: uppercase; opacity: .7; }
.arcana .folder:hover { transform: rotate(var(--r)) translateX(5px); }
.arcana .folder.on { background: var(--manila2); transform: rotate(0) translateX(14px); }
.arcana .folder.arrive { animation: ar-arrive .7s var(--spring) both; }
@keyframes ar-arrive { from { transform: translate(-30px, -60px) rotate(-14deg); opacity: 0; } }
.arcana .addfile { padding: 10px 14px; border: 1.5px dashed rgba(197, 188, 171, .45); color: var(--phos); background: var(--deep); font: 400 13px var(--type); text-align: left; }
.arcana .addfile:hover { border-color: var(--phos); color: var(--hi); }
.arcana .contents { display: grid; gap: 6px; }
.arcana .entry { display: grid; grid-template-columns: 28px minmax(0, 1fr) auto; gap: 8px; align-items: center; text-align: left; padding: 8px 10px; background: #1d1b18; border: 1px solid #2c2925; color: var(--phos); transition: background .25s, border-color .25s, transform .3s var(--out); animation: ar-entry .45s var(--out) both; animation-delay: calc(var(--i) * 40ms); }
@keyframes ar-entry { from { opacity: 0; transform: translateX(-12px); } }
.arcana .entry:hover { border-color: var(--phos); }
.arcana .entry.on { background: var(--paper); color: var(--ink); border-color: var(--paper); transform: translateX(8px); }
.arcana .entry i { font: normal 400 10px var(--type); border: 1.5px solid currentColor; display: grid; place-items: center; height: 22px; }
.arcana .entry b { font: 400 13px/1.2 var(--type); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.arcana .entry em { font: normal 400 9px var(--pix); opacity: .7; }
.arcana .entry.new { grid-template-columns: 1fr; border-style: dashed; background: transparent; }
.arcana .report { position: relative; min-width: 0; perspective: 1600px; }
.arcana .dossier { position: relative; background: var(--paper); color: var(--ink); padding: 34px 40px 40px; transform-origin: 50% 0; box-shadow: 0 30px 60px rgba(0, 0, 0, .7), 0 2px 0 #a99f8c, 0 4px 0 #9a907d; font-family: var(--type); }
.arcana .clip { position: absolute; top: -14px; left: 46%; width: 70px; height: 34px; border: 4px solid #8f8a80; border-bottom: 0; border-radius: 18px 18px 0 0; }
.arcana .letterhead { display: grid; grid-template-columns: 1fr auto; gap: 4px 20px; align-items: start; border-bottom: 2px solid var(--ink); padding-bottom: 12px; }
.arcana .letterhead .org { font: 400 11px var(--type); letter-spacing: .28em; text-transform: uppercase; }
.arcana .letterhead h3 { margin: 4px 0 0; font: 400 26px/1 var(--type); outline: none; border-bottom: 1px dashed transparent; }
.arcana .letterhead h3:focus { border-bottom-color: var(--ink2); }
.arcana .letterhead .fileno { text-align: right; font: 400 12px/1.5 var(--type); }
.arcana .letterhead .fileno b { font-size: 18px; letter-spacing: .1em; }
.arcana .kinds { display: flex; gap: 4px; margin: 18px 0 0; flex-wrap: wrap; }
.arcana .kind { font: 400 12px var(--type); letter-spacing: .14em; text-transform: uppercase; padding: 6px 12px 5px; border: 1.5px solid var(--ink); color: var(--ink); transition: background .2s, color .2s; }
.arcana .kind.on { background: var(--ink); color: var(--paper); }
.arcana .form { display: grid; gap: 14px; margin-top: 18px; }
.arcana .field { display: grid; gap: 4px; }
.arcana .field > span { font: 400 11px var(--type); letter-spacing: .22em; text-transform: uppercase; color: var(--ink2); display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.arcana .field em { font-style: normal; }
.arcana .field textarea, .arcana .field input[type=text] { width: 100%; background: transparent; border: 0; border-bottom: 1.5px dashed var(--ink2); color: var(--ink); font: 400 17px/1.55 var(--type); padding: 4px 0; resize: vertical; outline: none; }
.arcana .field textarea:focus, .arcana .field input:focus { border-bottom-style: solid; border-bottom-color: var(--ink); }
.arcana .row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
.arcana .keys { display: flex; gap: 4px; flex-wrap: wrap; }
.arcana .key { font: 400 11px var(--type); border: 1.5px solid var(--ink); border-radius: 50%; width: 30px; height: 30px; display: grid; place-items: center; color: var(--ink); background: var(--paper2); box-shadow: 0 2px 0 var(--ink); }
.arcana .key.wide { width: auto; border-radius: 15px; padding: 0 10px; }
.arcana .key:active { transform: translateY(2px); box-shadow: none; }
.arcana .redact { font: 400 12px var(--type); letter-spacing: .2em; text-transform: uppercase; padding: 7px 14px 6px; background: var(--ink); color: var(--paper); cursor: pointer; }
.arcana .redact.dim { background: var(--ink2); }
.arcana .typeset { border: 1.5px solid var(--ink2); padding: 14px 16px; min-height: 70px; font: 400 18px/1.6 var(--fell); position: relative; }
.arcana .typeset::before { content: attr(data-label); position: absolute; top: -9px; left: 10px; background: var(--paper); padding: 0 6px; font: 400 10px var(--type); letter-spacing: .2em; color: var(--ink2); text-transform: uppercase; }
.arcana .typeset hr { border: 0; border-top: 1px dashed var(--ink2); margin: 8px 0; }
.arcana .typeset .bar { background: var(--ink); color: var(--paper); padding: 0 .4em; font: 400 .62em/1.7 var(--type); letter-spacing: .1em; display: inline-block; vertical-align: .12em; }
.arcana .opts { display: flex; gap: 16px; flex-wrap: wrap; font: 400 13px var(--type); }
.arcana .opts label { display: flex; gap: 6px; align-items: center; cursor: pointer; }
.arcana .opts input { accent-color: #161514; width: 16px; height: 16px; }
.arcana .attach { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; font: 400 12px var(--type); color: var(--ink2); }
.arcana .exhibit { position: relative; background: #f0ebe0; padding: 12px 12px 34px; box-shadow: 0 8px 18px rgba(0, 0, 0, .3); }
.arcana .exhibit .photo { position: relative; cursor: crosshair; touch-action: none; user-select: none; -webkit-user-select: none; }
.arcana .exhibit img { width: 100%; display: block; filter: grayscale(1) contrast(1.08); pointer-events: none; }
.arcana .exhibit .caption { position: absolute; left: 14px; right: 14px; bottom: 8px; font: 400 12px var(--type); letter-spacing: .12em; color: var(--ink2); display: flex; justify-content: space-between; gap: 10px; }
.arcana .exhibit .mask { position: absolute; background: var(--ink); display: grid; place-items: center; color: var(--paper); font: 400 11px var(--type); cursor: pointer; outline: 2px solid transparent; outline-offset: 2px; }
.arcana .exhibit .mask.sel { outline-color: var(--ink); }
.arcana .exhibit .lift { display: none; position: absolute; left: 50%; top: calc(100% + 6px); transform: translateX(-50%); white-space: nowrap; font: 400 11px var(--type); letter-spacing: .14em; text-transform: uppercase; background: var(--paper); color: var(--ink); border: 1.5px solid var(--ink); padding: 3px 8px; z-index: 2; }
.arcana .exhibit .mask.sel .lift { display: block; }
.arcana .exhibit .draft { position: absolute; border: 2px dashed var(--ink); background: rgba(22, 21, 20, .25); pointer-events: none; }
.arcana .dropping .exhibit, .arcana .dropping .attach { outline: 3px dashed var(--ink); outline-offset: 6px; }
.arcana .tags { display: flex; gap: 6px; flex-wrap: wrap; }
.arcana .tag { font: 400 11px var(--type); letter-spacing: .16em; text-transform: uppercase; padding: 3px 8px; border: 1.5px solid var(--ink2); color: var(--ink2); }
.arcana .tag.on { background: var(--ink); color: var(--paper); border-color: var(--ink); }
.arcana .err { color: #6d1f1a; font: 400 13px var(--type); }
.arcana .note { color: var(--ink2); font: 400 14px var(--type); }
.arcana .foot-actions { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 22px; flex-wrap: wrap; }
.arcana .makes { font: 400 12px var(--type); letter-spacing: .14em; text-transform: uppercase; color: var(--ink2); }
.arcana .acts { display: flex; gap: 10px; }
.arcana .fileit { font: 400 14px var(--type); letter-spacing: .3em; text-transform: uppercase; padding: 12px 22px 10px; background: var(--ink); color: var(--paper); box-shadow: 3px 3px 0 #000; }
.arcana .fileit:active { transform: translate(2px, 2px); box-shadow: 1px 1px 0 #000; }
.arcana .shred { font: 400 12px var(--type); letter-spacing: .2em; text-transform: uppercase; padding: 10px 14px; border: 1.5px solid var(--ink2); color: var(--ink2); }
.arcana .side { display: grid; gap: 16px; justify-items: center; padding-top: 30px; }
.arcana .proof { position: relative; width: 240px; height: 320px; transform: rotate(2deg); }
.arcana .proof .card { left: 0; top: 0; }
.arcana .proof .card.wide { top: 80px; }
.arcana .side .note { font: italic 400 13px/1.4 var(--fell); color: var(--phos); text-align: center; max-width: 26ch; margin: 0; }
.arcana .cycle { display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; }
@media (max-width: 1100px) {
  .arcana { width: 100vw; height: 100dvh; border: 0; }
  .arcana .desk { grid-template-columns: 1fr; padding: 70px 12px 30px; }
  .arcana .folders { grid-auto-flow: column; grid-auto-columns: minmax(160px, 1fr); overflow-x: auto; padding: 14px 4px; }
  .arcana .folder { margin-top: 0; }
  .arcana .dossier { padding: 28px 18px 30px; }
  .arcana .letterhead { grid-template-columns: 1fr; }
  .arcana .letterhead .fileno { text-align: left; }
}
@media (max-width: 720px) {
  .arcana .decks { max-width: 62%; }
  .arcana .rail { transform: translateY(-46%) scale(.8); transform-origin: right center; right: 6px; }
  .arcana .reward span { display: none; }
}
@media (prefers-reduced-motion: reduce) { .arcana *, .arcana *::before, .arcana *::after { animation-duration: .01s !important; transition-duration: .01s !important; } }
</style>
