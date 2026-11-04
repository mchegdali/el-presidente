// Orchestrateur du banc des proxys, lancé depuis le poste (clés SSH locales) :
// le trafic mesuré passe par le réseau privé Hetzner (générateur 10.0.0.2 → SUT 10.0.0.3),
// l'administration par SSH sur les adresses publiques.
//
//   bun run run.ts --sut root@[2a01:…::1] --loadgen root@[2a01:…::1] \
//     --proxies haproxy,caddy,nginx,direct --scenarios steady,saturation,storm --reps 3
//   bun run run.ts … --quick        (essai : 100×4, 10 s, une répétition)

import { appendFileSync, mkdirSync } from 'node:fs';
import { parseArgs } from 'node:util';

const { values: opt } = parseArgs({
  options: {
    sut: { type: 'string', default: 'root@2a01:4f9:c015:8294::1' },
    loadgen: { type: 'string', default: 'root@2a01:4f9:c015:653f::1' },
    target: { type: 'string', default: '10.0.0.3' },
    proxies: { type: 'string', default: 'haproxy,caddy,nginx,pingora,direct' },
    scenarios: { type: 'string', default: 'steady,saturation,storm' },
    reps: { type: 'string', default: '3' },
    seconds: { type: 'string', default: '60' },
    quick: { type: 'boolean', default: false },
    out: { type: 'string', default: `results/${new Date().toISOString().slice(0, 16).replace(':', '')}.jsonl` },
  },
});

const SUT_DIR = '/root/el-presidente/infra/bench/proxies';
const GEN_DIR = '/root/el-presidente/infra/bench';
const BUN = '/root/.bun/bin/bun';
const ORIGIN = 'https://bench.example';
// Essai : 20 s, la mise en place des tables (connexions de test, créations) en prend jusqu'à 10.
const SECONDS = opt.quick ? 20 : Number(opt.seconds);
// Campagne : 20 s ignorées (mise en place de 2 500 tables, puis premiers coups étalés).
const WARMUP_MS = opt.quick ? 5000 : 20_000;
const REPS = opt.quick ? 1 : Number(opt.reps);

async function ssh(host: string, cmd: string, { check = true } = {}): Promise<string> {
  const p = Bun.spawn(['ssh', '-o', 'BatchMode=yes', '-o', 'ServerAliveInterval=15', host, cmd], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  if (check && code !== 0) throw new Error(`ssh ${host} « ${cmd.slice(0, 120)} » → ${code}\n${err.trim()}`);
  return out.trim();
}

const sut = (cmd: string, o?: { check?: boolean }) => ssh(opt.sut!, cmd, o);
const gen = (cmd: string, o?: { check?: boolean }) => ssh(opt.loadgen!, cmd, o);

const ALL_SERVICES = 'api api-direct haproxy caddy nginx pingora';
const baseUrl = (proxy: string) => (proxy === 'direct' ? `http://${opt.target}:4000` : `https://${opt.target}`);
const apiService = (proxy: string) => (proxy === 'direct' ? 'api-direct' : 'api');

/** Pile propre pour chaque mesure : base vidée, API et proxy recréés. */
async function startStack(proxy: string) {
  await sut(`cd ${SUT_DIR} && docker compose stop -t 20 ${ALL_SERVICES} >/dev/null 2>&1; true`);
  await sut(`cd ${SUT_DIR} && docker compose up -d --wait pg >/dev/null 2>&1`);
  await sut(
    `cd ${SUT_DIR} && docker compose exec -T pg psql -q -U app presidente -c 'truncate lobbies, "user" cascade'`,
  );
  const services = proxy === 'direct' ? 'api-direct' : `api ${proxy}`;
  await sut(`cd ${SUT_DIR} && docker compose up -d --force-recreate --no-deps ${services} 2>&1`);
  const url = `${baseUrl(proxy)}/health`;
  await gen(`for i in $(seq 1 60); do curl -fsk -o /dev/null ${url} && exit 0; sleep 0.5; done; exit 1`);
  // Laisse retomber le démarrage (compilation JIT, premières connexions Postgres).
  await Bun.sleep(3000);
}

interface Sample {
  t: number;
  cpu: { total: number; idle: number; steal: number };
  [container: string]: unknown;
}

/** Échantillonneur lancé sur le SUT pendant la mesure, arrêté ensuite. */
async function withSampler<T>(proxy: string, body: () => Promise<T>): Promise<T> {
  const containers = [
    'bench-pg-1',
    `bench-${apiService(proxy)}-1`,
    ...(proxy === 'direct' ? [] : [`bench-${proxy}-1`]),
  ];
  const pid = await sut(
    `cd ${SUT_DIR} && (nohup ./sample.sh ${containers.join(' ')} > /tmp/samples.jsonl 2>/tmp/sample.err & echo $!)`,
  );
  try {
    return await body();
  } finally {
    await sut(`kill ${pid}`, { check: false });
  }
}

async function readSamples(): Promise<Sample[]> {
  const text = await sut('cat /tmp/samples.jsonl');
  return text
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Sample);
}

