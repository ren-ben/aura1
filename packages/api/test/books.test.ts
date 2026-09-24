import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { sql } from 'drizzle-orm';
import { createDb, type Db } from '../src/db/client.ts';
import { seed } from '../src/db/seed.ts';
import { buildApp } from '../src/app.ts';

const url = process.env.TEST_DATABASE_URL
  ?? 'postgres://aura:aura@localhost:15434/aura_test';

let db: Db;
let close: () => Promise<void>;
let app: ReturnType<typeof buildApp>;

before(async () => {
  const created = createDb(url);
  db = created.db;
  close = () => created.pool.end();
  await migrate(db, { migrationsFolder: './drizzle' });
  app = buildApp(db, { logger: false });
  await app.ready();
});

after(async () => { await app.close(); await close(); });

beforeEach(async () => {
  await db.execute(sql`TRUNCATE marks, chapters, books, sessions, activities, folders, meta, device RESTART IDENTITY CASCADE`);
  await seed(db);
});

const BOOK = {
  title: 'The King in Yellow',
  author: 'Robert W. Chambers',
  format: 'epub' as const,
  chapters: [
    { title: 'The Repairer of Reputations', body: 'Ne raillons pas les fous. ' + 'word '.repeat(60) },
    { title: 'The Mask', body: 'Camilla: You, sir, should unmask. ' + 'word '.repeat(40) },
    { title: 'In the Court of the Dragon', body: 'In the Church of St. Barnabe. ' + 'word '.repeat(30) },
  ],
};

test('a book is kept as chapters, and read back one at a time', async () => {
    const made = await app.inject({ method: 'POST', url: '/api/v1/books', payload: BOOK });
    assert.equal(made.statusCode, 201);
    const { id } = made.json() as { id: number };

    const shelf = await app.inject({ method: 'GET', url: '/api/v1/books' });
    const [book] = shelf.json() as [{ title: string; chapters: unknown[]; words: number; marks: number }];
    assert.equal(book.title, 'The King in Yellow');
    assert.equal(book.chapters.length, 3);
    assert.ok(book.words > 100);
    assert.equal(book.marks, 0);

    const part = await app.inject({ method: 'GET', url: `/api/v1/books/${id}/chapters/1` });
    assert.equal(part.statusCode, 200);
    assert.match((part.json() as { body: string }).body, /should unmask/);

    const missing = await app.inject({ method: 'GET', url: `/api/v1/books/${id}/chapters/9` });
    assert.equal(missing.statusCode, 404);
});

test('where the reading is survives, and a passage can be kept and annotated', async () => {
    const { id } = (await app.inject({ method: 'POST', url: '/api/v1/books', payload: BOOK })).json() as { id: number };

    await app.inject({ method: 'PUT', url: `/api/v1/books/${id}/reading`, payload: { chapterIdx: 2, through: 480 } });
    const [book] = (await app.inject({ method: 'GET', url: '/api/v1/books' })).json() as [{ chapterIdx: number; through: number }];
    assert.equal(book.chapterIdx, 2);
    assert.equal(book.through, 480);

    const kept = await app.inject({
      method: 'POST',
      url: '/api/v1/marks',
      payload: { bookId: id, chapterIdx: 1, start: 0, end: 30, body: 'You, sir, should unmask.' },
    });
    assert.equal(kept.statusCode, 201);
    const markId = (kept.json() as { id: number }).id;

    await app.inject({ method: 'PUT', url: `/api/v1/marks/${markId}`, payload: { note: 'I wear no mask.' } });
    const [mark] = (await app.inject({ method: 'GET', url: '/api/v1/marks' })).json() as [{ note: string; source: string }];
    assert.equal(mark.note, 'I wear no mask.');
    assert.equal(mark.source, 'web');
});

