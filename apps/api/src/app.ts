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
import { metrics } from './shared/metrics';
import type { Shedder } from './shared/shedding';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

export interface AppOptions {
  env: Pick<Env, 'WEB_ORIGIN' | 'API_ORIGIN' | 'TRUST_PROXY' | 'ENABLE_TEST_LOGIN' | 'NODE_ENV'>;
  shedder?: Shedder | null;
  /** Adresse et port du client quand la requête ne passe pas par Caddy. */
  directAddress?: (req: Request, server: unknown) => { address: string; port: number } | null;
  /** Santé : la base répond et la boucle d'événements n'est pas bloquée. */
  healthy?: () => boolean;
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
      if (env.TRUST_PROXY) {
        // Posés par Caddy, qui écrase toute valeur envoyée par le client.
        const port = Number(c.req.header('x-real-port'));
        c.set('ip', c.req.header('x-real-ip') ?? null);
        c.set('port', Number.isInteger(port) && port > 0 && port <= 65535 ? port : null);
      } else {
        const direct = options.directAddress?.(c.req.raw, c.env) ?? null;
        c.set('ip', direct?.address ?? null);
        c.set('port', direct?.port ?? null);
      }
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
    // Sonde externe (GitHub Actions) : 503 si la base ne répond pas ou si la boucle est bloquée.
    .get('/health', (c) =>
      (options.healthy?.() ?? true) ? c.json({ ok: true as const }, 200) : c.json({ ok: false as const }, 503),
    )
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
