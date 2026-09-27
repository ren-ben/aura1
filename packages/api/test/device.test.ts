import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { sql } from 'drizzle-orm';
import { createDb, type Db } from '../src/db/client.ts';
import { seed } from '../src/db/seed.ts';
import { buildApp } from '../src/app.ts';
import { applySync } from '../src/sync/service.ts';

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
  await db.execute(sql`TRUNCATE sessions, activities, folders, meta, device RESTART IDENTITY CASCADE`);
  await seed(db);
});

const sync = (look: string, skin = 'jiji') => applySync(db, {
  deviceId: 'aura-1', configVersion: 1, events: [],
  status: { battery: 70, millivolts: 3912, charging: false, look, skin },
});

test('a sync records how the device is', async () => {
  const empty = await app.inject({ method: 'GET', url: '/api/v1/device' });
  assert.equal(empty.json().lastSyncAt, null);
  await sync('CODEX');
  const got = (await app.inject({ method: 'GET', url: '/api/v1/device' })).json();
  assert.equal(got.battery, 70);
  assert.equal(got.millivolts, 3912);
  assert.equal(got.look, 'CODEX');
  assert.equal(got.skin, 'jiji');
  assert.ok(got.lastSyncAt);
});

test('the skin he wears on the device reaches the dashboard', async () => {
  await sync('CODEX', 'ye');
  assert.equal((await app.inject({ method: 'GET', url: '/api/v1/device' })).json().skin, 'ye');
});

test('a look chosen on the web goes out until the device wears it', async () => {
  await sync('CODEX');
  const put = await app.inject({ method: 'PUT', url: '/api/v1/device/look', payload: { look: 'CARMILLA' } });
  assert.equal(put.statusCode, 204);
  assert.equal((await sync('CODEX')).look, 'CARMILLA');
  assert.equal((await sync('CARMILLA')).look, undefined);
  const got = (await app.inject({ method: 'GET', url: '/api/v1/device' })).json();
  assert.equal(got.pendingLook, null);
  assert.equal(got.look, 'CARMILLA');
});
