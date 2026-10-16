// Ouverture d'une connexion WebSocket sur une table : session vérifiée (cookie signé,
// sans lecture en base), origine contrôlée, table chargée en mémoire.

import type { Server } from 'bun';
import type { Deps } from '../shared/deps';
import { Forbidden, Unavailable } from '../shared/errors';
import { router } from '../shared/hono';
import { fail } from '../shared/http';
import { metrics } from '../shared/metrics';
import type { Shedder } from '../shared/shedding';
import type { SocketContext } from './socket';

export const upgradeRoute = (deps: Deps, allowedOrigins: readonly string[], shedder: Shedder | null) =>
  router().get('/:code/ws', async (c) => {
    if (c.req.header('upgrade')?.toLowerCase() !== 'websocket') return c.text('WebSocket attendu', 426);
    const origin = c.req.header('origin');
    if (origin === undefined || !allowedOrigins.includes(origin)) {
      return fail(c, new Forbidden({ message: 'Origine refusée.' }));
    }
    if (shedder?.shouldShed()) {
      metrics.shed++;
      return fail(c, new Unavailable({ message: 'Serveur saturé, nouvelle tentative bientôt.', retryAfter: 2 }));
    }
    const table = await deps.tables.get(c.req.param('code'));
    if (table.isErr()) return fail(c, table.error);

    const server = c.env as unknown as Server<SocketContext>;
    const data: SocketContext = {
      userId: c.get('user')?.id ?? null,
      tableId: table.value.id,
      code: table.value.code,
      active: c.req.query('active') !== '0',
      member: false,
      ip: c.get('ip'),
    };
    if (!server.upgrade(c.req.raw, { data })) return c.text('Échec de la connexion WebSocket', 400);
    return new Response(null);
  });
