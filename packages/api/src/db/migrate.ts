import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDb } from './client.ts';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const { db, pool } = createDb(url);
await migrate(db, { migrationsFolder: './drizzle' });
await pool.end();
