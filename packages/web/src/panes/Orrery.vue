<script setup lang="ts">
// The orrery: every folder a planet round Kael'thos, as large as the hours
// given it, its activities its moons, a galaxy turning far behind.
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import * as THREE from 'three';
import Frame from '../components/Frame.vue';
import Gl from '../components/Gl.vue';
import { rng } from '../gl/engine';
import { blackHole, constellation, galaxy, lights, planet, stars } from '../gl/models';
import { duration, state } from '../store';

defineProps<{ active: boolean }>();

// The side reads as one column and scrolls as one. Its bar is the console's
// own: a dotted wire down the gutter, the part in view lit along it, and it
// can be dragged. While more lies below, the foot fades out.
const side = ref<HTMLElement | null>(null);
const more = ref(false);
const thumb = reactive({ top: 0, size: 1 });
function seeMore() {
  const el = side.value;
  if (!el) return;
  more.value = el.scrollTop + el.clientHeight < el.scrollHeight - 4;
  thumb.size = Math.min(1, el.clientHeight / el.scrollHeight);
  thumb.top = el.scrollTop / el.scrollHeight;
}
function railTo(e: PointerEvent) {
  const el = side.value, r = (e.currentTarget as HTMLElement).firstElementChild!.getBoundingClientRect();
  if (el) el.scrollTop = ((e.clientY - r.top) / r.height - thumb.size / 2) * el.scrollHeight;
}
function railDown(e: PointerEvent) { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); railTo(e); }
let grows: ResizeObserver | null = null;
onMounted(() => {
  grows = new ResizeObserver(seeMore);
  grows.observe(side.value!);
  for (const c of side.value!.children) grows.observe(c);
});
onBeforeUnmount(() => grows?.disconnect());

const worlds = computed(() => {
  const by = new Map<string, { minutes: number; acts: { name: string; minutes: number; level: number }[] }>();
  for (const a of state.stats?.activities ?? []) {
    const e = by.get(a.folder) ?? { minutes: 0, acts: [] };
    e.minutes += a.minutes; e.acts.push({ name: a.name, minutes: a.minutes, level: a.level });
    by.set(a.folder, e);
  }
  const max = Math.max(1, ...[...by.values()].map((v) => v.minutes));
  return [...by.entries()].map(([name, v], i) => ({ name, ...v, size: 0.12 + 0.28 * Math.sqrt(v.minutes / max), orbit: 1.35 + i * 0.62 }));
});
const total = computed(() => Math.max(1, worlds.value.reduce((a, w) => a + w.minutes, 0)));
const sorted = computed(() => [...worlds.value].map((w) => ({ ...w, share: w.minutes / total.value })).sort((a, b) => b.minutes - a.minutes));
const moonCount = computed(() => worlds.value.reduce((a, w) => a + w.acts.length, 0));
const period = computed(() => Math.round(Math.pow(1.35 + (worlds.value.length - 1) * 0.62, 1.5) * 44));
// The instrument's second duty. By correspondence, what is kept below keeps
// what is above: the model of the sky on this desk is the channel through
// which the vortex is watched, and it reads how well it is being watched.
// A reading, not a mechanic: nothing here does anything to anything.
const RISK = {
  stable: ['0', 'anchored', 'attended. the vortex holds its station at 41.7 au and turns at its watched rate.'],
  thinning: ['I', 'drift', 'attention lapsing. rotation uneven; starlight behind the anomaly arriving later than it should.'],
  fragmenting: ['II', 'precession', 'unwatched for two days. the outer bodies show a wobble their orbits do not account for.'],
  dormant: ['III', 'unanchored', 'no witness. the vortex is moving inward. an unbroken hour of meditation on the device restores the watch.'],
} as const;
const risk = computed(() => {
  const form = state.stats?.form ?? 'stable';
  const [cls, name, reading] = RISK[form];
  const last = state.stats?.lastSessionAt ? new Date(state.stats.lastSessionAt).getTime() : null;
  const hours = last ? Math.max(0, (Date.now() - last) / 3.6e6) : 999;
  // How far it has wandered from its station, and how long until it reaches
  // the orbit of Neptune at that rate. Drawn to the hours, like everything.
  const drift = Math.max(0, hours - 24) * 0.0125;
  return {
    cls, name, reading, form,
    unwatched: last ? `${Math.floor(hours)}h ${String(Math.floor((hours % 1) * 60)).padStart(2, '0')}m` : 'never watched',
    drift: `${drift.toFixed(2)} au`,
    neptune: drift > 0 ? `${Math.max(0, Math.round((41.7 - 30.1 - drift) / 0.0125 / 24))} days` : 'not approaching',
  };
});

