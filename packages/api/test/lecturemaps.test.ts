import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { eq, sql } from 'drizzle-orm';
import type { LectureMap } from '@aura/shared';
import { createDb, type Db } from '../src/db/client.ts';
import { seed } from '../src/db/seed.ts';
import { courses, lectureMaps } from '../src/db/schema.ts';
import { buildApp } from '../src/app.ts';
import { parseSyllabus, topicsOf, guessTopic } from '../src/academy/syllabus.ts';

const url = process.env.TEST_DATABASE_URL
  ?? 'postgres://aura:aura@localhost:15434/aura_test';
const read = (name: string) => readFileSync(new URL(`./fixtures/${name}.xml`, import.meta.url), 'utf8');
const ufind = async (path: string) => {
  const nr = path.match(/^courses\/(\d+)\//)?.[1];
  if (nr) return ['261600', '260162'].includes(nr) ? read(`ufind-${nr}-2026W`) : '<empty/>';
  return read('ufind-exams-ep1-2025W');
};

const MAP: LectureMap = {
  title: "Newton's laws", scene: 'spring',
  hook: 'Why does the tablecloth trick work?',
  core: 'Things keep doing what they were doing unless something pushes them.',
  questions: [{ q: 'What is inertia?', a: 'Resistance to a change in motion.' }, { q: 'F = ?', a: '$ma$' }, { q: 'Action and?', a: 'Reaction.' }],
  outline: ['Inertia', 'Force', 'Reaction'],
  terms: [{ term: 'mass (Masse)', meaning: 'how hard it is to shove' }, { term: 'force (Kraft)', meaning: 'a shove' }],
  equations: [{ tex: 'F = ma', says: 'force is mass times acceleration' }],
  pictures: [{ title: 'Free fall', expr: '-4.9*x^2', from: 0, to: 3, caption: 'height over time' }],
  worked: { problem: 'Push 2 kg with 4 N.', steps: ['a = F/m', 'a = 2'], answer: '$2\\,m/s^2$' },
  traps: [{ wrong: 'Motion needs a force.', right: 'Change of motion does.' }],
  refresh: [{ topic: 'Vectors', why: 'forces add as arrows' }],
  further: [{ title: 'Feynman Lectures 9', url: 'https://www.feynmanlectures.caltech.edu/I_09.html', note: 'the real thing' }],
};

// OpenRouter, recorded: each call takes the next reply, and what was asked
// is kept.
let replies: object[] = [];
let asked: { model: string; plugins?: unknown; response_format?: unknown }[] = [];
const reply = (content: string, cost: number, annotations: object[] = []) =>
  ({ choices: [{ message: { content, annotations } }], usage: { cost } });
const openrouter = async (_url: string, init: RequestInit) => {
  asked.push(JSON.parse(String(init.body)));
  const next = replies.shift();
  return new Response(JSON.stringify(next ?? { error: { message: 'no reply recorded' } }), { status: next ? 200 : 500 });
};
const settings = { key: 'test', research: 'research-model', writer: 'writer-model', budgetUsd: 1 };

let db: Db;
let close: () => Promise<void>;
let app: ReturnType<typeof buildApp>;

before(async () => {
  const created = createDb(url);
  db = created.db;
  close = () => created.pool.end();
  await migrate(db, { migrationsFolder: './drizzle' });
  app = buildApp(db, { logger: false, ufind, openrouter, settings });
  await app.ready();
});

after(async () => { await app.close(); await close(); });

beforeEach(async () => {
  await db.execute(sql`TRUNCATE sessions, activities, folders, meta, todos, habit_entries, habits, quotes,
    vigil_signs, courses RESTART IDENTITY CASCADE`);
  await seed(db);
  replies = [];
  asked = [];
});

const call = async (method: 'GET' | 'POST', path: string, payload?: object) =>
  app.inject({ method, url: `/api/v1${path}`, payload });

async function lecture(n: number) {
  const course = (await call('POST', '/academy/courses', { nr: '261600', semester: '2026W' })).json();
  return { course, begin: course.groups[0].events[n].begin as string };
}

// The passes run after the answer; this waits for them to settle.
async function settled(id: number) {
  for (let i = 0; i < 100; i++) {
    const map = (await call('GET', `/academy/maps/${id}`)).json();
    if (map.status === 'ready' || map.status === 'failed') return map;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('never settled');
}

test('the syllabus is read from u:find and spread over the lectures', () => {
  const syllabus = parseSyllabus(read('ufind-261600-2026W'));
  const topics = topicsOf(syllabus);
  assert.ok(topics.length >= 3);
  assert.match(guessTopic('EP1', topics, 0, 30), /introduction/);
  assert.equal(guessTopic('EP1', topics, 29, 30), `EP1: ${topics.at(-1)}`);
  assert.equal(guessTopic('EP1', [], 4, 30), 'EP1, lecture 5');
});

test('a lecture knows its place and its guessed topic; exercise classes have none', async () => {
  const { course, begin } = await lecture(3);
  const res = (await call('GET', `/academy/lectures/${course.id}?begin=${encodeURIComponent(begin)}`)).json();
  assert.equal(res.index, 3);
  assert.equal(res.total, course.groups[0].events.length);
  assert.ok(res.guess.length > 5);
  assert.equal(res.map, null);
  assert.ok(res.topics.length >= 3);
  assert.equal((await call('GET', `/academy/lectures/${course.id}?begin=nope`)).statusCode, 404);

  // A course kept from before syllabi were saved fetches its own.
  await db.update(courses).set({ syllabus: '' }).where(eq(courses.id, course.id));
  const again = (await call('GET', `/academy/lectures/${course.id}?begin=${encodeURIComponent(begin)}`)).json();
  assert.ok(again.topics.length >= 3);
  assert.equal(again.guess, res.guess);

  const ue = (await call('POST', '/academy/courses', { nr: '260162', semester: '2026W' })).json();
  const ueBegin = ue.groups[0].events[0].begin;
  assert.equal((await call('GET', `/academy/lectures/${ue.id}?begin=${encodeURIComponent(ueBegin)}`)).statusCode, 404);
});

test('a map is researched, then written, and kept with its sources and cost', async () => {
  const { course, begin } = await lecture(5);
  replies = [
    reply('notes on Newton', 0.02, [{ type: 'url_citation', url_citation: { url: 'https://a.example', title: 'A' } },
      { type: 'url_citation', url_citation: { url: 'https://a.example', title: 'A' } }]),
    reply('```json\n' + JSON.stringify(MAP) + '\n```', 0.08),
  ];
  const started = await call('POST', '/academy/maps', { courseId: course.id, begin, topic: "Newton's laws" });
  assert.equal(started.statusCode, 202);
  const map = await settled(started.json().id);
  assert.equal(map.status, 'ready');
  assert.equal(map.map.title, "Newton's laws");
  assert.deepEqual(map.sources, [{ url: 'https://a.example', title: 'A' }]);
  assert.ok(Math.abs(map.costUsd - 0.1) < 1e-9);
  assert.equal(asked[0]!.model, 'research-model');
  assert.ok(asked[0]!.plugins);
  assert.equal(asked[1]!.model, 'writer-model');
  assert.ok(asked[1]!.response_format);

  assert.equal((await call('POST', '/academy/maps', { courseId: course.id, begin, topic: 'again' })).statusCode, 409);
  const got = (await call('GET', `/academy/lectures/${course.id}?begin=${encodeURIComponent(begin)}`)).json();
  assert.equal(got.map.id, map.id);
});

test('a malformed map is sent back once, and a second failure is kept as failed', async () => {
  const { course, begin } = await lecture(6);
  replies = [reply('notes', 0.01), reply('{"title": "half"}', 0.01), reply(JSON.stringify(MAP), 0.01)];
  let map = await settled((await call('POST', '/academy/maps', { courseId: course.id, begin, topic: 'Newton' })).json().id);
  assert.equal(map.status, 'ready');
  assert.equal(asked.length, 3);

  const begin8 = course.groups[0].events[8].begin;
  replies = [reply('notes', 0.01), reply('nope', 0.01), reply('still nope', 0.01)];
  map = await settled((await call('POST', '/academy/maps', { courseId: course.id, begin: begin8, topic: 'Energy' })).json().id);
  assert.equal(map.status, 'failed');
  assert.match(map.error, /malformed/);

  // Tried again on the same topic, the research is not paid for twice.
  asked = [];
  replies = [reply(JSON.stringify(MAP), 0.01)];
  map = await settled((await call('POST', '/academy/maps', { courseId: course.id, begin: begin8, topic: 'Energy' })).json().id);
  assert.equal(map.status, 'ready');
  assert.equal(asked.length, 1);
  assert.equal(asked[0]!.model, 'writer-model');
});

test('nothing more is started once the month\'s budget is spent', async () => {
  const { course, begin } = await lecture(2);
  replies = [reply('notes', 0.5), reply(JSON.stringify(MAP), 0.6)];
  const map = await settled((await call('POST', '/academy/maps', { courseId: course.id, begin, topic: 'Newton' })).json().id);
  const other = course.groups[0].events[3].begin;
  assert.equal((await call('POST', '/academy/maps', { courseId: course.id, begin: other, topic: 'Newton' })).statusCode, 402);
  assert.equal((await call('POST', `/academy/maps/${map.id}/expand`, { node: { key: 'core', kind: 'core', title: 'x', text: 'y' } })).statusCode, 402);
});

test('going deeper grows children under the node, numbered on', async () => {
  const { course, begin } = await lecture(4);
  replies = [reply('notes', 0.01), reply(JSON.stringify(MAP), 0.01)];
  const map = await settled((await call('POST', '/academy/maps', { courseId: course.id, begin, topic: 'Newton' })).json().id);
  const node = { key: 'terms.0', kind: 'term', title: 'mass', text: 'how hard it is to shove' };
  const two = { nodes: [{ title: 'Inertial and heavy', text: 'The same, oddly.' }, { title: 'Units', text: 'kilograms', tex: 'm' }] };
  replies = [reply(JSON.stringify(two), 0.01), reply(JSON.stringify(two), 0.01)];
  await call('POST', `/academy/maps/${map.id}/expand`, { node });
  const grown = (await call('POST', `/academy/maps/${map.id}/expand`, { node })).json().grown;
  assert.deepEqual(grown.map((g: { id: string }) => g.id), ['terms.0.g0', 'terms.0.g1', 'terms.0.g2', 'terms.0.g3']);
  assert.equal(grown[1].parent, 'terms.0');
});

test('a generation cut off by a restart is marked failed after ten minutes', async () => {
  const { course, begin } = await lecture(1);
  const [row] = await db.insert(lectureMaps).values({ courseId: course.id, begin, topic: 'x', status: 'writing', createdAt: new Date(Date.now() - 11 * 60_000) }).returning();
  const map = (await call('GET', `/academy/maps/${row!.id}`)).json();
  assert.equal(map.status, 'failed');
  await db.delete(lectureMaps).where(eq(lectureMaps.id, row!.id));
});
