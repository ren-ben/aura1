import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from '@fastify/type-provider-zod';
import { z } from 'zod';
import { and, asc, eq, gte, isNull, lte, max } from 'drizzle-orm';
import type { Db } from '../db/client.ts';
import { habitEntries, habits } from '../db/schema.ts';

const idParams = z.object({ id: z.coerce.number().int().positive() });
const name = z.string().trim().min(1).max(15);

const habitDto = z.object({
  id: z.number().int(),
  name: z.string(),
  done: z.array(z.iso.date()),  // days in the requested range marked done
});

export const habitRoutes: FastifyPluginAsync<{ db: Db }> = async (app, opts) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db } = opts;

  r.get('/habits', {
    schema: {
      querystring: z.object({ from: z.iso.date(), to: z.iso.date() }),
      response: { 200: z.array(habitDto) },
    },
  }, async (request) => {
    const { from, to } = request.query;
    const [habitRows, entryRows] = await Promise.all([
      db.select().from(habits).where(isNull(habits.archivedAt)).orderBy(asc(habits.sortOrder)),
      db.select().from(habitEntries).where(and(
        eq(habitEntries.done, true), gte(habitEntries.date, from), lte(habitEntries.date, to),
      )),
    ]);
    return habitRows.map((h) => ({
      id: h.id,
      name: h.name,
      done: entryRows.filter((e) => e.habitId === h.id).map((e) => e.date).sort(),
    }));
  });

  r.post('/habits', { schema: { body: z.object({ name }) } }, async (request, reply) => {
    const [row] = await db.select({ top: max(habits.sortOrder) }).from(habits);
    await db.insert(habits).values({ name: request.body.name, sortOrder: (row?.top ?? -1) + 1 });
    return reply.code(201).send();
  });

  r.patch('/habits/:id', {
    schema: { params: idParams, body: z.object({ name: name.optional(), archived: z.boolean().optional() }) },
  }, async (request, reply) => {
    const { name: newName, archived } = request.body;
    const rows = await db.update(habits)
      .set({
        ...(newName !== undefined ? { name: newName } : {}),
        ...(archived !== undefined ? { archivedAt: archived ? new Date() : null } : {}),
      })
      .where(eq(habits.id, request.params.id))
      .returning({ id: habits.id });
    return reply.code(rows.length ? 204 : 404).send();
  });

  r.put('/habits/:id/entries/:date', {
    schema: {
      params: z.object({ id: z.coerce.number().int().positive(), date: z.iso.date() }),
      body: z.object({ done: z.boolean() }),
    },
  }, async (request, reply) => {
    const { id, date } = request.params;
    const [habit] = await db.select({ id: habits.id }).from(habits).where(eq(habits.id, id));
    if (!habit) return reply.code(404).send();
    await db.insert(habitEntries)
      .values({ habitId: id, date, done: request.body.done })
      .onConflictDoUpdate({
        target: [habitEntries.habitId, habitEntries.date],
        set: { done: request.body.done },
      });
    return reply.code(204).send();
  });
};
