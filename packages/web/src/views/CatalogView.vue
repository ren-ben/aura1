<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api, type Folder } from '../api';

const emit = defineEmits<{ changed: [] }>();
const folders = ref<Folder[]>([]);
const showArchived = ref(false);
const newFolder = ref('');
const newActivity = ref<Record<number, string>>({});
const error = ref<string | null>(null);

async function load() {
  folders.value = await api<Folder[]>('GET', '/folders');
}
onMounted(load);

const visible = computed(() => folders.value
  .filter((f) => showArchived.value || !f.archived)
  .map((f) => ({ ...f, activities: f.activities.filter((a) => showArchived.value || !a.archived) })));

// Every change here reaches the device on its next sync.
async function run(method: string, path: string, body?: unknown) {
  error.value = null;
  try {
    await api(method, path, body);
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'failed';
  }
  await load();
  emit('changed');
}

const rename = (kind: 'folders' | 'activities', id: number, event: Event) => {
  const name = (event.target as HTMLInputElement).value.trim();
  if (name) run('PATCH', `/${kind}/${id}`, { name });
};

async function addFolder() {
  await run('POST', '/folders', { name: newFolder.value });
  newFolder.value = '';
}

async function addActivity(folderId: number) {
  await run('POST', '/activities', { folderId, name: newActivity.value[folderId] });
  newActivity.value[folderId] = '';
}
</script>

<template>
  <p class="muted">
    Changes reach the device on its next sync. Names are capped at what the screen shows:
    10 characters for a folder, 15 for an activity. Archiving hides from the device and keeps history.
  </p>
  <div class="row">
    <form class="row grow" @submit.prevent="addFolder">
      <input v-model="newFolder" class="grow" placeholder="new folder" maxlength="10" required>
      <button>add folder</button>
    </form>
    <label class="row muted"><input v-model="showArchived" type="checkbox"> archived</label>
  </div>
  <p v-if="error" class="error">{{ error }}</p>

  <section v-for="(folder, i) in visible" :key="folder.id" :class="{ archived: folder.archived }">
    <h2 class="row">
      <input :value="folder.name" maxlength="10" class="grow title" @change="rename('folders', folder.id, $event)">
      <button class="icon" title="Move up" :disabled="i === 0" @click="run('POST', `/folders/${folder.id}/move`, { direction: 'up' })">^</button>
      <button class="icon" title="Move down" :disabled="i === visible.length - 1" @click="run('POST', `/folders/${folder.id}/move`, { direction: 'down' })">v</button>
      <button class="tag" @click="run('PATCH', `/folders/${folder.id}`, { archived: !folder.archived })">
        {{ folder.archived ? 'restore' : 'archive' }}
      </button>
    </h2>
    <ul>
      <li v-for="activity in folder.activities" :key="activity.id" class="row" :class="{ archived: activity.archived }">
        <input :value="activity.name" maxlength="15" class="grow" @change="rename('activities', activity.id, $event)">
        <select
          :value="folder.id" title="Move to folder"
          @change="run('PATCH', `/activities/${activity.id}`, { folderId: Number(($event.target as HTMLSelectElement).value) })"
        >
          <option v-for="f in folders" :key="f.id" :value="f.id">{{ f.name }}</option>
        </select>
        <button class="tag" @click="run('PATCH', `/activities/${activity.id}`, { archived: !activity.archived })">
          {{ activity.archived ? 'restore' : 'archive' }}
        </button>
      </li>
      <li>
        <form class="row" @submit.prevent="addActivity(folder.id)">
          <input v-model="newActivity[folder.id]" class="grow" placeholder="new activity" maxlength="15" required>
          <button>add</button>
        </form>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.title { color: var(--hi); letter-spacing: 0.15em; }
.archived { opacity: 0.45; }
</style>
