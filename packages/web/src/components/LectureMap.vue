<script setup lang="ts">
// One lecture's map, floating over the console: the topic confirmed, the map
// researched and written by Kael'thos, then laid out as a canvas to pan
// around. Every card can go deeper; the whole can be taken away to Obsidian
// or printed.
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import 'katex/dist/katex.min.css';
import Gl from './Gl.vue';
import Plate from './Plate.vue';
import Letter from './Letter.vue';
import art from '../gl/art.json';
import { catSprite, starfield, type Draw } from '../gl/plate';
import { sceneFor } from '../gl/lecture';
import { reduced } from '../gl/engine';
import { narrow } from '../screen';
import { CARD, KINDS, TITLES, cardText, download, exportZip, layout, link, moves, parse, present, rich, tex, type Box, type Kind } from '../lecturemap';
import { lectureMaps, type Course, type LectureDto, type LectureMapDto } from '../store';

const props = defineProps<{ course: Course; begin: string }>();
const emit = defineEmits<{ close: [] }>();
// Closing plays the opening backwards, then goes.
const closing = ref(false);
function shut(then: () => void = () => emit('close')) {
  if (closing.value) return;
  closing.value = true;
  setTimeout(then, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 420);
}

const lecture = ref<LectureDto | null>(null);
const dto = ref<LectureMapDto | null>(null);
const topic = ref('');
const error = ref('');
const busy = ref(false);
const map = computed(() => (dto.value?.status === 'ready' ? dto.value.map : null));
const when = new Date(props.begin);
const day = when.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).toLowerCase();
// Once the lecture has been, the questions become a test of what stayed.
const past = when.getTime() < Date.now();

onMounted(async () => {
  window.addEventListener('keydown', key);
  try {
    lecture.value = await lectureMaps.lecture(props.course.id, props.begin);
    dto.value = lecture.value.map;
    topic.value = dto.value?.topic ?? lecture.value.guess;
    watchJob();
  } catch (e) { error.value = e instanceof Error ? e.message : 'failed'; }
});
onBeforeUnmount(() => { window.removeEventListener('keydown', key); clearTimeout(poll); });
const key = (e: KeyboardEvent) => { if (e.key === 'Escape') shut(); };

// ---- making it --------------------------------------------------------------
let poll = 0;
const started = ref(0);
const elapsed = ref(0);
function watchJob() {
  clearTimeout(poll);
  const d = dto.value;
  if (!d || (d.status !== 'researching' && d.status !== 'writing')) return;
  if (!started.value) started.value = Date.now();
  poll = window.setTimeout(async () => {
    elapsed.value = Math.round((Date.now() - started.value) / 1000);
    try { dto.value = await lectureMaps.get(d.id); } catch { /* the next poll tries again */ }
    watchJob();
  }, 2500);
}
// The letter: what it says above the writing, and which syllabus topic this
// lecture falls on.
const flying = ref(false);
// A letter that never reached him (the request failed) is written again.
const drafts = ref(0);
function arrived() {
  flying.value = false;
  if (!dto.value || dto.value.status === 'failed') drafts.value++;
}
const ordinal = (n: number) => `${n}${[, 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] ?? 'th'}`;
const heading = computed(() => lecture.value
  ? `Before the ${ordinal(lecture.value.index + 1)} lecture of ${lecture.value.total} in ${props.course.name}, on ${day}, I would like to understand:`
  : '');
const guessed = computed(() => {
  const l = lecture.value;
  if (!l?.topics.length) return -1;
  return l.index === 0 ? 0 : Math.min(l.topics.length - 1, Math.floor((l.index / l.total) * l.topics.length));
});
const note = computed(() => `Click one to write it in. The underlined one is where lecture ${(lecture.value?.index ?? 0) + 1} falls. Add what the slides say, if you know. A map costs about 11 cents.`);
async function start() {
  flying.value = true;
  busy.value = true; error.value = '';
  try {
    dto.value = await lectureMaps.start(props.course.id, props.begin, topic.value.trim());
    started.value = Date.now(); elapsed.value = 0;
    watchJob();
  } catch (e) { error.value = e instanceof Error ? e.message : 'failed'; }
  busy.value = false;
}
const phase = computed(() => dto.value?.status === 'writing' ? 'writing it down' : 'reading the sources');