/**
 * Différences de compteurs entre les échantillons qui encadrent la fenêtre [from, to]
 * (dernier avant `from`, premier après `to`) : même une fenêtre courte est couverte.
 */
function systemStats(samples: Sample[], from: number, to: number, proxy: string) {
  const a = samples.findLast((s) => s.t <= from) ?? samples[0];
  const b = samples.find((s) => s.t >= to) ?? samples.at(-1);
  if (a === undefined || b === undefined || b.t <= a.t) return null;
  const inWindow = samples.filter((s) => s.t >= a.t && s.t <= b.t);
  const dTotal = b.cpu.total - a.cpu.total;
  const usec = (s: Sample, c: string) => (s[c] as { usec: number } | undefined)?.usec ?? 0;
  const peak = (c: string) => Math.max(...inWindow.map((s) => (s[c] as { mem: number } | undefined)?.mem ?? 0));
  const cms = (c: string) => (usec(b, c) - usec(a, c)) / 1000;
  const proxyC = `bench-${proxy}-1`;
  const apiC = `bench-${apiService(proxy)}-1`;
  return {
    seconds: (b.t - a.t) / 1000,
    sutCpuPct: Math.round((100 * (dTotal - (b.cpu.idle - a.cpu.idle))) / dTotal),
    stealPct: Math.round((1000 * (b.cpu.steal - a.cpu.steal)) / dTotal) / 10,
    cpuMs: { proxy: proxy === 'direct' ? 0 : cms(proxyC), api: cms(apiC), pg: cms('bench-pg-1') },
    peakMemMb: {
      proxy: proxy === 'direct' ? 0 : Math.round(peak(proxyC) / 1e6),
      api: Math.round(peak(apiC) / 1e6),
    },
  };
}

/**
 * Préambule des commandes du générateur, terminé par `;` : un `&&` suivi des générateurs
 * lancés en arrière-plan (`… && bots &`) enverrait aussi le `cd` en arrière-plan, et les
 * commandes suivantes tourneraient hors du dépôt.
 */
const PREPARE = `ulimit -n 131072; cd ${GEN_DIR} || exit 1; rm -rf /tmp/bench; mkdir -p /tmp/bench;`;

/** Générateurs en parallèle (un fil JS chacun), fusionnés par merge.ts sur la même fenêtre. */
async function runBots(proxy: string, tables: number, think: number) {
  const shards = Math.min(4, Math.max(1, Math.ceil(tables / 250)));
  const per = Math.ceil(tables / shards);
  const runs = Array.from(
    { length: shards },
    (_, i) =>
      `${BUN} run bots.ts --api ${baseUrl(proxy)} --origin ${ORIGIN} --insecure --tables ${per} --players 4 ` +
      `--think ${think} --seconds ${SECONDS} --shard S${i} --dump /tmp/bench/d${i}.bin > /tmp/bench/r${i}.json 2>/tmp/bench/e${i}.log &`,
  );
  const cmd =
    `${PREPARE} ${runs.join(' ')} wait; ` +
    `${BUN} run ./proxies/merge.ts --warmup ${WARMUP_MS} --cooldown 2000 /tmp/bench/d*.bin /tmp/bench/r*.json`;
  return { shards, report: JSON.parse(await gen(cmd)) };
}

async function runStorm(proxy: string, n: number) {
  const shards = 4;
  const runs = Array.from(
    { length: shards },
    (_, i) =>
      `${BUN} run ./proxies/storm.ts --url ${baseUrl(proxy)}/health --n ${n / shards} --window 2000 --insecure ` +
      `--dump /tmp/bench/d${i}.bin > /tmp/bench/r${i}.json 2>/tmp/bench/e${i}.log &`,
  );
  const cmd = `${PREPARE} ${runs.join(' ')} wait; ${BUN} run ./proxies/merge.ts /tmp/bench/d*.bin /tmp/bench/r*.json`;
  return { shards, report: JSON.parse(await gen(cmd)) };
}

interface Case {
  scenario: string;
  label: string;
  run: (
    proxy: string,
  ) => Promise<{ shards: number; report: Record<string, unknown> & { window?: { from: number; to: number } } }>;
}

function cases(): Case[] {
  const list: Case[] = [];
  const scenarios = opt.scenarios!.split(',');
  // Régime établi : nombre de connexions croissant à travail constant (~600 coups/s, environ
  // la moitié du CX23) — le temps de réflexion grandit avec le nombre de tables. Ce qui varie
  // est donc le coût des connexions ouvertes pour le proxy, pas la charge de l'API.
  if (scenarios.includes('steady')) {
    const levels: [number, number][] = opt.quick
      ? [[100, 300]]
      : [
          [100, 600],
          [500, 3000],
          [1000, 6000],
          [2500, 15000],
        ];
    for (const [t, think] of levels)
      list.push({ scenario: 'steady', label: `${t}x4 think${think}`, run: (p) => runBots(p, t, think) });
  }
  // Saturation : 400 connexions, temps de réflexion décroissant jusqu'à saturer le CX23.
  if (scenarios.includes('saturation') && !opt.quick) {
    for (const think of [200, 150, 100, 70, 50])
      list.push({ scenario: 'saturation', label: `100x4 think${think}`, run: (p) => runBots(p, 100, think) });
  }
  if (scenarios.includes('storm')) {
    for (const n of opt.quick ? [400] : [2000, 10000])
      list.push({ scenario: 'storm', label: `storm ${n}`, run: (p) => runStorm(p, n) });
  }
  return list;
}

