import { z } from 'zod';
import type { Deps } from '../../../shared/deps';
import { router, validJson } from '../../../shared/hono';
import { respond } from '../../../shared/http';
import { requireUser } from '../../auth/session';
import { kickPlayer } from './handler';

export const kickPlayerRoute = (deps: Deps) =>
  router().post('/:code/kick', requireUser, validJson(z.object({ userId: z.string().min(1).max(100) })), async (c) =>
    respond(c, await kickPlayer(deps, c.req.param('code'), c.get('me'), c.req.valid('json').userId)),
  );
