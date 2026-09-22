<script setup lang="ts">
// The console: panes laid out on a hidden plane, the camera on one at a time.
// Arrows and swipes step to a neighbour; holding the web button (or space)
// shows the whole constellation while held; ctrl k or slash searches.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { PANES, type Pane } from './panes';
import { load, state, today } from './store';

const here = shallowRef<Pane>(PANES.find((p) => p.id === (location.hash.replace(/^#\/?/, '') || 'kael')) ?? PANES[0]!);
const at = (c: number, r: number) => PANES.find((p) => p.c === c && p.r === r);
const DIRS = [
  { k: 'n', dc: 0, dr: -1, key: 'ArrowUp' }, { k: 's', dc: 0, dr: 1, key: 'ArrowDown' },
  { k: 'w', dc: -1, dr: 0, key: 'ArrowLeft' }, { k: 'e', dc: 1, dr: 0, key: 'ArrowRight' },
] as const;
const ports = computed(() => DIRS.map((d) => ({ ...d, pane: at(here.value.c + d.dc, here.value.r + d.dr) })).filter((p) => p.pane));

// Keys held down would otherwise throw the camera about: each step waits
// its turn, and only the last one asked for survives.
let lastStep = 0, queued = 0;
function go(p: Pane | undefined) {
  if (!p || p === here.value) return;
  const wait = Math.max(0, 150 - (performance.now() - lastStep));
  clearTimeout(queued);
  queued = window.setTimeout(() => {
    lastStep = performance.now();
    here.value = p;
    try { history.replaceState(null, '', `#/${p.id}`); } catch { /* sandboxed */ }
  }, wait);
}
const step = (dc: number, dr: number) => go(at(here.value.c + dc, here.value.r + dr));

// The web, only while held.
const mapping = ref(false);
function release(e?: PointerEvent) {
  if (!mapping.value) return;
  mapping.value = false;
  if (!e) return;
  const card = document.elementsFromPoint(e.clientX, e.clientY).find((el) => (el as HTMLElement).dataset?.pane);
  if (card) go(PANES.find((p) => p.id === (card as HTMLElement).dataset.pane));
}
function holdDown(e: PointerEvent) {
  e.preventDefault();
  (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  mapping.value = true;
}
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
  if (e.key === ' ') { e.preventDefault(); if (!e.repeat) mapping.value = true; return; }
  const d = DIRS.find((x) => x.key === e.key);
  if (d) { e.preventDefault(); step(d.dc, d.dr); }
}
function keyUp(e: KeyboardEvent) { if (e.key === ' ') mapping.value = false; }

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

const clock = ref('');
const tick = () => { const d = new Date(); clock.value = `${d.toLocaleDateString('en-GB').replaceAll('/', '.')} // ${d.toTimeString().slice(0, 5)}`; };
let timer = 0;
onMounted(() => { addEventListener('keydown', key); addEventListener('keyup', keyUp); tick(); timer = window.setInterval(tick, 20_000); load(); });
onBeforeUnmount(() => { removeEventListener('keydown', key); removeEventListener('keyup', keyUp); clearInterval(timer); });
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

  <nav v-if="!mapping" class="ports" aria-label="Neighbouring panes">
    <button v-for="p in ports" :key="p.k" class="port" :class="p.k" @click="go(p.pane)">
      <span class="wire"></span><span>{{ p.pane!.name }}</span>
    </button>
  </nav>

  <div class="hud">
    <div class="brand"><b>AURA-1</b><span class="pix">console{{ state.demo ? ' // sample data' : '' }}</span></div>
    <div class="rec"><span class="clock">earth date {{ clock }}</span><span class="blink">recording</span></div>
    <div class="where"><span class="pix">{{ here.kind }}</span><b>{{ here.name }}</b></div>
    <div class="tools">
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

  <div v-if="mapping" class="map" aria-label="The whole web">
    <div class="sky"></div>
    <div class="grid" :style="{ gridTemplateColumns: `repeat(${mapBox.cols}, 1fr)`, gridTemplateRows: `repeat(${mapBox.rows}, 1fr)` }">
      <svg class="edges" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <line v-for="(l, i) in mapEdges" :key="i" :x1="l.x1" :y1="l.y1" :x2="l.x2" :y2="l.y2" />
      </svg>
      <div v-for="p in PANES" :key="p.id" class="card" :class="{ here: p === here, sealed: p.kind === 'sealed' }" :data-pane="p.id"
        :style="{ gridColumn: p.c - mapBox.c0 + 1, gridRow: p.r - mapBox.r0 + 1 }">
        <b>{{ p.name }}</b><span>{{ p.kind }}</span>
      </div>
    </div>
    <p class="pix say">let go over a pane to go there</p>
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
.world { position: absolute; left: 0; top: 0; transition: transform .7s var(--ease); will-change: transform;
  transform: translate(calc(var(--c) * -108vw), calc(var(--r) * -108vh)); }
.pane { position: absolute; width: 100vw; height: 100vh; left: calc(var(--pc) * 108vw); top: calc(var(--pr) * 108vh); overflow: clip;
  background: radial-gradient(var(--faint) 1px, transparent 1.2px) 0 0 / 22px 22px, var(--ground);
  padding: 76px clamp(16px, 4vw, 64px) 88px; display: flex; flex-direction: column; }
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

.map { position: fixed; inset: 0; z-index: 25; background: rgba(12, 11, 10, .94); padding: 60px clamp(16px, 5vw, 80px) 90px; }
.map .sky { position: absolute; inset: 0; background: radial-gradient(1px 1px at 20% 30%, var(--phos), transparent), radial-gradient(1px 1px at 70% 60%, var(--phos), transparent), radial-gradient(1px 1px at 40% 80%, var(--dim), transparent), radial-gradient(1px 1px at 85% 20%, var(--dim), transparent); background-size: 190px 170px; opacity: .6; }
.map .grid { position: relative; display: grid; gap: 18px; height: 100%; }
.map .edges { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.map .edges line { stroke: var(--phos); stroke-width: 3; stroke-linecap: round; stroke-dasharray: 0 9; vector-effect: non-scaling-stroke; animation: signal 1.1s linear infinite; }
@keyframes signal { to { stroke-dashoffset: -18; } }
.map .card { position: relative; border: 3px dotted var(--dim); background: var(--ground); display: grid; place-content: center; text-align: center; gap: 4px; cursor: pointer; }
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

@media (max-width: 860px) {
  .pane { padding: 62px 14px 80px; }
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
