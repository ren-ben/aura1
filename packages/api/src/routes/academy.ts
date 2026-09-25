import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from '@fastify/type-provider-zod';
import { z } from 'zod';
import { and, asc, eq } from 'drizzle-orm';
import { CURRICULUM, guessModule } from '@aura/shared';
import type { Db } from '../db/client.ts';
import { courses, type CourseExam, type CourseGroup } from '../db/schema.ts';

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
  groups: z.array(z.object({ id: z.string(), events: z.array(event) })),
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

type Found = { name: string; type: string; ects: number; codes: string[]; groups: CourseGroup[] };
export function parseCourse(xml: string): Found | null {
  const name = xml.match(/<longname xml:lang="de">([^<]*)<\/longname>/)?.[1]?.trim();
  if (!name) return null;
  const groups = [...xml.matchAll(/<group [^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/group>/g)].map(([, id, body]) => ({
    id: id!,
    events: [...body!.matchAll(/<wwevent begin="([^"]+)" end="([^"]+)"[^>]*>([\s\S]*?)<\/wwevent>/g)]
      .map(([, begin, end, inner]) => ({ begin: begin!, end: end!, room: room(inner!) })),
  }));
  return {
    name: name.replace(/^STEOP\d:\s*/, ''),
    type: tag(xml, 'type'),
    ects: Math.round(Number(tag(xml, 'ects')) || 0),
    codes: tag(xml, 'codes').split(',').map((c) => c.trim()).filter(Boolean),
    groups,
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

async function lookUp(ufind: Ufind, nr: string, semester: string) {
  const xml = await ufind(`courses/${nr}/${semester}`);
  const found = xml ? parseCourse(xml) : null;
  if (!found) return null;
  const search = await ufind(`exams?query=${encodeURIComponent(`${found.name} ${semester}`)}`);
  return { ...found, exams: search ? parseExams(search, nr) : [] };
}

export const academyRoutes: FastifyPluginAsync<{ db: Db; ufind?: Ufind }> = async (app, opts) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db } = opts;
  const ufind = opts.ufind ?? fetchUfind;

  r.get('/academy', { schema: { response: { 200: z.array(courseDto) } } }, async () =>
    (await db.select().from(courses).orderBy(asc(courses.semester), asc(courses.nr)))
      .map(({ addedAt: _, refreshedAt, ...c }) => ({ ...c, refreshedAt: refreshedAt.toISOString() })));

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
      name: found.name, type: found.type, ects: found.ects, groups: found.groups, exams: found.exams,
      // A lecture has one group; there is nothing to choose.
      groupId: found.groups.length === 1 ? found.groups[0]!.id : null,
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
      const groupId = found.groups.some((g) => g.id === c.groupId) ? c.groupId : found.groups.length === 1 ? found.groups[0]!.id : null;
      await db.update(courses).set({
        name: found.name, type: found.type, ects: found.ects, groups: found.groups, exams: found.exams, groupId, refreshedAt: new Date(),
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
};
