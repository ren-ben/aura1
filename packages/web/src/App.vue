<script setup lang="ts">
import { computed, onMounted, ref, type Component } from 'vue';
import { api, type Stats } from './api';
import LogView from './views/LogView.vue';
import TodosView from './views/TodosView.vue';
import HabitsView from './views/HabitsView.vue';
import QuotesView from './views/QuotesView.vue';
import CatalogView from './views/CatalogView.vue';
import StatsView from './views/StatsView.vue';
import KaelthosModel from './kaelthos/KaelthosModel.vue';

const tabs: { name: string; view: Component }[] = [
  { name: 'Log', view: LogView },
  { name: 'Todos', view: TodosView },
  { name: 'Habits', view: HabitsView },
  { name: 'Quotes', view: QuotesView },
  { name: 'Activities', view: CatalogView },
  { name: 'Stats', view: StatsView },
];
// The tab lives in the URL hash, so a reload or a link keeps it.
const fromHash = () => (tabs.find((t) => `#${t.name.toLowerCase()}` === location.hash) ?? tabs[0]!).name;
const activeName = ref(fromHash());
window.addEventListener('hashchange', () => { activeName.value = fromHash(); });
const select = (name: string) => { location.hash = name.toLowerCase(); };
const active = computed(() => tabs.find((t) => t.name === activeName.value)!);
const stats = ref<Stats | null>(null);

async function loadStats() {
  stats.value = await api<Stats>('GET', '/stats');
}

// The first load shows him turning in the dark for at least a moment.
const ready = ref(false);
onMounted(async () => {
  await Promise.all([loadStats(), new Promise((done) => setTimeout(done, 1200))]);
  ready.value = true;
});
</script>

<template>
  <Transition name="fade">
    <div v-if="!ready" class="loader">
      <KaelthosModel mode="outline" :size="260" />
      <p>AURA-1</p>
    </div>
  </Transition>
  <header>
    <h1>AURA-1</h1>
    <p v-if="stats" class="bond">
      bond {{ stats.bond.level }}
      <span class="muted">{{ stats.bond.xp }} / {{ stats.bond.nextLevelXp }} xp</span>
      <span class="form">{{ stats.form }}</span>
    </p>
  </header>
  <nav>
    <button
      v-for="tab in tabs" :key="tab.name"
      :class="{ on: tab.name === activeName }" @click="select(tab.name)"
    >{{ tab.name }}</button>
  </nav>
  <main>
    <component :is="active.view" :stats="stats" @changed="loadStats" />
  </main>
</template>

<style>
:root {
  color-scheme: dark;
  --bg: #121212;
  --surface: #1a1a1a;
  --line: #3a3833;
  --muted: #8a8478;
  --fg: #c5bcab;
  --hi: #dbd5ca;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  padding: 1.5rem;
  background: var(--bg);
  color: var(--fg);
  font: 15px/1.5 ui-monospace, 'Cascadia Mono', Menlo, monospace;
}
#app { max-width: 56rem; margin: 0 auto; }
header { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
h1 { font-weight: 400; letter-spacing: 0.3em; color: var(--hi); margin: 0; }
h2 { font-weight: 400; letter-spacing: 0.15em; font-size: 0.85rem; color: var(--muted); margin: 1.75rem 0 0.5rem; }
.bond { margin: 0; }
.muted { color: var(--muted); }
.form { margin-left: 1rem; letter-spacing: 0.15em; text-transform: uppercase; font-size: 0.8rem; }
button, input, select {
  font: inherit;
  color: var(--fg);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 2px;
  padding: 0.35rem 0.6rem;
}
button { cursor: pointer; }
button:hover { color: var(--hi); border-color: var(--muted); }
input:focus, select:focus, button:focus-visible { outline: 1px solid var(--hi); }
nav { display: flex; gap: 0.25rem; flex-wrap: wrap; margin: 1.25rem 0; border-bottom: 1px solid var(--line); }
nav button { border: 0; border-bottom: 2px solid transparent; border-radius: 0; background: none; padding: 0.5rem 0.75rem; }
nav button.on { color: var(--hi); border-bottom-color: var(--hi); }
.row { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; padding: 0.3rem 0; }
.grow { flex: 1; min-width: 8rem; }
.icon { border: 0; background: none; padding: 0 0.4rem; color: var(--muted); }
.tag { font-size: 0.75rem; letter-spacing: 0.1em; color: var(--muted); border: 1px solid var(--line); padding: 0 0.35rem; }
.warn { color: var(--hi); border-color: var(--hi); }
.error { color: var(--hi); }
ul { list-style: none; padding: 0; margin: 0; }
@media (max-width: 40rem) { body { padding: 1rem; } }
.loader {
  position: fixed; inset: 0; z-index: 10;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  background: var(--bg);
}
.loader p { letter-spacing: 0.6em; color: var(--muted); margin: 1rem 0 0 0.6em; }
.fade-leave-active { transition: opacity 0.6s ease; }
.fade-leave-to { opacity: 0; }
</style>
