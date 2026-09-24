<script setup lang="ts">
// The Library: what he has to read, and the reading of it. A book is parsed
// where it is dropped - the server is only ever given chapters of plain text -
// and whatever is marked here is on the device's glass at its next sync.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as THREE from 'three';
import Frame from '../components/Frame.vue';
import Gl from '../components/Gl.vue';
import Plate from '../components/Plate.vue';
import art from '../gl/art.json';
import { catSprite, sigil } from '../gl/plate';
import { lights } from '../gl/models';
import { CELL, stacks, type ShelfEntry, type Stacks } from '../gl/stacks';
import { grimoire, type Grimoire } from '../gl/grimoire';
import type { Build } from '../gl/engine';
import { readBook } from '../books';
import { actions, chapterOf, duration, state, type Book, type Mark } from '../store';

const props = defineProps<{ active: boolean }>();

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

// ---- The stacks ---------------------------------------------------------
// The shelf is a place you stand in rather than a list you read. Drag to look
// round the gallery, wheel (or the two keys) to walk deeper into it, and
// click one of your own volumes to have it pulled and opened.
const EYE = 1.78, GALLERIES = 5;

const entries = computed<ShelfEntry[]>(() => state.books.map((b) => ({
  id: b.id, title: b.title, through: through(b), chapters: b.chapters.length, marks: b.marks,
})));
// The gallery is built once from the shelf it is given, so a book arriving
// rebuilds it rather than being left out of it.
const shelfKey = computed(() => entries.value.map((b) => `${b.id}:${b.through}:${b.marks}`).join(','));
const pulled = ref<Book | null>(null);

let hall: Stacks | null = null;
let drift: { hold: boolean } | null = null;
// A book taken from the pile comes in at the left edge of the glass, where the
// pile is, and goes back out there; one taken off the shelf goes back to it.
let held: { mesh: THREE.Mesh; grim: Grimoire; holder: THREE.Group; u: number; dir: 1 | -1; hand: boolean } | null = null;
let world: THREE.Scene | null = null;
let eye: THREE.PerspectiveCamera | null = null;
const HOLD = 1.62;
const fwd = new THREE.Vector3(), side = new THREE.Vector3(), lift = new THREE.Vector3();
function edge(out: THREE.Vector3) {
  if (!eye) return out;
  eye.getWorldDirection(fwd);
  side.set(1, 0, 0).applyQuaternion(eye.quaternion);
  const half = Math.tan(THREE.MathUtils.degToRad(eye.fov / 2)) * HOLD * eye.aspect;
  return out.copy(eye.position).addScaledVector(fwd, HOLD).addScaledVector(side, -half * 1.4);
}
let walkTo = 0, walkAt = 0;

function pull(i: number, hand = false) {
  if (!hall || !world) return;
  const mesh = hall.mine[i], entry = entries.value[i], book = state.books[i];
  if (!mesh || !entry) return;
  if (held) { held.holder.removeFromParent(); held.grim.dispose(); held.mesh.visible = true; held = null; }
  const grim = grimoire(entry, 11 + i * 7);
  grim.open(0);
  const holder = new THREE.Group();
  holder.add(grim.group);
  if (hand && eye) { edge(holder.position); holder.quaternion.copy(eye.quaternion); }
  else {
    mesh.getWorldPosition(holder.position);
    holder.quaternion.copy(mesh.getWorldQuaternion(new THREE.Quaternion()));
  }
  world.add(holder);
  mesh.visible = false;
  held = { mesh, grim, holder, u: 0, dir: 1, hand };
  if (drift) drift.hold = true;
  pulled.value = book ?? null;
}
function shut() {
  if (held) held.dir = -1;
  if (drift) drift.hold = false;
  pulled.value = null;
}
const walk = (d: number) => { walkTo = Math.max(-0.3, Math.min(GALLERIES - 1.6, walkTo + d * 0.55)); };

