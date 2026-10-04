import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { sql } from 'drizzle-orm';
import { createDb, type Db } from '../src/db/client.ts';
import { seed } from '../src/db/seed.ts';
import { buildApp } from '../src/app.ts';
import { Post, type Letter, type Mailbox } from '../src/academy/post.ts';

const url = process.env.TEST_DATABASE_URL ?? 'postgres://aura:aura@localhost:15434/aura_test';

const RAW = [
  'From: "Studienservicecenter Physik" <ssc.physik@example.ac.at>',
  'To: student@example.ac.at',
  'Subject: =?UTF-8?Q?Gruppeneinteilung_bitte_pr=C3=BCfen?=',
  'Date: Mon, 05 Oct 2026 08:12:00 +0200',
  'MIME-Version: 1.0',
  'Content-Type: multipart/mixed; boundary="b1"',
  '',
  '--b1',
  'Content-Type: text/html; charset=utf-8',
  '',
  '<p>Liebe Studierende,</p><p>die Einteilung ist <b>fertig</b>.</p>',
  '--b1',
  'Content-Type: text/plain; name="plan.txt"',
  'Content-Disposition: attachment; filename="plan.txt"',
  '',
  'Gruppe 3',
  '--b1--',
  '',
].join('\r\n');

// A mailbox in memory: two letters, the first unread, and every flag set kept.
function fakeBox() {
  const letters: Letter[] = [
    { uid: 12, from: 'Studienservicecenter Physik', addr: 'ssc.physik@example.ac.at', subject: 'Gruppeneinteilung bitte prüfen', date: '2026-10-05T06:12:00.000Z', unread: true },
    { uid: 11, from: 'Moodle', addr: 'noreply@moodle.example.ac.at', subject: 'Serie 2', date: '2026-10-04T06:00:00.000Z', unread: false },
  ];
  const flags: [number, boolean][] = [];
  const box: Mailbox = {
    inbox: async () => ({ letters: letters.map((l) => ({ ...l })), total: 2, unread: letters.filter((l) => l.unread).length }),
    source: async (uid) => (uid === 12 ? Buffer.from(RAW) : null),
    flag: async (uids, seen) => { for (const uid of uids) { flags.push([uid, seen]); const l = letters.find((x) => x.uid === uid); if (l) l.unread = !seen; } },
  };
  return { box, flags };
}

let db: Db;
let close: () => Promise<void>;

before(async () => {
  const created = createDb(url);
  db = created.db;
  close = () => created.pool.end();
  await migrate(db, { migrationsFolder: './drizzle' });
});
after(async () => { await close(); });
beforeEach(async () => {
  await db.execute(sql`TRUNCATE sessions, activities, folders, meta, device RESTART IDENTITY CASCADE`);
  await seed(db);
});

async function withPost(run: (app: ReturnType<typeof buildApp>, flags: [number, boolean][]) => Promise<void>) {
  const { box, flags } = fakeBox();
  const post = new Post(box);
  const app = buildApp(db, { logger: false, post });
  await app.ready();
  await post.check();
  try { await run(app, flags); } finally { await app.close(); }
}

test('without the env the post says it is not set up', async () => {
  const app = buildApp(db, { logger: false, post: new Post(null) });
  const got = (await app.inject({ method: 'GET', url: '/api/v1/mail' })).json();
  assert.equal(got.configured, false);
  assert.deepEqual(got.letters, []);
  await app.close();
});

test('the inbox is listed newest first with the unread count', async () => {
  await withPost(async (app) => {
    const got = (await app.inject({ method: 'GET', url: '/api/v1/mail' })).json();
    assert.equal(got.configured, true);
    assert.equal(got.unread, 1);
    assert.deepEqual(got.letters.map((l: Letter) => l.uid), [12, 11]);
    assert.ok(got.checkedAt);
  });
});

test('a letter opened is read, as text, with its attachments', async () => {
  await withPost(async (app, flags) => {
    const got = (await app.inject({ method: 'GET', url: '/api/v1/mail/12' })).json();
    assert.equal(got.subject, 'Gruppeneinteilung bitte prüfen');
    assert.match(got.text, /Liebe Studierende/);
    assert.match(got.text, /FERTIG|fertig/);
    assert.deepEqual(got.attachments.map((a: { name: string }) => a.name), ['plan.txt']);
    assert.deepEqual(flags, [[12, true]]);
    assert.equal((await app.inject({ method: 'GET', url: '/api/v1/mail' })).json().unread, 0);
    const file = await app.inject({ method: 'GET', url: '/api/v1/mail/12/attachments/0' });
    assert.equal(file.statusCode, 200);
    assert.equal(file.body.trim(), 'Gruppe 3');
    assert.equal((await app.inject({ method: 'GET', url: '/api/v1/mail/99' })).statusCode, 404);
  });
});

test('letters can be marked unread again, or all read at once', async () => {
  await withPost(async (app, flags) => {
    const put = await app.inject({ method: 'PUT', url: '/api/v1/mail/seen', payload: { uids: [11], seen: false } });
    assert.equal(put.statusCode, 204);
    assert.deepEqual(flags, [[11, false]]);
    assert.equal((await app.inject({ method: 'GET', url: '/api/v1/mail' })).json().unread, 2);
    await app.inject({ method: 'PUT', url: '/api/v1/mail/seen', payload: { uids: [11, 12], seen: true } });
    assert.equal((await app.inject({ method: 'GET', url: '/api/v1/mail' })).json().unread, 0);
  });
});

test('the device hears how much is unread', async () => {
  await withPost(async (app) => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/sync', payload: { deviceId: 'aura-1', configVersion: 0, events: [] } });
    assert.equal(res.json().mail, 1);
  });
});
