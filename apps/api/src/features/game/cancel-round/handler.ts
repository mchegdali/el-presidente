import { schema } from '@el-presidente/db';
import { Result } from 'better-result';
import { eq } from '@el-presidente/db';
import type { Deps } from '../../../shared/deps';
import { dbError, hostOnly, notMember, type AppError, type DbError } from '../../../shared/errors';
import type { CurrentUser } from '../../auth/session';
import { lobbyChanged } from '../../tables/shared/lobby-changed';
import { snapshotFor } from '../../tables/shared/snapshot';
import type { Table } from '../../tables/shared/table';

const { games, lobbies } = schema;

/**
 * Supprime la manche de la table (annulation, départ ou exclusion d'un joueur).
 * À appeler sous `table.exclusive`. `notice` : message affiché au salon (null : aucun).
 */
export async function dropRound(deps: Deps, table: Table, notice: string | null): Promise<Result<void, DbError>> {
  if (table.game === null && !table.roundActive) return Result.ok();
  // Une écriture différée en vol ne doit pas recréer la ligne après sa suppression.
  deps.writer.drop(table.id);
  await deps.writer.flush();
  const nextStatus = 'waiting' as const;
  const nextNotice = table.roundActive ? notice : table.notice;
  const done = await Result.tryPromise({
    try: () =>
      deps.db.transaction(async (tx) => {
        await tx.delete(games).where(eq(games.lobbyId, table.id));
        await tx.update(lobbies).set({ status: nextStatus, notice: nextNotice }).where(eq(lobbies.id, table.id));
      }),
    catch: dbError,
  });
  if (done.isErr()) return done;
  table.game = null;
  table.status = nextStatus;
  table.notice = nextNotice;
  table.notified.clear();
  deps.scheduler.set(table.code, null);
  return Result.ok();
}

export async function cancelRound(deps: Deps, table: Table, user: CurrentUser) {
  return table.exclusive(async (): Promise<Result<ReturnType<typeof snapshotFor>, AppError>> => {
    const seat = table.seatOf(user.id);
    if (seat < 0) return Result.err(notMember());
    if (table.hostId !== user.id) return Result.err(hostOnly('annuler la manche'));
    if (table.roundActive) {
      const dropped = await dropRound(deps, table, `Manche annulée par ${table.players[seat]!.name}.`);
      if (dropped.isErr()) return Result.err(dropped.error);
      lobbyChanged(deps, table);
    }
    return Result.ok(snapshotFor(table, user.id, deps.now()));
  });
}