const build: Build = ({ scene, camera, turn, canvas }) => {
  world = scene;
  eye = camera;
  drift = turn;
  held = null;
  pulled.value = null;
  walkTo = 0;
  walkAt = 0;
  // The dark between galleries is the fog: it is what makes the shaft deep.
  scene.fog = new THREE.Fog(0x000000, 2.2, 13);
  lights(scene, 1.05, 0.4, 0.07);
  // A lamp of its own over the first gallery, so the near shelves are read
  // by something inside the room rather than by a light from nowhere.
  const lamp = new THREE.PointLight(0xffffff, 30, 11, 2);
  lamp.position.set(0, 2.7, 0);
  scene.add(lamp);
  const far = new THREE.PointLight(0xffffff, 22, 12, 2);
  far.position.set(0, 2.7, -CELL * 2);
  scene.add(far);

  hall = stacks(entries.value, GALLERIES);
  scene.add(hall.group);
  camera.position.set(0, EYE, 2.45);
  // Facing the wall your own books are on, looking very slightly down.
  turn.x = 0.14;
  turn.y = -0.13;

  // Walking, and picking a volume off the shelf. A drag that moved is a look
  // round the room, not a click on a book.
  const ray = new THREE.Raycaster();
  let from = { x: 0, y: 0, moved: false };
  const onWheel = (e: WheelEvent) => { e.preventDefault(); walk(Math.sign(e.deltaY) * -1); };
  const onDown = (e: PointerEvent) => { from = { x: e.clientX, y: e.clientY, moved: false }; };
  const onMove = (e: PointerEvent) => {
    if (Math.abs(e.clientX - from.x) + Math.abs(e.clientY - from.y) > 6) from.moved = true;
  };
  const onUp = (e: PointerEvent) => {
    if (from.moved || !hall) return;
    const b = canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - b.left) / b.width) * 2 - 1,
                                        -((e.clientY - b.top) / b.height) * 2 + 1), camera);
    const hit = ray.intersectObjects(hall.mine, false)[0];
    if (hit) pull((hit.object.userData as { index: number }).index);
    else if (held) shut();
  };
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);

  const back = new THREE.Vector3();
  return (t, dt) => {
    hall?.update(t);
    walkAt += (walkTo - walkAt) * Math.min(1, dt * 2.6);
    // The drag turns the head and the walk moves it; the world stays put,
    // because a library that swings round you is a carousel, not a library.
    const yaw = turn.y * 0.9, pitch = Math.max(-0.55, Math.min(0.5, turn.x * 0.7));
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
    camera.position.set(Math.sin(yaw) * 0.3, EYE + Math.sin(t * 0.45) * 0.012, 2.45 - walkAt * CELL);
    if (!held) return;
    held.u = Math.max(0, Math.min(1, held.u + dt * (held.dir > 0 ? 0.85 : -1.9)));
    camera.getWorldDirection(fwd);
    const to = camera.position.clone().addScaledVector(fwd, HOLD).add(new THREE.Vector3(0, -0.02, 0));
    const k = 1 - Math.pow(0.0025, dt);
    // Out of the shelf, or in from the pile, round to face you, and only then open.
    const home = held.hand ? edge(back) : held.mesh.position;
    held.holder.position.lerp(held.dir > 0 ? to : home, k);
    held.holder.quaternion.slerp(held.dir > 0 || held.hand ? camera.quaternion : held.mesh.quaternion, k);
    held.grim.open(Math.max(0, (held.u - 0.32) / 0.68));
    // The prompt rides just over the top of the book, wherever it is on the glass.
    if (prompt.value && held.dir > 0) {
      lift.set(0, 0.64, 0).applyQuaternion(camera.quaternion).add(held.holder.position).project(camera);
      prompt.value.style.setProperty('--px', `${(lift.x + 1) * 50}%`);
      prompt.value.style.setProperty('--py', `${(1 - lift.y) * 50}%`);
    }
    if (held.dir < 0 && held.u <= 0.001) {
      held.holder.removeFromParent();
      held.grim.dispose();
      held.mesh.visible = true;
      held = null;
    }
  };
};

