<script setup lang="ts">
// A pane's mark on the web: what the pane is, drawn small enough to find at a
// glance, and alive with the pane's own state where it has one. The sun
// stands where the sun is, the device is charged as the device is, the range
// is the shape of the last twelve weeks, the ring lights the rituals kept.
import { computed } from 'vue';
import { state } from '../store';

const props = defineProps<{ id: string; weeks: number[] }>();

// By day the sun crosses the arc, by night the moon does.
const sky = computed(() => {
  const d = new Date(), h = d.getHours() + d.getMinutes() / 60, night = h < 6 || h >= 18;
  const f = ((night ? h + 6 : h - 6) % 24) / 12;
  return { night, x: 12 - 8 * Math.cos(Math.PI * f), y: 17 - 8 * Math.sin(Math.PI * f) };
});
const ridge = computed(() => {
  const top = Math.max(1e-6, ...props.weeks);
  return props.weeks.map((v, i) => ({ x: 2 + (i * 20) / 11, y: 19 - (v / top) * 13 }));
});
const ring = computed(() => {
  const day = new Date().toISOString().slice(0, 10);
  const hs = state.habits.length ? state.habits : Array.from({ length: 7 }, () => ({ done: [] as string[] }));
  return hs.map((h, i) => {
    const a = (i / hs.length) * Math.PI * 2 - Math.PI / 2;
    return { x: 12 + 8 * Math.cos(a), y: 12 + 8 * Math.sin(a), kept: h.done.includes(day) };
  });
});
const charge = computed(() => (state.device?.battery ?? 0) / 100);
</script>

