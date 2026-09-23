import {
  pgTable, serial, text, integer, timestamp, date, boolean, primaryKey,
} from 'drizzle-orm/pg-core';

export const folders = pgTable('folders', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull(),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
});

export const activities = pgTable('activities', {
  id: serial('id').primaryKey(),
  folderId: integer('folder_id').notNull().references(() => folders.id),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
});

export const sessions = pgTable('sessions', {
  id: serial('id').primaryKey(),
  activityId: integer('activity_id').notNull().references(() => activities.id),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  endedAt: timestamp('ended_at', { withTimezone: true }).notNull(),
  source: text('source', { enum: ['device', 'manual'] }).notNull(),
  deviceUuid: text('device_uuid').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  // Set when a session over 6 hours is confirmed on the web; until then it earns no XP.
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
});

export const todos = pgTable('todos', {
  id: serial('id').primaryKey(),
  body: text('body').notNull(),
  dueDate: date('due_date', { mode: 'string' }),
  doneAt: timestamp('done_at', { withTimezone: true }),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const habits = pgTable('habits', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull(),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
});

export const habitEntries = pgTable('habit_entries', {
  habitId: integer('habit_id').notNull().references(() => habits.id),
  date: date('date', { mode: 'string' }).notNull(),
  done: boolean('done').notNull(),
}, (t) => [primaryKey({ columns: [t.habitId, t.date] })]);

export const quotes = pgTable('quotes', {
  id: serial('id').primaryKey(),
  body: text('body').notNull(),
  source: text('source'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// A book, parsed into chapters on the web and kept here as plain text. The
// device reads it from the same rows, a chapter at a time.
export const books = pgTable('books', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  author: text('author'),
  format: text('format', { enum: ['epub', 'pdf', 'text'] }).notNull(),
  words: integer('words').notNull().default(0),
  addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  // Where the reading is, wherever it was last moved: the web and the device
  // keep the same place.
  chapterIdx: integer('chapter_idx').notNull().default(0),
  // How far into that chapter, as a fraction of its characters, so a phone
  // and a 200 by 200 screen can agree on a position without agreeing on a page.
  through: integer('through').notNull().default(0),
  readAt: timestamp('read_at', { withTimezone: true }),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
});

export const chapters = pgTable('chapters', {
  id: serial('id').primaryKey(),
  bookId: integer('book_id').notNull().references(() => books.id),
  idx: integer('idx').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
});

// A passage kept out of a book: marked on either the web or the device, and
// annotated on the web afterwards.
export const marks = pgTable('marks', {
  id: serial('id').primaryKey(),
  bookId: integer('book_id').notNull().references(() => books.id),
  chapterIdx: integer('chapter_idx').notNull(),
  // Character offsets into that chapter's body.
  start: integer('start').notNull(),
  end: integer('end').notNull(),
  body: text('body').notNull(),
  note: text('note'),
  source: text('source', { enum: ['web', 'device'] }).notNull().default('web'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const meta = pgTable('meta', {
  key: text('key').primaryKey(),
  value: integer('value').notNull(),
});

export const CONFIG_VERSION_KEY = 'config_version';

// The one device, as it last reported itself; and a look chosen on the web
// that it takes on at its next sync.
export const device = pgTable('device', {
  id: integer('id').primaryKey(),
  lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
  battery: integer('battery'),
  millivolts: integer('millivolts'),
  charging: boolean('charging'),
  look: text('look'),
  pendingLook: text('pending_look'),
});
