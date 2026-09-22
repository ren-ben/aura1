<script setup lang="ts">
// The anchor: hours given today, the list and its writing, the day in
// halftone, and how long he holds his form on what he has had.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import Frame from '../components/Frame.vue';
import { actions, clock, localDate, state, today, type Todo } from '../store';

defineProps<{ active: boolean }>();

const todayStr = computed(() => localDate());
const groups = computed(() => {
  const d = todayStr.value;
  return [
    { name: 'today', items: state.todos.filter((t) => t.dueDate !== null && t.dueDate <= d) },
    { name: 'coming', items: state.todos.filter((t) => !t.done && t.dueDate !== null && t.dueDate > d) },
    { name: 'someday', items: state.todos.filter((t) => !t.done && t.dueDate === null) },
  ];
});
const kept = computed(() => groups.value[0]!.items.filter((t) => t.done).length);

const body = ref(''), when = ref('today'), date = ref(localDate());
async function add() {
  const text = body.value.trim();
  if (!text) return;
  const t = new Date(); if (when.value === 'tomorrow') t.setDate(t.getDate() + 1);
  const due = when.value === 'someday' ? null : when.value === 'date' ? date.value : localDate(t);
  if (await actions.addTodo(text, due)) body.value = '';
}
const shortDate = (d: string | null) => (d ? d.slice(8, 10) + '.' + d.slice(5, 7) : '');

// The day in halftone: an hour a column, dots sized by the focus in it.
const halftone = ref<HTMLCanvasElement | null>(null);
const perHour = computed(() => {
  const out = Array<number>(24).fill(0);
  for (const s of today.value.sessions) {
    let t = new Date(s.startedAt).getTime();
    const end = new Date(s.endedAt).getTime();
    while (t < end) {
      const h = new Date(t).getHours(), next = Math.min(end, new Date(t).setMinutes(60, 0, 0));
      out[h]! += (next - t) / 60_000; t = next;
    }
  }
  return out;
});
function draw() {
  const c = halftone.value;
  if (!c) return;
  const w = (c.width = c.clientWidth * 2), h = (c.height = c.clientHeight * 2), x = c.getContext('2d')!;
  const d = new Date(), now = d.getHours() + d.getMinutes() / 60;
  x.clearRect(0, 0, w, h);
  const cols = 96, rows = 14, cw = w / cols, ch = h / rows;
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const hour = i / 4, f = Math.min(1, perHour.value[Math.floor(hour)]! / 60);
    const swell = Math.exp(-(((j - rows / 2 + 0.5) / (rows / 2.6)) ** 2));
    const future = hour > now;
    const r = Math.min(cw, ch) * (future ? 0.09 : 0.44 * Math.max(f * swell, 0.07));
    x.fillStyle = future ? '#34312d' : '#c5bcab';
    x.beginPath(); x.arc(i * cw + cw / 2, j * ch + ch / 2, r, 0, 7); x.fill();
  }
  x.fillStyle = '#e6e0d4'; x.fillRect((now / 24) * w - 1, 0, 3, h);
}
let ro: ResizeObserver | null = null;
onMounted(() => { ro = new ResizeObserver(draw); if (halftone.value) ro.observe(halftone.value); });
watch(perHour, draw);

// He holds his form a day past the last session; counted down live.
const now = ref(Date.now());
const timer = window.setInterval(() => { now.value = Date.now(); }, 1000);
onBeforeUnmount(() => { clearInterval(timer); ro?.disconnect(); });
const hunger = computed(() => {
  const last = state.stats?.lastSessionAt ? new Date(state.stats.lastSessionAt).getTime() : 0;
  const s = Math.max(0, Math.floor((last + 86_400_000 - now.value) / 1000));
  return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map((v) => String(v).padStart(2, '0')).join(':');
});
const since = (iso: string | null) => {
  if (!iso) return 'never';
  const m = Math.round((now.value - new Date(iso).getTime()) / 60_000);
  return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
};
</script>

