// The reading, as Goodreads has it: the shelf being read and the shelf read,
// taken from the public RSS feeds of the user in GOODREADS_USER. Goodreads
// has no API any more; the feeds need no key, only a public profile. Kept
// for an hour, since a shelf changes about as often as a book is finished.
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from '@fastify/type-provider-zod';
import { z } from 'zod';

// Fetches one page of a shelf's feed, or null when Goodreads will not give it.
export type Shelf = (user: string, shelf: string, page: number) => Promise<string | null>;

const PER_PAGE = 100;

const fetchShelf: Shelf = async (user, shelf, page) => {
  const url = `https://www.goodreads.com/review/list_rss/${encodeURIComponent(user)}?shelf=${shelf}&per_page=${PER_PAGE}&page=${page}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (aura-1)' } });
  return res.ok ? res.text() : null;
};

const tomeDto = z.object({
  title: z.string(), author: z.string(), cover: z.string().nullable(), pages: z.number().int().nullable(),
  startedAt: z.string().nullable(), readAt: z.string().nullable(), rating: z.number().int(), url: z.string(),
});
export type Tome = z.infer<typeof tomeDto>;
const readingDto = z.object({ current: z.array(tomeDto), read: z.array(tomeDto) });

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const text = (s: string) => s
  .replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1')
  .replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e: string) =>
    e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITIES[e] ?? m)
  .trim();
const field = (item: string, tag: string) => {
  const m = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return m ? text(m[1]!) : '';
};
// Goodreads dates are RFC 822; the console only wants the day.
const day = (s: string) => {
  const d = s ? new Date(s) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : null;
};

export function parseShelf(xml: string): Tome[] {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, item]) => {
    const cover = field(item!, 'book_large_image_url');
    const pages = Number(field(item!, 'num_pages'));
    return {
      title: field(item!, 'title'),
      author: field(item!, 'author_name'),
      // A book with no picture gets Goodreads' own placeholder: none is better.
      cover: cover && !cover.includes('nophoto') ? cover : null,
      pages: Number.isInteger(pages) && pages > 0 ? pages : null,
      startedAt: day(field(item!, 'user_date_added')),
      readAt: day(field(item!, 'user_read_at')),
      rating: Number(field(item!, 'user_rating')) || 0,
      url: `https://www.goodreads.com/book/show/${field(item!, 'book_id')}`,
    };
  });
}

async function wholeShelf(shelf: Shelf, user: string, name: string): Promise<Tome[]> {
  const all: Tome[] = [];
  for (let page = 1; page <= 50; page++) {
    const xml = await shelf(user, name, page);
    if (xml === null) throw new Error(`Goodreads would not give the ${name} shelf`);
    const got = parseShelf(xml);
    all.push(...got);
    if (got.length < PER_PAGE) break;
  }
  return all;
}

export const readingRoutes: FastifyPluginAsync<{ user?: string; shelf?: Shelf }> = async (app, opts) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const shelf = opts.shelf ?? fetchShelf;
  let kept: { at: number; reading: z.infer<typeof readingDto> } | null = null;

  r.get('/reading', { schema: { response: { 200: readingDto } } }, async () => {
    const user = opts.user;
    if (!user) return { current: [], read: [] };
    if (kept && Date.now() - kept.at < 3600_000) return kept.reading;
    try {
      const [current, read] = await Promise.all([wholeShelf(shelf, user, 'currently-reading'), wholeShelf(shelf, user, 'read')]);
      // Newest finished first; a book with no date read goes by when it was shelved.
      read.sort((a, b) => (b.readAt ?? b.startedAt ?? '').localeCompare(a.readAt ?? a.startedAt ?? ''));
      kept = { at: Date.now(), reading: { current, read } };
    } catch (e) {
      // Goodreads down: what was known before is better than nothing.
      if (!kept) throw e;
      app.log.warn(e);
    }
    return kept.reading;
  });
};
