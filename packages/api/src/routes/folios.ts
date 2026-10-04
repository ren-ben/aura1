import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from '@fastify/type-provider-zod';
import { z } from 'zod';
import { asc, eq } from 'drizzle-orm';
import { FOLIO_KINDS, guessKind, type FoliosDto } from '@aura/shared';
import type { Db } from '../db/client.ts';
import { decks, folioFiles, folios, moodle } from '../db/schema.ts';
import { MoodleError, Refused, contentsOf, courseOf, download, login, session, ws, type Http } from '../academy/moodle.ts';
import { readPdf } from '../academy/pdf.ts';
import { syncDeck } from '../academy/cards.ts';

// The folios: a course's PDFs from Moodle or by hand, and Moodle's flashcard
// decks as counts (docs/superpowers/specs/2026-10-04-folios-design.md).
const idParams = z.object({ id: z.coerce.number().int().positive() });
const term = z.string().regex(/^\d{4}[WS]$/);
type Row = typeof folios.$inferSelect;
const dto = ({ moodleUrl: _, modifiedAt, addedAt, ...f }: Row) => ({ ...f, modifiedAt: modifiedAt.toISOString(), addedAt: addedAt.toISOString() });

export const folioRoutes: FastifyPluginAsync<{ db: Db; http?: Http }> = async (app, opts) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db } = opts;
  const http = opts.http ?? ((url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(60_000) }));
  // One sync at a time; the page asks how it went.
  let syncing: Promise<unknown> | null = null;
  let lastError: string | null = null;

  async function store(f: { nr: string; semester: string; title: string; section: string | null; source: 'moodle' | 'upload'; moodleUrl: string | null; modifiedAt: Date; bytes: Uint8Array }, kind = guessKind(f.title, f.section ?? '')) {
    const pdf = await readPdf(f.bytes, f.title);
    const values = { nr: f.nr, semester: f.semester, title: f.title, section: f.section, source: f.source, moodleUrl: f.moodleUrl, modifiedAt: f.modifiedAt, size: f.bytes.length, pages: pdf.pages, outline: pdf.outline };
    const [existing] = f.moodleUrl ? await db.select({ id: folios.id }).from(folios).where(eq(folios.moodleUrl, f.moodleUrl)) : [];
    // A file Moodle revised keeps the kind it was given.
    const [row] = existing
      ? await db.update(folios).set(values).where(eq(folios.id, existing.id)).returning()
      : await db.insert(folios).values({ ...values, kind }).returning();
    const file = { pdf: Buffer.from(f.bytes), texts: pdf.texts };
    await db.insert(folioFiles).values({ folioId: row!.id, ...file }).onConflictDoUpdate({ target: folioFiles.folioId, set: file });
    return row!;
  }

  // Every course Moodle has for us: new and revised PDFs fetched and read,
  // the flashcard decks counted. A refused token marks the link broken.
  async function sync() {
    const [link] = await db.select().from(moodle);
    if (!link) return;
    try {
      const mine = await ws<{ id: number; shortname: string; fullname: string }[]>(http, link.token, 'core_enrol_get_users_courses', { userid: link.userId });
      const seen = mine.flatMap((c) => { const at = courseOf(c.shortname); return at ? [{ ...at, id: c.id, name: c.fullname.replace(/^\d{4}[WS]\s+\d{6}-\d+\s+/, '').replace(/^STEOP\d:\s*/, '') }] : []; });
      const known = new Map((await db.select({ url: folios.moodleUrl, at: folios.modifiedAt }).from(folios)).map((f) => [f.url, f.at.getTime()]));
      let cookie: string | null = null;
      for (const c of seen) {
        const { files, decks: found } = contentsOf(await ws(http, link.token, 'core_course_get_contents', { courseid: c.id }));
        for (const f of files) {
          if (known.get(f.key) === f.modified.getTime()) continue;
          const bytes = await download(http, f.url, link.token);
          await store({ nr: c.nr, semester: c.semester, title: f.title, section: f.section, source: 'moodle', moodleUrl: f.key, modifiedAt: f.modified, bytes });
        }
        for (const d of found) {
          if (!link.privateToken) break;
          cookie ??= await session(http, link.token, link.privateToken, link.userId);
          const values = { nr: c.nr, semester: c.semester, instance: d.instance, name: d.name };
          const [deck] = await db.insert(decks).values({ cmid: d.cmid, boxes: [0, 0, 0, 0, 0, 0], ...values }).onConflictDoUpdate({ target: decks.cmid, set: values }).returning();
          await syncDeck(db, http, link, cookie, deck!.id, d.cmid, d.instance);
        }
      }
      await db.update(moodle).set({ syncedAt: new Date(), refusedAt: null, courses: seen });
      lastError = null;
    } catch (e) {
      if (e instanceof Refused) await db.update(moodle).set({ refusedAt: new Date() });
      lastError = e instanceof Error ? e.message : 'the sync failed';
    }
  }

  r.get('/academy/folios', async (): Promise<FoliosDto & { syncing: boolean; error: string | null }> => {
    // Read before the rows: a sync ending in between must not look finished
    // with what it found still unread.
    const busy = !!syncing;
    const [link] = await db.select().from(moodle);
    return {
      moodle: {
        bound: !!link, username: link?.username ?? null, boundAt: link?.boundAt.toISOString() ?? null,
        syncedAt: link?.syncedAt?.toISOString() ?? null, refusedAt: link?.refusedAt?.toISOString() ?? null,
        courses: (link?.courses ?? []).map(({ nr, semester, name }) => ({ nr, semester, name })),
      },
      folios: (await db.select().from(folios).orderBy(asc(folios.nr), asc(folios.modifiedAt))).map(dto),
      decks: (await db.select().from(decks).orderBy(asc(decks.cmid))).map(({ instance: _, syncedAt, ...d }) => ({ ...d, syncedAt: syncedAt.toISOString() })),
      syncing: busy, error: lastError,
    };
  });

  // Bound once with the u:account ID and password, through weblogin. Only
  // the tokens are kept; the password goes with this request.
  r.post('/academy/moodle', {
    schema: { body: z.object({ username: z.string().trim().min(2).max(40), password: z.string().min(1).max(200) }) },
  }, async (request, reply) => {
    const { username, password } = request.body;
    try {
      const app = await login(http, username, password, 'moodle_mobile_app');
      const cards = await login(http, username, password, 'flashcards').catch(() => null);
      const info = await ws<{ userid: number }>(http, app.token, 'core_webservice_get_site_info');
      const values = { username, userId: info.userid, token: app.token, privateToken: app.privateToken, flashcardsToken: cards?.token ?? null, boundAt: new Date(), refusedAt: null };
      await db.insert(moodle).values({ id: 1, ...values }).onConflictDoUpdate({ target: moodle.id, set: values });
    } catch (e) {
      return reply.code(e instanceof MoodleError ? 401 : 502).send({ message: e instanceof Error ? e.message : 'Moodle did not answer' });
    }
    syncing ??= sync().finally(() => { syncing = null; });
    return reply.code(201).send();
  });

  r.delete('/academy/moodle', async (_, reply) => {
    await db.delete(moodle);
    return reply.code(204).send();
  });

  r.post('/academy/moodle/sync', async (_, reply) => {
    const [link] = await db.select({ id: moodle.id }).from(moodle);
    if (!link) return reply.code(409).send({ message: 'Moodle is not bound' });
    syncing ??= sync().finally(() => { syncing = null; });
    return reply.code(202).send();
  });

  // A PDF dropped in by hand, sent as it is.
  app.addContentTypeParser('application/pdf', { parseAs: 'buffer', bodyLimit: 80 * 1024 * 1024 }, (_, body, done) => done(null, body));
  r.post('/academy/folios', {
    bodyLimit: 80 * 1024 * 1024,
    schema: { querystring: z.object({ nr: z.string().regex(/^\d{6}$/), semester: term, title: z.string().trim().min(1).max(200) }) },
  }, async (request, reply) => {
    const bytes = new Uint8Array(request.body as Buffer);
    if (String.fromCharCode(...bytes.slice(0, 5)) !== '%PDF-') return reply.code(415).send({ message: 'that is not a PDF' });
    const { nr, semester, title } = request.query;
    try {
      return reply.code(201).send(dto(await store({ nr, semester, title, section: null, source: 'upload', moodleUrl: null, modifiedAt: new Date(), bytes })));
    } catch {
      return reply.code(422).send({ message: 'the PDF could not be read' });
    }
  });

  r.get('/academy/folios/:id/pdf', { schema: { params: idParams } }, async (request, reply) => {
    const [row] = await db.select({ title: folios.title, pdf: folioFiles.pdf }).from(folios).innerJoin(folioFiles, eq(folioFiles.folioId, folios.id)).where(eq(folios.id, request.params.id));
    if (!row) return reply.code(404).send();
    return reply.type('application/pdf').header('content-disposition', `inline; filename="${encodeURIComponent(row.title)}"`).send(row.pdf);
  });

  r.patch('/academy/folios/:id', {
    schema: { params: idParams, body: z.object({ kind: z.enum(FOLIO_KINDS).optional(), nr: z.string().regex(/^\d{6}$/).optional(), semester: term.optional() }) },
  }, async (request, reply) => {
    const rows = await db.update(folios).set(request.body).where(eq(folios.id, request.params.id)).returning({ id: folios.id });
    return reply.code(rows.length ? 204 : 404).send();
  });

  r.delete('/academy/folios/:id', { schema: { params: idParams } }, async (request, reply) => {
    const rows = await db.delete(folios).where(eq(folios.id, request.params.id)).returning({ id: folios.id });
    return reply.code(rows.length ? 204 : 404).send();
  });
};
