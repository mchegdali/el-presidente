// Tempête de reconnexions (ce qui arrive après chaque déploiement) : N clients ouvrent
// chacun une nouvelle connexion TLS et demandent /health, répartis uniformément sur une
// fenêtre (gigue de reconnexion des clients). Modèle ouvert : latence comptée depuis
// l'heure prévue.
//
//   bun run storm.ts --url https://10.0.0.3/health --n 10000 --window 2000 --insecure

import { parseArgs } from 'node:util';

const { values: opt } = parseArgs({
  options: {
    url: { type: 'string', default: 'https://10.0.0.3/health' },
    n: { type: 'string', default: '2000' },
    window: { type: 'string', default: '2000' },
    insecure: { type: 'boolean', default: false },
    /** Même format que bots.ts --dump (Float64 : heure prévue epoch ms, latence ms). */
    dump: { type: 'string' },
  },
});

const N = Number(opt.n);
const WINDOW = Number(opt.window);
const tls = opt.insecure ? { rejectUnauthorized: false } : undefined;
const latencies: number[] = [];
const sentAt: number[] = [];
const errors = new Map<string, number>();

const start = performance.now() + 100;
const cpu0 = process.cpuUsage();
await Promise.all(
  Array.from({ length: N }, (_, i) => {
    const at = start + (WINDOW * i) / N;
    return new Promise<void>((resolve) => {
      setTimeout(
        async () => {
          try {
            // Nouvelle connexion à chaque client : poignée de main TLS complète.
            const res = await fetch(opt.url!, {
              keepalive: false,
              headers: { connection: 'close' },
              tls,
            } as RequestInit);
            await res.arrayBuffer();
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            latencies.push(performance.now() - at);
            sentAt.push(performance.timeOrigin + at);
          } catch (e) {
            const key = String((e as Error).message ?? e).slice(0, 100);
            errors.set(key, (errors.get(key) ?? 0) + 1);
          }
          resolve();
        },
        Math.max(0, at - performance.now()),
      );
    });
  }),
);
const elapsed = performance.now() - start;
if (opt.dump) {
  const buf = new Float64Array(latencies.length * 2);
  for (let i = 0; i < latencies.length; i++) {
    buf[2 * i] = sentAt[i]!;
    buf[2 * i + 1] = latencies[i]!;
  }
  await Bun.write(opt.dump, buf);
}
const sorted = latencies.sort((a, b) => a - b);
const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? NaN;
const cpu = process.cpuUsage(cpu0);
const r2 = (v: number) => Math.round(v * 100) / 100;
console.log(
  JSON.stringify({
    n: N,
    windowMs: WINDOW,
    ok: sorted.length,
    errors: Object.fromEntries(errors),
    elapsedMs: Math.round(elapsed),
    perSecond: Math.round((sorted.length / elapsed) * 1000),
    latencyMs: { p50: r2(pct(50)), p95: r2(pct(95)), p99: r2(pct(99)), max: r2(sorted.at(-1) ?? NaN) },
    generator: { cpuMs: Math.round((cpu.user + cpu.system) / 1000) },
  }),
);
process.exit(0);
