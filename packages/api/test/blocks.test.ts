import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { sql } from 'drizzle-orm';
import { createDb, type Db } from '../src/db/client.ts';
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
  app = buildApp(db, { logger: false });
  await app.ready();
});
after(async () => { await app.close(); await close(); });
beforeEach(async () => { await db.execute(sql`TRUNCATE blocks, plan_days RESTART IDENTITY CASCADE`); });

const call = (method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string, payload?: object) =>
  app.inject({ method, url: `/api/v1${path}`, ...(payload ? { payload } : {}) });
const day = async () => (await call('GET', '/blocks?from=2026-09-26&to=2026-09-26')).json() as {
  blocks: { id: number; start: number; end: number; title: string }[]; days: { rev: number; capacity: number }[];
};
const block = { date: '2026-09-26', start: 540, end: 600, title: 'physics', shade: 2, activityId: null };

test('blocks: wire, move, cut, each change a revision', async () => {
  assert.equal((await call('POST', '/blocks', block)).statusCode, 201);
  assert.equal((await call('PATCH', '/blocks/1', { start: 600, end: 690 })).statusCode, 204);
  let got = await day();
  assert.deepEqual(got.blocks.map((b) => [b.start, b.end, b.title]), [[600, 690, 'physics']]);
  assert.equal(got.days[0]!.rev, 2);
  assert.equal((await call('PATCH', '/blocks/1', { end: 500 })).statusCode, 400);
  assert.equal((await call('DELETE', '/blocks/1')).statusCode, 204);
  got = await day();
  assert.equal(got.blocks.length, 0);
  assert.equal(got.days[0]!.rev, 3);
});

test('blocks: a block ends after it starts; capacity is kept per day', async () => {
  assert.equal((await call('POST', '/blocks', { ...block, end: 540 })).statusCode, 400);
  assert.equal((await call('PUT', '/plan-days/2026-09-26', { capacity: 360 })).statusCode, 204);
  assert.equal((await day()).days[0]!.capacity, 360);
});
