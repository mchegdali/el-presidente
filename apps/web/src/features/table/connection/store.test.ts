import {
  cardsOf,
  forcedRank,
  gameView,
  handView,
  legalPlays,
  passTurn,
  playCards,
  seededRng,
  startRound,
} from '@el-presidente/game';
import { moveDelta, type TableSnapshot } from '@el-presidente/game/protocol';
import { describe, expect, test } from 'vitest';
import { reduceTable } from './store';

function setup() {
  const r = startRound({ players: 3, roundNo: 1, roles: [null, null, null], rng: seededRng(4), now: 0 });
  if (r.isErr()) throw r.error;
  const g = r.value.state;
  const snapshot: TableSnapshot = {
    version: 1,
    code: 'ABCDE',
    status: 'playing',
    roundNo: 1,
    hostSeat: 0,
    notice: null,
    turnLimit: null,
    me: 0,
    players: ['Ana', 'Beto', 'Carla'].map((name, seat) => ({
      id: `u${seat}`,
      seat,
      name,
      image: null,
      role: null,
      online: true,
      emote: null,
      emoteAt: null,
    })),
    game: gameView(g, 0),
    hand: handView(g, 0),
    chatLast: null,
    now: 0,
  };
  return { g, snapshot };
}

describe('réducteur de table côté client', () => {
  test('une manche entière en deltas : même vue que le serveur, rôles attribués à la fin', () => {
    const { g, snapshot } = setup();
    let state: TableSnapshot = snapshot;
    let version = 1;
    while (g.phase !== 'over') {
      const seat = g.turn;
      const play = legalPlays(cardsOf(g.hands, seat), g.trickSize, g.trickRank, forcedRank(g.trick, g.trickSize))[0];
      const move =
        play === undefined
          ? ({ kind: 'pass', seat, cards: null, count: 0 } as const)
          : ({ kind: 'play', seat, cards: play, count: play.length } as const);
      const events = (play === undefined ? passTurn(g, seat, 0) : playCards(g, seat, play, 0)).unwrap();
      const next = reduceTable(state, { op: 'move', ...moveDelta(g, ++version, move, events) });
      if (next === 'resync' || next === undefined) throw new Error('resync inattendu');
      state = next;
      expect(state.game).toEqual(gameView(g, 0));
      expect(state.hand).toEqual(handView(g, 0));
    }
    expect(state.status).toBe('finished');
    expect(state.players.map((p) => p.role).filter(Boolean).length).toBe(3);
  });

  test('message manqué : resynchronisation ; message en double : ignoré', () => {
    const { g, snapshot } = setup();
    const seat = g.turn;
    const play = [cardsOf(g.hands, seat)[0]!];
    const events = playCards(g, seat, play, 0).unwrap();
    const delta = moveDelta(g, 3, { kind: 'play', seat, cards: play, count: 1 }, events);
    expect(reduceTable(snapshot, { op: 'move', ...delta })).toBe('resync');
    expect(reduceTable(snapshot, { op: 'move', ...delta, version: 1 })).toBe(snapshot);
  });

  test('emotes et présence', () => {
    const { snapshot } = setup();
    let s = reduceTable(snapshot, { op: 'emote', seat: 1, emote: 3, at: 42 }) as TableSnapshot;
    expect(s.players[1]).toMatchObject({ emote: 3, emoteAt: 42 });
    s = reduceTable(s, { op: 'presence', seat: 2, online: false }) as TableSnapshot;
    expect(s.players[2]!.online).toBe(false);
  });
});
