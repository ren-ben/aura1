import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EXERCISES, bouts, e1rm, massMicrograms, prescribe, setWork, verdict,
  type Exercise, type GarminActivity, type GarminDay, type HuntSet,
} from '../src/index.ts';

const ex = (name: string): Exercise => ({ ...EXERCISES.find((e) => e.name === name)!, id: 1 });
let n = 0;
const set = (at: string, idx: number, load: number, reps: number): HuntSet =>
  ({ uuid: `u${n++}`, exerciseId: 1, at, idx, load, reps });
const bout = (day: string, loads: [number, number][]) => loads.map(([l, r], i) => set(`${day}T17:0${i}:00.000Z`, i, l, r));

test('names fit the glass', () => {
  for (const e of EXERCISES) assert.ok(e.name.length <= 15, e.name);
});

test('no history: the seeded start', () => {
  const p = prescribe(ex('Chest Press'), [], {});
  assert.equal(p.move, 'new');
  assert.deepEqual(p.sets[0], { load: 105, reps: 8 });
  assert.equal(p.sets.length, 4);
});

test('top of the range: one step up, back to the bottom', () => {
  const p = prescribe(ex('Chest Press'), bout('2026-09-20', [[105, 12], [95, 12], [85, 12], [85, 12]]), {});
  assert.equal(p.move, 'up');
  assert.deepEqual(p.sets[0], { load: 110, reps: 8 });
});

test('grind holds the load at the top of the range', () => {
  const p = prescribe(ex('Chest Press'), bout('2026-09-20', [[105, 12], [95, 12], [85, 12]]), { '2026-09-20': 'grind' });
  assert.equal(p.move, 'hold');
  assert.deepEqual(p.sets[0], { load: 105, reps: 12 });
});

test('inside the range: one more rep, two when easy', () => {
  const s = bout('2026-09-20', [[105, 9], [95, 12], [85, 12]]);
  assert.deepEqual(prescribe(ex('Chest Press'), s, {}).sets[0], { load: 105, reps: 10 });
  assert.deepEqual(prescribe(ex('Chest Press'), s, { '2026-09-20': 'easy' }).sets[0], { load: 105, reps: 11 });
});

test('two misses under the range: one step down', () => {
  const s = [...bout('2026-09-18', [[110, 6]]), ...bout('2026-09-20', [[110, 7]])];
  const p = prescribe(ex('Chest Press'), s, {});
  assert.equal(p.move, 'down');
  assert.deepEqual(p.sets[0], { load: 105, reps: 8 });
});

test('back-offs drop by the learned drop, at the top of the range', () => {
  const s = bout('2026-09-20', [[105, 10], [95, 12], [85, 12], [85, 12]]);
  const p = prescribe(ex('Chest Press'), s, {});
  assert.deepEqual(p.sets.map((x) => x.load), [105, 95, 85, 75]);
  assert.deepEqual(p.sets.slice(1).map((x) => x.reps), [12, 12, 12]);
});

test('back-offs default to a tenth, rounded to the step, never below zero', () => {
  const p = prescribe(ex('Bench Press'), [], {});
  assert.deepEqual(p.sets.map((x) => x.load), [100, 90, 80, 70]);
  const light = prescribe({ ...ex('Weighted Pullup'), start: 5 }, [], {});
  assert.ok(light.sets.every((x) => x.load >= 0));
});

test('muscle ups progress in reps only, keeping the fall-off', () => {
  const p = prescribe(ex('Muscle Ups'), bout('2026-09-20', [[0, 15], [0, 10], [0, 7], [0, 6]]), {});
  assert.deepEqual(p.sets, [{ load: 0, reps: 16 }, { load: 0, reps: 11 }, { load: 0, reps: 7 }, { load: 0, reps: 6 }]);
});

test('core is a tick', () => {
  assert.deepEqual(prescribe(ex('Core'), [], {}).sets, [{ load: 0, reps: 1 }]);
});

test('bouts split sets three hours apart', () => {
  const s = [set('2026-09-20T17:00:00.000Z', 0, 100, 8), set('2026-09-20T17:05:00.000Z', 1, 90, 10), set('2026-09-21T08:00:00.000Z', 0, 100, 9)];
  assert.equal(bouts(s).length, 2);
});

test('e1rm is Epley on the added load', () => {
  assert.equal(Math.round(e1rm(100, 5, 75, 0)), 117);
  assert.equal(Math.round(e1rm(40, 12, 75, 1)), 86);
});

test('work is reps x mass x g x path', () => {
  assert.equal(Math.round(setWork(ex('Bench Press'), { load: 100, reps: 10 }, 75)), Math.round(10 * 100 * 9.81 * 0.4));
  assert.equal(Math.round(setWork(ex('Weighted Dips'), { load: 40, reps: 12 }, 75)), Math.round(12 * 115 * 9.81 * 0.5));
});

test('mass taken is E / c^2 in micrograms', () => {
  assert.ok(Math.abs(massMicrograms(89875.517873681764) - 1) < 1e-9);
});

