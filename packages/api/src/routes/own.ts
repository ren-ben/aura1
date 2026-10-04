import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from '@fastify/type-provider-zod';
import { z } from 'zod';
import { and, asc, eq, inArray, lte } from 'drizzle-orm';
import { createEmptyCard, fsrs, Rating, type Card, type Grade } from 'ts-fsrs';
import { NOTE_KINDS, ordsOf, type DueCardDto, type NoteDto, type OwnDeckDto } from '@aura/shared';
import type { Db } from '../db/client.ts';
import { ownCards, ownDecks, ownImages, ownNotes } from '../db/schema.ts';

// Your own decks, written at the desk (docs/superpowers/specs/2026-10-04-deck-design.md):
// notes, the cards they make, FSRS for when each comes back, the pictures
// for image occlusion, and the deck for Anki.
const idParams = z.object({ id: z.coerce.number().int().positive() });
const mask = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), w: z.number().min(0).max(1), h: z.number().min(0).max(1) });
const noteBody = z.object({
  kind: z.enum(NOTE_KINDS),
  name: z.string().trim().max(200),
  tags: z.array(z.string().trim().min(1).max(40)).max(20),
  fields: z.object({
    text: z.string().max(10_000).optional(), front: z.string().max(10_000).optional(), back: z.string().max(10_000).optional(), plain: z.string().max(500).optional(),
    imageId: z.number().int().positive().optional(), imageName: z.string().max(200).optional(),
    masks: z.array(mask).max(60).optional(), labels: z.array(z.string().max(300)).max(60).optional(), mode: z.enum(['all', 'one']).optional(),
  }),
});
type NoteRow = typeof ownNotes.$inferSelect;
const scheduler = fsrs();
// ts-fsrs keeps dates as Dates; the database keeps them as strings.
const revive = (j: Record<string, unknown>): Card => ({ ...(j as unknown as Card), due: new Date(j.due as string), last_review: j.last_review ? new Date(j.last_review as string) : undefined });

