<script setup lang="ts">
// Mnemosyne over the Academy (docs/superpowers/specs/2026-10-18-mnemosyne-design.md):
// every topic learned, on dark water. What is held gathers into pools; what
// fades draws back from them and ripples until it is recalled. A recall is
// written on paper, checked against the topic's own key points and rated,
// and FSRS says when it comes back.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import 'katex/dist/katex.min.css';
import { GROUNDS, recallOf, type MnemosyneDto, type TopicDto, type TopicLinkDto } from '@aura/shared';
import Gl from './Gl.vue';
import Plate from './Plate.vue';
import { catSprite, type Draw } from '../gl/plate';
import { reduced } from '../gl/engine';
import { worn } from '../worn';
import { rich } from '../lecturemap';
import { mnemoApi } from '../store';
import { ease, hourglass, hubSlotsFor, look, LOOSE, reach, slotsFor, toneOf, water, withRecall, type Drop, type Look } from '../mnemosyne';

const emit = defineEmits<{ close: [] }>();
const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const smooth = (a: number, b: number, v: number) => { const u = clamp((v - a) / (b - a)); return u * u * (3 - 2 * u); };
const dayLabel = (iso: string | number) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).toLowerCase();
const span = (d: number) => (d < 1.5 ? '1 day' : d < 45 ? `${Math.round(d)} days` : `${Math.round(d / 30)} months`);
const daysTo = (iso: string) => (Date.parse(iso) - Date.now()) / 864e5;

// ---- the map ----------------------------------------------------------------------
const map = ref<MnemosyneDto>({ groups: [], topics: [], links: [] });
const loaded = ref(false);
const error = ref('');
let errorTimer = 0;
function fail(e: unknown) {
  error.value = e instanceof Error ? e.message : 'something went wrong';
  clearTimeout(errorTimer); errorTimer = window.setTimeout(() => { error.value = ''; }, 6000);
}
const topicOf = (id: number | null | undefined) => map.value.topics.find((t) => t.id === id) ?? null;
const groupOf = (id: number | null | undefined) => map.value.groups.find((g) => g.id === id) ?? null;
// A group is the liquid its topics make: with none left, it is gone.
const dry = () => { map.value.groups = map.value.groups.filter((g) => map.value.topics.some((t) => t.groupId === g.id)); };

// What each topic shows now; one just recalled rises from where it was.
const clock = ref(Date.now());
const anims = new Map<number, { from: number; t0: number }>();
function seen(t: TopicDto, now = Date.now()): Look {
  const l = look(t, now), a = anims.get(t.id);
  if (!a) return l;
  const u = (performance.now() - a.t0) / 1800;
  if (u >= 1) { anims.delete(t.id); return l; }
  return withRecall(l, u < 0 ? a.from : lerp(a.from, l.r, ease(u)));
}
// Hubs: a topic marked hub holds whatever is linked to it, and is never
// recalled. Between two hubs, the one the link was drawn from holds the other.
const tree = computed(() => {
  const hubs = new Set(map.value.topics.filter((t) => t.hub).map((t) => t.id));
  const parents = new Map<number, number[]>(), kids = new Map<number, number[]>();
  for (const l of map.value.links) {
    const [p, c] = hubs.has(l.from) ? [l.from, l.to] : hubs.has(l.to) ? [l.to, l.from] : [0, 0];
    if (!p) continue;
    parents.set(c, [...(parents.get(c) ?? []), p]); kids.set(p, [...(kids.get(p) ?? []), c]);
  }
  return { hubs, parents, kids };
});
const isMembership = (l: TopicLinkDto) => tree.value.hubs.has(l.from) || tree.value.hubs.has(l.to);
function ancestors(id: number): number[] {
  const out: number[] = [], stack = [...(tree.value.parents.get(id) ?? [])];
  while (stack.length) { const p = stack.pop()!; if (p === id || out.includes(p)) continue; out.push(p); stack.push(...(tree.value.parents.get(p) ?? [])); }
  return out;
}
function descendants(id: number): TopicDto[] {
  const seen = new Set<number>(), stack = [...(tree.value.kids.get(id) ?? [])];
  while (stack.length) { const c = stack.pop()!; if (c === id || seen.has(c)) continue; seen.add(c); stack.push(...(tree.value.kids.get(c) ?? [])); }
  return [...seen].map(topicOf).filter((t): t is TopicDto => !!t);
}
const fading = computed(() => {
  void clock.value;
  const now = Date.now();
  return map.value.topics.filter((t) => look(t, now).due).sort((a, b) => look(a, now).r - look(b, now).r);
});
const heldPct = computed(() => {
  void clock.value;
  const ls = map.value.topics.filter((t) => t.learned && !t.hub), now = Date.now();
  return ls.length ? Math.round((ls.reduce((a, t) => a + look(t, now).r, 0) / ls.length) * 100) : 0;
});

// Pools of neighbouring groups get slots of their own; a topic changing
// groups pours from its old slot into its new one.
let slots = new Map<number, number>(), hubSlots = new Map<number, number>();
const recolor = () => {
  slots = slotsFor(map.value.groups, map.value.topics);
  hubSlots = hubSlotsFor([...tree.value.hubs], (id) => [topicOf(id)!, ...descendants(id)]);
};
watch(tree, recolor);
const pour = new Map<number, { slot: number; from: number; t0: number }>();

// ---- the view: everything eases toward where it is asked to be ---------------
const root = ref<HTMLElement | null>(null), waterCv = ref<HTMLCanvasElement | null>(null), inkCv = ref<HTMLCanvasElement | null>(null);
const view = { x: 0, y: 0, k: 0.6 }, goal = { x: 0, y: 0, k: 0.6 };
let vel = { x: 0, y: 0 }, W = 0, H = 0, DPR = 1;
const sx = (x: number) => x * view.k + view.x, sy = (y: number) => y * view.k + view.y;
const wx = (x: number) => (x - view.x) / view.k, wy = (y: number) => (y - view.y) / view.k;
function settle() {
  if (act?.kind !== 'pan') { goal.x += vel.x; goal.y += vel.y; vel.x *= 0.9; vel.y *= 0.9; }
  const f = reduced() ? 1 : 0.16;
  view.x += (goal.x - view.x) * f; view.y += (goal.y - view.y) * f; view.k += (goal.k - view.k) * f;
}
function goTo(v: { x: number; y: number; k: number }, now = false) { Object.assign(goal, v); vel = { x: 0, y: 0 }; if (now) Object.assign(view, v); }
type Box = { x0: number; y0: number; x1: number; y1: number };
function fitTo(b: Box, now = false, maxK = 1.3) {
  const wide = W > 860, top = wide ? 120 : (root.value?.querySelector('.top')?.getBoundingClientRect().bottom ?? 120) + 50, bottom = wide ? 130 : 110, side = wide ? 80 : 20;
  const k = clamp(Math.min((W - side * 2) / Math.max(1, b.x1 - b.x0), (H - top - bottom) / Math.max(1, b.y1 - b.y0)), 0.15, maxK);
  goTo({ k, x: W / 2 - ((b.x0 + b.x1) / 2) * k, y: top + (H - top - bottom) / 2 - ((b.y0 + b.y1) / 2) * k }, now);
}
const boundsOf = (ts: TopicDto[], pad = 150): Box => ({ x0: Math.min(...ts.map((t) => t.x)) - pad, x1: Math.max(...ts.map((t) => t.x)) + pad, y0: Math.min(...ts.map((t) => t.y)) - pad - 60, y1: Math.max(...ts.map((t) => t.y)) + pad });
// On a phone the whole map is too small to read: it opens on the group with
// the most fading, and the rest is a pinch away.
function fitAll(now = false) {
  const ts = map.value.topics;
  if (!ts.length) return goTo({ k: 1, x: W / 2, y: H / 2 }, now);
  if (W > 860) return fitTo(boundsOf(ts), now);
  const count = (id: number) => fading.value.filter((t) => t.groupId === id).length;
  const g = [...map.value.groups].sort((a, b) => count(b.id) - count(a.id))[0];
  fitTo(boundsOf(g ? ts.filter((t) => t.groupId === g.id) : ts, 90), now);
}
function zoomAt(by: number, cx: number, cy: number) {
  const k = clamp(goal.k * by, 0.12, 2.4);
  goal.x = cx - ((cx - goal.x) * k) / goal.k; goal.y = cy - ((cy - goal.y) * k) / goal.k; goal.k = k;
}
// A topic floats a little, the way anything on water does.
const bobX = (t: TopicDto, s: number) => (reduced() ? 0 : Math.sin(s * 0.5 + t.x * 0.013) * 3);
const bobY = (t: TopicDto, s: number) => (reduced() ? 0 : Math.cos(s * 0.42 + t.y * 0.011) * 3);

