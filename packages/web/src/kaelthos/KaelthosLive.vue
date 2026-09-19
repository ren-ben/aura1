<script setup lang="ts">
// Kael'thos alive in the corner: the device's rig drawn live as SVG, pale on
// the dark page like a hologram. He breathes, blinks, lets his gaze drift,
// flicks an ear, and wears whatever mood.ts says; click him and he blushes.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { bust, EXPRESSIONS, type Expression } from '@aura/art/rig.ts';
import type { Pt } from '@aura/art/ink.ts';
import { mood, react } from './mood';

withDefaults(defineProps<{ size?: number }>(), { size: 150 });

// Pale ink on the charcoal page; his eyes and marks are the page itself.
const PALETTE = { ink: '#c5bcab', paper: '#121212' };

const blinking = ref(false);
const earFlick = ref(false);
const drift = ref<Pt>([0, 0]);
const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Blinks and ear flicks only make sense on open eyes.
const OPEN = new Set(['open', 'wide', 'sparkle', 'huge', 'smile', 'flat', 'glare', 'droop']);

const expression = computed<Expression>(() => {
  const base = EXPRESSIONS[mood.value] as Expression;
  const eyes = Array.isArray(base.eyes) ? base.eyes : [base.eyes, base.eyes];
  const open = eyes.every((e) => OPEN.has(e));
  const look = base.look ?? [0, 0];
  return {
    ...base,
    eyes: open && blinking.value ? 'content' : base.eyes,
    look: open ? [look[0] + drift.value[0], look[1] + drift.value[1]] : look,
    ears: earFlick.value && !base.ears ? 'perk' : base.ears,
  };
});

const art = computed(() => bust(expression.value, {}, PALETTE));

// Schedules something to happen again after a random pause.
const timers: ReturnType<typeof setTimeout>[] = [];
function every(min: number, max: number, act: () => void) {
  const next = () => {
    timers.push(setTimeout(() => { act(); next(); }, min + Math.random() * (max - min)));
  };
  next();
}
const briefly = (flag: typeof blinking, ms: number) => {
  flag.value = true;
  timers.push(setTimeout(() => { flag.value = false; }, ms));
};

onMounted(() => {
  if (still) return;
  every(2500, 6000, () => briefly(blinking, 140));
  every(7000, 16000, () => briefly(earFlick, 260));
  every(1800, 4500, () => {
    drift.value = [Math.round((Math.random() - 0.5) * 12), Math.round((Math.random() - 0.5) * 8)];
  });
});
onBeforeUnmount(() => timers.forEach(clearTimeout));

// A change of mood arrives with a small hop.
const hop = ref(false);
watch(mood, () => {
  hop.value = false;
  requestAnimationFrame(() => { hop.value = true; });
});

function poke() {
  react(Math.random() < 0.7 ? 'flustered' : 'delighted', 2500);
}
</script>

<template>
  <button class="kaelthos" :class="{ hop, still }" :style="{ width: `${size}px`, height: `${size}px` }"
    :aria-label="`Kael'thos, ${mood}`" @click="poke">
    <span class="breath" v-html="art" />
  </button>
</template>

<style scoped>
.kaelthos {
  display: block; padding: 0; border: 0; background: none; cursor: pointer;
  filter: drop-shadow(0 0 10px rgba(197, 188, 171, 0.18));
}
.kaelthos:hover { background: none; }
.breath { display: block; width: 100%; height: 100%; transform-origin: 50% 100%; animation: breathe 4.2s ease-in-out infinite; }
.breath :deep(svg) { width: 100%; height: 100%; display: block; }
.hop .breath { animation: hop 0.45s cubic-bezier(0.3, 1.6, 0.5, 1), breathe 4.2s ease-in-out 0.45s infinite; }
.still .breath { animation: none; }
@keyframes breathe { 0%, 100% { transform: scale(1, 1); } 50% { transform: scale(1.006, 1.018); } }
@keyframes hop { 0% { transform: translateY(0); } 40% { transform: translateY(-7%); } 100% { transform: translateY(0); } }
</style>
