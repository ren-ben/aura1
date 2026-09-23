<script setup lang="ts">
// The console: panes laid out on a hidden plane, the camera on one at a time.
// Arrows and swipes step to a neighbour; holding the web button (or space)
// shows the whole constellation while held; ctrl k or slash searches.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { PANES, type Pane } from './panes';
import { dailyMinutes, duration, load, state, today } from './store';

// What a pane is worth right now, for its card on the web: a line of its own
// figures and twelve marks of its own history.
function preview(id: string): { stat: string; bars: number[] } {
  const days = twelveWeeks();
  const weeks = Array.from({ length: 12 }, (_, i) => days.slice(i * 7, i * 7 + 7).reduce((a, b) => a + b, 0));
  const top = Math.max(1, ...weeks);
  const shape = weeks.map((v) => v / top);
  const flat = (v: number) => Array.from({ length: 12 }, () => v);
  switch (id) {
    case 'today': return { stat: duration(today.value.minutes), bars: today.value.sessions.length ? shape : flat(0.12) };
    case 'insight': return { stat: `${Math.round(days.reduce((a, b) => a + b, 0) / 60)}h in twelve weeks`, bars: shape };
    case 'rituals': {
      const kept = state.habits.filter((h) => h.done.includes(new Date().toISOString().slice(0, 10))).length;
      return { stat: `${kept} of ${state.habits.length} kept today`, bars: state.habits.length ? shape.map((v) => 0.35 + v * 0.65) : flat(0.2) };
    }
    case 'paths': return { stat: `${state.folders.length} paths open`, bars: shape };
    case 'kael': return { stat: `bond ${state.stats?.bond.level ?? 0} // form ${state.stats?.form ?? '--'}`, bars: shape };
    case 'orrery': return { stat: `${state.folders.length} bodies in orbit`, bars: shape.map((v) => 1 - v * 0.6) };
    case 'vessel': return { stat: state.device ? `${state.device.battery ?? '--'}% // ${(state.device.look ?? '').toLowerCase()}` : 'no report', bars: flat(0.5) };
    case 'pact': return { stat: `${days.filter(Boolean).length} of 84 days fed`, bars: shape };
    case 'log': return { stat: `${state.sessions.length} sessions kept`, bars: shape };
    case 'intercept': return { stat: `${state.quotes.length} of his lines`, bars: flat(0.3) };
    default: return { stat: 'sealed until it is built', bars: flat(0.08) };
  }
}

// Twelve weeks of minutes, worked out once for a whole pass over the cards
// rather than twice for each of the fourteen of them.
let weeksCache: { at: number; days: number[] } | null = null;
function twelveWeeks(): number[] {
  const now = Date.now();
  if (!weeksCache || now - weeksCache.at > 4000) weeksCache = { at: now, days: dailyMinutes(84) };
  return weeksCache.days;
}

