<script setup lang="ts">
// The Library: what he has to read, and the reading of it. A book is parsed
// where it is dropped - the server is only ever given chapters of plain text -
// and whatever is marked here is on the device's glass at its next sync.
import { computed, ref, watch } from 'vue';
import Frame from '../components/Frame.vue';
import Plate from '../components/Plate.vue';
import art from '../gl/art.json';
import { catSprite } from '../gl/plate';
import { readBook } from '../books';
import { actions, chapterOf, duration, state, type Book, type Mark } from '../store';

defineProps<{ active: boolean }>();

const open = ref<Book | null>(null);
const chapter = ref<{ idx: number; title: string; body: string } | null>(null);
const loading = ref(false);
const taking = ref('');      // what is being read out of a file, while it is
const failed = ref('');
const contents = ref(false);
const page = ref<HTMLElement | null>(null);

const shelf = computed(() => state.books);
const marksHere = computed(() => state.marks
  .filter((m) => m.bookId === open.value?.id && m.chapterIdx === chapter.value?.idx)
  .sort((a, b) => a.start - b.start));
const marksOf = computed(() => state.marks.filter((m) => m.bookId === open.value?.id));

// The page, with everything kept out of it lit up in place.
const lines = computed(() => {
  const body = chapter.value?.body ?? '';
  if (!body) return [];
  const out: { text: string; mark: Mark | null }[] = [];
  let at = 0;
  for (const m of marksHere.value) {
    if (m.start > at) out.push({ text: body.slice(at, m.start), mark: null });
    out.push({ text: body.slice(m.start, m.end), mark: m });
    at = Math.max(at, m.end);
  }
  out.push({ text: body.slice(at), mark: null });
  return out.filter((p) => p.text);
});

async function openBook(b: Book, idx = b.chapterIdx) {
  open.value = b;
  loading.value = true;
  contents.value = false;
  try {
    chapter.value = await chapterOf(b.id, idx);
    // Back to where the reading was, as a fraction of the chapter.
    requestAnimationFrame(() => {
      const el = page.value;
      if (!el) return;
      el.scrollTop = idx === b.chapterIdx ? (b.through / 1000) * el.scrollHeight : 0;
    });
  } finally {
    loading.value = false;
  }
}

// Where the eye is, kept as a thousandth of the chapter so the device and the
// console can agree on a place without agreeing on a page.
let saving = 0;
function moved() {
  const el = page.value, b = open.value, c = chapter.value;
  if (!el || !b || !c) return;
  const through = Math.round((el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight)) * 1000);
  clearTimeout(saving);
  saving = window.setTimeout(() => actions.readTo(b, c.idx, Math.min(1000, Math.max(0, through))), 700);
}

const step = (d: number) => {
  const b = open.value, c = chapter.value;
  if (!b || !c) return;
  const idx = c.idx + d;
  if (idx >= 0 && idx < b.chapters.length) openBook(b, idx);
};

// A passage kept: whatever is selected, where it sits in the chapter.
async function keep() {
  const sel = window.getSelection();
  const b = open.value, c = chapter.value;
  if (!sel || sel.isCollapsed || !b || !c || !page.value) return;
  const text = sel.toString().trim();
  if (!text) return;
  const start = c.body.indexOf(text.slice(0, 80));
  if (start < 0) { failed.value = 'That passage is not on this page.'; return; }
  await actions.keep({ bookId: b.id, chapterIdx: c.idx, start, end: start + text.length, body: text });
  sel.removeAllRanges();
}

async function take(files: FileList | null) {
  const file = files?.[0];
  if (!file) return;
  failed.value = '';
  taking.value = `reading ${file.name}`;
  try {
    const parsed = await readBook(file);
    if (!parsed.chapters.length) throw new Error('Nothing readable came out of it.');
    taking.value = `keeping ${parsed.chapters.length} chapters`;
    await actions.addBook(parsed);
    if (parsed.note) failed.value = parsed.note;
  } catch (e) {
    failed.value = e instanceof Error ? e.message : String(e);
  } finally {
    taking.value = '';
  }
}

function onDrop(e: DragEvent) { take(e.dataTransfer?.files ?? null); }

// Him, reading over your shoulder.
const him = ref<HTMLCanvasElement | null>(null);
catSprite(art.reading, 300).then((c) => { him.value = c; });
const studious = (g: CanvasRenderingContext2D, w: number, h: number, t: number) => {
  const c = him.value;
  if (!c) return;
  const size = Math.min(w, h) * 1.05;
  g.drawImage(c, w / 2 - size / 2, h - size * 0.98 + Math.sin(t * 0.5) * h * 0.02, size, size);
};

const note = ref<Mark | null>(null);
const draft = ref('');
watch(note, (m) => { draft.value = m?.note ?? ''; });
async function saveNote() {
  if (!note.value) return;
  await actions.annotate(note.value, draft.value.trim() || null);
  note.value = null;
}

