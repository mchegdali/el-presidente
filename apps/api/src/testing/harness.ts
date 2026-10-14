// Banc de test de bout en bout : vrai serveur Bun (port libre), base PGlite avec les
// vraies migrations, client `hc` typé et vrais WebSockets.

import { createTestDatabase } from '@el-presidente/db/testing';
import { seededRng } from '@el-presidente/game';
import {
  decodeServer,
  encodeClient,
  Writer,
  type ClientMessage,
  type ServerMessage,
  type TableSnapshot,
} from '@el-presidente/game/protocol';
import { hc } from 'hono/client';
import type { AppType } from '../app';
import type { PushPayload, PushSender } from '../features/push/sender';
import { startServer } from '../server';
import type { Env } from '../shared/env';

export const WEB_ORIGIN = 'https://web.test';

export class FakePush implements PushSender {
  readonly publicKey = 'test-public-key';
  sent: { userId: string; payload: PushPayload }[] = [];
  subscribed = new Set<string>();
  send(userId: string, payload: PushPayload) {
    if (this.subscribed.has(userId)) this.sent.push({ userId, payload });
  }
  async hasSubscription(userId: string) {
    return this.subscribed.has(userId);
  }
}

export async function startTestServer() {
  const database = await createTestDatabase();
  const clock = { t: 1_800_000_000_000 };
  const push = new FakePush();
  const env: Env = {
    NODE_ENV: 'test',
    DATABASE_URL: 'pglite://memory',
    PORT: 0,
    API_ORIGIN: 'http://localhost',
    WEB_ORIGIN,
    BETTER_AUTH_SECRET: 'test-secret-test-secret-test-secret-123',
    GOOGLE_CLIENT_ID: 'test',
    GOOGLE_CLIENT_SECRET: 'test',
    TRUST_PROXY: false,
    ENABLE_TEST_LOGIN: true,
  };
  const running = await startServer({ env, db: database.db, rng: seededRng(99), now: () => clock.t, push, port: 0 });
  const base = `http://localhost:${running.server.port}`;

  async function login(name: string) {
    const res = await fetch(`${base}/test/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: WEB_ORIGIN },
      body: JSON.stringify({ name }),
    });
    const { userId, cookie } = (await res.json()) as { userId: string; cookie: string };
    const headers = { cookie, origin: WEB_ORIGIN };
    return {
      userId,
      name,
      cookie,
      api: hc<AppType>(base, { headers }),
      connect: (code: string) => connect(code, headers),
    };
  }

  async function connect(code: string, headers: Record<string, string>) {
    const ws = new WebSocket(`${base.replace('http', 'ws')}/tables/${code}/ws`, { headers } as never);
    ws.binaryType = 'arraybuffer';
    const inbox: ServerMessage[] = [];
    const waiters: (() => void)[] = [];
    ws.addEventListener('message', (e) => {
      inbox.push(decodeServer(new Uint8Array(e.data as ArrayBuffer)));
      for (const w of waiters.splice(0)) w();
    });
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener('open', () => resolve(), { once: true });
      ws.addEventListener('error', () => reject(new Error('connexion WebSocket refusée')), { once: true });
    });
    const w = new Writer();
    let req = 0;

    /** Attend un message vérifiant `pred` (parmi ceux pas encore consommés). */
    async function next<T extends ServerMessage>(pred: (m: ServerMessage) => m is T, timeoutMs = 2000): Promise<T> {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const i = inbox.findIndex(pred);
        if (i >= 0) return inbox.splice(i, 1)[0] as T;
        if (Date.now() > deadline) throw new Error('message attendu non reçu');
        await new Promise<void>((resolve) => {
          waiters.push(resolve);
          setTimeout(resolve, 50);
        });
      }
    }

    return {
      ws,
      inbox,
      next,
      send(msg: ClientMessage) {
        ws.send(encodeClient(w, msg).slice());
      },
      /** Envoie un coup et attend l'accusé ou le refus. */
      async request(msg: ClientMessage & { req?: number }) {
        const id = ++req;
        ws.send(encodeClient(w, { ...msg, req: id } as ClientMessage).slice());
        return next(
          (m): m is Extract<ServerMessage, { op: 'ack' | 'reject' }> =>
            (m.op === 'ack' || m.op === 'reject') && m.req === id,
        );
      },
      snapshot: () => next((m): m is { op: 'snapshot'; snapshot: TableSnapshot } => m.op === 'snapshot'),
      close: () => ws.close(),
    };
  }

  return {
    ...running,
    base,
    clock,
    push,
    database,
    login,
    async close() {
      await running.stop();
      await database.close();
    },
  };
}

export type TestServer = Awaited<ReturnType<typeof startTestServer>>;
export type TestUser = Awaited<ReturnType<TestServer['login']>>;
