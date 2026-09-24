import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from '@fastify/type-provider-zod';
import { z } from 'zod';
import { and, asc, eq } from 'drizzle-orm';
import { syncRequestSchema, syncResponseSchema } from '@aura/shared';
import type { Db } from '../db/client.ts';
import { books, chapters } from '../db/schema.ts';
import { applySync } from '../sync/service.ts';

// Everything the device reaches lives under /sync: Cloudflare Access lets its
// service token through on that path and nowhere else.
export const syncRoutes: FastifyPluginAsync<{ db: Db }> = async (app, opts) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db } = opts;

  r.post('/sync', {
    schema: {
      body: syncRequestSchema,
      response: { 200: syncResponseSchema },
    },
  }, async (request) => applySync(db, request.body));

  // The device keeps every book whole on its card. A book's head as plain
  // lines - "<chapters> <chapterIdx> <through>", the title, the author, then
  // a chapter's name a line - and each chapter as plain text, written
  // straight to the card as it arrives.
  const oneLine = (s: string) => s.replace(/[\r\n]+/g, ' ').trim();
  r.get('/sync/books/:id', {
    schema: { params: z.object({ id: z.coerce.number().int().positive() }) },
  }, async (request, reply) => {
    const [book] = await db.select().from(books).where(eq(books.id, request.params.id));
    if (!book) return reply.code(404).send();
    const names = await db.select({ title: chapters.title }).from(chapters)
      .where(eq(chapters.bookId, book.id)).orderBy(asc(chapters.idx));
    const head = [`${names.length} ${book.chapterIdx} ${book.through}`, oneLine(book.title), oneLine(book.author ?? ''),
      ...names.map((c) => oneLine(c.title) || '-')];
    return reply.type('text/plain; charset=utf-8').send(`${head.join('\n')}\n`);
  });

  r.get('/sync/books/:id/chapters/:idx', {
    schema: { params: z.object({ id: z.coerce.number().int().positive(), idx: z.coerce.number().int().nonnegative() }) },
  }, async (request, reply) => {
    const [row] = await db.select({ body: chapters.body }).from(chapters)
      .where(and(eq(chapters.bookId, request.params.id), eq(chapters.idx, request.params.idx)));
    if (!row) return reply.code(404).send();
    return reply.type('text/plain; charset=utf-8').send(row.body);
  });
};
