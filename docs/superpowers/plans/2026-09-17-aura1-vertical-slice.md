# AURA-1 Vertical Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One unbroken path from a button press on the AURA-1 to a row in Postgres to a line on a web page, with the offline SD queue real rather than stubbed.

**Architecture:** pnpm monorepo. `shared` holds zod schemas and pure functions imported by both API and web. `api` is Fastify + Drizzle against Postgres, reachable only over the Docker network with Cloudflare Access as the sole gate. `firmware` is PlatformIO with two build environments: a `native` one where the carousel, queue and session state machine are unit tested on the host behind port interfaces, and an `aura1` one that supplies the real e-ink, SD and wifi implementations.

**Tech Stack:** Node 22, pnpm, TypeScript, Fastify 5, `@fastify/type-provider-zod`, zod 4, Drizzle ORM + drizzle-kit, Postgres 17, Vue 3 + Vite, PlatformIO, Arduino-ESP32, GxEPD2, Unity (firmware host tests), `node:test` (TS tests).

**Spec:** `docs/superpowers/specs/2026-09-17-aura1-vertical-slice-design.md`
**Parent spec:** `docs/superpowers/specs/2026-09-17-aura1-masterplan.md`

## Global Constraints

- **No emojis.** Not in code, UI, terminal output, commits or docs.
- **Never pure `#000000`.** Dark surfaces are `#121212` or lighter. Off-whites are `#C5BCAB` and `#DBD5CA`. Monochrome only, no accent colour.
- **Keep it simple.** No defensive programming beyond what a test demands. No features beyond this spec.
- **Latest stable libraries**, current idiomatic usage.
- **The device screens in this plan are a throwaway prototype.** The real interface is Phase 4. The state machine must never draw; it emits a view model and a `Renderer` consumes it.
- **No live elapsed time is displayed during a running session.** This is a design decision, not an oversight.
- **`device_uuid` is the idempotency key.** Sync must be safe to retry blindly.
- **Archive, never delete.** `archived_at` columns, no destructive removal.
- **Secrets never enter git.** `secrets.h` and `credentials.ini` are gitignored; committed seed data uses neutral placeholder names.
- Commit after every task. Conventional Commits. End commit messages with:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
- **Test runner is `tsx --test`, not `node --test --experimental-strip-types`.** The
  target machine runs Node v20.18.0, which lacks native TypeScript stripping.
  `tsx` is a devDependency of every package that has tests. Do not "modernise"
  this back to the native runner.
- **Firmware host tests run in Docker, never on the Windows host.** The host's only C++
  compiler is MinGW.org GCC 6.3.0 (2016): it rejects `-std=gnu++17` and lacks
  `std::to_string`. `pnpm firmware:test` builds a small image from `python:3.13`
  (g++ 14.2) with PlatformIO installed and runs `pio test -e native` inside it, with
  `-f <suite>` passed through. The device build and upload (`env:aura1`) run on the
  Windows host as `python -m platformio ...`, because they use PlatformIO's own xtensa
  toolchain and need the USB port. `pio` is not on PATH on this machine; always invoke
  it as `python -m platformio`.
- **API tests run with `--test-concurrency=1`.** Every API test file truncates and
  reseeds the same live test database in `beforeEach`. Node runs test files in
  parallel by default, so two files race on the same tables and fail
  intermittently on FK and unique-constraint violations. Serial execution is
  required, not a performance choice.
- **Test scripts name every test file explicitly. No globs, no directory form.**
  Two discovery methods fail silently here and both exit 0 with zero tests run:
  a `test/*.test.ts` glob is not expanded by pnpm's default Windows shell, and
  `tsx --test test/` finds nothing because Node 20's runner does not recognise
  `.ts` as a test extension. A task that adds a test file MUST add it to that
  package's `test` script in the same commit, and MUST confirm the reported test
  count matches the number of test files on disk. A suite that reports fewer
  tests than you wrote is the failure mode to watch for.

---

### Task 1: Monorepo scaffold and Postgres

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `docker-compose.yml`, `.env.example`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: nothing
- Produces: a pnpm workspace with `packages/shared`, `packages/api` and `packages/web`; a Postgres 17 container on `localhost:5433` for development and `localhost:5434` for tests. `packages/firmware` is a PlatformIO C++ tree with no `package.json`, so it is deliberately NOT a workspace member.

- [ ] **Step 1: Create the workspace root**

`package.json`:
```json
{
  "name": "aura1",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@9.15.0",
  "engines": { "node": ">=20" },
  "scripts": {
    "db:up": "docker compose up -d postgres postgres-test",
    "db:down": "docker compose down",
    "test": "pnpm -r test"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "tsx": "^4.19.0"
  }
}
```

`pnpm-workspace.yaml`:
```yaml
packages:
  - "packages/shared"
  - "packages/api"
  - "packages/web"
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2023"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "declaration": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "verbatimModuleSyntax": true
  }
}
```

- [ ] **Step 2: Add Postgres containers**

`docker-compose.yml`:
```yaml
services:
  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: aura
      POSTGRES_PASSWORD: aura
      POSTGRES_DB: aura
    ports: ["5433:5432"]
    volumes: ["pgdata:/var/lib/postgresql/data"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U aura"]
      interval: 2s
      timeout: 3s
      retries: 20

  postgres-test:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: aura
      POSTGRES_PASSWORD: aura
      POSTGRES_DB: aura_test
    ports: ["5434:5432"]
    tmpfs: ["/var/lib/postgresql/data"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U aura"]
      interval: 2s
      timeout: 3s
      retries: 20

volumes:
  pgdata:
```

`.env.example`:
```
DATABASE_URL=postgres://aura:aura@localhost:5433/aura
TEST_DATABASE_URL=postgres://aura:aura@localhost:5434/aura_test
PORT=3000
```

- [ ] **Step 3: Verify Postgres comes up**

Run: `pnpm db:up && docker compose ps`
Expected: both `postgres` and `postgres-test` show `healthy`.

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json docker-compose.yml .env.example .gitignore
git commit -m "chore: scaffold pnpm monorepo with postgres containers"
```

---

### Task 2: Shared contract

**Files:**
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/src/sync.ts`, `packages/shared/src/session.ts`, `packages/shared/src/index.ts`
- Test: `packages/shared/test/session.test.ts`

**Interfaces:**
- Consumes: Task 1 workspace.
- Produces:
  - `sessionEndedSchema`, `syncRequestSchema`, `syncResponseSchema`, `configDtoSchema`, `folderDtoSchema`, `activityDtoSchema`
  - types `SessionEnded`, `SyncRequest`, `SyncResponse`, `ConfigDto`
  - `MAX_SESSION_MINUTES: 360`
  - `sessionMinutes(startedAt: string, endedAt: string): number`
  - `isRunaway(minutes: number): boolean`

- [ ] **Step 1: Create the package**

`packages/shared/package.json`:
```json
{
  "name": "@aura/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "test": "tsx --test test/*.test.ts" },
  "dependencies": { "zod": "^4.0.0" },
  "devDependencies": { "tsx": "^4.19.0" }
}
```

`packages/shared/tsconfig.json`:
```json
{ "extends": "../../tsconfig.base.json", "include": ["src", "test"] }
```

- [ ] **Step 2: Write the failing test**

`packages/shared/test/session.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sessionMinutes, isRunaway, syncRequestSchema } from '../src/index.ts';

test('sessionMinutes returns whole minutes between two instants', () => {
  assert.equal(
    sessionMinutes('2026-09-17T10:00:00.000Z', '2026-09-17T11:47:00.000Z'),
    107,
  );
});

test('sessionMinutes floors partial minutes', () => {
  assert.equal(
    sessionMinutes('2026-09-17T10:00:00.000Z', '2026-09-17T10:00:59.000Z'),
    0,
  );
});

test('sessionMinutes returns 0 when end precedes start', () => {
  assert.equal(
    sessionMinutes('2026-09-17T11:00:00.000Z', '2026-09-17T10:00:00.000Z'),
    0,
  );
});

test('isRunaway is true above six hours only', () => {
  assert.equal(isRunaway(360), false);
  assert.equal(isRunaway(361), true);
});

test('syncRequestSchema rejects a malformed uuid', () => {
  const result = syncRequestSchema.safeParse({
    deviceId: 'aura-1',
    configVersion: 1,
    events: [{
      uuid: 'not-a-uuid',
      activityId: 1,
      startedAt: '2026-09-17T10:00:00.000Z',
      endedAt: '2026-09-17T11:00:00.000Z',
      clockSynced: true,
    }],
  });
  assert.equal(result.success, false);
});

test('syncRequestSchema accepts a well formed batch', () => {
  const result = syncRequestSchema.safeParse({
    deviceId: 'aura-1',
    configVersion: 0,
    events: [{
      uuid: '018f3b2a-4c5d-7e8f-9a0b-1c2d3e4f5a6b',
      activityId: 3,
      startedAt: '2026-09-17T10:00:00.000Z',
      endedAt: '2026-09-17T11:00:00.000Z',
      clockSynced: true,
    }],
  });
  assert.equal(result.success, true);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @aura/shared test`
Expected: FAIL, cannot resolve `../src/index.ts`.

- [ ] **Step 4: Write the session helpers**

`packages/shared/src/session.ts`:
```ts
export const MAX_SESSION_MINUTES = 360;

export function sessionMinutes(startedAt: string, endedAt: string): number {
  const ms = Date.parse(endedAt) - Date.parse(startedAt);
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.floor(ms / 60_000);
}

export function isRunaway(minutes: number): boolean {
  return minutes > MAX_SESSION_MINUTES;
}
```

- [ ] **Step 5: Write the sync contract**

`packages/shared/src/sync.ts`:
```ts
import { z } from 'zod';

export const sessionEndedSchema = z.object({
  uuid: z.uuid(),
  activityId: z.number().int().positive(),
  startedAt: z.iso.datetime(),
  endedAt: z.iso.datetime(),
  clockSynced: z.boolean(),
});

export const syncRequestSchema = z.object({
  deviceId: z.string().min(1).max(64),
  configVersion: z.number().int().nonnegative(),
  events: z.array(sessionEndedSchema).max(200),
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

export const syncResponseSchema = z.object({
  serverTime: z.iso.datetime(),
  configVersion: z.number().int(),
  config: configDtoSchema.optional(),
  acked: z.array(z.uuid()),
  rejected: z.array(z.uuid()),
});

export type SessionEnded = z.infer<typeof sessionEndedSchema>;
export type SyncRequest = z.infer<typeof syncRequestSchema>;
export type SyncResponse = z.infer<typeof syncResponseSchema>;
export type ConfigDto = z.infer<typeof configDtoSchema>;
```

`packages/shared/src/index.ts`:
```ts
export * from './session.ts';
export * from './sync.ts';
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @aura/shared test`
Expected: PASS, 6 tests.

- [ ] **Step 7: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): add sync contract and session helpers"
```

**Note on `rejected`:** an event the server permanently cannot store, such as one naming an activity id that does not exist, comes back in `rejected` rather than `acked`. The device prunes on the union of both. Without this an unstorable event would sit in the queue forever and be retried on every sync.

---

### Task 3: Database schema, migrations and seed

**Files:**
- Create: `packages/api/package.json`, `packages/api/tsconfig.json`, `packages/api/drizzle.config.ts`, `packages/api/src/db/schema.ts`, `packages/api/src/db/client.ts`, `packages/api/src/db/migrate.ts`, `packages/api/src/db/seed.ts`
- Test: `packages/api/test/schema.test.ts`

**Interfaces:**
- Consumes: `@aura/shared` from Task 2.
- Produces:
  - tables `folders`, `activities`, `sessions`, `meta`
  - `createDb(url: string): { db: Db; pool: pg.Pool }` where `Db = NodePgDatabase<typeof schema>`
  - `seed(db: Db): Promise<void>`
  - `CONFIG_VERSION_KEY = 'config_version'`

- [ ] **Step 1: Create the package**

`packages/api/package.json`:
```json
{
  "name": "@aura/api",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "start": "tsx src/server.ts",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx src/db/migrate.ts",
    "test": "tsx --test test/schema.test.ts"
  },
  "dependencies": {
    "@aura/shared": "workspace:*",
    "@fastify/type-provider-zod": "^1.0.0",
    "drizzle-orm": "^0.38.0",
    "fastify": "^5.5.0",
    "pg": "^8.13.0",
    "zod": "^4.0.0"
  },
  "devDependencies": {
    "@types/pg": "^8.11.0",
    "drizzle-kit": "^0.30.0",
    "tsx": "^4.19.0"
  }
}
```

`packages/api/tsconfig.json`:
```json
{ "extends": "../../tsconfig.base.json", "include": ["src", "test"] }
```

- [ ] **Step 2: Write the schema**

`packages/api/src/db/schema.ts`:
```ts
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
```

- [ ] **Step 3: Write the client and migrate entrypoint**

`packages/api/src/db/client.ts`:
```ts
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.ts';

