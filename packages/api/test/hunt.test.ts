import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { sql } from 'drizzle-orm';
import { createDb, type Db } from '../src/db/client.ts';
import { seed } from '../src/db/seed.ts';
import { buildApp } from '../src/app.ts';

const url = process.env.TEST_DATABASE_URL ?? 'postgres://aura:aura@localhost:15434/aura_test';

let db: Db;
let close: () => Promise<void>;
let app: ReturnType<typeof buildApp>;

before(async () => {
  const created = createDb(url);
  db = created.db;
  close = () => created.pool.end();
  await migrate(db, { migrationsFolder: './drizzle' });
  app = buildApp(db, { logger: false, garmin: '' });
  await app.ready();
});

after(async () => { await app.close(); await close(); });

beforeEach(async () => {
  await db.execute(sql`TRUNCATE sessions, activities, folders, meta, hunt_sets, hunt_feels, exercises,
    garmin_activities, garmin_days RESTART IDENTITY CASCADE`);
  await seed(db);
});

const call = async (method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string, payload?: object) =>
  app.inject({ method, url: `/api/v1${path}`, payload });

type Hunt = {
  exercises: { id: number; name: string; group: string; archived: boolean }[];
  sets: { uuid: string; exerciseId: number; load: number; reps: number; source: string }[];
  feels: { exerciseId: number; date: string; feel: string }[];
  activities: { id: string; kind: string }[];
  days: { date: string; readiness: number | null }[];
  bodyweight: number;
  garminSyncedAt: string | null;
  verdict: { word: string; line: string };
};
const hunt = async () => (await call('GET', '/hunt')).json() as Hunt;
const idOf = async (name: string) => (await hunt()).exercises.find((e) => e.name === name)!.id;

const sync = (body: object) => call('POST', '/sync', { deviceId: 'aura-1', configVersion: 0, events: [], ...body });

test('the list is seeded once, however often it is asked for', async () => {
  const [a, b] = await Promise.all([hunt(), hunt()]);
  assert.equal(a.exercises.length, 22);
  assert.equal((await hunt()).exercises.length, 22);
  assert.equal(b.bodyweight, 75);
  assert.ok(a.verdict.line.length > 0);
});

test('a set sent twice from the device is stored once, and acked both times', async () => {
  const id = await idOf('Bench Press');
  const set = { uuid: randomUUID(), exerciseId: id, at: new Date().toISOString(), idx: 0, load: 100, reps: 8 };
  const first = (await sync({ sets: [set] })).json() as { acked: string[] };
  const again = (await sync({ sets: [set] })).json() as { acked: string[] };
  assert.deepEqual(first.acked, [set.uuid]);
  assert.deepEqual(again.acked, [set.uuid]);
  const h = await hunt();
  assert.equal(h.sets.length, 1);
  assert.equal(h.sets[0]!.source, 'device');
});

test('a set for an unknown exercise is rejected so the device lets it go', async () => {
  await hunt();
  const set = { uuid: randomUUID(), exerciseId: 999, at: new Date().toISOString(), idx: 0, load: 100, reps: 8 };
  const res = (await sync({ sets: [set] })).json() as { rejected: string[] };
  assert.deepEqual(res.rejected, [set.uuid]);
});

test('a feel from the device is kept, the latest word winning', async () => {
  const id = await idOf('Chest Press');
  await sync({ feels: [{ uuid: randomUUID(), exerciseId: id, date: '2026-09-26', feel: 'grind' }] });
  await sync({ feels: [{ uuid: randomUUID(), exerciseId: id, date: '2026-09-26', feel: 'easy' }] });
  assert.deepEqual((await hunt()).feels, [{ exerciseId: id, date: '2026-09-26', feel: 'easy' }]);
});

test('the device bundle carries the verdict and each exercise with its next sets', async () => {
  const id = await idOf('Chest Press');
  await call('POST', '/hunt/sets', { sets: [
    { uuid: randomUUID(), exerciseId: id, at: '2026-09-26T17:00:00.000Z', idx: 0, load: 105, reps: 12 },
    { uuid: randomUUID(), exerciseId: id, at: '2026-09-26T17:04:00.000Z', idx: 1, load: 95, reps: 12 },
  ] });
  const res = (await sync({})).json() as { today: { hunt: { word: string; liftingId: number;
    exercises: { id: number; name: string; sets: { load: number; reps: number }[]; last: string }[] } } };
  const h = res.today.hunt;
  assert.ok(['REST', 'IRON', 'RUN', 'STAIRS'].includes(h.word));
  assert.ok(h.liftingId > 0);
  const cp = h.exercises.find((e) => e.id === id)!;
  assert.deepEqual(cp.sets[0], { load: 110, reps: 8 });
  assert.equal(cp.last, '105x12 95x12');
  assert.equal(h.exercises.length, 22);
});

test('an archived exercise leaves the device list but keeps its history', async () => {
  const id = await idOf('Barbell Row');
  await call('PATCH', `/hunt/exercises/${id}`, { archived: true });
  const res = (await sync({})).json() as { today: { hunt: { exercises: { id: number }[] } } };
  assert.ok(!res.today.hunt.exercises.some((e) => e.id === id));
  assert.equal((await hunt()).exercises.find((e) => e.id === id)!.archived, true);
});

test('sets are corrected and removed from the phone', async () => {
  const id = await idOf('Bench Press');
  const uuid = randomUUID();
  await call('POST', '/hunt/sets', { sets: [{ uuid, exerciseId: id, at: new Date().toISOString(), idx: 0, load: 100, reps: 8 }] });
  await call('PATCH', `/hunt/sets/${uuid}`, { reps: 7 });
  assert.equal((await hunt()).sets[0]!.reps, 7);
  await call('DELETE', `/hunt/sets/${uuid}`);
  assert.equal((await hunt()).sets.length, 0);
});

test('Garmin ingest is idempotent and takes the bodyweight', async () => {
  const body = {
    activities: [{ id: '123', kind: 'run', name: 'Vienna Running', startedAt: '2026-09-20T07:00:00.000Z', seconds: 11400,
      meters: 31500, ascent: 350, hrAvg: 149, hrMax: 171, kj: 9800, load: 310, zones: [600, 5000, 4800, 900, 100] }],
    days: [{ date: '2026-09-26', readiness: 64, hrvStatus: 'balanced', sleepScore: 81, bodyBattery: 70, restingHr: 46, acuteLoad: 900, chronicLoad: 780 }],
    bodyweight: 75.4,
  };
  assert.equal((await call('POST', '/hunt/garmin', body)).statusCode, 204);
  assert.equal((await call('POST', '/hunt/garmin', body)).statusCode, 204);
  const h = await hunt();
  assert.equal(h.activities.length, 1);
  assert.equal(h.bodyweight, 75.4);
  assert.ok(h.garminSyncedAt);
});

test('refresh says plainly when there is no Garmin link', async () => {
  const res = await call('POST', '/hunt/garmin/refresh');
  assert.equal(res.statusCode, 503);
});

test('a new exercise joins the list; names longer than the glass are refused', async () => {
  const ex = { name: 'Hammer Curl', kind: 'dumbbell', group: 'arms', sets: 3, repLo: 8, repHi: 12, step: 2, bwShare: 0,
    path: 0.4, pose: 'preacher', rest: 120, start: 22 };
  assert.equal((await call('POST', '/hunt/exercises', ex)).statusCode, 201);
  assert.equal((await call('POST', '/hunt/exercises', { ...ex, name: 'A Name Far Too Long' })).statusCode, 400);
  assert.equal((await hunt()).exercises.length, 23);
});
