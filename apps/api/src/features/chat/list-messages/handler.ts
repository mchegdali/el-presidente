import type { ChatMessage } from '@el-presidente/game/protocol';
import { Result } from 'better-result';
import { sql } from '@el-presidente/db';
import type { Deps } from '../../../shared/deps';
import { dbError, notMember, type AppError } from '../../../shared/errors';
import type { CurrentUser } from '../../auth/session';

/**
 * Les 100 derniers messages après `after`, en JSON construit par Postgres : le corps est
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
  const rows = await Result.tryPromise({
    try: () =>
      deps.db.execute<{ body: string }>(sql`
        select coalesce(json_agg(json_build_object(
          'id', m.id, 'p', m.user_id, 'name', m.name, 'body', m.body,
          'at', (extract(epoch from m.created_at) * 1000)::bigint
        ) order by m.id), '[]'::json)::text as body
        from (
          select id, user_id, name, body, created_at from messages
          where lobby_id = ${table.id} and id > ${after}
          order by id desc limit 100
        ) m`),
    catch: dbError,
  });
  if (rows.isErr()) return Result.err(rows.error);
  const first =
    (rows.value as unknown as { rows?: { body: string }[] }).rows?.[0] ??
    (rows.value as unknown as { body: string }[])[0];
  return Result.ok(first?.body ?? '[]');
}

export type MessageList = ChatMessage[];
