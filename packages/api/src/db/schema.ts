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
