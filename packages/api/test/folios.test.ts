import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { sql } from 'drizzle-orm';
import { guessKind } from '@aura/shared';
import { createDb, type Db } from '../src/db/client.ts';
import { buildApp } from '../src/app.ts';
import { contentsOf, courseOf, formOf, login, poolOf, type Http } from '../src/academy/moodle.ts';
import { chaptersOf } from '../src/academy/pdf.ts';

const url = process.env.TEST_DATABASE_URL ?? 'postgres://aura:aura@localhost:15434/aura_test';
const SKRIPT = new Uint8Array(readFileSync(new URL('./fixtures/skript.pdf', import.meta.url)));
const POOL = readFileSync(new URL('./fixtures/moodle-flashcards-pool.html', import.meta.url), 'utf8');

// weblogin and Moodle as the app meets them: launch.php to the IdP, the
// local-storage step, the login form, the SAML post back, the token.
function fakeMoodle(o: { password?: string; refuse?: boolean; modified?: number } = {}) {
  const seen = { downloads: 0, logins: 0 };
  let pending: string | null = null;
  const res = (status: number, body = '', headers: Record<string, string> = {}) => new Response(status === 302 || status === 303 ? null : body, { status, headers });
  const http: Http = async (u, init) => {
    const href = String(u), body = init?.body instanceof URLSearchParams ? init.body : new URLSearchParams();
    if (href.includes('/admin/tool/mobile/launch.php')) {
      const service = new URL(href).searchParams.get('service');
      if (!String((init?.headers as Record<string, string>)?.cookie ?? '').includes('MoodleSession=s1')) { pending = service; return res(303, '', { location: 'https://weblogin.univie.ac.at/idp/profile/SAML2/Redirect/SSO?SAMLRequest=x' }); }
      return res(302, '', { location: `moodlemobile://token=${Buffer.from(`sig:::tok-${service}:::priv-${service}`).toString('base64')}` });
    }
    if (href.startsWith('https://weblogin.univie.ac.at/idp/profile/SAML2/Redirect/SSO?SAMLRequest')) return res(302, '', { location: '/idp/profile/SAML2/Redirect/SSO?execution=e1s1', 'set-cookie': 'JSESSIONID=j1; Path=/idp' });
    if (href.endsWith('execution=e1s1') && init?.method !== 'POST') return res(200, '<form action="/idp/profile/SAML2/Redirect/SSO?execution=e1s1" method="post"><input name="shib_idp_ls_supported" type="hidden" /><input name="_eventId_proceed" type="hidden" /></form>');
    if (href.endsWith('execution=e1s1')) return res(302, '', { location: '/idp/profile/SAML2/Redirect/SSO?execution=e1s2' });
    if (href.endsWith('execution=e1s2') && init?.method !== 'POST') return res(200, '<form action="/idp/profile/SAML2/Redirect/SSO?execution=e1s2" method="post"><input name="j_username" type="text"><input name="j_password" type="password"><input type="checkbox" name="donotcache"><button name="_eventId_proceed" type="submit">Anmelden</button></form>');
    if (href.endsWith('execution=e1s2')) {
      seen.logins++;
      if (body.get('j_password') !== (o.password ?? 'pw') || body.get('j_username') !== 'oliwierp06') return res(302, '', { location: '/idp/profile/SAML2/Redirect/SSO?execution=e1s2' });
      return res(200, '<form method="post" action="https&#x3a;&#x2f;&#x2f;moodle.univie.ac.at&#x2f;auth&#x2f;saml2&#x2f;sp&#x2f;saml2-acs.php&#x2f;moodle.univie.ac.at"><input type="hidden" name="RelayState" value="https&#x3a;&#x2f;&#x2f;moodle.univie.ac.at&#x2f;admin&#x2f;tool&#x2f;mobile&#x2f;launch.php&#x3f;service&#x3d;x"/><input type="hidden" name="SAMLResponse" value="PHNhbWw+"/></form>');
    }
    if (href.includes('saml2-acs.php')) {
      assert.equal(body.get('SAMLResponse'), 'PHNhbWw+');
      return res(303, '', { location: `https://moodle.univie.ac.at/admin/tool/mobile/launch.php?service=${pending}`, 'set-cookie': 'MoodleSession=s1; path=/' });
    }
    if (href.endsWith('/webservice/rest/server.php')) {
      if (o.refuse) return Response.json({ errorcode: 'invalidtoken', message: 'Invalid token' });
      const fn = body.get('wsfunction');
      if (fn === 'core_webservice_get_site_info') return Response.json({ userid: 870270 });
      if (fn === 'core_enrol_get_users_courses') return Response.json([{ id: 472673, shortname: 'WS2026-261603-1', fullname: '2026W 261603-1 STEOP2: Physikalische Rechenmethoden' }, { id: 1, shortname: 'Sandbox', fullname: 'Sandbox' }]);
      if (fn === 'core_course_get_contents') return Response.json([{ name: 'Übungsblätter und Kursunterlagen', modules: [
        { id: 11, instance: 1, name: 'Skriptum', modname: 'resource', contents: [{ type: 'file', filename: 'Skriptum_2026.pdf', fileurl: 'https://moodle.univie.ac.at/webservice/pluginfile.php/9/mod_resource/content/3/Skriptum_2026.pdf?forcedownload=1', mimetype: 'application/pdf', filesize: SKRIPT.length, timemodified: o.modified ?? 1790000000 }] },
        { id: 12, instance: 2, name: 'Bild', modname: 'resource', contents: [{ type: 'file', filename: 'bild.png', fileurl: 'https://moodle.univie.ac.at/x/bild.png', mimetype: 'image/png', filesize: 1, timemodified: 1 }] },
        { id: 20015910, instance: 4631, name: 'Integration', modname: 'flashcards' },
      ] }]);
      if (fn === 'tool_mobile_get_autologin_key') return Response.json({ key: 'k', autologinurl: 'https://moodle.univie.ac.at/admin/tool/mobile/autologin.php' });
    }
    if (href.includes('/pluginfile.php/')) { seen.downloads++; assert.match(href, /token=tok-moodle_mobile_app/); return new Response(SKRIPT); }
    if (href.endsWith('/autologin.php')) return res(303, '', { location: '/my/', 'set-cookie': 'MoodleSession=web; path=/' });
    if (href.includes('/mod/flashcards/studentquestioninit.php?id=20015910')) { assert.match(String((init?.headers as Record<string, string>).cookie), /MoodleSession=web/); return res(200, POOL); }
    throw new Error(`unexpected ${href}`);
  };
  return { http, seen };
}

