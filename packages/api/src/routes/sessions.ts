import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from '@fastify/type-provider-zod';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { isRunaway, sessionMinutes } from '@aura/shared';
import type { Db } from '../db/client.ts';
import { activities, folders, sessions } from '../db/schema.ts';

const querySchema = z.object({
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
});

const rowSchema = z.object({
  id: z.number().int(),
  activityId: z.number().int(),
  activity: z.string(),
  folder: z.string(),
  startedAt: z.iso.datetime(),
  endedAt: z.iso.datetime(),
  minutes: z.number().int(),
  source: z.string(),
  // Over 6 hours and not yet confirmed: earns no XP until it is.
  needsReview: z.boolean(),
});

const idParams = z.object({ id: z.coerce.number().int().positive() });

const manualSchema = z.object({
  activityId: z.number().int().positive(),
  startedAt: z.iso.datetime(),
  endedAt: z.iso.datetime(),
}).refine((s) => Date.parse(s.endedAt) > Date.parse(s.startedAt), {
  message: 'endedAt must be after startedAt',
});

export const sessionRoutes: FastifyPluginAsync<{ db: Db }> = async (app, opts) => {
  app.withTypeProvider<ZodTypeProvider>().get('/sessions', {
    schema: {
      querystring: querySchema,
      response: { 200: z.array(rowSchema) },
    },
  }, async (request) => {
    const { from, to } = request.query;
    const filters = [
      ...(from ? [gte(sessions.startedAt, new Date(from))] : []),
      ...(to ? [lte(sessions.startedAt, new Date(to))] : []),
    ];

    const rows = await opts.db
      .select({
        id: sessions.id,
        activityId: sessions.activityId,
        activity: activities.name,
        folder: folders.name,
        startedAt: sessions.startedAt,
        endedAt: sessions.endedAt,
        source: sessions.source,
        confirmedAt: sessions.confirmedAt,
      })
      .from(sessions)
      .innerJoin(activities, eq(sessions.activityId, activities.id))
      .innerJoin(folders, eq(activities.folderId, folders.id))
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(sessions.startedAt));

    return rows.map(({ confirmedAt, ...r }) => {
      const minutes = sessionMinutes(r.startedAt.toISOString(), r.endedAt.toISOString());
      return {
        ...r,
        startedAt: r.startedAt.toISOString(),
        endedAt: r.endedAt.toISOString(),
        minutes,
        needsReview: isRunaway(minutes) && confirmedAt === null,
      };
    });
  });

  // Manual backfill. It has no device uuid, so it gets a fresh one to satisfy
  // the idempotency column.
  app.withTypeProvider<ZodTypeProvider>().post('/sessions', {
    schema: { body: manualSchema },
  }, async (request, reply) => {
    const { activityId, startedAt, endedAt } = request.body;
    const [activity] = await opts.db.select({ id: activities.id }).from(activities)
      .where(eq(activities.id, activityId));
    if (!activity) return reply.code(404).send();
    await opts.db.insert(sessions).values({
      activityId,
      startedAt: new Date(startedAt),
      endedAt: new Date(endedAt),
      source: 'manual',
      deviceUuid: randomUUID(),
    });
    return reply.code(201).send();
  });

  app.withTypeProvider<ZodTypeProvider>().delete('/sessions/:id', {
    schema: { params: idParams },
  }, async (request, reply) => {
    const rows = await opts.db.delete(sessions).where(eq(sessions.id, request.params.id))
      .returning({ id: sessions.id });
    return reply.code(rows.length ? 204 : 404).send();
  });

  app.withTypeProvider<ZodTypeProvider>().post('/sessions/:id/confirm', {
    schema: { params: idParams },
  }, async (request, reply) => {
    const rows = await opts.db.update(sessions).set({ confirmedAt: new Date() })
      .where(eq(sessions.id, request.params.id))
      .returning({ id: sessions.id });
    return reply.code(rows.length ? 204 : 404).send();
  });
};
