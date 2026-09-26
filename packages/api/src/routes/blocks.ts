import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from '@fastify/type-provider-zod';
import { z } from 'zod';
import { and, asc, eq, gte, lte, sql } from 'drizzle-orm';
import type { Db } from '../db/client.ts';
import { blocks, planDays } from '../db/schema.ts';

const idParams = z.object({ id: z.coerce.number().int().positive() });
const minute = z.number().int().min(0).max(1440);
const fields = z.object({
  date: z.iso.date(),
  start: minute,
  end: minute,
  title: z.string().trim().min(1).max(120),
  shade: z.number().int().min(0).max(5),
  activityId: z.number().int().positive().nullable(),
});

// The rewiring: blocks of planned time, and every change to a day counted.
export const blockRoutes: FastifyPluginAsync<{ db: Db }> = async (app, opts) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db } = opts;
  const rewired = (date: string) => db.insert(planDays).values({ date, rev: 1 })
    .onConflictDoUpdate({ target: planDays.date, set: { rev: sql`${planDays.rev} + 1` } });

  r.get('/blocks', { schema: { querystring: z.object({ from: z.iso.date(), to: z.iso.date() }) } }, async (request) => {
    const { from, to } = request.query;
    const [list, days] = await Promise.all([
      db.select().from(blocks).where(and(gte(blocks.date, from), lte(blocks.date, to))).orderBy(asc(blocks.date), asc(blocks.start)),
      db.select().from(planDays).where(and(gte(planDays.date, from), lte(planDays.date, to))),
    ]);
    return { blocks: list, days };
  });

  r.post('/blocks', { schema: { body: fields.refine((b) => b.end > b.start) } }, async (request, reply) => {
    const [row] = await db.insert(blocks).values(request.body).returning({ id: blocks.id });
    await rewired(request.body.date);
    return reply.code(201).send(row);
  });

  r.patch('/blocks/:id', { schema: { params: idParams, body: fields.partial() } }, async (request, reply) => {
    const [was] = await db.select().from(blocks).where(eq(blocks.id, request.params.id));
    if (!was) return reply.code(404).send();
    const row = { ...was, ...request.body };
    if (row.end <= row.start) return reply.code(400).send({ message: 'a block ends after it starts' });
    await db.update(blocks).set(request.body).where(eq(blocks.id, was.id));
    await rewired(row.date);
    return reply.code(204).send();
  });

  r.delete('/blocks/:id', { schema: { params: idParams } }, async (request, reply) => {
    const [row] = await db.delete(blocks).where(eq(blocks.id, request.params.id)).returning();
    if (!row) return reply.code(404).send();
    await rewired(row.date);
    return reply.code(204).send();
  });

  r.put('/plan-days/:date', {
    schema: { params: z.object({ date: z.iso.date() }), body: z.object({ capacity: z.number().int().min(60).max(1440) }) },
  }, async (request, reply) => {
    const { date } = request.params, { capacity } = request.body;
    await db.insert(planDays).values({ date, capacity }).onConflictDoUpdate({ target: planDays.date, set: { capacity } });
    return reply.code(204).send();
  });
};
