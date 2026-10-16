import type { Card, Rank } from './cards';
import type { Hands } from './hand';

// Les joueurs sont désignés par leur siège : 0 … n - 1, dans l'ordre du tour.

export type Role = 'president' | 'vice_president' | 'neutral' | 'vice_trou' | 'trou';
export type Phase = 'exchange' | 'playing' | 'over';

/** Coup posé dans le pli : des cartes, ou une passe (`c` vaut null). */
export interface TrickEntry {
  p: number;
  c: Card[] | null;
}

export interface Exchange {
  from: number;
  to: number;
  count: number;
  /** Cartes données, une fois l'échange fait. */
  cards: Card[] | null;
  done: boolean;
}

export type GameEvent =
  | { seq: number; type: 'round_start'; player: number; reason: 'queen' | 'trou' }
  | { seq: number; type: 'exchange_done'; player: number }
  | { seq: number; type: 'cut' | 'two' | 'won'; player: number }
  | { seq: number; type: 'finished'; player: number; position: number }
  | { seq: number; type: 'round_over' }
  | { seq: number; type: 'timeout'; player: number; action: 'pass' | 'play' | 'give' };

/** Événement avant numérotation. */
export type NewGameEvent = GameEvent extends infer E ? (E extends GameEvent ? Omit<E, 'seq'> : never) : never;

export interface GameState {
  /** Nombre de sièges (3 à 8). */
  n: number;
  roundNo: number;
  phase: Phase;
  hands: Hands;
  /** Siège dont c'est le tour, -1 si personne. */
  turn: number;
  /** Début du tour en cours (ms). */
  turnStartedAt: number;
  trick: TrickEntry[];
  /** Nombre de cartes par coup dans ce pli, 0 = pli à ouvrir. */
  trickSize: number;
  trickRank: Rank;
  /** Dernier joueur à avoir posé des cartes, -1 si personne. */
  lastPlayer: number;
  /** Passes consécutives depuis le dernier coup. */
  passes: number;
  prevTrick: TrickEntry[];
  prevWinner: number;
  /** Ordre de sortie. */
  finished: number[];
  exchanges: Exchange[];
  /** 20 derniers événements. */
  events: GameEvent[];
  eventSeq: number;
}

export const MAX_EVENTS = 20;
