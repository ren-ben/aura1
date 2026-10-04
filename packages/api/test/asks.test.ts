import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { sql } from 'drizzle-orm';
import { PDFDocument } from 'pdf-lib';
import { createDb, type Db } from '../src/db/client.ts';
import { buildApp } from '../src/app.ts';
import { courses } from '../src/db/schema.ts';
import { clip, excerpt, lexical } from '../src/academy/retrieve.ts';
import { tasksOf } from '../src/academy/asks.ts';

const url = process.env.TEST_DATABASE_URL ?? 'postgres://aura:aura@localhost:15434/aura_test';
const SKRIPT = readFileSync(new URL('./fixtures/skript.pdf', import.meta.url));

// OpenRouter, recorded: each call takes the next reply, and what was asked
// is kept.
let replies: object[] = [];
let asked: { model: string; plugins?: { id: string }[]; messages: { content: unknown }[] }[] = [];
const reply = (content: object | string, cost: number) => ({ choices: [{ message: { content: typeof content === 'string' ? content : JSON.stringify(content) } }], usage: { cost } });
const openrouter = async (_url: string, init: RequestInit) => {
  asked.push(JSON.parse(String(init.body)));
  const next = replies.shift();
  return new Response(JSON.stringify(next ?? { error: { message: 'no reply recorded' } }), { status: next ? 200 : 500 });
};
const settings = { key: 'test', research: 'research-model', writer: 'writer-model', budgetUsd: 5 };

let db: Db;
let close: () => Promise<void>;
let app: ReturnType<typeof buildApp>;
before(async () => {
  const created = createDb(url);
  db = created.db;
  close = () => created.pool.end();
  await migrate(db, { migrationsFolder: './drizzle' });
  app = buildApp(db, { logger: false, openrouter, settings });
  await app.ready();
});
after(async () => { await app.close(); await close(); });

let skript = 0, sheet = 0;
beforeEach(async () => {
  await db.execute(sql`TRUNCATE asks, folios, folio_files, courses, lecture_maps RESTART IDENTITY CASCADE`);
  replies = []; asked = [];
  // Rechenmethoden: the lecture holds the Skript, its exercise class the sheet.
  await db.insert(courses).values([
    { nr: '261603', semester: '2026W', module: 'STEOP2', name: 'Physikalische Rechenmethoden', type: 'VO', ects: 5, groups: [], groupId: null },
    { nr: '261604', semester: '2026W', module: 'STEOP2', name: 'Physikalische Rechenmethoden', type: 'UE', ects: 3, groups: [], groupId: null },
  ]);
  const up = (nr: string, title: string) => app.inject({ method: 'POST', url: `/api/v1/academy/folios?nr=${nr}&semester=2026W&title=${encodeURIComponent(title)}`, payload: SKRIPT, headers: { 'content-type': 'application/pdf' } });
  skript = (await up('261603', 'Skriptum_2026.pdf')).json().id;
  sheet = (await up('261604', 'Übungsblatt 1.pdf')).json().id;
});

const call = (method: 'GET' | 'POST' | 'DELETE', path: string, payload?: object) => app.inject({ method, url: `/api/v1${path}`, payload });
async function done(id: number) {
  for (let i = 0; i < 200; i++) { const a = (await call('GET', `/academy/asks/${id}`)).json(); if (a.status !== 'thinking') return a; await new Promise((r) => setTimeout(r, 20)); }
  throw new Error('never answered');
}

test('pages are found by their words, merged, held to a budget, and cut out whole', async () => {
  const pages = [{ folioId: 1, page: 1, text: 'Funktionen' }, { folioId: 1, page: 4, text: 'Das Integral von 1/x, Integrale und Integration' }, { folioId: 1, page: 2, text: 'Ableitung' }];
  assert.deepEqual(lexical(pages, 'Wie integriere ich? Integral').map((p) => p.page), [4]);
  const files = new Map([[1, { title: 'S', pages: 40 }], [2, { title: 'B', pages: 2 }]]);
  // 10-12 and 12-15 merge; an unknown file is dropped; twelve pages in all.
  assert.deepEqual(clip([{ folio: 1, from: 10, to: 12 }, { folio: 1, from: 12, to: 15 }, { folio: 2, from: 2, to: 9 }, { folio: 9, from: 1, to: 1 }, { folio: 1, from: 30, to: 39 }], files, 12),
    [{ folioId: 1, title: 'S', from: 10, to: 15 }, { folioId: 1, title: 'S', from: 30, to: 35 }]);
  const [cut] = await excerpt(db, [{ folioId: skript, title: 'Skriptum_2026.pdf', from: 2, to: 3 }]);
  assert.equal(cut!.name, `folio-${skript}_p2-3.pdf`);
  assert.equal((await PDFDocument.load(Buffer.from(cut!.base64, 'base64'))).getPageCount(), 2);
});

test("a sheet's tasks are read off its text", () => {
  assert.deepEqual(tasksOf(['Blatt 1\nAufgabe 1: Grenzwerte\nBerechne...\nAufgabe 2) Ableitungen', 'Aufgabe 3 Integrale']),
    [{ n: 1, title: 'Grenzwerte', page: 1 }, { n: 2, title: 'Ableitungen', page: 1 }, { n: 3, title: 'Integrale', page: 2 }]);
  assert.deepEqual(tasksOf(['Nur Text']), [{ n: 0, title: 'the whole sheet', page: 1 }]);
});

