import type { GrownNode, LectureMap, MapStatus } from '@aura/shared';
import {
  pgTable, serial, text, integer, timestamp, date, boolean, primaryKey, jsonb, unique, doublePrecision,
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

// The Vigil's signs (docs/vigil/ASCENT.md), ticked on the web. The gate the
// user stands on is the first with a sign not yet kept.
export const vigilSigns = pgTable('vigil_signs', {
  sign: text('sign').primaryKey(),
  keptAt: timestamp('kept_at', { withTimezone: true }).notNull().defaultNow(),
});

// A course of the degree, as u:find published it when it was added: its
// groups and their dates, kept whole so the week works offline. The module
// is the curriculum code it counts toward; the grade is the Austrian 1 to 5.
export type CourseGroup = { id: string; events: { begin: string; end: string; room: string }[] };
// An exam u:find lists for the course or for its module in this degree.
export type CourseExam = { id: string; begin: string; end: string; title: string; room: string };
export const courses = pgTable('courses', {
  id: serial('id').primaryKey(),
  nr: text('nr').notNull(),
  semester: text('semester').notNull(),
  module: text('module').notNull(),
  name: text('name').notNull(),
  type: text('type').notNull(),
  ects: integer('ects').notNull(),
  groups: jsonb('groups').$type<CourseGroup[]>().notNull(),
  groupId: text('group_id'),
  grade: integer('grade'),
  exams: jsonb('exams').$type<CourseExam[]>().notNull().default([]),
  // What u:find says the course covers, as plain text: the topic guess for a
  // lecture is taken from it.
  syllabus: text('syllabus').notNull().default(''),
  refreshedAt: timestamp('refreshed_at', { withTimezone: true }).notNull().defaultNow(),
  addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique().on(t.nr, t.semester)]);

// A lecture's map: one per lecture date of a course. The research notes and
// sources are kept apart from the map, so a failed writing pass reuses them.
export const lectureMaps = pgTable('lecture_maps', {
  id: serial('id').primaryKey(),
  courseId: integer('course_id').notNull().references(() => courses.id, { onDelete: 'cascade' }),
  begin: text('begin').notNull(),
  topic: text('topic').notNull(),
  status: text('status').$type<MapStatus>().notNull(),
  error: text('error'),
  notes: text('notes'),
  sources: jsonb('sources').$type<{ title: string; url: string }[]>().notNull().default([]),
  map: jsonb('map').$type<LectureMap>(),
  grown: jsonb('grown').$type<GrownNode[]>().notNull().default([]),
  costUsd: doublePrecision('cost_usd').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique().on(t.courseId, t.begin)]);
