<script setup lang="ts">
// The folios over the Academy: Moodle's and your own PDFs, a course at a
// time, its tome taken apart as the Exploded Codex. Drop a PDF anywhere on
// it to file it under the course on screen.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import 'katex/dist/katex.min.css';
import { FOLIO_KINDS, RUNGS, type AskDto, type Cite, type FolioDto, type FolioKind, type TaskDto } from '@aura/shared';
import { Codex } from '../codex';
import { KIND_LABEL, pdfUrl, shelvesOf, tomesOf, type Folios, type Plate } from '../folios';
import { askApi, folioApi, state } from '../store';
import { prose } from '../lecturemap';
import { termOf } from '../academy';

const props = defineProps<{ nr?: string }>();
const emit = defineEmits<{ close: [] }>();
const closing = ref(false);
function shut() {
  if (closing.value) return;
  closing.value = true;
  setTimeout(() => emit('close'), matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 420);
}

const TERM = termOf();
const all = ref<Folios | null>(null);
const error = ref('');
async function load() {
  try { all.value = await folioApi.list(); error.value = all.value.error ?? ''; } catch (e) { error.value = e instanceof Error ? e.message : 'the folios did not come'; }
}
// While Moodle is being read, asked again every few seconds.
let poll = 0;
watch(() => all.value?.syncing, (on) => { clearInterval(poll); if (on) poll = window.setInterval(load, 2500); });

const shelves = computed(() => (all.value ? shelvesOf(state.courses, all.value, TERM.name) : []));
const shelfKey = ref('');
const shelf = computed(() => shelves.value.find((s) => s.key === shelfKey.value) ?? null);
const tomes = computed(() => (all.value && shelf.value ? tomesOf(all.value, shelf.value.nrs, shelf.value.semester) : []));
const tomeKey = ref('');
const tome = computed(() => tomes.value.find((t) => t.key === tomeKey.value) ?? tomes.value[0] ?? null);
// The course asked for, else the first with anything in it.
watch(shelves, (list) => {
  if (list.some((s) => s.key === shelfKey.value)) return;
  shelfKey.value = (list.find((s) => props.nr && s.nrs.includes(props.nr)) ?? list.find((s) => s.count) ?? list[0])?.key ?? '';
});

// ---- the drawing ---------------------------------------------------------
const stage = ref<HTMLElement | null>(null);
const scene = shallowRef<Codex | null>(null);
const pick = ref(-1);
const open = ref(true);
watch(() => tome.value?.key + JSON.stringify(tome.value?.plates.map((p) => p.note)), () => {
  pick.value = -1;
  scene.value?.set({ chapters: tome.value?.chapters ?? [], plates: tome.value?.plates ?? [] });
});
watch(pick, (i) => scene.value?.pick(i));
watch(open, (on) => scene.value?.explode(on));
const choose = (i: number) => { pick.value = pick.value === i || i < 0 ? -1 : i; };

const chapter = computed(() => (tome.value && pick.value >= 0 ? tome.value.chapters[pick.value] ?? null : null));
const hanging = computed(() => tome.value?.plates.filter((p) => p.ch === pick.value) ?? []);
// In the binder a chapter is a file of its own.
const file = computed<FolioDto | null>(() => (tome.value && pick.value >= 0 ? tome.value.files[pick.value] ?? null : tome.value?.folio ?? null));

// ---- the page itself, rendered from the PDF in the console's two inks ------
const page = ref<HTMLCanvasElement | null>(null);
const docs = new Map<number, import('pdfjs-dist').PDFDocumentLoadingTask>();
async function render() {
  const c = chapter.value, f = tome.value?.folio ?? file.value;
  if (!c || !f || state.demo || !page.value) return;
  const canvas = page.value;
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  if (!docs.has(f.id)) docs.set(f.id, pdfjs.getDocument({ url: pdfUrl(f) }));
  const doc = await docs.get(f.id)!.promise;
  const p = await doc.getPage(tome.value?.folio ? c.from : 1);
  const vp = p.getViewport({ scale: 1 });
  const viewport = p.getViewport({ scale: 520 / vp.width });
  canvas.width = viewport.width; canvas.height = viewport.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  await p.render({ canvas, canvasContext: ctx, viewport }).promise;
  // White paper becomes the deep ground, black ink the console's phosphor.
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const t = 1 - (d[i]! * 0.3 + d[i + 1]! * 0.59 + d[i + 2]! * 0.11) / 255;
    d[i] = 14 + t * 216; d[i + 1] = 13 + t * 211; d[i + 2] = 12 + t * 200;
  }
  ctx.putImageData(img, 0, 0);
}
watch([chapter, file], () => nextTick(render));

