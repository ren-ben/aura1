<script setup lang="ts">
// The Academy: the registrar's hall of a very old university, kept the way
// Miskatonic kept its restricted stacks. The degree as an astrolabe (six
// rings, one per semester, every module an arc as long as its ECTS; the rete
// turns with the term and can be turned by hand), the rector's armillary
// sphere, the tally and the ledger of courses with their grades as seals,
// and the week as u:find has it.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import * as THREE from 'three';
import Frame from '../components/Frame.vue';
import LectureMap from '../components/LectureMap.vue';
import Calendar from '../components/Calendar.vue';
import Codex from '../components/Codex.vue';
import Arcana from '../components/Arcana.vue';
import Gl from '../components/Gl.vue';
import Num from '../components/Num.vue';
import Plate from '../components/Plate.vue';
import { narrow } from '../screen';
import { lights } from '../gl/models';
import { reduced } from '../gl/engine';
import { rand, starfield } from '../gl/plate';
import { CURRICULUM, FIRST_TERM, GRADES, modules, tally as tallyOf, termOf, week as weekOf, whereWho, type Module } from '../academy';
import { actions, folioApi, state, type Course } from '../store';

defineProps<{ active: boolean }>();

const MODULES = computed(() => modules(state.courses));
const tally = computed(() => tallyOf(state.courses));
const TERM = termOf();
const coursesOf = (code: string) => state.courses.filter((c) => c.module === code);

// ---- grades, sealed ------------------------------------------------------
// A grade is pressed in like a seal, and its word shown as it lands.
const sealed = ref<{ id: number; word: string } | null>(null);
async function seal(c: Course, grade: number | null) {
  sealed.value = { id: c.id, word: grade ? GRADES[grade - 1]! : 'unsealed' };
  setTimeout(() => { if (sealed.value?.id === c.id) sealed.value = null; }, 1100);
  await actions.gradeCourse(c, grade === c.grade ? null : grade);
}

// ---- u:find --------------------------------------------------------------
// It moves rooms and dates and posts exams as the term goes on: asked again
// by hand, and on its own once a day when the pane opens.
const refreshing = ref(false);
async function refresh() {
  refreshing.value = true;
  await actions.refreshCourses(TERM.name);
  refreshing.value = false;
}
onMounted(async () => {
  const term = state.courses.filter((c) => c.semester === TERM.name);
  if (!state.demo && term.some((c) => Date.now() - Date.parse(c.refreshedAt) > 864e5)) refresh();
  // Moodle the same way: read again once a day, if it is bound and still
  // takes the token.
  if (state.demo) return;
  const { moodle } = await folioApi.list().catch(() => ({ moodle: null }));
  if (moodle?.bound && !moodle.refusedAt && Date.now() - Date.parse(moodle.syncedAt ?? '0') > 864e5) folioApi.sync().catch(() => {});
});
const lastAsked = computed(() => {
  const times = state.courses.filter((c) => c.semester === TERM.name).map((c) => Date.parse(c.refreshedAt));
  return times.length ? new Date(Math.min(...times)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).toLowerCase() : '';
});
const nr = ref('');
const adding = ref(false);
async function add(nrs: string[], semester = TERM.name) {
  adding.value = true;
  await actions.addCourses(nrs, semester);
  adding.value = false;
  nr.value = '';
}
const firstTerm = () => add(FIRST_TERM.courses, FIRST_TERM.semester);
// When a group's dates are listed, the first of them says which it is.
const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const groupLabel = (g: Course['groups'][number]) => {
  const e = g.events[0];
  return e ? `${new Date(e.begin).toLocaleDateString('en-GB', { weekday: 'short' }).toLowerCase()} ${hhmm(new Date(e.begin))}` : g.id;
};

// ---- exams ---------------------------------------------------------------
// Every exam ahead, across the courses kept; the same module exam listed by
// two of its courses is shown once.
const exams = computed(() => {
  const seen = new Map<string, { begin: Date; title: string; room: string; module: string }>();
  for (const c of state.courses) for (const e of c.exams) {
    if (Date.parse(e.end) > Date.now()) seen.set(e.id, { begin: new Date(e.begin), title: e.title, room: e.room.replace(/-?Hörsaal/, ''), module: c.module });
  }
  return [...seen.values()].sort((a, b) => a.begin.getTime() - b.begin.getTime());
});
const examDay = (d: Date) => `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).toLowerCase()} ${hhmm(d)}`;
const daysTo = (d: Date) => Math.max(0, Math.ceil((d.getTime() - Date.now()) / 864e5));

// ---- the term ------------------------------------------------------------
const term = computed(() => {
  const from = TERM.from.getTime(), to = TERM.to.getTime();
  const u = (Date.now() - from) / (to - from);
  const n = Math.floor((Date.now() - from) / 6048e5) + 1;
  return { u: Math.max(0, Math.min(1, u)), label: u < 0 ? `begins in ${Math.ceil(-u * (to - from) / 864e5)} days` : u > 1 ? 'ended' : `week ${n} of ${Math.ceil((to - from) / 6048e5)}` };
});

// ---- the astrolabe -------------------------------------------------------
// In a 224 x 224 box centred on the pole; the canvas and the overlay fit it
// the same way.
const R0 = 34, STEP = 12;
const ringR = (sem: number) => R0 + sem * STEP;
type Arc = Module & { a0: number; a1: number; r: number };
const arcs = computed(() => {
  const out: Arc[] = [];
  for (let sem = 1; sem <= 6; sem++) {
    const ms = MODULES.value.filter((m) => m.sem === sem);
    const total = ms.reduce((a, m) => a + m.ects, 0);
    let a = -Math.PI / 2;
    for (const m of ms) {
      const span = (m.ects / total) * Math.PI * 2;
      out.push({ ...m, a0: a + 0.035, a1: a + span - 0.035, r: ringR(sem) });
      a += span;
    }
  }
  return out;
});
const fit = (w: number, h: number) => { const s = Math.min(w, h) / 224; return { s, cx: w / 2, cy: h / 2 }; };

// What the drawing reads every frame: the cursor, the arc under it, the one
// chosen, and the rete as turned by hand.
const live = { mx: 0, my: 0, tx: 0, ty: 0, hover: '', sel: '', spin: 0, spinTo: 0 };
function parallax(e: PointerEvent) {
  live.tx = (e.clientX / Math.max(1, innerWidth) - 0.5) * 2;
  live.ty = (e.clientY / Math.max(1, innerHeight) - 0.5) * 2;
}
onMounted(() => addEventListener('pointermove', parallax));
onBeforeUnmount(() => removeEventListener('pointermove', parallax));

const hovered = ref('');
const chosen = ref('');
const overArc = (code: string) => { hovered.value = code; live.hover = code; };
const offArc = () => { hovered.value = ''; live.hover = ''; };
function choose(code: string) {
  chosen.value = chosen.value === code ? '' : code;
  live.sel = chosen.value;
}
const moduleOf = (code: string) => MODULES.value.find((m) => m.code === code);
const STATUS = { passed: 'passed', running: 'this term', open: 'open to you', locked: 'not yet' } as const;

// The rete turns by hand, and eases back to where the term has it.
let dragging: { x: number; spin: number } | null = null;
function grab(e: PointerEvent) { if ((e.target as Element).closest('.hit')) return; dragging = { x: e.clientX, spin: live.spinTo }; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }
function turnRete(e: PointerEvent) { if (dragging) live.spinTo = dragging.spin + (e.clientX - dragging.x) * 0.012; }
function letGo() { dragging = null; live.spinTo = 0; }

