import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { eq, sql } from 'drizzle-orm';
import { createDb, type Db } from '../src/db/client.ts';
import { seed } from '../src/db/seed.ts';
import { meta, CONFIG_VERSION_KEY } from '../src/db/schema.ts';
import { buildApp } from '../src/app.ts';

const url = process.env.TEST_DATABASE_URL
  ?? 'postgres://aura:aura@localhost:15434/aura_test';

let db: Db;
let close: () => Promise<void>;
let app: ReturnType<typeof buildApp>;

before(async () => {
  const created = createDb(url);
  db = created.db;
  close = () => created.pool.end();
  await migrate(db, { migrationsFolder: './drizzle' });
  app = buildApp(db, { logger: false });
  await app.ready();
});

after(async () => { await app.close(); await close(); });

beforeEach(async () => {
  await db.execute(sql`TRUNCATE sessions, activities, folders, meta, todos,
    habit_entries, habits, quotes RESTART IDENTITY CASCADE`);
  await seed(db);
});

async function configVersion(): Promise<number> {
  const [row] = await db.select().from(meta).where(eq(meta.key, CONFIG_VERSION_KEY));
  return row!.value;
}

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
const call = (method: Method, path: string, payload?: object) =>
  app.inject({ method, url: `/api/v1${path}`, ...(payload ? { payload } : {}) });

type Folder = {
  id: number; name: string; archived: boolean;
  activities: { id: number; name: string; archived: boolean }[];
};
const folders = async () => (await call('GET', '/folders')).json() as Folder[];

test('GET /folders lists folders in order with their activities', async () => {
  const list = await folders();
  assert.deepEqual(list.map((f) => f.name), ['AXIOM', 'WORKSHOP', 'HERESY', 'DREAM', 'HUNT']);
  assert.deepEqual(list[0]!.activities.map((a) => a.name), ['coursework', 'problem sets']);
});

test('every catalog change bumps the config version', async () => {
  let version = await configVersion();
  const expectBump = async (response: { statusCode: number }, status: number) => {
    assert.equal(response.statusCode, status);
    const next = await configVersion();
    assert.equal(next, version + 1);
    version = next;
  };
  await expectBump(await call('POST', '/folders', { name: 'VESSEL' }), 201);
  await expectBump(await call('PATCH', '/folders/1', { name: 'AXIOMS' }), 204);
  await expectBump(await call('POST', '/folders/2/move', { direction: 'up' }), 204);
  await expectBump(await call('POST', '/activities', { folderId: 1, name: 'lectures' }), 201);
  await expectBump(await call('PATCH', '/activities/1', { archived: true }), 204);
});

test('moving a folder swaps it with its neighbour', async () => {
  await call('POST', '/folders/2/move', { direction: 'up' });
  assert.deepEqual((await folders()).slice(0, 2).map((f) => f.name), ['WORKSHOP', 'AXIOM']);
});

test('names longer than the device can show are rejected', async () => {
  assert.equal((await call('POST', '/folders', { name: 'ELEVENCHARS' })).statusCode, 400);
  const long = await call('POST', '/activities', { folderId: 1, name: 'sixteen chars xx' });
  assert.equal(long.statusCode, 400);
});

test('archived activities leave the device config but stay listed on the web', async () => {
  await call('PATCH', '/activities/1', { archived: true });
  const response = await call('POST', '/sync', { deviceId: 'aura-1', configVersion: 0, events: [] });
  const config = response.json().config as { activities: { id: number }[] };
  assert.ok(!config.activities.some((a) => a.id === 1));
  assert.equal((await folders())[0]!.activities[0]!.archived, true);
});

test('a manual session under ten minutes is refused', async () => {
  const created = await call('POST', '/sessions', {
    activityId: 1, startedAt: '2026-09-18T08:00:00.000Z', endedAt: '2026-09-18T08:09:00.000Z',
  });
  assert.equal(created.statusCode, 400);
});

test('a manual session is stored as manual and can be deleted', async () => {
  const created = await call('POST', '/sessions', {
    activityId: 1, startedAt: '2026-09-18T08:00:00.000Z', endedAt: '2026-09-18T09:00:00.000Z',
  });
  assert.equal(created.statusCode, 201);
  const rows = (await call('GET', '/sessions')).json() as { id: number; source: string; minutes: number }[];
  assert.equal(rows[0]!.source, 'manual');
  assert.equal(rows[0]!.minutes, 60);
  assert.equal((await call('DELETE', `/sessions/${rows[0]!.id}`)).statusCode, 204);
  assert.equal((await call('GET', '/sessions')).json().length, 0);
});

