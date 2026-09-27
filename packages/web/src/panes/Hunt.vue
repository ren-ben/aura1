<script setup lang="ts">
// The Hunt: the body he borrows. The iron and the road, what to lift next,
// and the week's energy as it moves: spent by you, turned into work and
// heat, and a sliver of it, m = E / c^2, into him.
import { computed, ref, watch } from 'vue';
import Frame from '../components/Frame.vue';
import Plate from '../components/Plate.vue';
import Num from '../components/Num.vue';
import art from '../gl/art.json';
import { catSprite } from '../gl/plate';
import { hunt as act, state } from '../store';
import {
  along, BACK_MARKS, flow, ICONS, iconOf, freshness, FRONT_MARKS, hms, ironOf, nights, kg, ledger, mj, pace, rested, road, SOURCES, target, ago,
  type HuntExercise, type HuntSetRow, type Iron, type Mark, type Source,
} from '../hunt';
import { EFFICIENCY, FEELS, POSES as ALL_POSES, type Group, type Pose } from '@aura/shared';
import backUrl from '../assets/hunt/back.png';
import frontUrl from '../assets/hunt/front.png';

const props = defineProps<{ active: boolean }>();
const h = computed(() => state.hunt);
const now = ref(Date.now());
watch(() => props.active, (on) => { if (on) now.value = Date.now(); });

const irons = computed(() => h.value.exercises.filter((e) => !e.archived).map((e) => ironOf(h.value, e))
  .sort((a, b) => Number(b.ex.group === h.value.verdict.group) - Number(a.ex.group === h.value.verdict.group)
    || (a.lastAt ?? '').localeCompare(b.lastAt ?? '')));
const rest = computed(() => rested(h.value, now.value));
const book = computed(() => ledger(h.value, now.value));
const graph = computed(() => flow(book.value.week));
const roads = computed(() => road(h.value, 12, now.value));
const today = computed(() => h.value.days.at(-1) ?? null);
const runs = computed(() => [...h.value.activities].filter((a) => a.kind !== 'strength' && a.kind !== 'other').reverse().slice(0, 6));

const NAMES: Record<Source, string> = { run: 'the road', iron: 'the iron', stairs: 'the stairs', climb: 'the wall' };
const GREY: Record<Source, number> = { run: 0.95, iron: 0.72, stairs: 0.52, climb: 0.36 };
const GROUP_WORDS: Record<Group, string> = { push: 'push', pull: 'pull', arms: 'arms', core: 'core', legs: 'legs' };

// ---- The body ----------------------------------------------------------------
// Each photograph is levelled once: the near-black ground goes to black, so
// only he is dithered, and the mid-tones are opened up for the two inks.
function photo(url: string) {
  const img = document.createElement('canvas');
  const ready = ref(false);
  const src = new Image();
  src.onload = () => {
    img.width = src.naturalWidth; img.height = src.naturalHeight;
    const g = img.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(src, 0, 0);
    const px = g.getImageData(0, 0, img.width, img.height);
    const d = px.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = Math.max(0, Math.min(1, (d[i]! - 34) / 176)) ** 0.8 * 255;
      d[i] = d[i + 1] = d[i + 2] = v;
    }
    g.putImageData(px, 0, 0);
    ready.value = true;
  };
  src.src = url;
  return { img, ready };
}
const back = photo(backUrl), front = photo(frontUrl);
// The photograph in the plate's grey, lifted a little, a slow band of light
// passing over it like a lamp carried past an engraving.
const lit = (p: ReturnType<typeof photo>) => (g: CanvasRenderingContext2D, w: number, hh: number, t: number) => {
  if (!p.ready.value) return;
  g.drawImage(p.img, 0, 0, w, hh);
  const x = ((t * 0.045) % 1.6 - 0.3) * w;
  const band = g.createLinearGradient(x - w * 0.25, 0, x + w * 0.25, 0);
  band.addColorStop(0, 'rgba(255,255,255,0)'); band.addColorStop(0.5, 'rgba(255,255,255,0.16)'); band.addColorStop(1, 'rgba(255,255,255,0)');
  // Only where he is: the light falls on the body, not the dark around it.
  g.globalCompositeOperation = 'soft-light';
  g.fillStyle = band; g.fillRect(0, 0, w, hh);
  g.globalCompositeOperation = 'source-over';
};
const drawBack = lit(back), drawFront = lit(front);

// ---- The recovery -------------------------------------------------------------
// Fourteen nights under the photographs, as curves where the road is bars:
// the sleep score a soft hill of dither, readiness a lit line riding over it,
// both out of a hundred. A night with no measure breaks the curve.
const night = computed(() => nights(h.value, 14, now.value));
const lastNight = computed(() => [...night.value].reverse().find((n) => n.day)?.day ?? null);
type P = readonly [number, number];
// A smooth path through runs of points (Catmull-Rom as cubic Beziers).
function smooth(g: CanvasRenderingContext2D, pts: P[]) {
  g.moveTo(pts[0]![0], pts[0]![1]);
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i - 1] ?? pts[i]!, b = pts[i]!, c = pts[i + 1]!, d = pts[i + 2] ?? c;
    g.bezierCurveTo(b[0] + (c[0] - a[0]) / 6, b[1] + (c[1] - a[1]) / 6, c[0] - (d[0] - b[0]) / 6, c[1] - (d[1] - b[1]) / 6, c[0], c[1]);
  }
}
const stretches = (vals: (number | null | undefined)[], x: (i: number) => number, y: (v: number) => number) => {
  const out: P[][] = [];
  let cur: P[] = [];
  vals.forEach((v, i) => {
    if (v == null) { if (cur.length) out.push(cur); cur = []; return; }
    cur.push([x(i), y(v)]);
  });
  if (cur.length) out.push(cur);
  return out;
};
const drawRecovery = (g: CanvasRenderingContext2D, w: number, hh: number, t: number) => {
  const ns = night.value;
  const p = reveal(t);
  const top = 4, span = hh - 6, bottom = top + span;
  const x = (i: number) => (ns.length < 2 ? w / 2 : 3 + (i / (ns.length - 1)) * (w - 6));
  g.save();
  g.beginPath(); g.rect(0, 0, w * (0.02 + 0.98 * p), hh); g.clip();
  // The sleep: a filled hill, its crest a little brighter than its body.
  for (const r of stretches(ns.map((n) => n.day?.sleepScore), x, (v) => top + span * (1 - v / 100))) {
    if (r.length < 2) continue;
    g.beginPath(); smooth(g, r); g.lineTo(r.at(-1)![0], bottom); g.lineTo(r[0]![0], bottom); g.closePath();
    const fill = g.createLinearGradient(0, top, 0, bottom);
    fill.addColorStop(0, 'rgb(120,120,120)'); fill.addColorStop(1, 'rgb(40,40,40)');
    g.fillStyle = fill; g.fill();
    g.beginPath(); smooth(g, r); g.strokeStyle = 'rgb(170,170,170)'; g.lineWidth = 1; g.stroke();
  }
  // Readiness: the lit line, with a bead on each night that has one.
  g.strokeStyle = '#fff'; g.lineWidth = 1.8; g.fillStyle = '#fff';
  for (const r of stretches(ns.map((n) => n.day?.readiness), x, (v) => top + span * (1 - v / 100))) {
    if (r.length > 1) { g.beginPath(); smooth(g, r); g.stroke(); }
    for (const [px, py] of r) g.fillRect(px - 1.5, py - 1.5, 3, 3);
  }
  g.restore();
};
const hrvMark = (s: string | null | undefined) => (s === 'balanced' ? 'on' : s === 'unbalanced' ? 'half' : s ? 'low' : '');
const glow = (m: Mark) => freshness(rest.value[m.group]);

