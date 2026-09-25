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
import Gl from '../components/Gl.vue';
import Num from '../components/Num.vue';
import Plate from '../components/Plate.vue';
import { lights } from '../gl/models';
import { rand, starfield } from '../gl/plate';
import { CURRICULUM, FIRST_TERM, GRADES, modules, tally as tallyOf, termOf, week as weekOf, type Module } from '../academy';
import { actions, state, type Course } from '../store';

defineProps<{ active: boolean }>();

const MODULES = computed(() => modules(state.courses));
const tally = computed(() => tallyOf(state.courses));
const TERM = termOf();
const coursesOf = (code: string) => state.courses.filter((c) => c.module === code);

// ---- grades, sealed ------------------------------------------------------
// A click presses the next grade in like a seal: none, 1 to 5, none again.
const sealed = ref<{ id: number; word: string } | null>(null);
async function cycle(c: Course) {
  const next = c.grade === null ? 1 : c.grade === 5 ? null : c.grade + 1;
  sealed.value = { id: c.id, word: next ? GRADES[next - 1]! : 'unsealed' };
  setTimeout(() => { if (sealed.value?.id === c.id) sealed.value = null; }, 1100);
  await actions.gradeCourse(c, next);
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
onMounted(() => {
  const term = state.courses.filter((c) => c.semester === TERM.name);
  if (!state.demo && term.some((c) => Date.now() - Date.parse(c.refreshedAt) > 864e5)) refresh();
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
  if (chosen.value) document.getElementById(`module-${code}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
    starfield(g, w, h, Math.round((w * h) / 110), 71, live.mx * -6, live.my * -4);
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

// ---- the ledger ----------------------------------------------------------
const termModules = computed(() => MODULES.value.filter((m) => state.courses.some((c) => c.module === m.code && c.semester === TERM.name)
  || m.status === 'running'));

// ---- the week ------------------------------------------------------------
const days = ['mon', 'tue', 'wed', 'thu', 'fri'];
const hm = (s: string) => { const [a, b] = s.split(':').map(Number); return a! + b! / 60; };
const theWeek = computed(() => weekOf(state.courses));
// The day drawn only as long as the week's dates need, so a lecture card is
// tall enough to read.
const span = computed(() => {
  const sl = theWeek.value.slots;
  if (!sl.length) return { h0: 9, h1: 15 };
  return { h0: Math.floor(Math.min(...sl.map((e) => hm(e.from)))), h1: Math.ceil(Math.max(...sl.map((e) => hm(e.to)))) };
});
const hourMarks = computed(() => Array.from({ length: span.value.h1 - span.value.h0 + 1 }, (_, i) => span.value.h0 + i));
const at = (h: number) => ((h - span.value.h0) / (span.value.h1 - span.value.h0)) * 100;
const blocks = computed(() => theWeek.value.slots.map((e) => {
  const hours = hm(e.to) - hm(e.from);
  return { ...e, top: at(hm(e.from)), height: at(hm(e.to)) - at(hm(e.from)), short: hours < 1, module: e.label.split(' ')[0]! };
}));
const dates = computed(() => days.map((d, i) => { const x = new Date(theWeek.value.monday); x.setDate(x.getDate() + i); return { label: `${d} ${x.getDate()}`, today: x.toDateString() === new Date().toDateString() }; }));
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
  camera.position.set(0, 0.1, 4.2); camera.lookAt(0, -0.25, 0);
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
    <Frame class="instrument" title="the degree as an astrolabe // hover a ring, drag to turn the rete" flush>
      <div class="stage" @pointerdown="grab" @pointermove="turnRete" @pointerup="letGo" @pointercancel="letGo">
        <Plate :draw="drawAstrolabe" :active="active" animated :cell="2" label="The physics degree drawn as an astrolabe: semesters as rings, modules as arcs." />
        <svg class="arcs" viewBox="-112 -112 224 224" preserveAspectRatio="xMidYMid meet">
          <g v-for="l in labels" :key="l.code" class="arc" :class="[l.status, { hot: hovered === l.code, sel: chosen === l.code }]">
            <path class="hit" :d="l.d" tabindex="0" role="button" :aria-label="`${l.name}, ${l.ects} ECTS, ${STATUS[l.status]}`"
                  @pointerenter="overArc(l.code)" @pointerleave="offArc" @focus="overArc(l.code)" @blur="offArc" @click="choose(l.code)" @keydown.enter="choose(l.code)" />
            <text :transform="`translate(${l.x.toFixed(2)} ${l.y.toFixed(2)}) rotate(${l.rot.toFixed(1)})`" text-anchor="middle" dominant-baseline="middle">{{ l.code }} {{ l.ects }}</text>
          </g>
          <text v-for="n in 6" :key="n" class="sem" :x="-3" :y="-(34 + n * 12) + 1.2" text-anchor="end">{{ ['i', 'ii', 'iii', 'iv', 'v', 'vi'][n - 1] }}</text>
        </svg>
        <Transition name="card" mode="out-in">
          <div v-if="card" :key="card.m.code" class="mcard">
            <span class="pix">{{ card.m.code }} // semester {{ card.m.sem }} // {{ STATUS[card.m.status] }}</span>
            <b class="fell">{{ card.m.name }}</b>
            <span class="note">{{ card.m.group }} // {{ card.earned }} of {{ card.m.ects }} ects</span>
            <span v-for="c in card.cs" :key="c.id" class="line"><span class="pix">{{ c.type }}</span><span class="note">{{ c.nr }}</span><span class="tek">{{ c.grade ?? '-' }}</span></span>
            <span v-if="!card.cs.length" class="note fell">No course kept for it yet.</span>
          </div>
          <div v-else class="legend pix"><span><i class="passed"></i>passed</span><span><i class="running"></i>this term</span><span><i class="open"></i>open to you</span><span><i class="locked"></i>not yet</span></div>
        </Transition>
      </div>
    </Frame>

    <div class="side">
      <div class="crest">
        <svg class="seal" viewBox="-50 -50 100 100" aria-hidden="true">
          <defs><path id="seal-ring" d="M 0 -38 A 38 38 0 1 1 -0.1 -38" /></defs>
          <circle r="47" class="rim" /><circle r="44" class="rim dot" /><circle r="31" class="rim" />
          <text class="ring"><textPath href="#seal-ring">UNIVERSITAS VINDOBONENSIS // MCCCLXV // </textPath></text>
          <path d="M 0 -22 L 19 11 L -19 11 Z" class="tri" />
          <path d="M -11 3 Q 0 -8 11 3 Q 0 13 -11 3 Z" class="eye" /><circle cx="0" cy="3" r="3.2" class="pupil" />
          <path d="M 0 -30 L 1.6 -26 L 6 -26 L 2.4 -23.4 L 3.8 -19 L 0 -21.6 L -3.8 -19 L -2.4 -23.4 L -6 -26 L -1.6 -26 Z" class="star" />
        </svg>
        <div>
          <h1 class="title">The Academy</h1>
          <p class="motto fell">Sapere aude.</p>
        </div>
      </div>
      <p class="note">Physics at the University of Vienna, curriculum 2026. The registrar keeps every course as a volume and every grade as a seal, the way Miskatonic kept its stacks; he says the mathematics is the telescope.</p>
      <div class="big"><span class="tek"><Num :value="tally.passed" /></span><span class="pix">of 180 ects<br>{{ tally.running }} this term</span><span class="bar"><i :style="{ width: `${(tally.passed / 180) * 100}%` }"></i><i class="run" :style="{ width: `${(tally.running / 180) * 100}%` }"></i></span></div>
      <div class="kv">
        <span>term</span><span>{{ TERM.name }} // {{ term.label }}</span>
        <span>the first gate (steop)</span><span>{{ tally.steop }} of 18</span>
        <span>grade, weighted</span><span>{{ tally.avg ? tally.avg.toFixed(2) : 'none yet' }}</span>
        <span>next exam</span><span>{{ exams[0] ? `${examDay(exams[0].begin)} // in ${daysTo(exams[0].begin)} days` : 'none posted yet' }}</span>
      </div>
      <div class="courses">
        <form class="add" :class="{ asking: adding }" @submit.prevent="nr && add([nr])">
          <label class="pix" for="course-nr">add a course by its u:find number</label>
          <span><input id="course-nr" v-model="nr" inputmode="numeric" pattern="[0-9]{6}" placeholder="261600" :disabled="adding" /><button class="btn" :class="{ busy: adding }" :disabled="adding || nr.length !== 6">{{ adding ? 'asking u:find' : 'add' }}</button></span>
          <span v-if="state.error" class="note err">{{ state.error }}</span>
          <span v-if="state.courses.length" class="asked note">u:find last asked {{ lastAsked }} <button type="button" class="btn" :class="{ busy: refreshing }" :disabled="refreshing" @click="refresh">{{ refreshing ? 'asking' : 'ask again' }}</button></span>
        </form>
        <div v-if="exams.length" class="exams">
          <div class="pix">exams ahead</div>
          <button v-for="e in exams.slice(0, 6)" :key="e.title + e.begin.getTime()" class="exam" @pointerenter="overArc(e.module)" @pointerleave="offArc" @click="choose(e.module)">
            <span class="tek">{{ examDay(e.begin) }}</span><span class="note">{{ e.title }} // {{ e.room }}</span><span class="pix">{{ daysTo(e.begin) }}d</span>
          </button>
        </div>
        <div v-if="!state.courses.length" class="empty">
          <p class="note">Nothing kept yet. Your first term, as the curriculum lays it out and u:find lists it for {{ FIRST_TERM.semester }}: eight courses.</p>
          <button class="btn" :class="{ busy: adding }" :disabled="adding" @click="firstTerm">{{ adding ? 'asking u:find' : 'add the first term' }}</button>
        </div>
        <TransitionGroup name="vol" tag="div" class="volumes">
          <div v-for="(m, n) in termModules" :id="`module-${m.code}`" :key="m.code" class="module" :class="{ sel: chosen === m.code, hot: hovered === m.code }" :style="{ '--i': n }">
            <button class="mh" @click="choose(m.code)" @pointerenter="overArc(m.code)" @pointerleave="offArc"><span class="fell">{{ m.name }}</span><span class="pix">{{ m.code }} // {{ m.ects }} ects</span></button>
            <div v-for="c in coursesOf(m.code)" :key="c.id" class="course">
              <span class="pix">{{ c.type }}</span>
              <span class="note">{{ c.nr }} // {{ c.ects }} ects
                <select v-if="c.groups.length > 1" :id="`group-${c.id}`" class="pick" :class="{ unset: !c.groupId }" :value="c.groupId ?? ''" :aria-label="`group for ${c.name} ${c.type}`" @change="actions.groupCourse(c, ($event.target as HTMLSelectElement).value || null)">
                  <option value="">group ?</option>
                  <option v-for="(g, i) in c.groups" :key="g.id" :value="g.id">group {{ i + 1 }} // {{ groupLabel(g) }}</option>
                </select>
                <select :id="`module-of-${c.id}`" class="pick" :value="c.module" :aria-label="`module ${c.name} ${c.type} counts toward`" @change="actions.moduleCourse(c, ($event.target as HTMLSelectElement).value)">
                  <option v-for="cm in CURRICULUM" :key="cm.code" :value="cm.code">{{ cm.code }}</option>
                </select>
              </span>
              <button class="grade" :class="{ set: c.grade, press: sealed?.id === c.id, fail: c.grade === 5 }" :title="c.grade ? GRADES[c.grade - 1] : 'no grade yet'" :aria-label="`grade for ${c.name} ${c.type}: ${c.grade ?? 'none'}`" @click="cycle(c)">
                {{ c.grade ?? '-' }}<em v-if="sealed?.id === c.id" class="word pix">{{ sealed.word }}</em>
              </button>
            </div>
          </div>
        </TransitionGroup>
      </div>
    </div>

    <Frame class="week" :title="weekTitle" flush>
      <div class="grid">
        <div class="hours" aria-hidden="true"><span v-for="h in hourMarks" :key="h" :style="{ top: `${at(h)}%` }">{{ h }}</span></div>
        <div v-for="(d, i) in dates" :key="d.label" class="day" :class="{ today: d.today }">
          <span class="pix">{{ d.label }}</span>
          <div class="col">
            <button v-for="b in blocks.filter((x) => x.day === i)" :key="b.label + b.from" class="blk" :class="{ ue: b.ue, short: b.short, hot: moduleFor(b.module) === (hovered || chosen) }"
                    :style="{ top: `${b.top}%`, height: `${b.height}%` }" :title="`${b.label}, ${b.from} to ${b.to}, ${b.room}`"
                    @pointerenter="overArc(moduleFor(b.module))" @pointerleave="offArc" @click="choose(moduleFor(b.module))">
              <b>{{ b.label }}</b><span>{{ b.short ? b.from : `${b.from} ${b.room}` }}</span>
            </button>
            <i v-if="d.today && nowLine >= 0" class="now" :style="{ top: `${nowLine}%` }"></i>
          </div>
        </div>
        <p v-if="!blocks.length" class="nothing note fell">No dates this week. Add a course, or pick its group.</p>
      </div>
    </Frame>

    <Frame class="sphere" title="the rector's armillary" flush>
      <Gl :build="armillary" :active="active" :options="{ drift: 0.003, tilt: 0.18, distance: 4.2 }" label="An armillary sphere; its six beads are the semesters, lit as they are done." hint="a bead a semester" />
    </Frame>
  </div>
</template>

<style scoped>
.academy { display: grid; gap: 18px; grid-template-columns: minmax(0, 1.12fr) minmax(0, .4fr) minmax(320px, 1fr); grid-template-rows: minmax(0, 1fr) minmax(210px, .44fr);
  grid-template-areas: "instrument instrument side" "week sphere side"; }
.instrument { grid-area: instrument; min-height: 0; }
.instrument :deep(.flush) { overflow: hidden; }
.stage { position: relative; flex: 1; min-height: 0; display: flex; flex-direction: column; cursor: grab; touch-action: none; }
.stage:active { cursor: grabbing; }
.arcs { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.hit { fill: none; stroke: transparent; stroke-width: 10; pointer-events: stroke; cursor: pointer; outline: none; }
.arc text { font: 400 4.4px var(--pix); fill: var(--dim); text-transform: uppercase; letter-spacing: .04em; pointer-events: none; transition: fill .25s var(--out); }
.arc.running text, .arc.passed text { fill: var(--hi); }
.arc.open text { fill: var(--phos); }
.arc.hot text, .arc.sel text { fill: #fff; }
.arcs .sem { font: italic 5px var(--fell); fill: var(--dim); }
.legend { position: absolute; left: 14px; bottom: 12px; display: grid; gap: 4px; pointer-events: none; }
.legend span { display: flex; gap: 8px; align-items: center; }
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
.side { grid-area: side; display: grid; grid-template-rows: auto auto auto auto minmax(0, 1fr); gap: 12px; min-height: 0; }
.crest { display: grid; grid-template-columns: auto 1fr; gap: 16px; align-items: center; }
.crest .title { font-size: clamp(38px, 4.4vw, 74px); white-space: nowrap; }
.seal { width: 88px; height: 88px; transition: transform 1.2s var(--out); }
.crest:hover .seal { transform: rotate(-24deg); }
.seal .rim { fill: none; stroke: var(--phos); stroke-width: 1.2; }
.seal .rim.dot { stroke-dasharray: 1 3; stroke: var(--dim); }
.seal .ring { font: 400 6.4px var(--pix); fill: var(--phos); letter-spacing: .08em; }
.seal .tri { fill: none; stroke: var(--hi); stroke-width: 1.4; }
.seal .eye { fill: var(--hi); }
.seal .pupil { fill: var(--ground); animation: look 7s var(--ease) infinite; }
.seal .star { fill: var(--hi); }
@keyframes look { 0%, 40% { transform: translateX(0); } 50%, 65% { transform: translateX(-3px); } 75%, 90% { transform: translateX(3px); } 100% { transform: translateX(0); } }
.motto { margin: 2px 0 0; font-style: italic; color: var(--dim); font-size: 16px; }
.big { display: grid; grid-template-columns: auto 1fr; grid-template-rows: auto auto; gap: 6px 14px; align-items: end; padding-top: 12px; border-top: 3px dotted var(--low); }
.big .tek { font-size: 76px; }
.big .pix { padding-bottom: 6px; line-height: 1.6; }
.big .bar { grid-column: 1 / -1; display: flex; height: 6px; background: radial-gradient(circle, var(--low) 1px, transparent 1.4px) 0 50% / 5px 5px repeat-x; }
.big .bar i { display: block; height: 6px; background: var(--phos); transition: width 1s var(--out); }
.big .bar i.run { background: radial-gradient(circle, var(--phos) 1.3px, transparent 1.7px) 0 50% / 4px 4px repeat-x; }
.kv { display: grid; grid-template-columns: auto 1fr; gap: 3px 14px; font-size: 13px; }
.kv span:nth-child(odd) { color: var(--dim); }
.kv span:nth-child(even) { text-align: right; }
.courses { min-height: 0; overflow: auto; display: grid; align-content: start; gap: 8px; padding-top: 12px; border-top: 3px dotted var(--low); scrollbar-width: thin; scrollbar-color: var(--low) transparent; }
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
.exam .note { font-size: 12px; }
.volumes { display: grid; gap: 8px; }
.module { display: grid; gap: 4px; border-bottom: 3px dotted var(--faint); padding: 4px 6px 8px; margin: 0 -6px; transition: background .3s var(--out), box-shadow .3s var(--out); }
.module.hot { background: rgba(197, 188, 171, .04); }
.module.sel { box-shadow: inset 3px 0 0 var(--phos); background: rgba(197, 188, 171, .06); }
.vol-enter-active { transition: opacity .4s var(--out), transform .5s var(--out); transition-delay: calc(var(--i) * 50ms); }
.vol-enter-from { opacity: 0; transform: translateY(10px); }
.mh { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; text-align: left; }
.mh .fell { font-size: 18px; color: var(--hi); transition: letter-spacing .3s var(--out); }
.mh:hover .fell { letter-spacing: .01em; color: #fff; }
.course { display: grid; grid-template-columns: 30px 1fr auto; gap: 0 10px; align-items: center; }
.course .note { font-size: 12px; display: flex; flex-wrap: wrap; gap: 4px 6px; align-items: center; }
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
.word { position: absolute; right: calc(100% + 8px); top: 50%; white-space: nowrap; font-style: normal; color: var(--hi); animation: word 1.1s var(--out) both; }
@keyframes word { from { opacity: 0; transform: translate(6px, -50%); } 25% { opacity: 1; transform: translate(0, -50%); } 80% { opacity: 1; } to { opacity: 0; transform: translate(0, -50%); } }
.week { grid-area: week; min-height: 0; }
.grid { flex: 1; display: grid; grid-template-columns: 26px repeat(5, minmax(0, 1fr)); gap: 0 8px; padding: 8px 12px 14px; min-height: 0; position: relative; }
.hours { position: relative; margin-top: 18px; }
.hours span { position: absolute; right: 2px; font: 400 9px var(--pix); color: var(--low); transform: translateY(-50%); }
.day { display: grid; grid-template-rows: auto 1fr; gap: 4px; min-width: 0; }
.day.today > .pix { color: var(--hi); }
.day.today .col { border-left-color: var(--dim); }
.col { position: relative; border-left: 3px dotted var(--faint); }
.blk { position: absolute; left: 4px; right: 0; min-height: 22px; box-sizing: border-box; border: 2px solid var(--phos); background: var(--deep); padding: 3px 6px 4px; overflow: hidden; display: grid; align-content: start; gap: 1px; text-align: left;
  transition: transform .2s var(--out), background .2s var(--out), border-color .2s var(--out); }
.blk.ue { border-style: dotted; border-color: var(--dim); }
.blk b { font: 400 10px/1.25 var(--pix); color: var(--hi); text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.blk span { font-size: 10.5px; color: var(--dim); line-height: 1.25; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.blk.short { display: flex; gap: 6px; align-items: center; padding: 2px 6px; }
.blk:hover, .blk.hot { transform: translateX(3px); background: #1a1816; border-color: var(--hi); z-index: 1; }
.blk:hover span, .blk.hot span { color: var(--phos); }
.now { position: absolute; left: -3px; right: 0; height: 0; border-top: 2px solid var(--hi); pointer-events: none; }
.now::before { content: ''; position: absolute; left: -4px; top: -5px; width: 8px; height: 8px; border-radius: 50%; background: var(--hi); animation: blink 2s steps(1) infinite; }
.nothing { position: absolute; inset: 0; display: grid; place-items: center; margin: 0; font-style: italic; font-size: 16px; pointer-events: none; }
.sphere { grid-area: sphere; min-height: 0; }
.sphere :deep(.flush) { overflow: hidden; }
.sphere :deep(.gl) { flex: 1; min-height: 0; width: 100%; }
@media (max-aspect-ratio: 5/4) { .academy { grid-template-columns: minmax(0, 1fr) minmax(0, .6fr); grid-template-rows: minmax(0, 1.2fr) auto minmax(220px, .6fr); grid-template-areas: "instrument instrument" "side side" "week sphere"; } }
@media (max-width: 860px) { .academy { display: flex; flex-direction: column; } .instrument { min-height: 420px; } .week { min-height: 340px; overflow-x: auto; } .grid { min-width: 560px; } .sphere { min-height: 280px; } .mcard { width: auto; right: 14px; } }
@media (prefers-reduced-motion: reduce) { .seal, .seal .pupil, .grade.press, .word, .vol-enter-active, .card-enter-active, .add.asking input, .now::before { animation: none; transition: none; } }
</style>
