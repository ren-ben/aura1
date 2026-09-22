<script setup lang="ts">
// A window on the console: a dotted frame and its title strip.
defineProps<{ title: string; scroll?: boolean; flush?: boolean }>();
</script>

<template>
  <section class="frame">
    <div class="bar"><span>{{ title }}</span><slot name="bar" /><i></i></div>
    <div v-if="flush" class="flush"><slot /></div>
    <div v-else class="body" :class="{ scroll }"><slot /></div>
  </section>
</template>

<style scoped>
.flush { flex: 1; min-height: 0; display: flex; flex-direction: column; position: relative; }
</style>
