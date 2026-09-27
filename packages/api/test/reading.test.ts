import { test } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from '@fastify/type-provider-zod';
import { parseShelf, readingRoutes, type Shelf } from '../src/routes/reading.ts';

const item = (n: number, read: string, extra = '') => `
  <item>
    <title><![CDATA[Book ${n}: A &amp; B]]></title>
    <book_id>${1000 + n}</book_id>
    <book_large_image_url><![CDATA[https://i.gr-assets.com/books/${n}.jpg]]></book_large_image_url>
    <book id="${1000 + n}"><num_pages>${200 + n}</num_pages></book>
    <author_name>Author ${n}</author_name>
    <user_rating>${n % 6}</user_rating>
    <average_rating>4.1${n}</average_rating>
    <user_read_at><![CDATA[${read}]]></user_read_at>
    <user_date_added><![CDATA[Fri, 11 Sep 2026 10:07:58 -0700]]></user_date_added>
    ${extra}
  </item>`;
const feed = (items: string[]) => `<?xml version="1.0"?><rss><channel><title>shelf</title>${items.join('')}</channel></rss>`;

function app(shelf: Shelf, user: string | null = '42') {
  const a = Fastify({ logger: false });
  a.setValidatorCompiler(validatorCompiler);
  a.setSerializerCompiler(serializerCompiler);
  a.register(readingRoutes, { prefix: '/api/v1', user: user ?? undefined, shelf });
  return a;
}

test('a shelf item becomes a book', () => {
  const [b] = parseShelf(feed([item(3, 'Tue, 18 Aug 2026 00:00:00 +0000')]));
  assert.deepEqual(b, {
    title: 'Book 3: A & B', author: 'Author 3', cover: 'https://i.gr-assets.com/books/3.jpg', pages: 203,
    startedAt: '2026-09-11', readAt: '2026-08-18', rating: 3,
    average: 4.13, review: null, url: 'https://www.goodreads.com/book/show/1003',
  });
});

test('a review keeps its lines and loses its markup', () => {
  const [b] = parseShelf(feed([item(1, '', '<user_review><![CDATA[Vast.<br /><br />Would <i>drown</i> again &amp; again.]]></user_review>')]));
  assert.equal(b!.review, 'Vast.\n\nWould drown again & again.');
});

test('no date read and no picture come back as null', () => {
  const xml = feed([item(1, '').replace(/books\/1\.jpg/, 'nophoto/book/111x148.png')]);
  const [b] = parseShelf(xml);
  assert.equal(b!.readAt, null);
  assert.equal(b!.cover, null);
});

test('every page of the read shelf is taken, newest read first, and kept', async () => {
  let calls = 0;
  const shelf: Shelf = async (user, name, page) => {
    calls++;
    assert.equal(user, '42');
    if (name === 'currently-reading') return feed([item(0, '')]);
    // A full first page, then a short one.
    if (page === 1) return feed(Array.from({ length: 100 }, (_, i) => item(i + 1, `Mon, ${1 + (i % 27)} Jun 2025 00:00:00 +0000`)));
    return feed([item(500, 'Tue, 1 Sep 2026 00:00:00 +0000')]);
  };
  const a = app(shelf);
  const res = await a.inject({ method: 'GET', url: '/api/v1/reading' });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.current.length, 1);
  assert.equal(body.read.length, 101);
  assert.equal(body.read[0].title, 'Book 500: A & B');
  const before = calls;
  await a.inject({ method: 'GET', url: '/api/v1/reading' });
  assert.equal(calls, before, 'the second look is answered from what was kept');
});

test('with no Goodreads user the shelves are empty', async () => {
  const a = app(async () => { throw new Error('never asked'); }, null);
  const res = await a.inject({ method: 'GET', url: '/api/v1/reading' });
  assert.deepEqual(res.json(), { current: [], read: [] });
});

test('Goodreads refusing before anything is known is an error', async () => {
  const a = app(async () => null);
  const res = await a.inject({ method: 'GET', url: '/api/v1/reading' });
  assert.equal(res.statusCode, 500);
});
