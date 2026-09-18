import { createDb } from './db/client.ts';
import { buildApp } from './app.ts';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const { db } = createDb(url);
const app = buildApp(db);
await app.listen({ port: Number(process.env.PORT ?? 3000), host: '0.0.0.0' });