// ---- the water ----------------------------------------------------------------------
let pool: ReturnType<typeof water> | null = null;
const pulses: { id: number; t0: number }[] = [];
function drops(t: number, looks: Map<number, Look>): Drop[] {
  const now = performance.now(), groups = new Map(map.value.groups.map((g) => [g.id, g]));
  const cen = new Map<number, { x: number; y: number; n: number }>();
  for (const tp of map.value.topics) if (tp.groupId !== null) { const c = cen.get(tp.groupId) ?? { x: 0, y: 0, n: 0 }; c.x += tp.x; c.y += tp.y; c.n++; cen.set(tp.groupId, c); }
  return map.value.topics.map((tp) => {
    const l = looks.get(tp.id)!, slot = tp.groupId !== null && slots.has(tp.groupId) ? slots.get(tp.groupId)! : LOOSE;
    let p = pour.get(tp.id);
    if (!p) { p = { slot, from: slot, t0: 0 }; pour.set(tp.id, p); }
    if (p.slot !== slot) { p.from = p.slot; p.slot = slot; p.t0 = now; }
    const c = tp.groupId !== null ? cen.get(tp.groupId) : undefined;
    let above = 0;
    for (const a of ancestors(tp.id)) { const s = hubSlots.get(a); if (s !== undefined) above |= 1 << s; }
    const own = tp.hub && hubSlots.has(tp.id) ? 1 << hubSlots.get(tp.id)! : 0, parent = topicOf(tree.value.parents.get(tp.id)?.[0]);
    return {
      within: above | own, tendril: parent ? above : 0, px: parent ? parent.x + bobX(parent, t) : 0, py: parent ? parent.y + bobY(parent, t) : 0,
      x: tp.x + bobX(tp, t), y: tp.y + bobY(tp, t), reach: reach(tp, l), q: l.q, learned: tp.learned, due: l.due, phase: Math.abs(tp.x * 0.0013 + tp.y * 0.0007) % 1,
      slot: p.slot, from: p.from, mix: ease((now - p.t0) / 450),
      ground: (tp.groupId !== null && groups.get(tp.groupId)?.ground) || 0, tone: toneOf(tp.groupId), cx: c ? c.x / c.n : tp.x, cy: c ? c.y / c.n : tp.y,
    };
  });
}

// ---- the crisp layer: threads, names, drops -------------------------------------------
const INK = { phos: '#c5bcab', hi: '#e6e0d4', dim: '#7a7468', ground: '#121212', unlearned: '#9c9486' };
const rgba = (a: number) => `rgba(197,188,171,${a})`, rgbaHi = (a: number) => `rgba(230,224,212,${a})`;
function text(c: CanvasRenderingContext2D, s: string, x: number, y: number, font: string, color: string, alpha = 1, align: CanvasTextAlign = 'center') {
  if (alpha <= 0.01) return 0;
  c.globalAlpha = alpha; c.font = font; c.textAlign = align; c.textBaseline = 'middle';
  c.lineJoin = 'round'; c.lineWidth = 7; c.strokeStyle = INK.ground; c.strokeText(s, x, y);
  c.fillStyle = color; c.fillText(s, x, y); c.globalAlpha = 1;
  return c.measureText(s).width;
}
let frames: (Box & { id: number })[] = [];
function ink(t: number, looks: Map<number, Look>) {
  const c = inkCv.value!.getContext('2d')!;
  c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, inkCv.value!.width, inkCv.value!.height); c.setTransform(DPR, 0, 0, DPR, 0, 0);
  const k = view.k, ts = map.value.topics;
  // Names arrive as you come closer; what is fading keeps its name longer.
  const near = smooth(0.24, 0.38, k), nearFading = smooth(0.16, 0.26, k), nearHub = smooth(0.14, 0.24, k), far = 1 - smooth(1.0, 1.6, k) * 0.55;
  const pos = new Map(ts.map((tp) => [tp.id, { x: sx(tp.x + bobX(tp, t)), y: sy(tp.y + bobY(tp, t)) }]));
  // Threads: soft curves, as faint as the weaker of their two ends.
  c.lineCap = 'round';
  for (const l of map.value.links) {
    const A = pos.get(l.from), B = pos.get(l.to);
    // What a hub holds hangs from it by liquid, not by a thread.
    if (!A || !B || isMembership(l)) continue;
    const q = Math.min(looks.get(l.from)!.q, looks.get(l.to)!.q), lit = [hover.value, openId.value].some((id) => id === l.from || id === l.to);
    const both = topicOf(l.from)!.learned && topicOf(l.to)!.learned;
    c.strokeStyle = lit ? rgbaHi(0.55) : rgba(both ? 0.1 + 0.16 * q : 0.07); c.lineWidth = lit ? 1.3 : 1;
    c.beginPath(); c.moveTo(A.x, A.y); c.quadraticCurveTo((A.x + B.x) / 2 + (B.y - A.y) * 0.14, (A.y + B.y) / 2 - (B.x - A.x) * 0.14, B.x, B.y); c.stroke();
  }
  if (linking) {
    c.strokeStyle = rgbaHi(0.7); c.lineWidth = 1.2; c.setLineDash([2, 5]);
    c.beginPath(); c.moveTo(sx(linking.from.x), sy(linking.from.y)); c.lineTo(linking.x, linking.y); c.stroke(); c.setLineDash([]);
  }
  // Group names above their pools: large and quiet, and quieter up close.
  frames = [];
  const placed: Box[] = [];
  for (const g of map.value.groups) {
    const ms = ts.filter((x) => x.groupId === g.id);
    if (!ms.length) continue;
    const learned = ms.filter((m) => m.learned && !m.hub), nFading = ms.filter((m) => looks.get(m.id)!.due).length;
    const held = learned.length ? learned.reduce((a, m) => a + looks.get(m.id)!.r, 0) / learned.length : 0;
    const x = sx(ms.reduce((a, m) => a + m.x, 0) / ms.length), y = sy(Math.min(...ms.map((m) => m.y))) - clamp(118 * k, 40, 120), fs = clamp(34 * k, 17, 36);
    const hot = openGroupId.value === g.id || dragGroup === g.id;
    const w = text(c, g.name, x, y, `${fs}px UnifrakturMaguntia`, hot ? INK.hi : INK.phos, far);
    const sub = `${nFading ? `${nFading} fading // ` : ''}${learned.length ? `${Math.round(held * 100)}% held` : 'not learned yet'}`;
    text(c, sub.toUpperCase(), x, y + fs * 0.72, '9px Silkscreen', INK.dim, far * 0.9);
    const box = { x0: x - w / 2 - 8, x1: x + w / 2 + 8, y0: y - fs * 0.6, y1: y + fs * 0.72 + 8 };
    frames.push({ ...box, id: g.id }); placed.push(box);
  }
  // The drops, then their names: what is fading first, then the best held,
  // and none over another.
  const z = clamp(k * 1.4, 0.6, 1.5), fs = clamp(16 * k * 1.15, 14, 21);
  const cands: { tp: TopicDto; x: number; y: number; alpha: number; hot: boolean; pri: number }[] = [];
  for (const tp of ts) {
    const l = looks.get(tp.id)!, p = pos.get(tp.id)!;
    if (p.x < -100 || p.y < -60 || p.x > W + 100 || p.y > H + 60) continue;
    if (tp.hub) {
      // A hub: two rings, the nucleus of its membrane.
      c.strokeStyle = rgbaHi(0.9); c.lineWidth = 1.3; c.beginPath(); c.arc(p.x, p.y, 7 * z, 0, 7); c.stroke();
      c.strokeStyle = rgbaHi(0.55); c.lineWidth = 1; c.beginPath(); c.arc(p.x, p.y, 3 * z, 0, 7); c.stroke();
    } else if (!tp.learned) { c.strokeStyle = rgba(0.55); c.lineWidth = 1; c.beginPath(); c.arc(p.x, p.y, 3.2 * z, 0, 7); c.stroke(); }
    else {
      c.fillStyle = l.due ? rgbaHi(0.5 + 0.5 * Math.abs(Math.sin(t * 1.8 + tp.x))) : rgbaHi(0.55 + 0.45 * l.q);
      c.beginPath(); c.arc(p.x, p.y, (2.4 + Math.min(4, Math.log2(1 + tp.stability)) * 0.55) * z, 0, 7); c.fill();
    }
    const chosen = sel.value.has(tp.id), hot = hover.value === tp.id || openId.value === tp.id || chosen || act?.tp === tp;
    if (hot) { c.strokeStyle = rgbaHi(chosen ? 0.85 : 0.5); c.lineWidth = 1; c.beginPath(); c.arc(p.x, p.y, 13 * z + (chosen ? 2 * Math.sin(t * 3) : 0), 0, 7); c.stroke(); }
    const alpha = hot ? 1 : tp.hub ? nearHub : l.due ? nearFading : near * (tp.learned ? 1 : 0.7);
    if (alpha > 0.02) cands.push({ tp, x: p.x, y: p.y, alpha, hot, pri: (hot ? 0 : tp.hub ? 0.5 : l.due ? 1 : tp.learned ? 2 : 3) * 10 - l.q });
  }
  cands.sort((a, b) => a.pri - b.pri);
  for (const { tp, x, y, alpha, hot } of cands) {
    // A hub's name in spaced capitals, the way a chapter is headed.
    const label = tp.hub ? tp.title.toUpperCase().split('').join('\u2009') : tp.title;
    const font = tp.hub ? `${Math.round(fs * 0.86)}px "IM Fell English"` : `${tp.learned ? '' : 'italic '}${fs}px "IM Fell English"`; c.font = font;
    const w = c.measureText(label).width, ly = y + (tp.hub ? 16 : 13) * z + fs * 0.55;
    const box = { x0: x - w / 2 - 3, x1: x + w / 2 + 3, y0: ly - fs * 0.6, y1: ly + fs * 0.6 };
    if (!hot && placed.some((p) => box.x0 < p.x1 && box.x1 > p.x0 && box.y0 < p.y1 && box.y1 > p.y0)) continue;
    placed.push(box);
    text(c, label, x, ly, font, tp.learned || tp.hub ? INK.hi : INK.unlearned, alpha);
  }
  if (marquee) {
    const m = marquee, x = Math.min(m.x0, m.x1), y = Math.min(m.y0, m.y1), w = Math.abs(m.x1 - m.x0), h = Math.abs(m.y1 - m.y0);
    c.fillStyle = rgba(0.05); c.strokeStyle = rgbaHi(0.6); c.lineWidth = 1; c.setLineDash([3, 5]);
    c.beginPath(); c.roundRect(x, y, w, h, 16); c.fill(); c.stroke(); c.setLineDash([]);
  }
}

