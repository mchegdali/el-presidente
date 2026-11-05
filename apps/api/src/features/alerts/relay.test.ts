// Écoute interne : métriques et alertes de vmalert relayées en notifications push.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { ADMIN_EMAIL, METRICS_TOKEN, startTestServer, type TestServer } from '../../testing/harness';
import { metrics } from '../../shared/metrics';

let s: TestServer;
let internal: string;
let adminId: string;
beforeAll(async () => {
  s = await startTestServer();
  internal = `http://localhost:${s.internal!.port}`;
  adminId = (await s.login('Admin', ADMIN_EMAIL)).userId;
  s.push.subscribed.add(adminId);
});
afterAll(() => s.close());

const auth = { authorization: `Bearer ${METRICS_TOKEN}` };
const post = (alerts: unknown, headers: Record<string, string> = auth) =>
  fetch(`${internal}/api/v2/alerts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(alerts),
  });
const alert = (endsAt: number) => ({
  labels: { alertname: 'LitestreamDown', job: 'litestream' },
  annotations: { summary: 'Litestream ne répond plus' },
  startsAt: new Date(s.clock.t - 60_000).toISOString(),
  endsAt: new Date(endsAt).toISOString(),
});

describe('écoute interne', () => {
  test('jeton obligatoire ; métriques au format Prometheus', async () => {
    expect((await fetch(`${internal}/metrics`)).status).toBe(401);
    const r = await fetch(`${internal}/metrics`, { headers: auth });
    expect(r.status).toBe(200);
    const text = await r.text();
    expect(text).toContain('presidente_move_latency_us_bucket');
    expect(text).toContain('presidente_connections ');
    // Plus de métriques sur l'écoute publique.
    expect((await fetch(`${s.base}/metrics`, { headers: auth })).status).toBe(404);
  });

  test('alertes : une push au déclenchement, rien tant qu’elle dure, rappel après 6 h, une à la résolution', async () => {
    expect((await post([alert(s.clock.t + 60_000)], {})).status).toBe(401);
    expect((await post({ pas: 'une liste' })).status).toBe(400);

    s.push.sent = [];
    await post([alert(s.clock.t + 60_000)]);
    await post([alert(s.clock.t + 60_000)]);
    expect(s.push.sent.map((p) => [p.userId, p.payload.title])).toEqual([[adminId, '🔴 LitestreamDown']]);
    expect(s.push.sent[0]!.payload.body).toBe('Litestream ne répond plus');

    s.clock.t += 6 * 60 * 60_000;
    await post([alert(s.clock.t + 60_000)]);
    expect(s.push.sent.at(-1)!.payload.title).toBe('⏰ Toujours LitestreamDown');

    await post([alert(s.clock.t - 1000)]);
    expect(s.push.sent.at(-1)!.payload.title).toBe('✅ Résolu : LitestreamDown');
    await post([alert(s.clock.t - 1000)]);
    expect(s.push.sent.length).toBe(3);
  });
});

describe('/health', () => {
  test('200 en temps normal, 503 si la boucle d’événements est bloquée', async () => {
    expect((await fetch(`${s.base}/health`)).status).toBe(200);
    const lag = metrics.loopLag;
    metrics.loopLag = 5000;
    try {
      expect((await fetch(`${s.base}/health`)).status).toBe(503);
    } finally {
      metrics.loopLag = lag;
    }
  });
});
