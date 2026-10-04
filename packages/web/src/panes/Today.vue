<script setup lang="ts">
// The anchor: hours given today, the list and its writing, the day as it
// is wired, and how long he holds his form on what he has had.
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import Frame from '../components/Frame.vue';
import RewiringSheet from '../components/RewiringSheet.vue';
import Wiring, { type View } from '../components/Wiring.vue';
import { actions, clock, dueBy, localDate, plan, state, today, type Todo } from '../store';
import { dateShift, dayOf, hisLine, hm, hours, lecturesOn } from '../rewiring';
import { narrow } from '../screen';

defineProps<{ active: boolean }>();

const todayStr = computed(() => localDate());
const groups = computed(() => {
  const d = todayStr.value;
  return [
    { name: 'today', items: dueBy(d) },
    { name: 'coming', items: state.todos.filter((t) => !t.done && t.dueDate !== null && t.dueDate > d) },
    { name: 'someday', items: state.todos.filter((t) => !t.done && t.dueDate === null) },
  ];
});
const kept = computed(() => groups.value[0]!.items.filter((t) => t.done).length);

const body = ref(''), when = ref('today'), date = ref(localDate());
async function add() {
  const text = body.value.trim();
  if (!text) return;
  const due = when.value === 'someday' ? null : when.value === 'date' ? date.value : when.value === 'tomorrow' ? tomorrow() : localDate();
  if (await actions.addTodo(text, due)) body.value = '';
}
// The day the rewiring shows: today unless stepped away from.
const day = ref(localDate());
const step = (n: number) => { day.value = dateShift(day.value, n); plan.show(day.value, day.value); };
const dayName = computed(() => day.value === todayStr.value ? 'today'
  : new Date(`${day.value}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: '2-digit' }).toLowerCase().replace(',', ''));
const wired = computed(() => dayOf(day.value));
// A day without lectures says when the next one is, a step away.
const next = computed(() => {
  if (lecturesOn(day.value).length) return null;
  for (let i = 1; i <= 21; i++) {
    const d = dateShift(day.value, i), l = lecturesOn(d).filter((x) => !x.exam).sort((a, b) => a.start - b.start)[0];
    if (l) return { date: d, label: `${new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: '2-digit' }).toLowerCase().replace(',', '')} ${hm(l.start)} ${l.label}` };
  }
  return null;
});
const sheetOpen = ref(false);
// The nocturne to wire the day in, the horologe to read it by; the last one
// chosen is the one the console opens on.
const read = (): View => { try { return localStorage.getItem('aura.rewiring') === 'horologe' ? 'horologe' : 'nocturne'; } catch { return 'nocturne'; } };
const view = ref<View>(read());
watch(view, (v) => { try { localStorage.setItem('aura.rewiring', v); } catch { /* kept for this visit only */ } });
// A todo carried onto the bus becomes a tap.
// Let down past the list, it waits for tomorrow. The band shows a tick late,
// or the browser drops the drag as the list shifts under it.
const carried = ref<Todo | null>(null), over = ref(false);
const carry = (t: Todo, e: DragEvent) => {
  e.dataTransfer?.setData('application/x-aura-todo', t.body);
  setTimeout(() => { carried.value = t; });
};
const letGo = () => { carried.value = null; over.value = false; };
const tomorrow = () => { const t = new Date(); t.setDate(t.getDate() + 1); return localDate(t); };
const defer = () => { const t = carried.value; letGo(); if (t) actions.moveTodo(t, tomorrow()); };
const shortDate = (d: string | null) => (d ? d.slice(8, 10) + '.' + d.slice(5, 7) : '');

// He holds his form a day past the last session; counted down live.
const now = ref(Date.now());
const timer = window.setInterval(() => { now.value = Date.now(); }, 1000);
onBeforeUnmount(() => clearInterval(timer));
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
        <div v-for="t in g.items" :key="t.id" class="todo" :class="{ done: t.done }" :draggable="!t.done" @dragstart="carry(t, $event)" @dragend="letGo">
          <button class="led" :aria-label="t.done ? 'Undo' : 'Done'" :aria-pressed="t.done" @click="actions.toggleTodo(t)"></button>
          <span class="t">{{ t.body }}</span>
          <span class="pix">{{ g.name === 'today' && t.dueDate! < todayStr ? 'overdue' : g.name === 'coming' ? shortDate(t.dueDate) : '' }}</span>
          <button class="x" :aria-label="`Delete ${t.body}`" @click="actions.removeTodo(t as Todo)">del</button>
        </div>
      </template>
      <div v-if="carried" class="pix tomorrow" :class="{ over }" @dragover.prevent="over = true" @dragleave="over = false" @drop.prevent="defer">let it wait for tomorrow</div>
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

    <Frame class="wire" :title="narrow ? 'the rewiring' : `the rewiring // rev ${wired.rev} // ${hours(wired.wired)} of ${hours(wired.capacity)} h wired // ${hours(wired.kept)} drawn`" flush>
      <template #bar>
        <span class="days">
          <button class="x" aria-label="The day before" @click="step(-1)">&lsaquo;</button>
          <button class="x day" :class="{ on: day === todayStr }" :title="day === todayStr ? '' : 'back to today'" @click="day = todayStr">{{ dayName }}</button>
          <button class="x" aria-label="The day after" @click="step(1)">&rsaquo;</button>
        </span>
        <span class="views" role="radiogroup" aria-label="View">
          <button v-for="v in (['nocturne', 'horologe'] as const)" :key="v" class="x" :class="{ on: view === v }" role="radio" :aria-checked="view === v" @click="view = v">{{ v }}</button>
        </span>
        <button class="x open" @click="sheetOpen = true">open</button>
      </template>
      <Wiring v-model="view" :date="day" />
      <button v-if="next" class="pix next" @click="day = next.date; plan.show(next.date, next.date)">no lectures {{ dayName }} // next: {{ next.label }}</button>
      <p class="fell said" :class="{ err: state.error }">{{ state.error ? `The line did not hold: ${state.error}` : hisLine(day) }}</p>
    </Frame>
    <RewiringSheet v-if="sheetOpen" @close="sheetOpen = false" />

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
.today { display: grid; gap: 18px; grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); grid-template-rows: auto minmax(0, 1.1fr) minmax(0, 1fr); grid-template-areas: "hours list" "wire list" "wire hunger"; }
.next { align-self: center; margin: 2px 12px 0; color: var(--dim); text-align: center; transition: color .3s var(--out); }
.next:hover { color: var(--hi); }
.hours { grid-area: hours; display: flex; flex-direction: column; min-height: 0; }
.clock { font-size: clamp(64px, 8vw, 150px); margin: 8px 0 8px; }
.sess { list-style: none; margin: 0; padding: 0; overflow: auto; max-height: 92px; }
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
.todo[draggable="true"] { cursor: grab; }
.tomorrow { margin-top: 10px; padding: 18px 0; text-align: center; border: 2px dashed var(--low); color: var(--dim); }
.tomorrow.over { border-color: var(--phos); color: var(--hi); }
.wire { grid-area: wire; }
.wire .days { margin-left: auto; display: flex; align-items: center; gap: 2px; }
.wire .days .x { padding: 2px 6px; font-size: 12px; }
.wire .days .day { font-size: 10px; min-width: 76px; text-align: center; }
.wire .days .day.on { color: var(--hi); }
.wire .views { display: flex; gap: 2px; margin-left: 10px; }
.wire .views .x { padding: 2px 6px; }
.wire .views .on { color: var(--hi); box-shadow: inset 0 -1px 0 var(--hi); }
.said { margin: 0; padding: 8px 14px 10px; border-top: 3px dotted var(--low); color: var(--phos); font-style: italic; font-size: 14px; line-height: 1.35; }
.hunger { grid-area: hunger; }
.count { font-size: clamp(40px, 4.6vw, 68px); }
@media (max-aspect-ratio: 5/4) {
  .today { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr) minmax(0, .7fr); grid-template-areas: "hours hours" "wire list" "wire hunger"; }
  .clock { font-size: clamp(64px, 12vw, 150px); }
}
@media (max-width: 860px) {
  .today { display: flex; flex-direction: column; }
  .list { min-height: 360px; }
  .wire { height: 70vh; min-height: 460px; flex: none; }
  /* The bar under the title, the whole of it inside the frame. */
  .wire > :deep(.bar) { flex-wrap: wrap; gap: 6px; }
  .wire > :deep(.bar) > span:first-child { flex-basis: 100%; }
  .wire .days { margin-left: 0; }
  .wire .days .x, .wire .views .x { padding: 2px 3px; }
  .wire .days .day { min-width: 58px; }
  .wire .views { margin-left: 4px; }
  .wire .open { margin-left: auto; }
}
</style>
