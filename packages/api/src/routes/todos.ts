import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from '@fastify/type-provider-zod';
import { z } from 'zod';
import { asc, eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client.ts';
import { todos } from '../db/schema.ts';

const idParams = z.object({ id: z.coerce.number().int().positive() });
const body = z.string().trim().min(1).max(200);

const todoDto = z.object({
  id: z.number().int(),
  body: z.string(),
  dueDate: z.iso.date().nullable(),
  done: z.boolean(),
});

export const todoRoutes: FastifyPluginAsync<{ db: Db }> = async (app, opts) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db } = opts;

  // Open items first, then by due date (undated last), then by creation.
  r.get('/todos', { schema: { response: { 200: z.array(todoDto) } } }, async () => {
    const rows = await db.select().from(todos).orderBy(
      sql`${todos.doneAt} is not null`,
      sql`${todos.dueDate} asc nulls last`,
      asc(todos.sortOrder),
      asc(todos.id),
    );
    return rows.map((t) => ({ id: t.id, body: t.body, dueDate: t.dueDate, done: t.doneAt !== null }));
  });

  r.post('/todos', {
    schema: { body: z.object({ body, dueDate: z.iso.date().nullable().optional() }) },
  }, async (request, reply) => {
    await db.insert(todos).values({ body: request.body.body, dueDate: request.body.dueDate ?? null });
    return reply.code(201).send();
  });

  r.patch('/todos/:id', {
    schema: {
      params: idParams,
      body: z.object({
        body: body.optional(),
        dueDate: z.iso.date().nullable().optional(),
        done: z.boolean().optional(),
      }),
    },
  }, async (request, reply) => {
    const { body: text, dueDate, done } = request.body;
    const rows = await db.update(todos)
      .set({
        ...(text !== undefined ? { body: text } : {}),
        ...(dueDate !== undefined ? { dueDate } : {}),
        ...(done !== undefined ? { doneAt: done ? new Date() : null } : {}),
      })
      .where(eq(todos.id, request.params.id))
      .returning({ id: todos.id });
    return reply.code(rows.length ? 204 : 404).send();
  });

  r.delete('/todos/:id', { schema: { params: idParams } }, async (request, reply) => {
    const rows = await db.delete(todos).where(eq(todos.id, request.params.id)).returning({ id: todos.id });
    return reply.code(rows.length ? 204 : 404).send();
  });
};
