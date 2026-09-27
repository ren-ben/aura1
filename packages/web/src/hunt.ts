// The Hunt on the console: everything the pane draws, worked out from the
// API's /hunt (packages/api/src/db/hunt.ts) with the shared coach.
import {
  bouts, e1rm, EFFICIENCY, EXERCISES, massMicrograms, prescribe, setWork, verdict,
  type ActivityKind, type Exercise, type Feel, type GarminActivity, type GarminDay, type Group, type HuntSet,
  type Prescription, type Verdict,
} from '@aura/shared';

export type HuntExercise = Exercise & { archived: boolean };
export type HuntSetRow = HuntSet & { source: 'device' | 'phone' };
export type Hunt = {
  exercises: HuntExercise[];
  sets: HuntSetRow[];
  feels: { exerciseId: number; date: string; feel: Feel }[];
  activities: GarminActivity[];
  days: GarminDay[];
  bodyweight: number;
  garminSyncedAt: string | null;
  verdict: Verdict;
};

export const EMPTY_HUNT: Hunt = {
  exercises: [], sets: [], feels: [], activities: [], days: [], bodyweight: 75, garminSyncedAt: null,
  verdict: { word: 'RUN', group: null, long: false, soft: false, line: '', short: 'RUN' },
};

const DAY = 86_400_000;
const HOUR = 3_600_000;
export const kg = (n: number) => String(Math.round(n * 10) / 10);
export const target = (ex: Exercise, t: { load: number; reps: number }) => (ex.kind === 'bodyweight' ? `${t.reps}` : `${kg(t.load)} x ${t.reps}`);

// ---- The iron ----------------------------------------------------------------
export type Iron = {
  ex: HuntExercise;
  p: Prescription;
  // The best e1RM of each visit, oldest first.
  series: { at: string; e1rm: number }[];
  best: number;
  pr: boolean;          // the last visit set a new best
  lastAt: string | null;
  sets: HuntSetRow[];
};

export function ironOf(h: Hunt, ex: HuntExercise): Iron {
  const sets = h.sets.filter((s) => s.exerciseId === ex.id);
  const feels = Object.fromEntries(h.feels.filter((f) => f.exerciseId === ex.id).map((f) => [f.date, f.feel]));
  const visits = bouts(sets);
  const series = visits.map((b) => ({
    at: b[0]!.at,
    e1rm: Math.max(...b.map((s) => (ex.kind === 'bodyweight' ? s.reps : e1rm(s.load, s.reps, h.bodyweight, ex.bwShare)))),
  }));
  const best = series.reduce((m, s) => Math.max(m, s.e1rm), 0);
  const before = series.slice(0, -1).reduce((m, s) => Math.max(m, s.e1rm), 0);
  return {
    ex, p: prescribe(ex, sets, feels), series, best,
    pr: series.length > 1 && series.at(-1)!.e1rm > before,
    lastAt: sets.at(-1)?.at ?? null, sets,
  };
}

// ---- The body ----------------------------------------------------------------
// Hours since each group was last fed: the iron for the upper body, the road
// and the stairs for the legs.
export function rested(h: Hunt, now = Date.now()): Record<Group, number> {
  const groupOf = new Map(h.exercises.map((e) => [e.id, e.group]));
  const out: Record<Group, number> = { push: Infinity, pull: Infinity, arms: Infinity, core: Infinity, legs: Infinity };
  for (const s of h.sets) {
    const g = groupOf.get(s.exerciseId);
    if (g) out[g] = Math.min(out[g], (now - Date.parse(s.at)) / HOUR);
  }
  for (const a of h.activities) {
    if (a.kind === 'run' || a.kind === 'stairs') out.legs = Math.min(out.legs, (now - Date.parse(a.startedAt)) / HOUR);
  }
  return out;
}
// How lit a group is: fed today burns bright, a week unfed is dark.
export const freshness = (hours: number) => Math.max(0, Math.min(1, 1 - hours / 168));
export const ago = (hours: number) => (!Number.isFinite(hours) ? 'never yet' : hours < 20 ? 'today' : hours < 44 ? 'yesterday' : `${Math.round(hours / 24)} days ago`);