// ---- Moodle --------------------------------------------------------------
const user = ref('');
const pass = ref('');
const binding = ref(false);
async function bind() {
  binding.value = true; error.value = '';
  try { await folioApi.bind(user.value.trim(), pass.value); pass.value = ''; await load(); } catch (e) { error.value = e instanceof Error ? e.message : 'Moodle did not answer'; }
  binding.value = false;
}
async function sync() { error.value = ''; try { await folioApi.sync(); await load(); } catch (e) { error.value = e instanceof Error ? e.message : 'failed'; } }
async function unbind() { await folioApi.unbind(); await load(); }
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).toLowerCase() : 'never');

async function setKind(f: FolioDto, kind: FolioKind) { await folioApi.kind(f.id, kind); await load(); }
async function strike(f: FolioDto) { await folioApi.remove(f.id); pick.value = -1; await load(); }

// ---- dropped in by hand --------------------------------------------------
const dragging = ref(false);
const uploading = ref('');
async function drop(e: DragEvent) {
  dragging.value = false;
  const s = shelf.value;
  if (!s) return;
  for (const f of [...(e.dataTransfer?.files ?? [])].filter((x) => x.type === 'application/pdf' || /\.pdf$/i.test(x.name))) {
    uploading.value = f.name;
    try { await folioApi.upload(f, s.nrs[0]!, s.semester); } catch (err) { error.value = err instanceof Error ? err.message : 'the upload failed'; }
  }
  uploading.value = '';
  await load();
}
const picker = ref<HTMLInputElement | null>(null);
async function chosen() {
  const files = picker.value?.files;
  if (files?.length) await drop({ dataTransfer: { files } } as unknown as DragEvent);
  if (picker.value) picker.value.value = '';
}

// ---- asking: questions to the course's folios ------------------------------
const asked = ref<AskDto[]>([]);
async function loadAsks() {
  const s = shelf.value;
  asked.value = s ? await askApi.list(s.nrs, s.semester).catch(() => []) : [];
}
watch(() => shelf.value?.key, loadAsks);
let askPoll = 0;
watch(() => asked.value.some((a) => a.status === 'thinking'), (on) => { clearInterval(askPoll); if (on) askPoll = window.setInterval(loadAsks, 2500); });
const question = ref('');
const asking = ref(false);
async function ask() {
  const s = shelf.value, q = question.value.trim();
  if (!s || q.length < 3 || asking.value) return;
  asking.value = true; error.value = '';
  try { await askApi.ask(s.nrs[0]!, s.semester, q); question.value = ''; await loadAsks(); } catch (e) { error.value = e instanceof Error ? e.message : 'he did not answer'; }
  asking.value = false;
}
const questions = computed(() => asked.value.filter((a) => a.kind === 'ask'));
async function forget(a: AskDto) { await askApi.forget(a.id); await loadAsks(); }
const citeUrl = (c: Cite) => `/api/v1/academy/folios/${c.folioId}/pdf#page=${c.page}`;
const short = (title: string) => title.replace(/\.pdf$/i, '');
const reading = (a: AskDto) => (a.pages.length ? `reading ${a.pages.map((p) => `${short(p.title)} p ${p.from}${p.to > p.from ? `-${p.to}` : ''}`).join(', ')}` : 'finding the pages');
// The chapters the latest answer cited light up in the drawing.
watch([asked, tome], () => {
  const f = tome.value?.folio, last = questions.value.find((a) => a.status === 'ready');
  scene.value?.mark(f && last ? last.cites.filter((c) => c.folioId === f.id).map((c) => f.outline.findIndex((ch) => c.page >= ch.from && c.page <= ch.to)).filter((i) => i >= 0) : []);
});