test('the sync carries the shelf and no text; what the device read comes back with it', async () => {
    const { id } = (await app.inject({ method: 'POST', url: '/api/v1/books', payload: BOOK })).json() as { id: number };

    const first = (await app.inject({
      method: 'POST',
      url: '/api/v1/sync',
      payload: { deviceId: 'aura-1', configVersion: 0, events: [] },
    })).json() as { books: { id: number; chapters: number }[]; book?: unknown };
    assert.equal(first.books.length, 1);
    assert.equal(first.books[0]!.chapters, 3);
    assert.equal(first.book, undefined, 'the text is fetched apart from the sync');

    // It reads on, marks a passage, and says so at the next sync.
    const second = (await app.inject({
      method: 'POST',
      url: '/api/v1/sync',
      payload: {
        deviceId: 'aura-1',
        configVersion: 0,
        events: [],
        readings: [{
          bookId: id,
          chapterIdx: 1,
          through: 500,
          marks: [{ chapterIdx: 1, start: 9, end: 33, body: 'You, sir, should unmask.' }],
        }],
      },
    })).json() as { books: { chapterIdx: number; through: number }[] };
    assert.equal(second.books[0]!.chapterIdx, 1);
    assert.equal(second.books[0]!.through, 500);

    const marks = (await app.inject({ method: 'GET', url: '/api/v1/marks' })).json() as { source: string; body: string }[];
    assert.equal(marks.length, 1);
    assert.equal(marks[0]!.source, 'device');

    // The same passage again is still one passage.
    await app.inject({
      method: 'POST',
      url: '/api/v1/sync',
      payload: {
        deviceId: 'aura-1',
        configVersion: 0,
        events: [],
        readings: [{
          bookId: id,
          chapterIdx: 1,
          through: 600,
          marks: [{ chapterIdx: 1, start: 9, end: 33, body: 'You, sir, should unmask.' }],
        }],
      },
    });
    const again = (await app.inject({ method: 'GET', url: '/api/v1/marks' })).json() as unknown[];
    assert.equal(again.length, 1);
});

test('several books read between two syncs all come back', async () => {
    const first = (await app.inject({ method: 'POST', url: '/api/v1/books', payload: BOOK })).json() as { id: number };
    const second = (await app.inject({
      method: 'POST',
      url: '/api/v1/books',
      payload: { ...BOOK, title: 'The Dream-Quest', chapters: [{ title: 'Kadath', body: 'Three times Randolph Carter dreamed of the marvellous city.' }] },
    })).json() as { id: number };

    const body = (await app.inject({
      method: 'POST',
      url: '/api/v1/sync',
      payload: {
        deviceId: 'aura-1', configVersion: 0, events: [],
        readings: [
          { bookId: first.id, chapterIdx: 2, through: 100, marks: [] },
          { bookId: second.id, chapterIdx: 0, through: 750, marks: [{ chapterIdx: 0, start: 0, end: 13, body: 'Three times.' }] },
        ],
      },
    })).json() as { books: { id: number; chapterIdx: number; through: number }[] };
    assert.equal(body.books.length, 2);
    assert.equal(body.books.find((b) => b.id === first.id)!.chapterIdx, 2);
    assert.equal(body.books.find((b) => b.id === second.id)!.through, 750);
    const marks = (await app.inject({ method: 'GET', url: '/api/v1/marks' })).json() as { bookId: number }[];
    assert.deepEqual(marks.map((m) => m.bookId), [second.id]);
});

test('the device fetches a book whole: its head, then each chapter as plain text', async () => {
    const { id } = (await app.inject({ method: 'POST', url: '/api/v1/books', payload: BOOK })).json() as { id: number };
    await app.inject({ method: 'PUT', url: `/api/v1/books/${id}/reading`, payload: { chapterIdx: 1, through: 250 } });

    const head = await app.inject({ method: 'GET', url: `/api/v1/sync/books/${id}` });
    assert.equal(head.statusCode, 200);
    assert.match(head.headers['content-type'] as string, /^text\/plain/);
    assert.deepEqual(head.body.trimEnd().split('\n'), [
      '3 1 250', 'The King in Yellow', 'Robert W. Chambers',
      'The Repairer of Reputations', 'The Mask', 'In the Court of the Dragon',
    ]);

    const text = await app.inject({ method: 'GET', url: `/api/v1/sync/books/${id}/chapters/1` });
    assert.equal(text.statusCode, 200);
    assert.ok(text.body.startsWith('Camilla: You, sir, should unmask.'));

    assert.equal((await app.inject({ method: 'GET', url: `/api/v1/sync/books/${id}/chapters/9` })).statusCode, 404);
    assert.equal((await app.inject({ method: 'GET', url: '/api/v1/sync/books/999' })).statusCode, 404);
});
