import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from '@fastify/type-provider-zod';
import { z } from 'zod';
import { desc, eq } from 'drizzle-orm';
import type { Db } from '../db/client.ts';
import { quotes } from '../db/schema.ts';

const quoteDto = z.object({ id: z.number().int(), body: z.string(), source: z.string().nullable() });

export const quoteRoutes: FastifyPluginAsync<{ db: Db }> = async (app, opts) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db } = opts;

  r.get('/quotes', { schema: { response: { 200: z.array(quoteDto) } } }, async () => {
    const rows = await db.select().from(quotes).orderBy(desc(quotes.createdAt), desc(quotes.id));
    return rows.map((q) => ({ id: q.id, body: q.body, source: q.source }));
  });

  r.post('/quotes', {
    schema: {
      body: z.object({
        body: z.string().trim().min(1).max(500),
        source: z.string().trim().max(100).nullable().optional(),
      }),
    },
  }, async (request, reply) => {
    await db.insert(quotes).values({ body: request.body.body, source: request.body.source || null });
    return reply.code(201).send();
  });

  r.delete('/quotes/:id', {
    schema: { params: z.object({ id: z.coerce.number().int().positive() }) },
  }, async (request, reply) => {
    const rows = await db.delete(quotes).where(eq(quotes.id, request.params.id)).returning({ id: quotes.id });
    return reply.code(rows.length ? 204 : 404).send();
  });
};
