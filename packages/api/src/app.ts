import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from '@fastify/type-provider-zod';
import type { Db } from './db/client.ts';
import { syncRoutes } from './routes/sync.ts';
import { sessionRoutes } from './routes/sessions.ts';

export function buildApp(db: Db, opts: { logger?: boolean } = {}): FastifyInstance {
  const app = Fastify({ logger: opts.logger ?? true });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.register(syncRoutes, { db, prefix: '/api/v1' });
  app.register(sessionRoutes, { db, prefix: '/api/v1' });

  return app;
}
