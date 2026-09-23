<script setup lang="ts">
// A number that travels to its new value instead of jumping there. Counts on
// an ease-out curve, so a streak of 3 rolls up the way a mechanical counter
// would settle.
import { onBeforeUnmount, ref, watch } from 'vue';

const props = withDefaults(defineProps<{ value: number; pad?: number; ms?: number; format?: (n: number) => string }>(), { pad: 0, ms: 620 });
const shown = ref(props.value);
let raf = 0;

const ease = (u: number) => 1 - Math.pow(1 - u, 3);

watch(() => props.value, (to, from) => {
  cancelAnimationFrame(raf);
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { shown.value = to; return; }
  const start = performance.now(), base = from ?? 0;
  const step = (now: number) => {
    const u = Math.min(1, (now - start) / props.ms);
    shown.value = base + (to - base) * ease(u);
    if (u < 1) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
});
onBeforeUnmount(() => cancelAnimationFrame(raf));

const text = () => {
  const n = Math.round(shown.value);
  return props.format ? props.format(n) : String(n).padStart(props.pad, '0');
};
</script>

<template>
  <span>{{ text() }}</span>
</template>