// ---- the hand -------------------------------------------------------------------------
const tool = ref<'hand' | 'lens' | 'link'>('hand');
const hover = ref<number | null>(null);
type Act =
  | { kind: 'pan'; x: number; y: number; gx: number; gy: number; moved: boolean; tp?: undefined }
  | { kind: 'node'; tp: TopicDto; x: number; y: number; ox: number; oy: number; moved: boolean; kids: [TopicDto, number, number][]; stay: number }
  | { kind: 'group'; id: number; x: number; y: number; kids: [TopicDto, number, number][]; moved: boolean; tp?: undefined }
  | { kind: 'marquee'; tp?: undefined }
  | { kind: 'link'; tp?: undefined }
  | { kind: 'pinch'; tp?: undefined };
let act: Act | null = null, marquee: Box | null = null, linking: { from: TopicDto; x: number; y: number } | null = null, dragGroup: number | null = null;
const pointers = new Map<number, { x: number; y: number }>();
let lastMove = { x: 0, y: 0, t: 0 };
function topicAt(x: number, y: number) {
  let best: TopicDto | null = null, bd = 1e9;
  for (const tp of map.value.topics) { const d = Math.hypot(sx(tp.x) - x, sy(tp.y) - y); if (d < Math.max(16, 20 * view.k) && d < bd) { bd = d; best = tp; } }
  return best;
}
const frameAt = (x: number, y: number) => frames.find((b) => x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1)?.id ?? null;
// How much two drops overlap is a well as wide as both, so a drop joins
// once its edge meets a pool, and has to be pulled a little further to come
// away again, like surface tension.
function depth(g: number, x: number, y: number, except: TopicDto | null) {
  const now = Date.now(), own = except ? reach(except, seen(except, now)) : 42;
  let v = 0;
  for (const tp of map.value.topics) if (tp.groupId === g && tp !== except) { const r = reach(tp, seen(tp, now)); v += Math.exp(-((x - tp.x) ** 2 + (y - tp.y) ** 2) / (r * r + own * own)); }
  return v;
}
// A topic stays in its own group until it is pulled clearly further from
// the rest than it started (so one placed apart is not lost by a nudge),
// and joins another the moment it touches that one's water.
function poolAt(x: number, y: number, except: TopicDto | null, stay = 0.3): number | null {
  let best: number | null = null, bv = 0;
  for (const g of map.value.groups) {
    const v = depth(g.id, x, y, except);
    if (v > (except?.groupId === g.id ? stay : 0.45) && v > bv) { bv = v; best = g.id; }
  }
  return best;
}
function down(e: PointerEvent) {
  inkCv.value!.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  vel = { x: 0, y: 0 };
  if (pointers.size === 2) { act = { kind: 'pinch' }; marquee = null; linking = null; return; }
  const x = e.clientX, y = e.clientY, tp = topicAt(x, y);
  const lens = tool.value === 'lens' || e.shiftKey || e.button === 2 || e.pointerType === 'pen';
  if (tp && (tool.value === 'link' || e.altKey)) { act = { kind: 'link' }; linking = { from: tp, x, y }; return; }
  // A hub is dragged with everything it holds.
  if (tp && !lens) {
    const start = tp.groupId !== null ? depth(tp.groupId, tp.x, tp.y, tp) : 0;
    act = { kind: 'node', tp, x, y, ox: tp.x, oy: tp.y, moved: false, kids: tp.hub ? descendants(tp.id).map((t) => [t, t.x, t.y]) : [], stay: Math.min(0.3, start * 0.5) };
    return;
  }
  if (lens) { act = { kind: 'marquee' }; marquee = { x0: x, y0: y, x1: x, y1: y }; return; }
  const g = frameAt(x, y);
  if (g !== null) { act = { kind: 'group', id: g, x, y, kids: map.value.topics.filter((t) => t.groupId === g).map((t) => [t, t.x, t.y]), moved: false }; return; }
  act = { kind: 'pan', x, y, gx: goal.x, gy: goal.y, moved: false };
  lastMove = { x, y, t: performance.now() };
}
function move(e: PointerEvent) {
  const p = pointers.get(e.pointerId);
  if (!act) {
    const tp = topicAt(e.clientX, e.clientY);
    hover.value = tp?.id ?? null;
    over.value = !!tp || frameAt(e.clientX, e.clientY) !== null;
    return;
  }
  if (act.kind === 'pinch') {
    if (pointers.size !== 2 || !p) return;
    const [a, b] = [...pointers.values()] as [{ x: number; y: number }, { x: number; y: number }], d0 = Math.hypot(a.x - b.x, a.y - b.y);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const [c2, d2] = [...pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
    zoomAt(Math.hypot(c2.x - d2.x, c2.y - d2.y) / Math.max(1, d0), (c2.x + d2.x) / 2, (c2.y + d2.y) / 2);
    goal.x += (c2.x + d2.x - a.x - b.x) / 2; goal.y += (c2.y + d2.y - a.y - b.y) / 2;
    Object.assign(view, goal);
    return;
  }
  if (p) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (act.kind === 'marquee') { marquee!.x1 = e.clientX; marquee!.y1 = e.clientY; return; }
  if (act.kind === 'link') { linking!.x = e.clientX; linking!.y = e.clientY; return; }
  const dx = e.clientX - act.x, dy = e.clientY - act.y;
  if (Math.abs(dx) + Math.abs(dy) > 5) act.moved = true;
  if (act.kind === 'pan') {
    goal.x = act.gx + dx; goal.y = act.gy + dy; view.x = goal.x; view.y = goal.y;
    const now = performance.now(), dt = Math.max(1, now - lastMove.t);
    vel = { x: ((e.clientX - lastMove.x) / dt) * 16, y: ((e.clientY - lastMove.y) / dt) * 16 };
    lastMove = { x: e.clientX, y: e.clientY, t: now };
  } else if (act.kind === 'node' && act.moved) {
    // The liquid follows while it is held, and the drop changes pools the
    // moment it touches one.
    const tp = act.tp;
    // What a hub holds moves first, so the hub stays in the water it carries.
    for (const [t, ox, oy] of act.kids) { t.x = ox + dx / view.k; t.y = oy + dy / view.k; }
    tp.x = act.ox + dx / view.k; tp.y = act.oy + dy / view.k;
    tp.groupId = poolAt(tp.x, tp.y, tp, act.stay);
  } else if (act.kind === 'group' && act.moved) {
    dragGroup = act.id;
    for (const [t, ox, oy] of act.kids) { t.x = ox + dx / view.k; t.y = oy + dy / view.k; }
  }
}
function up(e: PointerEvent) {
  pointers.delete(e.pointerId);
  const a = act;
  act = null; dragGroup = null;
  if (!a) return;
  if (a.kind === 'pan' && performance.now() - lastMove.t > 80) vel = { x: 0, y: 0 };
  if (a.kind === 'node') {
    if (!a.moved) { openTopic(a.tp.id); return; }
    dry(); recolor();
    mnemoApi.place([a.tp, ...a.kids.map(([t]) => t)].map((t) => ({ id: t.id, x: t.x, y: t.y, groupId: t.groupId }))).catch(fail);
  } else if (a.kind === 'group') {
    if (!a.moved) { openGroup(a.id); return; }
    recolor();
    mnemoApi.place(a.kids.map(([t]) => ({ id: t.id, x: t.x, y: t.y, groupId: t.groupId }))).catch(fail);
  } else if (a.kind === 'pan' && !a.moved) { closePanel(); clearSel(); }
  else if (a.kind === 'marquee' && marquee) {
    const m = marquee, x0 = Math.min(m.x0, m.x1), x1 = Math.max(m.x0, m.x1), y0 = Math.min(m.y0, m.y1), y1 = Math.max(m.y0, m.y1);
    marquee = null;
    sel.value = new Set(map.value.topics.filter((t) => sx(t.x) >= x0 && sx(t.x) <= x1 && sy(t.y) >= y0 && sy(t.y) <= y1).map((t) => t.id));
    selAt.value = { x: clamp((x0 + x1) / 2, 200, W - 200), y: clamp(y1 + 14, 120, H - 150) };
  } else if (a.kind === 'link' && linking) {
    const from = linking.from, to = topicAt(e.clientX, e.clientY);
    linking = null;
    if (to && to !== from && !map.value.links.some((l) => l.from === from.id && l.to === to.id)) {
      mnemoApi.link(from.id, to.id).then((l) => { map.value.links.push(l); }).catch(fail);
    }
  }
}
const over = ref(false);
function wheel(e: WheelEvent) { vel = { x: 0, y: 0 }; zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016)), e.clientX, e.clientY); }
function dbl(e: MouseEvent) { if (!topicAt(e.clientX, e.clientY)) add(wx(e.clientX), wy(e.clientY)); }

// ---- choosing an area -------------------------------------------------------------------
const sel = ref(new Set<number>());
const selAt = ref({ x: 0, y: 0 });
const chosen = computed(() => [...sel.value].map(topicOf).filter((t): t is TopicDto => !!t));
const clearSel = () => { sel.value = new Set(); };
function focusChosen() { fitTo(boundsOf(chosen.value, 110), false, 1.6); }
function recallChosen() {
  const now = Date.now();
  startRecall(chosen.value.filter((t) => t.learned && !t.hub).sort((a, b) => Number(look(b, now).due) - Number(look(a, now).due) || look(a, now).r - look(b, now).r).map((t) => t.id));
}
async function gather() {
  const ids = chosen.value.map((t) => t.id);
  clearSel();
  try {
    const g = await mnemoApi.group('New group', ids);
    map.value.groups.push(g);
    for (const t of map.value.topics) if (ids.includes(t.id)) t.groupId = g.id;
    dry(); recolor(); openGroup(g.id, true);
  } catch (e) { fail(e); }
}

