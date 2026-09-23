import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from '@fastify/type-provider-zod';
import { z } from 'zod';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import type { Db } from '../db/client.ts';
import { books, chapters, marks } from '../db/schema.ts';

// The book is parsed in the browser - epub is a zip of xhtml, pdf is its own
// misery - and arrives here as chapters of plain text. Nothing here knows
// anything about either format.
const bookDto = z.object({
  id: z.number().int(),
  title: z.string(),
  author: z.string().nullable(),
  format: z.enum(['epub', 'pdf', 'text']),
  words: z.number().int(),
  chapterIdx: z.number().int(),
  through: z.number().int(),
  readAt: z.string().nullable(),
  chapters: z.array(z.object({ idx: z.number().int(), title: z.string(), words: z.number().int() })),
  marks: z.number().int(),
});

const markDto = z.object({
  id: z.number().int(),
  bookId: z.number().int(),
  chapterIdx: z.number().int(),
  start: z.number().int(),
  end: z.number().int(),
  body: z.string(),
  note: z.string().nullable(),
  source: z.enum(['web', 'device']),
  createdAt: z.string(),
});

const words = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

export const bookRoutes: FastifyPluginAsync<{ db: Db }> = async (app, opts) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db } = opts;

  const shelf = async () => {
    const rows = await db.select().from(books).where(isNull(books.archivedAt)).orderBy(desc(books.readAt), desc(books.addedAt));
    if (!rows.length) return [];
    const parts = await db.select({ bookId: chapters.bookId, idx: chapters.idx, title: chapters.title, len: sql<number>`length(${chapters.body})` })
      .from(chapters).orderBy(asc(chapters.bookId), asc(chapters.idx));
    const counted = await db.select({ bookId: marks.bookId, n: sql<number>`count(*)::int` }).from(marks).groupBy(marks.bookId);
    return rows.map((b) => ({
      id: b.id,
      title: b.title,
      author: b.author,
      format: b.format,
      words: b.words,
      chapterIdx: b.chapterIdx,
      through: b.through,
      readAt: b.readAt?.toISOString() ?? null,
      chapters: parts.filter((c) => c.bookId === b.id).map((c) => ({ idx: c.idx, title: c.title, words: Math.round(c.len / 6) })),
      marks: counted.find((c) => c.bookId === b.id)?.n ?? 0,
    }));
  };

  r.get('/books', { schema: { response: { 200: z.array(bookDto) } } }, shelf);

  // The whole of one chapter, for reading.
  r.get('/books/:id/chapters/:idx', {
    schema: {
      params: z.object({ id: z.coerce.number().int().positive(), idx: z.coerce.number().int().nonnegative() }),
      response: { 200: z.object({ idx: z.number().int(), title: z.string(), body: z.string() }) },
    },
  }, async (request, reply) => {
    const [row] = await db.select().from(chapters)
      .where(and(eq(chapters.bookId, request.params.id), eq(chapters.idx, request.params.idx)));
    if (!row) return reply.code(404).send();
    return { idx: row.idx, title: row.title, body: row.body };
  });

  r.post('/books', {
    schema: {
      body: z.object({
        title: z.string().trim().min(1).max(200),
        author: z.string().trim().max(200).nullable().optional(),
        format: z.enum(['epub', 'pdf', 'text']),
        chapters: z.array(z.object({
          title: z.string().trim().max(200),
          body: z.string().min(1),
        })).min(1).max(600),
      }),
      response: { 201: z.object({ id: z.number().int() }) },
    },
    bodyLimit: 40 * 1024 * 1024,
  }, async (request, reply) => {
    const body = request.body;
    const total = body.chapters.reduce((a, c) => a + words(c.body), 0);
    const [book] = await db.insert(books).values({
      title: body.title,
      author: body.author || null,
      format: body.format,
      words: total,
    }).returning({ id: books.id });
    await db.insert(chapters).values(body.chapters.map((c, idx) => ({
      bookId: book!.id,
      idx,
      title: c.title || `Chapter ${idx + 1}`,
      body: c.body,
    })));
    return reply.code(201).send({ id: book!.id });
  });

  // Where the reading is. The device sends the same thing through its sync.
  r.put('/books/:id/reading', {
    schema: {
      params: z.object({ id: z.coerce.number().int().positive() }),
      body: z.object({ chapterIdx: z.number().int().nonnegative(), through: z.number().int().min(0).max(1000) }),
    },
  }, async (request, reply) => {
    const rows = await db.update(books)
      .set({ chapterIdx: request.body.chapterIdx, through: request.body.through, readAt: new Date() })
      .where(eq(books.id, request.params.id)).returning({ id: books.id });
    return reply.code(rows.length ? 204 : 404).send();
  });

  r.delete('/books/:id', {
    schema: { params: z.object({ id: z.coerce.number().int().positive() }) },
  }, async (request, reply) => {
    const rows = await db.update(books).set({ archivedAt: new Date() })
      .where(eq(books.id, request.params.id)).returning({ id: books.id });
    return reply.code(rows.length ? 204 : 404).send();
  });

  r.get('/marks', { schema: { response: { 200: z.array(markDto) } } }, async () => {
    const rows = await db.select().from(marks).orderBy(desc(marks.createdAt), desc(marks.id));
    return rows.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() }));
  });

  r.post('/marks', {
    schema: {
      body: z.object({
        bookId: z.number().int().positive(),
        chapterIdx: z.number().int().nonnegative(),
        start: z.number().int().nonnegative(),
        end: z.number().int().nonnegative(),
        body: z.string().trim().min(1).max(4000),
        note: z.string().trim().max(2000).nullable().optional(),
      }),
      response: { 201: z.object({ id: z.number().int() }) },
    },
  }, async (request, reply) => {
    const [row] = await db.insert(marks).values({ ...request.body, note: request.body.note || null, source: 'web' })
      .returning({ id: marks.id });
    return reply.code(201).send({ id: row!.id });
  });

  // What he made of it, written afterwards.
  r.put('/marks/:id', {
    schema: {
      params: z.object({ id: z.coerce.number().int().positive() }),
      body: z.object({ note: z.string().trim().max(2000).nullable() }),
    },
  }, async (request, reply) => {
    const rows = await db.update(marks).set({ note: request.body.note || null })
      .where(eq(marks.id, request.params.id)).returning({ id: marks.id });
    return reply.code(rows.length ? 204 : 404).send();
  });

  r.delete('/marks/:id', {
    schema: { params: z.object({ id: z.coerce.number().int().positive() }) },
  }, async (request, reply) => {
    const rows = await db.delete(marks).where(eq(marks.id, request.params.id)).returning({ id: marks.id });
    return reply.code(rows.length ? 204 : 404).send();
  });
};
