// Assemblage du processus : dépendances, horloge, HTTP + WebSocket sur un même Bun.serve.

import type { Database } from '@el-presidente/db';
import { cryptoRng, type Rng } from '@el-presidente/game';
import { createApp } from './app';
import { createAuth } from './features/auth/auth';
import { chatLimiter } from './features/chat/send-message/handler';
import { onTurnDeadline, restoreDeadlines } from './features/game/turn-timeout/handler';
import { createPushSender, type PushSender } from './features/push/sender';
import { GameWriter } from './features/tables/shared/game-writer';
import { TableStore } from './features/tables/shared/store';
import { Hub } from './realtime/hub';
import { createSocketHandler, sweepSocketLimiters, type SocketContext } from './realtime/socket';
import type { Deps } from './shared/deps';
import type { Env } from './shared/env';
import { log } from './shared/logger';
import { startLoopLagProbe } from './shared/metrics';
import { Scheduler } from './shared/scheduler';
import { Shedder } from './shared/shedding';

export interface ServerOptions {
  env: Env;
  db: Database;
  rng?: Rng;
  now?: () => number;
  push?: PushSender;
  /** Port 0 : port libre (tests). */
  port?: number;
}

const IDLE_TABLE_MS = 10 * 60_000;

export async function startServer(options: ServerOptions) {
  const { env, db } = options;
  const now = options.now ?? Date.now;
  const hub = new Hub();
  const deps: Deps = {
    db,
    tables: new TableStore(db),
    writer: new GameWriter(db),
    hub,
    scheduler: new Scheduler((code) => {
      onTurnDeadline(deps, code).catch((error) => log.error('passe automatique', { code, error: String(error) }));
    }, now),
    push:
      options.push ??
      createPushSender(db, {
        publicKey: env.VAPID_PUBLIC_KEY,
        privateKey: env.VAPID_PRIVATE_KEY,
        subject: env.VAPID_SUBJECT,
      }),
    rng: options.rng ?? cryptoRng,
    now,
  };
  const auth = createAuth(db, env);
  const shedder = env.NODE_ENV === 'production' ? new Shedder(3 * 1024 ** 3) : null;
  shedder?.start();
  startLoopLagProbe();

  const app = createApp(deps, auth, {
    env,
    shedder,
    directIp: (req, server) =>
      (server as { requestIP?: (r: Request) => { address: string } | null }).requestIP?.(req)?.address ?? null,
    gauges: () => ({
      presidente_tables_loaded: [...deps.tables.all()].length,
      presidente_connections: hub.connections,
      presidente_pending_writes: deps.writer.size,
      presidente_deadlines: deps.scheduler.size,
    }),
  });

  const common = {
    fetch: (req: Request, srv: Bun.Server<SocketContext>) => app.fetch(req, srv),
    websocket: createSocketHandler(deps),
  };
  const server =
    env.LISTEN_UNIX !== undefined
      ? // Socket Unix derrière HAProxy : Bun n'y applique pas de délai d'inactivité, c'est
        // HAProxy (`timeout server`) qui ferme les connexions inutilisées.
        Bun.serve<SocketContext>({ ...common, unix: env.LISTEN_UNIX })
      : // En TCP direct : toujours au-dessus du keep-alive des clients (Vercel, HAProxy),
        // pour que ce ne soit jamais l'amont qui ferme une connexion qu'il croit réutilisable.
        Bun.serve<SocketContext>({ ...common, port: options.port ?? env.PORT, idleTimeout: 75 });
  hub.publisher = server;
  await restoreDeadlines(deps);

  // Entretien : limiteurs, tables inactives, tables abandonnées depuis 2 jours.
  const maintenance = setInterval(() => {
    const t = now();
    chatLimiter.sweep(t);
    sweepSocketLimiters(t);
    deps.tables.evictIdle(IDLE_TABLE_MS, (table) => !table.isLocked && !deps.writer.isPending(table.id), t);
  }, 60_000);
  maintenance.unref?.();

  log.info('API prête', { listen: env.LISTEN_UNIX ?? server.port });

  return {
    server,
    deps,
    app,
    auth,
    async stop() {
      clearInterval(maintenance);
      deps.scheduler.stop();
      shedder?.stop();
      server.stop(true);
      await deps.writer.flush();
      log.flush();
    },
  };
}
