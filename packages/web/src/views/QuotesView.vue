<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api } from '../api';

type Quote = { id: number; body: string; source: string | null };

const quotes = ref<Quote[]>([]);
const body = ref('');
const source = ref('');

async function load() {
  quotes.value = await api<Quote[]>('GET', '/quotes');
}
onMounted(load);

async function add() {
  await api('POST', '/quotes', { body: body.value, source: source.value || null });
  body.value = '';
  source.value = '';
  await load();
}

async function remove(quote: Quote) {
  if (!window.confirm('Delete this quote?')) return;
  await api('DELETE', `/quotes/${quote.id}`);
  await load();
}
</script>

<template>
  <form class="row" @submit.prevent="add">
    <input v-model="body" class="grow" placeholder="quote" maxlength="500" required>
    <input v-model="source" placeholder="source" maxlength="100">
    <button>keep</button>
  </form>
  <p v-if="quotes.length === 0" class="muted">The vault is empty.</p>
  <ul>
    <li v-for="quote in quotes" :key="quote.id" class="quote row">
      <blockquote class="grow">
        {{ quote.body }}
        <footer v-if="quote.source" class="muted">{{ quote.source }}</footer>
      </blockquote>
      <button class="icon" title="Delete" @click="remove(quote)">x</button>
    </li>
  </ul>
</template>

<style scoped>
.quote { align-items: flex-start; border-bottom: 1px solid var(--line); padding: 0.75rem 0; }
blockquote { margin: 0; color: var(--hi); }
footer { margin-top: 0.25rem; }
</style>
