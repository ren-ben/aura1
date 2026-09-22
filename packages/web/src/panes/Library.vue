<script setup lang="ts">
import * as THREE from 'three';
import Gl from '../components/Gl.vue';
import Sealed from '../components/Sealed.vue';
import { stars, tesseract } from '../gl/models';

defineProps<{ active: boolean }>();
const build = ({ scene, group }: { scene: THREE.Scene; group: THREE.Group }) => {
  const t = tesseract();
  group.add(t.lines);
  scene.add(stars(600, 20, 31, 0.05));
  return (time: number) => t.update(time);
};
</script>

<template>
  <Sealed title="The Library" phase="phase six" :lines="[
    'Books on the card, read page by page on the glass, Kael\'thos reading in the corner.',
    'Jump between chapters; every book remembers its page.',
    'Mark a page on the device; pick the exact passage here and write your notes to it.',
  ]">
    <Gl :build="build" :active="active" :options="{ dither: false, drift: 0.002 }" label="A tesseract turning in the fourth dimension" />
  </Sealed>
</template>
