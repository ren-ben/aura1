// The Hunt: the coach that says what to lift next, the verdict that says
// what the day is for, and the ledger of the work done, in joules. Pure
// functions, so the API, the web and the tests agree on every number.
import { z } from 'zod';

export type Kind = 'barbell' | 'machine' | 'cable' | 'dumbbell' | 'bodyweight' | 'weighted';
export type Group = 'push' | 'pull' | 'arms' | 'core' | 'legs';
// The movements he is drawn in; run and stairs are for the Garmin side.
// Each exercise's scene in the art pack (packages/art/src/gymscenes.ts), and
// the three the verdict adds: the jog, the stairs, the rest.
export const POSES = [
  'bench', 'incline', 'chestpress', 'dips', 'cablefly', 'machinefly', 'tricep', 'latpush', 'muscleup', 'pullup', 'pulldown',
  'onearm', 'cablerow', 'bbrow', 'chestsup', 'rowmachine', 'reversefly', 'egyptian', 'preacher', 'bayesian', 'deadlift', 'core',
  'jog', 'stairs', 'rest',
] as const;
export type Pose = (typeof POSES)[number];
export type Feel = 'easy' | 'solid' | 'grind';
export const FEELS: Feel[] = ['easy', 'solid', 'grind'];

// load: the added load (the stack, the bar, the belt); bwShare: how much of
// the body moves with it; path: the nominal distance the load travels a rep,
// in metres; start: the first prescription's load (reps for bodyweight).
export type ExerciseDef = {
  name: string; kind: Kind; group: Group; sets: number; repLo: number; repHi: number;
  step: number; bwShare: number; path: number; pose: Pose; rest: number; start: number;
};
export type Exercise = ExerciseDef & { id: number };

const def = (name: string, kind: Kind, group: Group, sets: number, [repLo, repHi]: [number, number], step: number,
  start: number, pose: Pose, path: number, bwShare = 0, rest = sets === 4 ? 180 : 120): ExerciseDef =>
  ({ name, kind, group, sets, repLo, repHi, step, bwShare, path, pose, rest, start });

// His iron, as he gave it. Loads per side for the cable fly.
export const EXERCISES: ExerciseDef[] = [
  def('Bench Press', 'barbell', 'push', 4, [6, 10], 2.5, 100, 'bench', 0.4),
  def('Incline Bench', 'barbell', 'push', 4, [8, 12], 2.5, 70, 'incline', 0.45),
  def('Chest Press', 'machine', 'push', 4, [8, 12], 5, 105, 'chestpress', 0.4),
  def('Weighted Dips', 'weighted', 'push', 4, [8, 12], 2.5, 40, 'dips', 0.5, 1),
  def('Cable Fly', 'cable', 'push', 3, [10, 14], 2.5, 27.5, 'cablefly', 0.5),
  def('Machine Fly', 'machine', 'push', 3, [12, 15], 5, 70, 'machinefly', 0.4),
  def('Tricep Ext', 'machine', 'arms', 3, [15, 20], 5, 50, 'tricep', 0.3),
  def('Lat Pushdown', 'cable', 'pull', 3, [10, 15], 2.5, 30, 'latpush', 0.6),
  def('Muscle Ups', 'bodyweight', 'pull', 4, [1, 99], 0, 15, 'muscleup', 1.1, 1, 180),
  def('Weighted Pullup', 'weighted', 'pull', 4, [8, 12], 2.5, 17.5, 'pullup', 0.6, 1),
  def('Lat Pulldown', 'cable', 'pull', 4, [8, 12], 5, 75, 'pulldown', 0.6),
  def('1-Arm Pulldown', 'cable', 'pull', 3, [8, 12], 2.5, 80, 'onearm', 0.55),
  def('Cable Row', 'cable', 'pull', 4, [8, 12], 5, 70, 'cablerow', 0.5),
  def('Barbell Row', 'barbell', 'pull', 4, [8, 12], 2.5, 70, 'bbrow', 0.45),
  def('Chest Sup Row', 'machine', 'pull', 3, [8, 12], 2.5, 45, 'chestsup', 0.4),
  def('Row Machine', 'machine', 'pull', 3, [10, 12], 5, 65, 'rowmachine', 0.4),
  def('Reverse Fly', 'machine', 'pull', 3, [12, 15], 5, 40, 'reversefly', 0.4),
  def('Egyptian Raise', 'cable', 'arms', 3, [10, 15], 2.5, 30, 'egyptian', 0.5),
  def('Preacher Curl', 'machine', 'arms', 3, [8, 12], 2.5, 50, 'preacher', 0.4),
  def('Bayesian Curl', 'cable', 'arms', 3, [8, 10], 2.5, 32.5, 'bayesian', 0.45),
  def('Deadlift', 'barbell', 'legs', 3, [3, 6], 5, 130, 'deadlift', 0.55, 0, 180),
  def('Core', 'bodyweight', 'core', 1, [1, 1], 0, 1, 'core', 0, 0, 60),
];