let db: Db;
let close: () => Promise<void>;
let app: ReturnType<typeof buildApp>;
let moodle = fakeMoodle();

before(async () => {
  const created = createDb(url);
  db = created.db;
  close = () => created.pool.end();
  await migrate(db, { migrationsFolder: './drizzle' });
  app = buildApp(db, { logger: false, moodle: (u, i) => moodle.http(u, i) });
  await app.ready();
});
after(async () => { await app.close(); await close(); });
beforeEach(async () => {
  await db.execute(sql`TRUNCATE moodle, folios, folio_files, decks RESTART IDENTITY CASCADE`);
  moodle = fakeMoodle();
});

const call = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, payload?: object) => app.inject({ method, url: `/api/v1${path}`, payload });
// The sync runs after the answer; the page asks until it is done.
async function settled() {
  for (let i = 0; i < 200; i++) { const s = (await call('GET', '/academy/folios')).json(); if (!s.syncing) return s; await new Promise((r) => setTimeout(r, 25)); }
  throw new Error('the sync never finished');
}

test('a file is a skript, a sheet, slides, an exam or other, by its name and section', () => {
  assert.equal(guessKind('Skriptum_2026.pdf', 'Übungsblätter und Kursunterlagen'), 'skript');
  assert.equal(guessKind('Serie 1.pdf', 'Übungsserien'), 'sheet');
  assert.equal(guessKind('AnaPhysITermin2.pdf', 'Prüfungsvorbereitung'), 'exam');
  assert.equal(guessKind('Lernmaterial_Winkelfunktionen.pdf', 'Lernmaterialien und Foliensätze'), 'slides');
  assert.equal(guessKind('WelcomeDay_2026_final.pdf', 'Welcome Day 2026'), 'other');
});

test('Moodle courses, files and flashcard pools are read as they come', () => {
  assert.deepEqual(courseOf('WS2026-261603-1'), { nr: '261603', semester: '2026W' });
  assert.deepEqual(courseOf('SS2027-250011-3'), { nr: '250011', semester: '2027S' });
  assert.equal(courseOf('Sandbox'), null);
  const { files, decks } = contentsOf([{ name: 'Kurs', modules: [
    { id: 1, instance: 1, name: 'S', modname: 'resource', contents: [{ type: 'file', filename: 'a.pdf', fileurl: 'https://m/webservice/pluginfile.php/9/mod_resource/content/7/a.pdf?forcedownload=1', mimetype: 'application/pdf', filesize: 3, timemodified: 1 }] },
    { id: 2, instance: 5, name: 'Funktionen', modname: 'flashcards' },
  ] }]);
  assert.equal(files[0]!.key, 'https://m/webservice/pluginfile.php/9/mod_resource/content/0/a.pdf');
  assert.deepEqual(decks, [{ cmid: 2, instance: 5, name: 'Funktionen' }]);
  // Integration on 04.10.2026: nine still in the pool, five in box 1, six in box 2.
  assert.deepEqual(poolOf(POOL), [9, 5, 6, 0, 0, 0]);
});

