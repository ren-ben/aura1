import { z } from 'zod';
import { FORM_STATES } from './xp.ts';

export const sessionEndedSchema = z.object({
  uuid: z.uuid(),
  activityId: z.number().int().positive(),
  startedAt: z.iso.datetime(),
  endedAt: z.iso.datetime(),
  clockSynced: z.boolean(),
});

// A tick from the device sets a todo or today's habit to an absolute state, so
// sending it twice changes nothing.
export const tickSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('todo'), id: z.number().int().positive(), done: z.boolean() }),
  z.object({ kind: z.literal('habit'), id: z.number().int().positive(), date: z.iso.date(), done: z.boolean() }),
]);

export const syncRequestSchema = z.object({
  deviceId: z.string().min(1).max(64),
  configVersion: z.number().int().nonnegative(),
  events: z.array(sessionEndedSchema).max(200),
  ticks: z.array(tickSchema).max(200).default([]),
  // The hash of the bundle the device holds: an unchanged bundle is not sent.
  todayHash: z.string().max(64).optional(),
  // How the device is: its battery and the look on its glass.
  status: z.object({
    battery: z.number().int().min(0).max(100),
    millivolts: z.number().int().min(0).max(6000),
    charging: z.boolean(),
    look: z.string().max(20),
  }).optional(),
});

export const folderDtoSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  sortOrder: z.number().int(),
});

export const activityDtoSchema = z.object({
  id: z.number().int(),
  folderId: z.number().int(),
  name: z.string(),
  lastUsedAt: z.iso.datetime().nullable(),
});

export const configDtoSchema = z.object({
  version: z.number().int(),
  folders: z.array(folderDtoSchema),
  activities: z.array(activityDtoSchema),
});

// What the device shows away from the web: today's lists, quotes to say,
// and how Kael'thos is doing.
export const HABIT_DAYS = 84;

export const todayDtoSchema = z.object({
  date: z.iso.date(),
  // Minutes east of UTC in the user's time zone, so the device knows when
  // the day turns.
  utcOffset: z.number().int(),
  form: z.enum(FORM_STATES),
  level: z.number().int(),
  lastSessionAt: z.iso.datetime().nullable(),
  // The ritual's activity, started from the device's menu while dormant.
  resurrectionId: z.number().int(),
  todos: z.array(z.object({ id: z.number().int(), body: z.string(), done: z.boolean() })),
  // history: the last HABIT_DAYS days, oldest first, '1' where done; today last.
  habits: z.array(z.object({ id: z.number().int(), name: z.string(), done: z.boolean(), history: z.string() })),
  quotes: z.array(z.object({ body: z.string(), source: z.string().nullable() })),
});

export const syncResponseSchema = z.object({
  serverTime: z.iso.datetime(),
  configVersion: z.number().int(),
  config: configDtoSchema.optional(),
  acked: z.array(z.uuid()),
  rejected: z.array(z.uuid()),
  todayHash: z.string(),
  today: todayDtoSchema.optional(),
  // A look chosen on the web, for the device to take on.
  look: z.string().optional(),
});

export type SessionEnded = z.infer<typeof sessionEndedSchema>;
// The input type: ticks may be absent (older firmware) and default to none.
export type SyncRequest = z.input<typeof syncRequestSchema>;
export type SyncResponse = z.infer<typeof syncResponseSchema>;
export type ConfigDto = z.infer<typeof configDtoSchema>;
export type Tick = z.infer<typeof tickSchema>;
export type TodayDto = z.infer<typeof todayDtoSchema>;