// A set: idx 0 is the top set of its bout, the rest are back-offs.
export type HuntSet = { uuid: string; exerciseId: number; at: string; idx: number; load: number; reps: number };
export type Target = { load: number; reps: number };
export type Prescription = { sets: Target[]; move: 'new' | 'up' | 'hold' | 'down'; last: Target[] | null };

// Sets more than three hours apart belong to different visits to the gym.
const GAP = 3 * 3600_000;
export function bouts<T extends { at: string }>(sets: T[]): T[][] {
  const sorted = [...sets].sort((a, b) => a.at.localeCompare(b.at));
  const out: T[][] = [];
  let lastAt = -Infinity;
  for (const s of sorted) {
    const at = Date.parse(s.at);
    if (at - lastAt > GAP) out.push([]);
    out[out.length - 1]!.push(s);
    lastAt = at;
  }
  return out;
}

const round = (v: number, step: number) => (step > 0 ? Math.round(v / step) * step : v);
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor((s.length - 1) / 2)]! : 0;
};
const bump = (feel: Feel | undefined) => (feel === 'easy' ? 2 : feel === 'grind' ? 0 : 1);

// feels: the feel of each bout of this exercise, by the bout's date.
export function prescribe(ex: Exercise | ExerciseDef, sets: HuntSet[], feels: Record<string, Feel>): Prescription {
  if (ex.group === 'core') return { sets: [{ load: 0, reps: 1 }], move: 'new', last: null };
  const all = bouts(sets).map((b) => [...b].sort((x, y) => x.idx - y.idx));
  const last = all[all.length - 1];
  const lastTargets = last ? last.map(({ load, reps }) => ({ load, reps })) : null;

  // Bodyweight: the reps climb, and every set keeps the fall-off of the last visit.
  if (ex.kind === 'bodyweight') {
    if (!last) return { sets: fallOff(ex.start, [1, 0.67, 0.47, 0.4].slice(0, ex.sets)), move: 'new', last: null };
    const top = last[0]!.reps + bump(feels[last[0]!.at.slice(0, 10)]);
    const ratios = Array.from({ length: ex.sets }, (_, i) => (last[i] ?? last[last.length - 1]!).reps / last[0]!.reps);
    return { sets: fallOff(top, ratios), move: 'up', last: lastTargets };
  }

  let top: Target, move: Prescription['move'];
  if (!last) {
    top = { load: ex.start, reps: ex.repLo };
    move = 'new';
  } else {
    const t = last[0]!, feel = feels[t.at.slice(0, 10)];
    const before = all[all.length - 2]?.[0];
    if (t.reps >= ex.repHi && feel !== 'grind') { top = { load: t.load + ex.step, reps: ex.repLo }; move = 'up'; }
    else if (t.reps < ex.repLo && before && before.reps < ex.repLo && before.load === t.load) {
      top = { load: Math.max(0, t.load - ex.step), reps: ex.repLo }; move = 'down';
    } else { top = { load: t.load, reps: Math.max(ex.repLo, Math.min(ex.repHi, t.reps + bump(feel))) }; move = 'hold'; }
  }

  // The back-offs: his own drop from set to set, learned from his recent visits.
  const drops = all.slice(-4).flatMap((b) => b.slice(1).map((s, i) => b[i]!.load - s.load)).filter((d) => d > 0);
  const drop = drops.length ? median(drops) : Math.max(ex.step, round(top.load * 0.1, ex.step || 1));
  const out = [top];
  for (let i = 1; i < ex.sets; i++) out.push({ load: Math.max(0, round(top.load - drop * i, ex.step || 0.5)), reps: ex.repHi });
  return { sets: out, move, last: lastTargets };
}

function fallOff(top: number, ratios: number[]): Target[] {
  return ratios.map((r) => ({ load: 0, reps: Math.max(1, Math.round(top * r)) }));
}

// Epley, on everything moved, given back as the added load.
export function e1rm(load: number, reps: number, bw: number, bwShare: number): number {
  const mass = load + bw * bwShare;
  return (reps <= 1 ? mass : mass * (1 + reps / 30)) - bw * bwShare;
}

