import { eq, inArray, isNull, sql } from 'drizzle-orm';
import { MIN_SESSION_MINUTES, sessionMinutes, type ConfigDto, type SyncRequest, type SyncResponse, type Tick } from '@aura/shared';
import type { Db } from '../db/client.ts';
import {
  activities, folders, sessions, meta, habitEntries, habits, todos, CONFIG_VERSION_KEY,
} from '../db/schema.ts';
import { buildToday } from './today.ts';

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

// Ticks are absolute states, so applying one twice is harmless. A tick for
// something deleted since is dropped.
async function applyTicks(db: Db, ticks: Tick[]): Promise<void> {
  for (const tick of ticks) {
    if (tick.kind === 'todo') {
      await db.update(todos)
        .set({ doneAt: tick.done ? sql`coalesce(${todos.doneAt}, now())` : null })
        .where(eq(todos.id, tick.id));
    } else {
      const [habit] = await db.select({ id: habits.id }).from(habits).where(eq(habits.id, tick.id));
      if (!habit) continue;
      await db.insert(habitEntries).values({ habitId: tick.id, date: tick.date, done: tick.done })
        .onConflictDoUpdate({ target: [habitEntries.habitId, habitEntries.date], set: { done: tick.done } });
    }
  }
}

export async function applySync(db: Db, request: SyncRequest): Promise<SyncResponse> {
  await applyTicks(db, request.ticks ?? []);
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

    // A session under ten minutes is acked, so the device lets it go, but
    // never stored: it was a mistaken start.
    const storable = request.events.filter((e) => known.has(e.activityId)
      && sessionMinutes(e.startedAt, e.endedAt) >= MIN_SESSION_MINUTES);
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

      const latest = new Map<number, Date>();
      for (const e of storable) {
        const endedAt = new Date(e.endedAt);
        const current = latest.get(e.activityId);
        if (!current || endedAt > current) latest.set(e.activityId, endedAt);
      }
      for (const [id, at] of latest) {
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
    today: await buildToday(db),
  };
}