// ---- the ladder on an exercise sheet or a past exam ----------------------
const sheet = computed(() => (file.value && (file.value.kind === 'sheet' || file.value.kind === 'exam') ? file.value : null));
const tasks = ref<TaskDto[]>([]);
watch(sheet, async (f) => { tasks.value = f ? await askApi.tasks(f.id).catch(() => []) : []; }, { immediate: true });
const rungsOf = (n: number) => asked.value.filter((a) => a.kind === 'hint' && a.folioId === sheet.value?.id && a.task === n).sort((a, b) => a.rung! - b.rung!);
const climbed = (n: number) => rungsOf(n).filter((a) => a.status === 'ready').length;
async function climb(n: number, rung: number) {
  error.value = '';
  try { await askApi.hint(sheet.value!.id, n, rung); await loadAsks(); } catch (e) { error.value = e instanceof Error ? e.message : 'no hint came'; }
}

const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (pick.value >= 0) pick.value = -1; else shut(); } };
onMounted(async () => {
  window.addEventListener('keydown', key);
  scene.value = new Codex(stage.value!, choose);
  await load();
});
onBeforeUnmount(() => { window.removeEventListener('keydown', key); clearInterval(poll); clearInterval(askPoll); scene.value?.dispose(); docs.forEach((d) => d.destroy()); });
const plateLink = (p: Plate) => (p.folio ? pdfUrl(p.folio) : null);
</script>

