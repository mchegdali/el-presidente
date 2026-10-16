// Protocole WebSocket binaire d'une table.
//
// Chemin chaud (coups, emotes, présence) en binaire compact ; messages rares et riches
// (état complet, chat) en JSON dans une trame binaire. Un octet d'opcode en tête.
// Les cartes sont des entiers 0–51 (voir cards.ts), les joueurs des sièges 0–7.

import { DECK_SIZE } from '../cards';
import type { Role } from '../state';
import type { GameEvent, Phase } from '../state';
import type { GameView } from '../view';
import { DecodeError, Reader, Writer } from './buffer';

export { DecodeError };

export const EMOTES = ['👏', '😂', '😱', '🔥', '🌶️', '🤡', '😭', '💩', '🫡', '🎉', '😎', '🙏'] as const;
export type Emote = (typeof EMOTES)[number];

export const MAX_CHAT_BYTES = 1200; // 300 caractères, jusqu'à 4 octets chacun

// ---------------------------------------------------------------------------
// Client → serveur
// ---------------------------------------------------------------------------

export const C2S = {
  play: 0x01,
  pass: 0x02,
  give: 0x03,
  emote: 0x04,
  presence: 0x05,
  sync: 0x06,
  chat: 0x07,
} as const;

export type ClientMessage =
  | { op: 'play'; req: number; cards: number[] }
  | { op: 'pass'; req: number }
  | { op: 'give'; req: number; cards: number[] }
  | { op: 'emote'; emote: number }
  | { op: 'presence'; active: boolean }
  | { op: 'sync' }
  | { op: 'chat'; req: number; body: string };

function readCards(r: Reader): number[] {
  const cards = r.smallList(4);
  for (const c of cards) if (c >= DECK_SIZE) throw new DecodeError('carte invalide');
  return cards;
}

/** Décode un message client ; lève DecodeError s'il est malformé. */
export function decodeClient(data: Uint8Array): ClientMessage {
  const r = new Reader(data);
  const op = r.u8();
  let msg: ClientMessage;
  switch (op) {
    case C2S.play:
      msg = { op: 'play', req: r.u16(), cards: readCards(r) };
      break;
    case C2S.pass:
      msg = { op: 'pass', req: r.u16() };
      break;
    case C2S.give:
      msg = { op: 'give', req: r.u16(), cards: readCards(r) };
      break;
    case C2S.emote: {
      const emote = r.u8();
      if (emote >= EMOTES.length) throw new DecodeError('emote inconnue');
      msg = { op: 'emote', emote };
      break;
    }
    case C2S.presence:
      msg = { op: 'presence', active: r.u8() === 1 };
      break;
    case C2S.sync:
      msg = { op: 'sync' };
      break;
    case C2S.chat:
      return { op: 'chat', req: r.u16(), body: r.text(MAX_CHAT_BYTES) };
    default:
      throw new DecodeError('opcode inconnu');
  }
  r.end();
  return msg;
}

export function encodeClient(w: Writer, msg: ClientMessage): Uint8Array {
  w.reset();
  switch (msg.op) {
    case 'play':
    case 'give':
      w.u8(C2S[msg.op]).u16(msg.req).u8(msg.cards.length).bytes(msg.cards);
      break;
    case 'pass':
      w.u8(C2S.pass).u16(msg.req);
      break;
    case 'emote':
      w.u8(C2S.emote).u8(msg.emote);
      break;
    case 'presence':
      w.u8(C2S.presence).u8(msg.active ? 1 : 0);
      break;
    case 'sync':
      w.u8(C2S.sync);
      break;
    case 'chat':
      w.u8(C2S.chat).u16(msg.req).text(msg.body);
      break;
  }
  return w.finish();
}

// ---------------------------------------------------------------------------
// Serveur → client
// ---------------------------------------------------------------------------

export const S2C = {
  snapshot: 0x80,
  ack: 0x81,
  reject: 0x82,
  move: 0x83,
  hand: 0x84,
  emote: 0x85,
  presence: 0x86,
  chat: 0x87,
  fatal: 0x88,
} as const;

