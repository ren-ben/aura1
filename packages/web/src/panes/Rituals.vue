<script setup lang="ts">
// Rituals: the chosen habit's half year as dots (any dot can be set), its
// weeks as moons, every habit side by side, and where new ones begin.
import { computed, onMounted, ref, watch } from 'vue';
import Frame from '../components/Frame.vue';
import Num from '../components/Num.vue';
import Plate from '../components/Plate.vue';
import { bats, church, lamp, moonDisc, starfield, street } from '../gl/plate';
import { actions, daysAgo, HABIT_DAYS, localDate, state } from '../store';
import { narrow } from '../screen';

defineProps<{ active: boolean }>();

const chosen = ref<number | null>(null);
const habit = computed(() => state.habits.find((h) => h.id === chosen.value) ?? state.habits[0]);
watch(() => state.habits, (hs) => { if (!hs.some((h) => h.id === chosen.value)) chosen.value = hs[0]?.id ?? null; }, { immediate: true });

// Columns are weeks, Monday first, ending with this week; its days still to
// come are drawn but can't be set.
const COLS = computed(() => (narrow.value ? 13 : 27));
const weeks = computed(() => {
  const start = daysAgo((new Date().getDay() + 6) % 7 + (COLS.value - 1) * 7);
  return Array.from({ length: COLS.value }, (_, w) => Array.from({ length: 7 }, (_, d) => {
    const x = new Date(start); x.setDate(start.getDate() + w * 7 + d);
    return localDate(x);
  }));
});
const future = (d: string) => d > localDate();
const done = computed(() => new Set(habit.value?.done ?? []));
const streak = (set: Set<string>) => {
  let n = 0; const d = new Date();
  if (!set.has(localDate(d))) d.setDate(d.getDate() - 1);
  while (set.has(localDate(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
};
const best = computed(() => {
  let run = 0, top = 0;
  for (const col of weeks.value) for (const d of col) { if (future(d)) continue; run = done.value.has(d) ? run + 1 : 0; top = Math.max(top, run); }
  return top;
});
const toggle = (d: string) => { if (!future(d) && habit.value) actions.setHabit(habit.value, d, !done.value.has(d)); };

const moonsRef = ref<HTMLDivElement | null>(null);
function drawMoons() {
  const host = moonsRef.value;
  if (!host) return;
  host.innerHTML = '';
  const cols = weeks.value.slice(-8);
  cols.forEach((col, i) => {
    const w = cols.length - 1 - i, kept = col.filter((d) => done.value.has(d)).length;
    const c = document.createElement('canvas'), x = c.getContext('2d')!, r = 30;
    c.width = c.height = 68;
    x.fillStyle = '#34312d'; x.beginPath(); x.arc(34, 34, r, 0, 7); x.fill();
    x.save(); x.beginPath(); x.arc(34, 34, r, 0, 7); x.clip();
    const frac = kept / 7, lit = frac * 2 * r;
    x.fillStyle = '#c5bcab';
    x.beginPath(); x.ellipse(34 + r - lit / 2, 34, lit / 2, r, 0, 0, 7); x.fill();
    if (frac > 0.5) x.fillRect(34, 4, r, 60);
    x.restore();
    c.title = `${kept} of 7 days, ${w ? `${w} weeks ago` : 'this week'}`;
    host.append(c);
  });
}
onMounted(drawMoons);
watch([habit, () => state.habits, weeks], drawMoons);

const strips = computed(() => state.habits.map((h) => {
  const set = new Set(h.done);
  const days = Array.from({ length: 84 }, (_, i) => set.has(localDate(daysAgo(83 - i))));
  return { h, days, rate: days.filter(Boolean).length / 84, streak: streak(set) };
}));

// The vigil: his sky while you keep the rituals.
const vigil = (g: CanvasRenderingContext2D, w: number, h: number, t: number) => {
  const sky = g.createLinearGradient(0, 0, 0, h);
  // The horizon has to be lit, or a black tower on a black sky is nothing.
  // The light is a band, and the band sits exactly where the roofs are. Put
  // it at the foot of the picture instead and the houses stand in front of
  // it: black walls on a black sky, which is a pen drawing of a city.
  sky.addColorStop(0, 'rgb(2,2,2)'); sky.addColorStop(0.24, 'rgb(8,8,8)'); sky.addColorStop(0.36, 'rgb(40,40,40)');
  sky.addColorStop(0.5, 'rgb(150,150,150)'); sky.addColorStop(0.62, 'rgb(62,62,62)');
  sky.addColorStop(0.8, 'rgb(20,20,20)'); sky.addColorStop(1, 'rgb(10,10,10)');
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  // Sized off the height so the ward holds together in a wide strip as well as
  // in a tall box: stars, the moon, a lit horizon behind the roofs, and one
  // church standing out of them.
  starfield(g, w, h * 0.7, Math.round((w * h) / 130), 41);
  // The light behind the roofs. Without it the roofline is a drawing of a
  // roofline: outlines on black, which is a ruler and a pen, not a city.
  const glow = g.createRadialGradient(w * 0.62, h * 0.52, h * 0.02, w * 0.62, h * 0.52, h * 0.8);
  glow.addColorStop(0, 'rgba(255,255,255,.3)');
  glow.addColorStop(0.5, 'rgba(255,255,255,.1)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = glow; g.fillRect(0, 0, w, h);
  // And a bank of it lying along the roofs from edge to edge, so the houses
  // at the ends of the street stand against something too.
  const bank = g.createLinearGradient(0, h * 0.2, 0, h * 0.86);
  bank.addColorStop(0, 'rgba(255,255,255,0)');
  bank.addColorStop(0.42, 'rgba(255,255,255,.21)');
  bank.addColorStop(0.62, 'rgba(255,255,255,.1)');
  bank.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = bank; g.fillRect(0, h * 0.2, w, h * 0.66);
  // The moon goes on last of the sky, over the fog rather than under it:
  // haze laid on top of it is what turns a moon into a smudge.
  moonDisc(g, w * 0.7, h * 0.25, h * 0.2, 13);

  bats(g, w, h * 0.6, t, 8, 55);
  // Wide houses, short sky: the ward is sized off the height so the roofs
  // land around two thirds up whatever shape this frame is, and the cathedral
  // is sized so its spire clears them without leaving the picture.
  const scale = h / 58;
  street(g, w, h - h * 0.1, 31, scale * 0.6, 0.85, h * 0.56);
  street(g, w, h - h * 0.05, 47, scale * 0.85, 0.45, h * 0.5);
  church(g, w * 0.24, h - h * 0.02, h / 190, 5);
  street(g, w, h + 1, 19, scale * 1.15, 0.05, h * 0.44);
  // Lamps down the near street: the only light that is in the city rather
  // than behind it.
  lamp(g, w * 0.08, h, h * 0.2, scale);
  lamp(g, w * 0.46, h, h * 0.16, scale * 0.85);
  lamp(g, w * 0.83, h, h * 0.18, scale * 0.9);
  // The fog the street stands in.
  const floor = g.createLinearGradient(0, h * 0.74, 0, h);
  floor.addColorStop(0, 'rgba(255,255,255,0)');
  floor.addColorStop(1, 'rgba(255,255,255,.14)');
  g.fillStyle = floor; g.fillRect(0, h * 0.74, w, h * 0.26);
};
const records = computed(() => [...strips.value]
  .map((s) => ({ name: s.h.name, streak: s.streak, rate: s.rate, kept: s.h.done.length }))
  .sort((a, b) => b.streak - a.streak));

const name = ref('');
async function add() { const n = name.value.trim(); if (n && await actions.addHabit(n)) name.value = ''; }
async function archive() {
  if (habit.value && window.confirm(`Archive ${habit.value.name}? Its history is kept.`)) await actions.archiveHabit(habit.value);
}
</script>

<template>
  <div class="rituals">
    <div class="main">
      <h1 class="title">Rituals</h1>
      <div class="tabs" role="tablist">
        <button v-for="h in state.habits" :key="h.id" role="tab" :aria-selected="h.id === habit?.id" @click="chosen = h.id">{{ h.name }}</button>
      </div>
      <div v-if="habit" :key="habit.id" class="heat" :style="{ '--cols': COLS }" :aria-label="`${habit.name}, the last half year, a column a week`">
        <div v-for="(col, w) in weeks" :key="w" class="wk">
          <button v-for="(d, i) in col" :key="i" class="dot" :class="{ on: done.has(d), today: d === localDate() }"
            :disabled="future(d)" :aria-label="future(d) ? `${d}: still to come` : `${d}: ${done.has(d) ? 'kept' : 'not kept'}`" @click="toggle(d)"></button>
        </div>
      </div>
      <p v-else class="empty">No rituals yet. Begin one on the right.</p>
      <div class="moonrow"><span class="pix">eight weeks as moons // full when every day was kept</span><div ref="moonsRef" class="moons"></div></div>
    </div>

    <Frame class="chosen" :title="habit ? `the chosen // ${habit.name}` : 'the chosen'">
      <div class="pix">streak</div>
      <div class="tek big"><Num :value="habit ? streak(done) : 0" /></div>
      <div class="kv">
        <span>longest run</span><span><Num :value="best" /> days</span>
        <span>kept</span><span>{{ habit?.done.length ?? 0 }} of {{ HABIT_DAYS }} days</span>
        <span>today</span><span>{{ done.has(localDate()) ? 'kept' : 'still open' }}</span>
      </div>
      <div class="rule"></div>
      <button v-if="habit" class="btn" @click="toggle(localDate())">{{ done.has(localDate()) ? 'undo today' : 'kept it today' }}</button>
      <button v-if="habit" class="x" style="margin-left:10px" @click="archive">archive</button>
      <div class="rule"></div>
      <form class="row" @submit.prevent="add">
        <input v-model="name" class="field grow" placeholder="a new ritual" maxlength="15" aria-label="New ritual">
        <button class="btn" type="submit">begin</button>
      </form>
    </Frame>

    <Frame class="vigil" title="the vigil // his sky while you keep them" flush>
      <Plate :draw="vigil" :active="active" animated :cell="2" label="The moon over the ward, bats crossing" />
    </Frame>

    <Frame class="records" title="the record of the rituals">
      <div class="rrow head"><span class="pix">ritual</span><span class="pix">streak</span><span class="pix">kept</span><span class="pix">rate</span></div>
      <div v-for="r in records" :key="r.name" class="rrow">
        <span class="fell">{{ r.name }}</span><span class="tek">{{ r.streak }}</span><span>{{ r.kept }}</span><span class="note">{{ Math.round(r.rate * 100) }}%</span>
      </div>
      <p class="note vow">A ritual kept for its own sake is the cheapest insight there is. He notices every one.</p>
    </Frame>

    <Frame class="all" title="every ritual // twelve weeks">
      <div v-for="s in strips" :key="s.h.id" class="strip" :class="{ sel: s.h.id === habit?.id }" @click="chosen = s.h.id">
        <span class="pix">{{ s.h.name }}</span>
        <span class="leds"><i v-for="(d, i) in s.days" :key="i" :class="{ on: d }"></i></span>
        <span class="note">{{ Math.round(s.rate * 100) }}%</span>
        <span class="tek">{{ s.streak }}</span>
      </div>
    </Frame>
  </div>
</template>

<style scoped>
.rituals { display: grid; gap: 18px; grid-template-columns: minmax(0, 1.45fr) minmax(280px, 330px); grid-template-rows: min-content minmax(min-content, 1fr) min-content;
  grid-template-areas: "main chosen" "vigil records" "all all"; }
.main { grid-area: main; display: flex; flex-direction: column; gap: 14px; min-height: 0; }
.tabs { display: flex; gap: 18px; flex-wrap: wrap; font: 400 11px var(--pix); text-transform: uppercase; }
.tabs button { color: var(--dim); }
.tabs button[aria-selected="true"] { color: var(--hi); text-shadow: 0 0 10px rgba(197, 188, 171, .5); }
.tabs button[aria-selected="true"]::before { content: '> '; }
.heat { display: grid; grid-template-columns: repeat(var(--cols, 27), minmax(0, 1fr)); gap: clamp(3px, .5vw, 7px); max-width: 1000px; }
.wk { display: grid; gap: clamp(3px, .5vw, 7px); }
.dot { aspect-ratio: 1; border-radius: 50%; background: var(--low); transition: background .4s var(--out), box-shadow .4s var(--out), transform .3s var(--out); }
.dot:not(:disabled):active { transform: scale(.82); }
.heat { animation: heatin .5s var(--out) both; }
@keyframes heatin { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
.tabs button { transition: color .3s var(--out); }
.dot.on { background: var(--phos); box-shadow: 0 0 5px rgba(197, 188, 171, .4); }
.dot.today { outline: 1px solid var(--hi); outline-offset: 2px; }
.dot:disabled { opacity: .3; cursor: default; }
.dot:not(:disabled):hover { outline: 1px solid var(--dim); outline-offset: 1px; }
.moonrow { display: grid; gap: 8px; }
.moons { display: flex; gap: 12px; flex-wrap: wrap; }
.moons :deep(canvas) { width: 34px; height: 34px; }
.chosen { grid-area: chosen; }
.vigil { grid-area: vigil; min-height: 170px; }
.records { grid-area: records; }
.rrow { display: grid; grid-template-columns: 1fr 44px 44px 44px; gap: 10px; align-items: baseline; padding: 4px 0; border-bottom: 3px dotted var(--faint); }
.rrow.head { border-bottom-color: var(--low); }
.rrow .fell { font-size: 18px; color: var(--hi); }
.rrow .tek { font-size: 18px; }
.vow { margin: 12px 0 0; font-family: var(--fell); font-size: 15px; font-style: italic; }
.big { font-size: 96px; margin-bottom: 10px; }
.all { grid-area: all; }
.strip { display: grid; grid-template-columns: 130px minmax(0, 1fr) 44px 36px; gap: 14px; align-items: center; padding: 4px 0; cursor: pointer; }
.strip.sel .pix { color: var(--hi); }
.strip .leds { flex-wrap: nowrap; gap: 3px; overflow: hidden; }
.strip .leds i { width: 7px; height: 7px; }
.strip { transition: opacity .3s var(--out); }
.strip .tek { font-size: 20px; text-align: right; }
@media (max-aspect-ratio: 5/4) {
  .rituals { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); grid-template-rows: min-content min-content minmax(min-content, 1fr) min-content;
    grid-template-areas: "main main" "chosen records" "vigil vigil" "all all"; }
  .vigil { min-height: 220px; }
}
@media (max-width: 860px) { .main { order: -1; } .vigil { min-height: 210px; } .records { overflow: visible; } .vigil { min-height: 200px; } .rituals { display: flex; flex-direction: column; } .strip { grid-template-columns: 80px minmax(0, 1fr) 40px 30px; } }
</style>