const drawAstrolabe = computed(() => {
  const list = arcs.value;
  const turn = term.value.u;
  return (g: CanvasRenderingContext2D, w: number, h: number, t: number) => {
    live.mx += (live.tx - live.mx) * 0.06;
    live.my += (live.ty - live.my) * 0.06;
    live.spin += (live.spinTo - live.spin) * (dragging ? 0.3 : 0.05);
    const { s, cx, cy } = fit(w, h);
    const grey = (v: number) => { const c = Math.max(0, Math.min(255, v * 255)) | 0; return `rgb(${c},${c},${c})`; };
    const P = (a: number, r: number) => [cx + Math.cos(a) * r * s, cy + Math.sin(a) * r * s] as const;
    starfield(g, w, h / 0.8, Math.round((w * h) / 110), 71, live.mx * -6, live.my * -4);
    // The mater: a worn plate, lit a little from the upper left.
    const plate = g.createRadialGradient(cx - 30 * s, cy - 30 * s, 10 * s, cx, cy, 110 * s);
    plate.addColorStop(0, grey(0.045)); plate.addColorStop(1, grey(0.0));
    g.fillStyle = plate; g.beginPath(); g.arc(cx, cy, 108 * s, 0, 7); g.fill();
    const r = rand(5);
    for (let i = 0; i < 700; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 106;
      const [x, y] = P(a, d);
      g.fillStyle = grey(0.08 + r() * 0.14); g.fillRect(x, y, 1, 1);
    }
    // The limb: two rules and the scale, a long mark every thirty degrees.
    g.strokeStyle = grey(0.55); g.lineWidth = Math.max(1, s * 0.6);
    for (const rr of [108, 103]) { g.beginPath(); g.arc(cx, cy, rr * s, 0, 7); g.stroke(); }
    for (let k = 0; k < 120; k++) {
      const a = (k / 120) * Math.PI * 2, long = k % 10 === 0;
      const [x1, y1] = P(a, 103), [x2, y2] = P(a, long ? 97 : 100.5);
      g.strokeStyle = grey(long ? 0.7 : 0.35); g.lineWidth = Math.max(1, s * (long ? 0.6 : 0.35));
      g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
    }
    // The semester rings, faint; the one under the cursor less so.
    g.setLineDash([1, 3]);
    const hotSem = list.find((m) => m.code === live.hover)?.sem ?? 0;
    for (let sem = 1; sem <= 6; sem++) { g.strokeStyle = grey(sem === hotSem ? 0.4 : 0.18); g.lineWidth = 1; g.beginPath(); g.arc(cx, cy, ringR(sem) * s, 0, 7); g.stroke(); }
    g.setLineDash([]);
    // The modules. Passed: solid. This term's: a band of grain that stirs.
    // Open to you: an outline. Not yet: a trace. The one under the cursor
    // and the one chosen stand out.
    for (const m of list) {
      const width = 7 * s, hot = m.code === live.hover, sel = m.code === live.sel;
      if (m.status === 'passed' || m.status === 'open') {
        g.strokeStyle = grey(m.status === 'passed' ? 0.85 : hot ? 0.9 : 0.5);
        g.lineWidth = m.status === 'passed' ? width : Math.max(1, s * 0.5);
        g.beginPath(); g.arc(cx, cy, m.r * s, m.a0, m.a1); g.stroke();
        if (m.status === 'open') { g.beginPath(); g.arc(cx, cy, (m.r - 3.5) * s, m.a0, m.a1); g.stroke(); g.beginPath(); g.arc(cx, cy, (m.r + 3.5) * s, m.a0, m.a1); g.stroke(); }
      } else if (m.status === 'running') {
        const n = Math.round((m.a1 - m.a0) * m.r * 9 * s * (hot ? 1.8 : 1));
        for (let i = 0; i < n; i++) {
          const a = m.a0 + r() * (m.a1 - m.a0), d = m.r + (r() - 0.5) * 7;
          const [x, y] = P(a, d);
          g.fillStyle = grey((hot ? 0.75 : 0.55) + 0.45 * (0.5 + 0.5 * Math.sin(t * 1.4 + a * 9 + d)));
          g.fillRect(x, y, 1, 1);
        }
      } else {
        g.strokeStyle = grey(hot ? 0.75 : 0.3); g.lineWidth = Math.max(1, s * 0.5); g.setLineDash([2, 4]);
        g.beginPath(); g.arc(cx, cy, m.r * s, m.a0, m.a1); g.stroke(); g.setLineDash([]);
      }
      if (hot || sel) {
        // Brackets at the ends of the arc, and for the chosen one a dotted
        // band that runs along it.
        for (const a of [m.a0, m.a1]) {
          const [x1, y1] = P(a, m.r - 5.5), [x2, y2] = P(a, m.r + 5.5);
          g.strokeStyle = grey(1); g.lineWidth = Math.max(1, s * 0.6);
          g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
        }
        if (sel) {
          g.strokeStyle = grey(0.9); g.lineWidth = Math.max(1, s * 0.4); g.setLineDash([2, 3]); g.lineDashOffset = -t * 8;
          for (const d of [-5.5, 5.5]) { g.beginPath(); g.arc(cx, cy, (m.r + d) * s, m.a0, m.a1); g.stroke(); }
          g.setLineDash([]); g.lineDashOffset = 0;
        }
      }
    }
    // The rete: the ecliptic ring set off the pole, and the pointer, turned
    // as far round as the term has gone, or as far as the hand turned it.
    const rot = -Math.PI / 2 + turn * Math.PI * 2 + Math.sin(t * 0.2) * 0.004 + live.spin;
    g.strokeStyle = grey(0.45); g.lineWidth = Math.max(1, s * 0.5);
    const [ex, ey] = P(rot + Math.PI, 20);
    g.beginPath(); g.arc(ex, ey, 70 * s, 0, 7); g.stroke();
    // Star pointers on the rete, the way the old ones carried them.
    for (let k = 0; k < 5; k++) {
      const a = rot + 0.9 + k * 1.1, [sx, sy] = P(a, 58 + (k % 2) * 16);
      g.fillStyle = grey(0.7); g.beginPath(); g.arc(sx, sy, s * 1.1, 0, 7); g.fill();
    }
    const [tx, ty] = P(rot, 100);
    g.strokeStyle = grey(0.95); g.lineWidth = Math.max(1, s * 0.8);
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(tx, ty); g.stroke();
    g.fillStyle = grey(1);
    g.beginPath();
    for (let k = 0; k < 8; k++) { const a = rot + k * Math.PI / 4, rr = (k % 2 ? 1.2 : 3.4) * s; g.lineTo(tx + Math.cos(a) * rr, ty + Math.sin(a) * rr); }
    g.fill();
    // The pole: the StEOP, the first gate, where every degree starts; an eye
    // that follows the cursor a little.
    g.fillStyle = grey(0.03); g.beginPath(); g.arc(cx, cy, 26 * s, 0, 7); g.fill();
    g.strokeStyle = grey(0.5); g.lineWidth = Math.max(1, s * 0.5); g.beginPath(); g.arc(cx, cy, 26 * s, 0, 7); g.stroke();
    const blink = (t % 9) < 0.18 ? 0.1 : 1;
    const ew = 11 * s, eh = 5.6 * s, open = (0.75 + 0.25 * Math.sin(t * 0.5)) * blink;
    g.fillStyle = grey(0.92);
    g.beginPath(); g.moveTo(cx - ew, cy); g.quadraticCurveTo(cx, cy - eh * 2 * open, cx + ew, cy); g.quadraticCurveTo(cx, cy + eh * 2 * open, cx - ew, cy); g.fill();
    g.fillStyle = grey(0); g.beginPath(); g.ellipse(cx + live.mx * 4 * s, cy + live.my * 1.5 * s, 1.5 * s, eh * 0.85 * open, 0, 0, 7); g.fill();
  };
});

// The overlay: a label and a hit band along every arc.
const arcPath = (m: Arc) => {
  const pt = (a: number) => `${(Math.cos(a) * m.r).toFixed(2)} ${(Math.sin(a) * m.r).toFixed(2)}`;
  return `M ${pt(m.a0)} A ${m.r} ${m.r} 0 ${m.a1 - m.a0 > Math.PI ? 1 : 0} 1 ${pt(m.a1)}`;
};
const labels = computed(() => arcs.value.map((m) => {
  const mid = (m.a0 + m.a1) / 2;
  const deg = (mid * 180) / Math.PI + 90;
  const flip = Math.sin(mid) > 0.05;
  return { ...m, d: arcPath(m), x: Math.cos(mid) * (m.r - 5.2), y: Math.sin(mid) * (m.r - 5.2), rot: flip ? deg + 180 : deg, tx: Math.cos(mid) * (m.r + 8), ty: Math.sin(mid) * (m.r + 8) };
}));
// The card for the arc under the cursor, or else the one chosen.
const card = computed(() => {
  const m = moduleOf(hovered.value || chosen.value);
  if (!m) return null;
  const cs = coursesOf(m.code);
  return { m, cs, earned: cs.filter((c) => c.grade !== null && c.grade <= 4).reduce((a, c) => a + c.ects, 0) };
});

// ---- the stacks of the faculty ----------------------------------------------
// The courses kept stand as volumes on a shelf, the way the books do in the
// library: this term's on the upper shelf in the order of their modules,
// the rest below; as thick as their ECTS, a lecture taller than its
// exercise; a graded one carries its seal on the spine. Hover one to read
// it, click it to take it down and grade it.
const volumeKey = computed(() => state.courses.map((c) => `${c.id}:${c.grade}:${c.module}:${c.semester}`).join(','));
const pulledId = ref<number | null>(null);
const pulled = computed(() => state.courses.find((c) => c.id === pulledId.value) ?? null);
const spineTip = ref<{ x: number; y: number; w: number; c: Course } | null>(null);
// A catalogue tag under every volume, drawn crisp over the dithered shelf.
const tags = ref<{ id: number; x: number; y: number; label: string; out: boolean }[]>([]);
const SHORT: Record<string, string> = { STEOP1: 'EP1', STEOP2: 'RM', STEOP3: 'FSP' };

