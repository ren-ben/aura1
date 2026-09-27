import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from '@fastify/type-provider-zod';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import type { Db } from '../db/client.ts';
import { device } from '../db/schema.ts';

const deviceDto = z.object({
  lastSyncAt: z.iso.datetime().nullable(),
  battery: z.number().int().nullable(),
  millivolts: z.number().int().nullable(),
  charging: z.boolean().nullable(),
  look: z.string().nullable(),
  skin: z.string().nullable(),
  pendingLook: z.string().nullable(),
});

// The device as it last reported itself, and a look to send it.
export const deviceRoutes: FastifyPluginAsync<{ db: Db }> = async (app, opts) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db } = opts;

  r.get('/device', { schema: { response: { 200: deviceDto } } }, async () => {
    const [row] = await db.select().from(device).where(eq(device.id, 1));
    return {
      lastSyncAt: row?.lastSyncAt?.toISOString() ?? null,
      battery: row?.battery ?? null,
      millivolts: row?.millivolts ?? null,
      charging: row?.charging ?? null,
      look: row?.look ?? null,
      skin: row?.skin ?? null,
      pendingLook: row?.pendingLook ?? null,
    };
  });

  r.put('/device/look', { schema: { body: z.object({ look: z.string().min(1).max(20) }) } }, async (request, reply) => {
    const { look } = request.body;
    await db.insert(device).values({ id: 1, pendingLook: look })
      .onConflictDoUpdate({ target: device.id, set: { pendingLook: look } });
    return reply.code(204).send();
  });
};