export type Db = NodePgDatabase<typeof schema>;

export function createDb(url: string): { db: Db; pool: pg.Pool } {
  const pool = new pg.Pool({ connectionString: url });
  return { db: drizzle(pool, { schema }), pool };
}
```

`packages/api/src/db/migrate.ts`:
```ts
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDb } from './client.ts';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const { db, pool } = createDb(url);
await migrate(db, { migrationsFolder: './drizzle' });
await pool.end();
```

`packages/api/drizzle.config.ts`:
```ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

- [ ] **Step 4: Generate the migration**

Run: `cd packages/api && DATABASE_URL=postgres://aura:aura@localhost:5433/aura pnpm db:generate`
Expected: a folder appears under `packages/api/drizzle/` containing `migration.sql` with `CREATE TABLE "folders"`, `"activities"`, `"sessions"`, `"meta"` and a unique constraint on `sessions.device_uuid`.

- [ ] **Step 5: Write the seed**

Folder names are canonical. Activity names here are neutral placeholders; real ones go in a gitignored local seed.

`packages/api/src/db/seed.ts`:
```ts
import { folders, activities, meta, CONFIG_VERSION_KEY } from './schema.ts';
import type { Db } from './client.ts';

const LAYOUT: Array<[string, string[]]> = [
  ['AXIOM',    ['coursework', 'problem sets']],
  ['WORKSHOP', ['aura-1', 'side project']],
  ['HERESY',   ['short form', 'long form']],
  ['DREAM',    ['reading', 'notes']],
  ['HUNT',     ['lifting', 'running']],
];

export async function seed(db: Db): Promise<void> {
  for (const [index, entry] of LAYOUT.entries()) {
    const [folderName, activityNames] = entry;
    const [folder] = await db
      .insert(folders)
      .values({ name: folderName, sortOrder: index })
      .returning();
    if (!folder) throw new Error(`failed to insert folder ${folderName}`);
    await db.insert(activities).values(
      activityNames.map((name) => ({ folderId: folder.id, name })),
    );
  }
  await db.insert(meta).values({ key: CONFIG_VERSION_KEY, value: 1 });
}
```

- [ ] **Step 6: Write the failing test**

`packages/api/test/schema.test.ts`:
```ts
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { sql } from 'drizzle-orm';
import { createDb, type Db } from '../src/db/client.ts';
import { seed } from '../src/db/seed.ts';
import { folders, activities, sessions } from '../src/db/schema.ts';

const url = process.env.TEST_DATABASE_URL
  ?? 'postgres://aura:aura@localhost:5434/aura_test';

let db: Db;
let close: () => Promise<void>;

before(async () => {
  const created = createDb(url);
  db = created.db;
  close = () => created.pool.end();
  await migrate(db, { migrationsFolder: './drizzle' });
});

after(async () => { await close(); });

beforeEach(async () => {
  await db.execute(
    sql`TRUNCATE sessions, activities, folders, meta RESTART IDENTITY CASCADE`,
  );
  await seed(db);
});

test('seed creates five folders in order', async () => {
  const rows = await db.select().from(folders).orderBy(folders.sortOrder);
  assert.deepEqual(
    rows.map((r) => r.name),
    ['AXIOM', 'WORKSHOP', 'HERESY', 'DREAM', 'HUNT'],
  );
});

test('seed creates ten activities', async () => {
  const rows = await db.select().from(activities);
  assert.equal(rows.length, 10);
});

test('device_uuid is unique', async () => {
  const [activity] = await db.select().from(activities).limit(1);
  assert.ok(activity);
  const row = {
    activityId: activity.id,
    startedAt: new Date('2026-09-17T10:00:00Z'),
    endedAt: new Date('2026-09-17T11:00:00Z'),
    source: 'device' as const,
    deviceUuid: '018f3b2a-4c5d-7e8f-9a0b-1c2d3e4f5a6b',
  };
  await db.insert(sessions).values(row);
  await assert.rejects(() => db.insert(sessions).values(row));
});
```

- [ ] **Step 7: Run tests**

Run: `pnpm db:up && cd packages/api && pnpm test`
Expected: PASS, 3 tests.

- [ ] **Step 8: Commit**

```bash
git add packages/api
git commit -m "feat(api): add drizzle schema, migration and seed"
```

---

### Task 4: Idempotent sync service

**Files:**
- Create: `packages/api/src/sync/service.ts`
- Test: `packages/api/test/sync-service.test.ts`

**Interfaces:**
- Consumes: `Db` (Task 3), `SyncRequest`/`SyncResponse`/`ConfigDto` (Task 2).
- Produces: `applySync(db: Db, request: SyncRequest): Promise<SyncResponse>` and `loadConfig(db: Db): Promise<ConfigDto>`.

This is the task the whole slice exists to prove. The test that matters is replaying the same batch and asserting one row.

- [ ] **Step 1: Write the failing test**

`packages/api/test/sync-service.test.ts`:
```ts
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { sql, eq } from 'drizzle-orm';
import { createDb, type Db } from '../src/db/client.ts';
import { seed } from '../src/db/seed.ts';
import { activities, sessions } from '../src/db/schema.ts';
import { applySync } from '../src/sync/service.ts';
import type { SyncRequest } from '@aura/shared';

const url = process.env.TEST_DATABASE_URL
  ?? 'postgres://aura:aura@localhost:5434/aura_test';

let db: Db;
let close: () => Promise<void>;
let activityId: number;

before(async () => {
  const created = createDb(url);
  db = created.db;
  close = () => created.pool.end();
  await migrate(db, { migrationsFolder: './drizzle' });
});

after(async () => { await close(); });

beforeEach(async () => {
  await db.execute(
    sql`TRUNCATE sessions, activities, folders, meta RESTART IDENTITY CASCADE`,
  );
  await seed(db);
  const [first] = await db.select().from(activities).limit(1);
  assert.ok(first);
  activityId = first.id;
});

function batch(): SyncRequest {
  return {
    deviceId: 'aura-1',
    configVersion: 1,
    events: [{
      uuid: '018f3b2a-4c5d-7e8f-9a0b-1c2d3e4f5a6b',
      activityId,
      startedAt: '2026-09-17T10:00:00.000Z',
      endedAt: '2026-09-17T11:47:00.000Z',
      clockSynced: true,
    }],
  };
}

test('a batch stores its session and acks it', async () => {
  const response = await applySync(db, batch());
  assert.deepEqual(response.acked, ['018f3b2a-4c5d-7e8f-9a0b-1c2d3e4f5a6b']);
  assert.deepEqual(response.rejected, []);
  const rows = await db.select().from(sessions);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.source, 'device');
});

test('replaying the same batch three times stores one row', async () => {
  await applySync(db, batch());
  await applySync(db, batch());
  const third = await applySync(db, batch());
  const rows = await db.select().from(sessions);
  assert.equal(rows.length, 1);
  assert.deepEqual(third.acked, ['018f3b2a-4c5d-7e8f-9a0b-1c2d3e4f5a6b']);
});

test('an event naming an unknown activity is rejected, not acked', async () => {
  const request = batch();
  request.events[0]!.activityId = 99999;
  const response = await applySync(db, request);
  assert.deepEqual(response.acked, []);
  assert.deepEqual(response.rejected, ['018f3b2a-4c5d-7e8f-9a0b-1c2d3e4f5a6b']);
  const rows = await db.select().from(sessions);
  assert.equal(rows.length, 0);
});

test('sync advances the activity last_used_at', async () => {
  await applySync(db, batch());
  const [row] = await db.select().from(activities).where(eq(activities.id, activityId));
  assert.equal(row?.lastUsedAt?.toISOString(), '2026-09-17T11:47:00.000Z');
});

test('config is omitted when the device version is current', async () => {
  const response = await applySync(db, batch());
  assert.equal(response.config, undefined);
  assert.equal(response.configVersion, 1);
});

test('config is sent when the device version is stale', async () => {
  const request = batch();
  request.configVersion = 0;
  const response = await applySync(db, request);
  assert.ok(response.config);
  assert.equal(response.config.folders.length, 5);
  assert.equal(response.config.activities.length, 10);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/api && pnpm test`
Expected: FAIL, cannot resolve `../src/sync/service.ts`.

- [ ] **Step 3: Implement the service**

`packages/api/src/sync/service.ts`:
```ts
import { eq, inArray, isNull, sql } from 'drizzle-orm';
import type { ConfigDto, SyncRequest, SyncResponse } from '@aura/shared';
import type { Db } from '../db/client.ts';
import {
  activities, folders, sessions, meta, CONFIG_VERSION_KEY,
} from '../db/schema.ts';

async function configVersion(db: Db): Promise<number> {
  const [row] = await db.select().from(meta).where(eq(meta.key, CONFIG_VERSION_KEY));
  return row?.value ?? 0;
}

export async function loadConfig(db: Db): Promise<ConfigDto> {
  const [version, folderRows, activityRows] = await Promise.all([
    configVersion(db),
    db.select().from(folders).where(isNull(folders.archivedAt)).orderBy(folders.sortOrder),
    db.select().from(activities).where(isNull(activities.archivedAt)),
  ]);
  return {
    version,
    folders: folderRows.map((f) => ({ id: f.id, name: f.name, sortOrder: f.sortOrder })),
    activities: activityRows.map((a) => ({
      id: a.id,
      folderId: a.folderId,
      name: a.name,
      lastUsedAt: a.lastUsedAt?.toISOString() ?? null,
    })),
  };
}

export async function applySync(db: Db, request: SyncRequest): Promise<SyncResponse> {
  const version = await configVersion(db);
  const acked: string[] = [];
  const rejected: string[] = [];

  if (request.events.length > 0) {
    const ids = [...new Set(request.events.map((e) => e.activityId))];
    const known = new Set(
      (await db.select({ id: activities.id })
        .from(activities)
        .where(inArray(activities.id, ids))).map((r) => r.id),
    );

    const storable = request.events.filter((e) => known.has(e.activityId));
    for (const event of request.events) {
      (known.has(event.activityId) ? acked : rejected).push(event.uuid);
    }

    if (storable.length > 0) {
      await db.insert(sessions).values(
        storable.map((e) => ({
          activityId: e.activityId,
          startedAt: new Date(e.startedAt),
          endedAt: new Date(e.endedAt),
          source: 'device' as const,
          deviceUuid: e.uuid,
        })),
      ).onConflictDoNothing({ target: sessions.deviceUuid });

      const latest = new Map<number, string>();
      for (const e of storable) {
        const current = latest.get(e.activityId);
        if (!current || e.endedAt > current) latest.set(e.activityId, e.endedAt);
      }
      for (const [id, endedAt] of latest) {
        const at = new Date(endedAt);
        await db.update(activities)
          .set({ lastUsedAt: at })
          .where(sql`${activities.id} = ${id} and (${activities.lastUsedAt} is null or ${activities.lastUsedAt} < ${at})`);
      }
    }
  }

  const stale = request.configVersion !== version;
  return {
    serverTime: new Date().toISOString(),
    configVersion: version,
    ...(stale ? { config: await loadConfig(db) } : {}),
    acked,
    rejected,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/api && pnpm test`