export const G = 9.81;
export const C = 299_792_458;
// Mechanical work on the load for a set, in joules.
export function setWork(ex: Pick<ExerciseDef, 'bwShare' | 'path'>, set: Target, bw: number): number {
  return set.reps * (set.load + bw * ex.bwShare) * G * ex.path;
}
// The sliver of you he has turned into himself: m = E / c^2, in micrograms.
export const massMicrograms = (kj: number) => ((kj * 1000) / (C * C)) * 1e9;
// The share of spent energy that becomes work, the rest heat.
export const EFFICIENCY = 0.25;

// ---- Garmin ---------------------------------------------------------------
export type ActivityKind = 'run' | 'stairs' | 'boulder' | 'strength' | 'other';
export type HrvStatus = 'balanced' | 'unbalanced' | 'low' | 'poor';
// zones: seconds spent in heart rate zones 1 to 5.
export type GarminActivity = {
  id: string; kind: ActivityKind; name: string; startedAt: string; seconds: number; meters: number; ascent: number;
  hrAvg: number | null; hrMax: number | null; kj: number; load: number | null; zones: number[];
};
export type GarminDay = {
  date: string; readiness: number | null; hrvStatus: HrvStatus | null; sleepScore: number | null;
  bodyBattery: number | null; restingHr: number | null; acuteLoad: number | null; chronicLoad: number | null;
};

// ---- The verdict ------------------------------------------------------------
// Six days trained, one rested; one bad night never forces a rest.
export type Word = 'REST' | 'IRON' | 'RUN' | 'STAIRS';
// when: the day it is for. Once today has been trained, he speaks of tomorrow.
export type Verdict = { word: Word; group: Group | null; long: boolean; soft: boolean; line: string; short: string; when: 'today' | 'tomorrow' };
export type VerdictInput = {
  now: Date; today: string; days: GarminDay[]; activities: GarminActivity[];
  // Every lift visit, by the group it mostly hit.
  lifts: { at: string; group: Group }[];
};

const HOUR = 3600_000;
const TRAINED_KINDS: ActivityKind[] = ['run', 'stairs', 'boulder', 'strength'];
const word = (n: number) => ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'][n] ?? String(n);

const TRAINING_MINUTES = 20;
const trainedOn = (date: string, { activities, lifts }: VerdictInput) =>
  lifts.some((l) => l.at.slice(0, 10) === date)
  || activities.some((a) => TRAINED_KINDS.includes(a.kind) && a.seconds >= TRAINING_MINUTES * 60 && a.startedAt.slice(0, 10) === date);

