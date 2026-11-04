import { schema } from '@el-presidente/db';
import { Result } from 'better-result';
import { eq } from '@el-presidente/db';
import type { Deps } from '../../../shared/deps';
import { dbError, hostOnly, Invalid, notMember, type AppError } from '../../../shared/errors';
import type { CurrentUser } from '../../auth/session';
import { lobbyChanged } from '../shared/lobby-changed';
import { snapshotFor } from '../shared/snapshot';

const { lobbies } = schema;

export interface SettingsPatch {
  /** Délai par tour en secondes (null ou 0 : passe automatique désactivée). */
  turnLimit?: number | null;
  /** Variante « interdit de finir sur un 2 », appliquée à partir de la manche suivante. */
  noTwoFinish?: boolean;
}

/** Réglages de la table, réservés à l'hôte. Seuls les champs présents changent. */
export async function updateSettings(deps: Deps, code: string, user: CurrentUser, patch: SettingsPatch) {
  const found = await deps.tables.get(code);
  if (found.isErr()) return Result.err(found.error);
  const table = found.value;
  return table.exclusive(async (): Promise<Result<ReturnType<typeof snapshotFor>, AppError>> => {
    if (table.seatOf(user.id) < 0) return Result.err(notMember());
    if (table.hostId !== user.id) return Result.err(hostOnly('changer les réglages'));
    const limit = patch.turnLimit === undefined ? table.turnLimit : patch.turnLimit === 0 ? null : patch.turnLimit;
    if (limit !== null && (!Number.isInteger(limit) || limit < 10 || limit > 600)) {
      return Result.err(new Invalid({ message: 'Délai invalide (entre 10 secondes et 10 minutes).' }));
    }
    const noTwoFinish = patch.noTwoFinish ?? table.noTwoFinish;
    const saved = await Result.tryPromise({
      try: () => deps.db.update(lobbies).set({ turnLimit: limit, noTwoFinish }).where(eq(lobbies.id, table.id)),
      catch: dbError,
    });
    if (saved.isErr()) return Result.err(saved.error);
    const limitChanged = limit !== table.turnLimit;
    table.turnLimit = limit;
    table.noTwoFinish = noTwoFinish;
    // Le nouveau délai part de maintenant pour le joueur en cours.
    if (limitChanged && table.game !== null) table.game.turnStartedAt = deps.now();
    lobbyChanged(deps, table);
    deps.writer.save(table);
    return Result.ok(snapshotFor(table, user.id, deps.now()));
  });
}
