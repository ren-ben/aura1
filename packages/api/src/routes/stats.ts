import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from '@fastify/type-provider-zod';
import { z } from 'zod';
import { FORM_STATES } from '@aura/shared';
import type { Db } from '../db/client.ts';
import { computeStats } from '../stats/compute.ts';

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

export const statsRoutes: FastifyPluginAsync<{ db: Db }> = async (app, opts) => {
  app.withTypeProvider<ZodTypeProvider>().get('/stats', {
    schema: { response: { 200: statsDto } },
  }, async () => computeStats(opts.db));
};
