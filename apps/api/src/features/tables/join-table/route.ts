import { z } from 'zod';
import type { Deps } from '../../../shared/deps';
import { router, validJson } from '../../../shared/hono';
import { respond } from '../../../shared/http';
import { requireUser } from '../../auth/session';
import { joinTable } from './handler';

export const joinTableRoute = (deps: Deps) =>
  router().post('/:code/join', requireUser, validJson(z.object({ name: z.string().max(100).optional() })), async (c) =>
    respond(c, await joinTable(deps, c.req.param('code'), c.get('me'), c.req.valid('json').name)),
  );
