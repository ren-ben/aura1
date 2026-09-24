<script setup lang="ts">
// The Academy: the degree as an astrolabe. Six rings, one per semester, the
// modules laid round each as arcs as long as their ECTS; the rete turns with
// the term. Beside it the tally, the courses and their grades, and the week
// as u:find has it.
import { computed, ref } from 'vue';
import Frame from '../components/Frame.vue';
import Plate from '../components/Plate.vue';
import { rand, starfield } from '../gl/plate';
import { FIRST_TERM, GRADES, modules, tally as tallyOf, termOf, week as weekOf, type Module } from '../academy';
import { actions, state, type Course } from '../store';

defineProps<{ active: boolean }>();

const MODULES = computed(() => modules(state.courses));
const tally = computed(() => tallyOf(state.courses));
// Grades cycle on a click: none, 1 to 5, none again.
const cycle = (c: Course) => actions.gradeCourse(c, c.grade === null ? 1 : c.grade === 5 ? null : c.grade + 1);
const TERM = termOf();
// How far through the term: the rete's turn.
const term = computed(() => {
  const from = TERM.from.getTime(), to = TERM.to.getTime();
  const u = (Date.now() - from) / (to - from);
  const n = Math.floor((Date.now() - from) / 6048e5) + 1;
  return { u: Math.max(0, Math.min(1, u)), label: u < 0 ? `begins in ${Math.ceil(-u * (to - from) / 864e5)} days` : u > 1 ? 'ended' : `week ${n} of ${Math.ceil((to - from) / 6048e5)}` };
});