export const ownRoutes: FastifyPluginAsync<{ db: Db }> = async (app, opts) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db } = opts;
  const noteDto = (n: NoteRow, cards: number): NoteDto => ({ ...n, cards, updatedAt: n.updatedAt.toISOString() });

  // A note's cards made to match it: kept where their number still exists
  // (with all they have learned), new ones for new numbers, gone for gone ones.
  async function align(n: NoteRow) {
    const want = ordsOf(n.kind, n.fields);
    const have = await db.select({ id: ownCards.id, ord: ownCards.ord }).from(ownCards).where(eq(ownCards.noteId, n.id));
    const gone = have.filter((c) => !want.includes(c.ord)).map((c) => c.id);
    if (gone.length) await db.delete(ownCards).where(inArray(ownCards.id, gone));
    const fresh = want.filter((o) => !have.some((c) => c.ord === o));
    if (fresh.length) {
      const card = createEmptyCard(new Date());
      await db.insert(ownCards).values(fresh.map((ord) => ({ noteId: n.id, ord, fsrs: card as unknown as Record<string, unknown>, due: card.due })));
    }
    return want.length;
  }

  async function decks(): Promise<OwnDeckDto[]> {
    const ds = await db.select().from(ownDecks).orderBy(asc(ownDecks.createdAt));
    const ns = await db.select().from(ownNotes).orderBy(asc(ownNotes.id));
    const cs = await db.select({ noteId: ownCards.noteId, due: ownCards.due }).from(ownCards);
    const now = Date.now();
    return ds.map((d) => {
      const notes = ns.filter((n) => n.deckId === d.id);
      return {
        id: d.id, code: d.code, title: d.title,
        notes: notes.map((n) => noteDto(n, cs.filter((c) => c.noteId === n.id).length)),
        due: cs.filter((c) => notes.some((n) => n.id === c.noteId) && c.due.getTime() <= now).length,
      };
    });
  }

  r.get('/academy/own', async () => decks());

  // A new file: its number from the title's initials, like RM-0471.
  r.post('/academy/own/decks', { schema: { body: z.object({ title: z.string().trim().min(1).max(120) }) } }, async (request, reply) => {
    const { title } = request.body;
    const initials = title.split(/\s+/).map((w) => w[0]).join('').replace(/[^a-zA-ZÄÖÜäöü]/g, '').slice(0, 2).toUpperCase().padEnd(2, 'X');
    let code = '';
    for (let n = 0; !code || (await db.select({ id: ownDecks.id }).from(ownDecks).where(eq(ownDecks.code, code))).length; n++) code = `${initials}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
    const [row] = await db.insert(ownDecks).values({ code, title }).returning();
    return reply.code(201).send(row);
  });

  r.patch('/academy/own/decks/:id', { schema: { params: idParams, body: z.object({ title: z.string().trim().min(1).max(120) }) } }, async (request, reply) => {
    const rows = await db.update(ownDecks).set({ title: request.body.title }).where(eq(ownDecks.id, request.params.id)).returning({ id: ownDecks.id });
    return reply.code(rows.length ? 204 : 404).send();
  });

  r.delete('/academy/own/decks/:id', { schema: { params: idParams } }, async (request, reply) => {
    const rows = await db.delete(ownDecks).where(eq(ownDecks.id, request.params.id)).returning({ id: ownDecks.id });
    return reply.code(rows.length ? 204 : 404).send();
  });

  r.post('/academy/own/decks/:id/notes', { schema: { params: idParams, body: noteBody } }, async (request, reply) => {
    const [deck] = await db.select({ id: ownDecks.id }).from(ownDecks).where(eq(ownDecks.id, request.params.id));
    if (!deck) return reply.code(404).send({ message: 'no such file' });
    const [n] = await db.insert(ownNotes).values({ deckId: deck.id, ...request.body }).returning();
    return reply.code(201).send(noteDto(n!, await align(n!)));
  });

  r.patch('/academy/own/notes/:id', { schema: { params: idParams, body: noteBody } }, async (request, reply) => {
    const [n] = await db.update(ownNotes).set({ ...request.body, updatedAt: new Date() }).where(eq(ownNotes.id, request.params.id)).returning();
    return n ? noteDto(n, await align(n)) : reply.code(404).send();
  });

  r.delete('/academy/own/notes/:id', { schema: { params: idParams } }, async (request, reply) => {
    const rows = await db.delete(ownNotes).where(eq(ownNotes.id, request.params.id)).returning({ id: ownNotes.id });
    return reply.code(rows.length ? 204 : 404).send();
  });

  // A picture for image occlusion, sent as it is.
  for (const type of ['image/png', 'image/jpeg', 'image/webp', 'image/gif']) {
    app.addContentTypeParser(type, { parseAs: 'buffer', bodyLimit: 15 * 1024 * 1024 }, (_, body, done) => done(null, body));
  }
  r.post('/academy/own/images', { bodyLimit: 15 * 1024 * 1024 }, async (request, reply) => {
    const mime = String(request.headers['content-type'] ?? '').split(';')[0]!;
    if (!mime.startsWith('image/') || !Buffer.isBuffer(request.body)) return reply.code(415).send({ message: 'that is not a picture' });
    const [row] = await db.insert(ownImages).values({ mime, bytes: request.body }).returning({ id: ownImages.id });
    return reply.code(201).send(row);
  });
  r.get('/academy/own/images/:id', { schema: { params: idParams } }, async (request, reply) => {
    const [row] = await db.select().from(ownImages).where(eq(ownImages.id, request.params.id));
    return row ? reply.type(row.mime).header('cache-control', 'public, max-age=31536000, immutable').send(row.bytes) : reply.code(404).send();
  });

  // The cards of a deck that are due, soonest first, each with when it
  // would come back for each answer.
  r.get('/academy/own/decks/:id/due', { schema: { params: idParams } }, async (request) => {
    const now = new Date();
    const rows = await db.select({ card: ownCards, note: ownNotes }).from(ownCards).innerJoin(ownNotes, eq(ownNotes.id, ownCards.noteId))
      .where(and(eq(ownNotes.deckId, request.params.id), lte(ownCards.due, now))).orderBy(asc(ownCards.due), asc(ownCards.id));
    const counts = new Map<number, number>();
    for (const { note } of rows) counts.set(note.id, (counts.get(note.id) ?? 0) + 1);
    return rows.map(({ card, note }): DueCardDto => {
      const preview = scheduler.repeat(revive(card.fsrs), now);
      return {
        id: card.id, ord: card.ord, due: card.due.toISOString(), state: Number(card.fsrs.state ?? 0), note: noteDto(note, ordsOf(note.kind, note.fields).length),
        next: [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy].map((g) => preview[g as Grade].card.due.toISOString()) as DueCardDto['next'],
      };
    });
  });

  r.post('/academy/own/cards/:id/review', { schema: { params: idParams, body: z.object({ rating: z.number().int().min(1).max(4) }) } }, async (request, reply) => {
    const [card] = await db.select().from(ownCards).where(eq(ownCards.id, request.params.id));
    if (!card) return reply.code(404).send();
    const { card: next } = scheduler.next(revive(card.fsrs), new Date(), request.body.rating as Grade);
    await db.update(ownCards).set({ fsrs: next as unknown as Record<string, unknown>, due: next.due }).where(eq(ownCards.id, card.id));
    return { id: card.id, due: next.due.toISOString(), state: next.state };
  });

  // The deck for Anki's text import: each row names its note type, so
  // basic, both ways, typed and cloze notes arrive as Anki's own; a picture
  // with bars arrives as a basic card with the picture and the bars drawn in.
  r.get('/academy/own/decks/:id/anki', { schema: { params: idParams } }, async (request, reply) => {
    const [deck] = await db.select().from(ownDecks).where(eq(ownDecks.id, request.params.id));
    if (!deck) return reply.code(404).send();
    const notes = await db.select().from(ownNotes).where(eq(ownNotes.deckId, deck.id)).orderBy(asc(ownNotes.id));
    const images = new Map((await db.select().from(ownImages).where(inArray(ownImages.id, notes.flatMap((n) => (n.fields.imageId ? [n.fields.imageId] : [])).concat(0)))).map((i) => [i.id, `data:${i.mime};base64,${i.bytes.toString('base64')}`]));
    return reply.type('text/plain; charset=utf-8').header('content-disposition', `attachment; filename="${encodeURIComponent(deck.title)}.txt"`).send(anki(deck.title, notes, images));
  });
};

const cell = (s = '') => s.replace(/\t/g, ' ').replace(/\r?\n/g, '<br>');
const place = (m: { x: number; y: number; w: number; h: number }) => `left:${m.x * 100}%;top:${m.y * 100}%;width:${m.w * 100}%;height:${m.h * 100}%`;
const bar = (m: { x: number; y: number; w: number; h: number }, asked = false) => `<div style="position:absolute;${place(m)};background:#161514${asked ? ';outline:3px solid #c00' : ''}"></div>`;
const picture = (src: string, bars: string) => `<div style="position:relative;display:inline-block"><img src="${src}">${bars}</div>`;
export function anki(title: string, notes: NoteRow[], images: Map<number, string>): string {
  const rows = notes.flatMap((n) => {
    const f = n.fields, tags = n.tags.map((t) => t.replace(/\s+/g, '_')).join(' ');
    if (n.kind === 'cloze') return [['Cloze', cell(f.text), '', tags]];
    if (n.kind === 'reverse') return [['Basic (and reversed card)', cell(f.front), cell(f.back), tags]];
    if (n.kind === 'type') return [['Basic (type in the answer)', cell(f.front), cell(f.plain || f.back), tags]];
    if (n.kind === 'occlusion') {
      const src = f.imageId ? images.get(f.imageId) : undefined, masks = f.masks ?? [];
      if (!src) return [];
      return masks.map((m, i) => {
        const others = f.mode === 'one' ? '' : masks.map((o, j) => (j === i ? '' : bar(o))).join('');
        return ['Basic', picture(src, others + bar(m, true)), `${picture(src, others)}<br>${cell(f.labels?.[i] ?? '')}`, tags];
      });
    }
    return [['Basic', cell(f.front), cell(f.back), tags]];
  });
  return ['#separator:tab', '#html:true', '#notetype column:1', `#deck:${title.replace(/::/g, ':')}`, '#tags column:4', ...rows.map((r) => r.join('\t'))].join('\n') + '\n';
}
