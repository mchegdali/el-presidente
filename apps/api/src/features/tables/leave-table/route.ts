import type { Deps } from '../../../shared/deps';
import { router } from '../../../shared/hono';
import { respond } from '../../../shared/http';
import { requireUser } from '../../auth/session';
import { leaveTable } from './handler';

export const leaveTableRoute = (deps: Deps) =>
  router().post('/:code/leave', requireUser, async (c) =>
    respond(c, await leaveTable(deps, c.req.param('code'), c.get('me'))),
  );
