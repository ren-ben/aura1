<script setup lang="ts">
// The horologe: today as an astrolabe of the hours. The night a band of
// dither from dusk round to dawn, every tap an arc lettered along its ring,
// the current that flowed on the inner ring, the same sky as the nocturne
// behind it all, and Kael'thos at the centre with the hand going round him.
// A tap, or REWIRE, rolls the dial back out into the nocturne to be edited.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import art from '../gl/art.json';
import { localDate } from '../store';
import { SHADES, blocksOn, drawnOn, hm, lecturesOn, starDial, starR, starsOf, sunOf } from '../rewiring';

const props = defineProps<{ date: string }>();
const emit = defineEmits<{ pick: [id: number]; rewire: [] }>();

const now = ref(0);
const tick = () => { const d = new Date(); now.value = d.getHours() * 60 + d.getMinutes(); };
tick();
const timer = window.setInterval(tick, 30_000);

// The face is 480 across; the bus of the nocturne closes into the ring at
// BUS_R, and the taps stand on it from TAP_IN to TAP_OUT.
const BUS_R = 152, TAP_IN = 160, TAP_OUT = 194;
const pt = (m: number, r: number) => { const a = (m / 1440) * 2 * Math.PI; return [r * Math.sin(a), -r * Math.cos(a)] as const; };
const f = (n: number) => n.toFixed(1);
function band(a: number, b: number, r0: number, r1: number) {
  const big = b - a > 720 ? 1 : 0, [x0, y0] = pt(a, r1), [x1, y1] = pt(b, r1), [x2, y2] = pt(b, r0), [x3, y3] = pt(a, r0);
  return `M${f(x0)} ${f(y0)}A${r1} ${r1} 0 ${big} 1 ${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}A${r0} ${r0} 0 ${big} 0 ${f(x3)} ${f(y3)}Z`;
}
function arc(a: number, b: number, r: number) {
  const [x0, y0] = pt(a, r), [x1, y1] = pt(b, r);
  return `M${f(x0)} ${f(y0)}A${r} ${r} 0 ${b - a > 720 ? 1 : 0} 1 ${f(x1)} ${f(y1)}`;
}
// A label's path: along the ring on top, back along it underneath so the
// letters stand upright either way.
function lblPath(a: number, b: number) {
  const mid = (a + b) / 2;
  if (mid <= 360 || mid >= 1080) return arc(a + 5, b - 2, 170);
  const [x0, y0] = pt(b - 5, 177), [x1, y1] = pt(a + 2, 177);
  return `M${f(x0)} ${f(y0)}A177 177 0 ${b - a > 720 ? 1 : 0} 0 ${f(x1)} ${f(y1)}`;
}

const taps = computed(() => blocksOn(props.date));
const lectures = computed(() => lecturesOn(props.date));
const drawn = computed(() => drawnOn(props.date));
const sun = computed(() => sunOf(props.date));
// Another day has no now: a past one is all behind, a coming one all ahead.
const isToday = computed(() => props.date === localDate());
const clock = computed(() => (isToday.value ? now.value : props.date < localDate() ? 1440 : -1));
const on = computed(() => taps.value.find((t) => t.start <= clock.value && clock.value < t.end) ?? null);
const next = computed(() => taps.value.filter((t) => t.start > clock.value).slice(0, 3));
const left = computed(() => (on.value ? on.value.end - clock.value : 0));
const label = (t: string, span: number) => { const n = Math.floor(span / 9); return t.length > n ? `${t.slice(0, Math.max(1, n - 1))}.` : t; };
const title = (t: string) => (t.length > 18 ? `${t.slice(0, 17)}.` : t);
const hand = computed(() => ({ a: pt(now.value, 140), b: pt(now.value, 226), bead: pt(now.value, 230) }));

