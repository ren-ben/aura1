import { eq } from 'drizzle-orm';
import type { Db } from './client.ts';
import { activities, folders, meta } from './schema.ts';

const KEY = 'resurrection_activity_id';

// The ritual's system activity: RESURRECTION in a VESSEL folder, both archived
// so neither the device's carousel nor the web's lists offer them. The device
// starts it from its menu only while he is dormant. Created on first use.
export async function resurrectionId(db: Db): Promise<number> {
  const [row] = await db.select().from(meta).where(eq(meta.key, KEY));
  if (row) return row.value;
  return db.transaction(async (tx) => {
    const now = new Date();
    const [folder] = await tx.insert(folders).values({ name: 'VESSEL', sortOrder: 999, archivedAt: now }).returning();
    const [activity] = await tx.insert(activities).values({ folderId: folder!.id, name: 'RESURRECTION', archivedAt: now }).returning();
    await tx.insert(meta).values({ key: KEY, value: activity!.id }).onConflictDoNothing();
    const [saved] = await tx.select().from(meta).where(eq(meta.key, KEY));
    return saved!.value;
  });
}
