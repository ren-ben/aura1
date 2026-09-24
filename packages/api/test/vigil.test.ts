import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { sql } from 'drizzle-orm';
import { createDb, type Db } from '../src/db/client.ts';
import { seed } from '../src/db/seed.ts';
import { activities } from '../src/db/schema.ts';
import { buildApp } from '../src/app.ts';
import { parseCourse } from '../src/routes/academy.ts';

const url = process.env.TEST_DATABASE_URL
  ?? 'postgres://aura:aura@localhost:15434/aura_test';
const fixture = (nr: string) => readFileSync(new URL(`./fixtures/ufind-${nr}-2026W.xml`, import.meta.url), 'utf8');

let db: Db;
let close: () => Promise<void>;
let app: ReturnType<typeof buildApp>;

before(async () => {
  const created = createDb(url);
  db = created.db;
  close = () => created.pool.end();
  await migrate(db, { migrationsFolder: './drizzle' });
  app = buildApp(db, {
    logger: false,
    fetchCourse: async (nr) => (['261600', '260162'].includes(nr) ? fixture(nr) : '<empty/>'),
  });
  await app.ready();
});

after(async () => { await app.close(); await close(); });

beforeEach(async () => {
  await db.execute(sql`TRUNCATE sessions, activities, folders, meta, todos, habit_entries, habits, quotes,
    vigil_signs, courses RESTART IDENTITY CASCADE`);
  await seed(db);
});

const call = async (method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string, payload?: object) =>
  app.inject({ method, url: `/api/v1${path}`, payload });

async function syncSit(activityId: number, minutes: number) {
  const endedAt = new Date();
  const startedAt = new Date(endedAt.getTime() - minutes * 60_000);
  return call('POST', '/sync', {
    deviceId: 'aura-1', configVersion: 0,
    events: [{ uuid: randomUUID(), activityId, startedAt: startedAt.toISOString(), endedAt: endedAt.toISOString(), clockSynced: true }],
  });
}

test('the device bundle lists the practices, each a system activity', async () => {
  const res = await call('POST', '/sync', { deviceId: 'aura-1', configVersion: 0, events: [] });
  const vigil = res.json().today.vigil;
  assert.equal(vigil[0].name, 'Cyclic Sigh');
  assert.equal(vigil[0].pacer, 'sigh');
  assert.equal(vigil.length, 12);
  const rows = await db.select().from(activities);
  assert.ok(vigil.every((p: { id: number }) => rows.find((a) => a.id === p.id)?.archivedAt));
});

test('a five minute sit is kept, as stillness and not as insight', async () => {
  const bundle = (await call('POST', '/sync', { deviceId: 'aura-1', configVersion: 0, events: [] })).json();
  const sigh = bundle.today.vigil[0].id;
  const before = (await call('GET', '/stats')).json();
  assert.equal((await syncSit(sigh, 5)).statusCode, 200);

  const vigil = (await call('GET', '/vigil')).json();
  assert.equal(vigil.sits.length, 1);
  assert.equal(vigil.sits[0].practice, 'Cyclic Sigh');
  assert.equal(vigil.sits[0].minutes, 5);

  const after = (await call('GET', '/stats')).json();
  assert.equal(after.bond.xp, before.bond.xp);
  assert.equal(after.lastSessionAt, before.lastSessionAt);
  assert.ok(!after.activities.some((a: { name: string }) => a.name === 'Cyclic Sigh'));
  assert.equal((await call('GET', '/sessions')).json().length, 0);
});

test('signs are kept and let go', async () => {
  await call('PUT', '/vigil/signs', { sign: 'thirty days without a gap', kept: true });
  await call('PUT', '/vigil/signs', { sign: 'thirty days without a gap', kept: true });
  assert.deepEqual((await call('GET', '/vigil')).json().signs, ['thirty days without a gap']);
  await call('PUT', '/vigil/signs', { sign: 'thirty days without a gap', kept: false });
  assert.deepEqual((await call('GET', '/vigil')).json().signs, []);
});

test('u:find XML gives the course, its groups and their dates', () => {
  const lecture = parseCourse(fixture('261600'))!;
  assert.equal(lecture.name, 'Experimentalphysik 1: Klassische Mechanik und Thermodynamik');
  assert.equal(lecture.type, 'VO');
  assert.equal(lecture.ects, 5);
  assert.ok(lecture.codes.includes('STEOP1'));
  assert.equal(lecture.groups.length, 1);
  assert.equal(lecture.groups[0]!.events[0]!.room, 'Lise-Meitner-Hörsaal');
  assert.equal(parseCourse(fixture('260162'))!.groups.length, 10);
  assert.equal(parseCourse('<empty/>'), null);
});

test('a course is added by its number, graded, and its group chosen', async () => {
  const res = await call('POST', '/academy/courses', { nr: '261600', semester: '2026W' });
  assert.equal(res.statusCode, 201);
  const lecture = res.json();
  assert.equal(lecture.module, 'STEOP1');
  assert.equal(lecture.groupId, '261600-1');

  const ex = (await call('POST', '/academy/courses', { nr: '260162', semester: '2026W' })).json();
  assert.equal(ex.groupId, null);
  assert.equal((await call('PATCH', `/academy/courses/${ex.id}`, { groupId: ex.groups[3].id, grade: 2 })).statusCode, 204);
  const saved = (await call('GET', '/academy')).json().find((c: { id: number }) => c.id === ex.id);
  assert.equal(saved.grade, 2);
  assert.equal(saved.groupId, ex.groups[3].id);

  assert.equal((await call('POST', '/academy/courses', { nr: '261600', semester: '2026W' })).statusCode, 409);
  assert.equal((await call('POST', '/academy/courses', { nr: '999999', semester: '2026W' })).statusCode, 404);
  assert.equal((await call('PATCH', `/academy/courses/${ex.id}`, { grade: 7 })).statusCode, 400);
  assert.equal((await call('DELETE', `/academy/courses/${ex.id}`)).statusCode, 204);
});
