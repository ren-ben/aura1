import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { sql, eq } from 'drizzle-orm';
import { createDb, type Db } from '../src/db/client.ts';
import { seed } from '../src/db/seed.ts';
import { activities, sessions } from '../src/db/schema.ts';
import { applySync } from '../src/sync/service.ts';
import type { SyncRequest } from '@aura/shared';

const url = process.env.TEST_DATABASE_URL
  ?? 'postgres://aura:aura@localhost:5434/aura_test';

let db: Db;
let close: () => Promise<void>;
let activityId: number;

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
  const [first] = await db.select().from(activities).limit(1);
  assert.ok(first);
  activityId = first.id;
});

function batch(): SyncRequest {
  return {
    deviceId: 'aura-1',
    configVersion: 1,
    events: [{
      uuid: '018f3b2a-4c5d-7e8f-9a0b-1c2d3e4f5a6b',
      activityId,
      startedAt: '2026-09-17T10:00:00.000Z',
      endedAt: '2026-09-17T11:47:00.000Z',
      clockSynced: true,
    }],
  };
}

test('a batch stores its session and acks it', async () => {
  const response = await applySync(db, batch());
  assert.deepEqual(response.acked, ['018f3b2a-4c5d-7e8f-9a0b-1c2d3e4f5a6b']);
  assert.deepEqual(response.rejected, []);
  const rows = await db.select().from(sessions);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.source, 'device');
});

test('replaying the same batch three times stores one row', async () => {
  await applySync(db, batch());
  await applySync(db, batch());
  const third = await applySync(db, batch());
  const rows = await db.select().from(sessions);
  assert.equal(rows.length, 1);
  assert.deepEqual(third.acked, ['018f3b2a-4c5d-7e8f-9a0b-1c2d3e4f5a6b']);
});

test('an event naming an unknown activity is rejected, not acked', async () => {
  const request = batch();
  request.events[0]!.activityId = 99999;
  const response = await applySync(db, request);
  assert.deepEqual(response.acked, []);
  assert.deepEqual(response.rejected, ['018f3b2a-4c5d-7e8f-9a0b-1c2d3e4f5a6b']);
  const rows = await db.select().from(sessions);
  assert.equal(rows.length, 0);
});

test('sync advances the activity last_used_at', async () => {
  await applySync(db, batch());
  const [row] = await db.select().from(activities).where(eq(activities.id, activityId));
  assert.equal(row?.lastUsedAt?.toISOString(), '2026-09-17T11:47:00.000Z');
});

test('config is omitted when the device version is current', async () => {
  const response = await applySync(db, batch());
  assert.equal(response.config, undefined);
  assert.equal(response.configVersion, 1);
});

test('config is sent when the device version is stale', async () => {
  const request = batch();
  request.configVersion = 0;
  const response = await applySync(db, request);
  assert.ok(response.config);
  assert.equal(response.config.folders.length, 5);
  assert.equal(response.config.activities.length, 10);
});
