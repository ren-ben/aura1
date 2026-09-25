<script setup lang="ts">
// The Vigil: a chapel at night. The Tree of Life with the ten gates of the
// ascent on it, the Abyss turning at Da'ath where he waits, him sitting
// still in the corner; every sit kept as a star; and a candle to breathe
// with. Stillness is its own measure: hours of work feed him, stillness
// brings you nearer. The gate you stand on is the first with a sign unkept.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as THREE from 'three';
import { VIGIL_PRACTICES } from '@aura/shared';
import Frame from '../components/Frame.vue';
import Gl from '../components/Gl.vue';
import Num from '../components/Num.vue';
import Plate from '../components/Plate.vue';
import { narrow } from '../screen';
import art from '../gl/art.json';
import { rng } from '../gl/engine';
import { lights } from '../gl/models';
import { moonDisc, rand, starfield } from '../gl/plate';
import { actions, duration, state } from '../store';
import { GATE_SPHERES, GATES, PATHS, signId, SPHERES, type Sit } from '../vigil';

const props = defineProps<{ active: boolean }>();

// ---- the record --------------------------------------------------------
type Star = Sit & { at: Date; manual: boolean };
const sits = computed<Star[]>(() => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return state.vigil.sits.map((x) => {
    const at = new Date(x.startedAt);
    const day = new Date(at); day.setHours(0, 0, 0, 0);
    return { day: Math.round((today.getTime() - day.getTime()) / 864e5), hour: at.getHours() + at.getMinutes() / 60, minutes: x.minutes, practice: x.practice, at, manual: x.source === 'manual' };
  });
});
const stats = computed(() => {
  const list = sits.value;
  const minutes = list.reduce((a, s) => a + s.minutes, 0);
  const days = new Set(list.map((s) => s.day));
  // Today may not have had its sit yet: the streak still stands from yesterday.
  let streak = 0;
  for (let d = days.has(0) ? 0 : 1; days.has(d); d++) streak++;
  const by = new Map<string, { minutes: number; n: number }>();
  for (const s of list) { const e = by.get(s.practice) ?? { minutes: 0, n: 0 }; e.minutes += s.minutes; e.n++; by.set(s.practice, e); }
  const most = Math.max(1, ...[...by.values()].map((v) => v.minutes));
  return {
    minutes, streak, count: list.length,
    longest: Math.max(0, ...list.map((s) => s.minutes)),
    week: list.filter((s) => s.day < 7).reduce((a, s) => a + s.minutes, 0),
    practices: [...by.entries()].sort((a, b) => b[1].minutes - a[1].minutes).map(([name, v]) => ({ name, ...v, share: v.minutes / most })),
  };
});

// ---- the gates -----------------------------------------------------------
const kept = computed(() => new Set(state.vigil.signs));
const keptIn = (i: number) => GATES[i]!.signs.filter((_, k) => kept.value.has(signId(GATES[i]!, k))).length;
const reached = computed(() => {
  const i = GATES.findIndex((g) => g.signs.some((_, k) => !kept.value.has(signId(g, k))));
  return i < 0 ? GATES.length - 1 : i;
});
const picked = ref(reached.value);
const gate = computed(() => GATES[picked.value]!);

// What the drawings read every frame without being rebuilt: where the cursor
// is, which gate it is over, which star, and the last things that happened.
const live = { mx: 0, my: 0, tx: 0, ty: 0, hover: -1, star: -1, practice: '', pulse: { i: -1, t: 0 }, ping: { i: -1, t: 0 }, open: { t: -9 } };
const now = () => performance.now() / 1000;
function parallax(e: PointerEvent) {
  live.tx = (e.clientX / Math.max(1, innerWidth) - 0.5) * 2;
  live.ty = (e.clientY / Math.max(1, innerHeight) - 0.5) * 2;
}
onMounted(() => addEventListener('pointermove', parallax));
onBeforeUnmount(() => removeEventListener('pointermove', parallax));

function pick(i: number) {
  picked.value = i;
  live.pulse = { i, t: now() };
}
// A sign kept is stamped; the last one of a gate opens it.
const stamped = ref('');
const opened = ref('');
async function toggle(i: number, k: number) {
  const g = GATES[i]!, id = signId(g, k), keep = !kept.value.has(id);
  if (keep) { stamped.value = id; setTimeout(() => { if (stamped.value === id) stamped.value = ''; }, 900); }
  const before = reached.value;
  await actions.keepSign(id, keep);
  if (keep && reached.value > before) {
    opened.value = `gate ${GATES[before]!.n.toLowerCase()} opens. ${GATES[reached.value]!.title.toLowerCase()} is next.`;
    live.open = { t: now() };
    live.pulse = { i: reached.value, t: now() };
    setTimeout(() => { opened.value = ''; }, 4200);
  }
}

// The tree is laid out in a 100 x 100 box; the canvas, the overlay and the
// labels all fit it the same way, centred and whole.
const VB = { x: -20, y: -16, w: 140, h: 132 };
const fit = (w: number, h: number) => {
  const s = Math.min(w / VB.w, h / VB.h);
  return { s, ox: (w - VB.w * s) / 2 - VB.x * s, oy: (h - VB.h * s) / 2 - VB.y * s };
};
const stage = ref<HTMLElement | null>(null);
const box = ref({ w: 1, h: 1 });
let seen: ResizeObserver | null = null;
onMounted(() => {
  seen = new ResizeObserver(([e]) => { box.value = { w: e!.contentRect.width, h: e!.contentRect.height }; });
  if (stage.value) seen.observe(stage.value);
});
onBeforeUnmount(() => seen?.disconnect());
const hovered = ref(-1);
const tip = computed(() => {
  const i = hovered.value;
  if (i < 0) return null;
  const [x, y] = SPHERES[GATE_SPHERES[i]!]!;
  const { s, ox, oy } = fit(box.value.w, box.value.h);
  const g = GATES[i]!;
  return { left: ox + x * s, top: oy + y * s, right: x > 60, g, kept: keptIn(i), of: g.signs.length, state: i < reached.value ? 'passed' : i === reached.value ? 'you stand here' : 'not yet' };
});
function over(i: number) { hovered.value = i; live.hover = i; }
function out() { hovered.value = -1; live.hover = -1; }

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