Expected: PASS, 9 tests total across both files. (Task 4's review later added two more, for 11.)

- [ ] **Step 5: Register the new test file**

Add `test/sync-service.test.ts` to the `test` script in `packages/api/package.json`:

```json
    "test": "tsx --test --test-concurrency=1 test/schema.test.ts test/sync-service.test.ts"
```

Re-run `pnpm --filter @aura/api test` and confirm it reports 9 tests, not 3.
Explicit file lists are required; see Global Constraints.

- [ ] **Step 6: Commit**

```bash
git add packages/api
git commit -m "feat(api): idempotent sync service keyed on device_uuid"
```

---

### Task 5: HTTP layer

**Files:**
- Create: `packages/api/src/app.ts`, `packages/api/src/routes/sync.ts`, `packages/api/src/routes/sessions.ts`, `packages/api/src/server.ts`
- Test: `packages/api/test/routes.test.ts`

**Interfaces:**
- Consumes: `applySync`, `loadConfig` (Task 4), `Db` (Task 3).
- Produces: `buildApp(db: Db): FastifyInstance` exposing `POST /api/v1/sync` and `GET /api/v1/sessions?from=&to=`.

**Auth note:** the API performs no authentication. It binds to the Docker network only and Cloudflare Access is the sole ingress gate, per the spec. Do not add a token check here; that would be a second, weaker copy of the auth already in front of it.

- [ ] **Step 1: Write the failing test**

`packages/api/test/routes.test.ts`:
```ts
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { sql } from 'drizzle-orm';
import { createDb, type Db } from '../src/db/client.ts';
import { seed } from '../src/db/seed.ts';
import { activities } from '../src/db/schema.ts';
import { buildApp } from '../src/app.ts';

const url = process.env.TEST_DATABASE_URL
  ?? 'postgres://aura:aura@localhost:5434/aura_test';

let db: Db;
let close: () => Promise<void>;
let app: ReturnType<typeof buildApp>;
let activityId: number;

before(async () => {
  const created = createDb(url);
  db = created.db;
  close = () => created.pool.end();
  await migrate(db, { migrationsFolder: './drizzle' });
  app = buildApp(db);
  await app.ready();
});

after(async () => { await app.close(); await close(); });

beforeEach(async () => {
  await db.execute(
    sql`TRUNCATE sessions, activities, folders, meta RESTART IDENTITY CASCADE`,
  );
  await seed(db);
  const [first] = await db.select().from(activities).limit(1);
  assert.ok(first);
  activityId = first.id;
});

function payload() {
  return {
    deviceId: 'aura-1',
    configVersion: 1,
    events: [{
      uuid: '018f3b2a-4c5d-7e8f-9a0b-1c2d3e4f5a6b',
      activityId,
      startedAt: '2026-09-17T10:00:00.000Z',
      endedAt: '2026-09-17T11:47:00.000Z',
      clockSynced: true,
    }],
  };
}

test('POST /api/v1/sync stores a session and returns acked', async () => {
  const response = await app.inject({
    method: 'POST', url: '/api/v1/sync', payload: payload(),
  });
  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.deepEqual(body.acked, ['018f3b2a-4c5d-7e8f-9a0b-1c2d3e4f5a6b']);
  assert.ok(body.serverTime);
});

test('POST /api/v1/sync rejects a malformed body with 400', async () => {
  const response = await app.inject({
    method: 'POST', url: '/api/v1/sync', payload: { deviceId: 'aura-1' },
  });
  assert.equal(response.statusCode, 400);
});

test('GET /api/v1/sessions returns the stored session with its names', async () => {
  await app.inject({ method: 'POST', url: '/api/v1/sync', payload: payload() });
  const response = await app.inject({ method: 'GET', url: '/api/v1/sessions' });
  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.length, 1);
  assert.equal(body[0].folder, 'AXIOM');
  assert.equal(body[0].minutes, 107);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/api && pnpm test`
Expected: FAIL, cannot resolve `../src/app.ts`.

- [ ] **Step 3: Write the app factory**

`packages/api/src/app.ts`:
```ts
import Fastify, { type FastifyInstance } from 'fastify';
import {
  serializerCompiler, validatorCompiler, type ZodTypeProvider,
} from '@fastify/type-provider-zod';
import type { Db } from './db/client.ts';
import { syncRoutes } from './routes/sync.ts';
import { sessionRoutes } from './routes/sessions.ts';

export function buildApp(db: Db): FastifyInstance {
  const app = Fastify({ logger: true });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.register(syncRoutes, { db, prefix: '/api/v1' });
  app.register(sessionRoutes, { db, prefix: '/api/v1' });

  return app;
}
```

- [ ] **Step 4: Write the routes**

`packages/api/src/routes/sync.ts`:
```ts
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from '@fastify/type-provider-zod';
import { syncRequestSchema, syncResponseSchema } from '@aura/shared';
import type { Db } from '../db/client.ts';
import { applySync } from '../sync/service.ts';

export const syncRoutes: FastifyPluginAsync<{ db: Db }> = async (app, opts) => {
  app.withTypeProvider<ZodTypeProvider>().post('/sync', {
    schema: {
      body: syncRequestSchema,
      response: { 200: syncResponseSchema },
    },
  }, async (request) => applySync(opts.db, request.body));
};
```

`packages/api/src/routes/sessions.ts`:
```ts
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from '@fastify/type-provider-zod';
import { z } from 'zod';
import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { sessionMinutes } from '@aura/shared';
import type { Db } from '../db/client.ts';
import { activities, folders, sessions } from '../db/schema.ts';

const querySchema = z.object({
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
});

const rowSchema = z.object({
  id: z.number().int(),
  activity: z.string(),
  folder: z.string(),
  startedAt: z.iso.datetime(),
  endedAt: z.iso.datetime(),
  minutes: z.number().int(),
  source: z.string(),
});

export const sessionRoutes: FastifyPluginAsync<{ db: Db }> = async (app, opts) => {
  app.withTypeProvider<ZodTypeProvider>().get('/sessions', {
    schema: {
      querystring: querySchema,
      response: { 200: z.array(rowSchema) },
    },
  }, async (request) => {
    const { from, to } = request.query;
    const filters = [
      ...(from ? [gte(sessions.startedAt, new Date(from))] : []),
      ...(to ? [lte(sessions.startedAt, new Date(to))] : []),
    ];

    const rows = await opts.db
      .select({
        id: sessions.id,
        activity: activities.name,
        folder: folders.name,
        startedAt: sessions.startedAt,
        endedAt: sessions.endedAt,
        source: sessions.source,
      })
      .from(sessions)
      .innerJoin(activities, eq(sessions.activityId, activities.id))
      .innerJoin(folders, eq(activities.folderId, folders.id))
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(sessions.startedAt));

    return rows.map((r) => ({
      ...r,
      startedAt: r.startedAt.toISOString(),
      endedAt: r.endedAt.toISOString(),
      minutes: sessionMinutes(r.startedAt.toISOString(), r.endedAt.toISOString()),
    }));
  });
};
```

`packages/api/src/server.ts`:
```ts
import { createDb } from './db/client.ts';
import { buildApp } from './app.ts';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const { db } = createDb(url);
const app = buildApp(db);
await app.listen({ port: Number(process.env.PORT ?? 3000), host: '0.0.0.0' });
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/api && pnpm test`
Expected: PASS, 14 tests total.

- [ ] **Step 6: Register the new test file**

Add `test/routes.test.ts` to the `test` script in `packages/api/package.json`:

```json
    "test": "tsx --test --test-concurrency=1 test/schema.test.ts test/sync-service.test.ts test/routes.test.ts"
```

Re-run `pnpm --filter @aura/api test` and confirm it reports 14 tests, not 11. (Task 4's review added two sync-service tests, bringing that file to 8.)

- [ ] **Step 7: Commit**

```bash
git add packages/api
git commit -m "feat(api): add sync and sessions http routes"
```

---

### Task 6: Deploy behind Cloudflare Access

**Files:**
- Create: `packages/api/Dockerfile`, `docs/deploy.md`
- Modify: `docker-compose.yml`

**Interfaces:**
- Consumes: the API from Task 5.
- Produces: a running API on the Pi reachable at `https://aura.amygdala-inc.org/api/v1/*`, gated by Cloudflare Access, with a service token a non-browser client can use.

**This task is authored on the dev machine and executed on the Pi.** Steps 1 and 2
produce the artifacts and commit them. Step 3 writes the runbook. Step 4 is run by
the user on the Pi after cloning this repo there — it is the single riskiest
assumption in the slice and must pass before any firmware is written.

Both base images (`node:22-alpine`, `postgres:17-alpine`) are multi-arch, so
`docker compose build` runs natively on the Pi's arm64. No cross-build, no
buildx emulation.

- [ ] **Step 1: Write the Dockerfile**

`packages/api/Dockerfile`:
```dockerfile
FROM node:22-alpine
RUN corepack enable
WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/api/package.json packages/api/
RUN pnpm install --frozen-lockfile

COPY packages/shared packages/shared
COPY packages/api packages/api

WORKDIR /app/packages/api
EXPOSE 3000
CMD ["sh", "-c", "pnpm db:migrate && pnpm start"]
```

- [ ] **Step 2: Add the API and tunnel to compose**

Append under `services:` in `docker-compose.yml`. Note there is no `ports` mapping on `api`: it is not published on the host, only reachable on the compose network by `cloudflared`.

```yaml
  api:
    build:
      context: .
      dockerfile: packages/api/Dockerfile
    environment:
      DATABASE_URL: postgres://aura:aura@postgres:5432/aura
      PORT: "3000"
    depends_on:
      postgres: { condition: service_healthy }
    restart: unless-stopped

  cloudflared:
    image: cloudflare/cloudflared:latest
    command: tunnel --no-autoupdate run
    environment:
      TUNNEL_TOKEN: ${TUNNEL_TOKEN}
    depends_on: [api]
    restart: unless-stopped
```

- [ ] **Step 3: Configure Cloudflare**

Write each step into `docs/deploy.md` as you do it:

1. Create a Cloudflare Tunnel, route `aura.amygdala-inc.org` to `http://api:3000`.
2. Put the tunnel token in a `.env` on the Pi as `TUNNEL_TOKEN`. Never commit it.
3. Zero Trust, Access, Applications: create a self-hosted app for `aura.amygdala-inc.org`.
4. Policy one, `browser`: action Allow, include your email.
5. Zero Trust, Access, Service Auth: create a service token named `aura-1`. Copy the client id and secret; they are shown only once at creation.
6. Policy two, `device`: action **Service Auth**, include the `aura-1` service token, scoped to the path `/api/v1/sync`.

The `device` policy must use the Service Auth action, not Allow. Allow still triggers an identity redirect, which an embedded client cannot follow.

- [ ] **Step 4: Verify the service token works from a non-browser client** (on the Pi)

On the Pi, after `git clone` and `docker compose up -d`, run:
```bash
curl -i https://aura.amygdala-inc.org/api/v1/sync \
  -H "CF-Access-Client-Id: $CF_ID" \
  -H "CF-Access-Client-Secret: $CF_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"deviceId":"curl","configVersion":0,"events":[]}'
```
Expected: `HTTP/2 200` with a JSON body containing `serverTime` and a `config` object holding five folders.

Then confirm the gate is real:
```bash
curl -i https://aura.amygdala-inc.org/api/v1/sync \
  -H "Content-Type: application/json" \
  -d '{"deviceId":"curl","configVersion":0,"events":[]}'
```
Expected: `302` to a Cloudflare login page, or `403`. Anything that reaches the API means the policy is wrong. Stop and fix it before continuing.

- [ ] **Step 5: Commit**

```bash
git add packages/api/Dockerfile docker-compose.yml docs/deploy.md
git commit -m "feat(deploy): dockerise api behind cloudflare tunnel and access"
```

---

### Task 7: Web page

**Files:**
- Create: `packages/web/package.json`, `packages/web/vite.config.ts`, `packages/web/index.html`, `packages/web/src/main.ts`, `packages/web/src/App.vue`
- Modify: `packages/api/package.json`, `packages/api/src/app.ts`, `packages/api/src/server.ts`, `packages/api/Dockerfile`
- Test: `packages/api/test/routes.test.ts`

**Interfaces:**
- Consumes: `GET /api/v1/sessions` (Task 5); `buildApp(db, opts)` (Task 5).
- Produces: a page listing sessions grouped by day, **served by the API itself** in production.
  `buildApp(db: Db, opts: { logger?: boolean; webRoot?: string } = {})` — when `webRoot` is set,
  the API serves that directory at `/` via `@fastify/static`; API routes stay under `/api/v1`.

**Why the API serves the page:** the Cloudflare tunnel routes `aura.amygdala-inc.org` to
`api:3000` and nothing else. Without this, the Pi answers `/` with a 404. One origin means
one tunnel route, one Access application, and no CORS. A separate web container was
rejected as a second service and a second route to get right for no gain.

Deliberately unstyled beyond the palette. The design system is Phase 5; styling it now means restyling it later.

- [ ] **Step 1: Create the package**

`packages/web/package.json`:
```json
{
  "name": "@aura/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "echo 'no web tests in the vertical slice'"
  },
  "dependencies": { "vue": "^3.5.0" },
  "devDependencies": { "@vitejs/plugin-vue": "^5.2.0", "vite": "^6.0.0" }
}
```

`packages/web/vite.config.ts`:
```ts
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: { proxy: { '/api': 'http://localhost:3000' } },
});
```

`packages/web/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>AURA-1</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`packages/web/src/main.ts`:
```ts
import { createApp } from 'vue';
import App from './App.vue';

createApp(App).mount('#app');
```

- [ ] **Step 2: Write the page**

`packages/web/src/App.vue`:
```vue
<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';

type Row = {
  id: number; activity: string; folder: string;
  startedAt: string; endedAt: string; minutes: number; source: string;
};

const rows = ref<Row[]>([]);
const error = ref<string | null>(null);

onMounted(async () => {
  try {
    const response = await fetch('/api/v1/sessions');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    rows.value = await response.json();
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'failed';
  }
});

const days = computed(() => {
  const grouped = new Map<string, Row[]>();
  for (const row of rows.value) {
    const day = row.startedAt.slice(0, 10);
    grouped.set(day, [...(grouped.get(day) ?? []), row]);
  }
  return [...grouped.entries()];
});

function duration(minutes: number): string {
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
}

function clock(iso: string): string {
  return iso.slice(11, 16);
}
</script>

<template>
  <main>
    <h1>AURA-1</h1>
    <p v-if="error">{{ error }}</p>
    <p v-else-if="rows.length === 0">No sessions logged.</p>
    <section v-for="[day, entries] in days" :key="day">
      <h2>{{ day }}</h2>
      <ul>
        <li v-for="entry in entries" :key="entry.id">
          <span>{{ entry.folder }}</span>
          <span>{{ entry.activity }}</span>
          <span>{{ clock(entry.startedAt) }}-{{ clock(entry.endedAt) }}</span>
          <span>{{ duration(entry.minutes) }}</span>
          <span v-if="entry.source === 'manual'">manual</span>
        </li>
      </ul>
    </section>
  </main>
</template>

<style>
:root { color-scheme: dark; }
body {
  margin: 0;
  padding: 2rem;
  background: #121212;
  color: #C5BCAB;
  font-family: ui-monospace, monospace;
}
h1, h2 { font-weight: 400; letter-spacing: 0.1em; }
ul { list-style: none; padding: 0; }
li { display: flex; gap: 1.5rem; padding: 0.25rem 0; }
</style>
```

- [ ] **Step 3: Verify the round trip**

Run, in three terminals: `pnpm db:up`; then `cd packages/api && pnpm dev`; then `cd packages/web && pnpm dev`.

POST a session to the local API with curl, then load `http://localhost:5173`.
Expected: one line under today's date showing folder, activity, times and duration.

- [ ] **Step 4: Serve the built page from the API**

Add `"@fastify/static"` (latest, currently `^10.1.4`; confirm it peers on fastify 5) to
`packages/api/package.json`.

Write the failing test first. Add to `packages/api/test/routes.test.ts`:

```ts
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('GET / serves the web app when webRoot is set', async () => {
  const webRoot = mkdtempSync(join(tmpdir(), 'aura-web-'));
  writeFileSync(join(webRoot, 'index.html'), '<!doctype html><title>AURA-1</title>');
  const withWeb = buildApp(db, { logger: false, webRoot });
  await withWeb.ready();
  const response = await withWeb.inject({ method: 'GET', url: '/' });
  await withWeb.close();
  assert.equal(response.statusCode, 200);
  assert.match(response.body, /AURA-1/);
});
```

Run it and confirm it fails. Then in `buildApp`, register `@fastify/static` with
`{ root: opts.webRoot }` only when `opts.webRoot` is set. Register it AFTER the API route
plugins so `/api/v1/*` is never shadowed.

In `server.ts`, pass `webRoot: resolve(import.meta.dirname, '../../web/dist')`. Note that
`import.meta.dirname` needs Node 20.11+; the machine runs 20.18.0.

In `packages/api/Dockerfile`, also copy `packages/web/package.json` before install and
`packages/web` after, then run `pnpm --filter @aura/web build` before the final `WORKDIR`.

The API suite must now report **16 tests**.

- [ ] **Step 5: Verify the page in the real container**

`docker compose build api && docker compose up -d postgres api` (never a bare `up`; that
starts cloudflared). Then `docker compose exec api wget -qO- http://localhost:3000/` must
return the built `index.html`, and `/api/v1/sessions` must still return JSON.
`docker compose stop api` afterwards.

- [ ] **Step 6: Commit**

```bash
git add packages/web packages/api
git commit -m "feat(web): add session list page served by the api"
```

---
### Task 8: Firmware scaffold and ports

**Files:**
- Create: `packages/firmware/platformio.ini`, `packages/firmware/include/ports.h`, `packages/firmware/include/view_model.h`, `packages/firmware/include/renderer.h`, `packages/firmware/test/test_ports/test_ports.cpp`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `enum class Screen { Idle, Running, Stopped, Syncing }`
  - `struct ViewModel { Screen screen; std::string folder; std::string activity; int cursor; int count; int folderIndex; int folderCount; int minutes; }`
  - `class Renderer { virtual void render(const ViewModel&) = 0; }`
  - `class Clock { virtual uint64_t nowEpochSeconds() = 0; virtual void setEpochSeconds(uint64_t) = 0; }`
  - `class Storage { append, readLines, write, remove, exists }`

The point of this task is that everything with logic in it becomes testable on the host. Nothing in Tasks 9 to 11 may depend on Arduino.

- [ ] **Step 1: Write platformio.ini**

`packages/firmware/platformio.ini`:
```ini
[env]
build_flags = -std=gnu++17 -I include

[env:native]
platform = native
test_framework = unity
build_src_filter = +<*> -<main.cpp> -<device/> -<config_store.cpp>

[env:aura1]
platform = espressif32
board = esp32-s3-devkitc-1
framework = arduino
board_build.partitions = huge_app.csv
monitor_speed = 115200
lib_deps =
  zinggjm/GxEPD2@^1.6.2
  bblanchon/ArduinoJson@^7.2.0
build_flags = ${env.build_flags} -DBOARD_HAS_PSRAM
```

- [ ] **Step 2: Write the ports**

`packages/firmware/include/ports.h`:
```cpp
#pragma once
#include <cstdint>
#include <string>
#include <vector>

class Clock {
public:
  virtual ~Clock() = default;
  virtual uint64_t nowEpochSeconds() = 0;
  virtual void setEpochSeconds(uint64_t seconds) = 0;
};

class Storage {
public:
  virtual ~Storage() = default;
  virtual bool append(const std::string& path, const std::string& line) = 0;
  virtual std::vector<std::string> readLines(const std::string& path) = 0;
  virtual bool write(const std::string& path, const std::string& content) = 0;
  virtual bool remove(const std::string& path) = 0;
  virtual bool exists(const std::string& path) = 0;
};
```

`packages/firmware/include/view_model.h`:
```cpp
#pragma once
#include <string>

enum class Screen { Idle, Running, Stopped, Syncing };

struct ViewModel {
  Screen screen = Screen::Idle;
  std::string folder;
  std::string activity;
  int cursor = 0;
  int count = 0;
  int folderIndex = 0;
  int folderCount = 0;
  int minutes = 0;
};
```

`packages/firmware/include/renderer.h`:
```cpp
#pragma once
#include "view_model.h"

class Renderer {
public:
  virtual ~Renderer() = default;
  virtual void render(const ViewModel& vm) = 0;
};
```

- [ ] **Step 3: Write a test proving the native environment runs**

`packages/firmware/test/test_ports/test_ports.cpp`:
```cpp
#include <unity.h>
#include "view_model.h"

void setUp() {}
void tearDown() {}

void test_view_model_defaults_to_idle() {
  ViewModel vm;
  TEST_ASSERT_TRUE(vm.screen == Screen::Idle);
  TEST_ASSERT_EQUAL_INT(0, vm.cursor);
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_view_model_defaults_to_idle);
  return UNITY_END();
}
```

- [ ] **Step 4: Add the Docker test runner**

The host compiler cannot build C++17 (see Global Constraints), so host tests run in a
container. `packages/firmware/test.Dockerfile`:

```dockerfile
FROM python:3.13
RUN pip install --no-cache-dir platformio
WORKDIR /fw
```

`scripts/firmware-test.mjs` (Node, so it works in pnpm's Windows shell, where `$PWD` and
globs do not expand):

```js
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const fw = resolve(import.meta.dirname, '../packages/firmware');
const run = (args) => {
  const r = spawnSync('docker', args, { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

run(['build', '-q', '-t', 'aura-fw-test', '-f', resolve(fw, 'test.Dockerfile'), fw]);
run([
  'run', '--rm',
  '-v', `${fw}:/fw`,
  '-v', 'aura-pio:/root/.platformio',
  'aura-fw-test',
  'pio', 'test', '-e', 'native', ...process.argv.slice(2),
]);
```

Add to the root `package.json` scripts: `"firmware:test": "node scripts/firmware-test.mjs"`.
The `aura-pio` named volume caches PlatformIO's downloaded packages between runs.

- [ ] **Step 5: Run the host tests**

Run: `pnpm firmware:test`
Expected: PASS, 1 test. Confirm the count in the output; a run that compiles nothing and
reports zero tests is not a pass.

- [ ] **Step 6: Commit**

```bash
git add packages/firmware scripts package.json
git commit -m "feat(firmware): scaffold platformio with host-testable ports"
```

---

### Task 9: Carousel navigation

**Files:**
- Create: `packages/firmware/include/carousel.h`, `packages/firmware/src/carousel.cpp`
- Test: `packages/firmware/test/test_carousel/test_carousel.cpp`

**Interfaces:**
- Consumes: `ViewModel` (Task 8).
- Produces:
  - `struct FolderEntry { int id; std::string name; }`
  - `struct ActivityEntry { int id; int folderId; std::string name; uint64_t lastUsedAt; }`
  - `class Carousel { void load(std::vector<FolderEntry>, std::vector<ActivityEntry>); void nextActivity(); void nextFolder(); int currentActivityId() const; void fill(ViewModel&) const; }`

Behaviour per the spec: SUN short advances the cursor within the current folder, activities ordered most-recently-used first. SUN long advances to the next folder and lands on that folder's most-recently-used activity.

- [ ] **Step 1: Write the failing test**

`packages/firmware/test/test_carousel/test_carousel.cpp`:
```cpp
#include <unity.h>
#include "carousel.h"

void setUp() {}
void tearDown() {}

static Carousel makeCarousel() {
  Carousel c;
  c.load(
    { {1, "AXIOM"}, {2, "WORKSHOP"} },
    {
      {10, 1, "coursework",   100},
      {11, 1, "problem sets", 300},
      {20, 2, "aura-1",       200},
      {21, 2, "side project",   0},
    });
  return c;
}

void test_starts_on_most_recently_used_activity_of_first_folder() {
  Carousel c = makeCarousel();
  TEST_ASSERT_EQUAL_INT(11, c.currentActivityId());
}

void test_short_press_cycles_within_folder_and_wraps() {
  Carousel c = makeCarousel();
  c.nextActivity();
  TEST_ASSERT_EQUAL_INT(10, c.currentActivityId());
  c.nextActivity();
  TEST_ASSERT_EQUAL_INT(11, c.currentActivityId());
}

void test_long_press_moves_to_next_folder_most_recently_used() {
  Carousel c = makeCarousel();
  c.nextFolder();
  TEST_ASSERT_EQUAL_INT(20, c.currentActivityId());
}

void test_long_press_wraps_back_to_first_folder() {
  Carousel c = makeCarousel();
  c.nextFolder();
  c.nextFolder();
  TEST_ASSERT_EQUAL_INT(11, c.currentActivityId());
}

void test_fill_populates_the_view_model() {
  Carousel c = makeCarousel();
  ViewModel vm;
  c.fill(vm);
  TEST_ASSERT_EQUAL_STRING("AXIOM", vm.folder.c_str());
  TEST_ASSERT_EQUAL_STRING("problem sets", vm.activity.c_str());
  TEST_ASSERT_EQUAL_INT(0, vm.cursor);
  TEST_ASSERT_EQUAL_INT(2, vm.count);
  TEST_ASSERT_EQUAL_INT(2, vm.folderCount);
}

void test_empty_folder_is_skipped_rather_than_stranding_the_cursor() {
  Carousel c;
  c.load({ {1, "AXIOM"}, {2, "WORKSHOP"} }, { {20, 2, "aura-1", 0} });
  TEST_ASSERT_EQUAL_INT(20, c.currentActivityId());
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_starts_on_most_recently_used_activity_of_first_folder);
  RUN_TEST(test_short_press_cycles_within_folder_and_wraps);
  RUN_TEST(test_long_press_moves_to_next_folder_most_recently_used);
  RUN_TEST(test_long_press_wraps_back_to_first_folder);
  RUN_TEST(test_fill_populates_the_view_model);
  RUN_TEST(test_empty_folder_is_skipped_rather_than_stranding_the_cursor);
  return UNITY_END();
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm firmware:test -f test_carousel`
Expected: FAIL, `carousel.h` not found.

- [ ] **Step 3: Write the header**

`packages/firmware/include/carousel.h`:
```cpp
#pragma once
#include <cstdint>
#include <cstddef>
#include <string>
#include <vector>
#include "view_model.h"

struct FolderEntry { int id; std::string name; };

struct ActivityEntry {
  int id;
  int folderId;
  std::string name;
  uint64_t lastUsedAt;
};

class Carousel {
public:
  void load(std::vector<FolderEntry> folders, std::vector<ActivityEntry> activities);
  void nextActivity();
  void nextFolder();
  int currentActivityId() const;
  void fill(ViewModel& vm) const;

private:
  void selectFolder(size_t index);

  std::vector<FolderEntry> folders_;
  std::vector<ActivityEntry> activities_;
  std::vector<const ActivityEntry*> visible_;
  size_t folderIndex_ = 0;
  size_t cursor_ = 0;
};
```

- [ ] **Step 4: Write the implementation**

`packages/firmware/src/carousel.cpp`:
```cpp
#include "carousel.h"
#include <algorithm>

void Carousel::load(std::vector<FolderEntry> folders,
                    std::vector<ActivityEntry> activities) {
  folders_ = std::move(folders);
  activities_ = std::move(activities);
  if (folders_.empty()) return;
  selectFolder(0);
  // A folder with no activities would strand the cursor, so advance past it.
  if (visible_.empty()) nextFolder();
}

void Carousel::selectFolder(size_t index) {
  if (folders_.empty()) return;
  folderIndex_ = index % folders_.size();
  cursor_ = 0;
  visible_.clear();
  const int folderId = folders_[folderIndex_].id;
  for (const auto& activity : activities_) {
    if (activity.folderId == folderId) visible_.push_back(&activity);
  }
  std::sort(visible_.begin(), visible_.end(),
            [](const ActivityEntry* a, const ActivityEntry* b) {
              return a->lastUsedAt > b->lastUsedAt;
            });
}

void Carousel::nextActivity() {
  if (visible_.empty()) return;
  cursor_ = (cursor_ + 1) % visible_.size();
}

void Carousel::nextFolder() {
  if (folders_.empty()) return;
  const size_t start = folderIndex_;
  for (size_t step = 1; step <= folders_.size(); ++step) {
    selectFolder(start + step);
    if (!visible_.empty()) return;
  }
}

int Carousel::currentActivityId() const {
  if (visible_.empty()) return 0;
  return visible_[cursor_]->id;
}

void Carousel::fill(ViewModel& vm) const {
  vm.folderCount = static_cast<int>(folders_.size());
  vm.folderIndex = static_cast<int>(folderIndex_);
  vm.folder = folders_.empty() ? "" : folders_[folderIndex_].name;
  vm.count = static_cast<int>(visible_.size());
  vm.cursor = static_cast<int>(cursor_);
  vm.activity = visible_.empty() ? "" : visible_[cursor_]->name;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm firmware:test -f test_carousel`
Expected: PASS, 6 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/firmware
git commit -m "feat(firmware): carousel navigation with recency ordering"
```

---

### Task 10: Durable event queue

**Files:**
- Create: `packages/firmware/include/queue.h`, `packages/firmware/src/queue.cpp`, `packages/firmware/test/fake_storage.h`
- Test: `packages/firmware/test/test_queue/test_queue.cpp`

**Interfaces:**
- Consumes: `Storage` (Task 8).
- Produces:
  - `struct QueuedEvent { std::string uuid; int activityId; uint64_t startedAt; uint64_t endedAt; bool clockSynced; }`
  - `class EventQueue { explicit EventQueue(Storage&); void append(const QueuedEvent&); std::vector<QueuedEvent> pending(); void prune(const std::vector<std::string>&); size_t size(); static std::string serialise(const QueuedEvent&); static bool parse(const std::string&, QueuedEvent&); }`

Append-only NDJSON. A torn final line, which is what a power cut during a write produces, must be discarded on read rather than crashing.

- [ ] **Step 1: Write the fake storage**

`packages/firmware/test/fake_storage.h`:
```cpp
#pragma once
#include <map>
#include <sstream>
#include "ports.h"

class FakeStorage : public Storage {
public:
  std::map<std::string, std::string> files;

  bool append(const std::string& path, const std::string& line) override {
    files[path] += line + "\n";
    return true;
  }
  std::vector<std::string> readLines(const std::string& path) override {
    std::vector<std::string> out;
    auto it = files.find(path);
    if (it == files.end()) return out;
    std::istringstream stream(it->second);
    std::string line;
    while (std::getline(stream, line)) out.push_back(line);
    return out;
  }
  bool write(const std::string& path, const std::string& content) override {
    files[path] = content;
    return true;
  }
  bool remove(const std::string& path) override { return files.erase(path) > 0; }
  bool exists(const std::string& path) override { return files.count(path) > 0; }
};
```

- [ ] **Step 2: Write the failing test**

`packages/firmware/test/test_queue/test_queue.cpp`:
```cpp
#include <unity.h>
#include "queue.h"
#include "../fake_storage.h"

void setUp() {}
void tearDown() {}

static QueuedEvent event(const std::string& uuid) {
  return { uuid, 10, 1758100000ULL, 1758106420ULL, true };
}

void test_appended_event_is_pending() {
  FakeStorage fs;
  EventQueue q(fs);
  q.append(event("018f3b2a-4c5d-7e8f-9a0b-1c2d3e4f5a6b"));
  auto pending = q.pending();
  TEST_ASSERT_EQUAL_INT(1, (int)pending.size());
  TEST_ASSERT_EQUAL_STRING("018f3b2a-4c5d-7e8f-9a0b-1c2d3e4f5a6b",
                           pending[0].uuid.c_str());
  TEST_ASSERT_EQUAL_INT(10, pending[0].activityId);
  TEST_ASSERT_EQUAL_UINT64(1758106420ULL, pending[0].endedAt);
}

void test_prune_removes_only_acked_uuids() {
  FakeStorage fs;
  EventQueue q(fs);
  q.append(event("018f3b2a-4c5d-7e8f-9a0b-1c2d3e4f5a6b"));
  q.append(event("028f3b2a-4c5d-7e8f-9a0b-1c2d3e4f5a6b"));
  q.prune({ "018f3b2a-4c5d-7e8f-9a0b-1c2d3e4f5a6b" });
  auto pending = q.pending();
  TEST_ASSERT_EQUAL_INT(1, (int)pending.size());
  TEST_ASSERT_EQUAL_STRING("028f3b2a-4c5d-7e8f-9a0b-1c2d3e4f5a6b",
                           pending[0].uuid.c_str());
}

void test_failed_sync_changes_nothing() {
  FakeStorage fs;
  EventQueue q(fs);
  q.append(event("018f3b2a-4c5d-7e8f-9a0b-1c2d3e4f5a6b"));
  q.prune({});
  TEST_ASSERT_EQUAL_INT(1, (int)q.pending().size());
}

void test_torn_final_line_is_discarded_not_fatal() {
  FakeStorage fs;
  fs.files["/queue.ndjson"] =
    "{\"uuid\":\"018f3b2a-4c5d-7e8f-9a0b-1c2d3e4f5a6b\",\"activityId\":10,"
    "\"startedAt\":1758100000,\"endedAt\":1758106420,\"clockSynced\":true}\n"
    "{\"uuid\":\"028f3b2a-4c5d-7e8f";
  EventQueue q(fs);
  auto pending = q.pending();
  TEST_ASSERT_EQUAL_INT(1, (int)pending.size());
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_appended_event_is_pending);
  RUN_TEST(test_prune_removes_only_acked_uuids);
  RUN_TEST(test_failed_sync_changes_nothing);
  RUN_TEST(test_torn_final_line_is_discarded_not_fatal);
  return UNITY_END();
}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm firmware:test -f test_queue`
Expected: FAIL, `queue.h` not found.

- [ ] **Step 4: Write the header**

`packages/firmware/include/queue.h`:
```cpp
#pragma once
#include <cstdint>
#include <cstddef>
#include <string>
#include <vector>
#include "ports.h"

struct QueuedEvent {
  std::string uuid;
  int activityId;
  uint64_t startedAt;
  uint64_t endedAt;
  bool clockSynced;
};

class EventQueue {
public:
  explicit EventQueue(Storage& storage) : storage_(storage) {}

  void append(const QueuedEvent& event);
  std::vector<QueuedEvent> pending();
  void prune(const std::vector<std::string>& uuids);
  size_t size();

  static std::string serialise(const QueuedEvent& event);
  static bool parse(const std::string& line, QueuedEvent& out);

private:
  static constexpr const char* PATH = "/queue.ndjson";
  Storage& storage_;
};
```

- [ ] **Step 5: Write the implementation**

Hand-rolled parsing rather than a JSON library, because the format is fixed and this keeps the queue free of any Arduino dependency so it stays host testable.

`packages/firmware/src/queue.cpp`:
```cpp
#include "queue.h"
#include <algorithm>
#include <cstdlib>

static bool field(const std::string& line, const std::string& key, std::string& out) {
  const std::string needle = "\"" + key + "\":";
  const size_t at = line.find(needle);
  if (at == std::string::npos) return false;
  size_t start = at + needle.size();
  if (start >= line.size()) return false;
  if (line[start] == '"') {
    const size_t end = line.find('"', ++start);
    if (end == std::string::npos) return false;
    out = line.substr(start, end - start);
    return true;
  }
  const size_t end = line.find_first_of(",}", start);
  if (end == std::string::npos) return false;
  out = line.substr(start, end - start);
  return true;
}

std::string EventQueue::serialise(const QueuedEvent& e) {
  return "{\"uuid\":\"" + e.uuid + "\",\"activityId\":" + std::to_string(e.activityId)
       + ",\"startedAt\":" + std::to_string(e.startedAt)
       + ",\"endedAt\":" + std::to_string(e.endedAt)
       + ",\"clockSynced\":" + (e.clockSynced ? "true" : "false") + "}";
}

bool EventQueue::parse(const std::string& line, QueuedEvent& out) {
  std::string uuid, activityId, startedAt, endedAt, clockSynced;
  if (!field(line, "uuid", uuid)) return false;
  if (!field(line, "activityId", activityId)) return false;
  if (!field(line, "startedAt", startedAt)) return false;
  if (!field(line, "endedAt", endedAt)) return false;
  if (!field(line, "clockSynced", clockSynced)) return false;
  out.uuid = uuid;
  out.activityId = std::atoi(activityId.c_str());
  out.startedAt = std::strtoull(startedAt.c_str(), nullptr, 10);
  out.endedAt = std::strtoull(endedAt.c_str(), nullptr, 10);
  out.clockSynced = clockSynced == "true";
  return true;
}

void EventQueue::append(const QueuedEvent& event) {
  storage_.append(PATH, serialise(event));
}

std::vector<QueuedEvent> EventQueue::pending() {
  std::vector<QueuedEvent> out;
  for (const auto& line : storage_.readLines(PATH)) {
    QueuedEvent event;
    // A torn final line fails to parse and is skipped. This is the power-cut case.
    if (parse(line, event)) out.push_back(event);
  }
  return out;
}

void EventQueue::prune(const std::vector<std::string>& uuids) {
  if (uuids.empty()) return;
  std::string rewritten;
  for (const auto& event : pending()) {
    if (std::find(uuids.begin(), uuids.end(), event.uuid) == uuids.end()) {
      rewritten += serialise(event) + "\n";
    }
  }
  storage_.write(PATH, rewritten);
}

size_t EventQueue::size() { return pending().size(); }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm firmware:test -f test_queue`
Expected: PASS, 4 tests.

- [ ] **Step 7: Commit**

```bash
git add packages/firmware
git commit -m "feat(firmware): append-only ndjson event queue"
```

---

### Task 11: Session state machine

**Files:**
- Create: `packages/firmware/include/session_machine.h`, `packages/firmware/src/session_machine.cpp`, `packages/firmware/test/fake_clock.h`, `packages/firmware/test/fake_renderer.h`, `packages/firmware/test/fake_random.h`
- Modify: `packages/firmware/include/ports.h` (add the `Random` port)
- Test: `packages/firmware/test/test_session_machine/test_session_machine.cpp`

**Interfaces:**
- Consumes: `Carousel` (Task 9), `EventQueue` (Task 10), `Clock`/`Storage`/`Renderer` (Task 8).
- Produces:
  - `enum class Input { SunShort, SunLong, PowerShort, PowerLong, Tick }`
  - `std::string uuidV4(Random&)` — RFC 9562 version 4, 32 random bits per `next()` call
  - `class SessionMachine { SessionMachine(Carousel&, EventQueue&, Clock&, Storage&, Renderer&, Random&); ... }`
  - `SessionMachine::begin()`, `handle(Input)`, `screen() const`

Crash recovery is the subtle part: `begin()` finds an open-session marker left by a power cut and closes the session at its last heartbeat.

**The session uuid is minted at START and stored in the marker.** Both a normal stop and a
crash recovery use that same uuid. A power cut after the event reached the queue but before
the marker was cleared makes recovery append the session a second time; because it carries
the same `device_uuid`, the server deduplicates it instead of storing a duplicate session.
Marker format: `activityId startedAt heartbeat uuid`.

**A failed queue append must not lose the session.** `EventQueue::append` returns `bool`
(Task 10). If it returns false (SD card unseated or full), `stopSession` keeps the marker
and stays `Running`; the user can reseat the card and press stop again.

- [ ] **Step 1: Add the Random port and write the fakes**

Append to `packages/firmware/include/ports.h` (Task 8 created the file; this adds one
port). Session ids need real entropy: the server silently keeps only the first row for
a repeated `device_uuid`, so a collision loses a session.

```cpp
class Random {
public:
  virtual ~Random() = default;
  virtual uint32_t next() = 0;
};
```

`packages/firmware/test/fake_clock.h`:
```cpp
#pragma once
#include "ports.h"

class FakeClock : public Clock {
public:
  uint64_t now = 1758100000ULL;
  uint64_t nowEpochSeconds() override { return now; }
  void setEpochSeconds(uint64_t seconds) override { now = seconds; }
};
```

`packages/firmware/test/fake_random.h` — a deterministic xorshift, so tests are repeatable
but consecutive values differ:

```cpp
#pragma once
#include "ports.h"

class FakeRandom : public Random {
public:
  uint32_t state = 0x12345678u;
  uint32_t next() override {
    state ^= state << 13;
    state ^= state >> 17;
    state ^= state << 5;
    return state;
  }
};
```

`packages/firmware/test/fake_renderer.h`:
```cpp
#pragma once
#include <vector>
#include "renderer.h"

class FakeRenderer : public Renderer {
public:
  std::vector<ViewModel> frames;
  void render(const ViewModel& vm) override { frames.push_back(vm); }
  const ViewModel& last() const { return frames.back(); }
};
```

- [ ] **Step 2: Write the failing test**

`packages/firmware/test/test_session_machine/test_session_machine.cpp`:
```cpp
#include <unity.h>
#include "session_machine.h"
#include "../fake_storage.h"
#include "../fake_clock.h"
#include "../fake_renderer.h"
#include "../fake_random.h"

void setUp() {}
void tearDown() {}

struct Rig {
  FakeStorage storage;
  FakeClock clock;
  FakeRenderer renderer;
  Carousel carousel;
  EventQueue queue{storage};

  FakeRandom random;

  Rig() { carousel.load({ {1, "AXIOM"} }, { {10, 1, "coursework", 0} }); }

  SessionMachine machine() {
    return SessionMachine(carousel, queue, clock, storage, renderer, random);
  }
};

void test_power_short_starts_a_session() {
  Rig rig;
  auto m = rig.machine();
  m.begin();
  m.handle(Input::PowerShort);
  TEST_ASSERT_TRUE(m.screen() == Screen::Running);
  TEST_ASSERT_TRUE(rig.storage.exists("/session.open"));
}

void test_running_screen_never_shows_elapsed_time() {
  Rig rig;
  auto m = rig.machine();
  m.begin();
  m.handle(Input::PowerShort);
  rig.clock.now += 3600;
  m.handle(Input::Tick);
  TEST_ASSERT_EQUAL_INT(0, rig.renderer.last().minutes);
}

void test_second_power_short_queues_the_session_and_clears_the_marker() {
  Rig rig;
  auto m = rig.machine();
  m.begin();
  m.handle(Input::PowerShort);
  rig.clock.now += 6420;  // 1h 47m
  m.handle(Input::PowerShort);
  auto pending = rig.queue.pending();
  TEST_ASSERT_EQUAL_INT(1, (int)pending.size());
  TEST_ASSERT_EQUAL_INT(10, pending[0].activityId);
  TEST_ASSERT_EQUAL_UINT64(6420, pending[0].endedAt - pending[0].startedAt);
  TEST_ASSERT_FALSE(rig.storage.exists("/session.open"));
}

void test_stopped_screen_shows_the_duration_once() {
  Rig rig;
  auto m = rig.machine();
  m.begin();
  m.handle(Input::PowerShort);
  rig.clock.now += 6420;
  m.handle(Input::PowerShort);
  TEST_ASSERT_TRUE(m.screen() == Screen::Stopped);
  TEST_ASSERT_EQUAL_INT(107, rig.renderer.last().minutes);
}

void test_sun_presses_are_ignored_while_running() {
  Rig rig;
  auto m = rig.machine();
  m.begin();
  m.handle(Input::PowerShort);
  m.handle(Input::SunShort);
  TEST_ASSERT_TRUE(m.screen() == Screen::Running);
}

void test_power_cut_mid_session_recovers_at_the_last_heartbeat() {
  Rig rig;
  {
    auto m = rig.machine();
    m.begin();
    m.handle(Input::PowerShort);
    rig.clock.now += 300;
    m.handle(Input::Tick);   // writes a heartbeat
    rig.clock.now += 120;    // two more minutes, then the battery dies
  }
  auto recovered = rig.machine();
  recovered.begin();
  auto pending = rig.queue.pending();
  TEST_ASSERT_EQUAL_INT(1, (int)pending.size());
  TEST_ASSERT_EQUAL_UINT64(300, pending[0].endedAt - pending[0].startedAt);
  TEST_ASSERT_FALSE(rig.storage.exists("/session.open"));
  TEST_ASSERT_TRUE(recovered.screen() == Screen::Idle);
}

void test_uuid_is_rfc9562_version_4() {
  FakeRandom random;
  const std::string id = uuidV4(random);
  TEST_ASSERT_EQUAL_INT(36, (int)id.size());
  TEST_ASSERT_EQUAL_CHAR('-', id[8]);
  TEST_ASSERT_EQUAL_CHAR('-', id[13]);
  TEST_ASSERT_EQUAL_CHAR('-', id[18]);
  TEST_ASSERT_EQUAL_CHAR('-', id[23]);
  TEST_ASSERT_EQUAL_CHAR('4', id[14]);
  TEST_ASSERT_TRUE(id[19] == '8' || id[19] == '9' || id[19] == 'a' || id[19] == 'b');
}

void test_consecutive_uuids_differ_even_within_the_same_second() {
  // The clock never advances here. The server silently keeps only the first row
  // for a repeated device_uuid, so a collision would lose a session.
  Rig rig;
  auto m = rig.machine();
  m.begin();
  m.handle(Input::PowerShort);
  m.handle(Input::PowerShort);
  m.handle(Input::SunShort);   // leave Stopped
  m.handle(Input::PowerShort);
  m.handle(Input::PowerShort);
  auto pending = rig.queue.pending();
  TEST_ASSERT_EQUAL_INT(2, (int)pending.size());
  TEST_ASSERT_FALSE(pending[0].uuid == pending[1].uuid);
}

class FailingAppendStorage : public FakeStorage {
public:
  bool append(const std::string& path, const std::string& line) override {
    if (path == "/queue.ndjson") return false;
    return FakeStorage::append(path, line);
  }
};

void test_failed_queue_append_keeps_the_session_running() {
  FailingAppendStorage storage;
  FakeClock clock;
  FakeRenderer renderer;
  FakeRandom random;
  Carousel carousel;
  carousel.load({ {1, "AXIOM"} }, { {10, 1, "coursework", 0} });
  EventQueue queue(storage);
  SessionMachine m(carousel, queue, clock, storage, renderer, random);
  m.begin();
  m.handle(Input::PowerShort);
  clock.now += 600;
  m.handle(Input::PowerShort);
  TEST_ASSERT_TRUE(m.screen() == Screen::Running);
  TEST_ASSERT_TRUE(storage.exists("/session.open"));
}

void test_recovery_reuses_the_uuid_minted_at_start() {
  Rig rig;
  std::string markerUuid;
  {
    auto m = rig.machine();
    m.begin();
    m.handle(Input::PowerShort);
    const auto line = rig.storage.readLines("/session.open")[0];
    markerUuid = line.substr(line.rfind(' ') + 1);
    rig.clock.now += 300;
    m.handle(Input::Tick);
  }
  auto recovered = rig.machine();
  recovered.begin();
  auto pending = rig.queue.pending();
  TEST_ASSERT_EQUAL_INT(1, (int)pending.size());
  TEST_ASSERT_EQUAL_STRING(markerUuid.c_str(), pending[0].uuid.c_str());
}

void test_normal_stop_uses_the_uuid_minted_at_start() {
  Rig rig;
  auto m = rig.machine();
  m.begin();
  m.handle(Input::PowerShort);
  const auto line = rig.storage.readLines("/session.open")[0];
  const std::string markerUuid = line.substr(line.rfind(' ') + 1);
  rig.clock.now += 60;
  m.handle(Input::PowerShort);
  TEST_ASSERT_EQUAL_STRING(markerUuid.c_str(), rig.queue.pending()[0].uuid.c_str());
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_failed_queue_append_keeps_the_session_running);
  RUN_TEST(test_recovery_reuses_the_uuid_minted_at_start);
  RUN_TEST(test_normal_stop_uses_the_uuid_minted_at_start);
  RUN_TEST(test_uuid_is_rfc9562_version_4);
  RUN_TEST(test_consecutive_uuids_differ_even_within_the_same_second);
  RUN_TEST(test_power_short_starts_a_session);
  RUN_TEST(test_running_screen_never_shows_elapsed_time);
  RUN_TEST(test_second_power_short_queues_the_session_and_clears_the_marker);
  RUN_TEST(test_stopped_screen_shows_the_duration_once);
  RUN_TEST(test_sun_presses_are_ignored_while_running);
  RUN_TEST(test_power_cut_mid_session_recovers_at_the_last_heartbeat);
  return UNITY_END();
}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm firmware:test -f test_session_machine`
Expected: FAIL, `session_machine.h` not found.

- [ ] **Step 4: Write the header**

`packages/firmware/include/session_machine.h`:
```cpp
#pragma once
#include <cstdint>
#include <string>
#include "carousel.h"
#include "queue.h"
#include "ports.h"
#include "renderer.h"
#include "view_model.h"

