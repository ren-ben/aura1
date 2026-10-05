import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from '@fastify/type-provider-zod';
import { z } from 'zod';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { CURRICULUM, FIRST_TERM, guessModule, type LectureDto } from '@aura/shared';
import type { Db } from '../db/client.ts';
import { courses, folios, lectureMaps, type CourseExam, type CourseGroup } from '../db/schema.ts';
import { deeper, generate, lectureOf, settleStale, spentThisMonth, toDto } from '../academy/maps.ts';
import { settingsFromEnv, type Fetch, type Settings } from '../academy/openrouter.ts';
import { guessTopic, parseSyllabus, topicsOf } from '../academy/syllabus.ts';
import { moduleNrs } from '../academy/retrieve.ts';

const idParams = z.object({ id: z.coerce.number().int().positive() });
const moduleCode = z.enum(CURRICULUM.map((m) => m.code) as [string, ...string[]]);
const event = z.object({ begin: z.string(), end: z.string(), room: z.string() });

const courseDto = z.object({
  id: z.number().int(),
  nr: z.string(),
  semester: z.string(),
  module: z.string(),
  name: z.string(),
  type: z.string(),
  ects: z.number().int(),
  groups: z.array(z.object({ id: z.string(), events: z.array(event.extend({ lecture: z.boolean().optional() })) })),
  groupId: z.string().nullable(),
  grade: z.number().int().nullable(),
  exams: z.array(event.extend({ id: z.string(), title: z.string() })),
  refreshedAt: z.iso.datetime(),
});

// u:find's own backend: public XML. A course by its number, and the exams
// found by searching for its name.
export const UFIND = 'https://m1-ufind.univie.ac.at';
export type Ufind = (path: string) => Promise<string | null>;
const fetchUfind: Ufind = async (path) => {
  const res = await fetch(`${UFIND}/${path}`, { signal: AbortSignal.timeout(20_000) });
  return res.ok ? res.text() : null;
};

// The programme a module exam has to belong to, to count as this degree's.
const PROGRAMME = /^Bachelor Physik\b/;

const tag = (src: string, name: string) => src.match(new RegExp(`<${name}[^>]*>([^<]*)</${name}>`))?.[1]?.trim() ?? '';
const room = (src: string) => tag(src, 'room').split(',')[0]!.trim();

// A VU lists only its exercise dates; its lecture part is a note ("Der
// VO-Anteil findet DO wtl von 08.10.2026 bis 21.01.2027 09.15-10.45 Ort:
// Lise-Meitner-Hörsaal, ... statt."). Its weeks are read from the note,
// kept where the group meets within a week of them, so not over the break.
const WEEKDAYS = ['SO', 'MO', 'DI', 'MI', 'DO', 'FR', 'SA'];
const viennaOffset = (day: Date) => new Intl.DateTimeFormat('en', { timeZone: 'Europe/Vienna', timeZoneName: 'longOffset' })
  .formatToParts(day).find((p) => p.type === 'timeZoneName')!.value.replace('GMT', '');
type Event = CourseGroup['events'][number];
export function lecturePart(body: string, events: Event[]): Event[] {
  const m = body.match(/VO-Anteil findet (MO|DI|MI|DO|FR) wtl von (\d\d)\.(\d\d)\.(\d{4}) bis (\d\d)\.(\d\d)\.(\d{4}) (\d\d)\.(\d\d)\s*-\s*(\d\d)\.(\d\d) Ort: ([^,<&]+)/);
  if (!m) return [];
  const [, wd, d1, m1, y1, d2, m2, y2, bh, bm, eh, em, where] = m;
  const met = events.map((e) => Date.parse(e.begin));
  const out: Event[] = [];
  for (let day = new Date(Date.UTC(+y1!, +m1! - 1, +d1!, 12)); day <= new Date(Date.UTC(+y2!, +m2! - 1, +d2!, 12)); day.setUTCDate(day.getUTCDate() + 1)) {
    if (WEEKDAYS[day.getUTCDay()] !== wd || !met.some((t) => Math.abs(t - day.getTime()) < 7 * 864e5)) continue;
    const date = day.toISOString().slice(0, 10), off = viennaOffset(day);
    out.push({ begin: `${date}T${bh}:${bm}:00${off}`, end: `${date}T${eh}:${em}:00${off}`, room: where!.trim(), lecture: true });
  }
  return out;
}

