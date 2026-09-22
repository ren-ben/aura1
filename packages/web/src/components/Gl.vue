<script setup lang="ts">
// A canvas running one scene, only while its pane is on screen.
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { createScene, type Build, type Options, type SceneHandle } from '../gl/engine';

const props = defineProps<{ build: Build; options?: Options; active: boolean; label: string; hint?: string }>();
const emit = defineEmits<{ ready: [SceneHandle] }>();
const canvas = ref<HTMLCanvasElement | null>(null);
let handle: SceneHandle | null = null;
let timer = 0;

// Started only once the pane has settled, so a quick walk past a pane never
// pays for its scene.
function run(on: boolean) {
  clearTimeout(timer);
  if (on) timer = window.setTimeout(() => handle?.start(), 320);
  else handle?.stop();
}
onMounted(() => {
  handle = createScene(canvas.value!, props.build, props.options);
  emit('ready', handle);
  run(props.active);
});
watch(() => props.active, run);
onBeforeUnmount(() => { clearTimeout(timer); handle?.dispose(); });
</script>

<template>
  <canvas ref="canvas" class="gl" :aria-label="label"></canvas>
  <span class="hint">{{ hint ?? 'drag to turn' }}</span>
</template>
