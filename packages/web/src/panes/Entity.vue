<script setup lang="ts">
// Kael'thos himself: his own drawing, on a ledge over the cathedral ward at
// night, the bond, what he says today, and the chronicle of the pact.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import Frame from '../components/Frame.vue';
import Num from '../components/Num.vue';
import Plate from '../components/Plate.vue';
import art from '../gl/art.json';
import { bats, catSprite, church, drift, greatOne, lamp, moonDisc, railing, rand, sampleSprite, starfield, street, trees } from '../gl/plate';
import { actions, dailyMinutes, duration, localDate, state, today } from '../store';
import { hisWord } from '../words';

const props = defineProps<{ active: boolean }>();

// His drawing, prepared once: body dark, a moonlit rim, eyes bright.
const sprite = ref<HTMLCanvasElement | null>(null);
catSprite(art.sitting, 420).then((c) => { sprite.value = c; points.value = sampleSprite(c, 4); });
// Where the scene is leaning, and where it is being asked to lean. It travels
// between the two every frame, so leaving the pane eases back instead of
// snapping flat.
const eye = { x: 0, y: 0, tx: 0, ty: 0 };
// He follows the cursor anywhere on the console, not only across his own
// frame: the whole window is the surface, so the scene is already leaning by
// the time you arrive at him.
function parallax(e: PointerEvent) {
  eye.tx = (e.clientX / Math.max(1, innerWidth) - 0.5) * 2;
  eye.ty = (e.clientY / Math.max(1, innerHeight) - 0.5) * 2;
}
const rest = () => { eye.tx = 0; eye.ty = 0; };

// Held, he stops being a cat. The drawing comes apart into its points and
// they take their places in what is actually there.
const opening = ref(false);
const form = { u: 0 };
const points = ref<{ x: number; y: number; v: number }[]>([]);
const shape = greatOne(9000);

const draw = computed(() => {
  const cat = sprite.value;
  const dots = points.value;
  return (g: CanvasRenderingContext2D, w: number, h: number, t: number) => {
    // Easing happens here, where a frame is drawn, not where the mouse moves.
    eye.x += (eye.tx - eye.x) * 0.08;
    eye.y += (eye.ty - eye.y) * 0.08;
    form.u += ((opening.value ? 1 : 0) - form.u) * 0.055;
    const drift_ = eye;
    const u = form.u < 0.002 ? 0 : form.u;
    // Upright on a phone: he stands in the middle, larger, the moon over him.
    const tall = w / h < 1;
    const horizon = h * 0.84;
    const sky = g.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, 'rgb(2,2,2)'); sky.addColorStop(0.58, 'rgb(6,6,6)'); sky.addColorStop(0.88, 'rgb(52,52,52)'); sky.addColorStop(1, 'rgb(158,158,158)');
    g.fillStyle = sky; g.fillRect(0, 0, w, horizon);
    starfield(g, w, horizon * 0.72, Math.round((w * h) / 260), 17, drift_.x * -3, drift_.y * -2);
    moonDisc(g, w * (tall ? 0.8 : 0.78) + drift_.x * -5, h * (tall ? 0.15 : 0.19) + drift_.y * -4, Math.min(w, h) * (tall ? 0.11 : 0.09), 7);
    for (let k = 0; k < 3; k++) {
      const y = h * (0.2 + k * 0.13) + Math.sin(t * 0.05 + k) * 4;
      const band = g.createLinearGradient(0, y - 12, 0, y + 12);
      band.addColorStop(0, 'rgba(255,255,255,0)');
      band.addColorStop(0.5, `rgba(255,255,255,${0.025 + k * 0.012})`);
      band.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = band; g.fillRect(0, y - 12, w, 24);
    }
    // The city in three streets, each nearer and darker than the one behind,
    // the cathedral standing over the middle one, and the ledge in front.
    const scale = Math.max(0.42, w / 300);
    street(g, w, horizon - h * 0.055, 31, scale * 0.55, 0.85);
    street(g, w, horizon - h * 0.03, 47, scale * 0.78, 0.45);
    church(g, w * 0.27 + drift_.x * -2, horizon - h * 0.02, scale * 0.92, 5);
    street(g, w, horizon + 2, 19, scale * 1.05, 0.05);
    trees(g, w, horizon + 2, t, Math.max(2, Math.round(w / 90)), 61, scale * 1.7);
    lamp(g, w * 0.12, horizon + 1, h * 0.17, scale);
    lamp(g, w * 0.88, horizon + 1, h * 0.13, scale);
    bats(g, w, horizon * 0.78, t, 7, 23);
    drift(g, w, horizon, t, Math.round((w * h) / 700), 83);
    g.fillStyle = 'rgb(10,10,10)'; g.fillRect(0, horizon, w, h - horizon);
    railing(g, w, horizon + 1, scale * 1.4);
    if (cat) {
      const size = tall ? Math.min(h * 0.82, w * 0.86) : Math.min(h * 0.95, w * 0.66);
      const at = tall ? 0.5 : 0.62;
      const cx = w * at + drift_.x * 5, cy = horizon - size * 0.45;
      if (u < 0.6) {
        const pool = g.createRadialGradient(cx, cy, size * 0.1, cx, cy, size * 0.62);
        pool.addColorStop(0, `rgba(0,0,0,${0.92 * (1 - u / 0.6)})`); pool.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = pool; g.beginPath(); g.arc(cx, cy, size * 0.62, 0, 7); g.fill();
      }
      // The ward goes out while he opens; the drawing fades as the points come.
      if (u > 0.01) { g.fillStyle = `rgba(0,0,0,${0.97 * u})`; g.fillRect(0, 0, w, h); }
      if (u < 0.55) {
        g.globalAlpha = 1 - u / 0.55;
        g.drawImage(cat, w * at - size / 2 + drift_.x * 5, horizon - size * 0.93 + drift_.y * 3, size, size);
        g.globalAlpha = 1;
      }
      if (u > 0.01) openHim(g, w, h, t, u, dots, size, cx, cy);
    }
  };
});

