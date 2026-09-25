import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from '@fastify/type-provider-zod';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { asc, eq, inArray } from 'drizzle-orm';
import { sessionMinutes, VIGIL_PRACTICES } from '@aura/shared';
import type { Db } from '../db/client.ts';
import { meta, sessions, vigilSigns } from '../db/schema.ts';
import { SUN_HOURS_KEY, sunHoursOn, vigilPractices } from '../db/vigil.ts';
import { sunHours } from '../sun.ts';
import { localDate, utcOffset } from '../sync/today.ts';


const vigilDto = z.object({
  sits: z.array(z.object({
    practice: z.string(),
    startedAt: z.iso.datetime(),
    minutes: z.number().int(),
    source: z.enum(['device', 'manual']),
  })),
  signs: z.array(z.string()),
  // The four sun hours, rung by the device when on: today's, in local time.
  hours: z.object({ on: z.boolean(), today: z.array(z.number().int()) }),
});

// Every sit kept, and the signs ticked off on the way up.
export const vigilRoutes: FastifyPluginAsync<{ db: Db }> = async (app, opts) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db } = opts;

  r.get('/vigil', { schema: { response: { 200: vigilDto } } }, async () => {
    const practices = await vigilPractices(db);
    const names = new Map(practices.map((p) => [p.id, p.name]));
    const [rows, signs, on] = await Promise.all([
      db.select().from(sessions).where(inArray(sessions.activityId, [...names.keys()])).orderBy(asc(sessions.startedAt)),
      db.select().from(vigilSigns),
      sunHoursOn(db),
    ]);
    const now = new Date();
    return {
      sits: rows.map((s) => ({
        practice: names.get(s.activityId)!,
        startedAt: s.startedAt.toISOString(),
        minutes: sessionMinutes(s.startedAt.toISOString(), s.endedAt.toISOString()),
        source: s.source,
      })),
      signs: signs.map((s) => s.sign),
      hours: { on, today: sunHours(localDate(now), utcOffset(now)) },
    };
  });

  // A sit kept away from the device, written in by hand.
  r.post('/vigil/sits', {
    schema: {
      body: z.object({
        practice: z.enum(VIGIL_PRACTICES.map((p) => p.name) as [string, ...string[]]),
        startedAt: z.iso.datetime(),
        minutes: z.number().int().min(1).max(600),
      }),
    },
  }, async (request, reply) => {
    const { practice, startedAt, minutes } = request.body;
    const id = (await vigilPractices(db)).find((p) => p.name === practice)!.id;
    const start = new Date(startedAt);
    await db.insert(sessions).values({
      activityId: id, startedAt: start, endedAt: new Date(start.getTime() + minutes * 60_000), source: 'manual', deviceUuid: randomUUID(),
    });
    return reply.code(201).send();
  });

  r.put('/vigil/hours', { schema: { body: z.object({ on: z.boolean() }) } }, async (request, reply) => {
    const value = request.body.on ? 1 : 0;
    await db.insert(meta).values({ key: SUN_HOURS_KEY, value }).onConflictDoUpdate({ target: meta.key, set: { value } });
    return reply.code(204).send();
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
