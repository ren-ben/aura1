import { eq, inArray, isNull, sql } from 'drizzle-orm';
import type { ConfigDto, SyncRequest, SyncResponse } from '@aura/shared';
import type { Db } from '../db/client.ts';
import {
  activities, folders, sessions, meta, CONFIG_VERSION_KEY,
} from '../db/schema.ts';

async function configVersion(db: Db): Promise<number> {
  const [row] = await db.select().from(meta).where(eq(meta.key, CONFIG_VERSION_KEY));
  return row?.value ?? 0;
}

export async function loadConfig(db: Db): Promise<ConfigDto> {
  const [version, folderRows, activityRows] = await Promise.all([
    configVersion(db),
    db.select().from(folders).where(isNull(folders.archivedAt)).orderBy(folders.sortOrder),
    db.select().from(activities).where(isNull(activities.archivedAt)),
  ]);
  return {
    version,
    folders: folderRows.map((f) => ({ id: f.id, name: f.name, sortOrder: f.sortOrder })),
    activities: activityRows.map((a) => ({
      id: a.id,
      folderId: a.folderId,
      name: a.name,
      lastUsedAt: a.lastUsedAt?.toISOString() ?? null,
    })),
  };
}

export async function applySync(db: Db, request: SyncRequest): Promise<SyncResponse> {
  const version = await configVersion(db);
  const acked: string[] = [];
  const rejected: string[] = [];

  if (request.events.length > 0) {
    const ids = [...new Set(request.events.map((e) => e.activityId))];
    const known = new Set(
      (await db.select({ id: activities.id })
        .from(activities)
        .where(inArray(activities.id, ids))).map((r) => r.id),
    );

    const storable = request.events.filter((e) => known.has(e.activityId));
    for (const event of request.events) {
      (known.has(event.activityId) ? acked : rejected).push(event.uuid);
    }

    if (storable.length > 0) {
      await db.insert(sessions).values(
        storable.map((e) => ({
          activityId: e.activityId,
          startedAt: new Date(e.startedAt),
          endedAt: new Date(e.endedAt),
          source: 'device' as const,
          deviceUuid: e.uuid,
        })),
      ).onConflictDoNothing({ target: sessions.deviceUuid });

      const latest = new Map<number, string>();
      for (const e of storable) {
        const current = latest.get(e.activityId);
        if (!current || e.endedAt > current) latest.set(e.activityId, e.endedAt);
      }
      for (const [id, endedAt] of latest) {
        const at = new Date(endedAt);
        await db.update(activities)
          .set({ lastUsedAt: at })
          .where(sql`${activities.id} = ${id} and (${activities.lastUsedAt} is null or ${activities.lastUsedAt} < ${at})`);
      }
    }
  }

  const stale = request.configVersion !== version;
  return {
    serverTime: new Date().toISOString(),
    configVersion: version,
    ...(stale ? { config: await loadConfig(db) } : {}),
    acked,
    rejected,
  };
}