<template>
  <Teleport to="body">
    <div class="cx-back" :class="{ closing }" @pointerdown.self="shut()">
      <section class="cx" role="dialog" aria-modal="true" aria-label="The folios" @dragover.prevent="dragging = !!shelf" @dragleave.self="dragging = false" @drop.prevent="drop">
        <header class="cx-bar">
          <h2 class="cx-title">The Folios</h2>
          <nav class="shelves" aria-label="courses">
            <button v-for="s in shelves" :key="s.key" class="chip" :class="{ on: s.key === shelfKey, none: !s.count }" @click="shelfKey = s.key; tomeKey = ''">
              {{ s.label }}<i class="tek">{{ s.count }}</i>
            </button>
          </nav>
          <button class="x" aria-label="close" @click="shut()">close</button>
        </header>
        <div class="cx-body">
          <div class="cx-main">
            <div class="tomes">
              <button v-for="t in tomes" :key="t.key" class="chip" :class="{ on: t.key === tome?.key }" @click="tomeKey = t.key">{{ t.title }}</button>
              <span class="grow"></span>
              <button v-if="tome" class="chip" @click="open = !open">{{ open ? 'close the book' : 'take it apart' }}</button>
              <button v-if="shelf" class="chip" @click="picker?.click()">add a pdf</button>
              <input ref="picker" type="file" accept="application/pdf" multiple hidden @change="chosen" />
            </div>
            <div ref="stage" class="cx-stage" :class="{ drag: dragging }" aria-label="The chosen volume, taken apart into its chapters. Pick one to slide it out."></div>
            <p v-if="all && !tome" class="cx-empty fell">
              {{ shelf ? `Nothing from ${shelf.label} yet.` : 'No courses on the shelf yet.' }}
              {{ all.moodle.bound ? 'Moodle has nothing here; drop a PDF anywhere to file it.' : 'Bind Moodle on the right, or drop a PDF anywhere to file it.' }}
            </p>
            <div v-if="dragging || uploading" class="cx-drop pix">{{ uploading ? `reading ${uploading}` : `drop to file under ${shelf?.label}` }}</div>
            <span class="hint">drag to turn // pick a chapter // esc lets go</span>
          </div>

          <aside class="cx-side">
            <section class="bond" :class="{ broken: all?.moodle.refusedAt }">
              <div class="row"><span class="eye" :class="{ off: !all?.moodle.bound || all?.moodle.refusedAt }"></span><b class="pix hi">moodle</b>
                <span v-if="all?.moodle.bound && !all.moodle.refusedAt" class="pix">bound as {{ all.moodle.username }}</span>
                <span v-else-if="all?.moodle.refusedAt" class="pix">token refused {{ when(all.moodle.refusedAt) }}</span>
                <span v-else class="pix">not bound</span>
              </div>
              <template v-if="all?.moodle.bound && !all.moodle.refusedAt">
                <p class="note">{{ all.folios.filter((f) => f.source === 'moodle').length }} pdfs // {{ all.decks.length }} decks // read {{ when(all.moodle.syncedAt) }}</p>
                <span class="row"><button class="btn" :class="{ busy: all.syncing }" :disabled="all.syncing" @click="sync">{{ all.syncing ? 'reading moodle' : 'read it now' }}</button><button class="x" @click="unbind">unbind</button></span>
              </template>
              <form v-else class="bind" @submit.prevent="bind">
                <label class="lab" for="cx-user"><span>u:account id</span><input id="cx-user" v-model="user" class="field" autocomplete="username" placeholder="musterm99" /></label>
                <label class="lab" for="cx-pass"><span>password</span><input id="cx-pass" v-model="pass" class="field" type="password" autocomplete="current-password" /></label>
                <button class="btn" :class="{ busy: binding }" :disabled="binding || !user || !pass">{{ binding ? 'through weblogin' : 'bind' }}</button>
                <p class="note">Your password goes to weblogin once. Only Moodle's token is kept, and every morning the server reads your courses with it.</p>
              </form>
              <p v-if="error" class="note err">{{ error }}</p>
            </section>

            <section v-if="tome" class="about">
              <template v-if="!chapter">
                <span class="pix">{{ tome.folio ? KIND_LABEL[tome.folio.kind] : 'everything without a skript' }}</span>
                <h3>{{ tome.title }}</h3>
                <p class="pix">{{ tome.meta }}</p>
                <p class="note">{{ tome.chapters.length }} {{ tome.folio ? 'chapters' : 'files' }}; pick one on the left.</p>
              </template>
              <template v-else>
                <span class="pix">{{ tome.folio ? `chapter ${pick + 1} of ${tome.chapters.length}` : file ? KIND_LABEL[file.kind] : '' }} // p {{ chapter.from }}-{{ chapter.to }}</span>
                <h3>{{ chapter.title }}</h3>
                <canvas v-if="!state.demo" ref="page" class="page" :aria-label="`the first page of ${chapter.title}`"></canvas>
              </template>
              <div v-if="file" class="acts">
                <a class="btn" :href="pdfUrl(file)" target="_blank" rel="noopener">open the pdf</a>
                <select class="pick" :value="file.kind" aria-label="what it is" @change="setKind(file!, ($event.target as HTMLSelectElement).value as FolioKind)">
                  <option v-for="k in FOLIO_KINDS" :key="k" :value="k">{{ KIND_LABEL[k] }}</option>
                </select>
                <button v-if="file.source === 'upload'" class="x" @click="strike(file!)">strike it</button>
              </div>
              <div v-if="(chapter ? hanging : tome.loose).length" class="hang">
                <span class="pix">{{ chapter ? 'hanging off it' : 'also in this course' }}</span>
                <component :is="plateLink(p) ? 'a' : 'div'" v-for="p in (chapter ? hanging : tome.loose)" :key="p.name" class="plate" :href="plateLink(p) ?? undefined" target="_blank" rel="noopener">
                  <i class="pix">{{ p.kind === 'deck' ? 'dk' : 'pdf' }}</i><span><b>{{ p.name }}</b><em class="pix">{{ p.note }}</em></span>
                </component>
              </div>
            </section>

            <section v-if="sheet" class="ladder">
              <span class="pix">the ladder // {{ sheet.title }}</span>
              <p class="note">One rung at a time: where it stands, a nudge, the next step, and only then the whole solution.</p>
              <div v-for="t in tasks" :key="t.n" class="task">
                <b class="fell">{{ t.n ? `Aufgabe ${t.n}` : 'The whole sheet' }}</b><span v-if="t.n" class="note">{{ t.title }}</span>
                <div class="rungs">
                  <button v-for="(r, i) in RUNGS" :key="r" class="rung" :class="{ done: rungsOf(t.n)[i]?.status === 'ready', busy: rungsOf(t.n)[i]?.status === 'thinking' }"
                          :disabled="!!rungsOf(t.n)[i] || i > climbed(t.n)" @click="climb(t.n, i + 1)">{{ r }}</button>
                </div>
                <div v-for="h in rungsOf(t.n)" :key="h.id" class="said">
                  <span class="pix">{{ RUNGS[h.rung! - 1] }}</span>
                  <div v-if="h.answer" class="prose" v-html="prose(h.answer)"></div>
                  <p v-else-if="h.status === 'thinking'" class="note thinking">{{ reading(h) }}</p>
                  <p v-else class="note err">{{ h.error }}</p>
                  <span v-if="h.cites.length" class="cites"><a v-for="c in h.cites" :key="`${c.folioId}.${c.page}`" :href="citeUrl(c)" target="_blank" rel="noopener">{{ short(c.title) }} p {{ c.page }}</a></span>
                </div>
              </div>
            </section>

            <section v-if="shelf" class="asking">
              <span class="pix">ask kael&apos;thos // from the folios of {{ shelf.label }}</span>
              <form class="askform" @submit.prevent="ask">
                <label class="lab" for="cx-q"><span>your question</span><textarea id="cx-q" v-model="question" class="field" rows="2" placeholder="Warum ist das Integral von 1/x gleich ln|x|?" @keydown.ctrl.enter.prevent="ask" @keydown.meta.enter.prevent="ask"></textarea></label>
                <button class="btn" :class="{ busy: asking }" :disabled="asking || question.trim().length < 3">ask</button>
              </form>
              <article v-for="a in questions" :key="a.id" class="said">
                <p class="q fell">{{ a.question }}<button class="x" aria-label="forget this question" @click="forget(a)">forget</button></p>
                <div v-if="a.answer" class="prose" v-html="prose(a.answer)"></div>
                <p v-else-if="a.status === 'thinking'" class="note thinking">{{ reading(a) }}</p>
                <p v-else class="note err">{{ a.error }}</p>
                <span v-if="a.cites.length" class="cites"><a v-for="c in a.cites" :key="`${c.folioId}.${c.page}`" :href="citeUrl(c)" target="_blank" rel="noopener">{{ short(c.title) }} p {{ c.page }}</a></span>
              </article>
            </section>
          </aside>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.cx-back { position: fixed; inset: 0; z-index: 55; display: grid; place-items: center; background: rgba(12, 11, 10, .72); backdrop-filter: blur(6px) grayscale(1); animation: fade .45s var(--out); }
