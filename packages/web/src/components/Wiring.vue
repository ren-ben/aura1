<script setup lang="ts">
// Today's rewiring in two views, and the turn between them: the nocturne to
// wire the day in, the horologe to read it by. The day is one line of time
// either way, straight down the column or closed into the dial, so the turn
// does not fade one picture into another: it rolls the line up. The bus
// bends until it closes into the dial's ring, the cards curl into arcs as
// they ride it, the now line swings round into the hand, and the column's
// sky wraps round into the dial's, star for star. All of it on one canvas,
// in one loop, while both views wait mounted and untouched underneath.
import { onBeforeUnmount, ref, watch } from 'vue';
import Rewiring from './Rewiring.vue';
import Horologe from './Horologe.vue';
import { SHADES, blocksOn, drawnOn, lecturesOn, starDial, starInk, starR, starsOf, type Star } from '../rewiring';

export type View = 'nocturne' | 'horologe';
const props = defineProps<{ date: string }>();
const view = defineModel<View>({ required: true });

const stage = ref<HTMLElement | null>(null), veil = ref<HTMLCanvasElement | null>(null);
const noc = ref<InstanceType<typeof Rewiring> | null>(null);
const layer = { nocturne: ref<HTMLElement | null>(null), horologe: ref<HTMLElement | null>(null) };
const shown = ref<View>(view.value);
const rolling = ref(false);
const HOUR = 44;

// Where the two views put things, measured off the page as they stand.
type Piece = { start: number; end: number; d0: [number, number]; d1: [number, number]; ink: string; lock: boolean };
type Geo = {
  a0: [number, number]; l0: number; a1: [number, number]; l1: number; k: number;
  pieces: Piece[]; stars: (Star & { d0: number; d1: number; a0: number; a1: number })[];
  now: number; hand0: [number, number]; hand1: [number, number]; drawn: { start: number; end: number }[];
};
function measure(): Geo | null {
  const st = stage.value?.getBoundingClientRect(), col = noc.value?.root?.querySelector<HTMLElement>(`.col[data-date="${props.date}"]`);
  const face = layer.horologe.value?.querySelector('svg');
  if (!st || !col || !face) return null;
  const c = col.getBoundingClientRect(), f = face.getBoundingClientRect();
  const busX = c.left + 14 - st.left, k = Math.min(f.width, f.height) / 480;
  const cx = f.left + f.width / 2 - st.left, cy = f.top + f.height / 2 - st.top, R = 152 * k;
  const off = (key: string): [number, number] => {
    const el = col.querySelector<HTMLElement>(`[data-tap="${key}"]`);
    if (!el) return [28 - 14, c.width - 20];
    const r = el.getBoundingClientRect();
    return [r.left - st.left - busX, r.right - st.left - busX];
  };
  const now = new Date(), w = c.width - 14;
  return {
    a0: [busX, c.top - st.top + 12 * HOUR], l0: 24 * HOUR, a1: [cx, cy + R], l1: 2 * Math.PI * R, k,
    pieces: [
      ...lecturesOn(props.date).map((l, i) => ({ start: l.start, end: l.end, d0: off(`l${i}`), d1: [8 * k, 42 * k] as [number, number], ink: '#7a7468', lock: true })),
      ...blocksOn(props.date).map((b) => ({ start: b.start, end: b.end, d0: off(`b${b.id}`), d1: [8 * k, 42 * k] as [number, number], ink: SHADES[b.shade]!.ink, lock: false })),
    ],
    stars: starsOf(props.date).map((s) => ({ ...s, d0: s.u * w, d1: (starR(s) - 152) * k, a0: starInk(s), a1: starDial(s) })),
    now: now.getHours() * 60 + now.getMinutes(), hand0: [16, c.width - 14], hand1: [-12 * k, 74 * k],
    drawn: drawnOn(props.date),
  };
}

// The line at t: its length eased from the column's to the ring's, its
// curvature grown so that it has turned 2 pi t by its end, its noon moving
// from the column's to the foot of the ring. A point is a minute along it
// and a distance off it (outward on the dial, rightward in the column).
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
function curve(g: Geo, t: number) {
  const L = lerp(g.l0, g.l1, t), kap = (t * 2 * Math.PI) / L, th0 = Math.PI / 2 + (t * Math.PI) / 2;
  const ax = lerp(g.a0[0], g.a1[0], t), ay = lerp(g.a0[1], g.a1[1], t), s0 = Math.sin(th0), c0 = Math.cos(th0);
  return (m: number, d: number): [number, number] => {
    const s = ((m - 720) / 1440) * L;
    if (kap < 1e-6) return [ax + s * c0 + d * s0, ay + s * s0 - d * c0];
    const th = th0 + kap * s, sn = Math.sin(th), cs = Math.cos(th);
    return [ax + (sn - s0) / kap + d * sn, ay + (c0 - cs) / kap - d * cs];
  };
}