// Where each group sits on the two photographs, as fractions of the frame.
export type Mark = { group: Group; x: number; y: number; side: 'l' | 'r' };
export const BACK_MARKS: Mark[] = [
  { group: 'pull', x: 0.8, y: 0.28, side: 'l' },
  { group: 'arms', x: 0.53, y: 0.37, side: 'r' },
  { group: 'push', x: 0.15, y: 0.31, side: 'r' },
];
export const FRONT_MARKS: Mark[] = [
  { group: 'push', x: 0.33, y: 0.58, side: 'r' },
  { group: 'core', x: 0.44, y: 0.82, side: 'r' },
];

// ---- The ledger ----------------------------------------------------------------
export type Source = 'run' | 'iron' | 'stairs' | 'climb';
export const SOURCES: Source[] = ['run', 'iron', 'stairs', 'climb'];
const sourceOf = (k: ActivityKind): Source | null =>
  k === 'run' ? 'run' : k === 'strength' ? 'iron' : k === 'stairs' ? 'stairs' : k === 'boulder' ? 'climb' : null;
// A visit to the iron with no watch on it: 25 kJ a minute, six kilocalories.
const IRON_KJ_PER_MIN = 25;

export type Ledger = {
  week: Record<Source, number>;             // kJ spent, the last seven days
  days: { date: string; by: Record<Source, number> }[];  // the same, a day at a time, oldest first
  workWeek: number;                         // kJ of mechanical work on the iron, the week
  energyAll: number;                        // kJ spent, all time
  workAll: number;
  mass: number;                             // micrograms of you he has taken
};