.cx { width: min(96vw, 1560px); height: 92vh; background: var(--ground); border: 3px dotted var(--low); display: flex; flex-direction: column; min-height: 0;
  box-shadow: 0 30px 120px rgba(0, 0, 0, .6), 0 0 80px rgba(197, 188, 171, .05); animation: open .7s var(--ease); }
@keyframes fade { from { opacity: 0; } }
@keyframes open { from { clip-path: inset(49% 30% 49% 30%); opacity: .3; } 60% { clip-path: inset(0 0 0 0); } }
.cx-back.closing { animation: shut-fade .42s var(--ease) forwards; }
.cx-back.closing > .cx { animation: shut .42s var(--ease) forwards; pointer-events: none; }
@keyframes shut-fade { to { opacity: 0; } }
@keyframes shut { 40% { clip-path: inset(0 0 0 0); opacity: 1; } to { clip-path: inset(49% 30% 49% 30%); opacity: 0; } }

.cx-bar { display: flex; align-items: center; gap: 16px; padding: 8px 14px; border-bottom: 3px dotted var(--low); min-width: 0; }
.cx-title { margin: 0; font: 400 34px/.9 var(--goth); color: var(--hi); flex: none; }
.shelves { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; flex: 1; min-width: 0; }
.chip { border: 2px solid var(--low); padding: 4px 9px; font: 400 10px var(--pix); text-transform: uppercase; color: var(--dim); white-space: nowrap; flex: none;
  transition: border-color .3s var(--out), color .3s var(--out), background .3s var(--out); }
