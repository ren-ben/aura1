import { createHash } from 'node:crypto';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { MIN_SESSION_MINUTES, sessionMinutes, type ConfigDto, type SyncRequest, type SyncResponse, type Tick } from '@aura/shared';
import { vigilPractices } from '../db/vigil.ts';
import type { Db } from '../db/client.ts';
import {
  activities, folders, sessions, meta, habitEntries, habits, todos, device, books, chapters, marks, exercises, huntSets, huntFeels,
  CONFIG_VERSION_KEY,
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

// Notes the sync and how the device reported itself. A look chosen on the web
// goes out once; the device then reports it as its own.
async function recordDevice(db: Db, status: SyncRequest['status']): Promise<string | null> {
  const [row] = await db.select().from(device).where(eq(device.id, 1));
  const pending = row?.pendingLook ?? null;
  const values = {
    lastSyncAt: new Date(),
    ...(status ?? {}),
    ...(pending && status?.look !== pending ? {} : { pendingLook: null }),
  };
  await db.insert(device).values({ id: 1, ...values }).onConflictDoUpdate({ target: device.id, set: values });
  return pending && status?.look !== pending ? pending : null;
}

// Where the device says it got to in each book it read since the last sync,
// and what it kept there; then the shelf, with where each book was left.
async function readerFor(db: Db, readings: NonNullable<SyncRequest['readings']>): Promise<SyncResponse['books']> {
  for (const said of readings) {
    await db.update(books)
      .set({ chapterIdx: said.chapterIdx, through: said.through, readAt: new Date() })
      .where(eq(books.id, said.bookId));
    for (const m of said.marks ?? []) {
      // The same passage marked twice on the device is still one passage.
      const [seen] = await db.select({ id: marks.id }).from(marks).where(and(
        eq(marks.bookId, said.bookId), eq(marks.chapterIdx, m.chapterIdx), eq(marks.start, m.start),
      ));
      if (seen) continue;
      await db.insert(marks).values({ ...m, bookId: said.bookId, note: null, source: 'device' });
    }
  }

  const shelf = await db.select().from(books).where(isNull(books.archivedAt))
    .orderBy(desc(books.readAt), desc(books.addedAt)).limit(60);
  if (!shelf.length) return [];

  const counts = await db.select({ bookId: chapters.bookId, n: sql<number>`count(*)::int` })
    .from(chapters).groupBy(chapters.bookId);
  return shelf.map((b) => ({
    id: b.id,
    title: b.title,
    author: b.author,
    chapters: counts.find((c) => c.bookId === b.id)?.n ?? 0,
    chapterIdx: b.chapterIdx,
    through: b.through,
  }));

}

// Sets and feels from the gym. A set for an exercise that is gone is
// rejected so the device lets it go; one resent is stored once.
async function applyHunt(db: Db, request: SyncRequest, acked: string[], rejected: string[]): Promise<void> {
  const sets = request.sets ?? [], feels = request.feels ?? [];
  if (!sets.length && !feels.length) return;
  const known = new Set((await db.select({ id: exercises.id }).from(exercises)).map((e) => e.id));
  const good = sets.filter((s) => known.has(s.exerciseId));
  if (good.length) {
    await db.insert(huntSets).values(good.map((s) => ({ ...s, at: new Date(s.at), source: 'device' as const })))
      .onConflictDoNothing({ target: huntSets.uuid });
  }
  for (const s of sets) (known.has(s.exerciseId) ? acked : rejected).push(s.uuid);
  for (const f of feels) {
    if (known.has(f.exerciseId)) {
      await db.insert(huntFeels).values({ exerciseId: f.exerciseId, date: f.date, feel: f.feel })
        .onConflictDoUpdate({ target: [huntFeels.exerciseId, huntFeels.date], set: { feel: f.feel } });
    }
    acked.push(f.uuid);
  }
}

export async function applySync(db: Db, request: SyncRequest): Promise<SyncResponse> {
  await applyTicks(db, request.ticks ?? []);
  const version = await configVersion(db);
  const acked: string[] = [];
  const rejected: string[] = [];
  await applyHunt(db, request, acked, rejected);

  if (request.events.length > 0) {
    const ids = [...new Set(request.events.map((e) => e.activityId))];
    const known = new Set(
      (await db.select({ id: activities.id })
        .from(activities)
        .where(inArray(activities.id, ids))).map((r) => r.id),
    );

    // A session under ten minutes is acked, so the device lets it go, but
    // never stored: it was a mistaken start. A sit is kept from a minute:
    // five minutes of breathing is a whole practice.
    const sits = new Set((await vigilPractices(db)).map((p) => p.id));
    const storable = request.events.filter((e) => known.has(e.activityId)
      && sessionMinutes(e.startedAt, e.endedAt) >= (sits.has(e.activityId) ? 1 : MIN_SESSION_MINUTES));
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
  const look = await recordDevice(db, request.status);
  const shelf = await readerFor(db, [...(request.reading ? [request.reading] : []), ...(request.readings ?? [])]);
  const today = await buildToday(db);
  const todayHash = createHash('sha1').update(JSON.stringify(today)).digest('hex').slice(0, 16);
  return {
    serverTime: new Date().toISOString(),
    configVersion: version,
    ...(stale ? { config: await loadConfig(db) } : {}),
    acked,
    rejected,
    todayHash,
    ...(request.todayHash === todayHash ? {} : { today }),
    ...(look ? { look } : {}),
    ...(shelf?.length ? { books: shelf } : {}),
  };
}