const zero = (): Record<Source, number> => ({ run: 0, iron: 0, stairs: 0, climb: 0 });
const localDay = (at: number) => { const d = new Date(at); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export function ledger(h: Hunt, now = Date.now()): Ledger {
  const exById = new Map(h.exercises.map((e) => [e.id, e]));
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const from = start.getTime() - 6 * DAY;
  const days = Array.from({ length: 7 }, (_, i) => ({ date: localDay(from + i * DAY), by: zero() }));
  const week = zero();
  let energyAll = 0, workAll = 0, workWeek = 0;
  const add = (at: number, src: Source, kj: number) => {
    energyAll += kj;
    const i = Math.floor((at - from) / DAY);
    if (i >= 0 && i < 7) { week[src] += kj; days[i]!.by[src] += kj; }
  };
  const ironDays = new Set<string>();
  for (const a of h.activities) {
    const src = sourceOf(a.kind);
    if (!src) continue;
    const at = Date.parse(a.startedAt);
    if (src === 'iron') ironDays.add(localDay(at));
    add(at, src, a.kj);
  }
  for (const b of bouts(h.sets)) {
    const at = Date.parse(b[0]!.at);
    // The watch was not on for this one: its length stands in.
    if (!ironDays.has(localDay(at))) add(at, 'iron', ((Date.parse(b.at(-1)!.at) - at) / 60_000 + 3) * IRON_KJ_PER_MIN);
    for (const s of b) {
      const ex = exById.get(s.exerciseId);
      if (!ex) continue;
      const w = setWork(ex, s, h.bodyweight) / 1000;
      workAll += w;
      if (at >= from) workWeek += w;
    }
  }
  return { week, days, workWeek, energyAll, workAll, mass: massMicrograms(energyAll) };
}

// ---- The transformation ----------------------------------------------------------
// The week's energy as a flow, in fractions of the plate: each source a bar on
// the left, splitting into work (a quarter) and heat (the rest) in the middle,
// and a hairline from both into him on the right.
export type Band = { from: [number, number, number]; to: [number, number, number]; kj: number; kind: 'work' | 'heat' | 'him'; source: Source | null };
export type Node = { id: string; x: number; y0: number; y1: number; kj: number };
export type Flow = { nodes: Node[]; bands: Band[]; total: number };

export function flow(week: Record<Source, number>): Flow {
  const live = SOURCES.filter((s) => week[s] > 0).sort((a, b) => week[b] - week[a]);
  const total = live.reduce((t, s) => t + week[s], 0);
  if (!total) return { nodes: [], bands: [], total: 0 };
  const TOP = 0.08, SPAN = 0.84, GAP = 0.05;
  const usable = SPAN - GAP * (live.length - 1);
  const nodes: Node[] = [];
  const bands: Band[] = [];
  // The sources, stacked, each at least a sliver tall so it can be named.
  const heights = live.map((s) => Math.max(0.035, (week[s] / total) * usable));
  const scale = usable / heights.reduce((a, b) => a + b, 0);
  let y = TOP;
  const L = 0.07, M = 0.62, R = 0.93;
  const work = { id: 'work', x: M, y0: 0.1, y1: 0.1 + EFFICIENCY * 0.62, kj: total * EFFICIENCY };
  const heat = { id: 'heat', x: M, y0: work.y1 + 0.08, y1: work.y1 + 0.08 + (1 - EFFICIENCY) * 0.62, kj: total * (1 - EFFICIENCY) };
  let wy = work.y0, hy = heat.y0;
  live.forEach((s, i) => {
    const hgt = heights[i]! * scale;
    nodes.push({ id: s, x: L, y0: y, y1: y + hgt, kj: week[s] });
    const share = week[s] / total;
    const wh = (work.y1 - work.y0) * share, hh = (heat.y1 - heat.y0) * share;
    const split = y + hgt * EFFICIENCY;
    bands.push({ from: [L, y, split], to: [M, wy, wy + wh], kj: week[s] * EFFICIENCY, kind: 'work', source: s });
    bands.push({ from: [L, split, y + hgt], to: [M, hy, hy + hh], kj: week[s] * (1 - EFFICIENCY), kind: 'heat', source: s });
    wy += wh; hy += hh;
    y += hgt + GAP;
  });
  const him = { id: 'him', x: R, y0: 0.47, y1: 0.49, kj: total };
  nodes.push(work, heat, him);
  bands.push({ from: [M, (work.y0 + work.y1) / 2 - 0.004, (work.y0 + work.y1) / 2 + 0.004], to: [R, 0.474, 0.48], kj: 0, kind: 'him', source: null });
  bands.push({ from: [M, (heat.y0 + heat.y1) / 2 - 0.004, (heat.y0 + heat.y1) / 2 + 0.004], to: [R, 0.482, 0.488], kj: 0, kind: 'him', source: null });
  return { nodes, bands, total };
}

// A point along a band's middle at u in 0..1, pushed off it by v in -1..1.
export function along(b: Band, u: number, v = 0): [number, number] {
  const e = u * u * (3 - 2 * u);
  const x0 = b.from[0], x1 = b.to[0];
  const top = b.from[1] + (b.to[1] - b.from[1]) * e, bottom = b.from[2] + (b.to[2] - b.from[2]) * e;
  return [x0 + (x1 - x0) * u, (top + bottom) / 2 + ((bottom - top) / 2) * v];
}

export const mj = (kj: number) => (kj >= 1000 ? `${(kj / 1000).toFixed(1)} MJ` : `${Math.round(kj)} kJ`);
export const pace = (a: GarminActivity) => {
  if (!a.meters) return '';
  const s = a.seconds / (a.meters / 1000);
  return `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}/km`;
};
export const hms = (seconds: number) => {
  const h = Math.floor(seconds / 3600), m = Math.round((seconds % 3600) / 60);
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
};

// Kilometres run each of the last n weeks, oldest first, and the zone two share.
export function road(h: Hunt, weeks = 12, now = Date.now()) {
  const out = Array<number>(weeks).fill(0);
  let z2 = 0, zAll = 0;
  for (const a of h.activities) {
    if (a.kind !== 'run') continue;
    const i = weeks - 1 - Math.floor((now - Date.parse(a.startedAt)) / (7 * DAY));
    if (i >= 0 && i < weeks) out[i]! += a.meters / 1000;
    if (i >= weeks - 4) { z2 += a.zones[1] ?? 0; zAll += a.zones.reduce((x, y) => x + y, 0); }
  }
  return { km: out, z2: zAll ? z2 / zAll : 0 };
}

// ---- The demo -----------------------------------------------------------------
// Ten weeks of him as he is: long zone two runs, the stairs once a week, and
// the iron four days of seven, climbing slowly.
export function sampleHunt(now = Date.now()): Hunt {
  let seed = 4127;
  const r = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const exercises: HuntExercise[] = EXERCISES.map((e, i) => ({ ...e, id: i + 1, archived: false }));
  const byName = (n: string) => exercises.find((e) => e.name === n)!;
  const sets: HuntSetRow[] = [];
  const feels: Hunt['feels'] = [];
  const activities: GarminActivity[] = [];
  const PUSH = ['Bench Press', 'Chest Press', 'Weighted Dips', 'Machine Fly', 'Tricep Ext', 'Egyptian Raise'];
  const PULL = ['Muscle Ups', 'Weighted Pullup', 'Lat Pulldown', 'Cable Row', 'Preacher Curl', 'Bayesian Curl', 'Core'];
  let uuid = 0;
  const id = () => `00000000-0000-4000-8000-${String(++uuid).padStart(12, '0')}`;
  const at = (back: number, hour: number) => { const d = new Date(now - back * DAY); d.setHours(hour, 0, 0, 0); return d.getTime(); };
  const act = (t: number, kind: ActivityKind, name: string, minutes: number, km: number, kj: number, hr: number, z2 = 0.7) => {
    const s = minutes * 60;
    activities.push({ id: String(t), kind, name, startedAt: new Date(t).toISOString(), seconds: s, meters: km * 1000, ascent: kind === 'stairs' ? 1050 : km * 11,
      hrAvg: hr, hrMax: hr + 18, kj, load: kind === 'run' ? minutes * 1.5 : 60, zones: kind === 'run' ? [s * 0.08, s * z2, s * (0.9 - z2), s * 0.02, 0] : [0, 0, 0, 0, 0] });
  };
  for (let back = 70; back >= 1; back--) {
    const dow = (70 - back) % 7;
    const week = (70 - back) / 7;
    if (dow === 6) continue;  // the seventh day
    if (dow === 5) { const km = 24 + week * 0.8 + r() * 3; act(at(back, 8), 'run', 'Long Run', km * 6.05, km, km * 310, 148); }
    if (dow === 1 || dow === 3) { const km = 11 + r() * 4; act(at(back, 7), 'run', 'Zone 2', km * 6.3, km, km * 290, 139, 0.86); }
    if (dow === 2) act(at(back, 18), 'stairs', 'Stair Stepper', 62, 0, 3600, 151);
    if (dow === 0 || dow === 1 || dow === 3 || dow === 4) {
      const list = dow % 2 === 0 ? PUSH : PULL;
      const t0 = at(back, 17);
      act(t0, 'strength', 'Strength', 85, 0, 1900, 118);
      let t = t0;
      for (const name of list.slice(0, 4 + Math.floor(r() * 2))) {
        const ex = byName(name);
        const done = sets.filter((s) => s.exerciseId === ex.id);
        const p = prescribe(ex, done, Object.fromEntries(feels.filter((f) => f.exerciseId === ex.id).map((f) => [f.date, f.feel])));
        p.sets.forEach((x, i) => {
          t += (i ? ex.rest : 240) * 1000;
          const miss = r() < 0.18 ? -1 - Math.floor(r() * 2) : 0;
          sets.push({ uuid: id(), exerciseId: ex.id, at: new Date(t).toISOString(), idx: i, load: x.load, reps: Math.max(1, x.reps + miss), source: 'device' });
        });
        const f = r();
        feels.push({ exerciseId: ex.id, date: new Date(t).toISOString().slice(0, 10), feel: f < 0.25 ? 'easy' : f < 0.85 ? 'solid' : 'grind' });
      }
    }
  }
  const days: GarminDay[] = Array.from({ length: 14 }, (_, i) => ({
    date: localDay(now - (13 - i) * DAY), readiness: Math.round(55 + r() * 35), hrvStatus: 'balanced', sleepScore: Math.round(68 + r() * 22),
    bodyBattery: Math.round(55 + r() * 40), restingHr: 44 + Math.round(r() * 4), acuteLoad: 880, chronicLoad: 790,
  }));
  const liftGroups = (() => {
    const g = new Map(exercises.map((e) => [e.id, e.group]));
    return bouts(sets).map((b) => ({ at: b[0]!.at, group: g.get(b[0]!.exerciseId)! }));
  })();
  const today = localDay(now);
  return {
    exercises, sets, feels, activities, days, bodyweight: 75, garminSyncedAt: new Date(now - 25 * 60_000).toISOString(),
    verdict: verdict({ now: new Date(now), today, days, activities, lifts: liftGroups }),
  };
}
