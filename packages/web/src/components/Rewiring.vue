<script setup lang="ts">
// The rewiring drawn: a bus down each day, every block a tap wired off it,
// the lectures locked in place, and the current that actually flowed
// glowing on the bus and hatched into the taps it fed. Drag on the bus to
// wire a block, drag a tap to move it, its edges to stretch it; a todo
// dropped on the bus becomes one.
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { localDate, plan, state, type Block } from '../store';
import { SHADES, SNAP, blocksOn, dayOf, drawnOn, hm, hours, lecturesOn, overlap, type Lecture, type Span } from '../rewiring';

const props = withDefaults(defineProps<{ dates: string[]; hour?: number; heads?: boolean }>(), { hour: 44, heads: false });

const todayStr = ref(localDate());
const nowMin = ref(0);
const tick = () => { const d = new Date(); nowMin.value = d.getHours() * 60 + d.getMinutes(); todayStr.value = localDate(d); };
tick();
const timer = window.setInterval(tick, 30_000);

const px = (m: number) => `${(m / 60) * props.hour}px`;
const snap = (m: number) => Math.round(m / SNAP) * SNAP;
const clamp = (m: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, m));

// Taps that overlap sit side by side, each in the first lane free.
type Item = Span & { key: string; b?: Block; l?: Lecture; lane: number; lanes: number };
function lay(date: string): Item[] {
  const items: Item[] = [
    ...lecturesOn(date).map((l, i) => ({ key: `l${i}`, start: l.start, end: l.end, l, lane: 0, lanes: 1 })),
    ...blocksOn(date).map((b) => ({ key: `b${b.id}`, start: b.start, end: b.end, b, lane: 0, lanes: 1 })),
  ].sort((a, b) => a.start - b.start || b.end - a.end);
  let group: Item[] = [], ends: number[] = [], reach = -1;
  const close = () => { const n = ends.length || 1; for (const g of group) g.lanes = n; group = []; ends = []; };
  for (const it of items) {
    if (it.start >= reach) close();
    let lane = ends.findIndex((e) => e <= it.start);
    if (lane < 0) lane = ends.length;
    ends[lane] = it.end; it.lane = lane; group.push(it); reach = Math.max(reach, it.end);
  }
  close();
  return items;
}
const days = computed(() => props.dates.map((date) => ({ date, items: lay(date), drawn: drawnOn(date), stat: dayOf(date) })));
const place = (it: Item) => ({
  top: `calc(${px(it.start)} + 1px)`, height: `calc(${px(it.end - it.start)} - 2px)`,
  left: `calc(28px + (100% - 34px) * ${it.lane / it.lanes})`, width: `calc((100% - 34px) / ${it.lanes} - ${it.lanes > 1 ? 3 : 0}px)`,
});
const keptIn = (b: Span, drawn: Span[]) => drawn.filter((s) => overlap(b, s) > 0)
  .map((s) => ({ start: Math.max(s.start, b.start) - b.start, end: Math.min(s.end, b.end) - b.start }));
const liveTo = (date: string) => (date < todayStr.value ? 1440 : date === todayStr.value ? nowMin.value : 0);

// Which column is under the pointer, and at what minute.
const root = ref<HTMLElement | null>(null);
function at(e: PointerEvent | DragEvent): { date: string; min: number } | null {
  for (const col of root.value?.querySelectorAll<HTMLElement>('.col') ?? []) {
    const r = col.getBoundingClientRect();
    if (e.clientX >= r.left && e.clientX < r.right) return { date: col.dataset.date!, min: ((e.clientY - r.top) / props.hour) * 60 };
  }
  return null;
}

const selId = ref<number | null>(null);
const sel = computed(() => state.blocks.find((b) => b.id === selId.value) ?? null);
const draft = ref<{ date: string; start: number; end: number; anchor: number; title: string; typing: boolean } | null>(null);
const draftIn = ref<HTMLInputElement[]>([]);
type Drag = { id: number; mode: 'move' | 'top' | 'bot'; min0: number; start0: number; end0: number; moved: boolean; held: boolean };
const drag = ref<Drag | null>(null);