const through = (b: Book) => Math.round(((b.chapterIdx + b.through / 1000) / Math.max(1, b.chapters.length)) * 100);
</script>

<template>
  <div class="library">
    <!-- The shelf -->
    <div v-if="!open" class="shelf">
      <h1 class="title">The Library</h1>
      <p class="note">Everything he has been given to read. Drop an epub, a pdf or a text file anywhere here; it is
        taken apart where you stand, and only the words are sent on.</p>

      <div class="take" :class="{ busy: taking }" @drop.prevent="onDrop" @dragover.prevent>
        <label class="btn">
          <input type="file" accept=".epub,.pdf,.txt,.md" hidden @change="take(($event.target as HTMLInputElement).files)">
          {{ taking || 'give him a book' }}
        </label>
        <span class="note">epub, pdf, txt</span>
      </div>
      <p v-if="failed" class="note err">{{ failed }}</p>

      <div class="books">
        <button v-for="b in shelf" :key="b.id" class="book" @click="openBook(b)">
          <span class="spine" aria-hidden="true"><i v-for="n in 7" :key="n"></i></span>
          <span class="what">
            <b>{{ b.title }}</b>
            <span class="note">{{ b.author ?? 'unattributed' }} // {{ b.chapters.length }} chapters // {{ Math.round(b.words / 1000) }}k words</span>
            <span class="bar"><i :style="{ width: `${through(b)}%` }"></i></span>
            <span class="pix">{{ through(b) }}% read // {{ b.marks }} kept // {{ b.format }}</span>
          </span>
        </button>
        <p v-if="!shelf.length" class="empty">The shelf is bare. He notices.</p>
      </div>

      <Frame v-if="state.marks.length" class="kept" :title="`kept passages // ${state.marks.length}`" scroll>
        <div v-for="m in state.marks" :key="m.id" class="keeprow">
          <span class="fell">{{ m.body }}</span>
          <span class="pix">{{ m.source }}</span>
        </div>
      </Frame>
    </div>

    <!-- The reading -->
    <template v-else>
      <Frame class="read" :title="`${open.title} // ${chapter?.title ?? ''}`" flush>
        <div ref="page" class="page" :class="{ loading }" @scroll.passive="moved" @mouseup="keep" @touchend="keep">
          <p v-for="(p, i) in lines" :key="i" class="para" :class="{ kept: p.mark }" @click="p.mark && (note = p.mark)">{{ p.text }}</p>
          <p v-if="!lines.length" class="note">{{ loading ? 'turning to the page' : 'nothing on this page' }}</p>
        </div>
        <div class="turn">
          <button class="btn quiet" :disabled="(chapter?.idx ?? 0) <= 0" @click="step(-1)">&lt;&lt; back</button>
          <button class="btn quiet" @click="contents = !contents">contents</button>
          <span class="pix grow">{{ (chapter?.idx ?? 0) + 1 }} of {{ open.chapters.length }}</span>
          <button class="btn quiet" @click="open = null">the shelf</button>
          <button class="btn quiet" :disabled="(chapter?.idx ?? 0) >= open.chapters.length - 1" @click="step(1)">on &gt;&gt;</button>
        </div>
        <div class="reader" aria-hidden="true"><Plate :draw="studious" :active="active" animated :cell="3" /></div>
      </Frame>

      <div class="aside">
        <Frame v-if="contents" title="the contents" scroll>
          <button v-for="c in open.chapters" :key="c.idx" class="chap" :class="{ on: c.idx === chapter?.idx }" @click="openBook(open!, c.idx)">
            <span class="pix">{{ String(c.idx + 1).padStart(2, '0') }}</span>
            <span class="fell">{{ c.title }}</span>
          </button>
        </Frame>

        <Frame v-else :title="`kept out of this one // ${marksOf.length}`" scroll>
          <p class="note how">Select any passage to keep it. What is kept is on the device's glass at its next sync,
            and anything he marked there arrives here.</p>
          <div v-for="m in marksOf" :key="m.id" class="keep" :class="{ here: m.chapterIdx === chapter?.idx }">
            <span class="fell" @click="openBook(open!, m.chapterIdx)">{{ m.body }}</span>
            <p v-if="m.note" class="note">{{ m.note }}</p>
            <div class="row">
              <span class="pix grow">{{ m.source }} // chapter {{ m.chapterIdx + 1 }}</span>
              <button class="x" @click="note = m">{{ m.note ? 'edit note' : 'write a note' }}</button>
              <button class="x" @click="actions.unkeep(m)">let go</button>
            </div>
          </div>
          <p v-if="!marksOf.length" class="empty">Nothing kept out of this one yet.</p>
        </Frame>
      </div>
    </template>

    <div v-if="note" class="noting" @click.self="note = null">
      <div class="box">
        <div class="pix">what you made of it</div>
        <blockquote class="fell">{{ note.body }}</blockquote>
        <textarea v-model="draft" class="field" rows="4" maxlength="2000" placeholder="write it down before it goes"></textarea>
        <div class="row"><span class="note grow">{{ draft.length }} of 2000</span>
          <button class="btn quiet" @click="note = null">leave it</button>
          <button class="btn" @click="saveNote">keep the note</button></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.library { display: grid; gap: 18px; grid-template-columns: minmax(0, 1.6fr) minmax(300px, .9fr); min-height: 0; }
