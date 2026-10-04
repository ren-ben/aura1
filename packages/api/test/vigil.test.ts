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
import { parseCourse, parseExams } from '../src/routes/academy.ts';

const url = process.env.TEST_DATABASE_URL
  ?? 'postgres://aura:aura@localhost:15434/aura_test';
const read = (name: string) => readFileSync(new URL(`./fixtures/${name}.xml`, import.meta.url), 'utf8');
const fixture = (nr: string) => read(`ufind-${nr}-2026W`);
// What u:find is asked for: a course by number, or a search for its exams.
const ufind = async (path: string) => {
  const nr = path.match(/^courses\/(\d+)\//)?.[1];
  if (nr) return ['261600', '260162'].includes(nr) ? fixture(nr) : '<empty/>';
  return read('ufind-exams-ep1-2025W');
};

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
    ufind,
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

test("a VU's lecture part is read from its note, weekly but not over the break", () => {
  const la = parseCourse(fixture('260022'))!;
  const events = la.groups.find((g) => g.id === '260022-3')!.events;
  const lectures = events.filter((e) => e.lecture).map((e) => e.begin);
  assert.equal(lectures[0], '2026-10-08T09:15:00+02:00');
  assert.ok(lectures.includes('2026-11-05T09:15:00+01:00'));
  assert.ok(lectures.includes('2027-01-21T09:15:00+01:00'));
  assert.ok(!lectures.includes('2026-12-24T09:15:00+01:00') && !lectures.includes('2026-12-31T09:15:00+01:00'));
  assert.equal(events.find((e) => e.lecture)!.room, 'Lise-Meitner-Hörsaal');
  assert.ok(events.filter((e) => !e.lecture).every((e) => e.lecture === false && e.begin.includes('T15:00')));
  assert.equal(parseCourse(fixture('261600'))!.groups[0]!.events[0]!.lecture, undefined);
});

test('a course is added by its number, graded, and its group chosen', async () => {
  const res = await call('POST', '/academy/courses', { nr: '261600', semester: '2026W' });
  assert.equal(res.statusCode, 201);
  const lecture = res.json();
  assert.equal(lecture.module, 'STEOP1');
  assert.equal(lecture.groupId, '261600-1');

  // The group registered in u:space is picked.
  const ex = (await call('POST', '/academy/courses', { nr: '260162', semester: '2026W' })).json();
  assert.equal(ex.groupId, '260162-5');
  assert.equal((await call('PATCH', `/academy/courses/${ex.id}`, { groupId: ex.groups[3].id, grade: 2 })).statusCode, 204);
  const saved = (await call('GET', '/academy')).json().find((c: { id: number }) => c.id === ex.id);
  assert.equal(saved.grade, 2);
  assert.equal(saved.groupId, ex.groups[3].id);

  assert.equal((await call('POST', '/academy/courses', { nr: '261600', semester: '2026W' })).statusCode, 409);
  assert.equal((await call('POST', '/academy/courses', { nr: '999999', semester: '2026W' })).statusCode, 404);
  assert.equal((await call('PATCH', `/academy/courses/${ex.id}`, { grade: 7 })).statusCode, 400);
  assert.equal((await call('DELETE', `/academy/courses/${ex.id}`)).statusCode, 204);
});

test('exams: the course and its module in this degree, each once', () => {
  const steop = parseExams(read('ufind-exams-ep1-2025W'), '261600');
  // Four programmes share the StEOP 1 exams; only Bachelor Physik counts.
  assert.equal(steop.length, 2);
  assert.match(steop[0]!.title, /Modulprüfung Experimentalphysik I/);
  assert.equal(steop[0]!.room, 'Lise-Meitner-Hörsaal');
  assert.ok(steop[0]!.begin < steop[1]!.begin);
  const lecture = parseExams(read('ufind-exams-analysis-2025W'), '250011');
  assert.ok(lecture.length >= 3);
  assert.equal(parseExams(read('ufind-exams-analysis-2025W'), '999999').length, 0);
});

test('a course comes with its exams, and a refresh keeps what was set by hand', async () => {
  const lecture = (await call('POST', '/academy/courses', { nr: '261600', semester: '2026W' })).json();
  assert.equal(lecture.exams.length, 2);
  const ex = (await call('POST', '/academy/courses', { nr: '260162', semester: '2026W' })).json();
  await call('PATCH', `/academy/courses/${ex.id}`, { groupId: ex.groups[2].id, grade: 3, module: 'EXT' });
  const res = await call('POST', '/academy/refresh', { semester: '2026W' });
  assert.deepEqual(res.json(), { refreshed: 2, of: 2 });
  const after = (await call('GET', '/academy')).json().find((c: { id: number }) => c.id === ex.id);
  assert.equal(after.grade, 3);
  assert.equal(after.module, 'EXT');
  assert.equal(after.groupId, ex.groups[2].id);
  assert.ok(Date.parse(after.refreshedAt) > 0);
});

test('a sit written in by hand is kept, and an unknown practice is refused', async () => {
  const startedAt = new Date(Date.now() - 3600_000).toISOString();
  assert.equal((await call('POST', '/vigil/sits', { practice: 'Metta', startedAt, minutes: 20 })).statusCode, 201);
  assert.equal((await call('POST', '/vigil/sits', { practice: 'Levitation', startedAt, minutes: 20 })).statusCode, 400);
  const [sit] = (await call('GET', '/vigil')).json().sits;
  assert.deepEqual([sit.practice, sit.minutes, sit.source], ['Metta', 20, 'manual']);
  assert.equal((await call('GET', '/stats')).json().bond.xp, 0);
});

test('the sun hours reach the device only while they are on', async () => {
  const bundle = async () => (await call('POST', '/sync', { deviceId: 'aura-1', configVersion: 0, events: [] })).json().today;
  assert.deepEqual((await bundle()).hours, []);
  await call('PUT', '/vigil/hours', { on: true });
  const hours = (await bundle()).hours;
  assert.equal(hours.length, 4);
  assert.ok(hours[0] > 180 && hours[0] < 600, 'dawn between 03:00 and 10:00');
  assert.ok(hours[1] > 600 && hours[1] < 840, 'noon near midday');
  assert.equal(hours[3], 0);
  assert.equal((await call('GET', '/vigil')).json().hours.on, true);
  await call('PUT', '/vigil/hours', { on: false });
  assert.deepEqual((await bundle()).hours, []);
});
