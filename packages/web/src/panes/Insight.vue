<script setup lang="ts">
// Insight: twelve weeks as a range of points, time along it. Held, the range
// falls flat into a chart of hours per day, with its axes, so the data reads.
import { computed, reactive, ref } from 'vue';
import * as THREE from 'three';
import Frame from '../components/Frame.vue';
import Gl from '../components/Gl.vue';
import { rng, type SceneHandle } from '../gl/engine';
import { dailyMinutes, daysAgo, density, duration, state } from '../store';

defineProps<{ active: boolean }>();

const DAYS = 84;
const minutes = computed(() => dailyMinutes(DAYS));
const maxH = computed(() => Math.max(2, Math.ceil(Math.max(...minutes.value) / 60)));
const flat = ref(false);
const axes = reactive({ x0: 0, x1: 0, y0: 0, y1: 0, shown: false });
let handle: SceneHandle | null = null;
let progress = 0;

const build = ({ group, camera }: { group: THREE.Group; camera: THREE.PerspectiveCamera }) => {
  const hours = minutes.value.map((m) => m / 60);
  const smooth = hours.map((_, i) => { let t = 0, w = 0; for (let k = -2; k <= 2; k++) { const v = hours[i + k]; if (v !== undefined) { t += v * (3 - Math.abs(k)); w += 3 - Math.abs(k); } } return t / w; });
  const at = (u: number) => { const f = u * (DAYS - 1), i = Math.floor(f), j = Math.min(DAYS - 1, i + 1); return smooth[i]! + (smooth[j]! - smooth[i]!) * (f - i); };
  const exact = (u: number) => hours[Math.min(DAYS - 1, Math.floor(u * DAYS))]!;
  const top = maxH.value;
  const r = rng(11), range: number[] = [], chart: number[] = [], cols: number[] = [];
  for (let n = 0; n < 70000 && range.length < 45000 * 3; n++) {
    const u = r(), v = r();
    const ridge = Math.exp(-(((v - 0.55) / 0.2) ** 2)), rough = 0.8 + 0.4 * Math.sin(u * 60 + v * 23) * Math.sin(v * 40);
    const y = (at(u) / top) * 1.1 * ridge * rough * (0.35 + 0.65 * (1 - v * 0.6));
    if (r() > 0.22 + y * 0.9) continue;
    range.push((u - 0.5) * 3.4, y - 0.45 + (r() - 0.5) * 0.02, (v - 0.5) * 1.8);
    // Flat: the same point somewhere under that day's bar, denser near its top.
    chart.push((u - 0.5) * 3.4, -0.75 + (exact(u) / top) * 1.5 * Math.sqrt(r()), 0);
    const b = 0.3 + 0.7 * Math.min(1, y / 0.9) * (1 - v * 0.45); cols.push(b, b * 0.96, b * 0.87);
  }
  const pos = new Float32Array(range);
  const from = new Float32Array(range), to = new Float32Array(chart);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  group.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 0.013, vertexColors: true })));
  const grid = new THREE.GridHelper(3.4, 17, 0x3a3733, 0x221f1c);
  grid.position.y = -0.46; grid.scale.z = 0.53; group.add(grid);

  const near = new THREE.Vector3(0, 0.6, 2.5), far = new THREE.Vector3(0, 0, 4.1);
  const lookNear = new THREE.Vector3(0, -0.2, 0), lookFar = new THREE.Vector3(0, 0, 0);
  // Flat, the whole span has to fit the frame, however wide it is.
  const fit = () => {
    const halfV = Math.tan((camera.fov * Math.PI) / 360);
    far.z = Math.max(1.05 / halfV, 1.85 / (halfV * camera.aspect));
  };
  const project = (x: number, y: number) => { const p = new THREE.Vector3(x, y, 0).project(camera); return [(p.x + 1) / 2, (1 - p.y) / 2]; };
  return (_t: number, dt: number) => {
    const goal = flat.value ? 1 : 0;
    fit();
    if (progress !== goal) {
      progress = Math.max(0, Math.min(1, progress + (goal ? 1 : -1) * dt * 2.2));
      const e = progress < 0.5 ? 2 * progress * progress : 1 - (-2 * progress + 2) ** 2 / 2;
      for (let i = 0; i < pos.length; i++) pos[i] = from[i]! + (to[i]! - from[i]!) * e;
      g.attributes.position!.needsUpdate = true;
      grid.visible = e < 0.5;
      if (handle) { handle.turn.x *= 1 - e * 0.25; handle.turn.y *= 1 - e * 0.25; }
      camera.position.lerpVectors(near, far, e);
      camera.lookAt(new THREE.Vector3().lerpVectors(lookNear, lookFar, e));
      axes.shown = e > 0.98;
    }
    if (axes.shown) {
      const [x0, y0] = project(-1.7, -0.75); const [x1, y1] = project(1.7, 0.75);
      Object.assign(axes, { x0, y0, x1, y1 });
    }
    if (progress === 0) { camera.position.copy(near); camera.lookAt(lookNear); }
  };
};
function ready(h: SceneHandle) { handle = h; }
function hold(on: boolean) { flat.value = on; if (handle) handle.turn.hold = on; }