<template>
  <svg class="sigil" :class="id" viewBox="0 0 24 24" aria-hidden="true">
    <template v-if="id === 'kael'">
      <path class="ink" d="M12 20.6c-5 0-7.5-3-7.5-7 0-2.5.5-4 1.1-4.9l-.8-5.2 4.6 2.8q2.6-.7 5.2 0l4.6-2.8-.8 5.2c.6.9 1.1 2.4 1.1 4.9 0 4-2.5 7-7.5 7z" />
      <g class="eyes"><ellipse cx="9.3" cy="13.2" rx="1.5" ry="2" /><ellipse cx="14.7" cy="13.2" rx="1.5" ry="2" /></g>
    </template>
    <template v-else-if="id === 'today'">
      <path class="thin" d="M4 17a8 8 0 0 1 16 0" />
      <path d="M2 17h20M5 20.5h14" />
      <path v-if="sky.night" class="ink" :transform="`translate(${sky.x - 12} ${sky.y - 12})`" d="M13 9a3 3 0 1 0 0 6 3.6 3.6 0 0 1 0-6z" />
      <circle v-else class="ink" :cx="sky.x" :cy="sky.y" r="2.4" />
    </template>
    <template v-else-if="id === 'paths'">
      <path d="M12 2.5V21.5M8 21.5h8M12 4.5h7l2.5 2.2L19 9h-7M12 11H5L2.5 13.2 5 15.5h7" />
    </template>
    <template v-else-if="id === 'log'">
      <path d="M5 3h14v18H5zM8 3v18M11 7h5M11 10h5M11.5 13.5v4M13.5 13.5v4M15.5 13.5v4M10.5 17l6.5-3" />
    </template>
    <template v-else-if="id === 'vessel'">
      <rect x="4.5" y="2.5" width="15" height="19" rx="2.5" />
      <rect x="7" y="5" width="10" height="10" />
      <rect class="ink dim" x="8.5" :y="6.5 + 7 * (1 - charge)" width="7" :height="7 * charge" />
      <circle cx="9.5" cy="18.2" r="1.1" /><circle cx="14.5" cy="18.2" r="1.1" />
    </template>
    <template v-else-if="id === 'orrery'">
      <g transform="rotate(-18 12 12)">
        <ellipse class="orbit" cx="12" cy="12" rx="10" ry="4" />
        <ellipse class="orbit" cx="12" cy="12" rx="5.6" ry="2.3" />
        <circle class="ink" r="1.5"><animateMotion dur="9s" repeatCount="indefinite" path="M22 12a10 4 0 1 1-20 0a10 4 0 1 1 20 0" /></circle>
        <circle class="ink" r="1"><animateMotion dur="4s" repeatCount="indefinite" path="M17.6 12a5.6 2.3 0 1 1-11.2 0a5.6 2.3 0 1 1 11.2 0" /></circle>
      </g>
      <circle class="ink" cx="12" cy="12" r="2" />
    </template>
    <template v-else-if="id === 'insight'">
      <path class="thin" d="M2 21.5h20" />
      <polyline :points="ridge.map((p) => `${p.x},${p.y}`).join(' ')" />
      <circle v-for="(p, i) in ridge" :key="i" class="ink" :cx="p.x" :cy="p.y" r=".9" />
    </template>
    <template v-else-if="id === 'rituals'">
      <circle class="thin" cx="12" cy="12" r="8" />
      <circle v-for="(d, i) in ring" :key="i" class="bead" :class="{ ink: d.kept }" :cx="d.x" :cy="d.y" r="1.4" />
      <path class="ink" d="M13.4 8.6a3.6 3.6 0 1 0 0 6.8 4.4 4.4 0 0 1 0-6.8z" />
    </template>
    <template v-else-if="id === 'intercept'">
      <g class="turn">
        <circle class="script" cx="12" cy="12" r="8.5" />
        <circle class="ink" cx="18.3" cy="6.3" r="1.1" /><circle class="ink" cx="5" cy="17" r=".8" /><circle class="ink" cx="4.2" cy="9" r=".6" />
      </g>
      <path class="ink" d="M8.6 9.2h2.6v2.6c0 1.6-.8 2.7-2.2 3.1l-.4-.9c.7-.3 1-.9 1-1.6H8.6zM12.8 9.2h2.6v2.6c0 1.6-.8 2.7-2.2 3.1l-.4-.9c.7-.3 1-.9 1-1.6h-1z" />
    </template>
    <template v-else-if="id === 'pact'">
      <ellipse class="thin" cx="12" cy="12" rx="10.5" ry="2.6" />
      <circle class="void" cx="12" cy="12" r="5.4" />
      <circle class="thin" cx="12" cy="12" r="7" />
      <path d="M1.5 12a10.5 2.6 0 0 0 21 0" />
    </template>
    <template v-else-if="id === 'library'">
      <path d="M2 20.5h20M4 20.5V6h3.5v14.5M8 20.5V8.5h3v12M11.5 20.5V4.5H15v16M4 9h3.5M4 17h3.5M11.5 8h3.5M11.5 17h3.5" />
      <path d="m15.6 20.3 3.6-13.4 3.1.9-3.6 13.4z" />
    </template>
    <template v-else-if="id === 'vigil'">
      <circle class="glow" cx="12" cy="7" r="5.5" />
      <path class="ink flame" d="M12 2.5c2.3 3 2.3 5.6 0 7.3-2.3-1.7-2.3-4.3 0-7.3z" />
      <path d="M12 9.8v1.7M9.5 11.5h5v9.5h-5zM9.5 14c1 0 1 1.6 1.6 1.6M6 21h12" />
    </template>
    <template v-else-if="id === 'academy'">
      <path d="M2 9.2 12 4.6l10 4.6-10 4.6zM6.5 11.3v4.9c3 2.3 8 2.3 11 0v-4.9M22 9.2v6" />
      <rect class="ink" x="21" y="15" width="2" height="3" />
    </template>
    <template v-else>
      <path d="M2 12h20" />
      <path d="M5 6h2.5v12H5zM7.5 8.5h1.8v7H7.5zM16.5 6H19v12h-2.5zM14.7 8.5h1.8v7h-1.8z" />
    </template>
  </svg>
</template>

<style scoped>
.sigil { display: block; overflow: visible; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linejoin: round; }
.ink { fill: currentColor; stroke: none; }
.dim { opacity: .45; }
.orbit { stroke-width: 1; opacity: .75; }
.thin { stroke-width: 1; stroke-dasharray: 1 1.8; opacity: .7; }
.void { fill: var(--ground); stroke-width: 1.8; }
.script { stroke-width: 2.4; stroke-dasharray: 20 1.6 9 2.4 14 1.2; }
.bead { fill: var(--ground); }
.bead.ink { fill: currentColor; }
.glow { fill: currentColor; stroke: none; opacity: .12; }
.eyes { fill: var(--ground); stroke: none; transform-origin: 12px 13.2px; animation: blink 5.5s infinite; }
@keyframes blink { 0%, 94%, 100% { transform: none; } 97% { transform: scaleY(.1); } }
.flame { transform-origin: 12px 9.8px; animation: flicker 1.6s ease-in-out infinite alternate; }
@keyframes flicker { 0% { transform: scale(1, 1) skewX(0); } 40% { transform: scale(.92, 1.08) skewX(3deg); } 100% { transform: scale(1.04, .94) skewX(-2deg); } }
.turn { transform-origin: 12px 12px; animation: turn 40s linear infinite; }
@keyframes turn { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .eyes, .flame, .turn { animation: none; } }
</style>