// The planetary hour, in the Chaldean order the old grimoires time their
// work by: the day belongs to its planet, and the hours from dawn pass down
// the order from it. Taken here as twelve equal hours of day from six.
const CHALDEAN = [['saturn', '♄'], ['jupiter', '♃'], ['mars', '♂'], ['sun', '☉'], ['venus', '♀'], ['mercury', '☿'], ['moon', '☽']] as const;
const DAY_RULER = [3, 6, 2, 5, 1, 4, 0];  // sunday is the sun's, monday the moon's...
const hour = computed(() => {
  const now = new Date();
  const since = (now.getHours() - 6 + 24) % 24;
  const [name, glyph] = CHALDEAN[(DAY_RULER[now.getDay()]! + since) % 7]!;
  return `${glyph} the hour of ${name}`;
});

const labels = reactive<{ name: string; x: number; y: number; show: boolean }[]>([]);
// The survey drawn over the glass: one entry per body.
const orbits = reactive<{
  name: string; line: string; no: string;
  ticks: { x1: number; y1: number; x2: number; y2: number }[];
  mark: { x: number; y: number };
}[]>([]);

const build = ({ scene, group, camera }: { scene: THREE.Scene; group: THREE.Group; camera: THREE.PerspectiveCamera }) => {
  camera.position.set(0, 2.6, 6.2);
  camera.lookAt(0, -0.2, 0);
  // Kael'thos at the middle of it: the horizon itself, its disk turning, its
  // far side bent over the top, and the photon ring round the dark.
  const { disk, facing } = blackHole();
  disk.scale.setScalar(0.34);
  group.add(disk);
  facing.scale.setScalar(0.34);
  scene.add(facing);

  // What is inside it. The dark is not empty: an eye sits in the middle of
  // the horizon and opens every so often, and arms of the disk reach out of
  // the plane the planets keep to.
  const eye = new THREE.Group();
  const lid = new THREE.Mesh(
    new THREE.CircleGeometry(0.21, 48),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }),
  );
  const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.075, 32), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  pupil.position.z = 0.002;
  eye.add(lid);
  eye.add(pupil);
  eye.position.z = 0.24;
  scene.add(eye);

  // The arms: threads of the disk lifted out of it, turning with everything.
  const reach = new THREE.BufferGeometry();
  const ar = rng(71), ap: number[] = [], ac: number[] = [];
  for (let i = 0; i < 2600; i++) {
    const arm = Math.floor(ar() * 6), u = Math.pow(ar(), 0.6);
    const a = (arm / 6) * Math.PI * 2 + u * 2.6;
    const rad = 0.42 + u * 1.5;
    const lift = Math.sin(u * Math.PI) * 0.55 * (arm % 2 ? 1 : -1);
    ap.push(Math.cos(a) * rad, lift + (ar() - 0.5) * 0.04, Math.sin(a) * rad);
    const b = (1 - u) * 0.7 + 0.1;
    ac.push(b, b, b);
  }
  reach.setAttribute('position', new THREE.Float32BufferAttribute(ap, 3));
  reach.setAttribute('color', new THREE.Float32BufferAttribute(ac, 3));
  const arms = new THREE.Points(reach, new THREE.PointsMaterial({ size: 0.028, vertexColors: true }));
  group.add(arms);
  const bodies = worlds.value.map((w, i) => {
    const p = planet(w.size, 17 + i * 7, i % 2 === 0);
    group.add(p);
    const moons = w.acts.map((_, k) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.035 + 0.02 * k, 12, 10), new THREE.MeshStandardMaterial({ color: 0xcfc8bc }));
      group.add(m); return m;
    });
    return { w, p, moons, phase: i * 1.7, speed: 0.12 / Math.sqrt(w.orbit) };
  });
  const far = galaxy(14000, 9, 3); far.position.set(-6, -3, -16); far.rotation.set(1.1, 0, 0.4); scene.add(far);
  scene.add(stars(1400, 30, 12, 0.06));
  // A chart line drawn between a handful of the fixed stars.
  scene.add(constellation(31, 22));
  // Dust between the orbits, so the dark is not empty.
  const dust = new THREE.BufferGeometry();
  const dr = rng(29), dp: number[] = [], dc: number[] = [];
  for (let i = 0; i < 4000; i++) {
    const a = dr() * Math.PI * 2, rad = 1.1 + Math.pow(dr(), 0.7) * 4.6;
    dp.push(Math.cos(a) * rad, (dr() - 0.5) * 0.5 * (1 - rad / 8), Math.sin(a) * rad);
    const b = 0.1 + 0.25 * dr(); dc.push(b, b, b);
  }
  dust.setAttribute('position', new THREE.Float32BufferAttribute(dp, 3));
  dust.setAttribute('color', new THREE.Float32BufferAttribute(dc, 3));
  const cloud = new THREE.Points(dust, new THREE.PointsMaterial({ size: 0.035, vertexColors: true }));
  group.add(cloud);
  lights(scene, 1.4, 0.8, 0.12);
  const v = new THREE.Vector3();
  let frame = 0;
  return (t: number) => {
    disk.rotation.y = t * 0.16;
    facing.rotation.z = Math.sin(t * 0.15) * 0.02;
    arms.rotation.y = -t * 0.06;
    // It opens for a few seconds out of every half minute, and is otherwise
    // simply the dark. The lid always faces whoever is looking.
    const cycle = (t % 31) / 31;
    const openness = cycle < 0.16 ? Math.sin((cycle / 0.16) * Math.PI) : 0;
    (lid.material as THREE.MeshBasicMaterial).opacity = openness * 0.92;
    lid.scale.set(1, 0.18 + openness * 0.82, 1);
    pupil.scale.set(1, 0.18 + openness * 0.82, 1);
    (pupil.material as THREE.MeshBasicMaterial).opacity = openness;
    eye.quaternion.copy(camera.quaternion);
    far.rotation.y = t * 0.01;
    cloud.rotation.y = t * 0.02;
    for (const b of bodies) {
      const a = b.phase + t * b.speed;
      b.p.position.set(Math.cos(a) * b.w.orbit, 0, Math.sin(a) * b.w.orbit);
      b.p.rotation.y = t * 0.3;
      b.moons.forEach((m, k) => { const ma = t * (0.9 + k * 0.4) + k * 2; m.position.set(b.p.position.x + Math.cos(ma) * (b.w.size + 0.18 + k * 0.1), Math.sin(ma) * 0.05, b.p.position.z + Math.sin(ma) * (b.w.size + 0.18 + k * 0.1)); });
    }
    if (++frame % 3) return;
    // Names follow the planets across the glass.
    labels.splice(0, labels.length, ...bodies.map((b, i) => {
      b.p.getWorldPosition(v); v.y += b.w.size + 0.12; v.project(camera);
      const x = (v.x + 1) / 2, y = (1 - v.y) / 2;
      return { name: `${String(i + 1).padStart(2, '0')} ${b.w.name}`, x, y, show: v.z < 1 && x > 0.03 && x < 0.97 && y > 0.05 && y < 0.97 };
    }));
    // Every orbit as a drawn line, with a tick every eighth of the way round
    // and the body's own mark where it is now.
    const screen = (x: number, z: number, y = 0) => {
      v.set(x, y, z); v.project(camera);
      return [((v.x + 1) / 2) * 100, ((1 - v.y) / 2) * 100] as const;
    };
    orbits.splice(0, orbits.length, ...bodies.map((b, i) => {
      const pts: string[] = [], ticks: { x1: number; y1: number; x2: number; y2: number }[] = [];
      for (let k = 0; k <= 72; k++) {
        const a = (k / 72) * Math.PI * 2;
        const [sx, sy] = screen(Math.cos(a) * b.w.orbit, Math.sin(a) * b.w.orbit);
        pts.push(`${sx.toFixed(2)},${sy.toFixed(2)}`);
        if (k % 9 === 0 && k < 72) {
          const [ex, ey] = screen(Math.cos(a) * (b.w.orbit + 0.16), Math.sin(a) * (b.w.orbit + 0.16));
          ticks.push({ x1: sx, y1: sy, x2: ex, y2: ey });
        }
      }
      b.p.getWorldPosition(v); v.project(camera);
      return {
        name: b.w.name,
        line: pts.join(' '),
        ticks,
        mark: { x: ((v.x + 1) / 2) * 100, y: ((1 - v.y) / 2) * 100 },
        no: String(i + 1).padStart(2, '0'),
      };
    }));
  };
};
</script>