export type LobbyStatus = 'waiting' | 'exchange' | 'playing' | 'finished';

export interface PlayerSnapshot {
  /** Identifiant du compte. */
  id: string;
  seat: number;
  name: string;
  image: string | null;
  role: Role | null;
  online: boolean;
  emote: number | null;
  emoteAt: number | null;
}

/** État complet d'une table vu par un joueur (connexion, resynchronisation, changement de table). */
export interface TableSnapshot {
  version: number;
  code: string;
  status: LobbyStatus;
  roundNo: number;
  hostSeat: number;
  notice: string | null;
  /** Délai par tour en secondes ; null = pas de passe automatique. */
  turnLimit: number | null;
  /** Siège du joueur, null s'il n'est pas à la table. */
  me: number | null;
  players: PlayerSnapshot[];
  game: GameView | null;
  hand: string[] | null;
  /** Dernier message du chat. */
  chatLast: number | null;
  /** Heure du serveur (ms). */
  now: number;
}

export interface ChatMessage {
  id: number;
  /** Auteur (identifiant du compte), null s'il a quitté. */
  p: string | null;
  name: string;
  body: string;
  at: number;
}

/** Coup appliqué à une manche : de quoi faire avancer la vue de chaque client. */
export interface MoveDelta {
  version: number;
  kind: 'play' | 'pass' | 'give';
  seat: number;
  /** Nombre de cartes posées ou données. */
  count: number;
  /** Cartes, sauf pour un don vu par un tiers. */
  cards: number[] | null;
  /** Destinataire d'un don, -1 sinon. */
  to: number;
  phase: Phase;
  turn: number;
  trickSize: number;
  trickRank: number;
  lastPlayer: number;
  passes: number;
  turnStartedAt: number;
  events: GameEvent[];
}

export type ServerMessage =
  | { op: 'snapshot'; snapshot: TableSnapshot }
  | { op: 'ack'; req: number }
  | { op: 'reject'; req: number; message: string }
  | ({ op: 'move' } & MoveDelta)
  | { op: 'hand'; cards: number[] }
  | { op: 'emote'; seat: number; emote: number; at: number }
  | { op: 'presence'; seat: number; online: boolean }
  | { op: 'chat'; message: ChatMessage }
  | { op: 'fatal'; message: string };

const PHASES: Phase[] = ['exchange', 'playing', 'over'];
const KINDS = ['play', 'pass', 'give'] as const;
const EVENT_TYPES = ['round_start', 'exchange_done', 'cut', 'two', 'won', 'finished', 'round_over', 'timeout'] as const;
const TIMEOUT_ACTIONS = ['pass', 'play', 'give'] as const;

function writeEvent(w: Writer, e: GameEvent): void {
  w.u8(EVENT_TYPES.indexOf(e.type)).u16(e.seq);
  switch (e.type) {
    case 'round_start':
      w.i8(e.player).u8(e.reason === 'trou' ? 1 : 0);
      break;
    case 'finished':
      w.i8(e.player).u8(e.position);
      break;
    case 'timeout':
      w.i8(e.player).u8(TIMEOUT_ACTIONS.indexOf(e.action));
      break;
    case 'round_over':
      w.i8(-1).u8(0);
      break;
    default:
      w.i8(e.player).u8(0);
  }
}

function readEvent(r: Reader): GameEvent {
  const type = EVENT_TYPES[r.u8()];
  const seq = r.u16();
  const player = r.i8();
  const extra = r.u8();
  switch (type) {
    case 'round_start':
      return { seq, type, player, reason: extra === 1 ? 'trou' : 'queen' };
    case 'finished':
      return { seq, type, player, position: extra };
    case 'timeout':
      return { seq, type, player, action: TIMEOUT_ACTIONS[extra] ?? 'pass' };
    case 'round_over':
      return { seq, type };
    case 'exchange_done':
    case 'cut':
    case 'two':
    case 'won':
      return { seq, type, player };
    default:
      throw new DecodeError('événement inconnu');
  }
}