// A spine as a grimoire's: tooled leather, raised bands, a sigil of its
// module, the title in blackletter up the spine. Drawn at the book's own
// proportions, so nothing on it is stretched. A passed volume is tooled in
// gilt; a failed one is scored through.
const SIGILS = ['M0-1L.87.5L-.87.5Z', 'M0-1L.95-.31L.59.81L-.59.81L-.95-.31Z', 'M0-1V1M-1 0H1', 'M0-1L.59.81L-.95-.31L.95-.31L-.59.81Z', 'M-.7-.7L.7.7M.7-.7L-.7.7', 'M0-1L1 0L0 1L-1 0Z'];
function spineTexture(c: Course, thick: number, tall: number): THREE.CanvasTexture {
  const S = 520, w = Math.round(thick * S), h = Math.round(tall * S);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d')!;
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  const passed = c.grade !== null && c.grade <= 4, failed = c.grade === 5;
  const gilt = passed ? '#fffaf0' : '#e6dcc6';
  const draw = () => {
    // Leather: a dark ground, mottled.
    g.fillStyle = passed ? '#8a8172' : failed ? '#2e2a26' : '#5c544a'; g.fillRect(0, 0, w, h);
    const r = rand(c.id * 31 + 7);
    for (let i = 0; i < 900; i++) { const v = 30 + r() * 70; g.fillStyle = `rgba(${v},${v},${v},.5)`; g.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 2); }
    // Raised bands, each lit on top and shadowed below.
    const bands = [0.1, 0.24, 0.76, 0.9];
    for (const y of bands) {
      g.fillStyle = '#0c0b0a'; g.fillRect(0, y * h + 5, w, 4);
      g.fillStyle = gilt; g.fillRect(0, y * h - 3, w, 2); g.fillRect(0, y * h + 3, w, 1);
    }
    // A tooled frame between the middle bands.
    g.strokeStyle = gilt; g.lineWidth = 3;
    g.strokeRect(10, 0.24 * h + 14, w - 20, 0.52 * h - 28);
    g.lineWidth = 1.5;
    g.strokeRect(17, 0.24 * h + 21, w - 34, 0.52 * h - 42);
    // Small tooled crosses in the frame's corners.
    for (const [px, py] of [[17, 0.24 * h + 21], [w - 17, 0.24 * h + 21], [17, 0.76 * h - 21], [w - 17, 0.76 * h - 21]] as const) {
      g.fillStyle = gilt; g.fillRect(px - 4, py - 1, 8, 2); g.fillRect(px - 1, py - 4, 2, 8);
    }
    // The title, up the spine in blackletter, sized to fit the panel.
    const label = SHORT[c.module] ?? c.module;
    g.save(); g.translate(w / 2 + 2, 0.5 * h); g.rotate(-Math.PI / 2);
    g.fillStyle = gilt; g.textAlign = 'center'; g.textBaseline = 'middle';
    let size = Math.min(w * 0.7, 84);
    g.font = `${size}px UnifrakturMaguntia, serif`;
    while (g.measureText(label).width > 0.46 * h && size > 12) { size -= 2; g.font = `${size}px UnifrakturMaguntia, serif`; }
    g.fillText(label, 0, 0);
    g.restore();
    // The module's sigil in the head panel, the type in the tail.
    const k = CURRICULUM.findIndex((m) => m.code === c.module);
    const R = Math.min(w, 0.14 * h) * 0.32;
    g.save(); g.translate(w / 2, 0.17 * h); g.strokeStyle = gilt; g.lineWidth = 2.5;
    g.beginPath(); g.arc(0, 0, R * 1.25, 0, 7); g.stroke();
    g.scale(R, R); g.lineWidth = 2.5 / R; g.stroke(new Path2D(SIGILS[Math.max(0, k) % SIGILS.length]!));
    g.restore();
    g.fillStyle = gilt; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `${Math.round(Math.min(w * 0.26, 22))}px Silkscreen, monospace`;
    g.fillText(c.type, w / 2, 0.83 * h);
    // The grade, pressed in wax at the foot.
    if (c.grade !== null) {
      const sy = 0.955 * h, sr = Math.min(w * 0.26, 0.04 * h);
      g.fillStyle = passed ? '#d8d0bf' : '#4a4640';
      g.beginPath(); for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2, rr = sr * (i % 2 ? 1 : 1.12); g.lineTo(w / 2 + Math.cos(a) * rr, sy + Math.sin(a) * rr); } g.fill();
      g.fillStyle = '#141414'; g.font = `${Math.round(sr * 1.3)}px Tektur, monospace`; g.fillText(String(c.grade), w / 2, sy + 1);
    }
    // Failed: scored through with a knife.
    if (failed) { g.strokeStyle = '#8c8578'; g.lineWidth = 2; g.beginPath(); g.moveTo(4, 0.3 * h); g.lineTo(w - 4, 0.7 * h); g.moveTo(w - 4, 0.3 * h); g.lineTo(4, 0.7 * h); g.stroke(); }
    t.needsUpdate = true;
  };
  draw();
  // The blackletter may still be on its way; drawn again once it is here.
  document.fonts.load('40px UnifrakturMaguntia').then(draw, () => {});
  return t;
}