// Adding a course by its u:find number, in the term it is in.
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
const groupLabel = (g: Course['groups'][number]) => {
  const e = g.events[0];
  if (!e) return g.id;
  const d = new Date(e.begin);
  return `${d.toLocaleDateString('en-GB', { weekday: 'short' }).toLowerCase()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

// The instrument, in a 220 x 220 box centred on the pole.
const R0 = 34, STEP = 12;
const ringR = (sem: number) => R0 + sem * STEP;
const arcs = computed(() => {
  const out: (Module & { a0: number; a1: number; r: number })[] = [];
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

const drawAstrolabe = computed(() => {
  const list = arcs.value;
  const turn = term.value.u;
  return (g: CanvasRenderingContext2D, w: number, h: number, t: number) => {
    const { s, cx, cy } = fit(w, h);
    const grey = (v: number) => `rgb(${v * 255 | 0},${v * 255 | 0},${v * 255 | 0})`;
    const P = (a: number, r: number) => [cx + Math.cos(a) * r * s, cy + Math.sin(a) * r * s] as const;
    starfield(g, w, h, Math.round((w * h) / 110), 71);
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
    // The semester rings, faint.
    g.setLineDash([1, 3]);
    for (let sem = 1; sem <= 6; sem++) { g.strokeStyle = grey(0.18); g.lineWidth = 1; g.beginPath(); g.arc(cx, cy, ringR(sem) * s, 0, 7); g.stroke(); }
    g.setLineDash([]);
    // The modules. Passed: solid. This term's: a band of grain that stirs.
    // Open to you: an outline. Not yet: a trace.
    for (const m of list) {
      const width = 7 * s;
      if (m.status === 'passed' || m.status === 'open') {
        g.strokeStyle = grey(m.status === 'passed' ? 0.85 : 0.5);
        g.lineWidth = m.status === 'passed' ? width : Math.max(1, s * 0.5);
        g.beginPath(); g.arc(cx, cy, m.r * s, m.a0, m.a1); g.stroke();
        if (m.status === 'open') { g.beginPath(); g.arc(cx, cy, (m.r - 3.5) * s, m.a0, m.a1); g.stroke(); g.beginPath(); g.arc(cx, cy, (m.r + 3.5) * s, m.a0, m.a1); g.stroke(); }
      } else if (m.status === 'running') {
        const n = Math.round((m.a1 - m.a0) * m.r * 9 * s);
        for (let i = 0; i < n; i++) {
          const a = m.a0 + r() * (m.a1 - m.a0), d = m.r + (r() - 0.5) * 7;
          const [x, y] = P(a, d);
          g.fillStyle = grey(0.55 + 0.45 * (0.5 + 0.5 * Math.sin(t * 1.4 + a * 9 + d)));
          g.fillRect(x, y, 1, 1);
        }
      } else {
        g.strokeStyle = grey(0.3); g.lineWidth = Math.max(1, s * 0.5); g.setLineDash([2, 4]);
        g.beginPath(); g.arc(cx, cy, m.r * s, m.a0, m.a1); g.stroke(); g.setLineDash([]);
      }
    }
    // The rete: the ecliptic ring set off the pole, and the pointer, turned
    // as far round as the term has gone.
    const rot = -Math.PI / 2 + turn * Math.PI * 2 + Math.sin(t * 0.2) * 0.004;
    g.strokeStyle = grey(0.45); g.lineWidth = Math.max(1, s * 0.5);
    const [ex, ey] = P(rot + Math.PI, 20);
    g.beginPath(); g.arc(ex, ey, 70 * s, 0, 7); g.stroke();
    const [tx, ty] = P(rot, 100);
    g.strokeStyle = grey(0.95); g.lineWidth = Math.max(1, s * 0.8);
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(tx, ty); g.stroke();
    g.fillStyle = grey(1);
    g.beginPath();
    for (let k = 0; k < 8; k++) { const a = rot + k * Math.PI / 4, rr = (k % 2 ? 1.2 : 3.4) * s; g.lineTo(tx + Math.cos(a) * rr, ty + Math.sin(a) * rr); }
    g.fill();
    // The pole: the StEOP, the first gate, where every degree starts; an eye.
    g.fillStyle = grey(0.03); g.beginPath(); g.arc(cx, cy, 26 * s, 0, 7); g.fill();
    g.strokeStyle = grey(0.5); g.lineWidth = Math.max(1, s * 0.5); g.beginPath(); g.arc(cx, cy, 26 * s, 0, 7); g.stroke();
    const ew = 11 * s, eh = 5.6 * s, open = 0.75 + 0.25 * Math.sin(t * 0.5);
    g.fillStyle = grey(0.92);
    g.beginPath(); g.moveTo(cx - ew, cy); g.quadraticCurveTo(cx, cy - eh * 2 * open, cx + ew, cy); g.quadraticCurveTo(cx, cy + eh * 2 * open, cx - ew, cy); g.fill();
    g.fillStyle = grey(0); g.beginPath(); g.ellipse(cx, cy, 1.5 * s, eh * 0.85 * open, 0, 0, 7); g.fill();
  };
});

// Labels along the arcs, drawn crisp over the plate.
const labels = computed(() => arcs.value.map((m) => {
  const mid = (m.a0 + m.a1) / 2;
  const deg = (mid * 180) / Math.PI + 90;
  const flip = Math.sin(mid) > 0.05;
  return { ...m, x: Math.cos(mid) * (m.r - 5.2), y: Math.sin(mid) * (m.r - 5.2), rot: flip ? deg + 180 : deg };
}));

const termModules = computed(() => MODULES.value.filter((m) => state.courses.some((c) => c.module === m.code && c.semester === TERM.name)
  || m.status === 'running'));
const days = ['mon', 'tue', 'wed', 'thu', 'fri'];
const H0 = 8.75, H1 = 17;
const hm = (s: string) => { const [a, b] = s.split(':').map(Number); return a! + b! / 60; };
const theWeek = computed(() => weekOf(state.courses));
const blocks = computed(() => theWeek.value.slots.map((e) => ({ ...e, top: ((hm(e.from) - H0) / (H1 - H0)) * 100, height: ((hm(e.to) - hm(e.from)) / (H1 - H0)) * 100 })));
const dates = computed(() => days.map((d, i) => { const x = new Date(theWeek.value.monday); x.setDate(x.getDate() + i); return `${d} ${x.getDate()}`; }));
const weekTitle = computed(() => `the week of ${theWeek.value.monday.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }).toLowerCase()} // as u:find has it`);
</script>

