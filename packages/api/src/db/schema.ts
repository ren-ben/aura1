import {
  pgTable, serial, text, integer, timestamp,
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
});

export const meta = pgTable('meta', {
  key: text('key').primaryKey(),
  value: integer('value').notNull(),
});

export const CONFIG_VERSION_KEY = 'config_version';