test('a question is answered from the pages routed to it, with the pages cited', async () => {
  replies = [
    reply({ picks: [{ folio: skript, from: 4, to: 4 }, { folio: 999, from: 1, to: 2 }] }, 0.001),
    reply({ answer: 'Weil die Ableitung von $\\ln|x|$ genau $1/x$ ist.\n\n$$\\int \\frac{1}{x}\\,dx = \\ln|x| + C$$', cites: [{ folio: skript, page: 4 }, { folio: 12345, page: 1 }] }, 0.03),
  ];
  const res = await call('POST', '/academy/asks', { nr: '261604', semester: '2026W', question: 'Warum ist das Integral von 1/x gleich ln|x|?' });
  assert.equal(res.statusCode, 202);
  const a = await done(res.json().id);
  assert.equal(a.status, 'ready');
  assert.match(a.answer, /\\ln\|x\|/);
  // The exercise class's question found the lecture's Skript; the made-up
  // file and the made-up citation are dropped.
  assert.deepEqual(a.pages, [{ folioId: skript, title: 'Skriptum_2026.pdf', from: 4, to: 4 }]);
  assert.deepEqual(a.cites, [{ folioId: skript, title: 'Skriptum_2026.pdf', page: 4 }]);
  assert.equal(a.costUsd, 0.031);
  // The writer was sent the page as a PDF, read natively.
  const writer = asked[1]!;
  assert.equal(writer.model, 'writer-model');
  assert.deepEqual(writer.plugins, [{ id: 'file-parser', pdf: { engine: 'native' } }]);
  const parts = writer.messages.at(-1)!.content as { type: string; file?: { filename: string } }[];
  assert.equal(parts[1]!.file!.filename, `folio-${skript}_p4-4.pdf`);
  const listed = (await call('GET', '/academy/asks?nrs=261603,261604&semester=2026W')).json();
  assert.equal(listed.length, 1);
});

test('the hint ladder is climbed one rung at a time', async () => {
  assert.equal((await call('POST', '/academy/hints', { folioId: sheet, task: 0, rung: 2 })).statusCode, 409);
  replies = [reply({ picks: [{ folio: skript, from: 2, to: 3 }] }, 0), reply({ answer: 'Das steht im Skript, Kapitel 2.', cites: [{ folio: skript, page: 2 }] }, 0.02)];
  const first = await done((await call('POST', '/academy/hints', { folioId: sheet, task: 0, rung: 1 })).json().id);
  assert.equal(first.status, 'ready');
  // The sheet's own page leads the pages, then the Skript's.
  assert.ok(first.pages.some((p: { folioId: number }) => p.folioId === sheet));
  assert.ok(first.pages.some((p: { folioId: number }) => p.folioId === skript));
  // Asked again, the same rung comes back as it was, without a call.
  const again = await call('POST', '/academy/hints', { folioId: sheet, task: 0, rung: 1 });
  assert.equal(again.json().id, first.id);
  replies = [reply({ answer: 'Schreib es als Produkt.', cites: [] }, 0.02)];
  const second = await done((await call('POST', '/academy/hints', { folioId: sheet, task: 0, rung: 2 })).json().id);
  assert.equal(second.status, 'ready', second.error);
  // The second rung keeps the pages of the first and knows what it said.
  assert.match(JSON.stringify(asked.at(-1)!.messages), /What rung 1 already said/);
  assert.deepEqual((await call('GET', `/academy/folios/${sheet}/tasks`)).json(), [{ n: 0, title: 'the whole sheet', page: 1 }]);
});

test('a lecture map is written from the Skript: its chapters are the topics, its pages go along', async () => {
  await db.update(courses).set({ groups: [{ id: '261603-1', events: [{ begin: '2026-10-06T11:00:00+02:00', end: '2026-10-06T12:30:00+02:00', room: 'Lise-Meitner-Hörsaal' }] }], groupId: '261603-1', syllabus: 'x' });
  const [course] = await db.select().from(courses);
  const lecture = (await call('GET', `/academy/lectures/${course!.id}?begin=${encodeURIComponent('2026-10-06T11:00:00+02:00')}`)).json();
  assert.deepEqual(lecture.topics, ['1 Funktionen', '2 Differentialrechnung', '3 Integration']);
  assert.match(lecture.guess, /1 Funktionen/);

  replies = [reply('notes from the web', 0.01), reply({ picks: [{ folio: skript, from: 1, to: 1 }] }, 0.001), reply(MAP, 0.05)];
  const started = await call('POST', '/academy/maps', { courseId: course!.id, begin: '2026-10-06T11:00:00+02:00', topic: '1 Funktionen' });
  assert.equal(started.statusCode, 202);
  let map;
  for (let i = 0; i < 200 && map?.status !== 'ready' && map?.status !== 'failed'; i++) { await new Promise((r) => setTimeout(r, 20)); map = (await call('GET', `/academy/maps/${started.json().id}`)).json(); }
  assert.equal(map.status, 'ready', map.error);
  assert.deepEqual(map.pages, [{ folioId: skript, title: 'Skriptum_2026.pdf', from: 1, to: 1 }]);
  assert.match(JSON.stringify(asked.at(-1)!.messages), /the lecture's real source/);
  assert.equal((asked.at(-1)!.messages.at(-1)!.content as { type: string }[])[1]!.type, 'file');
});

const MAP = {
  title: 'Funktionen', scene: 'tangent', hook: 'Warum?', core: 'Eine Funktion ordnet zu.',
  questions: [{ q: 'a', a: 'b' }, { q: 'c', a: 'd' }, { q: 'e', a: 'f' }], outline: ['x', 'y', 'z'],
  terms: [{ term: 'Funktion', meaning: 'Zuordnung' }, { term: 'Definitionsbereich', meaning: 'wo sie lebt' }],
  equations: [], pictures: [], worked: { problem: 'p', steps: ['s1', 's2'], answer: 'a' },
  traps: [{ wrong: 'w', right: 'r' }], refresh: [{ topic: 't', why: 'w' }], further: [],
};
