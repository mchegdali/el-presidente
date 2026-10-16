// Passe automatique : à l'échéance du tour, le joueur passe ; s'il ouvre le pli, sa plus
// petite carte est jouée ; pendant l'échange, les retardataires donnent leurs cartes les
// plus faibles. Déclenchée par l'horloge unique (shared/scheduler.ts), qu'il y ait ou
// non des joueurs connectés.

import { autoMove, cardsOf, isTimedOut } from '@el-presidente/game';
import { schema } from '@el-presidente/db';
import { and, eq, isNotNull } from '@el-presidente/db';
import type { Deps } from '../../../shared/deps';
import { log } from '../../../shared/logger';
import type { Table } from '../../tables/shared/table';
import { commitMove, type Move } from '../shared/commit';

const { games, lobbies } = schema;

export function applyTimeout(deps: Deps, table: Table): boolean {
  const g = table.game;
  const now = deps.now();
  if (g === null || !isTimedOut(g, table.turnLimit, now)) {
    deps.scheduler.set(table.code, table.deadline());
    return false;
  }
  if (g.phase === 'exchange') {
    const events = autoMove(g, now);
    commitMove(deps, table, 'snapshot', events);
    return true;
  }
  const seat = g.turn;
  const move: Move =
    g.trickSize === 0
      ? { kind: 'play', seat, cards: cardsOf(g.hands, seat).slice(0, 1), count: 1 }
      : { kind: 'pass', seat, cards: null, count: 0 };
  const events = autoMove(g, now);
  commitMove(deps, table, move, events);
  return true;
}

/** Appelée par l'horloge pour la table `code`. */
export async function onTurnDeadline(deps: Deps, code: string): Promise<void> {
  const table = await deps.tables.get(code);
  if (table.isErr()) {
    if (table.error._tag === 'DbError') {
      // Base indisponible : on réessaie un peu plus tard.
      deps.scheduler.set(code, deps.now() + 2000);
    }
    return;
  }
  await table.value.whenFree(() => applyTimeout(deps, table.value));
}

/** Au démarrage : reprogramme les échéances des manches en cours. */
export async function restoreDeadlines(deps: Deps): Promise<number> {
  const rows = await deps.db
    .select({ code: lobbies.code, deadlineAt: games.deadlineAt })
    .from(games)
    .innerJoin(lobbies, eq(lobbies.id, games.lobbyId))
    .where(and(isNotNull(games.deadlineAt)));
  for (const r of rows) deps.scheduler.set(r.code, r.deadlineAt!.getTime());
  log.info('échéances restaurées', { count: rows.length });
  return rows.length;
}