export function encodeServer(w: Writer, msg: ServerMessage): Uint8Array {
  w.reset();
  switch (msg.op) {
    case 'snapshot':
      w.u8(S2C.snapshot).text(JSON.stringify(msg.snapshot));
      break;
    case 'ack':
      w.u8(S2C.ack).u16(msg.req);
      break;
    case 'reject':
      w.u8(S2C.reject).u16(msg.req).text(msg.message);
      break;
    case 'move':
      w.u8(S2C.move)
        .u32(msg.version)
        .u8(KINDS.indexOf(msg.kind))
        .i8(msg.seat)
        .u8(msg.count)
        .u8(msg.cards === null ? 0 : 1);
      if (msg.cards !== null) w.bytes(msg.cards);
      w.i8(msg.to)
        .u8(PHASES.indexOf(msg.phase))
        .i8(msg.turn)
        .u8(msg.trickSize)
        .u8(msg.trickRank)
        .i8(msg.lastPlayer)
        .u8(msg.passes)
        .f64(msg.turnStartedAt)
        .u8(msg.events.length);
      for (const e of msg.events) writeEvent(w, e);
      break;
    case 'hand':
      w.u8(S2C.hand).u8(msg.cards.length).bytes(msg.cards);
      break;
    case 'emote':
      w.u8(S2C.emote).i8(msg.seat).u8(msg.emote).f64(msg.at);
      break;
    case 'presence':
      w.u8(S2C.presence)
        .i8(msg.seat)
        .u8(msg.online ? 1 : 0);
      break;
    case 'chat':
      w.u8(S2C.chat).text(JSON.stringify(msg.message));
      break;
    case 'fatal':
      w.u8(S2C.fatal).text(msg.message);
      break;
  }
  return w.finish();
}

const MAX_JSON_BYTES = 256 * 1024;

export function decodeServer(data: Uint8Array): ServerMessage {
  const r = new Reader(data);
  const op = r.u8();
  switch (op) {
    case S2C.snapshot:
      return { op: 'snapshot', snapshot: JSON.parse(r.text(MAX_JSON_BYTES)) as TableSnapshot };
    case S2C.ack:
      return { op: 'ack', req: r.u16() };
    case S2C.reject:
      return { op: 'reject', req: r.u16(), message: r.text(MAX_JSON_BYTES) };
    case S2C.move: {
      const version = r.u32();
      const kind = KINDS[r.u8()] ?? 'play';
      const seat = r.i8();
      const count = r.u8();
      const visible = r.u8() === 1;
      const cards: number[] | null = visible ? [] : null;
      if (cards !== null) for (let i = 0; i < count; i++) cards.push(r.u8());
      const to = r.i8();
      const phase = PHASES[r.u8()] ?? 'playing';
      const turn = r.i8();
      const trickSize = r.u8();
      const trickRank = r.u8();
      const lastPlayer = r.i8();
      const passes = r.u8();
      const turnStartedAt = r.f64();
      const events: GameEvent[] = [];
      for (let i = r.u8(); i > 0; i--) events.push(readEvent(r));
      return {
        op: 'move',
        version,
        kind,
        seat,
        count,
        cards,
        to,
        phase,
        turn,
        trickSize,
        trickRank,
        lastPlayer,
        passes,
        turnStartedAt,
        events,
      };
    }
    case S2C.hand:
      return { op: 'hand', cards: r.smallList(DECK_SIZE) };
    case S2C.emote:
      return { op: 'emote', seat: r.i8(), emote: r.u8(), at: r.f64() };
    case S2C.presence:
      return { op: 'presence', seat: r.i8(), online: r.u8() === 1 };
    case S2C.chat:
      return { op: 'chat', message: JSON.parse(r.text(MAX_JSON_BYTES)) as ChatMessage };
    case S2C.fatal:
      return { op: 'fatal', message: r.text(MAX_JSON_BYTES) };
    default:
      throw new DecodeError('opcode inconnu');
  }
}
