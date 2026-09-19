import { asc, eq } from 'drizzle-orm';
import {
  formFromSessions, isRunaway, levelForXp, sessionMinutes, sessionXp, xpForLevel, type FormState,
} from '@aura/shared';
import { resurrectionId } from '../db/resurrection.ts';
import type { Db } from '../db/client.ts';
import { activities, folders, sessions } from '../db/schema.ts';

export type Progress = { xp: number; level: number; nextLevelXp: number };

export type Stats = {
  bond: Progress;
  form: FormState;
  lastSessionAt: string | null;
  needsReview: number;
  activities: (Progress & { id: number; name: string; folder: string; minutes: number })[];
};

function toProgress(xp: number): Progress {
  const level = levelForXp(xp);
  return { xp, level, nextLevelXp: xpForLevel(level + 1) };
}

// XP is derived on read, never stored, so the curve can be retuned without
// rewriting history. One user, so reading every session is cheap.
export async function computeStats(db: Db, now = new Date()): Promise<Stats> {
  const ritual = await resurrectionId(db);
  const [sessionRows, activityRows] = await Promise.all([
    db.select().from(sessions),
    db.select({ id: activities.id, name: activities.name, folder: folders.name })
      .from(activities)
      .innerJoin(folders, eq(activities.folderId, folders.id))
      .orderBy(asc(folders.sortOrder), asc(activities.id)),
  ]);

  const perActivity = new Map<number, { xp: number; minutes: number }>();
  let bondXp = 0;
  let needsReview = 0;
  let last: Date | null = null;
  for (const s of sessionRows) {
    const minutes = sessionMinutes(s.startedAt.toISOString(), s.endedAt.toISOString());
    const confirmed = s.confirmedAt !== null;
    if (isRunaway(minutes) && !confirmed) needsReview += 1;
    const xp = sessionXp(minutes, s.source, confirmed);
    const entry = perActivity.get(s.activityId) ?? { xp: 0, minutes: 0 };
    entry.xp += xp;
    entry.minutes += minutes;
    perActivity.set(s.activityId, entry);
    bondXp += xp;
    if (!last || s.endedAt > last) last = s.endedAt;
  }

  const lastSessionAt = last?.toISOString() ?? null;
  return {
    bond: toProgress(bondXp),
    form: formFromSessions(sessionRows.map((s) => ({
      startedAt: s.startedAt.toISOString(), endedAt: s.endedAt.toISOString(), activityId: s.activityId, source: s.source,
    })), ritual, now),
    lastSessionAt,
    needsReview,
    activities: activityRows.filter((a) => a.id !== ritual).map((a) => {
      const { xp, minutes } = perActivity.get(a.id) ?? { xp: 0, minutes: 0 };
      return { ...a, minutes, ...toProgress(xp) };
    }),
  };
}