// ---- a topic, opened ------------------------------------------------------------------------
const openId = ref<number | null>(null), openGroupId = ref<number | null>(null), editing = ref(false), sure = ref(false);
const opened = computed(() => topicOf(openId.value));
const openedGroup = computed(() => groupOf(openGroupId.value));
const openLook = computed(() => { void clock.value; return opened.value ? look(opened.value, Date.now()) : null; });
const builds = computed(() => map.value.links.filter((l) => l.to === openId.value && !isMembership(l)).map((l) => ({ l, t: topicOf(l.from)! })).filter((x) => x.t));
const holds = computed(() => map.value.links.filter((l) => l.from === openId.value && !isMembership(l)).map((l) => ({ l, t: topicOf(l.to)! })).filter((x) => x.t));
// The hubs it sits in, and for a hub, what it holds.
const linkOf = (a: number, b: number) => map.value.links.find((l) => (l.from === a && l.to === b) || (l.from === b && l.to === a))!;
const inside = computed(() => (tree.value.parents.get(openId.value ?? 0) ?? []).map((id) => ({ l: linkOf(id, openId.value!), t: topicOf(id)! })).filter((x) => x.t && x.l));
const members = computed(() => (tree.value.kids.get(openId.value ?? 0) ?? []).map((id) => ({ l: linkOf(id, openId.value!), t: topicOf(id)! })).filter((x) => x.t && x.l));
const hubAll = computed(() => (opened.value?.hub ? descendants(opened.value.id) : []));
const hubFading = computed(() => { void clock.value; const now = Date.now(); return hubAll.value.filter((t) => look(t, now).due).sort((a, b) => look(a, now).r - look(b, now).r); });
const hubHeld = computed(() => { void clock.value; const ls = hubAll.value.filter((t) => t.learned && !t.hub), now = Date.now(); return ls.length ? Math.round((ls.reduce((a, t) => a + look(t, now).r, 0) / ls.length) * 100) : 0; });
// Two hubs linked the wrong way round: the link turned, so the other holds.
async function turn(l: TopicLinkDto) {
  try {
    await mnemoApi.unlink(l.id);
    const back = await mnemoApi.link(l.to, l.from);
    map.value.links = [...map.value.links.filter((x) => x.id !== l.id), back];
  } catch (e) { fail(e); }
}
const focusHub = () => { const t = opened.value!; fitTo(boundsOf([t, ...hubAll.value], 120), false, 1.4); };
const draft = ref({ title: '', points: '', hub: false });
const titleField = ref<HTMLInputElement | null>(null), nameField = ref<HTMLInputElement | null>(null), curveEl = ref<HTMLCanvasElement | null>(null);
function closePanel() { openId.value = null; openGroupId.value = null; editing.value = false; sure.value = false; }
function openTopic(id: number, edit = false) {
  clearSel(); openGroupId.value = null; openId.value = id; sure.value = false;
  editing.value = edit;
  const t = topicOf(id)!;
  draft.value = { title: t.title, points: t.points.join('\n'), hub: t.hub };
  if (edit) nextTick(() => { titleField.value?.focus(); titleField.value?.select(); });
}
function openGroup(id: number, rename = false) {
  clearSel(); openId.value = null; editing.value = false; openGroupId.value = id;
  if (rename) nextTick(() => { nameField.value?.focus(); nameField.value?.select(); });
}
const addHere = () => add(wx(W / 2), wy(H / 2));
const focusGroup = () => fitTo(boundsOf(groupTopics.value, 120), false, 1.4);
function goToTopic(t: TopicDto) { const k = Math.max(goal.k, 0.8); goTo({ k, x: W / 2 - t.x * k, y: H / 2 - t.y * k }); openTopic(t.id); }
async function add(x: number, y: number) {
  try {
    const t = await mnemoApi.add({ title: 'New topic', x, y, groupId: poolAt(x, y, null) });
    map.value.topics.push(t); recolor(); openTopic(t.id, true);
  } catch (e) { fail(e); }
}
async function save() {
  const t = opened.value!;
  const body = { title: draft.value.title.trim() || 'Untitled', points: draft.value.points.split('\n').map((s) => s.trim()).filter(Boolean), hub: draft.value.hub };
  try { Object.assign(t, await mnemoApi.edit(t.id, body)); editing.value = false; } catch (e) { fail(e); }
}
async function remove() {
  if (!sure.value) { sure.value = true; return; }
  const t = opened.value!;
  closePanel();
  try {
    await mnemoApi.remove(t.id);
    map.value.topics = map.value.topics.filter((x) => x !== t);
    map.value.links = map.value.links.filter((l) => l.from !== t.id && l.to !== t.id);
    dry(); recolor();
  } catch (e) { fail(e); }
}
async function unlink(l: TopicLinkDto) {
  try { await mnemoApi.unlink(l.id); map.value.links = map.value.links.filter((x) => x.id !== l.id); } catch (e) { fail(e); }
}
// Marked learned: its first good, and its clock starts.
async function markLearned(t: TopicDto) {
  try { Object.assign(t, await mnemoApi.review(t.id, 3)); anims.set(t.id, { from: 0.6, t0: performance.now() }); pulses.push({ id: t.id, t0: performance.now() }); } catch (e) { fail(e); }
}
function renameGroup() {
  const g = openedGroup.value!, name = g.name.trim() || 'Untitled';
  g.name = name;
  mnemoApi.editGroup(g.id, { name }).catch(fail);
}
function groundOf(i: number) { const g = openedGroup.value!; g.ground = i; mnemoApi.editGroup(g.id, { ground: i }).catch(fail); }
async function dissolve() {
  const g = openedGroup.value!;
  closePanel();
  try { await mnemoApi.dissolve(g.id); for (const t of map.value.topics) if (t.groupId === g.id) t.groupId = null; dry(); recolor(); } catch (e) { fail(e); }
}
const groupFading = computed(() => (openedGroup.value ? fading.value.filter((t) => t.groupId === openedGroup.value!.id) : []));
const groupTopics = computed(() => map.value.topics.filter((t) => t.groupId === openGroupId.value));
// The forgetting curve: smooth, the 90% line, and where it stands now.
function drawCurve() {
  const cv = curveEl.value, t = opened.value;
  if (!cv || !t?.learned || !t.lastReview) return;
  const w = cv.clientWidth, h = cv.clientHeight; cv.width = w * DPR; cv.height = h * DPR;
  const c = cv.getContext('2d')!; c.setTransform(DPR, 0, 0, DPR, 0, 0);
  const l0 = Date.parse(t.lastReview), now = Math.max(0, (Date.now() - l0) / 864e5), T = Math.max(t.stability * 2.2, now * 1.25, 3);
  const X = (d: number) => 6 + (d / T) * (w - 12), Y = (r: number) => 8 + ((1 - r) / 0.45) * (h - 26);
  const r = (d: number) => Math.max(0.55, recallOf(d, t.stability));
  c.font = '9px Silkscreen'; c.textBaseline = 'middle';
  const fill = c.createLinearGradient(0, 0, 0, h); fill.addColorStop(0, rgba(0.14)); fill.addColorStop(1, rgba(0));
  c.beginPath(); c.moveTo(X(0), h - 18);
  for (let i = 0; i <= 80; i++) c.lineTo(X((i / 80) * T), Y(r((i / 80) * T)));
  c.lineTo(X(T), h - 18); c.closePath(); c.fillStyle = fill; c.fill();
  c.strokeStyle = rgba(0.25); c.setLineDash([2, 4]); c.beginPath(); c.moveTo(X(0), Y(0.9)); c.lineTo(X(T), Y(0.9)); c.stroke(); c.setLineDash([]);
  c.fillStyle = INK.dim; c.textAlign = 'right'; c.fillText('90%', X(T), Y(0.9) - 8);
  c.strokeStyle = INK.phos; c.lineWidth = 1.5; c.lineCap = 'round'; c.beginPath();
  for (let i = 0; i <= 80; i++) { const d = (i / 80) * T; if (i) c.lineTo(X(d), Y(r(d))); else c.moveTo(X(d), Y(r(d))); }
  c.stroke();
  c.fillStyle = INK.dim; c.textAlign = 'left'; c.fillText(dayLabel(l0), X(0), h - 6); c.textAlign = 'right'; c.fillText(dayLabel(l0 + T * 864e5), X(T), h - 6);
  c.fillStyle = INK.ground; c.beginPath(); c.arc(X(now), Y(r(now)), 6, 0, 7); c.fill();
  c.fillStyle = INK.hi; c.beginPath(); c.arc(X(now), Y(r(now)), 3.5, 0, 7); c.fill();
}
watch([opened, editing, clock, () => opened.value?.lastReview], () => nextTick(drawCurve));

