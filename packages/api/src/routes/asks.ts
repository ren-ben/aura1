import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from '@fastify/type-provider-zod';
import { z } from 'zod';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../db/client.ts';
import { asks, folioFiles, folios } from '../db/schema.ts';
import { answer, askDto, settleAsks, tasksOf } from '../academy/asks.ts';
import { spentThisMonth } from '../academy/maps.ts';
import { settingsFromEnv, type Fetch, type Settings } from '../academy/openrouter.ts';

// Questions to the folios and the hint ladder on exercise sheets
// (docs/superpowers/specs/2026-10-04-rag-design.md).
const idParams = z.object({ id: z.coerce.number().int().positive() });

export const askRoutes: FastifyPluginAsync<{ db: Db; openrouter?: Fetch; settings?: Settings }> = async (app, opts) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db } = opts;
  const openrouter = opts.openrouter ?? fetch;
  const settings = opts.settings ?? settingsFromEnv();
  // Nothing is started without a key or past the month's budget.
  const refused = async () => (!settings.key ? { code: 503, message: 'no OpenRouter key is set on the server' }
    : (await spentThisMonth(db)) >= settings.budgetUsd ? { code: 402, message: `this month's budget of $${settings.budgetUsd} is spent` } : null);

  // The questions and hints of a course (a lecture and its exercise class
  // together), newest first.
  r.get('/academy/asks', { schema: { querystring: z.object({ nrs: z.string().regex(/^\d{6}(,\d{6})*$/), semester: z.string() }) } }, async (request) => {
    await settleAsks(db);
    const rows = await db.select().from(asks).where(and(inArray(asks.nr, request.query.nrs.split(',')), eq(asks.semester, request.query.semester))).orderBy(desc(asks.createdAt)).limit(60);
    return rows.map(askDto);
  });

  r.get('/academy/asks/:id', { schema: { params: idParams } }, async (request, reply) => {
    await settleAsks(db);
    const [row] = await db.select().from(asks).where(eq(asks.id, request.params.id));
    return row ? askDto(row) : reply.code(404).send();
  });

  r.post('/academy/asks', {
    schema: { body: z.object({ nr: z.string().regex(/^\d{6}$/), semester: z.string().regex(/^\d{4}[WS]$/), question: z.string().trim().min(3).max(1000) }) },
  }, async (request, reply) => {
    const no = await refused();
    if (no) return reply.code(no.code).send({ message: no.message });
    const [row] = await db.insert(asks).values({ ...request.body, kind: 'ask', status: 'thinking' }).returning();
    void answer(db, openrouter, settings, row!.id);
    return reply.code(202).send(askDto(row!));
  });

  // One rung of the ladder on one task: the first at once, each after the
  // one before has been read. A rung already written comes back as it is.
  r.post('/academy/hints', {
    schema: { body: z.object({ folioId: z.number().int().positive(), task: z.number().int().min(0).max(99), rung: z.number().int().min(1).max(4) }) },
  }, async (request, reply) => {
    const { folioId, task, rung } = request.body;
    const [sheet] = await db.select({ nr: folios.nr, semester: folios.semester, title: folios.title }).from(folios).where(eq(folios.id, folioId));
    if (!sheet) return reply.code(404).send({ message: 'no such sheet' });
    const ladder = await db.select().from(asks).where(and(eq(asks.folioId, folioId), eq(asks.task, task), inArray(asks.status, ['thinking', 'ready'])));
    const same = ladder.find((a) => a.rung === rung);
    if (same) return askDto(same);
    if (rung > 1 && !ladder.some((a) => a.rung === rung - 1 && a.status === 'ready')) return reply.code(409).send({ message: 'climb the rung below first' });
    const no = await refused();
    if (no) return reply.code(no.code).send({ message: no.message });
    const [row] = await db.insert(asks).values({ nr: sheet.nr, semester: sheet.semester, kind: 'hint', question: `${sheet.title}, task ${task || 'all'}`, folioId, task, rung, status: 'thinking' }).returning();
    void answer(db, openrouter, settings, row!.id);
    return reply.code(202).send(askDto(row!));
  });

  r.delete('/academy/asks/:id', { schema: { params: idParams } }, async (request, reply) => {
    const rows = await db.delete(asks).where(eq(asks.id, request.params.id)).returning({ id: asks.id });
    return reply.code(rows.length ? 204 : 404).send();
  });

  // The tasks of an exercise sheet, read off its text.
  r.get('/academy/folios/:id/tasks', { schema: { params: idParams } }, async (request, reply) => {
    const [row] = await db.select({ texts: folioFiles.texts }).from(folioFiles).where(eq(folioFiles.folioId, request.params.id));
    return row ? tasksOf(row.texts) : reply.code(404).send();
  });
};
