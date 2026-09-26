<script setup lang="ts">
// The whole month over the console: every lecture, class and exam of the
// chosen groups, the moon over each day, and a mark on every lecture that
// already has its map. A lecture opens its map.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { monthOf, moonPath, type Slot } from '../academy';
import { lectureMaps, state, type MapMark } from '../store';

const props = defineProps<{ start?: Date }>();
const emit = defineEmits<{ close: []; open: [Slot] }>();
// Closing plays the opening backwards, then goes.
const closing = ref(false);
function shut(then: () => void = () => emit('close')) {
  if (closing.value) return;
  closing.value = true;
  setTimeout(then, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 420);
}

const at = ref(new Date((props.start ?? new Date()).getFullYear(), (props.start ?? new Date()).getMonth(), 1));
const days = computed(() => monthOf(state.courses, at.value.getFullYear(), at.value.getMonth()));
const title = computed(() => at.value.toLocaleDateString('en-GB', { month: 'long' }));
const year = computed(() => at.value.getFullYear());
const step = (n: number) => { at.value = new Date(at.value.getFullYear(), at.value.getMonth() + n, 1); };
const counts = computed(() => {
  const inside = days.value.filter((d) => d.inMonth);
  return { lectures: inside.reduce((a, d) => a + d.slots.filter((s) => s.mappable).length, 0), exams: inside.reduce((a, d) => a + d.exams.length, 0) };
});

// The maps already written, by lecture.
const marks = ref<MapMark[]>([]);
const mapped = (s: Slot) => marks.value.find((m) => m.courseId === s.course.id && m.begin === s.begin);
onMounted(async () => {
  window.addEventListener('keydown', key);
  try { marks.value = await lectureMaps.list(); } catch { /* the month is drawn without them */ }
});
onBeforeUnmount(() => window.removeEventListener('keydown', key));
const key = (e: KeyboardEvent) => {
  if (e.key === 'Escape') shut();
  if (e.key === 'ArrowLeft') step(-1);
  if (e.key === 'ArrowRight') step(1);
};
const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
</script>

<template>
  <Teleport to="body">
    <div class="cal-back" :class="{ closing }" @pointerdown.self="shut()">
      <section class="cal" role="dialog" aria-modal="true" :aria-label="`The month of ${title} ${year}`">
        <header class="cal-bar">
          <span class="pix">the almanac // {{ counts.lectures }} lectures, {{ counts.exams }} exams this month</span>
          <span class="tools">
            <button class="x" aria-label="the month before" @click="step(-1)">prev</button>
            <button class="x" @click="at = new Date(new Date().getFullYear(), new Date().getMonth(), 1)">now</button>
            <button class="x" aria-label="the month after" @click="step(1)">next</button>
            <button class="x" aria-label="close" @click="shut()">close</button>
          </span>
        </header>
        <div class="cal-head">
          <Transition name="turn" mode="out-in">
            <h2 :key="title + year" class="title">{{ title }} <span class="tek">{{ year }}</span></h2>
          </Transition>
          <p class="note fell">A lecture opens its map. A dotted one is an exercise class; a star, a lecture already mapped.</p>
        </div>
        <div class="grid" role="grid">
          <span v-for="w in WEEKDAYS" :key="w" class="wd pix" :class="{ end: w === 'sat' || w === 'sun' }">{{ w }}</span>
          <TransitionGroup name="day">
            <div v-for="(d, i) in days" :key="d.date.toDateString()" class="day" :class="{ out: !d.inMonth, today: d.today, end: i % 7 > 4, busy: d.slots.length || d.exams.length }"
                 :style="{ transitionDelay: `${i * 12}ms` }" role="gridcell">
              <div class="dh">
                <b class="tek">{{ d.date.getDate() }}</b>
                <svg viewBox="-6 -6 12 12" class="moon" :aria-label="`moon ${Math.round(d.moon * 29.5)} days old`"><circle r="5" /><path :d="moonPath(d.moon, 5)" /></svg>
              </div>
              <button v-for="x in d.exams" :key="x.id" class="ev exam" :title="`${x.title}, ${time(x.begin)}, ${x.room}`" disabled>
                <em class="pix">exam</em><span>{{ time(x.begin) }} {{ x.title }}</span>
              </button>
              <button v-for="s in d.slots" :key="s.begin + s.label" class="ev" :class="{ ue: !s.mappable, mapped: mapped(s) }" :disabled="!s.mappable"
                      :title="`${s.course.name} ${s.course.type}, ${s.from} to ${s.to}, ${s.room}${mapped(s)?.title ? ` // mapped: ${mapped(s)!.title}` : s.mappable ? ' // open its map' : ''}`"
                      @click="shut(() => emit('open', s))">
                <span class="t">{{ s.from }}</span><span class="l">{{ s.label }}</span><i v-if="mapped(s)" class="star" aria-label="mapped"></i>
              </button>
            </div>
          </TransitionGroup>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.cal-back { position: fixed; inset: 0; z-index: 55; display: grid; place-items: center; background: rgba(12, 11, 10, .72); backdrop-filter: blur(6px) grayscale(1); animation: fade .45s var(--out); }