function onKey(e: KeyboardEvent) {
  const b = pulled.value;
  if (!b || !props.active || (e.target as HTMLElement).closest?.('input, textarea, select')) return;
  const k = e.key.toLowerCase();
  if (k === 'e' || k === 'enter') { e.preventDefault(); openBook(b); }
  else if (k === 'q' || k === 'escape') shut();
}
onMounted(() => addEventListener('keydown', onKey));
onBeforeUnmount(() => removeEventListener('keydown', onKey));

const note = ref<Mark | null>(null);
const draft = ref('');
watch(note, (m) => { draft.value = m?.note ?? ''; });
async function saveNote() {
  if (!note.value) return;
  await actions.annotate(note.value, draft.value.trim() || null);
  note.value = null;
}

const through = (b: Book) => Math.round(((b.chapterIdx + b.through / 1000) / Math.max(1, b.chapters.length)) * 100);

// ---- The pile ------------------------------------------------------------
// Your books lie on top of each other the way a scholar leaves them: the last
// one given on top, none of them square to the one under it. Each has its own
// lean, reach and length, worked out from its id so the pile is the same pile
// every time it is looked at.
const SIGILS = [
  'M12 3 21 19H3ZM7.5 13.5Q12 9.5 16.5 13.5 12 17.5 7.5 13.5ZM12 12.2v2.6',
  'M12 2.5a9.5 9.5 0 1 0 .01 0ZM12 3.5 17 18.9 3.9 9.4H20.1L7 18.9Z',
  'M15 4A8.5 8.5 0 1 0 15 20 6.5 6.5 0 1 1 15 4ZM19 8v5M16.5 10.5h5',
  'M19.5 9A8 8 0 1 1 15.5 4.6L19.5 9 20.8 4.8M11 12a1 1 0 1 0 2 0 1 1 0 1 0-2 0',
  'M8 3h7M11.5 3v11Q11.5 9 15.5 10 19.5 12 16 16 13.5 19 16.5 21',
  'M12 3 20 17H4ZM12 21 4 7H20Z',
];
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
const pile = computed(() => state.books.map((b, i) => {
  const h = hash(`${b.id}:${b.title}`), f = (k: number) => ((h >>> k) & 255) / 255;
  return { b, i, tilt: (f(0) - 0.5) * 4.4, shift: (f(8) - 0.5) * 40, width: 70 + f(16) * 30,
    thick: 40 + Math.min(16, b.chapters * 0.6), sigil: SIGILS[h % SIGILS.length]!, read: through(b) };
}).reverse());
// The moon over a book fills as it is read: new, waxing, full.
function phase(pct: number) {
  const p = pct / 100, r = 8, rx = r * Math.abs(1 - 2 * p);
  return `M12 ${12 - r}A${r} ${r} 0 0 1 12 ${12 + r}A${rx} ${r} 0 0 ${p < 0.5 ? 0 : 1} 12 ${12 - r}Z`;
}

const glHost = ref<HTMLElement | null>(null);
const prompt = ref<HTMLElement | null>(null);
// Out of the pile and into your hands: the spine slides off to the right, into
// the glass, and is gone by the time the book comes in at the glass's edge.
function fromPile(s: { i: number; tilt: number }, e: MouseEvent) {
  if (pulled.value?.id === state.books[s.i]?.id) return;
  const spine = e.currentTarget as HTMLElement, host = glHost.value;
  if (host) {
    const r = spine.getBoundingClientRect(), to = host.getBoundingClientRect();
    const w = spine.offsetWidth, h = spine.offsetHeight, cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const ghost = spine.cloneNode(true) as HTMLElement;
    Object.assign(ghost.style, { position: 'fixed', left: `${cx - w / 2}px`, top: `${cy - h / 2}px`, width: `${w}px`, height: `${h}px`,
      margin: '0', zIndex: '19', pointerEvents: 'none', transition: 'none' });
    document.body.appendChild(ghost);
    const dx = to.left + Math.min(to.width * 0.2, 160) - cx, dy = to.top + to.height * 0.5 - cy;
    ghost.animate([
      { transform: `rotate(${s.tilt}deg)`, opacity: 1 },
      { transform: `translate(${dx * 0.55}px, ${dy * 0.55}px) rotate(${s.tilt * 0.4}deg)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${dx}px, ${dy}px) rotate(0deg) scale(.9)`, opacity: 0 },
    ], { duration: 560, easing: 'cubic-bezier(.45, 0, .6, 1)' }).onfinish = () => ghost.remove();
  }
  pull(s.i, true);
}
</script>

