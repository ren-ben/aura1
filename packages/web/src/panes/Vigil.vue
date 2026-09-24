<script setup lang="ts">
// The Vigil: the Tree of Life with the ten gates of the ascent on it, him
// sitting still at its foot, the Abyss turning at Da'ath where he waits, and
// every sit kept as a star. Stillness is its own measure: hours of work feed
// him; stillness brings you nearer. Sits are sample data until the device
// sends them.
import { computed, ref } from 'vue';
import Frame from '../components/Frame.vue';
import Plate from '../components/Plate.vue';
import art from '../gl/art.json';
import { moonDisc, rand, starfield } from '../gl/plate';
import { duration } from '../store';
import { GATE_SPHERES, GATES, PATHS, sampleSits, SPHERES } from '../vigil';

defineProps<{ active: boolean }>();

const sits = sampleSits();
const reached = 4;  // gate v, the sun: where the sample practitioner stands
const picked = ref(reached);
const gate = computed(() => GATES[picked.value]!);
const kept = ref<Set<string>>(new Set(['thirty days without a gap', 'twenty minutes, sat through', 'the breath told apart from thoughts about it',
  'a whole sit without losing the breath', 'dullness caught before it catches you', 'sensations seen flickering', 'warmth that comes on its own', 'rapture entered on purpose']));
const toggle = (s: string) => { const k = new Set(kept.value); k.has(s) ? k.delete(s) : k.add(s); kept.value = k; };

const stats = computed(() => {
  const minutes = sits.reduce((a, s) => a + s.minutes, 0);
  const days = new Set(sits.map((s) => s.day));
  let streak = 0;
  while (days.has(streak)) streak++;
  const by = new Map<string, { minutes: number; n: number }>();
  for (const s of sits) { const e = by.get(s.practice) ?? { minutes: 0, n: 0 }; e.minutes += s.minutes; e.n++; by.set(s.practice, e); }
  const most = Math.max(...[...by.values()].map((v) => v.minutes));
  return {
    minutes, streak, count: sits.length,
    longest: Math.max(...sits.map((s) => s.minutes)),
    week: sits.filter((s) => s.day < 7).reduce((a, s) => a + s.minutes, 0),
    practices: [...by.entries()].sort((a, b) => b[1].minutes - a[1].minutes).map(([name, v]) => ({ name, ...v, share: v.minutes / most })),
  };
});

// The tree is laid out in a 62 x 100 box; the canvas and the overlay both fit
// it the same way (centred, whole), so a sphere drawn is a sphere clicked.
const VB = { x: -16, y: -6, w: 132, h: 112 };
const fit = (w: number, h: number) => {
  const s = Math.min(w / VB.w, h / VB.h);
  return { s, ox: (w - VB.w * s) / 2 - VB.x * s, oy: (h - VB.h * s) / 2 - VB.y * s };
};

