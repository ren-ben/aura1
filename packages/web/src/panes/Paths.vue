<script setup lang="ts">
// The paths: every folder and activity with its level, and where they are
// made, renamed and put away. Changes reach the device on its next sync.
import Frame from '../components/Frame.vue';
import Plate from '../components/Plate.vue';
import { pilgrim } from '../gl/plate';
import { computed, nextTick, ref } from 'vue';
import { actions, duration, state } from '../store';

defineProps<{ active: boolean }>();

const showArchived = ref(false);
const newFolder = ref('');
const newActivity = ref<Record<number, string>>({});
const editing = ref<string | null>(null);
const draft = ref('');

const stat = (id: number) => state.stats?.activities.find((a) => a.id === id);
const into = (id: number) => {
  const a = stat(id);
  if (!a) return 0;
  const floor = 30 * a.level * a.level;
  return (a.xp - floor) / (a.nextLevelXp - floor);
};
const folders = computed(() => state.folders
  .filter((f) => showArchived.value || !f.archived)
  .map((f) => ({
    ...f,
    activities: f.activities.filter((a) => showArchived.value || !a.archived),
    minutes: f.activities.reduce((m, a) => m + (stat(a.id)?.minutes ?? 0), 0),
  })));
const total = computed(() => folders.value.reduce((m, f) => m + f.minutes, 0));

async function startEdit(key: string, name: string) {
  editing.value = key; draft.value = name;
  await nextTick();
  (document.querySelector('.paths .editing') as HTMLInputElement | null)?.select();
}
async function commit(kind: 'folder' | 'activity', id: number) {
  const name = draft.value.trim();
  editing.value = null;
  if (!name) return;
  if (kind === 'folder') await actions.renameFolder(id, name); else await actions.renameActivity(id, name);
}
async function addFolder() { const n = newFolder.value.trim(); if (n && await actions.addFolder(n)) newFolder.value = ''; }
async function addActivity(folderId: number) {
  const n = (newActivity.value[folderId] ?? '').trim();
  if (n && await actions.addActivity(folderId, n)) newActivity.value[folderId] = '';
}
</script>

<template>
  <div class="paths">
    <header>
      <h1 class="title">The Paths</h1>
      <div class="meta">
        <span class="pix">{{ duration(total) }} given in twelve weeks // level n at 30 x n squared insight</span>
        <form class="row" @submit.prevent="addFolder">
          <input v-model="newFolder" class="field" placeholder="a new folder" maxlength="12" aria-label="New folder">
          <button class="btn" type="submit">open it</button>
          <button type="button" class="btn quiet" :aria-pressed="showArchived" @click="showArchived = !showArchived">{{ showArchived ? 'hide the archived' : 'show the archived' }}</button>
        </form>
      </div>
    </header>

    <Frame class="walk" title="the long walk // whoever keeps a path walks it" flush>
      <Plate :draw="pilgrim" :active="active" animated :cell="2" label="A hooded figure leaning into driving rain" />
      <p class="note said">Hours are the only units that reach me. You know what the weather is.</p>
    </Frame>

    <div class="grid">
      <section v-for="f in folders" :key="f.id" class="folder" :class="{ archived: f.archived }">
        <div class="fhead">
          <input v-if="editing === `f${f.id}`" v-model="draft" class="field editing" maxlength="12" @keydown.enter="commit('folder', f.id)" @blur="commit('folder', f.id)" @keydown.esc="editing = null">
          <h2 v-else @dblclick="startEdit(`f${f.id}`, f.name)" :title="'Double click to rename'">{{ f.name[0] + f.name.slice(1).toLowerCase() }}</h2>
          <span class="pix">{{ duration(f.minutes) }}</span>
          <button class="x" @click="actions.archiveFolder(f.id, !f.archived)">{{ f.archived ? 'restore' : 'archive' }}</button>
        </div>
        <div class="share"><i :style="{ width: `${total ? (f.minutes / total) * 100 : 0}%` }"></i></div>
        <div v-for="a in f.activities" :key="a.id" class="disc" :class="{ archived: a.archived }">
          <div>
            <input v-if="editing === `a${a.id}`" v-model="draft" class="field editing" maxlength="15" @keydown.enter="commit('activity', a.id)" @blur="commit('activity', a.id)" @keydown.esc="editing = null">
            <div v-else class="n" @dblclick="startEdit(`a${a.id}`, a.name)" title="Double click to rename">{{ a.name }}</div>
            <div class="notch"><i v-for="k in 16" :key="k" :class="{ on: k / 16 <= into(a.id) }"></i></div>
            <div class="h">{{ duration(stat(a.id)?.minutes ?? 0) }}, {{ Math.round(into(a.id) * 100) }}% to level {{ (stat(a.id)?.level ?? 0) + 1 }}
              <button class="x" @click="actions.archiveActivity(a.id, !a.archived)">{{ a.archived ? 'restore' : 'archive' }}</button></div>
          </div>
          <span class="lv">{{ String(stat(a.id)?.level ?? 0).padStart(2, '0') }}</span>
        </div>
        <form v-if="!f.archived" class="add" @submit.prevent="addActivity(f.id)">
          <input v-model="newActivity[f.id]" class="field" placeholder="a new path" maxlength="15" :aria-label="`New activity in ${f.name}`">
          <button class="btn quiet" type="submit">add</button>
        </form>
      </section>
    </div>
    <p v-if="state.error" class="note err">{{ state.error }}</p>
  </div>
</template>

<style scoped>
.paths { display: flex; flex-direction: column; gap: 16px; min-height: 0; }
.walk { flex: none; height: clamp(150px, 22vh, 260px); }
.walk .said { position: absolute; left: 16px; bottom: 12px; margin: 0; max-width: 42ch; padding: 6px 10px; background: rgba(18, 18, 18, .78); }
header { display: flex; justify-content: space-between; align-items: end; gap: 20px; flex-wrap: wrap; }
.meta { display: grid; gap: 8px; justify-items: end; }
.meta .field { width: 180px; }
.grid { flex: 1; min-height: 0; overflow: auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); gap: 16px 34px; align-content: start; scrollbar-width: thin; scrollbar-color: var(--low) transparent; }
.folder { border-top: 3px dotted var(--low); padding-top: 10px; }
.folder.archived, .disc.archived { opacity: .45; }
.fhead { display: flex; align-items: baseline; gap: 12px; }
.fhead h2 { margin: 0; font: 400 30px/1 var(--goth); color: var(--hi); flex: 1; cursor: text; }
.share { height: 3px; margin: 8px 0 4px; background: radial-gradient(circle, var(--low) 1px, transparent 1.3px) 0 50% / 5px 3px repeat-x; }
.share i { display: block; height: 3px; background: var(--phos); }
.disc { display: grid; grid-template-columns: 1fr auto; gap: 12px; padding: 8px 0; border-bottom: 3px dotted var(--faint); align-items: end; }
.disc .n { font: 400 21px/1.1 var(--fell); color: var(--hi); cursor: text; }
.notch { display: flex; gap: 3px; margin-top: 6px; }
.notch i { width: 9px; height: 4px; border: 1px solid var(--dim); }
.notch i.on { background: var(--phos); border-color: var(--phos); }
.h { font-size: 11px; color: var(--dim); margin-top: 4px; }
.lv { font: 800 36px/.8 var(--tek); color: var(--hi); }
.add { display: flex; gap: 6px; margin-top: 10px; }
.add .field { flex: 1; }
.err { color: var(--hi); }
@media (max-width: 860px) { .paths { display: flex; flex-direction: column; } }
</style>