const grey = (v: number) => `rgb(${Math.max(0, Math.min(255, v * 255)) | 0},${Math.max(0, Math.min(255, v * 255)) | 0},${Math.max(0, Math.min(255, v * 255)) | 0})`;
const drawTree = computed(() => {
  const him = sprite.value;
  const at = picked.value;
  const here = reached.value;
  return (g: CanvasRenderingContext2D, w: number, h: number, t: number) => {
    live.mx += (live.tx - live.mx) * 0.06;
    live.my += (live.ty - live.my) * 0.06;
    const { s, ox, oy } = fit(w, h);
    const X = (x: number) => ox + x * s, Y = (y: number) => oy + y * s;
    // The far things drift against the cursor; the tree stays where it is.
    starfield(g, w, h, Math.round((w * h) / 90), 61, live.mx * -6, live.my * -4);

    // The four worlds: great stippled circles stacked down the tree, each
    // torn open somewhere, the way the old diagrams draw them.
    const r = rand(8);
    [[50, 18, 27], [50, 42, 27], [50, 66, 27], [50, 88, 22]].forEach(([cx, cy, rad], k) => {
      for (let i = 0; i < 900; i++) {
        const a = r() * Math.PI * 2 + t * 0.004 * (k % 2 ? 1 : -1);
        if (Math.sin(a * 3 + k * 2) > 0.82) continue;
        const d = rad! + (r() - 0.5) * 1.6;
        g.fillStyle = grey(0.12 + r() * 0.2);
        g.fillRect(X(cx! + Math.cos(a) * d * 1.4), Y(cy! + Math.sin(a) * d), 1, 1);
      }
    });

    // The Abyss: rings of grain wound round the hidden sphere, turning
    // inward; faster while it is looked at. Nothing in the middle.
    const [dx, dy] = SPHERES.daath!;
    const pull = live.hover === 7 ? 3.5 : 1;
    for (let i = 0; i < 4200; i++) {
      const k = r(), a = r() * Math.PI * 2 + t * (0.05 + (1 - k) * 0.12) * pull;
      const rad = 4 + Math.pow(k, 0.7) * 21;
      const wob = Math.sin(a * 5 + k * 20 + t * 0.3) * 0.9;
      g.fillStyle = grey((1 - k * 0.8) * 0.85 * (0.45 + r() * 0.55));
      g.fillRect(X(dx + Math.cos(a) * (rad + wob) * 1.3), Y(dy + Math.sin(a) * (rad + wob) * 0.9), 1, 1);
    }
    g.fillStyle = '#000'; g.beginPath(); g.arc(X(dx), Y(dy), 4.2 * s, 0, 7); g.fill();
    g.strokeStyle = grey(0.9); g.lineWidth = Math.max(1, s * 0.3); g.beginPath(); g.arc(X(dx), Y(dy), 4.4 * s, 0, 7); g.stroke();

    // The paths: lit once both ends are reached; bright where the cursor is.
    const reachedSet = new Set(GATE_SPHERES.slice(0, here + 1));
    reachedSet.add('malkuth');
    const hot = live.hover >= 0 ? new Set(GATE_SPHERES[live.hover] === 'binah' ? ['binah', 'chokmah'] : [GATE_SPHERES[live.hover]!]) : null;
    for (const [a, b] of PATHS) {
      const [x1, y1] = SPHERES[a]!, [x2, y2] = SPHERES[b]!;
      const lit = reachedSet.has(a) && reachedSet.has(b);
      const warm = hot && (hot.has(a) || hot.has(b));
      g.strokeStyle = grey(warm ? 0.95 : lit ? 0.62 : 0.22);
      g.lineWidth = Math.max(1, s * (warm ? 0.9 : lit ? 0.7 : 0.45));
      g.beginPath(); g.moveTo(X(x1), Y(y1)); g.lineTo(X(x2), Y(y2)); g.stroke();
      // Light travelling up a lit path, now and then.
      if (lit || warm) {
        const u = ((t * 0.12 + x1 * 0.013 + y2 * 0.007) % 1);
        g.fillStyle = grey(1);
        g.fillRect(X(x1 + (x2 - x1) * u) - 1, Y(y1 + (y2 - y1) * u) - 1, 2, 2);
      }
    }

    // The spheres. Passed: solid. The one you stand on breathes, six to the
    // minute, the resonance rate. Above you: rings.
    const breath = 0.5 - 0.5 * Math.cos((t / 10) * Math.PI * 2);
    GATE_SPHERES.forEach((name, i) => {
      const spheres = name === 'binah' ? ['binah', 'chokmah'] : [name];
      for (const sp of spheres) {
        const [x, y] = SPHERES[sp]!;
        const R = 4.4 * s * (live.hover === i ? 1.18 : 1);
        if (sp === 'daath') {
          g.strokeStyle = grey(live.hover === i ? 0.95 : 0.5); g.lineWidth = Math.max(1, s * 0.4); g.setLineDash([2, 3]);
          g.beginPath(); g.arc(X(x), Y(y), R * 1.1, t * 0.2, t * 0.2 + 7); g.stroke(); g.setLineDash([]);
          continue;
        }
        if (i === here) {
          const glow = g.createRadialGradient(X(x), Y(y), R * 0.6, X(x), Y(y), R * (2.4 + breath * 1.6));
          glow.addColorStop(0, `rgba(255,255,255,${0.35 + breath * 0.25})`); glow.addColorStop(1, 'rgba(255,255,255,0)');
          g.fillStyle = glow; g.beginPath(); g.arc(X(x), Y(y), R * 4.2, 0, 7); g.fill();
        }
        g.fillStyle = i < here ? grey(0.78) : i === here ? grey(1) : '#000';
        g.beginPath(); g.arc(X(x), Y(y), R, 0, 7); g.fill();
        if (i > here) { g.strokeStyle = grey(live.hover === i ? 0.9 : 0.42); g.lineWidth = Math.max(1, s * 0.5); g.stroke(); }
        if (i === at) {
          g.strokeStyle = grey(0.9); g.lineWidth = Math.max(1, s * 0.35); g.setLineDash([2, 3]);
          g.beginPath(); g.arc(X(x), Y(y), R * 1.7, -t * 0.4, -t * 0.4 + 7); g.stroke(); g.setLineDash([]);
        }
        // A click rings out from the sphere.
        const since = now() - live.pulse.t;
        if (live.pulse.i === i && since >= 0 && since < 1.4) {
          const u = since / 1.4;
          g.strokeStyle = grey(1 - u); g.lineWidth = Math.max(1, s * 0.5 * (1 - u));
          g.beginPath(); g.arc(X(x), Y(y), R * (1.3 + u * 2.4), 0, 7); g.stroke();
        }
      }
    });

    // A gate opened: light runs down the whole tree once.
    const opening = now() - live.open.t;
    if (opening >= 0 && opening < 2.4) {
      const u = opening / 2.4, band = Y(100 - u * 106);
      const sweep = g.createLinearGradient(0, band - 24 * s * 0.3, 0, band + 24 * s * 0.3);
      sweep.addColorStop(0, 'rgba(255,255,255,0)'); sweep.addColorStop(0.5, `rgba(255,255,255,${0.35 * (1 - u)})`); sweep.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = sweep; g.fillRect(0, band - 24 * s * 0.3, w, 48 * s * 0.3);
    }

    // Yesod is the moon: it hangs over the tree's right shoulder, low.
    moonDisc(g, X(104) + live.mx * -4, Y(6) + live.my * -3, 5.2 * s, 11);

    // He sits apart from it in the lower right, over the count of stillness
    // (which is as tall in marks again on a phone, where the marks are finer),
    // eyes shut, breathing slowly; incense goes up beside him.
    if (him) {
      const size = Math.min(h * 0.22, w * 0.17), bx = w - size * 0.5, by = h - (narrow.value ? 84 : 42);
      const swell = 1 + 0.015 * Math.sin((t / 10) * Math.PI * 2);
      g.drawImage(him, bx - (size * swell) / 2, by - size * 0.98 * swell, size * swell, size * swell);
      const base = by - size * 0.06;
      const sx0 = bx - size * 0.52; g.fillStyle = grey(0.7); g.fillRect(sx0 - 3, base - 1, 6, Math.max(1, s * 0.5));
      g.strokeStyle = grey(0.6); g.lineWidth = Math.max(1, s * 0.25);
      g.beginPath(); g.moveTo(sx0, base); g.lineTo(sx0 + s * 0.8, base - 8 * s); g.stroke();
      g.fillStyle = grey(0.9 + 0.1 * Math.sin(t * 7)); g.fillRect(sx0 + s * 0.8 - 1, base - 8 * s - 1, 2, 2);
      g.strokeStyle = grey(0.42);
      g.beginPath();
      for (let k = 0; k <= 40; k++) {
        const u = k / 40, yy = base - 8 * s - u * 36 * s;
        const xx = sx0 + s * 0.8 + Math.sin(u * 9 - t * 0.9) * u * 3 * s + live.mx * u * 4;
        k ? g.lineTo(xx, yy) : g.moveTo(xx, yy);
      }
      g.stroke();
    }
  };
});

