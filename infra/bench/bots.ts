// Banc de charge : des bots Bun jouent de vraies parties légales sur le vrai protocole.
//
//   bun run bots.ts --api https://api.example --tables 50 --players 4 --think 300 --seconds 60
//
// - Chaque table : N bots (connexion de test de l'API, ENABLE_TEST_LOGIN), un hôte qui
//   crée la table et relance les manches, des coups choisis par les règles de
//   @el-presidente/game (même code que le serveur : aucune divergence possible).
// - Modèle ouvert : chaque coup a une heure d'envoi prévue (rythme fixe par table) ; la
//   latence est mesurée depuis cette heure prévue jusqu'à la réception du delta par le
//   joueur, ce qui corrige la « coordinated omission » (un serveur lent n'est pas masqué).
// - Ne jamais lancer sur le serveur testé : le générateur fausserait la mesure.

import { forcedRank, legalPlays, parseCard } from '@el-presidente/game';
import {
  applyMove,
  decodeServer,
  encodeClient,
  Writer,
  type ClientMessage,
  type ServerMessage,
  type TableSnapshot,
} from '@el-presidente/game/protocol';
import { parseArgs } from 'node:util';

const { values: opt } = parseArgs({
  options: {
    api: { type: 'string', default: 'http://localhost:4000' },
    origin: { type: 'string', default: 'http://localhost:3000' },
    tables: { type: 'string', default: '10' },
    players: { type: 'string', default: '4' },
    think: { type: 'string', default: '300' },
    seconds: { type: 'string', default: '30' },
    insecure: { type: 'boolean', default: false },
    'api-pid': { type: 'string' },
  },
});

const API = opt.api!;
const WS = API.replace(/^http/, 'ws');
const TABLES = Number(opt.tables);
const PLAYERS = Number(opt.players);
const THINK_MS = Number(opt.think);
const DURATION_MS = Number(opt.seconds) * 1000;
const tls = opt.insecure ? { rejectUnauthorized: false } : undefined;

const latencies: number[] = [];
let moves = 0;
let rejects = 0;
let errors = 0;
const rejectReasons = new Map<string, number>();
const closeCodes = new Map<string, number>();
const httpErrors = new Map<string, number>();

