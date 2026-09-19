import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { sql } from 'drizzle-orm';
import { createDb, type Db } from '../src/db/client.ts';
import { seed, seedIfEmpty } from '../src/db/seed.ts';
import { folders, activities, sessions } from '../src/db/schema.ts';

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
  await db.execute(
    sql`TRUNCATE sessions, activities, folders, meta RESTART IDENTITY CASCADE`,
  );
  await seed(db);
});

test('seed creates five folders in order', async () => {
  const rows = await db.select().from(folders).orderBy(folders.sortOrder);
  assert.deepEqual(
    rows.map((r) => r.name),
    ['AXIOM', 'WORKSHOP', 'HERESY', 'DREAM', 'HUNT'],
  );
});

test('seed creates ten activities', async () => {
  const rows = await db.select().from(activities);
  assert.equal(rows.length, 10);
});

test('seedIfEmpty seeds once and skips thereafter', async () => {
  await db.execute(
    sql`TRUNCATE sessions, activities, folders, meta RESTART IDENTITY CASCADE`,
  );

  const seeded = await seedIfEmpty(db);
  assert.equal(seeded, true);
  const rowsAfterFirst = await db.select().from(folders);
  assert.equal(rowsAfterFirst.length, 5);

  const seededAgain = await seedIfEmpty(db);
  assert.equal(seededAgain, false);
  const rowsAfterSecond = await db.select().from(folders);
  assert.equal(rowsAfterSecond.length, 5);
});

test('device_uuid is unique', async () => {
  const [activity] = await db.select().from(activities).limit(1);
  assert.ok(activity);
  const row = {
    activityId: activity.id,
    startedAt: new Date('2026-09-17T10:00:00Z'),
    endedAt: new Date('2026-09-17T11:00:00Z'),
    source: 'device' as const,
    deviceUuid: '018f3b2a-4c5d-7e8f-9a0b-1c2d3e4f5a6b',
  };
  await db.insert(sessions).values(row);
  await assert.rejects(() => db.insert(sessions).values(row));
});
