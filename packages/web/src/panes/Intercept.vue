<script setup lang="ts">
// The vault: words kept for him to say on the device. Written in here, each
// shown as a ring of his script, all of them listed below.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import Frame from '../components/Frame.vue';
import { drawLogo, logoFor, mixLogo } from '../gl/logogram';
import Plate from '../components/Plate.vue';
import art from '../gl/art.json';
import { catSprite } from '../gl/plate';
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

// His script: the words as a logogram, and one logogram turning into the next
// when the intercept changes - nothing here cuts.
const glyph = ref<HTMLCanvasElement | null>(null);

// Him, at the foot of the roll, saying it. Drawn small and looking up at the
// words, the way he does when he is quoting somebody he approves of.
const him = ref<HTMLCanvasElement | null>(null);
catSprite(art.cameo, 300).then((c) => { him.value = c; });
const reader = (g: CanvasRenderingContext2D, w: number, h: number, t: number) => {
  const c = him.value;
  if (!c) return;
  const size = Math.min(w, h) * 1.02;
  const bob = Math.sin(t * 0.7) * h * 0.025;
  g.drawImage(c, w / 2 - size / 2, h - size * 0.99 + bob, size, size);
};
let shown = logoFor(''), from = shown, to = shown;
let turn = 1, raf = 0, ro: ResizeObserver | null = null;

function paint(t: number) {
  const c = glyph.value;
  if (!c) return;
  const box = c.getBoundingClientRect();
  const s = Math.max(1, Math.round(Math.min(box.width, box.height) * 2));
  if (c.width !== s) { c.width = s; c.height = s; }
  const x = c.getContext('2d')!;
  x.clearRect(0, 0, s, s);
  drawLogo(x, s, s, shown, t);
}

function frame(now: number) {
  const t = now / 1000;
  if (turn < 1) {
    turn = Math.min(1, turn + 0.022);
    const u = turn < 0.5 ? 2 * turn * turn : 1 - Math.pow(-2 * turn + 2, 2) / 2;
    shown = mixLogo(from, to, u);
  }
  paint(t);
  raf = requestAnimationFrame(frame);
}

// A new intercept is written over the old one, not swapped with it.
watch(quote, (q) => {
  from = shown;
  to = logoFor(q?.body ?? '');
  turn = 0;
}, { immediate: true });

onMounted(() => {
  ro = new ResizeObserver(() => paint(performance.now() / 1000));
  if (glyph.value) ro.observe(glyph.value);
  raf = requestAnimationFrame(frame);
});
onBeforeUnmount(() => { cancelAnimationFrame(raf); ro?.disconnect(); });

const count = computed(() => state.quotes.length);
const at = computed(() => (count.value ? (index.value % count.value) + 1 : 0));
const step = (d: number) => { if (count.value) index.value = (index.value + count.value + d) % count.value; };
</script>

<template>
  <div class="intercept">
    <Frame class="script" title="his script // the words, as he would write them" flush>
      <canvas ref="glyph" aria-label="The quote drawn as a ring of his script"></canvas>
    </Frame>

    <Frame class="current" :title="`intercept ${String(at).padStart(2, '0')} of ${String(count).padStart(2, '0')} // he says these on the device`">
      <div class="win">
        <div class="rod top" aria-hidden="true"></div>
        <div class="ticks" aria-hidden="true"><i v-for="n in 24" :key="n"></i></div>
        <transition name="say" mode="out-in">
          <div :key="quote?.id ?? 'empty'" class="words">
            <blockquote v-if="quote">{{ quote.body }}</blockquote>
            <p v-else class="empty">The vault is empty. Give him something worth saying.</p>
          </div>
        </transition>
        <div class="rod bottom" aria-hidden="true"></div>
        <div class="reader" aria-hidden="true"><Plate :draw="reader" :active="active" animated :cell="3" /></div>
      </div>
      <div class="foot">
        <cite>{{ quote?.source ? `source // ${quote.source}` : 'source // unattributed' }}</cite>
        <div class="row nav">
          <button class="btn quiet" aria-label="Previous intercept" @click="step(-1)">&lt;&lt; prev</button>
          <span class="pix count">{{ String(at).padStart(2, '0') }}/{{ String(count).padStart(2, '0') }}</span>
          <button class="btn quiet" aria-label="Next intercept" @click="step(1)">next &gt;&gt;</button>
        </div>
      </div>
    </Frame>

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
.script { position: relative; }
.script canvas { width: 100%; height: 100%; object-fit: contain; display: block; }
.script::after { content: ''; position: absolute; inset: 0; pointer-events: none;
  background: radial-gradient(circle at 50% 50%, transparent 52%, rgba(18, 18, 18, .55) 78%); }
.current { grid-area: current; }
.current :deep(.body) { display: flex; flex-direction: column; gap: 14px; min-height: 0; }
/* The roll the words are written on: a rod at each end, the sheet between
   them, ruled and ticked, always the same height so nothing moves when the
   words change. He sits at the foot of it, reading. */
.win { position: relative; flex: 1; min-height: 210px; display: grid; align-items: center;
  padding: 26px 96px 26px 36px; overflow: hidden;
  background: linear-gradient(to right, rgba(197, 188, 171, .05), transparent 12%, transparent 88%, rgba(197, 188, 171, .05)); }
.rod { position: absolute; left: 0; right: 0; height: 13px; background:
    linear-gradient(to bottom, var(--faint), var(--low) 34%, var(--ground) 62%, var(--faint));
  border-top: 1px solid var(--dim); border-bottom: 1px solid var(--dim); }
.rod::before, .rod::after { content: ''; position: absolute; top: -3px; width: 9px; height: 19px; background: var(--low); border: 1px solid var(--dim); }
.rod::before { left: -3px; }
.rod::after { right: -3px; }
.rod.top { top: 0; }
.rod.bottom { bottom: 0; }
.reader { position: absolute; right: 10px; bottom: 14px; width: 92px; height: 78px; opacity: .9; display: flex; flex-direction: column; }
.win::before { content: ''; position: absolute; inset: 0; pointer-events: none;
  background: repeating-linear-gradient(to bottom, rgba(197, 188, 171, .04) 0 1px, transparent 1px 4px); }
.ticks { position: absolute; left: 12px; top: 24px; bottom: 24px; display: flex; flex-direction: column; justify-content: space-between; }
.ticks i { width: 7px; height: 2px; background: var(--faint); }
.ticks i:nth-child(6n + 1) { width: 13px; background: var(--low); }
.words { min-width: 0; }
blockquote { margin: 0; font: 400 clamp(19px, 2.1vw, 32px)/1.32 var(--mono); color: var(--hi); text-wrap: balance; }
blockquote::before { content: '> '; color: var(--dim); }
.say-enter-active, .say-leave-active { transition: opacity .34s var(--out), transform .34s var(--out), filter .34s var(--out); }
.say-enter-from { opacity: 0; transform: translateY(10px); filter: blur(3px); }
.say-leave-to { opacity: 0; transform: translateY(-10px); filter: blur(3px); }
.foot { display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap; }
.nav { gap: 10px; }
.count { color: var(--phos); min-width: 46px; text-align: center; }
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
@media (max-width: 860px) {
  .intercept { display: flex; flex-direction: column; }
  .script { min-height: 300px; }
  .vault { min-height: 300px; }
  /* He stands out of the way of the words on a narrow roll. */
  .win { padding: 24px 68px 24px 26px; }
  .reader { width: 62px; height: 58px; right: 6px; bottom: 10px; }
}
</style>
