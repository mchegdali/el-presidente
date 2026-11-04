// Synthèse d'une campagne (results/*.jsonl de run.ts) : médiane des répétitions par
// scénario × proxy, et écart relatif (max − min) / médiane pour juger du bruit.
//
//   bun run report.ts results/campaign.jsonl > results/campaign.md

interface Row {
  scenario: string;
  label: string;
  proxy: string;
  rep: number;
  failed?: string;
  perSecond?: number;
  measured?: number;
  latencyMs?: Record<string, number | null>;
  errors?: number | Record<string, number>;
  closeCodes?: Record<string, number>;
  httpErrors?: Record<string, number>;
  generators?: { cpuMs: number; wallMs: number }[];
  system?: {
    sutCpuPct: number;
    stealPct: number;
    peakMemMb: { proxy: number; api: number };
  } | null;
  perMove?: { proxyCpuMsPerOp: number; apiCpuMsPerOp: number } | null;
}

const file = Bun.argv[2];
if (!file) throw new Error('usage : bun run report.ts results/campaign.jsonl');
const lines = (await Bun.file(file).text())
  .split('\n')
  .filter(Boolean)
  .map((l) => JSON.parse(l));
const meta = lines.find((l) => l.meta)?.meta;
const checks = lines.filter((l) => l.check).map((l) => l.check);
const rows: Row[] = lines.filter((l) => l.scenario);

const median = (xs: number[]) => {
  const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (s.length === 0) return NaN;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};
const spread = (xs: number[]) => {
  const s = xs.filter((x) => Number.isFinite(x));
  const m = median(s);
  return s.length < 2 || !m ? NaN : (Math.max(...s) - Math.min(...s)) / m;
};
const errCount = (r: Row) => {
  const e = typeof r.errors === 'number' ? r.errors : Object.values(r.errors ?? {}).reduce((a, b) => a + b, 0);
  const h = Object.values(r.httpErrors ?? {}).reduce((a, b) => a + b, 0);
  return e + h;
};
// Générateur saturé (un fil JS chacun) : mesure suspecte au-delà de 70 % d'un cœur.
const genBusy = (r: Row) => Math.max(...(r.generators ?? []).map((g) => (g.wallMs ? g.cpuMs / g.wallMs : 0)), 0);

const fmt = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d).replace('.', ',') : '—');
const pct = (v: number) => (Number.isFinite(v) ? `${Math.round(v * 100)} %` : '—');

const out: string[] = [];
out.push(`# Campagne du ${meta?.date?.slice(0, 10) ?? '?'}`, '');
out.push(
  `RTT générateur → SUT : ${meta?.rtt ?? '?'} · ${meta?.seconds ?? '?'} s par mesure, ${(meta?.warmupMs ?? 0) / 1000} s ignorées au début.`,
  '',
);
if (checks.length) {
  out.push(
    '## Vérifications',
    '',
    "| Proxy | TLS négocié | Connexions vers l'API après 50 requêtes |",
    '| --- | --- | --- |',
  );
  for (const c of checks) out.push(`| ${c.proxy} | ${c.tls} | ${c.upstreamOpenAfter50} |`);
  out.push('');
}

const failed = rows.filter((r) => r.failed);
const labels = [...new Set(rows.map((r) => `${r.scenario}|${r.label}`))];
const proxies = [...new Set(rows.map((r) => r.proxy))];

for (const scenario of ['steady', 'saturation', 'storm']) {
  const ls = labels.filter((l) => l.startsWith(`${scenario}|`)).map((l) => l.split('|')[1]!);
  if (ls.length === 0) continue;
  out.push(`## ${scenario}`, '');
  out.push(
    '| Charge | Proxy | n | /s | p50 | p99 | p99,9 | écart p99 | CPU SUT | CPU proxy / op | CPU API / op | Mém. proxy | Erreurs | Gén. max |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  );
  for (const label of ls) {
    for (const proxy of proxies) {
      const rs = rows.filter((r) => r.label === label && r.proxy === proxy && !r.failed);
      if (rs.length === 0) continue;
      const lat = (k: string) => rs.map((r) => Number(r.latencyMs?.[k]));
      out.push(
        `| ${label} | ${proxy} | ${rs.length} | ${Math.round(median(rs.map((r) => r.perSecond ?? NaN)))} | ` +
          `${fmt(median(lat('p50')))} | ${fmt(median(lat('p99')))} | ${fmt(median(lat('p999')))} | ${pct(spread(lat('p99')))} | ` +
          `${fmt(median(rs.map((r) => r.system?.sutCpuPct ?? NaN)), 0)} % | ` +
          `${fmt(median(rs.map((r) => r.perMove?.proxyCpuMsPerOp ?? NaN)), 3)} | ` +
          `${fmt(median(rs.map((r) => r.perMove?.apiCpuMsPerOp ?? NaN)), 3)} | ` +
          `${fmt(median(rs.map((r) => r.system?.peakMemMb.proxy ?? NaN)), 0)} Mo | ` +
          `${rs.map(errCount).reduce((a, b) => a + b, 0)} | ${pct(Math.max(...rs.map(genBusy)))} |`,
      );
    }
  }
  out.push('');
}

const steal = rows.map((r) => r.system?.stealPct ?? NaN).filter(Number.isFinite);
out.push(
  `Vol de CPU (steal) : médiane ${fmt(median(steal), 1)} %, max ${fmt(Math.max(...steal), 1)} %.`,
  `Mesures en échec : ${failed.length}${failed.length ? ` (${failed.map((f) => `${f.label} · ${f.proxy} · ${f.rep}`).join(', ')})` : ''}.`,
);
console.log(out.join('\n'));