function draw(g: Geo, t: number, dpr: number) {
  const cv = veil.value!, x = cv.getContext('2d')!;
  x.setTransform(dpr, 0, 0, dpr, 0, 0);
  x.clearRect(0, 0, cv.width, cv.height);
  // The stars, each a little behind the one nearer the bus: the sky follows
  // the line round rather than moving as a sheet. Drawn in eight inks.
  const buckets: number[][] = Array.from({ length: 8 }, () => []);
  for (const s of g.stars) {
    const ts = Math.min(1, Math.max(0, (t - s.u * 0.18) / 0.82));
    const a = lerp(s.a0, s.a1, ts);
    if (a < 0.02) continue;
    const [px, py] = curve(g, ts)(s.m, lerp(s.d0, s.d1, ts));
    buckets[Math.min(7, Math.floor(a * 10))]!.push(px, py);
  }
  buckets.forEach((b, i) => {
    x.fillStyle = `rgba(197, 188, 171, ${(i + 0.5) / 10})`;
    for (let j = 0; j < b.length; j += 2) x.fillRect(b[j]!, b[j + 1]!, 1, 1);
  });
  const at = curve(g, t);
  const path = (from: number, to: number, d: number, step = 6) => {
    x.beginPath();
    for (let m = from; ; m = Math.min(to, m + step)) { const [px, py] = at(m, d); m === from ? x.moveTo(px, py) : x.lineTo(px, py); if (m >= to) break; }
  };
  // The bus, lit to now; the hours ticked off along it.
  x.lineWidth = 1;
  x.strokeStyle = 'rgba(122, 116, 104, .7)'; path(0, 1440, 0, 8); x.stroke();
  x.strokeStyle = '#7a7468'; path(0, Math.max(1, g.now), 0, 8); x.stroke();
  x.strokeStyle = 'rgba(122, 116, 104, .6)';
  for (let h = 0; h < 24; h++) {
    const [ax, ay] = at(h * 60, lerp(-10, 44 * g.k, t)), [bx, by] = at(h * 60, lerp(-5, 54 * g.k, t));
    x.beginPath(); x.moveTo(ax, ay); x.lineTo(bx, by); x.stroke();
  }
  // The current that flowed, a bright seam on the bus moving to the inner ring.
  x.strokeStyle = '#c5bcab'; x.lineWidth = lerp(6, 3 * g.k, t);
  for (const s of g.drawn) { path(s.start, s.end, lerp(1, -7 * g.k, t), 4); x.stroke(); }
  // The taps, curling as they ride. They slim to the dial's width early, so
  // it is narrow bands that roll round, not the column's wide cards.
  x.lineWidth = 1;
  const slim = 1 - (1 - t) ** 2.5;
  for (const p of g.pieces) {
    const d0 = lerp(p.d0[0], p.d1[0], slim), d1 = lerp(p.d0[1], p.d1[1], slim);
    x.beginPath();
    for (let m = p.start; ; m = Math.min(p.end, m + 5)) { const [px, py] = at(m, d0); m === p.start ? x.moveTo(px, py) : x.lineTo(px, py); if (m >= p.end) break; }
    for (let m = p.end; ; m = Math.max(p.start, m - 5)) { const [px, py] = at(m, d1); x.lineTo(px, py); if (m <= p.start) break; }
    x.closePath();
    x.fillStyle = '#121212'; x.fill();
    x.setLineDash(p.lock ? [2, 3] : []); x.strokeStyle = p.ink; x.stroke();
  }
  x.setLineDash([]);
  // Now: the line across the column swinging round into the hand.
  const [hx0, hy0] = at(g.now, lerp(g.hand0[0], g.hand1[0], slim)), [hx1, hy1] = at(g.now, lerp(g.hand0[1], g.hand1[1], slim));
  x.strokeStyle = 'rgba(230, 224, 212, .75)'; x.lineWidth = 1.2;
  x.beginPath(); x.moveTo(hx0, hy0); x.lineTo(hx1, hy1); x.stroke();
  x.fillStyle = '#e6e0d4'; x.beginPath(); x.arc(hx1, hy1, lerp(0, 3.5 * g.k, t), 0, 7); x.fill();
}