const faculty = ({ scene, group, camera, turn, canvas }: { scene: THREE.Scene; group: THREE.Group; camera: THREE.PerspectiveCamera; turn: { x: number; y: number }; canvas: HTMLCanvasElement }) => {
  camera.position.set(0, 0.12, 3.35); camera.lookAt(0, 0.05, 0);
  scene.fog = new THREE.Fog(0x000000, 4, 9);
  // Wood with a grain, and a back of planks, drawn once as textures, the way
  // the study's desk and wall are.
  const grain = (w: number, h: number, planks: number, base: number) => {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const g = cv.getContext('2d')!, r = rand(w + planks);
    g.fillStyle = `rgb(${base},${base},${base})`; g.fillRect(0, 0, w, h);
    for (let i = 0; i < w * 1.2; i++) {
      const y = r() * h, v = base + (r() - 0.5) * 40;
      g.fillStyle = `rgb(${v | 0},${v | 0},${v | 0})`; g.fillRect(0, y, w, 1 + r() * 2);
    }
    for (let k = 1; k < planks; k++) { g.fillStyle = 'rgb(10,10,10)'; g.fillRect((k / planks) * w, 0, 3, h); }
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  };
  const wood = new THREE.MeshLambertMaterial({ map: grain(256, 64, 1, 120) });
  const back = grain(512, 256, 7, 62); back.rotation = Math.PI / 2; back.center.set(0.5, 0.5);
  const dark = new THREE.MeshLambertMaterial({ map: back });
  // Carved into the back, behind the volumes: a circle of the laws, the way
  // a grimoire's circle carries its names.
  const carving = (() => {
    const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 512;
    const g = cv.getContext('2d')!;
    const cx = 512, cy = 256;
    const draw = () => {
      g.clearRect(0, 0, 1024, 512);
      g.strokeStyle = 'rgba(190,182,166,.6)'; g.fillStyle = 'rgba(190,182,166,.6)'; g.lineWidth = 2;
      for (const r of [228, 236, 170]) { g.beginPath(); g.arc(cx, cy, r, 0, 7); g.stroke(); }
      g.beginPath();
      for (let i = 0; i <= 5; i++) { const a = -Math.PI / 2 + (i * 4 * Math.PI) / 5; g.lineTo(cx + Math.cos(a) * 168, cy + Math.sin(a) * 168); }
      g.stroke();
      const laws = ['F = dp/dt', '∇·E = ρ/ε₀', 'E = mc²', 'iħ ∂ₜψ = Hψ', 'dS ≥ 0', '∇×B = μ₀J', 'L = T − V', 'ΔxΔp ≥ ħ/2'];
      g.font = '22px "IM Fell English", serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      laws.forEach((law, i) => {
        const a = (i / laws.length) * Math.PI * 2 - Math.PI / 2;
        g.save(); g.translate(cx + Math.cos(a) * 202, cy + Math.sin(a) * 202); g.rotate(a + Math.PI / 2); g.fillText(law, 0, 0); g.restore();
      });
      g.font = '72px UnifrakturMaguntia, serif'; g.fillText('Ω', cx, cy);
      t.needsUpdate = true;
    };
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    draw();
    Promise.all([document.fonts.load('22px "IM Fell English"'), document.fonts.load('40px UnifrakturMaguntia')]).then(draw, () => {});
    return new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.5, depthWrite: false });
  })();
  const pages = new THREE.MeshLambertMaterial({ color: 0xcfc6b2 });
  const iron = new THREE.MeshStandardMaterial({ color: 0x3a3632, roughness: 0.45, metalness: 0.7 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.35, metalness: 0.6, emissive: 0x2a2620 });
  const paper = new THREE.MeshLambertMaterial({ color: 0xe8e2d4 });
  const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); group.add(b); return b;
  };
  // The case: a back, two sides, a cornice, and a shelf for this term; a
  // second one below only once there are other terms to put on it.
  const term = state.courses.filter((c) => c.semester === TERM.name);
  const rest = state.courses.filter((c) => c.semester !== TERM.name);
  const order = (list: Course[]) => [...list].sort((a, b) => CURRICULUM.findIndex((m) => m.code === a.module) - CURRICULUM.findIndex((m) => m.code === b.module) || a.nr.localeCompare(b.nr));
  const thickOf = (c: Course) => 0.2 + c.ects * 0.036;
  // As wide as the longer row, with room at the end for the cradle.
  const span = (list: Course[]) => list.reduce((a, c, i, all) => a + thickOf(c) + 0.012 + (i && c.module !== all[i - 1]!.module ? 0.1 : 0), 0);
  const W = Math.max(2.6, span(order(term)), span(order(rest))) + 0.75;
  const TOP = 0, LOW = -0.98, floor = rest.length ? LOW : TOP;
  const tall = 0.98 - floor + 0.1, mid = (0.98 + floor - 0.1) / 2;
  box(W + 0.2, tall, 0.05, dark, 0, mid, -0.2);
  const circle = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), carving); circle.position.set(0, TOP + 0.48, -0.17); group.add(circle);
  for (const x of [-W / 2 - 0.07, W / 2 + 0.07]) box(0.12, tall + 0.05, 0.5, wood, x, mid, 0.02);
  box(W + 0.4, 0.1, 0.6, wood, 0, 0.98, 0.04);
  for (const y of rest.length ? [TOP, LOW] : [TOP]) box(W + 0.1, 0.06, 0.46, wood, 0, y - 0.03, 0.02);
  const books: THREE.Mesh[] = [];
  const shelve = (list: Course[], y: number) => {
    let x = -W / 2 + 0.1, last = '';
    for (const c of order(list)) {
      // A brass bookend between one module and the next.
      if (last && c.module !== last) { box(0.025, 0.36, 0.3, brass, x + 0.045, y + 0.18, 0.04); x += 0.1; }
      last = c.module;
      const thick = thickOf(c), tall = (c.type === 'VO' ? 0.8 : 0.68) - (c.id % 3) * 0.02, deep = 0.4;
      // Leather boards in a tone of their own, a module sharing one.
      const tone = 0.38 + ((CURRICULUM.findIndex((m) => m.code === c.module) * 37) % 5) * 0.05;
      const leather = new THREE.MeshStandardMaterial({ color: new THREE.Color(tone, tone * 0.95, tone * 0.88), roughness: 0.62, metalness: 0.08 });
      // The book is built the way a bound book is: a block of pages, set in a
      // little from two boards, and a rounded spine across the front. The
      // page block is what the cursor finds.
      const b = new THREE.Mesh(new THREE.BoxGeometry(thick - 0.03, tall - 0.035, deep - 0.03), pages);
      // Some sit further forward than others, the way nobody shelves evenly.
      b.position.set(x + thick / 2, y + tall / 2, 0.02 + ((c.id * 7) % 3) * 0.028);
      b.userData = { id: c.id, module: c.module, home: b.position.clone(), out: 0, shelf: y };
      for (const sx of [-1, 1]) {
        const board = new THREE.Mesh(new THREE.BoxGeometry(0.016, tall, deep), leather);
        board.position.set(sx * (thick / 2 - 0.008), 0, 0); b.add(board);
      }
      const r = thick / 2, bulge = 0.4;
      const spine = new THREE.Mesh(new THREE.CylinderGeometry(r, r, tall, 28, 1, true, -Math.PI / 2, Math.PI),
        new THREE.MeshStandardMaterial({ map: spineTexture(c, thick, tall), roughness: 0.5, metalness: 0.12 }));
      spine.scale.z = bulge; spine.position.z = deep / 2 - 0.01; b.add(spine);
      // Raised bands, wrapping round the curve of the spine.
      for (const f of [0.1, 0.24, 0.76, 0.9]) {
        const band = new THREE.Mesh(new THREE.TorusGeometry(r, 0.014, 6, 24, Math.PI), leather);
        band.rotation.x = Math.PI / 2; band.scale.y = bulge;
        band.position.set(0, (0.5 - f) * tall, deep / 2 - 0.01); b.add(band);
      }
      // Brass caps on the corners of the head and tail.
      for (const sy of [-1, 1]) for (const sx of [-1, 1]) {
        const cap = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.05), brass);
        cap.position.set(sx * (thick / 2 - 0.006), sy * (tall / 2 - 0.012), deep / 2 - 0.035); b.add(cap);
      }
      // A ribbon hanging out of the pages, on every other volume.
      if (c.id % 2) {
        const ribbon = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.2, 0.004), paper);
        ribbon.position.set(thick * 0.18, tall / 2 - 0.08, deep / 2 + 0.035); ribbon.rotation.z = 0.08; b.add(ribbon);
      }
      // A StEOP volume is strapped shut with an iron band and a lock until it
      // is passed: the gate has to be earned.
      if (c.module.startsWith('STEOP') && !(c.grade !== null && c.grade <= 4)) {
        const strap = new THREE.Mesh(new THREE.BoxGeometry(thick + 0.02, 0.05, deep + 0.03), iron);
        strap.position.set(0, -tall * 0.08, 0.02); b.add(strap);
        const lock = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, 0.03), brass);
        lock.position.set(0, -tall * 0.08 - 0.03, deep / 2 + 0.05); b.add(lock);
        const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.007, 6, 16, Math.PI), brass);
        shackle.position.set(0, -tall * 0.08 + 0.01, deep / 2 + 0.05); b.add(shackle);
        const hole = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.025, 0.005), iron);
        hole.position.set(0, -tall * 0.08 - 0.035, deep / 2 + 0.066); b.add(hole);
      }
      group.add(b); books.push(b);
      x += thick + 0.012;
    }
    return x;
  };
  // A bare shelf holds the first term's volumes as outlines, waiting: one a
  // module, as thick as its ECTS.
  if (!state.courses.length) {
    let x = -W / 2 + 0.2;
    const line = new THREE.LineBasicMaterial({ color: 0x8a847a });
    for (const m of CURRICULUM.filter((c) => c.sem === 1)) {
      const thick = 0.16 + m.ects * 0.06, tall = 0.66;
      const ghost = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(thick, tall, 0.36)), line);
      ghost.position.set(x + thick / 2, TOP + tall / 2, 0.04);
      group.add(ghost);
      x += thick + 0.06;
    }
  }
  const end = shelve(term, TOP);
  shelve(rest, LOW);
  // On the upper shelf's free end, Newton's cradle: the two end balls take
  // turns, the three between them pass the knock along and never move.
  const hx = Math.max(end + 0.3, W / 2 - 0.32);
  const cradle = new THREE.Group(); cradle.position.set(hx, TOP, 0.05); group.add(cradle);
  const rod = (len: number) => new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, len, 6), brass);
  for (const z of [-0.09, 0.09]) {
    for (const x of [-0.2, 0.2]) { const post = rod(0.46); post.position.set(x, 0.23, z); cradle.add(post); }
    const bar = rod(0.4); bar.rotation.z = Math.PI / 2; bar.position.set(0, 0.46, z); cradle.add(bar);
  }
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.03, 0.26), wood); base.position.y = 0.015; cradle.add(base);
  const bobs = [-2, -1, 0, 1, 2].map((i) => {
    const pivot = new THREE.Group(); pivot.position.set(i * 0.066, 0.46, 0); cradle.add(pivot);
    for (const z of [-0.09, 0.09]) {
      const thread = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, Math.hypot(0.33, z), 4), paper);
      thread.position.set(0, -0.165, z / 2); thread.rotation.x = -Math.atan2(z, 0.33); pivot.add(thread);
    }
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.032, 16, 12), brass); ball.position.y = -0.33; pivot.add(ball);
    return pivot;
  });
  // On top of the case: a Crookes radiometer, its vanes turned by the lamp's
  // light; a black candle burning down; tomes piled where no one reshelves them.
  const bulb = new THREE.Group(); bulb.position.set(-W / 2 + 0.45, 1.03, 0.05); group.add(bulb);
  const globe = new THREE.Mesh(new THREE.SphereGeometry(0.15, 20, 14), new THREE.MeshBasicMaterial({ color: 0xbdb6a8, wireframe: true, transparent: true, opacity: 0.35 }));
  globe.position.y = 0.26; bulb.add(globe);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.06, 0.12, 12), paper); stem.position.y = 0.06; bulb.add(stem);
  const spindle = rod(0.2); spindle.position.y = 0.22; bulb.add(spindle);
  const vanes = new THREE.Group(); vanes.position.y = 0.27; bulb.add(vanes);
  const soot = new THREE.MeshBasicMaterial({ color: 0x0c0b0a, side: THREE.DoubleSide });
  for (let k = 0; k < 4; k++) {
    const arm = new THREE.Group(); arm.rotation.y = (k * Math.PI) / 2; vanes.add(arm);
    const vane = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.05), k % 2 ? paper : soot);
    vane.position.x = 0.075; arm.add(vane);
  }
  const wax = new THREE.MeshStandardMaterial({ color: 0x2a2724, roughness: 0.8 });
  const cx = W / 2 - 0.5;
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.3, 16), wax); stick.position.set(cx, 1.18, 0.05); group.add(stick);
  const drip = new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.1, 4, 8), wax); drip.position.set(cx + 0.045, 1.22, 0.07); group.add(drip);
  const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.08, 0.03, 20), brass); dish.position.set(cx, 1.045, 0.05); group.add(dish);
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.025, 12, 10), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  flame.position.set(cx, 1.37, 0.05); group.add(flame);
  const candlelight = new THREE.PointLight(0xffe8c8, 1.2, 2.5, 1.5); candlelight.position.set(cx, 1.42, 0.2); group.add(candlelight);
  for (let k = 0; k < 3; k++) { const tome = box(0.5 - k * 0.06, 0.07, 0.34 - k * 0.03, k % 2 ? dark : wood, cx - 0.55, 1.07 + k * 0.07, 0.04); tome.rotation.y = (k - 1) * 0.12; }
  // A lamp over the case, and dust in its light.
  // Lit the way the study is: almost no ambient, one lamp throwing a pool
  // of light across the shelf from above and in front, and a faint cold fill.
  scene.add(new THREE.AmbientLight(0xffffff, 0.06));
  const lamp = new THREE.SpotLight(0xfff4e0, 26, 9, 0.62, 0.55, 1.3);
  lamp.position.set(-0.6, 2.2, 2.4); lamp.target.position.set(0, 0.1, 0);
  scene.add(lamp, lamp.target);
  const fill = new THREE.DirectionalLight(0xffffff, 0.35); fill.position.set(2, 0.6, 2); scene.add(fill);
  const D = 90, dr = rand(4), dust = new Float32Array(D * 3);
  for (let i = 0; i < D; i++) dust.set([(dr() - 0.5) * 3, dr() * 2 - 1, dr() * 0.8 + 0.1], i * 3);
  const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(dust, 3));
  const motes = new THREE.Points(dg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.012 })); group.add(motes);
  // Hover and click. A drag that moved is a look round, not a pick.
  const ray = new THREE.Raycaster(), v = new THREE.Vector3();
  let from = { x: 0, y: 0, moved: false }, hover: THREE.Mesh | null = null;
  const pick = (e: PointerEvent) => {
    const b = canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1), camera);
    return (ray.intersectObjects(books, false)[0]?.object as THREE.Mesh | undefined) ?? null;
  };
  canvas.addEventListener('pointerdown', (e) => { from = { x: e.clientX, y: e.clientY, moved: false }; });
  canvas.addEventListener('pointermove', (e) => {
    if (Math.abs(e.clientX - from.x) + Math.abs(e.clientY - from.y) > 6) from.moved = true;
    hover = pick(e);
    canvas.style.cursor = hover ? 'pointer' : '';
  });
  canvas.addEventListener('pointerleave', () => { hover = null; spineTip.value = null; });
  canvas.addEventListener('pointerup', (e) => {
    if (from.moved) return;
    const hit = pick(e);
    pulledId.value = hit ? (pulledId.value === hit.userData.id ? null : hit.userData.id) : null;
  });
  // The camera is set back just far enough to take in the case at whatever
  // shape the frame is.
  // A strip is left free along the bottom, for the tags and the hint.
  const halfW = W / 2 + 0.4, halfH = (1.46 - floor) / 2 + 0.16, lookY = (1.46 + floor) / 2 - 0.14;
  return (t: number) => {
    const f = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const d = Math.max(halfW / (f * camera.aspect), halfH / f) + 0.5;
    camera.position.set(0, lookY + 0.05, d); camera.lookAt(0, lookY, 0);
    // The case turns only a little, however far it is dragged.
    group.rotation.set(0.16 + Math.max(-0.12, Math.min(0.12, turn.x * 0.3)), -0.3 + Math.max(-0.35, Math.min(0.35, turn.y * 0.5)), 0);
    for (const b of books) {
      const d = b.userData as { id: number; module: string; home: THREE.Vector3; out: number };
      const want = d.id === pulledId.value ? 0.34 : b === hover ? 0.08 : d.module === (live.hover || live.sel) ? 0.05 : 0;
      d.out += (want - d.out) * 0.14;
      b.position.set(d.home.x, d.home.y + d.out * 0.25, d.home.z + d.out);
      b.rotation.x = -d.out * 0.35;
    }
    if (Math.round(t * 20) % 2 === 0) {
      const r = canvas.getBoundingClientRect();
      // One tag a module, under the middle of its volumes, on the shelf's edge.
      const byModule = new Map<string, THREE.Mesh[]>();
      for (const b of books) { const k = `${b.userData.module}@${b.userData.shelf}`; byModule.set(k, [...(byModule.get(k) ?? []), b]); }
      tags.value = [...byModule.values()].map((row) => {
        const d = row[0]!.userData as { id: number; module: string; home: THREE.Vector3 };
        const x = row.reduce((a, b) => a + b.userData.home.x, 0) / row.length;
        v.set(x, (row[0]!.userData.shelf as number) - 0.05, 0.25).applyMatrix4(group.matrixWorld).project(camera);
        return { id: d.id, x: ((v.x + 1) / 2) * r.width, y: ((1 - v.y) / 2) * r.height, label: SHORT[d.module] ?? d.module, out: row.some((b) => b.userData.id === pulledId.value) };
      });
    }
    // The cradle: one end out, then the other; the middle three stay still.
    const swing = reduced() ? 0 : Math.sin(t * 3.2) * 0.5;
    bobs[0]!.rotation.z = Math.min(0, swing);
    bobs[4]!.rotation.z = Math.max(0, swing);
    vanes.rotation.y = t * 1.6;
    const fl = 1 + 0.12 * Math.sin(t * 13) + 0.06 * Math.sin(t * 31);
    flame.scale.set(1, 1.8 * fl, 1);
    candlelight.intensity = 1.1 * fl;
    motes.position.y = Math.sin(t * 0.1) * 0.05;
    motes.rotation.y = t * 0.02;
    if (hover) {
      const r = canvas.getBoundingClientRect();
      v.copy(hover.position).add(new THREE.Vector3(0, (hover.geometry as THREE.BoxGeometry).parameters.height / 2 + 0.04, 0)).applyMatrix4(group.matrixWorld).project(camera);
      const c = state.courses.find((x) => x.id === hover!.userData.id);
      spineTip.value = c ? { x: ((v.x + 1) / 2) * r.width, y: ((1 - v.y) / 2) * r.height, w: r.width, c } : null;
    } else if (spineTip.value) spineTip.value = null;
  };
};