.chip:hover { color: var(--hi); border-color: var(--phos); }
.chip.on { color: var(--ground); background: var(--phos); border-color: var(--phos); }
.chip.none { opacity: .55; }
.chip i { font-style: normal; font-size: 11px; margin-left: 7px; color: inherit; }

.cx-body { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) 330px; }
.cx-main { position: relative; display: flex; flex-direction: column; min-height: 0; min-width: 0; }
.tomes { display: flex; gap: 6px; padding: 8px 12px; flex-wrap: wrap; align-items: center; }
.tomes .grow { flex: 1; }
.cx-stage { position: relative; flex: 1; min-height: 0; overflow: hidden; touch-action: none; user-select: none; transition: outline-color .3s var(--out); outline: 2px dashed transparent; outline-offset: -8px; }
.cx-stage.drag { outline-color: var(--phos); }
.cx-stage :deep(.cx-view) { display: block; width: 100%; height: 100%; image-rendering: pixelated; cursor: grab; }
.cx-stage :deep(.cx-view:active) { cursor: grabbing; }
.cx-stage :deep(.cx-lines) { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; overflow: visible; }
.cx-stage :deep(.cx-lines path) { fill: none; stroke: var(--phos); stroke-width: 1; transition: opacity .4s var(--out); }
.cx-stage :deep(.cx-lines path.dash) { stroke-dasharray: 3 4; stroke: var(--dim); }
.cx-stage :deep(.cx-lines path.hot) { stroke: var(--hi); stroke-width: 1.5; }
.cx-stage :deep(.cx-labels) { position: absolute; inset: 0; pointer-events: none; }
.cx-stage :deep(.cx-call) { position: absolute; left: 0; top: 0; display: grid; text-align: left; background: var(--ground); border: 1px solid var(--low); padding: 5px 9px 6px; white-space: nowrap; pointer-events: auto;
  transition: opacity .4s var(--out), border-color .25s var(--out); }
.cx-stage :deep(.cx-call b) { font: 400 16px/1.15 var(--fell); color: var(--phos); white-space: pre; }
.cx-stage :deep(.cx-call span) { font: 400 9.5px var(--pix); color: var(--dim); text-transform: uppercase; }
.cx-stage :deep(.cx-call.hot) { border-color: var(--hi); }
.cx-stage :deep(.cx-call.hot b) { color: var(--hi); }
.cx-stage :deep(.cx-call.side b) { font: 400 12px/1.3 var(--mono); }
.cx-stage :deep(.cx-call.side span) { margin-bottom: 4px; }
.cx-stage :deep(.cx-call.side span:last-child) { margin-bottom: 0; }
.cx-stage :deep(.cx-call.side b.new::after) { content: 'new'; font: 400 9px var(--pix); color: var(--ground); background: var(--hi); padding: 0 4px; margin-left: 8px; text-transform: uppercase; }
.cx-empty { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(420px, 80%); text-align: center; font-size: 18px; color: var(--phos); margin: 0; pointer-events: none; }
.cx-drop { position: absolute; left: 50%; bottom: 40px; transform: translateX(-50%); background: var(--ground); border: 2px solid var(--phos); padding: 8px 14px; color: var(--hi); pointer-events: none; }
.hint { position: absolute; right: 12px; bottom: 9px; font: 400 10px var(--pix); color: var(--dim); text-transform: uppercase; pointer-events: none; }

