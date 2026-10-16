import { schema } from '@el-presidente/db';
import { Result } from 'better-result';
import { and, eq } from '@el-presidente/db';
import { z } from 'zod';
import type { Deps } from '../../../shared/deps';
import { dbError } from '../../../shared/errors';
import { router, validJson } from '../../../shared/hono';
import { respond } from '../../../shared/http';
import { requireUser } from '../../auth/session';

const { pushSubscriptions } = schema;

const subscription = z.object({
  endpoint: z
    .url()
    .max(1000)
    .refine((u) => u.startsWith('https://'), 'Abonnement aux notifications invalide.'),
  keys: z.object({ p256dh: z.string().min(40).max(200), auth: z.string().min(10).max(100) }),
});

export const pushRoutes = (deps: Deps) =>
  router()
    .get('/public-key', (c) => c.json({ publicKey: deps.push.publicKey }, 200))
    .post('/subscriptions', requireUser, validJson(subscription), async (c) => {
      const { endpoint, keys } = c.req.valid('json');
      const userId = c.get('me').id;
      const row = { userId, p256dh: keys.p256dh, auth: keys.auth };
      return respond(
        c,
        (
          await Result.tryPromise({
            try: () =>
              deps.db
                .insert(pushSubscriptions)
                .values({ endpoint, ...row })
                .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: row }),
            catch: dbError,
          })
        ).map(() => ({ subscribed: true as const })),
      );
    })
    .delete('/subscriptions', requireUser, validJson(z.object({ endpoint: z.string().max(1000) })), async (c) =>
      respond(
        c,
        (
          await Result.tryPromise({
            try: () =>
              deps.db
                .delete(pushSubscriptions)
                .where(
                  and(
                    eq(pushSubscriptions.endpoint, c.req.valid('json').endpoint),
                    eq(pushSubscriptions.userId, c.get('me').id),
                  ),
                ),
            catch: dbError,
          })
        ).map(() => ({ subscribed: false as const })),
      ),
    );
