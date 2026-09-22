<script setup lang="ts">
import Sealed from '../components/Sealed.vue';

defineProps<{ active: boolean }>();
</script>

<template>
  <Sealed title="His Voice" phase="phase seven" :lines="[
    'Conversations with Kael\'thos: he speaks, you answer yes or no with the two buttons.',
    'Company on the long nights, counsel when you ask, the ego when you need it.',
    'The words come from far away; the vessel wakes its radio only for each reply.',
  ]">
    <div class="eye" aria-hidden="true"><div class="lens"></div></div>
    <p class="say note">I'm sorry. I can't speak to you yet.</p>
  </Sealed>
</template>

<style scoped>
.eye { width: min(46vh, 80%); aspect-ratio: 1; margin: auto auto 0; border-radius: 50%; padding: 14px; border: 3px dotted var(--dim); }
.lens { width: 100%; height: 100%; border-radius: 50%; background: radial-gradient(circle, var(--hi) 0 3%, var(--phos) 5%, #5a5549 16%, #2a2825 32%, var(--deep) 56%); box-shadow: inset 0 0 40px #000; animation: breathe 5s ease-in-out infinite; }
@keyframes breathe { 50% { filter: brightness(1.3); } }
.say { text-align: center; margin: 24px auto auto; font-family: var(--pix); text-transform: uppercase; font-size: 11px; }
</style>