// ---- the recall -------------------------------------------------------------------------------
type Pose = 'curious' | 'still' | 'sitting';
type Recall = { queue: number[]; i: number; step: 1 | 2; t0: number; secs: number; ticks: Set<number>; peek: boolean; pose: Pose; said: string; done: number[] };
const rc = ref<Recall | null>(null);
const elapsed = ref('0:00');
const current = computed(() => (rc.value ? topicOf(rc.value.queue[rc.value.i]) : null));
const clockOf = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const glass = hourglass(() => rc.value?.t0 ?? performance.now());
function startRecall(ids: number[]) {
  if (!ids.length) return;
  closePanel(); clearSel();
  rc.value = { queue: ids, i: 0, step: 1, t0: performance.now(), secs: 0, ticks: new Set(), peek: false, pose: 'still', said: '', done: [] };
  centreOn(topicOf(ids[0])!);
}
function centreOn(t: TopicDto) { const k = Math.max(0.8, goal.k); goTo({ k, x: W / 2 - t.x * k, y: H / 2 - t.y * k }); }
function check() {
  const r = rc.value!;
  r.step = 2; r.secs = (performance.now() - r.t0) / 1000; r.pose = 'curious';
}
function tick(i: number) { const s = rc.value!.ticks; if (s.has(i)) s.delete(i); else s.add(i); }
const suggested = computed(() => {
  const r = rc.value, n = current.value?.points.length ?? 0;
  if (!r || !n) return 3;
  const p = r.ticks.size / n;
  return p < 0.5 ? 1 : p < 0.75 ? 2 : p < 1 ? 3 : 4;
});
const RATES = ['again', 'hard', 'good', 'easy'];
const VERDICT: Record<number, { says: string; pose: Pose }> = {
  1: { says: 'It slipped. Better here than in the exam.', pose: 'still' },
  2: { says: 'Most of it, with a struggle. It comes back sooner.', pose: 'curious' },
  3: { says: 'It holds. I felt that from here.', pose: 'sitting' },
  4: { says: 'All of it, clean. You make this look easy.', pose: 'sitting' },
};
// What he says once a round of recalls is through, for a little while.
const after = ref(''); let afterTimer = 0, peekTimer = 0;
async function rate(g: number) {
  const r = rc.value, t = current.value;
  if (!r || !t || r.peek) return;
  const from = seen(t).r;
  r.peek = true; r.pose = VERDICT[g]!.pose; r.said = VERDICT[g]!.says; r.done.push(g);
  // The sheet steps aside and the water shows what the answer did.
  try {
    Object.assign(t, await mnemoApi.review(t.id, g));
    anims.set(t.id, { from, t0: performance.now() + 300 }); pulses.push({ id: t.id, t0: performance.now() + 300 });
    if (t.due) r.said = `${VERDICT[g]!.says} Back in ${span(daysTo(t.due))}.`;
  } catch (e) { fail(e); }
  clearTimeout(peekTimer);
  peekTimer = window.setTimeout(() => {
    const now = rc.value;
    if (!now) return;
    now.i++;
    if (now.i >= now.queue.length) { closeRecall(true); return; }
    Object.assign(now, { step: 1, t0: performance.now(), ticks: new Set(), peek: false, pose: 'still' });
    centreOn(topicOf(now.queue[now.i])!);
  }, 2400);
}
function skip() {
  const r = rc.value!;
  r.i++;
  if (r.i >= r.queue.length) { closeRecall(true); return; }
  Object.assign(r, { step: 1, t0: performance.now(), ticks: new Set(), pose: 'still' });
  centreOn(topicOf(r.queue[r.i])!);
}
function closeRecall(finished: boolean) {
  const r = rc.value;
  clearTimeout(peekTimer);
  rc.value = null;
  if (finished && r?.done.length) {
    after.value = `${r.done.length} recalled, ${r.done.filter((g) => g > 1).length} held. Lethe takes nothing today.`;
    clearTimeout(afterTimer); afterTimer = window.setTimeout(() => { after.value = ''; }, 8000);
  }
  clock.value = Date.now();
}

// ---- Kael'thos -----------------------------------------------------------------------------------
const sprites: Partial<Record<Pose, HTMLCanvasElement>> = {};
const pose = computed<Pose>(() => (rc.value ? rc.value.pose : after.value ? 'sitting' : 'curious'));
const drawCat: Draw = (g, w, h, t) => {
  const glow = g.createRadialGradient(w * 0.5, h * 0.62, 0, w * 0.5, h * 0.62, w * 0.6);
  glow.addColorStop(0, 'rgba(110,110,110,.6)'); glow.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = glow; g.fillRect(0, 0, w, h);
  const s = sprites[pose.value] ?? sprites.curious;
  if (!s) return;
  const z = w * 0.92, bob = reduced() ? 0 : Math.sin(t * 1.6) * z * 0.012;
  g.drawImage(s, w / 2 - z / 2, h - z + bob + w * 0.04, z, z);
};
const line = computed(() => {
  void clock.value;
  if (!loaded.value) return 'The water is still. A moment.';
  if (rc.value?.peek) return rc.value.said;
  if (after.value) return after.value;
  if (!map.value.topics.length) return 'Nothing here yet. Double-click the water, or press the plus, and write your first topic.';
  if (sel.value.size) return `${sel.value.size} chosen. Focus on them, recall them, or make them a group.`;
  const h = topicOf(hover.value);
  if (h) {
    const l = look(h, Date.now());
    if (h.hub) { const all = descendants(h.id).filter((t) => !t.hub), f = all.filter((t) => look(t, Date.now()).due).length; return `${h.title} holds ${all.length} topic${all.length === 1 ? '' : 's'}${f ? `; ${f} fading` : ''}. Drag it and they come along.`; }
    if (!h.learned) return `${h.title}. Not learned yet; once it is, its clock starts.`;
    if (l.due) return `${h.title} is ${l.kind === 'slipping' ? 'slipping into Lethe' : 'fading'}. Write it out before the water takes it.`;
    return `${h.title}, ${Math.round(l.r * 100)}% held. It keeps until ${dayLabel(h.due!)}.`;
  }
  const f = fading.value;
  if (!f.length) return 'Nothing is fading. Everything you learned is still here.';
  return `${f.length} ${f.length === 1 ? 'is' : 'are'} fading. ${f[0]!.title} first; it is at ${Math.round(look(f[0]!, Date.now()).r * 100)}%.`;
});

// ---- the loop ------------------------------------------------------------------------------------
let raf = 0, clockTimer = 0;
function frame(nowMs: number) {
  const t = nowMs / 1000, now = Date.now();
  settle();
  const looks = new Map(map.value.topics.map((tp) => [tp.id, seen(tp, now)]));
  for (let i = pulses.length - 1; i >= 0; i--) if (nowMs - pulses[i]!.t0 > 1900) pulses.splice(i, 1);
  pool?.draw(view, t, drops(t, looks), pulses.slice(0, 4).flatMap((p) => { const tp = topicOf(p.id); const age = (nowMs - p.t0) / 1000; return tp && age >= 0 ? [{ x: tp.x, y: tp.y, age }] : []; }));
  ink(t, looks);
  if (rc.value?.step === 1) elapsed.value = clockOf((nowMs - rc.value.t0) / 1000);
  raf = requestAnimationFrame(frame);
}
function resize() {
  const el = root.value;
  if (!el) return;
  W = el.clientWidth; H = el.clientHeight; DPR = Math.min(2, devicePixelRatio || 1);
  pool?.size(W, H);
  inkCv.value!.width = Math.round(W * DPR); inkCv.value!.height = Math.round(H * DPR);
}
// Keys stay here while the water is open.
function key(e: KeyboardEvent) {
  if ((e.target as HTMLElement).closest?.('input, textarea')) return;
  e.stopPropagation();
  const r = rc.value;
  if (r) {
    if (e.key === 'Escape') closeRecall(false);
    else if (r.step === 1 && e.key === ' ') { e.preventDefault(); check(); }
    else if (r.step === 2 && /^[1-4]$/.test(e.key)) rate(Number(e.key));
    return;
  }
  if (e.key === 'Escape') { if (openId.value !== null || openGroupId.value !== null || sel.value.size) { closePanel(); clearSel(); } else emit('close'); }
  else if (e.key === 'f') fitAll();
}
let observer: ResizeObserver | null = null;
onMounted(async () => {
  for (const p of ['curious', 'still', 'sitting'] as Pose[]) catSprite(worn(p), 300).then((s) => { sprites[p] = s; });
  pool = water(waterCv.value!);
  observer = new ResizeObserver(resize); observer.observe(root.value!);
  resize();
  addEventListener('keydown', key, true);
  clockTimer = window.setInterval(() => { clock.value = Date.now(); }, 30_000);
  raf = requestAnimationFrame(frame);
  try { map.value = await mnemoApi.load(); } catch (e) { fail(e); }
  recolor(); loaded.value = true;
  await document.fonts.ready;
  fitAll(true);
});
onBeforeUnmount(() => {
  cancelAnimationFrame(raf); clearInterval(clockTimer); clearTimeout(peekTimer); clearTimeout(errorTimer); clearTimeout(afterTimer);
  removeEventListener('keydown', key, true); observer?.disconnect(); pool?.dispose();
});
const X = 'M2.5 2.5l7 7M9.5 2.5l-7 7';
</script>

