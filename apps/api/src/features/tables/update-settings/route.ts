import { z } from 'zod';
import type { Deps } from '../../../shared/deps';
import { router, validJson } from '../../../shared/hono';
import { respond } from '../../../shared/http';
import { requireUser } from '../../auth/session';
import { updateSettings } from './handler';

export const updateSettingsRoute = (deps: Deps) =>
  router().patch(
    '/:code/settings',
    requireUser,
    validJson(z.object({ turnLimit: z.number().int().min(0).max(600).nullable() })),
    async (c) =>
      respond(c, await updateSettings(deps, c.req.param('code'), c.get('me'), c.req.valid('json').turnLimit)),
  );