const here = shallowRef<Pane>(PANES.find((p) => p.id === (location.hash.replace(/^#\/?/, '') || 'kael')) ?? PANES[0]!);
const at = (c: number, r: number) => PANES.find((p) => p.c === c && p.r === r);
const DIRS = [
  { k: 'n', dc: 0, dr: -1, key: 'ArrowUp' }, { k: 's', dc: 0, dr: 1, key: 'ArrowDown' },
  { k: 'w', dc: -1, dr: 0, key: 'ArrowLeft' }, { k: 'e', dc: 1, dr: 0, key: 'ArrowRight' },
] as const;
const ports = computed(() => DIRS.map((d) => ({ ...d, pane: at(here.value.c + d.dc, here.value.r + d.dr) })).filter((p) => p.pane));

// A key pressed again before the glide ends steps on from where the glide is
// going, not from where it started; the plane keeps its own easing, so a run
// of presses reads as one long travel instead of a stutter.
function go(p: Pane | undefined) {
  if (!p || p === here.value) return;
  here.value = p;
  try { history.replaceState(null, '', `#/${p.id}`); } catch { /* sandboxed */ }
}
const step = (dc: number, dr: number) => go(at(here.value.c + dc, here.value.r + dr));

// The web, only while held. A light follows the finger across it and settles
// into whichever pane it is over; letting go there goes to that pane.
const mapping = ref(false);
const lit = shallowRef<Pane | null>(null);
// Five blobs: the first chases the finger, each of the others chases the one
// in front. Blurred together they read as one body of liquid being dragged,
// stretching thin when it moves and pooling back into a drop when it stops.
// Five on a desk, three on a phone: every one of them is a blurred layer the
// compositor carries for the whole drag.
const BLOBS = matchMedia('(pointer: coarse), (max-width: 1500px)').matches ? 3 : 5;
const glow = ref({ on: false, drops: Array.from({ length: BLOBS }, () => ({ x: -400, y: -400, r: 1 })) });
let want = { x: -400, y: -400 };
let flow = 0;

function pour() {
  const drops = glow.value.drops.map((d) => ({ ...d }));
  let moved = 0;
  for (let i = 0; i < drops.length; i++) {
    const d = drops[i]!;
    const target = i ? drops[i - 1]! : want;
    const k = i ? 0.34 : 0.26;
    const dx = target.x - d.x, dy = target.y - d.y;
    d.x += dx * k; d.y += dy * k;
    // A drop being pulled stretches; a drop at rest is round again.
    d.r = 1 + Math.min(1.4, Math.hypot(dx, dy) / 90);
    moved += Math.abs(dx) + Math.abs(dy);
  }
  glow.value = { on: true, drops };
  findLit();
  flow = moved > 1.5 ? requestAnimationFrame(pour) : 0;
}
// A pointer move only records where the pointer is. Hit-testing the card
// under it, and writing the four custom properties that light it, happen once
// a frame in pour() - a finger dragging fires far more moves than a phone can
// composite, and doing this work per event is most of what made it crawl.
function aim(x: number, y: number) {
  const first = !glow.value.on;
  want = { x, y };
  if (first) glow.value = { on: true, drops: glow.value.drops.map(() => ({ x, y, r: 1 })) };
  if (!flow) flow = requestAnimationFrame(pour);
}
function trace(e: PointerEvent) { if (mapping.value) aim(e.clientX, e.clientY); }

function findLit() {
  const { x, y } = want;
  const el = document.elementsFromPoint(x, y).find((e) => (e as HTMLElement).dataset?.pane) as HTMLElement | undefined;
  const pane = el ? PANES.find((q) => q.id === el.dataset.pane) ?? null : null;
  if (pane !== lit.value) lit.value = pane;
  if (!el) return;
  const b = el.getBoundingClientRect();
  el.style.setProperty('--fx', `${((x - b.left) / b.width) * 100}%`);
  el.style.setProperty('--fy', `${((y - b.top) / b.height) * 100}%`);
  el.style.setProperty('--tx', `${((x - b.left) / b.width - 0.5) * 2}`);
  el.style.setProperty('--ty', `${((y - b.top) / b.height - 0.5) * 2}`);
}
function release(e?: PointerEvent) {
  if (!mapping.value) return;
  mapping.value = false;
  glow.value = { ...glow.value, on: false };
  cancelAnimationFrame(flow); flow = 0;
  const target = lit.value;
  lit.value = null;
  if (e || target) go(target ?? undefined);
}
function holdDown(e: PointerEvent) {
  e.preventDefault();
  // Safari throws here for a pointer it no longer considers active, and that
  // used to take the whole hold with it.
  try { (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); } catch { /* no capture, we track by position */ }
  mapping.value = true;
  lit.value = null;
  aim(e.clientX, e.clientY);
}
// A tap on a card goes there, for a finger that lifts and taps instead of drags.
function pickPane(p: Pane) { mapping.value = false; lit.value = null; go(p); }
const mapBox = computed(() => {
  const cs = PANES.map((p) => p.c), rs = PANES.map((p) => p.r);
  return { c0: Math.min(...cs), r0: Math.min(...rs), cols: Math.max(...cs) - Math.min(...cs) + 1, rows: Math.max(...rs) - Math.min(...rs) + 1 };
});
const mapEdges = computed(() => {
  const out: { x1: number; y1: number; x2: number; y2: number }[] = [];
  const { c0, r0, cols, rows } = mapBox.value;
  const cx = (c: number) => ((c - c0 + 0.5) / cols) * 100, cy = (r: number) => ((r - r0 + 0.5) / rows) * 100;
  for (const p of PANES) for (const [dc, dr] of [[1, 0], [0, 1]]) {
    const q = at(p.c + dc!, p.r + dr!);
    if (q) out.push({ x1: cx(p.c), y1: cy(p.r), x2: cx(q.c), y2: cy(q.r) });
  }
  return out;
});

// The search terminal.
const searching = ref(false), query = ref(''), sel = ref(0), input = ref<HTMLInputElement | null>(null);
const index = computed(() => [
  ...PANES.map((p) => ({ kind: p.kind, text: p.name, pane: p.id })),
  ...state.todos.map((t) => ({ kind: t.done ? 'todo, done' : 'todo', text: t.body, pane: 'today' })),
  ...state.folders.flatMap((f) => f.activities.map((a) => ({ kind: `path, ${f.name.toLowerCase()}`, text: a.name, pane: 'paths' }))),
  ...state.habits.map((h) => ({ kind: 'ritual', text: h.name, pane: 'rituals' })),
  ...state.quotes.map((q) => ({ kind: `intercept${q.source ? `, ${q.source}` : ''}`, text: q.body, pane: 'intercept' })),
  ...state.sessions.slice(0, 40).map((s) => ({ kind: `session, ${new Date(s.startedAt).toLocaleDateString()}`, text: `${s.activity}, ${Math.round(s.minutes)} min`, pane: 'log' })),
]);
const hits = computed(() => {
  const q = query.value.trim().toLowerCase();
  return (q ? index.value.filter((x) => `${x.text} ${x.kind}`.toLowerCase().includes(q)) : index.value.slice(0, PANES.length)).slice(0, 14);
});
watch(query, () => { sel.value = 0; });
async function openSearch() { searching.value = true; query.value = ''; await nextTick(); input.value?.focus(); }
function pick(i: number) { const h = hits.value[i]; if (!h) return; searching.value = false; go(PANES.find((p) => p.id === h.pane)); }
function searchKey(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') { e.preventDefault(); sel.value = Math.min(hits.value.length - 1, sel.value + 1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); sel.value = Math.max(0, sel.value - 1); }
  else if (e.key === 'Enter') pick(sel.value);
  else if (e.key === 'Escape') searching.value = false;
}

function key(e: KeyboardEvent) {
  if (searching.value) return;
  if ((e.target as HTMLElement).closest?.('input, textarea, select, [contenteditable]')) return;
  if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || e.key === '/') { e.preventDefault(); openSearch(); return; }
  if (e.key === ' ') { e.preventDefault(); if (!e.repeat) { mapping.value = true; lit.value = null; } return; }
  const d = DIRS.find((x) => x.key === e.key);
  if (d) { e.preventDefault(); step(d.dc, d.dr); }
}
function keyUp(e: KeyboardEvent) { if (e.key === ' ') release(); }

// Swipes, away from anything that turns or scrolls.
let touch: { x: number; y: number } | null = null;
function tDown(e: PointerEvent) {
  if (e.pointerType === 'mouse' || (e.target as HTMLElement).closest('canvas, input, textarea, select, button, .scroll')) return;
  touch = { x: e.clientX, y: e.clientY };
}
function tUp(e: PointerEvent) {
  if (!touch) return;
  const dx = e.clientX - touch.x, dy = e.clientY - touch.y;
  touch = null;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 70) return;
  if (Math.abs(dx) > Math.abs(dy)) step(dx < 0 ? 1 : -1, 0); else step(0, dy < 0 ? 1 : -1);
}

// A phone gets a different console: no wires between panes, no terminal, and
// the web on a key under the thumb.
const narrow = ref(false);
const seeWidth = () => { narrow.value = matchMedia('(max-width: 860px)').matches; };

const clock = ref('');
const tick = () => { const d = new Date(); clock.value = `${d.toLocaleDateString('en-GB').replaceAll('/', '.')} // ${d.toTimeString().slice(0, 5)}`; };
let timer = 0;
onMounted(() => {
  addEventListener('keydown', key); addEventListener('keyup', keyUp);
  addEventListener('pointermove', trace, { passive: true });
  addEventListener('resize', seeWidth); seeWidth();
  tick(); timer = window.setInterval(tick, 20_000); load();
});
onBeforeUnmount(() => {
  removeEventListener('keydown', key); removeEventListener('keyup', keyUp);
  removeEventListener('pointermove', trace); removeEventListener('resize', seeWidth);
  cancelAnimationFrame(flow); clearInterval(timer);
});
</script>

<template>
  <div class="stage" @pointerdown="tDown" @pointerup="tUp">
    <div class="world" :style="{ '--c': here.c, '--r': here.r }">
      <section v-for="p in PANES" :key="p.id" class="pane" :class="{ here: p === here }"
        :style="{ '--pc': p.c, '--pr': p.r }" :aria-hidden="p !== here" :inert="p !== here">
        <component :is="p.component" v-if="state.ready" :active="p === here && !mapping" />
      </section>
    </div>
  </div>

  <nav v-if="!mapping && !narrow" class="ports" aria-label="Neighbouring panes">
    <button v-for="p in ports" :key="p.k" class="port" :class="p.k" @click="go(p.pane)">
      <span class="wire"></span><span>{{ p.pane!.name }}</span>
    </button>
  </nav>

  <div class="hud">
    <div class="brand"><b>AURA-1</b><span class="pix">console{{ state.demo ? ' // sample data' : '' }}</span></div>
    <div class="rec"><span class="clock">earth date {{ clock }}</span><span class="blink">recording</span></div>
    <div class="where"><span class="pix">{{ here.kind }}</span><b>{{ here.name }}</b></div>
    <div v-if="!narrow" class="tools">
      <button aria-label="Search, ctrl k" @click="openSearch">
        <svg viewBox="0 0 14 14" aria-hidden="true"><circle cx="6" cy="6" r="4.5" fill="none" stroke="currentColor" stroke-width="2" /><path d="M9.5 9.5 13 13" stroke="currentColor" stroke-width="2" /></svg>
        <span>search</span>
      </button>
      <button :class="{ held: mapping }" aria-label="Hold to see the whole web" @pointerdown="holdDown" @pointerup="release" @pointercancel="release()" @contextmenu.prevent>
        <svg viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="2" fill="currentColor" /><circle cx="2" cy="2" r="1.5" fill="currentColor" /><circle cx="12" cy="3" r="1.5" fill="currentColor" /><circle cx="3" cy="12" r="1.5" fill="currentColor" /><circle cx="12" cy="12" r="1.5" fill="currentColor" /><path d="M2 2 7 7 12 3M3 12 7 7 12 12" stroke="currentColor" /></svg>
        <span>hold for the web</span>
      </button>
    </div>
    <div class="mini" v-if="state.device"><span>unit k-01</span><span>{{ state.device.battery ?? '--' }}%</span><span>{{ Math.floor(today.minutes / 60) }}h {{ String(Math.round(today.minutes % 60)).padStart(2, '0') }}m today</span></div>
  </div>

  <button v-for="side in (narrow ? ['top', 'bottom'] : [])" :key="side" class="webkey" :class="[side, { held: mapping }]"
    aria-label="Hold and drag over the web to travel" @pointerdown="holdDown" @pointermove.prevent="trace"
    @pointerup="release" @pointercancel="release()" @contextmenu.prevent>
    <svg viewBox="0 0 22 22" aria-hidden="true">
      <path d="M4 5 11 11 18 6M4 17 11 11 18 17" stroke="currentColor" stroke-width="1.4" fill="none" opacity=".55" />
      <circle cx="11" cy="11" r="3.1" fill="currentColor" />
      <circle cx="4" cy="5" r="1.7" fill="currentColor" /><circle cx="18" cy="6" r="1.7" fill="currentColor" />
      <circle cx="4" cy="17" r="1.7" fill="currentColor" /><circle cx="18" cy="17" r="1.7" fill="currentColor" />
    </svg>
  </button>

  <div v-if="mapping" class="map" :class="{ narrow }" aria-label="The whole web">
    <svg class="weld" aria-hidden="true">
      <filter id="goo" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="12" result="soft" />
        <feColorMatrix in="soft" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -9" result="welded" />
        <feBlend in="SourceGraphic" in2="welded" />
      </filter>
    </svg>
    <div class="pour" :class="{ on: glow.on }" aria-hidden="true">
      <i v-for="(d, i) in glow.drops" :key="i"
        :style="{ left: `${d.x}px`, top: `${d.y}px`, '--r': d.r, '--k': 1 - i / glow.drops.length }"></i>
    </div>
    <div class="sky"></div>
    <div class="grid" :style="{ gridTemplateColumns: `repeat(${mapBox.cols}, 1fr)`, gridTemplateRows: `repeat(${mapBox.rows}, 1fr)` }">
      <svg v-if="!narrow" class="edges" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <line v-for="(l, i) in mapEdges" :key="i" :x1="l.x1" :y1="l.y1" :x2="l.x2" :y2="l.y2" />
      </svg>
      <div v-for="(p, i) in PANES" :key="p.id" class="card" :class="{ here: p === here, sealed: p.kind === 'sealed', lit: p === lit }" :data-pane="p.id"
        :style="narrow ? { '--i': i } : { gridColumn: p.c - mapBox.c0 + 1, gridRow: p.r - mapBox.r0 + 1, '--i': i }"
        @click="pickPane(p)">
        <b>{{ p.name }}</b>
        <span>{{ p.kind }}</span>
        <span class="bars" aria-hidden="true"><i v-for="(v, k) in preview(p.id).bars" :key="k" :style="{ '--v': v }"></i></span>
        <span class="stat">{{ preview(p.id).stat }}</span>
      </div>
    </div>
    <p class="pix say">{{ lit ? lit.name : 'let go over a pane to go there' }}</p>
  </div>

  <div v-if="searching" class="term" @click.self="searching = false">
    <div class="box" role="dialog" aria-label="Search the console">
      <div class="head"><span>mu/th/ur 6000 // interface 2037</span><span>esc to close</span></div>
      <input ref="input" v-model="query" placeholder="ready for inquiry" autocomplete="off" aria-label="Search" @keydown="searchKey">
      <ul role="listbox">
        <li v-for="(h, i) in hits" :key="i">
          <button role="option" :aria-selected="i === sel" @click="pick(i)" @mousemove="sel = i"><span class="k">{{ h.kind }}</span><span>{{ h.text }}</span></button>
        </li>
        <li v-if="!hits.length" class="none">No record. The archive holds nothing by that name.</li>
      </ul>
    </div>
  </div>

  <div v-if="!state.ready" class="loading"><b>AURA-1</b><span class="pix">establishing contact</span></div>
  <div class="vignette"></div>
  <div class="scan"></div>
  <div class="grain"></div>
</template>

<style>
.stage { position: fixed; inset: 0; overflow: clip; touch-action: pan-y; }
.stage::after { content: ''; position: fixed; left: 0; right: 0; bottom: 0; height: 104px; z-index: 5; pointer-events: none;
  background: linear-gradient(to top, var(--ground) 34%, rgba(18, 18, 18, .82) 62%, transparent); }
.world { position: absolute; left: 0; top: 0; transition: transform .7s var(--ease); will-change: transform;
  transform: translate(calc(var(--c) * -108vw), calc(var(--r) * -108vh)); }
.pane { position: absolute; width: 100vw; height: 100vh; left: calc(var(--pc) * 108vw); top: calc(var(--pr) * 108vh); overflow: clip;
  background: radial-gradient(var(--faint) 1px, transparent 1.2px) 0 0 / 22px 22px, var(--ground);
  /* The side gutters are as wide as the wires and their names, so nothing the
     console says about itself ever lands on what a pane is showing. */
  padding: 84px clamp(16px, 7.5vw, 116px) 100px; display: flex; flex-direction: column; }
.pane > * { flex: 1; min-height: 0; width: 100%; max-width: 1500px; margin: 0 auto; }

.ports .port { position: fixed; z-index: 15; display: flex; align-items: center; gap: 10px; font: 400 10.5px var(--pix); text-transform: uppercase; color: var(--dim); padding: 8px; }
.ports .port:hover { color: var(--hi); }
.port .wire { width: 56px; height: 3px; background: radial-gradient(circle, var(--phos) 1.2px, transparent 1.6px) 0 50% / 8px 3px repeat-x; animation: wire 1s linear infinite; }
.port.n .wire, .port.s .wire { width: 3px; height: 22px; background: radial-gradient(circle, var(--phos) 1.2px, transparent 1.6px) 50% 0 / 3px 8px repeat-y; animation-name: wirev; }
@keyframes wire { to { background-position: 8px 50%; } }
@keyframes wirev { to { background-position: 50% 8px; } }
.port.w { left: 4px; top: 50%; transform: translateY(-50%); flex-direction: row-reverse; }
.port.w .wire { animation-direction: reverse; }
.port.e { right: 4px; top: 50%; transform: translateY(-50%); }
.port.n { top: 4px; left: 50%; transform: translateX(-50%); flex-direction: column-reverse; gap: 2px; }
.port.n .wire { animation-direction: reverse; }
.port.s { bottom: 52px; left: 50%; transform: translateX(-50%); flex-direction: column-reverse; gap: 2px; }

.hud { position: fixed; inset: calc(10px + env(safe-area-inset-top, 0px)) 12px calc(10px + env(safe-area-inset-bottom, 0px)); pointer-events: none; z-index: 20; font: 400 10.5px var(--pix); text-transform: uppercase; }
.hud > * { position: absolute; }
.hud .brand { left: 0; top: 0; display: flex; gap: 12px; align-items: baseline; }
.hud .brand b { font: 800 22px/1 var(--tek); color: var(--hi); letter-spacing: .06em; text-transform: none; }
.hud .rec { right: 0; top: 4px; display: flex; gap: 14px; color: var(--phos); }
.hud .blink::after { content: '...'; animation: blink 1.2s steps(1) infinite; }
@keyframes blink { 50% { opacity: 0; } }
.hud .where { left: 0; bottom: 0; display: grid; gap: 2px; }
.hud .where b { font: 400 30px/1 var(--goth); color: var(--hi); text-transform: none; }
.hud .tools { left: 50%; bottom: 0; transform: translateX(-50%); display: flex; gap: 8px; pointer-events: auto; }
.hud .tools button { border: 2px solid var(--phos); background: var(--ground); padding: 9px 14px; display: flex; gap: 8px; align-items: center; user-select: none; -webkit-user-select: none; touch-action: none; text-transform: uppercase; }
.hud .tools button:hover, .hud .tools button.held { background: var(--phos); color: var(--ground); }
.hud .tools svg { width: 14px; height: 14px; }
.hud .mini { right: 0; bottom: 4px; display: flex; gap: 14px; color: var(--dim); }

.map { position: fixed; inset: 0; z-index: 25; background: rgba(12, 11, 10, .72); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
  padding: 60px clamp(16px, 5vw, 80px) 90px; animation: mapin .34s var(--ease) both; }
@keyframes mapin { from { opacity: 0; backdrop-filter: blur(0); } to { opacity: 1; } }
.map .sky { position: absolute; inset: 0; background: radial-gradient(1px 1px at 20% 30%, var(--phos), transparent), radial-gradient(1px 1px at 70% 60%, var(--phos), transparent), radial-gradient(1px 1px at 40% 80%, var(--dim), transparent), radial-gradient(1px 1px at 85% 20%, var(--dim), transparent); background-size: 190px 170px; opacity: .6; }
.map .grid { position: relative; display: grid; gap: 18px; height: 100%; }
.map .edges { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.map .edges line { stroke: var(--phos); stroke-width: 3; stroke-linecap: round; stroke-dasharray: 0 9; vector-effect: non-scaling-stroke; animation: signal 1.1s linear infinite; }
@keyframes signal { to { stroke-dashoffset: -18; } }
.map .card { position: relative; border: 3px dotted var(--dim); background: rgba(18, 18, 18, .82); display: grid; place-content: center; align-content: center; text-align: center; gap: 6px; cursor: pointer;
  padding: 10px; transition: border-color .32s var(--ease), transform .32s var(--ease), box-shadow .32s var(--ease), opacity .32s var(--ease);
  animation: cardin .44s var(--ease) both; animation-delay: calc(var(--i) * 22ms); }
@keyframes cardin { from { opacity: 0; transform: translateY(10px) scale(.97); } to { opacity: 1; transform: none; } }
.map .card:hover { transform: translateY(-3px); }
.map .card .bars { display: flex; align-items: flex-end; justify-content: center; gap: 2px; height: 26px; margin-top: 2px; }
.map .card .bars i { width: 4px; height: calc(4px + var(--v) * 22px); background: var(--low); transition: height .5s var(--ease); }
.map .card:hover .bars i, .map .card.here .bars i { background: var(--phos); }
.map .card .stat { color: var(--phos); }
.weld { position: fixed; width: 0; height: 0; }
.map .pour { position: fixed; inset: 0; pointer-events: none; z-index: 1; opacity: 0;
  filter: url(#goo) blur(7px); transition: opacity .34s var(--out); }
.map .pour.on { opacity: .85; }
.map .pour i { position: absolute; width: 150px; height: 150px; margin: -75px 0 0 -75px; border-radius: 50%;
  background: radial-gradient(circle, rgba(220, 213, 198, .95), rgba(197, 188, 171, .5) 58%, transparent 72%);
  transform: scale(calc(var(--k) * var(--r))); }
/* The card under the light fills from wherever the finger is, and leans. */
.map .card.lit { border-color: var(--hi); border-style: solid; z-index: 2;
  transform: perspective(760px) rotateY(calc(var(--tx, 0) * 5deg)) rotateX(calc(var(--ty, 0) * -5deg)) scale(1.045);
  box-shadow: 0 18px 40px rgba(0, 0, 0, .55); }
.map .card::after { content: ''; position: absolute; inset: 0; pointer-events: none; opacity: 0;
  background: radial-gradient(circle at var(--fx, 50%) var(--fy, 50%), rgba(197, 188, 171, .26), rgba(197, 188, 171, .07) 45%, transparent 72%);
  transform: scale(.4); transition: opacity .34s var(--out), transform .5s var(--out); }
.map .card.lit::after { opacity: 1; transform: scale(1); }
.map .card.lit b { color: #fff; text-shadow: 0 0 16px rgba(230, 224, 212, .6); }
/* Anything dragged with a finger gets the light without the weld: an SVG
   filter over the whole screen, on top of a backdrop blur, is two full-screen
   passes a frame, and a tablet composites those no faster than a phone. The
   trailing drops read as one body of liquid without it. */
@media (pointer: coarse), (max-width: 1500px) {
  .map { backdrop-filter: blur(7px); -webkit-backdrop-filter: blur(7px); }
  .map .pour { filter: blur(11px); }
  .map .pour i { width: 128px; height: 128px; margin: -64px 0 0 -64px; }
  .map .card { animation-duration: .3s; }
  .map .card.lit { box-shadow: none; }
}
.map.narrow { backdrop-filter: blur(7px); -webkit-backdrop-filter: blur(7px); }
.map.narrow .pour { filter: blur(11px); }
.map.narrow .pour i { width: 120px; height: 120px; margin: -60px 0 0 -60px; }
.map.narrow .card { animation-duration: .3s; }
.map.narrow .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)) !important; grid-template-rows: none !important;
  gap: 10px; align-content: start; overflow: auto; padding-bottom: 12px; scrollbar-width: none; }
.map.narrow .grid::-webkit-scrollbar { width: 0; }
.map.narrow .card { min-height: 116px; }

/* The key for the web: top edge for a thumb reaching up, bottom for down. */
.webkey { position: fixed; z-index: 30; display: grid; place-items: center; width: 54px; height: 54px; border-radius: 50%;
  border: 2px solid var(--low); background: rgba(18, 18, 18, .86); color: var(--phos); backdrop-filter: blur(6px);
  transition: transform .28s var(--out), border-color .28s var(--out), background .28s var(--out); touch-action: none; }
.webkey svg { width: 24px; height: 24px; }
/* An island at the top edge, a key at the foot: both under the thumb, both
   in the middle, so the hand never has to reach a corner. */
.webkey.top { top: calc(8px + env(safe-area-inset-top, 0px)); left: 50%; transform: translateX(-50%);
  width: min(62vw, 260px); height: 38px; border-radius: 19px; gap: 10px; grid-auto-flow: column; }
.webkey.top svg { width: 17px; height: 17px; }
.webkey.top::after { content: 'the web'; font: 400 9.5px var(--pix); text-transform: uppercase; letter-spacing: .18em; }
.webkey.top.held { transform: translateX(-50%) scale(1.03); }
.webkey.bottom { bottom: calc(16px + env(safe-area-inset-bottom, 0px)); left: 50%; margin-left: -27px; }
.webkey.held { border-color: var(--hi); background: var(--phos); color: var(--ground); transform: scale(1.08); }
.map .card.sealed .stat { color: var(--dim); }
.map .card:hover, .map .card.here { border-color: var(--hi); }
.map .card.here { box-shadow: 0 0 0 4px var(--ground), 0 0 0 7px var(--dim); }
.map .card.sealed { opacity: .5; }
.map .card b { font: 400 clamp(18px, 2.6vw, 38px)/1 var(--goth); color: var(--hi); pointer-events: none; }
.map .card span { font: 400 10px var(--pix); color: var(--dim); text-transform: uppercase; pointer-events: none; }
.map .say { position: absolute; left: 0; right: 0; bottom: 62px; text-align: center; }

.term { position: fixed; inset: 0; z-index: 40; background: rgba(12, 11, 10, .86); display: grid; place-items: start center; padding: 14vh 16px 16px; }
.term .box { width: min(760px, 100%); border: 3px dotted var(--phos); background: var(--ground); }
.term .head { padding: 10px 14px; border-bottom: 3px dotted var(--low); font: 400 10.5px var(--pix); color: var(--dim); display: flex; justify-content: space-between; text-transform: uppercase; }
.term input { width: 100%; background: none; border: 0; padding: 16px 14px; font: 500 20px var(--mono); color: var(--hi); outline: none; }
.term ul { list-style: none; margin: 0; padding: 0 0 8px; max-height: 52vh; overflow: auto; }
.term li button { display: grid; grid-template-columns: 170px 1fr; gap: 12px; width: 100%; text-align: left; padding: 8px 14px; }
.term li button .k { font: 400 10px var(--pix); color: var(--dim); text-transform: uppercase; padding-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.term li button[aria-selected="true"] { background: var(--phos); color: var(--ground); }
.term li button[aria-selected="true"] .k { color: var(--ground); }
.term .none { padding: 10px 14px; color: var(--dim); }

.loading { position: fixed; inset: 0; z-index: 50; display: grid; place-content: center; gap: 12px; text-align: center; background: var(--ground); }
.loading b { font: 800 44px var(--tek); color: var(--hi); letter-spacing: .1em; }
.loading .pix::after { content: '...'; animation: blink 1.2s steps(1) infinite; }
.scan { position: fixed; inset: 0; pointer-events: none; z-index: 30; background: repeating-linear-gradient(0deg, rgba(0, 0, 0, .2) 0 1px, transparent 1px 3px); }
.vignette { position: fixed; inset: 0; pointer-events: none; z-index: 29; background: radial-gradient(ellipse at center, transparent 58%, rgba(6, 6, 6, .7)); }
.grain { position: fixed; inset: -50%; pointer-events: none; z-index: 31; opacity: .06; animation: grain .5s steps(4) infinite;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E"); }
@keyframes grain { 25% { transform: translate(-3%, 2%); } 50% { transform: translate(2%, -3%); } 75% { transform: translate(-2%, -2%); } }

/* A tablet is not a small desk: the wires keep their dots and drop their
   names well before the window is narrow, because at 1366 the names were
   landing on the pane, and the pane keeps more room top and bottom so the
   console's own labels never sit on what a pane is showing. */
@media (max-width: 1500px) {
  .ports .port span:not(.wire) { display: none; }
  .ports .port { padding: 14px; }
  .pane { padding: 92px clamp(16px, 7.5vw, 116px) 116px; }
  .hud .where b { font-size: 24px; }
  .hud .mini { font-size: 9.5px; }
  .stage::after { height: 118px; }
}
@media (max-width: 860px) {
  .pane { padding: calc(64px + env(safe-area-inset-top, 0px)) calc(16px + env(safe-area-inset-right, 0px))
                  calc(92px + env(safe-area-inset-bottom, 0px)) calc(16px + env(safe-area-inset-left, 0px)); }
  .hud { inset: calc(8px + env(safe-area-inset-top, 0px)) 14px calc(8px + env(safe-area-inset-bottom, 0px)); }
  /* Nothing is written along the top on a phone: the console is the pane. */
  .hud .where, .hud .rec, .hud .mini, .hud .brand { display: none; }
  .stage::after { height: 84px; }
  .map { padding: calc(58px + env(safe-area-inset-top, 0px)) 14px calc(84px + env(safe-area-inset-bottom, 0px)); }
  .map .say { bottom: calc(78px + env(safe-area-inset-bottom, 0px)); }
  .map .card b { font-size: 21px; }
  .map .card .bars { height: 18px; }
  .map .card .bars i { width: 3px; height: calc(3px + var(--v) * 14px); }
  .pane > * { overflow: auto; }
  /* Narrow panes stack and scroll; nothing is squeezed onto its neighbour. */
  .pane > * > * { flex-shrink: 0; }
  .hud .where b { font-size: 22px; }
  .hud .mini, .hud .rec .clock, .hud .tools span { display: none; }
  .port.n, .port.s { display: none; }
  .port .wire { width: 24px; }
  .port.w, .port.e { top: auto; bottom: 56px; transform: none; }
  .map .grid { gap: 8px; }
}
</style>