<template>
  <div class="library">
    <!-- The shelf -->
    <div v-if="!open" class="shelf" @drop.prevent="onDrop" @dragover.prevent>
      <Frame class="stacksFrame" title="the stacks // gallery of the hexagon, shelf of your own" flush>
        <div ref="glHost" class="glHost">
          <Gl :key="shelfKey" :build="build" :active="active"
            :options="{ px: 2, fov: 74, distance: 2.45, drift: 0.0004, tilt: 0, yaw: 0 }"
            label="The stacks: hexagonal galleries of shelves, your own volumes on the near wall"
            hint="drag to look // wheel to walk // click a volume" />
          <div class="walk">
            <button class="btn quiet" aria-label="Back one gallery" @click="walk(-1)">&lt;&lt; back</button>
            <button class="btn quiet" aria-label="Deeper into the stacks" @click="walk(1)">deeper &gt;&gt;</button>
          </div>
          <div v-if="pulled" ref="prompt" class="prompt">
            <div class="card">
              <b>{{ pulled.title }}</b>
              <span class="m">{{ pulled.author ?? 'unattributed' }} // {{ pulled.chapters.length }} chapters // {{ through(pulled) }}% // {{ pulled.marks }} kept</span>
              <div class="acts">
                <button class="act go" @click="openBook(pulled!)"><kbd>E</kbd>read it</button>
                <button class="act" @click="shut()"><kbd>Q</kbd>shelve it</button>
              </div>
            </div>
            <i class="tether" aria-hidden="true"></i>
          </div>
        </div>
      </Frame>

      <div class="ledger">
        <div class="head">
          <h1 class="title">The Library</h1>
          <div class="seal" aria-hidden="true"><Plate :draw="sigil" :active="active" animated :cell="2" /></div>
        </div>
        <p class="note">Everything he has been given to read, standing where he put it. Drop an epub, a pdf or a
          text file anywhere here; it is taken apart where you stand, and only the words are sent on.</p>

        <div class="take" :class="{ busy: taking }">
          <label class="btn">
            <input type="file" accept=".epub,.pdf,.txt,.md" hidden @change="take(($event.target as HTMLInputElement).files)">
            {{ taking || 'give him a book' }}
          </label>
          <span class="note">epub, pdf, txt</span>
        </div>
        <p v-if="failed" class="note err">{{ failed }}</p>

        <div class="pile">
          <div v-for="s in pile" :key="s.b.id" class="slot" :class="{ out: pulled?.id === s.b.id }">
            <div class="clip">
              <button class="spine" :style="{ '--tilt': `${s.tilt}deg`, '--shift': `${s.shift}px`, width: `${s.width}%`, height: `${s.thick}px` }"
                :aria-label="`Take ${s.b.title} from the pile`" @click="fromPile(s, $event)">
                <svg class="sig" viewBox="0 0 24 24" aria-hidden="true"><path :d="s.sigil" /></svg>
                <span class="t">
                  <b>{{ s.b.title }}</b>
                  <span>{{ s.b.author ?? 'unattributed' }} // {{ s.b.chapters.length }} ch // {{ s.b.marks }} kept // {{ s.b.format }}</span>
                </span>
                <svg class="moon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" /><path :d="phase(s.read)" /></svg>
                <span class="pct">{{ s.read }}%</span>
              </button>
            </div>
          </div>
          <p v-if="!shelf.length" class="empty">The shelf is bare. He notices.</p>
        </div>

        <Frame v-if="state.marks.length" class="kept" :title="`kept passages // ${state.marks.length}`" scroll>
          <div v-for="m in state.marks" :key="m.id" class="keeprow">
            <span class="fell">{{ m.body }}</span>
            <span class="pix">{{ m.source }}</span>
          </div>
        </Frame>
      </div>
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
/* The hall: the stacks take the room, the ledger stands beside them. */
.shelf { grid-column: 1 / -1; display: grid; grid-template-columns: minmax(300px, .85fr) minmax(0, 1.45fr);
  grid-template-rows: minmax(0, 1fr); gap: 18px; min-height: 0; }