enum class Input { SunShort, SunLong, PowerShort, PowerLong, Tick };

std::string uuidV4(Random& random);

class SessionMachine {
public:
  SessionMachine(Carousel& carousel, EventQueue& queue, Clock& clock,
                 Storage& storage, Renderer& renderer, Random& random);

  void begin();
  void handle(Input input);
  Screen screen() const { return screen_; }

private:
  void draw(int minutes = 0);
  void startSession();
  void stopSession();
  void writeMarker(uint64_t heartbeat);
  void recoverMarker();

  static constexpr const char* MARKER = "/session.open";
  static constexpr uint64_t HEARTBEAT_SECONDS = 300;

  Carousel& carousel_;
  EventQueue& queue_;
  Clock& clock_;
  Storage& storage_;
  Renderer& renderer_;
  Random& random_;

  Screen screen_ = Screen::Idle;
  int activityId_ = 0;
  std::string sessionUuid_;
  uint64_t startedAt_ = 0;
  uint64_t lastHeartbeat_ = 0;
};
```

- [ ] **Step 5: Write the implementation**

`packages/firmware/src/session_machine.cpp`:
```cpp
#include "session_machine.h"
#include <cstdio>
#include <cstdlib>

// Entropy comes from the Random port: esp_random() on the device, a deterministic
// fake in tests. Never seed from the clock: two sessions ending in the same second
// would get the same id, and the server silently keeps only the first.
std::string uuidV4(Random& random) {
  static const char* HEX = "0123456789abcdef";
  uint8_t bytes[16];
  for (int i = 0; i < 16; i += 4) {
    const uint32_t r = random.next();
    bytes[i] = r & 0xFF;
    bytes[i + 1] = (r >> 8) & 0xFF;
    bytes[i + 2] = (r >> 16) & 0xFF;
    bytes[i + 3] = (r >> 24) & 0xFF;
  }
  bytes[6] = (bytes[6] & 0x0F) | 0x40;  // version 4
  bytes[8] = (bytes[8] & 0x3F) | 0x80;  // RFC 9562 variant
  std::string out;
  out.reserve(36);
  for (int i = 0; i < 16; ++i) {
    if (i == 4 || i == 6 || i == 8 || i == 10) out += '-';
    out += HEX[bytes[i] >> 4];
    out += HEX[bytes[i] & 0x0F];
  }
  return out;
}

