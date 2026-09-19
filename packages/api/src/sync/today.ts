import { and, asc, desc, eq, isNull, lte, or, sql } from 'drizzle-orm';
import type { TodayDto } from '@aura/shared';
import type { Db } from '../db/client.ts';
import { habitEntries, habits, quotes, todos } from '../db/schema.ts';
import { computeStats } from '../stats/compute.ts';
import { resurrectionId } from '../db/resurrection.ts';

// The user's calendar day: the device's clock is UTC, the lists are local.
export const TIME_ZONE = process.env.AURA_TZ ?? 'Europe/Vienna';
export function localDate(at: Date, timeZone = TIME_ZONE): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

const MAX_QUOTES = 40;

// Today's todos are the ones due today or overdue, plus any ticked off today
// so a tick can be undone on the device.
export async function buildToday(db: Db, now = new Date()): Promise<TodayDto> {
  const date = localDate(now);
  const ritual = await resurrectionId(db);
  const [todoRows, habitRows, doneRows, quoteRows, stats] = await Promise.all([
    db.select().from(todos)
      .where(and(lte(todos.dueDate, date), or(isNull(todos.doneAt), sql`${todos.doneAt} >= now() - interval '1 day'`)))
      .orderBy(asc(todos.dueDate), asc(todos.sortOrder), asc(todos.id)),
    db.select().from(habits).where(isNull(habits.archivedAt)).orderBy(asc(habits.sortOrder)),
    db.select().from(habitEntries).where(and(eq(habitEntries.date, date), eq(habitEntries.done, true))),
    db.select().from(quotes).orderBy(desc(quotes.createdAt)).limit(MAX_QUOTES),
    computeStats(db, now),
  ]);
  const doneToday = new Set(doneRows.map((e) => e.habitId));
  return {
    date,
    form: stats.form,
    level: stats.bond.level,
    lastSessionAt: stats.lastSessionAt,
    resurrectionId: ritual,
    todos: todoRows
      .filter((t) => t.doneAt === null || localDate(t.doneAt) === date)
      .map((t) => ({ id: t.id, body: t.body, done: t.doneAt !== null })),
    habits: habitRows.map((h) => ({ id: h.id, name: h.name, done: doneToday.has(h.id) })),
    quotes: quoteRows.map((q) => ({ body: q.body, source: q.source })),
  };
}