// ---- The verdict --------------------------------------------------------
const day = (date: string, d: Partial<GarminDay> = {}): GarminDay => ({
  date, readiness: 70, hrvStatus: 'balanced', sleepScore: 80, bodyBattery: 70, restingHr: 48, acuteLoad: null, chronicLoad: null, ...d,
});
const run = (startedAt: string, minutes: number, d: Partial<GarminActivity> = {}): GarminActivity => ({
  id: startedAt, kind: 'run', name: 'Run', startedAt, seconds: minutes * 60, meters: minutes * 170, ascent: 50,
  hrAvg: 145, hrMax: 160, kj: minutes * 45, load: 80, zones: [0, 0, 0, 0, 0], ...d,
});
const lift = (at: string, group: 'push' | 'pull' | 'arms') => ({ at, group });
const NOW = new Date('2026-09-27T06:00:00.000Z');

test('sick: HRV low two days and a broken night', () => {
  const v = verdict({ now: NOW, today: '2026-09-27', days: [day('2026-09-26', { hrvStatus: 'low' }), day('2026-09-27', { hrvStatus: 'low', sleepScore: 30 })], activities: [], lifts: [] });
  assert.equal(v.word, 'REST');
});

test('one bad night alone never forces rest', () => {
  const v = verdict({ now: NOW, today: '2026-09-27', days: [day('2026-09-27', { readiness: 20, sleepScore: 35 })], activities: [], lifts: [] });
  assert.notEqual(v.word, 'REST');
  assert.equal(v.soft, true);
});

test('the seventh day after six trained', () => {
  const lifts = ['21', '22', '23', '24', '25', '26'].map((d) => lift(`2026-09-${d}T17:00:00.000Z`, 'push'));
  assert.equal(verdict({ now: NOW, today: '2026-09-27', days: [], activities: [], lifts }).word, 'REST');
});

test('after a long run: iron on the upper group rested longest', () => {
  const v = verdict({ now: NOW, today: '2026-09-27', days: [], activities: [run('2026-09-26T08:00:00.000Z', 190)],
    lifts: [lift('2026-09-25T17:00:00.000Z', 'push'), lift('2026-09-22T17:00:00.000Z', 'pull')] });
  assert.equal(v.word, 'IRON');
  assert.equal(v.group, 'pull');
});

test('three days without a run: run, long when the last long one is a week old', () => {
  const v = verdict({ now: NOW, today: '2026-09-27', days: [], activities: [run('2026-09-23T08:00:00.000Z', 50), run('2026-09-10T08:00:00.000Z', 180)],
    lifts: [lift('2026-09-26T17:00:00.000Z', 'push'), lift('2026-09-25T17:00:00.000Z', 'pull')] });
  assert.equal(v.word, 'RUN');
  assert.equal(v.long, true);
});

test('a group unworked three days: iron on it', () => {
  const v = verdict({ now: NOW, today: '2026-09-27', days: [], activities: [run('2026-09-26T08:00:00.000Z', 50)],
    lifts: [lift('2026-09-26T17:00:00.000Z', 'pull'), lift('2026-09-23T17:00:00.000Z', 'push')] });
  assert.equal(v.word, 'IRON');
  assert.equal(v.group, 'push');
});

test('five days without stairs: stairs', () => {
  const v = verdict({ now: NOW, today: '2026-09-27', days: [], activities: [run('2026-09-26T08:00:00.000Z', 50)],
    lifts: [lift('2026-09-26T17:00:00.000Z', 'pull'), lift('2026-09-25T17:00:00.000Z', 'push')] });
  assert.equal(v.word, 'STAIRS');
});

test('nothing owed: an easy run', () => {
  const v = verdict({ now: NOW, today: '2026-09-27', days: [],
    activities: [run('2026-09-26T08:00:00.000Z', 50), run('2026-09-24T08:00:00.000Z', 40, { kind: 'stairs' })],
    lifts: [lift('2026-09-26T17:00:00.000Z', 'pull'), lift('2026-09-25T17:00:00.000Z', 'push')] });
  assert.equal(v.word, 'RUN');
  assert.equal(v.long, false);
});

test('every verdict has a line and a short form for the glass', () => {
  const v = verdict({ now: NOW, today: '2026-09-27', days: [], activities: [], lifts: [] });
  assert.ok(v.line.length > 10);
  assert.ok(v.short.length <= 15);
});

test('once today is trained, he speaks of tomorrow', () => {
  const lifts = [lift('2026-09-25T17:00:00.000Z', 'push'), lift('2026-09-24T17:00:00.000Z', 'pull')];
  const before = verdict({ now: NOW, today: '2026-09-27', days: [], activities: [run('2026-09-22T08:00:00.000Z', 50)], lifts });
  assert.equal(before.when, 'today');
  assert.equal(before.word, 'RUN');
  // He ran as told: the word moves on to tomorrow, and the run counts.
  const after = verdict({ now: NOW, today: '2026-09-27', days: [], activities: [run('2026-09-22T08:00:00.000Z', 50), run('2026-09-27T05:00:00.000Z', 60)], lifts });
  assert.equal(after.when, 'tomorrow');
  assert.notEqual(after.word, 'RUN');
});

test('a short walk is not a hunt', () => {
  const v = verdict({ now: NOW, today: '2026-09-27', days: [], activities: [run('2026-09-27T05:00:00.000Z', 12)], lifts: [] });
  assert.equal(v.when, 'today');
});
