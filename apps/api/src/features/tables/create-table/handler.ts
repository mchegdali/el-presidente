import { schema } from '@el-presidente/db';
import { Result } from 'better-result';
import type { Deps } from '../../../shared/deps';
import { dbError, type DbError, type Invalid } from '../../../shared/errors';
import type { CurrentUser } from '../../auth/session';
import { cleanName, defaultName } from '../shared/names';
import { Table } from '../shared/table';

const { lobbies, players } = schema;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export async function createTable(
  deps: Deps,
  user: CurrentUser,
  rawName: string | undefined,
): Promise<Result<{ code: string }, Invalid | DbError>> {
  const name = cleanName(rawName ?? defaultName(user.name));
  if (name.isErr()) return Result.err(name.error);

  return Result.tryPromise({
    try: async () => {
      for (;;) {
        const code = Array.from({ length: 5 }, () => ALPHABET[deps.rng(ALPHABET.length)]).join('');
        const created = await deps.db.transaction(async (tx) => {
          const [lobby] = await tx
            .insert(lobbies)
            .values({ code, hostId: user.id })
            .onConflictDoNothing({ target: lobbies.code })
            .returning();
          if (lobby === undefined) return null;
          await tx.insert(players).values({ lobbyId: lobby.id, userId: user.id, seat: 0, name: name.value });
          return lobby;
        });
        if (created === null) continue; // code déjà pris : on en tire un autre
        deps.tables.add(
          new Table(created.id, created.code, {
            hostId: user.id,
            status: 'waiting',
            roundNo: 0,
            notice: null,
            turnLimit: null,
            players: [{ userId: user.id, name: name.value, image: user.image, role: null, dbSeat: 0 }],
            game: null,
            version: 0,
            chatLast: null,
          }),
        );
        return { code: created.code };
      }
    },
    catch: dbError,
  });
}