SessionMachine::SessionMachine(Carousel& carousel, EventQueue& queue, Clock& clock,
                               Storage& storage, Renderer& renderer, Random& random)
  : carousel_(carousel), queue_(queue), clock_(clock),
    storage_(storage), renderer_(renderer), random_(random) {}

void SessionMachine::begin() {
  recoverMarker();
  screen_ = Screen::Idle;
  draw();
}

void SessionMachine::recoverMarker() {
  if (!storage_.exists(MARKER)) return;
  const auto lines = storage_.readLines(MARKER);
  if (lines.empty()) { storage_.remove(MARKER); return; }

  int activityId = 0;
  unsigned long long startedAt = 0, heartbeat = 0;
  char uuid[37] = {0};
  if (std::sscanf(lines[0].c_str(), "%d %llu %llu %36s",
                  &activityId, &startedAt, &heartbeat, uuid) == 4 && heartbeat > startedAt) {
    // Reuse the uuid minted at start: if this session already reached the queue before
    // the power cut, the server sees the same device_uuid and deduplicates it.
    if (!queue_.append({ std::string(uuid), activityId,
                         static_cast<uint64_t>(startedAt),
                         static_cast<uint64_t>(heartbeat), true })) {
      return;  // keep the marker; try again on the next boot
    }
  }
  storage_.remove(MARKER);
}

