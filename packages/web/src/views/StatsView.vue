<script setup lang="ts">
import { computed } from 'vue';
import { duration, type Progress, type Stats } from '../api';

const props = defineProps<{ stats: Stats | null }>();

const FORM_TEXT: Record<Stats['form'], string> = {
  stable: 'Kael\'thos is whole.',
  thinning: 'His form thins. A day without insight.',
  fragmenting: 'He fragments. Two days of silence.',
  dormant: 'He is dormant. Not dead. A session wakes him.',
};

// Share of the way from this level to the next.
function fill(p: Progress): string {
  const floor = 30 * p.level * p.level;
  return `${Math.round(((p.xp - floor) / (p.nextLevelXp - floor)) * 100)}%`;
}

const active = computed(() => props.stats?.activities.filter((a) => a.xp > 0) ?? []);
const idle = computed(() => props.stats?.activities.filter((a) => a.xp === 0) ?? []);
</script>

<template>
  <template v-if="stats">
    <p>{{ FORM_TEXT[stats.form] }}</p>
    <p v-if="stats.needsReview" class="warn">
      {{ stats.needsReview }} session(s) over 6 hours await confirmation in the Log.
    </p>
    <h2>BOND</h2>
    <div class="row">
      <span>level {{ stats.bond.level }}</span>
      <span class="bar grow"><span :style="{ width: fill(stats.bond) }" /></span>
      <span class="muted">{{ stats.bond.xp }} / {{ stats.bond.nextLevelXp }}</span>
    </div>
    <h2>DISCIPLINES</h2>
    <p v-if="active.length === 0" class="muted">No XP yet.</p>
    <ul>
      <li v-for="a in active" :key="a.id" class="row">
        <span class="muted name">{{ a.folder }}</span>
        <span class="name">{{ a.name }}</span>
        <span>lv {{ a.level }}</span>
        <span class="bar grow"><span :style="{ width: fill(a) }" /></span>
        <span class="muted">{{ duration(a.minutes) }}</span>
      </li>
    </ul>
    <p v-if="idle.length" class="muted">Untouched: {{ idle.map((a) => a.name).join(', ') }}</p>
  </template>
</template>

<style scoped>
.name { min-width: 7rem; }
.bar { display: block; height: 6px; border: 1px solid var(--line); }
.bar span { display: block; height: 100%; background: var(--fg); }
</style>
