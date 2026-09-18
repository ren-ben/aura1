import { createDb } from './client.ts';
import { seedIfEmpty } from './seed.ts';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const { db, pool } = createDb(url);
const seeded = await seedIfEmpty(db);
console.log(seeded ? 'seeded' : 'skipped, already seeded');
await pool.end();
