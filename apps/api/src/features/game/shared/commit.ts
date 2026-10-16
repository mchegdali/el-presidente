// Après un coup appliqué en mémoire : version, statut de la table, écriture différée,
// échéance de la passe automatique, diffusion du delta, notifications.

import { cardsOf, roundRoles, type Card, type GameEvent } from '@el-presidente/game';
import { moveDelta, type LobbyStatus, type MoveDelta } from '@el-presidente/game/protocol';
import { schema } from '@el-presidente/db';
import { and, eq } from '@el-presidente/db';
import type { Deps } from '../../../shared/deps';
import { log } from '../../../shared/logger';
import { notifyTurn } from '../../push/notify-turn';
import type { Table } from '../../tables/shared/table';

const { lobbies, players } = schema;

export interface Move {
  kind: MoveDelta['kind'];
  seat: number;
  cards: readonly Card[] | null;
  count: number;
  to?: number;
}

const STATUS: Record<'exchange' | 'playing' | 'over', LobbyStatus> = {
  exchange: 'exchange',
  playing: 'playing',
  over: 'finished',
};

/**
 * `move` : le coup à diffuser en delta ; `'snapshot'` : changement trop large pour un
 * delta (passe automatique pendant l'échange), chaque client reçoit un état complet.
 */
export function commitMove(deps: Deps, table: Table, move: Move | 'snapshot', events: GameEvent[]): void {
  const g = table.game!;
  table.version += 1;
  table.lastActivity = deps.now();

  const status = STATUS[g.phase];
  if (status !== table.status) {
    table.status = status;
    const roles = roundRoles(g);
    if (roles !== null) roles.forEach((role, seat) => (table.players[seat]!.role = role));
    void persistStatus(deps, table, roles !== null);
  }

  deps.writer.save(table);
  deps.scheduler.set(table.code, table.deadline());

  if (move === 'snapshot') {
    deps.hub.sendSnapshots(table, deps.now());
  } else if (move.kind === 'give') {
    // Un don n'est visible en détail que par ses deux participants.
    deps.hub.each(table, (ws) => {
      const seat = ws.data.userId === null ? -1 : table.seatOf(ws.data.userId);
      const visible = seat === move.seat || seat === move.to;
      return { op: 'move', ...moveDelta(g, table.version, visible ? move : { ...move, cards: null }, events) };
    });
  } else {
    deps.hub.publish(table, { op: 'move', ...moveDelta(g, table.version, move, events) });
  }
  notifyTurn(deps, table);
}

async function persistStatus(deps: Deps, table: Table, withRoles: boolean): Promise<void> {
  try {
    await deps.db.transaction(async (tx) => {
      await tx.update(lobbies).set({ status: table.status }).where(eq(lobbies.id, table.id));
      if (withRoles) {
        for (const p of table.players) {
          await tx
            .update(players)
            .set({ role: p.role })
            .where(and(eq(players.lobbyId, table.id), eq(players.userId, p.userId)));
        }
      }
    });
  } catch (error) {
    log.error('statut de table', { table: table.code, error: String(error) });
  }
}

/** Main d'un joueur (pour les vérifications côté serveur). */
export const handOf = (table: Table, seat: number) => (table.game === null ? [] : cardsOf(table.game.hands, seat));
