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
beforeEach(async () => { await db.execute(sql`TRUNCATE topics, topic_groups, topic_links RESTART IDENTITY CASCADE`); });
const call = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, payload?: object) => app.inject({ method, url: `/api/v1${path}`, payload });

test('a topic waits unlearned, starts its clock on its first good, and comes back in days', async () => {
  const t = (await call('POST', '/academy/topics', { title: 'Triangle inequality', x: 10, y: -20, groupId: null, points: ['$|x+y| \\le |x|+|y|$'] })).json();
  assert.equal(t.learned, false);
  assert.equal(t.due, null);
  assert.equal(t.next, null);

  const learned = (await call('POST', `/academy/topics/${t.id}/review`, { rating: 3 })).json();
  assert.equal(learned.learned, true);
  assert.ok(learned.stability > 0);
  // Days, never minutes: even again brings it back tomorrow at the earliest.
  const next = learned.next.map((d: string) => Date.parse(d));
  assert.ok(next[0] - Date.now() > 20 * 3600e3);
  assert.ok(next[0] <= next[1] && next[1] < next[2] && next[2] < next[3]);

  const edited = (await call('PATCH', `/academy/topics/${t.id}`, { title: 'Dreiecksungleichung', points: ['a', 'b'] })).json();
  assert.equal(edited.title, 'Dreiecksungleichung');
  assert.equal(edited.reps, 1);
  assert.equal(edited.hub, false);
  const hub = (await call('PATCH', `/academy/topics/${t.id}`, { hub: true })).json();
  assert.equal(hub.hub, true);
  assert.equal(hub.title, 'Dreiecksungleichung');
  assert.equal((await call('PATCH', `/academy/topics/${t.id}`, { skin: 'fields' })).json().skin, 'fields');
  assert.equal((await call('PATCH', `/academy/topics/${t.id}`, { skin: 'teacup' })).statusCode, 400);
  assert.equal((await call('PATCH', '/academy/topics/999', { title: 'x' })).statusCode, 404);
});

test('chosen topics become a group; a group with none left is gone', async () => {
  const a = (await call('POST', '/academy/topics', { title: 'Field axioms', x: 0, y: 0, groupId: null })).json();
  const b = (await call('POST', '/academy/topics', { title: 'Absolute value', x: 180, y: 0, groupId: null })).json();
  const g = (await call('POST', '/academy/topic-groups', { name: 'Analysis 1', topicIds: [a.id, b.id] })).json();
  assert.equal((await call('PATCH', `/academy/topic-groups/${g.id}`, { ground: 2 })).statusCode, 204);
  let map = (await call('GET', '/academy/topics')).json();
  assert.deepEqual(map.groups, [{ id: g.id, name: 'Analysis 1', ground: 2 }]);
  assert.ok(map.topics.every((t: { groupId: number }) => t.groupId === g.id));

  // Both dragged out of the pool: it dries up.
  const placed = await call('POST', '/academy/topics/place', { topics: [{ id: a.id, x: 900, y: 0, groupId: null }, { id: b.id, x: 1100, y: 40, groupId: null }] });
  assert.equal(placed.statusCode, 204);
  map = (await call('GET', '/academy/topics')).json();
  assert.equal(map.groups.length, 0);
  assert.deepEqual(map.topics.map((t: { x: number }) => t.x), [900, 1100]);
});

test('links say what builds on what, once, and go with their topics', async () => {
  const a = (await call('POST', '/academy/topics', { title: 'Implication', x: 0, y: 0, groupId: null })).json();
  const b = (await call('POST', '/academy/topics', { title: 'Contrapositive', x: 100, y: 0, groupId: null })).json();
  assert.equal((await call('POST', '/academy/topic-links', { from: a.id, to: a.id })).statusCode, 400);
  const l = (await call('POST', '/academy/topic-links', { from: a.id, to: b.id })).json();
  const again = (await call('POST', '/academy/topic-links', { from: a.id, to: b.id })).json();
  assert.equal(again.id, l.id);
  assert.equal((await call('DELETE', `/academy/topics/${b.id}`)).statusCode, 204);
  assert.equal((await call('GET', '/academy/topics')).json().links.length, 0);
});