// ---- the week ------------------------------------------------------------
const days = ['mon', 'tue', 'wed', 'thu', 'fri'];
const hm = (s: string) => { const [a, b] = s.split(':').map(Number); return a! + b! / 60; };
// The week shown: this one (or the term's first), and any other the arrows
// step to.
const shift = ref(0);
const theWeek = computed(() => {
  const home = weekOf(state.courses);
  return shift.value ? weekOf(state.courses, new Date(home.monday.getTime() + (shift.value * 7 + 2) * 864e5)) : home;
});
// A lecture's map, open over everything; an exercise class picks its module.
const mapOf = ref<{ course: Course; begin: string } | null>(null);
// The whole month, opened from the week.
const monthOpen = ref(false);
// The folios, opened on a course (its u:find number) or on the first with any.
const foliosOf = ref<string | null>(null);
// The decks, at his table.
const arcana = ref(false);
function fromMonth(s: { course: Course; begin: string }) {
  monthOpen.value = false;
  mapOf.value = { course: s.course, begin: s.begin };
}
function openBlock(b: { course: Course; begin: string; mappable: boolean; module: string }) {
  if (b.mappable) mapOf.value = { course: b.course, begin: b.begin };
  else choose(moduleFor(b.module));
}
// The day drawn only as long as the week's dates need, so a lecture card is
// tall enough to read.
// The hours drawn: the whole teaching day, eight to seven, and wider when a
// date runs outside it; the frame scrolls when they do not all fit.
const span = computed(() => {
  const sl = theWeek.value.slots;
  const h0 = Math.min(8, ...sl.map((e) => Math.floor(hm(e.from))));
  return { h0, h1: Math.max(19, ...sl.map((e) => Math.ceil(hm(e.to)))) };
});
const hourMarks = computed(() => Array.from({ length: span.value.h1 - span.value.h0 + 1 }, (_, i) => span.value.h0 + i));
const at = (h: number) => ((h - span.value.h0) / (span.value.h1 - span.value.h0)) * 100;
const blocks = computed(() => theWeek.value.slots.map((e) => {
  const hours = hm(e.to) - hm(e.from);
  return { ...e, top: at(hm(e.from)), height: at(hm(e.to)) - at(hm(e.from)), short: hours < 1, module: e.label.split(' ')[0]! };
}));
const dates = computed(() => days.map((d, i) => { const x = new Date(theWeek.value.monday); x.setDate(x.getDate() + i); return { day: d, date: x.getDate(), label: `${d} ${x.getDate()}`, today: x.toDateString() === new Date().toDateString() }; }));
const weekTitle = computed(() => `the week of ${theWeek.value.monday.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }).toLowerCase()} // as u:find has it`);
// The hour now, as a line across today, while it is inside the week drawn.
const nowLine = ref(-1);
let clock = 0;
function tickNow() {
  const n = new Date(), h = n.getHours() + n.getMinutes() / 60;
  nowLine.value = h >= span.value.h0 && h <= span.value.h1 ? at(h) : -1;
}
onMounted(() => { tickNow(); clock = window.setInterval(tickNow, 60_000); });
onBeforeUnmount(() => clearInterval(clock));
const moduleFor = (label: string) => ({ EP1: 'STEOP1', 'Rechenm.': 'STEOP2', Forschung: 'STEOP3' } as Record<string, string>)[label] ?? label;

