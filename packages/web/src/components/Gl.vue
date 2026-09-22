<script setup lang="ts">
// A canvas running one scene, only while its pane is on screen.
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { createScene, type Build, type Options, type SceneHandle } from '../gl/engine';

const props = defineProps<{ build: Build; options?: Options; active: boolean; label: string; hint?: string }>();
const emit = defineEmits<{ ready: [SceneHandle] }>();
const canvas = ref<HTMLCanvasElement | null>(null);
let handle: SceneHandle | null = null;

onMounted(() => {
  handle = createScene(canvas.value!, props.build, props.options);
  emit('ready', handle);
  if (props.active) handle.start();
});
watch(() => props.active, (on) => (on ? handle?.start() : handle?.stop()));
onBeforeUnmount(() => handle?.dispose());
</script>

<template>
  <canvas ref="canvas" class="gl" :aria-label="label"></canvas>
  <span class="hint">{{ hint ?? 'drag to turn' }}</span>
</template>