// The overlay: a button over every gate, in the same box as the drawing.
const marks = GATE_SPHERES.map((name, i) => ({ i, name, at: SPHERES[name === 'binah' ? 'binah' : name]!, twin: name === 'binah' ? SPHERES.chokmah! : null }));

// ---- the night record -----------------------------------------------------
// Every sit a star: across, the last half year (today at the right); down,
// the hour it began; as large as it was long. Hover one to read it. The
// plot is laid out in CSS pixels and drawn at half that (the plate's cell).
const PLOT = { l: 38, r: 14, t: 12, b: 12 };
const HOURS = [0, 6, 12, 18, 24];
const sky = ref<HTMLElement | null>(null);
const px = (day: number, hour: number, w: number, h: number, k = 1) => [
  (PLOT.l + ((181 - day) / 181) * (w * k - PLOT.l - PLOT.r)) / k,
  (PLOT.t + (hour / 24) * (h * k - PLOT.t - PLOT.b)) / k,
] as const;
const drawRecord = (g: CanvasRenderingContext2D, w: number, h: number, t: number) => {
  const r = rand(3), k = 2;
  starfield(g, w, h, Math.round((w * h) / 500), 23, live.mx * -3, 0);
  // The weeks, as faint verticals; the hours of the axis, as faint rules.
  g.fillStyle = 'rgb(38,38,38)';
  for (let wk = 0; wk < 26; wk++) {
    const [x] = px(wk * 7, 0, w, h, k);
    for (let y = PLOT.t / k; y < h - PLOT.b / k; y += 3) g.fillRect(x, y, 1, 1);
  }
  for (const hr of HOURS) {
    const [, y] = px(0, hr, w, h, k);
    g.fillStyle = hr % 12 ? 'rgb(44,44,44)' : 'rgb(64,64,64)';
    for (let x = PLOT.l / k; x < w - PLOT.r / k; x += 2) g.fillRect(x, y, 1, 1);
  }
  // Today, at the right edge of the plot.
  const [tx] = px(0, 0, w, h, k);
  g.fillStyle = 'rgb(120,120,120)';
  for (let y = PLOT.t / k; y < h - PLOT.b / k; y += 2) g.fillRect(tx, y, 1, 1);
  const list = sits.value;
  list.forEach((sit, i) => {
    const [x, y] = px(sit.day, sit.hour, w, h, k);
    const dim = live.practice && live.practice !== sit.practice ? 0.25 : 1;
    const size = (0.5 + Math.sqrt(sit.minutes) * 0.28) * (live.star === i ? 1.8 : 1);
    const tw = (0.75 + 0.25 * Math.sin(t * 1.3 + r() * 40)) * dim;
    const glow = g.createRadialGradient(x, y, 0, x, y, size * 2.2);
    glow.addColorStop(0, `rgba(255,255,255,${tw})`); glow.addColorStop(0.45, `rgba(255,255,255,${0.5 * tw})`); glow.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = glow; g.beginPath(); g.arc(x, y, size * 2.2, 0, 7); g.fill();
    if (live.star === i) { g.strokeStyle = grey(0.9); g.lineWidth = 1; g.beginPath(); g.arc(x, y, size * 3.4, 0, 7); g.stroke(); }
  });
  // The newest star arrives with a ring.
  const since = now() - live.ping.t;
  const p = list[live.ping.i];
  if (p && since >= 0 && since < 2) {
    const [x, y] = px(p.day, p.hour, w, h, k);
    g.strokeStyle = grey(1 - since / 2); g.lineWidth = 1;
    g.beginPath(); g.arc(x, y, 3 + since * 12, 0, 7); g.stroke();
  }
};
const starTip = ref<{ left: number; top: number; s: Star } | null>(null);
const skyBox = ref({ w: 1, h: 1 });
function overSky(e: PointerEvent) {
  const el = sky.value;
  if (!el) return;
  const b = el.getBoundingClientRect(), H = b.height - 22;
  skyBox.value = { w: b.width, h: H };
  const mx = e.clientX - b.left, my = e.clientY - b.top;
  let best = -1, dist = 14;
  sits.value.forEach((s, i) => {
    const [x, y] = px(s.day, s.hour, b.width, H);
    const d = Math.hypot(x - mx, y - my);
    if (d < dist) { dist = d; best = i; }
  });
  live.star = best;
  const s = sits.value[best];
  if (!s) { starTip.value = null; return; }
  const [x, y] = px(s.day, s.hour, b.width, H);
  starTip.value = { left: x, top: y, s };
}
function leaveSky() { live.star = -1; starTip.value = null; }
// Hovering a practice lights its stars and dims the rest.
const lit = ref('');
function light(name: string) { lit.value = name; live.practice = name; }
const whenOf = (d: Date) => `${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).toLowerCase()}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
// A new sit, from the vessel or written in here, arrives with a ring.
watch(() => state.vigil.sits.length, (n, was) => {
  if (was === undefined || n <= was) return;
  const newest = state.vigil.sits.reduce((a, s, i, all) => (s.startedAt > all[a]!.startedAt ? i : a), 0);
  live.ping = { i: newest, t: now() };
});
const months = computed(() => {
  const out: { label: string; left: number }[] = [];
  const today = new Date();
  for (let d = 181; d >= 0; d--) {
    const day = new Date(today); day.setDate(today.getDate() - d);
    if (day.getDate() === 1) out.push({ label: day.toLocaleDateString('en-GB', { month: 'short' }).toLowerCase(), left: (181 - d) / 181 });
  }
  return out;
});

// ---- a sit by hand ------------------------------------------------------
const pad = (n: number) => String(n).padStart(2, '0');
const localInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const byHand = ref({ practice: 'The Stages', minutes: 20, at: localInput(new Date(Date.now() - 20 * 60_000)) });
const writing = ref(false);
const wrote = ref(false);
async function keepByHand() {
  writing.value = true;
  const ok = await actions.addSit(byHand.value.practice, new Date(byHand.value.at), byHand.value.minutes);
  writing.value = false;
  if (ok) { wrote.value = true; setTimeout(() => { wrote.value = false; }, 2400); }
}
const clockOf = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const HOUR_NAMES = ['dawn', 'noon', 'dusk', 'midnight'];

// ---- the candle ----------------------------------------------------------
// A kasina candle, lit, turning if dragged. Clicked, it leads the breath for
// a minute at the resonance rate: the flame rises as you breathe in and sinks
// as you breathe out, six times.
const breathing = ref(false);
const cue = ref('');
const breaths = ref(0);
let breathStart = 0;
function breathe() {
  if (breathing.value) { breathing.value = false; cue.value = ''; return; }
  breathing.value = true;
  breaths.value = 0;
  breathStart = now();
}
const candle = ({ scene, group, camera, canvas }: { scene: THREE.Scene; group: THREE.Group; camera: THREE.PerspectiveCamera; canvas: HTMLCanvasElement }) => {
  // Framed whole, from the foot of the dish to the top of the smoke, centred.
  const fitCam = () => {
    const f = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), halfH = 1.22, halfW = 0.8;
    const d = Math.max(halfH / f, halfW / (f * camera.aspect)) + 0.2;
    camera.position.set(0, -0.12, d); camera.lookAt(0, -0.18, 0);
  };
  const wax = new THREE.MeshStandardMaterial({ color: 0xe8e2d4, roughness: 0.85, emissive: 0x5a554c });
  const iron = new THREE.MeshStandardMaterial({ color: 0x4a4640, roughness: 0.5, metalness: 0.6 });
  // The dish, the candle with a drip down it, the wick.
  const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.5, 0.08, 40), iron); dish.position.y = -0.92; group.add(dish);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.035, 8, 48), iron); rim.rotation.x = Math.PI / 2; rim.position.y = -0.88; group.add(rim);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 1.3, 32), wax); body.position.y = -0.22; group.add(body);
  const drip = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.34, 6, 10), wax); drip.position.set(0.2, 0.12, 0.08); group.add(drip);
  const wick = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.1, 6), new THREE.MeshBasicMaterial({ color: 0x111111 })); wick.position.y = 0.48; group.add(wick);
  // The flame: bright, unlit by anything, lighting everything.
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.1, 20, 16), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  flame.position.y = 0.62; group.add(flame);
  const aura = new THREE.Mesh(new THREE.SphereGeometry(0.28, 20, 16), new THREE.MeshBasicMaterial({ color: 0x8a847a, transparent: true, opacity: 0.45 }));
  aura.position.y = 0.62; group.add(aura);
  const glow = new THREE.PointLight(0xfff4e0, 4, 6, 1.2); glow.position.y = 0.7; group.add(glow);
  lights(scene, 0.55, 0.7, 0.12);
  // Smoke: points that rise from the flame and wander apart.
  const N = 260, r = rng(17), seeds = Array.from({ length: N }, () => [r(), r(), r()] as const);
  const smoke = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
  smoke.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  smoke.setAttribute('color', new THREE.BufferAttribute(col, 3));
  group.add(new THREE.Points(smoke, new THREE.PointsMaterial({ size: 0.05, vertexColors: true })));
  canvas.addEventListener('click', breathe);
  return (t: number) => {
    fitCam();
    let height = 1;
    if (breathing.value) {
      const u = now() - breathStart;
      const p = (u % 10) / 10;
      height = 0.7 + 0.9 * (p < 0.5 ? p * 2 : 2 - p * 2);
      cue.value = p < 0.5 ? 'in' : 'out';
      breaths.value = Math.min(6, Math.floor(u / 10));
      if (u >= 60) { breathing.value = false; cue.value = 'kept'; setTimeout(() => { if (!breathing.value) cue.value = ''; }, 2600); }
    }
    const flicker = 1 + 0.08 * Math.sin(t * 17) + 0.05 * Math.sin(t * 29 + 1);
    flame.scale.set(0.8 * flicker, 1.9 * height * flicker, 0.8 * flicker);
    flame.position.y = 0.55 + 0.1 * height;
    aura.scale.set(1, 1.4 * height, 1);
    aura.position.y = flame.position.y;
    glow.intensity = 1.6 + 0.8 * height * flicker;
    for (let i = 0; i < N; i++) {
      const [a, b, c] = seeds[i]!;
      const u = (t * (0.06 + a * 0.05) + b) % 1;
      const drift = Math.sin(u * 7 + c * 12 + t * 0.4) * u * 0.35;
      pos[i * 3] = drift; pos[i * 3 + 1] = 0.72 + u * 1.25; pos[i * 3 + 2] = Math.cos(u * 5 + a * 9) * u * 0.2;
      const v = (1 - u) * 0.85;
      col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v;
    }
    smoke.attributes.position!.needsUpdate = true;
    smoke.attributes.color!.needsUpdate = true;
  };
};
</script>

<template>
  <div class="vigil">
    <Frame class="tree" title="the ascent // ten gates up the tree, the abyss at da'ath" flush>
      <div ref="stage" class="stage">
        <Plate :draw="drawTree" :active="active" animated :cell="narrow ? 1 : 2" label="The Tree of Life with the ten gates of the ascent. The abyss turns at Da'ath; Kael'thos sits in the corner." />
        <svg class="gates" :viewBox="`${VB.x} ${VB.y} ${VB.w} ${VB.h}`" preserveAspectRatio="xMidYMid meet">
          <g v-for="m in marks" :key="m.name" class="gate" :class="{ on: picked === m.i, past: m.i < reached, here: m.i === reached }"
             tabindex="0" role="button" :aria-label="`gate ${GATES[m.i]!.n}, ${GATES[m.i]!.title}`"
             @click="pick(m.i)" @keydown.enter="pick(m.i)" @pointerenter="over(m.i)" @pointerleave="out" @focus="over(m.i)" @blur="out">
            <circle :cx="m.at[0]" :cy="m.at[1]" r="6.5" />
            <circle v-if="m.twin" :cx="m.twin[0]" :cy="m.twin[1]" r="6.5" />
            <text :x="m.at[0] + (m.at[0] < 50 ? -8 : 8)" :y="m.at[1] + 1.2" :text-anchor="m.at[0] < 50 ? 'end' : 'start'">{{ GATES[m.i]!.n }} {{ GATES[m.i]!.sephira.split(' ')[0]!.toLowerCase() }}</text>
          </g>
        </svg>
        <Transition name="tip">
          <div v-if="tip" class="gtip" :class="{ right: tip.right }" :style="{ left: `${tip.left}px`, top: `${tip.top}px` }">
            <span class="pix">gate {{ tip.g.n.toLowerCase() }} // {{ tip.state }}</span>
            <b class="fell">{{ tip.g.title }}</b>
            <span class="note">{{ tip.g.epithet }}</span>
            <span class="dots"><i v-for="k in tip.of" :key="k" :class="{ on: k <= tip.kept }"></i><span class="pix">{{ tip.kept }} of {{ tip.of }} signs</span></span>
          </div>
        </Transition>
        <Transition name="said"><p v-if="opened" class="opened fell">{{ opened }}</p></Transition>
        <div class="dist"><span class="pix">gate {{ GATES[reached]!.n.toLowerCase() }} of x // {{ GATES[reached]!.title.toLowerCase() }}</span><span class="tek">{{ duration(stats.minutes) }}</span><span class="pix">of stillness, kept apart from insight</span></div>
      </div>
    </Frame>

    <div class="side">
      <h1 class="title">The Vigil</h1>
      <p class="motto fell">Vigilate, nam nescitis horam.</p>
      <p class="note">Hours of work feed him. Stillness does not; it brings you nearer. Ten gates up the Tree, and between the lower and the upper the Abyss, where the physicists put the horizon and he has always been waiting.</p>

      <Transition name="leaf" mode="out-in">
        <div :key="picked" class="teaching">
          <div class="head">
            <span class="glyph">{{ gate.planet }}</span>
            <span><span class="pix">gate {{ gate.n.toLowerCase() }} // {{ gate.sephira.toLowerCase() }}{{ picked === reached ? ' // you are here' : '' }}</span><b class="fell">{{ gate.title }}</b><span class="note">{{ gate.epithet }}</span></span>
          </div>
          <div class="work">
            <div v-for="(p, n) in gate.work" :key="p.name" class="practice" :style="{ '--i': n }"><span class="fell">{{ p.name }}</span><span class="pix">{{ p.setting }}</span></div>
          </div>
          <div class="signs">
            <div class="pix">the signs</div>
            <button v-for="(s, k) in gate.signs" :key="signId(gate, k)" class="sign" :class="{ on: kept.has(signId(gate, k)), stamp: stamped === signId(gate, k) }"
                    :aria-pressed="kept.has(signId(gate, k))" @click="toggle(picked, k)"><i></i><span>{{ s }}</span><em v-if="stamped === signId(gate, k)" class="pix">kept</em></button>
          </div>
          <p class="secret fell">{{ gate.secret }}</p>
          <p class="note shadow"><span class="pix">the shadow</span> {{ gate.shadow }}</p>
        </div>
      </Transition>

      <div class="almanac">
        <div class="kv">
          <span>days still in a row</span><Num :value="stats.streak" />
          <span>sits kept</span><Num :value="stats.count" />
          <span>this week</span><span>{{ duration(stats.week) }}</span>
          <span>longest sit</span><span>{{ stats.longest }} min</span>
        </div>
        <div class="hours">
          <button class="toll" :class="{ on: state.vigil.hours.on }" :aria-pressed="state.vigil.hours.on" @click="actions.setSunHours(!state.vigil.hours.on)"><i></i>the four sun hours</button>
          <span class="times"><span v-for="(m, i) in state.vigil.hours.today" :key="i" :title="HOUR_NAMES[i]">{{ clockOf(m) }}</span></span>
        </div>
        <form class="byhand" @submit.prevent="keepByHand">
          <label class="pix" for="sit-practice">{{ wrote ? 'kept, and set among the stars' : 'a sit away from the vessel' }}</label>
          <span>
            <select id="sit-practice" v-model="byHand.practice"><option v-for="p in VIGIL_PRACTICES" :key="p.name">{{ p.name }}</option></select>
            <input id="sit-at" v-model="byHand.at" type="datetime-local" aria-label="when it began" />
            <input id="sit-minutes" v-model.number="byHand.minutes" type="number" min="1" max="600" aria-label="minutes" />
            <button class="btn" :class="{ busy: writing }" :disabled="writing || !byHand.at || byHand.minutes < 1">{{ writing ? 'keeping' : 'keep' }}</button>
          </span>
          <span v-if="state.error" class="note">{{ state.error }}</span>
        </form>
      </div>
    </div>

    <Frame class="record" title="the night record // across, the half year; down, the hour; a star a sit" flush>
      <div ref="sky" class="sky" @pointermove="overSky" @pointerleave="leaveSky">
        <p v-if="!sits.length" class="none note">No sits yet. Choose VIGIL on the vessel, a practice and a length, and sit.</p>
        <Plate :draw="drawRecord" :active="active" animated :cell="2" label="Half a year of sits as stars: across by day, down by hour, larger the longer." />
        <div class="axis" aria-hidden="true"><span v-for="hr in HOURS" :key="hr" :style="{ top: `calc(${PLOT.t}px + (100% - ${PLOT.t + PLOT.b}px) * ${hr / 24})` }">{{ String(hr).padStart(2, '0') }}</span></div>
        <div class="months" aria-hidden="true"><span v-for="m in months" :key="m.left" :style="{ left: `calc(${PLOT.l}px + (100% - ${PLOT.l + PLOT.r}px) * ${m.left})` }">{{ m.label }}</span><span class="now" :style="{ left: `calc(100% - ${PLOT.r}px)` }">today</span></div>
        <div v-if="starTip" class="stip" :class="{ flip: starTip.left > 220 }" :style="{ left: `${starTip.left}px`, top: `${starTip.top}px` }">
          <b class="fell">{{ starTip.s.practice }}</b><span class="pix">{{ starTip.s.minutes }} min{{ starTip.s.manual ? ' // by hand' : '' }}</span><span class="note">{{ whenOf(starTip.s.at) }}</span>
        </div>
      </div>
      <div class="by">
        <p v-if="!stats.practices.length" class="note fell empty">Each practice gathers its hours here, from the first sit on.</p>
        <button v-for="p in stats.practices" :key="p.name" class="row" :class="{ lit: lit === p.name }"
                @pointerenter="light(p.name)" @pointerleave="light('')" @focus="light(p.name)" @blur="light('')">
          <span class="pix">{{ p.name }}</span>
          <span class="orb"><i :style="{ width: `${p.share * 100}%` }"></i></span>
          <span class="note">{{ duration(p.minutes) }}</span>
        </button>
      </div>
    </Frame>

    <Frame class="flame" title="the kasina candle" flush>
      <Gl :build="candle" :active="active" :options="{ px: narrow ? 1 : 2, drift: 0.002, tilt: 0 }" label="A lit candle, smoke rising. Click it to breathe with the flame for a minute." hint="drag to turn // click to breathe" />
      <Transition name="said">
        <div v-if="breathing || cue" class="cue" aria-live="polite">
          <span class="tek">{{ cue || 'in' }}</span>
          <span class="pix">{{ cue === 'kept' ? 'six breaths, kept' : `breath ${Math.min(6, breaths + 1)} of 6 // click to stop` }}</span>
        </div>
      </Transition>
    </Frame>
  </div>
