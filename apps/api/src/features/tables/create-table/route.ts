import { z } from 'zod';
import type { Deps } from '../../../shared/deps';
import { RateLimited } from '../../../shared/errors';
import { router, validJson } from '../../../shared/hono';
import { fail, respond } from '../../../shared/http';
import { RateLimiter } from '../../../shared/rate-limit';
import { requireUser } from '../../auth/session';
import { createTable } from './handler';

const limiter = new RateLimiter(10, 10 / 60);

export const createTableRoute = (deps: Deps) =>
  router().post('/', requireUser, validJson(z.object({ name: z.string().max(100).optional() })), async (c) => {
    const me = c.get('me');
    const wait = limiter.take(me.id, deps.now());
    if (wait > 0)
      return fail(c, new RateLimited({ message: 'Trop de tables créées, réessayez plus tard.', retryAfter: wait }));
    return respond(c, await createTable(deps, me, c.req.valid('json').name));
  });
