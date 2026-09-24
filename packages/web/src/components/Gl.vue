<script setup lang="ts">
// A canvas running one scene, only while its pane is on screen.
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { createScene, type Build, type Options, type SceneHandle } from '../gl/engine';

const props = defineProps<{ build: Build; options?: Options; active: boolean; label: string; hint?: string }>();
const emit = defineEmits<{ ready: [SceneHandle] }>();
const canvas = ref<HTMLCanvasElement | null>(null);
let handle: SceneHandle | null = null;

// Drawn once as soon as it exists, so every pane already has its picture when
// it slides in; it only runs once its pane has stopped moving.
function run(on: boolean) {
  if (on) handle?.start(); else handle?.stop();
}
onMounted(() => {
  handle = createScene(canvas.value!, props.build, props.options);
  emit('ready', handle);
  handle.draw();
  run(props.active);
});
watch(() => props.active, run);
onBeforeUnmount(() => { handle?.dispose(); });
</script>

<template>
  <canvas ref="canvas" class="gl" :aria-label="label"></canvas>
  <span class="hint">{{ hint ?? 'drag to turn' }}</span>
</template>