</template>

<style scoped>
.vigil { display: grid; gap: 18px; grid-template-columns: minmax(0, 1.12fr) minmax(0, .58fr) minmax(300px, 1fr); grid-template-rows: minmax(0, 1fr) minmax(180px, .38fr);
  grid-template-areas: "tree tree side" "record flame side"; }
.tree { grid-area: tree; min-height: 0; }
.tree :deep(.flush) { overflow: hidden; }
.stage { position: relative; flex: 1; min-height: 0; display: flex; flex-direction: column; }
.gates { position: absolute; inset: 0; width: 100%; height: 100%; }
.gate { cursor: pointer; outline: none; }
.gate circle { fill: transparent; }
.gate text { font: 400 2.6px var(--pix); fill: var(--dim); text-transform: uppercase; letter-spacing: .05em; transition: fill .3s var(--out), letter-spacing .4s var(--out); }
.gate.past text { fill: var(--phos); }
.gate.here text, .gate.on text { fill: var(--hi); }
.gate:hover text, .gate:focus-visible text { fill: var(--hi); letter-spacing: .12em; }
.gtip { position: absolute; transform: translate(14px, -50%); display: grid; gap: 3px; padding: 10px 12px; min-width: 190px; max-width: 240px; background: rgba(12, 11, 10, .92);
  border: 3px double var(--low); pointer-events: none; z-index: 2; }