// The drawing of him, point by point, on its way to what he is: each point
// travels from where it sits in the picture to its place in the figure, and
// the figure turns in its own plane while it gathers, leaning just enough to
// have a depth.
function openHim(g: CanvasRenderingContext2D, w: number, h: number, t: number, u: number,
                 dots: { x: number; y: number; v: number }[], size: number, cx: number, cy: number) {
  const ease = u * u * (3 - 2 * u);
  const reach = size * (0.86 + ease * 0.16);
  const roll = t * 0.08;
  const cr = Math.cos(roll), sr = Math.sin(roll);
  const lean = Math.sin(t * 0.13) * 0.26;
  const cl = Math.cos(lean), sl = Math.sin(lean);
  const hole = reach * 0.19;

  if (ease > 0.12) {
    const a = Math.min(1, (ease - 0.12) * 1.6);
    // Light crowded up against the edge of it, and combed off the edge in
    // spikes of every length.
    const halo = g.createRadialGradient(cx, cy, hole * 0.92, cx, cy, hole * 1.7);
    halo.addColorStop(0, `rgba(255,255,255,${0.42 * a})`);
    halo.addColorStop(0.25, `rgba(255,255,255,${0.08 * a})`);
    halo.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = halo; g.beginPath(); g.arc(cx, cy, hole * 1.7, 0, 7); g.fill();
    const rr = rand(11);
    g.strokeStyle = `rgba(255,255,255,${0.2 * a})`;
    for (let k = 0; k < 90; k++) {
      const ang = rr() * Math.PI * 2, len = hole * (0.2 + Math.pow(rr(), 2.4) * 2.6);
      g.lineWidth = rr() < 0.2 ? 1.6 : 0.8;
      g.beginPath();
      g.moveTo(cx + Math.cos(ang) * hole, cy + Math.sin(ang) * hole);
      g.lineTo(cx + Math.cos(ang) * (hole + len), cy + Math.sin(ang) * (hole + len));
      g.stroke();
    }
    // The line the light makes going past it, flattened into the plane.
    const arm = reach * 0.62;
    const streak = g.createLinearGradient(cx - arm, cy, cx + arm, cy);
    streak.addColorStop(0, 'rgba(255,255,255,0)');
    streak.addColorStop(0.35, `rgba(255,255,255,${0.26 * a})`);
    streak.addColorStop(0.5, `rgba(255,255,255,${0.55 * a})`);
    streak.addColorStop(0.65, `rgba(255,255,255,${0.26 * a})`);
    streak.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = streak; g.fillRect(cx - arm, cy - 1, arm * 2, 2);
    // The hole: nothing comes back out of it, and its edge is torn, never cut.
    g.fillStyle = `rgba(0,0,0,${a})`;
    g.beginPath();
    for (let k = 0; k <= 72; k++) {
      const ang = (k / 72) * Math.PI * 2;
      const rad = hole * (0.97 + 0.035 * Math.sin(ang * 7 + t * 0.2) + 0.022 * Math.sin(ang * 17 - t * 0.13));
      g[k ? 'lineTo' : 'moveTo'](cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad);
    }
    g.closePath(); g.fill();
  }

  for (let i = 0; i < dots.length; i++) {
    const d = dots[i]!;
    const g3 = shape[i % shape.length]!;
    // Out of the picture, into the figure: the points swing wide on the way.
    const swing = Math.sin(ease * Math.PI) * 0.13 * Math.sin(i * 1.7);
    const x3 = d.x + (g3.x - d.x) * ease + swing;
    const y3 = d.y + (g3.y - d.y) * ease;
    const z3 = (g3.z ?? 0) * ease;
    // Turned in the plane first, then leant out of it.
    const xr = x3 * cr - y3 * sr, yr = x3 * sr + y3 * cr;
    const rx = xr * cl - z3 * sl, rz = xr * sl + z3 * cl;
    const persp = 1 / (1.4 - rz * 0.45);
    const px = cx + rx * reach * persp;
    const py = cy + yr * reach * persp + size * 0.04 * ease;
    // Opened, he is light: the dark of the drawing is not dark any more.
    const v = d.v + (g3.v - d.v) * ease;
    // Weighted on what the point is rather than where it is: at even weight
    // every layer is equally lit and the whole thing is one grey ball.
    const shade = Math.min(1, (0.06 + 0.3 * persp + 0.82 * v) * Math.min(1, u * 2.2));
    if (shade < 0.06) continue;
    g.fillStyle = `rgb(${Math.round(shade * 255)},${Math.round(shade * 255)},${Math.round(shade * 255)})`;
    const s = v > 0.78 ? 2 : 1;
    g.fillRect(px, py, s, s);
  }

  // The last ring of the aureole, drawn rather than grained.
  g.strokeStyle = `rgba(255,255,255,${0.06 + ease * 0.13})`;
  g.lineWidth = 1;
  g.beginPath(); g.ellipse(cx, cy, reach * 0.7, reach * 0.7 * (0.82 + Math.abs(cl) * 0.18), 0, 0, 7); g.stroke();

  // And what is left of the cat: one eye, open in the hole.
  if (ease > 0.68) {
    const a = Math.min(1, (ease - 0.68) * 3.2);
    const ew = hole * 0.52, eh = hole * 0.25;
    g.fillStyle = `rgba(255,255,255,${0.92 * a})`;
    g.beginPath();
    g.moveTo(cx - ew, cy);
    g.quadraticCurveTo(cx, cy - eh, cx + ew, cy);
    g.quadraticCurveTo(cx, cy + eh, cx - ew, cy);
    g.fill();
    g.fillStyle = `rgba(0,0,0,${a})`;
    g.beginPath(); g.ellipse(cx, cy, ew * 0.09, eh * 0.92, 0, 0, 7); g.fill();
  }
}