<template>
  <div class="orrery">
    <Frame class="sky" title="the paths in orbit // each folder as large as the hours it has had" flush>
      <Gl :build="build" :active="active" :options="{ drift: 0.0015, tilt: 0.05, distance: 6.2 }" label="Your folders as planets orbiting Kael'thos. Drag to turn." />
      <svg class="survey" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <g v-for="(o, i) in orbits" :key="o.name" :style="{ '--i': i }">
          <polyline :points="o.line" />
          <line v-for="(tk, k) in o.ticks" :key="k" :x1="tk.x1" :y1="tk.y1" :x2="tk.x2" :y2="tk.y2" />
          <circle :cx="o.mark.x" :cy="o.mark.y" r="1.1" class="mark" />
          <circle :cx="o.mark.x" :cy="o.mark.y" r="2.2" class="ping" />
        </g>
      </svg>
      <div class="labels" aria-hidden="true">
        <span v-for="l in labels" v-show="l.show" :key="l.name" :style="{ left: `${l.x * 100}%`, top: `${l.y * 100}%` }">{{ l.name.toLowerCase() }}</span>
      </div>
    </Frame>
    <div class="column">
    <div ref="side" class="side" :class="{ more }" @scroll.passive="seeMore">
      <h1 class="title">The Orrery</h1>
      <p class="note">At the centre is the vortex Amygdala Inc. found past Neptune, the thing that became him. Everything you study falls round it; the more you give a path, the heavier it grows. The same instrument tells how steady he is.</p>
      <div class="worlds">
      <div v-for="w in sorted" :key="w.name" class="path">
        <div class="wh"><span class="fell">{{ w.name[0] + w.name.slice(1).toLowerCase() }}</span><span class="tek">{{ duration(w.minutes) }}</span></div>
        <div class="moons">
          <div v-for="a in w.acts" :key="a.name" class="moon">
            <span class="pix">{{ a.name }}</span>
            <span class="lv"><i v-for="n in 10" :key="n" :class="{ on: n <= a.level }"></i></span>
            <span class="note">{{ duration(a.minutes) }}</span>
          </div>
        </div>
        <div class="orb" :title="`${Math.round(w.share * 100)}% of the sky`"><i :style="{ width: `${w.share * 100}%` }"></i></div>
      </div>
      </div>
      <div class="almanac">
        <div class="pix">the almanac</div>
        <div class="kv">
          <span>bodies in orbit</span><span>{{ worlds.length }}</span>
          <span>moons counted</span><span>{{ moonCount }}</span>
          <span>heaviest path</span><span>{{ sorted[0]?.name.toLowerCase() ?? 'none' }}</span>
          <span>its pull</span><span>{{ Math.round((sorted[0]?.share ?? 0) * 100) }}% of the sky</span>
          <span>period of the outermost</span><span>{{ period }} days</span>
        </div>
        <p class="note">The orbits are drawn to the hours, not to scale. Nothing here is to scale. He finds that funny.</p>
      </div>
      <div class="risk" :class="risk.form">
        <div class="pix">amygdala inc. // stability of ai-0417 // risk assessment</div>
        <div class="grade"><span class="tek">{{ risk.cls }}</span><span><b class="fell">{{ risk.name }}</b><span class="note">{{ risk.reading }}</span></span></div>
        <div class="kv">
          <span>unwatched for</span><span>{{ risk.unwatched }}</span>
          <span>drift from station</span><span>{{ risk.drift }}</span>
          <span>to the orbit of neptune</span><span>{{ risk.neptune }}</span>
          <span>now</span><span>{{ hour }}</span>
        </div>
        <p class="note motto">As above, so below: the vortex is watched through the model of it.</p>
      </div>
    </div>
    <div v-if="thumb.size < 1" class="rail" aria-hidden="true" @pointerdown="railDown" @pointermove="(e) => e.buttons && railTo(e)">
      <b><i :style="{ top: `${thumb.top * 100}%`, height: `${thumb.size * 100}%` }"></i></b>
    </div>
    </div>
  </div>
