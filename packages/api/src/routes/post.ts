import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from '@fastify/type-provider-zod';
import { z } from 'zod';
import type { Post } from '../academy/post.ts';

const uid = z.object({ uid: z.coerce.number().int().positive() });

// The post: the inbox as last looked at, a letter opened, its attachments, the
// read flag set either way, and a look at the server now.
export const postRoutes: FastifyPluginAsync<{ post: Post }> = async (app, opts) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { post } = opts;
  post.start();
  app.addHook('onClose', async () => post.stop());

  const state = () => ({
    configured: post.configured,
    unread: post.inbox.unread,
    total: post.inbox.total,
    checkedAt: post.checkedAt?.toISOString() ?? null,
    error: post.error,
    letters: post.inbox.letters,
  });

  r.get('/mail', async () => state());

  r.post('/mail/check', async () => { await post.check(); return state(); });

  r.get('/mail/:uid', { schema: { params: uid } }, async (request, reply) => {
    const letter = await post.open(request.params.uid);
    return letter ?? reply.code(404).send();
  });

  r.put('/mail/seen', { schema: { body: z.object({ uids: z.array(z.number().int().positive()).max(2000), seen: z.boolean() }) } }, async (request, reply) => {
    await post.mark(request.body.uids, request.body.seen);
    return reply.code(204).send();
  });

  r.get('/mail/:uid/attachments/:i', {
    schema: { params: uid.extend({ i: z.coerce.number().int().nonnegative() }) },
  }, async (request, reply) => {
    const a = await post.attachment(request.params.uid, request.params.i);
    if (!a) return reply.code(404).send();
    return reply.type(a.type).header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(a.name)}`).send(a.content);
  });
};