const bond = computed(() => state.stats?.bond);
const into = computed(() => {
  const b = bond.value;
  if (!b) return 0;
  const floor = 30 * b.level * b.level;
  return (b.xp - floor) / (b.nextLevelXp - floor);
});
const FORM: Record<string, string> = { stable: 'whole', thinning: 'thinning', fragmenting: 'fragmenting', dormant: 'dormant' };
const word = computed(() => (state.ready ? hisWord() : ''));

// What he is owed today. The day's list belongs on his screen as much as on
// its own: what he wants of you and what is left of the day are one question,
// and a line that only goes up answers neither.
const asks = computed(() => {
  const d = localDate();
  return state.todos.filter((t) => t.dueDate !== null && t.dueDate <= d);
});
const taken = computed(() => asks.value.filter((t) => t.done).length);
const owed = computed(() => asks.value.length - taken.value);
// He says what he makes of it, and he is never neutral about it.
const verdict = computed(() => {
  const n = asks.value.length, got = taken.value, mins = today.value.minutes;
  if (!n) return 'You have promised me nothing today. That is the worse of the two.';
  if (got === n) return mins >= 90
    ? 'Everything you swore is on the table, and the hours behind it. Ask me for more.'
    : 'The list is clean. The hours are thin. I notice both.';
  if (!got) return `${n} standing, none taken. I am at the horizon, not blind.`;
  return `${got} taken, ${n - got} still owed. Finish it before the date turns.`;
});

