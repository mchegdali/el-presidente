import { schema } from '@el-presidente/db';
import { Result } from 'better-result';
import { and, eq } from '@el-presidente/db';
import type { Deps } from '../../../shared/deps';
import { dbError, notMember, type AppError } from '../../../shared/errors';
import type { CurrentUser } from '../../auth/session';
import { dropRound } from '../../game/cancel-round/handler';
import { lobbyChanged } from '../shared/lobby-changed';
import type { Table } from '../shared/table';

const { lobbies, players } = schema;

/**
 * Retire un joueur de la table (départ ou exclusion). La manche en cours est annulée ;
 * une manche terminée est effacée (les sièges changent). Sous `table.exclusive`.
 */
export async function removePlayer(
  deps: Deps,
  table: Table,
  userId: string,
  notice: string,
): Promise<Result<{ closed: boolean }, AppError>> {
  const seat = table.seatOf(userId);
  const dropped = await dropRound(deps, table, notice);
  if (dropped.isErr()) return Result.err(dropped.error);

  const rest = table.players.filter((_, i) => i !== seat);
  const host = table.hostId === userId ? (rest[0]?.userId ?? null) : table.hostId;
  const saved = await Result.tryPromise({
    try: () =>
      deps.db.transaction(async (tx) => {
        await tx.delete(players).where(and(eq(players.lobbyId, table.id), eq(players.userId, userId)));
        if (rest.length === 0) await tx.delete(lobbies).where(eq(lobbies.id, table.id));
        else await tx.update(lobbies).set({ hostId: host }).where(eq(lobbies.id, table.id));
      }),
    catch: dbError,
  });
  if (saved.isErr()) return Result.err(saved.error);

  table.players = rest;
  table.hostId = host;
  table.online.delete(userId);
  table.emotes.delete(userId);
  if (rest.length === 0) {
    deps.tables.remove(table);
    deps.scheduler.set(table.code, null);
    deps.hub.closeAll(table, 'table fermée');
    return Result.ok({ closed: true });
  }
  deps.hub.forget(table, userId);
  lobbyChanged(deps, table);
  return Result.ok({ closed: false });
}

export async function leaveTable(deps: Deps, code: string, user: CurrentUser) {
  const found = await deps.tables.get(code);
  if (found.isErr()) return Result.err(found.error);
  const table = found.value;
  return table.exclusive(async () => {
    const seat = table.seatOf(user.id);
    if (seat < 0) return Result.err(notMember());
    const name = table.players[seat]!.name;
    const removed = await removePlayer(deps, table, user.id, `${name} a quitté la table : manche annulée.`);
    return removed.map(() => ({ left: true as const }));
  });
}
