// Écoute interne (réseau Docker de surveillance, jamais derrière Caddy) : métriques pour
// VictoriaMetrics et réception des alertes de vmalert. Jeton obligatoire sur les deux.

import { Hono } from 'hono';
import type { AlertRelay } from './features/alerts/relay';
import { alertsSchema } from './features/alerts/relay';
import { renderMetrics } from './shared/metrics';

export interface InternalOptions {
  token: string;
  relay: AlertRelay;
  gauges: () => Record<string, number>;
}

export function createInternalApp(options: InternalOptions) {
  const expected = `Bearer ${options.token}`;
  return new Hono()
    .use(async (c, next) => {
      if (c.req.header('authorization') !== expected) return c.text('Non autorisé', 401);
      await next();
    })
    .get('/metrics', (c) => c.text(renderMetrics(options.gauges())))
    .post('/api/v2/alerts', async (c) => {
      const parsed = alertsSchema.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) return c.text('Alertes invalides', 400);
      options.relay.receive(parsed.data);
      return c.body(null, 200);
    });
}