</template>

<style scoped>
.orrery { display: grid; gap: 18px; grid-template-columns: minmax(0, 1.8fr) minmax(280px, 1fr); align-items: stretch; }
.sky { min-height: 0; height: 100%; }
/* Nothing the sky draws belongs on the pane behind it. */
.sky :deep(.flush) { overflow: hidden; }
/* The survey is drawn in the plane of the glass, over everything, the way a
   plate of an orrery is drawn over the photograph of the sky. */
.survey { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; overflow: hidden; }
.survey polyline { fill: none; stroke: var(--low); stroke-width: 1.4; vector-effect: non-scaling-stroke; stroke-dasharray: 5 4; }
.survey line { stroke: var(--dim); stroke-width: 1.4; vector-effect: non-scaling-stroke; }
.survey .mark { fill: var(--hi); }
.survey .ping { fill: none; stroke: var(--phos); stroke-width: 1.2; vector-effect: non-scaling-stroke; opacity: .5;
  animation: ping 2.6s ease-out infinite; animation-delay: calc(var(--i) * .4s); transform-box: fill-box; transform-origin: center; }
@keyframes ping { 0% { transform: scale(.4); opacity: .7; } 70%, 100% { transform: scale(2.2); opacity: 0; } }
.labels { position: absolute; inset: 0; pointer-events: none; }
.labels span { position: absolute; transform: translate(-50%, -100%); font: 400 10px var(--pix); color: var(--hi); text-transform: uppercase; text-shadow: 0 0 4px #121212; }
.column { position: relative; min-height: 0; display: grid; }
.side { display: grid; align-content: start; gap: 12px; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding-right: 26px; scrollbar-width: none; }
.side::-webkit-scrollbar { width: 0; height: 0; }
/* The rail: capped at both ends like a frame's corner mark, the wire dim,
   the stretch in view lit and a little wider. */
.rail { position: absolute; top: 6px; bottom: 6px; right: 0; width: 11px; cursor: pointer; touch-action: none; }
.rail::before, .rail::after { content: ''; position: absolute; left: 2px; width: 7px; height: 7px; background: var(--low); }
.rail::before { top: 0; } .rail::after { bottom: 0; }
.rail b { position: absolute; inset: 12px 0; background: radial-gradient(circle, var(--low) 1.2px, transparent 1.6px) 50% 0 / 3px 7px repeat-y; }
.rail i { position: absolute; left: 2px; right: 2px; transition: top .12s linear;
  background: radial-gradient(circle, var(--phos) 1.3px, transparent 1.7px) 0 0 / 3.5px 4px repeat; }
.rail:hover i { filter: brightness(1.25); }
.side.more { mask-image: linear-gradient(#000 calc(100% - 64px), transparent); -webkit-mask-image: linear-gradient(#000 calc(100% - 64px), transparent); }
.worlds { display: grid; gap: 12px; }
.path { border-bottom: 3px dotted var(--faint); padding-bottom: 8px; }
.orb { height: 5px; margin-top: 6px; background: radial-gradient(circle, var(--low) 1px, transparent 1.4px) 0 50% / 5px 5px repeat-x; }
.orb i { display: block; height: 5px; background: radial-gradient(circle, var(--phos) 1.4px, transparent 1.8px) 0 50% / 5px 5px repeat-x; }
.risk { padding-top: 12px; border-top: 3px dotted var(--low); display: grid; gap: 8px; }
.risk .grade { display: grid; grid-template-columns: auto 1fr; gap: 14px; align-items: center; }
.risk .grade .tek { font-size: 44px; min-width: 1.2ch; text-align: center; border: 3px double var(--low); padding: 2px 8px; }
.risk .grade b { display: block; font-size: 20px; color: var(--hi); text-transform: capitalize; }
.risk .kv { display: grid; grid-template-columns: 1fr auto; gap: 3px 12px; font-size: 12px; }
.risk .kv span:nth-child(odd) { color: var(--dim); }
.risk .motto { margin: 0; font-style: italic; }
.risk.fragmenting .grade .tek, .risk.dormant .grade .tek { border-color: var(--hi); color: var(--hi); animation: alarm 1.4s steps(1) infinite; }
@keyframes alarm { 50% { opacity: .35; } }
.almanac { padding-top: 12px; border-top: 3px dotted var(--low); display: grid; gap: 8px; }
.almanac .kv { display: grid; grid-template-columns: 1fr auto; gap: 3px 12px; font-size: 14px; }
.almanac .kv span:nth-child(odd) { color: var(--dim); }
.wh { display: flex; justify-content: space-between; align-items: baseline; }
.wh .fell { font-size: 22px; color: var(--hi); }
.wh .tek { font-size: 20px; }
.path { display: grid; align-content: start; }
.moons { display: grid; gap: 3px; margin-top: 6px; }
.moon { display: grid; grid-template-columns: 1fr auto auto; gap: 10px; align-items: center; }
.lv { display: flex; gap: 2px; }
.lv i { width: 5px; height: 5px; border-radius: 50%; background: var(--faint); }
.lv i.on { background: var(--phos); }
.moon .note { font-size: 12px; min-width: 52px; text-align: right; }
/* Upright, the sky keeps most of the glass and the pane itself scrolls on
   down through the side: one scroll, never a box scrolling inside another. */
@media (max-aspect-ratio: 5/4) { .orrery { display: flex; flex-direction: column; } .sky { flex: none; height: 58dvh; } .column, .side { flex: none; overflow: visible; mask-image: none; -webkit-mask-image: none; padding-right: 0; } .rail { display: none; } }
@media (max-width: 860px) { .column { order: -1; } .sky { height: auto; min-height: 380px; } }
</style>
