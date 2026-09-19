import { eq, sql } from 'drizzle-orm';
import type { Db } from './client.ts';
import { meta, CONFIG_VERSION_KEY } from './schema.ts';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

// Any change the device shows (folders, activities) must bump this in the same
// transaction, or the device keeps its old copy.
export async function bumpConfigVersion(tx: Db | Tx): Promise<void> {
  await tx.update(meta)
    .set({ value: sql`${meta.value} + 1` })
    .where(eq(meta.key, CONFIG_VERSION_KEY));
}