async function post<T>(path: string, cookie: string | null, body: unknown = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: opt.origin!, ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
    tls,
  } as RequestInit);
  if (!res.ok) throw new Error(`${path} → ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

class Bot {
  ws!: WebSocket;
  state: TableSnapshot | undefined;
  private w = new Writer(64);
  private req = 0;
  /** Heure d'envoi prévue du prochain coup (modèle ouvert). */
  nextAt = 0;
  pendingSince: number | null = null;
  /** Coup programmé, pas encore envoyé. */
  scheduled = false;
  closing = false;
  onChange: () => void = () => {};

  constructor(
    readonly name: string,
    readonly cookie: string,
  ) {}

  connect(code: string): Promise<void> {
    this.ws = new WebSocket(`${WS}/tables/${code}/ws`, {
      headers: { cookie: this.cookie, origin: opt.origin! },
      tls,
    } as never);
    this.ws.binaryType = 'arraybuffer';
    this.ws.addEventListener('message', (e) => this.onMessage(decodeServer(new Uint8Array(e.data as ArrayBuffer))));
    this.ws.addEventListener('close', (e) => {
      if (this.closing) return;
      errors++;
      closeCodes.set(`${e.code} ${e.reason}`, (closeCodes.get(`${e.code} ${e.reason}`) ?? 0) + 1);
    });
    return new Promise((resolve, reject) => {
      this.ws.addEventListener('open', () => resolve(), { once: true });
      this.ws.addEventListener('error', () => reject(new Error('WebSocket refusée')), { once: true });
    });
  }

  send(msg: ClientMessage) {
    this.ws.send(encodeClient(this.w, msg));
  }

  private onMessage(msg: ServerMessage) {
    if (msg.op === 'snapshot') this.state = msg.snapshot;
    else if (msg.op === 'move' && this.state?.game) {
      if (msg.version !== this.state.version + 1) {
        this.send({ op: 'sync' });
        return;
      }
      const next = applyMove({ view: this.state.game, hand: this.state.hand, me: this.state.me }, msg);
      const status = next.view.phase === 'over' ? 'finished' : next.view.phase;
      this.state = { ...this.state, version: msg.version, status, game: next.view, hand: next.hand };
      if (msg.seat === this.state.me && this.pendingSince !== null) {
        latencies.push(performance.now() - this.pendingSince);
        this.pendingSince = null;
        moves++;
      }
    } else if (msg.op === 'reject') {
      rejects++;
      rejectReasons.set(msg.message, (rejectReasons.get(msg.message) ?? 0) + 1);
      this.pendingSince = null;
      this.send({ op: 'sync' });
    }
    this.onChange();
  }

  /** Coup à jouer (ou à donner) si c'est à ce bot d'agir. */
  decide(): ClientMessage | null {
    const s = this.state;
    const g = s?.game;
    if (!s || !g || s.me === null || s.hand === null || this.pendingSince !== null || this.scheduled) return null;
    const hand = s.hand.map(parseCard).sort((a, b) => a - b);
    if (g.phase === 'exchange') {
      const give = g.exchanges.find((e) => e.from === s.me && !e.done);
      return give ? { op: 'give', req: ++this.req, cards: hand.slice(0, give.count) } : null;
    }
    if (g.phase !== 'playing' || g.turn !== s.me) return null;
    // Contrainte « carte ou rien » recalculée à partir de la vue du pli.
    const trick = g.trick.map((t) => ({ p: t.p, c: 'c' in t ? t.c.map(parseCard) : null }));
    const plays = legalPlays(hand, g.trickSize, g.trickRank, forcedRank(trick, g.trickSize));
    const play = plays[0];
    return play === undefined ? { op: 'pass', req: ++this.req } : { op: 'play', req: ++this.req, cards: play };
  }
}

async function runTable(index: number, stopAt: number) {
  const bots: Bot[] = [];
  for (let i = 0; i < PLAYERS; i++) {
    const { cookie } = await post<{ cookie: string }>('/test/login', null, { name: `B${index}-${i}` });
    bots.push(new Bot(`B${index}-${i}`, cookie));
  }
  const host = bots[0]!;
  const { code } = await post<{ code: string }>('/tables', host.cookie, {});
  for (const b of bots.slice(1)) await post(`/tables/${code}/join`, b.cookie);
  await Promise.all(bots.map((b) => b.connect(code)));

  // Manche relancée par l'hôte quand la précédente est finie, une seule fois par manche.
  let startedRound = 0;
  const tick = () => {
    if (performance.now() > stopAt) return;
    const s = host.state;
    if (s !== undefined && s.status === 'finished' && startedRound <= s.roundNo) {
      startedRound = s.roundNo + 1;
      post(`/tables/${code}/rounds`, host.cookie).catch((e: Error) =>
        httpErrors.set(e.message.slice(0, 120), (httpErrors.get(e.message.slice(0, 120)) ?? 0) + 1),
      );
      return;
    }
    for (const b of bots) {
      const move = b.decide();
      if (move === null) continue;
      const now = performance.now();
      b.nextAt = Math.max(b.nextAt + THINK_MS, now - THINK_MS);
      const at = Math.max(b.nextAt, now);
      b.scheduled = true;
      setTimeout(() => {
        b.scheduled = false;
        const current = b.decide(); // l'état a pu changer (passe automatique…)
        if (current === null) return;
        b.pendingSince = at; // latence comptée depuis l'heure prévue
        b.send(current);
      }, at - now);
    }
  };
  for (const b of bots) b.onChange = tick;
  await post(`/tables/${code}/rounds`, host.cookie).catch((e: Error) => httpErrors.set(e.message.slice(0, 120), 1));
  return bots;
}

function cpuSecondsOf(pid: string | undefined): number | null {
  if (!pid) return null;
  try {
    const f = require('node:fs').readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1].split(' ');
    return (Number(f[11]) + Number(f[12])) / 100;
  } catch {
    return null;
  }
}

const pct = (sorted: number[], p: number) =>
  sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? NaN;

const started = performance.now();
const stopAt = started + DURATION_MS;
const apiCpuBefore = cpuSecondsOf(opt['api-pid']);
const genCpuBefore = process.cpuUsage();
const all = await Promise.all(Array.from({ length: TABLES }, (_, i) => runTable(i, stopAt)));
await Bun.sleep(Math.max(0, stopAt - performance.now()) + 500);
for (const bots of all)
  for (const b of bots) {
    b.closing = true;
    b.ws.close();
  }

const elapsed = (performance.now() - started) / 1000;
const sorted = latencies.sort((a, b) => a - b);
const apiCpu = cpuSecondsOf(opt['api-pid']);
const gen = process.cpuUsage(genCpuBefore);
const report = {
  tables: TABLES,
  players: PLAYERS,
  connections: TABLES * PLAYERS,
  seconds: Math.round(elapsed),
  moves,
  movesPerSecond: Math.round(moves / elapsed),
  rejects,
  rejectReasons: Object.fromEntries(rejectReasons),
  errors,
  closeCodes: Object.fromEntries(closeCodes),
  httpErrors: Object.fromEntries(httpErrors),
  latencyMs: {
    p50: pct(sorted, 50),
    p95: pct(sorted, 95),
    p99: pct(sorted, 99),
    p999: pct(sorted, 99.9),
    max: sorted.at(-1),
  },
  apiCpuMsPerMove:
    apiCpu !== null && apiCpuBefore !== null && moves > 0 ? ((apiCpu - apiCpuBefore) * 1000) / moves : null,
  generator: { cpuMs: Math.round((gen.user + gen.system) / 1000), rssMb: Math.round(process.memoryUsage().rss / 1e6) },
};
console.log(
  JSON.stringify(report, (_k, v) => (typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 100) / 100 : v), 2),
);
process.exit(0);
