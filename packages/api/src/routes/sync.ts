import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from '@fastify/type-provider-zod';
import { syncRequestSchema, syncResponseSchema } from '@aura/shared';
import type { Db } from '../db/client.ts';
import { applySync } from '../sync/service.ts';

export const syncRoutes: FastifyPluginAsync<{ db: Db }> = async (app, opts) => {
  app.withTypeProvider<ZodTypeProvider>().post('/sync', {
    schema: {
      body: syncRequestSchema,
      response: { 200: syncResponseSchema },
    },
  }, async (request) => applySync(opts.db, request.body));
};