// ---- the armillary ---------------------------------------------------------
// The rector's armillary sphere: meridian, equator, the tilted ecliptic and
// the colures, turning on a stand. Six beads ride the ecliptic, one per
// semester, as bright as that semester is done; the current one pulses.
const armillary = ({ scene, group, camera }: { scene: THREE.Scene; group: THREE.Group; camera: THREE.PerspectiveCamera }) => {
  camera.position.set(0, 0.1, 5.2); camera.lookAt(0, -0.3, 0);
  group.scale.setScalar(0.78);
  const brass = new THREE.MeshStandardMaterial({ color: 0xf0e8d8, roughness: 0.3, metalness: 0.45, emissive: 0x3a362e });
  const dark = new THREE.MeshStandardMaterial({ color: 0x5a554c, roughness: 0.6, metalness: 0.4 });
  const ring = (r: number, tube: number, mat = brass) => new THREE.Mesh(new THREE.TorusGeometry(r, tube, 10, 96), mat);
  const sphere = new THREE.Group(); group.add(sphere);
  const meridian = ring(1.2, 0.035); sphere.add(meridian);
  const horizon = ring(1.26, 0.03, dark); horizon.rotation.x = Math.PI / 2; group.add(horizon);
  const inner = new THREE.Group(); sphere.add(inner);
  const equator = ring(1.05, 0.025); equator.rotation.x = Math.PI / 2; inner.add(equator);
  const colure1 = ring(1.05, 0.018); inner.add(colure1);
  const colure2 = ring(1.05, 0.018); colure2.rotation.y = Math.PI / 2; inner.add(colure2);
  const ecliptic = new THREE.Group(); ecliptic.rotation.x = Math.PI / 2 - 0.41; inner.add(ecliptic);
  ecliptic.add(ring(1.05, 0.05));
  // The beads: one per semester, round the ecliptic.
  const beads = Array.from({ length: 6 }, (_, i) => {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 12), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, emissive: 0x000000 }));
    const a = (i / 6) * Math.PI * 2;
    b.position.set(Math.cos(a) * 1.05, Math.sin(a) * 1.05, 0);
    ecliptic.add(b);
    return b;
  });
  // The earth at the centre, and the axle through the poles.
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.2, 24, 18), dark); sphere.add(core);
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 2.9, 8), brass); sphere.add(axle);
  sphere.rotation.z = -0.4;
  // The stand.
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.6, 12), dark); post.position.y = -1.55; group.add(post);
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.62, 0.12, 32), dark); foot.position.y = -1.86; group.add(foot);
  lights(scene, 1.8, 1.4, 0.3);
  return (t: number) => {
    inner.rotation.y = t * 0.18;
    const done = [1, 2, 3, 4, 5, 6].map((sem) => {
      const ms = MODULES.value.filter((m) => m.sem === sem);
      const total = ms.reduce((a, m) => a + m.ects, 0) || 1;
      return ms.filter((m) => m.status === 'passed').reduce((a, m) => a + m.ects, 0) / total;
    });
    const current = Math.max(1, ...MODULES.value.filter((m) => m.status === 'running').map((m) => m.sem));
    beads.forEach((b, i) => {
      const pulse = i + 1 === current ? 0.5 + 0.5 * Math.sin(t * 2.4) : 0;
      const v = Math.min(1, done[i]! * 0.8 + pulse * 0.7);
      (b.material as THREE.MeshStandardMaterial).emissive.setScalar(v);
      b.scale.setScalar(1 + pulse * 0.35);
    });
  };
};
</script>

<template>
  <div class="academy">
    <Frame class="instrument" :title="narrow ? 'the degree as an astrolabe' : 'the degree as an astrolabe // hover a ring, drag to turn the rete'" flush>
      <div class="stage" @pointerdown="grab" @pointermove="turnRete" @pointerup="letGo" @pointercancel="letGo">
        <div class="dial">
          <Plate :draw="drawAstrolabe" :active="active" animated :cell="narrow ? 1 : 2" label="The physics degree drawn as an astrolabe: semesters as rings, modules as arcs." />
          <svg class="arcs" viewBox="-112 -112 224 224" preserveAspectRatio="xMidYMid meet">
            <g v-for="l in labels" :key="l.code" class="arc" :class="[l.status, { hot: hovered === l.code, sel: chosen === l.code }]">
              <path class="hit" :d="l.d" tabindex="0" role="button" :aria-label="`${l.name}, ${l.ects} ECTS, ${STATUS[l.status]}`"
                    @pointerenter="overArc(l.code)" @pointerleave="offArc" @focus="overArc(l.code)" @blur="offArc" @click="choose(l.code)" @keydown.enter="choose(l.code)" />
              <text :transform="`translate(${l.x.toFixed(2)} ${l.y.toFixed(2)}) rotate(${l.rot.toFixed(1)})`" text-anchor="middle" dominant-baseline="middle">{{ l.code }} {{ l.ects }}</text>
            </g>
            <text v-for="n in 6" :key="n" class="sem" :x="-3.5" :y="-(34 + n * 12) + 1.8" text-anchor="end">{{ ['i', 'ii', 'iii', 'iv', 'v', 'vi'][n - 1] }}</text>
          </svg>
        </div>
        <Transition name="card" mode="out-in">
          <div v-if="card" :key="card.m.code" class="mcard">
            <span class="pix">{{ card.m.code }} // semester {{ card.m.sem }} // {{ STATUS[card.m.status] }}</span>
            <b class="fell">{{ card.m.name }}</b>
            <span class="note">{{ card.m.group }} // {{ card.earned }} of {{ card.m.ects }} ects</span>
            <span v-for="c in card.cs" :key="c.id" class="line"><span class="pix">{{ c.type }}</span><span class="note">{{ c.nr }}</span><span class="tek">{{ c.grade ?? '-' }}</span></span>
            <span v-if="!card.cs.length" class="note fell">No course kept for it yet.</span>
          </div>
          <div v-else class="legend pix"><span class="how">rings i to vi // the semesters, inside out</span><span class="how">an arc a module // as long as its ects</span><span class="how">the pointer // how far the term has run</span><span><i class="passed"></i>passed</span><span><i class="running"></i>this term</span><span><i class="open"></i>open to you</span><span><i class="locked"></i>not yet</span></div>
        </Transition>
      </div>
    </Frame>

    <div class="side">
      <div class="head">
        <span class="pix">universitas vindobonensis // est. mccclxv // facultas physicae</span>
        <h1 class="title">The Academy</h1>
        <p class="motto fell">Sapere aude.</p>
      </div>
      <p class="note">Physics at the University of Vienna, curriculum 2026: every course a volume, every grade a seal.</p>
      <div class="big"><span class="tek"><Num :value="tally.passed" /></span><span class="pix">of 180 ects<br>{{ tally.running }} this term</span><span class="bar"><i :style="{ width: `${(tally.passed / 180) * 100}%` }"></i><i class="run" :style="{ width: `${(tally.running / 180) * 100}%` }"></i></span></div>
      <div class="kv">
        <span>term</span><span>{{ TERM.name }} // {{ term.label }}</span>
        <span>the first gate (steop)</span><span>{{ tally.steop }} of 18</span>
        <span>grade, weighted</span><span>{{ tally.avg ? tally.avg.toFixed(2) : 'none yet' }}</span>
        <span>next exam</span><span>{{ exams[0] ? `${examDay(exams[0].begin)} // in ${daysTo(exams[0].begin)} days` : 'none posted yet' }}</span>
      </div>
      <div class="desk">
        <form class="add" :class="{ asking: adding }" @submit.prevent="nr && add([nr])">
          <label class="pix" for="course-nr">add a course by its u:find number</label>
          <span><input id="course-nr" v-model="nr" inputmode="numeric" pattern="[0-9]{6}" placeholder="261600" :disabled="adding" /><button class="btn" :class="{ busy: adding }" :disabled="adding || nr.length !== 6">{{ adding ? 'asking u:find' : 'add' }}</button></span>
          <span v-if="state.error" class="note err">{{ state.error }}</span>
          <span v-if="state.courses.length" class="asked note">u:find last asked {{ lastAsked }} <button type="button" class="btn" :class="{ busy: refreshing }" :disabled="refreshing" @click="refresh">{{ refreshing ? 'asking' : 'ask again' }}</button></span>
        </form>
        <div v-if="exams.length" class="exams">
          <div class="pix">exams ahead</div>
          <button v-for="e in exams.slice(0, 3)" :key="e.title + e.begin.getTime()" class="exam" @pointerenter="overArc(e.module)" @pointerleave="offArc" @click="choose(e.module)">
            <span class="tek">{{ examDay(e.begin) }}</span><span class="note">{{ e.title }} // {{ e.room }}</span><span class="pix">{{ daysTo(e.begin) }}d</span>
          </button>
        </div>
      </div>

      <Frame class="week" :title="weekTitle" flush>
        <template #bar><span class="wk"><button class="x" aria-label="the week before" @click="shift--">prev</button><button v-if="shift" class="x" @click="shift = 0">now</button><button class="x" aria-label="the week after" @click="shift++">next</button><button class="x" title="the whole month" @click="monthOpen = true">month</button><button class="x" title="the course material" @click="foliosOf = ''">folios</button><button class="x" title="the flashcards, at his table" @click="arcana = true">decks</button><button v-if="state.mail?.configured || state.demo" class="x" title="your university mail" @click="state.postOpen = true">post<template v-if="state.mail?.unread"> {{ state.mail.unread }}</template></button></span></template>
        <div class="tt">
          <div class="tt-head">
            <span></span>
            <span v-for="d in dates" :key="d.label" class="tt-day" :class="{ today: d.today }"><span class="pix">{{ d.day }}</span><b class="tek">{{ d.date }}</b></span>
          </div>
          <div class="tt-body" :style="{ '--hours': span.h1 - span.h0 }">
            <div class="tt-rules" aria-hidden="true">
              <span v-for="h in hourMarks" :key="h" class="rule" :class="{ even: h % 2 === 0 }" :style="{ top: `${at(h)}%` }"><em class="pix">{{ String(h).padStart(2, '0') }}</em></span>
            </div>
            <div class="tt-cols">
              <div v-for="(d, i) in dates" :key="d.label" class="tt-col" :class="{ today: d.today }">
                <button v-for="b in blocks.filter((x) => x.day === i)" :key="b.label + b.from" class="blk" :class="{ ue: b.ue, short: b.short, hot: moduleFor(b.module) === (hovered || chosen) }"
                        :style="{ top: `${b.top}%`, height: `${b.height}%` }" :title="`${b.label}, ${b.from} to ${b.to}${b.mappable ? ' // open its map' : ''}\n${whereWho(b)}`"
                        @pointerenter="overArc(moduleFor(b.module))" @pointerleave="offArc" @click="openBlock(b)">
                  <b>{{ b.label }}</b><span class="when">{{ b.from }}-{{ b.to }}</span>
                </button>
                <i v-if="d.today && nowLine >= 0" class="now" :style="{ top: `${nowLine}%` }"></i>
              </div>
            </div>
            <p v-if="!blocks.length" class="nothing note fell">No dates this week. Add a course, or pick its group.</p>
          </div>
        </div>
      </Frame>
    </div>


    <Frame class="stacks" title="the forbidden stacks // a grimoire a course" flush>
      <Gl :key="volumeKey" :build="faculty" :active="active" :options="{ px: 1, drift: 0, tilt: 0, yaw: 0, distance: 3.35 }" label="The courses kept, as grimoires on a shelf, with a Newton's cradle, a radiometer and a candle. Click one to take it down and grade it." hint="hover to read // click to take down" />
      <button v-if="!state.courses.length" class="btn bare" :class="{ busy: adding }" :disabled="adding" @click="firstTerm">{{ adding ? 'asking u:find' : `add the first term // ${FIRST_TERM.courses.length} courses` }}</button>
      <div class="tags" aria-hidden="true"><span v-for="g in tags" :key="g.id" :class="{ out: g.out }" :style="{ left: `${g.x}px`, top: `${g.y}px` }">{{ g.label }}</span></div>
    <div v-if="spineTip && spineTip.c.id !== pulledId" class="vtip" :style="{ left: `${Math.min(Math.max(spineTip.x, 150), spineTip.w - 150)}px`, top: `${spineTip.y}px` }">
        <b class="fell">{{ spineTip.c.name }}</b><span class="pix">{{ spineTip.c.type }} // {{ spineTip.c.ects }} ects // {{ spineTip.c.grade ? GRADES[spineTip.c.grade - 1] : 'no grade yet' }}</span>
      </div>
      <Transition name="card">
        <div v-if="pulled" :key="pulled.id" class="volume">
          <span class="pix">{{ pulled.nr }} // {{ pulled.type }} // {{ pulled.ects }} ects // {{ pulled.semester.toLowerCase() }}</span>
          <b class="fell">{{ pulled.name }}</b>
          <div class="seals" role="group" aria-label="grade">
            <button v-for="g in 5" :key="g" class="grade" :class="{ set: pulled.grade === g, press: sealed?.id === pulled.id && pulled.grade === g, fail: g === 5 }" :title="GRADES[g - 1]" @click="seal(pulled!, g)">{{ g }}</button>
            <em v-if="sealed?.id === pulled.id" class="word pix">{{ sealed.word }}</em>
          </div>
          <span class="rows">
            <label class="pix" :for="`module-of-${pulled.id}`">counts toward</label>
            <select :id="`module-of-${pulled.id}`" class="pick" :value="pulled.module" @change="actions.moduleCourse(pulled!, ($event.target as HTMLSelectElement).value)">
              <option v-for="cm in CURRICULUM" :key="cm.code" :value="cm.code">{{ cm.code }} // {{ cm.name }}</option>
            </select>
            <template v-if="pulled.groups.length > 1">
              <label class="pix" :for="`group-${pulled.id}`">group</label>
              <select :id="`group-${pulled.id}`" class="pick" :class="{ unset: !pulled.groupId }" :value="pulled.groupId ?? ''" @change="actions.groupCourse(pulled!, ($event.target as HTMLSelectElement).value || null)">
                <option value="">not yet told</option>
                <option v-for="(g, i) in pulled.groups" :key="g.id" :value="g.id">group {{ i + 1 }} // {{ groupLabel(g) }}</option>
              </select>
            </template>
          </span>
          <span class="acts"><button class="btn" @click="foliosOf = pulled.nr">its folios</button><button class="btn" @click="pulledId = null">shelve it</button><button class="btn quiet" @click="actions.removeCourse(pulled!); pulledId = null">strike it</button></span>
        </div>
      </Transition>
    </Frame>

    <Frame class="sphere" title="the rector's armillary" flush>
      <Gl :build="armillary" :active="active" :options="{ px: narrow ? 1 : 2, drift: 0.003, tilt: 0.18, distance: 5.2 }" label="An armillary sphere; its six beads are the semesters, lit as they are done." hint="a bead a semester" />
    </Frame>
    <Arcana v-if="arcana" @close="arcana = false" />
    <Codex v-if="foliosOf !== null" :nr="foliosOf || undefined" @close="foliosOf = null" />
    <Calendar v-if="monthOpen" :start="theWeek.monday" @close="monthOpen = false" @open="fromMonth" />
    <LectureMap v-if="mapOf" :key="mapOf.begin" :course="mapOf.course" :begin="mapOf.begin" @close="mapOf = null" />
  </div>