<template>
  <Teleport to="body">
    <div ref="root" class="mn" role="dialog" aria-modal="true" aria-label="Mnemosyne, the map of everything learned">
      <canvas ref="waterCv" class="layer water" aria-hidden="true"></canvas>
      <canvas ref="inkCv" class="layer ink" :class="[tool, { over }]" aria-label="The map of every topic. Drag to move, scroll to zoom, shift-drag to choose an area."
              @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up" @wheel.prevent="wheel" @dblclick="dbl" @contextmenu.prevent></canvas>

      <header class="top">
        <div class="name">
          <h1>Mnemosyne</h1>
          <div class="line pix"><span><b>{{ map.topics.filter((t) => !t.hub).length }}</b>topics</span><span><b>{{ fading.length }}</b>fading</span><span><b>{{ heldPct }}%</b>held</span></div>
        </div>
        <div class="right">
          <div class="row">
            <button class="due glass pill" :disabled="!fading.length" @click="startRecall(fading.map((t) => t.id))">recall<em> what is fading</em> <b>{{ fading.length }}</b></button>
            <button class="x glass close" aria-label="close" title="close (esc)" @click="emit('close')"><svg viewBox="0 0 12 12"><path :d="X" /></svg></button>
          </div>
          <div class="tools glass pill">
            <button class="tool" :class="{ on: tool === 'hand' }" title="move around (drag)" aria-label="move" @click="tool = 'hand'"><svg viewBox="0 0 16 16"><path d="M8 2v12M2 8h12M8 2 6.5 3.5M8 2l1.5 1.5M8 14l-1.5-1.5M8 14l1.5-1.5M2 8l1.5-1.5M2 8l1.5 1.5M14 8l-1.5-1.5M14 8l-1.5 1.5" /></svg></button>
            <button class="tool" :class="{ on: tool === 'lens' }" title="choose an area (or shift-drag, or the pencil)" aria-label="choose an area" @click="tool = 'lens'"><svg viewBox="0 0 16 16"><rect x="2" y="2" width="12" height="12" rx="4" stroke-dasharray="2.4 2.4" /></svg></button>
            <button class="tool" :class="{ on: tool === 'link' }" title="link: drag from a topic to one that builds on it (or alt-drag)" aria-label="link" @click="tool = 'link'"><svg viewBox="0 0 16 16"><circle cx="4" cy="12" r="2" /><circle cx="12" cy="4" r="2" /><path d="M5.6 10.4c2-1 2.8-2.8 4.8-4.8" /></svg></button>
            <button class="tool" title="a new topic (or double-click the water)" aria-label="new topic" @click="addHere"><svg viewBox="0 0 16 16"><path d="M8 3.5v9M3.5 8h9" /></svg></button>
            <button class="tool" title="everything in view (f)" aria-label="everything in view" @click="fitAll()"><svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.5" /><circle cx="8" cy="8" r="1.4" /></svg></button>
          </div>
        </div>
      </header>

      <div class="kael">
        <Plate class="cat" :draw="drawCat" :active="true" :animated="true" :cell="2" label="Kael'thos" />
        <Transition name="say" mode="out-in"><p :key="line" class="say glass">{{ line }}</p></Transition>
      </div>
      <p v-if="error" class="err glass pill">{{ error }}</p>

      <div v-if="sel.size" class="selbar glass pill" :style="{ left: `${selAt.x}px`, top: `${selAt.y}px` }">
        <span class="pix">{{ sel.size }} chosen<template v-if="chosen.filter((t) => look(t, clock).due).length"> // {{ chosen.filter((t) => look(t, clock).due).length }} fading</template></span>
        <button class="chip" @click="focusChosen">focus</button>
        <button class="chip solid" :disabled="!chosen.some((t) => t.learned)" @click="recallChosen">recall these</button>
        <button class="chip" @click="gather">make a group</button>
        <button class="chip quiet" @click="clearSel">clear</button>
      </div>

      <aside v-if="opened" :key="`t${opened.id}`" class="panel glass">
        <div v-if="!editing && opened.hub" class="body">
          <div class="head"><span class="pix">{{ groupOf(opened.groupId)?.name ?? 'no group' }} // a hub</span><button class="x" aria-label="close" @click="closePanel"><svg viewBox="0 0 12 12"><path :d="X" /></svg></button></div>
          <h2 class="hubname">{{ opened.title }}</h2>
          <p v-if="hubAll.length" class="state">Holds <b>{{ hubAll.filter((t) => !t.hub).length }}</b> topics<template v-if="hubFading.length">, <b>{{ hubFading.length }}</b> fading</template><template v-if="hubHeld">; <b>{{ hubHeld }}%</b> held</template>.</p>
          <p v-else class="state">Holds nothing yet. Link topics to it with the link tool, and they hang from it.</p>
          <div v-if="opened.points.length" class="pts"><ol><li v-for="(p, i) in opened.points" :key="i" v-html="rich(p)"></li></ol></div>
          <p v-if="members.length" class="rel">Holds <span v-for="(b, i) in members" :key="b.l.id" class="ln"><button :class="{ sub: b.t.hub }" @click="goToTopic(b.t)">{{ b.t.title }}</button><button class="un" title="let it go from here" aria-label="unlink" @click="unlink(b.l)">&times;</button>{{ i < members.length - 1 ? ', ' : '.' }}</span></p>
          <p v-for="b in inside" :key="b.l.id" class="rel">Sits inside <span class="ln"><button @click="goToTopic(b.t)">{{ b.t.title }}</button></span>. <button v-if="b.t.hub" class="turn" @click="turn(b.l)">turn it around</button></p>
          <div class="acts">
            <button class="btn" :disabled="!hubFading.length" @click="startRecall(hubFading.map((t) => t.id))">recall its fading</button>
            <button class="btn ghost" :disabled="!hubAll.length" @click="focusHub">focus</button>
            <button class="btn ghost" @click="openTopic(opened.id, true)">edit</button>
          </div>
        </div>
        <div v-else-if="!editing" class="body">
          <div class="head"><span class="pix">{{ groupOf(opened.groupId)?.name ?? 'no group' }}</span><button class="x" aria-label="close" @click="closePanel"><svg viewBox="0 0 12 12"><path :d="X" /></svg></button></div>
          <h2>{{ opened.title }}</h2>
          <p v-if="!opened.learned || !openLook" class="state">Not learned yet. Its clock starts once you mark it.</p>
          <p v-else-if="!openLook.due" class="state"><b>{{ Math.round(openLook.r * 100) }}%</b> held. It comes back on <b>{{ dayLabel(opened.due!) }}</b>.</p>
          <p v-else class="state"><b>{{ Math.round(openLook.r * 100) }}%</b> and {{ openLook.kind === 'slipping' ? 'slipping into Lethe' : 'fading' }}. Due since {{ dayLabel(opened.due!) }}.</p>
          <canvas v-if="opened.learned" ref="curveEl" class="curve" aria-label="its forgetting curve"></canvas>
          <div v-if="opened.learned" class="facts">
            <span><b>{{ opened.stability.toFixed(1) }}d</b><span class="pix">stability</span></span>
            <span><b>{{ opened.reps }}</b><span class="pix">recalls</span></span>
            <span><b>{{ opened.lapses }}</b><span class="pix">slipped</span></span>
          </div>
          <div class="pts">
            <ol v-if="opened.points.length"><li v-for="(p, i) in opened.points" :key="i" v-html="rich(p)"></li></ol>
            <p v-else class="rel">No key points yet. Edit to add them, one a line; the recall is checked against them.</p>
          </div>
          <p v-if="inside.length" class="rel">Inside <span v-for="(b, i) in inside" :key="b.l.id" class="ln"><button class="sub" @click="goToTopic(b.t)">{{ b.t.title }}</button><button class="un" title="take it out" aria-label="unlink" @click="unlink(b.l)">&times;</button>{{ i < inside.length - 1 ? ', ' : '.' }}</span></p>
          <p v-if="builds.length || holds.length" class="rel">
            <template v-if="builds.length">Builds on <span v-for="(b, i) in builds" :key="b.l.id" class="ln"><button @click="goToTopic(b.t)">{{ b.t.title }}</button><button class="un" title="unlink" aria-label="unlink" @click="unlink(b.l)">&times;</button>{{ i < builds.length - 1 ? ', ' : '. ' }}</span></template>
            <template v-if="holds.length">Holds up <span v-for="(b, i) in holds" :key="b.l.id" class="ln"><button @click="goToTopic(b.t)">{{ b.t.title }}</button><button class="un" title="unlink" aria-label="unlink" @click="unlink(b.l)">&times;</button>{{ i < holds.length - 1 ? ', ' : '.' }}</span></template>
          </p>
          <div class="acts">
            <button v-if="opened.learned" class="btn" @click="startRecall([opened.id])">recall it now</button>
            <button v-else class="btn" @click="markLearned(opened)">mark learned</button>
            <button class="btn ghost" @click="openTopic(opened.id, true)">edit</button>
          </div>
        </div>
        <form v-else class="body" @submit.prevent="save">
          <div class="head"><span class="pix">{{ groupOf(opened.groupId)?.name ?? 'no group' }} // editing</span><button type="button" class="x" aria-label="close" @click="closePanel"><svg viewBox="0 0 12 12"><path :d="X" /></svg></button></div>
          <label class="lab"><span class="pix">name</span><input ref="titleField" v-model="draft.title" class="field" maxlength="200"></label>
          <label class="lab"><span class="pix">{{ draft.hub ? 'notes // one a line // $maths$ works' : 'key points // one a line // $maths$ works' }}</span><textarea v-model="draft.points" class="field" rows="7"></textarea></label>
          <label class="toggle">
            <input v-model="draft.hub" type="checkbox">
            <i aria-hidden="true"></i>
            <span><b>a hub</b> It holds the topics linked to it, hubs inside hubs, and is never recalled itself.</span>
          </label>
          <div class="acts">
            <button class="btn" type="submit">keep</button>
            <button class="btn ghost" type="button" @click="editing = false">cancel</button>
            <button class="btn ghost" type="button" @click="remove">{{ sure ? 'sure? let it go' : 'let it go' }}</button>
          </div>
        </form>
      </aside>

      <aside v-else-if="openedGroup" :key="`g${openedGroup.id}`" class="panel glass">
        <div class="body">
          <div class="head"><span class="pix">a group</span><button class="x" aria-label="close" @click="closePanel"><svg viewBox="0 0 12 12"><path :d="X" /></svg></button></div>
          <input ref="nameField" v-model="openedGroup.name" class="field gname" maxlength="200" aria-label="its name" @change="renameGroup" @keydown.enter="($event.target as HTMLInputElement).blur()">
          <div class="facts">
            <span><b>{{ groupTopics.length }}</b><span class="pix">topics</span></span>
            <span><b>{{ groupFading.length }}</b><span class="pix">fading</span></span>
            <span><b>{{ groupTopics.filter((t) => !t.learned).length }}</b><span class="pix">not learned</span></span>
          </div>
          <span class="pix">its water</span>
          <div class="grounds">
            <button v-for="(n, i) in GROUNDS" :key="n" :class="{ on: openedGroup.ground === i }" @click="groundOf(i)"><i :class="`g${i}`"></i>{{ n }}</button>
          </div>
          <div class="acts">
            <button class="btn" :disabled="!groupFading.length" @click="startRecall(groupFading.map((t) => t.id))">recall its fading</button>
            <button class="btn ghost" @click="focusGroup">focus</button>
            <button class="btn ghost" @click="dissolve">dissolve</button>
          </div>
          <p class="rel">Drag its name to move it whole. Drop a topic into its water and it joins; pull it out and it leaves.</p>
        </div>
      </aside>

      <div v-if="rc && current" class="recall" :class="{ peek: rc.peek }">
        <section :key="`${rc.i}.${rc.step}`" class="sheet" aria-label="the recall">
          <div class="head">
            <span class="pix">{{ rc.i + 1 }} of {{ rc.queue.length }} // {{ groupOf(current.groupId)?.name ?? 'no group' }}<template v-if="rc.step === 2"> // written for {{ clockOf(rc.secs) }}</template></span>
            <button class="x" aria-label="close" @click="closeRecall(false)"><svg viewBox="0 0 12 12"><path :d="X" /></svg></button>
          </div>
          <h2>{{ current.title }}</h2>
          <template v-if="rc.step === 1">
            <p class="lead">Write out everything you know about it, on paper or in Notability. No looking. Stop when nothing more comes.</p>
            <div class="writing">
              <div class="hg"><Gl :key="rc.i" :build="glass" :active="true" :options="{ px: 2, drift: 0.006, tilt: 0.12, yaw: 0.4, distance: 6.4 }" label="An hourglass of five minutes." hint="" /></div>
              <div class="timer"><span class="pix">writing for</span><b>{{ elapsed }}</b><span class="rsay">{{ Math.round(look(current, clock).r * 100) }}% held. I am not looking either.</span></div>
            </div>
            <div class="acts"><button class="btn" @click="check">done writing // space</button><button class="btn ghost" @click="skip">not now</button></div>
          </template>
          <template v-else>
            <p class="lead">{{ current.points.length ? 'Your key points. Tick only what is on your page.' : 'No key points yet; rate it by how much came back.' }}</p>
            <template v-if="current.points.length">
              <ol class="check">
                <li v-for="(p, i) in current.points" :key="i"><button :class="{ on: rc.ticks.has(i) }" @click="tick(i)"><i></i><span v-html="rich(p)"></span></button></li>
              </ol>
              <div class="meter"><span class="pix">{{ rc.ticks.size }} of {{ current.points.length }}</span><span class="track"><i :style="{ width: `${(rc.ticks.size / current.points.length) * 100}%` }"></i></span></div>
            </template>
            <div class="rates">
              <button v-for="(w, i) in RATES" :key="w" :class="{ suggest: suggested === i + 1 }" :disabled="rc.peek" @click="rate(i + 1)"><b>{{ w }}</b><span>{{ current.next ? span(daysTo(current.next[i]!)) : '' }}</span></button>
            </div>
          </template>
        </section>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* Dark water, edge to edge; the chrome floats over it in soft glass. Nothing
   has a corner. */
