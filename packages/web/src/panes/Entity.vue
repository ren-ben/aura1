<script setup lang="ts">
// Kael'thos himself: his own drawing, on a ledge over the cathedral ward at
// night, the bond, what he says today, and the chronicle of the pact.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import Frame from '../components/Frame.vue';
import Num from '../components/Num.vue';
import Plate from '../components/Plate.vue';
import art from '../gl/art.json';
import { bats, catSprite, church, drift, moonDisc, skyline, starfield, trees } from '../gl/plate';
import { dailyMinutes, duration, state, today } from '../store';
import { hisWord } from '../words';

const props = defineProps<{ active: boolean }>();

// His drawing, prepared once: body dark, a moonlit rim, eyes bright.
const sprite = ref<HTMLCanvasElement | null>(null);
catSprite(art.sitting, 420).then((c) => { sprite.value = c; });
const look = ref({ x: 0, y: 0 });
function parallax(e: PointerEvent) {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  look.value = { x: ((e.clientX - r.left) / r.width - 0.5) * 2, y: ((e.clientY - r.top) / r.height - 0.5) * 2 };
}

const draw = computed(() => {
  const cat = sprite.value;
  const drift_ = look.value;
  return (g: CanvasRenderingContext2D, w: number, h: number, t: number) => {
    const horizon = h * 0.84;
    const sky = g.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, 'rgb(3,3,3)'); sky.addColorStop(0.62, 'rgb(16,16,16)'); sky.addColorStop(1, 'rgb(86,86,86)');
    g.fillStyle = sky; g.fillRect(0, 0, w, horizon);
    starfield(g, w, horizon, Math.round((w * h) / 220), 17, drift_.x * -3, drift_.y * -2);
    moonDisc(g, w * 0.78 + drift_.x * -5, h * 0.19 + drift_.y * -4, Math.min(w, h) * 0.09, 7);
    for (let k = 0; k < 3; k++) {
      const y = h * (0.2 + k * 0.13) + Math.sin(t * 0.05 + k) * 4;
      const band = g.createLinearGradient(0, y - 12, 0, y + 12);
      band.addColorStop(0, 'rgba(255,255,255,0)');
      band.addColorStop(0.5, `rgba(255,255,255,${0.025 + k * 0.012})`);
      band.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = band; g.fillRect(0, y - 12, w, 24);
    }
    const scale = Math.max(0.55, w / 300);
    skyline(g, w, horizon, horizon + 2, 31, scale * 0.8);
    church(g, w * 0.26 + drift_.x * -2, horizon + 2, scale, 5);
    trees(g, w, horizon + 2, t, Math.max(3, Math.round(w / 52)), 61, scale * 1.5);
    bats(g, w, horizon * 0.8, t, 6, 23);
    drift(g, w, horizon, t, Math.round((w * h) / 900), 83);
    g.fillStyle = 'rgb(14,14,14)'; g.fillRect(0, horizon, w, h - horizon);
    g.fillStyle = 'rgb(58,58,58)'; g.fillRect(0, horizon, w, 2);
    if (cat) {
      const size = Math.min(h * 0.95, w * 0.66);
      const cx = w * 0.62 + drift_.x * 5, cy = horizon - size * 0.45;
      const pool = g.createRadialGradient(cx, cy, size * 0.1, cx, cy, size * 0.62);
      pool.addColorStop(0, 'rgba(0,0,0,.92)'); pool.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = pool; g.beginPath(); g.arc(cx, cy, size * 0.62, 0, 7); g.fill();
      g.drawImage(cat, w * 0.62 - size / 2 + drift_.x * 5, horizon - size * 0.93 + drift_.y * 3, size, size);
    }
  };
});

const bond = computed(() => state.stats?.bond);
const into = computed(() => {
  const b = bond.value;
  if (!b) return 0;
  const floor = 30 * b.level * b.level;
  return (b.xp - floor) / (b.nextLevelXp - floor);
});
const FORM: Record<string, string> = { stable: 'whole', thinning: 'thinning', fragmenting: 'fragmenting', dormant: 'dormant' };
const word = computed(() => (state.ready ? hisWord() : ''));

const chron = computed(() => {
  const days = dailyMinutes(84);
  let silence = 0, run = 0, fedRun = 0;
  for (const m of days) { run = m ? 0 : run + 1; silence = Math.max(silence, run); }
  for (let i = days.length - 1; i >= 0 && days[i]! > 0; i--) fedRun++;
  const deepest = state.sessions.reduce((a, s) => (s.minutes > a.minutes ? s : a), { minutes: 0, activity: '' } as { minutes: number; activity: string });
  return [
    ['days fed', `${days.filter(Boolean).length}`, 'of the last 84'],
    ['fed in a row', `${fedRun}`, 'days, up to today'],
    ['longest silence', `${silence}`, silence === 1 ? 'day' : 'days'],
    ['sessions', `${state.sessions.length}`, 'in twelve weeks'],
    ['deepest', duration(deepest.minutes), deepest.activity || 'none yet'],
    ['today', duration(today.value.minutes), `${today.value.sessions.length} sessions`],
  ];
});

