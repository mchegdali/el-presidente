// Vue d'une manche pour un joueur : jamais les mains des autres, et les cartes d'un
// échange seulement pour ses deux participants.

import { formatCards } from './cards';
import { cardsOf, handSize } from './hand';
import type { GameEvent, GameState, Phase, TrickEntry } from './state';

export type TrickEntryView = { p: number; c: string[] } | { p: number; pass: true };

export interface ExchangeView {
  from: number;
  to: number;
  count: number;
  done: boolean;
  /** Présent seulement pour les deux joueurs concernés. */
  cards?: string[] | null;
}

export interface GameView {
  phase: Phase;
  roundNo: number;
  turn: number;
  turnStartedAt: number;
  trick: TrickEntryView[];
  trickSize: number;
  trickRank: number;
  lastPlayer: number;
  passes: number;
  prevTrick: TrickEntryView[];
  prevWinner: number;
  finished: number[];
  exchanges: ExchangeView[];
  events: GameEvent[];
  /** Nombre de cartes de chaque siège. */
  counts: number[];
}

const entryView = (e: TrickEntry): TrickEntryView =>
  e.c === null ? { p: e.p, pass: true } : { p: e.p, c: formatCards(e.c) };

export function gameView(g: GameState, seat: number | null): GameView {
  const counts: number[] = [];
  for (let s = 0; s < g.n; s++) counts.push(handSize(g.hands, s));
  return {
    phase: g.phase,
    roundNo: g.roundNo,
    turn: g.turn,
    turnStartedAt: g.turnStartedAt,
    trick: g.trick.map(entryView),
    trickSize: g.trickSize,
    trickRank: g.trickRank,
    lastPlayer: g.lastPlayer,
    passes: g.passes,
    prevTrick: g.prevTrick.map(entryView),
    prevWinner: g.prevWinner,
    finished: [...g.finished],
    exchanges: g.exchanges.map((e) =>
      seat !== null && (e.from === seat || e.to === seat)
        ? { from: e.from, to: e.to, count: e.count, done: e.done, cards: e.cards && formatCards(e.cards) }
        : { from: e.from, to: e.to, count: e.count, done: e.done },
    ),
    events: g.events.map((e) => ({ ...e })),
    counts,
  };
}

/** Main d'un joueur, triée, en texte. */
export const handView = (g: GameState, seat: number): string[] => formatCards(cardsOf(g.hands, seat));