const chron = computed(() => {
  const days = dailyMinutes(84);
  let silence = 0, run = 0, fedRun = 0;
  for (const m of days) { run = m ? 0 : run + 1; silence = Math.max(silence, run); }
  for (let i = days.length - 1; i >= 0 && days[i]! > 0; i--) fedRun++;
  const deepest = state.sessions.reduce((a, s) => (s.minutes > a.minutes ? s : a), { minutes: 0, activity: '' } as { minutes: number; activity: string });
  return [
    ['days fed', `${days.filter(Boolean).length}`, 'of the last 84'],
    ['fed in a row', `${fedRun}`, 'days, up to today'],
    ['longest silence', `${silence}`, silence === 1 ? 'day' : 'days'],
    ['sessions', `${state.sessions.length}`, 'in twelve weeks'],
    ['deepest', duration(deepest.minutes), deepest.activity || 'none yet'],
    ['today', duration(today.value.minutes), `${today.value.sessions.length} sessions`],
  ];
});

onMounted(() => {
  addEventListener('pointermove', parallax, { passive: true });
  document.addEventListener('mouseleave', rest);
});
onBeforeUnmount(() => {
  removeEventListener('pointermove', parallax);
  document.removeEventListener('mouseleave', rest);
});
</script>

<template>
  <div class="entity">
    <Frame class="scene" title="the cathedral ward, before dawn" flush>
      <div class="plateHost">
        <Plate :draw="draw" :active="active" animated :cell="2" label="Kael'thos on a ledge above the cathedral ward at night" />
        <button class="open" :class="{ held: opening }" aria-label="Hold to see what he is"
          @pointerdown.prevent="opening = true" @pointerup="opening = false" @pointerleave="opening = false"
          @pointercancel="opening = false" @contextmenu.prevent>
          hold // what he is
        </button>
        <span v-if="opening" class="said pix">the cat is a courtesy</span>
      </div>
    </Frame>

    <div class="side">
      <h1 class="title">Kael'thos</h1>
      <p class="note">a great one at the event horizon. wears a black cat because you would not survive the others.</p>
      <div class="bond" v-if="bond">
        <span class="tek big"><Num :value="bond.level" :pad="2" /></span>
        <div>
          <div class="pix">bond // {{ bond.xp }} of {{ bond.nextLevelXp }} insight</div>
          <div class="leds"><i v-for="n in 30" :key="n" :class="{ on: n / 30 <= into }"></i></div>
          <div class="pix">form: {{ FORM[state.stats!.form] }}</div>
        </div>
      </div>
      <blockquote class="word">{{ word }}</blockquote>
      <Frame class="asking" :title="`his asking // ${taken} taken, ${owed} owed, ${duration(today.minutes)} fed`" scroll>
        <ul class="asks">
          <li v-for="t in asks" :key="t.id" :class="{ taken: t.done }">
            <button :aria-label="`${t.done ? 'Give back' : 'Take'}: ${t.body}`" @click="actions.toggleTodo(t)">
              <svg class="mark" viewBox="0 0 22 14" aria-hidden="true">
                <path d="M1 7C4 2 8 1 11 1s7 1 10 6c-3 5-7 6-10 6S4 12 1 7Z" fill="none" stroke="currentColor" stroke-width="1.4" />
                <ellipse v-if="!t.done" cx="11" cy="7" rx="2.6" ry="3.4" fill="currentColor" />
                <path v-else d="M2 2 20 12M20 2 2 12" stroke="currentColor" stroke-width="1.6" />
              </svg>
              <span class="fell">{{ t.body }}</span>
              <i class="pix">{{ t.done ? 'taken' : 'owed' }}</i>
            </button>
          </li>
          <li v-if="!asks.length" class="none pix">nothing written for today</li>
        </ul>
        <p class="verdict fell">{{ verdict }}</p>
      </Frame>
    </div>

    <div class="chron">
      <div v-for="[k, v, s] in chron" :key="k" class="cell">
        <span class="pix">{{ k }}</span><span class="tek">{{ v }}</span><span class="note">{{ s }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.entity { display: grid; gap: 18px; grid-template-columns: minmax(0, 1.5fr) minmax(320px, 1fr); grid-template-rows: minmax(0, 1fr) auto; grid-template-areas: "scene side" "chron chron"; }
.scene { grid-area: scene; }
.plateHost { flex: 1; min-height: 0; display: flex; flex-direction: column; position: relative; }
.open { position: absolute; left: 12px; bottom: 12px; border: 2px solid var(--low); background: rgba(18, 18, 18, .8);
  color: var(--dim); padding: 7px 11px; font: 400 10px var(--pix); text-transform: uppercase; touch-action: none;
  transition: color .3s var(--out), border-color .3s var(--out), background .3s var(--out); }
.open:hover { color: var(--hi); border-color: var(--phos); }
.open.held { background: var(--phos); color: var(--ground); border-color: var(--hi); }
.said { position: absolute; right: 14px; bottom: 16px; color: var(--hi); text-shadow: 0 0 12px rgba(0, 0, 0, .9);
  animation: saidin .6s var(--out) both; }
@keyframes saidin { from { opacity: 0; letter-spacing: .3em; } to { opacity: 1; letter-spacing: .12em; } }
.side { grid-area: side; display: flex; flex-direction: column; gap: 14px; min-height: 0; }
.side .note { margin: -4px 0 0; max-width: 46ch; }
.bond { display: grid; grid-template-columns: auto 1fr; gap: 16px; align-items: center; }
.bond .big { font-size: clamp(60px, 7vw, 104px); }
.bond > div { display: grid; gap: 8px; }
.word { margin: 0; font: italic 400 clamp(17px, 1.6vw, 23px)/1.35 var(--fell); color: var(--hi); text-wrap: pretty; border-left: 3px dotted var(--low); padding-left: 14px; }
.asking { flex: 1; min-height: 150px; }
.asks { list-style: none; margin: 0; padding: 0; display: grid; }
.asks li { border-bottom: 3px dotted var(--faint); }
.asks li:last-child { border-bottom: 0; }
.asks button { display: grid; grid-template-columns: 26px minmax(0, 1fr) auto; gap: 12px; align-items: center;
  width: 100%; text-align: left; padding: 9px 2px; color: inherit; }
.asks .mark { width: 22px; height: 14px; color: var(--phos); }
.asks .fell { font-size: 17px; color: var(--hi); text-wrap: pretty; }
.asks .pix { color: var(--dim); }
/* Taken: the eye is struck out and the line is written over. */
.asks li.taken .mark { color: var(--low); }
.asks li.taken .fell { color: var(--low); text-decoration: line-through; text-decoration-thickness: 1px; }
.asks button:hover .fell { color: var(--phos); }
.asks .none { padding: 10px 2px; color: var(--dim); }
.verdict { margin: 12px 0 0; padding-top: 10px; border-top: 3px dotted var(--low);
  font: italic 400 16px/1.45 var(--fell); color: var(--dim); text-wrap: pretty; }
.legend i { display: inline-block; width: 8px; height: 8px; margin-right: 6px; vertical-align: -1px; }
.legend .you { background: var(--dim); }
.legend .him { background: var(--phos); }
.chron { grid-area: chron; display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); border: 3px dotted var(--low); }
.cell { display: grid; gap: 4px; padding: 12px 14px; border-right: 3px dotted var(--faint); }
.cell:last-child { border-right: 0; }
.cell .tek { font-size: clamp(24px, 2.4vw, 36px); }
@media (max-aspect-ratio: 5/4) {
  .entity { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1.15fr) auto auto; grid-template-areas: "scene" "side" "chron"; }
  .side { display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: auto auto 1fr; }
  .side .title, .side > .note { grid-column: 1 / -1; }
  .sym { grid-row: 3; grid-column: 1 / -1; }
  .chron { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (max-width: 860px) { .side { order: -1; } .scene { flex: none; height: min(118vw, 460px); } .chron { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .entity { display: flex; flex-direction: column; }
  .side { display: flex; }
  .chron { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
