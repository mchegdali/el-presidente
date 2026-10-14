import { z } from 'zod';
import type { Deps } from '../../../shared/deps';
import { router, validJson, validParam } from '../../../shared/hono';
import { respond } from '../../../shared/http';
import { requireUser } from '../../auth/session';
import { reportMessage } from './handler';

export const reportMessageRoute = (deps: Deps) =>
  router().post(
    '/:code/messages/:id/report',
    requireUser,
    validParam(z.object({ code: z.string(), id: z.coerce.number().int().positive() })),
    validJson(z.object({ reason: z.string().max(500).optional() })),
    async (c) => {
      const { code, id } = c.req.valid('param');
      return respond(c, await reportMessage(deps, code, c.get('me'), id, c.req.valid('json').reason));
    },
  );
