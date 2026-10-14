import type { Deps } from '../../../shared/deps';
import { router } from '../../../shared/hono';
import { respond } from '../../../shared/http';
import { getTable } from './handler';

export const getTableRoute = (deps: Deps) =>
  router().get('/:code', async (c) => respond(c, await getTable(deps, c.req.param('code'), c.get('user'))));
