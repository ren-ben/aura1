import { and, asc, eq, sql } from 'drizzle-orm';
import { VIGIL_PRACTICES, type Practice } from '@aura/shared';
import type { Db } from './client.ts';
import { activities } from './schema.ts';
import { resurrectionId } from './resurrection.ts';

// The Vigil's practices: system activities in the ritual's VESSEL folder,
// archived like RESURRECTION so no list offers them. A sit is a session on
// one of them. Created on first use, and whenever a practice is added; the
// lock keeps two first uses at once from creating them twice.
export async function vigilPractices(db: Db): Promise<(Practice & { id: number })[]> {
  const ritual = await resurrectionId(db);
  const [rite] = await db.select().from(activities).where(eq(activities.id, ritual));
  const folderId = rite!.folderId;
  const inVessel = (d: Pick<Db, 'select'>) =>
    d.select().from(activities).where(and(eq(activities.folderId, folderId))).orderBy(asc(activities.id));
  let rows = await inVessel(db);
  if (VIGIL_PRACTICES.some((p) => !rows.some((r) => r.name === p.name))) {
    rows = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(41700)`);
      const now = await inVessel(tx);
      const missing = VIGIL_PRACTICES.filter((p) => !now.some((r) => r.name === p.name));
      if (missing.length) {
        const at = new Date();
        await tx.insert(activities).values(missing.map((p) => ({ folderId, name: p.name, archivedAt: at })));
      }
      return inVessel(tx);
    });
  }
  return VIGIL_PRACTICES.map((p) => ({ ...p, id: rows.find((r) => r.name === p.name)!.id }));
}
