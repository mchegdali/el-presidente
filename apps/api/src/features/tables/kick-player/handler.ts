import { Result } from 'better-result';
import type { Deps } from '../../../shared/deps';
import { hostOnly, Invalid, NotFound, notMember, type AppError } from '../../../shared/errors';
import type { CurrentUser } from '../../auth/session';
import { removePlayer } from '../leave-table/handler';
import { snapshotFor } from '../shared/snapshot';

export async function kickPlayer(deps: Deps, code: string, user: CurrentUser, targetId: string) {
  const found = await deps.tables.get(code);
  if (found.isErr()) return Result.err(found.error);
  const table = found.value;
  return table.exclusive(async (): Promise<Result<ReturnType<typeof snapshotFor>, AppError>> => {
    if (table.seatOf(user.id) < 0) return Result.err(notMember());
    if (table.hostId !== user.id) return Result.err(hostOnly('retirer un joueur'));
    if (targetId === user.id) return Result.err(new Invalid({ message: 'Utilisez « Quitter la table » pour partir.' }));
    const seat = table.seatOf(targetId);
    if (seat < 0) return Result.err(new NotFound({ message: "Ce joueur n'est plus à la table." }));
    const name = table.players[seat]!.name;
    const removed = await removePlayer(deps, table, targetId, `${name} a été retiré de la table : manche annulée.`);
    if (removed.isErr()) return Result.err(removed.error);
    return Result.ok(snapshotFor(table, user.id, deps.now()));
  });
}
