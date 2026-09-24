import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from '@fastify/type-provider-zod';
import { z } from 'zod';
import { and, asc, eq } from 'drizzle-orm';
import { CURRICULUM, guessModule } from '@aura/shared';
import type { Db } from '../db/client.ts';
import { courses, type CourseGroup } from '../db/schema.ts';

const idParams = z.object({ id: z.coerce.number().int().positive() });
const moduleCode = z.enum(CURRICULUM.map((m) => m.code) as [string, ...string[]]);

const courseDto = z.object({
  id: z.number().int(),
  nr: z.string(),
  semester: z.string(),
  module: z.string(),
  name: z.string(),
  type: z.string(),
  ects: z.number().int(),
  groups: z.array(z.object({ id: z.string(), events: z.array(z.object({ begin: z.string(), end: z.string(), room: z.string() })) })),
  groupId: z.string().nullable(),
  grade: z.number().int().nullable(),
});

// u:find's own backend: public XML, one course per request. The groups and
// every date in them, and the codes of the modules it counts toward.
export const UFIND = 'https://m1-ufind.univie.ac.at/courses';
type Found = { name: string; type: string; ects: number; codes: string[]; groups: CourseGroup[] };

export function parseCourse(xml: string): Found | null {
  const tag = (src: string, name: string) => src.match(new RegExp(`<${name}[^>]*>([^<]*)</${name}>`))?.[1]?.trim() ?? '';
  const name = xml.match(/<longname xml:lang="de">([^<]*)<\/longname>/)?.[1]?.trim();
  if (!name) return null;
  const groups = [...xml.matchAll(/<group [^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/group>/g)].map(([, id, body]) => ({
    id: id!,
    events: [...body!.matchAll(/<wwevent begin="([^"]+)" end="([^"]+)"[^>]*>([\s\S]*?)<\/wwevent>/g)]
      .map(([, begin, end, inner]) => ({ begin: begin!, end: end!, room: tag(inner!, 'room').split(',')[0]!.trim() })),
  }));
  return {
    name: name.replace(/^STEOP\d:\s*/, ''),
    type: tag(xml, 'type'),
    ects: Math.round(Number(tag(xml, 'ects')) || 0),
    codes: tag(xml, 'codes').split(',').map((c) => c.trim()).filter(Boolean),
    groups,
  };
}

export const academyRoutes: FastifyPluginAsync<{ db: Db; fetchCourse?: (nr: string, semester: string) => Promise<string | null> }> = async (app, opts) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db } = opts;
  const fetchCourse = opts.fetchCourse ?? (async (nr: string, semester: string) => {
    const res = await fetch(`${UFIND}/${nr}/${semester}`);
    return res.ok ? res.text() : null;
  });

  r.get('/academy', { schema: { response: { 200: z.array(courseDto) } } }, async () =>
    db.select().from(courses).orderBy(asc(courses.semester), asc(courses.nr)));

  // Added by its number: looked up on u:find now, and kept.
  r.post('/academy/courses', {
    schema: { body: z.object({ nr: z.string().regex(/^\d{6}$/), semester: z.string().regex(/^\d{4}[WS]$/), module: moduleCode.optional() }) },
  }, async (request, reply) => {
    const { nr, semester } = request.body;
    const [existing] = await db.select().from(courses).where(and(eq(courses.nr, nr), eq(courses.semester, semester)));
    if (existing) return reply.code(409).send({ message: 'already added' });
    let xml: string | null;
    try { xml = await fetchCourse(nr, semester); } catch { return reply.code(502).send({ message: 'u:find did not answer' }); }
    const found = xml ? parseCourse(xml) : null;
    if (!found) return reply.code(404).send({ message: `u:find has no course ${nr} in ${semester}` });
    const [row] = await db.insert(courses).values({
      nr, semester,
      module: request.body.module ?? guessModule(found.codes, found.name),
      name: found.name, type: found.type, ects: found.ects, groups: found.groups,
      // A lecture has one group; there is nothing to choose.
      groupId: found.groups.length === 1 ? found.groups[0]!.id : null,
    }).returning();
    return reply.code(201).send(row);
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
