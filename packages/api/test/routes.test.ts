import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { sql } from 'drizzle-orm';
import { createDb, type Db } from '../src/db/client.ts';
import { seed } from '../src/db/seed.ts';
import { activities } from '../src/db/schema.ts';
import { buildApp } from '../src/app.ts';

const url = process.env.TEST_DATABASE_URL
  ?? 'postgres://aura:aura@localhost:5434/aura_test';

let db: Db;
let close: () => Promise<void>;
let app: ReturnType<typeof buildApp>;
let activityId: number;

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
  await db.execute(
    sql`TRUNCATE sessions, activities, folders, meta RESTART IDENTITY CASCADE`,
  );
  await seed(db);
  const [first] = await db.select().from(activities).limit(1);
  assert.ok(first);
  activityId = first.id;
});

function payload() {
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

test('POST /api/v1/sync stores a session and returns acked', async () => {
  const response = await app.inject({
    method: 'POST', url: '/api/v1/sync', payload: payload(),
  });
  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.deepEqual(body.acked, ['018f3b2a-4c5d-7e8f-9a0b-1c2d3e4f5a6b']);
  assert.ok(body.serverTime);
});

test('POST /api/v1/sync rejects a malformed body with 400', async () => {
  const response = await app.inject({
    method: 'POST', url: '/api/v1/sync', payload: { deviceId: 'aura-1' },
  });
  assert.equal(response.statusCode, 400);
});

test('GET /api/v1/sessions returns the stored session with its names', async () => {
  await app.inject({ method: 'POST', url: '/api/v1/sync', payload: payload() });
  const response = await app.inject({ method: 'GET', url: '/api/v1/sessions' });
  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.length, 1);
  assert.equal(body[0].folder, 'AXIOM');
  assert.equal(body[0].minutes, 107);
});
