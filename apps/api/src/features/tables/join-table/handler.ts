import { MAX_PLAYERS } from '@el-presidente/game';
import { schema } from '@el-presidente/db';
import { Result } from 'better-result';
import { eq } from '@el-presidente/db';
import type { Deps } from '../../../shared/deps';
import { Conflict, dbError, type AppError } from '../../../shared/errors';
import type { CurrentUser } from '../../auth/session';
import { lobbyChanged } from '../shared/lobby-changed';
import { cleanName, defaultName } from '../shared/names';
import { snapshotFor } from '../shared/snapshot';

const { lobbies, players } = schema;

export async function joinTable(deps: Deps, code: string, user: CurrentUser, rawName: string | undefined) {
  const found = await deps.tables.get(code);
  if (found.isErr()) return Result.err(found.error);
  const table = found.value;

  return table.exclusive(async (): Promise<Result<ReturnType<typeof snapshotFor>, AppError>> => {
    // Déjà assis : même compte = même joueur (reconnexion).
    if (table.seatOf(user.id) >= 0) return Result.ok(snapshotFor(table, user.id, deps.now()));
    if (table.roundActive) {
      return Result.err(
        new Conflict({ message: 'Une manche est en cours : vous pourrez rejoindre à la fin de celle-ci.' }),
      );
    }
    if (table.players.length >= MAX_PLAYERS) {
      return Result.err(new Conflict({ message: 'La table est complète (8 joueurs maximum).' }));
    }
    const name = cleanName(rawName ?? defaultName(user.name));
    if (name.isErr()) return Result.err(name.error);
    const lower = name.value.toLowerCase();
    if (table.players.some((p) => p.name.toLowerCase() === lower)) {
      return Result.err(new Conflict({ message: 'Ce nom est déjà pris à cette table.' }));
    }

    const dbSeat = table.players.reduce((m, p) => Math.max(m, p.dbSeat + 1), 0);
    const host = table.hostId ?? user.id;
    const saved = await Result.tryPromise({
      try: () =>
        deps.db.transaction(async (tx) => {
          await tx.insert(players).values({ lobbyId: table.id, userId: user.id, seat: dbSeat, name: name.value });
          await tx.update(lobbies).set({ hostId: host }).where(eq(lobbies.id, table.id));
        }),
      catch: dbError,
    });
    if (saved.isErr()) return Result.err(saved.error);

    table.players.push({ userId: user.id, name: name.value, image: user.image, role: null, dbSeat });
    table.hostId = host;
    lobbyChanged(deps, table);
    return Result.ok(snapshotFor(table, user.id, deps.now()));
  });
}