.cal { width: min(94vw, 1500px); height: 90vh; background: var(--ground); border: 3px dotted var(--low); display: flex; flex-direction: column; min-height: 0;
  box-shadow: 0 30px 120px rgba(0, 0, 0, .6), 0 0 80px rgba(197, 188, 171, .05); animation: open .7s var(--ease); }
@keyframes fade { from { opacity: 0; } }
@keyframes open { from { clip-path: inset(49% 30% 49% 30%); opacity: .3; } 60% { clip-path: inset(0 0 0 0); } }
.cal-bar { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 7px 12px; border-bottom: 3px dotted var(--low); }
.cal-bar > .pix { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.tools { display: flex; gap: 10px; flex: none; }
.cal-head { display: flex; align-items: baseline; justify-content: space-between; gap: 20px; padding: 14px 18px 8px; flex-wrap: wrap; }
.cal-head .title { font-size: clamp(38px, 5vw, 72px); }
.cal-head .title .tek { font-size: .38em; color: var(--dim); margin-left: .3em; }
.cal-head .note { margin: 0; max-width: 420px; }
.turn-enter-active, .turn-leave-active { transition: opacity .3s var(--out), transform .3s var(--out); }
.turn-enter-from { opacity: 0; transform: translateY(8px); }
.turn-leave-to { opacity: 0; transform: translateY(-8px); }

.grid { flex: 1; min-height: 0; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)) repeat(2, minmax(0, .62fr)); grid-auto-rows: minmax(96px, 1fr); grid-template-rows: auto;
  gap: 0; padding: 0 18px 18px; overflow: auto; }
.wd { padding: 6px 8px; border-bottom: 3px dotted var(--low); }
.wd.end { color: var(--low); }
.day { position: relative; min-height: 96px; padding: 6px 7px 8px; border-right: 1px dotted var(--faint); border-bottom: 1px dotted var(--faint); display: flex; flex-direction: column; gap: 3px; min-width: 0; overflow: hidden;
  transition: opacity .4s var(--out), transform .4s var(--out), background .3s var(--out); }
.day.end { background: rgba(0, 0, 0, .18); }
.day.out { opacity: .32; }
.day.today { outline: 2px solid var(--phos); outline-offset: -2px; background: rgba(197, 188, 171, .04); }
.day-enter-from { opacity: 0; transform: translateY(6px); }
.dh { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px; }
.dh .tek { font-size: 20px; color: var(--dim); }
.day.busy .dh .tek, .day.today .dh .tek { color: var(--hi); }
.moon { width: 12px; height: 12px; }
.moon circle { fill: var(--deep); stroke: var(--low); stroke-width: .8; }
.moon path { fill: var(--phos); }
.ev { display: flex; align-items: center; gap: 6px; text-align: left; border: 1px solid var(--low); padding: 3px 6px; background: rgba(12, 11, 10, .7); min-width: 0;
  transition: border-color .25s var(--out), background .25s var(--out), transform .2s var(--out); }
.ev .t { font: 400 9.5px var(--pix); color: var(--dim); flex: none; }
.ev .l { font: 400 10px/1.2 var(--pix); color: var(--hi); text-transform: uppercase; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.ev:not(:disabled):hover { border-color: var(--phos); background: rgba(197, 188, 171, .08); transform: translateX(2px); }
.ev.ue { border-style: dotted; cursor: default; }
.ev.ue .l { color: var(--phos); }
.ev.mapped { border-color: var(--dim); }
.star { flex: none; width: 9px; height: 9px; margin-left: auto; background: var(--hi); clip-path: polygon(50% 0, 61% 38%, 100% 50%, 61% 62%, 50% 100%, 39% 62%, 0 50%, 39% 38%); filter: drop-shadow(0 0 3px rgba(230, 224, 212, .8)); }
.ev.exam { border: 2px solid var(--hi); background: rgba(197, 188, 171, .1); cursor: default; flex-direction: column; align-items: flex-start; gap: 1px; }
.ev.exam em { font-style: normal; color: var(--hi); }
.ev.exam span { font-family: var(--fell); font-size: 12px; color: var(--hi); line-height: 1.15; }
@media (max-width: 860px) {
  .cal { width: 100vw; height: 100dvh; border: 0; }
  .grid { grid-template-columns: repeat(7, minmax(0, 1fr)); grid-auto-rows: minmax(70px, 1fr); padding: 0 6px 10px; }
  .day { min-height: 70px; padding: 4px 3px; }
  .ev .t { display: none; }
  .ev { padding: 2px 3px; }
  .ev .l { font-size: 8.5px; }
  .ev.exam span { display: none; }
  .cal-head .note { display: none; }
}
.cal-back.closing { animation: shut-fade .42s var(--ease) forwards; }
.cal-back.closing > .cal { animation: shut .42s var(--ease) forwards; pointer-events: none; }
@keyframes shut-fade { to { opacity: 0; } }
@keyframes shut { 40% { clip-path: inset(0 0 0 0); opacity: 1; } to { clip-path: inset(49% 30% 49% 30%); opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .cal, .cal-back { animation: none; } .day { transition: none; } }
</style>
