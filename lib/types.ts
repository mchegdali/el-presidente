export type Role = 'president' | 'vice_president' | 'neutral' | 'vice_trou' | 'trou';
export type LobbyStatus = 'waiting' | 'exchange' | 'playing' | 'finished';
export type Phase = 'exchange' | 'playing' | 'over';

export interface Player {
  id: string;
  name: string;
  seat: number;
  role: Role | null;
  cards: number;
  position: number | null;
}

export type TrickEntry = { p: string; c: string[]; pass?: undefined } | { p: string; pass: true; c?: undefined };

export interface Exchange {
  from: string;
  to: string;
  count: number;
  done: boolean;
  /** Visible seulement par les deux joueurs concernés. */
  cards?: string[] | null;
}

export type GameEventType =
  | 'round_start'
  | 'exchange_done'
  | 'cut'
  | 'two'
  | 'won'
  | 'finished'
  | 'round_over';

export interface GameEvent {
  seq: number;
  type: GameEventType;
  player?: string;
  position?: number;
  /** round_start : pourquoi ce joueur commence. */
  reason?: 'queen' | 'trou';
}

export interface Game {
  phase: Phase;
  round_no: number;
  seats: string[];
  turn: string | null;
  trick: TrickEntry[];
  trick_size: number;
  trick_rank: number;
  last_player: string | null;
  passes: number;
  prev_trick: TrickEntry[];
  prev_winner: string | null;
  finished: string[];
  exchanges: Exchange[];
  events: GameEvent[];
}

export interface Lobby {
  id: string;
  code: string;
  status: LobbyStatus;
  round_no: number;
  version: number;
  host_id: string | null;
  notice: string | null;
}

export interface TableState {
  lobby: Lobby;
  me: string | null;
  players: Player[];
  game: Game | null;
  hand: string[] | null;
}
