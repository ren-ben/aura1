<script setup lang="ts">
// The rewiring laid out whole, over the console: the corps' drain schedule
// struck out under your own lines, a day, three or a week at a time.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import Rewiring from './Rewiring.vue';
import { localDate, plan } from '../store';
import { dateShift, dayOf, hisLine, hours } from '../rewiring';

const emit = defineEmits<{ close: [] }>();
// Closing plays the opening backwards, then goes.
const closing = ref(false);
function shut() {
  if (closing.value) return;
  closing.value = true;
  setTimeout(() => emit('close'), matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 420);
}

const narrow = matchMedia('(max-width: 860px)').matches;
const span = ref<1 | 3 | 7>(narrow ? 1 : 7);
const anchor = ref(localDate());
const dates = computed(() => {
  let first = anchor.value;
  if (span.value === 7) { const d = new Date(`${first}T12:00:00`); first = dateShift(first, -((d.getDay() + 6) % 7)); }
  return Array.from({ length: span.value }, (_, i) => dateShift(first, i));
});
watch(dates, (d) => plan.show(d[0]!, d[d.length - 1]!), { immediate: true });
const step = (n: number) => { anchor.value = dateShift(anchor.value, n * span.value); };
const focus = computed(() => (dates.value.includes(localDate()) ? localDate() : dates.value[0]!));
const stat = computed(() => dayOf(focus.value));
const range = computed(() => {
  const f = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return dates.value.length > 1 ? `${f(dates.value[0]!)} - ${f(dates.value[dates.value.length - 1]!)}` : f(dates.value[0]!);
});

const key = (e: KeyboardEvent) => {
  if ((e.target as HTMLElement).closest('input, select, textarea')) return;
  if (e.key === 'Escape') shut();
  if (e.key === 'ArrowLeft') step(-1);
  if (e.key === 'ArrowRight') step(1);
};
onMounted(() => window.addEventListener('keydown', key));
onBeforeUnmount(() => window.removeEventListener('keydown', key));
</script>

<template>
  <Teleport to="body">
    <div class="sh-back" :class="{ closing }" @pointerdown.self="shut()">
      <section class="sh" role="dialog" aria-modal="true" aria-label="The rewiring">
        <header class="sh-bar">
          <span class="pix">the rewiring // rev {{ stat.rev }} // {{ hours(stat.wired) }} of {{ hours(stat.capacity) }} h wired // {{ hours(stat.kept) }} h drawn</span>
          <span class="tools">
            <button v-for="n in ([1, 3, 7] as const)" :key="n" class="x" :class="{ on: span === n }" @click="span = n">{{ n === 1 ? 'day' : n === 3 ? '3 days' : 'week' }}</button>
            <i class="sep"></i>
            <button class="x" aria-label="earlier" @click="step(-1)">prev</button>
            <button class="x" @click="anchor = localDate()">now</button>
            <button class="x" aria-label="later" @click="step(1)">next</button>
            <button class="x" aria-label="close" @click="shut()">close</button>
          </span>
        </header>
        <div class="sh-head">
          <div>
            <Transition name="turn" mode="out-in">
              <h2 :key="range" class="title">The Rewiring <span class="tek">{{ range }}</span></h2>
            </Transition>
            <p class="fell said">{{ hisLine(focus) }}</p>
          </div>
          <div class="stamp" aria-label="The drawing it was, struck out and redrawn">
            <div class="pix"><span>amygdala inc.</span><i class="redact"></i></div>
            <div class="pix struck">containment circuit k-1 // drain schedule</div>
            <div class="fell hand">rewired by hand, revision {{ stat.rev }}</div>
          </div>
        </div>
        <div class="sh-body">
          <Rewiring :dates="dates" :hour="54" heads />
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.sh-back { position: fixed; inset: 0; z-index: 55; display: grid; place-items: center; background: rgba(12, 11, 10, .72); backdrop-filter: blur(6px) grayscale(1); animation: fade .45s var(--out); }
.sh { width: min(94vw, 1500px); height: 92vh; background: var(--ground); border: 3px dotted var(--low); display: flex; flex-direction: column; min-height: 0;
  box-shadow: 0 30px 120px rgba(0, 0, 0, .6), 0 0 80px rgba(197, 188, 171, .05); animation: open .7s var(--ease); }
@keyframes fade { from { opacity: 0; } }
@keyframes open { from { clip-path: inset(0 49% 0 49%); opacity: .3; } 60% { clip-path: inset(0 0 0 0); } }
.sh-bar { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 7px 12px; border-bottom: 3px dotted var(--low); }
.sh-bar > .pix { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.tools { display: flex; gap: 10px; flex: none; align-items: center; }
.tools .on { color: var(--hi); text-decoration: underline; text-underline-offset: 3px; }
.sep { width: 1px; height: 12px; background: var(--low); }
.sh-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 24px; padding: 14px 18px 12px; flex-wrap: wrap; }
.sh-head .title { font-size: clamp(38px, 5vw, 72px); }
.sh-head .title .tek { font-size: .36em; color: var(--dim); margin-left: .3em; }
.said { margin: 8px 0 0; max-width: 620px; color: var(--phos); font-style: italic; font-size: 16px; line-height: 1.35; }
.turn-enter-active, .turn-leave-active { transition: opacity .3s var(--out), transform .3s var(--out); }
.turn-enter-from { opacity: 0; transform: translateY(8px); }
.turn-leave-to { opacity: 0; transform: translateY(-8px); }

/* Their title block, struck out; yours written over it. */
.stamp { border: 1.5px solid var(--low); padding: 8px 12px; display: grid; gap: 4px; min-width: 280px; }
.stamp .pix { font-size: 9.5px; color: var(--dim); display: flex; align-items: center; gap: 8px; }
.redact { display: inline-block; width: 7.5em; height: 1.1em; background: var(--deep); box-shadow: inset 0 0 0 1px #1a1816; }
.struck { text-decoration: line-through; text-decoration-color: var(--dim); text-decoration-thickness: 1.5px; }
.hand { color: var(--hi); font-style: italic; font-size: 15px; transform: rotate(-1.5deg); transform-origin: left; }
.sh-body { flex: 1; min-height: 0; border-top: 3px dotted var(--low); }
@media (max-width: 860px) {
  .sh { width: 100vw; height: 100dvh; border: 0; }
  .sh-bar > .pix { display: none; }
  .tools { gap: 8px; }
  .stamp { display: none; }
  .sh-head { padding: 10px 12px 8px; }
}
.sh-back.closing { animation: shut-fade .42s var(--ease) forwards; }
.sh-back.closing > .sh { animation: shut .42s var(--ease) forwards; pointer-events: none; }
@keyframes shut-fade { to { opacity: 0; } }
@keyframes shut { 40% { clip-path: inset(0 0 0 0); opacity: 1; } to { clip-path: inset(0 49% 0 49%); opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .sh, .sh-back { animation: none; } }
</style>