/* The pile on the left, the hall on the right: a book leaves the one for the other. */
.shelf .ledger { order: -1; }
.stacksFrame { min-height: 0; }
/* The glass takes what is left after the strip under it, rather than the
   strip being pushed out of the bottom of the frame. */
.stacksFrame :deep(.flush) { min-height: 0; }
.glHost { position: relative; flex: 1 1 0; min-height: 0; display: flex; flex-direction: column; }
.glHost :deep(.hint) { bottom: 8px; left: 12px; }
.walk { position: absolute; top: 10px; right: 10px; z-index: 4; display: flex; gap: 8px; }
.walk .btn { background: rgba(18, 18, 18, .82); }
/* What is in your hands: a prompt over the book, the way a game asks. */
.prompt { position: absolute; z-index: 5; left: var(--px, 50%); top: max(var(--py, 30%), 128px);
  transform: translate(-50%, -100%); display: grid; justify-items: center; animation: promptin .45s var(--out) .35s both; }
@keyframes promptin { from { opacity: 0; transform: translate(-50%, calc(-100% + 10px)); } }
.prompt .card { position: relative; border: 1px solid var(--phos); background: rgba(18, 18, 18, .88); padding: 10px 16px 12px;
  display: grid; gap: 7px; justify-items: center; text-align: center; min-width: 250px; max-width: min(380px, 86vw); }