// ---- the canvas -------------------------------------------------------------
const heights = reactive<Record<string, number>>({});
const at = computed<Record<string, Box>>(() => (map.value ? layout(map.value, dto.value!.grown, heights) : {}));
const kinds = computed(() => (map.value ? KINDS.filter((k) => present(map.value!, k)) : []));
const born = ref(false);
const view = reactive({ x: 0, y: 0, k: 1 });
const stage = ref<HTMLElement | null>(null);
const cards = new Map<string, HTMLElement>();
const sizer = new ResizeObserver((entries) => {
  for (const e of entries) {
    const id = (e.target as HTMLElement).dataset.id!;
    heights[id] = Math.round((e.target as HTMLElement).offsetHeight);
  }
});
const card = (id: string) => (el: unknown) => {
  const old = cards.get(id);
  if (old === el) return;
  if (old) sizer.unobserve(old);
  if (el instanceof HTMLElement) { cards.set(id, el); sizer.observe(el); } else cards.delete(id);
};
onBeforeUnmount(() => sizer.disconnect());

// The whole map in view, as large as it can be read.
function fit(whole = true) {
  const s = stage.value, boxes = Object.values(at.value);
  if (!s || !boxes.length) return;
  // On a phone the whole map is too small to read: it opens on the core.
  if (narrow.value && !whole) {
    const c = at.value.core!, k = Math.min(0.9, (s.clientWidth - 32) / c.w);
    Object.assign(view, { k, x: s.clientWidth / 2 - (c.x + c.w / 2) * k, y: 24 - c.y * k });
    return;
  }
  const x0 = Math.min(...boxes.map((b) => b.x)), x1 = Math.max(...boxes.map((b) => b.x + b.w));
  const y0 = Math.min(...boxes.map((b) => b.y)), y1 = Math.max(...boxes.map((b) => b.y + b.h));
  const k = Math.min(1, Math.max(0.3, Math.min((s.clientWidth - 60) / (x1 - x0), (s.clientHeight - 60) / (y1 - y0))));
  Object.assign(view, { k, x: s.clientWidth / 2 - ((x0 + x1) / 2) * k, y: s.clientHeight / 2 - ((y0 + y1) / 2) * k });
}
// Cards are measured before they fly out of the core, so they land where
// they will stay.
watch(map, async (m) => {
  if (!m || born.value) return;
  await nextTick();
  await new Promise((r) => requestAnimationFrame(r));
  fit(false);
  born.value = true;
}, { immediate: true });

