import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from '@fastify/type-provider-zod';
import { z } from 'zod';
import { asc, eq } from 'drizzle-orm';
import type { Db } from '../db/client.ts';
import { cards, courses, decks, moodle } from '../db/schema.ts';
import { anki, flush, nextBox, recount } from '../academy/cards.ts';
import type { Http } from '../academy/moodle.ts';

// The decks played here (docs/superpowers/specs/2026-10-04-deck-design.md):
// their cards, an answer at a time sent on to Moodle, and the deck for Anki.
const idParams = z.object({ id: z.coerce.number().int().positive() });
type Row = typeof cards.$inferSelect;
const dto = ({ pending, answeredAt, ...c }: Row) => ({ ...c, pending: pending.length, answeredAt: answeredAt?.toISOString() ?? null });

export const cardRoutes: FastifyPluginAsync<{ db: Db; http?: Http }> = async (app, opts) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db } = opts;
  const http = opts.http ?? ((url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(30_000) }));

  r.get('/academy/decks/:id/cards', { schema: { params: idParams } }, async (request) =>
    (await db.select().from(cards).where(eq(cards.deckId, request.params.id)).orderBy(asc(cards.box), asc(cards.id))).map(dto));

  // Right or wrong: the box moves here at once, and Moodle is told; what it
  // does not take now is kept and sent before anything else next time.
  r.post('/academy/cards/:id/answer', { schema: { params: idParams, body: z.object({ right: z.boolean() }) } }, async (request, reply) => {
    const [card] = await db.select().from(cards).where(eq(cards.id, request.params.id));
    if (!card) return reply.code(404).send();
    const [deck] = await db.select().from(decks).where(eq(decks.id, card.deckId));
    const { right } = request.body;
    const [moved] = await db.update(cards).set({
      box: nextBox(card.box, right), answeredAt: new Date(), pending: [...card.pending, { right, box: card.box }],
    }).where(eq(cards.id, card.id)).returning();
    const [link] = await db.select().from(moodle);
    const sent = link ? await flush(db, http, link, moved!, deck!.instance) : moved!;
    await recount(db, card.deckId);
    return dto(sent);
  });

  r.get('/academy/decks/:id/anki', { schema: { params: idParams } }, async (request, reply) => {
    const [deck] = await db.select().from(decks).where(eq(decks.id, request.params.id));
    if (!deck) return reply.code(404).send();
    const [course] = await db.select({ name: courses.name }).from(courses).where(eq(courses.nr, deck.nr));
    const rows = await db.select().from(cards).where(eq(cards.deckId, deck.id)).orderBy(asc(cards.id));
    return reply.type('text/plain; charset=utf-8').header('content-disposition', `attachment; filename="${encodeURIComponent(deck.name)}.txt"`)
      .send(anki({ name: deck.name, course: (course?.name ?? deck.nr).replace(/::/g, ':') }, rows));
  });
};
