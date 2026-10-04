import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { serializerCompiler, validatorCompiler } from '@fastify/type-provider-zod';
import type { Db } from './db/client.ts';
import { syncRoutes } from './routes/sync.ts';
import { sessionRoutes } from './routes/sessions.ts';
import { catalogRoutes } from './routes/catalog.ts';
import { todoRoutes } from './routes/todos.ts';
import { habitRoutes } from './routes/habits.ts';
import { quoteRoutes } from './routes/quotes.ts';
import { statsRoutes } from './routes/stats.ts';
import { deviceRoutes } from './routes/device.ts';
import { bookRoutes } from './routes/books.ts';
import { vigilRoutes } from './routes/vigil.ts';
import { academyRoutes } from './routes/academy.ts';
import { blockRoutes } from './routes/blocks.ts';
import { readingRoutes, type Shelf } from './routes/reading.ts';
import { huntRoutes } from './routes/hunt.ts';
import { folioRoutes } from './routes/folios.ts';
import { askRoutes } from './routes/asks.ts';
import type { Http } from './academy/moodle.ts';
import type { Fetch, Settings } from './academy/openrouter.ts';

export function buildApp(
  db: Db,
  opts: { logger?: boolean; webRoot?: string; ufind?: (path: string) => Promise<string | null>; openrouter?: Fetch; settings?: Settings;
    goodreads?: { user?: string; shelf?: Shelf }; garmin?: string; moodle?: Http } = {},
): FastifyInstance {
  const app = Fastify({ logger: opts.logger ?? true });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.register(syncRoutes, { db, prefix: '/api/v1' });
  app.register(sessionRoutes, { db, prefix: '/api/v1' });
  app.register(catalogRoutes, { db, prefix: '/api/v1' });
  app.register(todoRoutes, { db, prefix: '/api/v1' });
  app.register(habitRoutes, { db, prefix: '/api/v1' });
  app.register(quoteRoutes, { db, prefix: '/api/v1' });
  app.register(statsRoutes, { db, prefix: '/api/v1' });
  app.register(deviceRoutes, { db, prefix: '/api/v1' });
  app.register(bookRoutes, { db, prefix: '/api/v1' });
  app.register(vigilRoutes, { db, prefix: '/api/v1' });
  app.register(blockRoutes, { db, prefix: '/api/v1' });
  app.register(huntRoutes, { db, prefix: '/api/v1', garmin: opts.garmin ?? process.env.GARMIN_URL });
  app.register(readingRoutes, { prefix: '/api/v1', user: opts.goodreads ? opts.goodreads.user : process.env.GOODREADS_USER, shelf: opts.goodreads?.shelf });
  app.register(academyRoutes, { db, prefix: '/api/v1', ufind: opts.ufind, openrouter: opts.openrouter, settings: opts.settings });
  app.register(folioRoutes, { db, prefix: '/api/v1', http: opts.moodle });
  app.register(askRoutes, { db, prefix: '/api/v1', openrouter: opts.openrouter, settings: opts.settings });

  if (opts.webRoot) {
    app.register(fastifyStatic, { root: opts.webRoot });
  }

  return app;
}