// Pan with a drag, zoom with the wheel or two fingers.
const pointers = new Map<number, { x: number; y: number }>();
let pinch = 0;
const dragging = ref(false);
function down(e: PointerEvent) {
  // Before there is a map, the pointer belongs to the letter.
  if (!map.value) return;
  if ((e.target as HTMLElement).closest('button, a, input, textarea, .gl')) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  stage.value!.setPointerCapture(e.pointerId);
  dragging.value = true;
}
function move(e: PointerEvent) {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const d0 = Math.hypot(a!.x - b!.x, a!.y - b!.y);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const [c, d] = [...pointers.values()];
    const d1 = Math.hypot(c!.x - d!.x, c!.y - d!.y);
    if (pinch) zoom(d1 / d0, (c!.x + d!.x) / 2, (c!.y + d!.y) / 2);
    pinch = 1;
    return;
  }
  view.x += e.clientX - p.x; view.y += e.clientY - p.y;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
}
function up(e: PointerEvent) { pointers.delete(e.pointerId); pinch = 0; dragging.value = pointers.size > 0; }
function zoom(by: number, cx: number, cy: number) {
  const r = stage.value!.getBoundingClientRect();
  const k = Math.min(1.6, Math.max(0.3, view.k * by));
  const px = cx - r.left, py = cy - r.top;
  view.x = px - ((px - view.x) * k) / view.k; view.y = py - ((py - view.y) * k) / view.k;
  view.k = k;
}
// Only the map zooms; anywhere else (the letter's syllabus) scrolls as usual.
function wheel(e: WheelEvent) {
  if (!map.value) return;
  e.preventDefault();
  zoom(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
}

const pos = (id: string, i: number) => {
  const b = at.value[id];
  if (!b || !born.value) return { transform: 'translate(-50%, -50%) scale(.4)', opacity: '0', left: '0px', top: '0px' };
  return { transform: 'none', opacity: '1', left: `${b.x}px`, top: `${b.y}px`, transitionDelay: `${i * 70}ms`, width: `${b.w}px` };
};
const links = computed(() => {
  if (!map.value || !born.value) return [];
  const out: { id: string; d: string }[] = kinds.value.filter((k) => at.value[k]).map((k) => ({ id: k, d: link(at.value.core!, at.value[k]!) }));
  for (const g of dto.value!.grown) {
    const from = at.value[g.parent] ?? at.value[g.parent.split('.')[0]!];
    if (from && at.value[g.id]) out.push({ id: g.id, d: link(from, at.value[g.id]!) });
  }
  return out;
});

// ---- going deeper -------------------------------------------------------------
const growing = ref('');
async function deeper(key: string, kind: string, title: string, text: string) {
  if (!dto.value || growing.value) return;
  growing.value = key; error.value = '';
  try { dto.value = await lectureMaps.deeper(dto.value.id, { key, kind, title: title.slice(0, 300), text: text.slice(0, 2000) }); }
  catch (e) { error.value = e instanceof Error ? e.message : 'failed'; }
  growing.value = '';
}
const deeperCard = (k: Kind) => deeper(k, k, TITLES[k], cardText(map.value!, k));
const revealed = reactive(new Set<number>());

// ---- Kael'thos ------------------------------------------------------------------
// He sits at the corner and turns to whatever is being read, with a word on it.
const hovered = ref<string>('');
const LINES: Record<string, string> = {
  core: 'That is the whole of it. Everything else on this map is that, looked at from a different side.',
  hook: 'Start here. If you cannot answer it yet, good: that itch is what makes the lecture stick.',
  questions: past ? 'No peeking. What is left without looking is what you actually have.' : 'Guess before you go. Being wrong tonight is the cheapest it will ever be.',
  outline: 'The likely order. Your professor may wander; now you will notice when.',
  terms: 'Knowing the name of a thing is not knowing the thing. Read what each one does.',
  equations: 'Every equation is a sentence. Read it out loud, in words, before you trust it.',
  pictures: 'Watch it move. A curve is an idea you can see all of at once.',
  worked: 'Follow each step and ask why that one, and not another.',
  traps: 'Smart people fall into these. Now you will step around them.',
  refresh: 'Look at these first. A lecture is easy when the floor under it is solid.',
  further: 'Where I read. Go and look, if the itch does not stop.',
  grown: 'Deeper. It keeps going, it always does. That is the beautiful part.',
};
const line = computed(() => {
  if (!map.value) {
    if (flying.value) return 'Ah. A letter.';
    if (dto.value?.status === 'researching') return 'Reading your letter, and everything written on this since Newton.';
    if (dto.value?.status === 'writing') return 'Writing it down for you. Patience; the good part takes a moment.';
    if (dto.value?.status === 'failed') return `Something tore on the way: ${dto.value.error}. Write again.`;
    return 'Write to me. My guess is on the page already; the syllabus is at your side.';
  }
  return LINES[hovered.value.includes('.') ? 'grown' : hovered.value] ?? 'Drag to wander. Hover a card and I will tell you what it is for.';
});
const facing = computed(() => { const b = at.value[hovered.value]; return b ? (b.x + b.w / 2 < 0 ? -1 : 1) : 1; });
const sprites = ref<{ curious: HTMLCanvasElement; reading: HTMLCanvasElement } | null>(null);
Promise.all([catSprite(art.curious, 300), catSprite(art.reading, 300)]).then(([curious, reading]) => { sprites.value = { curious, reading }; });
// He reads while the map is being made.
const reading = computed(() => !flying.value && (dto.value?.status === 'researching' || dto.value?.status === 'writing'));
const drawCat: Draw = (g, w, h, t) => {
  const glow = g.createRadialGradient(w * 0.5, h * 0.62, 0, w * 0.5, h * 0.62, w * 0.55);
  glow.addColorStop(0, 'rgba(120,120,120,.55)'); glow.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = glow; g.fillRect(0, 0, w, h);
  const sprite = sprites.value?.[reading.value ? 'reading' : 'curious'];
  if (!sprite) return;
  const s = Math.min(w, h) * 0.95, bob = reduced() ? 0 : Math.sin(t * 1.6) * s * 0.01;
  g.save();
  g.translate(w / 2, h - s / 2 + bob);
  g.scale(facing.value, 1);
  g.drawImage(sprite, -s / 2, -s / 2, s, s);
  g.restore();
};

// The sky behind it all, drifting the other way from the pan.
const drawSky: Draw = (g, w, h, t) => {
  starfield(g, w, h / 0.8, Math.round((w * h) / 90), 11, view.x / 6, view.y / 6);
  const flick = 0.5 + 0.5 * Math.sin(t * 0.7);
  g.fillStyle = `rgba(255,255,255,${0.05 + flick * 0.04})`;
  g.fillRect(w * 0.5 + view.x / 12, h * 0.5 + view.y / 12, 1, 1);
};

// A plot drawn from its expression, moving if it has a t in it.
const plots = computed(() => (map.value?.pictures ?? []).map((p) => {
  const f = parse(p.expr);
  const draw: Draw = (g, w, h, t) => {
    if (!f) return;
    const n = 180, xs = Array.from({ length: n }, (_, i) => p.from + ((p.to - p.from) * i) / (n - 1));
    const tt = moves(p.expr) ? t % 10 : 0;
    const ys = xs.map((x) => f(x, tt)).map((y) => (Number.isFinite(y) ? y : NaN));
    const fin = ys.filter((y) => !Number.isNaN(y));
    let y0 = Math.min(0, ...fin), y1 = Math.max(0, ...fin);
    if (y1 - y0 < 1e-9) { y0 -= 1; y1 += 1; }
    const X = (x: number) => 6 + ((x - p.from) / (p.to - p.from)) * (w - 12), Y = (y: number) => h - 6 - ((y - y0) / (y1 - y0)) * (h - 12);
    g.fillStyle = 'rgb(70,70,70)';
    for (let x = 0; x < w; x += 3) g.fillRect(x, Y(0), 1, 1);
    if (p.from <= 0 && p.to >= 0) for (let y = 0; y < h; y += 3) g.fillRect(X(0), y, 1, 1);
    g.strokeStyle = '#fff'; g.lineWidth = 1.4; g.beginPath();
    let pen = false;
    xs.forEach((x, i) => { const y = ys[i]!; if (Number.isNaN(y)) { pen = false; return; } if (pen) g.lineTo(X(x), Y(y)); else g.moveTo(X(x), Y(y)); pen = true; });
    g.stroke();
    // A bead running along it.
    const k = Math.floor(((t * 0.25) % 1) * (n - 1)), by = ys[k]!;
    if (!Number.isNaN(by)) { const r = g.createRadialGradient(X(xs[k]!), Y(by), 0, X(xs[k]!), Y(by), 7); r.addColorStop(0, '#fff'); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(X(xs[k]!) - 7, Y(by) - 7, 14, 14); }
  };
  return { ...p, ok: !!f, draw };
}));

// ---- taken away -----------------------------------------------------------------
const meta = computed(() => ({ course: props.course.name, date: props.begin.slice(0, 10) }));
function toObsidian() {
  if (!map.value) return;
  download(exportZip(map.value, dto.value!.grown, at.value, meta.value), `${meta.value.date} ${map.value.title}.zip`.replace(/[\\/:*?"<>|]/g, ''));
}
const print = () => window.print();

const GLYPHS: Record<Kind, string> = {
  hook: 'M6 2a4 4 0 1 1 0 8M6 10v2', questions: 'M2 2h8v6H5l-3 3z', outline: 'M2 3h8M2 6h6M2 9h8',
  terms: 'M2 2v8h8M5 5h3', equations: 'M3 4h6M3 8h6', pictures: 'M1 10c3 0 3-8 5-8s2 8 5 8',
  worked: 'M2 10l3-3 2 2 3-6', traps: 'M6 1l5 10H1z', refresh: 'M10 6a4 4 0 1 1-2-3.5M8 1v2h2', further: 'M2 10L10 2M5 2h5v5',
};
</script>

<template>
  <Teleport to="body">
    <div class="lm-back" :class="{ closing }" @pointerdown.self="shut()">
      <section class="lm" role="dialog" aria-modal="true" :aria-label="`Lecture map, ${course.name}, ${day}`">
        <header class="lm-bar">
          <span class="pix">{{ course.name }} // {{ course.type }}<template v-if="lecture"> // lecture {{ lecture.index + 1 }} of {{ lecture.total }}</template> // {{ day }}</span>
          <span class="lm-tools">
            <template v-if="map">
              <button class="x" title="the whole map in view" @click="fit()">fit</button>
              <button class="x" title="an Obsidian canvas with its note, zipped" @click="toObsidian">obsidian</button>
              <button class="x" title="print, or save as pdf" @click="print">pdf</button>
            </template>
            <button class="x" aria-label="close" @click="shut()">close</button>
          </span>
        </header>

        <div ref="stage" class="lm-stage" :class="{ grab: dragging }" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up" @wheel="wheel">
          <Plate class="lm-sky" :draw="drawSky" :active="true" :animated="true" :cell="3" />

          <!-- the map -->
          <div v-if="map" class="lm-world" :style="{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }">
            <svg class="lm-links" aria-hidden="true">
              <g v-for="l in links" :key="l.id">
                <path :d="l.d" class="lk" />
                <circle v-if="!reduced()" r="3" class="sig"><animateMotion :path="l.d" :dur="`${3.5 + (l.id.length % 4)}s`" repeatCount="indefinite" /></circle>
              </g>
            </svg>

            <article :ref="card('core')" data-id="core" class="node core" :style="pos('core', 0)" @pointerenter="hovered = 'core'">
              <div class="lm-scene"><Gl :build="sceneFor(map.scene)" :active="true" :options="{ px: 2, distance: 4.4 }" label="The lecture's topic, as a small turning model." /></div>
              <h2 class="fell">{{ map.title }}</h2>
              <p v-html="rich(map.core)"></p>
            </article>

            <article v-for="(k, i) in kinds" :key="k" :ref="card(k)" :data-id="k" class="node" :class="[k, { hot: hovered === k }]" :style="pos(k, i + 1)" @pointerenter="hovered = k" @pointerleave="hovered = ''">
              <h3 class="pix"><svg viewBox="0 0 12 12" class="glyph"><path :d="GLYPHS[k]" /></svg>{{ k === 'questions' && past ? 'now, without looking' : TITLES[k] }}
                <button class="grow" :class="{ on: growing === k }" :disabled="!!growing" @click="deeperCard(k)">{{ growing === k ? 'growing' : 'deeper' }}</button>
              </h3>
              <p v-if="k === 'hook'" class="fell big" v-html="rich(map.hook)"></p>
              <ol v-else-if="k === 'questions'" class="qs">
                <li v-for="(q, j) in map.questions" :key="j">
                  <button class="q" @click="revealed.has(j) ? revealed.delete(j) : revealed.add(j)"><span v-html="rich(q.q)"></span></button>
                  <p class="a" :class="{ shown: revealed.has(j) }" v-html="rich(q.a)"></p>
                </li>
              </ol>
              <ol v-else-if="k === 'outline'" class="steps">
                <li v-for="(o, j) in map.outline" :key="j"><span v-html="rich(o)"></span><button class="more" :disabled="!!growing" :title="'deeper on this'" @click="deeper(`outline.${j}`, 'outline', o, o)">+</button></li>
              </ol>
              <dl v-else-if="k === 'terms'" class="terms">
                <template v-for="(t, j) in map.terms" :key="j">
                  <dt><span v-html="rich(t.term)"></span><button class="more" :disabled="!!growing" title="deeper on this" @click="deeper(`terms.${j}`, 'term', t.term, t.meaning)">+</button></dt>
                  <dd v-html="rich(t.meaning)"></dd>
                </template>
              </dl>
              <div v-else-if="k === 'equations'" class="eqs">
                <div v-for="(e, j) in map.equations" :key="j" class="eq">
                  <div class="tex" v-html="tex(e.tex, true)"></div>
                  <p v-html="rich(e.says)"></p>
                  <button class="more" :disabled="!!growing" title="deeper on this" @click="deeper(`equations.${j}`, 'equation', e.tex, e.says)">+</button>
                </div>
              </div>
              <div v-else-if="k === 'pictures'" class="pics">
                <figure v-for="(p, j) in plots" :key="j">
                  <Plate v-if="p.ok" class="plot" :draw="p.draw" :active="true" :animated="true" :cell="2" :label="p.title" />
                  <figcaption><b class="pix">{{ p.title }}</b> <span v-html="rich(p.caption)"></span></figcaption>
                </figure>
              </div>
              <div v-else-if="k === 'worked'" class="worked">
                <p v-html="rich(map.worked.problem)"></p>
                <ol><li v-for="(s, j) in map.worked.steps" :key="j" v-html="rich(s)"></li></ol>
                <p class="ans"><b class="pix">answer</b> <span v-html="rich(map.worked.answer)"></span></p>
              </div>
              <ul v-else-if="k === 'traps'" class="traps">
                <li v-for="(t, j) in map.traps" :key="j"><s v-html="rich(t.wrong)"></s><span v-html="rich(t.right)"></span></li>
              </ul>
              <ol v-else-if="k === 'refresh'" class="steps">
                <li v-for="(r, j) in map.refresh" :key="j"><span><b v-html="rich(r.topic)"></b> <span class="note" v-html="rich(r.why)"></span></span><button class="more" :disabled="!!growing" title="deeper on this" @click="deeper(`refresh.${j}`, 'prerequisite', r.topic, r.why)">+</button></li>
              </ol>
              <ul v-else-if="k === 'further'" class="further">
                <li v-for="(f, j) in map.further" :key="j"><a :href="f.url" target="_blank" rel="noopener">{{ f.title }}</a><span class="note" v-html="rich(f.note)"></span></li>
              </ul>
            </article>

            <article v-for="(g, i) in dto!.grown" :key="g.id" :ref="card(g.id)" :data-id="g.id" class="node grown" :class="{ hot: hovered === g.id }" :style="pos(g.id, i % 6)" @pointerenter="hovered = g.id" @pointerleave="hovered = ''">
              <h3 class="pix">{{ g.title }}
                <button class="grow" :class="{ on: growing === g.id }" :disabled="!!growing" @click="deeper(g.id, 'deeper', g.title, g.text)">{{ growing === g.id ? 'growing' : 'deeper' }}</button>
              </h3>
              <div v-if="g.tex" class="tex" v-html="tex(g.tex, true)"></div>
              <p v-html="rich(g.text)"></p>
            </article>
          </div>

          <!-- before the map: the topic, then the wait -->
          <div v-else class="lm-ask">
            <template v-if="!lecture && !error"><p class="pix">asking the archive</p></template>
            <Letter v-if="lecture && (flying || !dto || dto.status === 'failed')" :key="drafts" v-model="topic" :topics="lecture.topics" :guessed="guessed" :heading="heading" :note="note" :busy="busy" @send="start" @arrived="arrived" />
            <template v-else-if="dto && (dto.status === 'researching' || dto.status === 'writing')">
              <div class="lm-wait"><Gl :build="sceneFor('orbits')" :active="true" :options="{ px: 3, distance: 4.6 }" label="Waiting for the map." hint="" /></div>
              <p class="pix">{{ phase }} // {{ elapsed }}s</p>
              <p class="fell topic">{{ dto.topic }}</p>
              <span class="leds" aria-hidden="true"><i :class="{ on: true }"></i><i :class="{ on: dto.status === 'writing' }"></i></span>
            </template>
            <p v-if="error" class="err note floating">{{ error }}</p>
          </div>

          <p v-if="map && error" class="err note floating">{{ error }}</p>
        </div>

        <aside class="lm-cat" aria-hidden="true">
          <Plate class="cat" :draw="drawCat" :active="true" :animated="true" :cell="2" />
          <Transition name="say" mode="out-in"><p :key="line" class="say fell">{{ line }}</p></Transition>
        </aside>
      </section>

      <!-- the same map, as a document to print -->
      <article v-if="map" class="lm-print">
        <h1>{{ map.title }}</h1>
        <p class="meta">{{ course.name }} // {{ day }}</p>
        <p v-html="rich(map.core)"></p>
        <section v-for="k in kinds" :key="k">
          <h2>{{ TITLES[k] }}</h2>
          <p v-if="k === 'hook'" v-html="rich(map.hook)"></p>
          <ol v-else-if="k === 'questions'"><li v-for="(q, j) in map.questions" :key="j"><span v-html="rich(q.q)"></span><br><em v-html="rich(q.a)"></em></li></ol>
          <ol v-else-if="k === 'outline'"><li v-for="(o, j) in map.outline" :key="j" v-html="rich(o)"></li></ol>
          <dl v-else-if="k === 'terms'"><template v-for="(t, j) in map.terms" :key="j"><dt v-html="rich(t.term)"></dt><dd v-html="rich(t.meaning)"></dd></template></dl>
          <div v-else-if="k === 'equations'"><div v-for="(e, j) in map.equations" :key="j"><div v-html="tex(e.tex, true)"></div><p v-html="rich(e.says)"></p></div></div>
          <ul v-else-if="k === 'pictures'"><li v-for="(p, j) in map.pictures" :key="j">{{ p.title }}: <span v-html="tex(`y = ${p.expr}`)"></span>. <span v-html="rich(p.caption)"></span></li></ul>
          <div v-else-if="k === 'worked'"><p v-html="rich(map.worked.problem)"></p><ol><li v-for="(s, j) in map.worked.steps" :key="j" v-html="rich(s)"></li></ol><p>Answer: <span v-html="rich(map.worked.answer)"></span></p></div>
          <ul v-else-if="k === 'traps'"><li v-for="(t, j) in map.traps" :key="j">Not: <span v-html="rich(t.wrong)"></span><br>But: <span v-html="rich(t.right)"></span></li></ul>
          <ol v-else-if="k === 'refresh'"><li v-for="(r, j) in map.refresh" :key="j"><b>{{ r.topic }}</b>: <span v-html="rich(r.why)"></span></li></ol>
          <ul v-else-if="k === 'further'"><li v-for="(f, j) in map.further" :key="j">{{ f.title }}: {{ f.url }}</li></ul>
        </section>
        <section v-if="dto!.grown.length"><h2>deeper</h2><div v-for="g in dto!.grown" :key="g.id"><h3>{{ g.title }}</h3><div v-if="g.tex" v-html="tex(g.tex, true)"></div><p v-html="rich(g.text)"></p></div></section>
      </article>
    </div>
  </Teleport>
</template>

<style scoped>
.lm-back { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; background: rgba(12, 11, 10, .72); backdrop-filter: blur(6px) grayscale(1); animation: lm-fade .45s var(--out); }
.lm { position: relative; width: min(92vw, 1680px); height: 88vh; background: var(--ground); border: 3px dotted var(--low); display: flex; flex-direction: column;
  box-shadow: 0 0 0 1px var(--faint), 0 30px 120px rgba(0, 0, 0, .6), 0 0 80px rgba(197, 188, 171, .05); animation: lm-open .7s var(--ease); }
@keyframes lm-fade { from { opacity: 0; } }
@keyframes lm-open { from { clip-path: inset(49% 30% 49% 30%); opacity: .3; } 60% { clip-path: inset(0 0 0 0); } }
.lm-bar { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 7px 12px; border-bottom: 3px dotted var(--low); min-width: 0; }
.lm-bar > .pix { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.lm-tools { display: flex; gap: 10px; flex: none; }
.lm-stage { position: relative; flex: 1; min-height: 0; overflow: hidden; cursor: grab; touch-action: none; }
.lm-stage.grab { cursor: grabbing; }
.lm-sky { position: absolute; inset: 0; height: 100%; opacity: .75; pointer-events: none; }
.lm-world { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
.lm-links { position: absolute; overflow: visible; left: 0; top: 0; width: 1px; height: 1px; pointer-events: none; }
.lk { fill: none; stroke: var(--dim); stroke-width: 2.5; stroke-dasharray: 0 8; stroke-linecap: round; animation: lk-in 1.2s var(--out) both; }
@keyframes lk-in { from { opacity: 0; } }
.sig { fill: var(--hi); filter: drop-shadow(0 0 4px rgba(230, 224, 212, .8)); }

.node { position: absolute; background: rgba(12, 11, 10, .92); border: 2px dotted var(--low); padding: 12px 14px 14px; cursor: auto;
  transition: left .9s cubic-bezier(.34, 1.4, .5, 1), top .9s cubic-bezier(.34, 1.4, .5, 1), transform .9s cubic-bezier(.34, 1.4, .5, 1), opacity .5s var(--out), border-color .3s var(--out), box-shadow .3s var(--out); }
.node.hot { border-color: var(--phos); box-shadow: 0 0 28px rgba(197, 188, 171, .12); }
.node h3 { display: flex; align-items: center; gap: 8px; margin: 0 0 10px; color: var(--hi); }
.glyph { width: 12px; height: 12px; flex: none; fill: none; stroke: var(--phos); stroke-width: 1.3; }
.grow { margin-left: auto; font: 400 9.5px var(--pix); color: var(--dim); text-transform: uppercase; border: 1px dotted var(--low); padding: 2px 6px; transition: color .3s var(--out), border-color .3s var(--out); }
.grow:hover:not(:disabled) { color: var(--hi); border-color: var(--phos); }
.grow.on { color: var(--hi); animation: pulse 1s ease-in-out infinite; }
@keyframes pulse { 50% { opacity: .35; } }
.more { flex: none; color: var(--dim); font: 400 12px var(--pix); padding: 0 4px; opacity: 0; transition: opacity .25s, color .25s; }
li:hover > .more, dt:hover > .more, .eq:hover > .more { opacity: 1; }
.more:hover { color: var(--hi); }
.node p, .node li, .node dd { margin: 0; line-height: 1.55; }
.core { border: 3px dotted var(--phos); text-align: center; background: rgba(12, 11, 10, .96); }
.core h2 { font-size: 26px; line-height: 1.05; font-weight: 400; color: var(--hi); margin: 4px 0 10px; }
.lm-scene, .lm-wait { position: relative; display: flex; }
.lm-scene { width: 100%; height: 170px; }
.lm-scene :deep(.gl), .lm-wait :deep(.gl) { width: 100%; height: 100%; display: block; }
.core :deep(.hint) { display: none; }
.big { font-size: 19px; line-height: 1.3; color: var(--hi); }
.qs { margin: 0; padding-left: 18px; display: grid; gap: 8px; }
.q { text-align: left; color: var(--hi); }
.a { max-height: 0; overflow: hidden; color: var(--dim); filter: blur(4px); transition: max-height .5s var(--out), filter .5s var(--out); }
.a.shown { max-height: 200px; filter: none; padding-top: 3px; }
.steps { margin: 0; padding-left: 18px; display: grid; gap: 5px; }
.steps li { display: list-item; }
.steps li > span { display: inline; }
.terms { margin: 0; display: grid; gap: 2px; }
.terms dt { color: var(--hi); margin-top: 6px; display: flex; justify-content: space-between; }
.terms dd { margin: 0; color: var(--dim); }
.eqs { display: grid; gap: 12px; }
.eq { position: relative; }
.eq .more { position: absolute; right: 0; top: 0; }
.tex { color: var(--hi); overflow-x: auto; overflow-y: hidden; scrollbar-width: none; }
.tex :deep(.katex-display) { margin: .3em 0; }
.eq p { color: var(--dim); }
.pics { display: grid; gap: 12px; }
.pics figure { margin: 0; }
.plot { height: 130px; border: 1px dotted var(--low); }
.pics figcaption { margin-top: 6px; color: var(--dim); }
.worked ol { padding-left: 18px; margin: 8px 0; display: grid; gap: 4px; }
.ans { color: var(--hi); }
.traps { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
.traps s { display: block; color: var(--dim); text-decoration-color: var(--low); }
.further { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.further a { color: var(--hi); text-decoration: underline dotted; display: block; }
.grown { border-style: dashed; border-color: var(--faint); background: rgba(18, 18, 18, .95); animation: grow-in .8s cubic-bezier(.34, 1.4, .5, 1) both; }
@keyframes grow-in { from { opacity: 0; transform: translateX(-24px) scale(.92); } }
.grown h3 { font-size: 10.5px; }

.lm-ask { position: absolute; inset: 0; display: grid; place-content: center; justify-items: center; gap: 14px; padding: 24px; text-align: center; }
.lm-ask .lab { width: min(560px, 86vw); text-align: left; }
.lm-ask textarea { resize: vertical; font-size: 17px; line-height: 1.35; }
.lm-wait { width: 260px; height: 220px; }
.lm-ask :deep(.hint) { display: none; }
.topic { font-size: 20px; color: var(--hi); max-width: 560px; margin: 0; }
.err { color: var(--hi); }
.floating { position: absolute; left: 50%; bottom: 14px; transform: translateX(-50%); background: var(--deep); border: 2px dotted var(--low); padding: 6px 12px; }

.lm-cat { position: absolute; left: 14px; bottom: 12px; display: flex; align-items: flex-end; gap: 10px; pointer-events: none; max-width: min(460px, 70%); }
.cat { width: 110px; height: 110px; flex: none; }
.say { position: relative; margin: 0 0 58px; padding: 9px 12px; background: var(--deep); border: 2px dotted var(--low); color: var(--phos); font-size: 14.5px; line-height: 1.35; }
.say::before { content: ''; position: absolute; left: -9px; bottom: 10px; width: 14px; height: 14px; background: var(--deep); border-left: 2px dotted var(--low); border-bottom: 2px dotted var(--low); transform: rotate(45deg) skew(10deg, 10deg); }
.say-enter-active, .say-leave-active { transition: opacity .3s var(--out), transform .3s var(--out); }
.say-enter-from { opacity: 0; transform: translateY(6px); }
.say-leave-to { opacity: 0; }

.lm-print { display: none; }

@media (max-width: 860px) {
  .lm { width: 100vw; height: 100dvh; border: 0; }
  .lm-bar { padding-top: max(7px, env(safe-area-inset-top)); }
  .lm-cat { left: 8px; bottom: max(8px, env(safe-area-inset-bottom)); max-width: calc(100vw - 16px); }
  .cat { width: 64px; height: 64px; }
  .say { font-size: 12.5px; margin-bottom: 30px; max-width: 62vw; padding: 7px 10px; }
  .lm-wait { width: 200px; height: 170px; }
}
/* Touch has no hover: what hover would show is always there, big enough to tap. */
@media (hover: none) {
  .more { opacity: 1; min-width: 32px; min-height: 28px; }
  .grow { padding: 7px 10px; }
  .lm-tools .x { padding: 8px 6px; }
}
.lm-back.closing { animation: shut-fade .42s var(--ease) forwards; }
.lm-back.closing > .lm { animation: shut .42s var(--ease) forwards; pointer-events: none; }
@keyframes shut-fade { to { opacity: 0; } }
@keyframes shut { 40% { clip-path: inset(0 0 0 0); opacity: 1; } to { clip-path: inset(49% 30% 49% 30%); opacity: 0; } }
@media (prefers-reduced-motion: reduce) {
  .lm, .lm-back, .lk, .grown { animation: none; }
  .node { transition: opacity .2s; }
}
</style>

<style>
/* Printing a map prints the document version of it, and nothing else. */
@media print {
  body > *:not(.lm-back) { display: none !important; }
  body { overflow: visible; background: #fff; color: #111; }
  .lm-back { position: static; display: block; background: none; backdrop-filter: none; }
  .lm-back > .lm { display: none; }
  .lm-print { display: block !important; font: 11pt/1.5 Georgia, serif; color: #111; max-width: 170mm; margin: 0 auto; }
  .lm-print h1 { font-size: 22pt; margin: 0; }
  .lm-print h2 { font-size: 13pt; border-bottom: 1px solid #999; margin-top: 16pt; text-transform: lowercase; }
  .lm-print .meta { color: #555; }
  .lm-print section { break-inside: avoid-page; }
}
</style>