// The console's ease: a heavy thing starting, then settling.
function bezier(p1x: number, p1y: number, p2x: number, p2y: number) {
  const bx = (t: number) => 3 * p1x * t * (1 - t) ** 2 + 3 * p2x * t * t * (1 - t) + t ** 3;
  const by = (t: number) => 3 * p1y * t * (1 - t) ** 2 + 3 * p2y * t * t * (1 - t) + t ** 3;
  return (x: number) => { let lo = 0, hi = 1; for (let i = 0; i < 22; i++) { const m = (lo + hi) / 2; bx(m) < x ? (lo = m) : (hi = m); } return by((lo + hi) / 2); };
}
const ease = bezier(0.72, 0, 0.18, 1);
const FADE_IN = 160, ROLL = 820, FADE_OUT = 220;

let raf = 0;
// A tap chosen on the dial, to be opened once the roll has landed on it.
let picked: number | null = null;
function roll(to: View) {
  const from: View = to === 'horologe' ? 'nocturne' : 'horologe';
  const chosen = to === 'nocturne' ? blocksOn(props.date).find((b) => b.id === picked) : undefined;
  picked = null;
  // Into the nocturne at what was picked, or a little before now.
  if (to === 'nocturne') { const n = new Date(); noc.value?.reveal(chosen ? chosen.start - 90 : n.getHours() * 60 + n.getMinutes() - 150); }
  const then = () => {
    if (chosen) noc.value?.select(chosen.id);
    // Turned again while it rolled: go on to where it was last asked to be.
    if (view.value !== shown.value) roll(view.value);
  };
  const g = measure(), cv = veil.value, st = stage.value;
  const out = layer[from].value!, into = layer[to].value!;
  if (!g || !cv || !st || matchMedia('(prefers-reduced-motion: reduce)').matches) { shown.value = to; then(); return; }
  const dpr = Math.min(2, devicePixelRatio || 1);
  cv.width = Math.round(st.clientWidth * dpr); cv.height = Math.round(st.clientHeight * dpr);
  rolling.value = true;
  into.style.opacity = '0';
  const t0 = performance.now(), tFrom = to === 'horologe' ? 0 : 1;
  const frame = (now: number) => {
    const e = now - t0;
    if (e < FADE_IN) {
      const k = e / FADE_IN;
      out.style.opacity = String(1 - k); cv.style.opacity = String(k);
      draw(g, tFrom, dpr);
    } else if (e < FADE_IN + ROLL) {
      out.style.opacity = '0'; cv.style.opacity = '1';
      const p = ease((e - FADE_IN) / ROLL);
      draw(g, to === 'horologe' ? p : 1 - p, dpr);
    } else if (e < FADE_IN + ROLL + FADE_OUT) {
      const k = (e - FADE_IN - ROLL) / FADE_OUT;
      draw(g, 1 - tFrom, dpr);
      cv.style.opacity = String(1 - k); into.style.opacity = String(k);
    } else {
      out.style.opacity = ''; into.style.opacity = ''; cv.style.opacity = '0';
      shown.value = to; rolling.value = false; then();
      return;
    }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
}
watch(view, (to) => { if (to !== shown.value && !rolling.value) roll(to); });
onBeforeUnmount(() => cancelAnimationFrame(raf));

// A tap chosen on the dial: roll back out to it, and open it there.
function pick(id: number) {
  if (rolling.value) return;
  picked = id;
  view.value = 'nocturne';
}
</script>

<template>
  <div ref="stage" class="stage">
    <div :ref="(el) => (layer.nocturne.value = el as HTMLElement)" class="layer" :class="{ off: shown !== 'nocturne' }" :aria-hidden="shown !== 'nocturne'" :inert="shown !== 'nocturne'">
      <Rewiring ref="noc" :dates="[date]" />
    </div>
    <div :ref="(el) => (layer.horologe.value = el as HTMLElement)" class="layer" :class="{ off: shown !== 'horologe' }" :aria-hidden="shown !== 'horologe'" :inert="shown !== 'horologe'">
      <Horologe :date="date" @pick="pick" @rewire="view = 'nocturne'" />
    </div>
    <canvas ref="veil" class="veil" :class="{ on: rolling }" aria-hidden="true"></canvas>
  </div>
</template>

<style scoped>
.stage { position: relative; flex: 1; min-height: 0; overflow: hidden; }
.layer { position: absolute; inset: 0; display: flex; flex-direction: column; min-height: 0; will-change: opacity; }
/* Hidden, not unpainted: kept rasterised so the turn never waits on a first paint. */
.layer.off { opacity: 0; pointer-events: none; }
.veil { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; pointer-events: none; will-change: opacity; }
.veil.on { pointer-events: auto; }
</style>
