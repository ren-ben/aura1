import { folders, activities, meta, CONFIG_VERSION_KEY } from './schema.ts';
import type { Db } from './client.ts';

const LAYOUT: Array<[string, string[]]> = [
  ['AXIOM',    ['coursework', 'problem sets']],
  ['WORKSHOP', ['aura-1', 'side project']],
  ['HERESY',   ['short form', 'long form']],
  ['DREAM',    ['reading', 'notes']],
  ['HUNT',     ['lifting', 'running']],
];

export async function seedIfEmpty(db: Db): Promise<boolean> {
  const [existing] = await db.select({ id: folders.id }).from(folders).limit(1);
  if (existing) return false;
  await seed(db);
  return true;
}

export async function seed(db: Db): Promise<void> {
  for (const [index, entry] of LAYOUT.entries()) {
    const [folderName, activityNames] = entry;
    const [folder] = await db
      .insert(folders)
      .values({ name: folderName, sortOrder: index })
      .returning();
    if (!folder) throw new Error(`failed to insert folder ${folderName}`);
    await db.insert(activities).values(
      activityNames.map((name) => ({ folderId: folder.id, name })),
    );
  }
  await db.insert(meta).values({ key: CONFIG_VERSION_KEY, value: 1 });
}
