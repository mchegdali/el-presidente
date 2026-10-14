// Composition de l'API. `AppType` est le contrat partagé avec le site (client `hc`).

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import type { Auth } from './features/auth/auth';
import { requireUser, sessionMiddleware } from './features/auth/session';
import { testLoginRoute } from './features/auth/test-login';
import { listMessagesRoute } from './features/chat/list-messages/route';
import { reportMessageRoute } from './features/chat/report-message/route';
import { cancelRoundRoute } from './features/game/cancel-round/route';
import { startRoundRoute } from './features/game/start-round/route';
import { pushRoutes } from './features/push/subscribe/route';
import { createTableRoute } from './features/tables/create-table/route';
import { getTableRoute } from './features/tables/get-table/route';
import { joinTableRoute } from './features/tables/join-table/route';
import { kickPlayerRoute } from './features/tables/kick-player/route';
import { leaveTableRoute } from './features/tables/leave-table/route';
import { updateSettingsRoute } from './features/tables/update-settings/route';
import { upgradeRoute } from './realtime/upgrade';
import type { Deps } from './shared/deps';
import type { Env } from './shared/env';
import { Forbidden, Unavailable } from './shared/errors';
import type { AppEnv } from './shared/hono';
import { fail } from './shared/http';
import { log } from './shared/logger';
import { metrics, renderMetrics } from './shared/metrics';
import type { Shedder } from './shared/shedding';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

export interface AppOptions {
  env: Pick<Env, 'WEB_ORIGIN' | 'API_ORIGIN' | 'TRUST_PROXY' | 'METRICS_TOKEN' | 'ENABLE_TEST_LOGIN' | 'NODE_ENV'>;
  shedder?: Shedder | null;
  /** Adresse du client quand la requête ne passe pas par HAProxy. */
  directIp?: (req: Request, server: unknown) => string | null;
  gauges?: () => Record<string, number>;
}

export function createApp(deps: Deps, auth: Auth, options: AppOptions) {
  const { env } = options;
  const origins = [env.WEB_ORIGIN, env.API_ORIGIN];
  const shedder = options.shedder ?? null;

  const base = new Hono<AppEnv>();
  base.onError((error, c) => {
    log.error('requête', { path: c.req.path, error: String(error), stack: (error as Error).stack });
    return c.json({ error: { tag: 'Panic', message: 'Erreur interne.' } }, 500);
  });

  const app = base
    .use(secureHeaders({ crossOriginResourcePolicy: 'same-site' }))
    .use(
      cors({
        origin: env.WEB_ORIGIN,
        credentials: true,
        allowMethods: ['GET', 'POST', 'PATCH', 'DELETE'],
        allowHeaders: ['Content-Type'],
        maxAge: 600,
      }),
    )
    .use(async (c, next) => {
      c.set(
        'ip',
        env.TRUST_PROXY ? (c.req.header('x-real-ip') ?? null) : (options.directIp?.(c.req.raw, c.env) ?? null),
      );
      // Requêtes qui modifient l'état : seulement depuis le site (protection CSRF).
      if (!SAFE.has(c.req.method)) {
        const origin = c.req.header('origin');
        if (origin === undefined || !origins.includes(origin))
          return fail(c, new Forbidden({ message: 'Origine refusée.' }));
        if (shedder?.shouldShed()) {
          metrics.shed++;
          return fail(c, new Unavailable({ message: 'Serveur saturé, réessayez dans un instant.', retryAfter: 2 }));
        }
      }
      await next();
    })
    .on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw))
    .use(sessionMiddleware(auth))
    .get('/health', (c) => c.json({ ok: true as const }, 200))
    .get('/metrics', (c) => {
      const token = env.METRICS_TOKEN;
      if (token === undefined || c.req.header('authorization') !== `Bearer ${token}`) return c.notFound();
      return c.text(renderMetrics(options.gauges?.() ?? {}));
    })
    .get('/me', requireUser, (c) => c.json(c.get('me'), 200))
    .route(
      '/tables',
      new Hono<AppEnv>()
        .route('/', createTableRoute(deps))
        .route('/', getTableRoute(deps))
        .route('/', joinTableRoute(deps))
        .route('/', leaveTableRoute(deps))
        .route('/', kickPlayerRoute(deps))
        .route('/', updateSettingsRoute(deps))
        .route('/', startRoundRoute(deps))
        .route('/', cancelRoundRoute(deps))
        .route('/', listMessagesRoute(deps))
        .route('/', reportMessageRoute(deps))
        .route('/', upgradeRoute(deps, origins, shedder)),
    )
    .route('/push', pushRoutes(deps));

  if (env.ENABLE_TEST_LOGIN || env.NODE_ENV === 'test') app.route('/test', testLoginRoute(auth));
  return app;
}

export type AppType = ReturnType<typeof createApp>;
