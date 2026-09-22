<script setup lang="ts">
import * as THREE from 'three';
import Gl from '../components/Gl.vue';
import Sealed from '../components/Sealed.vue';
import { lights } from '../gl/models';

defineProps<{ active: boolean }>();
// A loaded barbell, turning slowly: iron for the body he borrows.
const build = ({ scene, group }: { scene: THREE.Scene; group: THREE.Group }) => {
  const steel = new THREE.MeshStandardMaterial({ color: 0x9a948a, roughness: 0.35, metalness: 0.6 });
  const iron = new THREE.MeshStandardMaterial({ color: 0x3a3733, roughness: 0.7 });
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 3.4, 16), steel);
  bar.rotation.z = Math.PI / 2; group.add(bar);
  for (const s of [-1, 1]) {
    [0.52, 0.44, 0.34].forEach((r, k) => {
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.09, 40), iron);
      plate.rotation.z = Math.PI / 2; plate.position.x = s * (1.05 + k * 0.1); group.add(plate);
    });
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.08, 16), steel);
    collar.rotation.z = Math.PI / 2; collar.position.x = s * 0.95; group.add(collar);
  }
  lights(scene, 1.4, 1.2, 0.2);
};
</script>

<template>
  <Sealed title="The Hunt" phase="phase nine" :lines="[
    'Iron and distance: sets, loads and runs, logged beside the rest.',
    'Progress drawn like the range of insight, for the body instead of the mind.',
  ]">
    <Gl :build="build" :active="active" :options="{ drift: 0.005, tilt: 0.35 }" label="A loaded barbell, turning" />
  </Sealed>
</template>
