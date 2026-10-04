import { and, eq, gte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { deeperSchema, lectureMapSchema, partOf, type LectureMapDto } from '@aura/shared';
import type { Db } from '../db/client.ts';
import { courses, lectureMaps } from '../db/schema.ts';
import { complete, type Fetch, type Settings } from './openrouter.ts';
import { deeperSystem, deeperUser, researchPrompt, writerSystem, writerUser, type Lecture } from './prompts.ts';
import { guessTopic, topicsOf } from './syllabus.ts';

type Course = typeof courses.$inferSelect;
type Row = typeof lectureMaps.$inferSelect;

export const toDto = (r: Row): LectureMapDto => ({
  id: r.id, courseId: r.courseId, begin: r.begin, topic: r.topic, status: r.status, error: r.error,
  map: r.map ?? null, grown: r.grown, sources: r.sources, costUsd: r.costUsd,
});

// The course's lectures: the dates of its chosen group (a lecture has only
// one) that are not its exercise part, in order.
export function lecturesOf(c: Course): string[] {
  const g = c.groups.find((x) => x.id === c.groupId) ?? (c.groups.length === 1 ? c.groups[0] : undefined);
  return (g?.events ?? []).filter((e) => partOf(c.type, e) !== 'UE').map((e) => e.begin).sort();
}

export function lectureOf(c: Course, begin: string): Omit<Lecture, 'topic'> & { guess: string } | null {
  const all = lecturesOf(c);
  const index = all.indexOf(begin);
  if (index < 0) return null;
  return {
    course: c.name, index, total: all.length, syllabus: c.syllabus, date: begin.slice(0, 10),
    guess: guessTopic(c.name, topicsOf(c.syllabus), index, all.length),
  };
}

// What has been spent this calendar month.
export async function spentThisMonth(db: Db, now = new Date()): Promise<number> {
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const [row] = await db.select({ total: sql<number>`coalesce(sum(${lectureMaps.costUsd}), 0)` })
    .from(lectureMaps).where(gte(lectureMaps.createdAt, from));
  return Number(row?.total ?? 0);
}

// The models answer in JSON; a reply that is not what was asked for is sent
// back once with what was wrong, then given up on.
async function asJson<T>(fetch: Fetch, settings: Settings, schema: z.ZodType<T>, name: string, messages: { role: 'system' | 'user' | 'assistant'; content: string }[], maxTokens: number) {
  let cost = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    const reply = await complete(fetch, settings, { model: settings.writer, messages, schema: { name, schema: z.toJSONSchema(schema) }, maxTokens });
    cost += reply.costUsd;
    const raw = reply.text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { parsed = undefined; }
    const result = schema.safeParse(parsed);
    if (result.success) return { value: result.data, cost };
    messages = [...messages, { role: 'assistant', content: reply.text },
      { role: 'user', content: `That did not match the schema: ${result.success ? '' : result.error.message.slice(0, 1500)}. Return only the corrected JSON.` }];
  }
  throw new Error('the map came back malformed twice');
}

// The two passes, run after the request has been answered. Research is kept
// as soon as it is done, so a failed writing pass does not pay for it again.
export async function generate(db: Db, fetch: Fetch, settings: Settings, id: number): Promise<void> {
  const set = (v: Partial<Row>) => db.update(lectureMaps).set(v).where(eq(lectureMaps.id, id));
  try {
    const [row] = await db.select().from(lectureMaps).where(eq(lectureMaps.id, id));
    const [course] = row ? await db.select().from(courses).where(eq(courses.id, row.courseId)) : [];
    const lecture = course && row ? lectureOf(course, row.begin) : null;
    if (!row || !course || !lecture) throw new Error('the lecture is no longer in the timetable');
    const l: Lecture = { ...lecture, topic: row.topic };
    let { notes, costUsd } = row;
    if (!notes) {
      await set({ status: 'researching', error: null });
      const research = await complete(fetch, settings, { model: settings.research, messages: researchPrompt(l), web: true, maxTokens: 6000 });
      notes = research.text;
      costUsd += research.costUsd;
      await set({ notes, sources: research.sources, costUsd });
    }
    await set({ status: 'writing' });
    const written = await asJson(fetch, settings, lectureMapSchema, 'lecture_map',
      [{ role: 'system', content: writerSystem }, { role: 'user', content: writerUser(l, notes) }], 9000);
    await set({ status: 'ready', map: written.value, costUsd: costUsd + written.cost });
  } catch (e) {
    await set({ status: 'failed', error: e instanceof Error ? e.message : 'failed' });
  }
}

// Children for one node, grown in place and kept.
export async function deeper(db: Db, fetch: Fetch, settings: Settings, row: Row, node: { key: string; kind: string; title: string; text: string }) {
  const grown = await asJson(fetch, settings, deeperSchema, 'deeper',
    [{ role: 'system', content: deeperSystem }, { role: 'user', content: deeperUser(row.map!, node) }], 3000);
  const n = row.grown.filter((g) => g.parent === node.key).length;
  const nodes = grown.value.nodes.map((x, i) => ({ ...x, id: `${node.key}.g${n + i}`, parent: node.key }));
  const [saved] = await db.update(lectureMaps)
    .set({ grown: [...row.grown, ...nodes], costUsd: row.costUsd + grown.cost })
    .where(eq(lectureMaps.id, row.id)).returning();
  return saved!;
}

// A generation cut off by a restart never finishes: after ten minutes in
// flight it is marked failed, and can be tried again.
export async function settleStale(db: Db, now = new Date()) {
  await db.update(lectureMaps).set({ status: 'failed', error: 'interrupted; try again' })
    .where(and(sql`${lectureMaps.status} in ('researching', 'writing')`, sql`${lectureMaps.createdAt} < ${new Date(now.getTime() - 10 * 60_000)}`));
}
