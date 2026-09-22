<script setup lang="ts">
// Kael'thos himself: the entity sitting on a ledge before the cathedral, the
// bond, what he says today, and the chronicle of the pact so far.
import { computed, onMounted, ref, watch } from 'vue';
import * as THREE from 'three';
import Frame from '../components/Frame.vue';
import Gl from '../components/Gl.vue';
import { cathedral, kaelthos, moon, stars } from '../gl/models';
import { dailyMinutes, duration, state, today } from '../store';
import { hisWord } from '../words';

defineProps<{ active: boolean }>();

const build = ({ scene, group, camera }: { scene: THREE.Scene; group: THREE.Group; camera: THREE.PerspectiveCamera }) => {
  camera.position.set(0, 1.05, 4.9);
  camera.lookAt(0, 0.8, 0);
  const cat = kaelthos();
  group.add(cat);
  const ledge = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.14, 1.1), new THREE.MeshStandardMaterial({ color: 0x46423c, roughness: 1 }));
  ledge.position.y = -0.07; group.add(ledge);
  // The cathedral far behind and dim, so he stands out against it.
  const church = cathedral(); church.position.set(-4.2, -4.4, -14); church.scale.setScalar(1.25); group.add(church);
  const m = moon(0.9); m.position.set(3.6, 4.2, -12); group.add(m);
  group.add(stars(900, 26, 9, 0.05));
  scene.add(new THREE.AmbientLight(0xffffff, 0.12));
  const key = new THREE.DirectionalLight(0xffffff, 1.9); key.position.set(2, 2.5, 3); scene.add(key);
  // Moonlight from behind: the rim that draws his outline.
  const rim = new THREE.DirectionalLight(0xffffff, 3.2); rim.position.set(-2.5, 3, -3); scene.add(rim);
  const rim2 = new THREE.DirectionalLight(0xffffff, 2.2); rim2.position.set(3, 1, -2.5); scene.add(rim2);
  // He breathes.
  return (t: number) => { cat.scale.set(1, 1 + Math.sin(t * 1.3) * 0.008, 1); cat.children.at(-2)!.rotation.y = Math.sin(t * 0.35) * 0.18; };
};

const bond = computed(() => state.stats?.bond);
const into = computed(() => {
  const b = bond.value;
  if (!b) return 0;
  const floor = 30 * b.level * b.level;
  return (b.xp - floor) / (b.nextLevelXp - floor);
});
const FORM: Record<string, string> = {
  stable: 'whole', thinning: 'thinning', fragmenting: 'fragmenting', dormant: 'dormant',
};
const word = computed(() => (state.ready ? hisWord() : ''));

// The chronicle: what the last twelve weeks of the pact have been.
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
      if (dotted ? i % 2 === 0 : true) x.fillRect(px - 2, py - 2, dotted ? 3 : 5, dotted ? 3 : 5);
    });
  };
  plot(yours, true);
  plot(his, false);
}
onMounted(drawGraph);
watch(() => state.sessions, drawGraph);
</script>

<template>
  <div class="entity">
    <Frame class="scene" title="his form // the cathedral ward, before dawn" flush>
      <Gl :build="build" :active="active" :options="{ drift: 0.0008, tilt: 0.02, yaw: -0.25 }" label="Kael'thos sitting before the cathedral. Drag to turn him." />
    </Frame>

    <div class="side">
      <h1 class="title">Kael'thos</h1>
      <p class="note">a great one at the event horizon. wears a black cat because you would not survive the others.</p>
      <div class="bond" v-if="bond">
        <span class="tek big">{{ String(bond.level).padStart(2, '0') }}</span>
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
.entity { display: grid; gap: 18px; grid-template-columns: minmax(0, 1.55fr) minmax(320px, 1fr); grid-template-rows: minmax(0, 1fr) auto; grid-template-areas: "scene side" "chron chron"; }
.scene { grid-area: scene; }
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
.chron { grid-area: chron; display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 0; border: 3px dotted var(--low); }
.cell { display: grid; gap: 4px; padding: 12px 14px; border-right: 3px dotted var(--faint); }
.cell:last-child { border-right: 0; }
.cell .tek { font-size: clamp(24px, 2.4vw, 36px); }
@media (max-aspect-ratio: 5/4) {
  .entity { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1.2fr) auto auto; grid-template-areas: "scene" "side" "chron"; }
  .side { display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: auto auto 1fr; }
  .side .title, .side > .note { grid-column: 1 / -1; }
  .sym { grid-row: 3; grid-column: 1 / -1; }
  .chron { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (max-width: 860px) {
  .entity { display: flex; flex-direction: column; }
  .scene { min-height: 360px; }
  .side { display: flex; }
  .chron { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