.prompt .card::before, .prompt .card::after { content: ''; position: absolute; width: 10px; height: 10px; border: 2px solid var(--hi); }
.prompt .card::before { left: -5px; top: -5px; border-right: 0; border-bottom: 0; }
.prompt .card::after { right: -5px; bottom: -5px; border-left: 0; border-top: 0; }
.prompt b { font: 400 24px/1.05 var(--goth); color: var(--hi); max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.prompt .m { font: 400 9px var(--pix); color: var(--dim); text-transform: uppercase; }
.prompt .acts { display: flex; gap: 8px; margin-top: 2px; }
.prompt .act { display: flex; gap: 7px; align-items: center; border: 1px solid var(--low); padding: 6px 11px; font: 400 10px var(--pix);
  text-transform: uppercase; color: var(--phos); transition: background .2s var(--out), color .2s var(--out), border-color .2s var(--out); }
.prompt .act:hover, .prompt .act.go { border-color: var(--phos); background: var(--phos); color: var(--ground); }
.prompt .act.go:hover { background: var(--hi); }
.prompt kbd { font: 400 9px var(--pix); border: 1px solid currentColor; padding: 0 4px; }
.prompt .tether { display: block; width: 1px; height: 24px; background: repeating-linear-gradient(to bottom, var(--phos) 0 2px, transparent 2px 5px); position: relative; }
.prompt .tether::after { content: ''; position: absolute; left: -3px; bottom: -4px; width: 7px; height: 7px; background: var(--phos); transform: rotate(45deg); }
@media (pointer: coarse) { .prompt kbd { display: none; } }
.ledger { display: flex; flex-direction: column; gap: 14px; min-height: 0; }
.head { display: flex; align-items: center; gap: 16px; }
.head .title { margin: 0; }
.seal { width: 96px; height: 96px; flex: none; display: flex; flex-direction: column; opacity: .9; }
.ledger .note { max-width: 46ch; }
.take { display: flex; align-items: center; gap: 14px; border: 3px dotted var(--low); padding: 14px 16px; }
.take.busy { border-color: var(--phos); }
.take .btn { cursor: pointer; }
/* The pile is built from the floor up, oldest at the bottom, so it sits on
   the floor of its column, a tall one runs off the top rather than the
   bottom, and pulling one out lets the ones above it come down into the gap. */
.pile { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; display: flex; flex-direction: column-reverse; padding: 6px 2px 4px; scrollbar-width: none; }
.pile::-webkit-scrollbar { width: 0; }
.slot { display: grid; grid-template-rows: 1fr; transition: grid-template-rows .5s var(--ease) .3s; }
.slot.out { grid-template-rows: 0fr; transition-delay: .2s; }
.clip { min-height: 0; overflow: hidden; padding: 3px 16px; transition: transform .55s var(--out) .45s, opacity .45s var(--out) .45s; }
.slot.out .clip { opacity: 0; transform: translateX(40%); transition: opacity .08s linear, transform 0s linear .08s; }
/* A spine: leather, a dotted tooling rule at the head and foot, two raised
   bands, a few stars pricked into it, his sigil at one end and the moon of
   how far you are at the other. */
.spine { position: relative; display: flex; align-items: center; gap: 10px; margin: 0 auto; padding: 0 12px; text-align: left; color: var(--phos);
  transform: translateX(var(--shift)) rotate(var(--tilt)); border: 1px solid #3a3733;
  background:
    radial-gradient(1px 1px at 22% 30%, rgba(197, 188, 171, .35), transparent),
    radial-gradient(1px 1px at 61% 72%, rgba(197, 188, 171, .3), transparent),
    radial-gradient(1px 1px at 83% 22%, rgba(197, 188, 171, .25), transparent),
    linear-gradient(to right, transparent 40px, rgba(197, 188, 171, .12) 40px 43px, transparent 43px calc(100% - 64px),
      rgba(197, 188, 171, .12) calc(100% - 64px) calc(100% - 61px), transparent calc(100% - 61px)),
    linear-gradient(to bottom, #2e2b28, #1d1c1a 22%, #181716 60%, #25231f 88%, #302d29);
  box-shadow: 0 2px 0 #0c0c0c, inset 0 1px 0 rgba(197, 188, 171, .12);
  transition: transform .3s var(--out), border-color .3s var(--out); }
.spine::before { content: ''; position: absolute; inset: 4px 6px; pointer-events: none;
  border-top: 1px dotted rgba(197, 188, 171, .28); border-bottom: 1px dotted rgba(197, 188, 171, .28); }
.spine:hover { transform: translateX(calc(var(--shift) + 8px)) rotate(var(--tilt)); border-color: var(--dim); }
.spine .t { flex: 1; min-width: 0; display: grid; gap: 3px; }
.spine .t b { font: 400 20px/1 var(--goth); color: var(--hi); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.spine .t span { font: 400 8.5px var(--pix); color: var(--dim); text-transform: uppercase; letter-spacing: .04em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.spine svg { flex: none; width: 24px; height: 24px; fill: none; stroke: currentColor; stroke-width: 1.3; }
.spine .moon path { fill: currentColor; stroke: none; }
.spine .pct { flex: none; font: 400 9px var(--pix); }
.kept { flex: none; max-height: min(20vh, 150px); }
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

@media (max-aspect-ratio: 5/4) { .library { grid-template-columns: minmax(0, 1fr); } .read, .aside { grid-column: 1; } .aside { max-height: 34vh; }
  .shelf { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(260px, 1fr) auto; }
  .shelf .ledger { order: 0; }
  .ledger { max-height: 42vh; } }
@media (max-width: 860px) {
  .library { display: flex; flex-direction: column; }
  .read { min-height: 62vh; }
  .reader { width: 56px; height: 52px; bottom: 52px; }
  .shelf { display: flex; flex-direction: column; }
  .stacksFrame { min-height: 300px; }
  /* On a phone the page scrolls, so the pile and the passages take all the room they need. */
  .pile { flex: none; overflow: visible; }
  .kept { max-height: none; }
  .spine .pct { display: none; }
}
</style>