test('bookmarks become chapters; a file without them is one', () => {
  assert.deepEqual(chaptersOf([{ title: 'B', from: 5 }, { title: 'A', from: 2 }, { title: 'A2', from: 2 }], 9, 'x.pdf'),
    [{ title: 'A', from: 1, to: 4 }, { title: 'B', from: 5, to: 9 }]);
  assert.deepEqual(chaptersOf([], 3, 'Serie 1.pdf'), [{ title: 'Serie 1', from: 1, to: 3 }]);
});

test('weblogin is walked once for a token; a refused password is never sent again', async () => {
  assert.equal(formOf('<p>no form</p>', 'u', 'p'), null);
  const ok = await login(moodle.http, 'oliwierp06', 'pw', 'moodle_mobile_app');
  assert.deepEqual(ok, { token: 'tok-moodle_mobile_app', privateToken: 'priv-moodle_mobile_app' });
  const wrong = fakeMoodle({ password: 'other' });
  await assert.rejects(login(wrong.http, 'oliwierp06', 'pw', 'moodle_mobile_app'), /refused/);
  assert.equal(wrong.seen.logins, 1);
});

test('bound once, the sync files the PDFs and counts the decks; nothing is fetched twice', async () => {
  assert.equal((await call('POST', '/academy/moodle', { username: 'oliwierp06', password: 'wrong' })).statusCode, 401);
  assert.equal((await call('POST', '/academy/moodle', { username: 'oliwierp06', password: 'pw' })).statusCode, 201);
  const state = await settled();
  assert.equal(state.error, null);
  assert.equal(state.moodle.bound, true);
  assert.equal(state.moodle.username, 'oliwierp06');
  assert.ok(!('token' in state.moodle));
  assert.deepEqual(state.moodle.courses, [{ nr: '261603', semester: '2026W', name: 'Physikalische Rechenmethoden' }]);
  const [skript] = state.folios;
  assert.equal(state.folios.length, 1);
  assert.equal(skript.kind, 'skript');
  assert.equal(skript.source, 'moodle');
  assert.equal(skript.pages, 4);
  assert.deepEqual(skript.outline.map((c: { title: string }) => c.title), ['1 Funktionen', '2 Differentialrechnung', '3 Integration']);
  assert.deepEqual(state.decks.map((d: { name: string; boxes: number[] }) => [d.name, d.boxes]), [['Integration', [9, 5, 6, 0, 0, 0]]]);
  const pdf = await call('GET', `/academy/folios/${skript.id}/pdf`);
  assert.equal(pdf.headers['content-type'], 'application/pdf');
  assert.equal(pdf.rawPayload.length, SKRIPT.length);

  // Asked again with nothing changed: no download. Revised on Moodle: fetched
  // again into the same folio, which keeps the kind it was given.
  await call('PATCH', `/academy/folios/${skript.id}`, { kind: 'slides' });
  await call('POST', '/academy/moodle/sync');
  await settled();
  assert.equal(moodle.seen.downloads, 1);
  moodle = fakeMoodle({ modified: 1790009999 });
  await call('POST', '/academy/moodle/sync');
  const after = await settled();
  assert.equal(moodle.seen.downloads, 1);
  assert.equal(after.folios.length, 1);
  assert.equal(after.folios[0].kind, 'slides');
});

test('a refused token marks the link broken and keeps the files', async () => {
  await call('POST', '/academy/moodle', { username: 'oliwierp06', password: 'pw' });
  await settled();
  moodle = fakeMoodle({ refuse: true });
  await call('POST', '/academy/moodle/sync');
  const state = await settled();
  assert.ok(state.moodle.refusedAt);
  assert.match(state.error, /Invalid token/);
  assert.equal(state.folios.length, 1);
  assert.equal((await call('DELETE', '/academy/moodle')).statusCode, 204);
  assert.equal((await call('POST', '/academy/moodle/sync')).statusCode, 409);
});

test('a PDF dropped in by hand is read and filed; anything else is refused', async () => {
  const up = (body: Uint8Array | string, q = 'nr=260022&semester=2026W&title=Skriptum%20LA1.pdf') =>
    app.inject({ method: 'POST', url: `/api/v1/academy/folios?${q}`, payload: Buffer.from(body), headers: { 'content-type': 'application/pdf' } });
  const res = await up(SKRIPT);
  assert.equal(res.statusCode, 201);
  const f = res.json();
  assert.deepEqual([f.nr, f.kind, f.source, f.pages, f.outline.length], ['260022', 'skript', 'upload', 4, 3]);
  assert.equal((await up('not a pdf')).statusCode, 415);
  assert.equal((await up(SKRIPT, 'nr=26&semester=2026W&title=x')).statusCode, 400);
  assert.equal((await call('DELETE', `/academy/folios/${f.id}`)).statusCode, 204);
  assert.equal((await call('GET', `/academy/folios/${f.id}/pdf`)).statusCode, 404);
});
