// Gestionnaires WebSocket natifs de Bun : aucun framework sur le chemin chaud.
// Un message = un opcode binaire décodé sans allocation de chaîne, un cas d'usage
// synchrone sur l'état en mémoire, un accusé de réception, une diffusion.

import { DecodeError, decodeClient, type ClientMessage } from '@el-presidente/game/protocol';
import type { Result } from 'better-result';
import type { ServerWebSocket, WebSocketHandler } from 'bun';
import { sendMessage } from '../features/chat/send-message/handler';
import { sendEmote } from '../features/emotes/send-emote/handler';
import { giveCards } from '../features/game/give-cards/handler';
import { passTurn } from '../features/game/pass-turn/handler';
import { playCards } from '../features/game/play-cards/handler';
import { setPresence } from '../features/presence/handler';
import type { Table } from '../features/tables/shared/table';
import type { Deps } from '../shared/deps';
import type { AppError } from '../shared/errors';
import { log } from '../shared/logger';
import { metrics } from '../shared/metrics';
import { RateLimiter } from '../shared/rate-limit';
import type { SocketData } from './hub';

export interface SocketContext extends SocketData {
  /** Adresse du client (journal du chat). */
  ip: string | null;
}

// Un coup par 50 ms en moyenne, rafales de 10 : largement au-dessus d'un humain.
const moveLimiter = new RateLimiter(10, 20);

export function createSocketHandler(deps: Deps): WebSocketHandler<SocketContext> {
  const tableOf = (ws: ServerWebSocket<SocketContext>): Table | undefined => deps.tables.cached(ws.data.code);

  function reply(ws: ServerWebSocket<SocketContext>, req: number, result: Result<unknown, AppError>) {
    if (result.isOk()) deps.hub.send(ws, { op: 'ack', req });
    else {
      metrics.rejected++;
      deps.hub.send(ws, { op: 'reject', req, message: result.error.message });
    }
  }

  type MoveMessage = Extract<ClientMessage, { op: 'play' | 'pass' | 'give' }>;

  function applyMove(ws: ServerWebSocket<SocketContext>, table: Table, msg: MoveMessage, started: number) {
    const userId = ws.data.userId!;
    const result =
      msg.op === 'play'
        ? playCards(deps, table, userId, msg.cards)
        : msg.op === 'give'
          ? giveCards(deps, table, userId, msg.cards)
          : passTurn(deps, table, userId);
    if (result.isOk()) {
      metrics.moves++;
      metrics.moveLatency.record((performance.now() - started) * 1000);
    }
    reply(ws, msg.req, result);
  }

  function move(ws: ServerWebSocket<SocketContext>, table: Table, msg: MoveMessage) {
    const started = performance.now();
    // Chemin chaud : table libre, coup appliqué tout de suite, sans promesse ni closure.
    if (!table.isLocked) return applyMove(ws, table, msg, started);
    table
      .exclusive(async () => applyMove(ws, table, msg, started))
      .catch((error) => log.error('coup', { error: String(error) }));
  }

  function onMessage(ws: ServerWebSocket<SocketContext>, data: string | Buffer) {
    const table = tableOf(ws);
    if (table === undefined) return ws.close(1001, 'table fermée');
    if (typeof data === 'string') {
      metrics.malformed++;
      return ws.close(1003, 'messages binaires uniquement');
    }
    let msg: ClientMessage;
    try {
      msg = decodeClient(data);
    } catch (error) {
      metrics.malformed++;
      if (error instanceof DecodeError) return ws.close(1007, 'message invalide');
      throw error;
    }

    switch (msg.op) {
      case 'sync':
        deps.hub.sendSnapshot(table, ws, deps.now());
        return;
      case 'presence':
        if (ws.data.userId !== null && msg.active !== ws.data.active) {
          ws.data.active = msg.active;
          setPresence(deps, table, ws.data.userId, msg.active ? 1 : -1);
        }
        return;
    }

    if (ws.data.userId === null) {
      if ('req' in msg) deps.hub.send(ws, { op: 'reject', req: msg.req, message: 'Connectez-vous pour jouer.' });
      return;
    }

    switch (msg.op) {
      case 'emote':
        sendEmote(deps, table, ws.data.userId, msg.emote);
        return;
      case 'chat':
        sendMessage(deps, table, ws.data.userId, msg.body, ws.data.ip)
          .then((r) => reply(ws, msg.req, r))
          .catch((error) => log.error('chat', { error: String(error) }));
        return;
      case 'play':
      case 'pass':
      case 'give': {
        if (moveLimiter.take(ws.data.userId, deps.now()) > 0) {
          deps.hub.send(ws, { op: 'reject', req: msg.req, message: 'Trop de coups, doucement.' });
          return;
        }
        move(ws, table, msg);
      }
    }
  }

  return {
    // Messages minuscules : la compression coûte plus de CPU qu'elle ne fait gagner.
    perMessageDeflate: false,
    maxPayloadLength: 4096,
    idleTimeout: 120,
    sendPings: true,
    // Un client trop lent est déconnecté plutôt que de faire grossir la mémoire ;
    // il se reconnecte et reçoit un état complet.
    backpressureLimit: 256 * 1024,
    closeOnBackpressureLimit: true,
    publishToSelf: true,

    open(ws) {
      const table = tableOf(ws);
      if (table === undefined) return ws.close(1001, 'table fermée');
      deps.hub.attach(table, ws);
      table.lastActivity = deps.now();
      deps.hub.sendSnapshot(table, ws, deps.now());
      if (ws.data.userId !== null && ws.data.active) setPresence(deps, table, ws.data.userId, 1);
    },

    message: onMessage,

    close(ws) {
      const table = tableOf(ws);
      if (table === undefined) return;
      deps.hub.detach(table, ws);
      table.lastActivity = deps.now();
      if (ws.data.userId !== null && ws.data.active) setPresence(deps, table, ws.data.userId, -1);
    },
  };
}

/** Sweep périodique des seaux de limitation. */
export const sweepSocketLimiters = (now: number) => moveLimiter.sweep(now);