test('a manual session must end after it starts', async () => {
  const response = await call('POST', '/sessions', {
    activityId: 1, startedAt: '2026-09-18T09:00:00.000Z', endedAt: '2026-09-18T08:00:00.000Z',
  });
  assert.equal(response.statusCode, 400);
});

test('a session over 6 hours needs review until confirmed, and only then earns XP', async () => {
  await call('POST', '/sessions', {
    activityId: 1, startedAt: '2026-09-18T00:00:00.000Z', endedAt: '2026-09-18T08:00:00.000Z',
  });
  const rows = (await call('GET', '/sessions')).json() as { id: number; needsReview: boolean }[];
  assert.equal(rows[0]!.needsReview, true);
  assert.equal((await call('GET', '/stats')).json().bond.xp, 0);
  assert.equal((await call('POST', `/sessions/${rows[0]!.id}/confirm`)).statusCode, 204);
  assert.equal((await call('GET', '/sessions')).json()[0].needsReview, false);
  assert.equal((await call('GET', '/stats')).json().bond.xp, 360);  // 480 min * 0.5 * 1.5
});

test('stats derive XP, levels and form from sessions', async () => {
  await call('POST', '/sync', {
    deviceId: 'aura-1', configVersion: 1,
    events: [{
      uuid: '018f3b2a-4c5d-4e8f-9a0b-1c2d3e4f5a6b', activityId: 2,
      startedAt: new Date(Date.now() - 3_600_000).toISOString(),
      endedAt: new Date().toISOString(), clockSynced: true,
    }],
  });
  const stats = (await call('GET', '/stats')).json();
  assert.equal(stats.bond.xp, 75);  // 60 min * 1.25
  assert.equal(stats.bond.level, 1);
  assert.equal(stats.bond.nextLevelXp, 120);
  assert.equal(stats.form, 'stable');
  const activity = stats.activities.find((a: { id: number }) => a.id === 2);
  assert.equal(activity.xp, 75);
  assert.equal(activity.minutes, 60);
  assert.equal(activity.folder, 'AXIOM');
});

test('stats report dormant with no sessions at all', async () => {
  const stats = (await call('GET', '/stats')).json();
  assert.equal(stats.form, 'dormant');
  assert.equal(stats.lastSessionAt, null);
});

test('todos: create, tick, list open first, delete', async () => {
  await call('POST', '/todos', { body: 'write report', dueDate: '2026-09-20' });
  await call('POST', '/todos', { body: 'buy coffee' });
  assert.equal((await call('PATCH', '/todos/1', { done: true })).statusCode, 204);
  const list = (await call('GET', '/todos')).json() as { body: string; done: boolean }[];
  assert.deepEqual(list.map((t) => [t.body, t.done]), [['buy coffee', false], ['write report', true]]);
  assert.equal((await call('DELETE', '/todos/2')).statusCode, 204);
  assert.equal((await call('GET', '/todos')).json().length, 1);
});

test('habits: mark days done and read them back for a range', async () => {
  await call('POST', '/habits', { name: 'meditate' });
  assert.equal((await call('PUT', '/habits/1/entries/2026-09-18', { done: true })).statusCode, 204);
  await call('PUT', '/habits/1/entries/2026-09-19', { done: true });
  await call('PUT', '/habits/1/entries/2026-09-19', { done: false });
  await call('PUT', '/habits/1/entries/2026-08-01', { done: true });
  const [habit] = (await call('GET', '/habits?from=2026-09-01&to=2026-09-30')).json();
  assert.equal(habit.name, 'meditate');
  assert.deepEqual(habit.done, ['2026-09-18']);
});

test('archived habits are hidden', async () => {
  await call('POST', '/habits', { name: 'meditate' });
  await call('PATCH', '/habits/1', { archived: true });
  assert.equal((await call('GET', '/habits?from=2026-09-01&to=2026-09-30')).json().length, 0);
});

test('quotes: newest first, delete', async () => {
  await call('POST', '/quotes', { body: 'The will is the thing-in-itself.', source: 'Schopenhauer' });
  await call('POST', '/quotes', { body: 'Feed on insight.' });
  const list = (await call('GET', '/quotes')).json() as { source: string | null }[];
  assert.deepEqual(list.map((q) => q.source), [null, 'Schopenhauer']);
  assert.equal((await call('DELETE', '/quotes/1')).statusCode, 204);
  assert.equal((await call('GET', '/quotes')).json().length, 1);
});
