// Deltas de manche : construits par le serveur après un coup, appliqués par les clients.
// `applyMove` doit reproduire exactement `gameView` côté serveur (voir delta.test.ts).

import { formatCard, formatCards, parseCard, type Card } from '../cards';
import { MAX_EVENTS, type GameEvent, type GameState } from '../state';
import type { GameView, TrickEntryView } from '../view';
import type { MoveDelta } from './messages';

/** Delta d'un coup, à partir de l'état *après* le coup. */
export function moveDelta(
  g: GameState,
  version: number,
  move: { kind: MoveDelta['kind']; seat: number; cards: readonly Card[] | null; count: number; to?: number },
  events: GameEvent[],
): MoveDelta {
  return {
    version,
    kind: move.kind,
    seat: move.seat,
    count: move.count,
    cards: move.cards === null ? null : [...move.cards],
    to: move.to ?? -1,
    phase: g.phase,
    turn: g.turn,
    trickSize: g.trickSize,
    trickRank: g.trickRank,
    lastPlayer: g.lastPlayer,
    passes: g.passes,
    turnStartedAt: g.turnStartedAt,
    events,
  };
}

const CLOSING = new Set(['cut', 'two', 'won', 'round_over']);

export interface PlayerSide {
  view: GameView;
  /** Main du joueur (null pour un spectateur). */
  hand: string[] | null;
  me: number | null;
}

/** Fait avancer la vue d'un client. Ne modifie pas les objets reçus. */
export function applyMove(side: PlayerSide, d: MoveDelta): PlayerSide {
  const v = side.view;
  const counts = [...v.counts];
  let trick: TrickEntryView[] = v.trick;
  let exchanges = v.exchanges;
  let hand = side.hand;
  const lastBefore = v.lastPlayer;

  if (d.kind === 'play') {
    const cards = formatCards([...(d.cards ?? [])].sort((a, b) => a - b));
    trick = [...trick, { p: d.seat, c: cards }];
    counts[d.seat]! -= d.count;
    if (hand !== null && d.seat === side.me) hand = hand.filter((c) => !cards.includes(c));
  } else if (d.kind === 'pass') {
    trick = [...trick, { p: d.seat, pass: true }];
  } else {
    counts[d.seat]! -= d.count;
    counts[d.to]! += d.count;
    let marked = false;
    exchanges = exchanges.map((e) => {
      if (marked || e.from !== d.seat || e.done) return e;
      marked = true;
      const done = { ...e, done: true };
      if ('cards' in e) done.cards = d.cards === null ? null : formatCards([...d.cards].sort((a, b) => a - b));
      return done;
    });
    if (hand !== null && d.cards !== null) {
      const given = d.cards.map(formatCard);
      if (d.seat === side.me) hand = hand.filter((c) => !given.includes(c));
      else if (d.to === side.me) hand = [...hand, ...given].sort((a, b) => parseCard(a) - parseCard(b));
    }
  }

  // Fin de pli (ou de manche) : le pli passe en « pli précédent ».
  let prevTrick = v.prevTrick;
  let prevWinner = v.prevWinner;
  const closing = d.events.find((e) => CLOSING.has(e.type));
  if (closing !== undefined && trick.length > 0) {
    prevTrick = trick;
    prevWinner = closing.type === 'round_over' ? (d.kind === 'play' ? d.seat : lastBefore) : closing.player;
    trick = [];
  }

  const finished = [...v.finished];
  for (const e of d.events) {
    if (e.type === 'finished') finished.push(e.player);
    if (e.type === 'round_over') {
      for (let s = 0; s < counts.length; s++) if (counts[s]! > 0 && !finished.includes(s)) finished.push(s);
    }
  }

  const events = [...v.events, ...d.events];
  return {
    me: side.me,
    hand,
    view: {
      phase: d.phase,
      roundNo: v.roundNo,
      turn: d.turn,
      turnStartedAt: d.turnStartedAt,
      trick,
      trickSize: d.trickSize,
      trickRank: d.trickRank,
      lastPlayer: d.lastPlayer,
      passes: d.passes,
      prevTrick,
      prevWinner,
      finished,
      exchanges,
      events: events.length > MAX_EVENTS ? events.slice(events.length - MAX_EVENTS) : events,
      counts,
    },
  };
}