// On the bus: close what is open, or begin a new tap.
function press(date: string, e: PointerEvent) {
  if (e.button !== 0) return;
  if (selId.value !== null || draft.value?.typing) { selId.value = null; commit(); return; }
  const p = at(e);
  if (!p) return;
  const start = clamp(Math.floor(p.min / SNAP) * SNAP, 0, 1440 - SNAP);
  draft.value = { date, start, end: start + SNAP, anchor: start, title: '', typing: false };
}
// On a tap: a mouse drags at once; a finger first chooses it, then drags.
function grab(b: Block, e: PointerEvent) {
  if (e.button !== 0 || b.id < 0) return;
  const grip = (e.target as HTMLElement).dataset.grip as 'top' | 'bot' | undefined;
  drag.value = { id: b.id, mode: grip ?? 'move', min0: at(e)?.min ?? 0, start0: b.start, end0: b.end, moved: false,
    held: e.pointerType === 'touch' && selId.value !== b.id };
}
function move(e: PointerEvent) {
  const p = at(e);
  if (draft.value && !draft.value.typing && p) {
    const m = clamp(snap(p.min), 0, 1440), a = draft.value.anchor;
    [draft.value.start, draft.value.end] = m > a ? [a, Math.max(m, a + SNAP)] : [m, a + SNAP];
    return;
  }
  const d = drag.value, b = d && state.blocks.find((x) => x.id === d.id);
  if (!d || !b || d.held || !p) return;
  const dm = snap(p.min - d.min0);
  if (!d.moved && Math.abs(p.min - d.min0) < 4 && p.date === b.date) return;
  d.moved = true;
  if (d.mode === 'move') {
    const len = d.end0 - d.start0, start = clamp(d.start0 + dm, 0, 1440 - len);
    Object.assign(b, { start, end: start + len, date: p.date });
  } else if (d.mode === 'top') b.start = clamp(d.start0 + dm, 0, b.end - SNAP);
  else b.end = clamp(d.end0 + dm, b.start + SNAP, 1440);
}
async function up() {
  if (draft.value && !draft.value.typing) {
    const t = draft.value;
    if (t.end - t.start <= SNAP) t.end = Math.min(1440, t.start + 60);
    t.typing = true;
    await nextTick();
    draftIn.value[0]?.focus();
    return;
  }
  const d = drag.value, b = d && state.blocks.find((x) => x.id === d.id);
  drag.value = null;
  if (!d || !b) return;
  if (d.moved) plan.change(b, { date: b.date, start: b.start, end: b.end });
  else selId.value = selId.value === b.id ? null : b.id;
}
// A finger that scrolls instead gives up whatever it began.
function cancel() { if (draft.value && !draft.value.typing) draft.value = null; drag.value = null; }
function commit() {
  const t = draft.value;
  draft.value = null;
  const title = t?.title.trim();
  if (t && title) plan.add({ date: t.date, start: t.start, end: t.end, title, shade: 1, activityId: null });
}

// A todo dropped on the bus is wired as an hour from where it fell.
function drop(e: DragEvent) {
  const body = e.dataTransfer?.getData('application/x-aura-todo'), p = at(e);
  if (!body || !p) return;
  const start = clamp(Math.floor(p.min / SNAP) * SNAP, 0, 1380);
  plan.add({ date: p.date, start, end: start + 60, title: body.slice(0, 120), shade: 1, activityId: null });
}

const paths = computed(() => state.folders.filter((f) => !f.archived)
  .map((f) => ({ ...f, activities: f.activities.filter((a) => !a.archived) })).filter((f) => f.activities.length));
const rename = (b: Block, e: Event) => { const t = (e.target as HTMLInputElement).value.trim(); if (t && t !== b.title) plan.change(b, { title: t }); };
const setPath = (b: Block, e: Event) => { const v = (e.target as HTMLSelectElement).value; plan.change(b, { activityId: v ? Number(v) : null }); };
const cut = (b: Block) => { selId.value = null; plan.remove(b); };
const popAt = (b: Block, i: number) => ({
  ...(b.end > 1200 ? { bottom: `calc(100% - ${px(b.start)} + 6px)` } : { top: `calc(${px(b.end)} + 6px)` }),
  ...(i > 0 && i >= props.dates.length - 2 ? { right: '6px' } : { left: '28px' }),
});
const cap = (date: string, capacity: number, n: number) => plan.capacity(date, Math.min(1440, Math.max(60, capacity + n)));

function key(e: KeyboardEvent) {
  if ((e.target as HTMLElement).closest('input, select, textarea')) return;
  if (e.key === 'Escape') selId.value = null;
  if ((e.key === 'Delete' || e.key === 'Backspace') && sel.value) cut(sel.value);
}
onMounted(() => {
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', cancel);
  window.addEventListener('keydown', key);
  const first = props.dates.includes(todayStr.value) ? nowMin.value - 150 : 7 * 60;
  if (root.value) root.value.scrollTop = (Math.max(0, first) / 60) * props.hour;
});
onBeforeUnmount(() => {
  clearInterval(timer);
  window.removeEventListener('pointermove', move);
  window.removeEventListener('pointerup', up);
  window.removeEventListener('pointercancel', cancel);
  window.removeEventListener('keydown', key);
});
const weekday = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short' }).toLowerCase();
</script>

