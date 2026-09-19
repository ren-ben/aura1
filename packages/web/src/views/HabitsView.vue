<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api, localDate } from '../api';
import { react } from '../kaelthos/mood';

type Habit = { id: number; name: string; done: string[] };

const WEEKS = 26;
const habits = ref<Habit[]>([]);
const name = ref('');

// Columns are weeks (Monday first), oldest on the left, ending with this week.
const weeks = computed(() => {
  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7) - (WEEKS - 1) * 7);
  return Array.from({ length: WEEKS }, (_, w) => Array.from({ length: 7 }, (_, d) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + w * 7 + d);
    return day > today ? null : localDate(day);
  }));
});
const today = localDate();

async function load() {
  const from = weeks.value[0]![0]!;
  habits.value = await api<Habit[]>('GET', `/habits?from=${from}&to=${today}`);
}
onMounted(load);

async function add() {
  await api('POST', '/habits', { name: name.value });
  name.value = '';
  await load();
}

async function toggle(habit: Habit, date: string) {
  const done = !habit.done.includes(date);
  await api('PUT', `/habits/${habit.id}/entries/${date}`, { done });
  await load();
  react(done ? 'happy' : 'questioning', 2500);
}

async function archive(habit: Habit) {
  if (!window.confirm(`Archive ${habit.name}? Its history is kept.`)) return;
  await api('PATCH', `/habits/${habit.id}`, { archived: true });
  await load();
}
</script>

<template>
  <form class="row" @submit.prevent="add">
    <input v-model="name" class="grow" placeholder="new habit" maxlength="15" required>
    <button>add</button>
  </form>
  <p v-if="habits.length === 0" class="muted">No habits yet.</p>
  <section v-for="habit in habits" :key="habit.id">
    <h2 class="row">
      <span class="grow">{{ habit.name.toUpperCase() }}</span>
      <button class="tag" :class="{ warn: habit.done.includes(today) }" @click="toggle(habit, today)">
        {{ habit.done.includes(today) ? 'done today' : 'mark today' }}
      </button>
      <button class="icon" title="Archive" @click="archive(habit)">x</button>
    </h2>
    <div class="heatmap">
      <div v-for="(week, w) in weeks" :key="w" class="week">
        <button
          v-for="(day, d) in week" :key="d"
          class="cell" :class="{ on: day && habit.done.includes(day), gone: !day }"
          :disabled="!day" :title="day ?? ''"
          @click="day && toggle(habit, day)"
        />
      </div>
    </div>
  </section>
</template>

<style scoped>
.heatmap { display: flex; gap: 3px; overflow-x: auto; padding-bottom: 0.25rem; }
.week { display: flex; flex-direction: column; gap: 3px; }
.cell { width: 13px; height: 13px; padding: 0; border: 1px solid var(--line); background: var(--surface); }
.cell.on { background: var(--fg); border-color: var(--fg); }
.cell.gone { visibility: hidden; }
</style>
