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
  return { b, i, tilt: (f(0) - 0.5) * 3, shift: (f(8) - 0.5) * 40, width: 70 + f(16) * 30, turn: (f(24) - 0.5) * 10,
    thick: 36 + Math.min(14, b.chapters.length * 0.5), sigil: SIGILS[h % SIGILS.length]!, read: through(b) };
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
function fromPile(s: { i: number; tilt: number; turn: number }, e: MouseEvent) {
  if (pulled.value?.id === state.books[s.i]?.id) return;
  const book = e.currentTarget as HTMLElement, host = glHost.value;
  if (host) {
    const r = book.getBoundingClientRect(), to = host.getBoundingClientRect();
    const w = book.offsetWidth, h = book.offsetHeight, cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const ghost = book.cloneNode(true) as HTMLElement;
    Object.assign(ghost.style, { position: 'fixed', left: `${cx - w / 2}px`, top: `${cy - h / 2}px`, width: `${w}px`, height: `${h}px`,
      margin: '0', zIndex: '19', pointerEvents: 'none', transition: 'none' });
    document.body.appendChild(ghost);
    const dx = to.left + Math.min(to.width * 0.2, 160) - cx, dy = to.top + to.height * 0.5 - cy;
    // Held the way it lay on the pile, then turned end on as it goes into the hall.
    const lay = (x: number, y: number, pitch: number, yaw: number, lean: number, k = 1) =>
      `translate(${x}px, ${y}px) perspective(1100px) rotateX(${pitch}deg) rotateY(${yaw}deg) rotateZ(${lean}deg) scale(${k})`;
    ghost.animate([
      { transform: lay(0, 0, -22, -18 + s.turn, s.tilt), opacity: 1 },
      { transform: lay(dx * 0.55, dy * 0.55, -14, -40, s.tilt * 0.4), opacity: 1, offset: 0.55 },
      { transform: lay(dx, dy, -6, -62, 0, 0.85), opacity: 0 },
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
            <button class="btn quiet" aria-label="Back one gallery" @click="walk(-1)">
              <svg viewBox="0 0 14 14" aria-hidden="true"><path d="M9 2 4 7l5 5" /></svg>
            </button>
            <button class="btn quiet" aria-label="Deeper into the stacks" @click="walk(1)">
              <svg viewBox="0 0 14 14" aria-hidden="true"><path d="m5 2 5 5-5 5" /></svg>
            </button>
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

        <!-- A desk: the pile on it, a skull with a candle guttering on it, a
             quill in its ink and a loose leaf with a working on it. -->
        <div class="desk" :style="{ '--n': pile.length }">
          <div class="table" aria-hidden="true"><i class="pool"></i><i class="top"></i><i class="edge"></i></div>

          <svg class="thing skull" viewBox="0 0 120 200" aria-hidden="true">
            <defs><radialGradient id="candlelight"><stop offset="0" stop-color="#e6e0d4" stop-opacity=".55" /><stop offset="1" stop-color="#e6e0d4" stop-opacity="0" /></radialGradient></defs>
            <circle class="glow" cx="60" cy="30" r="34" fill="url(#candlelight)" />
            <path class="flame" d="M60 14C66 24 67 31 60 38 53 31 54 24 60 14Z" />
            <path d="M60 34v8" class="ln" />
            <path d="M51 44H69V104H51Z" class="bone" />
            <path d="M51 44c0 8 4 8 4 16 0 4 3 4 3-2 0-8 4-8 4-12M69 44c0 10-3 12-3 26 0 4-3 4-3-2" class="ln" fill="none" />
            <path d="M56 50v50M64 54v46" class="faint" />
            <path d="M49 104c-5 0-5 8-1 8s4-6 8-6h8c4 0 6 10 10 8 3-2-1-10-3-10Z" class="wax" />
            <path d="M18 142c0-38 84-38 84 0 0 16-7 22-13 26l-2 14H33l-2-14c-6-4-13-10-13-26Z" class="bone" />
            <path d="M28 132c2-10 10-16 18-18M24 146c0-8 2-12 6-16M78 116l-4 8 6 4-3 6" class="faint" fill="none" />
            <ellipse cx="44" cy="146" rx="11" ry="12" class="hollow" /><ellipse cx="76" cy="146" rx="11" ry="12" class="hollow" />
            <circle cx="46" cy="148" r="1.6" class="spark" /><circle cx="78" cy="148" r="1.6" class="spark" />
            <path d="M60 156l-5 12h10Z" class="hollow" />
            <path d="M33 182l3 12h48l3-12" class="bone" />
            <path d="M40 176v16M47 176v17M54 176v18M60 176v18M66 176v18M73 176v17M80 176v16M36 186h48" class="ln" />
          </svg>

          <div class="thing leaf" aria-hidden="true"><svg viewBox="0 0 96 70"><g fill="none" stroke="#2a2420" stroke-width="1.2">
            <circle cx="30" cy="35" r="20" /><circle cx="30" cy="35" r="16" /><path d="M30 19 39.4 47.9 14.8 30.1H45.2L20.6 47.9Z" />
            <path d="M60 18h26M60 25h22M60 32h27M60 39h18M60 46h24M60 53h14" /></g></svg></div>

          <div class="pile">
            <div v-for="s in pile" :key="s.b.id" class="slot" :class="{ out: pulled?.id === s.b.id }">
              <div class="clip">
                <button class="book" :style="{ '--tilt': `${s.tilt}deg`, '--shift': `${s.shift}px`, '--turn': `${s.turn}deg`, '--w': `${s.width}%`, '--t': `${s.thick}px` }"
                  :aria-label="`Take ${s.b.title} from the pile`" @click="fromPile(s, $event)">
                  <i class="face cover" aria-hidden="true"></i>
                  <i class="face pages" aria-hidden="true"></i>
                  <span class="face spine">
                    <svg class="sig" viewBox="0 0 24 24" aria-hidden="true"><path :d="s.sigil" /></svg>
                    <span class="t">
                      <b>{{ s.b.title }}</b>
                      <span>{{ s.b.author ?? 'unattributed' }} // {{ s.b.chapters.length }} ch // {{ s.b.marks }} kept // {{ s.b.format }}</span>
                    </span>
                    <svg class="moon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" /><path :d="phase(s.read)" /></svg>
                    <span class="pct">{{ s.read }}%</span>
                  </span>
                </button>
              </div>
            </div>
            <p v-if="!shelf.length" class="empty">The shelf is bare. He notices.</p>
          </div>

          <svg class="thing ink" viewBox="0 0 70 150" aria-hidden="true">
            <path d="M30 108c10-38 22-68 36-104-6 26-12 48-22 76-4 12-8 20-12 28" class="bone" />
            <path d="M30 110 66 4" class="ln" />
            <path d="m48 58 8-4m-12 14 9-3m-1-21 7-5m-3-7 7-6m-23 48 8-2" class="faint" />
            <path d="M14 122c0-16 42-16 42 0l4 24H10Z" class="bone" />
            <path d="M24 106h22v8H24Z" class="bone" />
            <ellipse cx="35" cy="106" rx="11" ry="3" class="hollow" />
            <path d="M18 128c4-4 12-4 16-2" class="faint" fill="none" />
          </svg>
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
/* Back and deeper, at the foot of the glass, clear of anything the console
   lays over the top of the screen. */
.walk { position: absolute; bottom: 10px; right: 10px; z-index: 4; display: flex; gap: 6px; }
.walk .btn { background: rgba(18, 18, 18, .82); width: 38px; height: 34px; padding: 0; display: grid; place-items: center; }
.walk svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2; }
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
/* The desk the pile stands on: a dark table seen from above, the candle's
   light pooled on it, and the things a scholar of the wrong subjects keeps
   to hand. It sits part way up the column, not on its floor. */
.desk { position: relative; flex: 1 1 auto; min-height: 280px; max-height: 500px; }
.table { position: absolute; left: -6px; right: -6px; bottom: 0; height: 118px; pointer-events: none; }
.table i { position: absolute; display: block; }
.table .top { inset: 0 0 16px; transform-origin: bottom; transform: perspective(520px) rotateX(58deg); border-top: 1px solid #3a3530;
  background:
    repeating-linear-gradient(to bottom, transparent 0 7px, rgba(197, 188, 171, .05) 7px 8px),
    repeating-linear-gradient(97deg, transparent 0 38px, rgba(0, 0, 0, .28) 38px 40px, transparent 40px 90px),
    linear-gradient(to bottom, #1c1a18, #2a2622 70%, #322d28); }
.table .edge { left: 0; right: 0; bottom: 0; height: 16px; background: linear-gradient(to bottom, #3a342e, #1a1816); border-top: 1px dotted rgba(197, 188, 171, .35); }
.table .pool { right: 4%; bottom: 30px; width: 220px; height: 70px; border-radius: 50%;
  background: radial-gradient(ellipse, rgba(197, 188, 171, .13), transparent 70%); animation: pool 3.2s ease-in-out infinite; }
@keyframes pool { 50% { opacity: .7; transform: scale(.96); } }
.thing { position: absolute; pointer-events: none; overflow: visible; }
.thing .bone { fill: #171615; stroke: var(--phos); stroke-width: 1.8; }
.thing .hollow { fill: #0e0e0e; stroke: var(--phos); stroke-width: 1.6; }
.thing .ln { stroke: var(--phos); stroke-width: 1.3; }
.thing .faint { stroke: rgba(197, 188, 171, .4); stroke-width: 1.1; }
.thing .wax, .thing .spark { fill: var(--phos); }
.thing .flame { fill: var(--hi); transform-origin: 60px 34px; animation: flicker 1.3s ease-in-out infinite; }
.thing .glow { animation: candle 1.3s ease-in-out infinite; }
@keyframes flicker { 30% { transform: scale(.94, 1.08) skewX(2deg); } 60% { transform: scale(1.04, .95) skewX(-2deg); } }
@keyframes candle { 50% { opacity: .65; } }
.skull { right: -4px; bottom: 34px; width: 90px; }
.ink { left: -6px; bottom: 6px; width: 76px; z-index: 2; }
.leaf { right: 27%; bottom: 8px; width: 96px; height: 70px; transform: perspective(400px) rotateX(58deg) rotateZ(-14deg); transform-origin: bottom;
  background: linear-gradient(#cfc7b7, #bfb6a4); box-shadow: 0 0 0 1px #3d3934; }
.leaf svg { display: block; width: 100%; height: 100%; }

/* The pile is built from the table up, oldest at the bottom: a tall one
   runs off the top rather than the bottom, and pulling one out lets the ones
   above it come down into the gap. */
.pile { position: absolute; left: 1%; width: 82%; top: 0; bottom: 58px; overflow-y: auto; overflow-x: hidden;
  display: flex; flex-direction: column-reverse; padding: 36px 26px 0 6px; scrollbar-width: none; }
.pile::-webkit-scrollbar { width: 0; }
.pile .empty { margin: 0 0 18px; }
.slot { flex: none; display: grid; grid-template-rows: 1fr; margin-top: -2px; transition: grid-template-rows .5s var(--ease) .3s; }
.slot.out { grid-template-rows: 0fr; transition-delay: .2s; }
.clip { min-height: 0; transition: transform .55s var(--out) .45s, opacity .45s var(--out) .45s; }
.slot.out .clip { opacity: 0; transform: translateX(40%); transition: opacity .08s linear, transform 0s linear .08s; pointer-events: none; }
/* A book, lying down, seen from above and to the left: its spine to you,
   its cover on top, the block of its pages at its end. Each one lies a
   little out of true with the one under it. */
.book { --d: 54px; position: relative; display: block; margin: 0 auto; width: var(--w); height: var(--t); padding: 0; border: 0; background: none;
  color: var(--phos); text-align: left; transform-style: preserve-3d;
  transform: perspective(1100px) translateX(var(--shift)) rotateX(-22deg) rotateY(calc(-18deg + var(--turn))) rotateZ(var(--tilt));
  transition: transform .35s var(--out); }
.book:hover, .book:focus-visible { transform: perspective(1100px) translateX(calc(var(--shift) + 12px)) translateZ(16px) rotateX(-22deg) rotateY(calc(-18deg + var(--turn))) rotateZ(var(--tilt)); }
.face { position: absolute; display: block; }
.cover { left: 0; top: 0; width: 100%; height: var(--d); transform-origin: top; transform: rotateX(-90deg); outline: 1px solid #3d3934; outline-offset: -1px;
  background:
    radial-gradient(circle at 50% 50%, transparent 13px, rgba(197, 188, 171, .35) 13px 14px, transparent 15px),
    linear-gradient(#2a2622, #201e1b); }
.cover::before { content: ''; position: absolute; inset: 7px 10px; border: 1px dotted rgba(197, 188, 171, .3); }
.pages { right: 0; top: 0; width: var(--d); height: 100%; transform-origin: right; transform: rotateY(-90deg);
  background: repeating-linear-gradient(to bottom, #b9b09f 0 1px, #d6cfc0 1px 3px); border: 1px solid #3d3934; border-left: 0; }
/* The spine: leather, a dotted tooling rule at the head and foot, two raised
   bands, a few stars pricked into it, his sigil at one end and the moon of
   how far you are at the other. */
.spine { inset: 0; display: flex; align-items: center; gap: 9px; padding: 0 12px; border: 1px solid #3d3934;
  background:
    radial-gradient(1px 1px at 22% 30%, rgba(197, 188, 171, .35), transparent),
    radial-gradient(1px 1px at 61% 72%, rgba(197, 188, 171, .3), transparent),
    linear-gradient(to right, transparent 38px, rgba(197, 188, 171, .13) 38px 41px, transparent 41px calc(100% - 58px),
      rgba(197, 188, 171, .13) calc(100% - 58px) calc(100% - 55px), transparent 0),
    linear-gradient(to bottom, #34302b, #1d1c1a 24%, #171615 60%, #26231f 88%, #36312b); }
.spine::before { content: ''; position: absolute; inset: 4px 6px; pointer-events: none;
  border-top: 1px dotted rgba(197, 188, 171, .3); border-bottom: 1px dotted rgba(197, 188, 171, .3); }
.book:hover .spine, .book:focus-visible .spine { border-color: var(--dim); }
.spine .t { flex: 1; min-width: 0; display: grid; gap: 3px; }
.spine .t b { font: 400 18px/1 var(--goth); color: var(--hi); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.spine .t span { font: 400 8px var(--pix); color: var(--dim); text-transform: uppercase; letter-spacing: .04em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.spine svg { flex: none; width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 1.3; }
.spine .moon path { fill: currentColor; stroke: none; }
.spine .pct { flex: none; font: 400 9px var(--pix); }
.kept { flex: none; max-height: min(18vh, 130px); }
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
  /* The hall stays on the glass; the pile and everything under it scroll
     beneath it. */
  .stacksFrame { position: sticky; top: 0; z-index: 3; flex: none; height: max(260px, 42dvh); background: var(--ground); }
  .ledger { max-height: none; }
  .glHost :deep(.hint) { display: none; }
  /* On a phone the page scrolls, so the desk is as tall as its pile. */
  .desk { flex: none; max-height: none; height: max(280px, calc(var(--n) * 50px + 150px)); }
  .kept { max-height: none; }
  .spine .pct { display: none; }
}
</style>
