import { and, asc, eq, gte, ilike, sql } from 'drizzle-orm';
import {
  bouts, EXERCISES, prescribe, verdict,
  type Exercise, type Feel, type GarminActivity, type GarminDay, type Group, type HuntSet, type Verdict,
} from '@aura/shared';
import type { Db } from './client.ts';
import { activities, exercises, folders, garminActivities, garminDays, huntFeels, huntSets, meta } from './schema.ts';

// The seeded list goes in once, the first time the Hunt is asked for.
export async function ensureExercises(db: Db): Promise<void> {
  const [any] = await db.select({ id: exercises.id }).from(exercises).limit(1);
  if (any) return;
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(41701)`);
    const [again] = await tx.select({ id: exercises.id }).from(exercises).limit(1);
    if (again) return;
    await tx.insert(exercises).values(EXERCISES.map((e, i) => ({ ...e, sortOrder: i })));
  });
}

// A hunt on the device runs as a session on HUNT's "lifting", so it lands in
// the log like any other; made if it is gone.
export async function liftingId(db: Db): Promise<number> {
  const [row] = await db.select({ id: activities.id }).from(activities)
    .innerJoin(folders, eq(folders.id, activities.folderId))
    .where(and(eq(folders.name, 'HUNT'), ilike(activities.name, 'lifting')))
    .orderBy(asc(activities.id)).limit(1);
  if (row) return row.id;
  let [folder] = await db.select().from(folders).where(eq(folders.name, 'HUNT'));
  folder ??= (await db.insert(folders).values({ name: 'HUNT', sortOrder: 4 }).returning())[0]!;
  const [made] = await db.insert(activities).values({ folderId: folder.id, name: 'lifting' }).returning();
  return made!.id;
}

export const BODYWEIGHT_KEY = 'bodyweight_hg';  // tenths of a kilo
export const GARMIN_SYNC_KEY = 'garmin_synced_at';  // unix seconds
export async function bodyweight(db: Db): Promise<number> {
  const [row] = await db.select().from(meta).where(eq(meta.key, BODYWEIGHT_KEY));
  return row ? row.value / 10 : 75;
}

const iso = (d: Date) => d.toISOString();

export type HuntData = {
  exercises: (Exercise & { archived: boolean })[];
  sets: (HuntSet & { source: 'device' | 'phone' })[];
  feels: { exerciseId: number; date: string; feel: Feel }[];
  activities: GarminActivity[];
  days: GarminDay[];
  bodyweight: number;
  garminSyncedAt: string | null;
  verdict: Verdict;
};

// Everything the pane and the device need, the verdict worked out.
export async function huntData(db: Db, today: string, now = new Date()): Promise<HuntData> {
  await ensureExercises(db);
  const since = new Date(now.getTime() - 400 * 86_400_000);
  const [exRows, setRows, feelRows, actRows, dayRows, bw, synced] = await Promise.all([
    db.select().from(exercises).orderBy(asc(exercises.sortOrder), asc(exercises.id)),
    db.select().from(huntSets).where(gte(huntSets.at, since)).orderBy(asc(huntSets.at)),
    db.select().from(huntFeels),
    db.select().from(garminActivities).where(gte(garminActivities.startedAt, since)).orderBy(asc(garminActivities.startedAt)),
    db.select().from(garminDays).where(gte(garminDays.date, iso(new Date(now.getTime() - 60 * 86_400_000)).slice(0, 10)))
      .orderBy(asc(garminDays.date)),
    bodyweight(db),
    db.select().from(meta).where(eq(meta.key, GARMIN_SYNC_KEY)),
  ]);
  const ex = exRows.map(({ archivedAt, sortOrder: _, ...e }) => ({ ...e, archived: archivedAt !== null }));
  const sets = setRows.map((s) => ({ uuid: s.uuid, exerciseId: s.exerciseId, at: iso(s.at), idx: s.idx, load: s.load, reps: s.reps, source: s.source }));
  const acts: GarminActivity[] = actRows.map((a) => ({ ...a, startedAt: iso(a.startedAt) }));
  const days: GarminDay[] = dayRows;
  return {
    exercises: ex,
    sets,
    feels: feelRows,
    activities: acts,
    days,
    bodyweight: bw,
    garminSyncedAt: synced[0] ? new Date(synced[0].value * 1000).toISOString() : null,
    verdict: verdict({ now, today, days, activities: acts, lifts: liftVisits(sets, ex) }),
  };
}

// Each visit to the gym, once for every group it gave three sets or more.
export function liftVisits(sets: HuntSet[], ex: Exercise[]): { at: string; group: Group }[] {
  const groupOf = new Map(ex.map((e) => [e.id, e.group]));
  return bouts(sets).flatMap((b) => {
    const count = new Map<Group, number>();
    for (const s of b) { const g = groupOf.get(s.exerciseId); if (g) count.set(g, (count.get(g) ?? 0) + 1); }
    return [...count].filter(([, n]) => n >= 3).map(([group]) => ({ at: b[0]!.at, group }));
  });
}

const kg = (n: number) => String(Math.round(n * 10) / 10);
// The device's list: the verdict's group first, then whatever has waited longest.
export function deviceHunt(data: HuntData, lifting: number) {
  const live = data.exercises.filter((e) => !e.archived);
  const lastAt = (id: number) => data.sets.filter((s) => s.exerciseId === id).at(-1)?.at ?? '';
  const order = [...live].sort((a, b) =>
    Number(b.group === data.verdict.group) - Number(a.group === data.verdict.group) || lastAt(a.id).localeCompare(lastAt(b.id)));
  return {
    word: data.verdict.word,
    short: data.verdict.short,
    line: data.verdict.line,
    liftingId: lifting,
    exercises: order.map((e) => {
      const mine = data.sets.filter((s) => s.exerciseId === e.id);
      const feels = Object.fromEntries(data.feels.filter((f) => f.exerciseId === e.id).map((f) => [f.date, f.feel]));
      const p = prescribe(e, mine, feels);
      const bw = e.kind === 'bodyweight';
      return {
        id: e.id, name: e.name, pose: e.pose, rest: e.rest, step: e.step, bodyweight: bw, sets: p.sets,
        last: (p.last ?? []).map((t) => (bw ? String(t.reps) : `${kg(t.load)}x${t.reps}`)).join(' '),
      };
    }),
  };
}
