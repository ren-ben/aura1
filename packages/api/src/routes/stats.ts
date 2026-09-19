import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from '@fastify/type-provider-zod';
import { z } from 'zod';
import { asc, eq } from 'drizzle-orm';
import {
  FORM_STATES, formState, isRunaway, levelForXp, sessionMinutes, sessionXp, xpForLevel,
} from '@aura/shared';
import type { Db } from '../db/client.ts';
import { activities, folders, sessions } from '../db/schema.ts';

const progress = z.object({
  xp: z.number().int(),
  level: z.number().int(),
  nextLevelXp: z.number().int(),
});

const statsDto = z.object({
  bond: progress,
  form: z.enum(FORM_STATES),
  lastSessionAt: z.iso.datetime().nullable(),
  needsReview: z.number().int(),
  activities: z.array(progress.extend({
    id: z.number().int(),
    name: z.string(),
    folder: z.string(),
    minutes: z.number().int(),
  })),
});

function toProgress(xp: number) {
  const level = levelForXp(xp);
  return { xp, level, nextLevelXp: xpForLevel(level + 1) };
}

// XP is derived on read, never stored, so the curve can be retuned without
// rewriting history. One user, so reading every session is cheap.
export const statsRoutes: FastifyPluginAsync<{ db: Db }> = async (app, opts) => {
  app.withTypeProvider<ZodTypeProvider>().get('/stats', {
    schema: { response: { 200: statsDto } },
  }, async () => {
    const [sessionRows, activityRows] = await Promise.all([
      opts.db.select().from(sessions),
      opts.db.select({ id: activities.id, name: activities.name, folder: folders.name })
        .from(activities)
        .innerJoin(folders, eq(activities.folderId, folders.id))
        .orderBy(asc(folders.sortOrder), asc(activities.id)),
    ]);

    const perActivity = new Map<number, { xp: number; minutes: number }>();
    let bondXp = 0;
    let needsReview = 0;
    let last: Date | null = null;
    for (const s of sessionRows) {
      const minutes = sessionMinutes(s.startedAt.toISOString(), s.endedAt.toISOString());
      const confirmed = s.confirmedAt !== null;
      if (isRunaway(minutes) && !confirmed) needsReview += 1;
      const xp = sessionXp(minutes, s.source, confirmed);
      const entry = perActivity.get(s.activityId) ?? { xp: 0, minutes: 0 };
      entry.xp += xp;
      entry.minutes += minutes;
      perActivity.set(s.activityId, entry);
      bondXp += xp;
      if (!last || s.endedAt > last) last = s.endedAt;
    }

    const lastSessionAt = last?.toISOString() ?? null;
    return {
      bond: toProgress(bondXp),
      form: formState(lastSessionAt, new Date()),
      lastSessionAt,
      needsReview,
      activities: activityRows.map((a) => {
        const { xp, minutes } = perActivity.get(a.id) ?? { xp: 0, minutes: 0 };
        return { ...a, minutes, ...toProgress(xp) };
      }),
    };
  });
};