<template>
  <div class="academy">
    <Frame class="instrument" title="the degree as an astrolabe // six rings, one per semester, each module as long as its ects" flush>
      <Plate :draw="drawAstrolabe" :active="active" animated :cell="2" label="The physics degree drawn as an astrolabe: semesters as rings, modules as arcs." />
      <svg class="arcs" viewBox="-112 -112 224 224" preserveAspectRatio="xMidYMid meet">
        <text v-for="l in labels" :key="l.code" :class="l.status" :transform="`translate(${l.x.toFixed(2)} ${l.y.toFixed(2)}) rotate(${l.rot.toFixed(1)})`" text-anchor="middle" dominant-baseline="middle">{{ l.code }} {{ l.ects }}</text>
        <text v-for="n in 6" :key="n" class="sem" :x="-3" :y="-(34 + n * 12) + 1.2" text-anchor="end">{{ ['i', 'ii', 'iii', 'iv', 'v', 'vi'][n - 1] }}</text>
      </svg>
      <div class="legend pix"><span><i class="passed"></i>passed</span><span><i class="running"></i>this term</span><span><i class="open"></i>open to you</span><span><i class="locked"></i>not yet</span></div>
    </Frame>

    <div class="side">
      <h1 class="title">The Academy</h1>
      <p class="note">Physics at the University of Vienna, curriculum 2026. Byrgenwerth taught its scholars to look up; he says Vienna sent you for the same reason, and that the mathematics is the telescope.</p>
      <div class="big"><span class="tek">{{ tally.passed }}</span><span class="pix">of 180 ects<br>{{ tally.running }} this term</span></div>
      <div class="kv">
        <span>term</span><span>{{ TERM.name }} // {{ term.label }}</span>
        <span>the first gate (steop)</span><span>{{ tally.steop }} of 18</span>
        <span>grade, weighted</span><span>{{ tally.avg ? tally.avg.toFixed(2) : 'none yet' }}</span>
        <span>exams</span><span>when u:find posts them</span>
      </div>
      <div class="courses">
        <form class="add" @submit.prevent="nr && add([nr])">
          <label class="pix" for="course-nr">add a course by its u:find number</label>
          <span><input id="course-nr" v-model="nr" inputmode="numeric" pattern="[0-9]{6}" placeholder="261600" :disabled="adding" /><button class="btn" :disabled="adding || nr.length !== 6">{{ adding ? 'asking u:find' : 'add' }}</button></span>
          <span v-if="state.error" class="note err">{{ state.error }}</span>
        </form>
        <div v-if="!state.courses.length" class="empty">
          <p class="note">Nothing kept yet. Your first term, as the curriculum lays it out and u:find lists it for {{ FIRST_TERM.semester }}: eight courses.</p>
          <button class="btn" :disabled="adding" @click="firstTerm">{{ adding ? 'asking u:find' : 'add the first term' }}</button>
        </div>
        <div v-for="m in termModules" :key="m.code" class="module">
          <div class="mh"><span class="fell">{{ m.name }}</span><span class="pix">{{ m.code }} // {{ m.ects }} ects</span></div>
          <div v-for="c in state.courses.filter((x) => x.module === m.code)" :key="c.id" class="course">
            <span class="pix">{{ c.type }}</span>
            <span class="note">{{ c.nr }} // {{ c.ects }} ects
              <select v-if="c.groups.length > 1" :id="`group-${c.id}`" class="group" :value="c.groupId ?? ''" :aria-label="`group for ${c.name} ${c.type}`" @change="actions.groupCourse(c, ($event.target as HTMLSelectElement).value || null)">
                <option value="">group ?</option>
                <option v-for="(g, i) in c.groups" :key="g.id" :value="g.id">group {{ i + 1 }} // {{ groupLabel(g) }}</option>
              </select>
            </span>
            <button class="grade" :class="{ set: c.grade }" :title="c.grade ? GRADES[c.grade - 1] : 'no grade yet'" @click="cycle(c)">{{ c.grade ?? '-' }}</button>
          </div>
        </div>
      </div>
    </div>

    <Frame class="week" :title="weekTitle" flush>
      <div class="grid">
        <div class="hours" aria-hidden="true"><span v-for="h in [9, 10, 11, 12, 13, 14, 15, 16]" :key="h" :style="{ top: `${((h - H0) / (H1 - H0)) * 100}%` }">{{ h }}</span></div>
        <div v-for="(d, i) in dates" :key="d" class="day">
          <span class="pix">{{ d }}</span>
          <div class="col">
            <div v-for="b in blocks.filter((x) => x.day === i)" :key="b.label + b.from" class="blk" :class="{ ue: b.ue }" :style="{ top: `${b.top}%`, height: `${b.height}%` }">
              <b>{{ b.label }}</b><span>{{ b.from }} {{ b.room }}</span>
            </div>
          </div>
        </div>
      </div>
    </Frame>
  </div>
</template>

<style scoped>
.academy { display: grid; gap: 18px; grid-template-columns: minmax(0, 1.5fr) minmax(300px, 1fr); grid-template-rows: minmax(0, 1fr) minmax(190px, .42fr);
  grid-template-areas: "instrument side" "week side"; }
