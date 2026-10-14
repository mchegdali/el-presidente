import type { Deps } from '../../../shared/deps';
import { router } from '../../../shared/hono';
import { respond } from '../../../shared/http';
import { requireUser } from '../../auth/session';
import { startRound } from './handler';

export const startRoundRoute = (deps: Deps) =>
  router().post('/:code/rounds', requireUser, async (c) => {
    const table = await deps.tables.get(c.req.param('code'));
    if (table.isErr()) return respond(c, table);
    return respond(c, await startRound(deps, table.value, c.get('me')));
  });
