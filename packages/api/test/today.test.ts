import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { sql } from 'drizzle-orm';
import { createDb, type Db } from '../src/db/client.ts';
import { seed } from '../src/db/seed.ts';
import { habitEntries, habits, quotes, todos } from '../src/db/schema.ts';
import { applySync } from '../src/sync/service.ts';
import { localDate } from '../src/sync/today.ts';

const url = process.env.TEST_DATABASE_URL
  ?? 'postgres://aura:aura@localhost:15434/aura_test';

let db: Db;
let close: () => Promise<void>;

before(async () => {
  const created = createDb(url);
  db = created.db;
  close = () => created.pool.end();
  await migrate(db, { migrationsFolder: './drizzle' });
});

after(async () => { await close(); });

beforeEach(async () => {
  await db.execute(sql`TRUNCATE sessions, activities, folders, meta, todos,
    habit_entries, habits, quotes RESTART IDENTITY CASCADE`);
  await seed(db);
});

const today = localDate(new Date());
const shift = (days: number) => localDate(new Date(Date.now() + days * 86_400_000));
const sync = (ticks: object[] = []) =>
  applySync(db, { deviceId: 'aura-1', configVersion: 1, events: [], ticks: ticks as never });

test('today lists open todos due today or overdue, not later or undated ones', async () => {
  await db.insert(todos).values([
    { body: 'overdue', dueDate: shift(-2) },
    { body: 'today', dueDate: today },
    { body: 'tomorrow', dueDate: shift(1) },
    { body: 'someday', dueDate: null },
  ]);
  const { today: bundle } = await sync();
  assert.equal(bundle.date, today);
  assert.deepEqual(bundle.todos.map((t) => t.body), ['overdue', 'today']);
});

test('a todo tick from the device marks it done, and it stays listed for the day', async () => {
  const [todo] = await db.insert(todos).values({ body: 'write', dueDate: today }).returning();
  const { today: bundle } = await sync([{ kind: 'todo', id: todo!.id, done: true }]);
  assert.deepEqual(bundle.todos, [{ id: todo!.id, body: 'write', done: true }]);
  // Sending the same tick again changes nothing.
  const again = await sync([{ kind: 'todo', id: todo!.id, done: true }]);
  assert.equal(again.today.todos[0]!.done, true);
});

test('a todo ticked off on an earlier day drops out of today', async () => {
  await db.insert(todos).values({ body: 'old', dueDate: shift(-3), doneAt: new Date(Date.now() - 3 * 86_400_000) });
  const { today: bundle } = await sync();
  assert.equal(bundle.todos.length, 0);
});

test('a habit tick marks today, and an unknown habit is ignored', async () => {
  const [habit] = await db.insert(habits).values({ name: 'read', sortOrder: 0 }).returning();
  const { today: bundle } = await sync([
    { kind: 'habit', id: habit!.id, date: today, done: true },
    { kind: 'habit', id: 999, date: today, done: true },
  ]);
  assert.deepEqual(bundle.habits, [{ id: habit!.id, name: 'read', done: true }]);
  const entries = await db.select().from(habitEntries);
  assert.equal(entries.length, 1);
});

test('today carries quotes and how he is doing', async () => {
  await db.insert(quotes).values({ body: 'Fear the old blood.', source: null });
  const { today: bundle } = await sync();
  assert.deepEqual(bundle.quotes, [{ body: 'Fear the old blood.', source: null }]);
  assert.equal(bundle.form, 'dormant');
  assert.equal(bundle.level, 0);
});

test('the ritual activity is hidden from the catalog but offered to the device', async () => {
  const { today: bundle } = await sync();
  const { buildApp } = await import('../src/app.ts');
  const app = buildApp(db, { logger: false });
  const folders = (await app.inject({ method: 'GET', url: '/api/v1/folders' })).json() as { name: string }[];
  await app.close();
  assert.ok(bundle.resurrectionId > 0);
  assert.ok(!folders.some((f) => f.name === 'VESSEL'));
});

test('dormant after 72 hours, and only a full-hour ritual wakes him', async () => {
  const { today: first } = await sync();
  const hours = (h: number) => new Date(Date.now() - h * 3_600_000);
  const log = (uuid: string, activityId: number, startH: number, minutes: number) => ({
    uuid, activityId, clockSynced: true,
    startedAt: hours(startH).toISOString(), endedAt: new Date(hours(startH).getTime() + minutes * 60_000).toISOString(),
  });
  const ritual = first.resurrectionId;
  await applySync(db, { deviceId: 'aura-1', configVersion: 1, events: [
    log('00000000-0000-4000-8000-000000000001', 1, 200, 60),
    log('00000000-0000-4000-8000-000000000002', 1, 10, 30),
  ] });
  assert.equal((await sync()).today.form, 'dormant');
  await applySync(db, { deviceId: 'aura-1', configVersion: 1, events: [
    log('00000000-0000-4000-8000-000000000003', ritual, 5, 60),
  ] });
  assert.equal((await sync()).today.form, 'stable');
});