.mn { --glass: rgba(14, 13, 12, .84); --line: rgba(197, 188, 171, .13); --line2: rgba(197, 188, 171, .26); --soft: cubic-bezier(.45, 0, .2, 1);
  position: fixed; inset: 0; z-index: 58; background: var(--ground); overflow: hidden; animation: mn-in .6s var(--out); }
@keyframes mn-in { from { opacity: 0; } }
.layer { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.water { image-rendering: pixelated; }
.ink { touch-action: none; cursor: grab; }
.ink:active { cursor: grabbing; }
.ink.lens { cursor: crosshair; }
.ink.link { cursor: alias; }
.ink.over { cursor: pointer; }
.pix { font: 400 9.5px/1.4 var(--pix); color: var(--dim); text-transform: uppercase; letter-spacing: .06em; }
.glass { background: var(--glass); border: 1px solid var(--line); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); }
.pill { border-radius: 999px; }

.top { position: absolute; top: 0; left: 0; right: 0; display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; pointer-events: none;
  padding: max(16px, env(safe-area-inset-top, 0px)) max(18px, env(safe-area-inset-right, 0px)) 0 max(18px, env(safe-area-inset-left, 0px)); }
.top > * { pointer-events: auto; }
.name { display: grid; gap: 2px; padding: 2px 4px; pointer-events: none; }
.name h1 { margin: 0; font: 400 40px/.95 var(--goth); color: var(--hi); text-shadow: 0 0 18px var(--ground), 0 0 6px var(--ground); }
.name .line { display: flex; gap: 14px; flex-wrap: wrap; text-shadow: 0 0 8px var(--ground); }
.name .line b { font: 700 15px var(--tek); color: var(--hi); margin-right: 5px; font-variant-numeric: tabular-nums; }
.right { display: grid; gap: 10px; justify-items: end; }
.row { display: flex; gap: 8px; align-items: center; }
.due { display: flex; align-items: center; gap: 12px; padding: 8px 8px 8px 18px; font: 400 9.5px var(--pix); text-transform: uppercase; letter-spacing: .06em; color: var(--hi); transition: border-color .4s var(--out), transform .3s var(--out); }
.due em { font-style: normal; }
.due b { display: grid; place-items: center; min-width: 32px; height: 32px; padding: 0 8px; border-radius: 999px; background: var(--phos); color: var(--ground); font: 700 15px var(--tek); }
.due:hover:not(:disabled) { border-color: var(--line2); transform: translateY(-1px); }
.due:disabled { color: var(--dim); cursor: default; }
.due:disabled b { background: var(--low); color: var(--dim); }
.tools { display: flex; gap: 2px; padding: 4px; }
.tool { width: 32px; height: 32px; border-radius: 999px; display: grid; place-items: center; color: var(--dim); transition: color .3s var(--out), background .3s var(--out); }
.tool svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; }
.tool:hover { color: var(--hi); }
.tool.on { color: var(--ground); background: var(--phos); }
.x { width: 28px; height: 28px; border-radius: 999px; display: grid; place-items: center; color: var(--dim); flex: none; transition: color .3s, background .3s; }
.x:hover { color: var(--hi); background: var(--faint); }
.x svg { width: 12px; height: 12px; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; fill: none; }
.close { width: 48px; height: 48px; }

.kael { position: absolute; left: max(18px, env(safe-area-inset-left, 0px)); bottom: max(18px, env(safe-area-inset-bottom, 0px)); display: flex; align-items: flex-end; gap: 10px; pointer-events: none; max-width: min(540px, 70vw); }
.kael .cat { width: 92px; height: 92px; flex: none; border-radius: 50%; box-shadow: 0 0 0 1px var(--line); }
.say { margin: 0 0 22px; padding: 10px 16px; border-radius: 18px 18px 18px 6px; color: var(--phos); font: 15px/1.35 var(--fell); }
.say-enter-active, .say-leave-active { transition: opacity .35s var(--out), transform .35s var(--out); }
.say-enter-from { opacity: 0; transform: translateY(6px); }
.say-leave-to { opacity: 0; }
.err { position: absolute; left: 50%; bottom: max(22px, env(safe-area-inset-bottom, 0px)); transform: translateX(-50%); margin: 0; padding: 9px 18px; color: var(--hi); font: 14px var(--fell); z-index: 12; }

.selbar { position: absolute; display: flex; gap: 4px; align-items: center; padding: 5px 5px 5px 16px; z-index: 3; transform: translateX(-50%); animation: rise .5s var(--out); }
.selbar .pix { color: var(--hi); margin-right: 8px; white-space: nowrap; }
@keyframes rise { from { opacity: 0; transform: translate(-50%, 8px); } }
.chip { font: 400 9.5px var(--pix); text-transform: uppercase; letter-spacing: .06em; color: var(--hi); padding: 8px 13px; border-radius: 999px; white-space: nowrap; transition: background .3s var(--out), color .3s var(--out); }
.chip:hover { background: var(--faint); }
.chip.solid { background: var(--phos); color: var(--ground); }
.chip.solid:hover { background: var(--hi); }
.chip.quiet { color: var(--dim); }
.chip:disabled { opacity: .4; cursor: default; }

