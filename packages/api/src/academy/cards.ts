// The cards of a Moodle deck, kept here so the deck can be played without
// Moodle at hand, and answered back to Moodle so its boxes stay the same.
// docs/superpowers/specs/2026-10-04-deck-design.md
import { eq } from 'drizzle-orm';
import type { Db } from '../db/client.ts';
import { cards, decks, moodle } from '../db/schema.ts';
import { MOODLE, answerCard, cardOf, poolRows, type Http, type PoolCard } from './moodle.ts';

type Link = typeof moodle.$inferSelect;
type Card = typeof cards.$inferSelect;
export type Pending = { right: boolean; box: number };

// Where a card goes: right one box up (out of the pool into box 2), wrong
// back to box 1. Moodle's own rule.
export const nextBox = (box: number, right: boolean) => (right ? Math.min(5, Math.max(1, box) + 1) : 1);

// Images in a card point into Moodle; they come along inline, small ones.
async function inline(http: Http, html: string, token: string): Promise<string> {
  const found = [...new Set([...html.matchAll(/src="(https:\/\/moodle\.univie\.ac\.at\/pluginfile\.php\/[^"]+)"/g)].map((m) => m[1]!))];
  for (const src of found) {
    try {
      const res = await http(`${src.replace('/pluginfile.php/', '/webservice/pluginfile.php/')}${src.includes('?') ? '&' : '?'}token=${token}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (!res.ok || bytes.length > 500_000) continue;
      html = html.split(src).join(`data:${res.headers.get('content-type') ?? 'image/png'};base64,${Buffer.from(bytes).toString('base64')}`);
    } catch { /* the card keeps its link */ }
  }
  return html;
}

// Answers Moodle has not taken yet, sent in the order they were given.
// Stops at the first it refuses, so none is sent twice or out of order.
export async function flush(db: Db, http: Http, link: Link, card: Card, instance: number): Promise<Card> {
  const { pending } = card;
  if (!pending.length || !link.flashcardsToken) return card;
  let sent = 0;
  for (const a of pending) {
    try { await answerCard(http, link.flashcardsToken, instance, card.qid, a.box, a.right); sent++; } catch { break; }
  }
  const [row] = await db.update(cards).set({ pending: pending.slice(sent) }).where(eq(cards.id, card.id)).returning();
  return row!;
}

// One deck read from Moodle through a browser session: answers still owed
// go first, then every card's box as Moodle has it, and the faces of cards
// not seen before.
export async function syncDeck(db: Db, http: Http, link: Link, cookie: string, deckId: number, cmid: number, instance: number) {
  for (const c of await db.select().from(cards).where(eq(cards.deckId, deckId))) await flush(db, http, link, c, instance);
  // The plugin takes only its own page sizes (5000 the largest) and falls
  // back to 20 otherwise, so the pages are walked until one brings nothing new.
  const rows = new Map<number, PoolCard>();
  for (let p = 0; ; p++) {
    const page = await http(`${MOODLE}/mod/flashcards/studentquestioninit.php?id=${cmid}&perpage=5000&page=${p}`, { headers: { cookie } });
    const fresh = poolRows(await page.text()).filter((r) => !rows.has(r.qid));
    if (!fresh.length) break;
    for (const r of fresh) rows.set(r.qid, r);
  }
  const known = new Map((await db.select().from(cards).where(eq(cards.deckId, deckId))).map((c) => [c.qid, c]));
  for (const r of rows.values()) {
    const had = known.get(r.qid);
    // A card with answers still owed keeps the box it was answered into.
    if (had && !had.pending.length) await db.update(cards).set({ box: r.box, name: r.name }).where(eq(cards.id, had.id));
    // A card is read once; one that came without its back is read again.
    if (had?.back) continue;
    const res = await http(`${MOODLE}/mod/flashcards/flashcardpreview.php?id=${r.qid}&cmid=${cmid}`, { headers: { cookie } });
    const face = cardOf(await res.text());
    const faces = { front: face ? await inline(http, face.front, link.token) : r.name, back: face ? await inline(http, face.back, link.token) : '' };
    if (had) await db.update(cards).set(faces).where(eq(cards.id, had.id));
    else await db.insert(cards).values({ deckId, qid: r.qid, name: r.name, box: r.box, ...faces });
  }
  return recount(db, deckId);
}

// The deck's counts, from its cards.
export async function recount(db: Db, deckId: number) {
  const boxes = [0, 0, 0, 0, 0, 0];
  for (const c of await db.select({ box: cards.box }).from(cards).where(eq(cards.deckId, deckId))) boxes[c.box]!++;
  await db.update(decks).set({ boxes, syncedAt: new Date() }).where(eq(decks.id, deckId));
  return boxes;
}

// A deck for Anki: its plain-text import, one card a line, maths left as
// \( \), which Anki reads as it is.
export function anki(deck: { name: string; course: string }, rows: { front: string; back: string; box: number; name: string }[]) {
  const field = (s: string) => s.replace(/\t/g, ' ').replace(/\r?\n/g, '<br>');
  const tag = (s: string) => s.replace(/\s+/g, '_');
  return [
    '#separator:tab', '#html:true', `#deck:${deck.course}::${deck.name}`, '#tags column:3',
    ...rows.map((c) => `${field(c.front)}\t${field(c.back)}\tmoodle box${c.box} ${tag(c.name)}`),
  ].join('\n') + '\n';
}