// Him in negative, the way the device's dark looks show him: the fur lit,
// the eyes and ear marks dark, nothing around him.
const sprite = ref<HTMLCanvasElement | null>(null);
{
  const img = new Image();
  img.onload = () => {
    const n = 300, c = document.createElement('canvas');
    c.width = c.height = n;
    const x = c.getContext('2d', { willReadFrequently: true })!;
    x.drawImage(img, 0, 0, n, n);
    const d = x.getImageData(0, 0, n, n);
    for (let i = 0; i < n * n; i++) {
      const p = i * 4, ink = d.data[p + 3]! > 128 && d.data[p]! < 128;
      const v = ink ? 225 : 20;
      d.data[p] = d.data[p + 1] = d.data[p + 2] = v;
      if (d.data[p + 3]! < 128) d.data[p + 3] = 0;
    }
    x.putImageData(d, 0, 0);
    sprite.value = c;
  };
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(art.still.replace('<svg ', '<svg width="400" height="400" '))}`;
}

const drawTree = computed(() => {
  const him = sprite.value;
  const at = picked.value;
  return (g: CanvasRenderingContext2D, w: number, h: number, t: number) => {
    const { s, ox, oy } = fit(w, h);
    const X = (x: number) => ox + x * s, Y = (y: number) => oy + y * s;
    const grey = (v: number) => `rgb(${v * 255 | 0},${v * 255 | 0},${v * 255 | 0})`;
    starfield(g, w, h, Math.round((w * h) / 90), 61);

    // The four worlds: great stippled circles stacked down the tree, each
    // torn open somewhere, the way the old diagrams draw them.
    const r = rand(8);
    [[50, 18, 27], [50, 42, 27], [50, 66, 27], [50, 88, 22]].forEach(([cx, cy, rad], k) => {
      for (let i = 0; i < 900; i++) {
        const a = r() * Math.PI * 2;
        if (Math.sin(a * 3 + k * 2) > 0.82) continue;
        const d = rad! + (r() - 0.5) * 1.6;
        g.fillStyle = grey(0.12 + r() * 0.2);
        g.fillRect(X(cx! + Math.cos(a) * d * 1.4), Y(cy! + Math.sin(a) * d), 1, 1);
      }
    });

    // The Abyss: rings of grain wound round the hidden sphere, turning slowly
    // inward. Nothing in the middle.
    const [dx, dy] = SPHERES.daath!;
    for (let i = 0; i < 4200; i++) {
      const k = r(), a = r() * Math.PI * 2 + t * (0.05 + (1 - k) * 0.12);
      const rad = 4 + Math.pow(k, 0.7) * 21;
      const wob = Math.sin(a * 5 + k * 20 + t * 0.3) * 0.9;
      g.fillStyle = grey((1 - k * 0.8) * 0.85 * (0.45 + r() * 0.55));
      g.fillRect(X(dx + Math.cos(a) * (rad + wob) * 1.3), Y(dy + Math.sin(a) * (rad + wob) * 0.9), 1, 1);
    }
    g.fillStyle = '#000'; g.beginPath(); g.arc(X(dx), Y(dy), 4.2 * s, 0, 7); g.fill();
    g.strokeStyle = grey(0.9); g.lineWidth = Math.max(1, s * 0.3); g.beginPath(); g.arc(X(dx), Y(dy), 4.4 * s, 0, 7); g.stroke();

    // The paths: lit once both ends are reached.
    const reachedSet = new Set(GATE_SPHERES.slice(0, reached + 1));
    reachedSet.add('malkuth');
    for (const [a, b] of PATHS) {
      const [x1, y1] = SPHERES[a]!, [x2, y2] = SPHERES[b]!;
      const lit = reachedSet.has(a) && reachedSet.has(b);
      g.strokeStyle = grey(lit ? 0.62 : 0.22);
      g.lineWidth = Math.max(1, s * (lit ? 0.7 : 0.45));
      g.beginPath(); g.moveTo(X(x1), Y(y1)); g.lineTo(X(x2), Y(y2)); g.stroke();
    }

    // The spheres. Passed: solid. The one you stand on breathes, six to the
    // minute, the resonance rate. Above you: rings.
    const breath = 0.5 - 0.5 * Math.cos((t / 10) * Math.PI * 2);
    GATE_SPHERES.forEach((name, i) => {
      const spheres = name === 'binah' ? ['binah', 'chokmah'] : [name];
      for (const sp of spheres) {
        const [x, y] = SPHERES[sp]!;
        const R = 4.4 * s;
        if (sp === 'daath') {
          g.strokeStyle = grey(0.5); g.lineWidth = Math.max(1, s * 0.4); g.setLineDash([2, 3]);
          g.beginPath(); g.arc(X(x), Y(y), R * 1.1, 0, 7); g.stroke(); g.setLineDash([]);
          continue;
        }
        if (i === reached) {
          const glow = g.createRadialGradient(X(x), Y(y), R * 0.6, X(x), Y(y), R * (2.4 + breath * 1.6));
          glow.addColorStop(0, `rgba(255,255,255,${0.35 + breath * 0.25})`); glow.addColorStop(1, 'rgba(255,255,255,0)');
          g.fillStyle = glow; g.beginPath(); g.arc(X(x), Y(y), R * 4.2, 0, 7); g.fill();
        }
        g.fillStyle = i < reached ? grey(0.78) : i === reached ? grey(1) : '#000';
        g.beginPath(); g.arc(X(x), Y(y), R, 0, 7); g.fill();
        if (i > reached) { g.strokeStyle = grey(0.42); g.lineWidth = Math.max(1, s * 0.5); g.stroke(); }
        if (i === at) {
          g.strokeStyle = grey(0.9); g.lineWidth = Math.max(1, s * 0.35); g.setLineDash([2, 3]);
          g.beginPath(); g.arc(X(x), Y(y), R * 1.7, 0, 7); g.stroke(); g.setLineDash([]);
        }
      }
    });

    // Yesod is the moon: it hangs over the tree's right shoulder, low.
    moonDisc(g, X(104), Y(6), 5.2 * s, 11);

    // He sits apart from it in the lower right, over the count of stillness,
    // eyes shut, and incense goes up beside him.
    if (him) {
      const size = Math.min(h * 0.22, w * 0.17), bx = w - size * 0.5, by = h - 42;
      g.drawImage(him, bx - size / 2, by - size * 0.98, size, size);
      const base = by - size * 0.06;
      const sx0 = bx - size * 0.52; g.fillStyle = grey(0.7); g.fillRect(sx0 - 3, base - 1, 6, Math.max(1, s * 0.5));
      g.strokeStyle = grey(0.6); g.lineWidth = Math.max(1, s * 0.25);
      g.beginPath(); g.moveTo(sx0, base); g.lineTo(sx0 + s * 0.8, base - 8 * s); g.stroke();
      g.strokeStyle = grey(0.42);
      g.beginPath();
      for (let k = 0; k <= 40; k++) {
        const u = k / 40, yy = base - 8 * s - u * 36 * s;
        const xx = sx0 + s * 0.8 + Math.sin(u * 9 - t * 0.9) * u * 3 * s;
        k ? g.lineTo(xx, yy) : g.moveTo(xx, yy);
      }
      g.stroke();
    }
  };
});

// The record as a night: every sit a star, across by day (today at the
// right), down by the hour it was kept, as large as it was long.
const drawRecord = (g: CanvasRenderingContext2D, w: number, h: number, t: number) => {
  const r = rand(3);
  starfield(g, w, h, Math.round((w * h) / 400), 23);
  const pad = 6;
  for (let k = 0; k < 26; k++) {
    const x = pad + ((182 - k * 7) / 182) * (w - pad * 2);
    g.fillStyle = 'rgb(40,40,40)';
    for (let y = 0; y < h; y += 3) g.fillRect(x, y, 1, 1);
  }
  for (const sit of sits) {
    const x = pad + ((181 - sit.day) / 181) * (w - pad * 2);
    const y = 4 + (sit.hour / 24) * (h - 8);
    const size = 0.5 + Math.sqrt(sit.minutes) * 0.28;
    const tw = 0.75 + 0.25 * Math.sin(t * 1.3 + r() * 40);
    const glow = g.createRadialGradient(x, y, 0, x, y, size * 2.2);
    glow.addColorStop(0, `rgba(255,255,255,${tw})`); glow.addColorStop(0.45, `rgba(255,255,255,${0.5 * tw})`); glow.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = glow; g.beginPath(); g.arc(x, y, size * 2.2, 0, 7); g.fill();
  }
};
const months = computed(() => {
  const out: { label: string; left: number }[] = [];
  const now = new Date();
  for (let d = 181; d >= 0; d--) {
    const day = new Date(now); day.setDate(now.getDate() - d);
    if (day.getDate() === 1) out.push({ label: day.toLocaleDateString('en-GB', { month: 'short' }).toLowerCase(), left: ((181 - d) / 181) * 100 });
  }
  return out;
});

// The overlay: a button over every gate, in the same box as the drawing.
const marks = GATE_SPHERES.map((name, i) => ({ i, name, at: SPHERES[name === 'binah' ? 'binah' : name]!, twin: name === 'binah' ? SPHERES.chokmah! : null }));
</script>

<template>
  <div class="vigil">
    <Frame class="tree" title="the ascent // ten gates up the tree, the abyss at da'ath" flush>
      <Plate :draw="drawTree" :active="active" animated :cell="2" label="The Tree of Life with the ten gates of the ascent. Kael'thos sits at its foot; the abyss turns at Da'ath." />
      <svg class="gates" :viewBox="`${VB.x} ${VB.y} ${VB.w} ${VB.h}`" preserveAspectRatio="xMidYMid meet">
        <g v-for="m in marks" :key="m.name" class="gate" :class="{ on: picked === m.i, past: m.i < reached, here: m.i === reached }" @click="picked = m.i">
          <circle :cx="m.at[0]" :cy="m.at[1]" r="6.5" />
          <circle v-if="m.twin" :cx="m.twin[0]" :cy="m.twin[1]" r="6.5" />
          <text :x="m.at[0] + (m.at[0] < 50 ? -8 : 8)" :y="m.at[1] + 1.2" :text-anchor="m.at[0] < 50 ? 'end' : 'start'">{{ GATES[m.i]!.n }} {{ GATES[m.i]!.sephira.split(' ')[0]!.toLowerCase() }}</text>
        </g>
      </svg>
      <div class="dist"><span class="pix">gate v of x // the sun</span><span class="tek">{{ duration(stats.minutes) }}</span><span class="pix">of stillness, kept apart from insight</span></div>
    </Frame>

    <div class="side">
      <h1 class="title">The Vigil</h1>
      <p class="note">Hours of work feed him. Stillness does not; it brings you nearer. Ten gates up the Tree, and between the lower and the upper the Abyss, where the physicists put the horizon and he has always been waiting.</p>

      <div class="teaching">
        <div class="head">
          <span class="glyph">{{ gate.planet }}</span>
          <span><span class="pix">gate {{ gate.n.toLowerCase() }} // {{ gate.sephira.toLowerCase() }}</span><b class="fell">{{ gate.title }}</b><span class="note">{{ gate.epithet }}</span></span>
        </div>
        <div class="work">
          <div v-for="p in gate.work" :key="p.name" class="practice"><span class="fell">{{ p.name }}</span><span class="pix">{{ p.setting }}</span></div>
        </div>
        <div class="signs">
          <div class="pix">the signs</div>
          <button v-for="s in gate.signs" :key="s" class="sign" :class="{ on: kept.has(s) }" @click="toggle(s)"><i></i>{{ s }}</button>
        </div>
        <p class="secret fell">{{ gate.secret }}</p>
        <p class="note shadow"><span class="pix">the shadow</span> {{ gate.shadow }}</p>
      </div>

      <div class="almanac">
        <div class="kv">
          <span>days still in a row</span><span>{{ stats.streak }}</span>
          <span>sits kept</span><span>{{ stats.count }}</span>
          <span>this week</span><span>{{ duration(stats.week) }}</span>
          <span>longest sit</span><span>{{ stats.longest }} min</span>
        </div>
      </div>
    </div>

    <Frame class="record" title="the night record // every sit a star, by the day and the hour" flush>
      <div class="sky">
        <Plate :draw="drawRecord" :active="active" animated :cell="2" label="Half a year of sits as stars: across by day, down by hour, larger the longer." />
        <div class="months" aria-hidden="true"><span v-for="m in months" :key="m.left" :style="{ left: `${m.left}%` }">{{ m.label }}</span></div>
      </div>
      <div class="by">
        <div v-for="p in stats.practices" :key="p.name" class="row">
          <span class="pix">{{ p.name }}</span>
          <span class="orb"><i :style="{ width: `${p.share * 100}%` }"></i></span>
          <span class="note">{{ duration(p.minutes) }}</span>
        </div>
      </div>
    </Frame>
  </div>
</template>

<style scoped>
.vigil { display: grid; gap: 18px; grid-template-columns: minmax(0, 1.7fr) minmax(300px, 1fr); grid-template-rows: minmax(0, 1fr) minmax(170px, .36fr);
  grid-template-areas: "tree side" "record side"; }
.tree { grid-area: tree; min-height: 0; }
.tree :deep(.flush) { overflow: hidden; }
.gates { position: absolute; inset: 0; width: 100%; height: 100%; }
.gate { cursor: pointer; }
.gate circle { fill: transparent; }
.gate text { font: 400 2.6px var(--pix); fill: var(--dim); text-transform: uppercase; letter-spacing: .05em; pointer-events: none; }
.gate.past text { fill: var(--phos); }
.gate.here text, .gate.on text { fill: var(--hi); }
.gate:hover text { fill: var(--hi); }
.dist { position: absolute; right: 14px; bottom: 12px; display: grid; gap: 2px; pointer-events: none; text-align: right; }
.dist .tek { font-size: 40px; }
.side { grid-area: side; display: grid; grid-template-rows: auto auto minmax(0, 1fr) auto; gap: 12px; min-height: 0; }
.teaching { min-height: 0; overflow: auto; display: grid; align-content: start; gap: 12px; padding-top: 12px; border-top: 3px dotted var(--low); scrollbar-width: thin; scrollbar-color: var(--low) transparent; }
.head { display: grid; grid-template-columns: auto 1fr; gap: 14px; align-items: center; }
.glyph { font: 400 34px/1 var(--fell); color: var(--hi); min-width: 1.6ch; text-align: center; border: 3px double var(--low); padding: 6px 8px; }
.head b { display: block; font-size: 24px; font-weight: 400; color: var(--hi); line-height: 1.1; }
.work { display: grid; gap: 6px; }
.practice { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; border-bottom: 3px dotted var(--faint); padding-bottom: 5px; }
.practice .fell { font-size: 17px; color: var(--phos); }
.practice .pix { text-align: right; }
.signs { display: grid; gap: 5px; }
.sign { display: flex; gap: 10px; align-items: center; text-align: left; color: var(--dim); font-size: 12.5px; }
.sign i { flex: none; width: 10px; height: 10px; border: 2px solid var(--low); }
.sign.on { color: var(--phos); }
.sign.on i { background: var(--phos); border-color: var(--phos); }
.sign:hover { color: var(--hi); }
.secret { margin: 0; font-size: 18px; font-style: italic; color: var(--hi); line-height: 1.35; }
.shadow { margin: 0; font-size: 12px; }
.shadow .pix { margin-right: 6px; }
.almanac { padding-top: 12px; border-top: 3px dotted var(--low); }
.almanac .kv { display: grid; grid-template-columns: 1fr auto; gap: 3px 12px; font-size: 14px; }
.almanac .kv span:nth-child(odd) { color: var(--dim); }
.record { grid-area: record; min-height: 0; }
.record :deep(.flush) { flex-direction: row; }
.sky { flex: 1; min-width: 0; display: flex; flex-direction: column; position: relative; }
.months { height: 16px; position: relative; border-top: 3px dotted var(--faint); }
.months span { position: absolute; top: 3px; font: 400 9px var(--pix); color: var(--dim); text-transform: uppercase; transform: translateX(-50%); }
.by { width: 260px; flex: none; padding: 10px 14px; display: grid; align-content: center; gap: 5px; border-left: 3px dotted var(--low); }
.by .row { display: grid; grid-template-columns: 96px 1fr 58px; gap: 10px; align-items: center; }
.by .note { font-size: 12px; text-align: right; }
.orb { height: 5px; background: radial-gradient(circle, var(--low) 1px, transparent 1.4px) 0 50% / 5px 5px repeat-x; }
.orb i { display: block; height: 5px; background: radial-gradient(circle, var(--phos) 1.4px, transparent 1.8px) 0 50% / 5px 5px repeat-x; }
@media (max-aspect-ratio: 5/4) { .vigil { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1.3fr) auto minmax(150px, .5fr); grid-template-areas: "tree" "side" "record"; } }
@media (max-width: 860px) { .vigil { display: flex; flex-direction: column; } .tree { min-height: 460px; } .record { min-height: 220px; } .record :deep(.flush) { flex-direction: column; } .by { width: auto; border-left: 0; border-top: 3px dotted var(--low); } }
</style>