<template>
  <div ref="root" class="rw" :style="{ '--hour': `${hour}px` }">
    <div v-if="heads" class="heads">
      <div v-for="d in days" :key="d.date" class="head" :class="{ today: d.date === todayStr, over: d.stat.wired > d.stat.capacity }">
        <span class="pix">{{ weekday(d.date) }} <b class="tek">{{ d.date.slice(8) }}.{{ d.date.slice(5, 7) }}</b></span>
        <span class="pix load">
          <button class="x" aria-label="less capacity" @click="cap(d.date, d.stat.capacity, -30)">-</button>
          {{ hours(d.stat.wired) }}/{{ hours(d.stat.capacity) }} h
          <button class="x" aria-label="more capacity" @click="cap(d.date, d.stat.capacity, 30)">+</button>
        </span>
      </div>
    </div>
    <div class="sheet" :style="{ height: px(1440) }">
      <div class="gutter" aria-hidden="true">
        <span v-for="h in 23" :key="h" class="pix" :style="{ top: px(h * 60) }">{{ String(h).padStart(2, '0') }}</span>
      </div>
      <div v-for="(d, i) in days" :key="d.date" class="col" :data-date="d.date"
           :class="{ today: d.date === todayStr, sag: d.stat.wired > d.stat.capacity }"
           @pointerdown="press(d.date, $event)" @dragover.prevent @drop.prevent="drop">
        <div class="bus"><i class="live" :style="{ height: px(liveTo(d.date)) }"></i></div>
        <i v-for="(s, k) in d.drawn" :key="k" class="drawn" :style="{ top: px(s.start), height: px(s.end - s.start) }"></i>

        <template v-for="it in d.items" :key="it.key">
          <div v-if="it.l" class="tap lock" :class="{ exam: it.l.exam }" :style="place(it)" :title="`${it.l.label}, ${hm(it.start)} to ${hm(it.end)}, ${it.l.room}`" @pointerdown.stop>
            <span class="time pix">{{ hm(it.start) }} // {{ it.l.exam ? 'exam' : 'locked' }}</span><b class="t">{{ it.l.label }}</b>
          </div>
          <template v-else-if="it.b">
            <i v-if="it.lane === 0" class="stub" :style="{ top: `calc(${px(it.start)} + 9px)`, '--ink': SHADES[it.b.shade]!.ink }"></i>
            <div class="tap" :class="{ sel: selId === it.b.id, short: it.end - it.start < 45, held: drag?.id === it.b.id && drag.moved, ghost: it.b.id < 0 }"
                 :style="{ ...place(it), '--ink': SHADES[it.b.shade]!.ink }" @pointerdown.stop="grab(it.b, $event)">
              <i v-for="(k, j) in keptIn(it, d.drawn)" :key="j" class="kept" :style="{ top: px(k.start), height: px(k.end - k.start) }"></i>
              <span class="time pix">{{ hm(it.start) }}-{{ hm(it.end) }}</span>
              <b class="t">{{ it.b.title }}</b>
              <i class="grip top" data-grip="top"></i><i class="grip bot" data-grip="bot"></i>
            </div>
          </template>
        </template>

        <form v-if="draft && draft.date === d.date" class="tap draft" :style="{ top: px(draft.start), height: px(draft.end - draft.start), left: '28px', width: 'calc(100% - 34px)' }"
              @submit.prevent="commit" @pointerdown.stop>
          <span class="time pix">{{ hm(draft.start) }}-{{ hm(draft.end) }}</span>
          <input v-if="draft.typing" ref="draftIn" v-model="draft.title" class="t" maxlength="120" placeholder="name the tap" aria-label="New block"
                 @keydown.esc="draft = null" @blur="commit">
        </form>

        <div v-if="d.date === todayStr" class="now" :style="{ top: px(nowMin) }">
          <svg class="eye" viewBox="0 0 22 12" aria-hidden="true"><g><path class="lid" d="M1 6 Q11 -2.5 21 6 Q11 14.5 1 6 Z" /><ellipse class="slit" cx="11" cy="6" rx="1.4" ry="4.2" /></g></svg>
          <span class="pix">{{ hm(nowMin) }}</span>
        </div>

        <div v-if="sel && sel.date === d.date && !drag" class="pop" :style="popAt(sel, i)" @pointerdown.stop>
          <input class="field" :value="sel.title" maxlength="120" aria-label="Name" @change="rename(sel, $event)" @keydown.enter="($event.target as HTMLInputElement).blur()">
          <div class="inks" role="radiogroup" aria-label="Ink">
            <button v-for="(s, k) in SHADES" :key="s.name" :class="{ on: sel.shade === k }" :style="{ background: s.ink }" :title="s.name"
                    role="radio" :aria-checked="sel.shade === k" :aria-label="s.name" @click="plan.change(sel, { shade: k })"></button>
          </div>
          <select class="field" :value="sel.activityId ?? ''" aria-label="Path" @change="setPath(sel, $event)">
            <option value="">no path</option>
            <optgroup v-for="f in paths" :key="f.id" :label="f.name">
              <option v-for="a in f.activities" :key="a.id" :value="a.id">{{ a.name }}</option>
            </optgroup>
          </select>
          <div class="foot"><span class="pix">{{ hm(sel.start) }}-{{ hm(sel.end) }} // {{ hours(sel.end - sel.start) }} h</span>
            <span class="acts"><button class="bin" aria-label="Remove this block" title="remove" @click="cut(sel)">
              <svg viewBox="0 0 14 16" aria-hidden="true"><path d="M1 3.5h12M5 3.5V1.5h4v2M2.5 3.5l.8 11h7.4l.8-11M5.5 6.5v5.5M8.5 6.5v5.5" /></svg>
            </button><button class="x" @click="selId = null">done</button></span></div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.rw { position: relative; flex: 1 1 0; height: 100%; min-height: 0; overflow-y: auto; overflow-x: hidden; scrollbar-width: thin; scrollbar-color: var(--low) transparent; user-select: none; -webkit-user-select: none; }
