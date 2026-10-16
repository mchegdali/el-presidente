import { schema } from '@el-presidente/db';
import { Result } from 'better-result';
import { and, eq } from '@el-presidente/db';
import type { Deps } from '../../../shared/deps';
import { dbError, NotFound, notMember, type AppError } from '../../../shared/errors';
import { log } from '../../../shared/logger';
import type { CurrentUser } from '../../auth/session';

const { messages, messageReports } = schema;

/** Signalement d'un message de la table (modération a posteriori). */
export async function reportMessage(
  deps: Deps,
  code: string,
  user: CurrentUser,
  messageId: number,
  reason: string | undefined,
): Promise<Result<{ reported: true }, AppError>> {
  const found = await deps.tables.get(code);
  if (found.isErr()) return Result.err(found.error);
  const table = found.value;
  if (table.seatOf(user.id) < 0) return Result.err(notMember());
  const done = await Result.tryPromise({
    try: async () => {
      const [m] = await deps.db
        .select({ id: messages.id })
        .from(messages)
        .where(and(eq(messages.id, messageId), eq(messages.lobbyId, table.id)))
        .limit(1);
      if (m === undefined) return false;
      await deps.db
        .insert(messageReports)
        .values({ messageId, reporterId: user.id, reason: reason?.slice(0, 500) ?? null })
        .onConflictDoNothing();
      return true;
    },
    catch: dbError,
  });
  if (done.isErr()) return Result.err(done.error);
  if (!done.value) return Result.err(new NotFound({ message: 'Message introuvable.' }));
  log.warn('message signalé', { table: table.code, messageId, by: user.id });
  return Result.ok({ reported: true as const });
}
