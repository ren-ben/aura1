<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';

type Row = {
  id: number; activity: string; folder: string;
  startedAt: string; endedAt: string; minutes: number; source: string;
};

const rows = ref<Row[]>([]);
const error = ref<string | null>(null);

onMounted(async () => {
  try {
    const response = await fetch('/api/v1/sessions');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    rows.value = await response.json();
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'failed';
  }
});

const days = computed(() => {
  const grouped = new Map<string, Row[]>();
  for (const row of rows.value) {
    const day = row.startedAt.slice(0, 10);
    grouped.set(day, [...(grouped.get(day) ?? []), row]);
  }
  return [...grouped.entries()];
});

function duration(minutes: number): string {
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
}

function clock(iso: string): string {
  return iso.slice(11, 16);
}
</script>

<template>
  <main>
    <h1>AURA-1</h1>
    <p v-if="error">{{ error }}</p>
    <p v-else-if="rows.length === 0">No sessions logged.</p>
    <section v-for="[day, entries] in days" :key="day">
      <h2>{{ day }}</h2>
      <ul>
        <li v-for="entry in entries" :key="entry.id">
          <span>{{ entry.folder }}</span>
          <span>{{ entry.activity }}</span>
          <span>{{ clock(entry.startedAt) }}-{{ clock(entry.endedAt) }}</span>
          <span>{{ duration(entry.minutes) }}</span>
          <span v-if="entry.source === 'manual'">manual</span>
        </li>
      </ul>
    </section>
  </main>
</template>

<style>
:root { color-scheme: dark; }
body {
  margin: 0;
  padding: 2rem;
  background: #121212;
  color: #C5BCAB;
  font-family: ui-monospace, monospace;
}
h1, h2 { font-weight: 400; letter-spacing: 0.1em; }
ul { list-style: none; padding: 0; }
li { display: flex; gap: 1.5rem; padding: 0.25rem 0; }
</style>
