import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from '@fastify/type-provider-zod';
import { z } from 'zod';
import { asc, eq, inArray } from 'drizzle-orm';
import { sessionMinutes } from '@aura/shared';
import type { Db } from '../db/client.ts';
import { sessions, vigilSigns } from '../db/schema.ts';
import { vigilPractices } from '../db/vigil.ts';

const vigilDto = z.object({
  sits: z.array(z.object({
    practice: z.string(),
    startedAt: z.iso.datetime(),
    minutes: z.number().int(),
  })),
  signs: z.array(z.string()),
});

// Every sit kept, and the signs ticked off on the way up.
export const vigilRoutes: FastifyPluginAsync<{ db: Db }> = async (app, opts) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db } = opts;

  r.get('/vigil', { schema: { response: { 200: vigilDto } } }, async () => {
    const practices = await vigilPractices(db);
    const names = new Map(practices.map((p) => [p.id, p.name]));
    const [rows, signs] = await Promise.all([
      db.select().from(sessions).where(inArray(sessions.activityId, [...names.keys()])).orderBy(asc(sessions.startedAt)),
      db.select().from(vigilSigns),
    ]);
    return {
      sits: rows.map((s) => ({
        practice: names.get(s.activityId)!,
        startedAt: s.startedAt.toISOString(),
        minutes: sessionMinutes(s.startedAt.toISOString(), s.endedAt.toISOString()),
      })),
      signs: signs.map((s) => s.sign),
    };
  });

  r.put('/vigil/signs', {
    schema: { body: z.object({ sign: z.string().trim().min(1).max(120), kept: z.boolean() }) },
  }, async (request, reply) => {
    const { sign, kept } = request.body;
    if (kept) await db.insert(vigilSigns).values({ sign }).onConflictDoNothing();
    else await db.delete(vigilSigns).where(eq(vigilSigns.sign, sign));
    return reply.code(204).send();
  });
};