.panel { position: absolute; right: max(18px, env(safe-area-inset-right, 0px)); top: 140px; max-height: calc(100% - 270px); width: 350px; display: flex; flex-direction: column; z-index: 4; border-radius: 24px; overflow: hidden; animation: slide .6s var(--out); }
@keyframes slide { from { opacity: 0; transform: translateX(20px) scale(.98); } }
.body { padding: 20px 22px 22px; overflow: auto; display: grid; gap: 14px; align-content: start; scrollbar-width: none; }
.head { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
.panel h2 { margin: 0; font: 400 30px/1.05 var(--fell); color: var(--hi); text-wrap: balance; }
.state { font: italic 15px/1.4 var(--fell); color: var(--phos); margin: -6px 0 0; }
.state b { font-style: normal; color: var(--hi); font-weight: 400; }
.curve { width: 100%; height: 90px; display: block; }
.facts { display: flex; gap: 18px; flex-wrap: wrap; }
.facts > span { display: grid; gap: 1px; }
.facts b { font: 700 16px var(--tek); color: var(--hi); font-variant-numeric: tabular-nums; }
.pts ol { margin: 0; padding-left: 20px; display: grid; gap: 7px; font: 16px/1.4 var(--fell); color: var(--phos); }
.pts li::marker { font: 400 9px var(--pix); color: var(--dim); }
.rel { margin: 0; font: 14px/1.5 var(--fell); color: var(--dim); }
.ln button { color: var(--phos); border-bottom: 1px solid var(--line2); }
.ln button:hover { color: var(--hi); }
.ln .un { border: 0; color: var(--dim); margin-left: 2px; padding: 0 2px; }
.acts { display: flex; gap: 6px; flex-wrap: wrap; }
.btn { font: 400 9.5px var(--pix); text-transform: uppercase; letter-spacing: .06em; color: var(--ground); background: var(--phos); border: 0; padding: 10px 16px; border-radius: 999px; transition: background .3s var(--out), transform .2s var(--out); }
.btn:hover:not(:disabled) { background: var(--hi); color: var(--ground); }
.btn:active { transform: scale(.97); }
.btn:disabled { opacity: .4; cursor: default; }
.btn.ghost { background: none; color: var(--dim); box-shadow: inset 0 0 0 1px var(--line); }
.btn.ghost:hover:not(:disabled) { color: var(--hi); background: none; box-shadow: inset 0 0 0 1px var(--line2); }
.field { background: rgba(0, 0, 0, .3); border: 1px solid var(--line); border-radius: 14px; padding: 10px 14px; color: var(--hi); width: 100%; transition: border-color .3s; }
.field:focus { border-color: var(--line2); outline: none; }
textarea.field { resize: vertical; font: 15px/1.45 var(--fell); }
.gname { font: 400 26px var(--goth); }
.hubname { letter-spacing: .14em; text-transform: uppercase; font-size: 24px !important; }
.ln button.sub { letter-spacing: .08em; text-transform: uppercase; font-size: 12.5px; }
.turn { font: 400 9px var(--pix); text-transform: uppercase; letter-spacing: .06em; color: var(--dim); padding: 3px 9px; border-radius: 999px; box-shadow: inset 0 0 0 1px var(--line); transition: color .3s, box-shadow .3s; }
.turn:hover { color: var(--hi); box-shadow: inset 0 0 0 1px var(--line2); }
/* The hub switch: a pill with a bead that slides over. */
.toggle { display: grid; grid-template-columns: 40px 1fr; gap: 12px; align-items: start; cursor: pointer; padding: 10px 12px; border-radius: 16px; box-shadow: inset 0 0 0 1px var(--line); transition: box-shadow .3s; }
.toggle:hover { box-shadow: inset 0 0 0 1px var(--line2); }
.toggle input { position: absolute; opacity: 0; pointer-events: none; }
.toggle i { position: relative; width: 40px; height: 22px; border-radius: 999px; background: var(--faint); box-shadow: inset 0 0 0 1px var(--line2); transition: background .35s var(--out); margin-top: 1px; }
.toggle i::after { content: ''; position: absolute; left: 3px; top: 3px; width: 16px; height: 16px; border-radius: 50%; background: var(--dim); transition: transform .45s var(--out), background .35s var(--out); }
.toggle input:checked + i { background: var(--phos); }
.toggle input:checked + i::after { transform: translateX(18px); background: var(--ground); }
.toggle input:focus-visible + i { outline: 1.5px solid var(--hi); outline-offset: 3px; }
.toggle span { font: 14px/1.4 var(--fell); color: var(--dim); }
.toggle b { display: block; font: 400 9.5px var(--pix); text-transform: uppercase; letter-spacing: .06em; color: var(--hi); margin-bottom: 2px; }
.lab { display: grid; gap: 6px; }
.grounds { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.grounds button { display: grid; gap: 6px; justify-items: center; padding: 8px 4px; border-radius: 16px; font: 400 8.5px var(--pix); text-transform: uppercase; color: var(--dim); box-shadow: inset 0 0 0 1px var(--line); transition: color .3s, box-shadow .3s; }
.grounds button.on { color: var(--hi); box-shadow: inset 0 0 0 1px var(--phos); }
/* A drop of each water, in the same dotted tone the map gives it. */
.grounds i { width: 46px; height: 46px; border-radius: 50%; box-shadow: inset 0 0 0 1px rgba(197, 188, 171, .4); background: radial-gradient(circle, var(--phos) .8px, transparent 1.2px) 0 0 / 4px 4px; opacity: .55; }
.grounds i.g1 { background: radial-gradient(circle, var(--phos) 1px, transparent 1.4px) 0 0 / 4px 4px; -webkit-mask: radial-gradient(circle, #000 20%, rgba(0, 0, 0, .25)); mask: radial-gradient(circle, #000 20%, rgba(0, 0, 0, .25)); opacity: .8; }
.grounds i.g2 { background: repeating-radial-gradient(circle, rgba(197, 188, 171, .55) 0 1px, transparent 1px 6px); }
.grounds i.g3 { background: repeating-linear-gradient(35deg, rgba(197, 188, 171, .5) 0 1px, transparent 1px 5px); }
.grounds i.g4 { background: radial-gradient(circle, var(--phos) .8px, transparent 1.2px) 0 0 / 3px 5px, radial-gradient(circle, var(--phos) .8px, transparent 1.2px) 1px 2px / 7px 4px; }
.grounds i.g5 { background: radial-gradient(circle, var(--phos) 1.1px, transparent 1.4px) 0 0 / 3px 3px; opacity: .8; }

.recall { position: absolute; inset: 0; z-index: 10; display: grid; place-items: center; background: rgba(10, 9, 8, .62); backdrop-filter: blur(8px) grayscale(1); -webkit-backdrop-filter: blur(8px) grayscale(1);
  transition: background .8s var(--soft), backdrop-filter .8s var(--soft); padding: max(16px, env(safe-area-inset-top, 0px)) max(16px, env(safe-area-inset-right, 0px)) max(16px, env(safe-area-inset-bottom, 0px)) max(16px, env(safe-area-inset-left, 0px)); }
.recall.peek { background: rgba(10, 9, 8, 0); backdrop-filter: blur(0) grayscale(0); -webkit-backdrop-filter: blur(0) grayscale(0); pointer-events: none; }
.sheet { width: min(600px, 94vw); max-height: 88vh; overflow: auto; display: grid; gap: 18px; padding: 26px 28px; border-radius: 30px; scrollbar-width: none;
  background: rgba(16, 15, 14, .95); border: 1px solid var(--line); box-shadow: 0 40px 140px rgba(0, 0, 0, .6); transition: transform .8s var(--soft), opacity .6s var(--soft); animation: sheet-in .7s var(--out); }
@keyframes sheet-in { from { opacity: 0; transform: translateY(18px) scale(.98); } }
.recall.peek .sheet { transform: translateY(40px) scale(.96); opacity: 0; }
.sheet h2 { margin: 0; font: 400 44px/1 var(--goth); color: var(--hi); text-wrap: balance; }
.lead { margin: 0; font: 17px/1.45 var(--fell); color: var(--phos); max-width: 46ch; }
.writing { display: grid; grid-template-columns: 150px 1fr; gap: 20px; align-items: center; }
.hg { position: relative; width: 150px; height: 190px; display: flex; }
.hg :deep(.gl) { width: 100%; height: 100%; cursor: default; }
.hg :deep(.hint) { display: none; }
.timer { display: grid; gap: 4px; }
.timer b { font: 700 58px/.9 var(--tek); color: var(--hi); font-variant-numeric: tabular-nums; }
.rsay { margin: 0; font: italic 15px/1.35 var(--fell); color: var(--dim); }
.check { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.check button { width: 100%; display: grid; grid-template-columns: 22px 1fr; gap: 12px; align-items: start; text-align: left; padding: 10px 16px; border-radius: 18px; font: 16.5px/1.4 var(--fell); color: var(--phos);
  background: rgba(0, 0, 0, .18); transition: background .35s var(--out), color .35s var(--out); }
.check button:hover { background: var(--faint); }
.check button i { width: 20px; height: 20px; border-radius: 50%; box-shadow: inset 0 0 0 1.5px var(--dim); margin-top: 2px; display: grid; place-items: center; transition: background .35s var(--out), box-shadow .35s var(--out); }
.check button.on { color: var(--hi); background: rgba(197, 188, 171, .08); }
.check button.on i { background: var(--phos); box-shadow: none; }
.check button.on i::after { content: ''; width: 8px; height: 4px; border-left: 1.5px solid var(--ground); border-bottom: 1.5px solid var(--ground); transform: translateY(-1px) rotate(-45deg); }
.meter { display: flex; gap: 12px; align-items: center; }
.meter .track { flex: 1; height: 4px; border-radius: 4px; background: var(--faint); position: relative; overflow: hidden; }
.meter .track i { position: absolute; inset: 0 auto 0 0; border-radius: 4px; background: var(--phos); transition: width .6s var(--out); }
.rates { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.rates button { display: grid; gap: 3px; justify-items: center; padding: 12px 6px 11px; border-radius: 20px; box-shadow: inset 0 0 0 1px var(--line); transition: box-shadow .3s, background .3s, transform .2s var(--out); }
.rates button b { font: 400 9.5px var(--pix); text-transform: uppercase; letter-spacing: .06em; color: var(--dim); }
.rates button span { font: 700 17px var(--tek); color: var(--hi); }
.rates button:hover { box-shadow: inset 0 0 0 1px var(--line2); transform: translateY(-1px); }
.rates button.suggest { background: var(--phos); box-shadow: none; }
.rates button.suggest b, .rates button.suggest span { color: var(--ground); }
.rates button:disabled { cursor: default; }

@media (max-width: 860px) {
  .top { display: grid; grid-template-columns: 1fr auto; gap: 10px; }
  .right { display: contents; }
  .name { grid-column: 1; grid-row: 1; }
  .row { grid-column: 2; grid-row: 1; justify-self: end; align-self: start; }
  .tools { grid-column: 1 / -1; grid-row: 2; justify-self: start; }
  .due { padding-left: 14px; }
  .due em { display: none; }
  .close { width: 40px; height: 40px; }
  .name h1 { font-size: 28px; }
  .name .line { gap: 10px; }
  .name .line b { font-size: 13px; }
  .kael .cat { width: 60px; height: 60px; }
  .say { font-size: 13px; margin-bottom: 12px; }
  .panel { left: max(12px, env(safe-area-inset-left, 0px)); right: max(12px, env(safe-area-inset-right, 0px)); width: auto; top: auto; bottom: max(12px, env(safe-area-inset-bottom, 0px)); max-height: 64vh; }
  .sheet { padding: 22px 20px; }
  .sheet h2 { font-size: 32px; }
  .writing { grid-template-columns: 100px 1fr; }
  .hg { width: 100px; height: 130px; }
  .timer b { font-size: 42px; }
  .rates { grid-template-columns: repeat(2, 1fr); }
}
@media (hover: none) { .ln .un { padding: 0 6px; } }
@media (prefers-reduced-motion: reduce) { .mn, .sheet, .panel, .selbar { animation: none; } }
</style>