// Kael'thos at the centre, keeping the day: the hourglass held to his chest
// while it runs, pleased with himself once all of it is drawn. The drawing
// in the console's inks, fur the phosphor and paper the ground, so he stands
// out solid against the dark of the dial.
const done = computed(() => taps.value.length > 0 && !on.value && !next.value.length);
const inked = (svg: string) => `data:image/svg+xml,${encodeURIComponent(svg.replaceAll('#000', '#c5bcab').replaceAll('#fff', '#121212'))}`;
const KEEPING = inked(art.keeper), KEPT = inked(art.keeperDone);
const kael = computed(() => (done.value ? KEPT : KEEPING));

// The sky behind the face: the nocturne's own stars, laid round the dial.
const svg = ref<SVGSVGElement | null>(null), sky = ref<HTMLCanvasElement | null>(null);
function paint() {
  const cv = sky.value, el = svg.value;
  if (!cv || !el) return;
  const w = (cv.width = cv.clientWidth), h = (cv.height = cv.clientHeight), x = cv.getContext('2d')!;
  const k = Math.min(w, h) / 480, cx = w / 2, cy = h / 2;
  x.clearRect(0, 0, w, h);
  for (const s of starsOf(props.date)) {
    const a = starDial(s);
    if (!a) continue;
    const [px, py] = pt(s.m, starR(s));
    x.fillStyle = `rgba(197, 188, 171, ${a})`;
    x.fillRect(Math.round(cx + px * k), Math.round(cy + py * k), 1, 1);
  }
}
let ro: ResizeObserver | null = null;
onMounted(() => { ro = new ResizeObserver(paint); if (sky.value) ro.observe(sky.value); paint(); });
onBeforeUnmount(() => { clearInterval(timer); ro?.disconnect(); });
watch(() => props.date, paint);
</script>

<template>
  <div class="horo">
    <div class="face">
      <canvas ref="sky" class="sky" aria-hidden="true"></canvas>
      <svg ref="svg" viewBox="-240 -240 480 480" preserveAspectRatio="xMidYMid meet" role="img" :aria-label="`Today as a dial, ${taps.length} taps`">
        <defs>
          <pattern v-for="(s, i) in SHADES" :id="`hs${i}`" :key="s.name" width="3" height="3" patternUnits="userSpaceOnUse">
            <rect width="1.5" height="1.5" :fill="s.ink" />
          </pattern>
          <pattern id="night" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="1" height="1" fill="rgba(197,188,171,.45)" /></pattern>
          <path v-for="t in taps" :id="`lbl${t.id}`" :key="t.id" :d="lblPath(t.start, t.end)" />
        </defs>

        <!-- the rings of the instrument, the night between dusk and dawn -->
        <circle r="222" class="ring dots" />
        <circle r="206" class="ring" />
        <circle :r="BUS_R" class="ring" />
        <circle r="138" class="ring dots" />
        <path :d="band(sun.set, sun.rise + 1440, 208, 220)" fill="url(#night)" />
        <template v-for="h in 24" :key="h">
          <line :x1="pt((h - 1) * 60, 206)[0]" :y1="pt((h - 1) * 60, 206)[1]" :x2="pt((h - 1) * 60, (h - 1) % 3 ? 202 : 196)[0]" :y2="pt((h - 1) * 60, (h - 1) % 3 ? 202 : 196)[1]" class="tick" />
          <text v-if="(h - 1) % 3 === 0" :x="pt((h - 1) * 60, 232)[0]" :y="pt((h - 1) * 60, 232)[1]" class="hr">{{ String(h - 1).padStart(2, '0') }}</text>
        </template>
        <path v-if="clock > 0" :d="arc(0, Math.min(1439.9, clock), 206)" class="elapsed" />

        <!-- the lectures, locked; the taps, lettered on clear ground -->
        <path v-for="(l, k) in lectures" :key="`l${k}`" :d="band(l.start, l.end, TAP_IN, TAP_OUT)" class="lock" />
        <g v-for="t in taps" :key="t.id" class="tap" :class="{ on: on?.id === t.id }" @click="emit('pick', t.id)">
          <path :d="band(t.start, t.end, TAP_IN, TAP_OUT)" class="card" :stroke="SHADES[t.shade]!.ink" />
          <path :d="band(t.start, t.end, TAP_OUT - 6, TAP_OUT)" :fill="`url(#hs${t.shade})`" />
          <text v-if="t.end - t.start >= 40" class="lbl"><textPath :href="`#lbl${t.id}`">{{ label(t.title.toUpperCase(), ((t.end - t.start) / 1440) * 2 * Math.PI * 172) }}</textPath></text>
        </g>
        <path v-for="(s, k) in drawn" :key="`d${k}`" :d="arc(s.start, s.end, 145)" class="drawn" />

        <!-- the hand, and Kael'thos it turns round -->
        <line v-if="isToday" :x1="hand.a[0]" :y1="hand.a[1]" :x2="hand.b[0]" :y2="hand.b[1]" class="hand" />
        <circle v-if="isToday" :cx="hand.bead[0]" :cy="hand.bead[1]" r="3.5" class="bead" />
        <text y="-110" class="pix-c">{{ on ? 'now' : next[0] ? `${isToday ? 'next' : 'first'} at ${hm(next[0].start)}` : taps.length ? 'all of it drawn' : 'nothing wired' }}</text>
        <text y="-86" class="title-c">{{ title(on?.title ?? next[0]?.title ?? (taps.length ? 'The day is spent' : 'An unwired day')) }}</text>
        <image :href="kael" x="-72" y="-78" width="144" height="144" class="kael" />
        <text v-if="on" y="92" class="count">{{ Math.floor(left / 60) }}:{{ String(left % 60).padStart(2, '0') }}</text>
        <text v-if="on" y="110" class="pix-c">left of it // until {{ hm(on.end) }}</text>
      </svg>
    </div>
    <p class="then">
      <span class="pix">then</span>
      <template v-if="next.filter((x) => x.id !== on?.id).length"><span v-for="t in next.filter((x) => x.id !== on?.id)" :key="t.id"><b class="tek">{{ hm(t.start) }}</b> {{ t.title }}</span></template>
      <span v-else class="fell">nothing more wired {{ isToday ? 'today' : 'that day' }}</span>
      <button class="x" @click="emit('rewire')">rewire</button>
    </p>
  </div>