.shelf { grid-column: 1 / -1; display: flex; flex-direction: column; gap: 14px; min-height: 0; }
.shelf .note { max-width: 70ch; }
.take { display: flex; align-items: center; gap: 14px; border: 3px dotted var(--low); padding: 14px 16px; }
.take.busy { border-color: var(--phos); }
.take .btn { cursor: pointer; }
.books { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 14px; overflow: auto; min-height: 0; padding-right: 4px; }
.book { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 14px; text-align: left; border: 3px dotted var(--faint); padding: 14px;
  transition: border-color .3s var(--out), transform .3s var(--out); }
.book:hover { border-color: var(--phos); transform: translateY(-2px); }
.book b { font: 400 26px/1.1 var(--goth); color: var(--hi); display: block; }
.spine { display: grid; gap: 3px; align-content: start; padding-top: 4px; }
.spine i { display: block; width: 14px; height: 4px; background: var(--low); }
.what { display: grid; gap: 7px; min-width: 0; }
.bar { height: 5px; background: radial-gradient(circle, var(--low) 1px, transparent 1.4px) 0 50% / 5px 5px repeat-x; }
.bar i { display: block; height: 5px; background: radial-gradient(circle, var(--phos) 1.4px, transparent 1.8px) 0 50% / 5px 5px repeat-x; }
.kept { flex: none; max-height: 28vh; }
.keeprow { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px; padding: 6px 0; border-bottom: 3px dotted var(--faint); }
.keeprow .fell { font-size: 15px; font-style: italic; color: var(--dim); }

.read { grid-column: 1; position: relative; }
.page { flex: 1; min-height: 0; overflow: auto; padding: 26px clamp(20px, 5%, 70px); scrollbar-width: thin; scrollbar-color: var(--low) transparent; }
.page.loading { opacity: .4; }
.para { margin: 0 0 1.1em; font: 400 clamp(16px, 1.25vw, 19px)/1.72 var(--fell); color: var(--hi); text-wrap: pretty; white-space: pre-wrap; }
.para.kept { background: linear-gradient(to bottom, transparent 58%, rgba(197, 188, 171, .22) 58%); cursor: pointer; }
.para.kept:hover { background: linear-gradient(to bottom, transparent 58%, rgba(197, 188, 171, .38) 58%); }
.turn { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-top: 3px dotted var(--low); }
.turn .grow { flex: 1; text-align: center; }
.reader { position: absolute; right: 10px; bottom: 58px; width: 84px; height: 76px; opacity: .9; pointer-events: none; display: flex; flex-direction: column; }

.aside { grid-column: 2; display: grid; min-height: 0; }
.chap { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 12px; text-align: left; padding: 7px 4px; border-bottom: 3px dotted var(--faint); }
.chap .fell { font-size: 17px; color: var(--dim); }
.chap:hover .fell, .chap.on .fell { color: var(--hi); }
.how { margin: 0 0 14px; }
.keep { padding: 10px 0; border-bottom: 3px dotted var(--faint); display: grid; gap: 6px; }
.keep .fell { font-size: 16px; font-style: italic; color: var(--dim); cursor: pointer; }
.keep.here .fell { color: var(--hi); }
.keep .note { margin: 0; }

.noting { position: fixed; inset: 0; z-index: 40; background: rgba(12, 11, 10, .72); backdrop-filter: blur(10px); display: grid; place-items: center; padding: 20px; }
.noting .box { width: min(560px, 100%); display: grid; gap: 12px; border: 3px dotted var(--phos); background: var(--ground); padding: 18px; }
.noting blockquote { margin: 0; font: italic 400 19px/1.5 var(--fell); color: var(--hi); border-left: 3px dotted var(--low); padding-left: 14px; }
.noting textarea { resize: vertical; font: inherit; }

@media (max-aspect-ratio: 5/4) { .library { grid-template-columns: minmax(0, 1fr); } .read, .aside { grid-column: 1; } .aside { max-height: 34vh; } }
@media (max-width: 860px) {
  .library { display: flex; flex-direction: column; }
  .read { min-height: 62vh; }
  .reader { width: 56px; height: 52px; bottom: 52px; }
  .books { grid-template-columns: minmax(0, 1fr); }
}
</style>
