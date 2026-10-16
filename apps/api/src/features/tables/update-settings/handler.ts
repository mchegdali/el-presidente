import { schema } from '@el-presidente/db';
import { Result } from 'better-result';
import { eq } from '@el-presidente/db';
import type { Deps } from '../../../shared/deps';
import { dbError, hostOnly, Invalid, notMember, type AppError } from '../../../shared/errors';
import type { CurrentUser } from '../../auth/session';
import { lobbyChanged } from '../shared/lobby-changed';
import { snapshotFor } from '../shared/snapshot';

const { lobbies } = schema;

/** Délai par tour en secondes (null ou 0 : passe automatique désactivée). Réservé à l'hôte. */
export async function updateSettings(deps: Deps, code: string, user: CurrentUser, seconds: number | null) {
  const found = await deps.tables.get(code);
  if (found.isErr()) return Result.err(found.error);
  const table = found.value;
  return table.exclusive(async (): Promise<Result<ReturnType<typeof snapshotFor>, AppError>> => {
    if (table.seatOf(user.id) < 0) return Result.err(notMember());
    if (table.hostId !== user.id) return Result.err(hostOnly('régler le délai'));
    const limit = seconds === 0 ? null : seconds;
    if (limit !== null && (!Number.isInteger(limit) || limit < 10 || limit > 600)) {
      return Result.err(new Invalid({ message: 'Délai invalide (entre 10 secondes et 10 minutes).' }));
    }
    const saved = await Result.tryPromise({
      try: () => deps.db.update(lobbies).set({ turnLimit: limit }).where(eq(lobbies.id, table.id)),
      catch: dbError,
    });
    if (saved.isErr()) return Result.err(saved.error);
    table.turnLimit = limit;
    // Le nouveau délai part de maintenant pour le joueur en cours.
    if (table.game !== null) table.game.turnStartedAt = deps.now();
    lobbyChanged(deps, table);
    deps.writer.save(table);
    return Result.ok(snapshotFor(table, user.id, deps.now()));
  });
}
