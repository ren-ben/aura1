<script setup lang="ts">
// A dithered picture: drawn in grey, thresholded to the two inks. Animated
// plates run only while their pane is on screen.
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { makePlate, type Draw } from '../gl/plate';

const props = withDefaults(defineProps<{ draw: Draw; active: boolean; animated?: boolean; cell?: number; label?: string }>(), { cell: 3 });
const cellFor = () => props.cell;
const canvas = ref<HTMLCanvasElement | null>(null);
let render: ((t: number) => void) | null = null;
let raf = 0;
let observer: ResizeObserver | null = null;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function loop(now: number) {
  render?.(now / 1000);
  if (props.animated && props.active && !reduced()) raf = requestAnimationFrame(loop);
}
// Stopping draws nothing: the canvas keeps its last frame, and the moment a
// pane starts to move is the worst moment to spend one.
function run() {
  cancelAnimationFrame(raf);
  if (props.active) raf = requestAnimationFrame(loop);
}
onMounted(() => {
  render = makePlate(canvas.value!, props.draw, cellFor());
  observer = new ResizeObserver(() => { render = makePlate(canvas.value!, props.draw, cellFor()); render(performance.now() / 1000); });
  observer.observe(canvas.value!);
  render(performance.now() / 1000);
  run();
});
watch(() => props.active, run);
watch(() => props.draw, () => { render = makePlate(canvas.value!, props.draw, cellFor()); run(); });
onBeforeUnmount(() => { cancelAnimationFrame(raf); observer?.disconnect(); });
</script>

<template>
  <canvas ref="canvas" class="plate" :aria-label="label" :role="label ? 'img' : 'presentation'"></canvas>
</template>

<style scoped>
.plate { display: block; width: 100%; height: 0; flex: 1 1 auto; min-height: 0; }
</style>
