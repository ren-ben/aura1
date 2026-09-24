<script setup lang="ts">
// Static that clears and clouds over, slowly: the degree not yet in focus.
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import Sealed from '../components/Sealed.vue';

const props = defineProps<{ active: boolean }>();
const canvas = ref<HTMLCanvasElement | null>(null);
let timer = 0;
function frame() {
  const c = canvas.value;
  if (!c) return;
  const x = c.getContext('2d')!, img = x.createImageData(120, 120), t = performance.now() / 4000;
  for (let i = 0; i < 14400; i++) {
    const px = i % 120, py = Math.floor(i / 120);
    const cloud = 0.5 + 0.3 * Math.sin(px / 14 + t) * Math.cos(py / 17 - t * 0.7);
    const v = Math.random() < cloud ? 197 : 18;
    img.data.set([v, v * 0.96, v * 0.87, 255], i * 4);
  }
  x.putImageData(img, 0, 0);
}
const run = (on: boolean) => { clearInterval(timer); frame(); if (on && !matchMedia('(prefers-reduced-motion: reduce)').matches) timer = window.setInterval(frame, 110); };
onMounted(() => run(props.active));
watch(() => props.active, run);
onBeforeUnmount(() => clearInterval(timer));
</script>

<template>
  <Sealed title="The Academy" phase="phase eight" :lines="[
    'Physics at the University of Vienna: courses, ECTS, grades, the exams ahead.',
    'Course dates and rooms drawn from u:find; the degree filled in module by module.',
  ]">
    <canvas ref="canvas" width="120" height="120" class="static" aria-hidden="true"></canvas>
  </Sealed>
</template>

<style scoped>
.static { width: min(52vh, 90%); aspect-ratio: 1; margin: auto; image-rendering: pixelated; border: 3px dotted var(--low); }
</style>