.heads { position: sticky; top: 0; z-index: 9; display: flex; padding-left: 38px; background: var(--ground); border-bottom: 3px dotted var(--low); }
.head { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; padding: 6px 8px; border-left: 1px dotted var(--faint); }
.head .tek { font-size: 17px; margin-left: 4px; }
.head.today .pix, .head.today .tek { color: var(--hi); }
.head .load { display: flex; align-items: center; gap: 2px; white-space: nowrap; }
.head.over .load { color: var(--hi); }
.sheet { position: relative; display: flex; }
.gutter { position: relative; width: 38px; flex: none; }
.gutter span { position: absolute; left: 4px; transform: translateY(-50%); font-size: 9.5px; }

.col { position: relative; flex: 1; min-width: 0; border-left: 1px dotted var(--faint); touch-action: pan-y; cursor: crosshair;
  background:
    repeating-linear-gradient(to bottom, rgba(52, 49, 45, .6) 0 1px, transparent 1px var(--hour)),
    repeating-linear-gradient(to bottom, transparent 0 calc(var(--hour) / 2), rgba(31, 29, 27, .95) calc(var(--hour) / 2) calc(var(--hour) / 2 + 1px), transparent calc(var(--hour) / 2 + 1px) var(--hour)); }
.col.today { background-color: rgba(197, 188, 171, .018); }

/* The bus: dotted where nothing has run yet, lit where the day has passed. */
.bus { position: absolute; left: 14px; top: 0; bottom: 0; width: 2px; background: repeating-linear-gradient(to bottom, var(--low) 0 3px, transparent 3px 7px); pointer-events: none; }
.bus .live { position: absolute; left: 0; top: 0; width: 2px; background: var(--low); }
.today .bus .live { background: var(--dim); }
.sag .bus { animation: sag 5s ease-in-out infinite; }
.sag .bus .live { background: var(--hi); }
@keyframes sag { 50% { opacity: .35; } }
.drawn { position: absolute; left: 12px; width: 6px; background: var(--phos); box-shadow: 0 0 9px rgba(197, 188, 171, .55); pointer-events: none; }

.stub { position: absolute; left: 15px; width: 13px; height: 2px; background: var(--ink); pointer-events: none; }
.stub::before { content: ''; position: absolute; left: -4px; top: -2px; width: 6px; height: 6px; border-radius: 50%; background: var(--ink); }

.tap { position: absolute; display: flex; flex-direction: column; align-items: flex-start; gap: 1px; padding: 3px 8px 3px 9px; overflow: hidden; cursor: grab; touch-action: pan-y;
  border: 1.5px solid var(--ink); border-left-width: 5px; background: color-mix(in srgb, var(--ink) 22%, var(--deep));
  transition: top .22s var(--out), height .22s var(--out), left .25s var(--out), width .25s var(--out), box-shadow .25s var(--out), opacity .3s var(--out); }
