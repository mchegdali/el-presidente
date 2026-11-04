import type { ChatMessage } from '@el-presidente/game/protocol';
import { Result } from 'better-result';
import { sql } from '@el-presidente/db';
import type { Deps } from '../../../shared/deps';
import { dbError, notMember, type AppError } from '../../../shared/errors';
import type { CurrentUser } from '../../auth/session';

/**
 * Les 100 derniers messages après `after`, en JSON construit par SQLite : le corps est
 * renvoyé tel quel, sans parse ni re-sérialisation côté API.
 */
export async function listMessagesJson(
  deps: Deps,
  code: string,
  user: CurrentUser,
  after: number,
): Promise<Result<string, AppError>> {
  const found = await deps.tables.get(code);
  if (found.isErr()) return Result.err(found.error);
  const table = found.value;
  if (table.seatOf(user.id) < 0) return Result.err(notMember());
  // `created_at` est déjà en millisecondes. `json_group_array` renvoie '[]' sans ligne.
  // En SQL brut, `get` de bun-sqlite renvoie la ligne sous forme de tableau de valeurs.
  const row = Result.try({
    try: () =>
      deps.db.get<[body: string]>(sql`
        select json_group_array(json_object(
          'id', m.id, 'p', m.user_id, 'name', m.name, 'body', m.body, 'at', m.created_at
        ) order by m.id) as body
        from (
          select id, user_id, name, body, created_at from messages
          where lobby_id = ${table.id} and id > ${after}
          order by id desc limit 100
        ) m`),
    catch: dbError,
  });
  if (row.isErr()) return Result.err(row.error);
  return Result.ok(row.value?.[0] ?? '[]');
}

export type MessageList = ChatMessage[];