<template>
  <div class="today">
    <div class="hours">
      <div class="pix">anchored today // {{ todayStr.split('-').reverse().join('.') }}</div>
      <div class="tek clock">{{ clock(today.minutes) }}</div>
      <ul class="sess">
        <li v-for="s in today.sessions" :key="s.id"><span class="note">{{ new Date(s.startedAt).toTimeString().slice(0, 5) }}</span><span>{{ s.activity }}</span><span class="pix">{{ s.folder }}</span><span class="tek">{{ clock(s.minutes) }}</span></li>
        <li v-if="!today.sessions.length" class="empty">Nothing given yet today.</li>
      </ul>
    </div>

    <Frame class="list" :title="`today's list // ${kept} of ${groups[0]!.items.length} kept`" scroll>
      <template v-for="g in groups" :key="g.name">
        <div v-if="g.items.length && g.name !== 'today'" class="pix group">{{ g.name }}</div>
        <div v-for="t in g.items" :key="t.id" class="todo" :class="{ done: t.done }">
          <button class="led" :aria-label="t.done ? 'Undo' : 'Done'" :aria-pressed="t.done" @click="actions.toggleTodo(t)"></button>
          <span class="t">{{ t.body }}</span>
          <span class="pix">{{ g.name === 'today' && t.dueDate! < todayStr ? 'overdue' : g.name === 'coming' ? shortDate(t.dueDate) : '' }}</span>
          <button class="x" :aria-label="`Delete ${t.body}`" @click="actions.removeTodo(t as Todo)">del</button>
        </div>
      </template>
      <p v-if="!state.todos.length" class="empty">The list is empty. Write the first line below.</p>
      <form class="add" @submit.prevent="add">
        <input v-model="body" class="field grow" placeholder="a thing to do" maxlength="200" aria-label="New todo">
        <select v-model="when" class="field when" aria-label="When">
          <option value="today">today</option><option value="tomorrow">tomorrow</option><option value="date">on a day</option><option value="someday">someday</option>
        </select>
        <input v-if="when === 'date'" v-model="date" type="date" class="field when" aria-label="Day">
        <button class="btn" type="submit">write</button>
      </form>
    </Frame>

    <Frame class="day" title="the day in halftone // an hour a column, each dot as large as the focus in it">
      <canvas ref="halftone" aria-label="Focus through today, hour by hour"></canvas>
      <div class="hrs"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div>
    </Frame>

    <Frame class="hunger" title="until he thins">
      <div class="tek count">{{ hunger }}</div>
      <p class="note">A day from the last session, and his edges start to go grey.</p>
      <div class="rule"></div>
      <div class="kv" v-if="state.device">
        <span>vessel synced</span><span>{{ since(state.device.lastSyncAt) }}</span>
        <span>battery</span><span>{{ state.device.battery ?? '--' }}%{{ state.device.charging ? ', charging' : '' }}</span>
        <span>last session</span><span>{{ since(state.stats?.lastSessionAt ?? null) }}</span>
      </div>
    </Frame>
  </div>
</template>

<style scoped>
.today { display: grid; gap: 18px; grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); grid-template-rows: minmax(0, 1.25fr) minmax(0, 1fr); grid-template-areas: "hours list" "day hunger"; }
.hours { grid-area: hours; display: flex; flex-direction: column; min-height: 0; }
.clock { font-size: clamp(88px, 13vw, 230px); margin: 8px 0 10px; }
.sess { list-style: none; margin: 0; padding: 0; overflow: auto; }
.sess li { display: grid; grid-template-columns: 52px 1fr auto 70px; gap: 12px; align-items: baseline; padding: 5px 0; border-bottom: 3px dotted var(--faint); }
.sess .tek { font-size: 18px; text-align: right; }
.list { grid-area: list; }
.group { margin: 14px 0 4px; }
.todo { display: grid; grid-template-columns: 22px 1fr auto auto; gap: 10px; align-items: center; padding: 7px 0; border-bottom: 3px dotted var(--faint); }
.todo .led { width: 12px; height: 12px; border-radius: 50%; border: 2px solid var(--dim); }
.todo.done .led { background: var(--phos); border-color: var(--phos); box-shadow: 0 0 6px rgba(197, 188, 171, .55); }
.todo .t { color: var(--hi); }
.todo.done .t { color: var(--dim); text-decoration: line-through; text-decoration-color: var(--low); }
.add { display: flex; gap: 8px; margin-top: 14px; flex-wrap: wrap; }
.add .grow { flex: 1; min-width: 160px; }
.add .when { width: auto; }
.day { grid-area: day; }
.day canvas { width: 100%; height: calc(100% - 24px); min-height: 90px; display: block; }
.hrs { display: flex; justify-content: space-between; font: 400 10px var(--pix); color: var(--dim); margin-top: 6px; }
.hunger { grid-area: hunger; }
.count { font-size: clamp(40px, 4.6vw, 68px); }
@media (max-aspect-ratio: 5/4) {
  .today { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr) minmax(0, .8fr); grid-template-areas: "hours hours" "list list" "day hunger"; }
  .clock { font-size: clamp(80px, 16vw, 200px); }
}
@media (max-width: 860px) {
  .today { display: flex; flex-direction: column; }
  .list { min-height: 360px; }
  .day { min-height: 200px; }
}
</style>