.cx-side { border-left: 3px dotted var(--low); background: var(--deep); padding: 14px; display: flex; flex-direction: column; gap: 16px; overflow: auto; min-height: 0; scrollbar-width: thin; }
.bond { display: grid; gap: 8px; padding-bottom: 14px; border-bottom: 3px dotted var(--low); }
.bond .row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.eye { width: 11px; height: 11px; border-radius: 50%; border: 2px solid var(--phos); position: relative; flex: none; }
.eye::after { content: ''; position: absolute; left: 2px; right: 2px; top: 0; bottom: 0; border-radius: 50%; background: var(--hi); transform: scaleX(.35); }
.eye.off { border-style: dashed; }
.eye.off::after { display: none; }
.bind { display: grid; gap: 8px; }
.note { margin: 0; color: var(--dim); font-size: 12px; }
.err { color: var(--hi); }
.about { display: grid; gap: 8px; align-content: start; }
.about h3 { margin: 0; font: 400 24px/1.1 var(--fell); color: var(--hi); overflow-wrap: anywhere; }
.page { width: 100%; height: auto; border: 2px solid var(--low); display: block; }
.acts { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.acts a.btn { text-decoration: none; color: inherit; }
.pick { background: var(--deep); border: 2px solid var(--low); color: var(--phos); padding: 5px 6px; font: 400 10px var(--pix); text-transform: uppercase; }
.hang { display: grid; gap: 6px; }
.plate { display: grid; grid-template-columns: 24px minmax(0, 1fr); gap: 8px; align-items: baseline; padding: 6px 8px; border: 1px solid var(--low); text-decoration: none; color: inherit; transition: border-color .25s var(--out); }
a.plate:hover { border-color: var(--phos); }
.plate i { font-style: normal; color: var(--hi); }
.plate b { display: block; font: 400 12px/1.3 var(--mono); color: var(--phos); overflow-wrap: anywhere; }
.plate em { font-style: normal; }

.ladder, .asking { display: grid; gap: 10px; padding-top: 14px; border-top: 3px dotted var(--low); }
.task { display: grid; gap: 6px; }
.task > b { font-size: 17px; color: var(--hi); font-weight: 400; }
.rungs { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4px; }
.rung { border: 2px solid var(--low); padding: 5px 4px; font: 400 9px/1.2 var(--pix); text-transform: uppercase; color: var(--dim); transition: border-color .3s var(--out), color .3s var(--out); }
.rung:not(:disabled):hover { border-color: var(--phos); color: var(--hi); }
.rung:disabled { cursor: default; }
.rung.done { border-color: var(--phos); color: var(--phos); }
.rung.busy { border-style: dashed; color: var(--hi); }
.askform { display: grid; gap: 8px; }
.askform textarea { resize: vertical; font: 400 15px/1.35 var(--fell); }
.said { display: grid; gap: 6px; padding: 10px; border: 1px solid var(--low); background: var(--ground); }
.said .q { margin: 0; display: flex; justify-content: space-between; gap: 10px; font-size: 16px; color: var(--hi); font-style: italic; }
.prose { font-size: 13px; line-height: 1.55; color: var(--phos); overflow-wrap: anywhere; }
.prose :deep(.para) { margin: 0 0 8px; }
.prose :deep(.para:last-child) { margin-bottom: 0; }
.prose :deep(.tex) { overflow-x: auto; margin: 4px 0; color: var(--hi); }
.thinking::after { content: '...'; animation: dots 1.2s steps(1) infinite; }
@keyframes dots { 50% { opacity: 0; } }
.cites { display: flex; flex-wrap: wrap; gap: 4px; }
.cites a { border: 1px solid var(--low); padding: 2px 6px; font: 400 9.5px var(--pix); text-transform: uppercase; color: var(--hi); text-decoration: none; }
.cites a:hover { border-color: var(--phos); }
.cx-stage :deep(.cx-call.cited) { border-color: var(--phos); box-shadow: 0 0 0 1px var(--phos); }

@media (max-width: 900px) {
  .cx { width: 100vw; height: 100dvh; border: 0; }
  .cx-body { grid-template-columns: 1fr; grid-template-rows: minmax(360px, 1fr) auto; overflow: auto; }
  .cx-side { border-left: 0; border-top: 3px dotted var(--low); overflow: visible; }
  .cx-title { font-size: 26px; }
  .cx-stage :deep(.cx-call.side) { display: none; }
  .cx-stage :deep(.cx-call b) { font-size: 13px; }
  .hint { display: none; }
}
@media (prefers-reduced-motion: reduce) { .cx, .cx-back { animation: none; } }
</style>