// ---- The transformation -------------------------------------------------------
let opened = -1;
watch(() => props.active, (on) => { if (on) opened = -1; });
// Grows in from the left the first time the pane is looked at, then flows.
function reveal(t: number) {
  if (opened < 0) opened = t;
  const u = Math.min(1, (t - opened) / 1.6);
  return 1 - Math.pow(1 - u, 3);
}
const drawFlow = (g: CanvasRenderingContext2D, w: number, hh: number, t: number) => {
  const f = graph.value;
  if (!f.total) return;
  const p = reveal(t);
  g.save();
  g.beginPath(); g.rect(0, 0, w * (0.02 + p * 0.98), hh); g.clip();
  const X = (x: number) => x * w, Y = (y: number) => y * hh;
  for (const b of f.bands) {
    const mx = (b.from[0] + b.to[0]) / 2;
    g.beginPath();
    g.moveTo(X(b.from[0]), Y(b.from[1]));
    g.bezierCurveTo(X(mx), Y(b.from[1]), X(mx), Y(b.to[1]), X(b.to[0]), Y(b.to[1]));
    g.lineTo(X(b.to[0]), Y(b.to[2]));
    g.bezierCurveTo(X(mx), Y(b.to[2]), X(mx), Y(b.from[2]), X(b.from[0]), Y(b.from[2]));
    g.closePath();
    const v = b.kind === 'work' ? 0.36 : b.kind === 'heat' ? 0.17 : 0.6;
    g.fillStyle = `rgb(${v * 255},${v * 255},${v * 255})`;
    g.fill();
  }
  for (const n of f.nodes) {
    const v = n.id === 'him' ? 1 : 0.92;
    g.fillStyle = `rgb(${v * 255},${v * 255},${v * 255})`;
    g.fillRect(X(n.x) - (n.id === 'him' ? 5 : 3), Y(n.y0), n.id === 'him' ? 10 : 6, Math.max(2, Y(n.y1) - Y(n.y0)));
  }
  // Energy on the move. Work runs straight; heat shivers, as heat does.
  g.fillStyle = '#fff';
  f.bands.forEach((b, k) => {
    const count = b.kind === 'him' ? 5 : Math.max(3, Math.round((b.kj / f.total) * 120));
    const speed = b.kind === 'him' ? 0.05 : b.kind === 'work' ? 0.16 : 0.1;
    for (let i = 0; i < count; i++) {
      const u = (t * speed + i / count + k * 0.137) % 1;
      if (u > p) continue;
      const lane = Math.sin(i * 12.9898 + k) * 0.8;
      const jitter = b.kind === 'heat' ? Math.sin(t * 9 + i * 3.1) * 0.25 : 0;
      const [x, y] = along(b, u, Math.max(-0.95, Math.min(0.95, lane + jitter)));
      const s = b.kind === 'him' ? 2 : 1.6;
      g.fillRect(X(x) - s / 2, Y(y) - s / 2, s, s);
    }
  });
  // Him: a star that brightens as the thread reaches it.
  const star = 3 + Math.sin(t * 2) * 1.2;
  g.fillRect(X(0.93) - star / 2, Y(0.481) - star / 2, star, star);
  g.restore();
};
const labels = computed(() => graph.value.nodes.map((n) => ({
  id: n.id, x: n.x, y: (n.y0 + n.y1) / 2,
  name: n.id === 'work' ? 'work' : n.id === 'heat' ? 'heat' : n.id === 'him' ? 'into him' : NAMES[n.id as Source],
  value: n.id === 'him' ? `${Math.round(massOf(n.kj))} ng` : mj(n.kj),
  icon: (ICONS as Record<string, string>)[n.id] ?? '',
})));
// A week's energy is a few nanograms of mass; all of it, micrograms.
const massOf = (kj: number) => (kj * 1000) / (299_792_458 ** 2) * 1e12;

