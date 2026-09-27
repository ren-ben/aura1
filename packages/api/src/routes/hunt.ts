import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from '@fastify/type-provider-zod';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { garminIngestSchema, huntFeelSchema, huntSetSchema } from '@aura/shared';
import type { Db } from '../db/client.ts';
import { exercises, garminActivities, garminDays, huntFeels, huntSets, meta } from '../db/schema.ts';
import { BODYWEIGHT_KEY, ensureExercises, GARMIN_SYNC_KEY, huntData } from '../db/hunt.ts';
import { localDate } from '../sync/today.ts';

const exerciseBody = z.object({
  name: z.string().trim().min(1).max(15),
  kind: z.enum(['barbell', 'machine', 'cable', 'dumbbell', 'bodyweight', 'weighted']),
  group: z.enum(['push', 'pull', 'arms', 'core', 'legs']),
  sets: z.number().int().min(1).max(8),
  repLo: z.number().int().min(1).max(99),
  repHi: z.number().int().min(1).max(99),
  step: z.number().min(0).max(50),
  bwShare: z.number().min(0).max(1),
  path: z.number().min(0).max(3),
  pose: z.enum(['press', 'fly', 'dip', 'hang', 'row', 'curl', 'raise', 'deadlift', 'core']),
  rest: z.number().int().min(0).max(900),
  start: z.number().min(0).max(1000),
});

// The Hunt: sets and exercises from the web, and Garmin's side from the
// sidecar on the compose network. garmin: where the sidecar listens for "pull
// now", unset when there is none.
export const huntRoutes: FastifyPluginAsync<{ db: Db; garmin?: string }> = async (app, opts) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db } = opts;

  r.get('/hunt', async () => huntData(db, localDate(new Date())));

  // A visit written in by hand, or sets added to one.
  r.post('/hunt/sets', { schema: { body: z.object({ sets: z.array(huntSetSchema).min(1).max(60) }) } }, async (request, reply) => {
    await ensureExercises(db);
    await db.insert(huntSets).values(request.body.sets.map((s) => ({ ...s, at: new Date(s.at), source: 'phone' as const })))
      .onConflictDoNothing({ target: huntSets.uuid });
    return reply.code(201).send();
  });

  r.patch('/hunt/sets/:uuid', {
    schema: { params: z.object({ uuid: z.string() }), body: z.object({ load: z.number().min(0).max(1000), reps: z.number().int().min(0).max(200) }).partial() },
  }, async (request, reply) => {
    await db.update(huntSets).set(request.body).where(eq(huntSets.uuid, request.params.uuid));
    return reply.code(204).send();
  });

  r.delete('/hunt/sets/:uuid', { schema: { params: z.object({ uuid: z.string() }) } }, async (request, reply) => {
    await db.delete(huntSets).where(eq(huntSets.uuid, request.params.uuid));
    return reply.code(204).send();
  });

  r.put('/hunt/feels', { schema: { body: huntFeelSchema.omit({ uuid: true }) } }, async (request, reply) => {
    const { exerciseId, date, feel } = request.body;
    await db.insert(huntFeels).values({ exerciseId, date, feel })
      .onConflictDoUpdate({ target: [huntFeels.exerciseId, huntFeels.date], set: { feel } });
    return reply.code(204).send();
  });

  r.post('/hunt/exercises', { schema: { body: exerciseBody } }, async (request, reply) => {
    await ensureExercises(db);
    const [{ n }] = await db.select({ n: sql<number>`coalesce(max(${exercises.sortOrder}), 0) + 1` }).from(exercises) as [{ n: number }];
    await db.insert(exercises).values({ ...request.body, sortOrder: n });
    return reply.code(201).send();
  });

  r.patch('/hunt/exercises/:id', {
    schema: { params: z.object({ id: z.coerce.number().int().positive() }), body: exerciseBody.partial().extend({ archived: z.boolean().optional() }) },
  }, async (request, reply) => {
    const { archived, ...rest } = request.body;
    await db.update(exercises).set({ ...rest, ...(archived === undefined ? {} : { archivedAt: archived ? new Date() : null }) })
      .where(eq(exercises.id, request.params.id));
    return reply.code(204).send();
  });

  r.put('/hunt/bodyweight', { schema: { body: z.object({ kg: z.number().min(30).max(200) }) } }, async (request, reply) => {
    const value = Math.round(request.body.kg * 10);
    await db.insert(meta).values({ key: BODYWEIGHT_KEY, value }).onConflictDoUpdate({ target: meta.key, set: { value } });
    return reply.code(204).send();
  });

  // What the sidecar pulled: every activity and day replaced by Garmin's own
  // latest word on it, so sending the same week twice changes nothing.
  r.post('/hunt/garmin', { schema: { body: garminIngestSchema } }, async (request, reply) => {
    const { activities, days, bodyweight } = request.body;
    for (const a of activities) {
      const row = { ...a, startedAt: new Date(a.startedAt) };
      await db.insert(garminActivities).values(row).onConflictDoUpdate({ target: garminActivities.id, set: row });
    }
    for (const d of days) await db.insert(garminDays).values(d).onConflictDoUpdate({ target: garminDays.date, set: d });
    const stamp = [{ key: GARMIN_SYNC_KEY, value: Math.floor(Date.now() / 1000) },
      ...(bodyweight ? [{ key: BODYWEIGHT_KEY, value: Math.round(bodyweight * 10) }] : [])];
    for (const m of stamp) await db.insert(meta).values(m).onConflictDoUpdate({ target: meta.key, set: { value: m.value } });
    return reply.code(204).send();
  });

  // Asks the sidecar to pull now; it posts back to the route above.
  r.post('/hunt/garmin/refresh', async (_request, reply) => {
    if (!opts.garmin) return reply.code(503).send({ message: 'No Garmin link is set up on the server.' });
    const res = await fetch(`${opts.garmin}/pull`, { method: 'POST' }).catch(() => null);
    if (!res?.ok) return reply.code(502).send({ message: 'Garmin did not answer.' });
    return reply.code(204).send();
  });
};
