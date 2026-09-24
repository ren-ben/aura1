import { and, asc, desc, eq, gte, isNull, lte, or, sql } from 'drizzle-orm';
import { HABIT_DAYS, type TodayDto } from '@aura/shared';
import type { Db } from '../db/client.ts';
import { habitEntries, habits, quotes, todos } from '../db/schema.ts';
import { computeStats } from '../stats/compute.ts';
import { resurrectionId } from '../db/resurrection.ts';
import { vigilPractices } from '../db/vigil.ts';

// The user's calendar day: the device's clock is UTC, the lists are local.
export const TIME_ZONE = process.env.AURA_TZ ?? 'Europe/Vienna';
export function localDate(at: Date, timeZone = TIME_ZONE): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

// Minutes east of UTC in the time zone at that moment (summer time included).
export function utcOffset(at: Date, timeZone = TIME_ZONE): number {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric',
  }).formatToParts(at).map((p) => [p.type, Number(p.value)]));
  const local = Date.UTC(parts.year!, parts.month! - 1, parts.day!, parts.hour!, parts.minute!);
  return Math.round((local - Math.floor(at.getTime() / 60_000) * 60_000) / 60_000);
}

// The calendar days before and up to date, oldest first.
function daysUpTo(date: string, count: number): string[] {
  const end = Date.parse(`${date}T00:00:00Z`);
  return Array.from({ length: count }, (_, i) => new Date(end - (count - 1 - i) * 86_400_000).toISOString().slice(0, 10));
}

const MAX_QUOTES = 40;

// Today's todos are the ones due today or overdue, plus any ticked off today
// so a tick can be undone on the device.
export async function buildToday(db: Db, now = new Date()): Promise<TodayDto> {
  const date = localDate(now);
  const ritual = await resurrectionId(db);
  const days = daysUpTo(date, HABIT_DAYS);
  const [todoRows, habitRows, doneRows, quoteRows, stats, practices] = await Promise.all([
    db.select().from(todos)
      .where(and(lte(todos.dueDate, date), or(isNull(todos.doneAt), sql`${todos.doneAt} >= now() - interval '1 day'`)))
      .orderBy(asc(todos.dueDate), asc(todos.sortOrder), asc(todos.id)),
    db.select().from(habits).where(isNull(habits.archivedAt)).orderBy(asc(habits.sortOrder)),
    db.select().from(habitEntries).where(and(gte(habitEntries.date, days[0]!), lte(habitEntries.date, date), eq(habitEntries.done, true))),
    db.select().from(quotes).orderBy(desc(quotes.createdAt)).limit(MAX_QUOTES),
    computeStats(db, now),
    vigilPractices(db),
  ]);
  const done = new Set(doneRows.map((e) => `${e.habitId} ${e.date}`));
  return {
    date,
    utcOffset: utcOffset(now),
    form: stats.form,
    level: stats.bond.level,
    lastSessionAt: stats.lastSessionAt,
    resurrectionId: ritual,
    todos: todoRows
      .filter((t) => t.doneAt === null || localDate(t.doneAt) === date)
      .map((t) => ({ id: t.id, body: t.body, done: t.doneAt !== null })),
    habits: habitRows.map((h) => ({
      id: h.id,
      name: h.name,
      done: done.has(`${h.id} ${date}`),
      history: days.map((d) => (done.has(`${h.id} ${d}`) ? '1' : '0')).join(''),
    })),
    quotes: quoteRows.map((q) => ({ body: q.body, source: q.source })),
    vigil: practices.map(({ id, name, minutes, pacer, bell }) => ({ id, name, minutes, pacer, bell })),
  };
}
