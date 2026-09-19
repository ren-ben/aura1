<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api, duration, localDate, type Folder } from '../api';
import { react } from '../kaelthos/mood';

type Row = {
  id: number; activityId: number; activity: string; folder: string;
  startedAt: string; endedAt: string; minutes: number; source: string; needsReview: boolean;
};

const emit = defineEmits<{ changed: [] }>();
const rows = ref<Row[]>([]);
const folders = ref<Folder[]>([]);
const error = ref<string | null>(null);
// Under ten minutes is a mistaken start, never logged.
const short = ref(false);

const form = ref({ activityId: 0, date: localDate(), start: '09:00', end: '10:00' });

async function load() {
  try {
    [rows.value, folders.value] = await Promise.all([
      api<Row[]>('GET', '/sessions'),
      api<Folder[]>('GET', '/folders'),
    ]);
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'failed';
  }
}
onMounted(load);

const choices = computed(() => folders.value
  .filter((f) => !f.archived)
  .flatMap((f) => f.activities.filter((a) => !a.archived).map((a) => ({ id: a.id, label: `${f.name} / ${a.name}` }))));

// Grouped by the local day the session started.
const days = computed(() => {
  const grouped = new Map<string, Row[]>();
  for (const row of rows.value) {
    const day = localDate(new Date(row.startedAt));
    grouped.set(day, [...(grouped.get(day) ?? []), row]);
  }
  return [...grouped.entries()];
});

const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

async function backfill() {
  const { activityId, date, start, end } = form.value;
  const startedAt = new Date(`${date}T${start}`);
  const endedAt = new Date(`${date}T${end}`);
  // An end before the start means the session ran past midnight.
  if (endedAt <= startedAt) endedAt.setDate(endedAt.getDate() + 1);
  short.value = endedAt.getTime() - startedAt.getTime() < 10 * 60_000;
  if (short.value) return;
  await api('POST', '/sessions', {
    activityId, startedAt: startedAt.toISOString(), endedAt: endedAt.toISOString(),
  });
  await load();
  react('delighted');
  emit('changed');
}

async function confirmSession(row: Row) {
  await api('POST', `/sessions/${row.id}/confirm`);
  await load();
  react('proud');
  emit('changed');
}

async function remove(row: Row) {
  if (!window.confirm(`Delete ${row.activity}, ${duration(row.minutes)}?`)) return;
  await api('DELETE', `/sessions/${row.id}`);
  await load();
  emit('changed');
}
</script>

<template>
  <h2>BACKFILL</h2>
  <form class="row" @submit.prevent="backfill">
    <select v-model.number="form.activityId" class="grow" required>
      <option :value="0" disabled>activity</option>
      <option v-for="c in choices" :key="c.id" :value="c.id">{{ c.label }}</option>
    </select>
    <input v-model="form.date" type="date" required>
    <input v-model="form.start" type="time" required>
    <input v-model="form.end" type="time" required>
    <button :disabled="!form.activityId">log</button>
    <span class="muted">{{ short ? 'at least 10 minutes' : 'half XP' }}</span>
  </form>

  <p v-if="error" class="error">{{ error }}</p>
  <p v-else-if="rows.length === 0" class="muted">No sessions logged.</p>
  <section v-for="[day, entries] in days" :key="day">
    <h2>{{ day }}</h2>
    <ul>
      <li v-for="entry in entries" :key="entry.id" class="row">
        <span class="muted">{{ entry.folder }}</span>
        <span class="grow">{{ entry.activity }}</span>
        <span>{{ clock(entry.startedAt) }}-{{ clock(entry.endedAt) }}</span>
        <span>{{ duration(entry.minutes) }}</span>
        <span v-if="entry.source === 'manual'" class="tag">manual</span>
        <button v-if="entry.needsReview" class="tag warn" title="Over 6 hours: no XP until confirmed" @click="confirmSession(entry)">confirm</button>
        <button class="icon" title="Delete" @click="remove(entry)">x</button>
      </li>
    </ul>
  </section>
</template>
