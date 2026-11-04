// Fusion des générateurs parallèles (bots.ts ou storm.ts lancés avec --dump) :
// percentiles exacts sur l'ensemble des mesures, restreints à une fenêtre de régime établi.
//
//   bun run merge.ts --warmup 15000 --cooldown 2000 /tmp/bench/*.bin /tmp/bench/*.json

import { parseArgs } from 'node:util';

const { values: opt, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    /** Millisecondes ignorées après le premier coup (connexions, montée en charge). */
    warmup: { type: 'string', default: '0' },
    /** Millisecondes ignorées avant le dernier coup (fermeture). */
    cooldown: { type: 'string', default: '0' },
  },
});

// Fichiers triés par extension (parseArgs absorbe `--`, il ne peut pas servir de séparateur).
const dumps = positionals.filter((p) => p.endsWith('.bin'));
const reports = positionals.filter((p) => p.endsWith('.json'));

const at: number[] = [];
const lat: number[] = [];
for (const path of dumps) {
  const buf = new Float64Array(await Bun.file(path).arrayBuffer());
  for (let i = 0; i < buf.length; i += 2) {
    at.push(buf[i]!);
    lat.push(buf[i + 1]!);
  }
}

let first = Infinity;
let last = -Infinity;
for (const t of at) {
  if (t < first) first = t;
  if (t > last) last = t;
}
const from = first + Number(opt.warmup);
const to = last - Number(opt.cooldown);
const window: number[] = [];
for (let i = 0; i < at.length; i++) if (at[i]! >= from && at[i]! <= to) window.push(lat[i]!);
window.sort((a, b) => a - b);

const pct = (p: number) => window[Math.min(window.length - 1, Math.floor((p / 100) * window.length))] ?? NaN;
const r2 = (v: number) => Math.round(v * 100) / 100;

// Rapports par générateur : erreurs additionnées, CPU de chaque générateur conservé.
const parsed = await Promise.all(reports.map(async (p) => JSON.parse(await Bun.file(p).text())));
const sum = (key: string) => parsed.reduce((s, r) => s + (Number(r[key]) || 0), 0);
const mergeMaps = (key: string) => {
  const out: Record<string, number> = {};
  for (const r of parsed) for (const [k, v] of Object.entries(r[key] ?? {})) out[k] = (out[k] ?? 0) + Number(v);
  return out;
};

const seconds = (to - from) / 1000;
console.log(
  JSON.stringify({
    window: { from: Math.round(from), to: Math.round(to), seconds: r2(seconds) },
    measured: window.length,
    perSecond: Math.round(window.length / seconds),
    latencyMs: {
      p50: r2(pct(50)),
      p95: r2(pct(95)),
      p99: r2(pct(99)),
      p999: r2(pct(99.9)),
      max: r2(window.at(-1) ?? NaN),
    },
    errors: typeof parsed[0]?.errors === 'number' ? sum('errors') : mergeMaps('errors'),
    rejects: sum('rejects'),
    closeCodes: mergeMaps('closeCodes'),
    httpErrors: mergeMaps('httpErrors'),
    generators: parsed.map((r) => ({
      cpuMs: r.generator?.cpuMs,
      wallMs: r.seconds !== undefined ? r.seconds * 1000 : r.elapsedMs,
    })),
  }),
);