</template>

<style scoped>
.academy { display: grid; gap: 18px; grid-template-columns: minmax(0, 1.12fr) minmax(0, .4fr) minmax(320px, 1fr); grid-template-rows: minmax(0, 1fr) minmax(250px, .52fr);
  grid-template-areas: "instrument instrument side" "stacks sphere side"; }
.instrument { grid-area: instrument; min-height: 0; }
.instrument :deep(.flush) { overflow: hidden; }
.stage { position: relative; flex: 1; min-height: 0; display: flex; flex-direction: column; cursor: grab; touch-action: none; }
.stage:active { cursor: grabbing; }
.dial { position: relative; flex: 1; min-height: 0; display: flex; flex-direction: column; }
.arcs { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.hit { fill: none; stroke: transparent; stroke-width: 10; pointer-events: stroke; cursor: pointer; outline: none; }
.arc text { font: 400 5.2px var(--pix); fill: var(--phos); text-transform: uppercase; letter-spacing: .04em; pointer-events: none; transition: fill .25s var(--out); }
.arc.locked text { fill: var(--dim); }
.arc.running text, .arc.passed text { fill: var(--hi); }
.arc.open text { fill: var(--phos); }
.arc.hot text, .arc.sel text { fill: #fff; }
.arcs .sem { font: 400 5px var(--pix); fill: var(--hi); }
.legend { position: absolute; left: 14px; bottom: 12px; display: grid; gap: 4px; pointer-events: none; }
.legend span { display: flex; gap: 8px; align-items: center; }
.legend .how { color: var(--dim); }
.legend .how:nth-child(3) { margin-bottom: 6px; }
.legend i { width: 14px; height: 6px; }
.legend .passed { background: var(--phos); }
.legend .running { background: radial-gradient(circle, var(--phos) 1px, transparent 1.3px) 0 0 / 3px 3px; }
.legend .open { border: 1px solid var(--dim); }
.legend .locked { border-top: 2px dotted var(--low); height: 0; }
.mcard { position: absolute; left: 14px; bottom: 12px; display: grid; gap: 3px; width: min(270px, 40%); padding: 10px 12px; background: rgba(12, 11, 10, .92); border: 3px double var(--low); pointer-events: none; }
.mcard b { font-size: 20px; font-weight: 400; color: var(--hi); line-height: 1.1; }
.mcard .note { font-size: 12px; }
.mcard .line { display: grid; grid-template-columns: 30px 1fr auto; gap: 8px; align-items: baseline; }
.mcard .tek { font-size: 15px; }
.card-enter-active { transition: opacity .25s var(--out), transform .35s var(--out); }
.card-leave-active { transition: opacity .12s linear; }
.card-enter-from { opacity: 0; transform: translateY(8px); }
.card-leave-to { opacity: 0; }
.side { grid-area: side; display: grid; grid-template-rows: auto auto auto auto auto minmax(230px, 1fr); gap: 10px; min-height: 0; }
.head { display: grid; gap: 4px; }
.head .pix { color: var(--dim); }
.motto { margin: 2px 0 0; font-style: italic; color: var(--dim); font-size: 16px; }
.big { display: grid; grid-template-columns: auto 1fr; grid-template-rows: auto auto; gap: 6px 14px; align-items: end; padding-top: 12px; border-top: 3px dotted var(--low); }
.big .tek { font-size: 58px; }
.big .pix { padding-bottom: 6px; line-height: 1.6; }
.big .bar { grid-column: 1 / -1; display: flex; height: 6px; background: radial-gradient(circle, var(--low) 1px, transparent 1.4px) 0 50% / 5px 5px repeat-x; }
.big .bar i { display: block; height: 6px; background: var(--phos); transition: width 1s var(--out); }
.big .bar i.run { background: radial-gradient(circle, var(--phos) 1.3px, transparent 1.7px) 0 50% / 4px 4px repeat-x; }
.kv { display: grid; grid-template-columns: auto 1fr; gap: 3px 14px; font-size: 13px; }
.kv span:nth-child(odd) { color: var(--dim); }
.kv span:nth-child(even) { text-align: right; }
.desk { display: grid; gap: 8px; padding-top: 12px; border-top: 3px dotted var(--low); }
.add { display: grid; gap: 4px; position: relative; }
.add > span { display: flex; gap: 8px; align-items: center; }
.add input { flex: 1; min-width: 0; background: var(--deep); border: 2px solid var(--low); padding: 4px 8px; font: 800 15px var(--tek); color: var(--hi); letter-spacing: .06em; transition: border-color .2s var(--out); }
.add input:hover { border-color: var(--dim); }
.add input:focus { border-color: var(--phos); outline: none; }
.add input::placeholder { color: var(--low); }
.add.asking input { background: linear-gradient(90deg, transparent, rgba(197, 188, 171, .14), transparent) var(--deep); background-size: 40% 100%; background-repeat: no-repeat; animation: scan 1s linear infinite; }
@keyframes scan { from { background-position: -40% 0; } to { background-position: 140% 0; } }
.btn { font: 400 10.5px var(--pix); text-transform: uppercase; color: var(--hi); border: 3px double var(--low); padding: 4px 10px; transition: border-color .2s var(--out), background .2s var(--out), color .2s var(--out); white-space: nowrap; }
.btn:hover:not(:disabled) { border-color: var(--phos); background: var(--phos); color: var(--ground); }
.btn:active:not(:disabled) { transform: translateY(1px); }
.btn:disabled { color: var(--dim); }
.btn.busy { animation: blink 1s steps(1) infinite; }
@keyframes blink { 50% { opacity: .4; } }
.err { color: var(--phos); }
.asked { font-size: 11px; }
.empty { display: grid; gap: 8px; justify-items: start; }
.exams { display: grid; gap: 2px; border-bottom: 3px dotted var(--faint); padding-bottom: 8px; }
.exam { display: grid; grid-template-columns: 92px 1fr auto; gap: 10px; align-items: baseline; text-align: left; padding: 2px 4px; margin: 0 -4px; transition: background .2s var(--out); }
.exam:hover { background: var(--faint); }
.exam .tek { font-size: 13px; }
.exam .note { font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.stacks { grid-area: stacks; min-height: 0; }
.stacks :deep(.flush) { overflow: hidden; }
.stacks :deep(.gl) { flex: 1; min-height: 0; width: 100%; }
.bare { position: absolute; left: 12px; bottom: 10px; }
.tags span { position: absolute; transform: translate(-50%, 2px); font: 400 8.5px var(--pix); color: var(--phos); text-transform: uppercase; white-space: nowrap; pointer-events: none; text-shadow: 0 0 3px #0c0b0a, 0 0 3px #0c0b0a; }
.tags span.out { color: var(--hi); }
.vtip { position: absolute; transform: translate(-50%, calc(-100% - 8px)); display: grid; gap: 2px; padding: 6px 10px; width: max-content; max-width: 280px; background: rgba(12, 11, 10, .94); border: 3px double var(--dim); pointer-events: none; z-index: 2; }
.vtip b { white-space: normal; line-height: 1.15; }
.vtip b { font-weight: 400; font-size: 16px; color: var(--hi); }
.volume { position: absolute; right: 12px; width: min(360px, 58%); top: 40px; display: grid; gap: 8px; padding: 12px 14px; background: rgba(12, 11, 10, .94); border: 3px double var(--dim); }
.volume b { font-size: 21px; font-weight: 400; color: var(--hi); line-height: 1.1; }
.seals { display: flex; gap: 6px; align-items: center; position: relative; }
.seals .word { position: static; transform: none; margin-left: 6px; }
.rows { display: grid; grid-template-columns: auto 1fr; gap: 6px 10px; align-items: center; }
.rows .pick { width: 100%; }
.acts { display: flex; gap: 8px; }
.btn.quiet { color: var(--dim); }
.pick { background: var(--deep); color: var(--phos); border: 1px solid var(--low); font: 400 10px var(--pix); text-transform: uppercase; transition: border-color .2s var(--out); }
.pick:hover { border-color: var(--dim); }
.pick.unset { color: var(--hi); border-style: dashed; border-color: var(--dim); }
.grade { position: relative; font: 800 14px var(--tek); color: var(--dim); min-width: 30px; text-align: center; border: 3px double var(--low); padding: 1px 6px; transition: color .2s var(--out), border-color .2s var(--out), transform .15s var(--out); }
.grade:hover { color: var(--hi); border-color: var(--dim); }
.grade:active { transform: scale(.92); }
.grade.set { color: var(--hi); border-color: var(--dim); }
.grade.fail { text-decoration: line-through; }
.grade.press { animation: press .45s var(--out); }
@keyframes press { 0% { transform: scale(1.5) rotate(-10deg); background: var(--phos); color: var(--ground); } 100% { transform: scale(1); } }
.word { white-space: nowrap; font-style: normal; color: var(--hi); animation: word 1.1s var(--out) both; }
@keyframes word { from { opacity: 0; transform: translateX(6px); } 25% { opacity: 1; transform: none; } 80% { opacity: 1; } to { opacity: 0; } }
.week { min-height: 0; }
.week :deep(.flush) { display: flex; flex-direction: column; }
.tt { flex: 1; min-height: 0; display: grid; grid-template-rows: auto minmax(0, 1fr); padding: 6px 12px 10px 8px; overflow-y: auto; scrollbar-width: thin; scrollbar-color: var(--low) transparent; }
.tt-head, .tt-cols { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 0 6px; }
.tt-head { grid-template-columns: 30px repeat(5, minmax(0, 1fr)); padding-bottom: 6px; border-bottom: 3px dotted var(--low); position: sticky; top: -6px; z-index: 2; background: var(--ground); }
.tt-day { display: flex; align-items: baseline; justify-content: center; gap: 6px; padding: 2px 0; }
.tt-day .tek { font-size: 15px; color: var(--phos); }
.tt-day.today { background: var(--faint); }
.tt-day.today .pix, .tt-day.today .tek { color: var(--hi); }
.tt-body { position: relative; min-height: calc(var(--hours) * 34px); margin-top: 8px; margin-bottom: 6px; }
.tt-rules { position: absolute; inset: 0; pointer-events: none; }
.rule { position: absolute; left: 30px; right: 0; border-top: 1px dotted var(--faint); }
.rule.even { border-top-color: var(--low); }
.rule em { position: absolute; left: -30px; top: 0; transform: translateY(-50%); width: 24px; text-align: right; font: 400 9px var(--pix); font-style: normal; color: var(--dim); }
.tt-cols { position: absolute; inset: 0 0 0 30px; }
.tt-col { position: relative; min-width: 0; }
.tt-col.today { background: rgba(197, 188, 171, .03); }
.blk { position: absolute; left: 2px; right: 2px; min-height: 18px; box-sizing: border-box; border: 2px solid var(--phos); background: var(--deep); padding: 4px 6px; overflow: hidden;
  display: flex; flex-direction: column; gap: 1px; text-align: left; transition: transform .2s var(--out), background .2s var(--out), border-color .2s var(--out); }
.blk.ue { border-style: dotted; border-color: var(--dim); }
.wk { display: flex; gap: 6px; margin-left: auto; }
.blk b { font: 400 10px/1.2 var(--pix); color: var(--hi); text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.blk span { font-size: 10.5px; color: var(--dim); line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.blk .when { color: var(--phos); font-variant-numeric: tabular-nums; }
.blk.short { flex-direction: row; align-items: center; gap: 6px; padding: 1px 6px; }
.blk:hover, .blk.hot { transform: translateY(-1px); background: #1a1816; border-color: var(--hi); z-index: 1; }
.blk:hover span, .blk.hot span { color: var(--hi); }
.now { position: absolute; left: 0; right: 0; height: 0; border-top: 2px solid var(--hi); pointer-events: none; z-index: 2; }
.now::before { content: ''; position: absolute; left: -4px; top: -5px; width: 8px; height: 8px; border-radius: 50%; background: var(--hi); animation: blink 2s steps(1) infinite; }
.nothing { position: absolute; inset: 0; display: grid; place-items: center; margin: 0; font-style: italic; font-size: 16px; pointer-events: none; }
.sphere { grid-area: sphere; min-height: 0; }
.sphere :deep(.flush) { overflow: hidden; }
.sphere :deep(.gl) { flex: 1; min-height: 0; width: 100%; }
@media (max-aspect-ratio: 5/4) { .academy { grid-template-columns: minmax(0, 1fr) minmax(0, .6fr); grid-template-rows: minmax(0, 1.2fr) auto minmax(260px, .6fr); grid-template-areas: "instrument instrument" "side side" "stacks sphere"; } }
@media (max-width: 860px) {
  .academy { display: flex; flex-direction: column; }
  .instrument { min-height: 0; }
  /* The plate whole and square, the key and the card beneath it, and only
     this term's arcs named. */
  .dial { flex: none; aspect-ratio: 1; }
  .legend, .mcard { position: static; width: auto; margin: 0 12px 12px; }
  .legend { grid-template-columns: auto auto; gap: 6px 18px; }
  .legend .how { display: none; }
  .arc text { display: none; font-size: 6px; }
  .arc.running text, .arc.hot text, .arc.sel text { display: inline; }
  .week { min-height: 340px; overflow-x: auto; }
  .grid { min-width: 560px; }
  .sphere { min-height: 280px; }
}
@media (prefers-reduced-motion: reduce) { .grade.press, .word, .card-enter-active, .add.asking input, .now::before { animation: none; transition: none; } }
</style>