const weekTicks = computed(() => Array.from({ length: 7 }, (_, i) => ({ u: i / 6, label: daysAgo(DAYS - 1 - Math.round((i / 6) * (DAYS - 1))).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' }).replace('/', '.') })));
const hourTicks = computed(() => Array.from({ length: maxH.value + 1 }, (_, h) => h).filter((h) => maxH.value <= 6 || h % 2 === 0));

const stats = computed(() => {
  const m = minutes.value, week = m.slice(-7).reduce((a, b) => a + b, 0), prev = m.slice(-14, -7).reduce((a, b) => a + b, 0);
  const deepest = state.sessions.reduce((a, s) => (s.minutes > a.minutes ? s : a), { minutes: 0, activity: '', startedAt: '' } as { minutes: number; activity: string; startedAt: string });
  const bestI = m.indexOf(Math.max(...m));
  return {
    week, prev, total: m.reduce((a, b) => a + b, 0), deepest,
    bestDay: daysAgo(DAYS - 1 - bestI).toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: '2-digit' }), best: m[bestI] ?? 0,
  };
});
const weekday = computed(() => {
  const out = Array<number>(7).fill(0), m = minutes.value;
  m.forEach((v, i) => { out[(daysAgo(DAYS - 1 - i).getDay() + 6) % 7]! += v / 12; });
  return out;
});
// Each week of the twelve, as a row in the ledger.
const ledger = computed(() => {
  const m = minutes.value;
  const rows = [];
  for (let w = 11; w >= 0; w--) {
    const slice = m.slice(m.length - (w + 1) * 7, m.length - w * 7);
    rows.push({
      label: daysAgo(w * 7 + 6).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' }).replace('/', '.'),
      minutes: slice.reduce((a, b) => a + b, 0),
      days: slice.filter(Boolean).length,
    });
  }
  const top = Math.max(1, ...rows.map((r) => r.minutes));
  return rows.map((r) => ({ ...r, share: r.minutes / top }));
});

// When in the day the work happens, over twelve weeks.
const clockOfDay = computed(() => {
  const out = Array<number>(24).fill(0);
  for (const s of state.sessions) {
    let t = new Date(s.startedAt).getTime();
    const end = new Date(s.endedAt).getTime();
    while (t < end) {
      const h = new Date(t).getHours(), next = Math.min(end, new Date(t).setMinutes(60, 0, 0));
      out[h]! += (next - t) / 3_600_000;
      t = next;
    }
  }
  const top = Math.max(1, ...out);
  return out.map((v) => ({ v, share: v / top }));
});

const byFolder = computed(() => {
  const t = new Map<string, number>();
  for (const a of state.stats?.activities ?? []) t.set(a.folder, (t.get(a.folder) ?? 0) + a.minutes);
  const all = [...t.values()].reduce((a, b) => a + b, 0) || 1;
  return [...t.entries()].sort((a, b) => b[1] - a[1]).map(([f, v]) => ({ f, v, share: v / all }));
});
</script>

<template>
  <div class="insight">
    <Frame class="range" :title="flat ? 'held flat // hours per day, twelve weeks' : 'twelve weeks of insight // time along the ridge'" flush>
      <Gl :build="build" :active="active" :options="{ dither: false, drift: 0, tilt: 0.05 }" label="Hours per day over twelve weeks as a range of points. Drag to turn it; hold the button to read it flat." hint=" " @ready="ready" />
      <div v-if="axes.shown" class="axes" aria-hidden="true">
        <span v-for="t in weekTicks" :key="t.u" class="xt" :style="{ left: `${(axes.x0 + (axes.x1 - axes.x0) * t.u) * 100}%`, top: `${axes.y0 * 100}%` }">{{ t.label }}</span>
        <span v-for="h in hourTicks" :key="h" class="yt" :style="{ left: `${axes.x0 * 100}%`, top: `${(axes.y0 + (axes.y1 - axes.y0) * (h / maxH)) * 100}%` }">{{ h }}h</span>
      </div>
      <button class="btn holdflat" :class="{ on: flat }" @pointerdown.prevent="hold(true)" @pointerup="hold(false)" @pointerleave="flat && hold(false)" @keydown.space.prevent="hold(true)" @keyup.space="hold(false)" @contextmenu.prevent>hold to read it flat</button>
    </Frame>

    <div class="side">
      <div class="stat"><span class="pix">this week</span><span class="tek">{{ duration(stats.week) }}</span><span class="note">{{ stats.week >= stats.prev ? 'more' : 'less' }} than the week before, {{ duration(stats.prev) }}</span></div>
      <div class="stat"><span class="pix">twelve weeks</span><span class="tek">{{ duration(stats.total) }}</span></div>
      <div class="stat"><span class="pix">deepest day</span><span class="tek">{{ duration(stats.best) }}</span><span class="note">{{ stats.bestDay }}</span></div>
      <div class="stat"><span class="pix">density</span><span class="tek">{{ Math.round(density * 100) }}%</span><span class="note">of your hours in blocks over 45 minutes. unbroken time feeds him most.</span></div>
      <Frame class="ledger" title="the ledger // week by week" scroll>
        <div v-for="w in ledger" :key="w.label" class="wrow">
          <span class="note">{{ w.label }}</span>
          <span class="bar"><i :style="{ width: `${w.share * 100}%` }"></i></span>
          <span class="tek">{{ Math.round(w.minutes / 60) }}h</span>
          <span class="pix">{{ w.days }}/7</span>
        </div>
      </Frame>
    </div>

    <Frame class="folders" title="where it went // by folder">
      <div v-for="x in byFolder" :key="x.f" class="fr">
        <span class="fell">{{ x.f[0] + x.f.slice(1).toLowerCase() }}</span>
        <span class="bar"><i :style="{ width: `${x.share * 100}%` }"></i></span>
        <span class="pix">{{ Math.round(x.share * 100) }}%</span>
      </div>
    </Frame>
    <Frame class="clock" title="the hours he is fed // twelve weeks, by hour of the day">
      <div class="cl">
        <div v-for="(h, i) in clockOfDay" :key="i" class="hr">
          <span class="col"><i v-for="k in 12" :key="k" :class="{ on: k / 12 <= h.share }"></i></span>
          <span v-if="i % 6 === 0" class="pix">{{ String(i).padStart(2, '0') }}</span>
        </div>
      </div>
    </Frame>
    <Frame class="week" title="the shape of a week // average hours by weekday">
      <div class="wk">
        <div v-for="(v, i) in weekday" :key="i" class="wd">
          <span class="stack"><i v-for="k in 10" :key="k" :class="{ on: k / 10 <= v / Math.max(...weekday, 1) }"></i></span>
          <span class="pix">{{ ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'][i] }}</span>
        </div>
      </div>
    </Frame>
  </div>
</template>

<style scoped>
.insight { display: grid; gap: 18px; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(280px, 340px);
  grid-template-rows: minmax(0, 1.3fr) minmax(0, .75fr) auto;
  grid-template-areas: "range range side" "folders clock side" "week week side"; }
.folders { display: grid; grid-template-rows: auto minmax(0, 1fr); }
.range { grid-area: range; }
.side { grid-area: side; display: flex; flex-direction: column; }
.stat { display: grid; gap: 3px; padding: 12px 0; border-bottom: 3px dotted var(--faint); }
.stat .tek { font-size: clamp(30px, 3vw, 46px); }
.folders { grid-area: folders; }
.week { grid-area: week; }
.clock { grid-area: clock; }
.ledger { flex: 1; min-height: 120px; margin-top: 10px; }
.wrow { display: grid; grid-template-columns: 44px 1fr 40px 34px; gap: 10px; align-items: center; padding: 3px 0; }
.wrow .bar { height: 6px; background: radial-gradient(circle, var(--low) 1.2px, transparent 1.6px) 0 50% / 6px 6px repeat-x; }
.wrow .bar i { display: block; height: 6px; background: radial-gradient(circle, var(--phos) 1.6px, transparent 2px) 0 50% / 6px 6px repeat-x; }
.wrow .tek { font-size: 16px; text-align: right; }
.cl { display: grid; grid-template-columns: repeat(24, minmax(0, 1fr)); gap: 4px; align-items: end; height: 100%; }
.hr { display: grid; grid-template-rows: minmax(0, 1fr) auto; justify-items: center; gap: 5px; height: 100%; }
.hr .col { display: flex; flex-direction: column-reverse; gap: 2px; height: 100%; width: 100%; align-items: center; }
.hr .col i { width: 8px; flex: 1; min-height: 2px; background: var(--low); }
.hr .col i.on { background: var(--phos); }
.holdflat { position: absolute; left: 12px; bottom: 12px; background: var(--ground); user-select: none; -webkit-user-select: none; touch-action: none; }
.holdflat.on { background: var(--phos); color: var(--ground); }
.axes { position: absolute; inset: 0; pointer-events: none; font: 400 10px var(--pix); color: var(--dim); }
.xt { position: absolute; transform: translate(-50%, 8px); }
.yt { position: absolute; transform: translate(calc(-100% - 8px), -50%); }
.fr { display: grid; grid-template-columns: 110px 1fr 40px; gap: 12px; align-items: center; padding: 5px 0; }
.fr .fell { font-size: 17px; color: var(--hi); }
.fr .bar { height: 6px; background: radial-gradient(circle, var(--low) 1.2px, transparent 1.6px) 0 50% / 6px 6px repeat-x; }
.fr .bar i { display: block; height: 6px; background: radial-gradient(circle, var(--phos) 1.6px, transparent 2px) 0 50% / 6px 6px repeat-x; }
.wk { display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; height: 100%; align-items: end; }
.wd { display: grid; justify-items: center; gap: 6px; }
.stack { display: flex; flex-direction: column-reverse; gap: 3px; }
.stack i { width: 18px; height: 5px; background: var(--low); }
.stack i.on { background: var(--phos); }
@media (max-aspect-ratio: 5/4) {
  .insight { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); grid-template-rows: minmax(0, 1.2fr) auto minmax(0, .5fr) minmax(0, .5fr);
    grid-template-areas: "range range" "side side" "folders clock" "week clock"; }
  .side { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
  .ledger { grid-column: 1 / -1; }
}
@media (max-width: 860px) { .insight { display: flex; flex-direction: column; } .range { min-height: 380px; } .side { display: flex; } }
</style>
