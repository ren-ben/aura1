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
beforeEach(async () => { await db.execute(sql`TRUNCATE own_decks, own_notes, own_cards, own_images RESTART IDENTITY CASCADE`); });
const call = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, payload?: object) => app.inject({ method, url: `/api/v1${path}`, payload });
const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');

test('a file is opened, a cloze note makes a card a number, and an edit keeps what was learned', async () => {
  const deck = (await call('POST', '/academy/own/decks', { title: 'Physikalische Rechenmethoden' })).json();
  assert.match(deck.code, /^PR-\d{4}$/);
  const note = (await call('POST', `/academy/own/decks/${deck.id}/notes`, {
    kind: 'cloze', name: 'Kettenregel', tags: ['PRÜFUNG'],
    fields: { text: 'Die Kettenregel: {{c1::\\( (f \\circ g)\' \\)}}. Man leitet {{c2::außen}} ab, dann die {{c2::innere}}.' },
  })).json();
  assert.equal(note.cards, 2);
  const due = (await call('GET', `/academy/own/decks/${deck.id}/due`)).json();
  assert.deepEqual(due.map((c: { ord: number }) => c.ord), [1, 2]);
  // Again, hard, good and easy each say when the card comes back, in that order.
  const next = due[0].next.map((d: string) => Date.parse(d));
  assert.ok(next[0] < next[1] && next[1] < next[2] && next[2] < next[3]);

  // Good on the first: it is no longer due.
  const reviewed = (await call('POST', `/academy/own/cards/${due[0].id}/review`, { rating: 3 })).json();
  assert.ok(Date.parse(reviewed.due) > Date.now());
  assert.equal((await call('GET', `/academy/own/decks/${deck.id}/due`)).json().length, 1);

  // c2 struck, c3 added: c1 keeps its schedule, c3 is new.
  const edited = (await call('PATCH', `/academy/own/notes/${note.id}`, {
    kind: 'cloze', name: 'Kettenregel', tags: [], fields: { text: 'Die Kettenregel: {{c1::\\( (f \\circ g)\' \\)}}. Sie gilt {{c3::überall}}.' },
  })).json();
  assert.equal(edited.cards, 2);
  const after = (await call('GET', `/academy/own/decks/${deck.id}/due`)).json();
  assert.deepEqual(after.map((c: { ord: number }) => c.ord), [3]);

  const list = (await call('GET', '/academy/own')).json();
  assert.equal(list[0].notes[0].cards, 2);
  assert.equal(list[0].due, 1);
  assert.equal((await call('DELETE', `/academy/own/notes/${note.id}`)).statusCode, 204);
  assert.equal((await call('GET', '/academy/own')).json()[0].notes.length, 0);
});

test('a picture is kept, its bars make a card each, and the deck goes to Anki', async () => {
  const deck = (await call('POST', '/academy/own/decks', { title: 'Lineare Algebra' })).json();
  const up = await app.inject({ method: 'POST', url: '/api/v1/academy/own/images', payload: PNG, headers: { 'content-type': 'image/png' } });
  assert.equal(up.statusCode, 201);
  const img = await call('GET', `/academy/own/images/${up.json().id}`);
  assert.equal(img.headers['content-type'], 'image/png');
  assert.equal(img.rawPayload.length, PNG.length);
  assert.equal((await app.inject({ method: 'POST', url: '/api/v1/academy/own/images', payload: 'x', headers: { 'content-type': 'text/plain' } })).statusCode, 415);

  const occ = (await call('POST', `/academy/own/decks/${deck.id}/notes`, {
    kind: 'occlusion', name: 'Kugelkoordinaten', tags: [],
    fields: { imageId: up.json().id, masks: [{ x: 0.5, y: 0.4, w: 0.06, h: 0.08 }, { x: 0.4, y: 0.7, w: 0.06, h: 0.08 }], labels: ['θ', 'φ'], mode: 'all' },
  })).json();
  assert.equal(occ.cards, 2);
  await call('POST', `/academy/own/decks/${deck.id}/notes`, { kind: 'reverse', name: 'Ableitung', tags: ['WICHTIG'], fields: { front: 'sin', back: 'cos' } });
  await call('POST', `/academy/own/decks/${deck.id}/notes`, { kind: 'cloze', name: 'x', tags: [], fields: { text: 'a {{c1::b}}\tc' } });

  const txt = (await call('GET', `/academy/own/decks/${deck.id}/anki`)).body;
  const lines = txt.trim().split('\n');
  assert.deepEqual(lines.slice(0, 5), ['#separator:tab', '#html:true', '#notetype column:1', '#deck:Lineare Algebra', '#tags column:4']);
  const rows = lines.slice(5).map((l) => l.split('\t'));
  assert.deepEqual(rows.map((r) => r[0]), ['Basic', 'Basic', 'Basic (and reversed card)', 'Cloze']);
  assert.match(rows[0]![1]!, /data:image\/png;base64,/);
  assert.match(rows[0]![2]!, /<br>θ$/);
  assert.equal(rows[2]![3], 'WICHTIG');
  assert.equal(rows[3]![1], 'a {{c1::b}} c');
});