export function verdict(input: VerdictInput): Verdict {
  if (!trainedOn(input.today, input)) return { ...judge(input), when: 'today' };
  // Today's hunt is done: judge tomorrow morning, today counted as trained,
  // and tonight's recovery standing in for tomorrow's until it is measured.
  const tomorrow = new Date(Date.parse(`${input.today}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const last = input.days.find((d) => d.date === input.today);
  return {
    ...judge({ ...input, today: tomorrow, now: new Date(Date.parse(`${tomorrow}T05:00:00Z`)), days: last ? [...input.days, { ...last, date: tomorrow }] : input.days }),
    when: 'tomorrow',
  };
}

function judge({ now, today, days, activities, lifts }: VerdictInput): Omit<Verdict, 'when'> {
  const t = now.getTime();
  const dayOf = (date: string) => days.find((d) => d.date === date);
  const back = (n: number) => new Date(Date.parse(`${today}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);
  const todayDay = dayOf(today);
  const soft = (todayDay?.readiness ?? 100) < 40;
  const say = (w: Word, line: string, group: Group | null = null, long = false): Omit<Verdict, 'when'> => ({
    word: w, group, long, soft, line: soft && w !== 'REST' ? `${line} Readiness is low: fewer sets, nothing to failure.` : line,
    short: group ? `${w} ${group.toUpperCase()}` : long ? `${w} LONG` : w,
  });

  // 1. Sick or wrecked.
  const lowHrv = (d?: GarminDay) => d?.hrvStatus === 'low' || d?.hrvStatus === 'poor';
  if (lowHrv(todayDay) && lowHrv(dayOf(back(1)))
    && ((todayDay?.sleepScore ?? 100) < 40 || (todayDay?.readiness ?? 100) < 15)) {
    return say('REST', 'Your heart has been out of rhythm two days and the night broke you. Lie down. I will keep the watch.');
  }

  // 2. The seventh day.
  const trained = new Set([
    ...lifts.map((l) => l.at.slice(0, 10)),
    ...activities.filter((a) => TRAINED_KINDS.includes(a.kind) && a.seconds >= TRAINING_MINUTES * 60).map((a) => a.startedAt.slice(0, 10)),
  ]);
  let streak = 0;
  while (trained.has(back(streak + 1))) streak++;
  if (streak >= 6) return say('REST', `${word(streak)[0]!.toUpperCase()}${word(streak).slice(1)} days hunted. The seventh is mine. Rest, and let the iron settle into you.`);

  const since = (at: string | undefined) => (at ? (t - Date.parse(at)) / HOUR : Infinity);
  const lastOf = (kind: ActivityKind, min = 0) => activities.filter((a) => a.kind === kind && a.seconds >= min)
    .map((a) => a.startedAt).sort().at(-1);
  const lastLift = (g: Group) => lifts.filter((l) => l.group === g).map((l) => l.at).sort().at(-1);
  const rested = (g: Group) => since(lastLift(g));
  const upper: Group[] = ['push', 'pull'];
  const longest = upper.reduce((a, b) => (rested(b) > rested(a) ? b : a));
  const days_ = (h: number) => (Number.isFinite(h) ? Math.floor(h / 24) : 0);

  // 3. The legs still carry a long or hard run.
  const heavy = activities.find((a) => a.kind === 'run' && since(a.startedAt) <= 36
    && (a.seconds >= 90 * 60 || (a.load ?? 0) >= 200));
  if (heavy) {
    const km = Math.round(heavy.meters / 1000);
    const rest = days_(rested(longest));
    return say('IRON', `${km}k is still in your legs. Take the iron instead: ${longest}, ${rest ? `rested ${word(rest)} days` : 'never yet fed'}.`, longest);
  }

  // 4. Distance owed.
  const run = since(lastOf('run'));
  if (run >= 72) {
    const long = since(lastOf('run', 90 * 60)) >= 7 * 24;
    const d = days_(run);
    return say('RUN', `${d ? `${word(d)[0]!.toUpperCase()}${word(d).slice(1)} days` : 'Too long'} without distance. ${long
      ? 'Run long and slow, zone two, and let the hours do the work.' : 'Run easy, zone two, and keep the engine warm.'}`, null, long);
  }

  // 5. A group left hungry.
  if (rested(longest) >= 72) {
    const d = days_(rested(longest));
    return say('IRON', `${longest[0]!.toUpperCase()}${longest.slice(1)} has rested ${d ? `${word(d)} days` : 'since forever'}. Go and feed it.`, longest);
  }

  // 6. The stairs.
  if (since(lastOf('stairs')) >= 5 * 24) return say('STAIRS', 'Five days since the stairs. Climb, and count the floors for me.');

  // 7. Nothing owed.
  return say('RUN', 'Nothing is owed today. Run easy, zone two, and come back lighter.');
}

// ---- The wire -----------------------------------------------------------------
export const huntSetSchema = z.object({
  uuid: z.uuid(),
  exerciseId: z.number().int().positive(),
  at: z.iso.datetime(),
  idx: z.number().int().min(0).max(20),
  load: z.number().min(0).max(1000),
  reps: z.number().int().min(0).max(200),
});
export const huntFeelSchema = z.object({
  uuid: z.uuid(),
  exerciseId: z.number().int().positive(),
  date: z.iso.date(),
  feel: z.enum(['easy', 'solid', 'grind']),
});

export const garminActivitySchema = z.object({
  id: z.string().min(1).max(40),
  kind: z.enum(['run', 'stairs', 'boulder', 'strength', 'other']),
  name: z.string().max(120),
  startedAt: z.iso.datetime(),
  seconds: z.number().int().nonnegative(),
  meters: z.number().nonnegative(),
  ascent: z.number().nonnegative(),
  hrAvg: z.number().int().nullable(),
  hrMax: z.number().int().nullable(),
  kj: z.number().nonnegative(),
  load: z.number().nullable(),
  zones: z.array(z.number().nonnegative()).max(5),
});
export const garminDaySchema = z.object({
  date: z.iso.date(),
  readiness: z.number().int().nullable(),
  hrvStatus: z.enum(['balanced', 'unbalanced', 'low', 'poor']).nullable(),
  sleepScore: z.number().int().nullable(),
  bodyBattery: z.number().int().nullable(),
  restingHr: z.number().int().nullable(),
  acuteLoad: z.number().nullable(),
  chronicLoad: z.number().nullable(),
});
export const garminIngestSchema = z.object({
  activities: z.array(garminActivitySchema).max(500),
  days: z.array(garminDaySchema).max(60),
  bodyweight: z.number().min(30).max(200).nullable().optional(),
});
export type GarminIngest = z.infer<typeof garminIngestSchema>;
