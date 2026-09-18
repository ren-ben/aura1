import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from '@fastify/type-provider-zod';
import { z } from 'zod';
import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { sessionMinutes } from '@aura/shared';
import type { Db } from '../db/client.ts';
import { activities, folders, sessions } from '../db/schema.ts';

const querySchema = z.object({
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
});

const rowSchema = z.object({
  id: z.number().int(),
  activity: z.string(),
  folder: z.string(),
  startedAt: z.iso.datetime(),
  endedAt: z.iso.datetime(),
  minutes: z.number().int(),
  source: z.string(),
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
        activity: activities.name,
        folder: folders.name,
        startedAt: sessions.startedAt,
        endedAt: sessions.endedAt,
        source: sessions.source,
      })
      .from(sessions)
      .innerJoin(activities, eq(sessions.activityId, activities.id))
      .innerJoin(folders, eq(activities.folderId, folders.id))
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(sessions.startedAt));

    return rows.map((r) => ({
      ...r,
      startedAt: r.startedAt.toISOString(),
      endedAt: r.endedAt.toISOString(),
      minutes: sessionMinutes(r.startedAt.toISOString(), r.endedAt.toISOString()),
    }));
  });
};