.tap.held { transition: none; cursor: grabbing; z-index: 5; box-shadow: 0 10px 30px rgba(0, 0, 0, .55), 0 0 0 1px var(--hi); }
.tap.sel { z-index: 4; touch-action: none; box-shadow: 0 0 0 1px var(--hi), 0 0 22px rgba(197, 188, 171, .16); }
.tap.ghost { opacity: .6; }
.tap.short { flex-direction: row; align-items: center; gap: 8px; }
.tap .time { position: relative; font-size: 9px; line-height: 1.3; color: var(--dim); background: var(--deep); padding: 0 3px; margin-left: -3px; }
.tap .t { position: relative; max-width: 100%; font: 500 12.5px/1.3 var(--mono); color: var(--hi); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; background: var(--deep); padding: 0 3px; margin-left: -3px; }
.kept { position: absolute; left: 0; right: 0; pointer-events: none; background: repeating-linear-gradient(135deg, color-mix(in srgb, var(--ink) 60%, transparent) 0 2px, transparent 2px 6px); }
.grip { position: absolute; left: 0; right: 0; height: 8px; cursor: ns-resize; }
.grip.top { top: -2px; }
.grip.bot { bottom: -2px; }
.tap:hover .grip.bot::after, .tap.sel .grip.bot::after { content: ''; position: absolute; left: 50%; bottom: 3px; width: 18px; height: 2px; margin-left: -9px; background: var(--ink); }
.tap.lock { cursor: default; border: 1.5px dotted var(--dim); background: repeating-linear-gradient(45deg, rgba(122, 116, 104, .1) 0 1px, transparent 1px 5px), var(--ground); }
.tap.lock .t { font: 400 10px/1.3 var(--pix); text-transform: uppercase; color: var(--phos); }
.tap.lock.exam { border: 2px solid var(--hi); }
.tap.draft { --ink: var(--hi); cursor: default; border-style: dashed; background: rgba(197, 188, 171, .07); z-index: 6; }
.tap.draft input { border: 0; outline: 0; width: 100%; }
.tap.draft input::placeholder { color: var(--dim); }

.now { position: absolute; left: 30px; right: 0; border-top: 1px solid rgba(230, 224, 212, .55); z-index: 7; pointer-events: none; }
/* He watches the hour from the bus: a slit eye that closes once in a long while. */
.eye { position: absolute; left: -24px; top: -8.5px; width: 28px; height: 15px; overflow: visible; filter: drop-shadow(0 0 5px rgba(230, 224, 212, .35)); }
.eye g { transform-origin: 11px 6px; animation: blink 11s ease-in-out infinite; }
.eye .lid { fill: var(--ground); stroke: var(--hi); stroke-width: 1.2; }
.eye .slit { fill: var(--hi); }
@keyframes blink { 0%, 95.5%, 100% { transform: scaleY(1); } 97% { transform: scaleY(.08); } }
.now span { position: absolute; right: 4px; top: -16px; color: var(--hi); font-size: 9px; background: var(--ground); padding: 0 3px; }

.pop { position: absolute; z-index: 8; width: 250px; max-width: calc(100vw - 40px); display: grid; gap: 8px; padding: 10px; cursor: default; user-select: text;
  background: var(--ground); border: 2px solid var(--phos); box-shadow: 0 20px 60px rgba(0, 0, 0, .6); animation: pop .28s var(--out); }
@keyframes pop { from { opacity: 0; transform: translateY(-4px); } }
.inks { display: flex; gap: 6px; }
.inks button { width: 24px; height: 24px; border: 2px solid var(--ground); outline: 1px solid var(--low); transition: outline-color .2s var(--out), transform .2s var(--out); }
.inks button:hover { transform: translateY(-1px); }
.inks button.on { outline: 2px solid var(--hi); }
.foot { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.acts { display: flex; align-items: center; gap: 8px; }
.bin { display: grid; place-items: center; width: 26px; height: 26px; border: 1px solid var(--low); color: var(--dim); transition: color .2s var(--out), border-color .2s var(--out); }
.bin:hover { color: var(--hi); border-color: var(--hi); }
.bin svg { width: 13px; height: 15px; fill: none; stroke: currentColor; stroke-width: 1.4; stroke-linecap: square; }
@media (prefers-reduced-motion: reduce) { .eye g, .sag .bus { animation: none; } }
</style>