void SessionMachine::writeMarker(uint64_t heartbeat) {
  char line[128];
  std::snprintf(line, sizeof(line), "%d %llu %llu %s",
                activityId_,
                static_cast<unsigned long long>(startedAt_),
                static_cast<unsigned long long>(heartbeat),
                sessionUuid_.c_str());
  storage_.write(MARKER, std::string(line) + "\n");
  lastHeartbeat_ = heartbeat;
}

void SessionMachine::startSession() {
  activityId_ = carousel_.currentActivityId();
  if (activityId_ == 0) return;
  sessionUuid_ = uuidV4(random_);
  startedAt_ = clock_.nowEpochSeconds();
  writeMarker(startedAt_);
  screen_ = Screen::Running;
  draw();
}

void SessionMachine::stopSession() {
  const uint64_t endedAt = clock_.nowEpochSeconds();
  if (!queue_.append({ sessionUuid_, activityId_, startedAt_, endedAt, true })) {
    draw();  // stay Running with the marker intact; nothing is lost
    return;
  }
  storage_.remove(MARKER);
  screen_ = Screen::Stopped;
  draw(static_cast<int>((endedAt - startedAt_) / 60));
}

void SessionMachine::handle(Input input) {
  switch (screen_) {
    case Screen::Idle:
      if (input == Input::SunShort) { carousel_.nextActivity(); draw(); }
      else if (input == Input::SunLong) { carousel_.nextFolder(); draw(); }
      else if (input == Input::PowerShort) { startSession(); }
      break;

    case Screen::Running:
      // Sun is deliberately inert while running. Changing activity mid-session
      // would make the logged block a lie.
      if (input == Input::PowerShort) { stopSession(); }
      else if (input == Input::Tick) {
        const uint64_t now = clock_.nowEpochSeconds();
        if (now - lastHeartbeat_ >= HEARTBEAT_SECONDS) writeMarker(now);
        draw();
      }
      break;

    case Screen::Stopped:
      if (input == Input::PowerShort || input == Input::SunShort || input == Input::Tick) {
        screen_ = Screen::Idle;
        draw();
      }
      break;

    case Screen::Syncing:
      break;
  }
}