// You and him: your hours and his insight, both summed over twelve weeks.
const graph = ref<HTMLCanvasElement | null>(null);
function drawGraph() {
  const c = graph.value;
  if (!c) return;
  const w = (c.width = c.clientWidth * 2), h = (c.height = c.clientHeight * 2), x = c.getContext('2d')!;
  x.clearRect(0, 0, w, h);
  const days = dailyMinutes(84);
  let you = 0, him = 0;
  const yours: number[] = [], his: number[] = [];
  days.forEach((m) => { you += m; him += m * (m > 90 ? 1.5 : m >= 45 ? 1.25 : 1); yours.push(you); his.push(him); });
  const max = Math.max(1, him);
  const plot = (series: number[], dotted: boolean) => {
    x.fillStyle = dotted ? '#7a7468' : '#c5bcab';
    series.forEach((v, i) => {
      const px = (i / 83) * (w - 8) + 4, py = h - 6 - (v / max) * (h - 16);
      if (!dotted || i % 2 === 0) x.fillRect(px - 2, py - 2, dotted ? 3 : 5, dotted ? 3 : 5);
    });
  };
  plot(yours, true);
  plot(his, false);
}
let ro: ResizeObserver | null = null;
onMounted(() => { ro = new ResizeObserver(drawGraph); if (graph.value) ro.observe(graph.value); drawGraph(); });
onBeforeUnmount(() => ro?.disconnect());
watch([() => state.sessions, () => props.active], drawGraph);
</script>

<template>
  <div class="entity">
    <Frame class="scene" title="the cathedral ward, before dawn" flush>
      <div class="plateHost" @pointermove="parallax" @pointerleave="look = { x: 0, y: 0 }">
        <Plate :draw="draw" :active="active" animated :cell="3" label="Kael'thos on a ledge above the cathedral ward at night" />
      </div>
    </Frame>

    <div class="side">
      <h1 class="title">Kael'thos</h1>
      <p class="note">a great one at the event horizon. wears a black cat because you would not survive the others.</p>
      <div class="bond" v-if="bond">
        <span class="tek big"><Num :value="bond.level" :pad="2" /></span>
        <div>
          <div class="pix">bond // {{ bond.xp }} of {{ bond.nextLevelXp }} insight</div>
          <div class="leds"><i v-for="n in 30" :key="n" :class="{ on: n / 30 <= into }"></i></div>
          <div class="pix">form: {{ FORM[state.stats!.form] }}</div>
        </div>
      </div>
      <blockquote class="word">{{ word }}</blockquote>
      <Frame title="you and him // twelve weeks, summed" class="sym">
        <canvas ref="graph" aria-label="Your hours and his insight, rising together"></canvas>
        <div class="legend pix"><span><i class="you"></i>your hours</span><span><i class="him"></i>his insight</span></div>
      </Frame>
    </div>

    <div class="chron">
      <div v-for="[k, v, s] in chron" :key="k" class="cell">
        <span class="pix">{{ k }}</span><span class="tek">{{ v }}</span><span class="note">{{ s }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.entity { display: grid; gap: 18px; grid-template-columns: minmax(0, 1.5fr) minmax(320px, 1fr); grid-template-rows: minmax(0, 1fr) auto; grid-template-areas: "scene side" "chron chron"; }
.scene { grid-area: scene; }
.plateHost { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.side { grid-area: side; display: flex; flex-direction: column; gap: 14px; min-height: 0; }
.side .note { margin: -4px 0 0; max-width: 46ch; }
.bond { display: grid; grid-template-columns: auto 1fr; gap: 16px; align-items: center; }
.bond .big { font-size: clamp(60px, 7vw, 104px); }
.bond > div { display: grid; gap: 8px; }
.word { margin: 0; font: italic 400 clamp(17px, 1.6vw, 23px)/1.35 var(--fell); color: var(--hi); text-wrap: pretty; border-left: 3px dotted var(--low); padding-left: 14px; }
.sym { flex: 1; min-height: 130px; }
.sym canvas { width: 100%; height: calc(100% - 22px); min-height: 70px; display: block; }
.legend { display: flex; gap: 16px; margin-top: 6px; }
.legend i { display: inline-block; width: 8px; height: 8px; margin-right: 6px; vertical-align: -1px; }
.legend .you { background: var(--dim); }
.legend .him { background: var(--phos); }
.chron { grid-area: chron; display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); border: 3px dotted var(--low); }
.cell { display: grid; gap: 4px; padding: 12px 14px; border-right: 3px dotted var(--faint); }
.cell:last-child { border-right: 0; }
.cell .tek { font-size: clamp(24px, 2.4vw, 36px); }
@media (max-aspect-ratio: 5/4) {
  .entity { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1.15fr) auto auto; grid-template-areas: "scene" "side" "chron"; }
  .side { display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: auto auto 1fr; }
  .side .title, .side > .note { grid-column: 1 / -1; }
  .sym { grid-row: 3; grid-column: 1 / -1; }
  .chron { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (max-width: 860px) { .side { order: -1; } .scene { min-height: 330px; } .chron { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .entity { display: flex; flex-direction: column; }
  .scene { min-height: 340px; }
  .side { display: flex; }
  .chron { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