type Found = { name: string; type: string; ects: number; codes: string[]; groups: CourseGroup[]; syllabus: string };
export function parseCourse(xml: string): Found | null {
  const name = xml.match(/<longname xml:lang="de">([^<]*)<\/longname>/)?.[1]?.trim();
  if (!name) return null;
  const groups = [...xml.matchAll(/<group [^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/group>/g)].map(([, id, body]) => {
    const events: Event[] = [...body!.matchAll(/<wwevent begin="([^"]+)" end="([^"]+)"[^>]*>([\s\S]*?)<\/wwevent>/g)]
      .map(([, begin, end, inner]) => ({ begin: begin!, end: end!, room: room(inner!) }));
    const lectures = lecturePart(body!, events);
    return { id: id!, events: lectures.length ? [...events.map((e) => ({ ...e, lecture: false })), ...lectures].sort((a, b) => a.begin.localeCompare(b.begin)) : events };
  });
  return {
    name: name.replace(/^STEOP\d:\s*/, ''),
    type: tag(xml, 'type'),
    ects: Math.round(Number(tag(xml, 'ects')) || 0),
    codes: tag(xml, 'codes').split(',').map((c) => c.trim()).filter(Boolean),
    groups,
    syllabus: parseSyllabus(xml),
  };
}

// From an exam search: the course's own exams, and those of any module of
// this degree the search turned up (a StEOP module exam hangs on the module,
// not the course). The same exam is listed under every programme sharing
// it: kept once.
export function parseExams(xml: string, nr: string): CourseExam[] {
  const found = new Map<string, CourseExam>();
  const take = (body: string) => {
    for (const [, begin, end, id, inner] of body.matchAll(/<exam begin="([^"]+)" end="([^"]+)"[^>]*?\bid="(\d+)"[^>]*>([\s\S]*?)<\/exam>/g)) {
      found.set(id!, { id: id!, begin: begin!, end: end!, title: inner!.match(/<title xml:lang="de">([^<]*)/)?.[1]?.trim() ?? '', room: room(inner!) });
    }
  };
  for (const [, id, body] of xml.matchAll(/<course id="(\d+)"[^>]*>([\s\S]*?)<\/course>/g)) if (id === nr) take(body!);
  for (const [, body] of xml.matchAll(/<module [^>]*>([\s\S]*?)<\/module>/g)) {
    if (PROGRAMME.test(body!.match(/<category xml:lang="de"[^>]*>([^<]*)/)?.[1] ?? '')) take(body!.replace(/<course [\s\S]*?<\/course>/g, ''));
  }
  return [...found.values()].sort((a, b) => a.begin.localeCompare(b.begin));
}

// The group a course is in: the one kept while it still exists, else the
// one registered for it, else the only one.
const groupFor = (nr: string, semester: string, groups: CourseGroup[], kept: string | null = null) =>
  [kept, semester === FIRST_TERM.semester ? FIRST_TERM.groups[nr] : null, groups.length === 1 ? groups[0]!.id : null]
    .find((id) => id && groups.some((g) => g.id === id)) ?? null;

async function lookUp(ufind: Ufind, nr: string, semester: string) {
  const xml = await ufind(`courses/${nr}/${semester}`);
  const found = xml ? parseCourse(xml) : null;
  if (!found) return null;
  const search = await ufind(`exams?query=${encodeURIComponent(`${found.name} ${semester}`)}`);
  return { ...found, exams: search ? parseExams(search, nr) : [] };
}

export const academyRoutes: FastifyPluginAsync<{ db: Db; ufind?: Ufind; openrouter?: Fetch; settings?: Settings }> = async (app, opts) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db } = opts;
  const ufind = opts.ufind ?? fetchUfind;
  const openrouter = opts.openrouter ?? fetch;
  const settings = opts.settings ?? settingsFromEnv();

  // A course kept with no group (added before the groups were known) is
  // given the one it is in, when that is known.
  r.get('/academy', { schema: { response: { 200: z.array(courseDto) } } }, async () => {
    const rows = await db.select().from(courses).orderBy(asc(courses.semester), asc(courses.nr));
    for (const c of rows) {
      if (c.groupId) continue;
      c.groupId = groupFor(c.nr, c.semester, c.groups);
      if (c.groupId) await db.update(courses).set({ groupId: c.groupId }).where(eq(courses.id, c.id));
    }
    return rows.map(({ addedAt: _, refreshedAt, ...c }) => ({ ...c, refreshedAt: refreshedAt.toISOString() }));
  });

  // Added by its number: looked up on u:find now, and kept.
  r.post('/academy/courses', {
    schema: { body: z.object({ nr: z.string().regex(/^\d{6}$/), semester: z.string().regex(/^\d{4}[WS]$/), module: moduleCode.optional() }) },
  }, async (request, reply) => {
    const { nr, semester } = request.body;
    const [existing] = await db.select().from(courses).where(and(eq(courses.nr, nr), eq(courses.semester, semester)));
    if (existing) return reply.code(409).send({ message: 'already added' });
    let found;
    try { found = await lookUp(ufind, nr, semester); } catch { return reply.code(502).send({ message: 'u:find did not answer' }); }
    if (!found) return reply.code(404).send({ message: `u:find has no course ${nr} in ${semester}` });
    const [row] = await db.insert(courses).values({
      nr, semester,
      module: request.body.module ?? guessModule(found.codes, found.name),
      name: found.name, type: found.type, ects: found.ects, groups: found.groups, exams: found.exams, syllabus: found.syllabus,
      groupId: groupFor(nr, semester, found.groups),
    }).returning();
    return reply.code(201).send(row);
  });

  // Asks u:find again for every course of a term: dates, rooms and exams move.
  // The grade, the module and the group chosen stay (the group while it
  // still exists). A course u:find no longer answers for is left as it was.
  r.post('/academy/refresh', {
    schema: { body: z.object({ semester: z.string().regex(/^\d{4}[WS]$/) }) },
  }, async (request) => {
    const rows = await db.select().from(courses).where(eq(courses.semester, request.body.semester));
    let refreshed = 0;
    for (const c of rows) {
      let found;
      try { found = await lookUp(ufind, c.nr, c.semester); } catch { continue; }
      if (!found) continue;
      const groupId = groupFor(c.nr, c.semester, found.groups, c.groupId);
      await db.update(courses).set({
        name: found.name, type: found.type, ects: found.ects, groups: found.groups, exams: found.exams, syllabus: found.syllabus, groupId, refreshedAt: new Date(),
      }).where(eq(courses.id, c.id));
      refreshed++;
    }
    return { refreshed, of: rows.length };
  });

  r.patch('/academy/courses/:id', {
    schema: {
      params: idParams,
      body: z.object({ grade: z.number().int().min(1).max(5).nullable().optional(), groupId: z.string().nullable().optional(), module: moduleCode.optional() }),
    },
  }, async (request, reply) => {
    const { grade, groupId, module } = request.body;
    const rows = await db.update(courses).set({
      ...(grade !== undefined ? { grade } : {}),
      ...(groupId !== undefined ? { groupId } : {}),
      ...(module !== undefined ? { module } : {}),
    }).where(eq(courses.id, request.params.id)).returning({ id: courses.id });
    return reply.code(rows.length ? 204 : 404).send();
  });

  r.delete('/academy/courses/:id', { schema: { params: idParams } }, async (request, reply) => {
    const rows = await db.delete(courses).where(eq(courses.id, request.params.id)).returning({ id: courses.id });
    return reply.code(rows.length ? 204 : 404).send();
  });

  // Lecture maps (docs/superpowers/specs/2026-09-26-lecture-maps-design.md).
  // A lecture is one date of a course that is not an exercise class.
  const lectureParams = z.object({ courseId: z.coerce.number().int().positive() });
  const findLecture = async (courseId: number, begin: string) => {
    const [course] = await db.select().from(courses).where(eq(courses.id, courseId));
    return course && course.type !== 'UE' ? lectureOf(course, begin) : null;
  };

  r.get('/academy/lectures/:courseId', {
    schema: { params: lectureParams, querystring: z.object({ begin: z.string() }) },
  }, async (request, reply) => {
    const { courseId } = request.params;
    const { begin } = request.query;
    // A course added before syllabi were kept gets its syllabus now.
    const [course] = await db.select().from(courses).where(eq(courses.id, courseId));
    if (course && !course.syllabus) {
      const found = await lookUp(ufind, course.nr, course.semester).catch(() => null);
      if (found?.syllabus) await db.update(courses).set({ syllabus: found.syllabus }).where(eq(courses.id, courseId));
    }
    const lecture = await findLecture(courseId, begin);
    if (!lecture) return reply.code(404).send({ message: 'no such lecture' });
    await settleStale(db);
    const [row] = await db.select().from(lectureMaps).where(and(eq(lectureMaps.courseId, courseId), eq(lectureMaps.begin, begin)));
    // With a Skript in the folios, its chapters are the topics, and the guess
    // is taken from them.
    const [skript] = course ? await db.select({ outline: folios.outline }).from(folios)
      .where(and(inArray(folios.nr, await moduleNrs(db, course.nr, course.semester)), eq(folios.semester, course.semester), eq(folios.kind, 'skript')))
      .orderBy(desc(folios.modifiedAt)).limit(1) : [];
    const topics = skript && skript.outline.length > 1 ? skript.outline.map((c) => c.title) : topicsOf(lecture.syllabus);
    const guess = skript && skript.outline.length > 1 ? guessTopic(course!.name, topics, lecture.index, lecture.total) : lecture.guess;
    const dto: LectureDto = { courseId, begin, index: lecture.index, total: lecture.total, guess, topics, map: row ? toDto(row) : null };
    return dto;
  });

  // Starts a map, starts a failed one again, or (with rewrite) writes a
  // finished one anew; answered at once, the passes run on and the page polls.
  r.post('/academy/maps', {
    schema: { body: z.object({ courseId: z.number().int().positive(), begin: z.string(), topic: z.string().trim().min(3).max(300), rewrite: z.boolean().optional() }) },
  }, async (request, reply) => {
    const { courseId, begin, topic, rewrite } = request.body;
    if (!(await findLecture(courseId, begin))) return reply.code(404).send({ message: 'no such lecture' });
    if (!settings.key) return reply.code(503).send({ message: 'no OpenRouter key is set on the server' });
    if ((await spentThisMonth(db)) >= settings.budgetUsd) return reply.code(402).send({ message: `this month's budget of $${settings.budgetUsd} is spent` });
    const [existing] = await db.select().from(lectureMaps).where(and(eq(lectureMaps.courseId, courseId), eq(lectureMaps.begin, begin)));
    if (existing && existing.status !== 'failed' && !(rewrite && existing.status === 'ready')) return reply.code(409).send({ message: 'already mapped' });
    // A new topic needs new research; the same one keeps what was found.
    // Rewritten, the map and what grew out of it go.
    const same = existing && existing.topic === topic;
    const [row] = existing
      ? await db.update(lectureMaps).set({ topic, status: 'researching', error: null, map: null, grown: [], createdAt: new Date(), ...(same ? {} : { notes: null, sources: [], pages: [] }) })
        .where(eq(lectureMaps.id, existing.id)).returning()
      : await db.insert(lectureMaps).values({ courseId, begin, topic, status: 'researching' }).returning();
    void generate(db, openrouter, settings, row!.id);
    return reply.code(202).send(toDto(row!));
  });

  // Which lectures have maps, for the calendar to mark.
  r.get('/academy/maps', async () =>
    db.select({ id: lectureMaps.id, courseId: lectureMaps.courseId, begin: lectureMaps.begin, status: lectureMaps.status, title: sql<string | null>`${lectureMaps.map}->>'title'` }).from(lectureMaps));

  r.get('/academy/maps/:id', { schema: { params: idParams } }, async (request, reply) => {
    await settleStale(db);
    const [row] = await db.select().from(lectureMaps).where(eq(lectureMaps.id, request.params.id));
    return row ? toDto(row) : reply.code(404).send();
  });

  r.post('/academy/maps/:id/expand', {
    schema: {
      params: idParams,
      body: z.object({ node: z.object({ key: z.string().min(1).max(40), kind: z.string().max(20), title: z.string().max(300), text: z.string().max(2000) }) }),
    },
  }, async (request, reply) => {
    const [row] = await db.select().from(lectureMaps).where(eq(lectureMaps.id, request.params.id));
    if (!row?.map) return reply.code(404).send({ message: 'no such map' });
    if ((await spentThisMonth(db)) >= settings.budgetUsd) return reply.code(402).send({ message: `this month's budget of $${settings.budgetUsd} is spent` });
    try {
      return toDto(await deeper(db, openrouter, settings, row, request.body.node));
    } catch (e) {
      return reply.code(502).send({ message: e instanceof Error ? e.message : 'the models did not answer' });
    }
  });
};