void SessionMachine::draw(int minutes) {
  ViewModel vm;
  carousel_.fill(vm);
  vm.screen = screen_;
  // Running never carries elapsed time. Design decision, not an omission.
  vm.minutes = (screen_ == Screen::Stopped) ? minutes : 0;
  renderer_.render(vm);
}
```

- [ ] **Step 6: Run the whole host suite**

Run: `pnpm firmware:test`
Expected: PASS, 29 tests across the four suites (1 ports + 7 carousel + 10 queue + 11 session machine).

- [ ] **Step 7: Commit**

```bash
git add packages/firmware
git commit -m "feat(firmware): session state machine with crash recovery"
```

---

### Task 12: Device adapters and main loop

**Files:**
- Create: `packages/firmware/secrets.example.h`, `packages/firmware/src/device/esp_random.h`, `packages/firmware/src/device/buttons.h`, `packages/firmware/src/device/sd_storage.h`, `packages/firmware/src/device/rtc_clock.h`, `packages/firmware/src/device/rtc_clock.cpp`, `packages/firmware/src/device/eink_renderer.h`, `packages/firmware/src/device/eink_renderer.cpp`, `packages/firmware/src/device/sync_client.h`, `packages/firmware/src/device/sync_client.cpp`, `packages/firmware/src/config_store.h`, `packages/firmware/src/config_store.cpp`, `packages/firmware/src/main.cpp`

**Interfaces:**
- Consumes: everything from Tasks 8 to 11.
- Produces: a flashable firmware.

No new logic. These are adapters implementing the ports against real hardware. Nothing here is host tested, which is exactly why nothing here may contain logic. If you find yourself writing a branch that is not about hardware, it belongs in a tested class instead.

**Pins are verified against Waveshare's own code**, not guessed:
`github.com/waveshareteam/ESP32-S3-ePaper-1.54`, `02_Example/Arduino/*/user_config.h`,
`04_SD_Card/sdcard_bsp.cpp`, `07_BATT_PWR_Test/src/power/board_power_bsp.cpp` and
`src/button_bsp/button_bsp.c`. Four facts there contradict earlier assumptions and are
load-bearing:

1. **The SD card is SDMMC 1-bit, not SPI.** CLK 39, CMD 41, D0 40. Arduino's `SD.h` is the
   SPI driver and would never mount it. Use `SD_MMC` (same `File` API).
2. **E-paper BUSY is HIGH while busy, LOW when idle.** This is the normal SSD1681 behaviour and
   GxEPD2's default. An earlier note said "idle HIGH"; that was the 1.54G colour variant.
3. **Panel power (GPIO6) must be driven LOW before the display is touched.** Nothing drives it
   by default, and without it the panel is unpowered.
4. **The POWER button is still held when the firmware boots**, because holding it is how the
   board powers on. Its first release must be ignored, or it registers as a long press and
   powers the device straight back off. Waveshare's own example guards this the same way.

- [ ] **Step 1: Write the secrets template**

`packages/firmware/secrets.example.h`:
```cpp
#pragma once
// Copy to secrets.h and fill in. secrets.h is gitignored. Never commit it.
#define WIFI_SSID        "your-hotspot"
#define WIFI_PASSWORD    "your-password"
#define SYNC_URL         "https://aura.amygdala-inc.org/api/v1/sync"
#define CF_ACCESS_ID     "xxxxxxxx.access"
#define CF_ACCESS_SECRET "xxxxxxxx"
#define DEVICE_ID        "aura-1"
```

- [ ] **Step 2: Write the pin map and button reader**

`packages/firmware/src/device/buttons.h`:
```cpp
#pragma once
#include <Arduino.h>
#include "session_machine.h"

// Waveshare ESP32-S3-ePaper-1.54. Both PWR and BOOT are user-programmable.
// GPIO0 is a strapping pin: never require it held during power-on.
constexpr int PIN_POWER_BTN   = 18;  // active LOW
constexpr int PIN_POWER_HOLD  = 17;  // HIGH keeps the board powered
constexpr int PIN_SUN_BTN     = 0;   // BOOT, active LOW
constexpr int PIN_PANEL_POWER = 6;   // LOW powers the panel
constexpr int PIN_EPD_BUSY    = 8;   // HIGH while busy, LOW when idle
constexpr int PIN_EPD_RST     = 9;
constexpr int PIN_EPD_DC      = 10;
constexpr int PIN_EPD_CS      = 11;
constexpr int PIN_EPD_SCK     = 12;
constexpr int PIN_EPD_MOSI    = 13;
constexpr int PIN_SD_CLK      = 39;  // SDMMC 1-bit, not SPI
constexpr int PIN_SD_D0       = 40;
constexpr int PIN_SD_CMD      = 41;
constexpr int PIN_I2C_SDA     = 47;
constexpr int PIN_I2C_SCL     = 48;

constexpr unsigned long LONG_PRESS_MS = 700;

class Buttons {
public:
  void begin() {
    pinMode(PIN_POWER_HOLD, OUTPUT);
    digitalWrite(PIN_POWER_HOLD, HIGH);  // latch power on, first thing
    pinMode(PIN_POWER_BTN, INPUT_PULLUP);
    pinMode(PIN_SUN_BTN, INPUT_PULLUP);
    // Holding POWER is how the board turns on, so it is usually still held here.
    // Ignore POWER until it has been seen released once, or that release would
    // register as a long press and switch the device straight back off.
    pwrArmed_ = digitalRead(PIN_POWER_BTN) == HIGH;
  }

  bool poll(Input& out) {
    if (!pwrArmed_ && digitalRead(PIN_POWER_BTN) == HIGH) pwrArmed_ = true;
    if (read(PIN_SUN_BTN, sunDown_, sunAt_, Input::SunShort, Input::SunLong, out)) return true;
    return pwrArmed_ && read(PIN_POWER_BTN, pwrDown_, pwrAt_, Input::PowerShort, Input::PowerLong, out);
  }

  static void powerOff() { digitalWrite(PIN_POWER_HOLD, LOW); }

private:
  bool read(int pin, bool& down, unsigned long& at,
            Input shortPress, Input longPress, Input& out) {
    const bool pressed = digitalRead(pin) == LOW;
    const unsigned long now = millis();
    if (pressed && !down) { down = true; at = now; return false; }
    if (!pressed && down) {
      down = false;
      out = (now - at >= LONG_PRESS_MS) ? longPress : shortPress;
      return true;
    }
    return false;
  }

  bool sunDown_ = false, pwrDown_ = false;
  bool pwrArmed_ = false;
  unsigned long sunAt_ = 0, pwrAt_ = 0;
};
```

- [ ] **Step 3: Write the hardware random adapter**

`packages/firmware/src/device/esp_random.h`:

```cpp
#pragma once
#include <esp_random.h>
#include "ports.h"

// Hardware RNG. Never seeded from the clock.
class EspRandom : public Random {
public:
  uint32_t next() override { return esp_random(); }
};
```

- [ ] **Step 3b: Write the SD storage adapter**

`packages/firmware/src/device/sd_storage.h`:
```cpp
#pragma once
#include <SD_MMC.h>
#include "ports.h"

// The card is wired for SDMMC 1-bit (CLK 39, CMD 41, D0 40). SD.h is the SPI driver and
// would never mount it.
// Contract: readLines returns lines WITHOUT terminators. arduino-esp32's println writes
// "\r\n"; never use it here. A stray '\r' makes every acked uuid fail to match, so the
// queue never drains and, past 200 events, never syncs again.
class SdStorage : public Storage {
public:
  bool append(const std::string& path, const std::string& line) override {
    File f = SD_MMC.open(path.c_str(), FILE_APPEND);
    if (!f) return false;
    // A full card opens fine and then writes nothing. Returning true there would let
    // stopSession delete the marker and lose the session, so check the byte count.
    const size_t want = line.size() + 1;
    size_t wrote = f.print(line.c_str());
    wrote += f.print('\n');
    f.close();
    return wrote == want;
  }
  std::vector<std::string> readLines(const std::string& path) override {
    std::vector<std::string> out;
    File f = SD_MMC.open(path.c_str(), FILE_READ);
    if (!f) return out;
    while (f.available()) {
      String line = f.readStringUntil('\n');
      if (line.endsWith("\r")) line.remove(line.length() - 1);  // card may be edited on a PC
      if (line.length() > 0) out.push_back(std::string(line.c_str()));
    }
    f.close();
    return out;
  }
  bool write(const std::string& path, const std::string& content) override {
    File f = SD_MMC.open(path.c_str(), FILE_WRITE);
    if (!f) return false;
    const size_t wrote = f.print(content.c_str());
    f.close();
    return wrote == content.size();
  }
  bool remove(const std::string& path) override { return SD_MMC.remove(path.c_str()); }
  bool exists(const std::string& path) override { return SD_MMC.exists(path.c_str()); }
};
```

- [ ] **Step 4: Write the RTC adapter**

`packages/firmware/src/device/rtc_clock.h`:
```cpp
#pragma once
#include <cstdint>
#include "ports.h"

// PCF85063 on the shared I2C bus at 0x51. Battery backed, so it survives
// reboots and holds real wall-clock time through weeks offline.
class RtcClock : public Clock {
public:
  bool begin();
  uint64_t nowEpochSeconds() override;
  void setEpochSeconds(uint64_t seconds) override;

private:
  static constexpr uint8_t ADDRESS = 0x51;
  static constexpr uint8_t REG_SECONDS = 0x04;
  static uint8_t bcdToDec(uint8_t v) { return (v >> 4) * 10 + (v & 0x0F); }
  static uint8_t decToBcd(uint8_t v) { return ((v / 10) << 4) | (v % 10); }
};
```

In `rtc_clock.cpp`, implement against the PCF85063 register map. `begin()` returns whether the device ACKs at `0x51`. `nowEpochSeconds()` reads seven bytes from `REG_SECONDS` (seconds, minutes, hours, days, weekdays, months, years), masks the reserved bits (seconds `& 0x7F`, minutes `& 0x7F`, hours `& 0x3F`, days `& 0x3F`, months `& 0x1F`), converts each from BCD, fills a `struct tm` with `tm_year = 100 + years` and `tm_mon = months - 1`, and returns `timegm(&tm)`. `setEpochSeconds()` reverses this with `gmtime_r` and `decToBcd`, writing seven bytes back from `REG_SECONDS`.

- [ ] **Step 5: Write the e-ink renderer**

`packages/firmware/src/device/eink_renderer.h`:
```cpp
#pragma once
#include "renderer.h"

// Throwaway prototype layout. Phase 4 replaces this class, and only this class.
class EinkRenderer : public Renderer {
public:
  void begin();
  void render(const ViewModel& vm) override;

private:
  void drawIdle(const ViewModel& vm);
  void drawRunning(const ViewModel& vm);
  void drawStopped(const ViewModel& vm);

  static constexpr int PARTIALS_BEFORE_FULL = 20;
  int partials_ = 0;
  int lastFolderIndex_ = -1;
};
```

In `eink_renderer.cpp`, instantiate `GxEPD2_BW<GxEPD2_154_D67, GxEPD2_154_D67::HEIGHT>` (SSD1681, 200x200) with `GxEPD2_154_D67(PIN_EPD_CS, PIN_EPD_DC, PIN_EPD_RST, PIN_EPD_BUSY)`, and call `SPI.begin(PIN_EPD_SCK, -1, PIN_EPD_MOSI, PIN_EPD_CS)` before `display.init()`: the panel is not on the default SPI pins. `begin()` must first drive `PIN_PANEL_POWER` LOW (panel on) and wait about 10 ms. BUSY is HIGH while busy, which is GxEPD2's default for this panel; do not invert it. Draw the three layouts from spec section 6 of the design doc. Use `display.setPartialWindow` for cursor movement within a folder. Force a full refresh when `vm.folderIndex != lastFolderIndex_` or `partials_ >= PARTIALS_BEFORE_FULL`, resetting `partials_` to zero. Never draw elapsed time on the `Running` screen: `vm.minutes` is zero there by contract and must stay unused.

- [ ] **Step 6: Write the config store**

`packages/firmware/src/config_store.h`:
```cpp
#pragma once
#include "carousel.h"
#include "ports.h"

// Reads /config.json into the carousel. On a missing or unparseable file it
// loads nothing and leaves version at 0, so the next sync pulls a fresh config.
void loadConfigFromSd(Storage& storage, Carousel& carousel, int& version);
void saveConfigToSd(Storage& storage, const std::string& json);
```

Implement `config_store.cpp` with ArduinoJson: parse `/config.json`, build `std::vector<FolderEntry>` and `std::vector<ActivityEntry>` (converting each activity's ISO `lastUsedAt` to epoch seconds, using 0 for null), then call `carousel.load(...)` and set `version` from the document's `version` field.

- [ ] **Step 7: Write the sync client**

`packages/firmware/src/device/sync_client.h`:
```cpp
#pragma once
#include <string>
#include <vector>
#include "carousel.h"
#include "ports.h"
#include "queue.h"

class SyncClient {
public:
  SyncClient(EventQueue& queue, Clock& clock, Storage& storage)
    : queue_(queue), clock_(clock), storage_(storage) {}

  // Brings wifi up, performs exactly one request, brings wifi down.
  // Returns true on a 200. On any failure it touches nothing.
  bool run(int& configVersion, Carousel& carousel);

private:
  EventQueue& queue_;
  Clock& clock_;
  Storage& storage_;
};
```

In `sync_client.cpp`: connect with a 15-second timeout and return false on failure. Build the body as `{"deviceId":DEVICE_ID,"configVersion":N,"events":[...]}` using `EventQueue::serialise` for **at most the first 200** pending events. The server's `syncRequestSchema` caps `events` at 200; sending more gets a 400 on every attempt, forever, and nothing ever syncs again. The append-only queue copes with a partial drain, and the next sync takes the rest. POST with `WiFiClientSecure` and both `CF-Access-Client-Id` and `CF-Access-Client-Secret` headers. On a 200, parse with ArduinoJson, then:

1. `queue_.prune(settled)` where `settled` is `acked` concatenated with `rejected` — both are permanently decided and must leave the queue.
2. `clock_.setEpochSeconds(parsed serverTime)`.
3. If `config` is present, `saveConfigToSd` and reload the carousel, updating `configVersion`.

Always call `WiFi.disconnect(true)` and `WiFi.mode(WIFI_OFF)` before returning, on every path. The radio is the largest battery cost in the system.

Call `bootloader_random_disable()` before `WiFi.begin()` and `bootloader_random_enable()` after the radio is off, on every path. The bootloader entropy source conflicts with Wi-Fi and the ADC; outside sync it must stay on so session uuids stay truly random.

- [ ] **Step 8: Write main.cpp**

`packages/firmware/src/main.cpp`:
```cpp
#include <Arduino.h>
#include <SD_MMC.h>
#include <Wire.h>
#include <bootloader_random.h>
#include "secrets.h"
#include "carousel.h"
#include "config_store.h"
#include "queue.h"
#include "session_machine.h"
#include "device/buttons.h"
#include "device/eink_renderer.h"
#include "device/rtc_clock.h"
#include "device/sd_storage.h"
#include "device/sync_client.h"
#include "device/esp_random.h"

static SdStorage storage;
static RtcClock rtc;
static EinkRenderer renderer;
static Buttons buttons;
static Carousel carousel;
static EventQueue queue(storage);
static EspRandom random_;
static SessionMachine machine(carousel, queue, rtc, storage, renderer, random_);
static SyncClient sync(queue, rtc, storage);

static int configVersion = 0;
static unsigned long lastTick = 0;
static unsigned long lastSync = 0;

constexpr unsigned long TICK_MS = 1000;
constexpr unsigned long SYNC_INTERVAL_MS = 6UL * 60 * 60 * 1000;

void setup() {
  // esp_random() is only a true RNG while RF or the bootloader entropy source is on.
  // Session uuids are minted at button presses with the radio OFF, so keep the entropy
  // source on except during sync; SyncClient disables it before WiFi.begin() and
  // re-enables it after WiFi is off. Verify against Espressif's esp_random docs.
  bootloader_random_enable();
  buttons.begin();
  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
  rtc.begin();
  SD_MMC.setPins(PIN_SD_CLK, PIN_SD_CMD, PIN_SD_D0);
  SD_MMC.begin("/sdcard", true);  // true = 1-bit mode, as the board is wired
  renderer.begin();
  loadConfigFromSd(storage, carousel, configVersion);
  machine.begin();
  sync.run(configVersion, carousel);
}

void loop() {
  Input input;
  if (buttons.poll(input)) {
    if (input == Input::PowerLong) {
      // Let the machine write a final heartbeat first: a running session then
      // survives power-off to the second instead of losing up to 5 minutes.
      machine.handle(input);
      Buttons::powerOff();
      return;
    }
    machine.handle(input);
    if (machine.screen() == Screen::Stopped) {
      sync.run(configVersion, carousel);
      lastSync = millis();
    }
  }

  const unsigned long now = millis();
  if (now - lastTick >= TICK_MS) { lastTick = now; machine.handle(Input::Tick); }
  // Never sync mid-session: sync sets the RTC, and moving the clock under a running
  // session can make endedAt < startedAt. Stopping triggers a sync anyway.
  if (now - lastSync >= SYNC_INTERVAL_MS && machine.screen() != Screen::Running) {
    lastSync = now;
    sync.run(configVersion, carousel);
  }
}
```

- [ ] **Step 9: Log the module variant at boot**

The board ships in two module variants under the same product name. The design targets the lower one; this confirms which you actually have without blocking anything. Add to `setup()`, after `renderer.begin()`:

```cpp
  Serial.begin(115200);
  Serial.printf("flash=%luMB psram=%luKB
",
                (unsigned long)(ESP.getFlashChipSize() / (1024 * 1024)),
                (unsigned long)(ESP.getPsramSize() / 1024));
```

Expected on the serial monitor at 115200: either `flash=4MB psram=2048KB` or `flash=8MB psram=8192KB`. Both are supported. Record which one in `docs/verification.md` during Task 13.

- [ ] **Step 10: Verify it builds and the host tests still pass**

Run: `cd packages/firmware && cp secrets.example.h secrets.h && python -m platformio run -e aura1 && cd ../.. && pnpm firmware:test`
Expected: the `aura1` build succeeds, and all 29 native tests still pass.

- [ ] **Step 11: Commit**

```bash
git add packages/firmware
git commit -m "feat(firmware): hardware adapters and main loop"
```

---

### Task 13: End-to-end verification

**Files:**
- Create: `docs/verification.md`

**Interfaces:**
- Consumes: everything.
- Produces: written evidence the slice works.

No code. Run each check, paste the real output into `docs/verification.md`, and do not tick a box until you have seen it pass. A claim without output is not a pass.

- [ ] **Step 1: Full test suite**

Run: `pnpm db:up && pnpm test` then `pnpm firmware:test`
Record the actual pass counts.

- [ ] **Step 2: Flash and configure**

(Device steps below run wherever the AURA-1 is plugged in; the backend is already live on the Pi from Task 6.)

Copy `secrets.example.h` to `secrets.h`, fill in the real wifi credentials, service token and device id. Run `python -m platformio run -e aura1 -t upload`.
Expected: the device boots to the IDLE screen showing `AXIOM` and its activities.

- [ ] **Step 3: Offline durability**

Turn your hotspot off. Log three short sessions across two folders. Power the device off with a long POWER press, then back on.
Expected: `/queue.ndjson` on the SD card holds three lines and the device shows IDLE. Nothing lost across the power cycle.

- [ ] **Step 4: Sync**

Turn the hotspot on and end a session to trigger a sync.
Expected: all three sessions appear at `https://aura.amygdala-inc.org`, grouped under the correct day with correct times. `/queue.ndjson` is now empty.

- [ ] **Step 5: Idempotency under a real failure**

Start a session, end it, and kill the hotspot mid-sync so the response is lost. Restore the hotspot and let it sync again.
Expected: exactly one row on the dashboard, not two. This is the whole point of the slice.

- [ ] **Step 6: Crash recovery**

Start a session. Wait six minutes so at least one heartbeat is written. Disconnect power abruptly. Power back on.
Expected: the device boots to IDLE and a session of roughly five to six minutes is queued.

- [ ] **Step 7: Access gate**

Run the unauthenticated curl from Task 6 Step 4 again.
Expected: `302` or `403`. If the API answers, stop and fix the policy.

- [ ] **Step 8: Commit**

```bash
git add docs/verification.md
git commit -m "docs: record vertical slice end-to-end verification"
```

---

## What this slice deliberately leaves undone

Habits, quotes, calendar, XP, decay, skins, manual backfill, the RITES / ORACLE / VESSEL carousel places, all Kael'thos artwork, the design system, and audio. Each has a phase in the masterplan. Do not pull any of them forward.
