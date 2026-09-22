<script setup lang="ts">
// The orrery: every folder a planet round Kael'thos, as large as the hours
// given it, its activities its moons, a galaxy turning far behind.
import { computed, reactive } from 'vue';
import * as THREE from 'three';
import Frame from '../components/Frame.vue';
import Gl from '../components/Gl.vue';
import { galaxy, lights, planet, stars } from '../gl/models';
import { duration, state } from '../store';

defineProps<{ active: boolean }>();

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
const labels = reactive<{ name: string; x: number; y: number; show: boolean }[]>([]);

const build = ({ scene, group, camera }: { scene: THREE.Scene; group: THREE.Group; camera: THREE.PerspectiveCamera }) => {
  camera.position.set(0, 2.6, 6.2);
  camera.lookAt(0, -0.2, 0);
  // Kael'thos: a black star with a thin bright ring.
  group.add(new THREE.Mesh(new THREE.SphereGeometry(0.42, 40, 30), new THREE.MeshBasicMaterial({ color: 0x000000 })));
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.012, 6, 120), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  halo.rotation.x = Math.PI / 2; group.add(halo);
  const bodies = worlds.value.map((w, i) => {
    const orbit = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 128 }, (_, k) => new THREE.Vector3(Math.cos((k / 128) * Math.PI * 2) * w.orbit, 0, Math.sin((k / 128) * Math.PI * 2) * w.orbit))),
      new THREE.LineDashedMaterial({ color: 0x77716a, dashSize: 0.05, gapSize: 0.08 }));
    orbit.computeLineDistances(); group.add(orbit);
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
  lights(scene, 1.4, 0.8, 0.12);
  const v = new THREE.Vector3();
  let frame = 0;
  return (t: number) => {
    halo.rotation.z = t * 0.2;
    far.rotation.y = t * 0.01;
    for (const b of bodies) {
      const a = b.phase + t * b.speed;
      b.p.position.set(Math.cos(a) * b.w.orbit, 0, Math.sin(a) * b.w.orbit);
      b.p.rotation.y = t * 0.3;
      b.moons.forEach((m, k) => { const ma = t * (0.9 + k * 0.4) + k * 2; m.position.set(b.p.position.x + Math.cos(ma) * (b.w.size + 0.18 + k * 0.1), Math.sin(ma) * 0.05, b.p.position.z + Math.sin(ma) * (b.w.size + 0.18 + k * 0.1)); });
    }
    if (++frame % 3) return;
    // Names follow the planets across the glass.
    labels.splice(0, labels.length, ...bodies.map((b) => {
      b.p.getWorldPosition(v); v.y += b.w.size + 0.12; v.project(camera);
      const x = (v.x + 1) / 2, y = (1 - v.y) / 2;
      return { name: b.w.name, x, y, show: v.z < 1 && x > 0.03 && x < 0.97 && y > 0.05 && y < 0.97 };
    }));
  };
};
</script>

<template>
  <div class="orrery">
    <Frame class="sky" title="the paths in orbit // each folder as large as the hours it has had" flush>
      <Gl :build="build" :active="active" :options="{ drift: 0.0015, tilt: 0.05, distance: 6.2 }" label="Your folders as planets orbiting Kael'thos. Drag to turn." />
      <div class="labels" aria-hidden="true">
        <span v-for="l in labels" v-show="l.show" :key="l.name" :style="{ left: `${l.x * 100}%`, top: `${l.y * 100}%` }">{{ l.name.toLowerCase() }}</span>
      </div>
    </Frame>
    <div class="side">
      <h1 class="title">The Orrery</h1>
      <p class="note">He sits at the centre. Everything you study falls round him; the more you give a path, the heavier it grows.</p>
      <div v-for="w in [...worlds].sort((a, b) => b.minutes - a.minutes)" :key="w.name" class="world">
        <div class="wh"><span class="fell">{{ w.name[0] + w.name.slice(1).toLowerCase() }}</span><span class="tek">{{ duration(w.minutes) }}</span></div>
        <div class="moons"><span v-for="a in w.acts" :key="a.name" class="pix">{{ a.name }} {{ a.level }}</span></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.orrery { display: grid; gap: 18px; grid-template-columns: minmax(0, 1.8fr) minmax(280px, 1fr); }
.sky { min-height: 0; }
.labels { position: absolute; inset: 0; pointer-events: none; }
.labels span { position: absolute; transform: translate(-50%, -100%); font: 400 10px var(--pix); color: var(--hi); text-transform: uppercase; text-shadow: 0 0 4px #121212; }
.side { display: flex; flex-direction: column; gap: 12px; min-height: 0; overflow: auto; }
.world { border-bottom: 3px dotted var(--faint); padding-bottom: 8px; }
.wh { display: flex; justify-content: space-between; align-items: baseline; }
.wh .fell { font-size: 22px; color: var(--hi); }
.wh .tek { font-size: 20px; }
.moons { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 4px; }
@media (max-aspect-ratio: 5/4) { .orrery { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1.4fr) minmax(0, 1fr); } }
@media (max-width: 860px) { .orrery { display: flex; flex-direction: column; } .sky { min-height: 380px; } }
</style>