const proxies = opt.proxies!.split(',');
const plan: { proxy: string; c: Case; rep: number }[] = [];
for (let rep = 1; rep <= REPS; rep++) {
  // Ordre des proxys tiré au hasard à chaque répétition (dérive du voisinage, chauffe).
  const order = [...proxies].sort(() => Math.random() - 0.5);
  for (const c of cases()) for (const proxy of order) plan.push({ proxy, c, rep });
}

// Base prête (idempotent) : Postgres démarré, migrations appliquées.
await sut(`cd ${SUT_DIR} && docker compose up -d --wait pg >/dev/null 2>&1 && docker compose run --rm api migrate`);

/**
 * Vérification des réglages communs avant de mesurer : groupe et suite TLS négociés
 * (openssl s_client propose aussi X25519MLKEM768 : il ne doit pas être retenu), et
 * keep-alive vers l'API (connexions Unix restées ouvertes après 50 requêtes d'un client).
 */
async function checkProxy(proxy: string) {
  await startStack(proxy);
  const tls = await gen(
    `openssl s_client -connect ${opt.target}:443 -tls1_3 -brief </dev/null 2>&1 | grep -E 'Ciphersuite|Temp Key|group' | tr -s ' ' | paste -sd ';'`,
    { check: false },
  );
  const urls = Array.from({ length: 50 }, () => `https://${opt.target}/health`).join(' ');
  await gen(`curl -sk -o /dev/null ${urls}`);
  const upstreamOpen = Number(await sut(`ss -x | grep -c 'api.sock' || true`, { check: false }));
  return { proxy, tls, upstreamOpenAfter50: upstreamOpen };
}

mkdirSync('results', { recursive: true });
console.log(`${plan.length} mesures → ${opt.out}`);
const rtt = await gen(`ping -c 20 -i 0.2 -q ${opt.target} | tail -1`);
appendFileSync(
  opt.out!,
  JSON.stringify({ meta: { date: new Date().toISOString(), rtt, seconds: SECONDS, warmupMs: WARMUP_MS } }) + '\n',
);
for (const proxy of proxies.filter((p) => p !== 'direct')) {
  const check = await checkProxy(proxy);
  console.log(`vérification ${proxy} : ${check.tls} · connexions vers l'API ouvertes : ${check.upstreamOpenAfter50}`);
  appendFileSync(opt.out!, JSON.stringify({ check }) + '\n');
}

for (const [i, { proxy, c, rep }] of plan.entries()) {
  const tag = `[${i + 1}/${plan.length}] ${c.label} · ${proxy} · rep ${rep}`;
  try {
    await startStack(proxy);
    const result = await withSampler(proxy, () => c.run(proxy));
    const samples = await readSamples();
    const w = result.report.window as { from: number; to: number } | undefined;
    const system = w ? systemStats(samples, w.from, w.to, proxy) : null;
    const measured = Number(result.report.measured) || 0;
    const perMove =
      system && measured > 0
        ? {
            proxyCpuMsPerOp: Math.round((system.cpuMs.proxy / measured) * 1000) / 1000,
            apiCpuMsPerOp: Math.round((system.cpuMs.api / measured) * 1000) / 1000,
          }
        : null;
    const row = {
      scenario: c.scenario,
      label: c.label,
      proxy,
      rep,
      shards: result.shards,
      ...result.report,
      system,
      perMove,
    };
    appendFileSync(opt.out!, JSON.stringify(row) + '\n');
    const l = result.report.latencyMs as Record<string, number>;
    console.log(
      `${tag} → ${result.report.perSecond}/s p50 ${l.p50} p99 ${l.p99} p99.9 ${l.p999 ?? '-'} ms` +
        (system
          ? ` · SUT ${system.sutCpuPct}% steal ${system.stealPct}% · proxy ${perMove?.proxyCpuMsPerOp} ms/op`
          : '') +
        ` · erreurs ${JSON.stringify(result.report.errors)}`,
    );
  } catch (error) {
    console.error(`${tag} ÉCHEC : ${(error as Error).message}`);
    appendFileSync(
      opt.out!,
      JSON.stringify({ scenario: c.scenario, label: c.label, proxy, rep, failed: String(error) }) + '\n',
    );
  }
}
await sut(`cd ${SUT_DIR} && docker compose stop -t 20 ${ALL_SERVICES} >/dev/null 2>&1; true`);
console.log('Terminé.');