// The week by day: each source stacked, a grey of its own.
const drawDays = (g: CanvasRenderingContext2D, w: number, hh: number, t: number) => {
  const days = book.value.days;
  const top = Math.max(1, ...days.map((d) => SOURCES.reduce((s, k) => s + d.by[k], 0)));
  const p = reveal(t);
  const slot = w / days.length, bar = slot * 0.46;
  days.forEach((d, i) => {
    let y = hh;
    for (const k of SOURCES) {
      const v = (d.by[k] / top) * (hh - 4) * p;
      if (v <= 0) continue;
      g.fillStyle = `rgb(${GREY[k] * 255},${GREY[k] * 255},${GREY[k] * 255})`;
      g.fillRect(i * slot + (slot - bar) / 2, y - v, bar, v);
      y -= v + 1;
    }
  });
};
const dayNames = computed(() => book.value.days.map((d) => new Date(`${d.date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short' }).slice(0, 2)));

// ---- The road -------------------------------------------------------------------
const drawRoad = (g: CanvasRenderingContext2D, w: number, hh: number, t: number) => {
  const km = roads.value.km;
  const top = Math.max(10, ...km);
  const p = reveal(t);
  const slot = w / km.length;
  km.forEach((v, i) => {
    const bh = (v / top) * (hh - 6) * p;
    const last = i === km.length - 1;
    g.fillStyle = last ? '#fff' : 'rgb(170,170,170)';
    g.fillRect(i * slot + slot * 0.2, hh - bh, slot * 0.6, bh);
  });
};

// ---- An exercise, opened ----------------------------------------------------------
const open = ref<Iron | null>(null);
const openId = ref(0);
watch(() => state.hunt, () => { if (openId.value) open.value = irons.value.find((i) => i.ex.id === openId.value) ?? open.value; });
function show(i: Iron) { open.value = i; openId.value = i.ex.id; resetByHand(i); }
function close() { open.value = null; openId.value = 0; }

const pose = ref<HTMLCanvasElement | null>(null);
const sprites = new Map<Pose, Promise<HTMLCanvasElement>>();
const sprite = (key: Pose) => {
  const src = (art as Record<string, string>)[`hunt-${key}`];
  if (!src) return null;
  if (!sprites.has(key)) sprites.set(key, catSprite(src, 360));
  return sprites.get(key)!;
};

// Him, beside his word for the day, already doing it.
const VERDICT_POSE: Record<string, Pose> = { RUN: 'jog', STAIRS: 'stairs', REST: 'rest' };
const GROUP_POSE: Record<Group, Pose> = { push: 'bench', pull: 'pullup', arms: 'preacher', core: 'core', legs: 'deadlift' };
const doing = ref<HTMLCanvasElement | null>(null);
watch(() => [h.value.verdict.word, h.value.verdict.group] as const, async ([word, group]) => {
  const key = word === 'IRON' ? GROUP_POSE[group ?? 'push'] : VERDICT_POSE[word] ?? 'jog';
  doing.value = await sprite(key);
}, { immediate: true });
const drawDoing = (g: CanvasRenderingContext2D, w: number, hh: number, t: number) => {
  const c = doing.value;
  if (!c) return;
  // Whole, standing on the foot of his corner.
  const s = Math.min(w, hh);
  g.drawImage(c, w / 2 - s / 2, hh - s + Math.sin(t * 1.6) * s * 0.008, s, s);
};
watch(open, async (i) => {
  pose.value = null;
  if (!i) return;
  pose.value = await sprite(i.ex.pose);
});
const drawPose = (g: CanvasRenderingContext2D, w: number, hh: number, t: number) => {
  const c = pose.value;
  if (!c) return;
  // The whole scene, machine and all, fitted to the panel.
  const s = Math.min(w, hh) * 0.98;
  g.drawImage(c, w / 2 - s / 2, (hh - s) / 2 + Math.sin(t * 1.4) * s * 0.006, s, s);
};

// The visits, newest first, each set editable.
const visits = computed(() => {
  const i = open.value;
  if (!i) return [];
  const out: { date: string; sets: HuntSetRow[] }[] = [];
  for (const s of [...i.sets].reverse()) {
    const d = s.at.slice(0, 10);
    const v = out.find((x) => x.date === d);
    if (v) v.sets.unshift(s); else out.push({ date: d, sets: [s] });
  }
  return out.slice(0, 8);
});
const feelOf = (date: string) => h.value.feels.find((f) => f.exerciseId === open.value?.ex.id && f.date === date)?.feel ?? null;
const MOVES = { new: 'the first time: find your feet', up: 'the top of the range was reached: one step up', hold: 'the same load, one more rep', down: 'twice under the range: one step down, then climb again' };

// The e1RM line, crisp, over its visits.
const chart = computed(() => {
  const s = open.value?.series ?? [];
  if (s.length < 2) return null;
  const lo = Math.min(...s.map((x) => x.e1rm)) * 0.97, hi = Math.max(...s.map((x) => x.e1rm)) * 1.02;
  const pts = s.map((x, k) => [(k / (s.length - 1)) * 100, 38 - ((x.e1rm - lo) / Math.max(0.01, hi - lo)) * 34] as const);
  return { line: pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' '), pts, lo, hi };
});
const spark = (i: Iron) => {
  const s = i.series.slice(-12);
  if (s.length < 2) return '';
  const lo = Math.min(...s.map((x) => x.e1rm)), hi = Math.max(...s.map((x) => x.e1rm));
  return s.map((x, k) => `${((k / (s.length - 1)) * 60).toFixed(1)},${(14 - ((x.e1rm - lo) / Math.max(0.01, hi - lo)) * 12).toFixed(1)}`).join(' ');
};
const since = (at: string | null) => (at ? ago((now.value - Date.parse(at)) / 3_600_000) : 'never yet');

// A visit written in by hand: the prescription, changed where it went otherwise.
const byHand = ref<{ at: string; rows: { load: number; reps: number }[] }>({ at: '', rows: [] });
const localNow = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
function resetByHand(i: Iron) { byHand.value = { at: localNow(), rows: i.p.sets.map((x) => ({ ...x })) }; }
const writing = ref(false);
async function keepByHand() {
  const i = open.value;
  if (!i || !byHand.value.at) return;
  writing.value = true;
  const start = new Date(byHand.value.at).getTime();
  await act.addSets(byHand.value.rows.map((r, idx) => ({
    uuid: crypto.randomUUID(), exerciseId: i.ex.id, at: new Date(start + idx * i.ex.rest * 1000).toISOString(), idx, load: Number(r.load), reps: Number(r.reps),
  })));
  writing.value = false;
}
const settings = ref(false);
const draft = ref<Partial<HuntExercise>>({});
watch(settings, (on) => { if (on && open.value) draft.value = { ...open.value.ex }; });
async function saveSettings() {
  const i = open.value;
  if (!i) return;
  const { sets, repLo, repHi, step, rest: r, start } = draft.value;
  await act.editExercise(i.ex, { sets, repLo, repHi, step, rest: r, start });
  settings.value = false;
}
async function retire() { if (open.value) { await act.editExercise(open.value.ex, { archived: true }); close(); } }

// A new movement.
// A new movement borrows the scene of the one it is most like.
const POSES = ALL_POSES.filter((x) => x !== 'jog' && x !== 'stairs' && x !== 'rest');
const adding = ref(false);
const fresh = ref({ name: '', group: 'push' as Group, pose: 'chestpress' as Pose, kind: 'machine' as HuntExercise['kind'], start: 40, repLo: 8, repHi: 12, step: 2.5, sets: 3 });
async function addMovement() {
  const f = fresh.value;
  if (!f.name.trim()) return;
  const ok = await act.addExercise({ ...f, name: f.name.trim().slice(0, 15), bwShare: f.kind === 'weighted' || f.kind === 'bodyweight' ? 1 : 0, path: 0.45, rest: f.sets >= 4 ? 180 : 120 });
  if (ok) { adding.value = false; fresh.value.name = ''; }
}

// The nights are shown on asking: hidden, the two prints sit centred as one;
// shown, they rise together and the nights come up beneath them. Kept per
// browser, as a view is.
const NIGHTS_KEY = 'aura.hunt.nights';
const showNights = ref((() => { try { return localStorage.getItem(NIGHTS_KEY) === '1'; } catch { return false; } })());
watch(showNights, (on) => { try { localStorage.setItem(NIGHTS_KEY, on ? '1' : '0'); } catch { /* private window */ } });
const weight = ref(state.hunt.bodyweight);
watch(() => state.hunt.bodyweight, (v) => { weight.value = v; });
const pulling = ref(false);
async function pull() { pulling.value = true; await act.refresh(); setTimeout(() => { pulling.value = false; }, 1500); }
const synced = computed(() => (h.value.garminSyncedAt ? ago((now.value - Date.parse(h.value.garminSyncedAt)) / 3_600_000) : 'never'));
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
</script>

<template>
  <div class="hunt">
    <!-- The body he borrows -->
    <Frame class="vessel" title="the vessel he borrows // each part lit by how fresh it is" flush>
      <div class="bodies" :class="{ nights: showNights }">
        <div class="prints">
        <figure class="photo backp">
          <Plate :draw="drawBack" :active="active" animated :cell="1" label="Your back, dithered in the console's two inks" />
          <svg class="marks" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <g v-for="m in BACK_MARKS" :key="m.group" class="mark" :style="{ '--glow': glow(m) }">
              <circle :cx="m.x * 100" :cy="m.y * 100" r="1.6" vector-effect="non-scaling-stroke" />
              <circle class="ring" :cx="m.x * 100" :cy="m.y * 100" r="3" vector-effect="non-scaling-stroke" />
            </g>
          </svg>
          <span v-for="m in BACK_MARKS" :key="m.group" class="tag" :class="m.side" :style="{ left: `${m.x * 100}%`, top: `${m.y * 100}%`, '--glow': glow(m) }">
            <b>{{ GROUP_WORDS[m.group] }}</b><i>{{ ago(rest[m.group]) }}</i>
          </span>
        </figure>
        <figure class="photo frontp">
          <Plate :draw="drawFront" :active="active" animated :cell="1" label="Your front, dithered in the console's two inks" />
          <svg class="marks" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <g v-for="m in FRONT_MARKS" :key="m.group" class="mark" :style="{ '--glow': glow(m) }">
              <circle :cx="m.x * 100" :cy="m.y * 100" r="1.6" vector-effect="non-scaling-stroke" />
              <circle class="ring" :cx="m.x * 100" :cy="m.y * 100" r="3" vector-effect="non-scaling-stroke" />
            </g>
          </svg>
          <span v-for="m in FRONT_MARKS" :key="m.group" class="tag" :class="m.side" :style="{ left: `${m.x * 100}%`, top: `${m.y * 100}%`, '--glow': glow(m) }">
            <b>{{ GROUP_WORDS[m.group] }}</b><i>{{ ago(rest[m.group]) }}</i>
          </span>
        </figure>
        </div>
        <Transition name="nights">
        <div v-if="showNights" class="recovery">
          <div class="rhead"><span class="pix">recovery // 14 nights</span>
            <span class="rkey"><i class="bar"></i>sleep<i class="line"></i>readiness</span></div>
          <div class="rchart"><Plate :draw="drawRecovery" :active="active" animated :cell="1" label="Sleep score as bars and readiness as a line, the last fourteen nights" /></div>
          <div class="hrv" aria-label="HRV status each night"><i v-for="n in night" :key="n.date" :class="hrvMark(n.day?.hrvStatus)" :title="`${n.date}: ${n.day?.hrvStatus ?? 'no measure'}`"></i></div>
          <div class="rnow">
            <span><b class="tek">{{ lastNight?.sleepScore ?? '-' }}</b><i class="pix">slept</i></span>
            <span><b class="tek">{{ lastNight?.readiness ?? '-' }}</b><i class="pix">ready</i></span>
            <span><b class="tek">{{ lastNight?.restingHr ?? '-' }}</b><i class="pix">resting bpm</i></span>
            <span><b class="tek">{{ lastNight?.bodyBattery ?? '-' }}</b><i class="pix">battery</i></span>
          </div>
        </div>
        </Transition>
      </div>
      <div class="legs"><span class="pix">legs</span><span class="note">carried by the road and the stairs, last {{ ago(rest.legs) }}</span>
        <button class="x nightsbtn" :class="{ on: showNights }" :aria-pressed="showNights" @click="showNights = !showNights"><i></i>nights</button>
        <span class="pix weight">vessel <input v-model.number="weight" type="number" min="30" max="200" step="0.1" aria-label="bodyweight in kilograms" @change="act.bodyweight(weight)"> kg</span></div>
    </Frame>

    <!-- The transformation -->
    <Frame class="change" title="the transformation // the week's energy, spent, turned to work and heat, a sliver into him" flush>
      <div class="flow">
        <p v-if="!graph.total" class="none note">Nothing spent this week yet. The road, the iron and the stairs all flow in here once Garmin has them.</p>
        <Plate :draw="drawFlow" :active="active" animated :cell="2" label="The week's energy flowing from each kind of training into work and heat, and a thread into him" />
        <span v-for="l in labels" :key="l.id" class="node" :class="{ left: l.x < 0.3, him: l.id === 'him' }" :style="{ left: `${l.x * 100}%`, top: `${l.y * 100}%` }">
          <b class="pix"><svg v-if="l.icon" class="ic" viewBox="0 0 16 16" aria-hidden="true"><path :d="l.icon" /></svg>{{ l.name }}</b><span>{{ l.value }}</span>
        </span>
      </div>
      <div class="ledgerrow">
        <div class="counters">
          <div><span class="pix">spent, this week</span><span class="tek"><Num :value="Math.round(SOURCES.reduce((s, k) => s + book.week[k], 0) / 100)" :format="(n) => (n / 10).toFixed(1)" /></span><span class="pix">MJ</span></div>
          <div><span class="pix">work on the iron</span><span class="tek"><Num :value="Math.round(book.workWeek)" /></span><span class="pix">kJ</span></div>
          <div><span class="pix">taken, all time</span><span class="tek"><Num :value="Math.round(book.mass * 1000)" :format="(n) => (n / 1000).toFixed(3)" /></span><span class="pix unit">micrograms</span></div>
        </div>
        <div class="days">
          <Plate :draw="drawDays" :active="active" animated :cell="2" label="The week's energy by day" />
          <div class="dn"><span v-for="(d, i) in dayNames" :key="i">{{ d }}</span></div>
        </div>
        <div class="key"><span v-for="k in SOURCES" :key="k" :style="{ '--g': GREY[k] }"><i></i><svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path :d="ICONS[k]" /></svg>{{ NAMES[k] }}</span>
          <span class="note">{{ Math.round(EFFICIENCY * 100) }}% becomes work, the rest heat</span></div>
      </div>
    </Frame>

    <!-- The verdict and the iron -->
    <div class="side">
      <div class="head"><h1 class="title">The Hunt</h1></div>
      <p class="motto fell">Mens agitat molem.</p>
      <div class="verdict" :class="{ soft: h.verdict.soft }">
        <div class="doing" aria-hidden="true"><Plate :draw="drawDoing" :active="active" animated :cell="1" /></div>
        <span class="pix">{{ h.verdict.when }}, he says</span>
        <span class="word tek">{{ h.verdict.word }}<small v-if="h.verdict.group"> {{ h.verdict.group }}</small><small v-else-if="h.verdict.long"> long</small></span>
        <p class="fell">{{ h.verdict.line }}</p>
        <div class="ready">
          <span><i class="pix">ready</i>{{ today?.readiness ?? '-' }}</span>
          <span><i class="pix">hrv</i>{{ today?.hrvStatus ?? '-' }}</span>
          <span><i class="pix">sleep</i>{{ today?.sleepScore ?? '-' }}</span>
          <span><i class="pix">battery</i>{{ today?.bodyBattery ?? '-' }}</span>
        </div>
      </div>
      <Frame class="iron" :title="`the iron // what to lift next, ${irons.length} movements`" scroll>
        <button v-for="(i, n) in irons" :key="i.ex.id" class="lift" :class="{ due: i.ex.group === h.verdict.group }" :style="{ '--i': n }" @click="show(i)">
          <span class="nm fell">{{ i.ex.name }}<em v-if="i.pr" class="pr pix">pr</em></span>
          <svg class="spark" viewBox="0 0 60 16" aria-hidden="true"><polyline v-if="spark(i)" :points="spark(i)" /></svg>
          <span class="rx pix">{{ i.p.sets.map((x) => target(i.ex, x)).join(' / ') }}</span>
          <span class="when note">{{ since(i.lastAt) }}</span>
        </button>
        <button v-if="!adding" class="x more" @click="adding = true">+ a new movement</button>
        <form v-else class="newmove" @submit.prevent="addMovement">
          <input v-model="fresh.name" class="field" maxlength="15" placeholder="name, 15 letters" aria-label="name">
          <select v-model="fresh.group" class="field" aria-label="group"><option v-for="g in ['push', 'pull', 'arms', 'core', 'legs']" :key="g">{{ g }}</option></select>
          <select v-model="fresh.kind" class="field" aria-label="kind"><option v-for="k in ['barbell', 'machine', 'cable', 'dumbbell', 'bodyweight', 'weighted']" :key="k">{{ k }}</option></select>
          <select v-model="fresh.pose" class="field" aria-label="pose"><option v-for="p in POSES" :key="p">{{ p }}</option></select>
          <label class="lab"><span>start kg</span><input v-model.number="fresh.start" class="field" type="number" min="0" step="0.5"></label>
          <label class="lab"><span>reps</span><span class="pair"><input v-model.number="fresh.repLo" class="field" type="number" min="1"><input v-model.number="fresh.repHi" class="field" type="number" min="1"></span></label>
          <label class="lab"><span>step</span><input v-model.number="fresh.step" class="field" type="number" min="0" step="0.5"></label>
          <label class="lab"><span>sets</span><input v-model.number="fresh.sets" class="field" type="number" min="1" max="8"></label>
          <span class="row"><button type="button" class="btn quiet" @click="adding = false">leave it</button><button class="btn">add it</button></span>
        </form>
      </Frame>
    </div>

    <!-- The road -->
    <Frame class="distance" :title="`the road // from the watch, synced ${synced}`" flush>
      <template #bar><button class="x" :class="{ busy: pulling }" @click="pull">{{ pulling ? 'asking garmin' : 'pull now' }}</button></template>
      <div class="roadrow">
        <div class="weeks">
          <Plate :draw="drawRoad" :active="active" animated :cell="2" label="Kilometres run each of the last twelve weeks" />
          <div class="wk"><span><b class="tek">{{ Math.round(roads.km.at(-1) ?? 0) }}</b><i class="pix">km this week</i></span><span><b class="tek">{{ Math.round(roads.z2 * 100) }}%</b><i class="pix">in zone two, a month</i></span></div>
        </div>
        <div class="runs">
          <p v-if="!runs.length" class="empty">Nothing from Garmin yet. Log in once on the server and it arrives on its own.</p>
          <div v-for="a in runs" :key="a.id" class="run">
            <svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path :d="iconOf(a.kind)" /></svg>
            <span class="pix">{{ new Date(a.startedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) }}</span>
            <span class="fell">{{ a.kind === 'run' ? `${(a.meters / 1000).toFixed(1)} km` : a.kind === 'stairs' ? (a.ascent ? `${Math.round(a.ascent / 3)} floors` : 'the stairs') : a.name }}</span>
            <span class="note">{{ hms(a.seconds) }}</span>
            <span class="note">{{ a.kind === 'run' ? pace(a) : '' }}</span>
            <span class="note">{{ a.hrAvg ? `${a.hrAvg} bpm` : '' }}</span>
          </div>
        </div>
      </div>
    </Frame>

    <!-- An exercise, opened: over everything, so on the body, not in the plane. -->
    <Teleport to="body"><Transition name="sheet">
      <div v-if="open" class="sheet" @click.self="close">
        <div class="box">
          <div class="pose"><Plate :draw="drawPose" :active="active && !!open" animated :cell="1" :label="`Kael'thos at the ${open.ex.name}`" /></div>
          <div class="main">
            <div class="top">
              <span class="pix">{{ open.ex.group }} // {{ open.ex.kind }} // {{ open.ex.sets }} sets, {{ open.ex.repLo }} to {{ open.ex.repHi }}</span>
              <button class="x" @click="close">close</button>
            </div>
            <h2 class="fell">{{ open.ex.name }}</h2>
            <div class="next">
              <span v-for="(x, k) in open.p.sets" :key="k" class="set"><i class="pix">{{ k ? `back-off ${k}` : 'top set' }}</i><b class="tek">{{ target(open.ex, x) }}</b></span>
            </div>
            <p class="note move">{{ MOVES[open.p.move] }}{{ open.best ? ` // best e1rm ${kg(open.best)}${open.ex.kind === 'bodyweight' ? ' reps' : ' kg'}` : '' }}</p>
            <svg v-if="chart" class="chart" viewBox="0 0 100 40" preserveAspectRatio="none" aria-label="e1RM over the visits">
              <polyline :points="chart.line" vector-effect="non-scaling-stroke" />
              <circle v-for="(p, k) in chart.pts" :key="k" :cx="p[0]" :cy="p[1]" r="0.9" />
            </svg>

            <div class="visits">
              <div v-for="v in visits" :key="v.date" class="visit">
                <span class="pix">{{ fmtDate(`${v.date}T12:00:00`) }}</span>
                <span class="setrow">
                  <span v-for="s in v.sets" :key="s.uuid" class="cell">
                    <input v-if="open.ex.kind !== 'bodyweight'" :value="s.load" type="number" step="0.5" aria-label="kg" @change="act.editSet(s, { load: Number(($event.target as HTMLInputElement).value) })">
                    <span v-if="open.ex.kind !== 'bodyweight'" class="by">x</span>
                    <input :value="s.reps" type="number" aria-label="reps" @change="act.editSet(s, { reps: Number(($event.target as HTMLInputElement).value) })">
                    <button class="x" aria-label="remove this set" @click="act.removeSet(s)">x</button>
                  </span>
                </span>
                <button class="feel" :class="{ on: feelOf(v.date) }" :title="'how it felt; click to change'"
                        @click="act.feel(open.ex.id, v.date, FEELS[(FEELS.indexOf(feelOf(v.date) ?? 'grind') + 1) % 3]!)">{{ feelOf(v.date) ?? 'how was it' }}</button>
              </div>
              <p v-if="!visits.length" class="empty">Never hunted yet. Start it on the vessel, or write a visit in below.</p>
            </div>

            <form class="byhand" @submit.prevent="keepByHand">
              <span class="pix">a visit away from the vessel</span>
              <span class="row">
                <input v-model="byHand.at" class="field when" type="datetime-local" aria-label="when">
                <span v-for="(r, k) in byHand.rows" :key="k" class="cell">
                  <input v-if="open.ex.kind !== 'bodyweight'" v-model.number="r.load" type="number" step="0.5" aria-label="kg"><span v-if="open.ex.kind !== 'bodyweight'" class="by">x</span><input v-model.number="r.reps" type="number" aria-label="reps">
                </span>
                <button class="btn" :disabled="writing">{{ writing ? 'keeping' : 'keep it' }}</button>
              </span>
            </form>

            <div class="tune">
              <button class="x" @click="settings = !settings">{{ settings ? 'never mind' : 'tune it' }}</button>
              <button class="x" @click="retire">retire it</button>
            </div>
            <form v-if="settings" class="tuning" @submit.prevent="saveSettings">
              <label class="lab"><span>sets</span><input v-model.number="draft.sets" class="field" type="number" min="1" max="8"></label>
              <label class="lab"><span>reps from</span><input v-model.number="draft.repLo" class="field" type="number" min="1"></label>
              <label class="lab"><span>to</span><input v-model.number="draft.repHi" class="field" type="number" min="1"></label>
              <label class="lab"><span>step kg</span><input v-model.number="draft.step" class="field" type="number" min="0" step="0.5"></label>
              <label class="lab"><span>rest s</span><input v-model.number="draft.rest" class="field" type="number" min="0" step="15"></label>
              <label class="lab"><span>start kg</span><input v-model.number="draft.start" class="field" type="number" min="0" step="0.5"></label>
              <button class="btn">keep</button>
            </form>
            <p v-if="state.error" class="note err">{{ state.error }}</p>
          </div>
        </div>
      </div>
    </Transition></Teleport>
  </div>
</template>

<style scoped>
.hunt { display: grid; gap: 18px; grid-template-columns: minmax(0, .9fr) minmax(0, 1.25fr) minmax(310px, .82fr);
  grid-template-rows: minmax(0, 1fr) minmax(190px, .42fr); grid-template-areas: "vessel change side" "vessel distance side"; min-height: 0; }

/* The vessel */
.vessel { grid-area: vessel; min-height: 0; }
.vessel :deep(.flush) { overflow: hidden; }
.bodies { flex: 1; min-height: 0; position: relative; container-type: size; }
/* The back is the plate; the front is pinned over its lower corner like a
   second print laid on the first, high enough to cover the hands behind the
   back. Both keep their true proportions, and the shoulders and lats always
   show above it. */
.photo { position: absolute; margin: 0; display: flex; flex-direction: column; --bh: min(94cqh, 138cqw); }
.backp { top: 3cqh; right: 4cqw; height: var(--bh); width: calc(var(--bh) * 388 / 640); }
.frontp { left: 4cqw; bottom: 20cqh; width: min(70cqw, calc((94cqh - var(--bh) * .62) * 537 / 460)); aspect-ratio: 537 / 460;
  border: 3px double var(--low); background: var(--ground); }
/* Under the prints, the nights: how the vessel is recovering. */
.recovery { position: absolute; left: 4cqw; right: 3cqw; bottom: 2cqh; height: 16cqh; min-height: 96px; display: grid;
  grid-template-columns: minmax(0, 1fr) auto; grid-template-rows: auto minmax(0, 1fr) auto; gap: 3px 14px; }
.rhead { grid-column: 1; display: flex; justify-content: space-between; align-items: baseline; gap: 10px; white-space: nowrap; }
.rkey { display: flex; gap: 6px; align-items: center; font: 400 9px var(--pix); color: var(--dim); text-transform: uppercase; }
.rkey .bar { width: 12px; height: 8px; background: linear-gradient(#787878, #282828); border-top: 1px solid #aaa; }
.rkey .line { width: 12px; height: 2px; background: var(--hi); margin-left: 6px; }
.rchart { grid-column: 1; display: flex; flex-direction: column; min-height: 0; border-bottom: 1px solid var(--low); }
.hrv { grid-column: 1; display: grid; grid-template-columns: repeat(14, 1fr); justify-items: center; }
.hrv i { width: 6px; height: 6px; border: 1px solid var(--low); }
.hrv i.on { background: var(--phos); border-color: var(--phos); }
.hrv i.half { background: linear-gradient(to top, var(--phos) 50%, transparent 50%); border-color: var(--phos); }
.hrv i.low { border-color: var(--hi); }
.rnow { grid-column: 2; grid-row: 1 / -1; display: grid; grid-template-columns: auto auto; gap: 4px 14px; align-content: center; }
.rnow span { display: grid; }
.rnow .tek { font-size: 22px; }
.rnow i { font-style: normal; font-size: 8.5px; }
.marks { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
.mark circle { fill: rgba(230, 224, 212, calc(.25 + var(--glow) * .75)); stroke: none; }
.mark .ring { fill: none; stroke: rgba(230, 224, 212, calc(.15 + var(--glow) * .7)); stroke-width: 1.5; transform-box: fill-box; transform-origin: center;
  animation: breathe calc(4.2s - var(--glow) * 2.2s) var(--out) infinite; }
@keyframes breathe { 0% { transform: scale(.6); opacity: 1; } 100% { transform: scale(2.4); opacity: 0; } }
/* The tags: crisp, on their own ground, never over the dither. */
.tag { position: absolute; transform: translate(12px, -50%); display: grid; gap: 1px; padding: 4px 7px; background: rgba(18, 18, 18, .9);
  border: 1px solid rgba(197, 188, 171, calc(.2 + var(--glow) * .7)); white-space: nowrap; pointer-events: none; }
.tag.l { transform: translate(calc(-100% - 12px), -50%); }
.tag b { font: 400 10px var(--pix); text-transform: uppercase; color: rgba(230, 224, 212, calc(.45 + var(--glow) * .55)); }
.tag i { font: italic 400 12px var(--fell); color: var(--dim); }
.legs { display: flex; gap: 10px; align-items: baseline; padding: 10px 14px; border-top: 3px dotted var(--low); flex-wrap: wrap; }
.legs .nightsbtn { margin-left: auto; display: flex; gap: 6px; align-items: center; text-transform: uppercase; }
.nightsbtn i { width: 9px; height: 9px; border: 2px solid var(--low); transition: background .25s var(--out), border-color .25s var(--out); }
.nightsbtn.on { color: var(--phos); }
.nightsbtn.on i { background: var(--phos); border-color: var(--phos); }
.legs .weight { display: flex; gap: 6px; align-items: center; }
/* The two prints move as one: centred in the frame while the nights are
   away (their stack runs from 3 to 80 of the frame's height), back up where
   they were when the nights come in. */
.prints { position: absolute; inset: 0; transform: translateY(8.5cqh); transition: transform .7s var(--out); }
.bodies.nights .prints { transform: translateY(0); }
.nights-enter-active { transition: opacity .5s var(--out) .15s, transform .6s var(--out) .15s; }
.nights-leave-active { transition: opacity .25s var(--ease), transform .3s var(--ease); }
.nights-enter-from, .nights-leave-to { opacity: 0; transform: translateY(12px); }
.legs input { width: 64px; background: var(--deep); border: 2px solid var(--low); color: var(--hi); padding: 2px 6px; font: 400 12px var(--mono); }

/* The transformation */
.change { grid-area: change; min-height: 0; }
.change :deep(.flush) { overflow: hidden; }
.flow { position: relative; flex: 1; min-height: 0; display: flex; flex-direction: column; }
.none { position: absolute; inset: 0; display: grid; place-items: center; margin: 0; text-align: center; padding: 0 30px; font: italic 400 16px var(--fell); z-index: 1; }
.node { position: absolute; transform: translate(14px, -50%); display: grid; gap: 0; padding: 3px 7px; background: rgba(18, 18, 18, .88); pointer-events: none;
  animation: nodein .9s var(--out) both; }
.node.left { transform: translate(14px, -50%); }
.node:not(.left) { transform: translate(-50%, calc(-100% - 10px)); text-align: center; }
.node.him { transform: translate(-100%, -50%); left: auto; text-align: right; }
.node b { color: var(--phos); font-size: 9.5px; display: flex; gap: 5px; align-items: center; }
.node .ic { width: 11px; height: 11px; }
.node { white-space: nowrap; }
.node span { font: 400 14px var(--mono); color: var(--hi); font-variant-numeric: tabular-nums; }
@keyframes nodein { from { opacity: 0; } }
.ledgerrow { display: grid; grid-template-columns: auto minmax(0, 1fr); grid-template-areas: "counters days" "key key"; gap: 8px 18px; padding: 10px 14px; border-top: 3px dotted var(--low); }
.counters { grid-area: counters; display: grid; gap: 6px; align-content: center; }
.counters > div { display: grid; grid-template-columns: 1fr auto 104px; gap: 8px; align-items: baseline; }
.counters .tek { font-size: 26px; text-align: right; }
.days { grid-area: days; display: flex; flex-direction: column; min-height: 96px; }
.dn { display: grid; grid-template-columns: repeat(7, 1fr); font: 400 9px var(--pix); color: var(--dim); text-transform: uppercase; text-align: center; padding-top: 3px; }
.key { grid-area: key; display: flex; gap: 14px; flex-wrap: wrap; align-items: center; font: 400 9.5px var(--pix); color: var(--dim); text-transform: uppercase; }
.key span { display: inline-flex; align-items: center; gap: 5px; }
.key .ic { width: 12px; height: 12px; }
.key i { display: inline-block; width: 9px; height: 9px; margin-right: 5px; vertical-align: -1px; background: rgb(calc(var(--g) * 197), calc(var(--g) * 188), calc(var(--g) * 171)); }
.key .note { margin-left: auto; text-transform: none; font: italic 400 12px var(--fell); }

/* The side */
.side { grid-area: side; display: grid; grid-template-rows: auto auto auto minmax(0, 1fr); gap: 10px; min-height: 0; }
.motto { margin: -4px 0 0; font-style: italic; color: var(--dim); font-size: 16px; }
.verdict { position: relative; display: grid; gap: 4px; padding: 12px 0; border-top: 3px dotted var(--low); border-bottom: 3px dotted var(--low); }
.verdict { grid-template-columns: minmax(0, 1fr) 132px; }
.verdict > :not(.doing) { grid-column: 1; }
.verdict > .ready { grid-column: 1 / -1; }
.doing { grid-column: 2; grid-row: 1 / 4; align-self: end; height: 124px; display: flex; flex-direction: column; pointer-events: none; }
.word { font-size: clamp(44px, 4.6vw, 74px); animation: struck .9s var(--out) both; }
.word small { font: 400 16px var(--pix); color: var(--dim); text-transform: uppercase; margin-left: 6px; vertical-align: .5em; }
@keyframes struck { from { opacity: 0; letter-spacing: .25em; filter: blur(3px); } }
.verdict p { margin: 2px 0 4px; font-size: 17px; font-style: italic; color: var(--hi); line-height: 1.35; }
.verdict.soft p { color: var(--phos); }
.ready { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
.ready span { display: grid; gap: 1px; font: 400 16px var(--mono); color: var(--hi); border-left: 3px dotted var(--low); padding-left: 8px; }
.ready i { font-style: normal; font-size: 9px; }
.iron { min-height: 0; }
.lift { display: grid; grid-template-columns: minmax(0, 1fr) 60px; grid-template-areas: "nm spark" "rx when"; gap: 2px 10px; width: 100%; text-align: left;
  padding: 7px 2px; border-bottom: 3px dotted var(--faint); animation: rowin .5s var(--out) both; animation-delay: calc(var(--i) * 35ms);
  transition: background .25s var(--out); }
@keyframes rowin { from { opacity: 0; transform: translateX(-8px); } }
.lift:hover { background: rgba(197, 188, 171, .05); }
.lift .nm { grid-area: nm; font-size: 17px; color: var(--phos); }
.lift.due .nm { color: var(--hi); }
.lift .rx { grid-area: rx; color: var(--dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lift.due .rx { color: var(--phos); }
.lift .when { grid-area: when; text-align: right; font-size: 11px; white-space: nowrap; }
.spark { grid-area: spark; width: 60px; height: 16px; align-self: center; }
.spark polyline { fill: none; stroke: var(--phos); stroke-width: 1.4; }
.pr { font-style: normal; margin-left: 8px; color: var(--ground); background: var(--phos); padding: 0 4px; vertical-align: 2px; }
.more { margin-top: 10px; }
.newmove { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 10px; padding-top: 10px; border-top: 3px dotted var(--low); }
.newmove > input:first-child { grid-column: 1 / -1; }
.newmove .row { grid-column: 1 / -1; justify-content: flex-end; }
.pair { display: flex; gap: 4px; }

/* The road */
.distance { grid-area: distance; min-height: 0; }
.distance .x.busy { animation: blink 1s steps(1) infinite; }
@keyframes blink { 50% { opacity: .4; } }
.roadrow { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, .9fr) minmax(0, 1.1fr); }
.weeks { display: flex; flex-direction: column; padding: 10px 12px; min-height: 0; }
.wk { display: flex; justify-content: space-between; gap: 10px; padding-top: 8px; }
.wk span { display: grid; }
.wk .tek { font-size: 24px; }
.wk i { font-style: normal; }
.runs { border-left: 3px dotted var(--low); padding: 8px 12px; overflow: auto; scrollbar-width: thin; scrollbar-color: var(--low) transparent; }
.ic { width: 15px; height: 15px; fill: none; stroke: var(--phos); stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; flex: none; }
.run .ic { align-self: center; }
.run { display: grid; grid-template-columns: 15px 54px minmax(52px, 1fr) auto auto auto; gap: 6px; align-items: baseline; padding: 5px 0; border-bottom: 3px dotted var(--faint); white-space: nowrap; }
.run .fell { color: var(--hi); font-size: 15px; }
.run .note { font-size: 11px; }

/* The sheet */
.sheet { position: fixed; inset: 0; z-index: 40; background: rgba(12, 11, 10, .74); backdrop-filter: blur(10px); display: grid; place-items: center; padding: 20px; }
.box { width: min(1000px, 100%); height: min(800px, calc(100dvh - 40px)); display: grid; grid-template-columns: 300px minmax(0, 1fr); grid-template-rows: minmax(0, 1fr);
  border: 3px dotted var(--phos); background: var(--ground); }
.pose { display: flex; flex-direction: column; border-right: 3px dotted var(--low); min-height: 0; }
.main { padding: 16px 18px; overflow: auto; min-height: 0; display: grid; gap: 12px; align-content: start; scrollbar-width: thin; scrollbar-color: var(--low) transparent; }
.top { display: flex; justify-content: space-between; align-items: center; }
.main h2 { margin: -4px 0 0; font-size: 34px; font-weight: 400; color: var(--hi); }
.next { display: flex; gap: 8px; flex-wrap: wrap; }
.set { display: grid; gap: 2px; border: 3px double var(--low); padding: 6px 10px; animation: rowin .45s var(--out) both; }
.set:first-child { border-color: var(--phos); }
.set i { font-style: normal; font-size: 9px; }
.set b { font-size: 24px; font-weight: 800; }
.move { margin: 0; font-style: italic; font-family: var(--fell); font-size: 14px; }
.chart { width: 100%; height: 90px; border-bottom: 3px dotted var(--faint); }
.chart polyline { fill: none; stroke: var(--phos); stroke-width: 1.6; }
.chart circle { fill: var(--hi); }
.visits { display: grid; gap: 4px; }
.visit { display: grid; grid-template-columns: 88px minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 4px 0; border-bottom: 3px dotted var(--faint); }
.setrow { display: flex; gap: 6px; flex-wrap: wrap; }
.cell { display: inline-flex; align-items: center; gap: 2px; }
.cell input { width: 42px; background: var(--deep); border: 1px solid var(--low); color: var(--hi); padding: 2px 3px; font: 400 11.5px var(--mono); appearance: textfield; -moz-appearance: textfield; }
.cell input::-webkit-inner-spin-button, .cell input::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
.cell input:focus { border-color: var(--phos); outline: none; }
.cell .by { color: var(--dim); font-size: 11px; }
.cell input + .by + input { width: 32px; }
.cell .x { padding: 0 2px; opacity: .45; }
.cell:hover .x { opacity: 1; }
.feel { font: 400 9px var(--pix); text-transform: uppercase; color: var(--dim); border: 1px solid var(--low); padding: 3px 6px; min-width: 64px; }
.feel.on { color: var(--ground); background: var(--phos); border-color: var(--phos); }
.byhand { display: grid; gap: 6px; padding-top: 6px; }
.byhand .when { width: auto; flex: 0 1 200px; }
.tune { display: flex; gap: 10px; }
.tuning { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)) auto; gap: 6px; align-items: end; }
.err { color: var(--hi); }
.sheet-enter-active { transition: opacity .3s var(--out); }
.sheet-enter-active .box { animation: rise .5s var(--out) both; }
.sheet-leave-active { transition: opacity .2s var(--ease); }
.sheet-enter-from, .sheet-leave-to { opacity: 0; }
@keyframes rise { from { opacity: 0; transform: translateY(14px) scale(.985); } }
.empty { color: var(--dim); font-style: italic; font-family: var(--fell); font-size: 15px; margin: 0; }

@media (max-aspect-ratio: 5/4) {
  .hunt { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); grid-template-rows: minmax(420px, 1fr) minmax(360px, auto) minmax(220px, auto);
    grid-template-areas: "vessel side" "change change" "distance distance"; }
}
@media (max-width: 860px) {
  .hunt { display: flex; flex-direction: column; }
  .vessel { min-height: 520px; }
  .change { min-height: 620px; }
  .flow { min-height: 320px; }
  .node b { font-size: 8.5px; }
  .node span { font-size: 12px; }
  .distance { min-height: 380px; }
  .side { grid-template-rows: none; }
  .iron { max-height: none; }
  .roadrow { grid-template-columns: 1fr; }
  .weeks { min-height: 150px; }
  .runs { border-left: 0; border-top: 3px dotted var(--low); }
  .ledgerrow { grid-template-columns: 1fr; grid-template-areas: "counters" "days" "key"; }
  .box { grid-template-columns: 1fr; }
  .pose { min-height: 200px; border-right: 0; border-bottom: 3px dotted var(--low); }
  .visit { grid-template-columns: 1fr; gap: 4px; }
  .tuning { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .tag i { display: none; }
}
@media (prefers-reduced-motion: reduce) { .mark .ring, .lift, .word, .node, .set { animation: none; } }
</style>
