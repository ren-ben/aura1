import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from '@fastify/type-provider-zod';
import { z } from 'zod';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { createEmptyCard, fsrs, Rating, type Card, type Grade } from 'ts-fsrs';
import type { MnemosyneDto, TopicDto } from '@aura/shared';
import type { Db } from '../db/client.ts';
import { topicGroups, topicLinks, topics } from '../db/schema.ts';

// Mnemosyne (docs/superpowers/specs/2026-10-18-mnemosyne-design.md): topics
// on an endless map, gathered into groups, linked by what builds on what. A
// learned topic is written out on paper, checked against its key points and
// rated; FSRS says when it comes back. In days, never minutes: no short-term
// steps.
const scheduler = fsrs({ enable_short_term: false });
const GRADES = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy] as Grade[];
// ts-fsrs keeps dates as Dates; the database keeps them as strings.
const revive = (j: Record<string, unknown>): Card => ({ ...(j as unknown as Card), due: new Date(j.due as string), last_review: j.last_review ? new Date(j.last_review as string) : undefined });
type Row = typeof topics.$inferSelect;

function dto(t: Row, now = new Date()): TopicDto {
  const card = t.fsrs ? revive(t.fsrs) : null;
  const next = card ? scheduler.repeat(card, now) : null;
  return {
    id: t.id, groupId: t.groupId, title: t.title, points: t.points, hub: t.hub, x: t.x, y: t.y,
    learned: !!card, stability: card?.stability ?? 0, lastReview: card?.last_review?.toISOString() ?? null,
    due: t.due?.toISOString() ?? null, reps: card?.reps ?? 0, lapses: card?.lapses ?? 0,
    next: next ? (GRADES.map((g) => next[g].card.due.toISOString()) as TopicDto['next']) : null,
  };
}

const idParams = z.object({ id: z.coerce.number().int().positive() });
const title = z.string().trim().min(1).max(200);
const points = z.array(z.string().trim().min(1).max(1000)).max(40);
const at = z.number().min(-1e7).max(1e7);
const groupId = z.number().int().positive().nullable();

export const topicRoutes: FastifyPluginAsync<{ db: Db }> = async (app, opts) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db } = opts;
  // A group is the liquid its topics make: once none are left, it is gone.
  const dry = () => db.delete(topicGroups).where(sql`not exists (select 1 from ${topics} where ${topics.groupId} = ${topicGroups.id})`);

  r.get('/academy/topics', async (): Promise<MnemosyneDto> => {
    const [gs, ts, ls] = await Promise.all([
      db.select().from(topicGroups).orderBy(asc(topicGroups.id)),
      db.select().from(topics).orderBy(asc(topics.id)),
      db.select().from(topicLinks).orderBy(asc(topicLinks.id)),
    ]);
    const now = new Date();
    return {
      groups: gs.map((g) => ({ id: g.id, name: g.name, ground: g.ground })),
      topics: ts.map((t) => dto(t, now)),
      links: ls.map((l) => ({ id: l.id, from: l.fromId, to: l.toId })),
    };
  });

  r.post('/academy/topics', { schema: { body: z.object({ title, x: at, y: at, groupId, points: points.default([]) }) } }, async (request, reply) => {
    const [row] = await db.insert(topics).values(request.body).returning();
    return reply.code(201).send(dto(row!));
  });

  r.patch('/academy/topics/:id', { schema: { params: idParams, body: z.object({ title: title.optional(), points: points.optional(), hub: z.boolean().optional() }) } }, async (request, reply) => {
    const [row] = await db.update(topics).set(request.body).where(eq(topics.id, request.params.id)).returning();
    return row ? dto(row) : reply.code(404).send();
  });

  r.delete('/academy/topics/:id', { schema: { params: idParams } }, async (request, reply) => {
    const rows = await db.delete(topics).where(eq(topics.id, request.params.id)).returning({ id: topics.id });
    await dry();
    return reply.code(rows.length ? 204 : 404).send();
  });

  // Where topics lie and which pool they are in, after any drag.
  r.post('/academy/topics/place', { schema: { body: z.object({ topics: z.array(z.object({ id: z.number().int().positive(), x: at, y: at, groupId })).min(1).max(2000) }) } }, async (request, reply) => {
    await db.transaction(async (tx) => {
      for (const t of request.body.topics) await tx.update(topics).set({ x: t.x, y: t.y, groupId: t.groupId }).where(eq(topics.id, t.id));
    });
    await dry();
    return reply.code(204).send();
  });

  // A recall rated, or a topic marked learned (its first good). Its clock
  // starts with the first.
  r.post('/academy/topics/:id/review', { schema: { params: idParams, body: z.object({ rating: z.number().int().min(1).max(4) }) } }, async (request, reply) => {
    const [row] = await db.select().from(topics).where(eq(topics.id, request.params.id));
    if (!row) return reply.code(404).send();
    const now = new Date();
    const { card } = scheduler.next(row.fsrs ? revive(row.fsrs) : createEmptyCard(now), now, request.body.rating as Grade);
    const [saved] = await db.update(topics).set({ fsrs: card as unknown as Record<string, unknown>, due: card.due }).where(eq(topics.id, row.id)).returning();
    return dto(saved!, now);
  });

  // Topics chosen together, made a group of their own.
  r.post('/academy/topic-groups', { schema: { body: z.object({ name: title, topicIds: z.array(z.number().int().positive()).min(1).max(2000) }) } }, async (request, reply) => {
    const [g] = await db.insert(topicGroups).values({ name: request.body.name }).returning();
    await db.update(topics).set({ groupId: g!.id }).where(inArray(topics.id, request.body.topicIds));
    await dry();
    return reply.code(201).send({ id: g!.id, name: g!.name, ground: g!.ground });
  });

  r.patch('/academy/topic-groups/:id', { schema: { params: idParams, body: z.object({ name: title.optional(), ground: z.number().int().min(0).max(5).optional() }) } }, async (request, reply) => {
    const rows = await db.update(topicGroups).set(request.body).where(eq(topicGroups.id, request.params.id)).returning({ id: topicGroups.id });
    return reply.code(rows.length ? 204 : 404).send();
  });

  r.delete('/academy/topic-groups/:id', { schema: { params: idParams } }, async (request, reply) => {
    const rows = await db.delete(topicGroups).where(eq(topicGroups.id, request.params.id)).returning({ id: topicGroups.id });
    return reply.code(rows.length ? 204 : 404).send();
  });

  // "Builds on": from the foundation to what rests on it.
  r.post('/academy/topic-links', { schema: { body: z.object({ from: z.number().int().positive(), to: z.number().int().positive() }) } }, async (request, reply) => {
    const { from, to } = request.body;
    if (from === to) return reply.code(400).send({ message: 'a topic cannot build on itself' });
    await db.insert(topicLinks).values({ fromId: from, toId: to }).onConflictDoNothing();
    const [l] = await db.select().from(topicLinks).where(and(eq(topicLinks.fromId, from), eq(topicLinks.toId, to)));
    return reply.code(201).send({ id: l!.id, from: l!.fromId, to: l!.toId });
  });

  r.delete('/academy/topic-links/:id', { schema: { params: idParams } }, async (request, reply) => {
    const rows = await db.delete(topicLinks).where(eq(topicLinks.id, request.params.id)).returning({ id: topicLinks.id });
    return reply.code(rows.length ? 204 : 404).send();
  });
};
