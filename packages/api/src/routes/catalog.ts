import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from '@fastify/type-provider-zod';
import { z } from 'zod';
import { asc, eq, gt, lt, desc, max } from 'drizzle-orm';
import type { Db } from '../db/client.ts';
import { activities, folders } from '../db/schema.ts';
import { bumpConfigVersion } from '../db/config-version.ts';
import { resurrectionId } from '../db/resurrection.ts';

// The device shows 10 characters of a folder title and 15 of an activity.
const folderName = z.string().trim().min(1).max(10);
const activityName = z.string().trim().min(1).max(15);
const idParams = z.object({ id: z.coerce.number().int().positive() });

const activityDto = z.object({
  id: z.number().int(),
  name: z.string(),
  archived: z.boolean(),
});
const folderDto = z.object({
  id: z.number().int(),
  name: z.string(),
  archived: z.boolean(),
  activities: z.array(activityDto),
});

export const catalogRoutes: FastifyPluginAsync<{ db: Db }> = async (app, opts) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db } = opts;

  // The ritual's system folder is not the user's to manage.
  r.get('/folders', { schema: { response: { 200: z.array(folderDto) } } }, async () => {
    const ritual = await resurrectionId(db);
    const [folderRows, activityRows] = await Promise.all([
      db.select().from(folders).orderBy(asc(folders.sortOrder)),
      db.select().from(activities).orderBy(asc(activities.createdAt), asc(activities.id)),
    ]);
    const system = activityRows.find((a) => a.id === ritual)?.folderId;
    return folderRows.filter((f) => f.id !== system).map((f) => ({
      id: f.id,
      name: f.name,
      archived: f.archivedAt !== null,
      activities: activityRows
        .filter((a) => a.folderId === f.id)
        .map((a) => ({ id: a.id, name: a.name, archived: a.archivedAt !== null })),
    }));
  });

  r.post('/folders', { schema: { body: z.object({ name: folderName }) } }, async (request, reply) => {
    await db.transaction(async (tx) => {
      const [row] = await tx.select({ top: max(folders.sortOrder) }).from(folders);
      await tx.insert(folders).values({ name: request.body.name, sortOrder: (row?.top ?? -1) + 1 });
      await bumpConfigVersion(tx);
    });
    return reply.code(201).send();
  });

  r.patch('/folders/:id', {
    schema: {
      params: idParams,
      body: z.object({ name: folderName.optional(), archived: z.boolean().optional() }),
    },
  }, async (request, reply) => {
    const { name, archived } = request.body;
    const updated = await db.transaction(async (tx) => {
      const rows = await tx.update(folders)
        .set({
          ...(name !== undefined ? { name } : {}),
          ...(archived !== undefined ? { archivedAt: archived ? new Date() : null } : {}),
        })
        .where(eq(folders.id, request.params.id))
        .returning({ id: folders.id });
      if (rows.length) await bumpConfigVersion(tx);
      return rows.length;
    });
    return reply.code(updated ? 204 : 404).send();
  });

  // Swaps the folder with its neighbour, which is all a reorder UI needs.
  r.post('/folders/:id/move', {
    schema: { params: idParams, body: z.object({ direction: z.enum(['up', 'down']) }) },
  }, async (request, reply) => {
    const moved = await db.transaction(async (tx) => {
      const [folder] = await tx.select().from(folders).where(eq(folders.id, request.params.id));
      if (!folder) return false;
      const up = request.body.direction === 'up';
      const [neighbour] = await tx.select().from(folders)
        .where(up ? lt(folders.sortOrder, folder.sortOrder) : gt(folders.sortOrder, folder.sortOrder))
        .orderBy(up ? desc(folders.sortOrder) : asc(folders.sortOrder))
        .limit(1);
      if (!neighbour) return true;
      await tx.update(folders).set({ sortOrder: neighbour.sortOrder }).where(eq(folders.id, folder.id));
      await tx.update(folders).set({ sortOrder: folder.sortOrder }).where(eq(folders.id, neighbour.id));
      await bumpConfigVersion(tx);
      return true;
    });
    return reply.code(moved ? 204 : 404).send();
  });

  r.post('/activities', {
    schema: { body: z.object({ folderId: z.number().int().positive(), name: activityName }) },
  }, async (request, reply) => {
    const created = await db.transaction(async (tx) => {
      const [folder] = await tx.select({ id: folders.id }).from(folders)
        .where(eq(folders.id, request.body.folderId));
      if (!folder) return false;
      await tx.insert(activities).values(request.body);
      await bumpConfigVersion(tx);
      return true;
    });
    return reply.code(created ? 201 : 404).send();
  });

  r.patch('/activities/:id', {
    schema: {
      params: idParams,
      body: z.object({
        name: activityName.optional(),
        folderId: z.number().int().positive().optional(),
        archived: z.boolean().optional(),
      }),
    },
  }, async (request, reply) => {
    const { name, folderId, archived } = request.body;
    const status = await db.transaction(async (tx) => {
      if (folderId !== undefined) {
        const [folder] = await tx.select({ id: folders.id }).from(folders).where(eq(folders.id, folderId));
        if (!folder) return 400;
      }
      const rows = await tx.update(activities)
        .set({
          ...(name !== undefined ? { name } : {}),
          ...(folderId !== undefined ? { folderId } : {}),
          ...(archived !== undefined ? { archivedAt: archived ? new Date() : null } : {}),
        })
        .where(eq(activities.id, request.params.id))
        .returning({ id: activities.id });
      if (!rows.length) return 404;
      await bumpConfigVersion(tx);
      return 204;
    });
    return reply.code(status).send();
  });
};
