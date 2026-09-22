<script setup lang="ts">
// The vault: words kept for him to say on the device. Written in here, each
// shown as a ring of his script, all of them listed below.
import { computed, onMounted, ref, watch } from 'vue';
import Frame from '../components/Frame.vue';
import { rng } from '../gl/engine';
import { actions, state, type Quote } from '../store';

defineProps<{ active: boolean }>();

const index = ref(0);
const quote = computed<Quote | undefined>(() => state.quotes[index.value % Math.max(1, state.quotes.length)]);
const body = ref(''), source = ref('');
async function add() {
  const b = body.value.trim();
  if (!b) return;
  if (await actions.addQuote(b, source.value.trim() || null)) { body.value = ''; source.value = ''; index.value = 0; }
}
async function remove(q: Quote) { if (window.confirm('Take these words out of the vault?')) await actions.removeQuote(q); }

// His script: a ring drawn from the words, seeded by them, like the circular
// writing in Arrival. The same words always make the same ring.
const glyph = ref<HTMLCanvasElement | null>(null);
function draw() {
  const c = glyph.value, q = quote.value;
  if (!c) return;
  const s = (c.width = c.height = 760), x = c.getContext('2d')!;
  x.fillStyle = '#121212'; x.fillRect(0, 0, s, s);
  if (!q) return;
  const r = rng([...q.body].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) % 2147483646, 7) + 1);
  const cx = s / 2, cy = s / 2, R = 240;
  x.fillStyle = '#c5bcab';
  for (let a = 0; a < Math.PI * 2; a += 0.004) {
    const w = 14 + Math.sin(a * 3 + r()) * 5 + Math.sin(a * 11) * 3;
    for (let k = 0; k < 3; k++) { const rr = R + (r() - 0.5) * w; x.globalAlpha = 0.35 + r() * 0.65; x.fillRect(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 2.6, 2.6); }
  }
  for (const word of q.body.split(/\s+/)) {
    const a = r() * Math.PI * 2, len = 16 + word.length * 10, out = r() < 0.5 ? 1 : -1;
    for (let k = 0; k < len; k++) {
      const rr = R + out * k * 0.9, wob = Math.sin(k / 6) * 0.025;
      x.globalAlpha = 1 - k / len;
      x.fillRect(cx + Math.cos(a + wob) * rr, cy + Math.sin(a + wob) * rr, 3.2, 3.2);
    }
    if (word.length > 6) { x.globalAlpha = 0.9; x.beginPath(); x.arc(cx + Math.cos(a) * (R + out * len * 0.9), cy + Math.sin(a) * (R + out * len * 0.9), 6 + r() * 8, 0, 7); x.fill(); }
  }
  x.globalAlpha = 1;
}
onMounted(draw);
watch(quote, draw);
</script>

<template>
  <div class="intercept">
    <Frame class="script" title="his script // the words, as he would write them" flush>
      <canvas ref="glyph" aria-label="The quote drawn as a ring of his script"></canvas>
    </Frame>

    <div class="current">
      <div class="pix">intercept {{ String((index % Math.max(1, state.quotes.length)) + 1).padStart(2, '0') }} of {{ String(state.quotes.length).padStart(2, '0') }} // he says these on the device</div>
      <blockquote v-if="quote">{{ quote.body }}</blockquote>
      <p v-else class="empty">The vault is empty. Give him something worth saying.</p>
      <cite v-if="quote?.source">source // {{ quote.source }}</cite>
      <div class="row nav">
        <button class="btn quiet" @click="index = (index + state.quotes.length - 1) % state.quotes.length">previous</button>
        <button class="btn quiet" @click="index = (index + 1) % state.quotes.length">next</button>
      </div>
    </div>

    <Frame class="write" title="add to the vault">
      <form class="form" @submit.prevent="add">
        <label class="lab"><span>the words</span><textarea v-model="body" class="field" rows="4" maxlength="500" placeholder="the line that stayed with you"></textarea></label>
        <label class="lab"><span>whose</span><input v-model="source" class="field" maxlength="100" placeholder="who said it, if anyone"></label>
        <div class="row"><span class="note grow">{{ body.length }} of 500</span><button class="btn" type="submit">keep it</button></div>
      </form>
    </Frame>

    <Frame class="vault" :title="`the vault // ${state.quotes.length} kept`" scroll>
      <div v-for="(q, i) in state.quotes" :key="q.id" class="q" :class="{ sel: q === quote }" @click="index = i">
        <span class="t">{{ q.body }}</span><span class="pix">{{ q.source ?? '' }}</span>
        <button class="x" :aria-label="`Delete: ${q.body}`" @click.stop="remove(q)">del</button>
      </div>
    </Frame>
  </div>
</template>

<style scoped>
.intercept { display: grid; gap: 18px; grid-template-columns: minmax(0, .9fr) minmax(0, 1.1fr) minmax(0, .9fr); grid-template-rows: minmax(0, 1fr) minmax(0, .8fr);
  grid-template-areas: "script current current" "write vault vault"; }
.script { grid-area: script; }
.script canvas { width: 100%; height: 100%; object-fit: contain; display: block; }
.current { grid-area: current; display: flex; flex-direction: column; justify-content: center; gap: 14px; padding: 0 10px; }
blockquote { margin: 0; font: 400 clamp(22px, 2.6vw, 40px)/1.28 var(--mono); color: var(--hi); text-wrap: balance; }
blockquote::before { content: '> '; color: var(--dim); }
cite { font: 400 11px var(--pix); color: var(--dim); font-style: normal; text-transform: uppercase; }
.write { grid-area: write; }
.form { display: grid; gap: 12px; }
.form textarea { resize: vertical; font: inherit; }
.vault { grid-area: vault; }
.q { display: grid; grid-template-columns: 1fr auto auto; gap: 12px; align-items: baseline; padding: 8px 6px; border-bottom: 3px dotted var(--faint); cursor: pointer; }
.q .t { color: var(--dim); }
.q.sel .t, .q:hover .t { color: var(--hi); }
@media (max-aspect-ratio: 5/4) {
  .intercept { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) auto minmax(0, .8fr); grid-template-areas: "script current" "write write" "vault vault"; }
}
@media (max-width: 860px) { .intercept { display: flex; flex-direction: column; } .script { min-height: 300px; } .vault { min-height: 300px; } }
</style>