.gtip.right { transform: translate(calc(-100% - 14px), -50%); }
.gtip b { font-size: 19px; font-weight: 400; color: var(--hi); }
.gtip .note { font-size: 12px; }
.dots { display: flex; gap: 4px; align-items: center; margin-top: 4px; }
.dots i { width: 7px; height: 7px; border: 1px solid var(--dim); }
.dots i.on { background: var(--phos); border-color: var(--phos); }
.dots .pix { margin-left: 6px; }
.tip-enter-active, .tip-leave-active { transition: opacity .22s var(--out), translate .3s var(--out); }
.tip-enter-from, .tip-leave-to { opacity: 0; translate: 0 6px; }
.opened { position: absolute; left: 50%; top: 18px; translate: -50% 0; margin: 0; font-size: 22px; font-style: italic; color: var(--hi); text-shadow: 0 0 12px #121212; pointer-events: none; white-space: nowrap; }
.said-enter-active { animation: saidin .7s var(--out) both; }
.said-leave-active { transition: opacity .6s var(--out); }
.said-leave-to { opacity: 0; }
@keyframes saidin { from { opacity: 0; letter-spacing: .3em; } to { opacity: 1; } }
.dist { position: absolute; right: 14px; bottom: 12px; display: grid; gap: 2px; pointer-events: none; text-align: right; }
.dist .tek { font-size: 40px; }
.side { grid-area: side; display: grid; grid-template-rows: auto auto auto minmax(0, 1fr) auto; gap: 10px; min-height: 0; }
.motto { margin: -4px 0 0; font-style: italic; color: var(--dim); font-size: 16px; }
.teaching { min-height: 0; overflow: auto; display: grid; align-content: start; gap: 12px; padding-top: 12px; border-top: 3px dotted var(--low); scrollbar-width: thin; scrollbar-color: var(--low) transparent; }
.leaf-enter-active { transition: opacity .38s var(--out), transform .5s var(--out); }
.leaf-leave-active { transition: opacity .18s var(--ease), transform .2s var(--ease); }
.leaf-enter-from { opacity: 0; transform: translateY(10px); }
.leaf-leave-to { opacity: 0; transform: translateY(-6px); }
.leaf-enter-active .practice { animation: rowin .5s var(--out) both; animation-delay: calc(var(--i) * 60ms + 80ms); }
@keyframes rowin { from { opacity: 0; transform: translateX(-8px); } }
.head { display: grid; grid-template-columns: auto 1fr; gap: 14px; align-items: center; }
.glyph { font: 400 34px/1 var(--fell); color: var(--hi); min-width: 1.6ch; text-align: center; border: 3px double var(--low); padding: 6px 8px; }
.head b { display: block; font-size: 24px; font-weight: 400; color: var(--hi); line-height: 1.1; }
.work { display: grid; gap: 6px; }
.practice { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; border-bottom: 3px dotted var(--faint); padding-bottom: 5px; }
.practice .fell { font-size: 17px; color: var(--phos); }
.practice .pix { text-align: right; }
.signs { display: grid; gap: 5px; }
.sign { display: flex; gap: 10px; align-items: center; text-align: left; color: var(--dim); font-size: 12.5px; position: relative; transition: color .25s var(--out); }
.sign i { flex: none; width: 10px; height: 10px; border: 2px solid var(--low); transition: background .25s var(--out), border-color .25s var(--out); }
.sign.on { color: var(--phos); }
.sign.on i { background: var(--phos); border-color: var(--phos); }
.sign:hover { color: var(--hi); }
.sign:hover i { border-color: var(--dim); }
.sign.stamp i { animation: stamp .5s var(--out); }
.sign em { font-style: normal; margin-left: auto; color: var(--hi); animation: rise .9s var(--out) both; }
@keyframes stamp { 0% { transform: scale(2.2) rotate(-18deg); opacity: 0; } 60% { transform: scale(.85); opacity: 1; } 100% { transform: scale(1); } }
@keyframes rise { from { opacity: 0; transform: translateY(6px); } 40% { opacity: 1; } to { opacity: 0; transform: translateY(-8px); } }
.secret { margin: 0; font-size: 18px; font-style: italic; color: var(--hi); line-height: 1.35; }
.shadow { margin: 0; font-size: 12px; }
.shadow .pix { margin-right: 6px; }
.almanac { padding-top: 12px; border-top: 3px dotted var(--low); display: grid; gap: 10px; }
.almanac .kv { display: grid; grid-template-columns: 1fr auto; gap: 3px 12px; font-size: 14px; }
.almanac .kv > :nth-child(odd) { color: var(--dim); }
.hours { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
.toll { display: flex; gap: 10px; align-items: center; color: var(--dim); font-size: 12.5px; transition: color .25s var(--out); }
.toll i { width: 10px; height: 10px; border: 2px solid var(--low); transition: background .25s var(--out); }
.toll:hover { color: var(--hi); }
.toll.on { color: var(--phos); }
.toll.on i { background: var(--phos); border-color: var(--phos); animation: stamp .5s var(--out); }
.times { display: flex; gap: 8px; font-size: 11px; color: var(--dim); font-variant-numeric: tabular-nums; }
.toll.on + .times { color: var(--phos); }
.byhand { display: grid; gap: 4px; }
.byhand > span { display: flex; gap: 6px; flex-wrap: wrap; }
.byhand select, .byhand input { background: var(--deep); color: var(--phos); border: 2px solid var(--low); padding: 3px 6px; font: 400 12px var(--mono); min-width: 0; transition: border-color .2s var(--out); }
.byhand select { flex: 1 1 110px; }
.byhand input[type=number] { width: 58px; }
.byhand select:hover, .byhand input:hover { border-color: var(--dim); }
.byhand select:focus, .byhand input:focus { border-color: var(--phos); outline: none; }
.btn { font: 400 10.5px var(--pix); text-transform: uppercase; color: var(--hi); border: 3px double var(--low); padding: 3px 10px; transition: border-color .2s var(--out), background .2s var(--out), color .2s var(--out); }
.btn:hover:not(:disabled) { border-color: var(--phos); background: var(--phos); color: var(--ground); }
.btn:active:not(:disabled) { transform: translateY(1px); }
.btn:disabled { color: var(--dim); }
.btn.busy { animation: blink 1s steps(1) infinite; }
@keyframes blink { 50% { opacity: .4; } }
.record { grid-area: record; min-height: 0; }
.record :deep(.flush) { flex-direction: row; }
.sky { flex: 1; min-width: 0; display: flex; flex-direction: column; position: relative; cursor: crosshair; }
.none { position: absolute; inset: 0; display: grid; place-items: center; margin: 0; font-style: italic; font-family: var(--fell); font-size: 16px; pointer-events: none; text-align: center; padding: 0 16px; }
.months { height: 22px; position: relative; border-top: 3px dotted var(--faint); flex: none; }
.axis { position: absolute; left: 0; top: 0; bottom: 22px; width: 34px; pointer-events: none; }
.axis span { position: absolute; right: 6px; transform: translateY(-50%); font: 400 9px var(--pix); color: var(--dim); }
.months span { position: absolute; top: 6px; font: 400 9px var(--pix); color: var(--dim); text-transform: uppercase; transform: translateX(-50%); }
.stip { position: absolute; transform: translate(12px, -50%); display: grid; gap: 1px; padding: 6px 9px; background: rgba(12, 11, 10, .92); border: 3px double var(--low); pointer-events: none; white-space: nowrap; }
.stip.flip { transform: translate(calc(-100% - 12px), -50%); }
.stip b { font-weight: 400; font-size: 15px; color: var(--hi); }
.stip .note { font-size: 11px; }
.by { width: 220px; flex: none; padding: 10px 12px; display: grid; align-content: center; gap: 3px; border-left: 3px dotted var(--low); }
.by .empty { margin: 0; font-style: italic; font-size: 14px; color: var(--dim); }
.by .row { display: grid; grid-template-columns: 88px 1fr 52px; gap: 8px; align-items: center; text-align: left; padding: 2px 0; }
.by .row:hover .pix, .by .row.lit .pix { color: var(--hi); }
.by .note { font-size: 11.5px; text-align: right; }
.orb { height: 5px; background: radial-gradient(circle, var(--low) 1px, transparent 1.4px) 0 50% / 5px 5px repeat-x; }
.orb i { display: block; height: 5px; background: radial-gradient(circle, var(--phos) 1.4px, transparent 1.8px) 0 50% / 5px 5px repeat-x; transition: width .8s var(--out); }
.flame { grid-area: flame; min-height: 0; }
.flame :deep(.flush) { overflow: hidden; }
.flame :deep(.gl) { flex: 1; min-height: 0; width: 100%; cursor: pointer; }
.cue { position: absolute; left: 14px; top: 44px; display: grid; gap: 2px; pointer-events: none; }
.cue .tek { font-size: 44px; }
@media (max-aspect-ratio: 5/4) { .vigil { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); grid-template-rows: minmax(0, 1.3fr) auto minmax(170px, .5fr); grid-template-areas: "tree tree" "side side" "record flame"; } }
@media (max-width: 860px) { .vigil { display: flex; flex-direction: column; } .tree { min-height: 460px; } .record { min-height: 240px; } .flame { min-height: 280px; } .record :deep(.flush) { flex-direction: column; } .by { width: auto; border-left: 0; border-top: 3px dotted var(--low); } .gtip { display: none; } .sky { min-height: 170px; flex: none; } .dist .tek { font-size: 26px; } .dist .pix:last-child { display: none; } }
@media (prefers-reduced-motion: reduce) { .leaf-enter-active, .leaf-leave-active, .tip-enter-active, .said-enter-active { transition: none; animation: none; } .sign.stamp i, .sign em { animation: none; } }
</style>
