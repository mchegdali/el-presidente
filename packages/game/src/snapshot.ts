// Forme sérialisable d'une manche (persistance en JSON, réhydratation au démarrage).

import type { Exchange, GameEvent, GameState, Phase, TrickEntry } from './state';

export interface GameSnapshot {
  v: 1;
  n: number;
  roundNo: number;
  phase: Phase;
  /** Deux mots de 32 bits par siège (voir hand.ts). */
  hands: number[];
  turn: number;
  turnStartedAt: number;
  trick: TrickEntry[];
  trickSize: number;
  trickRank: number;
  lastPlayer: number;
  passes: number;
  prevTrick: TrickEntry[];
  prevWinner: number;
  finished: number[];
  exchanges: Exchange[];
  events: GameEvent[];
  eventSeq: number;
}

export function toSnapshot(g: GameState): GameSnapshot {
  return {
    v: 1,
    n: g.n,
    roundNo: g.roundNo,
    phase: g.phase,
    hands: Array.from(g.hands),
    turn: g.turn,
    turnStartedAt: g.turnStartedAt,
    trick: g.trick,
    trickSize: g.trickSize,
    trickRank: g.trickRank,
    lastPlayer: g.lastPlayer,
    passes: g.passes,
    prevTrick: g.prevTrick,
    prevWinner: g.prevWinner,
    finished: g.finished,
    exchanges: g.exchanges,
    events: g.events,
    eventSeq: g.eventSeq,
  };
}

export function fromSnapshot(s: GameSnapshot): GameState {
  return {
    n: s.n,
    roundNo: s.roundNo,
    phase: s.phase,
    hands: Uint32Array.from(s.hands),
    turn: s.turn,
    turnStartedAt: s.turnStartedAt,
    trick: s.trick.map((e) => ({ p: e.p, c: e.c && [...e.c] })),
    trickSize: s.trickSize,
    trickRank: s.trickRank,
    lastPlayer: s.lastPlayer,
    passes: s.passes,
    prevTrick: s.prevTrick.map((e) => ({ p: e.p, c: e.c && [...e.c] })),
    prevWinner: s.prevWinner,
    finished: [...s.finished],
    exchanges: s.exchanges.map((e) => ({ ...e, cards: e.cards && [...e.cards] })),
    events: s.events.map((e) => ({ ...e })),
    eventSeq: s.eventSeq,
  };
}
