<script setup lang="ts">
// A room not yet open: its object, its name, and what will be kept in it.
defineProps<{ title: string; phase: string; lines: string[] }>();
</script>

<template>
  <div class="sealed">
    <div class="object"><slot /></div>
    <div class="words">
      <span class="pix">sealed // {{ phase }}</span>
      <h1 class="title">{{ title }}</h1>
      <ul><li v-for="l in lines" :key="l">{{ l }}</li></ul>
    </div>
  </div>
</template>

<style scoped>
.sealed { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: 40px; align-items: center; }
.object { height: 100%; min-height: 0; display: flex; flex-direction: column; position: relative; }
.words { display: grid; gap: 18px; align-content: center; }
ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 10px; }
li { color: var(--dim); padding-left: 18px; position: relative; max-width: 48ch; }
li::before { content: ''; position: absolute; left: 0; top: .55em; width: 7px; height: 7px; border-radius: 50%; background: var(--low); }
@media (max-aspect-ratio: 5/4) { .sealed { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) auto; gap: 24px; } }
@media (max-width: 860px) { .object { min-height: 320px; } }
</style>
