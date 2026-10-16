import type { Deps } from '../../../shared/deps';
import { router } from '../../../shared/hono';
import { respond } from '../../../shared/http';
import { requireUser } from '../../auth/session';
import { cancelRound } from './handler';

export const cancelRoundRoute = (deps: Deps) =>
  router().delete('/:code/rounds/current', requireUser, async (c) => {
    const table = await deps.tables.get(c.req.param('code'));
    if (table.isErr()) return respond(c, table);
    return respond(c, await cancelRound(deps, table.value, c.get('me')));
  });