.instrument { grid-area: instrument; min-height: 0; }
.instrument :deep(.flush) { overflow: hidden; }
.arcs { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.arcs text { font: 400 4.4px var(--pix); fill: var(--dim); text-transform: uppercase; letter-spacing: .04em; }
.arcs text.running { fill: var(--hi); }
.arcs text.open { fill: var(--phos); }
.arcs text.passed { fill: var(--hi); }
.arcs .sem { font: italic 5px var(--fell); fill: var(--dim); text-transform: none; }
.legend { position: absolute; left: 14px; bottom: 12px; display: grid; gap: 4px; }
.legend span { display: flex; gap: 8px; align-items: center; }
.legend i { width: 14px; height: 6px; }
.legend .passed { background: var(--phos); }
.legend .running { background: radial-gradient(circle, var(--phos) 1px, transparent 1.3px) 0 0 / 3px 3px; }
.legend .open { border: 1px solid var(--dim); }
.legend .locked { border-top: 2px dotted var(--low); height: 0; }
.side { grid-area: side; display: grid; grid-template-rows: auto auto auto auto minmax(0, 1fr); gap: 12px; min-height: 0; }
.big { display: flex; align-items: flex-end; gap: 14px; padding-top: 12px; border-top: 3px dotted var(--low); }
.big .tek { font-size: 76px; }
.big .pix { padding-bottom: 6px; line-height: 1.6; }
.kv { display: grid; grid-template-columns: 1fr auto; gap: 3px 12px; font-size: 13px; }
.kv span:nth-child(odd) { color: var(--dim); }
.courses { min-height: 0; overflow: auto; display: grid; align-content: start; gap: 8px; padding-top: 12px; border-top: 3px dotted var(--low); scrollbar-width: thin; scrollbar-color: var(--low) transparent; }
.module { display: grid; gap: 4px; border-bottom: 3px dotted var(--faint); padding-bottom: 8px; }
.mh { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; }
.mh .fell { font-size: 18px; color: var(--hi); }
.course { display: grid; grid-template-columns: 30px 1fr auto; gap: 0 10px; align-items: center; }
.course .note { font-size: 12px; }
.grade { font: 800 14px var(--tek); color: var(--dim); min-width: 28px; text-align: center; border: 3px double var(--low); padding: 0 6px; }
.grade.set { color: var(--hi); border-color: var(--dim); }
.grade:hover { color: var(--hi); }
.add { display: grid; gap: 4px; }
.add > span { display: flex; gap: 8px; }
.add input { flex: 1; min-width: 0; background: var(--deep); border: 2px solid var(--low); padding: 4px 8px; font: 800 15px var(--tek); color: var(--hi); letter-spacing: .06em; }
.add input:focus { border-color: var(--dim); outline: none; }
.add input::placeholder { color: var(--low); }
.btn { font: 400 10.5px var(--pix); text-transform: uppercase; color: var(--hi); border: 3px double var(--low); padding: 4px 10px; }
.btn:hover:not(:disabled) { border-color: var(--dim); }
.btn:disabled { color: var(--dim); }
.err { color: var(--phos); }
.empty { display: grid; gap: 8px; justify-items: start; }
.group { background: var(--deep); color: var(--phos); border: 1px solid var(--low); font: 400 10px var(--pix); text-transform: uppercase; margin-left: 6px; }
.week { grid-area: week; min-height: 0; }
.grid { flex: 1; display: grid; grid-template-columns: 28px repeat(5, minmax(0, 1fr)); gap: 0 8px; padding: 8px 12px 12px; min-height: 0; }
.hours { position: relative; margin-top: 18px; }
.hours span { position: absolute; right: 2px; font: 400 9px var(--pix); color: var(--low); transform: translateY(-50%); }
.day { display: grid; grid-template-rows: auto 1fr; gap: 4px; min-width: 0; }
.col { position: relative; border-left: 3px dotted var(--faint); }
.blk { position: absolute; left: 4px; right: 0; border: 2px solid var(--phos); background: var(--deep); padding: 3px 6px; overflow: hidden; display: grid; align-content: start; }
.blk.ue { border-style: dotted; border-color: var(--dim); }
.blk b { font: 400 10px/1.2 var(--pix); color: var(--hi); text-transform: uppercase; }
.blk span { font-size: 10.5px; color: var(--dim); line-height: 1.2; white-space: nowrap; }
@media (max-aspect-ratio: 5/4) { .academy { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1.2fr) auto minmax(200px, .6fr); grid-template-areas: "instrument" "side" "week"; } }
@media (max-width: 860px) { .academy { display: flex; flex-direction: column; } .instrument { min-height: 420px; } .week { min-height: 320px; overflow-x: auto; } .grid { min-width: 560px; } }
</style>
