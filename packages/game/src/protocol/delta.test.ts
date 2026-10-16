import { describe, expect, test } from 'bun:test';
import { forcedRank, giveCards, passTurn, playCards, startRound, autoMove } from '../engine';
import { cardsOf } from '../hand';
import { legalPlays } from '../hints';
import { seededRng, type Rng } from '../random';
import type { GameEvent, GameState, Role } from '../state';
import { gameView, handView } from '../view';
import { Writer } from './buffer';
import { applyMove, moveDelta, type PlayerSide } from './delta';
import { decodeClient, decodeServer, encodeClient, encodeServer, type ClientMessage, type MoveDelta } from './messages';

const writer = new Writer(64);

/** Aller-retour binaire : le client reçoit exactement ce que le serveur a encodé. */
function wire(d: MoveDelta): MoveDelta {
  const msg = decodeServer(encodeServer(writer, { op: 'move', ...d }).slice());
  if (msg.op !== 'move') throw new Error('opcode inattendu');
  const { op: _op, ...delta } = msg;
  return delta;
}

function sides(g: GameState): PlayerSide[] {
  return Array.from({ length: g.n }, (_, s) => ({ me: s, hand: handView(g, s), view: gameView(g, s) }));
}

function check(g: GameState, all: PlayerSide[]) {
  for (let s = 0; s < g.n; s++) {
    expect(all[s]!.view).toEqual(gameView(g, s));
    expect(all[s]!.hand).toEqual(handView(g, s));
  }
}

function broadcast(
  g: GameState,
  all: PlayerSide[],
  version: number,
  move: Parameters<typeof moveDelta>[2],
  events: GameEvent[],
) {
  for (let s = 0; s < g.n; s++) {
    // Un don n'est visible en détail que par ses deux participants.
    const hidden = move.kind === 'give' && s !== move.seat && s !== move.to;
    const d = moveDelta(g, version, hidden ? { ...move, cards: null } : move, events);
    all[s] = applyMove(all[s]!, wire(d));
  }
}

function playRound(n: number, roles: (Role | null)[], rng: Rng, roundNo: number) {
  const started = startRound({ players: n, roundNo, roles, rng, now: 0 });
  if (started.isErr()) throw started.error;
  const g = started.value.state;
  const all = sides(g);
  let version = 1;
  let now = 0;

  for (const ex of g.exchanges.filter((e) => !e.done)) {
    // La passe automatique pendant l'échange donne pour tout le monde d'un coup : le serveur
    // renvoie alors un état complet. Ici, chacun donne à la main.
    const gift = cardsOf(g.hands, ex.from).slice(0, ex.count);
    const r = giveCards(g, ex.from, gift, ++now);
    if (r.isErr()) throw r.error;
    broadcast(g, all, ++version, { kind: 'give', seat: ex.from, to: ex.to, cards: gift, count: gift.length }, r.value);
    check(g, all);
  }

  for (let step = 0; step < 2000 && g.phase !== 'over'; step++) {
    const seat = g.turn;
    now += 1000;
    if (rng(10) === 0) {
      // Passe automatique : un coup normal précédé d'un événement « timeout ».
      const before = g.trickSize;
      const own = cardsOf(g.hands, seat);
      const events = autoMove(g, now);
      const played = before === 0 ? [own[0]!] : null;
      broadcast(
        g,
        all,
        ++version,
        played === null
          ? { kind: 'pass', seat, cards: null, count: 0 }
          : { kind: 'play', seat, cards: played, count: 1 },
        events,
      );
    } else {
      const plays = legalPlays(cardsOf(g.hands, seat), g.trickSize, g.trickRank, forcedRank(g.trick, g.trickSize));
      if (plays.length === 0 || (g.trickSize > 0 && rng(10) < 3)) {
        const r = passTurn(g, seat, now);
        if (r.isErr()) throw r.error;
        broadcast(g, all, ++version, { kind: 'pass', seat, cards: null, count: 0 }, r.value);
      } else {
        const choice = plays[rng(plays.length)]!;
        const r = playCards(g, seat, choice, now);
        if (r.isErr()) throw r.error;
        broadcast(g, all, ++version, { kind: 'play', seat, cards: choice, count: choice.length }, r.value);
      }
    }
    check(g, all);
  }
  expect(g.phase).toBe('over');
  return g;
}

describe('deltas : la vue du client suit exactement celle du serveur', () => {
  test('300 manches aléatoires de 3 à 8 joueurs, avec échanges et passes automatiques', () => {
    const rng = seededRng(2024);
    for (let i = 0; i < 300; i++) {
      const n = 3 + (i % 6);
      const roles: (Role | null)[] =
        i % 2 === 0
          ? Array(n).fill(null)
          : n === 3
            ? ['president', 'neutral', 'trou']
            : ['president', 'vice_president', ...Array(n - 4).fill('neutral'), 'vice_trou', 'trou'];
      playRound(n, roles, rng, 1 + (i % 2));
    }
  });
});

describe('codec', () => {
  test('messages client : aller-retour et rejet des messages malformés', () => {
    const w = new Writer(8);
    for (const msg of [
      { op: 'play', req: 65535, cards: [0, 51, 7] },
      { op: 'pass', req: 3 },
      { op: 'give', req: 1, cards: [12, 13] },
      { op: 'emote', emote: 4 },
      { op: 'presence', active: false },
      { op: 'sync' },
      { op: 'chat', req: 9, body: '¡Hola! 🌶️ @Ana' },
    ] satisfies ClientMessage[]) {
      expect(decodeClient(encodeClient(w, msg).slice())).toEqual(msg);
    }
    expect(() => decodeClient(new Uint8Array([0x01, 0, 1, 1, 52]))).toThrow('carte invalide');
    expect(() => decodeClient(new Uint8Array([0x01, 0, 1, 5, 1, 2, 3, 4, 5]))).toThrow('trop longue');
    expect(() => decodeClient(new Uint8Array([0x02, 0]))).toThrow('tronqué');
    expect(() => decodeClient(new Uint8Array([0x02, 0, 1, 9]))).toThrow('en trop');
    expect(() => decodeClient(new Uint8Array([0x04, 99]))).toThrow('emote');
    expect(() => decodeClient(new Uint8Array([0x7f]))).toThrow('opcode');
    expect(() => decodeClient(new Uint8Array([0x07, 0, 1, 0xff]))).toThrow();
  });

  test('un coup tient en quelques dizaines d’octets', () => {
    const w = new Writer();
    const size = encodeServer(w, {
      op: 'move',
      version: 42,
      kind: 'play',
      seat: 2,
      count: 2,
      cards: [20, 21],
      to: -1,
      phase: 'playing',
      turn: 3,
      trickSize: 2,
      trickRank: 6,
      lastPlayer: 2,
      passes: 0,
      turnStartedAt: Date.now(),
      events: [],
    }).length;
    expect(size).toBeLessThan(32);
  });
});
