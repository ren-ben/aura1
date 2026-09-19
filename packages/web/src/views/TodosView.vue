<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api, localDate } from '../api';
import { react } from '../kaelthos/mood';

type Todo = { id: number; body: string; dueDate: string | null; done: boolean };

const todos = ref<Todo[]>([]);
const body = ref('');
const dueDate = ref(localDate());

async function load() {
  todos.value = await api<Todo[]>('GET', '/todos');
}
onMounted(load);

// The device's TODAY list will be the first group: due today or overdue.
const groups = computed(() => {
  const today = localDate();
  const open = todos.value.filter((t) => !t.done);
  return [
    { name: 'TODAY', items: open.filter((t) => t.dueDate !== null && t.dueDate <= today) },
    { name: 'UPCOMING', items: open.filter((t) => t.dueDate !== null && t.dueDate > today) },
    { name: 'SOMEDAY', items: open.filter((t) => t.dueDate === null) },
    { name: 'DONE', items: todos.value.filter((t) => t.done) },
  ].filter((g) => g.items.length);
});

async function add() {
  await api('POST', '/todos', { body: body.value, dueDate: dueDate.value || null });
  body.value = '';
  await load();
}

async function toggle(todo: Todo) {
  await api('PATCH', `/todos/${todo.id}`, { done: !todo.done });
  await load();
  const today = localDate();
  const due = todos.value.filter((t) => t.dueDate !== null && t.dueDate <= today);
  if (todo.done) react('questioning', 2000);
  else if (due.length && due.every((t) => t.done)) react('overjoyed', 5000);
  else react('happy');
}

async function remove(todo: Todo) {
  await api('DELETE', `/todos/${todo.id}`);
  await load();
}
</script>

<template>
  <form class="row" @submit.prevent="add">
    <input v-model="body" class="grow" placeholder="what needs doing" maxlength="200" required>
    <input v-model="dueDate" type="date" title="Leave empty for someday">
    <button>add</button>
  </form>
  <p v-if="todos.length === 0" class="muted">Nothing to do.</p>
  <section v-for="group in groups" :key="group.name">
    <h2>{{ group.name }}</h2>
    <ul>
      <li v-for="todo in group.items" :key="todo.id" class="row">
        <input type="checkbox" :checked="todo.done" @change="toggle(todo)">
        <span class="grow" :class="{ muted: todo.done }">{{ todo.body }}</span>
        <span v-if="todo.dueDate" class="muted">{{ todo.dueDate }}</span>
        <button class="icon" title="Delete" @click="remove(todo)">x</button>
      </li>
    </ul>
  </section>
</template>
