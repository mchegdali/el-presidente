import type { ChatMessage } from '@el-presidente/game/protocol';
import type { TypedResponse } from 'hono';
import { z } from 'zod';
import type { Deps } from '../../../shared/deps';
import { router, validQuery } from '../../../shared/hono';
import { fail } from '../../../shared/http';
import { requireUser } from '../../auth/session';
import { listMessagesJson } from './handler';

export const listMessagesRoute = (deps: Deps) =>
  router().get(
    '/:code/messages',
    requireUser,
    validQuery(z.object({ after: z.coerce.number().int().min(0).default(0) })),
    async (c) => {
      const json = await listMessagesJson(deps, c.req.param('code'), c.get('me'), c.req.valid('query').after);
      if (json.isErr()) return fail(c, json.error);
      // Corps JSON construit par Postgres, envoyé tel quel (forme vérifiée par les tests).
      return c.body(json.value, 200, { 'Content-Type': 'application/json' }) as unknown as TypedResponse<
        ChatMessage[],
        200,
        'json'
      >;
    },
  );