</template>

<style scoped>
.horo { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.face { position: relative; flex: 1; min-height: 0; }
.face > * { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.sky { pointer-events: none; }
.ring { fill: none; stroke: var(--low); stroke-width: 1; }
.ring.dots { stroke: var(--dim); stroke-dasharray: 1 4; }
.tick { stroke: var(--dim); stroke-width: 1; }
.hr { font: 400 9px var(--pix); fill: var(--dim); text-anchor: middle; dominant-baseline: central; }
.elapsed { fill: none; stroke: var(--phos); stroke-width: 1.5; }
.lock { fill: none; stroke: var(--dim); stroke-dasharray: 2 3; }
.tap { cursor: pointer; }
.card { fill: var(--ground); stroke-width: 1; transition: stroke-width .25s var(--out); }
.tap:hover .card, .tap.on .card { stroke-width: 2.4; }
.lbl { font: 400 8.5px var(--pix); fill: var(--hi); letter-spacing: .08em; }
.drawn { fill: none; stroke: var(--phos); stroke-width: 3; }
.hand { stroke: var(--hi); stroke-width: 1.2; }
.bead { fill: var(--hi); }
.pix-c { font: 400 9.5px var(--pix); fill: var(--dim); text-anchor: middle; text-transform: uppercase; letter-spacing: .06em; }
.title-c { font: italic 400 22px var(--fell); fill: var(--hi); text-anchor: middle; }
.count { font: 800 30px var(--tek); fill: var(--hi); text-anchor: middle; }
.then { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 16px; margin: 0; padding: 10px 14px; border-top: 3px dotted var(--low); color: var(--hi); }
.then .tek { font-size: 14px; margin-right: 4px; }
.then .fell { font-style: italic; color: var(--dim); }
.then .x { margin-left: auto; }
</style>
